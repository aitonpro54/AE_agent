"use strict";

// Offline source-body evidence only. No CEP, native addon, process, or network.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const source = fs.readFileSync(path.join(__dirname, "../cep-panel/panel.js"), "utf8");
function body(name) {
  const start = source.indexOf("  function " + name + "(");
  assert.ok(start >= 0, "production function missing: " + name);
  const rest = source.slice(start + 1);
  const end = /\n  (?:function |var panelActionHandlers=|lookupHumanSettlementBeforeConnect\(0\);)/.exec(rest);
  assert.ok(end, "production function boundary missing: " + name);
  return source.slice(start, start + 1 + end.index);
}
const connectHandler = source.slice(source.indexOf('    "bridge.connect":function'), source.indexOf('    "bridge.disconnect":function')).trim().replace(/,$/, "");
const production = ["initialAutomaticStartupCurrent", "closeInitialAutomaticStartup", "request", "poll", "connect", "lookupHumanSettlementBeforeConnect"].map(body).join("\n") + "\nvar handlers={" + connectHandler + "};";

function fixture() {
  const timers = [], evals = [], http = [], writes = [], deliveries = [], completed = [];
  const prefs = {codexAeBridgeAutoConnect:"1"};
  let guardCallback;
  const c = {
    running:false, pollTimer:null, pollInFlight:false, initialAutomaticStartup:null, initialAutomaticConnectDispatch:null,
    panelLifecycleEpoch:0,panelConnectionGeneration:0,panelLifecycleGuard:false,panelConnectionId:"panel-fixed",
    recoveryTransportScope:null,recoveryTransportConnecting:false,activeEvalScriptCommandId:"",panelHeartbeatAt:0,
    currentPlanSyncInFlight:false,currentPlanSyncActiveReqId:0,currentPlanSyncActiveEpoch:0,currentPlanSyncWaiters:[],currentPlanSyncAt:Date.now(),
    autonomousSessionState:null,lastPollErrorMessage:"",agents:[{}],badgeEl:{textContent:"online"},urlEl:{value:"http://127.0.0.1:43110"},tokenEl:{value:"panel-token"},
    getBaseUrl:()=>c.urlEl.value,getToken:()=>c.tokenEl.value,
    bridgeHostAvailable:()=>true,isFixedGuardLookup:()=>false,BRIDGE_OFFLINE_MESSAGE:"offline",
    makeBridgeOfflineError:()=>({code:"offline",message:"offline"}),diagnosticFromBody:()=>null,
    formatM100DiagnosticBody:(_body,fallback)=>fallback,
    window:{AEAgentPanelContract:{validateLoopbackUrl:()=>true}},
    localStorage:{getItem:k=>prefs[k] ?? null,setItem:(k,v)=>{writes.push([k,v]);prefs[k]=v;}},
    setTimeout:(fn,delay)=>{const timer={fn,delay,cancelled:false};timers.push(timer);return timer;},clearTimeout:timer=>{timer.cancelled=true;},
    cs:{evalScript:(script,callback)=>evals.push({script,callback})},
    bridgeNextPath:project=>"/bridge/next?projectFile=" + encodeURIComponent(project || ""),
    setBridgeOffline:error=>error.message || error.code,log:()=>{},setBridgeConnected:()=>{},
    renderAutonomousSession:()=>{},setStatus:()=>{},setBridgeHelp:()=>{},refreshAppTitle:()=>{},loadAgents:()=>{},loadUsageSnapshot:()=>{},
    refreshCurrentBridgePlan:()=>{},refreshAutonomousSession:()=>{},refreshPlaceholderProtection:()=>{},
    executeCommand:command=>deliveries.push(command),pollRecoveryTransport:()=>{},
    panelLifecycleIdle:done=>done(null),
    panelActionUI:{refreshTrustedGuards:done=>{guardCallback=done;return {accepted:true};}},
    invokePanelUI:()=>{c.handlers["bridge.connect"]({},(...args)=>completed.push(args),{submit:()=>true});return {state:"running"};},
    XMLHttpRequest:function() {
      this.open=(method,url)=>{this.method=method;this.url=url;};this.setRequestHeader=()=>{};
      this.send=()=>http.push(this);
    }
  };
  vm.createContext(c);vm.runInContext(production,c,{timeout:1000});
  function timer(delay) {const t=timers.find(t=>!t.cancelled && !t.used && t.delay===delay);assert.ok(t,"timer " + delay);t.used=true;t.fn();}
  function response(index,value={},status=200) {const xhr=http[index];assert.ok(xhr,"HTTP " + index);xhr.status=status;xhr.responseText=JSON.stringify(value);xhr.readyState=4;xhr.onreadystatechange();}
  function start() {c.lookupHumanSettlementBeforeConnect(0);guardCallback(true);timer(250);assert.equal(evals.length,1);}
  return {c,timers,evals,http,writes,deliveries,completed,timer,response,start,guard:ready=>guardCallback(ready),prefs};
}
let count=0;
function check(name,fn) {fn();count++;process.stdout.write("PASS " + name + "\n");}

check("first GET error closes automatic startup without retry or preference write",()=>{
  const f=fixture();f.start();f.evals[0].callback("C:/project.aep");f.response(0,{error:"offline"},503);
  assert.equal(f.c.running,false);assert.equal(f.c.initialAutomaticStartup.state,"closed");assert.equal(f.c.initialAutomaticStartup.consumed,true);
  assert.equal(f.timers.filter(t=>!t.cancelled && t.delay===1500).length,0);f.c.poll();f.c.lookupHumanSettlementBeforeConnect(0);
  assert.equal(f.evals.length,1);assert.equal(f.http.length,1);assert.equal(f.writes.length,0);
});
check("eval UNKNOWN and synchronous throw close without GET",()=>{
  const f=fixture();f.start();f.evals[0].callback("EvalScript error.");assert.equal(f.c.running,false);assert.equal(f.http.length,0);
  const g=fixture();g.c.cs.evalScript=()=>{throw new Error("unknown eval");};g.c.lookupHumanSettlementBeforeConnect(0);g.guard(true);g.timer(250);
  assert.equal(g.c.running,false);assert.equal(g.c.initialAutomaticStartup.consumed,true);assert.equal(g.http.length,0);
});
check("project-file eval error marker with detail closes without GET or replay",()=>{
  const f=fixture();f.start();f.evals[0].callback("EvalScript error. Error: host callback failed");
  assert.equal(f.c.initialAutomaticStartup.state,"closed");assert.equal(f.c.initialAutomaticStartup.consumed,true);assert.equal(f.c.running,false);
  f.c.poll();f.c.lookupHumanSettlementBeforeConnect(0);f.evals[0].callback("C:/late.aep");
  assert.equal(f.http.length,0);assert.equal(f.evals.length,1);assert.equal(f.timers.filter(t=>!t.used && !t.cancelled).length,0);
});
check("stale eval callback cannot GET or clear newer in-flight state",()=>{
  const f=fixture();f.start();f.c.panelLifecycleEpoch++;f.c.panelConnectionGeneration++;f.c.pollInFlight=true;f.evals[0].callback("C:/stale.aep");
  assert.equal(f.http.length,0);assert.equal(f.c.pollInFlight,true);
});
check("stale GET callback cannot deliver or schedule successor",()=>{
  const f=fixture();f.start();f.evals[0].callback("C:/project.aep");f.c.panelLifecycleEpoch++;f.c.panelConnectionGeneration++;f.c.pollInFlight=true;
  f.response(0,{command:{id:"stale"}});assert.equal(f.deliveries.length,0);assert.equal(f.c.pollInFlight,true);assert.equal(f.timers.filter(t=>t.delay===50).length,0);
});
check("missing eval or GET callback stays pending and cannot replay",()=>{
  const f=fixture();f.start();f.c.poll();f.c.lookupHumanSettlementBeforeConnect(0);assert.equal(f.evals.length,1);assert.equal(f.c.initialAutomaticStartup.state,"pending");assert.equal(f.c.pollInFlight,true);
  f.evals[0].callback("C:/project.aep");f.c.poll();f.evals[0].callback("C:/duplicate.aep");assert.equal(f.http.length,1);assert.equal(f.evals.length,1);assert.equal(f.c.initialAutomaticStartup.state,"pending");
});
check("lookup exhaustion is exactly attempts 0..3",()=>{
  const f=fixture();f.c.lookupHumanSettlementBeforeConnect(0);
  for(let i=0;i<4;i++){f.guard(false);if(i<3)f.timer(2000);}
  assert.equal(f.c.initialAutomaticStartup.rounds,4);assert.equal(f.c.initialAutomaticStartup.state,"closed");assert.equal(f.evals.length,0);assert.equal(f.http.length,0);
  f.c.lookupHumanSettlementBeforeConnect(0);assert.equal(f.c.initialAutomaticStartup.rounds,4);
});
check("lookup HTTP error closes without retry",()=>{
  const f=fixture();f.c.panelActionUI.refreshTrustedGuards=done=>{f.c.request("GET","/human-guard-settlement/lookup",null,error=>done(!error));return {accepted:true};};
  f.c.lookupHumanSettlementBeforeConnect(0);f.response(0,{error:"unknown"},500);
  assert.equal(f.c.initialAutomaticStartup.state,"closed");assert.equal(f.timers.length,0);assert.equal(f.evals.length,0);
});
check("missing lookup callback stays pending; rejected lookup closes",()=>{
  const f=fixture();f.c.lookupHumanSettlementBeforeConnect(0);f.c.lookupHumanSettlementBeforeConnect(1);
  assert.equal(f.c.initialAutomaticStartup.lookupPending,true);assert.equal(f.c.initialAutomaticStartup.rounds,1);assert.equal(f.timers.length,0);
  const g=fixture();g.c.panelActionUI.refreshTrustedGuards=()=>({accepted:false,code:"trusted_guard_refresh_not_idle"});g.c.lookupHumanSettlementBeforeConnect(0);
  assert.equal(g.c.initialAutomaticStartup.state,"closed");assert.equal(g.timers.length,0);
});
check("stale lookup and scheduled connect cannot start a fresh lifecycle",()=>{
  const f=fixture();f.c.lookupHumanSettlementBeforeConnect(0);f.c.panelLifecycleEpoch++;f.guard(true);assert.equal(f.timers.length,0);
  const g=fixture();g.c.lookupHumanSettlementBeforeConnect(0);g.guard(true);g.c.panelConnectionGeneration++;g.timer(250);
  assert.equal(g.evals.length,0);assert.equal(g.http.length,0);assert.equal(g.c.running,false);
});
check("accepted:false in connecting phase closes without retry",()=>{
  const f=fixture();f.c.invokePanelUI=()=>({accepted:false,code:"submission_rejected"});f.c.lookupHumanSettlementBeforeConnect(0);f.guard(true);f.timer(250);
  assert.equal(f.c.initialAutomaticStartup.state,"closed");assert.equal(f.c.initialAutomaticConnectDispatch,null);assert.equal(f.c.running,false);
  f.c.lookupHumanSettlementBeforeConnect(0);assert.equal(f.evals.length,0);assert.equal(f.http.length,0);assert.equal(f.timers.filter(t=>!t.used && !t.cancelled).length,0);
});
check("synchronous Connect throw closes chain and clears dispatch without replay",()=>{
  const f=fixture();f.c.invokePanelUI=()=>{throw Error("Connect submission UNKNOWN");};
  f.c.lookupHumanSettlementBeforeConnect(0);f.guard(true);assert.doesNotThrow(()=>f.timer(250));
  assert.equal(f.c.initialAutomaticStartup.state,"closed");assert.equal(f.c.initialAutomaticConnectDispatch,null);assert.equal(f.c.running,false);
  f.c.lookupHumanSettlementBeforeConnect(0);assert.equal(f.evals.length,0);assert.equal(f.http.length,0);assert.equal(f.writes.length,0);
  assert.equal(f.timers.filter(t=>!t.used && !t.cancelled).length,0);
});
check("successful first GET permits source-bound successor delivery",()=>{
  const f=fixture();f.start();assert.equal(f.evals[0].script,'(function(){return app.project && app.project.file ? String(app.project.file.fsName) : "";}())');
  f.evals[0].callback("C:/project.aep");f.response(0,{command:{id:"first"}});assert.equal(f.c.initialAutomaticStartup.state,"succeeded");
  f.timer(50);assert.equal(f.evals.length,2);f.evals[1].callback("C:/project.aep");f.response(1,{command:{id:"successor"}});
  assert.equal(f.http.length,2);assert.deepEqual(f.deliveries.map(x=>x.id),["first","successor"]);
});
check("manual connect preserves submit gate, preferences, and retry",()=>{
  const f=fixture();f.c.lookupHumanSettlementBeforeConnect(0);f.c.handlers["bridge.connect"]({},()=>{},{submit:()=>false});assert.equal(f.evals.length,0);assert.equal(f.c.initialAutomaticStartup.state,"superseded");
  f.c.handlers["bridge.connect"]({},()=>{},{submit:()=>true});assert.equal(f.evals.length,1);assert.equal(f.writes.length,3);f.guard(true);assert.equal(f.timers.length,0);
  f.evals[0].callback("");f.response(0,{error:"offline"},503);assert.equal(f.c.running,true);assert.equal(f.timers.filter(t=>t.delay===1500).length,1);
});
check("already running user connection is not reset by bootstrap lookup",()=>{
  const f=fixture();f.c.running=true;f.c.panelLifecycleEpoch=17;f.c.panelConnectionGeneration=41;f.c.lookupHumanSettlementBeforeConnect(0);
  f.c.handlers["bridge.connect"]({},()=>{},{submit:()=>{throw Error("unexpected submit");}});
  assert.equal(f.c.panelLifecycleEpoch,17);assert.equal(f.c.panelConnectionGeneration,41);assert.equal(f.evals.length,0);assert.equal(f.http.length,0);assert.equal(f.c.running,true);
});
process.stdout.write(JSON.stringify({ok:true,checks:count,evidence:"offline actual production function bodies with fake CS/HTTP/timers; no live/native proof"}) + "\n");

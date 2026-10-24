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
const production = ["isFixedGuardLookup", "initialAutomaticStartupCurrent", "closeInitialAutomaticStartup", "request", "connectorRequest", "poll", "connect", "observeConnectIntent", "lookupHumanSettlementBeforeConnect"].map(body).join("\n") + "\nvar handlers={" + connectHandler + "};";

function fixture() {
  const timers = [], evals = [], http = [], writes = [], deliveries = [], completed = [];
  const prefs = {codexAeBridgeAutoConnect:"1"};
  let guardCallback;
  const c = {
    running:false, pollTimer:null, pollInFlight:false, initialAutomaticStartup:null, initialAutomaticConnectDispatch:null,
    connectionStartupDiagnostics:{automaticAttempts:0,explicitAttempts:0,lastOrigin:null},
    ownedPollingSession:null,ownedPollingClosed:false,
    ownedCompletedDryRunPromised:()=>false,
    panelLifecycleEpoch:0,panelConnectionGeneration:0,panelLifecycleGuard:false,panelConnectionId:"panel-fixed",
    recoveryTransportScope:null,recoveryTransportConnecting:false,activeEvalScriptCommandId:"",panelHeartbeatAt:0,
    currentPlanSyncInFlight:false,currentPlanSyncActiveReqId:0,currentPlanSyncActiveEpoch:0,currentPlanSyncWaiters:[],currentPlanSyncAt:Date.now(),
    autonomousSessionState:null,lastPollErrorMessage:"",agents:[{}],badgeEl:{textContent:"online"},urlEl:{value:"http://127.0.0.1:43110"},tokenEl:{value:"panel-token"},
    getBaseUrl:()=>c.urlEl.value,getToken:()=>c.tokenEl.value,
    bridgeHostAvailable:()=>true,getConnectorBaseUrl:()=>"http://127.0.0.1:43111",BRIDGE_OFFLINE_MESSAGE:"offline",
    makeBridgeOfflineError:()=>({code:"offline",message:"offline"}),diagnosticFromBody:()=>null,
    formatM100DiagnosticBody:(_body,fallback)=>fallback,
    window:{AEAgentPanelContract:{validateLoopbackUrl:()=>true},AEAgentPanelActions:{state:()=>({reconciliationRequired:false})}},
    localStorage:{getItem:k=>prefs[k] ?? null,setItem:(k,v)=>{writes.push([k,v]);prefs[k]=v;}},
    setTimeout:(fn,delay)=>{const timer={fn,delay,cancelled:false};timers.push(timer);return timer;},clearTimeout:timer=>{timer.cancelled=true;},
    cs:{evalScript:(script,callback)=>evals.push({script,callback})},
    physicalEvalScript:(script,callback)=>c.cs.evalScript(script,callback),
    nextPanelConnectionGeneration:()=>c.panelConnectionGeneration+1,rotateBootstrapDeliveryFence:()=>{},observeCausalRuntime:()=>{},
    deliveryActor:()=>({panelConnectionId:c.panelConnectionId,panelGeneration:String(c.panelConnectionGeneration)}),
    sameDeliveryActor:(a,b)=>JSON.stringify(a)===JSON.stringify(b),
    bridgeNextPath:project=>"/bridge/next?projectFile=" + encodeURIComponent(project || ""),
    setBridgeOffline:error=>error.message || error.code,log:()=>{},setBridgeConnected:()=>{},
    renderAutonomousSession:()=>{},setStatus:()=>{},setBridgeHelp:()=>{},refreshAppTitle:()=>{},loadAgents:()=>{},loadUsageSnapshot:()=>{},
    refreshCurrentBridgePlan:()=>{},refreshAutonomousSession:()=>{},refreshPlaceholderProtection:()=>{},
    executeCommand:command=>deliveries.push(command),pollRecoveryTransport:()=>{},
    panelLifecycleIdle:done=>done(null),panelActionBusy:()=>false,
    panelActionUI:{refreshTrustedGuards:done=>{guardCallback=done;return {accepted:true};}},
    invokePanelUI:()=>{c.observeConnectIntent();c.handlers["bridge.connect"]({},(...args)=>completed.push(args),{submit:()=>true});return {state:"running"};},
    XMLHttpRequest:function() {
      this.open=(method,url)=>{this.method=method;this.url=url;};this.setRequestHeader=()=>{};
      this.send=()=>http.push(this);
    }
  };
  vm.createContext(c);vm.runInContext(production,c,{timeout:1000});
  function timer(delay) {const t=timers.find(t=>!t.cancelled && !t.used && t.delay===delay);assert.ok(t,"timer " + delay);t.used=true;t.fn();}
  function response(index,value={},status=200) {const xhr=http[index];assert.ok(xhr,"HTTP " + index);xhr.status=status;xhr.responseText=JSON.stringify(value);xhr.readyState=4;xhr.onreadystatechange();}
  function start() {c.lookupHumanSettlementBeforeConnect(0);guardCallback(true);timer(250);assert.equal(evals.length,1);}
  function manualConnect(...args) {c.observeConnectIntent();return c.handlers["bridge.connect"](...args);}
  function actualIdle() {c.panelLifecycleIdle=vm.runInContext("("+body("panelLifecycleIdle")+")",c);}
  return {c,timers,evals,http,writes,deliveries,completed,timer,response,start,guard:ready=>guardCallback(ready),prefs,manualConnect,actualIdle};
}
let count=0;
function check(name,fn) {fn();count++;process.stdout.write("PASS " + name + "\n");}

check("initial provider reads delay connect without consuming or repeating it",()=>{
  const f=fixture();let busy=true;f.c.panelActionBusy=()=>busy;
  f.c.lookupHumanSettlementBeforeConnect(0);f.guard(true);
  for(let i=0;i<4;i++)f.timer(250);
  assert.equal(f.evals.length,0);assert.equal(f.c.initialAutomaticStartup.consumed,false);
  busy=false;f.timer(250);assert.equal(f.evals.length,1);
  assert.equal(f.timers.filter(t=>!t.used&&!t.cancelled&&t.delay===250).length,0);
});
check("busy startup wait is bounded and has no native delivery",()=>{
  const f=fixture();f.c.panelActionBusy=()=>true;f.c.lookupHumanSettlementBeforeConnect(0);f.guard(true);
  for(let i=0;i<80;i++)f.timer(250);
  assert.equal(f.c.initialAutomaticStartup.state,"closed");assert.equal(f.evals.length,0);
  assert.equal(f.c.initialAutomaticStartup.reason,"startup_panel_busy_timeout");
  assert.equal(f.timers.filter(t=>!t.used&&!t.cancelled).length,0);
});
check("initial status timeout and slow agents still permit exactly one automatic connection",()=>{
  const f=fixture();let agentsBusy=true,statusBusy=true;
  f.c.panelActionBusy=()=>agentsBusy||statusBusy;
  f.c.lookupHumanSettlementBeforeConnect(0);f.guard(true);
  f.c.connectorRequest("GET","/status?checkBridge=0",null,()=>{statusBusy=false;});
  f.c.request("GET","/agents?includeModels=1",null,()=>{agentsBusy=false;});
  for(let i=0;i<8;i++)f.timer(250); // First two seconds: passive startup reads.
  f.http[0].ontimeout();
  assert.equal(f.c.initialAutomaticStartup.state,"connecting");
  for(let i=0;i<4;i++)f.timer(250);
  assert.equal(f.evals.length,0);
  f.response(1,{agents:[]});f.timer(250);
  assert.equal(f.evals.length,1);f.evals[0].callback("");f.response(2,{ok:true,command:null});
  assert.equal(f.c.initialAutomaticStartup.state,"succeeded");
  assert.equal(f.c.connectionStartupDiagnostics.automaticAttempts,1);
  assert.equal(f.c.connectionStartupDiagnostics.explicitAttempts,0);
  assert.equal(f.c.connectionStartupDiagnostics.lastOrigin,"automatic");
  assert.equal(f.evals.length,1);
});
check("unrelated background HTTP failures cannot cancel unsubmitted or pending automatic connection",()=>{
  for(const phase of ["connecting","pending"]) {
    const f=fixture();f.c.lookupHumanSettlementBeforeConnect(0);f.guard(true);
    if(phase==="pending")f.timer(250);
    for(const route of ["/agents?includeModels=1","/health","/usage/snapshot","/status"]) {
      f.c.request("GET",route,null,()=>{});f.response(f.http.length-1,{error:"background unavailable"},503);
      assert.equal(f.c.initialAutomaticStartup.state,phase);
    }
    if(phase==="connecting")f.timer(250);
    assert.equal(f.evals.length,1);f.evals[0].callback("");f.response(f.http.length-1,{ok:true,command:null});
    assert.equal(f.c.initialAutomaticStartup.state,"succeeded");
    assert.equal(f.c.connectionStartupDiagnostics.automaticAttempts,1);
  }
});
check("disabled AutoConnect during pre-dispatch wait closes without submission",()=>{
  const f=fixture();f.c.lookupHumanSettlementBeforeConnect(0);f.guard(true);
  f.prefs.codexAeBridgeAutoConnect="0";f.timer(250);
  assert.equal(f.c.initialAutomaticStartup.reason,"startup_disabled");
  assert.equal(f.evals.length,0);assert.equal(f.c.connectionStartupDiagnostics.automaticAttempts,0);
});
check("own idle status error or unknown closes before submit without replay",()=>{
  for(const kind of ["error","unknown"]) {
    const f=fixture();f.actualIdle();f.c.lookupHumanSettlementBeforeConnect(0);f.guard(true);f.timer(250);
    assert.equal(f.http.length,1);assert.equal(f.http[0].method,"POST");
    if(kind==="error")f.response(0,{error:"idle unavailable"},503);else f.http[0].ontimeout();
    assert.equal(f.c.initialAutomaticStartup.reason,"startup_idle_check_failed");
    assert.equal(f.evals.length,0);assert.equal(f.c.initialAutomaticStartup.consumed,false);
    f.c.lookupHumanSettlementBeforeConnect(0);assert.equal(f.http.length,1);
  }
});
check("own busy status and current-plan failure preserve idle admission",()=>{
  for(const kind of ["busy","plan"]) {
    const f=fixture();f.actualIdle();f.c.refreshCurrentBridgePlan=(_options,done)=>done({code:"plan_read_failed"});
    f.c.lookupHumanSettlementBeforeConnect(0);f.guard(true);f.timer(250);
    const status={projectLifecycle:{enabled:false,blocked:false,problem:null},pendingCommands:kind==="busy"?1:0,inflightCommands:[],activeEditSession:null};
    f.response(0,{result:{content:[{text:JSON.stringify(status)}]}});
    assert.equal(f.c.initialAutomaticStartup.reason,kind==="busy"?"startup_bridge_busy":"startup_idle_check_failed");
    assert.equal(f.evals.length,0);assert.equal(f.c.initialAutomaticStartup.consumed,false);
    assert.equal(f.c.connectionStartupDiagnostics.automaticAttempts,1);
  }
});
check("URL or credential drift during pre-dispatch wait cannot submit Connect",()=>{
  for(const field of ["urlEl","tokenEl"]) {
    const f=fixture();f.c.lookupHumanSettlementBeforeConnect(0);f.guard(true);
    f.c[field].value="changed";f.timer(250);
    assert.equal(f.evals.length,0);assert.equal(f.http.length,0);
    assert.equal(f.c.connectionStartupDiagnostics.automaticAttempts,0);
    assert.equal(f.c.initialAutomaticStartupCurrent(f.c.initialAutomaticStartup),false);
  }
});
check("product connect uses bootstrap ticket while project actions retain admission",()=>{
  const daemon=fs.readFileSync(path.join(__dirname,"../mcp-server/bridge-daemon.js"),"utf8");
  const start=daemon.indexOf("function callToolLogged("),end=daemon.indexOf("async function callToolLoggedImpl(",start);
  const calls=[],c={initialRuntime:null,deploymentMode:"product",panelBootstrap:{TOOL_NAME:"ensure_ae_agent_panel"},
    toolByName:()=>({annotations:{readOnlyHint:false}}),MUTATING_TOOL_NAMES:new Set(["invoke_panel_action"]),
    ownedRuntimeService:{runBootstrap:fn=>{calls.push("bootstrap");return fn();},run:(kind,fn)=>{calls.push(kind);return fn();}},
    callToolLoggedImpl:()=>"validated-by-existing-panel-service"};
  vm.createContext(c);vm.runInContext(daemon.slice(start,end),c);
  c.callToolLogged("mcp-adapter","invoke_panel_action",{action:"bridge.connect"},{});
  c.callToolLogged("mcp-adapter","invoke_panel_action",{action:"plan.run"},{});
  c.deploymentMode="initial-owned";c.callToolLogged("mcp-adapter","invoke_panel_action",{action:"bridge.connect"},{});
  assert.deepEqual(calls,["bootstrap","execution","execution"]);
});
check("ordinary product receipts do not require experimental retained manifest",()=>{
  const daemon=fs.readFileSync(path.join(__dirname,"../mcp-server/bridge-daemon.js"),"utf8");
  const start=daemon.indexOf("function panelControlUsesRetainedTransport("),end=daemon.indexOf("const panelControlService =",start);
  let product=true,current={generation:"generation"};const c={ownedRuntimeStartup:{managed:true},PROJECT_ROOT:"offline",process:{env:{AE_OWNED_RUNTIME_GENERATION:"generation"}},
    require:()=>({readProductStopAuthority:()=>product,readDaemonRegistration:()=>current})};
  vm.createContext(c);vm.runInContext(daemon.slice(start,end),c);
  assert.equal(c.panelControlUsesRetainedTransport(),false);
  product=false;assert.equal(c.panelControlUsesRetainedTransport(),true);
  product=true;current={generation:"predecessor"};assert.equal(c.panelControlUsesRetainedTransport(),true);
  current=null;assert.equal(c.panelControlUsesRetainedTransport(),true);current={generation:"generation"};
  c.ownedRuntimeStartup.managed=false;assert.equal(c.panelControlUsesRetainedTransport(),false);
  c.ownedRuntimeStartup.managed=true;c.require=()=>({readDaemonRegistration:()=>current,readProductStopAuthority:()=>{throw Error("invalid_provenance");}});
  assert.throws(()=>c.panelControlUsesRetainedTransport(),/invalid_provenance/);
});
check("ordinary product admission still rejects experimental or invalid provenance",()=>{
  const daemon=fs.readFileSync(path.join(__dirname,"../mcp-server/bridge-daemon.js"),"utf8");
  const start=daemon.indexOf("readAdmission:()=>"),end=daemon.indexOf(",journalRoot:",start);
  let retained=false,admitted=false,cutover=false;
  const c={ownedRuntimeStartup:{managed:true,requiresRetainedAdoption:true},PROJECT_ROOT:"offline",
    productSessionResetState:()=>null,
    panelControlUsesRetainedTransport:()=>retained,require:()=>({currentAdmission:()=>admitted}),
    panelControlService:{cutoverReadiness:()=>({ready:cutover})}};
  vm.createContext(c);const read=vm.runInContext("("+daemon.slice(start+"readAdmission:".length,end)+")",c);
  assert.equal(read(),true);retained=true;assert.equal(read(),false);
  admitted=true;assert.equal(read(),false);cutover=true;assert.equal(read(),true);
  c.panelControlUsesRetainedTransport=()=>{throw Error("invalid_provenance");};
  assert.throws(read,/invalid_provenance/);
});

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
  const f=fixture();f.c.lookupHumanSettlementBeforeConnect(0);f.manualConnect({},()=>{},{submit:()=>false});f.response(0,{ok:false,code:"owned_product_reset_session_absent"},409);assert.equal(f.evals.length,0);assert.equal(f.c.initialAutomaticStartup.state,"superseded");
  assert.equal(f.c.initialAutomaticStartup.reason,"explicit_connect");
  assert.equal(f.c.connectionStartupDiagnostics.lastOrigin,"explicit");
  f.manualConnect({},()=>{},{submit:()=>true});f.response(1,{ok:false,code:"owned_product_reset_session_absent"},409);assert.equal(f.evals.length,1);assert.equal(f.writes.length,3);f.guard(true);assert.equal(f.timers.length,0);
  f.evals[0].callback("");f.response(2,{error:"offline"},503);assert.equal(f.c.running,true);assert.equal(f.timers.filter(t=>t.delay===1500).length,1);
});
check("already running user connection is not reset by bootstrap lookup",()=>{
  const f=fixture();f.c.running=true;f.c.panelLifecycleEpoch=17;f.c.panelConnectionGeneration=41;f.c.lookupHumanSettlementBeforeConnect(0);
  f.manualConnect({},()=>{},{submit:()=>{throw Error("unexpected submit");}});
  assert.equal(f.c.panelLifecycleEpoch,17);assert.equal(f.c.panelConnectionGeneration,41);assert.equal(f.evals.length,0);assert.equal(f.http.length,0);assert.equal(f.c.running,true);
});
process.stdout.write(JSON.stringify({ok:true,checks:count,evidence:"offline actual production function bodies with fake CS/HTTP/timers; no live/native proof"}) + "\n");

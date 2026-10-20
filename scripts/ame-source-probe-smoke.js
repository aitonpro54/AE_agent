"use strict";
// Offline only. Explicit delivery happens AFTER AE returns, simulating DL reentry.
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto"),vm=require("node:vm");
const probe=require("../mcp-server/ame-source-probe");
const scratch=path.resolve(__dirname,"../.codex-runtime/ame-source-probe/fixtures");fs.mkdirSync(scratch,{recursive:true});const root=fs.mkdtempSync(path.join(scratch,"bounded-"));let checks=0;
async function check(name,fn){await fn();checks++;console.log("PASS "+name);}
function fixture(name){
  const dir=path.join(root,name);fs.mkdirSync(dir);const source=path.join(dir,"Проект (пример).aep");fs.writeFileSync(source,"one existing AEP");
  const args={probeId:crypto.randomUUID(),sourceProjectFile:source,expectedSourceSha25664:crypto.createHash("sha256").update(fs.readFileSync(source)).digest("hex"),targetSpecifier:"ame-26.0",expectedSessionNonce:"boot-session",expectedProcess:{pid:77,startedAt:"2026-10-20T12:00:00.000Z"},timeoutMs:1000};
  let activeAE=false,mode=null,ready=true,process={...args.expectedProcess,path:path.join(dir,"AME.exe")},dlCalls=0;const inbox=[],sent=[],held=[];
  const forbidden=()=>{throw Error("queue/START/save/pump/sleep forbidden");};
  const original={requestNonce:"original-UNKNOWN",callback:"timeout",body:null,message:{untouched:true}},originalAME={untouched:true};
  const frontend={getDLItemsAtRoot:file=>{assert.equal(activeAE,false,"DL requires AE script to have returned");assert.equal(file,source);dlCalls++;return ["abcdefab-1234-1234-1234-000000000001"];},addDLToBatch:forbidden,removeAllBatchItems:forbidden};
  for(const k of ["getEncoderHost","getBatchEncoder","getExporter","runBatch","save"])Object.defineProperty(frontend,k,{get:forbidden});
  function File(file){const s=fs.lstatSync(file);this.exists=true;this.alias=s.isSymbolicLink();this.length=s.size;this.modified=s.mtime;}
  const ame=vm.createContext({Date,File,BridgeTalk:{appSpecifier:args.targetSpecifier},$:{global:{aeAgentAMEProbeSessionNonce:args.expectedSessionNonce,aeAgentAMETitleJobsV1:originalAME}},app:{getFrontend:()=>frontend,getEncoderHost:forbidden}});
  function BridgeTalk(){this.send=function(){assert.equal(arguments.length,0,"only async send() is allowed");this.mode=mode;inbox.push(this);sent.push(this);return true;};}
  BridgeTalk.isRunning=()=>true;BridgeTalk.getStatus=()=>"IDLE";BridgeTalk.pump=forbidden;BridgeTalk.launch=forbidden;
  const ae=vm.createContext({Date,BridgeTalk,$:{global:{aeAgentAMETitleSendV1:original},sleep:forbidden}});
  const executor=probe.createProbe({assertReady:()=>assert(ready,"not idle"),inspectProcesses:async()=>[process],readNative:async body=>{activeAE=true;try{return {result:vm.runInContext("(function(){"+body+"}())",ae,{timeout:1000})};}finally{activeAE=false;}}});
  const call=async(stage,overrides={})=>{mode=stage;return executor.execute({...args,mode:stage,...overrides});};
  const deliver=stage=>{const i=inbox.findIndex(m=>m.mode===stage);assert(i>=0,"expected queued stage "+stage);const m=inbox.splice(i,1)[0];let body;try{body=vm.runInContext(m.body,ame,{timeout:30});}catch(e){if(e.code==="ERR_SCRIPT_EXECUTION_TIMEOUT"){held.push(m);return "native_blocked";}throw e;}m.onResult({body});return m;};
  const pass=async stage=>{const first=await call(stage);assert.equal(first.code,"unknown");assert.equal(first.transport.sendMode,"async_no_wait");assert.equal(first.transport.pumpPerformed,false);deliver(stage);const result=await call(stage);assert.equal(result.ok,true,JSON.stringify(result));assert.equal(result.requestNonce,first.requestNonce);return result;};
  const untouched=()=>{assert.equal(ae.$.global.aeAgentAMETitleSendV1,original);assert.equal(original.callback,"timeout");assert.equal(ame.$.global.aeAgentAMETitleJobsV1,originalAME);};
  return {args,source,ae,ame,frontend,call,pass,deliver,inbox,sent,held,untouched,dlCalls:()=>dlCalls,process:v=>{process=v;},ready:v=>{ready=v;},row:()=>ame.$.global.aeAgentAMESourceProbeV1[args.probeId]};
}
(async()=>{
  await check("begin/generic compilation/tiny DL succeed after AE release; exact Unicode; no queue/pump/sync send",async()=>{
    const f=fixture("pass");await f.pass("begin");const generic=await f.pass("receiver");assert.equal(generic.phase,"generic_receiver_compiled");assert(generic.transport.messageBodyChars>30000);assert.equal(f.dlCalls(),0);
    const result=await f.pass("dl");assert.equal(result.phase,"after_get_dl");assert.equal(result.diagnosticGuidAuthority,false);assert.equal(result.executionAuthority,false);assert.equal(f.dlCalls(),1);const count=f.sent.length;assert.equal((await f.call("dl")).phase,"after_get_dl");assert.equal(f.sent.length,count);f.untouched();
  });
  await check("generic body not delivered: status sees registered; DL denied; same stage never resent",async()=>{
    const f=fixture("generic-unknown");await f.pass("begin");const r=await f.call("receiver"),message=f.inbox.shift();message.onTimeout();assert.equal((await f.call("receiver")).code,"timeout");assert.equal(f.sent.length,2);
    const pending=await f.call("status");assert.equal(pending.code,"unknown");const pendingCount=f.sent.length;assert.equal((await f.call("status")).requestNonce,pending.requestNonce);assert.equal(f.sent.length,pendingCount);f.deliver("status");const status=await f.call("status");assert.equal(status.phase,"registered");assert.equal(status.native.genericReceived,false);
    const phaseBefore=JSON.stringify(f.row()),fresh=await f.call("status");assert.notEqual(fresh.requestNonce,pending.requestNonce);assert.equal(f.sent.length,pendingCount+1);f.deliver("status");assert.equal((await f.call("status")).requestNonce,fresh.requestNonce);assert.equal(JSON.stringify(f.row()),phaseBefore);await assert.rejects(f.call("dl"),/receiver_evidence_required/);assert.equal(f.dlCalls(),0);assert.equal(r.requestNonce,(await f.call("receiver")).requestNonce);f.untouched();
  });
  await check("native DL block retains before_get_dl and once flag; independent status works; no replay after timeout",async()=>{
    const f=fixture("dl-blocked");await f.pass("begin");await f.pass("receiver");f.frontend.getDLItemsAtRoot=vm.runInContext("(function(){while(true){}})",f.ame);
    const first=await f.call("dl");assert.equal(f.deliver("dl"),"native_blocked");assert.equal(f.row().phase,"before_get_dl");assert.equal(f.row().dlIssued,true);f.held[0].onTimeout();assert.equal((await f.call("dl")).code,"timeout");const count=f.sent.length;
    const pending=await f.call("status");f.deliver("status");const observed=await f.call("status");assert.equal(observed.phase,"before_get_dl");assert.equal(observed.native.dlIssued,true);assert.equal(observed.native.dlFinishedAt,null);assert.equal(first.requestNonce,(await f.call("dl")).requestNonce);assert.equal(f.sent.length,count+1);assert.equal(pending.requestNonce,observed.requestNonce);f.untouched();
  });
  await check("late DL response after timeout and status reveal completion without repeating native call",async()=>{
    const f=fixture("late");await f.pass("begin");await f.pass("receiver");const first=await f.call("dl"),message=f.inbox[0];message.onTimeout();assert.equal((await f.call("dl")).code,"timeout");f.deliver("dl");assert.equal((await f.call("dl")).phase,"after_get_dl");assert.equal(f.dlCalls(),1);assert.equal((await f.call("dl")).requestNonce,first.requestNonce);f.untouched();
  });
  await check("process/session/file identity and preflight failures refuse DL",async()=>{
    const f=fixture("source-change");await f.pass("begin");await f.pass("receiver");fs.appendFileSync(f.source,"changed");await assert.rejects(f.call("dl"),/source_changed/);assert.equal(f.dlCalls(),0);
    const g=fixture("process-change");await g.pass("begin");g.process({...g.args.expectedProcess,pid:78,path:"AME.exe"});await assert.rejects(g.call("receiver"),/process_changed/);
    const h=fixture("session-change");await h.pass("begin");h.ame.$.global.aeAgentAMEProbeSessionNonce="different";await h.call("receiver");h.deliver("receiver");assert.equal((await h.call("receiver")).code,"probe_native_correlation_unknown");await assert.rejects(h.call("dl"),/receiver_evidence_required/);
    const k=fixture("native-file-change");await k.pass("begin");await k.pass("receiver");await k.call("dl");fs.appendFileSync(k.source,"late");k.deliver("dl");assert.equal(k.row().phase,"dl_error");assert.equal(k.row().error,"probe_native_source_changed");assert.equal(k.dlCalls(),0);
    const n=fixture("idle");n.ready(false);await assert.rejects(n.call("begin"),/not idle/);assert.equal(n.sent.length,0);
  });
  await check("fixed input only; stage order, binding, native once and aliases fail closed",async()=>{
    const f=fixture("input");for(const field of ["script","messageBody","globalQueue","proof"])assert.throws(()=>probe.validateInput({...f.args,mode:"begin",[field]:"claim"}),/invalid_input/);await assert.rejects(f.call("dl"),/begin_required/);await f.pass("begin");await assert.rejects(f.call("dl"),/receiver_evidence_required/);await assert.rejects(f.call("status",{timeoutMs:2000}),/binding_changed/);
    await f.pass("receiver");f.row().dlIssued=true;f.row().phase="before_get_dl";await f.call("dl");f.deliver("dl");const result=await f.call("dl");assert.equal(result.code,"probe_dl_no_replay");assert.equal(f.dlCalls(),0);
    const g=fixture("alias"),link=path.join(path.dirname(g.source),"hardlink.aep");fs.linkSync(g.source,link);await assert.rejects(g.call("begin"),/source_identity/);f.untouched();
  });
  await check("actual readonly catalog/classifier and runtime source pin include fixed probe",async()=>{
    const source=fs.readFileSync(path.join(__dirname,"../mcp-server/bridge-daemon.js"),"utf8");assert(source.includes("  ameSourceProbe.tool,"));assert(source.includes("if(name===ameSourceProbe.TOOL)"));const start=source.indexOf("function classifyM100ToolRisk(name) {"),end=source.indexOf("\nfunction m100DirectEscapeHatchAllowed",start),ctx=vm.createContext({knownToolNames:()=>new Set([probe.TOOL]),M100_RISK_POLICY_VERSION:"test",M100_RAW_JSX_TOOL_NAMES:new Set(),M100_DESTRUCTIVE_TOOL_NAMES:new Set(),MUTATING_TOOL_NAMES:new Set(),panelBootstrap:{TOOL_NAME:"ensure_ae_agent_panel"}});vm.runInContext(source.slice(start,end),ctx);const risk=vm.runInContext("classifyM100ToolRisk("+JSON.stringify(probe.TOOL)+")",ctx);assert.equal(risk.known,true);assert.equal(risk.riskLevel,"read_only");assert.equal(risk.requiresProposal,false);
    const pin=require("../mcp-server/review-evidence").runtimeNamedHashSet(path.resolve(__dirname,"..")).find(p=>p.name==="mcp-server/ame-source-probe.js");assert(pin);assert.equal(pin.sha256,crypto.createHash("sha256").update(fs.readFileSync(path.join(__dirname,"../mcp-server/ame-source-probe.js"))).digest("hex"));
  });
  console.log(JSON.stringify({ok:true,checks,evidence:"offline fixed async sender/receiver VMs; no live Adobe, queue or START"}));
})().catch(e=>{console.error(e);process.exitCode=1;});

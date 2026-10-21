"use strict";

// Production panel in the existing VM: fake XHR/CSInterface, no AE/CDP/daemon.
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto");
const {createPanelEnvironment,makeActionProposal,makeCurrentPlan}=require("./cep-plan-refresh-smoke");
const contract=require("../cep-panel/panel-action-contract");
const source=fs.readFileSync(path.join(__dirname,"../cep-panel/panel.js"),"utf8");
const clone=value=>JSON.parse(JSON.stringify(value));
const marker={mode:"completed_native_dry_run_v1"},token="confirm_"+"e".repeat(48),nativeRunId="2".repeat(32);
let scenarios=0;
function test(name,fn){fn();scenarios++;console.log("PASS "+name);}
function request(env,pathname){const req=env.popRequest(r=>r.path===pathname || r.path.startsWith(pathname+"?"));assert(req,"Expected "+pathname);return req;}
function invoke(env,action,args){const envelope={protocolVersion:contract.PROTOCOL_VERSION,requestId:crypto.randomUUID(),action,args};
  const initial=env.invoke(envelope);assert.equal(initial.state,"running",JSON.stringify(initial));return ()=>clone(env.api.getResult(envelope.requestId));}
function passiveDrain(env){let count=0;while(env.inFlightRequests.length){assert(++count<40);const r=env.inFlightRequests[0];
  assert(!r.path.startsWith("/agents/plan/"),"Unexpected plan request "+r.path);
  const body=r.path.startsWith("/agents?")?{agents:[{id:"openai-cli",provider:"openai",label:"VM",model:"vm",models:["vm"],configured:true,canChat:true,reachable:true,modelAvailable:true}],defaultAgentId:"openai-cli"}:
    r.path==="/usage"?{usage:{sources:{}}}:r.path==="/human-guard-settlement/lookup"?{ok:true,settlement:null}:
    r.path==="/ame/fixture-ui-disposition/lookup"?{ok:true,disposition:null}:r.path==="/ame/native-fixture-prephase-recovery/lookup"?{ok:true,certificate:null}:
    r.path==="/placeholder/protection"?{ok:true,acceptedCount:0,groupMappings:[],constraints:{}}:{ok:true,command:null,version:"3.3.4"};r.respond(200,body);}}
function fixture(finite=true,holdCommand=false){
  // Host callback control stays in this VM fixture, never in production assets.
  const hostedSource=holdCommand?source.replace("  var cs = new CSInterface();","  var cs = new CSInterface(); var originalEval = cs.evalScript; window.__ownedVmSetConnection = function(url,token) { if(url) configuredBridgeUrl=url; if(token) configuredPanelToken=token; }; cs.evalScript = function(script, callback) { if(script === 'owned-vm-command') { window.__ownedVmCommandDone = callback; return; } originalEval.call(cs,script,callback); };"):source;
  const env=createPanelEnvironment(hostedSource);passiveDrain(env);env.planOps.connect();
  const next=request(env,"/bridge/next");next.respond(200,{ok:true,command:null,...(finite?{ownedPlanPreparation:{...marker,remainingSessionMs:600000}}:{})});
  if(!finite){const current=env.popRequest(r=>r.path==="/agents/plan/current");if(current)current.respond(200,{ok:true,current:null});}
  passiveDrain(env);
  const state=env.api.state(),actor={panelConnectionId:state.bridgeConnection.panelConnectionId,panelGeneration:String(state.panelGeneration),
    panelInstanceId:state.panelInstanceId,panelLifecycleEpoch:state.panelLifecycleEpoch,confirmationSessionId:state.bridgeConnection.panelConnectionId+":"+state.chat.sessionId};
  const proposal=makeActionProposal("original-action",null);proposal.confirmation.sessionId=actor.confirmationSessionId;
  const current=makeCurrentPlan(proposal.actionId,3,proposal);
  if(finite)current.ownedPlanPreparation=clone(marker);
  env.planOps.setCurrentBridgePlan(clone(current));env.planOps.setLastPlanResult({plan:clone(current.plan),planValidation:clone(current.validation),requestId:proposal.requestId,m100ActionProposal:clone(proposal)});
  const pins=clone(env.api.state().plan.pins);
  const responseCurrent=clone(current),finishedAt=new Date().toISOString();
  responseCurrent.state="dry_run_passed";responseCurrent.dryRunCompletedAt=finishedAt;
  responseCurrent.lastRun={id:nativeRunId,ok:true,dryRun:true};
  const privateProposal=clone(proposal);privateProposal.confirmation.confirmationToken=token;
  const response={ok:true,proposal:privateProposal,revision:current.revision,plan:clone(current.plan),validation:clone(current.validation),current:responseCurrent,
    completedDryRun:{schema:"ae-agent.owned-native-dry-projection.v1",id:nativeRunId,ok:true,dryRun:true,requestId:proposal.requestId,
      actionId:proposal.actionId,revision:current.revision,instanceId:current.instanceId,finishedAt,nativeAuthority:false,
      binding:{pins:clone(pins),...actor},nativeDelivery:{commandRef:"1".repeat(32),executionRef:nativeRunId,leaseRef:"3".repeat(32),
        receiptSha25664:"4".repeat(64),scriptSha25664:"5".repeat(64),resultSha25664:"6".repeat(64)}}};
  const start=env.requestHistory.length;
  function prepare(){const result=invoke(env,"plan.prepare",{pins});request(env,"/agents/plan/current").respond(200,{ok:true,current:clone(current)});return {result,adopt:request(env,"/agents/plan/adopt")};}
  function prepared(){const p=prepare();p.adopt.respond(200,clone(response));assert.equal(p.result().state,"completed",JSON.stringify(p.result()));return p;}
  return {env,current,pins,response,actor,start,prepare,prepared};}

test("finite preparation is exactly current GET + adopt POST; original receipt; separate execute",()=>{
  const f=fixture(),p=f.prepared();
  assert.deepEqual(f.env.requestHistory.slice(f.start).map(r=>[r.method,r.path]),[["GET","/agents/plan/current"],["POST","/agents/plan/adopt"]]);
  assert.equal(p.result().runId,nativeRunId);assert.equal(p.result().result.executionRequested,false);
  assert.deepEqual(clone(f.env.api.state().plan.pins),f.pins);
  assert.equal(f.env.api.state().plan.acceptedDryRun.runId,nativeRunId);
  assert.equal(f.env.planOps.getCurrentBridgePlan().proposal.confirmation.confirmationToken,undefined);
  assert(!JSON.stringify(f.env.api.state()).includes(token));
  assert(!f.env.storageStore.get("codexAePanelActionReceipts").includes(token));
  assert(!f.env.elements.get("log").textContent.includes(token));
  const before=f.env.requestHistory.length,result=invoke(f.env,"plan.run",{pins:f.pins,confirm:true});
  assert.deepEqual(f.env.requestHistory.slice(before).map(r=>[r.method,r.path]),[["POST","/agents/plan/run"]]);
  const run=request(f.env,"/agents/plan/run");assert.equal(run.body.confirmationToken,token);assert.equal(run.body.dryRun,false);
  assert.equal(f.env.api.state().plan.acceptedDryRun,null,"Submission retires the local receipt cache");
  run.respond(409,{ok:false,code:"native_fresh_guard_refused",error:"Fresh backend guard refused"});
  assert.equal(result().state,"error");assert.equal(f.env.requestHistory.length,before+1,"No retry on backend refusal");
});

const invalid=[
  ["missing promised receipt",r=>{delete r.completedDryRun;}],
  ["missing native delivery",r=>{delete r.completedDryRun.nativeDelivery;}],
  ["synthetic run identity",r=>{r.completedDryRun.id="synthetic";}],
  ["zero native receipt hash",r=>{r.completedDryRun.nativeDelivery.receiptSha25664="0".repeat(64);}],
  ["foreign native run",r=>{r.completedDryRun.nativeDelivery.executionRef="7".repeat(32);}],
  ["coerced native command ref",r=>{r.completedDryRun.nativeDelivery.commandRef=[r.completedDryRun.nativeDelivery.commandRef];}],
  ["coerced native receipt hash",r=>{r.completedDryRun.nativeDelivery.receiptSha25664=[r.completedDryRun.nativeDelivery.receiptSha25664];}],
  ["extra native delivery field",r=>{r.completedDryRun.nativeDelivery.ready=true;}],
  ["missing actor",r=>{delete r.completedDryRun.binding.panelInstanceId;}],
  ["missing epoch",r=>{delete r.completedDryRun.binding.panelLifecycleEpoch;}],
  ["foreign actor",r=>{r.completedDryRun.binding.panelInstanceId="other";}],
  ["foreign connection",r=>{r.completedDryRun.binding.panelConnectionId="other";}],
  ["foreign generation",r=>{r.completedDryRun.binding.panelGeneration="other";}],
  ["foreign epoch",r=>{r.completedDryRun.binding.panelLifecycleEpoch++;}],
  ["foreign session",r=>{r.completedDryRun.binding.confirmationSessionId="other";}],
  ["foreign pins",r=>{r.completedDryRun.binding.pins.payloadHash="sha256:"+"7".repeat(64);}],
  ["retargeted canonical",r=>{r.current.plan.targetProject.file="other.aep";}],
  ["changed canonical body",r=>{r.current.plan.steps[0].args.name="Changed";}],
  ["changed validation",r=>{r.current.validation.mutatingCount=0;}],
  ["revision change",r=>{r.current.revision++;}],
  ["current token exposure",r=>{r.current.proposal.confirmation.confirmationToken=token;}],
  ["missing completed publication",r=>{delete r.current.lastRun;}],
  ["failed dry run",r=>{r.completedDryRun.ok=false;}],
  ["invalid completion timestamp",r=>{r.completedDryRun.finishedAt="invalid";}],
  ["claimed authority",r=>{r.completedDryRun.nativeAuthority=true;}],
  ["missing scheduling promise",r=>{delete r.current.ownedPlanPreparation;}]
];
for(const [name,change] of invalid)test(name+" closes preparation without replay",()=>{
  const f=fixture(),p=f.prepare(),response=clone(f.response);change(response);p.adopt.respond(200,response);
  assert.equal(p.result().state,"rejected",JSON.stringify(p.result()));assert.equal(p.result().code,"completed_native_dry_run_invalid");
  assert.equal(f.env.api.state().plan.acceptedDryRun,null);
  assert.equal(f.env.planOps.getLastPlanResult().m100ActionProposal.confirmation.confirmationToken,undefined);
  assert.equal(f.env.requestHistory.slice(f.start).length,2);
});

test("late pre-adopt current callback cannot overwrite completed adoption",()=>{
  const f=fixture();f.env.planOps.runLastPlan(true,true,()=>{},{prepare:true,strict:true,pins:f.pins});const adopt=request(f.env,"/agents/plan/adopt");
  let rejected=null;f.env.planOps.refreshCurrentBridgePlan({fresh:true},error=>{rejected=error;});const old=request(f.env,"/agents/plan/current");
  adopt.respond(200,clone(f.response));assert.equal(rejected.code,"plan_pins_mismatch");
  old.respond(200,{ok:true,current:null});assert.equal(f.env.planOps.getCurrentBridgePlan().actionId,f.current.actionId);
  assert.equal(f.env.api.state().plan.acceptedDryRun.runId,nativeRunId);assert.equal(f.env.planOps.getWaitingRefreshCount(),0);
});

test("connection lifecycle interruption cannot accept or re-send adoption",()=>{
  const f=fixture(),p=f.prepare();f.env.planOps.disconnect();p.adopt.respond(200,clone(f.response));
  assert.equal(p.result().state,"unknown");assert.equal(f.env.api.state().plan.acceptedDryRun,null);
  assert.equal(f.env.requestHistory.slice(f.start).filter(r=>r.path==="/agents/plan/adopt").length,1);
});

test("current waiter lifecycle reentry cannot install adopted receipt in the new connection",()=>{
  const f=fixture();let outcome=null;f.env.planOps.runLastPlan(true,true,error=>{outcome=error;},{prepare:true,strict:true,pins:f.pins});
  const adopt=request(f.env,"/agents/plan/adopt");
  f.env.planOps.refreshCurrentBridgePlan({fresh:true},()=>{f.env.planOps.disconnect();});const old=request(f.env,"/agents/plan/current");
  adopt.respond(200,clone(f.response));assert.equal(outcome.code,"lifecycle_interrupted");
  assert.equal(f.env.api.state().plan.acceptedDryRun,null);
  assert.equal(f.env.planOps.getLastPlanResult().m100ActionProposal.confirmation.confirmationToken,undefined);
  old.respond(200,{ok:true,current:clone(f.response.current)});assert.equal(f.env.api.state().plan.acceptedDryRun,null);
});

test("same action changed canonical pins clear cached dry run",()=>{
  const f=fixture();f.prepared();f.env.planOps.refreshCurrentBridgePlan({fresh:true});const changed=clone(f.response.current);
  changed.proposal.action.payloadHash="sha256:"+"8".repeat(64);request(f.env,"/agents/plan/current").respond(200,{ok:true,current:changed});
  assert.equal(f.env.api.state().plan.acceptedDryRun,null);
  const before=f.env.requestHistory.length,result=f.env.invoke({protocolVersion:contract.PROTOCOL_VERSION,requestId:crypto.randomUUID(),action:"plan.run",args:{pins:f.pins,confirm:true}});
  assert.equal(result.state,"rejected");assert.equal(f.env.requestHistory.length,before);
});

for(const [name,change] of [
  ["validation",current=>{current.validation.mutatingCount=0;}],
  ["tokenless proposal",current=>{current.proposal.summary="Changed canonical summary";}]
])test("after successful adoption same pins/body changed "+name+" retires readiness before execute",()=>{
  const f=fixture();f.prepared();const changed=clone(f.response.current);change(changed);
  f.env.planOps.refreshCurrentBridgePlan({fresh:true});request(f.env,"/agents/plan/current").respond(200,{ok:true,current:changed});
  assert.deepEqual(clone(f.env.api.state().plan.pins),f.pins,"Pins remained identical in this regression");
  assert.deepEqual(clone(f.env.planOps.getCurrentBridgePlan().plan),f.current.plan,"Body remained identical in this regression");
  assert.equal(f.env.api.state().plan.acceptedDryRun,null);
  const before=f.env.requestHistory.length,result=f.env.invoke({protocolVersion:contract.PROTOCOL_VERSION,requestId:crypto.randomUUID(),action:"plan.run",args:{pins:f.pins,confirm:true}});
  assert.equal(result.state,"rejected");assert.equal(result.code,"matching_dry_run_required");
  assert.equal(f.env.requestHistory.length,before,"No execute submission after cache retirement");
});

test("unchanged public canonical after adoption retains cache and private token",()=>{
  const f=fixture();f.prepared();f.env.planOps.refreshCurrentBridgePlan({fresh:true});request(f.env,"/agents/plan/current").respond(200,{ok:true,current:clone(f.response.current)});
  assert.equal(f.env.api.state().plan.acceptedDryRun.runId,nativeRunId);
  assert.equal(f.env.planOps.getCurrentBridgePlan().proposal.confirmation.confirmationToken,undefined);
  const before=f.env.requestHistory.length;invoke(f.env,"plan.run",{pins:f.pins,confirm:true});
  assert.deepEqual(f.env.requestHistory.slice(before).map(r=>r.path),["/agents/plan/run"]);
  assert.equal(request(f.env,"/agents/plan/run").body.confirmationToken,token);
});

for(const [name,change] of [
  ["array command ref",delivery=>{delivery.commandRef=[delivery.commandRef];}],
  ["array receipt hash",delivery=>{delivery.receiptSha25664=[delivery.receiptSha25664];}],
  ["extra readiness field",delivery=>{delivery.ready=true;}]
])test("prior successful adoption cannot admit next receipt with "+name,()=>{
  const f=fixture();f.prepared();
  const proposal=makeActionProposal("next-original-action",null);proposal.confirmation.sessionId=f.actor.confirmationSessionId;
  const current=makeCurrentPlan(proposal.actionId,4,proposal);current.ownedPlanPreparation=clone(marker);
  f.env.planOps.refreshCurrentBridgePlan({fresh:true});request(f.env,"/agents/plan/current").respond(200,{ok:true,current:clone(current)});
  assert.equal(f.env.api.state().plan.acceptedDryRun,null,"A new proposal retires the prior valid receipt");
  const pins=clone(f.env.api.state().plan.pins),result=invoke(f.env,"plan.prepare",{pins});
  request(f.env,"/agents/plan/current").respond(200,{ok:true,current:clone(current)});
  const response=clone(f.response),nextRunId="9".repeat(32);
  response.revision=current.revision;response.plan=clone(current.plan);response.validation=clone(current.validation);response.proposal=clone(proposal);
  response.proposal.confirmation.confirmationToken=token;response.current=clone(current);response.current.state="dry_run_passed";
  response.current.dryRunCompletedAt=response.completedDryRun.finishedAt;response.current.lastRun={id:nextRunId,ok:true,dryRun:true};
  Object.assign(response.completedDryRun,{id:nextRunId,requestId:proposal.requestId,actionId:proposal.actionId,revision:current.revision});
  response.completedDryRun.nativeDelivery.executionRef=nextRunId;response.completedDryRun.binding.pins=pins;change(response.completedDryRun.nativeDelivery);
  const before=f.env.requestHistory.length;request(f.env,"/agents/plan/adopt").respond(200,response);
  assert.equal(result().state,"rejected");assert.equal(result().code,"completed_native_dry_run_invalid");
  assert.equal(f.env.api.state().plan.acceptedDryRun,null);assert.equal(f.env.requestHistory.length,before,"No follow-up dry/run request");
});

test("finite held original beyond 10s has no duplicate poll or periodic current/autonomy reads",()=>{
  const f=fixture();f.prepared();const start=f.env.requestHistory.length;f.env.setFrozenNow(Date.now()+2000);
  const poll=[...f.env.timers.values()].find(t=>t.fn.name==="poll").fn;
  assert(f.env.runTimer(t=>t.fn.name==="poll"));const held=request(f.env,"/bridge/next");
  assert.equal(held.xhr.timeout,600000,"Native initial remaining lifetime bounds XHR, not generic 10s");
  f.env.setFrozenNow(Date.now()+11000);poll();poll();
  assert.equal(f.env.requestHistory.slice(start).filter(r=>r.path.startsWith("/bridge/next?")).length,1);
  assert.equal(f.env.requestHistory.slice(start).filter(r=>r.path==="/agents/plan/current" || r.path==="/autonomy/session").length,0);
  assert.equal(f.env.requestHistory.slice(start).filter(r=>r.path.startsWith("/bridge/heartbeat?")).length,0);
  assert.equal(held.completed,false);assert(![...f.env.timers.values()].some(t=>t.fn.name==="poll"));
});

function heldNext(f){assert(f.env.runTimer(t=>t.fn.name==="poll"));return request(f.env,"/bridge/next");}
function originalCommand(f,remaining=18000){return {id:"owned-original-command",executionId:"a".repeat(32),leaseId:"b".repeat(32),contractVersion:2,
  script:"owned-vm-command",remainingCommandMs:remaining,leaseOwner:{panelConnectionId:f.actor.panelConnectionId,panelGeneration:f.actor.panelGeneration}};}
function pollCount(f){return f.env.requestHistory.filter(r=>r.path.startsWith("/bridge/next?")).length;}
function heartbeatCount(f){return f.env.requestHistory.filter(r=>r.path.startsWith("/bridge/heartbeat?")).length;}
function assertClosedWithoutReplay(f,before){
  assert.equal(f.env.api.state().running,false);
  assert(![...f.env.timers.values()].some(t=>t.fn.name==="poll"));
  let closed=null;f.env.planOps.connect(error=>{closed=error;});assert.equal(closed.code,"owned_transport_reconciliation_required");
  f.env.planOps.runLastPlan(true,false,error=>{closed=error;},{prepare:true,strict:true,pins:f.pins});assert.equal(closed.code,"owned_transport_reconciliation_required");
  assert.equal(f.env.requestHistory.length,before,"Closed original transport neither reconnects nor adopts");
}

test("actual command submission and result ACK alone release the next original poll",()=>{
  const f=fixture(true,true),sessionTimer=[...f.env.timers.entries()].find(([,t])=>t.fn.name==="ownedSessionDeadline"),before=pollCount(f);
  heldNext(f).respond(200,{ok:true,command:originalCommand(f)});
  assert.equal(pollCount(f),before+1);assert.equal(f.env.window.__ownedVmCommandDone,undefined);
  assert(f.env.runTimer(t=>t.fn.name==="poll"));assert.equal(heartbeatCount(f),0,"Delivered but unsubmitted command has no heartbeat");
  request(f.env,"/bridge/submitted").respond(200,{ok:true});assert.equal(typeof f.env.window.__ownedVmCommandDone,"function");
  f.env.window.__ownedVmCommandDone('{"ok":true}');const result=request(f.env,"/bridge/result");
  assert(f.env.runTimer(t=>t.fn.name==="poll"));assert.equal(pollCount(f),before+1,"No next while actual result ACK is pending");
  result.respond(200,{ok:true});assert.equal(f.env.timers.get(sessionTimer[0]),sessionTimer[1],"Session timer was not replaced or extended");
  const next=heldNext(f);assert.equal(pollCount(f),before+2);assert.equal(next.completed,false);
  assert.equal(heartbeatCount(f),0,"Idle manual/AME wait sends no heartbeat");
});

for(const kind of ["error","timeout","idle-null"])test("original held "+kind+" is sticky CLOSED with no retry/adoption",()=>{
  const f=fixture(),held=heldNext(f),before=f.env.requestHistory.length;
  if(kind==="idle-null")held.respond(200,{ok:true,command:null,ownedPlanPreparation:{...marker,remainingSessionMs:600000}});else held[kind]();
  assertClosedWithoutReplay(f,before);
});

test("original session deadline cancels exactly its held read without renewal or replay",()=>{
  const f=fixture(),held=heldNext(f),before=f.env.requestHistory.length;let aborted=0;
  held.xhr.abort=()=>{aborted++;held.error("Original session deadline");};
  assert(f.env.runTimer(t=>t.fn.name==="ownedSessionDeadline"));assert.equal(aborted,1);assertClosedWithoutReplay(f,before);
});

test("missing original initial deadline closes the connect callback without entering a held loop",()=>{
  const env=createPanelEnvironment(source);passiveDrain(env);let outcome=null;env.planOps.connect(error=>{outcome=error;});
  const next=request(env,"/bridge/next");next.respond(200,{ok:true,command:null,ownedPlanPreparation:marker});
  assert.equal(outcome.code,"owned_original_session_deadline_invalid");assert.equal(env.api.state().running,false);
  assert(![...env.timers.values()].some(t=>t.fn.name==="poll"));
});

test("missing actual command deadline closes before submission or eval",()=>{
  const f=fixture(true,true),command=originalCommand(f);delete command.remainingCommandMs;
  const held=heldNext(f),before=f.env.requestHistory.length;held.respond(200,{ok:true,command});
  assertClosedWithoutReplay(f,before);assert.equal(f.env.window.__ownedVmCommandDone,undefined);
});

for(const kind of ["url","token","chat-actor","lifecycle"])test("held original "+kind+" drift cannot submit returned command or restart",()=>{
  const f=fixture(true,true);if(kind==="chat-actor")f.prepared();
  const held=heldNext(f),before=f.env.requestHistory.length;
  if(kind==="url")f.env.window.__ownedVmSetConnection("http://127.0.0.1:9999",null);
  if(kind==="token")f.env.window.__ownedVmSetConnection(null,"other-private-token");
  if(kind==="chat-actor")f.env.elements.get("newChatButton").click();
  if(kind==="lifecycle")f.env.planOps.disconnect();
  held.respond(200,{ok:true,command:originalCommand(f)});assertClosedWithoutReplay(f,before);
  assert(!f.env.requestHistory.slice(before).some(r=>r.path==="/bridge/submitted"));
});

test("actor drift closes pending held transport before a new preparation can send",()=>{
  const f=fixture(true,true);heldNext(f);f.env.window.__ownedVmSetConnection(null,"drifted-private-token");
  const before=f.env.requestHistory.length;let outcome=null;f.env.planOps.runLastPlan(true,false,error=>{outcome=error;},{prepare:true,strict:true,pins:f.pins});
  assert.equal(outcome.code,"owned_transport_reconciliation_required");assertClosedWithoutReplay(f,before);
});

test("heartbeat is bounded to submitted eval; result ACK waits for its existing heartbeat receipt",()=>{
  const f=fixture(true,true),start=Date.now();f.env.setFrozenNow(start);
  heldNext(f).respond(200,{ok:true,command:originalCommand(f,16000)});request(f.env,"/bridge/submitted").respond(200,{ok:true});
  f.env.setFrozenNow(start+5001);assert(f.env.runTimer(t=>t.fn.name==="poll"));const heartbeat=request(f.env,"/bridge/heartbeat");
  f.env.setFrozenNow(start+10002);assert(f.env.runTimer(t=>t.fn.name==="poll"));assert.equal(heartbeatCount(f),1,"One outstanding heartbeat only");
  const count=pollCount(f);f.env.window.__ownedVmCommandDone('{"ok":true}');request(f.env,"/bridge/result").respond(200,{ok:true});
  assert(f.env.runTimer(t=>t.fn.name==="poll"));assert.equal(pollCount(f),count);assert.equal(heartbeatCount(f),1,"No new heartbeat after result ACK");
  heartbeat.respond(200,{ok:true,session:{desiredEnabled:true,connectionReady:true}});
  heldNext(f);assert.equal(pollCount(f),count+1);assert.equal(heartbeatCount(f),1);
});

test("original command deadline stops heartbeat and retains late eval without result replay",()=>{
  const f=fixture(true,true),start=Date.now();f.env.setFrozenNow(start);
  heldNext(f).respond(200,{ok:true,command:originalCommand(f,8000)});request(f.env,"/bridge/submitted").respond(200,{ok:true});
  f.env.setFrozenNow(start+5001);assert(f.env.runTimer(t=>t.fn.name==="poll"));request(f.env,"/bridge/heartbeat").respond(200,{ok:true,session:{}});
  const before=f.env.requestHistory.length;assert(f.env.runTimer(t=>t.fn.name==="ownedCommandDeadline"));
  f.env.window.__ownedVmCommandDone('{"ok":true}');assertClosedWithoutReplay(f,before);
  assert(!f.env.requestHistory.slice(before).some(r=>r.path==="/bridge/result"));
});

for(const phase of ["submitted","result"])test("unknown original "+phase+" POST is not cleared into a next request",()=>{
  const f=fixture(true,true);heldNext(f).respond(200,{ok:true,command:originalCommand(f)});
  if(phase==="result"){request(f.env,"/bridge/submitted").respond(200,{ok:true});f.env.window.__ownedVmCommandDone('{"ok":true}');}
  const before=f.env.requestHistory.length;request(f.env,"/bridge/"+phase).timeout();assertClosedWithoutReplay(f,before);
});

test("ordinary held request retains generic timeout and ordinary retry scheduling",()=>{
  const f=fixture(false),held=heldNext(f);assert.equal(held.xhr.timeout,10000);held.timeout();
  assert(f.env.api.state().running);assert(f.env.runTimer(t=>t.fn.name==="poll"));request(f.env,"/bridge/next");
});

test("ordinary adoption retains canonical refresh and actual dry-run POST",()=>{
  const f=fixture(false),p=f.prepare();const adopted=makeCurrentPlan("ordinary-adopted",4,makeActionProposal("ordinary-adopted",token));
  adopted.proposal.confirmation.sessionId=f.actor.confirmationSessionId;
  p.adopt.respond(200,{ok:true,proposal:clone(adopted.proposal),plan:clone(adopted.plan),validation:clone(adopted.validation),revision:adopted.revision});
  const publicCurrent=clone(adopted);delete publicCurrent.proposal.confirmation.confirmationToken;
  request(f.env,"/agents/plan/current").respond(200,{ok:true,current:publicCurrent});
  const run=request(f.env,"/agents/plan/run");assert.equal(run.body.dryRun,true);
  run.respond(200,{ok:true,run:{id:"ordinary-native-dry",ok:true,dryRun:true,validation:adopted.validation}});
  assert.equal(p.result().state,"completed");
  assert.deepEqual(f.env.requestHistory.slice(f.start).map(r=>r.path),["/agents/plan/current","/agents/plan/adopt","/agents/plan/current","/agents/plan/run"]);
});

console.log(JSON.stringify({ok:true,scope:"offline_full_panel_vm_only",scenarios,liveProof:false}));

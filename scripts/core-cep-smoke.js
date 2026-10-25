"use strict";
// Offline VM/DOM contract only: no browser, HTTP, native process or AE calls.
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),vm=require("node:vm");
const ROOT=path.resolve(__dirname,".."),read=n=>fs.readFileSync(path.join(ROOT,"cep-panel",n),"utf8");
const html=read("index.html"),panel=read("panel.js"),contract=require("../cep-panel/panel-action-contract");
const clone=x=>JSON.parse(JSON.stringify(x));
const allowed=["bridge.configure","bridge.connect","bridge.disconnect","panel.reload","autonomy.refresh","autonomy.set","placeholder.refresh","placeholder.accept","placeholder.release","placeholder.mapGroup","placeholder.constraints.set","plan.current","plan.prepare","plan.dryRun","plan.run","plan.reconcile"];
assert.deepEqual(contract.ACTION_CATALOG.map(x=>x.name),allowed);
for(const s of [html,panel])assert(!/chatTranscript|activeChatSessionId|agentSelect|provider\.setup|\/agents\/chat|\/agents\/hardcore|\/usage/.test(s));
function harness(options={}){
  const values=options.storage || {codexAeBridgeAutoConnect:"0",codexAeBridgeToken:"synthetic-panel-only"};
  let reads=0,writes=0,nativeCalls=0,confirmations=0;
  const storage={getItem(k){reads++;return Object.hasOwn(values,k)?values[k]:null;},setItem(k,v){writes++;values[k]=String(v);},removeItem(k){delete values[k];}};
  const elements=new Map();for(const m of html.matchAll(/\bid="([^"]+)"/g))elements.set(m[1],{value:m[1]==="bridgeUrl"?"http://127.0.0.1:3456":"",textContent:"",className:"",style:{},checked:false,disabled:false,listeners:{},attrs:{},addEventListener(t,f){(this.listeners[t] ||= []).push(f);},setAttribute(k,v){this.attrs[k]=String(v);},getAttribute(k){return this.attrs[k] || null;}});
  const requests=[],callbacks=[],timers=[];let responder=options.respond || (()=>({ok:true,settlement:null,disposition:null,certificate:null}));
  function XHR(){this.status=0;this.readyState=0;}
  XHR.prototype.open=function(method,url){this.method=method;this.url=url;};XHR.prototype.setRequestHeader=function(){};XHR.prototype.getResponseHeader=function(){return null;};
  XHR.prototype.send=function(raw){const request={method:this.method,path:new URL(this.url).pathname,body:raw?JSON.parse(raw):null};requests.push(request);callbacks.push(()=>{const result=responder(request);this.status=result?.__status===undefined?200:result.__status;this.responseText=JSON.stringify(result?.body || result);this.readyState=4;if(this.status===0)this.onerror();else this.onreadystatechange();});};
  const context={console,Date,Math,encodeURIComponent,decodeURIComponent,XMLHttpRequest:XHR,localStorage:storage,
    document:{title:"",getElementById:id=>elements.get(id)||null},
    CSInterface:function(){this.evalScript=(script,done)=>{nativeCalls++;if(options.nativeComplete)done(options.nativeComplete);};},
    setTimeout:f=>{timers.push(f);return timers.length;},clearTimeout:()=>{}};
  context.window=context;context.location={href:"file:///fixture/CEP/extensions/com.codex.aemcpbridge/index.html",search:"",replace:()=>{}};
  context.AEAgentHostStartupGuard={isAllowed:()=>options.hostAllowed!==false,snapshot:()=>({code:"host_refused"})};
  context.confirm=()=>{confirmations++;if(options.onConfirm)options.onConfirm(context.__test);return options.confirm!==false;};
  vm.createContext(context);
  if(options.hostAllowed!==false){vm.runInContext(read("panel-action-contract.js"),context);vm.runInContext(read("panel-actions.js"),context);}
  const hook=`globalThis.__test={session:m100ConfirmationSessionId,pins:function(){return currentBridgePlanPins(currentBridgePlan);},
    install:function(state,accepted){state=JSON.parse(JSON.stringify(state));running=true;badgeEl.textContent="online";panelConnectionGeneration=101;panelLifecycleEpoch=1;currentBridgePlan=state;
      lastPlanResult={plan:state.plan,planValidation:state.validation,requestId:state.proposal.requestId,m100ActionProposal:state.proposal,bridgePlanPins:currentBridgePlanPins(state)};
      lastAcceptedDryRun=null;if(accepted)rememberPlanRun({ok:true,dryRun:true,id:"synthetic-dry-run"});updatePlanControls();},
    epoch:function(){panelLifecycleEpoch++;},setState:function(v){currentBridgePlan=v;},
    run:runLastPlan,physical:physicalEvalScript,physicalIdle:physicalEvalScriptIdle,execute:executeCommand,
    snapshot:panelActionSnapshot,ui:uiPlanAction,proposal:function(){return m100ActionProposalForResult(lastPlanResult);},disconnect:disconnect,
    reconnect:function(){panelConnectionGeneration++;panelLifecycleEpoch++;lastAcceptedDryRun=null;running=true;refreshCurrentBridgePlan({fresh:true});}};`;
  vm.runInContext(panel.replace(/\}\)\(\);\s*$/,hook+"\n})();"),context);
  function flush(){let count=0;while(callbacks.length){if(++count>100)throw Error("offline callback budget");callbacks.shift()();}}
  flush();
  return {context,elements,requests,values,flush,invoke:e=>vm.runInContext("AEAgentPanelActions.invoke("+JSON.stringify(e)+")",context),setResponder:f=>{responder=f;},counts:()=>({reads,writes,nativeCalls,confirmations}),click:(id,event={isTrusted:true})=>{for(const f of elements.get(id).listeners.click || [])f(event);flush();}};
}
function proposal(h,risk="mutating",session){
  const p={protocolVersion:"m100.v1",messageType:"action_proposal",status:"awaiting_confirmation",serverCreated:true,createdBy:"ae-agent-bridge",requestId:"synthetic-request",actionId:"synthetic-action",revision:1,
    risk:{level:risk,requiresConfirmation:true},action:{kind:"ae_tool",payloadRef:"synthetic-payload",payloadHash:"sha256:"+"a".repeat(64),previewHash:"sha256:"+"b".repeat(64)},
    confirmation:{required:true,state:"pending",riskPolicyVersion:"m100-risk-v1",confirmationToken:"confirm_"+"c".repeat(48),surface:"cep-panel",proposalExpiresAt:new Date(Date.now()+600000).toISOString(),sessionId:session || h.context.__test.session()}};
  const plan={summary:"Synthetic guarded plan",targetProject:{file:"C:/fixture/project.aep"},steps:[{tool:risk==="raw_jsx"?"run_extendscript":risk==="destructive"?"delete_layer":"save_current_named_project",args:{}}]};
  return {instanceId:"synthetic-instance",revision:1,actionId:p.actionId,proposal:p,plan,validation:{ok:true,mutatingCount:1,steps:[],classification:{blocksRun:false}},state:"dry_run_passed",expiresAt:p.confirmation.proposalExpiresAt,project:{expectedFile:plan.targetProject.file}};
}
function installed(h,risk="mutating",wrongSession){
  // First install establishes the synthetic connection epoch, then issue a matching token.
  h.context.__test.install(proposal(h,risk),false);const state=proposal(h,risk,wrongSession);h.context.__test.install(state,true);
  h.setResponder(r=>r.path==="/agents/plan/current"?{ok:true,current:clone(state)}:r.path==="/agents/plan/run"?{ok:true,run:{ok:true,id:"synthetic-run",dryRun:r.body.dryRun,validation:state.validation,steps:[],outcome:{execution:{status:"completed"},mutation:{status:"applied"},verification:{status:"passed"}}}}:{ok:true,settlement:null,disposition:null,certificate:null});
  return state;
}
const hostDenied=harness({hostAllowed:false});assert.deepEqual(hostDenied.counts(),{reads:0,writes:0,nativeCalls:0,confirmations:0});
const boot=harness();assert(!boot.elements.has("chatPrompt"));assert.equal(boot.counts().nativeCalls,0);assert(boot.context.AEAgentPanelActions.catalog().every(x=>allowed.includes(x.name)));
const firstSession=boot.context.__test.session();boot.context.__test.epoch();assert.notEqual(boot.context.__test.session(),firstSession);
assert.notEqual(harness().context.__test.session(),firstSession);
for(const risk of ["mutating","destructive","raw_jsx"]){
  const h=harness(),state=installed(h,risk),pins=clone(h.context.__test.pins());assert(pins,"synthetic proposal pins");
  const denied=h.invoke({protocolVersion:contract.PROTOCOL_VERSION,requestId:"11111111-1111-4111-8111-111111111111",action:"plan.run",args:{pins,confirm:true}});
  assert.equal(denied.code,"manual_run_gesture_required");assert(!h.requests.some(r=>r.path==="/agents/plan/run"));
  h.click("runPlanButton",{isTrusted:false});assert(!h.requests.some(r=>r.path==="/agents/plan/run"));assert(h.context.__test.pins(),"pins after rejected programmatic action");assert(h.context.__test.proposal(),"local proposal after rejection");
  h.click("runPlanButton");const runs=h.requests.filter(r=>r.path==="/agents/plan/run");assert.equal(runs.length,1,risk+":"+h.elements.get("planRunStatus").textContent+":"+h.elements.get("log").textContent+":"+JSON.stringify(h.counts()));assert.equal(h.counts().confirmations,1);
  assert.equal(runs[0].body.confirmationToken,state.proposal.confirmation.confirmationToken);assert.equal(runs[0].body.confirmedBySession,h.context.__test.session());assert.equal(h.counts().nativeCalls,0);
}
const old=harness();installed(old,"mutating","old-chat-session");old.click("runPlanButton");assert(!old.requests.some(r=>r.path==="/agents/plan/run"));
const changed=harness({onConfirm:t=>t.epoch()});installed(changed);changed.click("runPlanButton");assert(!changed.requests.some(r=>r.path==="/agents/plan/run"));
const cancelled=harness({confirm:false});installed(cancelled);cancelled.click("runPlanButton");assert(!cancelled.requests.some(r=>r.path==="/agents/plan/run"));
const stale=harness();const staleState=installed(stale);stale.setResponder(r=>r.path==="/agents/plan/current"?{ok:true,current:{...clone(staleState),revision:2}}:{ok:true});stale.click("runPlanButton");assert(!stale.requests.some(r=>r.path==="/agents/plan/run"));
const noDry=harness();const noDryState=installed(noDry);noDry.context.__test.install(noDryState,false);noDry.click("runPlanButton");assert(!noDry.requests.some(r=>r.path==="/agents/plan/run"));
const adoption=harness();let adoptState=installed(adoption);delete adoptState.proposal.confirmation.confirmationToken;adoptState.proposal.confirmation.sessionId="";adoptState.state="pending";adoption.context.__test.install(adoptState,false);
adoption.setResponder(r=>{
  if(r.path==="/agents/plan/current")return {ok:true,current:clone(adoptState)};
  if(r.path==="/agents/plan/adopt"){
    assert.equal(r.body.confirmationSessionId,adoption.context.__test.session());
    adoptState={...clone(adoptState),revision:2,actionId:"synthetic-adopted",state:"pending"};adoptState.proposal.actionId=adoptState.actionId;adoptState.proposal.revision=2;adoptState.proposal.confirmation.sessionId=r.body.confirmationSessionId;adoptState.proposal.confirmation.confirmationToken="confirm_"+"d".repeat(48);
    return {ok:true,revision:2,plan:clone(adoptState.plan),validation:clone(adoptState.validation),proposal:clone(adoptState.proposal)};
  }
  if(r.path==="/agents/plan/run")return {ok:true,run:{ok:true,id:"synthetic-adopted-dry-run",dryRun:true,validation:adoptState.validation,steps:[]}};
  return {ok:true};
});
adoption.click("dryRunPlanButton");assert.equal(adoption.requests.filter(r=>r.path==="/agents/plan/adopt").length,1);assert.equal(adoption.requests.filter(r=>r.path==="/agents/plan/run"&&r.body.dryRun===true).length,1);assert(!adoption.requests.some(r=>r.path==="/agents/plan/run"&&r.body.dryRun===false));
const reconnect=harness();let reconnectState=installed(reconnect);const oldSession=reconnect.context.__test.session();
reconnect.setResponder(r=>{
  if(r.path==="/agents/plan/current")return {ok:true,current:clone(reconnectState)};
  if(r.path==="/agents/plan/adopt"){
    assert.notEqual(r.body.confirmationSessionId,oldSession);assert.equal(r.body.confirmationSessionId,reconnect.context.__test.session());
    reconnectState=clone(reconnectState);reconnectState.revision++;reconnectState.proposal.revision=reconnectState.revision;reconnectState.proposal.confirmation.sessionId=r.body.confirmationSessionId;reconnectState.proposal.confirmation.confirmationToken="confirm_"+"e".repeat(48);reconnectState.state="pending";
    return {ok:true,revision:reconnectState.revision,plan:clone(reconnectState.plan),validation:clone(reconnectState.validation),proposal:clone(reconnectState.proposal)};
  }
  if(r.path==="/agents/plan/run")return {ok:true,run:{ok:true,id:"synthetic-reconnected-dry-run",dryRun:true,validation:reconnectState.validation,steps:[]}};
  return {ok:true};
});
reconnect.context.__test.reconnect();reconnect.flush();assert(!reconnect.context.__test.proposal().confirmation.confirmationToken);reconnect.click("dryRunPlanButton");assert.equal(reconnect.requests.filter(r=>r.path==="/agents/plan/adopt").length,1);assert.equal(reconnect.requests.filter(r=>r.path==="/agents/plan/run"&&r.body.dryRun===true).length,1);reconnect.context.__test.disconnect();assert.equal(reconnect.context.__test.proposal(),null);
const latch=harness();latch.context.__test.physical("synthetic",()=>{});assert.equal(latch.counts().nativeCalls,1);assert.equal(latch.context.__test.physicalIdle(),false);latch.context.__test.physical("synthetic-again",()=>{});assert.equal(latch.counts().nativeCalls,1);
const reloaded=harness({storage:latch.values});assert.equal(reloaded.context.__test.physicalIdle(),false);reloaded.context.__test.physical("synthetic-after-reload",()=>{});assert.equal(reloaded.counts().nativeCalls,0);
const unknown=harness();const unknownState=installed(unknown);unknown.setResponder(r=>r.path==="/agents/plan/current"?{ok:true,current:clone(unknownState)}:r.path==="/agents/plan/run"?{__status:0}:{ok:true});unknown.click("runPlanButton");const before=unknown.requests.filter(r=>r.path==="/agents/plan/run").length;assert.equal(before,1);assert(unknown.context.AEAgentPanelActions.state().unresolvedActions.length);unknown.click("runPlanButton");assert.equal(unknown.requests.filter(r=>r.path==="/agents/plan/run").length,before);
unknown.context.__test.disconnect();unknown.context.__test.reconnect();unknown.flush();unknown.click("runPlanButton");assert.equal(unknown.requests.filter(r=>r.path==="/agents/plan/run").length,before);assert(unknown.context.AEAgentPanelActions.state().unresolvedActions.length);
const historicalValues={...harness().values},historicalIds=[1,2,3,4].map(n=>String(n).repeat(8)+"-1111-4111-8111-111111111111"),historicalNames=["chat.send","provider.setup","agent.hardcore","logs.get"],historicalRecords={},historicalIndex={};
historicalNames.forEach((action,i)=>{const requestId=historicalIds[i];historicalRecords[requestId]={requestId,action,state:i===0?"completed":"unknown",signature:"synthetic-legacy-"+i,effect:"provider_operation",delivery:i===0?"submitted":"unknown",replayAllowed:false};historicalIndex[requestId]={action,signature:historicalRecords[requestId].signature};});
const tombstoneId="55555555-1111-4111-8111-111111111111",tombstone={action:"chat.sessions.list",state:"completed",signature:"synthetic-legacy-tombstone"};historicalIndex[tombstoneId]={action:tombstone.action,signature:tombstone.signature};
historicalValues.codexAePanelActionReceipts=JSON.stringify({version:1,records:historicalRecords,tombstones:{[tombstoneId]:tombstone}});historicalValues.codexAePanelActionReceiptIndex=JSON.stringify(historicalIndex);
const historical=harness({storage:historicalValues});assert.equal(historical.context.AEAgentPanelActions.state().actionStorage,"ready");assert.equal(historical.context.AEAgentPanelActions.getResult(historicalIds[0]).state,"completed");assert.equal(historical.context.AEAgentPanelActions.getResult(historicalIds[1]).state,"unknown");assert.equal(historical.context.AEAgentPanelActions.getResult(tombstoneId).code,"receipt_retained_without_detail");assert(historical.context.AEAgentPanelActions.state().unresolvedActions.some(r=>r.action==="provider.setup"));
const historicalDenied=historical.invoke({protocolVersion:contract.PROTOCOL_VERSION,requestId:"66666666-1111-4111-8111-111111111111",action:"provider.setup",args:{}});assert.equal(historicalDenied.state,"rejected");assert.equal(contract.getActionDefinition("provider.setup"),null);assert.equal(contract.getStoredActionDefinition("provider.setup").historical,true);
const currentPassive=historical.invoke({protocolVersion:contract.PROTOCOL_VERSION,requestId:"77777777-1111-4111-8111-111111111111",action:"plan.current",args:{}});assert.equal(currentPassive.state,"completed");assert.equal(historical.counts().nativeCalls,0);
const unknownLegacy={...historicalValues},unknownRows=JSON.parse(unknownLegacy.codexAePanelActionReceipts),unknownIndex=JSON.parse(unknownLegacy.codexAePanelActionReceiptIndex);unknownRows.records[historicalIds[0]].action="not-a-historical-action";unknownIndex[historicalIds[0]].action="not-a-historical-action";unknownLegacy.codexAePanelActionReceipts=JSON.stringify(unknownRows);unknownLegacy.codexAePanelActionReceiptIndex=JSON.stringify(unknownIndex);assert.equal(harness({storage:unknownLegacy}).context.AEAgentPanelActions.state().actionStorage,"unavailable");
console.log(JSON.stringify({ok:true,scope:"offline VM/DOM; synthetic HTTP/native stubs",panelActions:allowed.length,protectedUiRiskLabels:["mutating/save","destructive","raw_jsx"],sessionEpoch:true,manualGesture:true,physicalLatchReload:true,unknownNoReplay:true,historicalReadOnly:true,reconnectReadoption:true,serverRawGateProven:false,liveProof:false}));

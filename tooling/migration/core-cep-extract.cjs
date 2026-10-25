"use strict";
// One-time, source-only CEP extraction. It never imports product modules.
const fs=require("fs"),path=require("path");
const acorn=require("internal/deps/acorn/acorn/dist/acorn");
const root=path.resolve(__dirname,"../..");
const file=path.join(root,"cep-panel/panel.js");
let source=fs.readFileSync(file,"utf8");
if(!source.includes('var activeChatSessionId = "";'))throw Error("original CEP extraction input required");
const parse=s=>acorn.parse(s,{ecmaVersion:"latest"});
const walk=(n,f,p)=>{if(!n||typeof n!=="object")return;if(n.type)f(n,p);for(const [k,v]of Object.entries(n)){if(["start","end","loc"].includes(k))continue;if(Array.isArray(v))v.forEach(x=>walk(x,f,n));else if(v&&typeof v==="object")walk(v,f,n);}};
const edit=(s,rows)=>rows.sort((a,b)=>b.start-a.start).reduce((v,r)=>v.slice(0,r.start)+(r.text||"")+v.slice(r.end),s);
const body=()=>parse(source).body.find(n=>n.type==="ExpressionStatement"&&n.expression.type==="CallExpression").expression.callee.body.body;
function replaceFunction(name,text){const n=body().find(n=>n.type==="FunctionDeclaration"&&n.id.name===name);if(!n)throw Error(name);source=edit(source,[{start:n.start,end:n.end,text:text}]);}
const allowed=new Set(["bridge.configure","bridge.connect","bridge.disconnect","panel.reload","autonomy.refresh","autonomy.set","placeholder.refresh","placeholder.accept","placeholder.release","placeholder.mapGroup","placeholder.constraints.set","plan.current","plan.prepare","plan.dryRun","plan.run","plan.reconcile"]);
replaceFunction("m100ConfirmationSessionId",`function m100ConfirmationSessionId() {
    // A selector for the server-issued confirmation, never authority by itself.
    // Stable during this page/connection epoch; reload/reconnect revokes old tokens.
    return panelConnectionId + ":core:" + confirmationSessionNonce + ":" + panelConnectionGeneration + ":" + panelLifecycleEpoch;
  }`);
replaceFunction("appendChatMessage",`function appendChatMessage(role,text) {
    planResultEl.textContent=window.AEAgentPanelContract.redactState({text:String(text || "")}).text;
    planResultEl.setAttribute("data-tone",role === "error" ? "blocked" : "result");
  }`);
replaceFunction("setChatBusy",`function setChatBusy(busy,label) { chatInFlight=!!busy;updateChatAvailability();if(label)setPlanRunStatus(label,""); }`);
replaceFunction("updateChatAvailability",`function updateChatAvailability() {
    var proposal=m100ActionProposalForResult(lastPlanResult),pins=currentBridgePlanPins(currentBridgePlan);
    var validation=lastPlanResult && lastPlanResult.planValidation;
    dryRunPlanButton.disabled=!running || chatInFlight || !pins || !proposal || !!currentProposalBlockReason(proposal);
    dryRunPlanButton.textContent=proposal && !proposal.confirmation.confirmationToken ? "Подготовить и проверить" : "Проверить план";
    runPlanButton.disabled=dryRunPlanButton.disabled || !validation || !validation.ok || planRunBlocksNormalRun(validation) ||
      !proposal.confirmation.confirmationToken || !lastAcceptedDryRun || !lastAcceptedDryRun.ok ||
      lastAcceptedDryRun.planKey!==currentPlanKey() || !currentBridgePlanMatchesPins(currentBridgePlan,lastAcceptedDryRun.pins);
    renderPlanReconciliationControl();
  }`);
replaceFunction("panelActionBusy",`function panelActionBusy(coveredBootstrapRead) {
    var activeNative=activeEvalScriptCommandId && !(coveredBootstrapRead && bootstrapCoveredLogicalRead(activeEvalScriptCommandId,coveredBootstrapRead));
    return !!(recoveryTransportConnecting || chatInFlight || activeNative || placeholderProtectionInFlight || planReconcileInFlight || planRunInFlightMode);
  }`);
replaceFunction("rememberPanelSecrets",`function rememberPanelSecrets() {
    var contract=window.AEAgentPanelContract;contract.rememberSecret(getToken());
    var proposal=m100ActionProposalForResult(lastPlanResult);if(proposal)contract.rememberSecret(proposal.confirmation.confirmationToken);
  }`);
replaceFunction("actionAvailability",`function actionAvailability(name,args) {
    var reasons=[],passive=name === "plan.current" && !(args && args.fresh);
    if(!passive && !hostStartupGuard.isAllowed())reasons.push(hostStartupGuard.snapshot().code);
    if(!passive && panelActionBusy())reasons.push("panel_busy");
    if(ownedPollingClosed && (name === "bridge.connect" || /^plan\\.(prepare|dryRun|run)$/.test(name)))reasons.push("owned_transport_reconciliation_required");
    if(name === "bridge.configure" && running)reasons.push("disconnect_required");
    if(/^(autonomy|placeholder|plan)\\./.test(name) && !running && name !== "plan.current" &&
      !(name === "plan.reconcile" && knownUnresolvedPlanRun(args && args.runId)))reasons.push("bridge_disconnected");
    if(/^plan\\.(prepare|dryRun|run)$/.test(name)){
      if(!currentBridgePlanPins(currentBridgePlan))reasons.push("canonical_plan_unavailable");
      var proposal=m100ActionProposalForResult(lastPlanResult);
      if(name === "plan.run" && !(proposal && proposal.confirmation.confirmationToken))reasons.push("proposal_adoption_required");
      if(name === "plan.run" && (!lastAcceptedDryRun || !lastAcceptedDryRun.ok))reasons.push("matching_dry_run_required");
    }
    if(name === "plan.reconcile" && !knownUnresolvedPlanRun(args && args.runId) &&
      (!lastPlanRunResult || !lastPlanRunResult.id || lastPlanRunResult.dryRun || !lastPlanRunResult.validation || !lastPlanRunResult.validation.mutatingCount))reasons.push("reconciliation_unavailable");
    return {available:reasons.length===0,reasonCodes:reasons};
  }`);
// Remove whole excluded properties/calls, preserving neighbouring safety branches.
let changes=[];
walk(parse(source),(n,p)=>{
  if(n.type==="VariableDeclarator"&&n.id.name==="panelActionHandlers"){
    for(const v of n.init.properties)if(!allowed.has(v.key.value))changes.push({start:v.start,end:v.end});
  }
  if(n.type==="FunctionDeclaration"&&n.id.name==="panelActionSnapshot"){
    walk(n.body,x=>{if(x.type==="ReturnStatement"&&x.argument?.type==="ObjectExpression")for(const v of x.argument.properties){
      if(["provider","chat","connector","usage"].includes(v.key.name))changes.push({start:v.start,end:v.end});
      if(v.key.name==="preferences")for(const pref of v.value.properties)if(pref.key.name!=="autoConnect")changes.push({start:pref.start,end:pref.end});
    }});
  }
  if(n.type==="ExpressionStatement"&&n.expression.type==="CallExpression"&&["appendOperationUsageReport","loadAgents","loadUsageSnapshot","stopSetupStatusPolling"].includes(n.expression.callee.name))changes.push({start:n.start,end:n.end});
  if(n.type==="ExpressionStatement"&&n.expression.type==="AssignmentExpression"&&source.slice(n.expression.left.start,n.expression.left.end).startsWith("window.__aeAgent"))changes.push({start:n.start,end:n.end});
});
// Property removal includes its separator, never a neighbouring property.
changes=changes.filter((r,i,a)=>!a.some((v,j)=>j!==i&&v.start<=r.start&&v.end>=r.end&&(v.start<r.start||v.end>r.end)));
changes=changes.map(r=>{if(source.slice(r.end).match(/^\s*,/)){const m=source.slice(r.end).match(/^\s*,/);return {...r,end:r.end+m[0].length};}return r;});
source=edit(source,changes);
// Last excluded property can leave a trailing comma, accepted by CEP's existing JS engine.
source=source.replace('var APP_NAME = "AE Agent";','var APP_NAME = "AE Agent Core";');
source=source.replace('function fail(code,message,unknown) {','function fail(code,message,unknown) {\n      if(policy.manualGesture)policy.manualGesture.alive=false;');
source=source.replace('proposal.confirmation.sessionId && proposal.confirmation.sessionId !== m100ConfirmationSessionId()','proposal.confirmation.sessionId !== m100ConfirmationSessionId()');
source=source.replace('different panel/chat session.','different panel connection session.');
source=source.replace('var runEpoch=panelLifecycleEpoch,runGeneration=panelConnectionGeneration;','if(!dryRun && !queueRun){if(!manualRunGestureCurrent(policy.manualGesture)){fail("manual_run_gesture_required","Требуется свежее ручное подтверждение текущего плана.");return;}policy.manualGesture.alive=false;}\n    var runEpoch=panelLifecycleEpoch,runGeneration=panelConnectionGeneration;');
source=source.replace('"plan.run":function(args,done,context) {runLastPlan(false,false,done,{prepare:false,strict:true,pins:args.pins,context:context});}',`"plan.run":function(args,done,context) {
      var frame=activeManualRunGesture;activeManualRunGesture=null;
      if(context.source!=="ui" || !manualRunGestureCurrent(frame) || planKeyFor(args.pins)!==planKeyFor(frame.pins)){done({rejected:true,code:"manual_run_gesture_required"});return;}
      runLastPlan(false,false,done,{prepare:false,strict:true,pins:args.pins,context:context,manualGesture:frame});
    }`);
source=source.replace('invokePanelUI(action,action === "plan.run" ? {pins:pins,confirm:true} : {pins:pins});',`if(action === "plan.run"){
      if(!event || event.isTrusted!==true || !pins || !proposal){setPlanRunStatus("Требуется ручной щелчок по текущему плану.","blocked");return;}
      var frame={alive:true,pins:JSON.parse(JSON.stringify(pins)),session:m100ConfirmationSessionId(),epoch:panelLifecycleEpoch,generation:String(panelConnectionGeneration),url:getBaseUrl(),token:getToken(),issuedAt:Date.now()};
      var preview=["Выполнить текущий план?", "Риск: "+pins.riskLevel, "Проект: "+pins.projectFile, "План v"+pins.revision+" · "+pins.actionId, JSON.stringify(lastPlanResult.plan,null,2)].join("\\n");
      if(!window.confirm(preview) || !manualRunGestureCurrent(frame)){frame.alive=false;setPlanRunStatus("Подтверждение отменено или план изменился.","blocked");return;}
      activeManualRunGesture=frame;
    }
    invokePanelUI(action,action === "plan.run" ? {pins:pins,confirm:true} : {pins:pins});`);
source=source.replace(/\bchatInFlight\b/g,"planRequestInFlight").replace(/\bupdateChatAvailability\b/g,"updatePlanControls").replace(/\bsetChatBusy\b/g,"setPlanBusy").replace(/\bappendChatMessage\b/g,"showPlanResult");
const extra=`
  var confirmationSessionNonce=actionUuid(),activeManualRunGesture=null;
  var planResultEl=document.getElementById("planResult");
  function manualRunGestureCurrent(frame){return !!(frame && frame.alive && Date.now()>=frame.issuedAt && Date.now()-frame.issuedAt<120000 && frame.epoch===panelLifecycleEpoch && frame.generation===String(panelConnectionGeneration) && frame.session===m100ConfirmationSessionId() && frame.url===getBaseUrl() && frame.token===getToken() && currentBridgePlanMatchesPins(currentBridgePlan,frame.pins));}
`;
const startBody=body(),bootstrap=startBody.find(n=>n.type==="ExpressionStatement"&&source.slice(n.start,n.end).startsWith("panelActionUI=window.AEAgentPanelActionBootstrap"));
if(!bootstrap)throw Error("bootstrap source seam missing");
let bootstrapText=source.slice(bootstrap.start,bootstrap.end).replace('passive:{"logs.get":true,"chat.sessions.list":true,"chat.transcript.get":true,','passive:{');
const initialization=`
  setAppTitle(APP_VERSION);
  urlEl.value=localStorage.getItem("codexAeBridgeUrl") || urlEl.value;
  tokenEl.value=localStorage.getItem("codexAeBridgeToken") || "";
  configuredBridgeUrl=urlEl.value;configuredPanelToken=tokenEl.value;
  renderAutonomousSession();setStatus("Отключено",false);updatePlanControls();rememberPanelSecrets();
  ${bootstrapText}
  onControl(connectButton,"click","bridge.connect");onControl(disconnectButton,"click","bridge.disconnect");onControl(reloadButton,"click","panel.reload");
  [urlEl,tokenEl].forEach(function(el){onControl(el,"change","bridge.configure",function(){return {url:urlEl.value,panelToken:tokenEl.value};});});
  onControl(autonomousSessionButton,"click","autonomy.set",function(){return {enabled:!(autonomousSessionState && autonomousSessionState.desiredEnabled)};});
  onControl(acceptPlaceholderButton,"click","placeholder.accept",function(){return {useSelectedProperties:placeholderSelectedPropertiesEl.checked};});
  onControl(releasePlaceholderButton,"click","placeholder.release",{confirm:true});
  onControl(mapPlaceholderGroupButton,"click","placeholder.mapGroup",function(){return {groupId:placeholderGroupIdEl.value};});
  onControl(applyPlaceholderConstraintsButton,"click","placeholder.constraints.set",function(){return {distinctGroups:placeholderDistinctGroupsEl.checked,disallowSourceOverlap:placeholderDisallowOverlapEl.checked};});
  onControl(refreshPlaceholderProtectionButton,"click","placeholder.refresh");
  onControl(document.getElementById("refreshPlanButton"),"click","plan.current",{fresh:true});
  dryRunPlanButton.addEventListener("click",function(){uiPlanAction(true);});
  runPlanButton.addEventListener("click",function(event){uiPlanAction(false,null,event);});
  onControl(reconcilePlanRunButton,"click","plan.reconcile",function(){return {runId:lastPlanRunResult && lastPlanRunResult.id || ""};});
  lookupProductSessionBeforeStartup();
`;
// Retain the transitive top-level declaration closure of the minimal bootstrap.
source=source.slice(0,source.lastIndexOf("})();"))+extra+"\n})();";
const declarations=new Map(),ordered=[];
for(const n of body()){
  if(n.type==="FunctionDeclaration"){declarations.set(n.id.name,n);ordered.push({name:n.id.name,text:source.slice(n.start,n.end)});}
  if(n.type==="VariableDeclaration")for(const d of n.declarations){if(d.id.type!=="Identifier")throw Error("unsupported top declaration");declarations.set(d.id.name,d);ordered.push({name:d.id.name,text:"var "+source.slice(d.start,d.end)+";"});}
}
const used=new Set();function references(text){walk(parse(text),n=>{if(n.type==="Identifier"&&declarations.has(n.name)&&!used.has(n.name)){used.add(n.name);references(ordered.find(r=>r.name===n.name).text);}});}
references(initialization);references(extra);
const retained=ordered.filter(r=>used.has(r.name)&&r.name!=="hostStartupGuard");
let output='"use strict";\n\n(function () {\n  var hostStartupGuard=window.AEAgentHostStartupGuard;\n  if(!hostStartupGuard || !hostStartupGuard.isAllowed())return;\n'+retained.map(r=>"  "+r.text).join("\n\n")+"\n"+initialization+"\n})();\n";
parse(output);fs.writeFileSync(file,output);
// Exact action allowlist: excluded names are no longer callable or advertised.
const contractFile=path.join(root,"cep-panel/panel-action-contract.js");let contract=fs.readFileSync(contractFile,"utf8");changes=[];
walk(parse(contract),(n,p)=>{if(n.type==="VariableDeclarator"&&n.id.name==="ACTION_CATALOG"){const values=n.init.elements.filter(v=>allowed.has(v.properties.find(p=>p.key.name==="name").value.value));changes.push({start:n.init.start,end:n.init.end,text:"[\n"+values.map(v=>contract.slice(v.start,v.end)).join(",\n")+"\n]"});}
if(n.type==="IfStatement"&&/chat.send|provider\\.|chat.clear|workflow.insert/.test(contract.slice(n.test.start,n.test.end)))changes.push({start:n.start,end:n.end});});
contract=edit(contract,changes);parse(contract);fs.writeFileSync(contractFile,contract);
console.log(JSON.stringify({retainedDeclarations:retained.length,sourceBytes:Buffer.byteLength(output),panelActions:allowed.size}));

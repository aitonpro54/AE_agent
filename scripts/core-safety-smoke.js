"use strict";
const assert=require("node:assert/strict"),fs=require("fs"),path=require("path"),crypto=require("crypto");
const {createScenarioFixture,HOLD}=require("./core-scenario-fixture"),{harness:panelHarness}=require("./core-cep-smoke");
const {buildRunOutcome}=require("../mcp-server/run-outcome"),{reconcilePlanRun}=require("../mcp-server/plan-run-reconciliation");
const clone=v=>JSON.parse(JSON.stringify(v));
const code=r=>r.value?.errorCode||r.value?.code;
function typed(h,extra={}){return {summary:"Bounded typed safety contract",targetProject:{file:h.projectFile},requiresCheckpoint:true,steps:[{tool:"set_layer_transform",args:{compItemIndex:1,layerIndex:1,expectedCompItemId:10,expectedLayerId:11,position:[960,540],...extra}}]};}
async function unknownTransport(){
  const h=await createScenarioFixture({allowFakeMutation:true,commandTimeoutMs:250});let held=0;
  try{
    await h.withPanel(()=>h.panelPost("/autonomy/session",{enabled:true,panelConnectionId:"core-scenario-panel",panelGeneration:"1"}));
    const p=await h.propose(typed(h,{position:[100,200]}));assert.equal((await h.dry(p)).isError,false);
    h.handler=(_command,context)=>{if(context.mutating){held++;return HOLD;}};
    const run=await h.withPanel(()=>h.call("run_ai_agent_plan",{...h.pins(p),dryRun:false}));
    assert.equal(run.isError,true);assert.equal(held,1);assert.equal(run.value.outcome.mutation.status,"unknown",JSON.stringify(run.value));assert.equal(h.model.read("writes"),0);
    const replay=await h.withPanel(()=>h.call("run_ai_agent_plan",{...h.pins(p),dryRun:false}));assert.equal(code(replay),"m100_confirmation_replayed");assert.equal(held,1);
    h.handler=null;
    const readback=await h.withPanel(()=>h.call("reconcile_plan_run",{runId:run.value.id}));assert.equal(readback.isError,false,JSON.stringify(readback.value));assert.equal(readback.value.replayAllowed,false);assert.equal(readback.value.steps[0].mutationStatus,"unknown");assert.equal(held,1);assert.equal(h.model.read("writes"),0);
    return {submitted:1,executedInVM:0,outcome:"unknown",replay:"m100_confirmation_replayed",freshReconcile:"unknown/no-replay"};
  }finally{await h.close();}
}
async function main(){const h=await createScenarioFixture();let checks=0;try{
  const p=await h.propose(typed(h));
  for(const [key,expected]of [["payloadHash","m100_payload_hash_mismatch"],["previewHash","m100_preview_hash_mismatch"]]){const r=await h.dry(p,{[key]:"sha256:"+"f".repeat(64)});assert.equal(code(r),expected);checks++;}
  const revision=await h.withPanel(()=>h.panelPost("/agents/plan/adopt",{actionId:p.actionId,revision:p.revision+1,panelConnectionId:"core-scenario-panel",panelGeneration:"1",confirmationSessionId:"stale-session"}));assert.equal(revision.body.code||revision.body.diagnostic?.code,"plan_superseded");checks++;
  await h.propose(typed(h,{opacity:75}));assert.equal(code(await h.dry(p)),"plan_superseded");checks++;
  // Native identity checks execute the actual generated setter, not a mirror
  // of its conditions. The existing preparation API captures without dispatch.
  const daemon=require("../mcp-server/bridge-daemon");
  for(const ids of [{expectedCompItemId:999,expectedLayerId:11},{expectedCompItemId:10,expectedLayerId:999}]){const before=h.model.read("writes"),undo=h.model.read("undo.length");const script=await daemon.prepareToolScript("set_layer_transform",{compItemIndex:1,layerIndex:1,position:[1,2],...ids},{});const r=h.model.execute(script.script);assert.equal(r.ok,false);assert.match(r.error,/identity|changed|mismatch/i);assert.equal(h.model.read("writes"),before);assert.equal(h.model.read("undo.length"),undo);checks++;}
  const good=await daemon.prepareToolScript("set_layer_transform",{compItemIndex:1,layerIndex:1,expectedCompItemId:10,expectedLayerId:11,position:[960,540]},{});assert.equal(h.model.execute(good.script).ok,true);assert.equal(h.model.read("writes"),1);assert.equal(h.model.read("undo.length"),2);h.freshModel();checks++;
  const accept=await h.withPanel(()=>h.panelPost("/placeholder/protection",{action:"accept"}));assert.equal(accept.status,200,JSON.stringify(accept.body));
  const forged=await h.withPanel(()=>h.panelPost("/placeholder/protection",{action:"accept",snapshot:{},allowProtectedChanges:true}));assert.equal(forged.body.code,"client_acceptance_snapshot_forbidden");
  const wrongRole=await h.fixture.request({path:"/placeholder/protection",method:"POST",token:h.fixture.automationToken,body:{action:"release",confirm:true}});assert.equal(wrongRole.status,403);assert.equal(wrongRole.body.code,"placeholder_panel_role_required");checks+=2;
  const conflict=await h.withPanel(()=>h.call("propose_ai_agent_plan",{plan:typed(h,{scale:[95,95]})}));assert.equal(conflict.isError,true);assert.match(JSON.stringify(conflict.value),/protected_placeholder_conflict/);checks++;
  const protectedProposal=await h.propose(typed(h));h.model.change('target.property("ADBE Transform Group").property("ADBE Position").value=[100,100];');const drift=await h.dry(protectedProposal);assert.equal(code(drift),"accepted_placeholder_drift");assert.equal(h.counts().mutations,0);checks++;
  h.model.change('target.property("ADBE Transform Group").property("ADBE Position").value=[960,540];');
  assert.equal((await h.withPanel(()=>h.panelPost("/placeholder/protection",{action:"release"}))).status,200);
  const enabled=await h.withPanel(()=>h.panelPost("/autonomy/session",{enabled:true,panelConnectionId:"core-scenario-panel",panelGeneration:"1"}));assert.equal(enabled.body.session.active,true);
  for(const [tool,args,risk]of [
    ["run_extendscript",{script:"return {synthetic:true};"},"raw_jsx"],
    ["delete_layer",{compItemIndex:1,layerIndex:1,expectedCompItemId:10,expectedLayerId:11,expectedLayerName:"Selected placeholder"},"destructive"],
    ["save_current_named_project",{expectedProjectFile:h.projectFile,expectedSavedFileSha25664:crypto.createHash("sha256").update(fs.readFileSync(h.projectFile)).digest("hex"),checkpointLabel:"isolated-save-gate"},"destructive"]
  ]){
    const plan={summary:"Protected scope remains manual",targetProject:{file:h.projectFile},requiresCheckpoint:true,steps:[{tool,args}]};
    const pp=await h.propose(plan);assert.equal(pp.risk.level,risk);const dry=await h.dry(pp);assert.equal(dry.isError,false,JSON.stringify(dry.value));assert.equal(dry.value.executedCount,0);
    const blocked=await h.withPanel(()=>h.call("run_ai_agent_plan",{...h.pins(pp),dryRun:false}));assert.equal(code(blocked),"autonomous_session_scope_blocked",JSON.stringify(blocked.value));checks++;
  }
  await h.withPanel(()=>h.panelPost("/autonomy/session",{enabled:false,panelConnectionId:"core-scenario-panel",panelGeneration:"1"}));
  // Actual server raw validation and receipt feed the synthetic CEP contract.
  const cep=panelHarness();const rawPlan={summary:"Realistic protected raw dry-run contract",targetProject:{file:h.projectFile},requiresCheckpoint:true,steps:[{tool:"run_extendscript",args:{script:"return {synthetic:true};"}}]};
  const rawValidation=await h.call("validate_ai_agent_plan",{plan:rawPlan,repairPlan:false});assert.equal(rawValidation.value.classification.blocksRun,true);assert.equal(rawValidation.value.classification.rawExtendscriptStepCount,1);assert.equal(rawValidation.value.steps.length,1);
  const rawProposal=await h.propose(rawPlan),initial=(await h.call("get_current_ai_agent_plan")).value.current;cep.context.__test.install(initial,false);
  const adopted=await h.withPanel(()=>h.panelPost("/agents/plan/adopt",{actionId:rawProposal.actionId,revision:rawProposal.revision,panelConnectionId:"core-scenario-panel",panelGeneration:"1",confirmationSessionId:cep.context.__test.session()}));assert.equal(adopted.status,200,JSON.stringify(adopted.body));
  const manual=adopted.body.proposal,dry=await h.dry(manual);assert.equal(dry.isError,false,JSON.stringify(dry.value));assert.equal(dry.value.safety.rawExtendscriptGate.status,"dry-run-approved");assert.equal(dry.value.safety.rawExtendscriptGate.dryRunId,dry.value.id);
  const state=(await h.call("get_current_ai_agent_plan")).value.current;state.proposal=manual;state.validation=rawValidation.value;cep.context.__test.install(state,dry.value);
  cep.setResponder(r=>r.path==="/agents/plan/current"?{ok:true,current:clone(state)}:r.path==="/agents/plan/run"?{__status:400,body:{ok:false,code:"fixture_does_not_execute_raw"}}:{ok:true});
  cep.click("runPlanButton");const sent=cep.requests.filter(r=>r.path==="/agents/plan/run");assert.equal(sent.length,1);assert.equal(sent[0].body.allowRawExtendscript,true);assert.equal(sent[0].body.rawExtendscriptDryRunId,dry.value.id);assert.equal(cep.counts().nativeCalls,0);
  const mismatch=await h.withPanel(()=>h.panelPost("/agents/plan/run",{...sent[0].body,rawExtendscriptDryRunId:"wrong-dry-run-id"}));assert.equal(mismatch.body.run.safety.status,"blocked_raw_extendscript_gate");assert.equal(mismatch.body.run.executedCount,0);assert.match(mismatch.body.run.error,/successful dry run.*same current plan/i);
  // Positive matching gate stops at explicit confirm:false, before execution.
  const matching=await h.withPanel(()=>h.panelPost("/agents/plan/run",{...sent[0].body,confirm:false}));assert.equal(matching.body.run.safety.rawExtendscriptGate.status,"approved");assert.equal(matching.body.run.safety.rawExtendscriptGate.dryRunId,dry.value.id);assert.equal(matching.body.run.executedCount,0);assert.match(matching.body.run.error,/confirm:true/);checks+=4;
  // Durable outcome/reconciliation checks use the production pure modules.
  const args={compItemIndex:1,layerIndex:1,expectedCompItemId:10,expectedLayerId:11,position:[100,200]},step={index:1,tool:"set_layer_transform",args,mutating:true,status:"failed",errorCode:"command_timeout",commands:[{id:"unknown-command",role:"mutation",state:"timed_out",timedOutFrom:"submitted",submittedAt:"synthetic"}]};
  const record={schema:"ae-agent-plan-run-record.v1",runId:"synthetic-unknown",project:{file:h.projectFile},plan:{steps:[{tool:step.tool,args}]},run:{steps:[step],errorCode:"command_timeout",error:"original submitted timeout"}};
  const outcome=buildRunOutcome(record.run,record.plan);assert.equal(outcome.mutation.status,"unknown");assert.equal(outcome.execution.originalError.message,"original submitted timeout");
  const projectReads=[{tool:"get_project_info",status:"completed",result:{file:h.projectFile}},{tool:"get_project_info",status:"completed",result:{project:{file:h.projectFile}}}];
  for(const [transform,status]of [[{position:[100,200]},"applied"],[{},"unknown"]]){const read={tool:"get_layer_details",status:"completed",args:{compItemId:10,layerId:11},result:{comp:{itemId:10},layer:{id:11},transform}};const reconciled=reconcilePlanRun({record,freshReadSteps:[...projectReads,read],project:{file:h.projectFile}});assert.equal(reconciled.steps[0].mutationStatus,status);assert.equal(reconciled.replayAllowed,false);assert.equal(reconciled.originalError.message,"original submitted timeout");checks++;}
  const after=(await h.call("get_bridge_status")).value;assert.equal(after.pendingCommands,0);assert.equal(after.inflightCommands.length,0);assert.equal(h.counts().mutations,0);
  await h.close();const submittedUnknown=await unknownTransport();checks+=3;
  console.log(JSON.stringify({ok:true,checks,proof:"isolated public MCP/protected panel HTTP + realistic CEP VM raw contract + production reconciliation",rawGate:{classificationBlocks:true,actualServerDryRun:true,cepMatchingId:true,mismatchedId:"rejected",matchingId:"approved-but-not-executed"},noReplay:true,submittedUnknown,counts:h.counts(),liveAE:false,actualSave:false,ameChecks:0}));
}finally{await h.close();}}
main().catch(e=>{console.error(e.stack);process.exitCode=1;});

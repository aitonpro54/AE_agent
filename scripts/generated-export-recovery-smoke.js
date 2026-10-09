"use strict";
// Pure/isolated files only. No live AE, CEP, CDP, provider or production daemon.
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),os=require("node:os"),crypto=require("node:crypto");
const recovery=require("../mcp-server/generated-export-recovery"),evidence=require("../mcp-server/review-evidence"),records=require("../mcp-server/plan-run-records");
const {normalizeProject}=require("../mcp-server/proposal-state"),{png}=require("./placeholder-visual-fixture");
const copy=x=>JSON.parse(JSON.stringify(x));
function makeFixture(){
  const runId=crypto.randomUUID(),requestId=crypto.randomUUID(),file="C:/Synthetic/Protected.aep",now=Date.now()-2000;
  const at=n=>new Date(now+n).toISOString(),args={compItemIndex:1,expectedCompItemId:10,expectedCompName:"Root",time:1,outputFileName:"recovery.png",resolutionFactor:[1,1],allowOverwrite:false,deleteAfterReadBack:false,verifyAfter:true,idempotencyKey:"synthetic-export",idempotencyScope:"comp-visual-review"};
  const steps=[{tool:"get_project_info",args:{}},{tool:"save_comp_frame_png",args},{tool:"save_comp_frame_png",args:{...args,outputFileName:"not-started.png"}},{tool:"get_comp_details",args:{compItemId:10,includeLayers:false}},{tool:"get_project_info",args:{}}];
  const plan={summary:"Synthetic bounded PNG review",targetProject:{file},steps},p={schema:"ae-agent-run-provenance.v1",actionId:"act_synthetic_png",proposalRevision:2,payloadHash:"sha256:"+"a".repeat(64),planSha256:evidence.sha256(plan),projectId:evidence.sha256(normalizeProject(file)),projectRevision:null,projectRevisionReason:"in_memory_revision_not_observed",runtime:{schema:"ae-agent-runtime-identity.v1",gitCommit:"synthetic-original"}};
  const project={file,revision:7},comp={itemId:10,name:"Root",width:2,height:2,frameRate:30,duration:5,time:2,resolutionFactor:[4,4]};
  function command(role,result){return {id:crypto.randomUUID(),role,executionId:runId,leaseId:crypto.randomUUID(),leaseOwner:{panelConnectionId:"synthetic-panel-connection",panelGeneration:"synthetic-generation"},state:"completed",lifecycleState:"completed",history:["queued","leased","submitted","completed"],ok:true,error:null,errorCode:null,timedOutFrom:null,neverSubmitted:false,createdAt:at(100),leasedAt:at(110),submittedAt:at(120),completedAt:at(130),result};}
  const native={comp:{...comp},frame:{time:1,frameNumber:30},resolutionFactor:{before:[4,4],applied:[1,1],after:[4,4],restored:true},postVerification:{outputFileExists:false,resolutionFactorRestored:true}};
  const probe=command("mutation",{id:10,name:"Root",frameRate:30,duration:5,time:2}),exportCommand=command("mutation",native);
  Object.assign(exportCommand,{createdAt:at(150),leasedAt:at(160),submittedAt:at(170),completedAt:at(180)});
  const error="Generated PNG output verification failed: timeout.";
  const run={id:runId,provenance:p,dryRun:false,confirm:true,allowMutations:true,startedAt:at(0),finishedAt:at(1000),ok:false,executedCount:1,skippedCount:0,failedCount:1,error,
    validation:{ok:true,mutatingCount:2,steps:steps.map((s,i)=>({index:i+1,tool:s.tool,valid:true,safeArgs:copy(s.args)}))},safety:{editSessionFinished:true},editSessionFinished:{status:"finished"},m100Action:{actionId:p.actionId,payloadHash:p.payloadHash},
    outcome:{execution:{status:"failed"},mutation:{status:"unknown"},verification:{status:"pending"}},steps:[{index:1,tool:"get_project_info",args:{},status:"completed",isError:false,result:project},
      {index:2,tool:"save_comp_frame_png",args:copy(args),status:"failed",isError:true,error,mutationResultIsError:true,mutationResult:error,commands:[command("readback",project),probe,exportCommand]}]};
  const record={schema:"ae-agent-plan-run-record.v1",runId,createdAt:at(0),plan,project:{file},run};
  const binding={panelInstanceId:"synthetic-panel",panelLifecycleEpoch:1,panelGeneration:"synthetic-generation"};
  const remote={protocolVersion:"ae-agent.cep-panel-actions.v1",requestId,action:"plan.run",state:"unknown",phase:"outcome_unresolved",delivery:"delivered",replayAllowed:false,panelInstanceId:binding.panelInstanceId,epoch:binding.panelLifecycleEpoch,generation:binding.panelGeneration,runId,result:{run:copy(run),runId}};
  const local={...copy(remote),signature:"b".repeat(64),binding};
  const freshReadSteps=[{readId:crypto.randomUUID(),tool:"get_project_info",args:{},status:"completed",result:copy(project)},
    {readId:crypto.randomUUID(),tool:"get_comp_details",args:{compItemId:10,includeLayers:false},status:"completed",result:copy(comp)},
    {readId:crypto.randomUUID(),tool:"get_project_info",args:{},status:"completed",result:copy(project)}];
  return {record,local,remote,freshReadSteps,commandStates:[],busy:{pendingCommands:0,inflightCommands:[],activeEditSession:null},runtimeIdentity:{gitCommit:"synthetic-verifier"}};
}
async function main(){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),"generated-recovery-")),exportRoot=path.join(root,"generated-exports");fs.mkdirSync(exportRoot);
  let checked=0;const fixture=()=>({...makeFixture(),exportRoot});
  async function reject(change,pattern){const f=fixture();change(f);await assert.rejects(()=>recovery.adjudicate(f),pattern);checked++;}
  try{
    const f=fixture(),missing=await recovery.adjudicate(f);
    assert.equal(missing.receipt.terminal,"failed");assert.equal(missing.receipt.reasonCode,"generated_png_missing_after_native_terminal");assert.equal(missing.receipt.steps[0].artifact.status,"missing");assert.deepEqual(missing.receipt.notStartedStepIndices,[3]);assert.equal(missing.receipt.artisticAccepted,false);assert.equal(f.record.run.outcome.mutation.status,"unknown");
    records.writeRecord(root,f.record);recovery.writeReceipt(root,missing);assert.deepEqual(recovery.readReceipt(root,f.record.runId,f.local.requestId),missing);
    recovery.validateStoredBinding(missing,records.readRecord(root,f.record.runId,{throwOnError:true}),f.local);assert.deepEqual(recovery.writeReceipt(root,missing),missing);checked+=4;
    fs.writeFileSync(path.join(exportRoot,"recovery.png"),png(2,2));const valid=await recovery.adjudicate(fixture());assert.equal(valid.receipt.terminal,"completed");assert.equal(valid.receipt.steps[0].artifact.status,"verified");assert.match(valid.receipt.steps[0].artifact.sha256,/^[a-f0-9]{64}$/);checked++;
    for(const bytes of [Buffer.from("partial"),Buffer.from(png(2,2))]){if(bytes.length>10)bytes[bytes.length-1]^=1;fs.writeFileSync(path.join(exportRoot,"recovery.png"),bytes);const bad=await recovery.adjudicate(fixture());assert.equal(bad.receipt.terminal,"failed");assert.equal(bad.receipt.steps[0].artifact.status,"invalid");checked++;}
    fs.unlinkSync(path.join(exportRoot,"recovery.png"));
    await reject(f=>f.local.requestId=crypto.randomUUID(),/original_receipt/);
    await reject(f=>f.remote.runId=crypto.randomUUID(),/original_receipt/);
    await reject(f=>f.local.binding.panelGeneration="foreign",/original_receipt/);
    await reject(f=>f.record.run.provenance.planSha256="c".repeat(64),/not_final_or_bound/);
    await reject(f=>delete f.record.run.finishedAt,/not_final_or_bound/);
    await reject(f=>f.record.run.steps[1].args.time=2,/step_binding/);
    await reject(f=>f.record.run.steps[1].commands[2].executionId=crypto.randomUUID(),/native_terminal/);
    await reject(f=>f.record.run.steps[1].commands[2].state="submitted",/native_terminal/);
    await reject(f=>f.record.run.steps[1].commands[2].ok=false,/native_terminal/);
    await reject(f=>f.record.run.steps[1].commands[2].result.resolutionFactor.after=[1,1],/restore_or_frame/);
    await reject(f=>f.record.run.steps[1].commands.push(copy(f.record.run.steps[1].commands[2])),/native_terminal/);
    await reject(f=>f.freshReadSteps[2].result.revision++,/project_unstable/);
    await reject(f=>f.freshReadSteps[1].result.resolutionFactor=[1,1],/comp_restore/);
    await reject(f=>f.busy.inflightCommands=[{id:"foreign"}],/writer_not_idle/);
    await reject(f=>f.commandStates=[{...f.record.run.steps[1].commands[2],state:"submitted"}],/live_command_conflict/);
    await reject(f=>f.commandStates=[{executionId:f.record.runId,id:crypto.randomUUID()}],/unaccounted_dispatched/);
    for(const tool of ["execute_extendscript","create_comp","import_file","save_project","render_one_title_variant"]){await reject(f=>{f.record.plan.steps[2].tool=tool;f.record.run.provenance.planSha256=evidence.sha256(f.record.plan);},/plan_unsupported/);}
    for(const field of ["reviewOwner","reviewItemId","terminal","admissionGuardReleased"]){await reject(f=>{f.record.plan.steps[2].args[field]=true;f.record.run.provenance.planSha256=evidence.sha256(f.record.plan);},/export_unsupported/);}
    await reject(f=>{f.record.plan.steps[2].args.outputFileName="../escape.png";f.record.run.provenance.planSha256=evidence.sha256(f.record.plan);},/filename/);
    const saved=path.join(root,"evidence","plan-run-recoveries",f.record.runId,f.local.requestId+".json");fs.writeFileSync(saved,JSON.stringify({...missing,sha256:"0".repeat(64)}));assert.throws(()=>recovery.readReceipt(root,f.record.runId,f.local.requestId),/envelope_invalid/);checked++;
    const rename=fs.renameSync;fs.renameSync=()=>{throw new Error("synthetic atomic failure");};try{assert.throws(()=>recovery.writeReceipt(root,valid),/synthetic atomic failure/);}finally{fs.renameSync=rename;}assert.equal(recovery.readReceipt(root,valid.receipt.runId,valid.receipt.originalRequestId),null);checked++;
    console.log(`PASS: ${checked} generated PNG recovery pure cases; absent=terminal failed, present=verified, original history unchanged, restart/durability/foreign/unknown/restore/raw/path/client counterexamples; AE0.`);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
}
module.exports={makeFixture};if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});

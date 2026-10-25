"use strict";

// Terminal evidence closes one admission uncertainty; it never authorizes replay.
const fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto");
const records=require("./plan-run-records"),evidence=require("./review-evidence");
const {normalizeProject}=require("./proposal-state"),{executionArgsMatch}=require("./montage-run-bindings");
const safety=require("./generated-safety-contracts"),png=require("./generated-png-proof");
const SCHEMA="ae-agent-generated-export-recovery.v1",ENVELOPE="ae-agent-generated-export-recovery-envelope.v1";
const SHA=/^[a-f0-9]{64}$/,UUID=records.ID,LIMIT=256*1024;
const hash=value=>records.digest(JSON.stringify(value)),equal=(a,b)=>evidence.canonical(a)===evidence.canonical(b);
const fail=code=>{throw Object.assign(new Error(code),{code});};
const positive=n=>Number.isSafeInteger(n)&&n>0,when=s=>typeof s==="string"&&Number.isFinite(Date.parse(s));
const pair=x=>Array.isArray(x)&&x.length===2&&x.every(positive);
const READS=new Set(["get_project_info","get_comp_details"]);
function bindingOf(row){return row && {panelInstanceId:row.panelInstanceId,panelLifecycleEpoch:row.epoch,panelGeneration:row.generation};}
function provenanceMatches(p,r){return !!p && ["actionId","proposalRevision","payloadHash","planSha256","projectId"].every(k=>p[k]===r[k]);}
function exportArgs(a){
  const allowed=["compItemIndex","compName","expectedCompItemId","expectedCompName","time","outputFileName","resolutionFactor","allowOverwrite","deleteAfterReadBack","verifyAfter","idempotencyKey","idempotencyScope"];
  if(!a || Object.keys(a).some(k=>!allowed.includes(k)) || !positive(a.expectedCompItemId) || typeof a.expectedCompName!=="string" || !a.expectedCompName ||
    !Number.isFinite(a.time) || a.time<0 || !equal(a.resolutionFactor,[1,1]) || a.allowOverwrite!==false || a.deleteAfterReadBack!==false || a.verifyAfter!==true ||
    typeof a.outputFileName!=="string")fail("recovery_export_unsupported");
  safety.resolveGeneratedFile({root:path.resolve("generated-exports"),requestedName:a.outputFileName,allowedExtensions:[".png"],label:"outputFileName"});
}
function inspectRecord(record){
  const run=record?.run,p=run?.provenance;
  if(record?.schema!=="ae-agent-plan-run-record.v1" || !UUID.test(record.runId || "") || run?.id!==record.runId || run.dryRun!==false || !when(run.startedAt) || !when(run.finishedAt) || Date.parse(run.finishedAt)<Date.parse(run.startedAt) ||
    run.confirm!==true || run.allowMutations!==true || typeof run.ok!=="boolean" || run.outcome?.execution?.status!==(run.ok?"completed":"failed") || run.validation?.ok!==true || !Array.isArray(record.plan?.steps) || !record.plan.steps.length || record.plan.steps.length>50 || !Array.isArray(run.steps) || !run.steps.length || run.steps.length>record.plan.steps.length ||
    p?.schema!=="ae-agent-run-provenance.v1" || !p.actionId || !positive(p.proposalRevision) || !/^sha256:[a-f0-9]{64}$/.test(p.payloadHash || "") || p.planSha256!==evidence.sha256(record.plan) ||
    p.projectId!==evidence.sha256(normalizeProject(record.project?.file)) || normalizeProject(record.plan.targetProject?.file)!==normalizeProject(record.project?.file) ||
    (p.projectRevision===null ? p.projectRevisionReason!=="in_memory_revision_not_observed" : !Number.isSafeInteger(p.projectRevision)) ||
    run.m100Action?.actionId!==p.actionId || run.m100Action?.payloadHash!==p.payloadHash || run.safety?.editSessionFinished!==true || run.editSessionFinished?.status!=="finished")fail("recovery_run_not_final_or_bound");
  for(const step of record.plan.steps){
    if(step.tool==="save_comp_frame_png")exportArgs(step.args);
    else if(!READS.has(step.tool) || !step.args || Object.keys(step.args).some(k=>!(step.tool==="get_project_info" ? [] : ["compItemId","includeLayers"]).includes(k)))fail("recovery_plan_unsupported");
  }
  const exports=[],ids=new Set();
  for(let i=0;i<run.steps.length;i++){
    const step=run.steps[i],planned=record.plan.steps[i],validation=run.validation.steps?.filter(v=>v.index===i+1);
    if(step.index!==i+1 || step.tool!==planned.tool || !executionArgsMatch(planned,step,run.validation) || validation?.length!==1 || validation[0].valid!==true || !equal(validation[0].safeArgs,step.args))fail("recovery_step_binding_invalid");
    if(step.tool!=="save_comp_frame_png"){if(step.status!=="completed" || step.isError===true || (step.commands || []).some(c=>c.role==="mutation" || c.state!=="completed" || c.lifecycleState!=="completed" || c.ok!==true))fail("recovery_read_unresolved");continue;}
    const failed=step.status==="failed" && step.isError===true && step.mutationResultIsError===true && /^Generated PNG output verification failed: /.test(step.error || "");
    if(step.status!=="completed" && !failed || failed && (i!==run.steps.length-1 || run.ok!==false || run.failedCount!==1 || run.error!==step.error))fail("recovery_fail_stop_unproven");
    const commands=step.commands;
    if(!Array.isArray(commands) || !commands.length || commands.length>4)fail("recovery_commands_missing");
    for(const c of commands){
      if(!UUID.test(c.id || "") || ids.has(c.id) || c.executionId!==run.id || !UUID.test(c.leaseId || "") || !c.leaseOwner?.panelConnectionId || !c.leaseOwner?.panelGeneration ||
        c.state!=="completed" || c.lifecycleState!=="completed" || c.ok!==true || c.error || c.errorCode || c.timedOutFrom || c.neverSubmitted!==false ||
        !equal(c.history,["queued","leased","submitted","completed"]) || ![c.createdAt,c.leasedAt,c.submittedAt,c.completedAt].every(when) ||
        !(Date.parse(c.createdAt)<=Date.parse(c.leasedAt) && Date.parse(c.leasedAt)<=Date.parse(c.submittedAt) && Date.parse(c.submittedAt)<=Date.parse(c.completedAt) && Date.parse(c.completedAt)<=Date.parse(run.finishedAt)))fail("recovery_native_terminal_unproven");
      ids.add(c.id);
    }
    const native=commands.filter(c=>c.role==="mutation" && c.result?.comp && c.result?.frame && c.result?.resolutionFactor && c.result?.postVerification);
    if(native.length!==1)fail("recovery_native_receipt_ambiguous");
    const c=native[0],n=c.result,a=step.args,res=n.resolutionFactor;
    if(n.comp.itemId!==a.expectedCompItemId || n.comp.name!==a.expectedCompName || !positive(n.comp.width) || !positive(n.comp.height) || !Number.isFinite(n.comp.frameRate) || n.comp.frameRate<=0 ||
      a.time>=n.comp.duration || Math.abs(a.time*n.comp.frameRate-Math.round(a.time*n.comp.frameRate))>1e-6 || n.frame.time!==a.time || n.frame.frameNumber!==Math.round(a.time*n.comp.frameRate) ||
      !pair(res.before) || !equal(res.applied,[1,1]) || !equal(res.before,res.after) || res.restored!==true || n.postVerification.resolutionFactorRestored!==true || typeof n.postVerification.outputFileExists!=="boolean")fail("recovery_native_restore_or_frame_invalid");
    const others=commands.filter(x=>x.role==="mutation" && x!==c);
    if(others.length!==1 || others[0].result?.id!==a.expectedCompItemId || others[0].result?.name!==a.expectedCompName || others[0].result?.frameRate!==n.comp.frameRate || others[0].result?.duration!==n.comp.duration ||
      Object.keys(others[0].result).some(k=>!["id","name","duration","frameRate","time"].includes(k)) || Date.parse(others[0].completedAt)>Date.parse(c.submittedAt) ||
      commands.some(x=>!["readback","mutation"].includes(x.role)))fail("recovery_companion_command_invalid");
    exports.push({stepIndex:step.index,args:a,command:c,commands:commands.map(x=>({id:x.id,role:x.role,completedAt:x.completedAt})),native:n});
  }
  if(!exports.length || run.executedCount!==run.steps.filter(s=>s.status==="completed").length || run.skippedCount!==0 ||
    run.ok===false && !exports.some(x=>run.steps[x.stepIndex-1].status==="failed") || run.ok===true && run.failedCount!==0)fail("recovery_fail_stop_unproven");
  return exports;
}
function validateLinkage(record,local,remote){
  const p=record.run.provenance;
  if(!local || !remote || local.action!=="plan.run" || remote.action!=="plan.run" || local.state!=="unknown" || remote.state!=="unknown" ||
    !UUID.test(local.requestId || "") || local.requestId!==remote.requestId || !SHA.test(local.signature || "") || local.runId!==record.runId || remote.runId!==record.runId ||
    !local.binding || !equal(local.binding,bindingOf(remote)) || !equal(local.binding,bindingOf(local)) ||
    !provenanceMatches(local.result?.run?.provenance,p) || !provenanceMatches(remote.result?.run?.provenance,p) ||
    local.result.run.id!==record.runId || remote.result.run.id!==record.runId || local.result.run.finishedAt!==record.run.finishedAt || remote.result.run.finishedAt!==record.run.finishedAt ||
    local.phase!=="outcome_unresolved" || remote.phase!=="outcome_unresolved")fail("recovery_original_receipt_binding_invalid");
  for(const receipt of [local,remote]){
    const run=receipt.result.run;
    if(run.ok!==record.run.ok || run.error!==record.run.error || !equal(run.outcome,record.run.outcome) || run.steps?.length!==record.run.steps.length)fail("recovery_original_run_lineage_conflict");
    for(let i=0;i<record.run.steps.length;i++){
      const expected=record.run.steps[i],observed=run.steps[i];
      if(observed.index!==expected.index || observed.tool!==expected.tool || observed.status!==expected.status || !equal(observed.args,expected.args) ||
        (observed.commands || []).length!==(expected.commands || []).length || (expected.commands || []).some((c,j)=>["id","role","executionId","leaseId","state","lifecycleState","ok","submittedAt","completedAt"].some(k=>observed.commands[j][k]!==c[k])))fail("recovery_original_run_lineage_conflict");
    }
  }
  return {originalRequestId:local.requestId,originalBinding:local.binding,transportIdentityHash:evidence.sha256(local.signature)};
}
function validateFresh(record,exports,reads,commandStates=[],busy={}){
  if(busy.pendingCommands>0 || busy.inflightCommands?.length || busy.activeEditSession)fail("recovery_writer_not_idle");
  const projects=reads.filter(r=>r.tool==="get_project_info"),p=record.run.provenance;
  const dispatched=new Set(record.run.steps.flatMap(s=>(s.commands || []).map(c=>c.id)));
  if(commandStates.some(c=>c.executionId===record.runId && !dispatched.has(c.id)))fail("recovery_unaccounted_dispatched_command");
  if(projects.length!==2 || projects.some(r=>r.status!=="completed" || evidence.sha256(normalizeProject(r.result?.file))!==p.projectId || !Number.isSafeInteger(r.result.revision)) || projects[0].result.revision!==projects[1].result.revision || reads[0]!==projects[0] || reads[reads.length-1]!==projects[1])fail("recovery_fresh_project_unstable");
  for(const exp of exports){
    const rows=reads.filter(r=>r.tool==="get_comp_details" && r.args?.compItemId===exp.args.expectedCompItemId);
    if(rows.length!==1 || rows[0].status!=="completed" || rows[0].result?.itemId!==exp.args.expectedCompItemId || rows[0].result.name!==exp.args.expectedCompName ||
      ["width","height","frameRate","duration"].some(k=>rows[0].result[k]!==exp.native.comp[k]) || !equal(rows[0].result.resolutionFactor,exp.native.resolutionFactor.after))fail("recovery_fresh_comp_restore_mismatch");
    for(const c of record.run.steps[exp.stepIndex-1].commands){
      const current=commandStates.filter(x=>x.id===c.id);
      let payload=current[0]?.result;if(typeof payload==="string"){try{payload=JSON.parse(payload);}catch(_){fail("recovery_live_command_conflict");}}
      if(current.length>1 || current.length===1 && (current[0].state!=="completed" || current[0].lifecycleState!=="completed" || current[0].ok!==true || current[0].error || current[0].timedOutFrom || current[0].executionId!==c.executionId || !equal(payload,c.result)))fail("recovery_live_command_conflict");
    }
  }
  return {projectId:p.projectId,projectRevision:projects[0].result.revision,reads:reads.map(r=>({readId:r.readId,tool:r.tool,args:r.args,result:r.result}))};
}
function safePath(root,file){
  const base=path.resolve(root),rel=path.relative(base,path.resolve(file));
  if(rel===".." || rel.startsWith(".."+path.sep) || path.isAbsolute(rel))fail("recovery_path_escape");
  let p=path.resolve(file);
  while(true){try{const s=fs.lstatSync(p);if(s.isSymbolicLink() || path.resolve(fs.realpathSync(p)).toLowerCase()!==p.toLowerCase())fail("recovery_path_redirected");}catch(e){if(e.code!=="ENOENT")throw e;}const parent=path.dirname(p);if(parent===p)break;p=parent;}
  return path.resolve(file);
}
function crc32(bytes){let crc=0xffffffff;for(const b of bytes){crc^=b;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return (crc^0xffffffff)>>>0;}
function validCrc(bytes){let offset=8;while(offset+12<=bytes.length){const n=bytes.readUInt32BE(offset),end=offset+12+n;if(end>bytes.length)return false;if(crc32(bytes.subarray(offset+4,end-4))!==bytes.readUInt32BE(end-4))return false;offset=end;}return offset===bytes.length;}
async function observeArtifact(exportRoot,exp){
  const resolved=safety.resolveGeneratedFile({root:exportRoot,requestedName:exp.args.outputFileName,allowedExtensions:[".png"],label:"outputFileName"}).resolvedPath,file=safePath(exportRoot,resolved);
  const snapshot=()=>{safePath(exportRoot,file);try{const s=fs.lstatSync(file);if(!s.isFile() || s.nlink>1 || s.size>png.DEFAULT_MAX_PNG_BYTES)fail("recovery_artifact_unsafe");return s;}catch(e){if(e.code==="ENOENT")return null;throw e;}};
  const first=snapshot();await new Promise(resolve=>setTimeout(resolve,50));const before=snapshot();
  if(!first && !before)return {filename:exp.args.outputFileName,status:"missing",sha256:null,byteLength:null,dimensions:null};
  if(!first || !before || !png.sameFileSnapshot(first,before))fail("recovery_artifact_writer_active");
  const bytes=fs.readFileSync(file),after=snapshot();if(!png.sameFileSnapshot(before,after,bytes.length))fail("recovery_artifact_changed");
  const proof=png.verifyCompletePngBuffer(bytes),valid=proof.ok && validCrc(bytes) && proof.width===exp.native.comp.width && proof.height===exp.native.comp.height && before.mtimeMs>=Date.parse(exp.command.createdAt)-50;
  return {filename:exp.args.outputFileName,status:valid?"verified":"invalid",reasonCode:valid?null:!proof.ok?proof.reason:!validCrc(bytes)?"png_crc_invalid":proof.width!==exp.native.comp.width || proof.height!==exp.native.comp.height?"png_dimensions_mismatch":"png_stale",sha256:crypto.createHash("sha256").update(bytes).digest("hex"),byteLength:bytes.length,dimensions:proof.ok?{width:proof.width,height:proof.height}:null};
}
function envelope(receipt){return {schema:ENVELOPE,sha256:hash(receipt),receipt};}
function validateEnvelope(value){if(value?.schema!==ENVELOPE || !SHA.test(value.sha256 || "") || hash(value.receipt)!==value.sha256 || value.receipt?.schema!==SCHEMA || !UUID.test(value.receipt.recoveryId || "") || !UUID.test(value.receipt.originalRequestId || "") || !UUID.test(value.receipt.runId || "") || !["completed","failed"].includes(value.receipt.terminal) || value.receipt.replayAllowed!==false || value.receipt.artisticAccepted!==false)fail("recovery_envelope_invalid");return value.receipt;}
function fileFor(root,runId,requestId){if(!UUID.test(runId || "") || !UUID.test(requestId || ""))fail("recovery_identity_invalid");return safePath(root,path.join(root,"evidence","plan-run-recoveries",runId,requestId+".json"));}
function readReceipt(root,runId,requestId){
  const file=fileFor(root,runId,requestId);try{const stat=fs.lstatSync(file);if(!stat.isFile() || stat.nlink>1 || stat.size>LIMIT)fail("recovery_store_invalid");const value=JSON.parse(fs.readFileSync(file,"utf8")),r=validateEnvelope(value);if(r.runId!==runId || r.originalRequestId!==requestId)fail("recovery_store_binding_invalid");return value;}catch(e){if(e.code==="ENOENT")return null;throw e;}
}
function writeReceipt(root,value){
  const r=validateEnvelope(value),file=fileFor(root,r.runId,r.originalRequestId),existing=readReceipt(root,r.runId,r.originalRequestId);
  if(existing){if(existing.sha256!==value.sha256)fail("recovery_identity_conflict");return existing;}
  const text=JSON.stringify(value);if(Buffer.byteLength(text)>LIMIT)fail("recovery_store_budget");fs.mkdirSync(path.dirname(file),{recursive:true});safePath(root,file);
  const tmp=file+"."+crypto.randomUUID()+".tmp";let fd;
  try{fd=fs.openSync(tmp,"wx",0o600);fs.writeFileSync(fd,text,"utf8");fs.fsyncSync(fd);fs.closeSync(fd);fd=undefined;safePath(root,file);if(fs.existsSync(file))fail("recovery_identity_conflict");fs.renameSync(tmp,file);if(process.platform!=="win32"){const d=fs.openSync(path.dirname(file),"r");try{fs.fsyncSync(d);}finally{fs.closeSync(d);}}}finally{if(fd!==undefined)fs.closeSync(fd);if(fs.existsSync(tmp))fs.unlinkSync(tmp);}
  return readReceipt(root,r.runId,r.originalRequestId);
}
function validateStoredBinding(value,record,local){
  const r=validateEnvelope(value),p=record.run.provenance;inspectRecord(record);validateLinkage(record,local,local);
  if(local.action!=="plan.run" || local.state!=="unknown" || local.phase!=="outcome_unresolved" || !provenanceMatches(local.result?.run?.provenance,p) ||
    r.originalRequestId!==local.requestId || r.originalAction!=="plan.run" || r.runId!==record.runId || r.runEnvelopeSha256!==hash(record) || !provenanceMatches(r,p) ||
    r.transportIdentityHash!==evidence.sha256(local.signature) || !equal(r.originalBinding,local.binding))fail("recovery_stored_binding_invalid");return r;
}
async function adjudicate({record,local,remote,freshReadSteps,commandStates=[],busy={},exportRoot,runtimeIdentity}){
  const exports=inspectRecord(record),link=validateLinkage(record,local,remote),fresh=validateFresh(record,exports,freshReadSteps,commandStates,busy),steps=[];
  for(const exp of exports){const artifact=await observeArtifact(exportRoot,exp);steps.push({stepIndex:exp.stepIndex,commandId:exp.command.id,executionId:exp.command.executionId,completedAt:exp.command.completedAt,commands:exp.commands,compId:exp.args.expectedCompItemId,frame:exp.native.frame,resolution:exp.native.resolutionFactor,artifact});}
  const failed=steps.some(s=>s.artifact.status!=="verified"),p=record.run.provenance;
  return envelope({schema:SCHEMA,recoveryId:crypto.randomUUID(),...link,originalAction:"plan.run",runId:record.runId,actionId:p.actionId,proposalRevision:p.proposalRevision,payloadHash:p.payloadHash,planSha256:p.planSha256,runEnvelopeSha256:hash(record),projectId:p.projectId,observedAt:new Date().toISOString(),terminal:failed?"failed":"completed",reasonCode:failed?steps.some(s=>s.artifact.status==="missing")?"generated_png_missing_after_native_terminal":"generated_png_invalid_after_native_terminal":"generated_png_verified_after_native_terminal",steps,notStartedStepIndices:record.plan.steps.map((s,i)=>s.tool==="save_comp_frame_png" && i>=record.run.steps.length?i+1:null).filter(Boolean),freshObservation:fresh,originalRuntime:p.runtime,verifierRuntime:{...runtimeIdentity,recoveryModuleSha256:evidence.sha256(fs.readFileSync(__filename))},replayAllowed:false,artisticAccepted:false});
}
module.exports={SCHEMA,ENVELOPE,hash,bindingOf,provenanceMatches,inspectRecord,validateLinkage,validateFresh,observeArtifact,crc32,envelope,validateEnvelope,fileFor,readReceipt,writeReceipt,validateStoredBinding,adjudicate};

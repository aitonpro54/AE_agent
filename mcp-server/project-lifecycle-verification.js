"use strict";
const c=require("./project-lifecycle-contract");
function nativeResult(value) {
  for(let i=0;i<5;i++) {
    if (typeof value==="string") {if(value.length>c.LIMITS.bytes) c.fail("lifecycle_readback_budget");value=JSON.parse(value);}
    if (!value || typeof value!=="object" || Array.isArray(value) || value.ok===false) c.fail("lifecycle_readback_missing");
    if (!Object.prototype.hasOwnProperty.call(value,"result")) return value;
    value=value.result;
  }
  c.fail("lifecycle_readback_missing");
}
function verifyLifecycleStep(step,run) {
  const args=step.args || {},receipt=step.result && step.result.lifecycleReceipt;
  c.validateInput(step.tool,args);c.verifyReceipt(receipt);
  const authority=step.tool==="recover_project_lifecycle" ? receipt.recoveredBy : step.tool==="finalize_project_lifecycle" ? receipt.finalizedBy : receipt.authorization;
  if (!run || !authority || authority.runId!==run.id || authority.actionId!==run.provenance?.actionId || authority.payloadHash!==c.canonicalPlanHash(run.provenance?.payloadHash)) c.fail("lifecycle_receipt_run_mismatch");
  if (c.isLifecycleCompletion(step.tool)) {
    if(receipt.transitionId!==args.transitionId) c.fail("lifecycle_receipt_input_mismatch");
    if (step.tool==="recover_project_lifecycle" && (!receipt.recovery || authority.inputHash!==c.hash({name:step.tool,args}))) c.fail("lifecycle_receipt_input_mismatch");
  } else if (receipt.inputHash!==c.hash({name:step.tool,args}) || receipt.sourceNative.revision!==args.expectedSourceRevision || receipt.sourceNative.dirty!==args.expectedSourceDirty || receipt.operation!==step.tool || !c.samePath(receipt.sourceBefore.path,args.expectedSourceProjectFile) ||
      receipt.sourceBefore.sha256!==args.expectedSourceSavedSha25664 || !c.samePath(receipt.targetFile.path,args.targetProjectFile) ||
      receipt.checkpoint.label!==args.checkpointLabel || step.tool==="open_project" && receipt.targetFile.sha256!==args.expectedTargetSavedSha25664) c.fail("lifecycle_receipt_input_mismatch");
  const commands=step.commands;
  if (!Array.isArray(commands) || !commands.length || commands.length>50 || new Set(commands.map(row=>row.id)).size!==commands.length) c.fail("lifecycle_readback_missing");
  const reads=[];
  for(const row of commands) {
    if (step.tool==="recover_project_lifecycle" && row.role!=="readback") c.fail("lifecycle_recovery_native_mutation_forbidden");
    if (step.tool==="recover_project_lifecycle" && (row.state!=="completed" || row.ok!==true || row.executionId!==run.id || !Number.isFinite(Date.parse(row.completedAt)))) c.fail("lifecycle_readback_missing");
    if (row.role!=="readback" || row.state!=="completed" || row.ok!==true || row.executionId!==run.id || !row.completedAt) continue;
    let raw;
    try {
      raw=nativeResult(row.result);
      if (raw.schema!==c.VERSION+".inventory" || !Array.isArray(raw.protectedEvidence) || raw.protectedEvidence.length>c.LIMITS.protected || Buffer.byteLength(JSON.stringify(raw))>c.LIMITS.bytes) continue;
      // Validate all declared settings, item/layer IDs and asset/proxy records.
      // Protected values were checked against server policy by the lifecycle service.
      c.validateInventory({...raw,protectedEvidence:[]},[]);
      if (!c.samePath(raw.native.file,receipt.targetFile.path) || c.hash(raw.native)!==c.hash(receipt.finalNative) || c.inventoryHash(raw)!==receipt.targetInventoryHash) continue;
      reads.push({commandId:row.id,tool:"native_lifecycle_inventory",status:"completed",observedAt:row.completedAt});
    } catch (_) { continue; }
  }
  if (!reads.length) c.fail("lifecycle_readback_missing");
  if (step.tool==="recover_project_lifecycle") {
    const witnesses=step.result.recoveryReadbacks;
    c.exact(witnesses,["schema","transitionId","runId","postRetirement","postCommit"],"lifecycle_recovery_command_witness_missing");
    if (witnesses.schema!==c.VERSION+".recovery-readbacks.v1" || witnesses.transitionId!==receipt.transitionId || witnesses.runId!==run.id) c.fail("lifecycle_recovery_command_witness_missing");
    const ids=[];
    for (const [key,role] of [["postRetirement","recovery_post_retirement"],["postCommit","recovery_post_commit"]]) {
      const witness=witnesses[key];c.exact(witness,["commandId","readbackRole"],"lifecycle_recovery_command_witness_missing");
      const command=commands.find(row=>row.id===witness.commandId);
      if (!c.UUID.test(witness.commandId || "") || witness.readbackRole!==role || !command || command.lifecycleReadbackRole!==role || !reads.some(row=>row.commandId===witness.commandId)) c.fail("lifecycle_recovery_command_witness_missing");
      ids.push(witness.commandId);
    }
    if (ids[0]===ids[1]) c.fail("lifecycle_recovery_command_witness_missing");
  }
  return {ok:true,receipt,reads};
}
module.exports={verifyLifecycleStep,nativeResult};

"use strict";
// Bounded evidence batches reuse the existing review validator and dispatcher.
const { hash } = require("./placeholder-review-service");
const { inspectionMaterial, verifyVisualReview } = require("./placeholder-visual-review");
function invalid(code) { const error=new Error(code);error.code=code;throw error; }
function buildInspectionBatches(manifest) {
  if (!manifest || !Array.isArray(manifest.frames)) invalid("review_manifest_frames_missing");
  if (manifest.frames.some(frame=>!frame || !["source","target_comp","root_comp"].includes(frame.viewKind))) invalid("review_frame_view_kind_invalid");
  const frames=manifest.frames.filter(frame=>frame && frame.viewKind!=="source");
  if (!frames.length || frames.some(frame=>typeof frame.frameId!=="string") ||
      new Set(frames.map(frame=>frame.frameId)).size!==frames.length) invalid("review_frame_identity_invalid");
  const totalBatches=Math.ceil(frames.length/10);
  if (totalBatches>8) invalid("inspection_batch_budget_requires_smaller_review_scope");
  const baseManifestSha256=hash(manifest),batches=[];
  for(let index=0;index<totalBatches;index++) {
    const selected=frames.slice(index*10,(index+1)*10),frameIds=selected.map(frame=>frame.frameId);
    const scoped=totalBatches===1 ? manifest : {...manifest,frames:selected,reviewScope:{baseManifestSha256,batchIndex:index,totalBatches,frameIds}};
    batches.push({index,frameIds,manifest:scoped,material:inspectionMaterial(scoped)});
  }
  return {baseManifestSha256,batches};
}
function verifyVisualReviewBatches(manifest,runs) {
  let built;try{built=buildInspectionBatches(manifest);}catch(error){return {ok:false,status:"insufficient_material",artisticAccepted:false,reason:error.code,limits:manifest && manifest.limits};}
  const pending=(reason,batchResults=[])=>({ok:false,status:"insufficient_material",artisticAccepted:false,reason,batchResults,
    coverage:{reviewedFrames:batchResults.reduce((count,result)=>count+result.observations.length,0),expectedFrames:built.batches.reduce((count,batch)=>count+batch.frameIds.length,0)},limits:manifest.limits});
  if(!Array.isArray(runs) || !runs.length || runs.length>8) return pending("inspection_runs_missing_or_over_budget");
  const ids=runs.map(run=>run && run.state && run.state.task_id);
  if(ids.some(id=>typeof id!=="string" || !id) || new Set(ids).size!==ids.length) return pending("inspection_run_identity_conflict");
  const used=new Set(),batchResults=[];
  for(const batch of built.batches) {
    const candidates=runs.filter(run=>run.state.request && typeof run.state.request.instructions==="string" && run.state.request.instructions.includes(batch.material.pin));
    if(candidates.length!==1) return pending("inspection_batch_missing_or_duplicate",batchResults);
    const run=candidates[0];used.add(run.state.task_id);
    const result=verifyVisualReview(batch.manifest,run.state,run.events,run.response);
    if(!result.ok) return pending(result.reason,batchResults);
    batchResults.push(result);
  }
  if(used.size!==runs.length) return pending("inspection_run_outside_review_scope",batchResults);
  const observations=batchResults.flatMap(result=>result.observations),accepted=batchResults.every(result=>result.artisticAccepted===true);
  return {ok:true,status:accepted?"accepted_sampled_frames":"rejected_sampled_frames",artisticAccepted:accepted,observations,batchResults,
    manifestSha256:built.baseManifestSha256,coverage:{reviewedFrames:observations.length,expectedFrames:observations.length},limits:manifest.limits};
}
module.exports={buildInspectionBatches,verifyVisualReviewBatches};

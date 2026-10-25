"use strict";

// Pure evidence classifier. Callers authenticate private evidence before use.
// Absence, timeout, connectivity and elapsed time are deliberately not evidence.
const crypto=require("node:crypto");
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
function canonical(v){if(v===null||typeof v!=="object")return JSON.stringify(v);if(Array.isArray(v))return "["+v.map(canonical).join(",")+"]";return "{"+Object.keys(v).sort().map(k=>JSON.stringify(k)+":"+canonical(v[k])).join(",")+"}";}
function hash(bytes){return crypto.createHash("sha256").update(bytes).digest("hex");}
function same(a,b){return canonical(a)===canonical(b);}
function actor(v){return !!v&&typeof v.panelConnectionId==="string"&&!!v.panelConnectionId&&typeof v.panelGeneration==="string"&&!!v.panelGeneration&&typeof v.panelInstanceId==="string"&&!!v.panelInstanceId&&Number.isSafeInteger(v.panelLifecycleEpoch)&&v.panelLifecycleEpoch>=0;}
function origin(v){return !!v&&actor(v.actor)&&typeof v.runtime==="object"&&Number.isInteger(v.runtime.pid)&&typeof v.runtime.startedAt==="string"&&/^[a-f0-9]{64}$/.test(v.runtime.sourceSha256||"")&&v.runtime.sourceSha256===v.runtime.currentSourceSha256;}
function project(v){return !!v&&typeof v==="object"&&Object.prototype.hasOwnProperty.call(v,"file")&&(v.file===null||typeof v.file==="string")&&Number.isInteger(v.numItems)&&v.numItems>=0;}
function exactTerminal(pins,row){
  if(!pins||!UUID.test(pins.id||"")||!UUID.test(pins.executionId||"")||!Number.isFinite(Number(pins.expiresAt))||pins.tool!=="get_project_info"||!origin(pins.origin)||!row)return null;
  const c=row.command;
  if(!c||row.id!==pins.id||c.id!==pins.id||c.executionId!==pins.executionId||Date.parse(c.expiresAt)!==Number(pins.expiresAt)||!same(row.origin,pins.origin)||row.tool!==pins.tool)return null;
  if(row.lifecycleState==="expired_before_delivery"&&c.state==="expired_before_delivery"&&!c.submittedAt&&!c.leasedAt&&!c.leaseOwner)return "not_delivered_proven";
  if(!["completed","failed"].includes(row.lifecycleState)||c.state!==row.lifecycleState||!same(row.observedOrigin,pins.origin)||!c.submittedAt||!c.completedAt||!c.leaseId||!c.leaseOwner||c.leaseOwner.panelConnectionId!==pins.origin.actor.panelConnectionId||c.leaseOwner.panelGeneration!==pins.origin.actor.panelGeneration||!row.receiptDigest)return null;
  if(row.lifecycleState==="completed"&&row.ok===true&&project(row.result))return "completed_observed";
  if(row.lifecycleState==="failed"&&row.ok===false)return "failed_observed";
  return null;
}
function deliveryFence(fence,attempt,sha,before,{barrier=null}={}){
  if(!fence||fence.originalRawSha256!==sha||!same(fence.origin,before)||!origin(before))return false;
  if(!barrier&&fence.kind==="same_runtime_delivery_closed")return same(attempt.origin,before)&&same(attempt.projectReadCommand?.origin,before)&&same(fence.oldCommandPins,attempt.projectReadCommand)&&fence.deliveryClosed===true;
  if(!["reset_epoch","bootstrap_epoch"].includes(fence.kind)||!actor(fence.previousActor)||!same(fence.actor,before.actor)||!UUID.test(fence.generation||"")||fence.actor.panelLifecycleEpoch!==fence.previousActor.panelLifecycleEpoch+1||fence.actor.panelInstanceId!==fence.previousActor.panelInstanceId||fence.actor.panelConnectionId!==fence.previousActor.panelConnectionId)return false;
  const cover=fence.coveredBootstrap;if(cover?.originalRawSha256!==sha||cover.requestId!==attempt.requestId||!same(cover.projectReadCommand,attempt.projectReadCommand||null))return false;
  return !barrier||Array.isArray(cover.barriers)&&cover.barriers.some(v=>v.operationId===barrier.operationId&&same(v.pins,barrier.pins));
}
function classify({attempt,terminal,barrier,originalRawSha256,uiTerminal=false}={}){
  const blocked=reason=>({state:"blocked",reason,replayAllowed:false,automaticReplayAllowed:false,newEnsureRequired:false});
  if(!attempt||attempt.stage!=="project_read_unknown"||!UUID.test(attempt.requestId||""))return blocked("active_project_read_unknown_required");
  const exact=exactTerminal(attempt.projectReadCommand,terminal);
  if(exact)return {state:exact,oldOutcome:exact,replayAllowed:false,automaticReplayAllowed:false,newEnsureRequired:true};
  if(!uiTerminal)return blocked("application_ui_outcome_unresolved");
  if(barrier&&barrier.originalRawSha256===originalRawSha256&&deliveryFence(barrier.deliveryFence,attempt,originalRawSha256,barrier.before)&&same(barrier.before,barrier.after)&&origin(barrier.before)&&same(barrier.pins?.origin,barrier.before)&&exactTerminal(barrier.pins,barrier.terminal)==="completed_observed")return {state:"epoch_fenced_unknown",oldOutcome:"unknown_preserved",replayAllowed:false,automaticReplayAllowed:false,newEnsureRequired:true};
  return blocked(barrier?"recovery_barrier_unresolved":"exact_result_or_physical_barrier_required");
}
module.exports={UUID,canonical,hash,same,actor,origin,project,exactTerminal,deliveryFence,classify};

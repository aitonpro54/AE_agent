"use strict";
// Fresh, read-only exclusion of one refused transport guard. This is neither
// retirement nor admission authority, and never changes historical UNKNOWN.
const path=require("node:path"),ledger=require("./native-fixture-attempt-ledger"),proof=require("./native-fixture-admission-refusal-proof");
const contract=require("../cep-panel/panel-action-contract"),abandonment=require("./native-fixture-abandonment"),control=require("./cep-panel-control");
const legacy=require("./ame-fixture-ui-backend");
const {fail,hash,same,clone,SHA}=ledger,SCHEMA="ae-agent.native-fixture-admission-refusal.v1",P=proof.PROFILE;
const PANEL_ASSETS=Object.freeze(["CSXS/manifest.xml","index.html","panel-action-contract.js","panel-actions.js","panel.js","style.css","lib/CSInterface.js"].sort());
// Original expired invocation evidence supplied by the sole controller. Its
// entire unbound signature must match the immutable transport original below.
const ORIGINAL_PINS=Object.freeze({instanceId:"0269141b-eb7b-4b6f-bbfd-d178a158ac31",revision:P.proposalRevision,actionId:P.actionId,requestId:P.proposalRequestId,actionKind:"ae_tool",
  payloadRef:"payload_d5be41ed40a848f0b78f54fc07b68dca",payloadHash:P.payloadHash,previewHash:"sha256:6ca3d34b918ad353a8ed47058a1c88f6dc97b8824b8b91c9fb76ed087f571692",
  projectFile:P.projectFile,expiresAt:"2026-10-11T05:51:41.779Z",riskLevel:"mutating",riskPolicyVersion:"m100-risk-v1",surface:"cep-panel",sessionId:"panel-1788190574758-9530486552964272:chat-1788190574762-40033"});
const selector=proof.selector;
function semanticSame(a,b,depth=0) {
  if(depth>64)return false;
  if(a===b)return true;
  if(a===null || b===null || typeof a!==typeof b || typeof a!=="object" || Array.isArray(a)!==Array.isArray(b))return false;
  if(Array.isArray(a))return a.length===b.length && a.every((value,index)=>semanticSame(value,b[index],depth+1));
  const keys=Object.keys(a).sort();return same(keys,Object.keys(b).sort()) && keys.every(key=>semanticSame(a[key],b[key],depth+1));
}
function isExactReceipt(row) {
  const r=row?.result?.run,p=r?.provenance,a=r?.m100Action;
  return row?.protocolVersion===contract.PROTOCOL_VERSION && row.requestId===P.requestId && row.runId===P.runId && row.action==="plan.run" && row.effect==="protected_plan_run" &&
    row.source==="programmatic" && row.state==="unknown" && row.phase==="outcome_unresolved" && row.delivery==="delivered" && row.replayAllowed===false && row.code===P.errorCode &&
    r?.id===P.runId && r.ok===false && r.dryRun===false && r.errorCode===P.errorCode && r.validation?.validationId===P.proposalRequestId &&
    p?.actionId===P.actionId && p.proposalRevision===P.proposalRevision && p.payloadHash===P.payloadHash && a?.actionId===P.actionId && a.confirmedBySurface==="cep-panel" &&
    Array.isArray(r.steps) && r.steps.length===1 && r.steps[0].tool==="ame_native_fixture_probe" && r.steps[0].errorCode===P.errorCode;
}
function panelProjection(row) {
  const value=contract.sanitizeReceipt(row);delete value.binding;
  // Exact historical read-back: the controller records delivered transport,
  // while the unchanged panel original retains UNKNOWN effect delivery.
  value.delivery="unknown";return value;
}
function original(historical) {
  const pin=historical.binding.pins.receipt,bytes=ledger.readBytes(pin.file);
  if(bytes.length!==pin.bytes || hash(bytes)!==pin.sha256)fail("fixture_refusal_original_bytes_changed");
  const local=JSON.parse(bytes),r=historical.proof.run,a=r.m100Action,p=r.provenance;
  const pins={...ORIGINAL_PINS,revision:p.proposalRevision,actionId:p.actionId,requestId:r.validation.validationId,payloadRef:a.payloadRef,payloadHash:a.payloadHash,
    previewHash:a.previewHash,projectFile:r.project.expectedFile,expiresAt:a.proposalExpiresAt,riskLevel:a.riskLevel,riskPolicyVersion:a.riskPolicyVersion,surface:a.confirmedBySurface,sessionId:a.confirmedBySession};
  const envelope={protocolVersion:contract.PROTOCOL_VERSION,requestId:P.requestId,action:"plan.run",args:{pins,confirm:true}};
  if(!same(pins,ORIGINAL_PINS) || !isExactReceipt(local) || local.signature!==control.computeActionSignature(envelope) || !same(local.binding,historical.transport.recordedBinding))fail("fixture_refusal_original_invocation_mismatch");
  const projection=panelProjection(local),binding=abandonment.actor({panelInstanceId:local.panelInstanceId,panelLifecycleEpoch:local.epoch,panelGeneration:local.generation});
  if(!same(binding,local.binding))fail("fixture_refusal_original_binding_mismatch");
  const indexFile=path.join(path.dirname(pin.file),"identities.json"),indexBytes=ledger.readBytes(indexFile),index=JSON.parse(indexBytes),identity=index.identities?.[P.requestId];
  if(index.schema!=="ae-agent.cep-panel-transport.v1" || !identity || identity.action!==local.action || identity.signature!==local.signature || !same(identity.binding,binding))fail("fixture_refusal_original_index_mismatch");
  return {local,projection,privateSignatureSha256:hash(control.computeActionSignature({...envelope,expectedState:binding})),binding,index:{file:indexFile,bytes:indexBytes.length,sha256:hash(indexBytes)}};
}
function guardEntry(guard,source,actor,historical,linkage) {
  if(!linkage || !same(linkage.local,source.local) || !semanticSame(linkage.remote,source.projection) || !guard || !semanticSame(guard.projection,source.projection) ||
    guard.signatureSha256!==source.privateSignatureSha256 || !same(guard.currentBinding,actor) || guard.controllerIdle!==true)fail("fixture_refusal_original_guard_mismatch");
  return {originalRequestId:P.requestId,runId:P.runId,action:"plan.run",effect:"protected_plan_run",actionId:P.actionId,proposalRequestId:P.proposalRequestId,
    proposalRevision:P.proposalRevision,payloadHash:P.payloadHash,originalBinding:source.binding,privateSignatureSha256:source.privateSignatureSha256,
    transportSignatureSha256:hash(source.local.signature),panelReceiptHash:hash(guard.projection),projectedPinnedReceiptSha256:hash(source.projection),canonicalRunRecordHash:historical.proof.canonicalRunRecordHash,
    canonicalRecordSha256:historical.binding.canonicalRecordSha256,canonicalRunProjectionHash:historical.proof.canonicalRunProjectionHash,panelRunProjectionHash:hash(guard.projection.result.run)};
}
function quiet(selected,guard,status) {
  const s=selected.state;
  if(s.actionStorage!=="ready" || s.activeAction!==null || s.recoveryTransport || guard.controllerIdle!==true ||
    status.pendingCommands!==0 || status.inflightCommands?.length!==0 || status.activeEditSession!==null || status.projectLifecycle?.blocked || status.projectLifecycle?.pending || status.panelBootstrap?.busy)fail("fixture_refusal_not_idle");
  if(!Array.isArray(s.unresolvedActions) || s.unresolvedActions.some(row=>row.requestId===P.requestId && (row.runId!==P.runId || row.action!=="plan.run" || row.effect!=="protected_plan_run")))fail("fixture_refusal_guard_scope_mismatch");
}
async function observe(deps,historical,source) {
  const selected=await deps.maintenanceTarget(),actor=abandonment.actor(selected.state),linkage=await deps.readRecoveryLinkage(P.requestId),guard=await deps.readPanelGuard(selector()),status=await deps.readBridgeStatus();
  const entry=guardEntry(guard,source,actor,historical,linkage);quiet(selected,guard,status);
  const runtime=abandonment.runtime(await deps.readRuntimeIdentity(selected));abandonment.frameEvidence(selected,runtime);
  if(runtime.loadedPanelSourcesVerified!==true || !same(Object.keys(runtime.panelAssetHashes).sort(),PANEL_ASSETS))fail("fixture_refusal_loaded_sources_unverified");
  return {entry,currentActor:actor,target:clone(selected.target),installed:clone(selected.installed),runtime};
}
async function lookup(deps) {
  for(const name of ["maintenanceTarget","readRecoveryLinkage","readPanelGuard","readBridgeStatus","readRuntimeIdentity","currentRuntimeSha256"])if(typeof deps?.[name]!=="function")fail("fixture_refusal_fixed_reader_required");
  const historical=proof.classify(deps.repoRoot,deps.evidenceRoot),source=original(historical),first=await observe(deps,historical,source),second=await observe(deps,historical,source);
  if(!same(first,second) || !same(historical,proof.classify(deps.repoRoot,deps.evidenceRoot)) || !same(source,original(historical)))fail("fixture_refusal_fresh_bracket_changed");
  // Final status/actor reads happen after all awaited native/source reads.
  const final=await deps.maintenanceTarget(),guard=await deps.readPanelGuard(selector()),status=await deps.readBridgeStatus();quiet(final,guard,status);
  if(!same(final.target,second.target) || !same(final.installed,second.installed) || !same(abandonment.actor(final.state),second.currentActor) ||
    !same(guardEntry(guard,source,second.currentActor,historical,await deps.readRecoveryLinkage(P.requestId)),second.entry))fail("fixture_refusal_fresh_bracket_changed");
  const finalRuntime=abandonment.runtime(await deps.readRuntimeIdentity(final));
  const endGuard=await deps.readPanelGuard(selector()),endLinkage=await deps.readRecoveryLinkage(P.requestId),endStatus=await deps.readBridgeStatus(),endTarget=await deps.maintenanceTarget();
  quiet(endTarget,endGuard,endStatus);
  if(!same(finalRuntime,second.runtime) || !same(endTarget.target,second.target) || !same(endTarget.installed,second.installed) ||
    !same(abandonment.actor(endTarget.state),second.currentActor) || !same(guardEntry(endGuard,source,second.currentActor,historical,endLinkage),second.entry) ||
    !same(historical,proof.classify(deps.repoRoot,deps.evidenceRoot)) || !same(source,original(historical)) || deps.currentRuntimeSha256()!==second.runtime.loadedRuntimeSha256)fail("fixture_refusal_fresh_bracket_changed");
  return {schema:SCHEMA,selector:selector(),...proof.OUTCOME,primaryStateObserved:false,entry:second.entry,
    readBack:{schema:SCHEMA+".read-back",entrySha256:hash(second.entry),currentActor:second.currentActor,runtime:second.runtime,installed:second.installed,
      pendingCount:0,inflightCount:0,activeSession:null,controllerIdle:true},
    proofPins:{manifest:clone(historical.binding.pins.manifest),runtimeSha256:historical.binding.runtimeSha256,run:clone(historical.binding.pins.run),receipt:clone(historical.binding.pins.receipt),
      sessionRows:clone(historical.binding.pins.sessionRows),activeSessionSha256:historical.binding.pins.activeSessionSha256,finishedSessionSha256:historical.binding.pins.finishedSessionSha256,checkpoint:clone(historical.binding.pins.checkpoint),transportIndex:source.index}};
}
function validatesTransport(value,row) {
  const e=value?.entry,b=value?.readBack,r=b?.runtime;
  return isExactReceipt(row) && value.schema===SCHEMA && value.primaryStateObserved===false && same(value.selector,selector()) && Object.entries(proof.OUTCOME).every(([key,x])=>value[key]===x) &&
    e?.originalRequestId===P.requestId && e.runId===P.runId && e.actionId===P.actionId && e.proposalRequestId===P.proposalRequestId && e.proposalRevision===P.proposalRevision && e.payloadHash===P.payloadHash &&
    e.projectedPinnedReceiptSha256===hash(panelProjection(row)) && SHA.test(e.panelReceiptHash || "") && SHA.test(e.panelRunProjectionHash || "") && e.transportSignatureSha256===hash(row.signature) && same(e.originalBinding,row.binding) && SHA.test(e.privateSignatureSha256 || "") &&
    b?.schema===SCHEMA+".read-back" && b.entrySha256===hash(e) && b.pendingCount===0 && b.inflightCount===0 && b.activeSession===null && b.controllerIdle===true &&
    r?.loadedPanelSourcesVerified===true && SHA.test(r.loadedRuntimeSha256 || "") && r.currentRuntimeSha256===r.loadedRuntimeSha256 && same(b.installed?.hashes,r.panelAssetHashes);
}
function createReaders(deps) {
  const panelService=deps.panelService;
  return {repoRoot:deps.projectRoot,evidenceRoot:deps.evidenceRoot,maintenanceTarget:()=>panelService.maintenanceTarget(),readRecoveryLinkage:id=>panelService.readRecoveryLinkage(id),readBridgeStatus:deps.readBridgeStatus,currentRuntimeSha256:deps.currentRuntimeSha256,
    async readPanelGuard(value) {
      const s=proof.select(value),selected=await panelService.maintenanceTarget();
      return control.evaluateViaWebSocket(selected.target.webSocketDebuggerUrl,"(function(){var api=window.AEAgentPanelActions;if(!api||typeof api.readNativeFixtureGuard!=='function')return null;return api.readNativeFixtureGuard("+JSON.stringify(s)+");})()",5000);
    },
    async readRuntimeIdentity(selected) {
      await legacy.loadedPanelSources(selected);const runtime=deps.readBridgeStatus().humanGuardRuntime;
      return {daemon:{pid:runtime.pid,startedAt:runtime.startedAt},loadedRuntimeSha256:deps.loadedRuntimeSha256,currentRuntimeSha256:deps.currentRuntimeSha256(),panelAssetHashes:selected.installed.hashes,loadedPanelSourcesVerified:true};
    }};
}
function matchesPanelOriginal(row,remote) {return isExactReceipt(row) && semanticSame(remote,panelProjection(row));}
module.exports={SCHEMA,selector,lookup,createReaders,isExactReceipt,validatesTransport,matchesPanelOriginal};

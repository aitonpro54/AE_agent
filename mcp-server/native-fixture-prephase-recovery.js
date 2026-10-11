"use strict";
// Separate admission evidence. Original UNKNOWN receipts remain immutable and
// unretired; no human abandonment, child exit or native execution is asserted.
const fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto");
const ledger=require("./native-fixture-attempt-ledger"),abandonment=require("./native-fixture-abandonment"),proof=require("./native-fixture-prephase-recovery-proof");
const {fail,hash,same,clone,UUID}=ledger,SCHEMA="ae-agent.native-fixture-prephase-recovery.v1",TTL=600000,brands=new WeakMap();
const OUTCOME=Object.freeze({scope:"new_disjoint_fixture_only",historicalOutcome:"unknown",nativeExecutionProven:false,replayAllowed:false,processExitProven:false,nativeEndpointInertProven:false,phaseAuthorityNeverIssued:true});
const now=deps=>deps.now ? deps.now() : Date.now();
function exact(value,keys) {if(!value || Array.isArray(value) || !same(Object.keys(value).sort(),keys.slice().sort()))fail("fixture_prephase_client_evidence_forbidden");}
function fileFor(root,kind,id) {if(!["capture","consumption","audit","certificate"].includes(kind) || !UUID.test(id || ""))fail("fixture_prephase_file_selector_invalid");return path.join(root,"evidence","native-fixture-prephase-recovery",id+"."+kind+".json");}
function read(root,kind,id) {const file=fileFor(root,kind,id);return fs.existsSync(file) ? abandonment.envelope(file,SCHEMA) : null;}
function write(root,kind,id,value,metadata={}) {return ledger.writeOnce(fileFor(root,kind,id),value,{schema:SCHEMA+".envelope",...metadata});}
function partial(root) {return ["consumption","audit","certificate"].some(k=>fs.existsSync(fileFor(root,k,proof.PROFILE.requestId)));}
function executorIdle(executor,isolation) {
  // Runner Map sizes retain terminal children. Their count is not an in-flight
  // count: executing and the durable retirement/completion inventory decide.
  if(executor?.executing!==false || !Number.isInteger(executor.pendingCount) || executor.pendingCount<0 || !Number.isInteger(executor.descriptorCount) || executor.descriptorCount<0 || !Array.isArray(executor.outstandingAttempts) ||
    executor.outstandingAttempts.some(row=>row.runId!==proof.PROFILE.runId || row.stageId!==proof.PROFILE.stageId || row.rootPath!==proof.PROFILE.rootPath) || isolation?.originalAttemptPresent!==false || isolation.originalAuthorityImportAvailable!==false || isolation.loadedIssuerSha256!==proof.SOURCES["ame-native-fixture-grant.js"] || isolation.currentIssuerSha256!==isolation.loadedIssuerSha256)fail("fixture_prephase_issuer_not_isolated");
}
function liveGuard(s,p,guard,status,mode,context,deps,protection) {
  if(mode!=="admission") {abandonment.guardState(s,p,guard,status,mode);return;}
  deps.assertManualIngress(context);
  deps.assertAdmissionProtection(context,protection,status.activeEditSession);
  if(status.pendingCommands!==0 || status.inflightCommands?.length!==0 || status.projectLifecycle?.blocked || status.projectLifecycle?.pending || status.panelBootstrap?.busy || guard.controllerIdle!==false ||
    !p.activeAction || p.activeAction.action!=="plan.run" || p.activeAction.requestId===s.requestId || p.recoveryTransport || p.actionStorage!=="ready")fail("fixture_prephase_new_manual_action_required");
}
async function freshProtection(deps,context,witness) {
  deps.assertAdmissionProtection(context,witness);
  const fresh=await deps.readAdmissionProtection(context);
  // Keep the original WeakMap witness and its exact private Map/session/CP
  // identities across the read, rather than replacing it with caller evidence.
  deps.assertAdmissionProtection(context,witness);deps.assertAdmissionProtection(context,fresh);
  if(!same(witness,fresh))fail("fixture_prephase_owned_protection_changed");
}
async function snapshot(deps,mode="capture",context=null) {
  for(const name of ["maintenanceTarget","readPanelGuard","readBridgeStatus","readRuntimeIdentity","readTransportAbsence","readExecutorQuiescence","readIssuerIsolation"])if(typeof deps[name]!=="function")fail("fixture_prephase_fixed_reader_required");
  if(mode==="admission" && ["readAdmissionProtection","assertAdmissionProtection"].some(name=>typeof deps[name]!=="function"))fail("fixture_prephase_owned_protection_required");
  const s=proof.selector(),historical=proof.classify(deps.repoRoot,deps.evidenceRoot),selected=await deps.maintenanceTarget(),actor=abandonment.actor(selected.state),guard=await deps.readPanelGuard(s),entry=abandonment.guardEntry(s,guard,historical.proof,actor),protection=mode==="admission" ? await deps.readAdmissionProtection(context) : null,status=await deps.readBridgeStatus();
  // Only the existing private manual ingress can supply admission mode. A busy
  // exact plan.run is expected while authorizing a new server context.
  liveGuard(s,selected.state,guard,status,mode,context,deps,protection);
  const transport=await deps.readTransportAbsence(s);abandonment.transportEvidence(s,transport);
  const executor=await deps.readExecutorQuiescence(),isolation=await deps.readIssuerIsolation();
  executorIdle(executor,isolation);
  if(!Number.isFinite(Date.parse(historical.proposalExpiresAt)) || now(deps)<=Date.parse(historical.proposalExpiresAt))fail("fixture_prephase_issuer_not_isolated");
  const runtime=abandonment.runtime(await deps.readRuntimeIdentity());abandonment.frameEvidence(selected,runtime);
  if(Date.parse(runtime.daemon.startedAt)<=Date.parse(historical.proof.run.finishedAt))fail("fixture_prephase_original_daemon_not_isolated");
  const after=await deps.maintenanceTarget();abandonment.sameTarget(selected,after,actor);
  const endGuard=await deps.readPanelGuard(s),endProtection=mode==="admission" ? await deps.readAdmissionProtection(context) : null,endStatus=await deps.readBridgeStatus();liveGuard(s,after.state,endGuard,endStatus,mode,context,deps,endProtection);
  if(!same(protection,endProtection) || !same(abandonment.guardEntry(s,endGuard,historical.proof,actor),entry) || !same(await deps.readExecutorQuiescence(),executor) || !same(await deps.readIssuerIsolation(),isolation) || !same(await deps.readTransportAbsence(s),transport))fail("fixture_prephase_fresh_bracket_changed");
  if(mode==="admission")await freshProtection(deps,context,endProtection);
  return {selector:s,entry,currentActor:actor,target:clone(selected.target),installed:clone(selected.installed),runtime,executor:clone(executor),transport:clone(transport),issuerIsolation:clone(isolation),original:historical.binding,inventorySha256:historical.inventorySha256,...(mode==="admission" ? {admissionProtection:protection} : {})};
}
async function bracket(deps,mode,context) {const a=await snapshot(deps,mode,context),b=await snapshot(deps,mode,context);if(!same(a,b))fail("fixture_prephase_fresh_bracket_changed");return b;}
function captureValid(row,id,time) {const c=row?.value,t=Date.parse(c?.createdAt);if(!c || c.schema!==SCHEMA+".capture" || c.captureId!==id || !Number.isFinite(t) || Date.parse(c.expiresAt)!==t+TTL || time<t || time>=t+TTL)fail("fixture_prephase_capture_stale_or_invalid");return c;}
async function capture(input,deps) {
  exact(input,["selector"]);proof.select(input.selector);if(partial(deps.evidenceRoot))fail("fixture_prephase_already_consumed_or_partial");
  const observed=await bracket(deps,"capture"),time=now(deps),id=crypto.randomUUID();return write(deps.evidenceRoot,"capture",id,{schema:SCHEMA+".capture",captureId:id,createdAt:new Date(time).toISOString(),expiresAt:new Date(time+TTL).toISOString(),observed});
}
async function publish(input,deps) {
  exact(input,["captureId"]);if(!UUID.test(input.captureId || ""))fail("fixture_prephase_capture_selector_invalid");
  const captured=read(deps.evidenceRoot,"capture",input.captureId),c=captureValid(captured,input.captureId,now(deps)),s=proof.selector();
  if(partial(deps.evidenceRoot))fail("fixture_prephase_already_consumed_or_partial");
  if(!same(await bracket(deps,"capture"),c.observed))fail("fixture_prephase_capture_drift");
  if(typeof deps.acquireWriterLock!=="function")fail("fixture_prephase_writer_lock_required");const lock=await deps.acquireWriterLock();if(typeof lock?.release!=="function")fail("fixture_prephase_writer_lock_required");
  try {
    if(partial(deps.evidenceRoot))fail("fixture_prephase_already_consumed_or_partial");captureValid(captured,input.captureId,now(deps));
    if(!same(await bracket(deps,"capture"),c.observed))fail("fixture_prephase_locked_bracket_changed");
    const createdAt=new Date(now(deps)).toISOString(),certificateId=crypto.randomUUID();
    const consumption=write(deps.evidenceRoot,"consumption",s.requestId,{schema:SCHEMA+".consumption",selector:s,captureId:c.captureId,captureSha256:captured.sha256,certificateId,createdAt,replayAllowed:false});
    const value={schema:SCHEMA,certificateId,createdAt,captureId:c.captureId,captureSha256:captured.sha256,selector:s,status:"prephase_admission_certified",authority:"server_proof_phase_authority_exhausted",...OUTCOME,entry:c.observed.entry,original:c.observed.original};
    const audit=write(deps.evidenceRoot,"audit",s.requestId,{schema:SCHEMA+".audit",certificateId,createdAt,captureId:c.captureId,captureSha256:captured.sha256,consumptionSha256:consumption.sha256,certificateSha256:hash(value),authority:value.authority,observed:c.observed});
    // Final write-once record is the commit marker. No partial chain is usable.
    return write(deps.evidenceRoot,"certificate",s.requestId,value,{auditSha256:audit.sha256,consumptionSha256:consumption.sha256});
  } finally {await lock.release();}
}
function lookupAudited(input,deps) {
  const s=proof.select(input),saved=read(deps.evidenceRoot,"certificate",s.requestId);
  if(!saved) {if(partial(deps.evidenceRoot))fail("fixture_prephase_partial_publication");return null;}
  const v=saved.value,audit=read(deps.evidenceRoot,"audit",s.requestId),consumption=read(deps.evidenceRoot,"consumption",s.requestId),captured=UUID.test(v.captureId || "") && read(deps.evidenceRoot,"capture",v.captureId);
  if(!audit || !consumption || !captured || v.schema!==SCHEMA || v.status!=="prephase_admission_certified" || v.authority!=="server_proof_phase_authority_exhausted" || !same(v.selector,s) || Object.entries(OUTCOME).some(([k,x])=>v[k]!==x) ||
    saved.auditSha256!==audit.sha256 || saved.consumptionSha256!==consumption.sha256 || audit.value.schema!==SCHEMA+".audit" || consumption.value.schema!==SCHEMA+".consumption" || captured.value.schema!==SCHEMA+".capture" ||
    audit.value.certificateSha256!==saved.sha256 || audit.value.consumptionSha256!==consumption.sha256 || audit.value.authority!==v.authority || consumption.value.replayAllowed!==false || !same(consumption.value.selector,s) ||
    [audit.value,consumption.value].some(r=>r.certificateId!==v.certificateId || r.captureId!==v.captureId || r.captureSha256!==captured.sha256 || r.createdAt!==v.createdAt) || captured.sha256!==v.captureSha256 || captured.value.captureId!==v.captureId ||
    !same(audit.value.observed,captured.value.observed) || !same(v.entry,captured.value.observed.entry) || !same(v.original,captured.value.observed.original) || !same(v.original,proof.classify(deps.repoRoot,deps.evidenceRoot).binding))fail("fixture_prephase_certificate_invalid");
  return saved;
}
async function lookup(input,deps) {
  const saved=lookupAudited(input,deps);if(!saved)return null;const fresh=await bracket(deps,"lookup");
  if(!same(fresh.entry,saved.value.entry) || !same(fresh.original,saved.value.original))fail("fixture_prephase_original_guard_drift");
  return {...saved,readBack:{schema:SCHEMA+".read-back",certificateSha256:saved.sha256,entrySha256:hash(saved.value.entry),currentActor:fresh.currentActor,runtime:fresh.runtime,installed:fresh.installed,
    executor:{executing:fresh.executor.executing,pendingCount:fresh.executor.pendingCount,descriptorCount:fresh.executor.descriptorCount},transport:fresh.transport,...OUTCOME}};
}
function newContext(context,saved,deps) {
  deps.assertManualIngress(context);const r=context.record,cp=context.checkpoint,t=Date.parse(saved.value.createdAt),old=proof.classify(deps.repoRoot,deps.evidenceRoot).checkpoint;
  if(!UUID.test(context.runId || "") || context.runId===proof.PROFILE.runId || !UUID.test(r?.requestId || "") || r.requestId===proof.PROFILE.requestId || r.actionId===proof.PROFILE.actionId ||
    [r.createdAt,r.dryRunCompletedAt,r.confirmedAt,cp?.createdAt].some(at=>!Number.isFinite(Date.parse(at)) || Date.parse(at)<t || Date.parse(at)>now(deps)) || !cp.checkpointFile || cp.checkpointFile.toLowerCase()===old.checkpointFile.toLowerCase())fail("fixture_prephase_new_disjoint_context_required");
}
const fingerprint=context=>hash({runId:context.runId,record:context.record,checkpoint:context.checkpoint,args:context.args});
async function bindAdmission(context,deps) {
  const saved=lookupAudited(proof.selector(),deps);if(!saved)return null;newContext(context,saved,deps);
  const fresh=await bracket(deps,"admission",context);if(!same(fresh.entry,saved.value.entry))fail("fixture_prephase_original_guard_drift");
  if(typeof deps.currentRuntimeSha256!=="function" || deps.currentRuntimeSha256()!==fresh.runtime.loadedRuntimeSha256)fail("fixture_prephase_runtime_reader_required");
  const brand=Object.freeze({});brands.set(brand,{context,record:context.record,fingerprint:fingerprint(context),certificateSha256:saved.sha256,repoRoot:deps.repoRoot,evidenceRoot:deps.evidenceRoot,assertManualIngress:deps.assertManualIngress,assertAdmissionProtection:deps.assertAdmissionProtection,readAdmissionProtection:deps.readAdmissionProtection,admissionProtection:fresh.admissionProtection,now:deps.now,currentRuntimeSha256:deps.currentRuntimeSha256,loadedRuntimeSha256:fresh.runtime.loadedRuntimeSha256});return brand;
}
function admissionBinding(brand,context,repoRoot) {
  const b=brand && brands.get(brand);if(!b || b.context!==context || b.record!==context.record || b.repoRoot!==repoRoot || b.fingerprint!==fingerprint(context))fail("fixture_prephase_private_context_required");
  b.assertManualIngress(context);return b;
}
async function recheckAdmission(brand,context,repoRoot) {
  if(!brand)return;
  const b=admissionBinding(brand,context,repoRoot);await freshProtection(b,context,b.admissionProtection);
  admissionBinding(brand,context,repoRoot);
  if(b.currentRuntimeSha256()!==b.loadedRuntimeSha256)fail("fixture_prephase_runtime_changed");
}
function assertAdmission(brand,context,repoRoot) {
  const b=admissionBinding(brand,context,repoRoot);
  b.assertAdmissionProtection(context,b.admissionProtection);const saved=lookupAudited(proof.selector(),b);if(!saved || saved.sha256!==b.certificateSha256)fail("fixture_prephase_certificate_changed");newContext(context,saved,b);
  if(b.currentRuntimeSha256()!==b.loadedRuntimeSha256)fail("fixture_prephase_runtime_changed");
  return proof.PROFILE;
}
function assertDescriptor(brand,context,repoRoot,d) {
  if(!brand)return;const old=assertAdmission(brand,context,repoRoot);
  if(d.stageId===old.stageId || d.nonce===old.nonce || String(d.rootPath).toLowerCase()===old.rootPath.toLowerCase() || fs.existsSync(ledger.directory(repoRoot,d.stageId)) || fs.existsSync(d.rootPath))fail("fixture_prephase_new_disjoint_descriptor_required");
}
async function maintenanceQuiescence(deps) {
  async function once() {
  const status=await deps.readBridgeStatus(),runtime=await deps.readDaemonRuntime(),executor=await deps.readExecutorQuiescence(),isolation=await deps.readIssuerIsolation();executorIdle(executor,isolation);
  if(status.pendingCommands!==0 || status.inflightCommands?.length!==0 || status.activeEditSession!==null || status.projectLifecycle?.blocked || status.projectLifecycle?.pending || status.panelBootstrap?.busy || deps.hasCurrentProposal()!==false ||
    !Number.isInteger(runtime.daemon?.pid) || runtime.daemon.pid<1 || !Number.isFinite(Date.parse(runtime.daemon.startedAt)) || !ledger.SHA.test(runtime.loadedRuntimeSha256 || "") || runtime.currentRuntimeSha256!==runtime.loadedRuntimeSha256)fail("fixture_prephase_maintenance_not_idle");
  const selected=await deps.maintenanceTarget(),guard=await deps.readPanelGuard(proof.selector()),actor=abandonment.actor(selected.state);abandonment.guardState(proof.selector(),selected.state,guard,status,"lookup");
  if(!same(actor,guard?.currentBinding))fail("fixture_prephase_maintenance_actor_changed");
  const transport=await deps.readTransportAbsence(proof.selector());abandonment.transportEvidence(proof.selector(),transport);
  return {schema:SCHEMA+".maintenance-quiescence",scope:"inspection_only",currentActor:actor,daemon:runtime.daemon,runtime:{loadedRuntimeSha256:runtime.loadedRuntimeSha256,currentRuntimeSha256:runtime.currentRuntimeSha256},executor:{executing:executor.executing,pendingCount:executor.pendingCount,descriptorCount:executor.descriptorCount,outstandingAttempts:executor.outstandingAttempts},issuerIsolation:isolation,transport,bridge:{pendingCount:0,inflightCount:0,activeEditSession:null},currentProposalPresent:false,admissionGuardReleased:false,replayAllowed:false};
  }
  const a=await once(),b=await once();if(!same(a,b))fail("fixture_prephase_maintenance_bracket_changed");return b;
}
module.exports={SCHEMA,TTL,OUTCOME,fileFor,capture,publish,lookupAudited,lookup,bindAdmission,recheckAdmission,assertAdmission,assertDescriptor,maintenanceQuiescence};

"use strict";

// Addressable human abandonment of a canonical manually confirmed fixture run.
// Historical outcome remains unknown; neither receipt nor canonical run changes.
const fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto");
const ledger=require("./native-fixture-attempt-ledger"),records=require("./plan-run-records"),contract=require("../cep-panel/panel-action-contract");
const SCHEMA="ae-agent.native-fixture-abandonment.v1", OBSERVATION="ae-agent.native-fixture-recovered-observation.v1", TTL=10*60*1000;
const {fail,hash,clone,same,SHA,UUID}=ledger;
function exact(value,keys,code) {if(!value || Array.isArray(value) || Object.keys(value).sort().join(",")!==keys.sort().join(","))fail(code);}
function selector(value) {exact(value,["requestId","runId"],"fixture_abandonment_selector_invalid");if(!UUID.test(value.requestId || "") || !UUID.test(value.runId || ""))fail("fixture_abandonment_selector_invalid");return clone(value);}
function directory(root) {return path.join(root,"evidence","native-fixture-abandonment");}
function fileFor(root,kind,id) {if(!["capture","consumption","audit","disposition"].includes(kind)||!UUID.test(id || ""))fail("fixture_abandonment_file_selector_invalid");return path.join(directory(root),id+"."+kind+".json");}
function read(root,kind,id) {const file=fileFor(root,kind,id);return fs.existsSync(file) ? envelope(file,SCHEMA) : null;}
function write(file,value,metadata={}) {return ledger.writeOnce(file,value,{schema:SCHEMA+".envelope",...metadata});}
function observationFile(repoRoot,id,retirement=false) {if(!UUID.test(id || ""))fail("fixture_observation_selector_invalid");return path.join(repoRoot,".codex-runtime","ame-native-fixtures","recovered-observations",id+(retirement?".retirement":"")+".json");}
function envelope(file,schema) {
  const row=JSON.parse(ledger.readBytes(file));if(row.schema!==schema+".envelope" || !SHA.test(row.sha256 || "") || hash(row.value)!==row.sha256)fail("fixture_observation_envelope_invalid");return row;
}
function actor(state) {
  const v={panelInstanceId:state?.panelInstanceId,panelLifecycleEpoch:state?.panelLifecycleEpoch,panelGeneration:state?.panelGeneration};
  if(typeof v.panelInstanceId!=="string" || !v.panelInstanceId || !Number.isInteger(v.panelLifecycleEpoch) || v.panelLifecycleEpoch<0 || typeof v.panelGeneration!=="string" || !v.panelGeneration)fail("fixture_abandonment_actor_invalid");return v;
}
function canonical(root,s) {
  const bytes=ledger.readBytes(records.fileFor(root,s.runId)),record=records.readRecord(root,s.runId,{throwOnError:true}),r=record.run,p=record.plan.steps?.[0],step=r.steps?.[0],pv=r.provenance;
  if(record.plan.steps?.length!==1 || p?.tool!=="ame_native_fixture_probe" || !["saved-clean","saved-dirty","untitled-dirty"].includes(p.args?.fixtureKind) ||
    Object.keys(p.args).some(k=>!["fixtureKind","restoreDirty"].includes(k)) || p.args.restoreDirty!==undefined && typeof p.args.restoreDirty!=="boolean" ||
    r.steps?.length!==1 || step?.tool!==p.tool || step.status!=="failed" || r.ok!==false || r.dryRun!==false || r.outcome?.execution?.status!=="failed" || r.outcome?.mutation?.status!=="unknown" ||
    !/^fixture_[a-z0-9_]+$/.test(r.errorCode || "") || step.errorCode!==r.errorCode || typeof pv?.actionId!=="string" || !Number.isInteger(pv.proposalRevision) || pv.proposalRevision<0 ||
    r.m100Action?.actionId!==pv.actionId || r.m100Action.confirmedBySurface!=="cep-panel")fail("fixture_abandonment_canonical_scope_mismatch");
  if(hash(bytes)!==hash(ledger.readBytes(records.fileFor(root,s.runId))))fail("fixture_abandonment_canonical_changed");
  return {run:r,canonicalRunRecordHash:hash(bytes),canonicalRunProjectionHash:hash(contract.redactState(r)),fixtureKind:p.args.fixtureKind,restoreDirty:p.args.restoreDirty===true};
}
function guardEntry(s,guard,proof,currentActor) {
  const p=guard?.projection,r=proof.run;
  if(!p || p.requestId!==s.requestId || p.runId!==s.runId || p.action!=="plan.run" || p.effect!=="protected_plan_run" || p.state!=="unknown" || p.source!=="ui" ||
    p.phase!=="outcome_unresolved" || p.code!==r.errorCode || p.delivery!=="unknown" || p.replayAllowed!==false || !SHA.test(guard.signatureSha256 || "") ||
    !same(p.result?.run,contract.redactState(r)) || !same(p,contract.sanitizeReceipt(p)) || currentActor && !same(guard.currentBinding,currentActor))fail("fixture_abandonment_private_guard_mismatch");
  return {originalRequestId:s.requestId,runId:s.runId,action:p.action,effect:p.effect,actionId:r.provenance.actionId,proposalRevision:r.provenance.proposalRevision,
    originalBinding:actor({panelInstanceId:p.panelInstanceId,panelLifecycleEpoch:p.epoch,panelGeneration:p.generation}),privateSignatureSha256:guard.signatureSha256,panelReceiptHash:hash(p),
    canonicalRunRecordHash:proof.canonicalRunRecordHash,canonicalRunProjectionHash:proof.canonicalRunProjectionHash};
}
function recovered(repoRoot,id,s,proof) {
  const row=envelope(observationFile(repoRoot,id),OBSERVATION),v=row.value;
  if(v.schema!==OBSERVATION || v.observationId!==id || !same(selector(v.selector),s) || !Number.isFinite(Date.parse(v.observedAt)) ||
    v.action?.actionId!==proof.run.provenance.actionId || v.action.proposalRevision!==proof.run.provenance.proposalRevision ||
    v.provenance?.kind!=="root_recovered_observation" || v.provenance.nativeLaunchReceipt!==false || v.provenance.nativeBootReceipt!==false || v.provenance.nativeExecutionProven!==false ||
    !SHA.test(v.runtime?.loadedRuntimeSha256 || "") || !SHA.test(v.runtime?.currentRuntimeSha256 || "") || proof.run.provenance.runtime?.sourceSha256!==v.runtime.loadedRuntimeSha256 ||
    !Number.isInteger(v.runtime?.daemon?.pid) || !Number.isFinite(Date.parse(v.runtime?.daemon?.startedAt)))fail("fixture_observation_binding_invalid");
  const entry=guardEntry(s,v.guard,proof),d=ledger.descriptor(repoRoot,v.attempt?.descriptor),process=ledger.processIdentity(v.attempt?.process,d);
  if(v.attempt.retainedUnknown!==true || !same(v.guard.currentBinding,actor(v.guard.currentBinding)))fail("fixture_observation_binding_invalid");
  // Historical root is immutable and explicitly labelled as the old layout.
  const files=v.files || v.attempt.files;
  if(files) {
    exact(files,["launch.manifest","server-launch-attempt.json","server-owner.json"],"fixture_observation_historical_layout_invalid");
    if(!same(fs.readdirSync(d.rootPath).sort(),Object.keys(files).sort()))fail("fixture_observation_historical_layout_changed");
    for(const [name,digest] of Object.entries(files))if(!SHA.test(digest) || hash(ledger.readBytes(path.join(d.rootPath,name)))!==digest)fail("fixture_observation_historical_file_changed");
    if(v.moduleObservation?.loaded!==true || v.moduleObservation.loadedPath!==d.pluginPath || v.moduleObservation.sha256!==d.pluginSha256)fail("fixture_observation_historical_module_binding_invalid");
    const owner=JSON.parse(ledger.readBytes(path.join(d.rootPath,"server-owner.json"))),launch=JSON.parse(ledger.readBytes(path.join(d.rootPath,"server-launch-attempt.json")));
    if(owner.schema!=="ae-agent.native-fixture-owner.v2" || owner.rootPath!==d.rootPath || owner.stageId!==d.stageId || owner.nonce!==d.nonce || owner.role!==d.role ||
      launch.runId!==s.runId || launch.stageId!==d.stageId || launch.nonce!==d.nonce || launch.role!==d.role || launch.pluginSha256!==d.pluginSha256 || launch.executableSha256!==d.executableSha256 || launch.replayAllowed!==false)fail("fixture_observation_historical_owner_mismatch");
  } else {
    const reservation=ledger.read(ledger.fileFor(repoRoot,d.stageId,"reservation")),launched=ledger.read(ledger.fileFor(repoRoot,d.stageId,"launch"));
    if(!reservation || !launched || !same(reservation.value.descriptor,d) || reservation.value.runId!==s.runId || !same(launched.value.process,process))fail("fixture_observation_durable_launch_required");
  }
  return {row,value:v,entry,descriptor:d,process};
}
function retirement(repoRoot,observation) {
  const file=observationFile(repoRoot,observation.value.observationId,true);
  if(fs.existsSync(file)) {
    const row=envelope(file,"ae-agent.native-fixture-retirement-proof.v1"),p=row.value;
    if(p.observationId!==observation.value.observationId || !same(p.selector,observation.value.selector))fail("fixture_retirement_observation_binding_invalid");
    ledger.validateRetirement(p,observation.process);return {sha256:row.sha256,proof:p};
  }
  const row=ledger.read(ledger.fileFor(repoRoot,observation.descriptor.stageId,"retirement-proof"));
  if(!row)return null;ledger.validateRetirement(row.value,observation.process);return {sha256:row.sha256,proof:row.value};
}
function runtime(v) {
  if(!v || !Number.isInteger(v.daemon?.pid) || v.daemon.pid<1 || !Number.isFinite(Date.parse(v.daemon.startedAt)) || !SHA.test(v.loadedRuntimeSha256 || "") ||
    v.currentRuntimeSha256!==v.loadedRuntimeSha256 || !v.panelAssetHashes || !SHA.test(v.panelAssetHashes["panel-actions.js"] || "") || !SHA.test(v.panelAssetHashes["panel.js"] || "") ||
    Object.values(v.panelAssetHashes).some(h=>!SHA.test(h)))fail("fixture_abandonment_runtime_changed");return clone(v);
}
async function snapshot(deps,s,id,mode="capture") {
  for(const name of ["maintenanceTarget","readPanelGuard","readBridgeStatus","readRuntimeIdentity","readTransportAbsence","readExecutorQuiescence","readChildState"])if(typeof deps[name]!=="function")fail("fixture_abandonment_backend_reader_required");
  const selected=await deps.maintenanceTarget(),currentActor=actor(selected.state),proof=canonical(deps.evidenceRoot,s),obs=recovered(deps.repoRoot,id,s,proof),guard=await deps.readPanelGuard(s);
  const entry=guardEntry(s,guard,proof,currentActor);
  if(!same(entry,obs.entry))fail("fixture_abandonment_original_guard_drift");
  const status=await deps.readBridgeStatus(),p=selected.state;
  if(status.pendingCommands!==0 || status.inflightCommands?.length!==0 || status.activeEditSession!==null || status.projectLifecycle?.blocked || status.projectLifecycle?.pending || status.panelBootstrap?.busy ||
    guard.controllerIdle!==true || p.activeAction!==null || p.recoveryTransport || p.actionStorage!=="ready")fail("fixture_abandonment_writer_not_idle");
  if(!Array.isArray(p.unresolvedActions) || p.unresolvedActions.filter(r=>r.requestId===s.requestId).some(r=>r.runId!==s.runId || r.action!=="plan.run" || r.effect!=="protected_plan_run") ||
    mode!=="lookup" && p.unresolvedActions.filter(r=>r.requestId===s.requestId).length!==1)fail("fixture_abandonment_guard_scope_mismatch");
  const transport=await deps.readTransportAbsence(s);
  if(!transport || transport.requestId!==s.requestId || transport.originalReceiptAbsent!==true || transport.pendingCount!==0 || transport.inflightCount!==0)fail("fixture_abandonment_transport_not_absent");
  const executor=await deps.readExecutorQuiescence(),exit=retirement(deps.repoRoot,obs),child=await deps.readChildState(obs.descriptor,obs.process,obs.value.files || obs.value.attempt.files ? "historical_cim" : "trusted_process_handle");
  if(executor?.executing!==false)fail("fixture_abandonment_executor_active_or_unknown");
  if(!exit && (obs.value.controller?.executing!==false || !Number.isInteger(obs.value.controller?.pendingCount) || !Number.isInteger(obs.value.controller?.descriptorCount)))fail("fixture_abandonment_historical_exit_proof_required");
  if(child?.status==="identity_mismatch" || child?.status==="unknown" || !exit && child?.status!=="alive_exact")fail("fixture_abandonment_child_identity_or_exit_unknown");
  if(exit && child?.status==="alive_exact")fail("fixture_abandonment_exit_proof_conflicts_with_alive_child");
  const live=runtime(await deps.readRuntimeIdentity());
  if(typeof selected.target?.url!=="string" || !selected.target.url.startsWith("file:///") || !/^ws:\/\/127\.0\.0\.1:8870\/devtools\/page\/[A-Za-z0-9_-]+$/.test(selected.target.webSocketDebuggerUrl || "") ||
    !selected.installed?.indexPath || !same(selected.installed.hashes,live.panelAssetHashes))fail("fixture_abandonment_frame_source_mismatch");
  const after=await deps.maintenanceTarget();
  if(!same(actor(after.state),currentActor) || !same(after.target,selected.target) || !same(after.installed,selected.installed))fail("fixture_abandonment_actor_or_frame_changed");
  return {selector:s,observationId:id,observationSha256:obs.row.sha256,entry,currentActor,target:clone(selected.target),installed:clone(selected.installed),runtime:live,
    historicalObservedRuntime:clone(obs.value.runtime),descriptor:obs.descriptor,process:obs.process,exit,child:clone(child),executor:clone(executor),transport:clone(transport)};
}
async function bracket(deps,s,id,mode) {const a=await snapshot(deps,s,id,mode),b=await snapshot(deps,s,id,mode);if(!same(a,b))fail("fixture_abandonment_fresh_bracket_changed");return b;}
function reserved(root,id) {return ["consumption","audit","disposition"].some(k=>fs.existsSync(fileFor(root,k,id)));}
const now=deps=>deps.now ? deps.now() : Date.now();
async function capture(input,deps) {
  exact(input,["selector","observationId"],"fixture_abandonment_client_evidence_forbidden");const s=selector(input.selector);
  if(!UUID.test(input.observationId || ""))fail("fixture_observation_selector_invalid");if(reserved(deps.evidenceRoot,s.requestId))fail("fixture_abandonment_already_consumed");
  const observed=await bracket(deps,s,input.observationId,"capture"),time=now(deps),value={schema:SCHEMA+".capture",captureId:crypto.randomUUID(),createdAt:new Date(time).toISOString(),expiresAt:new Date(time+TTL).toISOString(),observed};
  return write(fileFor(deps.evidenceRoot,"capture",value.captureId),value);
}
function captureValid(row,id,time) {const c=row?.value,start=Date.parse(c?.createdAt);if(!c || c.schema!==SCHEMA+".capture" || c.captureId!==id || !Number.isFinite(start) || Date.parse(c.expiresAt)!==start+TTL || time<start || time>=start+TTL)fail("fixture_abandonment_capture_stale_or_invalid");return c;}
async function authorize(input,deps) {
  exact(input,["captureId","confirmation","authorizationSource","reason"],"fixture_abandonment_explicit_confirmation_required");
  if(!UUID.test(input.captureId || "") || input.confirmation!==true || input.authorizationSource!=="explicit_user_chat" || typeof input.reason!=="string" || !input.reason.trim() || input.reason.length>2000)fail("fixture_abandonment_explicit_confirmation_required");
  const captured=read(deps.evidenceRoot,"capture",input.captureId),c=captureValid(captured,input.captureId,now(deps)),s=selector(c.observed.selector);
  if(reserved(deps.evidenceRoot,s.requestId))fail("fixture_abandonment_already_consumed");
  if(!same(await bracket(deps,s,c.observed.observationId,"capture"),c.observed))fail("fixture_abandonment_capture_drift");
  if(typeof deps.acquireWriterLock!=="function")fail("fixture_abandonment_writer_lock_required");const lock=await deps.acquireWriterLock();if(typeof lock?.release!=="function")fail("fixture_abandonment_writer_lock_required");
  try {
    if(reserved(deps.evidenceRoot,s.requestId))fail("fixture_abandonment_already_consumed");captureValid(captured,input.captureId,now(deps));
    if(!same(await bracket(deps,s,c.observed.observationId,"capture"),c.observed))fail("fixture_abandonment_locked_bracket_changed");
    const createdAt=new Date(now(deps)).toISOString(),dispositionId=crypto.randomUUID();
    const consumption=write(fileFor(deps.evidenceRoot,"consumption",s.requestId),{schema:SCHEMA+".consumption",captureId:c.captureId,captureSha256:captured.sha256,selector:s,dispositionId,createdAt,replayAllowed:false});
    const value={schema:SCHEMA,dispositionId,createdAt,captureId:c.captureId,captureSha256:captured.sha256,selector:s,observationId:c.observed.observationId,observationSha256:c.observed.observationSha256,
      status:"abandoned_reviewed",guardDisposition:"released",historicalOutcome:"unknown",nativeExecutionProven:false,replayAllowed:false,authorizationSource:input.authorizationSource,reason:input.reason.trim(),entry:c.observed.entry};
    const audit=write(fileFor(deps.evidenceRoot,"audit",s.requestId),{schema:SCHEMA+".audit",dispositionId,createdAt,captureId:c.captureId,captureSha256:captured.sha256,consumptionSha256:consumption.sha256,
      dispositionSha256:hash(value),confirmation:true,authorizationSource:value.authorizationSource,reason:value.reason,observed:c.observed});
    const saved=write(fileFor(deps.evidenceRoot,"disposition",s.requestId),value,{auditSha256:audit.sha256,consumptionSha256:consumption.sha256});
    // Intake is explicitly historical; it is never upgraded to a launch receipt.
    const recoveredFile=ledger.fileFor(deps.repoRoot,c.observed.descriptor.stageId,"recovered");
    if(!fs.existsSync(recoveredFile))ledger.writeOnce(recoveredFile,{schema:SCHEMA+".recovered-attempt",descriptor:c.observed.descriptor,runId:s.runId,observationSha256:c.observed.observationSha256,producer:"root_recovered_observation",replayAllowed:false});
    if(c.observed.exit)ledger.auditRetirement(deps.repoRoot,c.observed.descriptor,c.observed.process,c.observed.exit.proof,{dispositionSha256:saved.sha256,auditSha256:audit.sha256,observationSha256:c.observed.observationSha256,
      dispositionPath:fileFor(deps.evidenceRoot,"disposition",s.requestId),auditPath:fileFor(deps.evidenceRoot,"audit",s.requestId),observationPath:observationFile(deps.repoRoot,c.observed.observationId)});
    return saved;
  } finally {await lock.release();}
}
function lookupAudited(input,deps) {
  const s=selector(input),saved=read(deps.evidenceRoot,"disposition",s.requestId);
  if(!saved){if(reserved(deps.evidenceRoot,s.requestId))fail("fixture_abandonment_partial_audit");return null;}
  const v=saved.value,audit=read(deps.evidenceRoot,"audit",s.requestId),consumption=read(deps.evidenceRoot,"consumption",s.requestId),captured=UUID.test(v?.captureId || "") && read(deps.evidenceRoot,"capture",v.captureId);
  if(!audit || !consumption || !captured || v.schema!==SCHEMA || !same(v.selector,s) || v.status!=="abandoned_reviewed" || v.guardDisposition!=="released" || v.historicalOutcome!=="unknown" || v.nativeExecutionProven!==false || v.replayAllowed!==false ||
    v.authorizationSource!=="explicit_user_chat" || !v.reason || saved.auditSha256!==audit.sha256 || saved.consumptionSha256!==consumption.sha256 || audit.value.schema!==SCHEMA+".audit" || consumption.value.schema!==SCHEMA+".consumption" ||
    audit.value.dispositionSha256!==saved.sha256 || audit.value.consumptionSha256!==consumption.sha256 || audit.value.confirmation!==true || audit.value.reason!==v.reason || audit.value.authorizationSource!==v.authorizationSource ||
    [audit.value,consumption.value].some(r=>r.dispositionId!==v.dispositionId || r.captureId!==v.captureId || r.captureSha256!==captured.sha256) || captured.sha256!==v.captureSha256 || !same(audit.value.observed,captured.value.observed) ||
    !same(v.entry,captured.value.observed.entry))fail("fixture_abandonment_audit_invalid");
  const proof=canonical(deps.evidenceRoot,s),obs=recovered(deps.repoRoot,v.observationId,s,proof);
  if(!same(obs.entry,v.entry) || obs.row.sha256!==v.observationSha256)fail("fixture_abandonment_original_guard_drift");
  return saved;
}
async function lookup(input,deps) {
  const s=selector(input),saved=lookupAudited(s,deps);if(!saved)return null;const v=saved.value;
  const fresh=await bracket(deps,s,v.observationId,"lookup");if(!same(fresh.entry,v.entry) || fresh.observationSha256!==v.observationSha256)fail("fixture_abandonment_original_guard_drift");
  return {...saved,readBack:{schema:SCHEMA+".read-back",dispositionSha256:saved.sha256,entrySha256:hash(v.entry),currentActor:fresh.currentActor,runtime:fresh.runtime,installed:fresh.installed,nativeAdmissionBlocked:!ledger.validRetirement(deps.repoRoot,fresh.descriptor)}};
}
async function retire(input,deps) {
  const s=selector(input),saved=await lookup(s,deps);if(!saved)fail("fixture_retirement_audited_abandonment_required");
  const audit=read(deps.evidenceRoot,"audit",s.requestId),fresh=await bracket(deps,s,saved.value.observationId,"lookup");
  if(!fresh.exit)fail("fixture_retirement_positive_exit_proof_required");
  const lock=await deps.acquireWriterLock();if(typeof lock?.release!=="function")fail("fixture_abandonment_writer_lock_required");
  try {
    if(!same(await bracket(deps,s,saved.value.observationId,"lookup"),fresh))fail("fixture_abandonment_locked_bracket_changed");
    if(ledger.validRetirement(deps.repoRoot,fresh.descriptor))return saved;
    ledger.auditRetirement(deps.repoRoot,fresh.descriptor,fresh.process,fresh.exit.proof,{dispositionSha256:saved.sha256,auditSha256:audit.sha256,observationSha256:fresh.observationSha256,
      dispositionPath:fileFor(deps.evidenceRoot,"disposition",s.requestId),auditPath:fileFor(deps.evidenceRoot,"audit",s.requestId),observationPath:observationFile(deps.repoRoot,saved.value.observationId)});
    return saved;
  } finally {await lock.release();}
}
module.exports={SCHEMA,OBSERVATION,TTL,selector,directory,fileFor,observationFile,envelope,canonical,recovered,retirement,capture,authorize,lookupAudited,lookup,retire,hash};

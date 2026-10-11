"use strict";

// Addressable human abandonment of a canonical manually confirmed fixture run.
// Historical outcome remains unknown; neither receipt nor canonical run changes.
const fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto");
const ledger=require("./native-fixture-attempt-ledger"),records=require("./plan-run-records"),contract=require("../cep-panel/panel-action-contract");
const SCHEMA="ae-agent.native-fixture-abandonment.v1", OBSERVATION="ae-agent.native-fixture-recovered-observation.v1", TTL=10*60*1000;
const GROUP="ae-agent.native-fixture-abandonment-attempt-group.v1";
const {fail,hash,clone,same,SHA,UUID}=ledger;
function exact(value,keys,code) {if(!value || Array.isArray(value) || Object.keys(value).sort().join(",")!==keys.sort().join(","))fail(code);}
function selector(value) {exact(value,["requestId","runId"],"fixture_abandonment_selector_invalid");if(!UUID.test(value.requestId || "") || !UUID.test(value.runId || ""))fail("fixture_abandonment_selector_invalid");return clone(value);}
function directory(root) {return path.join(root,"evidence","native-fixture-abandonment");}
function fileFor(root,kind,id) {if(!["capture","consumption","audit","disposition","group-retirement"].includes(kind)||!UUID.test(id || ""))fail("fixture_abandonment_file_selector_invalid");return path.join(directory(root),id+"."+kind+".json");}
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
    if(!reservation || !launched || !same(reservation.value.descriptor,d) || reservation.value.runId!==s.runId || !same(launched.value.process,process) ||
      v.attempt.reservationSha256 && v.attempt.reservationSha256!==reservation.sha256 || v.attempt.launchSha256 && v.attempt.launchSha256!==launched.sha256)fail("fixture_observation_durable_launch_required");
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
function requireSnapshotReaders(deps) {
  for(const name of ["maintenanceTarget","readPanelGuard","readBridgeStatus","readRuntimeIdentity","readTransportAbsence","readExecutorQuiescence","readChildState"])if(typeof deps[name]!=="function")fail("fixture_abandonment_backend_reader_required");
}
function guardState(s,p,guard,status,mode) {
  if(status.pendingCommands!==0 || status.inflightCommands?.length!==0 || status.activeEditSession!==null || status.projectLifecycle?.blocked || status.projectLifecycle?.pending || status.panelBootstrap?.busy ||
    guard.controllerIdle!==true || p.activeAction!==null || p.recoveryTransport || p.actionStorage!=="ready")fail("fixture_abandonment_writer_not_idle");
  if(!Array.isArray(p.unresolvedActions) || p.unresolvedActions.filter(r=>r.requestId===s.requestId).some(r=>r.runId!==s.runId || r.action!=="plan.run" || r.effect!=="protected_plan_run") ||
    mode!=="lookup" && p.unresolvedActions.filter(r=>r.requestId===s.requestId).length!==1)fail("fixture_abandonment_guard_scope_mismatch");
}
function transportEvidence(s,transport) {
  if(!transport || transport.requestId!==s.requestId || transport.originalReceiptAbsent!==true || transport.pendingCount!==0 || transport.inflightCount!==0)fail("fixture_abandonment_transport_not_absent");
}
function childEvidence(obs,executor,exit,child) {
  if(executor?.executing!==false)fail("fixture_abandonment_executor_active_or_unknown");
  if(!exit && (obs.value.controller?.executing!==false || !Number.isInteger(obs.value.controller?.pendingCount) || !Number.isInteger(obs.value.controller?.descriptorCount)))fail("fixture_abandonment_historical_exit_proof_required");
  if(child?.status==="identity_mismatch" || child?.status==="unknown" || !exit && child?.status!=="alive_exact")fail("fixture_abandonment_child_identity_or_exit_unknown");
  if(exit && child?.status==="alive_exact")fail("fixture_abandonment_exit_proof_conflicts_with_alive_child");
}
function frameEvidence(selected,live) {
  if(typeof selected.target?.url!=="string" || !selected.target.url.startsWith("file:///") || !/^ws:\/\/127\.0\.0\.1:8870\/devtools\/page\/[A-Za-z0-9_-]+$/.test(selected.target.webSocketDebuggerUrl || "") ||
    !selected.installed?.indexPath || !same(selected.installed.hashes,live.panelAssetHashes))fail("fixture_abandonment_frame_source_mismatch");
}
function sameTarget(selected,after,currentActor) {
  if(!same(actor(after.state),currentActor) || !same(after.target,selected.target) || !same(after.installed,selected.installed))fail("fixture_abandonment_actor_or_frame_changed");
}
async function snapshot(deps,s,id,mode="capture") {
  requireSnapshotReaders(deps);
  const selected=await deps.maintenanceTarget(),currentActor=actor(selected.state),proof=canonical(deps.evidenceRoot,s),obs=recovered(deps.repoRoot,id,s,proof),guard=await deps.readPanelGuard(s);
  const entry=guardEntry(s,guard,proof,currentActor);
  if(!same(entry,obs.entry))fail("fixture_abandonment_original_guard_drift");
  const status=await deps.readBridgeStatus();guardState(s,selected.state,guard,status,mode);
  const transport=await deps.readTransportAbsence(s);transportEvidence(s,transport);
  const executor=await deps.readExecutorQuiescence(),exit=retirement(deps.repoRoot,obs),child=await deps.readChildState(obs.descriptor,obs.process,obs.value.files || obs.value.attempt.files ? "historical_cim" : "trusted_process_handle");childEvidence(obs,executor,exit,child);
  const live=runtime(await deps.readRuntimeIdentity());frameEvidence(selected,live);
  const after=await deps.maintenanceTarget();sameTarget(selected,after,currentActor);
  return {selector:s,observationId:id,observationSha256:obs.row.sha256,entry,currentActor,target:clone(selected.target),installed:clone(selected.installed),runtime:live,
    historicalObservedRuntime:clone(obs.value.runtime),descriptor:obs.descriptor,process:obs.process,exit,child:clone(child),executor:clone(executor),transport:clone(transport)};
}
// A round owns its common evidence. Nothing is cached across rounds or requests;
// each member retains its independent recovered identity, held exit proof and
// fresh child-state read. Boundary reads also catch drift during the other child.
async function groupMembers(deps,s,ids,mode,proof) {
  requireSnapshotReaders(deps);
  const selected=await deps.maintenanceTarget(),currentActor=actor(selected.state),observations=ids.map(id=>recovered(deps.repoRoot,id,s,proof)),guard=await deps.readPanelGuard(s),entry=guardEntry(s,guard,proof,currentActor);
  if(observations.some(obs=>!same(entry,obs.entry)))fail("fixture_abandonment_original_guard_drift");
  const status=await deps.readBridgeStatus();guardState(s,selected.state,guard,status,mode);
  const transport=await deps.readTransportAbsence(s);transportEvidence(s,transport);
  const executor=await deps.readExecutorQuiescence(),members=[];
  for(const obs of observations) {
    const exit=retirement(deps.repoRoot,obs),child=await deps.readChildState(obs.descriptor,obs.process,obs.value.files || obs.value.attempt.files ? "historical_cim" : "trusted_process_handle");childEvidence(obs,executor,exit,child);
    members.push({selector:s,observationId:obs.value.observationId,observationSha256:obs.row.sha256,entry,currentActor,target:clone(selected.target),installed:clone(selected.installed),runtime:null,
      historicalObservedRuntime:clone(obs.value.runtime),descriptor:obs.descriptor,process:obs.process,exit,child:clone(child),executor:clone(executor),transport:clone(transport)});
  }
  const live=runtime(await deps.readRuntimeIdentity());frameEvidence(selected,live);
  const finalStatus=await deps.readBridgeStatus(),finalTransport=await deps.readTransportAbsence(s);transportEvidence(s,finalTransport);
  if(!same(finalTransport,transport))fail("fixture_abandonment_group_observation_drift");
  const finalGuard=await deps.readPanelGuard(s);
  const after=await deps.maintenanceTarget();sameTarget(selected,after,currentActor);
  guardState(s,after.state,finalGuard,finalStatus,mode);
  if(!same(guardEntry(s,finalGuard,proof,currentActor),entry))fail("fixture_abandonment_original_guard_drift");
  for(const member of members) {
    const fresh=recovered(deps.repoRoot,member.observationId,s,proof),exit=retirement(deps.repoRoot,fresh);
    if(fresh.row.sha256!==member.observationSha256 || !same(fresh.descriptor,member.descriptor) || !same(fresh.process,member.process) || !same(exit,member.exit))fail("fixture_abandonment_group_member_changed");
    member.runtime=clone(live);
  }
  return members;
}
async function bracket(deps,s,id,mode) {const a=await snapshot(deps,s,id,mode),b=await snapshot(deps,s,id,mode);if(!same(a,b))fail("fixture_abandonment_fresh_bracket_changed");return b;}
function inventoryContext(s,proof) {return {runId:s.runId,actionId:proof.run.provenance.actionId,proposalRevision:proof.run.provenance.proposalRevision,payloadHash:proof.run.provenance.payloadHash || null};}
function fullInventory(deps,s,proof) {
  const context=inventoryContext(s,proof),inventory=ledger.attemptInventory(deps.repoRoot,context),selectors=inventory.map(e=>({stageId:e.descriptor.stageId,role:e.descriptor.role,runId:s.runId,replayAllowed:false}));
  const nested=proof.run.steps[0].result?.nativeAttempts,optional=nested!==undefined ? nested : proof.run.steps[0].nativeAttempts;
  if(optional!==undefined && !same(optional,selectors))fail("fixture_abandonment_canonical_attempt_inventory_mismatch");
  return {schema:GROUP,context,inventory,inventorySha256:hash(inventory)};
}
function observationIds(value) {return value.attemptGroup ? value.attempts.map(v=>v.observationId) : [value.observationId];}
function attempts(value) {return value.attemptGroup ? value.attempts : [value];}
function observationBinding(value) {return value.attemptGroup ? {attemptGroup:value.attemptGroup,observationIds:observationIds(value),observationHashes:value.attempts.map(v=>v.observationSha256)} : {observationId:value.observationId,observationSha256:value.observationSha256};}
function sameObservationBinding(value,observed) {
  const expected=observationBinding(observed);
  return observed.attemptGroup ? value.observationId===undefined && value.observationSha256===undefined && same(value.attemptGroup,expected.attemptGroup) && same(value.observationIds,expected.observationIds) && same(value.observationHashes,expected.observationHashes) :
    value.attemptGroup===undefined && value.observationIds===undefined && value.observationHashes===undefined && value.observationId===expected.observationId && value.observationSha256===expected.observationSha256;
}
async function setSnapshot(deps,s,ids,mode) {
  const proof=canonical(deps.evidenceRoot,s),before=fullInventory(deps,s,proof),members=ids.length===1 ? [await snapshot(deps,s,ids[0],mode)] : await groupMembers(deps,s,ids,mode,proof);
  members.sort((a,b)=>a.descriptor.role.localeCompare(b.descriptor.role));
  const finalProof=canonical(deps.evidenceRoot,s);
  if(ids.length!==1 && proof.canonicalRunRecordHash!==finalProof.canonicalRunRecordHash)fail("fixture_abandonment_canonical_changed");
  if(!same(before,fullInventory(deps,s,finalProof)))fail("fixture_abandonment_attempt_inventory_changed");
  if(ids.length===1) {
    if(before.inventory.length>1 || before.inventory.length===1 && !same(before.inventory[0].descriptor,members[0].descriptor))fail("fixture_abandonment_full_attempt_set_required");
    return members[0];
  }
  if(ids.length!==2 || before.inventory.length!==2 || before.inventory.some(e=>e.legacyLayout) || !same(members.map(m=>m.descriptor),before.inventory.map(e=>e.descriptor)) ||
    !same(members.map(m=>m.process),before.inventory.map(e=>e.process)) || members.some(m=>!m.exit))fail("fixture_abandonment_full_attempt_set_and_exit_required");
  const first=members[0];
  for(const member of members)for(const field of ["entry","currentActor","target","installed","runtime","executor","transport"])if(!same(member[field],first[field]))fail("fixture_abandonment_group_observation_drift");
  return {selector:s,attemptGroup:before,attempts:members,entry:first.entry,currentActor:first.currentActor,target:first.target,installed:first.installed,runtime:first.runtime,executor:first.executor,transport:first.transport};
}
async function setBracket(deps,s,ids,mode) {const a=await setSnapshot(deps,s,ids,mode),b=await setSnapshot(deps,s,ids,mode);if(!same(a,b))fail("fixture_abandonment_fresh_bracket_changed");return b;}
function publishRetirement(deps,s,observed,saved,audit) {
  const members=[];
  for(const member of attempts(observed)) {
    const recoveredFile=ledger.fileFor(deps.repoRoot,member.descriptor.stageId,"recovered"),recoveredValue={schema:SCHEMA+".recovered-attempt",descriptor:member.descriptor,runId:s.runId,observationSha256:member.observationSha256,producer:"root_recovered_observation",replayAllowed:false};
    const existing=ledger.read(recoveredFile);
    if(!existing)ledger.writeOnce(recoveredFile,recoveredValue);else if(!same(existing.value,recoveredValue))fail("fixture_abandonment_recovered_attempt_changed");
    if(!member.exit)continue;
    const authority={dispositionSha256:saved.sha256,auditSha256:audit.sha256,observationSha256:member.observationSha256,
      dispositionPath:fileFor(deps.evidenceRoot,"disposition",s.requestId),auditPath:fileFor(deps.evidenceRoot,"audit",s.requestId),observationPath:observationFile(deps.repoRoot,member.observationId)};
    if(observed.attemptGroup)Object.assign(authority,{groupRetirementPath:fileFor(deps.evidenceRoot,"group-retirement",s.requestId),groupInventorySha256:observed.attemptGroup.inventorySha256});
    const retired=ledger.auditRetirement(deps.repoRoot,member.descriptor,member.process,member.exit.proof,authority);
    members.push({stageId:member.descriptor.stageId,retirementAuditSha256:retired.sha256,observationId:member.observationId,observationSha256:member.observationSha256});
  }
  // No member's retirement opens admission, and no grouped disposition releases
  // its guard, until both write-once retirement audits have a final commit record.
  if(observed.attemptGroup) {
    if(members.length!==2)fail("fixture_retirement_group_partial");
    write(fileFor(deps.evidenceRoot,"group-retirement",s.requestId),{schema:GROUP+".retirement",selector:s,inventorySha256:observed.attemptGroup.inventorySha256,dispositionSha256:saved.sha256,auditSha256:audit.sha256,members,
      historicalOutcome:"unknown",nativeExecutionProven:false,replayAllowed:false});
  }
}
function reserved(root,id) {return ["consumption","audit","disposition"].some(k=>fs.existsSync(fileFor(root,k,id)));}
const now=deps=>deps.now ? deps.now() : Date.now();
async function capture(input,deps) {
  if(input && Object.keys(input).length===1 && input.selector)return require("./native-fixture-retained").capture(input,deps);
  exact(input,input?.observationIds ? ["selector","observationIds"] : ["selector","observationId"],"fixture_abandonment_client_evidence_forbidden");const s=selector(input.selector),ids=input.observationIds || [input.observationId];
  if(!Array.isArray(ids) || input.observationIds && ids.length!==2 || ids.some(id=>!UUID.test(id || "")) || new Set(ids).size!==ids.length)fail("fixture_observation_selector_invalid");if(reserved(deps.evidenceRoot,s.requestId))fail("fixture_abandonment_already_consumed");
  const observed=await setBracket(deps,s,ids,"capture"),time=now(deps),value={schema:SCHEMA+".capture",captureId:crypto.randomUUID(),createdAt:new Date(time).toISOString(),expiresAt:new Date(time+TTL).toISOString(),observed};
  return write(fileFor(deps.evidenceRoot,"capture",value.captureId),value);
}
function captureValid(row,id,time) {const c=row?.value,start=Date.parse(c?.createdAt);if(!c || c.schema!==SCHEMA+".capture" || c.captureId!==id || !Number.isFinite(start) || Date.parse(c.expiresAt)!==start+TTL || time<start || time>=start+TTL)fail("fixture_abandonment_capture_stale_or_invalid");return c;}
async function authorize(input,deps) {
  if(input && Object.keys(input).length===1 && input.captureId)return require("./native-fixture-retained").authorize(input,deps);
  exact(input,["captureId","confirmation","authorizationSource","reason"],"fixture_abandonment_explicit_confirmation_required");
  if(!UUID.test(input.captureId || "") || input.confirmation!==true || input.authorizationSource!=="explicit_user_chat" || typeof input.reason!=="string" || !input.reason.trim() || input.reason.length>2000)fail("fixture_abandonment_explicit_confirmation_required");
  const captured=read(deps.evidenceRoot,"capture",input.captureId),c=captureValid(captured,input.captureId,now(deps)),s=selector(c.observed.selector);
  if(reserved(deps.evidenceRoot,s.requestId))fail("fixture_abandonment_already_consumed");
  if(!same(await setBracket(deps,s,observationIds(c.observed),"capture"),c.observed))fail("fixture_abandonment_capture_drift");
  if(typeof deps.acquireWriterLock!=="function")fail("fixture_abandonment_writer_lock_required");const lock=await deps.acquireWriterLock();if(typeof lock?.release!=="function")fail("fixture_abandonment_writer_lock_required");
  try {
    if(reserved(deps.evidenceRoot,s.requestId))fail("fixture_abandonment_already_consumed");captureValid(captured,input.captureId,now(deps));
    if(!same(await setBracket(deps,s,observationIds(c.observed),"capture"),c.observed))fail("fixture_abandonment_locked_bracket_changed");
    const createdAt=new Date(now(deps)).toISOString(),dispositionId=crypto.randomUUID();
    const consumption=write(fileFor(deps.evidenceRoot,"consumption",s.requestId),{schema:SCHEMA+".consumption",captureId:c.captureId,captureSha256:captured.sha256,selector:s,dispositionId,createdAt,replayAllowed:false});
    const value={schema:SCHEMA,dispositionId,createdAt,captureId:c.captureId,captureSha256:captured.sha256,selector:s,...observationBinding(c.observed),
      status:"abandoned_reviewed",guardDisposition:"released",historicalOutcome:"unknown",nativeExecutionProven:false,replayAllowed:false,authorizationSource:input.authorizationSource,reason:input.reason.trim(),entry:c.observed.entry};
    const audit=write(fileFor(deps.evidenceRoot,"audit",s.requestId),{schema:SCHEMA+".audit",dispositionId,createdAt,captureId:c.captureId,captureSha256:captured.sha256,consumptionSha256:consumption.sha256,
      dispositionSha256:hash(value),confirmation:true,authorizationSource:value.authorizationSource,reason:value.reason,observed:c.observed});
    const saved=write(fileFor(deps.evidenceRoot,"disposition",s.requestId),value,{auditSha256:audit.sha256,consumptionSha256:consumption.sha256});
    publishRetirement(deps,s,c.observed,saved,audit);
    return saved;
  } finally {await lock.release();}
}
function lookupAudited(input,deps) {
  const retained=require("./native-fixture-retained");
  if(retained.read(deps.evidenceRoot,"disposition",selector(input).requestId))return retained.lookupAudited(input,deps);
  const s=selector(input),saved=read(deps.evidenceRoot,"disposition",s.requestId);
  if(!saved){if(reserved(deps.evidenceRoot,s.requestId))fail("fixture_abandonment_partial_audit");return null;}
  const v=saved.value,audit=read(deps.evidenceRoot,"audit",s.requestId),consumption=read(deps.evidenceRoot,"consumption",s.requestId),captured=UUID.test(v?.captureId || "") && read(deps.evidenceRoot,"capture",v.captureId);
  if(!audit || !consumption || !captured || v.schema!==SCHEMA || !same(v.selector,s) || v.status!=="abandoned_reviewed" || v.guardDisposition!=="released" || v.historicalOutcome!=="unknown" || v.nativeExecutionProven!==false || v.replayAllowed!==false ||
    v.authorizationSource!=="explicit_user_chat" || !v.reason || saved.auditSha256!==audit.sha256 || saved.consumptionSha256!==consumption.sha256 || audit.value.schema!==SCHEMA+".audit" || consumption.value.schema!==SCHEMA+".consumption" ||
    audit.value.dispositionSha256!==saved.sha256 || audit.value.consumptionSha256!==consumption.sha256 || audit.value.confirmation!==true || audit.value.reason!==v.reason || audit.value.authorizationSource!==v.authorizationSource ||
    [audit.value,consumption.value].some(r=>r.dispositionId!==v.dispositionId || r.captureId!==v.captureId || r.captureSha256!==captured.sha256) || captured.sha256!==v.captureSha256 || !same(audit.value.observed,captured.value.observed) ||
    !same(v.entry,captured.value.observed.entry))fail("fixture_abandonment_audit_invalid");
  if(!sameObservationBinding(v,captured.value.observed))fail("fixture_abandonment_observation_binding_invalid");
  const proof=canonical(deps.evidenceRoot,s),observed=captured.value.observed;
  for(const member of attempts(observed)) {const obs=recovered(deps.repoRoot,member.observationId,s,proof);if(!same(obs.entry,v.entry) || obs.row.sha256!==member.observationSha256)fail("fixture_abandonment_original_guard_drift");}
  if(observed.attemptGroup) {
    if(!same(fullInventory(deps,s,proof),observed.attemptGroup) || attempts(observed).some(m=>!ledger.validRetirement(deps.repoRoot,m.descriptor)))fail("fixture_abandonment_group_retirement_incomplete");
  }
  return saved;
}
async function lookup(input,deps) {
  const managed=await require("./native-fixture-retained").lookupManaged(input,deps);if(managed)return managed;
  const retained=require("./native-fixture-retained");
  if(retained.read(deps.evidenceRoot,"disposition",selector(input).requestId))return retained.lookup(input,deps);
  const s=selector(input),saved=lookupAudited(s,deps);if(!saved)return null;const v=saved.value;
  const ids=v.attemptGroup ? v.observationIds : [v.observationId],fresh=await setBracket(deps,s,ids,"lookup");if(!same(fresh.entry,v.entry) || !sameObservationBinding(v,fresh))fail("fixture_abandonment_original_guard_drift");
  const groupBack=fresh.attemptGroup ? {attemptInventorySha256:fresh.attemptGroup.inventorySha256,groupRetirementSha256:read(deps.evidenceRoot,"group-retirement",s.requestId).sha256} : {};
  return {...saved,readBack:{schema:SCHEMA+".read-back",dispositionSha256:saved.sha256,entrySha256:hash(v.entry),currentActor:fresh.currentActor,runtime:fresh.runtime,installed:fresh.installed,nativeAdmissionBlocked:attempts(fresh).some(m=>!ledger.validRetirement(deps.repoRoot,m.descriptor)),...groupBack}};
}
async function retire(input,deps) {
  const retained=require("./native-fixture-retained");
  if(retained.read(deps.evidenceRoot,"disposition",selector(input).requestId))return retained.lookup(input,deps);
  const s=selector(input),saved=await lookup(s,deps);if(!saved)fail("fixture_retirement_audited_abandonment_required");
  const audit=read(deps.evidenceRoot,"audit",s.requestId),ids=saved.value.attemptGroup ? saved.value.observationIds : [saved.value.observationId],fresh=await setBracket(deps,s,ids,"lookup");
  if(attempts(fresh).some(m=>!m.exit))fail("fixture_retirement_positive_exit_proof_required");
  const lock=await deps.acquireWriterLock();if(typeof lock?.release!=="function")fail("fixture_abandonment_writer_lock_required");
  try {
    if(!same(await setBracket(deps,s,ids,"lookup"),fresh))fail("fixture_abandonment_locked_bracket_changed");
    if(attempts(fresh).every(m=>ledger.validRetirement(deps.repoRoot,m.descriptor)))return saved;
    publishRetirement(deps,s,fresh,saved,audit);
    return saved;
  } finally {await lock.release();}
}
module.exports={SCHEMA,OBSERVATION,GROUP,TTL,selector,directory,fileFor,observationFile,envelope,canonical,recovered,retirement,capture,authorize,lookupAudited,lookup,retire,hash,
  actor,guardEntry,guardState,runtime,transportEvidence,frameEvidence,sameTarget};

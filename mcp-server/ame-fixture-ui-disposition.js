"use strict";

// Закрытый human disposition одного AME fixture guard. Не доказывает исход AE
// и не меняет canonical run, приватную CEP-квитанцию или право на повтор.
const fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto");
const records = require("./plan-run-records"), contract = require("../cep-panel/panel-action-contract");
const SCHEMA = "ae-agent.ame-fixture-ui-disposition.v1", ENVELOPE = SCHEMA + ".envelope", TTL = 10 * 60 * 1000;
const SHA = /^[a-f0-9]{64}$/;
const EXACT = Object.freeze({requestId:"67d45704-92ac-4700-9288-b7db697ea90f", runId:"40ddeee4-8b49-47d6-9301-03873fbe8cec",
  action:"plan.run", effect:"protected_plan_run", actionId:"act_1e36f475c8214022b84df276cd3ca4bf", proposalRevision:2, tool:"ame_native_fixture_probe", errorCode:"EPERM"});
function fail(code) { throw Object.assign(new Error(code), {code}); }
function hash(value) { return crypto.createHash("sha256").update(Buffer.isBuffer(value) || typeof value === "string" ? value : JSON.stringify(value)).digest("hex"); }
function equal(a,b) { return JSON.stringify(a) === JSON.stringify(b); }
function clone(value) { return JSON.parse(JSON.stringify(value)); }
function selector(value) {
  if (!value || Object.keys(value).sort().join(",") !== "requestId,runId" || value.requestId !== EXACT.requestId || value.runId !== EXACT.runId) fail("fixture_disposition_selector_invalid");
  return {requestId:EXACT.requestId,runId:EXACT.runId};
}
function directory(root) { return path.join(root,"evidence","ame-fixture-ui-disposition"); }
function fileFor(root,kind,id) {
  if (!["capture","consumption","audit","disposition"].includes(kind) || !records.ID.test(id || "") || kind !== "capture" && id !== EXACT.requestId) fail("fixture_disposition_file_selector_invalid");
  return path.join(directory(root),id + "." + kind + ".json");
}
function regularBytes(root,file) {
  const real = records.containedFile(root,file), before = fs.lstatSync(file);
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1 || before.size > records.LIMIT + 1024 || path.resolve(real).toLowerCase() !== path.resolve(file).toLowerCase()) fail("fixture_disposition_file_identity");
  const bytes = fs.readFileSync(real), after = fs.lstatSync(file);
  if (before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size || before.mtimeMs !== after.mtimeMs || bytes.length !== after.size) fail("fixture_disposition_file_changed");
  return bytes;
}
function read(root,kind,id=EXACT.requestId) {
  try {
    const row = JSON.parse(regularBytes(root,fileFor(root,kind,id)));
    if (row.schema !== ENVELOPE || !SHA.test(row.sha256 || "") || hash(row.value) !== row.sha256) fail("fixture_disposition_envelope_corrupt");
    return row;
  } catch (error) { if (error.code === "ENOENT") return null; throw error; }
}
function writeOnce(root,kind,id,value,metadata={}) {
  const dir = directory(root);
  // Проверяем каждый родитель до mkdir: symlink не может создать sidecar вне root.
  for (const candidate of [path.resolve(root),path.join(path.resolve(root),"evidence"),dir]) {
    if (!fs.existsSync(candidate)) fs.mkdirSync(candidate);
    const stat = fs.lstatSync(candidate), real = records.containedFile(root,candidate);
    if (!stat.isDirectory() || stat.isSymbolicLink() || path.resolve(real).toLowerCase() !== path.resolve(candidate).toLowerCase()) fail("fixture_disposition_directory_identity");
  }
  const row = {schema:ENVELOPE,sha256:hash(value),value:clone(value),...metadata}, file = fileFor(root,kind,id);
  const fd = fs.openSync(file,"wx",0o600);
  try { fs.writeFileSync(fd,JSON.stringify(row),"utf8"); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  return row;
}
function actor(state) {
  const value = {panelInstanceId:state?.panelInstanceId,panelLifecycleEpoch:state?.panelLifecycleEpoch,panelGeneration:state?.panelGeneration};
  if (typeof value.panelInstanceId !== "string" || !value.panelInstanceId || !Number.isInteger(value.panelLifecycleEpoch) || value.panelLifecycleEpoch < 0 || typeof value.panelGeneration !== "string" || !value.panelGeneration) fail("fixture_disposition_actor_invalid");
  return value;
}
function canonical(root) {
  const file = records.fileFor(root,EXACT.runId), bytes = regularBytes(root,file), record = records.readRecord(root,EXACT.runId,{throwOnError:true});
  if (hash(bytes) !== hash(regularBytes(root,file))) fail("fixture_disposition_canonical_changed");
  const run = record.run, step = record.plan.steps?.[0], executed = run.steps?.[0], provenance = run.provenance;
  if (record.plan.steps?.length !== 1 || step?.tool !== EXACT.tool || step.args?.fixtureKind !== "saved-dirty" || step.args?.restoreDirty !== true || run.steps?.length !== 1 || executed?.tool !== EXACT.tool || executed.status !== "failed" ||
      run.ok !== false || run.dryRun !== false || run.errorCode !== EXACT.errorCode || executed.errorCode !== EXACT.errorCode ||
      run.outcome?.execution?.status !== "failed" || run.outcome?.mutation?.status !== "unknown" || provenance?.actionId !== EXACT.actionId ||
      provenance.proposalRevision !== EXACT.proposalRevision || run.m100Action?.actionId !== EXACT.actionId || run.m100Action?.confirmedBySurface !== "cep-panel") fail("fixture_disposition_canonical_scope_mismatch");
  return {canonicalRunRecordHash:hash(bytes),canonicalRunProjectionHash:hash(contract.redactState(run)),run};
}
function checkGuard(guard,run,currentActor) {
  const p = guard?.projection;
  if (!p || p.requestId !== EXACT.requestId || p.runId !== EXACT.runId || p.action !== EXACT.action || p.effect !== EXACT.effect || p.state !== "unknown" ||
      p.source !== "ui" || p.phase !== "outcome_unresolved" || p.code !== EXACT.errorCode || p.delivery !== "unknown" || p.replayAllowed !== false ||
      !SHA.test(guard.signatureSha256 || "") || !equal(p.result?.run,contract.redactState(run)) || !equal(guard.currentBinding,currentActor) ||
      !equal(p,contract.sanitizeReceipt(p))) fail("fixture_disposition_private_guard_mismatch");
  const originalBinding = actor({panelInstanceId:p.panelInstanceId,panelLifecycleEpoch:p.epoch,panelGeneration:p.generation});
  return {originalRequestId:EXACT.requestId,runId:EXACT.runId,action:EXACT.action,effect:EXACT.effect,actionId:EXACT.actionId,proposalRevision:EXACT.proposalRevision,
    originalBinding,privateSignatureSha256:guard.signatureSha256,panelReceiptHash:hash(p)};
}
function assertIdle(status,panel,mode) {
  if (!status || status.pendingCommands !== 0 || !Array.isArray(status.inflightCommands) || status.inflightCommands.length || status.activeEditSession !== null ||
      status.projectLifecycle?.blocked || status.projectLifecycle?.pending || status.panelBootstrap?.busy || !panel || panel.nativeControlIdle !== true ||
      panel.activeAction !== null || panel.recoveryTransport || panel.actionStorage !== "ready") fail("fixture_disposition_writer_not_idle");
  const rows = panel.unresolvedActions;
  if (!Array.isArray(rows)) fail("fixture_disposition_guard_scope_mismatch");
  if (mode === "lookup") {
    // Новые независимые guards остаются в ledger; этот sidecar их не освобождает.
    const exact = rows.filter(r => r.requestId === EXACT.requestId);
    if (exact.length > 1 || exact.some(r => r.runId !== EXACT.runId || r.action !== EXACT.action || r.effect !== EXACT.effect)) fail("fixture_disposition_guard_scope_mismatch");
  } else if (rows.length !== 1 || rows.some(r => r.requestId !== EXACT.requestId || r.runId !== EXACT.runId || r.action !== EXACT.action || r.effect !== EXACT.effect)) fail("fixture_disposition_guard_scope_mismatch");
}
function runtimeIdentity(value) {
  if (!value || !Number.isInteger(value.daemon?.pid) || value.daemon.pid < 1 || !Number.isFinite(Date.parse(value.daemon.startedAt)) ||
      !SHA.test(value.loadedRuntimeSha256 || "") || value.currentRuntimeSha256 !== value.loadedRuntimeSha256 || !value.panelAssetHashes ||
      !SHA.test(value.panelAssetHashes["panel-actions.js"] || "") || !SHA.test(value.panelAssetHashes["panel.js"] || "") ||
      Object.values(value.panelAssetHashes).some(h => !SHA.test(h || ""))) fail("fixture_disposition_runtime_changed");
  return {daemon:clone(value.daemon),loadedRuntimeSha256:value.loadedRuntimeSha256,currentRuntimeSha256:value.currentRuntimeSha256,panelAssetHashes:clone(value.panelAssetHashes)};
}
// Все readers предоставляются backend closure. Клиент передаёт только selector,
// captureId и причину; ни canonical bytes, ни доказательства клиента не принимаются.
// maintenanceTarget -> {state,target,installed}; readPanelGuard -> pure CEP API;
// readTransportAbsence -> точное отсутствие original receipt + idle очереди;
// readExecutorQuiescence -> текущие executing/pending/childProcesses;
// readRuntimeIdentity -> daemon birth, loaded/current fingerprints, asset hashes;
// acquireWriterLock -> существующая транспортная блокировка с release().
async function snapshot(deps,mode="capture") {
  for (const name of ["maintenanceTarget","readPanelGuard","readTransportAbsence","readBridgeStatus","readRuntimeIdentity","readExecutorQuiescence"]) if (typeof deps[name] !== "function") fail("fixture_disposition_backend_reader_required");
  const selected = await deps.maintenanceTarget(), currentActor = actor(selected.state), proof = canonical(deps.evidenceRoot);
  const guard = await deps.readPanelGuard(selector({requestId:EXACT.requestId,runId:EXACT.runId})), status = await deps.readBridgeStatus();
  assertIdle(status,selected.state,mode);
  const entry = {...checkGuard(guard,proof.run,currentActor),canonicalRunRecordHash:proof.canonicalRunRecordHash,canonicalRunProjectionHash:proof.canonicalRunProjectionHash};
  const transport = await deps.readTransportAbsence({requestId:EXACT.requestId,runId:EXACT.runId});
  if (!transport || transport.requestId !== EXACT.requestId || transport.originalReceiptAbsent !== true || transport.pendingCount !== 0 || transport.inflightCount !== 0) fail("fixture_disposition_transport_not_absent");
  const executor = await deps.readExecutorQuiescence();
  if (!executor || executor.quiescent !== true || executor.executing !== false || executor.pendingCount !== 0 || !Array.isArray(executor.childProcesses) || executor.childProcesses.length) fail("fixture_disposition_executor_not_quiescent");
  const runtime = runtimeIdentity(await deps.readRuntimeIdentity());
  if (!selected.target || typeof selected.target.url !== "string" || !selected.target.url.startsWith("file:///") ||
      !/^ws:\/\/127\.0\.0\.1:8870\/devtools\/page\/[A-Za-z0-9_-]+$/.test(selected.target.webSocketDebuggerUrl || "") ||
      !selected.installed?.indexPath || !equal(selected.installed.hashes,runtime.panelAssetHashes)) fail("fixture_disposition_frame_source_mismatch");
  const after = await deps.maintenanceTarget(); assertIdle(await deps.readBridgeStatus(),after.state,mode);
  if (!equal(actor(after.state),currentActor) || !equal(after.target,selected.target) || !equal(after.installed,selected.installed)) fail("fixture_disposition_actor_or_frame_changed");
  return {entry,currentActor,target:clone(selected.target),installed:clone(selected.installed),runtime,
    transport:{requestId:transport.requestId,originalReceiptAbsent:true,pendingCount:0,inflightCount:0},
    executor:{quiescent:true,executing:false,pendingCount:0,childProcesses:[]}};
}
async function bracket(deps,mode) {
  const before = await snapshot(deps,mode), after = await snapshot(deps,mode);
  if (!equal(before,after)) fail("fixture_disposition_fresh_bracket_changed");
  return after;
}
async function lookupFrame(deps,entry) {
  for (const name of ["maintenanceTarget","readPanelGuard","readBridgeStatus","readRuntimeIdentity"]) if (typeof deps[name] !== "function") fail("fixture_disposition_backend_reader_required");
  const selected = await deps.maintenanceTarget(), currentActor = actor(selected.state), proof = canonical(deps.evidenceRoot);
  assertIdle(await deps.readBridgeStatus(),selected.state,"lookup");
  const guard = await deps.readPanelGuard({requestId:EXACT.requestId,runId:EXACT.runId});
  const observedEntry = {...checkGuard(guard,proof.run,currentActor),canonicalRunRecordHash:proof.canonicalRunRecordHash,canonicalRunProjectionHash:proof.canonicalRunProjectionHash};
  if (!equal(observedEntry,entry)) fail("fixture_disposition_original_receipt_or_canonical_drift");
  const runtime = runtimeIdentity(await deps.readRuntimeIdentity());
  if (!selected.target || typeof selected.target.url !== "string" || !selected.target.url.startsWith("file:///") ||
      !/^ws:\/\/127\.0\.0\.1:8870\/devtools\/page\/[A-Za-z0-9_-]+$/.test(selected.target.webSocketDebuggerUrl || "") ||
      !selected.installed?.indexPath || !equal(selected.installed.hashes,runtime.panelAssetHashes)) fail("fixture_disposition_frame_source_mismatch");
  const after = await deps.maintenanceTarget();assertIdle(await deps.readBridgeStatus(),after.state,"lookup");
  if (!equal(actor(after.state),currentActor) || !equal(after.target,selected.target) || !equal(after.installed,selected.installed)) fail("fixture_disposition_actor_or_frame_changed");
  return {currentActor,runtime,target:clone(selected.target),installed:clone(selected.installed)};
}
function now(deps) { return typeof deps.now === "function" ? deps.now() : Date.now(); }
function reserved(root) {
  return ["consumption","audit","disposition"].some(kind => fs.existsSync(fileFor(root,kind,EXACT.requestId)));
}
async function capture(input,deps) {
  selector(input); if (reserved(deps.evidenceRoot)) fail("fixture_disposition_already_consumed");
  const observed = await bracket(deps,"capture"), timestamp = now(deps);
  const value = {schema:SCHEMA+".capture",captureId:crypto.randomUUID(),createdAt:new Date(timestamp).toISOString(),expiresAt:new Date(timestamp+TTL).toISOString(),...observed};
  return writeOnce(deps.evidenceRoot,"capture",value.captureId,value);
}
function validateCapture(row,input,time) {
  const c = row?.value, start = Date.parse(c?.createdAt), end = Date.parse(c?.expiresAt);
  if (!row || c.schema !== SCHEMA+".capture" || c.captureId !== input.captureId || !records.ID.test(c.captureId) || !Number.isFinite(start) || !Number.isFinite(time) || end !== start+TTL || time < start || time >= end) fail("fixture_disposition_capture_stale_or_invalid");
  return c;
}
async function authorize(input,deps) {
  if (!input || Object.keys(input).sort().join(",") !== "authorizationSource,captureId,confirmation,reason" || !records.ID.test(input.captureId || "") || input.confirmation !== true ||
      input.authorizationSource !== "explicit_user_chat" || typeof input.reason !== "string" || !input.reason.trim() || input.reason.length > 2000) fail("fixture_disposition_explicit_confirmation_required");
  if (reserved(deps.evidenceRoot)) fail("fixture_disposition_already_consumed");
  const captured = read(deps.evidenceRoot,"capture",input.captureId), c = validateCapture(captured,input,now(deps)), fresh = await bracket(deps,"capture");
  const expected = {entry:c.entry,currentActor:c.currentActor,target:c.target,installed:c.installed,runtime:c.runtime,transport:c.transport,executor:c.executor};
  if (!equal(fresh,expected)) fail("fixture_disposition_capture_drift");
  if (typeof deps.acquireWriterLock !== "function") fail("fixture_disposition_writer_lock_required");
  const lock = await deps.acquireWriterLock();
  if (!lock || typeof lock.release !== "function") fail("fixture_disposition_writer_lock_required");
  try {
    if (reserved(deps.evidenceRoot)) fail("fixture_disposition_already_consumed");
    validateCapture(captured,input,now(deps));
    if (!equal(await bracket(deps,"capture"),fresh)) fail("fixture_disposition_locked_bracket_changed");
    const dispositionId = crypto.randomUUID(), createdAt = new Date(now(deps)).toISOString();
    const consumed = writeOnce(deps.evidenceRoot,"consumption",EXACT.requestId,{schema:SCHEMA+".consumption",captureId:c.captureId,captureSha256:captured.sha256,dispositionId,createdAt,replayAllowed:false});
    const value = {schema:SCHEMA,dispositionId,createdAt,captureId:c.captureId,captureSha256:captured.sha256,status:"abandoned_reviewed",guardDisposition:"released",
      historicalOutcome:"unknown",aeExecutionProven:false,replayAllowed:false,authorizationSource:input.authorizationSource,reason:input.reason.trim(),entry:c.entry,currentActor:c.currentActor,
      target:c.target,installed:c.installed,runtime:c.runtime};
    const audit = writeOnce(deps.evidenceRoot,"audit",EXACT.requestId,{schema:SCHEMA+".audit",dispositionId,createdAt,captureId:c.captureId,captureSha256:captured.sha256,
      dispositionSha256:hash(value),consumptionSha256:consumed.sha256,confirmation:true,authorizationSource:value.authorizationSource,reason:value.reason,observed:fresh});
    return writeOnce(deps.evidenceRoot,"disposition",EXACT.requestId,value,{auditSha256:audit.sha256,consumptionSha256:consumed.sha256});
  } finally { await lock.release(); }
}
async function lookup(deps) {
  const root = deps.evidenceRoot, saved = read(root,"disposition");
  if (!saved) {if (reserved(root)) fail("fixture_disposition_partial_audit");return null;}
  const v = saved.value, audit = read(root,"audit"), consumption = read(root,"consumption"), captured = records.ID.test(v?.captureId || "") && read(root,"capture",v.captureId);
  if (!audit || !consumption || !captured || v.schema !== SCHEMA || !records.ID.test(v.dispositionId || "") || v.status !== "abandoned_reviewed" || v.guardDisposition !== "released" ||
      v.historicalOutcome !== "unknown" || v.aeExecutionProven !== false || v.replayAllowed !== false || v.authorizationSource !== "explicit_user_chat" || typeof v.reason !== "string" || !v.reason.trim() ||
      saved.auditSha256 !== audit.sha256 || saved.consumptionSha256 !== consumption.sha256 || audit.value.schema !== SCHEMA+".audit" || consumption.value.schema !== SCHEMA+".consumption" ||
      audit.value.dispositionSha256 !== saved.sha256 || audit.value.consumptionSha256 !== consumption.sha256 || audit.value.confirmation !== true || audit.value.reason !== v.reason ||
      audit.value.authorizationSource !== v.authorizationSource || [audit.value,consumption.value].some(x => x.dispositionId !== v.dispositionId || x.captureId !== v.captureId || x.createdAt !== v.createdAt || x.captureSha256 !== captured.sha256) ||
      v.captureSha256 !== captured.sha256 || consumption.value.replayAllowed !== false) fail("fixture_disposition_audit_invalid");
  const c = captured.value, expected = {entry:c.entry,currentActor:c.currentActor,target:c.target,installed:c.installed,runtime:c.runtime,transport:c.transport,executor:c.executor};
  validateCapture(captured,{captureId:v.captureId},Date.parse(v.createdAt));
  if (c.schema !== SCHEMA+".capture" || c.captureId !== v.captureId || !equal(audit.value.observed,expected) || ["entry","currentActor","target","installed","runtime"].some(k => !equal(v[k],c[k]))) fail("fixture_disposition_lookup_drift");
  // Долговечный grant относится к неизменяемой исторической записи. Новый actor,
  // runtime и последующие собственные children не меняют факт human disposition.
  // Текущие pins приходят только через authenticated lookup, вне исходного value.
  const before = await lookupFrame(deps,v.entry), after = await lookupFrame(deps,v.entry);
  if (!equal(before,after)) fail("fixture_disposition_lookup_bracket_changed");
  return {...saved,readBack:{schema:SCHEMA+".read-back",dispositionSha256:saved.sha256,entrySha256:hash(v.entry),...after}};
}
module.exports = {SCHEMA,ENVELOPE,TTL,EXACT,hash,equal,selector,directory,fileFor,regularBytes,read,capture,authorize,lookup};

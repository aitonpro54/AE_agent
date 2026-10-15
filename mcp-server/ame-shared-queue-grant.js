"use strict";

const fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto");
const { stableStringify } = require("./m100-protocol");
const BINDING_SCHEMA = "ae-agent-ame-shared-queue-binding.v1", RESERVATION_SCHEMA = "ae-agent-ame-title-start-reservation.v1";
const MODE = "shared_queue_v1", UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/, SHA = /^[a-f0-9]{64}$/;
const digest = value => crypto.createHash("sha256").update(stableStringify(value)).digest("hex"), clone = value => JSON.parse(JSON.stringify(value));
function denied(code = "ame_shared_queue_private_capability_required") { throw Object.assign(new Error(code), { code }); }
function exact(value, keys) { return value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key)); }
function validText(value) { return typeof value === "string" && value.length > 0 && value.length <= 4096 && !/[\x00-\x1f\x7f]/.test(value); }
function sync(callback, ...args) { const value = callback(...args); if (value === false || value && typeof value.then === "function") { if (value && typeof value.catch === "function") value.catch(() => {}); denied("ame_shared_queue_synchronous_assertion_required"); } return value; }
function validateBinding(value) {
  if (!exact(value, ["schema", "targetSpecifier", "batchId", "process", "processBinding", "nativeSessionNonce", "retainedWrapperSessionNonce", "presetIdentity", "jobs"]) || value.schema !== BINDING_SCHEMA ||
      !/^ame-\d{1,3}\.\d{1,3}$/.test(value.targetSpecifier) || !UUID.test(value.batchId) || !SHA.test(value.processBinding) || !SHA.test(value.presetIdentity) ||
      !exact(value.process, ["pid", "startedAt", "path"]) || !Number.isSafeInteger(value.process.pid) || value.process.pid < 1 || !Number.isFinite(Date.parse(value.process.startedAt)) || !validText(value.process.path) ||
      !(value.nativeSessionNonce === null || typeof value.nativeSessionNonce === "string" && /^[A-Za-z0-9._-]{1,128}$/.test(value.nativeSessionNonce)) || !UUID.test(value.retainedWrapperSessionNonce) || !Array.isArray(value.jobs) || value.jobs.length !== 2) denied("ame_shared_queue_binding_invalid");
  const ids = new Set(), outputs = new Set(), sources = new Set();
  for (const job of value.jobs) {
    if (!exact(job, ["jobId", "handleKey", "enqueueRequestNonce", "operationBinding", "source", "preset", "outputPath", "range"]) || !UUID.test(job.jobId) || job.handleKey !== job.jobId || !UUID.test(job.enqueueRequestNonce) || !SHA.test(job.operationBinding) ||
        !exact(job.source, ["path", "sha25664", "guid"]) || !validText(job.source.path) || !path.isAbsolute(job.source.path) || !SHA.test(job.source.sha25664) || !validText(job.source.guid) ||
        !exact(job.preset, ["path", "sha25664", "id"]) || !validText(job.preset.path) || !path.isAbsolute(job.preset.path) || !SHA.test(job.preset.sha25664) || !/^amep_[a-f0-9]{40}$/.test(job.preset.id) ||
        !validText(job.outputPath) || !path.isAbsolute(job.outputPath) || !exact(job.range, ["startSeconds", "endSeconds"]) || !Number.isFinite(job.range.startSeconds) || job.range.startSeconds < 0 || !Number.isFinite(job.range.endSeconds) || job.range.endSeconds <= job.range.startSeconds ||
        ids.has(job.jobId) || outputs.has(job.outputPath.replace(/\\/g, "/").toLowerCase()) || sources.has(job.source.path.replace(/\\/g, "/").toLowerCase()) || stableStringify(job.preset) !== stableStringify(value.jobs[0].preset)) denied("ame_shared_queue_binding_invalid");
    ids.add(job.jobId); outputs.add(job.outputPath.replace(/\\/g, "/").toLowerCase()); sources.add(job.source.path.replace(/\\/g, "/").toLowerCase());
  }
  return value;
}
const bindingHash = value => digest(validateBinding(value));
function buildBinding(batch, process, args, minimumObservedAt) {
  if (!batch || batch.start || !Array.isArray(batch.jobs) || batch.jobs.length !== 2 || !Number.isFinite(minimumObservedAt)) denied("ame_shared_queue_two_own_jobs_required");
  let nativeSessionNonce, retainedWrapperSessionNonce;
  const jobs = batch.jobs.map(job => {
    const native = job.nativeObservation, wrapper = native && native.job;
    if (!job.transportResolved || !job.nativeAssociationVerified || !job.readyForStart || !native || native.code !== "job_observed" || native.batchRunning !== false || !Number.isFinite(native.observedAt) || native.observedAt < minimumObservedAt || native.requestNonce === job.requestNonce ||
        !wrapper || wrapper.status !== "queued" || wrapper.workAreaApplied !== true || !Array.isArray(wrapper.readErrors) || wrapper.readErrors.length || wrapper.nativeJobId !== null || wrapper.nativeAssociationVerified !== true || wrapper.handleKey !== job.jobId || wrapper.enqueueRequestNonce !== job.requestNonce ||
        wrapper.processBinding !== batch.processBinding || wrapper.presetIdentity !== batch.presetIdentity || wrapper.sourcePath !== job.sourcePath || wrapper.sourceGuid !== job.args.sourceGuid || wrapper.outputPath !== job.outputPath || stableStringify(wrapper.range) !== stableStringify(job.args.range) || !Array.isArray(wrapper.outputFiles) || wrapper.outputFiles.length !== 1 || wrapper.outputFiles[0] !== job.outputPath || !UUID.test(wrapper.retainedWrapperSessionNonce || "")) denied("ame_shared_queue_fresh_own_read_required");
    if (nativeSessionNonce === undefined) { nativeSessionNonce = native.sessionNonce; retainedWrapperSessionNonce = wrapper.retainedWrapperSessionNonce; }
    if (native.sessionNonce !== nativeSessionNonce || wrapper.retainedWrapperSessionNonce !== retainedWrapperSessionNonce) denied("ame_shared_queue_wrapper_session_changed");
    return { jobId: job.jobId, handleKey: job.handleKey, enqueueRequestNonce: job.requestNonce, operationBinding: job.operationBinding,
      source: { path: job.sourcePath, sha25664: job.sourcePin.sha256, guid: job.args.sourceGuid }, preset: { path: job.presetPath, sha25664: job.presetPin.sha256, id: job.args.presetId }, outputPath: job.outputPath, range: clone(job.args.range) };
  });
  return validateBinding({ schema: BINDING_SCHEMA, targetSpecifier: args.targetSpecifier, batchId: batch.batchId, process: { pid: process.pid, startedAt: process.startedAt, path: process.path }, processBinding: batch.processBinding, nativeSessionNonce, retainedWrapperSessionNonce, presetIdentity: batch.presetIdentity, jobs });
}
function reservationPath(stateDir, batchId) { if (!path.isAbsolute(stateDir || "") || !UUID.test(batchId || "")) denied("ame_shared_queue_reservation_invalid"); return path.join(stateDir, "starts", batchId + ".json"); }
function readReservation(stateDir, batchId) {
  let raw; try { raw = fs.readFileSync(reservationPath(stateDir, batchId), "utf8"); } catch (error) { if (error.code === "ENOENT") return null; throw error; }
  let record; try { record = JSON.parse(raw); } catch (_) { denied("ame_shared_queue_reservation_corrupt_no_replay"); }
  // Any existing legacy marker also blocks START; only our receipt is interpreted.
  if (!record || record.schema !== RESERVATION_SCHEMA || record.batchId !== batchId || !UUID.test(record.requestNonce || "") || !SHA.test(record.operationBinding || "") || record.state !== "unknown_outcome" || record.transportResolved !== false || !Number.isFinite(Date.parse(record.reservedAt))) denied("ame_shared_queue_reservation_corrupt_no_replay");
  if (record.sharedQueueReceipt) {
    const r = record.sharedQueueReceipt;
    if (r.proofSource !== "server_private_shared_queue_capability" || r.globalQueueStart !== true || r.nativeQueueCompositionVerified !== false || r.mediaVerified !== false || r.batchId !== batchId || r.requestNonce !== record.requestNonce || r.operationBinding !== record.operationBinding || r.bindingHash !== bindingHash(r.binding) || record.receiptHash !== digest(r)) denied("ame_shared_queue_reservation_corrupt_no_replay");
  }
  return record;
}
// The daemon supplies private origin/restoration assertions. Neither JSON flags,
// a caller-created context nor an automatic call can mint the WeakMap capability.
function createSharedQueueGrant(deps) {
  if (!deps || !path.isAbsolute(deps.stateDir || "") || ["assertSharedQueueIngress", "assertServerContext"].some(key => typeof deps[key] !== "function")) denied("ame_shared_queue_invalid_dependencies");
  const caps = new WeakMap(), now = deps.now || Date.now;
  function validate(context, binding) { validateBinding(binding); sync(deps.assertSharedQueueIngress, context, binding); sync(deps.assertServerContext, context, binding); }
  function authorize(context, binding) {
    validate(context, binding); const cap = Object.freeze(Object.create(null)); caps.set(cap, { context, hash: bindingHash(binding), active: true, issuedAt: now() }); return cap;
  }
  function assertCapability(cap, context, binding) {
    const saved = cap && caps.get(cap); if (!saved || !saved.active || saved.context !== context || saved.hash !== bindingHash(binding)) denied(); validate(context, binding); return saved;
  }
  function consume(cap, context, binding, start) {
    const saved = assertCapability(cap, context, binding);
    if (!start || start.batchId !== binding.batchId || !UUID.test(start.requestNonce || "") || !SHA.test(start.operationBinding || "") || start.transportResolved !== false || start.state !== "unknown_outcome" || start.lastDispatchGuardVerified !== true || !Number.isFinite(Date.parse(start.reservedAt)) || Date.parse(start.reservedAt) < saved.issuedAt || Date.parse(start.reservedAt) > now()) denied("ame_shared_queue_reservation_invalid");
    const receipt = { schema: "ae-agent-ame-shared-queue-receipt.v1", proofSource: "server_private_shared_queue_capability", globalQueueStart: true, nativeQueueCompositionVerified: false, mediaVerified: false,
      batchId: binding.batchId, binding: clone(binding), bindingHash: saved.hash, requestNonce: start.requestNonce, operationBinding: start.operationBinding, issuedAt: new Date(saved.issuedAt).toISOString() };
    const record = { ...start, schema: RESERVATION_SCHEMA, sharedQueueReceipt: receipt, receiptHash: digest(receipt) }, file = reservationPath(deps.stateDir, binding.batchId);
    fs.mkdirSync(path.dirname(file), { recursive: true }); let fd;
    try { fd = fs.openSync(file, "wx"); } catch (error) { if (error.code === "EEXIST") denied("batch_start_already_reserved"); throw error; }
    saved.active = false; // an incomplete durable write is UNKNOWN, never replayable
    try { fs.writeFileSync(fd, JSON.stringify(record) + "\n", "utf8"); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    saved.reservedHash = digest(record); return clone(record);
  }
  function assertConsumedForDispatch(cap, context, binding, record) {
    const saved = cap && caps.get(cap); if (!saved || saved.active || saved.context !== context || saved.hash !== bindingHash(binding) || saved.reservedHash !== digest(record) || saved.reservedHash !== digest(readReservation(deps.stateDir, binding.batchId))) denied("ame_shared_queue_consumed_binding_changed"); validate(context, binding); return true;
  }
  return { authorize, assertCapability, consume, assertConsumedForDispatch, readReservation: id => readReservation(deps.stateDir, id) };
}
// Verify only this runner's two retained wrappers and its exact once START.
// The status executor already validates each wrapper against the durable ledger.
function verifyStartEvidence(args,payload,run,reads){
  try{
    const reserved=payload?.startReservation,receipt=reserved?.sharedQueueReceipt,binding=receipt?.binding;
    validateBinding(binding);
    if(args.queueMode!==MODE || payload.ok!==true || payload.code!=="batch_start_accepted" || payload.dispatchAcceptanceVerified!==true ||
      payload.globalQueueStart!==true || payload.unknownOutcome===true || payload.authorization?.runId!==run?.id || payload.authorization?.proposalId!==run?.provenance?.actionId ||
      reserved.schema!==RESERVATION_SCHEMA || reserved.batchId!==args.batchId || reserved.requestNonce!==payload.requestNonce || reserved.lastDispatchGuardVerified!==true ||
      receipt.proofSource!=="server_private_shared_queue_capability" || receipt.globalQueueStart!==true || receipt.bindingHash!==bindingHash(binding) || reserved.receiptHash!==digest(receipt) ||
      receipt.requestNonce!==payload.requestNonce || receipt.operationBinding!==reserved.operationBinding || binding.batchId!==args.batchId || binding.targetSpecifier!==args.targetSpecifier ||
      binding.process.pid!==args.expectedProcess.pid || binding.process.startedAt!==new Date(args.expectedProcess.startedAt).toISOString() ||
      payload.native?.start?.requestNonce!==payload.requestNonce || payload.native.start.invoked!==true || payload.native.start.accepted!==true ||
      !Array.isArray(reads) || reads.length!==2) return false;
    const ids=new Set(),nonces=new Set([payload.requestNonce]);
    for(const read of reads){
      const observed=read.result,native=observed?.native,job=binding.jobs.find(j=>j.jobId===read.args?.jobId);
      if(!job || ids.has(job.jobId) || read.tool!=="get_ame_title_job_status" || read.status!=="completed" || read.args.batchId!==args.batchId ||
        read.args.targetSpecifier!==args.targetSpecifier || read.args.expectedProcess?.pid!==binding.process.pid || new Date(read.args.expectedProcess.startedAt).toISOString()!==binding.process.startedAt ||
        observed?.ok!==true || observed.jobId!==job.jobId || observed.batchId!==args.batchId || observed.startAcceptanceVerified!==true || observed.nativeAssociationVerified!==true ||
        digest(observed.startReservation)!==digest(reserved) || native?.code!=="job_observed" || !UUID.test(native.requestNonce||"") || nonces.has(native.requestNonce) ||
        native.start?.requestNonce!==payload.requestNonce || native.start.accepted!==true || native.start.invoked!==true || native.job?.handleKey!==job.jobId ||
        native.job.sourcePath!==job.source.path || native.job.sourceGuid!==job.source.guid || native.job.outputPath!==job.outputPath ||
        native.job.retainedWrapperSessionNonce!==binding.retainedWrapperSessionNonce || native.job.processBinding!==binding.processBinding ||
        !Number.isFinite(native.observedAt) || native.observedAt<payload.native.observedAt) return false;
      ids.add(job.jobId);nonces.add(native.requestNonce);
    }
    return true;
  }catch(_){return false;}
}
module.exports = { MODE, BINDING_SCHEMA, RESERVATION_SCHEMA, validateBinding, bindingHash, buildBinding, readReservation, createSharedQueueGrant, verifyStartEvidence };

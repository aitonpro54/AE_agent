"use strict";

const fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto");
const { AsyncLocalStorage } = require("node:async_hooks");
const { stableStringify, sha256Payload } = require("./m100-protocol");
const ROUTE = "/agents/ame/title-start/run";
const MANIFEST_SCHEMA = "ae-agent-ame-manual-queue-manifest.v1";
const RESERVATION_SCHEMA = "ae-agent-ame-title-start-reservation.v1";
const DECLARATION = "Сейчас проверил всю очередь AME: содержит только показанные 2 готовых задания; понимаю, API полный состав не проверяет, запуск общий.";
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/, SHA = /^[a-f0-9]{64}$/;
const digest = value => crypto.createHash("sha256").update(stableStringify(value)).digest("hex");
const clone = value => JSON.parse(JSON.stringify(value));
function denied(code = "ame_manual_queue_witness_required") { throw Object.assign(new Error(code), { code }); }
function assertSync(callback, ...args) {
  const result = callback(...args);
  if (result === false || result && typeof result.then === "function") {
    if (result && typeof result.catch === "function") result.catch(() => {});
    denied("ame_manual_queue_synchronous_assertion_required");
  }
  return result;
}
function exactKeys(value, keys) { return value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === keys.length && keys.every(key => Object.prototype.hasOwnProperty.call(value, key)); }
function validText(value) { return typeof value === "string" && value.length > 0 && value.length <= 4096 && !/[\x00-\x1f\x7f]/.test(value); }
function validateManifest(value) {
  if (!exactKeys(value, ["schema", "targetSpecifier", "batchId", "process", "processBinding", "nativeSessionNonce", "retainedWrapperSessionNonce", "presetIdentity", "jobs"]) ||
      value.schema !== MANIFEST_SCHEMA || !/^ame-\d{1,3}\.\d{1,3}$/.test(value.targetSpecifier) || !UUID.test(value.batchId) || !SHA.test(value.processBinding) || !SHA.test(value.presetIdentity) ||
      !exactKeys(value.process, ["pid", "startedAt", "path"]) || !Number.isSafeInteger(value.process.pid) || value.process.pid < 1 || !Number.isFinite(Date.parse(value.process.startedAt)) || !validText(value.process.path) ||
      !(value.nativeSessionNonce === null || typeof value.nativeSessionNonce === "string" && /^[A-Za-z0-9._-]{1,128}$/.test(value.nativeSessionNonce)) || !UUID.test(value.retainedWrapperSessionNonce) || !Array.isArray(value.jobs) || value.jobs.length !== 2) denied("ame_manual_queue_manifest_invalid");
  const seenIds = new Set(), seenOutputs = new Set();
  for (const job of value.jobs) {
    if (!exactKeys(job, ["jobId", "handleKey", "enqueueRequestNonce", "operationBinding", "source", "preset", "outputPath", "range"]) ||
        !UUID.test(job.jobId) || job.handleKey !== job.jobId || !UUID.test(job.enqueueRequestNonce) || !SHA.test(job.operationBinding) ||
        !exactKeys(job.source, ["path", "sha25664", "guid"]) || !validText(job.source.path) || !path.isAbsolute(job.source.path) || !SHA.test(job.source.sha25664) || !validText(job.source.guid) ||
        !exactKeys(job.preset, ["path", "sha25664", "id"]) || !validText(job.preset.path) || !path.isAbsolute(job.preset.path) || !SHA.test(job.preset.sha25664) || !/^amep_[a-f0-9]{40}$/.test(job.preset.id) ||
        !validText(job.outputPath) || !path.isAbsolute(job.outputPath) || !exactKeys(job.range, ["startSeconds", "endSeconds"]) || !Number.isFinite(job.range.startSeconds) || job.range.startSeconds < 0 || !Number.isFinite(job.range.endSeconds) || job.range.endSeconds <= job.range.startSeconds ||
        seenIds.has(job.jobId) || seenOutputs.has(job.outputPath.replace(/\\/g, "/").toLowerCase())) denied("ame_manual_queue_manifest_invalid");
    seenIds.add(job.jobId); seenOutputs.add(job.outputPath.replace(/\\/g, "/").toLowerCase());
  }
  if (stableStringify(value.jobs[0].preset) !== stableStringify(value.jobs[1].preset)) denied("ame_manual_queue_manifest_invalid");
  return value;
}
function manifestHash(value) { return digest(validateManifest(value)); }
function buildManifest(batch, processInfo, args, minimumObservedAt) {
  if (!batch || batch.start || !Array.isArray(batch.jobs) || batch.jobs.length !== 2 || !Number.isFinite(minimumObservedAt)) denied("ame_manual_queue_two_fresh_queued_jobs_required");
  let nativeSessionNonce, retainedWrapperSessionNonce;
  const jobs = batch.jobs.map(job => {
    const native = job.nativeObservation, wrapper = native?.job;
    if (job.readyForStart !== true || job.nativeAssociationVerified !== true || !native || native.code !== "job_observed" || native.batchRunning !== false || !Number.isFinite(native.observedAt) || native.observedAt < minimumObservedAt || native.requestNonce === job.requestNonce || !wrapper || wrapper.status !== "queued" || wrapper.nativeAssociationVerified !== true || wrapper.handleKey !== job.jobId || wrapper.enqueueRequestNonce !== job.requestNonce || !UUID.test(wrapper.retainedWrapperSessionNonce || "")) denied("ame_manual_queue_two_fresh_queued_jobs_required");
    if (nativeSessionNonce === undefined) { nativeSessionNonce = native.sessionNonce; retainedWrapperSessionNonce = wrapper.retainedWrapperSessionNonce; }
    if (nativeSessionNonce !== native.sessionNonce || retainedWrapperSessionNonce !== wrapper.retainedWrapperSessionNonce) denied("ame_manual_queue_wrapper_session_changed");
    return { jobId: job.jobId, handleKey: job.handleKey, enqueueRequestNonce: job.requestNonce, operationBinding: job.operationBinding,
      source: { path: job.sourcePath, sha25664: job.sourcePin.sha256, guid: job.args.sourceGuid }, preset: { path: job.presetPath, sha25664: job.presetPin.sha256, id: job.args.presetId }, outputPath: job.outputPath, range: clone(job.args.range) };
  });
  return validateManifest({ schema: MANIFEST_SCHEMA, targetSpecifier: args.targetSpecifier, batchId: batch.batchId,
    process: { pid: processInfo.pid, startedAt: processInfo.startedAt, path: processInfo.path }, processBinding: batch.processBinding,
    nativeSessionNonce, retainedWrapperSessionNonce, presetIdentity: batch.presetIdentity, jobs });
}
function reservationPath(stateDir, batchId) { if (!path.isAbsolute(stateDir || "") || !UUID.test(batchId || "")) denied("ame_start_reservation_invalid"); return path.join(stateDir, "starts", batchId + ".json"); }
function writeReservation(stateDir, record) {
  if (!record || record.schema !== RESERVATION_SCHEMA || !UUID.test(record.batchId || "") || !UUID.test(record.requestNonce || "") || !SHA.test(record.operationBinding || "") || !Number.isFinite(Date.parse(record.reservedAt)) || record.state !== "unknown_outcome" || record.transportResolved !== false) denied("ame_start_reservation_invalid");
  const file = reservationPath(stateDir, record.batchId); fs.mkdirSync(path.dirname(file), { recursive: true });
  let fd;
  try { fd = fs.openSync(file, "wx"); } catch (error) { if (error.code === "EEXIST") denied("batch_start_already_reserved"); throw error; }
  // A failed/partial write leaves the exclusive marker in place. It is UNKNOWN,
  // never permission to dispatch again after a server restart.
  try { fs.writeFileSync(fd, JSON.stringify(record) + "\n", "utf8"); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  return clone(record);
}
function readReservation(stateDir, batchId) {
  const file = reservationPath(stateDir, batchId); let raw;
  try { raw = fs.readFileSync(file, "utf8"); } catch (error) { if (error.code === "ENOENT") return null; throw error; }
  let record; try { record = JSON.parse(raw); } catch (_) { denied("ame_start_reservation_corrupt_no_replay"); }
  if (record.schema !== RESERVATION_SCHEMA || record.batchId !== batchId || !UUID.test(record.requestNonce || "") || !SHA.test(record.operationBinding || "") || !Number.isFinite(Date.parse(record.reservedAt)) || record.state !== "unknown_outcome" || record.transportResolved !== false) denied("ame_start_reservation_corrupt_no_replay");
  if (record.manualQueueReceipt) {
    const receipt = record.manualQueueReceipt;
    if (receipt.proofSource !== "authenticated_cep_user_declaration" || receipt.nativeQueueCompositionVerified !== false || receipt.physicalHumanVerified !== false || receipt.declaration !== DECLARATION || manifestHash(receipt.manifest) !== receipt.manifestHash || receipt.batchId !== batchId || receipt.requestNonce !== record.requestNonce || receipt.operationBinding !== record.operationBinding || !SHA.test(record.receiptHash || "") || digest(receipt) !== record.receiptHash) denied("ame_start_reservation_corrupt_no_replay");
  }
  return record;
}

// Consumes only independent server-attached reads (the semantic caller checks
// their private provenance). It proves our dispatch and two retained handles;
// the declaration never becomes API proof of the whole queue or media proof.
function verifyStartEvidence(args, payload, run, reads) {
  try {
    if (args.manualQueueMode !== "cep_user_declaration" || !SHA.test(args.manualQueueManifestSha25664 || "") || !payload || payload.schema !== "ae-agent-ame-title-jobs.v1" || payload.ok !== true || payload.code !== "batch_start_accepted" || payload.nativeQueueCompositionVerified !== false ||
        payload.dispatchAcceptanceVerified !== true || payload.completionVerified !== false || payload.mediaVerified !== false || !run || !UUID.test(run.id || "") || !Array.isArray(reads) || reads.length !== 2 || !payload.native || payload.native.start?.accepted !== true || payload.native.start.invoked !== true || payload.native.start.requestNonce !== payload.requestNonce) return false;
    const first = reads[0].result?.startReservation, receipt = first?.manualQueueReceipt, manifest = receipt?.manifest;
    if (!receipt || first.schema !== RESERVATION_SCHEMA || first.batchId !== args.batchId || first.requestNonce !== payload.requestNonce || !SHA.test(first.operationBinding || "") || first.transportResolved !== false || first.state !== "unknown_outcome" ||
        receipt.proofSource !== "authenticated_cep_user_declaration" || receipt.physicalHumanVerified !== false || receipt.nativeQueueCompositionVerified !== false || receipt.declaration !== DECLARATION || digest(receipt) !== first.receiptHash ||
        manifestHash(manifest) !== args.manualQueueManifestSha25664 || receipt.manifestHash !== args.manualQueueManifestSha25664 || receipt.actionId !== run.provenance?.actionId || receipt.revision !== run.provenance?.proposalRevision || receipt.payloadHash !== run.provenance?.payloadHash || receipt.runId !== run.id || receipt.requestNonce !== first.requestNonce || receipt.operationBinding !== first.operationBinding ||
        receipt.previewHash !== run.m100Action?.previewHash || receipt.confirmationSessionId !== run.m100Action?.confirmedBySession || run.m100Action?.confirmedBySurface !== "cep-panel" || receipt.confirmedAt !== run.m100Action?.confirmedAt ||
        receipt.dryRunReceipt?.payloadHash !== receipt.payloadHash || receipt.dryRunReceipt.previewHash !== receipt.previewHash || !UUID.test(receipt.dryRunReceipt.runId || "") || receipt.dryRunReceipt.stepCount !== 1 || receipt.dryRunReceipt.projectFile !== receipt.checkpoint?.sourceFile ||
        !Number.isFinite(Date.parse(receipt.declaredAt)) || !Number.isFinite(Date.parse(first.reservedAt)) || !Number.isFinite(Date.parse(receipt.expiresAt)) || Date.parse(receipt.declaredAt) > Date.parse(first.reservedAt) || Date.parse(first.reservedAt) >= Date.parse(receipt.expiresAt) ||
        manifest.batchId !== args.batchId || manifest.targetSpecifier !== args.targetSpecifier || manifest.process.pid !== args.expectedProcess.pid || manifest.process.startedAt !== args.expectedProcess.startedAt || args.expectedSessionNonce && manifest.nativeSessionNonce !== args.expectedSessionNonce ||
        first.operationBinding !== crypto.createHash("sha256").update(JSON.stringify({ operation: "start", batchId: args.batchId, jobs: manifest.jobs.map(j => j.jobId), manifestHash: receipt.manifestHash })).digest("hex") || payload.native.operationBinding !== first.operationBinding) return false;
    const nonces = new Set([first.requestNonce]), ids = new Set();
    for (const read of reads) {
      const observed = read.result, native = observed?.native, job = native?.job, wanted = manifest.jobs.find(j => j.jobId === read.args?.jobId);
      if (!wanted || ids.has(wanted.jobId) || read.args.batchId !== args.batchId || read.args.targetSpecifier !== args.targetSpecifier || read.args.expectedProcess?.pid !== args.expectedProcess.pid || read.args.expectedProcess.startedAt !== args.expectedProcess.startedAt || (read.args.expectedSessionNonce || null) !== (args.expectedSessionNonce || null) ||
          observed?.schema !== "ae-agent-ame-title-jobs.v1" || observed.ok !== true || observed.code !== "job_observed" || observed.nativeAssociationVerified !== true || observed.nativeQueueCompositionVerified !== false || observed.batchId !== args.batchId || observed.jobId !== wanted.jobId || observed.handleKey !== wanted.jobId || observed.nativeJobId !== null || digest(observed.startReservation) !== digest(first) ||
          digest(observed.process) !== digest(manifest.process) || !native || native.schema !== "ae-agent-ame-title-native.v1" || native.code !== "job_observed" || native.appSpecifier !== args.targetSpecifier || native.sessionNonce !== manifest.nativeSessionNonce || native.start?.requestNonce !== first.requestNonce || native.start.invoked !== true || native.start.accepted !== true ||
          !UUID.test(native.requestNonce || "") || nonces.has(native.requestNonce) || native.requestNonce !== observed.requestNonce || native.operationBinding !== crypto.createHash("sha256").update(JSON.stringify({ operation: "status", jobId: wanted.jobId })).digest("hex") ||
          !job || job.nativeJobId !== null || job.handleKey !== wanted.handleKey || job.nativeAssociationVerified !== true || job.retainedWrapperSessionNonce !== manifest.retainedWrapperSessionNonce || job.enqueueRequestNonce !== wanted.enqueueRequestNonce || job.processBinding !== manifest.processBinding || job.presetIdentity !== manifest.presetIdentity ||
          job.sourcePath !== wanted.source.path || job.sourceGuid !== wanted.source.guid || job.outputPath !== wanted.outputPath || digest(job.range) !== digest(wanted.range) || !Array.isArray(job.outputFiles) || job.outputFiles.length !== 1 || job.outputFiles[0] !== wanted.outputPath ||
          !Number.isFinite(payload.native.observedAt) || !Number.isFinite(native.observedAt) || !Number.isFinite(Date.parse(observed.observedAt)) || !Number.isFinite(Date.parse(read.observedAt)) || native.observedAt < Date.parse(first.reservedAt) || native.observedAt < payload.native.observedAt || native.observedAt > Date.parse(observed.observedAt) + 60000 || Date.parse(read.observedAt) < Date.parse(observed.observedAt) ||
          Number.isFinite(Date.parse(run.startedAt)) && Date.parse(first.reservedAt) < Date.parse(run.startedAt) || Number.isFinite(Date.parse(run.finishedAt)) && Date.parse(read.observedAt) > Date.parse(run.finishedAt)) return false;
      nonces.add(native.requestNonce); ids.add(wanted.jobId);
    }
    return true;
  } catch (_) { return false; }
}

// Issuer stays inside the daemon. JSON, chat flags, general action dispatch and
// echoed confirmation-surface strings cannot create this WeakMap capability.
// Panel credentials authenticate a declaration; they do not prove a human or
// the complete AME queue. isTrusted is checked in the private CEP closure.
function createManualQueueGrant(deps) {
  if (!deps || !path.isAbsolute(deps.stateDir || "") || ["assertManualIngress", "assertServerContext", "assertPanelIdentity"].some(key => typeof deps[key] !== "function")) denied("ame_manual_queue_invalid_dependencies");
  const ingress = new AsyncLocalStorage(), caps = new WeakMap(), now = deps.now || Date.now;
  const fingerprint = context => digest({ actionId: context.record.actionId, revision: context.record.revision, payloadHash: context.record.payloadHash,
    previewHash: context.record.previewHash, runId: context.runId, confirmationSessionId: context.record.confirmedBySession,
    confirmedAt: context.record.confirmedAt, dryRunCompletedAt: context.record.dryRunCompletedAt, dryRunReceipt: context.record.dryRunReceipt,
    checkpoint: context.checkpoint, args: context.args });
  async function runAuthenticated(meta, callback) {
    if (!meta || meta.route !== ROUTE || meta.authRole !== "panel" || meta.panelIdentityValid !== true || meta.trustedGesture !== true || meta.declaration !== DECLARATION || !SHA.test(meta.manifestHash || "") || !UUID.test(meta.acceptedDryRunId || "") || !validText(meta.panelConnectionId) || !validText(meta.panelGeneration)) denied();
    const frame = { alive: true, issuedAt: now(), expiresAt: now() + 120000, meta: Object.freeze(clone(meta)) };
    try { return await ingress.run(frame, callback); } finally { frame.alive = false; }
  }
  function validate(context, manifest, frame) {
    const record = context && context.record;
    if (!frame || !frame.alive || now() >= frame.expiresAt || now() < frame.issuedAt || !record || !validText(record.actionId) || !Number.isSafeInteger(record.revision) || record.revision < 1 || !UUID.test(context.runId || "") || context.autonomous !== false || context.confirm !== true || context.allowWithoutCheckpoint !== false || context.stepCount !== 1 || record.executionState !== "executing" || record.executionId !== context.runId ||
        record.confirmedBySurface !== "cep-panel" || record.confirmationSurface !== "cep-panel" || !record.payload || sha256Payload(record.payload) !== record.payloadHash || !SHA.test(record.previewHash || "") || !context.checkpoint || !context.args || context.args.manualQueueManifestSha25664 !== frame.meta.manifestHash || manifestHash(manifest) !== frame.meta.manifestHash ||
        !record.dryRunReceipt || record.dryRunReceipt.runId !== frame.meta.acceptedDryRunId || record.dryRunReceipt.payloadHash !== record.payloadHash || record.dryRunReceipt.previewHash !== record.previewHash || record.dryRunReceipt.stepCount !== 1 || record.dryRunReceipt.projectFile !== record.project?.expectedFile ||
        context.args.targetSpecifier !== manifest.targetSpecifier || context.args.batchId !== manifest.batchId || context.args.expectedProcess?.pid !== manifest.process.pid || context.args.expectedProcess?.startedAt !== manifest.process.startedAt || context.args.expectedSessionNonce && context.args.expectedSessionNonce !== manifest.nativeSessionNonce ||
        !Number.isFinite(Date.parse(record.dryRunCompletedAt)) || now() - Date.parse(record.dryRunCompletedAt) > 300000 || Date.parse(record.dryRunCompletedAt) > frame.issuedAt || !Number.isFinite(Date.parse(record.confirmedAt)) || Date.parse(record.confirmedAt) < Date.parse(record.dryRunCompletedAt) || !Number.isFinite(Date.parse(record.proposalExpiresAt)) || Date.parse(record.proposalExpiresAt) <= now()) denied("ame_manual_queue_binding_changed_or_expired");
    assertSync(deps.assertManualIngress, context); assertSync(deps.assertServerContext, context); if (assertSync(deps.assertPanelIdentity, frame.meta) !== true) denied("ame_manual_queue_panel_identity_changed");
  }
  function authorize(context, manifest) {
    const frame = ingress.getStore(); validate(context, manifest, frame);
    const cap = Object.freeze(Object.create(null)); caps.set(cap, { context, frame, fingerprint: fingerprint(context), manifestHash: manifestHash(manifest), active: true }); return cap;
  }
  function assertCapability(cap, context, manifest) {
    const saved = cap && caps.get(cap), frame = ingress.getStore();
    if (!saved || !saved.active || saved.context !== context || saved.frame !== frame || saved.fingerprint !== fingerprint(context) || saved.manifestHash !== manifestHash(manifest)) denied();
    validate(context, manifest, frame); return saved;
  }
  function consume(cap, context, manifest, start) {
    const saved = assertCapability(cap, context, manifest), record = context.record;
    if (start.batchId !== manifest.batchId || !Number.isFinite(Date.parse(start.reservedAt)) || Date.parse(start.reservedAt) < saved.frame.issuedAt || now() - Date.parse(start.reservedAt) > 1000 || Date.parse(start.reservedAt) > now()) denied("ame_manual_queue_reservation_mismatch");
    const receipt = { schema: "ae-agent-ame-manual-queue-receipt.v1", proofSource: "authenticated_cep_user_declaration", physicalHumanVerified: false,
      nativeQueueCompositionVerified: false, declaration: DECLARATION, declaredAt: new Date(saved.frame.issuedAt).toISOString(), expiresAt: new Date(saved.frame.expiresAt).toISOString(),
      batchId: manifest.batchId, manifest: clone(manifest), manifestHash: saved.manifestHash, requestNonce: start.requestNonce, operationBinding: start.operationBinding,
      actionId: record.actionId, revision: record.revision, payloadHash: record.payloadHash, previewHash: record.previewHash, runId: context.runId,
      dryRunReceipt: clone(record.dryRunReceipt), checkpoint: clone(context.checkpoint), confirmationSessionId: record.confirmedBySession,
      panelConnectionId: saved.frame.meta.panelConnectionId, panelGeneration: saved.frame.meta.panelGeneration, confirmedAt: record.confirmedAt,
      limitation: "AME API cannot verify the entire queue or exclude an external queue change between this declaration and global runBatch." };
    const reserved = writeReservation(deps.stateDir, { ...start, schema: RESERVATION_SCHEMA, manualQueueReceipt: receipt, receiptHash: digest(receipt) });
    saved.active = false; return reserved;
  }
  return { runAuthenticated, authorize, assertCapability, consume, readReservation: batchId => readReservation(deps.stateDir, batchId) };
}
module.exports = { ROUTE, MANIFEST_SCHEMA, RESERVATION_SCHEMA, DECLARATION, manifestHash, buildManifest, validateManifest, writeReservation, readReservation, verifyStartEvidence, createManualQueueGrant };

"use strict";
const fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto");
const presets = require("./ame-presets"), reservation = require("./ame-submit-guard"), passive = require("./ame-passive-status");
const { sameProcess } = require("./ame-running");
const manualQueue = require("./ame-manual-queue-grant");
const sharedQueue = require("./ame-shared-queue-grant");
const INSPECT = "inspect_ame_title_sources", ENQUEUE = "enqueue_ame_title_variant", START = "start_ame_title_batch", STATUS = "get_ame_title_job_status";
const QUEUE_MANIFEST = "inspect_ame_title_queue_manifest";
const SCHEMA = "ae-agent-ame-title-jobs.v1", NATIVE_SCHEMA = "ae-agent-ame-title-native.v1", LEDGER_SCHEMA = "ae-agent-ame-title-batch.v1";
const SLOT = "aeAgentAMETitleJobsV1", SENDER_SLOT = "aeAgentAMETitleSendV1";
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/, SHA = /^[a-f0-9]{64}$/;
const META = ["verifyAfter", "idempotencyKey", "idempotencyScope", "checkpointLabel", "autoCheckpoint"];
const hash = value => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const samePath = (a, b) => String(a || "").replace(/\\/g, "/").toLowerCase() === String(b || "").replace(/\\/g, "/").toLowerCase();
function fail(code) { throw Object.assign(new Error(code), { code }); }
function object(value, keys) { if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some(k => !keys.includes(k))) fail("ame_title_invalid_input"); }
function text(value, max = 512) { if (typeof value !== "string" || !value || value !== value.trim() || value.length > max || /[\x00-\x1f\x7f]/.test(value)) fail("ame_title_invalid_text"); return value; }
function localFile(value, extension) {
  text(value, 4096); if (!path.isAbsolute(value) || /^(?:\\\\|\/\/)/.test(value) || value.replace(/\\/g, "/").split("/").some(p => p === "." || p === "..") || path.extname(value).toLowerCase() !== extension) fail("ame_title_invalid_path"); return value;
}
function validateInput(name, raw = {}) {
  const common = ["targetSpecifier", "expectedProcess", "expectedSessionNonce", "timeoutMs"], source = ["sourceProjectFile", "expectedSourceSha25664"];
  const fields = name === INSPECT ? [...source, "reconcileRequestNonce"] : name === ENQUEUE ? [...source, "batchId", "sourceGuid", "presetId", "presetSha25664", "outputFileName", "range", "queueMode"] : name === START ? ["batchId", "manualQueueMode", "manualQueueManifestSha25664", "completedOwnedPrefix", "queueMode"] : name === QUEUE_MANIFEST ? ["batchId", "manualQueueMode", "completedOwnedPrefix"] : name === STATUS ? ["batchId", "jobId", "originalRunId"] : null;
  if (!fields) fail("ame_title_unknown_tool"); object(raw, [...common, ...fields, ...(name === ENQUEUE || name === START ? META : [])]);
  if (!/^ame-[0-9]{1,3}\.[0-9]{1,3}$/.test(text(raw.targetSpecifier))) fail("ame_title_exact_target_required");
  object(raw.expectedProcess, ["pid", "startedAt"]);
  if (!Number.isSafeInteger(raw.expectedProcess.pid) || raw.expectedProcess.pid < 1 || typeof raw.expectedProcess.startedAt !== "string" || !Number.isFinite(Date.parse(raw.expectedProcess.startedAt))) fail("ame_title_process_binding_required");
  const a = { targetSpecifier: raw.targetSpecifier, expectedProcess: { pid: raw.expectedProcess.pid, startedAt: new Date(raw.expectedProcess.startedAt).toISOString() }, timeoutMs: raw.timeoutMs === undefined ? 5000 : raw.timeoutMs };
  if (!Number.isSafeInteger(a.timeoutMs) || a.timeoutMs < 1000 || a.timeoutMs > 10000) fail("ame_title_invalid_timeout");
  if (raw.expectedSessionNonce !== undefined) { if (!/^[A-Za-z0-9._-]{1,128}$/.test(text(raw.expectedSessionNonce, 128))) fail("ame_title_invalid_session"); a.expectedSessionNonce = raw.expectedSessionNonce; }
  if (name === INSPECT || name === ENQUEUE) { a.sourceProjectFile = localFile(raw.sourceProjectFile, ".aep"); if (typeof raw.expectedSourceSha25664 !== "string" || !SHA.test(raw.expectedSourceSha25664)) fail("ame_title_source_hash_required"); a.expectedSourceSha25664 = raw.expectedSourceSha25664; }
  if (name === INSPECT && raw.reconcileRequestNonce !== undefined) { if (typeof raw.reconcileRequestNonce !== "string" || !UUID.test(raw.reconcileRequestNonce)) fail("ame_title_invalid_nonce"); a.reconcileRequestNonce = raw.reconcileRequestNonce; }
  if (name !== INSPECT) { if (typeof raw.batchId !== "string" || !UUID.test(raw.batchId)) fail("ame_title_invalid_batch"); a.batchId = raw.batchId; }
  if (raw.queueMode !== undefined) {
    if (raw.queueMode !== sharedQueue.MODE || raw.manualQueueMode !== undefined || raw.manualQueueManifestSha25664 !== undefined || raw.completedOwnedPrefix !== undefined) fail("ame_shared_queue_mode_invalid");
    a.queueMode = sharedQueue.MODE;
  }
  if (name === QUEUE_MANIFEST || name === START && raw.manualQueueMode !== undefined) {
    if (raw.manualQueueMode !== "cep_user_declaration_v2" || !Array.isArray(raw.completedOwnedPrefix) || raw.completedOwnedPrefix.length > 63) fail("ame_title_manual_queue_mode_invalid");
    const seen = new Set(); a.manualQueueMode = raw.manualQueueMode;
    a.completedOwnedPrefix = raw.completedOwnedPrefix.map(ref => {
      object(ref, ["batchId", "jobId"]);
      if (Object.keys(ref).length !== 2 || !UUID.test(ref.batchId || "") || !UUID.test(ref.jobId || "") || ref.batchId === a.batchId || seen.has(ref.jobId)) fail("ame_title_completed_prefix_invalid");
      seen.add(ref.jobId); return { batchId: ref.batchId, jobId: ref.jobId };
    });
    if (name === START) { if (!SHA.test(raw.manualQueueManifestSha25664 || "")) fail("ame_title_queue_manifest_hash_required"); a.manualQueueManifestSha25664 = raw.manualQueueManifestSha25664; }
  } else if (name === START && (raw.manualQueueManifestSha25664 !== undefined || raw.completedOwnedPrefix !== undefined)) fail("ame_title_manual_queue_mode_required");
  if (name === STATUS) { if (typeof raw.jobId !== "string" || !UUID.test(raw.jobId)) fail("ame_title_invalid_job"); a.jobId = raw.jobId;if(raw.originalRunId!==undefined){if(!UUID.test(raw.originalRunId))fail("ame_title_invalid_run");a.originalRunId=raw.originalRunId;} }
  if (name === ENQUEUE) {
    a.sourceGuid = text(raw.sourceGuid, 160);
    if (!/^amep_[a-f0-9]{40}$/.test(raw.presetId || "") || !SHA.test(raw.presetSha25664 || "")) fail("ame_title_exact_preset_required");
    a.presetId = raw.presetId; a.presetSha25664 = raw.presetSha25664; a.outputFileName = text(raw.outputFileName, 160);
    if (/[/\\:*?"<>|]/.test(a.outputFileName) || /[. ]$/.test(a.outputFileName) || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])\./i.test(a.outputFileName) || !/\.(?:mov|avi|mp4|mxf)$/i.test(a.outputFileName)) fail("ame_title_invalid_output_name");
    object(raw.range, ["startSeconds", "endSeconds"]);
    if (!Number.isFinite(raw.range.startSeconds) || raw.range.startSeconds < 0 || !Number.isFinite(raw.range.endSeconds) || raw.range.endSeconds <= raw.range.startSeconds) fail("ame_title_invalid_range");
    a.range = { startSeconds: raw.range.startSeconds, endSeconds: raw.range.endSeconds };
  }
  return a;
}
function operationArgsHash(name, raw) { return hash(validateInput(name, raw)); }
const literal = value => JSON.stringify(value).replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");

// ES3 AME receiver: fixed calls only. IDs here are our correlation handles, never
// invented native queue IDs. The actual returned EncoderWrapper is retained.
function nativeTitleJob(a) {
  function scalar(v) { return typeof v === "string" ? v.substring(0, 4096) : typeof v === "number" && isFinite(v) || typeof v === "boolean" ? v : null; }
  function utf8Bytes(v, maximum) { var bytes = 0, i, c, low; for (i = 0; i < v.length; i++) { c = v.charCodeAt(i); if (c < 128) bytes++; else if (c < 2048) bytes += 2; else if (c >= 55296 && c <= 56319) { if (++i >= v.length) return -1; low = v.charCodeAt(i); if (low < 56320 || low > 57343) return -1; bytes += 4; } else if (c >= 56320 && c <= 57343) return -1; else bytes += 3; if (bytes > maximum) return -1; } return bytes; }
  function norm(v) { return String(v || "").replace(/\\/g, "/").toLowerCase(); }
  function stringify(v) {
    var out = [], i, k, s;
    if (v === null || v === undefined) return "null";
    if (typeof v === "number" || typeof v === "boolean") return String(v);
    if (typeof v === "string") { s = v.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/[\x00-\x1f\u2028\u2029]/g, function(c) { var h = c.charCodeAt(0).toString(16); while (h.length < 4) h = "0" + h; return "\\u" + h; }); return '"' + s + '"'; }
    if (Object.prototype.toString.call(v) === "[object Array]") { for (i = 0; i < v.length; i++) out.push(stringify(v[i])); return "[" + out.join(",") + "]"; }
    for (k in v) if (Object.prototype.hasOwnProperty.call(v, k)) out.push(stringify(k) + ":" + stringify(v[k])); return "{" + out.join(",") + "}";
  }
  var reply = { schema: "ae-agent-ame-title-native.v1", requestNonce: a.requestNonce, operationBinding: a.operationBinding, appSpecifier: String(BridgeTalk.appSpecifier), sessionNonce: scalar($.global.aeAgentAMEProbeSessionNonce), observedAt: new Date().getTime(), code: "unsupported", nativeJobId: null, nativeAssociationVerified: false };
  function done(code) { reply.code = code; var serialized = stringify(reply); if (utf8Bytes(serialized, 524288) < 0) { reply = { schema: reply.schema, requestNonce: reply.requestNonce, operationBinding: reply.operationBinding, appSpecifier: reply.appSpecifier, sessionNonce: reply.sessionNonce, observedAt: reply.observedAt, code: "native_response_envelope_oversize", nativeJobId: null, nativeAssociationVerified: false }; serialized = stringify(reply); } return serialized; }
  if(a.ownedInitialDispatch===true){var rawProbe=$.global.aeAgentAMEProbeSessionNonce;if(!(rawProbe===undefined||rawProbe===null||typeof rawProbe==="string"&&/^[A-Za-z0-9._-]{1,128}$/.test(rawProbe)))return done("owned_probe_observation_invalid");}
  if (reply.appSpecifier !== a.targetSpecifier || a.expectedSessionNonce && reply.sessionNonce !== a.expectedSessionNonce) return done("target_session_changed");
  if(a.ownedInitialDispatch===true&&a.operation!=="sources"){
    if(!Object.prototype.hasOwnProperty.call(a,"boundNativeSessionNonce")||!(a.boundNativeSessionNonce===null||typeof a.boundNativeSessionNonce==="string"&&/^[A-Za-z0-9._-]{1,128}$/.test(a.boundNativeSessionNonce))||reply.sessionNonce!==a.boundNativeSessionNonce)return done("owned_target_session_changed");
  }
  var slot = $.global.aeAgentAMETitleJobsV1, frontend, host, ids, i, entry, batch;
  function readEntry(e) {
    var result = { handleKey: e.handleKey, enqueueRequestNonce: e.enqueueRequestNonce, retainedWrapperSessionNonce: slot.retainedWrapperSessionNonce, sourcePath: e.sourcePath, sourceGuid: e.sourceGuid, outputPath: e.outputPath, presetIdentity: e.presetIdentity, range: e.range, processBinding: e.processBinding, nativeJobId: null, nativeAssociationVerified: e.associated === true, workAreaApplied: e.workAreaApplied === true, status: e.status, nativeCompletionObserved: e.finished === true && (e.queueMode !== "shared_queue_v1" || !!e.hostCompletion && e.completionOrigin === "host_exact_paths"), nativeResult: e.nativeResult, completionOrigin: e.completionOrigin || null, eventObservedAt: e.eventObservedAt || null, hostCompletion: e.hostCompletion || null, wrapperCompletion: e.wrapperCompletion || null, readErrors: [] };
    try { result.outputFiles = []; var files = e.wrapper && e.wrapper.outputFiles; if (!files || typeof files.length !== "number") throw Error(); for (var n = 0; n < files.length && n < 8; n++) result.outputFiles.push(String(files[n])); if (files.length !== 1 || norm(files[0]) !== norm(e.outputPath)) result.nativeAssociationVerified = false; } catch (x1) { result.readErrors.push("output_files_read_error"); result.nativeAssociationVerified = false; }
    for (var name in { getEncodeProgress: 1, getEncodeTime: 1 }) {
      try { if (!e.wrapper || typeof e.wrapper[name] !== "function") throw Error(); result[name] = scalar(e.wrapper[name]()); } catch (x2) { result.readErrors.push(name + "_read_error"); }
    }
    if (e.queueMode === "shared_queue_v1" && (result.readErrors.length || !result.workAreaApplied)) result.nativeAssociationVerified = false;
    result.rawLogCaptures = []; var captures = e.rawLogCaptures || [], capture, index;
    for (index = 0; index < captures.length; index++) { capture = captures[index]; result.rawLogCaptures.push({ ordinal: capture.ordinal, kind: capture.kind, callbackOrdinal: capture.callbackOrdinal, observedAt: capture.observedAt, code: capture.code, utf8Bytes: capture.utf8Bytes }); }
    result.rawLogSnapshot = null;
    if (a.rawLogOrdinal !== undefined) { if (typeof a.rawLogOrdinal !== "number" || a.rawLogOrdinal < 1 || a.rawLogOrdinal > 3 || Math.floor(a.rawLogOrdinal) !== a.rawLogOrdinal) result.readErrors.push("raw_log_exact_ordinal_required");
      else if (a.rawLogOrdinal <= captures.length) result.rawLogSnapshot = captures[a.rawLogOrdinal - 1]; }
    return result;
  }
  function captureRaw(e, kind, event) {
    if (!e.rawLogCaptures || e.rawLogCaptures.length >= 3 || e.rawLogKinds[kind]) return;
    // Original callbacks capture the getter once. Status retrieval only reads
    // these retained bytes; a callback label does not assert a current phase.
    e.rawLogKinds[kind] = true;
    var snapshot = { ordinal: e.rawLogCaptures.length + 1, kind: kind, callbackOrdinal: e.callbackOrdinal, observedAt: new Date().getTime(), code: "get_log_read_error", utf8Bytes: 0, raw: null,
      handleKey: e.handleKey, enqueueRequestNonce: e.enqueueRequestNonce, retainedWrapperSessionNonce: slot.retainedWrapperSessionNonce, processBinding: e.processBinding, sourcePath: e.sourcePath, outputPath: e.outputPath, presetIdentity: e.presetIdentity,
      callbackSource: event && typeof event.sourceFilePath === "string" ? event.sourceFilePath : null, callbackOutput: event && typeof event.outputFilePath === "string" ? event.outputFilePath : null,
      callbackStatus: event && typeof event.status === "number" && isFinite(event.status) ? event.status : null, callbackResult: event && typeof event.result === "string" ? scalar(event.result) : null,
      activeEncodingWindowVerified: false, frozenEncodeSettingsVerified: false };
    e.rawLogCaptures.push(snapshot); // irreversible before the actual getter
    try { var original = e.wrapper, before = original && original.outputFiles;
      if (!original || typeof original.getLogOutput !== "function" || !before || before.length !== 1 || norm(before[0]) !== norm(e.outputPath)) { snapshot.code = "get_log_original_wrapper_refused"; return; }
      var raw = original.getLogOutput(), after = original.outputFiles;
      if (original !== e.wrapper || !after || after.length !== 1 || norm(after[0]) !== norm(e.outputPath)) { snapshot.code = "get_log_original_wrapper_changed"; return; }
      if (typeof raw !== "string") { snapshot.code = "get_log_string_required"; return; }
      var bytes = utf8Bytes(raw, 65536); if (bytes < 0) { snapshot.code = "get_log_utf8_bound_refused"; return; }
      snapshot.raw = raw; snapshot.utf8Bytes = bytes; snapshot.code = raw.length ? "raw_log_captured" : "raw_log_empty";
    } catch (readError) { snapshot.code = "get_log_read_error"; }
  }
  function finish(e, event, origin) {
    e.callbackOrdinal++; captureRaw(e, "finished", event);
    var result = scalar(event && typeof event === "object" ? event.result : event), observedAt = new Date().getTime();
    e.finished = true; e.status = "native_finished";
    // Wrapper events retain their raw result, but cannot replace exact host proof.
    if (origin === "host_exact_paths" || !e.hostCompletion) { e.nativeResult = result; e.completionOrigin = origin; e.eventObservedAt = observedAt; }
    if (origin === "host_exact_paths") e.hostCompletion = { sourceFilePath: String(event.sourceFilePath), outputFilePath: String(event.outputFilePath), result: result, observedAt: observedAt };
    else e.wrapperCompletion = { result: result, observedAt: observedAt };
  }
  try {
    if (a.operation === "status") {
      entry = slot && slot.jobs[a.jobId]; if (!entry || entry.processBinding !== a.processBinding || entry.batchId !== a.batchId) return done("native_handle_unavailable");
      if (typeof app.getEncoderHost !== "function") return done("encoder_host_unsupported"); host = app.getEncoderHost();
      if (!host || typeof host.isBatchRunning !== "function") return done("batch_running_unknown"); reply.batchRunning = scalar(host.isBatchRunning());
      reply.start = slot.batches[a.batchId] && slot.batches[a.batchId].start || null;
      reply.job = readEntry(entry); reply.nativeAssociationVerified = reply.job.nativeAssociationVerified; return done("job_observed");
    }
    if (a.operation === "shared_status" && a.ownedInitialDispatch === true && a.queueMode === "shared_queue_v1") {
      if (!slot || !a.jobIds || a.jobIds.length !== 2 || a.jobIds[0] === a.jobIds[1] || slot.retainedWrapperSessionNonce !== a.retainedWrapperSessionNonce) return done("owned_shared_status_origin_changed");
      batch = slot.batches[a.batchId]; if (!batch || batch.processBinding !== a.processBinding || batch.jobIds.length !== 2) return done("owned_shared_status_batch_changed");
      if (typeof app.getEncoderHost !== "function") return done("encoder_host_unsupported"); host = app.getEncoderHost();
      if (!host || typeof host.isBatchRunning !== "function") return done("batch_running_unknown"); reply.batchRunning = scalar(host.isBatchRunning());
      reply.jobs = []; reply.start = batch.start || null;
      for (i = 0; i < a.jobIds.length; i++) { entry = slot.jobs[a.jobIds[i]]; if (batch.jobIds[i] !== a.jobIds[i] || !entry || entry.batchId !== a.batchId || entry.processBinding !== a.processBinding) return done("owned_shared_status_entry_changed");
        var statusEntry = readEntry(entry); if (!statusEntry.nativeAssociationVerified || !statusEntry.workAreaApplied || statusEntry.readErrors.length || statusEntry.status !== "queued" && statusEntry.status !== "running" && statusEntry.status !== "native_finished") return done("owned_shared_status_entry_changed"); reply.jobs.push(statusEntry); }
      reply.nativeAssociationVerified = true; return done("shared_jobs_observed");
    }
    if (typeof app.getFrontend !== "function") return done("frontend_unsupported"); frontend = app.getFrontend();
    if (a.operation === "sources" || a.operation === "enqueue" && a.savedNativeSourceVerified !== true) {
      if (!frontend || typeof frontend.getDLItemsAtRoot !== "function") return done("dl_items_unsupported"); ids = frontend.getDLItemsAtRoot(a.sourcePath);
      if (!ids || typeof ids.length !== "number" || ids.length > 256) return done("dl_items_read_error"); reply.sourceGuids = [];
      for (i = 0; i < ids.length; i++) { if (typeof ids[i] !== "string" || !ids[i] || ids[i].length > 160) return done("dl_items_read_error"); reply.sourceGuids.push(ids[i]); }
      if (a.operation === "sources") return done("sources_observed");
      var matches = 0; for (i = 0; i < ids.length; i++) if (ids[i] === a.sourceGuid) matches++; if (matches !== 1) return done("exact_source_guid_unavailable");
    }
    if (typeof app.getEncoderHost !== "function") return done("encoder_host_unsupported"); host = app.getEncoderHost();
    if (!host || typeof host.isBatchRunning !== "function") return done("batch_running_or_unknown");reply.batchRunning=scalar(host.isBatchRunning());
    if (a.operation === "start" && a.queueMode === "shared_queue_v1" && reply.batchRunning === true) {
      if (!slot || !a.jobIds || a.jobIds.length !== 2 || !a.expectedJobs || a.expectedJobs.length !== 2 || slot.retainedWrapperSessionNonce !== a.retainedWrapperSessionNonce) return done("owned_batch_changed");
      reply.jobs = [];
      for (i = 0; i < a.jobIds.length; i++) { entry = slot.jobs[a.jobIds[i]]; if (!entry || entry.batchId !== a.batchId || entry.processBinding !== a.processBinding) return done("owned_batch_changed"); var active = readEntry(entry); if (!active.nativeAssociationVerified || active.status !== "running" && active.status !== "native_finished") return done("batch_running_or_unknown"); reply.jobs.push(active); }
      return done("shared_queue_already_running");
    }
    if(reply.batchRunning!==false)return done("batch_running_or_unknown");
    if(a.operation==="queue"&&a.ownedInitialDispatch===true){
      if(!slot||slot.retainedWrapperSessionNonce!==a.retainedWrapperSessionNonce||!a.jobIds||a.jobIds.length<1||a.jobIds.length>2)return done("owned_queue_origin_changed");
      if (a.queueMode === "shared_queue_v1") {
        reply.queue = { expectedJobs: [], completedOwnedPrefix: [] };
        for (i = 0; i < a.jobIds.length; i++) { entry = slot.jobs[a.jobIds[i]]; if (!entry || entry.processBinding !== a.processBinding || entry.batchId !== a.batchId || i > 0 && a.jobIds[i] === a.jobIds[0]) return done("owned_queue_entry_unavailable"); var own = readEntry(entry); if (!own.nativeAssociationVerified || own.status !== "queued" || !own.workAreaApplied || own.readErrors.length) return done("owned_queue_entry_changed"); reply.queue.expectedJobs.push(own); }
        return done("owned_queue_observed");
      }
      var known={},count=0,key;reply.queue={expectedJobs:[],completedOwnedPrefix:[]};
      for(i=0;i<a.jobIds.length;i++){key=a.jobIds[i];if(known[key]||!slot.jobs[key])return done("owned_queue_entry_unavailable");known[key]=true;entry=slot.jobs[key];var observed=readEntry(entry);if(!observed.nativeAssociationVerified||observed.status!==(i===a.jobIds.length-1?"queued":"native_finished"))return done("owned_queue_entry_changed");if(i===a.jobIds.length-1)reply.queue.expectedJobs.push(observed);else reply.queue.completedOwnedPrefix.push(observed);}
      for(key in slot.jobs)if(Object.prototype.hasOwnProperty.call(slot.jobs,key)){count++;if(!known[key])return done("owned_queue_foreign_entry");}if(count!==a.jobIds.length)return done("owned_queue_census_changed");return done("owned_queue_observed");
    }
    if (a.operation === "start") {
      if (a.manualQueueMode === "cep_user_declaration_v2" && reply.sessionNonce !== a.boundNativeSessionNonce) return done("target_session_changed");
      batch = slot && slot.batches[a.batchId]; if (!batch || batch.presetIdentity !== a.presetIdentity || batch.processBinding !== a.processBinding || batch.start) return done("native_batch_unavailable_or_start_reserved");
      if (batch.jobIds.length !== a.jobIds.length) return done("owned_batch_changed");
      for (i = 0; i < a.jobIds.length; i++) { entry = slot.jobs[a.jobIds[i]]; if (batch.jobIds[i] !== a.jobIds[i] || !entry || !entry.associated || entry.status !== "queued" || !readEntry(entry).nativeAssociationVerified) return done("owned_batch_changed"); }
      if (a.queueMode === "shared_queue_v1") {
        if (a.jobIds.length !== 2 || !a.expectedJobs || a.expectedJobs.length !== 2 || slot.retainedWrapperSessionNonce !== a.retainedWrapperSessionNonce || reply.sessionNonce !== a.boundNativeSessionNonce) return done("owned_shared_queue_guard_changed");
        for (i = 0; i < a.expectedJobs.length; i++) {
          var required = a.expectedJobs[i]; entry = slot.jobs[a.jobIds[i]];
          if (required.jobId !== a.jobIds[i] || entry.batchId !== a.batchId || entry.enqueueRequestNonce !== required.enqueueRequestNonce || entry.processBinding !== a.processBinding || entry.presetIdentity !== a.presetIdentity || entry.sourcePath !== required.source.path || entry.sourceGuid !== required.source.guid || entry.outputPath !== required.outputPath || stringify(entry.range) !== stringify(required.range)) return done("owned_shared_queue_guard_changed");
          var checked = readEntry(entry); if (!checked.nativeAssociationVerified || !checked.workAreaApplied || checked.readErrors.length || checked.status !== "queued") return done("owned_shared_queue_guard_changed");
        }
      }
      if (a.manualQueueMode === "cep_user_declaration_v2") {
        if (a.jobIds.length !== 1 || !a.expectedJobs || a.expectedJobs.length !== 1 || slot.retainedWrapperSessionNonce !== a.retainedWrapperSessionNonce) return done("owned_queue_guard_changed");
        var expected = {}, key, wanted, current, all = a.expectedJobs.concat(a.completedOwnedPrefix || []);
        for (i = 0; i < all.length; i++) {
          wanted = all[i]; expected[wanted.jobId] = true; entry = slot.jobs[wanted.jobId];
          if (!entry || entry.batchId !== (i === 0 ? a.batchId : wanted.batchId) || entry.enqueueRequestNonce !== wanted.enqueueRequestNonce || entry.processBinding !== a.processBinding || entry.presetIdentity !== a.presetIdentity || entry.sourcePath !== wanted.source.path || entry.sourceGuid !== wanted.source.guid || entry.outputPath !== wanted.outputPath || stringify(entry.range) !== stringify(wanted.range)) return done("owned_queue_guard_changed");
          current = readEntry(entry); if (!current.nativeAssociationVerified || current.status !== (i === 0 ? "queued" : "native_finished") || i > 0 && stringify(current.hostCompletion) !== stringify(wanted.completion)) return done("owned_queue_guard_changed");
        }
        for (key in slot.jobs) if (Object.prototype.hasOwnProperty.call(slot.jobs, key) && !expected[key]) return done("owned_queue_entry_not_declared");
      }
      if (typeof host.runBatch !== "function") return done("run_batch_unsupported");
      batch.start = { requestNonce: a.requestNonce, invoked: true, accepted: null }; var accepted = host.runBatch(); batch.start.accepted = scalar(accepted); reply.start = batch.start;
      if(a.ownedInitialDispatch===true){reply.job=readEntry(slot.jobs[a.queueMode === "shared_queue_v1" ? a.jobId : a.jobIds[0]]);reply.nativeAssociationVerified=reply.job.nativeAssociationVerified;}
      return done(accepted === true ? "batch_start_accepted" : "batch_start_unknown");
    }
    if (!frontend || typeof frontend.addDLToBatch !== "function") return done("add_dl_unsupported");
    if(a.ownedInitialDispatch===true){
      if(typeof a.newWrapperSessionNonce!=="string"||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(a.newWrapperSessionNonce))return done("owned_wrapper_nonce_required");
      if(a.ownedVariantSlot===1&&slot||a.ownedVariantSlot===2&&(!slot||slot.retainedWrapperSessionNonce!==a.newWrapperSessionNonce))return done("owned_wrapper_slot_changed");
      if(a.ownedVariantSlot!==1&&a.ownedVariantSlot!==2)return done("owned_wrapper_slot_invalid");
      if(a.ownedRangeMode!=="full_observed_root_range_v1"||!a.range||a.range.startSeconds!==0||typeof a.ownedObservedDuration!=="number"||!isFinite(a.ownedObservedDuration)||a.ownedObservedDuration<=0||a.range.endSeconds!==a.ownedObservedDuration)return done("owned_entire_range_invalid_before_submit");
    }
    if (!slot) { slot = { jobs: {}, batches: {}, count: 0, hostListeners: null, retainedWrapperSessionNonce: a.newWrapperSessionNonce }; $.global.aeAgentAMETitleJobsV1 = slot; }
    if (slot.count >= 256 || slot.jobs[a.jobId]) return done("native_handle_already_reserved_or_limit");
    batch = slot.batches[a.batchId]; if (batch && (batch.presetIdentity !== a.presetIdentity || batch.processBinding !== a.processBinding || batch.start || batch.jobIds.length >= 64)) return done("native_batch_identity_changed");
    if (!batch) { batch = { presetIdentity: a.presetIdentity, processBinding: a.processBinding, jobIds: [], start: null }; slot.batches[a.batchId] = batch; }
    entry = { handleKey: a.jobId, enqueueRequestNonce: a.requestNonce, batchId: a.batchId, sourcePath: a.sourcePath, sourceGuid: a.sourceGuid, outputPath: a.outputPath, presetIdentity: a.presetIdentity, range: a.range, processBinding: a.processBinding, queueMode: a.queueMode || null, wrapper: null, associated: false, workAreaApplied: false, status: "unknown_outcome", finished: false, nativeResult: null, rawLogCaptures: [], rawLogKinds: {}, callbackOrdinal: 0 };
    slot.jobs[a.jobId] = entry; slot.count++; batch.jobIds.push(a.jobId);
    if (!slot.hostListeners && typeof host.addEventListener === "function") {
      function hostEvent(event, complete) { var key, e; for (key in slot.jobs) if (Object.prototype.hasOwnProperty.call(slot.jobs, key)) { e = slot.jobs[key]; if (e.associated && event && norm(event.sourceFilePath) === norm(e.sourcePath) && norm(event.outputFilePath) === norm(e.outputPath)) { if (complete) finish(e, event, "host_exact_paths"); else { e.callbackOrdinal++; if (!e.finished) { e.status = "running"; e.eventObservedAt = new Date().getTime(); captureRaw(e, "started", event); } } } } }
      slot.hostListeners = { started: function(e) { hostEvent(e, false); }, complete: function(e) { hostEvent(e, true); } };
      host.addEventListener("onItemEncodingStarted", slot.hostListeners.started); host.addEventListener("onItemEncodeComplete", slot.hostListeners.complete);
    }
    // Empty format is the documented automatic format derived from this exact EPR.
    entry.wrapper = frontend.addDLToBatch(a.sourcePath, "", a.presetPath, a.sourceGuid, a.outputPath);
    if (!entry.wrapper || typeof entry.wrapper.setWorkArea !== "function" || typeof entry.wrapper.addEventListener !== "function") return done("encoder_wrapper_unsupported_after_submit");
    entry.listeners = { progress: function(event) { entry.callbackOrdinal++; if (!entry.finished) { entry.status = "running"; entry.eventObservedAt = new Date().getTime(); captureRaw(entry, "progress", event); } }, finished: function(e) { finish(entry, e, "native_wrapper"); } };
    entry.wrapper.addEventListener("onEncodeProgress", entry.listeners.progress); entry.wrapper.addEventListener("onEncodeFinished", entry.listeners.finished);
    if(a.ownedInitialDispatch===true&&a.ownedRangeMode==="full_observed_root_range_v1"){
      if(entry.wrapper.setWorkArea(0,0,a.ownedObservedDuration)!==true)return done("owned_entire_range_unverified_after_submit");
    }else if (entry.wrapper.setWorkArea(3, a.range.startSeconds, a.range.endSeconds) !== true) return done("work_area_unverified_after_submit");
    entry.workAreaApplied = true;
    entry.associated = true; if (entry.status === "unknown_outcome") entry.status = "queued"; reply.job = readEntry(entry); reply.nativeAssociationVerified = reply.job.nativeAssociationVerified;
    return done(reply.nativeAssociationVerified ? "job_enqueued" : "output_binding_unverified_after_submit");
  } catch (error) { reply.error = String(error).substring(0, 2000); return done("native_read_or_submit_error"); }
}

// Fixed AE sender. It never launches AME; unknown queue delivery blocks another send.
// Reconciliation pumps the SAME retained BridgeTalk message and never resubmits.
function nativeSend(a, messageBody) {
  function utf8Bytes(v, maximum) { var bytes = 0, i, c, low; for (i = 0; i < v.length; i++) { c = v.charCodeAt(i); if (c < 128) bytes++; else if (c < 2048) bytes += 2; else if (c >= 55296 && c <= 56319) { if (++i >= v.length) return -1; low = v.charCodeAt(i); if (low < 56320 || low > 57343) return -1; bytes += 4; } else if (c >= 56320 && c <= 57343) return -1; else bytes += 3; if (bytes > maximum) return -1; } return bytes; }
  var slot = $.global.aeAgentAMETitleSendV1;
  function reply(code) { return { schema: "ae-agent-ame-title-send.v1", code: code, requestNonce: slot ? slot.requestNonce : a.requestNonce, callback: slot ? slot.callback : null, responseBody: slot ? slot.body : null }; }
  function pump(ms) { var deadline = new Date().getTime() + ms; while (slot && (!slot.callback || slot.callback === "timeout") && new Date().getTime() < deadline) { if (typeof BridgeTalk.pump !== "function" || typeof $.sleep !== "function") break; BridgeTalk.pump(); if (!slot.callback || slot.callback === "timeout") $.sleep(20); } }
  if (typeof BridgeTalk !== "function" || typeof BridgeTalk.isRunning !== "function") return reply("bridgetalk_unsupported");
  try { if (!BridgeTalk.isRunning(a.targetSpecifier)) return reply("target_not_running"); } catch (_) { return reply("target_running_unknown"); }
  var observationOnly = a.observeOwnJob === true, retainedSourceRead = null;
  if (observationOnly) {
    // A separate read descriptor leaves the mutation message and its late
    // callbacks untouched. Only a fixed own-job status can use this lane.
    if (a.operation !== "status" || a.reconcileRequestNonce || !slot || slot.operation !== "enqueue" || slot.requestNonce !== a.observationEnqueueRequestNonce || slot.operationBinding !== a.observationEnqueueOperationBinding || slot.targetSpecifier !== a.targetSpecifier || slot.processBinding !== a.processBinding) return reply("own_observation_origin_changed");
    slot = $.global.aeAgentAMETitleObservationV1;
    var matching = slot && slot.requestNonce === a.requestNonce && slot.operation === "status" && slot.jobId === a.jobId && slot.batchId === a.batchId && slot.enqueueRequestNonce === a.observationEnqueueRequestNonce && slot.targetSpecifier === a.targetSpecifier && slot.processBinding === a.processBinding && slot.operationBinding === a.operationBinding;
    if (matching) { pump(a.timeoutMs); return reply(slot.callback || "unknown"); }
    if (a.observationReconcile === true) return reply("own_observation_unavailable");
    if (slot && (!slot.callback || slot.callback === "timeout")) return reply("previous_observation_unresolved");
  } else if (a.reconcileRequestNonce) {
    if (slot && slot.requestNonce !== a.reconcileRequestNonce && slot.retainedSourceRead && slot.retainedSourceRead.requestNonce === a.reconcileRequestNonce) slot = slot.retainedSourceRead;
    if (!slot || slot.requestNonce !== a.reconcileRequestNonce || slot.targetSpecifier !== a.targetSpecifier || slot.processBinding !== a.processBinding || slot.operationBinding !== a.operationBinding) return reply("reconciliation_mismatch");
    // An exact server-built sources reconciliation also classifies a legacy slot.
    // Keep that original message/callback; a late source reply has no queue effect.
    if (a.operation === "sources") slot.operation = "sources";
    pump(a.timeoutMs); return reply(slot.callback || "unknown");
  } else {
  retainedSourceRead = slot ? slot.retainedSourceRead || null : null;
  if (slot && (!slot.callback || slot.callback === "timeout")) {
    if (slot.operation !== "sources" || a.operation === "sources" || slot.targetSpecifier !== a.targetSpecifier || slot.processBinding !== a.processBinding || retainedSourceRead) return reply("previous_request_unresolved");
    retainedSourceRead = slot;
  }
  if (a.operation === "sources" && retainedSourceRead && (!retainedSourceRead.callback || retainedSourceRead.callback === "timeout")) return reply("previous_request_unresolved");
  }
  var message = new BridgeTalk(); slot = { requestNonce: a.requestNonce, targetSpecifier: a.targetSpecifier, processBinding: a.processBinding, operationBinding: a.operationBinding, operation: a.operation, retainedSourceRead: retainedSourceRead, callback: null, body: null, message: message };
  if (observationOnly) { slot.jobId = a.jobId; slot.batchId = a.batchId; slot.enqueueRequestNonce = a.observationEnqueueRequestNonce; $.global.aeAgentAMETitleObservationV1 = slot; } else $.global.aeAgentAMETitleSendV1 = slot;
  message.target = a.targetSpecifier; message.body = messageBody; message.timeout = Math.ceil(a.timeoutMs / 1000);
  message.onResult = function(r) { var body = String(r.body || ""); if (utf8Bytes(body, 524288) < 0) { slot.body = null; slot.callback = "response_envelope_refused"; } else { slot.body = body; slot.callback = "result"; } };
  message.onError = function(r) { slot.body = String(r.body || "").substring(0, 2000); slot.callback = "error"; }; message.onTimeout = function() { slot.callback = "timeout"; };
  try { message.send(Math.ceil(a.timeoutMs / 1000)); } catch (_) { return reply("send_unknown"); }
  if (!slot.callback) pump(250); return reply(slot.callback || "unknown");
}
function messageScript(a) { return "(" + nativeTitleJob.toString() + ")(" + literal(a) + ");"; }
function commandScript(a) { return "return (" + nativeSend.toString() + ")(" + literal(a) + "," + literal(a.reconcileRequestNonce ? "" : messageScript(a)) + ");"; }

function stableFile(file, sha256) {
  const before = fs.lstatSync(file), canonical = fs.realpathSync(file);
  if (!before.isFile() || before.isSymbolicLink() || !samePath(canonical, path.resolve(file)) || before.size < 1 || before.size > 1024 * 1024 * 1024) fail("ame_title_file_identity_invalid");
  const digest = crypto.createHash("sha256"), fd = fs.openSync(file, "r"), chunk = Buffer.alloc(512 * 1024); let count;
  try { while ((count = fs.readSync(fd, chunk, 0, chunk.length, null))) digest.update(chunk.subarray(0, count)); } finally { fs.closeSync(fd); }
  const after = fs.lstatSync(file), currentHash = digest.digest("hex");
  if (!after.isFile() || after.isSymbolicLink() || !samePath(fs.realpathSync(file), canonical) || before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ino !== after.ino || currentHash !== sha256) fail("ame_title_file_changed");
  return { path: canonical, sha256: currentHash, size: after.size, mtimeMs: after.mtimeMs, device: after.dev, inode: after.ino };
}
function write(file, value, exclusive = false) {
  fs.mkdirSync(path.dirname(file), { recursive: true }); const tmp = exclusive ? file : file + "." + crypto.randomUUID() + ".tmp", fd = fs.openSync(tmp, "wx");
  try { fs.writeFileSync(fd, JSON.stringify(value) + "\n", "utf8"); fs.fsyncSync(fd); } finally { fs.closeSync(fd); } if (!exclusive) fs.renameSync(tmp, file);
}
function createExecutor(deps) {
  if (!deps || !path.isAbsolute(deps.stateDir || "") || ["runExtendScriptBody", "inspectProcesses", "resolveOutputFilePath", "assertManualIngress", "assertServerContext"].some(k => typeof deps[k] !== "function")) fail("ame_title_invalid_dependencies");
  const caps = new WeakMap(), nativePreparations = new WeakMap(), catalog = deps.listPresetCatalog || presets.listAmePresets, now = deps.now || Date.now; let busy = false;
  const recordFile = id => path.join(deps.stateDir, "batches", id + ".json"), guardDir = path.join(deps.stateDir, "outputs");
  function result(code, extra = {}) { return { schema: SCHEMA, ok: false, code, nativeJobId: null, nativeAssociationVerified: false, nativeQueueCompositionVerified: false, completionVerified: false, mediaVerified: false, automaticRetryAllowed: false, observedAt: new Date(now()).toISOString(), ...extra }; }
  function assertIngress(context, name, a) {
    const binding = { name, argsHash: hash(a) };
    if (a.queueMode === sharedQueue.MODE) {
      if (typeof deps.assertSharedQueueIngress !== "function") fail("ame_shared_queue_private_capability_required");
      const asserted = deps.assertSharedQueueIngress(context, binding);
      if (asserted === false || asserted && typeof asserted.then === "function") { if (asserted && typeof asserted.catch === "function") asserted.catch(() => {}); fail("ame_shared_queue_synchronous_assertion_required"); }
    } else deps.assertManualIngress(context, binding);
    deps.assertServerContext(context, binding);
  }
  function assertCap(cap, name, a) {
    const entry = caps.get(cap); if (!entry || !entry.active || entry.name !== name || entry.argsHash !== hash(a)) fail("ame_title_manual_capability_required");
    assertIngress(entry.context, name, a); return entry;
  }
  function authorize(name, raw, context) {
    if (![ENQUEUE, START].includes(name)) fail("ame_title_mutation_capability_only"); const a = validateInput(name, raw), cap = Object.freeze(Object.create(null));
    const entry = { name, argsHash: hash(a), context, active: true }; assertIngress(context, name, a); caps.set(cap, entry); return cap;
  }
  async function processPin(a, original) {
    const rows = await deps.inspectProcesses(); if (!Array.isArray(rows) || rows.length !== 1 || !sameProcess(rows[0], rows[0]) || rows[0].pid !== a.expectedProcess.pid || new Date(rows[0].startedAt).toISOString() !== a.expectedProcess.startedAt || original && !sameProcess(rows[0], original)) fail("ame_title_process_changed_or_ambiguous"); return rows[0];
  }
  function binding(a, processInfo) { return hash({ target: a.targetSpecifier, session: a.expectedSessionNonce || null, pid: processInfo.pid, startedAt: processInfo.startedAt, path: String(processInfo.path).replace(/\\/g, "/").toLowerCase() }); }
  function load(id) {
    const file = recordFile(id); if (!fs.existsSync(file)) return null; let batch;
    try { batch = JSON.parse(fs.readFileSync(file, "utf8")); } catch (_) { fail("ame_title_ledger_corrupt"); }
    if (!batch || batch.schema !== LEDGER_SCHEMA || batch.batchId !== id || !SHA.test(batch.processBinding || "") || !SHA.test(batch.presetIdentity || "") || !Array.isArray(batch.jobs) || batch.jobs.length > 64 || batch.jobs.some(j => !j || !UUID.test(j.jobId || "") || !UUID.test(j.requestNonce || "") || !SHA.test(j.operationBinding || "") || j.nativeJobId !== null || !j.args || j.args.batchId !== id || j.presetIdentity !== batch.presetIdentity || j.processBinding !== batch.processBinding)) fail("ame_title_ledger_corrupt");
    for (const job of batch.jobs) validateInput(ENQUEUE, job.args); if (batch.start && (!UUID.test(batch.start.requestNonce || "") || !SHA.test(batch.start.operationBinding || "") || typeof batch.start.transportResolved !== "boolean")) fail("ame_title_ledger_corrupt"); return batch;
  }
  function outputFile(name) {
    const file = deps.resolveOutputFilePath(name); if (typeof file !== "string" || !path.isAbsolute(file) || path.basename(file) !== name) fail("ame_title_output_scope_invalid");
    const parent = path.dirname(file); fs.mkdirSync(parent, { recursive: true });
    if (!samePath(fs.realpathSync(parent), parent) || fs.lstatSync(parent).isSymbolicLink()) fail("ame_title_output_parent_alias");
    try { fs.lstatSync(file); fail("ame_title_output_exists"); } catch (e) { if (e.code !== "ENOENT") throw e; } return file;
  }
  function batches() {
    const dir = path.join(deps.stateDir, "batches"); if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir).filter(file => /^[a-f0-9-]{36}\.json$/.test(file)).map(file => load(file.slice(0, -5)));
  }
  function readyOutput(job) { try { fs.lstatSync(job.outputPath); fail("ame_title_output_exists_before_start"); } catch (error) { if (error.code !== "ENOENT") throw error; } }
  function pinned(job) {
    const source = stableFile(job.sourcePath, job.args.expectedSourceSha25664), preset = stableFile(job.presetPath, job.args.presetSha25664);
    if (hash(source) !== hash(job.sourcePin) || hash(preset) !== hash(job.presetPin)) fail("ame_title_file_changed");
  }
  const settlementFile=id=>path.join(deps.stateDir,"not-sent",id+".json");
  function jobBinding(job){return {jobId:job.jobId,requestNonce:job.requestNonce,operationBinding:job.operationBinding,args:validateInput(ENQUEUE,job.args),sourcePin:job.sourcePin,presetPin:job.presetPin,process:job.process,processBinding:job.processBinding,presetIdentity:job.presetIdentity,outputPath:job.outputPath,submittedAt:job.submittedAt};}
  function outputGuard(job){
    const intent={schema:reservation.SCHEMA||"ae-agent-ame-submit-intent.v1",sourcePath:job.sourcePath,sourceIdentity:hash({guid:job.args.sourceGuid,sha256:job.sourcePin.sha256}),preset:job.presetIdentity,outputPath:job.outputPath,range:job.args.range},checked=reservation.inspectSubmissionIntent(intent,guardDir);
    if(checked.ok!==true||checked.reason!=="duplicate_submit_blocked"||checked.attemptId!==job.jobId||checked.reservedAt!==job.submittedAt)fail("ame_not_sent_output_guard_changed");
    const file=path.join(guardDir,crypto.createHash("sha256").update(path.normalize(job.outputPath).toLowerCase()).digest("hex")+".json"),bytes=fs.readFileSync(file),sha256=crypto.createHash("sha256").update(bytes).digest("hex");
    return stableFile(file,sha256);
  }
  function readSettlement(job){
    const ref=job.notSentSettlement;if(!ref||!UUID.test(ref.originalRunId||""))return null;
    const file=settlementFile(ref.originalRunId),bytes=fs.readFileSync(file),e=JSON.parse(bytes),v=e.value;
    if(e.schema!=="ae-agent-ame-not-sent-envelope.v1"||e.sha256!==hash(v)||ref.evidenceSha256!==e.sha256||v.schema!=="ae-agent-ame-not-sent.v1"||v.consumedByRunId!==null||v.originalRunId!==ref.originalRunId||v.originalRecordSha256!==ref.recordSha256||hash(v.job)!==hash(jobBinding(job))||hash(v.outputGuard)!==hash(outputGuard(job)))fail("ame_not_sent_settlement_changed_or_consumed");
    const record=deps.readRunRecord(v.originalRunId);if(require("./plan-run-records").digest(JSON.stringify(record))!==v.originalRecordSha256||deps.assertNoSendRuntime(record)!==true)fail("ame_not_sent_original_record_changed");
    return v;
  }
  function settleNotSent(a,batch,job){
    if(typeof deps.readRunRecord!=="function"||typeof deps.assertNoSendRuntime!=="function"||typeof deps.hasQueuedStep!=="function")fail("ame_not_sent_server_reader_required");
    if(job.latestAuthorizedRunId&&job.latestAuthorizedRunId!==a.originalRunId)fail("ame_not_sent_stale_original_run");
    const r=deps.readRunRecord(a.originalRunId),s=r.run?.steps?.[0],planned=r.plan?.steps?.[0],validated=r.run?.validation?.steps?.[0],m=s?.mutationResult,observed=s?.result;
    if(r.runId!==a.originalRunId||r.run?.id!==a.originalRunId||r.run.dryRun!==false||r.run.ok!==false||r.run.confirm!==true||r.run.allowMutations!==true||r.run.m100Action?.confirmedBySurface!=="cep-autonomous-session"||!/^session-[a-f0-9]+$/.test(r.run.m100Action?.confirmedBySession||"")||r.run.m100Action.actionId!==r.run.provenance?.actionId||r.run.m100Action.payloadHash!==r.run.provenance?.payloadHash||r.run.safety?.autonomousSession?.capability!=="typed_mutating_plan"||r.run.safety.allowRawExtendscript!==false||r.run.safety.allowWithoutCheckpoint!==false||!Number.isFinite(Date.parse(r.run.finishedAt))||r.run.steps?.length!==1||r.plan?.steps?.length!==1||r.run.validation?.ok!==true||r.run.validation.steps.length!==1||planned?.tool!==ENQUEUE||validated?.tool!==ENQUEUE||s?.tool!==ENQUEUE||s.index!==1||s.status!=="failed"||
      job.args.queueMode!==sharedQueue.MODE||batch.jobs.length<1||batch.jobs.length>2||batch.jobs.some(other=>other!==job&&(!other.transportResolved||!other.nativeAssociationVerified||!other.acceptanceReceipt))||batch.start!==null||startReservation(batch)||job.transportResolved||job.nativeAssociationVerified||job.acceptanceReceipt||job.nativeObservation||
      Object.hasOwn(s,"commands")&&(!Array.isArray(s.commands)||s.commands.length!==0)||deps.assertNoSendRuntime(r)!==true||deps.hasQueuedStep(r.runId)===true)fail("ame_not_sent_proof_denied");
    const args=validateInput(ENQUEUE,job.args);
    for(const row of [planned.args,validated.args,validated.safeArgs,s.args])if(hash(validateInput(ENQUEUE,row))!==hash(args))fail("ame_not_sent_args_changed");
    for(const value of [m,observed])if(!value||value.schema!==SCHEMA||value.ok!==false||value.batchId!==batch.batchId||value.jobId!==job.jobId||value.requestNonce!==job.requestNonce||value.native!==null||value.unknownOutcome!==true)fail("ame_not_sent_result_changed");
    if(r.run.provenance?.planSha256!==require("./review-evidence").sha256(r.plan)||job.operationBinding!==hash({operation:"enqueue",jobId:job.jobId,args})||job.processBinding!==binding(args,job.process)||batch.processBinding!==job.processBinding||batch.presetIdentity!==job.presetIdentity||job.presetIdentity!==hash({path:job.presetPin.path,sha256:job.presetPin.sha256})||job.sourcePath!==args.sourceProjectFile||job.outputPath!==deps.resolveOutputFilePath(args.outputFileName))fail("ame_not_sent_binding_changed");
    for(const owned of batch.jobs)pinned(owned);readyOutput(job);const guard=outputGuard(job),recordSha256=require("./plan-run-records").digest(JSON.stringify(r));
    const file=settlementFile(r.runId);let value;
    if(fs.existsSync(file)){
      const e=JSON.parse(fs.readFileSync(file,"utf8"));if(e.schema!=="ae-agent-ame-not-sent-envelope.v1"||e.sha256!==hash(e.value)||e.value.originalRecordSha256!==recordSha256||e.value.consumedByRunId!==null||hash(e.value.job)!==hash(jobBinding(job))||hash(e.value.outputGuard)!==hash(guard))fail("ame_not_sent_settlement_changed_or_consumed");value=e.value;
    }else{value={schema:"ae-agent-ame-not-sent.v1",originalRunId:r.runId,originalRecordSha256:recordSha256,job:jobBinding(job),outputGuard:guard,reason:"required_command_capture_absent",consumedByRunId:null,settledAt:new Date(now()).toISOString(),replayAllowed:false};write(file,{schema:"ae-agent-ame-not-sent-envelope.v1",sha256:hash(value),value},true);}
    job.notSentSettlement={originalRunId:r.runId,recordSha256,evidenceSha256:hash(value)};write(recordFile(batch.batchId),batch);
    return result("enqueue_not_sent_settled",{ok:true,batchId:batch.batchId,jobId:job.jobId,requestNonce:job.requestNonce,originalRunId:r.runId,originalRecordSha256:recordSha256,settlementSha256:hash(value),delivery:"not_sent",newProposalRequired:true,replayAllowed:false});
  }
  function consumeSettlement(job,value,context){
    if(!UUID.test(context?.runId||"")||context.runId===value.originalRunId||job.latestAuthorizedRunId&&job.latestAuthorizedRunId!==value.originalRunId)fail("ame_not_sent_new_current_run_required");
    const current=readSettlement(job);if(!current||hash(current)!==hash(value))fail("ame_not_sent_settlement_changed_or_consumed");
    value={...value,consumedByRunId:context.runId,consumedAt:new Date(now()).toISOString()};write(settlementFile(value.originalRunId),{schema:"ae-agent-ame-not-sent-envelope.v1",sha256:hash(value),value});job.latestAuthorizedRunId=context.runId;job.notSentSettlement=null;
  }
  async function prepareNativeReservation(operation, entry, selector) {
    const port = deps.nativeDispatchPort;
    if (!port) return; // Existing non-L4 consumers retain their old boundary.
    const method = operation === "enqueue" ? "prepareEnqueue" : operation === "start" ? "prepareStart" : null;
    if (!method || typeof port[method] !== "function" || typeof port.assertPreparation !== "function") fail("ame_title_native_preparation_port_required");
    let original = nativePreparations.get(entry.context);
    if (original && original.has(operation)) fail("ame_title_native_preparation_once");
    const frozen = Object.freeze({ schema: "ae-agent-ame-title-reservation-selector.v1", operation, argsHash: entry.argsHash, ...selector });
    const preparation = await port[method](frozen, entry.context);
    if (!preparation || typeof preparation !== "object") fail("ame_title_native_preparation_capability_required");
    return { preparation, frozen, port, operation };
  }
  function assertNativeReservation(prepared, a, cap, entry, lastGuard) {
    // No asynchronous work may intervene between these guards and the first
    // directory/reservation/audit write. The native cap is retained privately.
    assertCap(cap, entry.name, a);
    const guarded = lastGuard();
    if (guarded === false || guarded && typeof guarded.then === "function") { if (guarded && typeof guarded.catch === "function") guarded.catch(() => {}); fail("ame_title_native_preparation_last_guard_required"); }
    if (!prepared) return;
    const { preparation, frozen, port, operation } = prepared;
    if (port !== deps.nativeDispatchPort) fail("ame_title_native_preparation_port_changed");
    const asserted = port.assertPreparation(preparation, frozen, entry.context);
    if (asserted === false || asserted && typeof asserted.then === "function") { if (asserted && typeof asserted.catch === "function") asserted.catch(() => {}); fail("ame_title_native_preparation_assertion_required"); }
    let original = nativePreparations.get(entry.context);
    if (original && original.has(operation)) fail("ame_title_native_preparation_once");
    if (!original) { original = new Map(); nativePreparations.set(entry.context, original); }
    original.set(operation, preparation);
  }
  async function send(a, context, finalGuard, refreshBeforeGuard) {
    let stage="build",dispatchInvoked=false;
    try {
      const script = commandScript(a), metadata = { schema: "ae-agent-ame-title-dispatch.v2", operation: a.operation, mutating: !a.reconcileRequestNonce && ["enqueue", "start"].includes(a.operation), requestNonce: a.reconcileRequestNonce || a.requestNonce, freshRequestNonce: a.requestNonce, processBinding: a.processBinding,
        operationBinding: a.operationBinding, scriptSha25664: crypto.createHash("sha256").update(script).digest("hex"), targetSpecifier: a.targetSpecifier, expectedProcess: a.expectedProcess, expectedSessionNonce: a.expectedSessionNonce || null,
        batchId: a.batchId || null, jobId: a.jobId || null, minimumObservedAt: a.minimumObservedAt, completionScope: a.completionScope || null };
      const port = deps.nativeDispatchPort;
      let raw;
      if (port) {
        if (["authorize", "assertAuthorization", "dispatch"].some(key => typeof port[key] !== "function")) fail("ame_title_native_dispatch_port_invalid");
        stage="authorize";const capability = await port.authorize(metadata, context, context && nativePreparations.get(context)?.get(a.operation));
        if (!capability || typeof capability !== "object") fail("ame_title_native_dispatch_capability_required");
        stage="refresh";if (refreshBeforeGuard) await refreshBeforeGuard();
        // Finish all asynchronous work before checking file/context pins. There
        // is no await between this synchronous guard and native assertion/send.
        stage="final_guard";if (finalGuard) {
          const guarded = finalGuard();
          if (guarded === false) fail("ame_title_native_dispatch_final_guard_denied");
          if (guarded && typeof guarded.then === "function") {
            if (typeof guarded.catch === "function") guarded.catch(() => {});
            fail("ame_title_native_dispatch_synchronous_guard_required");
          }
        }
        stage="assert_authorization";const checked = port.assertAuthorization(capability, metadata, context);
        if (checked === false || checked && typeof checked.then === "function") {
          if (checked && typeof checked.catch === "function") checked.catch(() => {});
          fail("ame_title_native_dispatch_assertion_required");
        }
        stage="dispatch";dispatchInvoked=true;raw = await port.dispatch(capability, script, 30000, metadata, context);
      } else {
        if (a.manualQueueMode === "cep_user_declaration_v2" || a.queueMode === sharedQueue.MODE) fail("ame_title_native_dispatch_port_unavailable");
        stage="dispatch";dispatchInvoked=true;raw = await deps.runExtendScriptBody(script, 30000, metadata);
      }
      const reply = raw && Object.prototype.hasOwnProperty.call(raw, "result") ? raw.result : raw;
      if (!reply || reply.schema !== "ae-agent-ame-title-send.v1" || reply.requestNonce !== (a.reconcileRequestNonce || a.requestNonce)) return { resolved: false, code: "transport_correlation_unknown", native: null };
      if (reply.callback === "error") return { resolved: true, code: "native_delivery_error", native: null };
      if (reply.code !== "result" || typeof reply.responseBody !== "string" || Buffer.byteLength(reply.responseBody, "utf8") > 524288) return { resolved: false, code: reply.code || "transport_unknown", native: null };
      let native; try { native = JSON.parse(reply.responseBody); } catch (_) { return { resolved: true, code: "native_response_invalid", native: null }; }
      if (!native || native.schema !== NATIVE_SCHEMA || native.requestNonce !== (a.reconcileRequestNonce || a.requestNonce) || native.operationBinding !== a.operationBinding || native.appSpecifier !== a.targetSpecifier || a.expectedSessionNonce && native.sessionNonce !== a.expectedSessionNonce || !Number.isFinite(native.observedAt) || native.observedAt <= 0 || native.observedAt < a.minimumObservedAt || native.observedAt > now() + 60000) return { resolved: false, code: "native_correlation_unknown", native: null };
      return { resolved: true, code: native.code, native };
    } catch (error) { const diagnostic={stage,dispatchInvoked,originalCode:error.code||null,error:String(error.message||error).slice(0,2000)};return { resolved:false,code:dispatchInvoked?"ae_delivery_unknown":"ame_title_not_sent",error:diagnostic.error,dispatchDiagnostic:diagnostic,native:null }; }
  }
  function associated(job, native) {
    const n = native && native.job; return !!(n && n.nativeJobId === null && n.handleKey === job.jobId && n.enqueueRequestNonce === job.requestNonce && UUID.test(n.retainedWrapperSessionNonce || "") && (!job.retainedWrapperSessionNonce || n.retainedWrapperSessionNonce === job.retainedWrapperSessionNonce) && n.nativeAssociationVerified === true && n.sourceGuid === job.args.sourceGuid && samePath(n.sourcePath, job.sourcePath) && samePath(n.outputPath, job.outputPath) && n.presetIdentity === job.presetIdentity && n.processBinding === job.processBinding && hash(n.range) === hash(job.args.range) && Array.isArray(n.outputFiles) && n.outputFiles.length === 1 && samePath(n.outputFiles[0], job.outputPath) &&
      (job.args.queueMode !== sharedQueue.MODE || n.workAreaApplied === true && Array.isArray(n.readErrors) && n.readErrors.length === 0 && (!Object.hasOwn(job, "nativeSessionNonce") || native.sessionNonce === job.nativeSessionNonce)) &&
      (!n.nativeCompletionObserved || Number.isFinite(n.eventObservedAt) && n.eventObservedAt >= Date.parse(job.submittedAt) && n.eventObservedAt <= native.observedAt));
  }
  function updateJob(job, observation) {
    job.transportResolved = observation.resolved; if (observation.native) job.nativeObservation = observation.native;
    job.nativeAssociationVerified = associated(job, observation.native); job.readyForStart = job.nativeAssociationVerified && observation.native.job.status === "queued" && (observation.code === "job_enqueued" || observation.code === "job_observed" && job.readyForStart);
    job.state = job.nativeAssociationVerified ? observation.native.job.status : "unknown_outcome";
    if (job.nativeAssociationVerified) { job.retainedWrapperSessionNonce = observation.native.job.retainedWrapperSessionNonce; job.nativeSessionNonce = observation.native.sessionNonce; }
  }
  function acceptOwnRead(job, observation) {
    if (job.args.queueMode === sharedQueue.MODE && job.nativeAssociationVerified && observation.code === "job_observed" && observation.native.requestNonce !== job.requestNonce && observation.native.job.status === "queued" && observation.native.batchRunning === false) {
      job.readyForStart = true;
      job.acceptanceReceipt = { schema: "ae-agent-ame-own-item-acceptance.v1", jobId: job.jobId, enqueueRequestNonce: job.requestNonce, readRequestNonce: observation.native.requestNonce, observedAt: observation.native.observedAt, retainedWrapperSessionNonce: job.retainedWrapperSessionNonce, outputPath: job.outputPath, workAreaApplied: true, proofSource: "retained_encoder_wrapper", appliedPresetVerified: false, mediaVerified: false };
    }
  }
  const startReservation = batch => (batch.jobs[0]?.args.queueMode === sharedQueue.MODE ? deps.sharedQueueGrant : deps.manualQueueGrant)?.readReservation(batch.batchId) || null;
  function originalStartAccepted(batch, job, native, processInfo) {
    try {
      const shared = job.args.queueMode === sharedQueue.MODE, reserved = startReservation(batch), manifest = shared ? reserved?.sharedQueueReceipt?.binding : reserved?.manualQueueReceipt?.manifest;
      const wanted = manifest?.jobs.find(entry => entry.jobId === job.jobId), start = batch.start;
      return Boolean(start && reserved && wanted && associated(job, native) && native.schema === NATIVE_SCHEMA && native.code === "job_observed" &&
        native.operationBinding === hash({ operation: "status", jobId: job.jobId }) && UUID.test(native.requestNonce || "") && native.requestNonce !== start.requestNonce && native.requestNonce !== job.requestNonce &&
        native.start?.requestNonce === start.requestNonce && native.start.invoked === true && native.start.accepted === true &&
        reserved.requestNonce === start.requestNonce && reserved.operationBinding === start.operationBinding && reserved.reservedAt === start.reservedAt &&
        start.operationBinding === hash({ operation: "start", batchId: batch.batchId, jobs: manifest.jobs.map(entry => entry.jobId), ...(shared ? { bindingHash: sharedQueue.bindingHash(manifest) } : { manifestHash: manualQueue.manifestHash(manifest) }) }) &&
        Number.isFinite(native.observedAt) && native.observedAt >= Date.parse(reserved.reservedAt) && native.observedAt <= now() + 60000 &&
        native.appSpecifier === manifest.targetSpecifier && native.sessionNonce === manifest.nativeSessionNonce && native.job.retainedWrapperSessionNonce === manifest.retainedWrapperSessionNonce &&
        sameProcess(processInfo, manifest.process) && sameProcess(job.process, manifest.process) && manifest.processBinding === batch.processBinding && manifest.presetIdentity === batch.presetIdentity &&
        wanted.handleKey === job.jobId && wanted.enqueueRequestNonce === job.requestNonce && wanted.operationBinding === job.operationBinding &&
        wanted.source.path === job.sourcePath && wanted.source.sha25664 === job.sourcePin.sha256 && wanted.source.guid === job.args.sourceGuid &&
        wanted.preset.path === job.presetPath && wanted.preset.sha25664 === job.presetPin.sha256 && wanted.preset.id === job.args.presetId &&
        wanted.outputPath === job.outputPath && hash(wanted.range) === hash(job.args.range));
    } catch (_) { return false; }
  }
  function previousJobsReady(batchId, processInfo) {
    return batches().filter(prior => prior.batchId !== batchId).every(prior => prior.jobs.every(job =>
      job.completionVerified === true && originalStartAccepted(prior, job, job.nativeObservation, processInfo)));
  }
  async function inspectSources(a) {
    const processInfo = await processPin(a), source = stableFile(a.sourceProjectFile, a.expectedSourceSha25664), processBinding = binding(a, processInfo);
    const requestNonce = a.reconcileRequestNonce || crypto.randomUUID(), operationBinding = hash({ operation: "sources", sourcePath: source.path, sha256: source.sha256 });
    const observed = await send({ ...a, operation: "sources", sourcePath: source.path, processBinding, operationBinding, requestNonce, minimumObservedAt: a.reconcileRequestNonce ? 0 : now() });
    await processPin(a, processInfo); if (hash(stableFile(source.path, source.sha256)) !== hash(source)) fail("ame_title_file_changed");
    return result(observed.code, { ok: observed.code === "sources_observed", sourceGuids: observed.native && observed.native.sourceGuids || [], process: processInfo, source, requestNonce, reconciled: !!a.reconcileRequestNonce });
  }
  async function enqueue(a, cap) {
    const entry = assertCap(cap, ENQUEUE, a), processInfo = await processPin(a), processBinding = binding(a, processInfo), source = stableFile(a.sourceProjectFile, a.expectedSourceSha25664);
    const preset = presets.selectPreset(await catalog(), { presetId: a.presetId, sha256: a.presetSha25664 }), presetPin = stableFile(preset.canonicalPath, a.presetSha25664), presetIdentity = hash({ path: presetPin.path, sha256: presetPin.sha256 });
    let batch = load(a.batchId);const reuse=batch?.jobs.find(job=>job.notSentSettlement&&hash(validateInput(ENQUEUE,job.args))===hash(a)),limit=a.queueMode===sharedQueue.MODE?2:64;
    if (batch && (batch.presetIdentity !== presetIdentity || batch.processBinding !== processBinding || batch.start || batch.jobs.length>limit || batch.jobs.length===limit&&!reuse || batch.jobs.some(job => job.args.queueMode !== a.queueMode))) return result("batch_identity_or_preset_changed");
    const settlement=reuse?readSettlement(reuse):null;if(reuse&&!settlement)fail("ame_not_sent_settlement_required");
    if (batch && batch.jobs.some(job => job!==reuse&&(!job.transportResolved || !job.nativeAssociationVerified || job.state === "unknown_outcome"))) return result("ame_title_unknown_job_no_replay");
    if (a.queueMode !== sharedQueue.MODE && !previousJobsReady(a.batchId, processInfo)) return result("ame_title_previous_job_not_completed_no_replay");
    // Resolve the selector without outputFile's mkdir. Native admission must
    // precede even creation of the owned output directory.
    const selectedOutput = deps.resolveOutputFilePath(a.outputFileName);
    assertCap(cap, ENQUEUE, a); await processPin(a, processInfo); if (hash(stableFile(source.path, source.sha256)) !== hash(source) || hash(stableFile(presetPin.path, presetPin.sha256)) !== hash(presetPin)) fail("ame_title_file_changed");
    const prepared = await prepareNativeReservation("enqueue", entry, { processBinding, sourcePath: source.path, sourceSha25664: source.sha256, sourceGuid: a.sourceGuid,
      presetPath: presetPin.path, presetSha25664: presetPin.sha256, outputPath: selectedOutput, range: Object.freeze({ ...a.range }) });
    // Private product port accepts only a snapshot actually saved/read back by
    // the current export executor. Tool JSON cannot set this native-only field.
    const savedNativeSourceVerified=!!(prepared && typeof prepared.port.usesSavedSource==="function" && prepared.port.usesSavedSource(prepared.preparation,entry.context));
    assertNativeReservation(prepared, a, cap, entry, () => {
      if (hash(stableFile(source.path, source.sha256)) !== hash(source) || hash(stableFile(presetPin.path, presetPin.sha256)) !== hash(presetPin)) fail("ame_title_file_changed");
    });
    const outputPath = outputFile(a.outputFileName);
    if (!samePath(outputPath, selectedOutput)) fail("ame_title_native_preparation_output_changed");
    const intent = { schema: reservation.SCHEMA || "ae-agent-ame-submit-intent.v1", sourcePath: source.path, sourceIdentity: hash({ guid: a.sourceGuid, sha256: source.sha256 }), preset: presetIdentity, outputPath, range: a.range };
    const reserved = reuse?{ok:true,attemptId:reuse.jobId,reservedAt:reuse.submittedAt}:reservation.reserveSubmissionIntent(intent, guardDir, new Date(now())); if (reserved.blocked || !reserved.ok) return result(reserved.reason, { attemptId: reserved.attemptId || null });
    const job = reuse||{ jobId: reserved.attemptId, handleKey: reserved.attemptId, nativeJobId: null, requestNonce: crypto.randomUUID(), operationBinding: hash({ operation: "enqueue", jobId: reserved.attemptId, args: a }), args: a, sourcePath: source.path, sourcePin: source, presetPath: presetPin.path, presetPin, presetIdentity, processBinding, process: processInfo, outputPath, submittedAt: reserved.reservedAt, transportResolved: false, nativeAssociationVerified: false, readyForStart: false, state: "unknown_outcome",latestAuthorizedRunId:entry.context.runId };
    const initial = !batch; if (!batch) batch = { schema: LEDGER_SCHEMA, batchId: a.batchId, presetIdentity, processBinding, jobs: [], start: null };
    if(reuse){consumeSettlement(job,settlement,entry.context);job.lastDispatchDiagnostic=null;}else batch.jobs.push(job);write(recordFile(a.batchId), batch, initial);
    assertCap(cap, ENQUEUE, a); entry.active = false;
    const observed = await send({ ...a, operation: "enqueue", ...(savedNativeSourceVerified?{savedNativeSourceVerified:true}:{}), sourcePath: job.sourcePath, presetPath: job.presetPath, presetIdentity, processBinding, operationBinding: job.operationBinding, outputPath, jobId: job.jobId, newWrapperSessionNonce: crypto.randomUUID(), requestNonce: job.requestNonce, minimumObservedAt: Date.parse(job.submittedAt) }, entry.context, () => {
      pinned(job); readyOutput(job);
      assertIngress(entry.context, ENQUEUE, a);
    }, () => processPin(a, processInfo));
    if(observed.dispatchDiagnostic){job.lastDispatchDiagnostic={runId:entry.context.runId,...observed.dispatchDiagnostic};write(recordFile(a.batchId),batch);}
    try { assertIngress(entry.context, ENQUEUE, a); await processPin(a, processInfo); pinned(job); }
    catch (error) { return result(error.code || "post_submit_context_changed", { batchId: a.batchId, jobId: job.jobId, requestNonce: job.requestNonce, unknownOutcome: true, nativeMutationMayHaveOccurred: observed.dispatchDiagnostic?.dispatchInvoked!==false,native:observed.native||null,dispatchDiagnostic:observed.dispatchDiagnostic||null }); }
    updateJob(job, observed); write(recordFile(a.batchId), batch);
    if (a.queueMode === sharedQueue.MODE && job.nativeAssociationVerified && observed.code === "job_enqueued") {
      const fresh = await send({ ...a, operation: "status", jobId: job.jobId, processBinding, operationBinding: hash({ operation: "status", jobId: job.jobId }), requestNonce: crypto.randomUUID(), minimumObservedAt: now() }, entry.context);
      try { await processPin(a, processInfo); pinned(job); assertIngress(entry.context, ENQUEUE, a); } catch (error) { return result(error.code || "post_enqueue_readback_changed", { batchId: a.batchId, jobId: job.jobId, requestNonce: job.requestNonce, unknownOutcome: true, mutationMayHaveOccurred: true }); }
      updateJob(job, fresh);
      acceptOwnRead(job, fresh); if (!job.acceptanceReceipt) job.readyForStart = false;
      write(recordFile(a.batchId), batch);
      return result(fresh.code, { ok: !!job.acceptanceReceipt, batchId: a.batchId, jobId: job.jobId, handleKey: job.handleKey, requestNonce: job.requestNonce, nativeAssociationVerified: job.nativeAssociationVerified, ownItemAccepted: !!job.acceptanceReceipt, acceptanceReceipt: job.acceptanceReceipt || null, state: job.state, unknownOutcome: !job.acceptanceReceipt, outputPath, presetEncodingMode: "exact_epr_automatic_format", native: fresh.native });
    }
    return result(observed.code, { ok: job.nativeAssociationVerified && observed.code === "job_enqueued", batchId: a.batchId, jobId: job.jobId, handleKey: job.handleKey, nativeAssociationVerified: job.nativeAssociationVerified, requestNonce: job.requestNonce, state: job.state, unknownOutcome: !job.nativeAssociationVerified, outputPath, presetEncodingMode: "exact_epr_automatic_format", native: observed.native,dispatchDiagnostic:observed.dispatchDiagnostic||null });
  }
  function completionScope(batch, job) {
    return batch.start ? { schema: "ae-agent-ame-title-completion-selector.v1", batchId: batch.batchId, jobId: job.jobId, enqueueRequestNonce: job.requestNonce, startRequestNonce: batch.start.requestNonce, startOperationBinding: batch.start.operationBinding,
      retainedWrapperSessionNonce: job.retainedWrapperSessionNonce || null, sourcePath: job.sourcePath, sourceSha25664: job.sourcePin.sha256, sourceGuid: job.args.sourceGuid, presetPath: job.presetPath, presetSha25664: job.presetPin.sha256, outputPath: job.outputPath, range: job.args.range, submittedAt: job.submittedAt } : null;
  }
  async function observeQueue(a, processInfo, context) {
    if (!deps.nativeDispatchPort) fail("ame_title_native_dispatch_port_unavailable");
    const batch = load(a.batchId), minimumObservedAt = now();
    if (!batch || batch.start || batch.processBinding !== binding(a, processInfo) || batch.jobs.length !== 1) fail("ame_manual_queue_one_fresh_queued_job_required");
    const prefix = a.completedOwnedPrefix.map(ref => {
      const prior = load(ref.batchId), job = prior && prior.jobs.find(job => job.jobId === ref.jobId), receipt = deps.manualQueueGrant && deps.manualQueueGrant.readReservation(ref.batchId);
      if (!job || prior.processBinding !== batch.processBinding || prior.presetIdentity !== batch.presetIdentity || prior.start?.state !== "accepted" || !receipt || receipt.requestNonce !== prior.start.requestNonce || receipt.operationBinding !== prior.start.operationBinding || !receipt.manualQueueReceipt || !receipt.manualQueueReceipt.manifest.jobs.some(entry => entry.jobId === job.jobId)) fail("ame_manual_queue_completed_prefix_unverified");
      return { ...job, startReservationSha25664: hash(receipt), _batch: prior };
    });
    const allowed = new Set([...batch.jobs, ...prefix].map(job => job.jobId));
    for (const current of batches()) if (current.processBinding === batch.processBinding && current.jobs.some(job => !allowed.has(job.jobId))) fail("ame_manual_queue_owned_entry_not_declared");
    for (const job of [...batch.jobs, ...prefix]) {
      pinned(job); if (!job.transportResolved || !job.nativeAssociationVerified) fail("ame_manual_queue_unknown_job_no_replay");
      const owner = job._batch || batch;
      const observed = await send({ ...a, batchId: owner.batchId, operation: "status", jobId: job.jobId, processBinding: batch.processBinding, operationBinding: hash({ operation: "status", jobId: job.jobId }), requestNonce: crypto.randomUUID(), minimumObservedAt, completionScope: completionScope(owner, job) }, context);
      if (!observed.resolved || observed.code !== "job_observed" || !associated(job, observed.native)) fail("ame_manual_queue_fresh_owned_observation_required");
      if (job._batch && !originalStartAccepted(owner, job, observed.native, processInfo)) fail("ame_manual_queue_completed_prefix_unverified");
      updateJob(job, observed); if (!job._batch) readyOutput(job);
    }
    await processPin(a, processInfo); for (const job of [...batch.jobs, ...prefix]) pinned(job);
    return { batch, manifest: manualQueue.buildManifest(batch, processInfo, a, minimumObservedAt, prefix), pinnedJobs: [...batch.jobs, ...prefix] };
  }
  async function queueManifest(a) {
    const processInfo = await processPin(a), { manifest } = await observeQueue(a, processInfo);
    return result("manual_queue_manifest_observed", { ok: true, manifest, manifestHash: manualQueue.manifestHash(manifest), declaration: manualQueue.declarationForManifest(manifest), process: processInfo, proofSource: "owned_wrappers_only_pending_authenticated_cep_declaration" });
  }
  async function observeSharedBatch(a, batch, processInfo, context) {
    if (!deps.nativeDispatchPort || !deps.sharedQueueGrant) fail("ame_shared_queue_private_capability_required");
    if (batch.jobs.length !== 2 || batch.jobs.some(job => job.args.queueMode !== sharedQueue.MODE || !job.acceptanceReceipt || !job.transportResolved || !job.nativeAssociationVerified)) fail("ame_shared_queue_two_accepted_own_jobs_required");
    const minimumObservedAt = now(); let running = false;
    for (const job of batch.jobs) {
      pinned(job);
      const observed = await send({ ...a, operation: "status", jobId: job.jobId, processBinding: batch.processBinding, operationBinding: hash({ operation: "status", jobId: job.jobId }), requestNonce: crypto.randomUUID(), minimumObservedAt }, context);
      if (!observed.resolved || observed.code !== "job_observed" || !associated(job, observed.native)) fail("ame_shared_queue_fresh_own_read_required");
      updateJob(job, observed);
      if (observed.native.batchRunning === true && ["running", "native_finished"].includes(job.state)) running = true;
    }
    await processPin(a, processInfo); for (const job of batch.jobs) pinned(job); write(recordFile(a.batchId), batch);
    if (running && batch.jobs.every(job => job.nativeObservation.batchRunning === true && ["queued", "running", "native_finished"].includes(job.state))) return { alreadyRunning: true };
    for (const job of batch.jobs) readyOutput(job);
    return { binding: sharedQueue.buildBinding(batch, processInfo, a, minimumObservedAt) };
  }
  async function startShared(a, cap, entry, batch, processInfo) {
    const issuer = deps.sharedQueueGrant;
    if (!issuer || !deps.nativeDispatchPort) return result("ame_shared_queue_private_capability_required");
    const first = await observeSharedBatch(a, batch, processInfo, entry.context);
    if (first.alreadyRunning) return result("shared_queue_already_running", { ok: true, batchId: batch.batchId, ownItemsAccepted: 2, globalQueueStart: true, alreadyRunningObserved: true, dispatchAcceptanceVerified: false });
    const queueCap = issuer.authorize(entry.context, first.binding), last = await observeSharedBatch(a, batch, processInfo, entry.context);
    if (last.alreadyRunning) return result("shared_queue_already_running", { ok: true, batchId: batch.batchId, ownItemsAccepted: 2, globalQueueStart: true, alreadyRunningObserved: true, dispatchAcceptanceVerified: false });
    if (sharedQueue.bindingHash(first.binding) !== sharedQueue.bindingHash(last.binding)) fail("ame_shared_queue_binding_changed");
    const manifest = last.binding, bindingHash = sharedQueue.bindingHash(manifest);
    assertCap(cap, START, a); issuer.assertCapability(queueCap, entry.context, manifest);
    const startRecord = { batchId: a.batchId, requestNonce: crypto.randomUUID(), operationBinding: hash({ operation: "start", batchId: a.batchId, jobs: batch.jobs.map(job => job.jobId), bindingHash }), transportResolved: false, state: "unknown_outcome", reservedAt: new Date(now()).toISOString(), lastDispatchGuardVerified: true };
    const prepared = await prepareNativeReservation("start", entry, { processBinding: batch.processBinding, batchId: a.batchId, bindingHash, jobIds: Object.freeze(batch.jobs.map(job => job.jobId)), operationBinding: startRecord.operationBinding, requestNonce: startRecord.requestNonce });
    assertNativeReservation(prepared, a, cap, entry, () => { for (const job of batch.jobs) { pinned(job); readyOutput(job); } issuer.assertCapability(queueCap, entry.context, manifest); });
    const reserved = issuer.consume(queueCap, entry.context, manifest, startRecord);
    batch.start = { ...startRecord }; write(recordFile(a.batchId), batch); entry.active = false;
    const observed = await send({ ...a, operation: "start", jobIds: batch.jobs.map(job => job.jobId), expectedJobs: manifest.jobs, boundNativeSessionNonce: manifest.nativeSessionNonce, retainedWrapperSessionNonce: manifest.retainedWrapperSessionNonce, presetIdentity: batch.presetIdentity, processBinding: batch.processBinding, operationBinding: startRecord.operationBinding, requestNonce: startRecord.requestNonce, minimumObservedAt: Date.parse(startRecord.reservedAt) }, entry.context, () => {
      for (const job of batch.jobs) { pinned(job); readyOutput(job); }
      issuer.assertConsumedForDispatch(queueCap, entry.context, manifest, reserved); assertIngress(entry.context, START, a);
    }, () => processPin(a, processInfo));
    try { await processPin(a, processInfo); for (const job of batch.jobs) pinned(job); assertIngress(entry.context, START, a); }
    catch (error) { return result(error.code || "post_start_context_changed", { unknownOutcome: true, batchId: a.batchId, requestNonce: startRecord.requestNonce, startReservation: reserved }); }
    batch.start.transportResolved = observed.resolved; batch.start.state = observed.code === "batch_start_accepted" ? "accepted" : "unknown_outcome"; write(recordFile(a.batchId), batch);
    return result(observed.code, { ok: batch.start.state === "accepted", batchId: a.batchId, ownItemsAccepted: 2, requestNonce: startRecord.requestNonce, globalQueueStart: true, dispatchAcceptanceVerified: batch.start.state === "accepted", lastDispatchGuardVerified: true, unknownOutcome: batch.start.state !== "accepted", startReservation: reserved, process: processInfo, native: observed.native });
  }
  async function start(a, cap) {
    const entry = assertCap(cap, START, a), processInfo = await processPin(a), batch = load(a.batchId); if (!batch || batch.processBinding !== binding(a, processInfo) || !batch.jobs.length) return result("batch_not_bound");
    if (batch.start) return result("batch_start_already_reserved", { requestNonce: batch.start.requestNonce });
    const durable = startReservation(batch);
    if (durable) return result("batch_start_already_reserved", { requestNonce: durable.requestNonce, unknownOutcome: true });
    if (a.queueMode === sharedQueue.MODE) return startShared(a, cap, entry, batch, processInfo);
    if (batch.jobs.some(job => job.args.queueMode === sharedQueue.MODE)) return result("ame_shared_queue_mode_required");
    if (!previousJobsReady(a.batchId, processInfo)) return result("ame_title_previous_job_not_completed_no_replay");
    if (batch.jobs.some(j => !j.readyForStart || !j.nativeAssociationVerified)) return result("batch_jobs_unverified"); for (const job of batch.jobs) pinned(job);
    if (a.manualQueueMode === "cep_user_declaration_v2") {
      const issuer = deps.manualQueueGrant;
      if (!issuer || !deps.nativeDispatchPort) return result("ame_title_native_dispatch_port_unavailable");
      const first = await observeQueue(a, processInfo, entry.context), manifest = first.manifest;
      if (manualQueue.manifestHash(manifest) !== a.manualQueueManifestSha25664) return result("ame_manual_queue_binding_changed_or_expired");
      const queueCap = issuer.authorize(entry.context, manifest);
      // Re-read retained wrappers, immutable files, process and private context
      // after authorization, at the final dispatch boundary. No caller boolean.
      const last = await observeQueue(a, processInfo, entry.context);
      if (manualQueue.manifestHash(last.manifest) !== a.manualQueueManifestSha25664) return result("ame_manual_queue_last_guard_changed");
      assertCap(cap, START, a); issuer.assertCapability(queueCap, entry.context, last.manifest);
      const startRecord = { batchId: a.batchId, requestNonce: crypto.randomUUID(), operationBinding: hash({ operation: "start", batchId: a.batchId, jobs: last.batch.jobs.map(job => job.jobId), manifestHash: a.manualQueueManifestSha25664 }), transportResolved: false, state: "unknown_outcome", reservedAt: new Date(now()).toISOString(), lastDispatchGuardVerified: true };
      const prepared = await prepareNativeReservation("start", entry, { processBinding: batch.processBinding, batchId: a.batchId, manifestHash: a.manualQueueManifestSha25664,
        jobIds: Object.freeze(last.batch.jobs.map(job => job.jobId)), operationBinding: startRecord.operationBinding, requestNonce: startRecord.requestNonce });
      assertNativeReservation(prepared, a, cap, entry, () => {
        for (const job of last.pinnedJobs) pinned(job); for (const job of batch.jobs) readyOutput(job);
        issuer.assertCapability(queueCap, entry.context, last.manifest);
      });
      const reserved = issuer.consume(queueCap, entry.context, last.manifest, startRecord);
      batch.start = { ...startRecord }; write(recordFile(a.batchId), batch); entry.active = false;
      const observed = await send({ ...a, operation: "start", jobIds: manifest.jobs.map(job => job.jobId), expectedJobs: manifest.jobs, completedOwnedPrefix: manifest.completedOwnedPrefix, boundNativeSessionNonce: manifest.nativeSessionNonce, retainedWrapperSessionNonce: manifest.retainedWrapperSessionNonce, presetIdentity: batch.presetIdentity, processBinding: batch.processBinding, operationBinding: startRecord.operationBinding, requestNonce: startRecord.requestNonce, minimumObservedAt: Date.parse(startRecord.reservedAt) }, entry.context, () => {
        for (const job of last.pinnedJobs) pinned(job);
        for (const job of batch.jobs) readyOutput(job);
        issuer.assertConsumedForDispatch(queueCap, entry.context, manifest, reserved);
        deps.assertManualIngress(entry.context, { name: START, argsHash: entry.argsHash }); deps.assertServerContext(entry.context, { name: START, argsHash: entry.argsHash });
      }, () => processPin(a, processInfo));
      try { await processPin(a, processInfo); for (const job of batch.jobs) pinned(job); deps.assertManualIngress(entry.context, { name: START, argsHash: entry.argsHash }); deps.assertServerContext(entry.context, { name: START, argsHash: entry.argsHash }); }
      catch (error) { return result(error.code || "post_start_context_changed", { unknownOutcome: true, batchId: a.batchId, requestNonce: startRecord.requestNonce, startReservation: reserved }); }
      batch.start.transportResolved = observed.resolved; batch.start.state = observed.code === "batch_start_accepted" ? "accepted" : "unknown_outcome"; write(recordFile(a.batchId), batch);
      return result(observed.code, { ok: batch.start.state === "accepted", batchId: a.batchId, requestNonce: startRecord.requestNonce, dispatchAcceptanceVerified: batch.start.state === "accepted", lastDispatchGuardVerified: true, unknownOutcome: batch.start.state !== "accepted", startReservation: reserved, process: processInfo, native: observed.native });
    }
    // Our wrappers/ledger, isBatchRunning, status and files cannot establish the
    // entire native queue composition. No default implementation grants this.
    if (typeof deps.assertQueueOwnership !== "function" || await deps.assertQueueOwnership(entry.context, JSON.parse(JSON.stringify(batch))) !== true) return result("queue_composition_unavailable");
    assertCap(cap, START, a); await processPin(a, processInfo); for (const job of batch.jobs) pinned(job);
    const prepared = await prepareNativeReservation("start", entry, { processBinding: batch.processBinding, batchId: a.batchId,
      jobIds: Object.freeze(batch.jobs.map(job => job.jobId)) });
    assertNativeReservation(prepared, a, cap, entry, () => { for (const job of batch.jobs) pinned(job); });
    batch.start = { requestNonce: crypto.randomUUID(), operationBinding: hash({ operation: "start", batchId: a.batchId, jobs: batch.jobs.map(j => j.jobId) }), transportResolved: false, state: "unknown_outcome", reservedAt: new Date(now()).toISOString() }; write(recordFile(a.batchId), batch); assertCap(cap, START, a); entry.active = false;
    const observed = await send({ ...a, operation: "start", jobIds: batch.jobs.map(j => j.jobId), presetIdentity: batch.presetIdentity, processBinding: batch.processBinding, operationBinding: batch.start.operationBinding, requestNonce: batch.start.requestNonce, minimumObservedAt: Date.parse(batch.start.reservedAt) });
    try { await processPin(a, processInfo); for (const job of batch.jobs) pinned(job); deps.assertServerContext(entry.context, { name: START, argsHash: entry.argsHash }); }
    catch (error) { return result(error.code || "post_start_context_changed", { unknownOutcome: true, batchId: a.batchId, requestNonce: batch.start.requestNonce }); }
    batch.start.transportResolved = observed.resolved; batch.start.state = observed.code === "batch_start_accepted" ? "accepted" : "unknown_outcome"; write(recordFile(a.batchId), batch);
    return result(observed.code, { ok: observed.code === "batch_start_accepted", batchId: a.batchId, requestNonce: batch.start.requestNonce, queueOwnershipAssertedByInjectedGate: true, unknownOutcome: batch.start.state !== "accepted", native: observed.native });
  }
  async function status(a) {
    const processInfo = await processPin(a), batch = load(a.batchId), job = batch && batch.jobs.find(j => j.jobId === a.jobId);
    if (!job || batch.processBinding !== binding(a, processInfo)) return result("job_not_bound"); pinned(job);
    if(a.originalRunId)return settleNotSent(a,batch,job);
    const pendingStart = batch.start && !batch.start.transportResolved, nonce = pendingStart ? batch.start.requestNonce : !job.transportResolved ? job.requestNonce : null;
    const ownObservation=!pendingStart&&!job.transportResolved;
    const operationBinding = pendingStart ? batch.start.operationBinding : ownObservation ? hash({ operation: "status", jobId: job.jobId }) : nonce ? job.operationBinding : hash({ operation: "status", jobId: job.jobId });
    let observationReconcile=false;
    if(ownObservation){
      observationReconcile=!!job.ownStatusObservation;
      if(!job.ownStatusObservation){job.ownStatusObservation={requestNonce:crypto.randomUUID(),operationBinding,enqueueRequestNonce:job.requestNonce,reservedAt:new Date(now()).toISOString()};write(recordFile(a.batchId),batch);}
      const own=job.ownStatusObservation;if(!UUID.test(own.requestNonce||"")||own.operationBinding!==operationBinding||own.enqueueRequestNonce!==job.requestNonce||!Number.isFinite(Date.parse(own.reservedAt)))fail("ame_title_own_observation_changed");
    }
    const observed = await send({ ...a, operation: "status", jobId: job.jobId, processBinding: batch.processBinding, operationBinding, requestNonce: ownObservation?job.ownStatusObservation.requestNonce:crypto.randomUUID(), minimumObservedAt: ownObservation?Date.parse(job.ownStatusObservation.reservedAt):pendingStart ? Date.parse(batch.start.reservedAt) : nonce ? Date.parse(job.submittedAt) : now(), completionScope: completionScope(batch, job), ...(ownObservation?{observeOwnJob:true,observationReconcile,observationEnqueueRequestNonce:job.requestNonce,observationEnqueueOperationBinding:job.operationBinding}:nonce ? { reconcileRequestNonce: nonce } : {}) });
    await processPin(a, processInfo); pinned(job);
    if (pendingStart) { batch.start.transportResolved = observed.resolved; batch.start.state = observed.code === "batch_start_accepted" ? "accepted" : "unknown_outcome"; }
    else { updateJob(job, observed); acceptOwnRead(job, observed); } write(recordFile(a.batchId), batch);
    const native = pendingStart ? null : observed.native, nativeJob = native && native.job, verified = associated(job, native);
    let file = { exists: false }; try { const stat = fs.lstatSync(job.outputPath); if (stat.isFile() && !stat.isSymbolicLink()) file = { exists: true, bytes: stat.size, modifiedAt: stat.mtime.toISOString() }; } catch (error) { if (error.code !== "ENOENT") return result("output_read_error"); }
    const passiveJob = { schema: "ae-agent-ame-job.v1", jobId: job.jobId, preset: job.presetIdentity, outputPath: job.outputPath, range: job.args.range, submittedAt: job.submittedAt };
    const nativeStatus = verified && ["queued", "running"].includes(nativeJob.status) ? { ...passiveJob, status: nativeJob.status, observedAt: new Date(native.observedAt).toISOString() } : null;
    const passiveResult = passive.evaluateAmePassiveStatus(passiveJob, nativeStatus, file, job.passivePrevious, now()); job.passivePrevious = passiveResult.ok ? passiveResult : null; write(recordFile(a.batchId), batch);
    const completion = verified && nativeJob.hostCompletion, exactCompletion = !!(completion && samePath(completion.sourceFilePath, job.sourcePath) && samePath(completion.outputFilePath, job.outputPath) && Number.isFinite(completion.observedAt) && completion.observedAt >= Date.parse(job.submittedAt) && completion.observedAt <= native.observedAt);
    // EncoderHostWrapperEvent documents strings 'True'/'False'. Wrapper events
    // retain raw observations but do not invent a numeric or boolean success map.
    const complete = exactCompletion && completion.result === "True", failed = exactCompletion && completion.result === "False";
    const startAcceptanceVerified = verified && originalStartAccepted(batch, job, native, processInfo);
    if (startAcceptanceVerified) { batch.start.transportResolved = true; batch.start.state = "accepted"; }
    job.completionVerified = complete; write(recordFile(a.batchId), batch);
    return result(observed.code, { ok: verified, batchId: a.batchId, jobId: job.jobId, handleKey: job.handleKey, ownItemAccepted: !!job.acceptanceReceipt, acceptanceReceipt: job.acceptanceReceipt || null, nativeAssociationVerified: verified, nativeCompletionObserved: !!(verified && nativeJob.nativeCompletionObserved), nativeResult: exactCompletion ? completion.result : verified ? nativeJob.nativeResult : null, completionVerified: complete,
      state: complete ? job.args.queueMode === sharedQueue.MODE ? "native_finished" : "needs_media_probe" : failed ? "failed" : verified && nativeJob.nativeCompletionObserved ? "needs_result_interpretation" : passiveResult.state, queueOnly: job.args.queueMode === sharedQueue.MODE, startAcceptanceVerified, passive: passiveResult, file, native, process: processInfo, startReservation: startReservation(batch), requestNonce: nonce || native && native.requestNonce });
  }
  async function execute(name, raw, cap) {
    const a = validateInput(name, raw), mutation = name === ENQUEUE || name === START; if (mutation) { assertCap(cap, name, a); if (busy) fail("ame_title_writer_busy"); busy = true; }
    try { return await (name === INSPECT ? inspectSources(a) : name === QUEUE_MANIFEST ? queueManifest(a) : name === ENQUEUE ? enqueue(a, cap) : name === START ? start(a, cap) : status(a)); }
    catch (error) {
      let durable = null;
      if (name === START) { try { durable = (a.queueMode === sharedQueue.MODE ? deps.sharedQueueGrant : deps.manualQueueGrant)?.readReservation(a.batchId); } catch (_) {} }
      return result(error.code || "ame_title_read_error", { error: String(error.message || error).slice(0, 2000), ...(durable ? { unknownOutcome: true, batchId: a.batchId, requestNonce: durable.requestNonce, startReservation: durable } : {}) });
    }
    finally { if (mutation) busy = false; }
  }
  return { authorize, assertAuthorization: (cap, name, raw) => { assertCap(cap, name, validateInput(name, raw)); return true; }, execute };
}

const common = { targetSpecifier: { type: "string", pattern: "^ame-[0-9]{1,3}\\.[0-9]{1,3}$" }, expectedProcess: { type: "object", additionalProperties: false, required: ["pid", "startedAt"], properties: { pid: { type: "integer", minimum: 1 }, startedAt: { type: "string" } } }, expectedSessionNonce: { type: "string" }, timeoutMs: { type: "integer", minimum: 1000, maximum: 10000 } };
const source = { sourceProjectFile: { type: "string" }, expectedSourceSha25664: { type: "string", pattern: SHA.source } }, batchId = { type: "string", pattern: UUID.source };
const queueFields = { manualQueueMode: { type: "string", enum: ["cep_user_declaration_v2"] }, completedOwnedPrefix: { type: "array", maxItems: 63, items: { type: "object", additionalProperties: false, required: ["batchId", "jobId"], properties: { batchId, jobId: { type: "string", pattern: UUID.source } } } } };
const queueMode = { type: "string", enum: [sharedQueue.MODE] };
const definitions = [
  [INSPECT, "Read exact DL GUID strings from one pinned saved AEP in an already running AME. Reconcile an exact unknown read nonce without resend. No first-comp inference, submit or launch.", { ...source, reconcileRequestNonce: { type: "string", pattern: UUID.source } }, ["sourceProjectFile", "expectedSourceSha25664"]],
  [ENQUEUE, "Gated fixed addDLToBatch with one exact GUID, exact catalog EPR and reserved output. Shared mode requires private server authority and immediate own wrapper read-back. Our jobId/handleKey is not a native ID. Unknown submission cannot replay.", { ...source, batchId, queueMode, sourceGuid: { type: "string" }, presetId: { type: "string", pattern: "^amep_[a-f0-9]{40}$" }, presetSha25664: { type: "string", pattern: SHA.source }, outputFileName: { type: "string" }, range: { type: "object", additionalProperties: false, required: ["startSeconds", "endSeconds"], properties: { startSeconds: { type: "number", minimum: 0 }, endSeconds: { type: "number" } } } }, ["sourceProjectFile", "expectedSourceSha25664", "batchId", "sourceGuid", "presetId", "presetSha25664", "outputFileName", "range"]],
  [QUEUE_MANIFEST, "Fresh owned wrapper manifest for exactly one ready job and explicit completed owned prefix. No proof of full AME queue, no enqueue/start. Requires trusted native read dispatch port.", { batchId, ...queueFields }, ["batchId", "manualQueueMode", "completedOwnedPrefix"]],
  [START, "Global AME runBatch. Shared mode starts the mixed queue after fresh checks of two accepted own items, private server capability and durable once marker. Legacy CEP declaration remains supported. No full queue or media proof.", { batchId, queueMode, ...queueFields, manualQueueManifestSha25664: { type: "string", pattern: SHA.source } }, ["batchId"]],
  [STATUS, "Fixed read of one retained native EncoderWrapper. originalRunId selects server-owned proof of a finalized enqueue that never reached required command capture; settles that reservation without a native send and requires a new proposal for its first delivery.", { batchId, jobId: { type: "string", pattern: UUID.source },originalRunId:{type:"string",pattern:UUID.source} }, ["batchId", "jobId"]]
];
const tools = definitions.map(([name, description, fields, required]) => ({ name, description, inputSchema: { type: "object", additionalProperties: false, properties: { ...common, ...fields }, required: ["targetSpecifier", "expectedProcess", ...required] }, annotations: { readOnlyHint: [INSPECT, STATUS, QUEUE_MANIFEST].includes(name), destructiveHint: false, idempotentHint: false, openWorldHint: false } }));
module.exports = { INSPECT, ENQUEUE, START, STATUS, QUEUE_MANIFEST, SCHEMA, NATIVE_SCHEMA, LEDGER_SCHEMA, SLOT, SENDER_SLOT, tools, validateInput, operationArgsHash, messageScript, commandScript, createExecutor };

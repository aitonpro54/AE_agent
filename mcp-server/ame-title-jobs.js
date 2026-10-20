"use strict";
const fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto");
const presets = require("./ame-presets"), reservation = require("./ame-submit-guard"), passive = require("./ame-passive-status");
const { sameProcess } = require("./ame-running");
const manualQueue = require("./ame-manual-queue-grant");
const sharedQueue = require("./ame-shared-queue-grant");
const savedSourceAdmission = require("./ame-saved-source-admission");
const sourceReads = require("./ame-source-read");
const pendingEnqueue = require("./ame-title-pending");
const INSPECT = "inspect_ame_title_sources", ENQUEUE = "enqueue_ame_title_variant", START = "start_ame_title_batch", STATUS = "get_ame_title_job_status";
const QUEUE_MANIFEST = "inspect_ame_title_queue_manifest";
const SCHEMA = "ae-agent-ame-title-jobs.v1", NATIVE_SCHEMA = "ae-agent-ame-title-native.v1", LEDGER_SCHEMA = "ae-agent-ame-title-batch.v1";
const SLOT = "aeAgentAMETitleJobsV1", SENDER_SLOT = "aeAgentAMETitleSendV1";
const INDEPENDENT_SENDER_MAX_AGE_MS = 180000;
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
  const fields = name === INSPECT ? [...source, "reconcileRequestNonce", "sourceReadBudgetMs"] : name === ENQUEUE ? [...source, "batchId", "sourceGuid", "presetId", "presetSha25664", "outputFileName", "range", "queueMode", "enqueueTransport"] : name === START ? ["batchId", "manualQueueMode", "manualQueueManifestSha25664", "completedOwnedPrefix", "queueMode"] : name === QUEUE_MANIFEST ? ["batchId", "manualQueueMode", "completedOwnedPrefix"] : name === STATUS ? ["batchId", "jobId", "originalRunId", "acceptanceOnly", "readTransport", "readRequestNonce", "afterReadTimeoutNonce"] : null;
  if (!fields) fail("ame_title_unknown_tool"); object(raw, [...common, ...fields, ...(name === ENQUEUE || name === START ? META : [])]);
  if (!/^ame-[0-9]{1,3}\.[0-9]{1,3}$/.test(text(raw.targetSpecifier))) fail("ame_title_exact_target_required");
  object(raw.expectedProcess, ["pid", "startedAt"]);
  if (!Number.isSafeInteger(raw.expectedProcess.pid) || raw.expectedProcess.pid < 1 || typeof raw.expectedProcess.startedAt !== "string" || !Number.isFinite(Date.parse(raw.expectedProcess.startedAt))) fail("ame_title_process_binding_required");
  const a = { targetSpecifier: raw.targetSpecifier, expectedProcess: { pid: raw.expectedProcess.pid, startedAt: new Date(raw.expectedProcess.startedAt).toISOString() }, timeoutMs: raw.timeoutMs === undefined ? 5000 : raw.timeoutMs };
  if (!Number.isSafeInteger(a.timeoutMs) || a.timeoutMs < 1000 || a.timeoutMs > 10000) fail("ame_title_invalid_timeout");
  if (raw.expectedSessionNonce !== undefined) { if (raw.expectedSessionNonce !== null && !/^[A-Za-z0-9._-]{1,128}$/.test(text(raw.expectedSessionNonce, 128))) fail("ame_title_invalid_session"); a.expectedSessionNonce = raw.expectedSessionNonce; }
  if (name === INSPECT || name === ENQUEUE) { a.sourceProjectFile = localFile(raw.sourceProjectFile, ".aep"); if (typeof raw.expectedSourceSha25664 !== "string" || !SHA.test(raw.expectedSourceSha25664)) fail("ame_title_source_hash_required"); a.expectedSourceSha25664 = raw.expectedSourceSha25664; }
  if (name === INSPECT && raw.reconcileRequestNonce !== undefined) { if (typeof raw.reconcileRequestNonce !== "string" || !UUID.test(raw.reconcileRequestNonce)) fail("ame_title_invalid_nonce"); a.reconcileRequestNonce = raw.reconcileRequestNonce; }
  if(name===INSPECT){a.sourceReadBudgetMs=raw.sourceReadBudgetMs===undefined?sourceReads.MIN_BUDGET_MS:raw.sourceReadBudgetMs;if(!Number.isSafeInteger(a.sourceReadBudgetMs)||a.sourceReadBudgetMs<sourceReads.MIN_BUDGET_MS||a.sourceReadBudgetMs>sourceReads.MAX_BUDGET_MS)fail("ame_source_read_budget_invalid");}
  if (name !== INSPECT) { if (typeof raw.batchId !== "string" || !UUID.test(raw.batchId)) fail("ame_title_invalid_batch"); a.batchId = raw.batchId; }
  if (raw.queueMode !== undefined) {
    if (raw.queueMode !== sharedQueue.MODE || raw.manualQueueMode !== undefined || raw.manualQueueManifestSha25664 !== undefined || raw.completedOwnedPrefix !== undefined) fail("ame_shared_queue_mode_invalid");
    a.queueMode = sharedQueue.MODE;
  }
  if(raw.enqueueTransport!==undefined){if(name!==ENQUEUE||raw.enqueueTransport!==pendingEnqueue.MODE||a.queueMode!==sharedQueue.MODE)fail("ame_title_async_shared_only");a.enqueueTransport=pendingEnqueue.MODE;}
  if(raw.readTransport!==undefined){if(name!==STATUS||raw.readTransport!==pendingEnqueue.MODE||raw.originalRunId!==undefined||raw.acceptanceOnly===true)fail("ame_title_async_read_invalid");a.readTransport=pendingEnqueue.MODE;}
  if(raw.readRequestNonce!==undefined){if(name!==STATUS||raw.readTransport!==pendingEnqueue.MODE||!UUID.test(raw.readRequestNonce))fail("ame_title_async_read_invalid");a.readRequestNonce=raw.readRequestNonce;}
  if(raw.afterReadTimeoutNonce!==undefined){if(name!==STATUS||raw.readTransport!==pendingEnqueue.MODE||raw.readRequestNonce!==undefined||raw.originalRunId!==undefined||raw.acceptanceOnly!==undefined||!UUID.test(raw.afterReadTimeoutNonce))fail("ame_title_async_read_invalid");a.afterReadTimeoutNonce=raw.afterReadTimeoutNonce;}
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
  if (name === STATUS && raw.acceptanceOnly !== undefined) {
    if (raw.acceptanceOnly !== true || raw.originalRunId !== undefined) fail("ame_title_invalid_acceptance_read");
    a.acceptanceOnly = true;
  }
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
    if (typeof v === "string") {
      s = '"';
      for (i = 0; i < v.length; i++) {
        var code = v.charCodeAt(i), ch = v.charAt(i), escape = String.fromCharCode(92);
        if (code === 34 || code === 92) s += escape + ch;
        else if (code < 32 || code === 8232 || code === 8233) { var h = code.toString(16); while (h.length < 4) h = "0" + h; s += escape + "u" + h; }
        else s += ch;
      }
      return s + '"';
    }
    if (Object.prototype.toString.call(v) === "[object Array]") { for (i = 0; i < v.length; i++) out.push(stringify(v[i])); return "[" + out.join(",") + "]"; }
    for (k in v) if (Object.prototype.hasOwnProperty.call(v, k)) out.push(stringify(k) + ":" + stringify(v[k])); return "{" + out.join(",") + "}";
  }
  var reply = { schema: "ae-agent-ame-title-native.v1", requestNonce: a.requestNonce, operationBinding: a.operationBinding, appSpecifier: String(BridgeTalk.appSpecifier), sessionNonce: scalar($.global.aeAgentAMEProbeSessionNonce), observedAt: new Date().getTime(), code: "unsupported", nativeJobId: null, nativeAssociationVerified: false };
  function done(code) { reply.code = code; if(a.operation === "enqueue" && entry && !reply.job)reply.job=readEntry(entry);var serialized = stringify(reply); if (utf8Bytes(serialized, 524288) < 0) { reply = { schema: reply.schema, requestNonce: reply.requestNonce, operationBinding: reply.operationBinding, appSpecifier: reply.appSpecifier, sessionNonce: reply.sessionNonce, observedAt: reply.observedAt, code: "native_response_envelope_oversize", nativeJobId: null, nativeAssociationVerified: false }; serialized = stringify(reply); } return serialized; }
  if(a.ownedInitialDispatch===true){var rawProbe=$.global.aeAgentAMEProbeSessionNonce;if(!(rawProbe===undefined||rawProbe===null||typeof rawProbe==="string"&&/^[A-Za-z0-9._-]{1,128}$/.test(rawProbe)))return done("owned_probe_observation_invalid");}
  if (reply.appSpecifier !== a.targetSpecifier || Object.prototype.hasOwnProperty.call(a,"expectedSessionNonce") && reply.sessionNonce !== a.expectedSessionNonce) return done("target_session_changed");
  if(a.ownedInitialDispatch===true&&a.operation!=="sources"){
    if(!Object.prototype.hasOwnProperty.call(a,"boundNativeSessionNonce")||!(a.boundNativeSessionNonce===null||typeof a.boundNativeSessionNonce==="string"&&/^[A-Za-z0-9._-]{1,128}$/.test(a.boundNativeSessionNonce))||reply.sessionNonce!==a.boundNativeSessionNonce)return done("owned_target_session_changed");
  }
  var slot = $.global.aeAgentAMETitleJobsV1, frontend, host, ids, i, entry, batch;
  function readEntry(e) {
    var result = { handleKey: e.handleKey, enqueueRequestNonce: e.enqueueRequestNonce, retainedWrapperSessionNonce: slot.retainedWrapperSessionNonce, sourcePath: e.sourcePath, sourceGuid: e.sourceGuid, outputPath: e.outputPath, presetIdentity: e.presetIdentity, range: e.range, processBinding: e.processBinding, nativeJobId: null, nativeAssociationVerified: e.associated === true, workAreaApplied: e.workAreaApplied === true, status: e.status, nativeCompletionObserved: e.finished === true && (e.queueMode !== "shared_queue_v1" || !!e.hostCompletion && e.completionOrigin === "host_exact_paths"), nativeResult: e.nativeResult, completionOrigin: e.completionOrigin || null, eventObservedAt: e.eventObservedAt || null, hostCompletion: e.hostCompletion || null, wrapperCompletion: e.wrapperCompletion || null, readErrors: [] };
    result.outputBindingEvidence = null; result.independentOutputGetterVerified = false; result.generatedOutputVerified = false;
    result.wrapperDiagnostic = { type: typeof e.wrapper, isNull: e.wrapper === null, methods: {} };
    result.dispatchDiagnostic = { phase:e.nativePhase || null, addDLInvoked:e.addDLInvoked === true, addDLReturned:e.addDLReturned === true, error:e.nativeError || null, creationFailures:e.creationFailures || [], workAreaCallAck:e.workAreaCallAck || null };
    if(e.nativeError || e.creationFailures && e.creationFailures.length){result.readErrors.push(e.nativeError?"native_dispatch_error":"batch_item_creation_failed");result.nativeAssociationVerified=false;}
    for (var method in {setWorkArea:1,addEventListener:1,getEncodeProgress:1,getEncodeTime:1}) { try { result.wrapperDiagnostic.methods[method] = e.wrapper ? typeof e.wrapper[method] : "unavailable"; } catch (methodError) { result.wrapperDiagnostic.methods[method] = "read_error"; } }
    try { result.outputFiles = []; var files = e.wrapper && e.wrapper.outputFiles; if (!files || typeof files.length !== "number") throw Error(); for (var n = 0; n < files.length && n < 8; n++) result.outputFiles.push(String(files[n])); if (files.length === 1 && norm(files[0]) === norm(e.outputPath)) {result.outputBindingEvidence="generated_output_files";result.independentOutputGetterVerified=true;result.generatedOutputVerified=true;} else result.nativeAssociationVerified = false; } catch (x1) { result.readErrors.push("output_files_read_error"); result.nativeAssociationVerified = false; }
    for (var name in { getEncodeProgress: 1, getEncodeTime: 1 }) {
      try { if (!e.wrapper || typeof e.wrapper[name] !== "function") throw Error(); result[name] = scalar(e.wrapper[name]()); } catch (x2) { result.readErrors.push(name + "_read_error"); }
    }
    // outputFiles describes files generated by encoding, not the queued destination.
    var ack=e.workAreaCallAck;
    if(files && files.length===0 && result.outputFiles && result.outputFiles.length===0 && e.queueMode==="shared_queue_v1" && e.associated===true && e.addDLInvoked===true && e.addDLReturned===true && e.nativePhase==="association_readback" && e.nativeError===null && e.creationFailures && e.creationFailures.length===0 && ack && ack.type===3 && ack.startSeconds===e.range.startSeconds && ack.endSeconds===e.range.endSeconds && ack.result===true && e.workAreaApplied===true && e.finished===false && e.nativeResult===null && !e.hostCompletion && !e.wrapperCompletion && e.status==="queued" && reply.batchRunning===false && result.readErrors.length===0 && result.getEncodeProgress===0 && result.getEncodeTime===0){result.nativeAssociationVerified=true;result.outputBindingEvidence="exact_addDL_call_argument_ack";}
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
    if (a.operation === "enqueue" && a.retiredSenderIdentity) {
      var retired = a.retiredSenderIdentity, retained = slot && slot.jobs && slot.jobs[retired.jobId], retainedBatch = slot && slot.batches && slot.batches[retired.batchId];
      if (reply.sessionNonce !== retired.sessionNonce || !slot || slot.retainedWrapperSessionNonce !== retired.retainedWrapperSessionNonce || !retained || retained.handleKey !== retired.jobId || retained.enqueueRequestNonce !== retired.enqueueNonce || retained.batchId !== retired.batchId || retained.processBinding !== a.processBinding || !retainedBatch || retainedBatch.processBinding !== a.processBinding || a.jobId === retired.jobId || a.batchId === retired.batchId || norm(a.outputPath) === norm(retired.outputPath)) return done("retired_sender_ame_identity_changed");
    }
    if (a.operation === "status") {
      entry = slot && slot.jobs[a.jobId]; if (!entry || entry.processBinding !== a.processBinding || entry.batchId !== a.batchId) return done("native_handle_unavailable");
      function pathChars(v) { if (typeof v !== "string") return null; var count = 0; for (var p = 0; p < v.length; p++) if (v.charCodeAt(p) === 92) count++; return {length:v.length,backslashCount:count}; }
      reply.pathDiagnostic = { inputSource:pathChars(a.expectedOwnSourcePath),inputOutput:pathChars(a.expectedOwnOutputPath),inputSourcePath:a.expectedOwnSourcePath||null,inputOutputPath:a.expectedOwnOutputPath||null,retainedSource:pathChars(entry.sourcePath),retainedOutput:pathChars(entry.outputPath) };
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
    entry.nativePhase = "reserved"; entry.addDLInvoked = false; entry.addDLReturned = false; entry.nativeError = null; entry.creationFailures = [];
    slot.jobs[a.jobId] = entry; slot.count++; batch.jobIds.push(a.jobId);
    entry.nativePhase = "host_listener_setup";
    if (!slot.hostListeners && typeof host.addEventListener === "function") {
      function hostEvent(event, complete) { var key, e; for (key in slot.jobs) if (Object.prototype.hasOwnProperty.call(slot.jobs, key)) { e = slot.jobs[key]; if (e.associated && event && norm(event.sourceFilePath) === norm(e.sourcePath) && norm(event.outputFilePath) === norm(e.outputPath)) { if (complete) finish(e, event, "host_exact_paths"); else { e.callbackOrdinal++; if (!e.finished) { e.status = "running"; e.eventObservedAt = new Date().getTime(); captureRaw(e, "started", event); } } } } }
      slot.hostListeners = { started: function(e) { hostEvent(e, false); }, complete: function(e) { hostEvent(e, true); } };
      host.addEventListener("onItemEncodingStarted", slot.hostListeners.started); host.addEventListener("onItemEncodeComplete", slot.hostListeners.complete);
    }
    entry.nativePhase = "creation_failure_listener_setup";
    if (typeof frontend.addEventListener !== "function") return done("creation_failure_listener_unsupported_before_submit");
    entry.creationFailureListener = function(event) {
      if (!event || typeof event.srcFilePath !== "string" || norm(event.srcFilePath) !== norm(entry.sourcePath) || entry.creationFailures.length >= 3) return;
      entry.creationFailures.push({sourcePath:event.srcFilePath,error:String(event.error || "").substring(0,2000),observedAt:new Date().getTime()});
    };
    frontend.addEventListener("onBatchItemCreationFailed", entry.creationFailureListener);
    // Empty format derives from the exact EPR argument. This is call evidence,
    // not an independent getter proving the applied preset or range.
    entry.nativePhase = "add_dl_submitted"; entry.addDLInvoked = true;
    entry.wrapper = frontend.addDLToBatch(a.sourcePath, "", a.presetPath, a.sourceGuid, a.outputPath);
    entry.addDLReturned = true; entry.nativePhase = "add_dl_returned";
    if (!entry.wrapper || typeof entry.wrapper.setWorkArea !== "function" || typeof entry.wrapper.addEventListener !== "function") return done("encoder_wrapper_unsupported_after_submit");
    entry.nativePhase = "wrapper_listener_setup";
    entry.listeners = { progress: function(event) { entry.callbackOrdinal++; if (!entry.finished) { entry.status = "running"; entry.eventObservedAt = new Date().getTime(); captureRaw(entry, "progress", event); } }, finished: function(e) { finish(entry, e, "native_wrapper"); } };
    entry.wrapper.addEventListener("onEncodeProgress", entry.listeners.progress); entry.wrapper.addEventListener("onEncodeFinished", entry.listeners.finished);
    entry.nativePhase = "work_area_submitted";
    var entire = a.ownedInitialDispatch===true&&a.ownedRangeMode==="full_observed_root_range_v1", areaType=entire?0:3, areaStart=entire?0:a.range.startSeconds, areaEnd=entire?a.ownedObservedDuration:a.range.endSeconds;
    var areaResult = entry.wrapper.setWorkArea(areaType, areaStart, areaEnd);
    entry.workAreaCallAck = {type:areaType,startSeconds:areaStart,endSeconds:areaEnd,result:scalar(areaResult),observedAt:new Date().getTime()};
    entry.nativePhase = "work_area_returned";
    if (areaResult !== true) return done(entire?"owned_entire_range_unverified_after_submit":"work_area_unverified_after_submit");
    entry.workAreaApplied = true;
    entry.nativePhase = "association_readback"; entry.associated = true; if (entry.status === "unknown_outcome") entry.status = "queued"; reply.job = readEntry(entry); reply.nativeAssociationVerified = reply.job.nativeAssociationVerified;
    return done(reply.nativeAssociationVerified ? "job_enqueued" : "output_binding_unverified_after_submit");
  } catch (error) { reply.error = String(error).substring(0, 2000); if(entry){entry.nativeError={phase:entry.nativePhase || "unknown",error:reply.error,observedAt:new Date().getTime()};reply.job=readEntry(entry);} return done("native_read_or_submit_error"); }
}

// Fixed AE sender. It never launches AME; unknown queue delivery blocks another send.
// Reconciliation pumps the SAME retained BridgeTalk message and never resubmits.
function nativeSend(a, messageBody) {
  function utf8Bytes(v, maximum) { var bytes = 0, i, c, low; for (i = 0; i < v.length; i++) { c = v.charCodeAt(i); if (c < 128) bytes++; else if (c < 2048) bytes += 2; else if (c >= 55296 && c <= 56319) { if (++i >= v.length) return -1; low = v.charCodeAt(i); if (low < 56320 || low > 57343) return -1; bytes += 4; } else if (c >= 56320 && c <= 57343) return -1; else bytes += 3; if (bytes > maximum) return -1; } return bytes; }
  var slot = $.global.aeAgentAMETitleSendV1,asyncOwn=a.asyncOwnStatus===true,asyncMode=asyncOwn||a.operation==="enqueue"&&a.enqueueTransport==="async_once_v1",readCache=null;
  function reply(code) {
    var value = { schema: "ae-agent-ame-title-send.v1", code: code, requestNonce: slot ? slot.requestNonce : a.requestNonce, callback: slot ? slot.callback : null, responseBody: slot ? slot.body : null };
    if (a.operation === "status") { var original = $.global.aeAgentAMETitleSendV1; if (original) value.originalSender = {requestNonce:original.requestNonce,operationBinding:original.operationBinding,callback:original.callback,responseBody:typeof original.body === "string" && utf8Bytes(original.body,524288) >= 0 ? original.body : null}; }
    var targetStatus = null; try { if(typeof BridgeTalk.getStatus === "function")targetStatus=String(BridgeTalk.getStatus(a.targetSpecifier)); } catch (statusError) { targetStatus="read_error"; }
    value.transportDiagnostic={targetStatus:targetStatus,sendAck:slot&&typeof slot.sent === "boolean"?slot.sent:null,sendError:slot&&slot.sendError||null,messageBodyChars:slot&&slot.message&&typeof slot.message.body === "string"?slot.message.body.length:null,callback:slot?slot.callback:null};
    if(asyncMode){value.transportDiagnostic.sendMode="async_no_wait";value.transportDiagnostic.pumpPerformed=false;if(slot&&slot.asyncDispatch)value.asyncDispatch=slot.asyncDispatch;}
    return value;
  }
  function refuseBeforeSend(reason) {
    var value=reply("previous_request_unresolved");
    if(a.operation === "enqueue"){value.requestNonce=a.requestNonce;value.senderRefusal={schema:"ae-agent-ame-title-sender-refusal.v1",requestNonce:a.requestNonce,operationBinding:a.operationBinding,jobId:a.jobId,batchId:a.batchId,oldRequestNonce:slot?slot.requestNonce:null,constructorInvoked:false,sendInvoked:false,reason:reason};}
    return value;
  }
  function pump(ms) { var deadline = new Date().getTime() + ms; while (slot && (!slot.callback || slot.callback === "timeout") && new Date().getTime() < deadline) { if (typeof BridgeTalk.pump !== "function" || typeof $.sleep !== "function") break; BridgeTalk.pump(); if (!slot.callback || slot.callback === "timeout") $.sleep(20); } }
  if (typeof BridgeTalk !== "function" || typeof BridgeTalk.isRunning !== "function") return reply("bridgetalk_unsupported");
  try { if (!BridgeTalk.isRunning(a.targetSpecifier)) return reply("target_not_running"); } catch (_) { return reply("target_running_unknown"); }
  var observationOnly = a.observeOwnJob === true, retainedSourceRead = null, originSender = slot, retiredMutation = slot ? slot.retainedRetiredMutation || null : null;
  if(asyncOwn){
    if(a.operation!=="status"||a.reconcileRequestNonce){slot=null;return reply("own_observation_origin_changed");}
    var cursor=originSender,depth=0,found=null;
    while(cursor&&depth++<64){if(cursor.operation==="enqueue"&&cursor.requestNonce===a.observationEnqueueRequestNonce&&cursor.operationBinding===a.observationEnqueueOperationBinding&&cursor.targetSpecifier===a.targetSpecifier&&cursor.processBinding===a.processBinding){found=cursor;break;}cursor=cursor.retainedRetiredMutation;}
    if(!found){slot=null;return reply("own_observation_origin_changed");}originSender=found;
    readCache=$.global.aeAgentAMETitleAsyncReadsV1;if(!readCache){readCache={};$.global.aeAgentAMETitleAsyncReadsV1=readCache;}
    var oldRead=$.global.aeAgentAMETitleObservationV1,readCount=0,readKey;slot=readCache[a.requestNonce];if(!slot&&oldRead&&oldRead.requestNonce===a.requestNonce)slot=oldRead;
    if(slot){if(slot.operation!=="status"||slot.originSender!==originSender||slot.jobId!==a.jobId||slot.batchId!==a.batchId||slot.enqueueRequestNonce!==a.observationEnqueueRequestNonce||slot.targetSpecifier!==a.targetSpecifier||slot.processBinding!==a.processBinding||slot.operationBinding!==a.operationBinding){slot=null;return reply("own_observation_binding_changed");}return reply(slot.callback||"async_pending");}
    if(a.observationReconcile===true)return reply("own_observation_unavailable");
    for(readKey in readCache)if(Object.prototype.hasOwnProperty.call(readCache,readKey))readCount++;
    if(oldRead&&typeof oldRead.requestNonce==="string"&&!readCache[oldRead.requestNonce]){if(readCount>=64)return reply("own_observation_cache_bound");readCache[oldRead.requestNonce]=oldRead;readCount++;}
    if(readCount>=64)return reply("own_observation_cache_bound");
  } else if (observationOnly) {
    // A separate read descriptor leaves the mutation message and its late
    // callbacks untouched. Only a fixed own-job status can use this lane.
    if (a.operation !== "status" || a.reconcileRequestNonce || !slot || slot.operation !== "enqueue" || slot.requestNonce !== a.observationEnqueueRequestNonce || slot.operationBinding !== a.observationEnqueueOperationBinding || slot.targetSpecifier !== a.targetSpecifier || slot.processBinding !== a.processBinding) return reply("own_observation_origin_changed");
    slot = $.global.aeAgentAMETitleObservationV1;
    var matching = slot && slot.requestNonce === a.requestNonce && slot.operation === "status" && slot.jobId === a.jobId && slot.batchId === a.batchId && slot.enqueueRequestNonce === a.observationEnqueueRequestNonce && slot.targetSpecifier === a.targetSpecifier && slot.processBinding === a.processBinding && slot.operationBinding === a.operationBinding;
    if (matching) {
      var rollover=a.readonlyObservationRollover;
      if(rollover && slot.originSender === originSender && slot.callback === null && slot.readRolloverAllowed !== true && slot.requestNonce === rollover.requestNonce && slot.operationBinding === rollover.operationBinding && slot.jobId === rollover.jobId && slot.batchId === rollover.batchId && slot.enqueueRequestNonce === rollover.enqueueNonce && originSender.requestNonce === rollover.enqueueNonce && originSender.operationBinding === rollover.enqueueBinding && slot.targetSpecifier === rollover.targetSpecifier && slot.processBinding === rollover.processBinding && typeof rollover.deadline === "number" && new Date().getTime() >= rollover.deadline){slot.readRolloverAllowed=true;return reply("own_observation_retired_unknown");}
      pump(a.timeoutMs); return reply(slot.callback || "unknown");
    }
    if (a.observationReconcile === true) return reply("own_observation_unavailable");
    if (slot && (!slot.callback || slot.callback === "timeout") && slot.readRolloverAllowed !== true) return reply("previous_observation_unresolved");
    if(slot && slot.readRolloverAllowed === true && slot.readRolloverConsumed === true)return reply("own_observation_rollover_consumed");
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
    var proof = a.independentSenderRetirement, observation = $.global.aeAgentAMETitleObservationV1;
    if (proof && a.operation === "enqueue" && slot.operation === "enqueue" && slot.callback === "timeout" && observation && observation.originSender === slot && observation.callback === "result" && observation.independentRetirementConsumed !== true && observation.requestNonce === proof.observationNonce && observation.operationBinding === proof.observationBinding && observation.body === proof.responseBody && observation.jobId === proof.jobId && observation.batchId === proof.batchId && observation.enqueueRequestNonce === proof.enqueueNonce && slot.requestNonce === proof.enqueueNonce && slot.operationBinding === proof.enqueueBinding && slot.targetSpecifier === a.targetSpecifier && slot.processBinding === a.processBinding && observation.processBinding === a.processBinding && observation.targetSpecifier === a.targetSpecifier && a.jobId !== proof.jobId && a.batchId !== proof.batchId && a.requestNonce !== proof.enqueueNonce && a.outputPath !== proof.outputPath && proof.newJobId === a.jobId && proof.newBatchId === a.batchId && proof.newRequestNonce === a.requestNonce && proof.newOperationBinding === a.operationBinding && proof.newOutputPath === a.outputPath && new Date().getTime() >= proof.observedAt && new Date().getTime() - proof.observedAt <= 180000) {
      observation.independentRetirementConsumed = true; retiredMutation = slot;
    } else {
      if (slot.operation !== "sources" || a.operation === "sources" || slot.targetSpecifier !== a.targetSpecifier || slot.processBinding !== a.processBinding || retainedSourceRead) return refuseBeforeSend("previous_sender_unresolved_or_retirement_expired");
      retainedSourceRead = slot;
    }
  }
  if (a.operation === "sources" && retainedSourceRead && (!retainedSourceRead.callback || retainedSourceRead.callback === "timeout")) return reply("previous_request_unresolved");
  }
  var message = null;if(!asyncMode)message=new BridgeTalk();slot = { requestNonce: a.requestNonce, targetSpecifier: a.targetSpecifier, processBinding: a.processBinding, operationBinding: a.operationBinding, operation: a.operation, retainedSourceRead: retainedSourceRead, retainedRetiredMutation: retiredMutation, callback: null, body: null, message: message };
  if(asyncMode)slot.asyncDispatch={mode:"async_once_v1",operation:a.operation,requestNonce:a.requestNonce,operationBinding:a.operationBinding,processBinding:a.processBinding,targetSpecifier:a.targetSpecifier,batchId:a.batchId,jobId:a.jobId,budgetMs:600000,submittedAt:new Date().getTime(),sendInvoked:false};
  if (observationOnly) { slot.originSender = originSender; var priorObservation=$.global.aeAgentAMETitleObservationV1;if(!asyncOwn&&priorObservation && priorObservation.readRolloverAllowed === true){priorObservation.readRolloverConsumed=true;slot.retainedPriorObservation=priorObservation;} slot.jobId = a.jobId; slot.batchId = a.batchId; slot.enqueueRequestNonce = a.observationEnqueueRequestNonce;if(asyncOwn){readCache[a.requestNonce]=slot;if(originSender===$.global.aeAgentAMETitleSendV1)$.global.aeAgentAMETitleObservationV1=slot;}else $.global.aeAgentAMETitleObservationV1 = slot; } else $.global.aeAgentAMETitleSendV1 = slot;
  if(asyncMode){try{message=new BridgeTalk();slot.message=message;}catch(constructorError){slot.sendError=String(constructorError).substring(0,2000);return reply("send_unknown");}}
  message.target = a.targetSpecifier; message.body = messageBody; message.timeout = Math.ceil(a.timeoutMs / 1000);if(asyncMode)message.timeout=600;
  message.onResult = function(r) { var body = String(r.body || ""); if (utf8Bytes(body, 524288) < 0) { slot.body = null; slot.callback = "response_envelope_refused"; } else { slot.body = body; slot.callback = "result"; } };
  message.onError = function(r) { slot.body = String(r.body || "").substring(0, 2000); slot.callback = "error"; }; message.onTimeout = function() { if(!asyncMode||!slot.callback||slot.callback==="timeout")slot.callback = "timeout"; };
  try { if(asyncMode){slot.asyncDispatch.sendInvoked=true;slot.sent=message.send();}else slot.sent = message.send(Math.ceil(a.timeoutMs / 1000)); } catch (sendError) { slot.sendError=String(sendError).substring(0,2000);return reply("send_unknown"); }
  if (!asyncMode&&!slot.callback) pump(250);if(asyncMode)return reply(slot.callback||"async_pending");return reply(slot.callback || "unknown");
}
function utf16Expression(text) {
  const chunks=[];for(let i=0;i<text.length;i+=128){const units=[];for(let j=i;j<Math.min(i+128,text.length);j++)units.push(text.charCodeAt(j));chunks.push("String.fromCharCode("+units.join(",")+")");}return chunks.length?chunks.join("+"):'""';
}
function messageArgument(value) {
  if(typeof value==="string")return utf16Expression(value);
  if(value===null||typeof value==="boolean"||typeof value==="number"&&Number.isFinite(value))return JSON.stringify(value);
  if(Array.isArray(value))return "["+value.map(v=>v===undefined?"null":messageArgument(v)).join(",")+"]";
  if(value&&typeof value==="object")return "{"+Object.keys(value).filter(key=>value[key]!==undefined).map(key=>{if(!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key))fail("ame_title_fixed_argument_key_required");return JSON.stringify(key)+":"+messageArgument(value[key]);}).join(",")+"}";
  fail("ame_title_fixed_argument_type_required");
}
function messageScript(a) { return "(" + nativeTitleJob.toString() + ")(" + messageArgument(a) + ");"; }
// Internal fixed-program adapter. Tool JSON can never supply messageBody.
function fixedCommandScript(a, messageBody) {
  const script="return ("+nativeSend.toString()+")("+messageArgument(a)+","+utf16Expression(messageBody)+");";
  if(Buffer.byteLength(script,"utf8")>1048576)fail("ame_title_command_bound");return script;
}
function commandScript(a) {
  if(a.operation==="sources")return sourceReads.commandScript(a,{argument:messageArgument,string:utf16Expression});
  // Both the generated AME source and its string operands preserve exact UTF-16
  // units without Adobe's nested backslash-escape interpretation.
  const {independentSenderRetirement:senderOnly,...receiverArgs}=a;
  for(const key of ["expectedProcess","timeoutMs","sourceProjectFile","expectedSourceSha25664","presetId","presetSha25664","outputFileName","minimumObservedAt","completionScope","observeOwnJob","observationReconcile","observationEnqueueRequestNonce","observationEnqueueOperationBinding","readonlyObservationRollover","savedExistingSourceGuard"])delete receiverArgs[key];
  if(senderOnly)receiverArgs.retiredSenderIdentity={jobId:senderOnly.jobId,batchId:senderOnly.batchId,enqueueNonce:senderOnly.enqueueNonce,outputPath:senderOnly.outputPath,sessionNonce:senderOnly.sessionNonce,retainedWrapperSessionNonce:senderOnly.retainedWrapperSessionNonce};
  const body=a.reconcileRequestNonce||a.observationReconcile===true?"":messageScript(receiverArgs);
  // Only a private preparation port can supply this binding. The public parser
  // rejects it. A stale native source fails before BridgeTalk construction.
  const guard=a.savedExistingSourceGuard?savedSourceAdmission.guardScript(a.savedExistingSourceGuard):"";
  const script=guard+"return ("+nativeSend.toString()+")("+messageArgument(a)+","+utf16Expression(body)+");";
  if(Buffer.byteLength(script,"utf8")>1048576)fail("ame_title_command_bound");return script;
}

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
  const caps = new WeakMap(), nativePreparations = new WeakMap(), statusReads = new Set(), catalog = deps.listPresetCatalog || presets.listAmePresets, now = deps.now || Date.now; let busy = false, independentSenderProof = null;
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
  function load(id, receiptJobId = null) {
    const file = recordFile(id); if (!fs.existsSync(file)) return null; let batch;
    try { batch = JSON.parse(fs.readFileSync(file, "utf8")); } catch (_) { fail("ame_title_ledger_corrupt"); }
    if (!batch || batch.schema !== LEDGER_SCHEMA || batch.batchId !== id || !SHA.test(batch.processBinding || "") || !SHA.test(batch.presetIdentity || "") || !Array.isArray(batch.jobs) || batch.jobs.length > 64 || batch.jobs.some(j => !j || !UUID.test(j.jobId || "") || !UUID.test(j.requestNonce || "") || !SHA.test(j.operationBinding || "") || j.nativeJobId !== null || !j.args || j.args.batchId !== id || j.presetIdentity !== batch.presetIdentity || j.processBinding !== batch.processBinding)) fail("ame_title_ledger_corrupt");
    for (const job of batch.jobs) { validateInput(ENQUEUE, job.args); if (!receiptJobId || job.jobId === receiptJobId) savedAcceptance(job); } if (batch.start && (!UUID.test(batch.start.requestNonce || "") || !SHA.test(batch.start.operationBinding || "") || typeof batch.start.transportResolved !== "boolean")) fail("ame_title_ledger_corrupt"); return batch;
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
  function jobBinding(job){return {...(job.independentTransportRetirement?{independentTransportRetirement:job.independentTransportRetirement}:{}),jobId:job.jobId,requestNonce:job.requestNonce,operationBinding:job.operationBinding,args:validateInput(ENQUEUE,job.args),sourcePin:job.sourcePin,presetPin:job.presetPin,process:job.process,processBinding:job.processBinding,presetIdentity:job.presetIdentity,outputPath:job.outputPath,submittedAt:job.submittedAt};}
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
  function explicitSenderGuardCommand(record,batch,job){
    const step=record.run?.steps?.[0],commands=step?.commands;
    // A saved-source admission may read back once before the fixed sender. No
    // other command, incomplete delivery or post-submit error proves no send.
    if(!Array.isArray(commands)||commands.length<1||commands.length>2)return null;
    if(commands.some(c=>!UUID.test(c?.id||"")||!UUID.test(c.executionId||"")||c.state!=="completed"||c.lifecycleState!=="completed"||c.ok!==true||c.error!==null||c.errorCode!==null||c.neverSubmitted!==false||c.timedOutFrom!==null||JSON.stringify(c.history)!==JSON.stringify(["queued","leased","submitted","completed"])))return null;
    const c=commands[commands.length-1],n=c.result,f=n?.senderRefusal,d=job.lastDispatchDiagnostic;
    if(c.role!=="mutation"||c.executionId!==record.runId||new Set(commands.map(c=>c.id)).size!==commands.length)return null;
    if(commands.length===2){
      const read=commands[0],o=read.result,comp=Array.isArray(o?.comps)?o.comps.find(c=>c.dynamicLinkGUID===job.args.sourceGuid):null;
      if(read.role!=="readback"||!o||o.projectFile!==job.sourcePath||o.dirty!==false||!Number.isSafeInteger(o.revision)||o.revision<0||!Array.isArray(o.comps)||o.comps.length<1||o.comps.length>64||!comp||!Number.isFinite(comp.duration)||comp.duration<job.args.range.endSeconds)return null;
    }
    if(n?.schema!=="ae-agent-ame-title-send.v1"||n.code!=="previous_request_unresolved"||![null,"timeout"].includes(n.callback)||n.responseBody!==null||n.requestNonce!==job.requestNonce||
      f?.schema!=="ae-agent-ame-title-sender-refusal.v1"||f.requestNonce!==job.requestNonce||f.operationBinding!==job.operationBinding||f.jobId!==job.jobId||f.batchId!==batch.batchId||!UUID.test(f.oldRequestNonce||"")||f.oldRequestNonce===job.requestNonce||f.constructorInvoked!==false||f.sendInvoked!==false||f.reason!=="previous_sender_unresolved_or_retirement_expired"||
      !job.lastNativeSenderRefusal||hash(job.lastNativeSenderRefusal)!==hash(f)||d?.runId!==record.runId||d.stage!=="native_sender_guard"||d.dispatchInvoked!==true||d.bridgeTalkSendInvoked!==false||d.originalCode!==n.code||d.error!==f.reason)return null;
    for(const value of [step.mutationResult,step.result])if(value?.code!=="ame_title_not_sent"||!value.senderRefusal||hash(value.senderRefusal)!==hash(f)||!value.dispatchDiagnostic||hash({runId:record.runId,...value.dispatchDiagnostic})!==hash(d))return null;
    return c;
  }
  function settleNotSent(a,batch,job){
    if(typeof deps.readRunRecord!=="function"||typeof deps.assertNoSendRuntime!=="function"||typeof deps.hasQueuedStep!=="function")fail("ame_not_sent_server_reader_required");
    if(job.latestAuthorizedRunId&&job.latestAuthorizedRunId!==a.originalRunId)fail("ame_not_sent_stale_original_run");
    const r=deps.readRunRecord(a.originalRunId),s=r.run?.steps?.[0],planned=r.plan?.steps?.[0],validated=r.run?.validation?.steps?.[0],m=s?.mutationResult,observed=s?.result;
    const commands=s?.commands,retirement=job.independentTransportRetirement,explicit=explicitSenderGuardCommand(r,batch,job),c=explicit||(Array.isArray(commands)&&commands.length===1?commands[0]:null),n=c?.result;
    const legacyGuardRefused=!!(c&&!explicit&&retirement&&c.role==="mutation"&&c.state==="completed"&&c.ok===true&&c.executionId===r.runId&&JSON.stringify(c.history)===JSON.stringify(["queued","leased","submitted","completed"])&&UUID.test(c.id||"")&&n?.schema==="ae-agent-ame-title-send.v1"&&n.code==="previous_request_unresolved"&&n.callback==="timeout"&&n.responseBody===null&&n.requestNonce===retirement.oldEnqueueNonce&&n.requestNonce!==job.requestNonce&&retirement.newRequestNonce===job.requestNonce&&retirement.consumedByRunId===r.runId&&UUID.test(retirement.oldBatchId||"")&&retirement.oldBatchId!==batch.batchId&&UUID.test(retirement.oldJobId||"")&&retirement.oldJobId!==job.jobId&&UUID.test(retirement.oldEnqueueNonce||"")&&SHA.test(retirement.responseSha25664||""));
    const guardRefused=!!((explicit||legacyGuardRefused)&&typeof deps.assertPreSendGuardRecord==="function"&&deps.assertPreSendGuardRecord(r,c)===true);
    if(r.runId!==a.originalRunId||r.run?.id!==a.originalRunId||r.run.dryRun!==false||r.run.ok!==false||r.run.confirm!==true||r.run.allowMutations!==true||r.run.m100Action?.confirmedBySurface!=="cep-autonomous-session"||!/^session-[a-f0-9]+$/.test(r.run.m100Action?.confirmedBySession||"")||r.run.m100Action.actionId!==r.run.provenance?.actionId||r.run.m100Action.payloadHash!==r.run.provenance?.payloadHash||r.run.safety?.autonomousSession?.capability!=="typed_mutating_plan"||r.run.safety.allowRawExtendscript!==false||r.run.safety.allowWithoutCheckpoint!==false||!Number.isFinite(Date.parse(r.run.finishedAt))||r.run.steps?.length!==1||r.plan?.steps?.length!==1||r.run.validation?.ok!==true||r.run.validation.steps.length!==1||planned?.tool!==ENQUEUE||validated?.tool!==ENQUEUE||s?.tool!==ENQUEUE||s.index!==1||s.status!=="failed"||
      job.args.queueMode!==sharedQueue.MODE||batch.jobs.length<1||batch.jobs.length>2||batch.jobs.some(other=>other!==job&&(!other.transportResolved||!other.nativeAssociationVerified||!other.acceptanceReceipt))||batch.start!==null||startReservation(batch)||job.transportResolved||job.nativeAssociationVerified||job.acceptanceReceipt||job.nativeObservation||
      !guardRefused&&Object.hasOwn(s,"commands")&&(!Array.isArray(s.commands)||s.commands.length!==0)||deps.assertNoSendRuntime(r)!==true||!guardRefused&&deps.hasQueuedStep(r.runId)===true)fail("ame_not_sent_proof_denied");
    const args=validateInput(ENQUEUE,job.args);
    for(const row of [planned.args,validated.args,validated.safeArgs,s.args])if(hash(validateInput(ENQUEUE,row))!==hash(args))fail("ame_not_sent_args_changed");
    for(const value of [m,observed])if(!value||value.schema!==SCHEMA||value.ok!==false||value.batchId!==batch.batchId||value.jobId!==job.jobId||value.requestNonce!==job.requestNonce||value.native!==null||value.unknownOutcome!==true)fail("ame_not_sent_result_changed");
    if(r.run.provenance?.planSha256!==require("./review-evidence").sha256(r.plan)||job.operationBinding!==hash({operation:"enqueue",jobId:job.jobId,args})||job.processBinding!==binding(args,job.process)||batch.processBinding!==job.processBinding||batch.presetIdentity!==job.presetIdentity||job.presetIdentity!==hash({path:job.presetPin.path,sha256:job.presetPin.sha256})||job.sourcePath!==args.sourceProjectFile||job.outputPath!==deps.resolveOutputFilePath(args.outputFileName))fail("ame_not_sent_binding_changed");
    for(const owned of batch.jobs)pinned(owned);readyOutput(job);const guard=outputGuard(job),recordSha256=require("./plan-run-records").digest(JSON.stringify(r));
    const file=settlementFile(r.runId);let value;
    if(fs.existsSync(file)){
      const e=JSON.parse(fs.readFileSync(file,"utf8"));if(e.schema!=="ae-agent-ame-not-sent-envelope.v1"||e.sha256!==hash(e.value)||e.value.originalRecordSha256!==recordSha256||e.value.consumedByRunId!==null||hash(e.value.job)!==hash(jobBinding(job))||hash(e.value.outputGuard)!==hash(guard))fail("ame_not_sent_settlement_changed_or_consumed");value=e.value;
    }else{value={schema:"ae-agent-ame-not-sent.v1",originalRunId:r.runId,originalRecordSha256:recordSha256,job:jobBinding(job),outputGuard:guard,reason:guardRefused?"native_pre_send_guard_refused_not_sent":"required_command_capture_absent",...(guardRefused?{refusedCommandId:c.id}:{}),consumedByRunId:null,settledAt:new Date(now()).toISOString(),replayAllowed:false};write(file,{schema:"ae-agent-ame-not-sent-envelope.v1",sha256:hash(value),value},true);}
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
      if(a.operation==="sources")return sourceReads.normalizeTransport(reply,a,now());
      const originalSender=reply.originalSender||null,transportDiagnostic=reply.transportDiagnostic||null;
      const refused=reply.senderRefusal;
      if(reply.code==="previous_request_unresolved"&&refused?.schema==="ae-agent-ame-title-sender-refusal.v1"&&refused.constructorInvoked===false&&refused.sendInvoked===false&&refused.requestNonce===a.requestNonce&&refused.operationBinding===a.operationBinding&&refused.jobId===a.jobId&&refused.batchId===a.batchId&&UUID.test(refused.oldRequestNonce||""))return {resolved:false,code:"ame_title_not_sent",native:null,senderRefusal:refused,transportDiagnostic,dispatchDiagnostic:{stage:"native_sender_guard",dispatchInvoked:true,bridgeTalkSendInvoked:false,originalCode:reply.code,error:refused.reason}};
      const terminalObservation=a.observeOwnJob===true&&["result","error"].includes(reply.callback)&&typeof reply.responseBody==="string"&&Buffer.byteLength(reply.responseBody,"utf8")<=524288?{requestNonce:a.requestNonce,callback:reply.callback,code:reply.code,responseBody:reply.responseBody,bodySha25664:crypto.createHash("sha256").update(reply.responseBody,"utf8").digest("hex")}:null;
      if (reply.callback === "error") return { resolved: true, code: "native_delivery_error", native: null,terminalObservation,originalSender,transportDiagnostic };
      if (reply.code !== "result" || typeof reply.responseBody !== "string" || Buffer.byteLength(reply.responseBody, "utf8") > 524288) return { resolved: false, code: reply.code || "transport_unknown", native: null,terminalObservation,originalSender,transportDiagnostic };
      let native; try { native = JSON.parse(reply.responseBody); } catch (_) { return { resolved: true, code: "native_response_invalid", native: null,terminalObservation,originalSender,transportDiagnostic }; }
      if (!native || native.schema !== NATIVE_SCHEMA || native.requestNonce !== (a.reconcileRequestNonce || a.requestNonce) || native.operationBinding !== a.operationBinding || native.appSpecifier !== a.targetSpecifier || a.expectedSessionNonce && native.sessionNonce !== a.expectedSessionNonce || !Number.isFinite(native.observedAt) || native.observedAt <= 0 || native.observedAt < a.minimumObservedAt || native.observedAt > now() + 60000) return { resolved: false, code: "native_correlation_unknown", native: null,terminalObservation,originalSender,transportDiagnostic };
      return { resolved: true, code: native.code, native,terminalObservation,originalSender,transportDiagnostic };
    } catch (error) { const diagnostic={stage,dispatchInvoked,originalCode:error.code||null,error:String(error.message||error).slice(0,2000)};return { resolved:false,code:dispatchInvoked?"ae_delivery_unknown":"ame_title_not_sent",error:diagnostic.error,dispatchDiagnostic:diagnostic,native:null }; }
  }
  function associated(job, native) {
    const n = native && native.job,d=n?.dispatchDiagnostic,ack=d?.workAreaCallAck;
    const queuedAck=!!(n&&job.args.queueMode===sharedQueue.MODE&&n.outputBindingEvidence==="exact_addDL_call_argument_ack"&&n.independentOutputGetterVerified===false&&n.generatedOutputVerified===false&&Array.isArray(n.outputFiles)&&n.outputFiles.length===0&&n.status==="queued"&&native.batchRunning===false&&n.nativeCompletionObserved===false&&n.nativeResult===null&&n.hostCompletion===null&&n.wrapperCompletion===null&&n.getEncodeProgress===0&&n.getEncodeTime===0&&Array.isArray(n.readErrors)&&n.readErrors.length===0&&d?.addDLInvoked===true&&d.addDLReturned===true&&d.phase==="association_readback"&&d.error===null&&Array.isArray(d.creationFailures)&&d.creationFailures.length===0&&ack?.type===3&&ack.startSeconds===job.args.range.startSeconds&&ack.endSeconds===job.args.range.endSeconds&&ack.result===true);
    return !!(n && n.nativeJobId === null && n.handleKey === job.jobId && n.enqueueRequestNonce === job.requestNonce && UUID.test(n.retainedWrapperSessionNonce || "") && (!job.retainedWrapperSessionNonce || n.retainedWrapperSessionNonce === job.retainedWrapperSessionNonce) && n.nativeAssociationVerified === true && n.sourceGuid === job.args.sourceGuid && samePath(n.sourcePath, job.sourcePath) && samePath(n.outputPath, job.outputPath) && n.presetIdentity === job.presetIdentity && n.processBinding === job.processBinding && hash(n.range) === hash(job.args.range) && (queuedAck || Array.isArray(n.outputFiles) && n.outputFiles.length === 1 && samePath(n.outputFiles[0], job.outputPath)) &&
      (job.args.queueMode !== sharedQueue.MODE || n.workAreaApplied === true && Array.isArray(n.readErrors) && n.readErrors.length === 0 && (!Object.hasOwn(job, "nativeSessionNonce") || native.sessionNonce === job.nativeSessionNonce)) &&
      (!n.nativeCompletionObserved || Number.isFinite(n.eventObservedAt) && n.eventObservedAt >= Date.parse(job.submittedAt) && n.eventObservedAt <= native.observedAt));
  }
  function retainIndependentSenderProof(a, batch, job, observed) {
    const n=observed.native,j=n?.job,t=observed.terminalObservation,o=observed.originalSender;
    if(!observed.resolved||observed.code!=="job_observed"||!t||t.callback!=="result"||!o||o.callback!=="timeout"||o.requestNonce!==job.requestNonce||o.operationBinding!==job.operationBinding||n.batchRunning!==false||n.requestNonce===job.requestNonce||n.operationBinding!==hash({operation:"status",jobId:job.jobId})||n.appSpecifier!==a.targetSpecifier||n.observedAt>now()||now()-n.observedAt>INDEPENDENT_SENDER_MAX_AGE_MS||!j||j.handleKey!==job.jobId||j.enqueueRequestNonce!==job.requestNonce||j.processBinding!==batch.processBinding||j.sourceGuid!==job.args.sourceGuid||j.presetIdentity!==job.presetIdentity||hash(j.range)!==hash(job.args.range)||!UUID.test(j.retainedWrapperSessionNonce||"")||job.retainedWrapperSessionNonce&&j.retainedWrapperSessionNonce!==job.retainedWrapperSessionNonce||Object.hasOwn(job,"nativeSessionNonce")&&n.sessionNonce!==job.nativeSessionNonce||a.expectedSessionNonce&&n.sessionNonce!==a.expectedSessionNonce)return;
    independentSenderProof={observationNonce:t.requestNonce,observationBinding:n.operationBinding,responseBody:t.responseBody,jobId:job.jobId,batchId:batch.batchId,enqueueNonce:job.requestNonce,enqueueBinding:job.operationBinding,outputPath:job.outputPath,processBinding:batch.processBinding,targetSpecifier:a.targetSpecifier,observedAt:n.observedAt,sessionNonce:n.sessionNonce,retainedWrapperSessionNonce:j.retainedWrapperSessionNonce};
  }
  function consumeIndependentSenderProof(a, job) {
    const proof=independentSenderProof;if(!proof||now()<proof.observedAt||now()-proof.observedAt>INDEPENDENT_SENDER_MAX_AGE_MS||proof.processBinding!==job.processBinding||proof.targetSpecifier!==a.targetSpecifier||proof.batchId===a.batchId||proof.jobId===job.jobId||proof.enqueueNonce===job.requestNonce||samePath(proof.outputPath,job.outputPath))return null;
    independentSenderProof=null;
    return {...proof,newJobId:job.jobId,newBatchId:a.batchId,newRequestNonce:job.requestNonce,newOperationBinding:job.operationBinding,newOutputPath:job.outputPath};
  }
  function updateJob(job, observation) {
    job.transportResolved = observation.resolved; if (observation.native) job.nativeObservation = observation.native;
    job.nativeAssociationVerified = associated(job, observation.native); job.readyForStart = job.nativeAssociationVerified && observation.native.job.status === "queued" && (observation.code === "job_enqueued" || observation.code === "job_observed" && job.readyForStart);
    job.state = job.nativeAssociationVerified ? observation.native.job.status : "unknown_outcome";
    if (job.nativeAssociationVerified) { job.retainedWrapperSessionNonce = observation.native.job.retainedWrapperSessionNonce; job.nativeSessionNonce = observation.native.sessionNonce; }
  }
  function ownReceipt(job, native) {
    return { schema: "ae-agent-ame-own-item-acceptance.v2", jobId: job.jobId, batchId: job.args.batchId,
      enqueueRequestNonce: job.requestNonce, enqueueOperationBinding: job.operationBinding,
      readRequestNonce: native.requestNonce, observedAt: native.observedAt,
      retainedWrapperSessionNonce: native.job.retainedWrapperSessionNonce, nativeSessionNonce: native.sessionNonce,
      jobBindingSha25664: hash(jobBinding(job)), nativeObservationSha25664: hash(native), authorizedRunId: job.latestAuthorizedRunId || null,
      sourcePath: job.sourcePath, sourceGuid: job.args.sourceGuid, sourceSha25664: job.sourcePin.sha256,
      presetIdentity: job.presetIdentity, presetSha25664: job.presetPin.sha256, processBinding: job.processBinding,
      range: { ...job.args.range }, outputPath: job.outputPath, workAreaApplied: true, proofSource: "retained_encoder_wrapper",
      appliedPresetVerified: false, outputBindingEvidence: native.job.outputBindingEvidence || "generated_output_files",
      independentOutputGetterVerified: native.job.independentOutputGetterVerified === true,
      generatedOutputVerified: native.job.generatedOutputVerified === true, rangeProof: "setWorkArea_call_ack", mediaVerified: false };
  }
  function savedAcceptance(job) {
    const receipt = job.acceptanceReceipt, proof = job.acceptanceEvidence;
    if (!receipt && !proof) return "missing";
    // Historical v1 records lack an immutable initial observation. Preserve
    // their bytes; viewing/restarting must not manufacture a new acceptance.
    if (receipt?.schema === "ae-agent-ame-own-item-acceptance.v1" && !proof) return "legacy_unverified";
    const native = proof?.native;
    if (receipt?.schema !== "ae-agent-ame-own-item-acceptance.v2" || proof?.schema !== "ae-agent-ame-own-item-evidence.v1" ||
        proof.receiptSha25664 !== hash(receipt) || !Number.isFinite(Date.parse(proof.acceptedAt)) ||
        native?.schema !== NATIVE_SCHEMA || native.code !== "job_observed" || native.operationBinding !== hash({ operation: "status", jobId: job.jobId }) ||
        !UUID.test(native.requestNonce || "") || native.requestNonce === job.requestNonce || native.appSpecifier !== job.args.targetSpecifier ||
        job.args.expectedSessionNonce && native.sessionNonce !== job.args.expectedSessionNonce ||
        !Number.isFinite(native.observedAt) || native.observedAt < Date.parse(job.submittedAt) || native.observedAt > Date.parse(proof.acceptedAt) + 60000 ||
        native.nativeAssociationVerified !== true || native.nativeJobId !== null || native.batchRunning !== false || native.start !== null ||
        native.job?.status !== "queued" || native.job.nativeCompletionObserved !== false || native.job.nativeResult !== null ||
        !associated(job, native) || hash(receipt) !== hash(ownReceipt(job, native))) fail("ame_title_acceptance_corrupt");
    return "accepted";
  }
  function acceptOwnRead(job, observation) {
    // Initial acceptance is historical proof, separate from mutable current
    // observations. Never replace it after refresh, failure, or reconciliation.
    if (job.acceptanceReceipt || job.acceptanceEvidence) return;
    if (job.args.queueMode === sharedQueue.MODE && job.nativeAssociationVerified && observation.resolved && observation.code === "job_observed" && observation.native.requestNonce !== job.requestNonce && observation.native.job.status === "queued" && observation.native.batchRunning === false) {
      job.readyForStart = true;
      job.acceptanceReceipt = ownReceipt(job, observation.native);
      job.acceptanceEvidence = { schema: "ae-agent-ame-own-item-evidence.v1", acceptedAt: new Date(now()).toISOString(),
        receiptSha25664: hash(job.acceptanceReceipt), native: JSON.parse(JSON.stringify(observation.native)) };
      savedAcceptance(job);
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
  const sourceReader=sourceReads.createReader({processPin,binding,send:a=>send(a),result});
  async function inspectSources(a){return sourceReader.inspect(a);}
  async function enqueue(a, cap) {
    const entry = assertCap(cap, ENQUEUE, a), processInfo = await processPin(a), processBinding = binding(a, processInfo), source = stableFile(a.sourceProjectFile, a.expectedSourceSha25664);
    const preset = presets.selectPreset(await catalog(), { presetId: a.presetId, sha256: a.presetSha25664 }), presetPin = stableFile(preset.canonicalPath, a.presetSha25664), presetIdentity = hash({ path: presetPin.path, sha256: presetPin.sha256 });
    let batch = load(a.batchId);const reuse=batch?.jobs.find(job=>job.notSentSettlement&&hash(validateInput(ENQUEUE,job.args))===hash(a)),limit=a.queueMode===sharedQueue.MODE?2:64;
    if (batch && (batch.presetIdentity !== presetIdentity || batch.processBinding !== processBinding || batch.start || batch.jobs.length>limit || batch.jobs.length===limit&&!reuse || batch.jobs.some(job => job.args.queueMode !== a.queueMode))) return result("batch_identity_or_preset_changed");
    const settlement=reuse?readSettlement(reuse):null;if(reuse&&!settlement)fail("ame_not_sent_settlement_required");
    if (batch && batch.jobs.some(job => job!==reuse && !(a.queueMode === sharedQueue.MODE && savedAcceptance(job) === "accepted") && (!job.transportResolved || !job.nativeAssociationVerified || job.state === "unknown_outcome"))) return result("ame_title_unknown_job_no_replay");
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
    const savedExistingSourceGuard=prepared && typeof prepared.port.getSavedSourceGuard==="function"?prepared.port.getSavedSourceGuard(prepared.preparation,entry.context):null;
    if(savedExistingSourceGuard && savedNativeSourceVerified)fail("ame_title_source_admission_mode_changed");
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
    const retirement=consumeIndependentSenderProof(a,job);
    if(retirement){job.independentTransportRetirement={oldBatchId:retirement.batchId,oldJobId:retirement.jobId,oldEnqueueNonce:retirement.enqueueNonce,observationNonce:retirement.observationNonce,observedAt:retirement.observedAt,responseSha25664:crypto.createHash("sha256").update(retirement.responseBody,"utf8").digest("hex"),consumedByRunId:entry.context.runId,newRequestNonce:job.requestNonce};write(recordFile(a.batchId),batch);}
    const observed = await send({ ...a, ...(retirement?{independentSenderRetirement:retirement}:{}), operation: "enqueue", ...(savedNativeSourceVerified?{savedNativeSourceVerified:true}:{}), ...(savedExistingSourceGuard?{savedExistingSourceGuard}:{}), sourcePath: job.sourcePath, presetPath: job.presetPath, presetIdentity, processBinding, operationBinding: job.operationBinding, outputPath, jobId: job.jobId, newWrapperSessionNonce: crypto.randomUUID(), requestNonce: job.requestNonce, minimumObservedAt: Date.parse(job.submittedAt) }, entry.context, () => {
      pinned(job); readyOutput(job);
      assertIngress(entry.context, ENQUEUE, a);
    }, () => processPin(a, processInfo));
    if(observed.senderRefusal)job.lastNativeSenderRefusal=observed.senderRefusal;
    if(observed.dispatchDiagnostic){job.lastDispatchDiagnostic={runId:entry.context.runId,...observed.dispatchDiagnostic};write(recordFile(a.batchId),batch);}
    try { assertIngress(entry.context, ENQUEUE, a); await processPin(a, processInfo); pinned(job); }
    catch (error) { return result(error.code || "post_submit_context_changed", { batchId: a.batchId, jobId: job.jobId, requestNonce: job.requestNonce, unknownOutcome: true, nativeMutationMayHaveOccurred: observed.senderRefusal?false:observed.dispatchDiagnostic?.dispatchInvoked!==false,native:observed.native||null,dispatchDiagnostic:observed.dispatchDiagnostic||null }); }
    updateJob(job, observed); write(recordFile(a.batchId), batch);
    if(a.enqueueTransport===pendingEnqueue.MODE&&(observed.code==="async_pending"&&observed.transportDiagnostic?.sendAck===true||observed.code==="job_enqueued"&&job.nativeAssociationVerified))return result("enqueue_pending",{pending:true,dispatchAccepted:true,ownItemAccepted:false,nativeAssociationVerified:false,batchId:a.batchId,jobId:job.jobId,handleKey:job.jobId,requestNonce:job.requestNonce,state:"awaiting_native_acceptance",unknownOutcome:true,outputPath,pendingReceipt:pendingEnqueue.receipt(job,entry.context.runId,a),statusArgs:{targetSpecifier:a.targetSpecifier,expectedProcess:a.expectedProcess,...(Object.hasOwn(a,"expectedSessionNonce")?{expectedSessionNonce:a.expectedSessionNonce}:{}),batchId:a.batchId,jobId:job.jobId,readTransport:pendingEnqueue.MODE},native:null,transportDiagnostic:observed.transportDiagnostic});
    if (a.queueMode === sharedQueue.MODE && job.nativeAssociationVerified && observed.code === "job_enqueued") {
      const fresh = await send({ ...a, operation: "status", jobId: job.jobId, processBinding, operationBinding: hash({ operation: "status", jobId: job.jobId }), requestNonce: crypto.randomUUID(), minimumObservedAt: now() }, entry.context);
      try { await processPin(a, processInfo); pinned(job); assertIngress(entry.context, ENQUEUE, a); } catch (error) { return result(error.code || "post_enqueue_readback_changed", { batchId: a.batchId, jobId: job.jobId, requestNonce: job.requestNonce, unknownOutcome: true, mutationMayHaveOccurred: true }); }
      updateJob(job, fresh);
      acceptOwnRead(job, fresh); if (!job.acceptanceReceipt) job.readyForStart = false;
      write(recordFile(a.batchId), batch);
      return result(fresh.code, { ok: !!job.acceptanceReceipt, batchId: a.batchId, jobId: job.jobId, handleKey: job.handleKey, requestNonce: job.requestNonce, nativeAssociationVerified: job.nativeAssociationVerified, ownItemAccepted: !!job.acceptanceReceipt, acceptanceReceipt: job.acceptanceReceipt || null, state: job.state, unknownOutcome: !job.acceptanceReceipt, outputPath, presetEncodingMode: "exact_epr_automatic_format", native: fresh.native });
    }
    return result(observed.code, { ok: job.nativeAssociationVerified && observed.code === "job_enqueued", batchId: a.batchId, jobId: job.jobId, handleKey: job.handleKey, nativeAssociationVerified: job.nativeAssociationVerified, requestNonce: job.requestNonce, state: job.state, unknownOutcome: !job.nativeAssociationVerified, outputPath, presetEncodingMode: "exact_epr_automatic_format", native: observed.native,dispatchDiagnostic:observed.dispatchDiagnostic||null,senderRefusal:observed.senderRefusal||null });
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
    if (a.acceptanceOnly) {
      const batch = load(a.batchId, a.jobId), job = batch?.jobs.find(j => j.jobId === a.jobId);
      const local = { observationSource: "saved_acceptance", currentStatusObserved: false, executionAuthority: false,
        batchId: a.batchId, jobId: a.jobId, ownItemAccepted: false, acceptanceReceipt: null };
      if (!job || batch.processBinding !== binding(a, job.process) || a.targetSpecifier !== job.args.targetSpecifier ||
          a.expectedProcess.pid !== job.process.pid || Date.parse(a.expectedProcess.startedAt) !== Date.parse(job.process.startedAt)) return result("job_not_bound", local);
      const acceptanceState = savedAcceptance(job), accepted = acceptanceState === "accepted";
      return result(accepted ? "saved_acceptance_restored" : "saved_acceptance_" + acceptanceState, { ...local, ok: accepted,
        handleKey: job.handleKey, ownItemAccepted: accepted, acceptanceState, acceptanceReceipt: accepted ? job.acceptanceReceipt : null });
    }
    const processInfo = await processPin(a), batch = load(a.batchId, a.jobId), job = batch && batch.jobs.find(j => j.jobId === a.jobId);
    if (!job || batch.processBinding !== binding(a, processInfo)) return result("job_not_bound"); pinned(job);
    if(a.originalRunId)return settleNotSent(a,batch,job);
    const asyncStatus=a.readTransport===pendingEnqueue.MODE||job.args.enqueueTransport===pendingEnqueue.MODE;
    if(asyncStatus&&job.args.queueMode!==sharedQueue.MODE)fail("ame_title_async_shared_only");
    if(asyncStatus&&batch.start&&!batch.start.transportResolved)return result("ame_title_async_start_reconcile_unsupported",{batchId:a.batchId,jobId:a.jobId,currentStatusObserved:false});
    if(a.afterReadTimeoutNonce&&(batch.start||startReservation(batch)||job.ownStatusObservation?.requestNonce!==a.afterReadTimeoutNonce))return result("ame_title_read_timeout_not_pending",{batchId:a.batchId,jobId:a.jobId,currentStatusObserved:false,nextReadAllowed:false});
    // Reserve one history entry for the separate read's terminal observation.
    if(a.afterReadTimeoutNonce&&(job.ownStatusObservationHistory?.length||0)>=63)return result("ame_title_read_history_bound",{batchId:a.batchId,jobId:a.jobId,currentStatusObserved:false,nextReadAllowed:false});
    const pendingStart = batch.start && !batch.start.transportResolved, nonce = pendingStart ? batch.start.requestNonce : !job.transportResolved ? job.requestNonce : null;
    const ownObservation=!pendingStart&&(asyncStatus||!job.nativeAssociationVerified);
    const operationBinding = pendingStart ? batch.start.operationBinding : ownObservation ? hash({ operation: "status", jobId: job.jobId }) : nonce ? job.operationBinding : hash({ operation: "status", jobId: job.jobId });
    let observationReconcile=false;
    if(ownObservation){
      if(a.readRequestNonce&&job.ownStatusObservation?.requestNonce!==a.readRequestNonce)return result("ame_title_read_not_pending",{batchId:a.batchId,jobId:a.jobId,requestNonce:a.readRequestNonce,currentStatusObserved:false});
      if(job.ownStatusObservationHistory&&!Array.isArray(job.ownStatusObservationHistory))fail("ame_title_own_observation_changed");
      if((job.ownStatusObservationHistory?.length||0)>=64)return result("ame_title_read_history_bound",{batchId:a.batchId,jobId:a.jobId,currentStatusObserved:false,nextReadAllowed:false});
      observationReconcile=!!job.ownStatusObservation;
      if(!job.ownStatusObservation){job.ownStatusObservation={requestNonce:crypto.randomUUID(),operationBinding,enqueueRequestNonce:job.requestNonce,reservedAt:new Date(now()).toISOString()};write(recordFile(a.batchId),batch);}
      const own=job.ownStatusObservation;if(!UUID.test(own.requestNonce||"")||own.operationBinding!==operationBinding||own.enqueueRequestNonce!==job.requestNonce||!Number.isFinite(Date.parse(own.reservedAt)))fail("ame_title_own_observation_changed");
    }
    const pendingRead=ownObservation&&job.ownStatusObservation,readDeadline=pendingRead?Date.parse(pendingRead.reservedAt)+120000:Infinity;
    const rollover=!asyncStatus&&pendingRead&&observationReconcile&&now()>=readDeadline&&!(job.ownStatusObservationHistory||[]).some(r=>r.transportUnknown?.reason==="read_transport_budget_exhausted_unknown")?{requestNonce:pendingRead.requestNonce,operationBinding:pendingRead.operationBinding,jobId:job.jobId,batchId:batch.batchId,enqueueNonce:job.requestNonce,enqueueBinding:job.operationBinding,targetSpecifier:a.targetSpecifier,processBinding:batch.processBinding,deadline:readDeadline}:null;
    const {afterReadTimeoutNonce:timeoutControl,...statusArgs}=a;
    const observed = await send({ ...statusArgs, ...(asyncStatus&&!pendingStart?{asyncOwnStatus:true}:{}), ...(rollover?{readonlyObservationRollover:rollover}:{}), operation: "status", jobId: job.jobId,expectedOwnSourcePath:job.sourcePath,expectedOwnOutputPath:job.outputPath,processBinding: batch.processBinding, operationBinding, requestNonce: ownObservation?job.ownStatusObservation.requestNonce:crypto.randomUUID(), minimumObservedAt: ownObservation?Date.parse(job.ownStatusObservation.reservedAt):pendingStart ? Date.parse(batch.start.reservedAt) : nonce ? Date.parse(job.submittedAt) : now(), completionScope: completionScope(batch, job), ...(ownObservation?{observeOwnJob:true,observationReconcile,observationEnqueueRequestNonce:job.requestNonce,observationEnqueueOperationBinding:job.operationBinding}:nonce ? { reconcileRequestNonce: nonce } : {}) });
    await processPin(a, processInfo); pinned(job);
    if(timeoutControl){
      const original=observed.originalSender;let n=null;
      if(original?.callback==="result"&&original.requestNonce===job.requestNonce&&original.operationBinding===job.operationBinding&&typeof original.responseBody==="string"&&Buffer.byteLength(original.responseBody,"utf8")<=524288){try{n=JSON.parse(original.responseBody);}catch(_){}}
      const proven=ownObservation&&observationReconcile&&pendingRead.requestNonce===timeoutControl&&!observed.resolved&&observed.code==="timeout"&&observed.native===null&&observed.transportDiagnostic?.callback==="timeout"&&
        n?.schema===NATIVE_SCHEMA&&n.code==="job_enqueued"&&n.requestNonce===job.requestNonce&&n.operationBinding===job.operationBinding&&n.appSpecifier===a.targetSpecifier&&(!a.expectedSessionNonce||n.sessionNonce===a.expectedSessionNonce)&&n.nativeAssociationVerified===true&&n.batchRunning===false&&n.job?.status==="queued"&&n.job.nativeCompletionObserved===false&&n.job.nativeResult===null&&Number.isFinite(n.observedAt)&&n.observedAt>=Date.parse(job.submittedAt)&&n.observedAt<=now()+60000&&associated(job,n);
      if(!proven)return result("ame_title_read_timeout_proof_denied",{batchId:a.batchId,jobId:a.jobId,requestNonce:pendingRead.requestNonce,currentStatusObserved:false,nextReadAllowed:false,originalSender:original||null,transportDiagnostic:observed.transportDiagnostic||null});
      const archivedAt=new Date(now()).toISOString(),originalResultSha25664=crypto.createHash("sha256").update(original.responseBody,"utf8").digest("hex");
      // Refresh the whole file after awaits: another authorized enqueue may
      // have appended a different job. Never commit our stale batch snapshot.
      const currentBatch=load(a.batchId,a.jobId),currentJob=currentBatch?.jobs.find(j=>j.jobId===a.jobId);
      if(!currentJob||currentBatch.start||startReservation(currentBatch)||currentBatch.processBinding!==batch.processBinding||currentBatch.presetIdentity!==batch.presetIdentity||hash(jobBinding(currentJob))!==hash(jobBinding(job))||currentJob.latestAuthorizedRunId!==job.latestAuthorizedRunId||hash(currentJob.ownStatusObservation||null)!==hash(pendingRead)||hash(currentJob.ownStatusObservationHistory||[])!==hash(job.ownStatusObservationHistory||[]))return result("ame_title_read_timeout_origin_changed",{batchId:a.batchId,jobId:a.jobId,currentStatusObserved:false,nextReadAllowed:false});
      currentJob.ownStatusObservationHistory=(currentJob.ownStatusObservationHistory||[]).concat({...pendingRead,transportUnknown:{reason:"read_callback_timeout_unknown",observedAt:archivedAt,diagnostic:observed.transportDiagnostic,originalEnqueueResultSha25664:originalResultSha25664},archivedAt});
      currentJob.ownStatusObservation=null;write(recordFile(a.batchId),currentBatch);
      return result("own_status_read_retired_unknown",{batchId:a.batchId,jobId:a.jobId,requestNonce:timeoutControl,currentStatusObserved:false,executionAuthority:false,readPending:false,nextReadAllowed:true,nextReadCapacityVerified:false,nextReadArgs:statusArgs,transportUnknown:true,originalEnqueueResultSha25664:originalResultSha25664,transportDiagnostic:observed.transportDiagnostic});
    }
    if(asyncStatus&&!pendingStart&&!observed.resolved&&["async_pending","timeout","send_unknown","ae_delivery_unknown"].includes(observed.code)){const accepted=savedAcceptance(job)==="accepted";return result("own_status_pending",{pending:true,readPending:true,batchId:a.batchId,jobId:a.jobId,requestNonce:pendingRead.requestNonce,currentStatusObserved:false,ownItemAccepted:accepted,acceptanceReceipt:accepted?job.acceptanceReceipt:null,native:null,originalSender:observed.originalSender||null,transportDiagnostic:observed.transportDiagnostic||null,reconcileArgs:{...a,readTransport:pendingEnqueue.MODE,readRequestNonce:pendingRead.requestNonce}});}
    let observationDiagnostic=null;
    if(ownObservation)retainIndependentSenderProof(a,batch,job,observed);
    if(ownObservation&&observed.code==="own_observation_retired_unknown"){
      job.ownStatusObservationHistory=(job.ownStatusObservationHistory||[]).concat({...job.ownStatusObservation,transportUnknown:{reason:"read_transport_budget_exhausted_unknown",observedAt:new Date(now()).toISOString(),diagnostic:observed.transportDiagnostic},archivedAt:new Date(now()).toISOString()});job.ownStatusObservation=null;
      observationDiagnostic={nextReadAllowed:true,transportUnknown:true,reason:"read_transport_budget_exhausted_unknown"};
    }
    if(ownObservation&&observed.terminalObservation){
      const terminal=observed.terminalObservation;
      job.ownStatusObservationHistory=(job.ownStatusObservationHistory||[]).concat({...job.ownStatusObservation,terminal,resultCode:observed.code,archivedAt:new Date(now()).toISOString()});
      job.ownStatusObservation=null;if(!observed.native)observed.resolved=false;
      observationDiagnostic={requestNonce:terminal.requestNonce,callback:terminal.callback,resultCode:observed.code,bodySha25664:terminal.bodySha25664,nextReadAllowed:true};
    }
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
    const acceptanceState = savedAcceptance(job), ownItemAccepted = acceptanceState === "accepted";
    return result(observed.code, { ok: verified, batchId: a.batchId, jobId: job.jobId, handleKey: job.handleKey, ownItemAccepted, acceptanceState, acceptanceReceipt: ownItemAccepted ? job.acceptanceReceipt : null, currentStatusObserved: !!native, nativeAssociationVerified: verified, nativeCompletionObserved: !!(verified && nativeJob.nativeCompletionObserved), nativeResult: exactCompletion ? completion.result : verified ? nativeJob.nativeResult : null, completionVerified: complete,
      state: complete ? job.args.queueMode === sharedQueue.MODE ? "native_finished" : "needs_media_probe" : failed ? "failed" : verified && nativeJob.nativeCompletionObserved ? "needs_result_interpretation" : passiveResult.state, queueOnly: job.args.queueMode === sharedQueue.MODE, startAcceptanceVerified, passive: passiveResult, file, native, process: processInfo, startReservation: startReservation(batch), requestNonce: nonce || native && native.requestNonce,observationDiagnostic,originalSender:observed.originalSender||null,transportDiagnostic:observed.transportDiagnostic||null });
  }
  async function execute(name, raw, cap) {
    const a = validateInput(name, raw), mutation = name === ENQUEUE || name === START; if (mutation) { assertCap(cap, name, a); if (busy) fail("ame_title_writer_busy"); busy = true; }
    // STATUS persists a whole batch file, so two jobs share this read lock.
    const statusKey=name===STATUS?a.batchId:null;
    if(statusKey&&statusReads.has(statusKey))return result("ame_title_status_read_busy",{batchId:a.batchId,jobId:a.jobId,currentStatusObserved:false,nextReadAllowed:false});
    if(statusKey)statusReads.add(statusKey);
    try { return await (name === INSPECT ? inspectSources(a) : name === QUEUE_MANIFEST ? queueManifest(a) : name === ENQUEUE ? enqueue(a, cap) : name === START ? start(a, cap) : status(a)); }
    catch (error) {
      let durable = null;
      if (name === START) { try { durable = (a.queueMode === sharedQueue.MODE ? deps.sharedQueueGrant : deps.manualQueueGrant)?.readReservation(a.batchId); } catch (_) {} }
      let initial = {};
      if (name === STATUS) {
        initial = { ownItemAccepted: false, acceptanceReceipt: null, currentStatusObserved: false, executionAuthority: false };
        try {
          const job = load(a.batchId, a.jobId)?.jobs.find(j => j.jobId === a.jobId);
          if (job && binding(a, job.process) === job.processBinding && a.expectedProcess.pid === job.process.pid && Date.parse(a.expectedProcess.startedAt) === Date.parse(job.process.startedAt) && savedAcceptance(job) === "accepted") initial = { ...initial, ownItemAccepted: true, acceptanceReceipt: job.acceptanceReceipt };
        } catch (_) { /* Corrupt/missing local proof is never an acceptance. */ }
      }
      return result(error.code || "ame_title_read_error", { error: String(error.message || error).slice(0, 2000), ...initial, ...(durable ? { unknownOutcome: true, batchId: a.batchId, requestNonce: durable.requestNonce, startReservation: durable } : {}) });
    }
    finally { if (mutation) busy = false; if(statusKey)statusReads.delete(statusKey); }
  }
  return { authorize, assertAuthorization: (cap, name, raw) => { assertCap(cap, name, validateInput(name, raw)); return true; }, execute };
}

const common = { targetSpecifier: { type: "string", pattern: "^ame-[0-9]{1,3}\\.[0-9]{1,3}$" }, expectedProcess: { type: "object", additionalProperties: false, required: ["pid", "startedAt"], properties: { pid: { type: "integer", minimum: 1 }, startedAt: { type: "string" } } }, expectedSessionNonce: { type: ["string", "null"] }, timeoutMs: { type: "integer", minimum: 1000, maximum: 10000 } };
const source = { sourceProjectFile: { type: "string" }, expectedSourceSha25664: { type: "string", pattern: SHA.source } }, batchId = { type: "string", pattern: UUID.source };
const queueFields = { manualQueueMode: { type: "string", enum: ["cep_user_declaration_v2"] }, completedOwnedPrefix: { type: "array", maxItems: 63, items: { type: "object", additionalProperties: false, required: ["batchId", "jobId"], properties: { batchId, jobId: { type: "string", pattern: UUID.source } } } } };
const queueMode = { type: "string", enum: [sharedQueue.MODE] };
const definitions = [
  [INSPECT, "Asynchronous read of root DL GUIDs from one pinned saved AEP. Returns pending + exact reconcileArgs immediately; same binding never resends, new SHA has its own read. sourceReadBudgetMs defaults to 300000; timeoutMs does not block AE. Exact reconcile reads retained callbacks without send/pump, including historical results after source changes (never current GUID proof). No submit, launch or START.", { ...source, reconcileRequestNonce: { type: "string", pattern: UUID.source },sourceReadBudgetMs:{type:"integer",minimum:sourceReads.MIN_BUDGET_MS,maximum:sourceReads.MAX_BUDGET_MS,default:sourceReads.MIN_BUDGET_MS} }, ["sourceProjectFile", "expectedSourceSha25664"]],
  [ENQUEUE, "Gated fixed addDLToBatch with one exact GUID, exact catalog EPR and reserved output. Shared mode requires private server authority and immediate own wrapper read-back. Our jobId/handleKey is not a native ID. Unknown submission cannot replay.", { ...source, batchId, queueMode, sourceGuid: { type: "string" }, presetId: { type: "string", pattern: "^amep_[a-f0-9]{40}$" }, presetSha25664: { type: "string", pattern: SHA.source }, outputFileName: { type: "string" }, range: { type: "object", description: "Явные секунды. По умолчанию брать свежую отмеченную рабочую область того же pinned source/comp из get_comp_details: startSeconds=workAreaStart, endSeconds=workAreaStart+workAreaDuration. Явный диапазон пользователя имеет приоритет; 0..comp.duration только по прямому запросу всей композиции. Если workArea невалидна или отсутствует, запросить недостающие данные, не подставлять full comp. Адаптер переданный range не меняет.", additionalProperties: false, required: ["startSeconds", "endSeconds"], properties: { startSeconds: { type: "number", minimum: 0 }, endSeconds: { type: "number" } } } }, ["sourceProjectFile", "expectedSourceSha25664", "batchId", "sourceGuid", "presetId", "presetSha25664", "outputFileName", "range"]],
  [QUEUE_MANIFEST, "Fresh owned wrapper manifest for exactly one ready job and explicit completed owned prefix. No proof of full AME queue, no enqueue/start. Requires trusted native read dispatch port.", { batchId, ...queueFields }, ["batchId", "manualQueueMode", "completedOwnedPrefix"]],
  [START, "Global AME runBatch. Shared mode starts the mixed queue after fresh checks of two accepted own items, private server capability and durable once marker. Legacy CEP declaration remains supported. No full queue or media proof.", { batchId, queueMode, ...queueFields, manualQueueManifestSha25664: { type: "string", pattern: SHA.source } }, ["batchId"]],
  [STATUS, "Explicit fixed read of one retained native EncoderWrapper. acceptanceOnly:true restores only immutable saved initial acceptance locally, without OS/native/queue reads or execution authority; it cannot serve as current read-back. originalRunId settles server-proven never-sent enqueue without native send; requires a new proposal for its first delivery. These two modes are exclusive.", { batchId, jobId: { type: "string", pattern: UUID.source },originalRunId:{type:"string",pattern:UUID.source}, acceptanceOnly: { type: "boolean", enum: [true] } }, ["batchId", "jobId"]]
];
const tools = definitions.map(([name, description, fields, required]) => ({ name, description, inputSchema: { type: "object", additionalProperties: false, properties: { ...common, ...fields }, required: ["targetSpecifier", "expectedProcess", ...required] }, annotations: { readOnlyHint: [INSPECT, STATUS, QUEUE_MANIFEST].includes(name), destructiveHint: false, idempotentHint: false, openWorldHint: false } }));
tools.find(t=>t.name===ENQUEUE).inputSchema.properties.enqueueTransport={type:"string",enum:[pendingEnqueue.MODE]};
tools.find(t=>t.name===ENQUEUE).description+=" Opt-in enqueueTransport:async_once_v1 in shared mode sends once without blocking; returns pending, never acceptance. Poll exact own STATUS separately; no implicit START.";
Object.assign(tools.find(t=>t.name===STATUS).inputSchema.properties,{readTransport:{type:"string",enum:[pendingEnqueue.MODE]},readRequestNonce:{type:"string",pattern:UUID.source}});
tools.find(t=>t.name===STATUS).inputSchema.properties.afterReadTimeoutNonce={type:"string",pattern:UUID.source};
tools.find(t=>t.name===STATUS).description+=" readTransport:async_once_v1 selects an independent async own read for shared jobs, including accepted jobs behind a retained timeout sender. Async enqueue jobs inherit this mode. Pending returns exact reconcileArgs; no mutation replay/pump. Pending START requires its existing explicit legacy reconciliation.";
tools.find(t=>t.name===STATUS).description+=" afterReadTimeoutNonce with explicit async read mode probes only that exact pending read, archives a proven callback timeout as transport unknown only when the original enqueue has an exact successful result, and returns nextReadArgs for a separate new read. Exclusive with readRequestNonce/originalRunId/acceptanceOnly. Never resends enqueue or claims acceptance; repeating an archived nonce cannot dispatch.";
module.exports = { INSPECT, ENQUEUE, START, STATUS, QUEUE_MANIFEST, SCHEMA, NATIVE_SCHEMA, LEDGER_SCHEMA, SLOT, SENDER_SLOT, tools, validateInput, operationArgsHash, messageScript, commandScript, fixedCommandScript, createExecutor, nativeReceiverSource:()=>nativeTitleJob.toString(), fixedDataExpression:messageArgument, fixedStringExpression:utf16Expression };

"use strict";
const fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto");
const presets = require("./ame-presets"), reservation = require("./ame-submit-guard"), passive = require("./ame-passive-status");
const { sameProcess } = require("./ame-running");
const INSPECT = "inspect_ame_title_sources", ENQUEUE = "enqueue_ame_title_variant", START = "start_ame_title_batch", STATUS = "get_ame_title_job_status";
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
  const fields = name === INSPECT ? [...source, "reconcileRequestNonce"] : name === ENQUEUE ? [...source, "batchId", "sourceGuid", "presetId", "presetSha25664", "outputFileName", "range"] : name === START ? ["batchId"] : name === STATUS ? ["batchId", "jobId"] : null;
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
  if (name === STATUS) { if (typeof raw.jobId !== "string" || !UUID.test(raw.jobId)) fail("ame_title_invalid_job"); a.jobId = raw.jobId; }
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
  function done(code) { reply.code = code; return stringify(reply); }
  if (reply.appSpecifier !== a.targetSpecifier || a.expectedSessionNonce && reply.sessionNonce !== a.expectedSessionNonce) return done("target_session_changed");
  var slot = $.global.aeAgentAMETitleJobsV1, frontend, host, ids, i, entry, batch;
  function readEntry(e) {
    var result = { handleKey: e.handleKey, sourcePath: e.sourcePath, sourceGuid: e.sourceGuid, outputPath: e.outputPath, presetIdentity: e.presetIdentity, range: e.range, processBinding: e.processBinding, nativeJobId: null, nativeAssociationVerified: e.associated === true, status: e.status, nativeCompletionObserved: e.finished === true, nativeResult: e.nativeResult, completionOrigin: e.completionOrigin || null, eventObservedAt: e.eventObservedAt || null, hostCompletion: e.hostCompletion || null, wrapperCompletion: e.wrapperCompletion || null, readErrors: [] };
    try { result.outputFiles = []; var files = e.wrapper && e.wrapper.outputFiles; if (!files || typeof files.length !== "number") throw Error(); for (var n = 0; n < files.length && n < 8; n++) result.outputFiles.push(String(files[n])); if (files.length !== 1 || norm(files[0]) !== norm(e.outputPath)) result.nativeAssociationVerified = false; } catch (x1) { result.readErrors.push("output_files_read_error"); result.nativeAssociationVerified = false; }
    for (var name in { getEncodeProgress: 1, getEncodeTime: 1, getLogOutput: 1 }) {
      try { if (!e.wrapper || typeof e.wrapper[name] !== "function") throw Error(); result[name] = scalar(e.wrapper[name]()); } catch (x2) { result.readErrors.push(name + "_read_error"); }
    }
    return result;
  }
  function finish(e, event, origin) {
    e.finished = true; e.nativeResult = scalar(event && typeof event === "object" ? event.result : event); e.status = "native_finished"; e.completionOrigin = origin; e.eventObservedAt = new Date().getTime();
    if (origin === "host_exact_paths") e.hostCompletion = { sourceFilePath: String(event.sourceFilePath), outputFilePath: String(event.outputFilePath), result: e.nativeResult, observedAt: e.eventObservedAt };
    else e.wrapperCompletion = { result: e.nativeResult, observedAt: e.eventObservedAt };
  }
  try {
    if (a.operation === "status") {
      entry = slot && slot.jobs[a.jobId]; if (!entry || entry.processBinding !== a.processBinding || entry.batchId !== a.batchId) return done("native_handle_unavailable");
      reply.job = readEntry(entry); reply.nativeAssociationVerified = reply.job.nativeAssociationVerified; return done("job_observed");
    }
    if (typeof app.getFrontend !== "function") return done("frontend_unsupported"); frontend = app.getFrontend();
    if (a.operation === "sources" || a.operation === "enqueue") {
      if (!frontend || typeof frontend.getDLItemsAtRoot !== "function") return done("dl_items_unsupported"); ids = frontend.getDLItemsAtRoot(a.sourcePath);
      if (!ids || typeof ids.length !== "number" || ids.length > 256) return done("dl_items_read_error"); reply.sourceGuids = [];
      for (i = 0; i < ids.length; i++) { if (typeof ids[i] !== "string" || !ids[i] || ids[i].length > 160) return done("dl_items_read_error"); reply.sourceGuids.push(ids[i]); }
      if (a.operation === "sources") return done("sources_observed");
      var matches = 0; for (i = 0; i < ids.length; i++) if (ids[i] === a.sourceGuid) matches++; if (matches !== 1) return done("exact_source_guid_unavailable");
    }
    if (typeof app.getEncoderHost !== "function") return done("encoder_host_unsupported"); host = app.getEncoderHost();
    if (!host || typeof host.isBatchRunning !== "function" || host.isBatchRunning() !== false) return done("batch_running_or_unknown");
    if (a.operation === "start") {
      batch = slot && slot.batches[a.batchId]; if (!batch || batch.presetIdentity !== a.presetIdentity || batch.processBinding !== a.processBinding || batch.start) return done("native_batch_unavailable_or_start_reserved");
      if (batch.jobIds.length !== a.jobIds.length) return done("owned_batch_changed");
      for (i = 0; i < a.jobIds.length; i++) { entry = slot.jobs[a.jobIds[i]]; if (batch.jobIds[i] !== a.jobIds[i] || !entry || !entry.associated || entry.status !== "queued" || !readEntry(entry).nativeAssociationVerified) return done("owned_batch_changed"); }
      if (typeof host.runBatch !== "function") return done("run_batch_unsupported");
      batch.start = { requestNonce: a.requestNonce, invoked: true, accepted: null }; var accepted = host.runBatch(); batch.start.accepted = scalar(accepted); reply.start = batch.start;
      return done(accepted === true ? "batch_start_accepted" : "batch_start_unknown");
    }
    if (!frontend || typeof frontend.addDLToBatch !== "function") return done("add_dl_unsupported");
    if (!slot) { slot = { jobs: {}, batches: {}, count: 0, hostListeners: null }; $.global.aeAgentAMETitleJobsV1 = slot; }
    if (slot.count >= 256 || slot.jobs[a.jobId]) return done("native_handle_already_reserved_or_limit");
    batch = slot.batches[a.batchId]; if (batch && (batch.presetIdentity !== a.presetIdentity || batch.processBinding !== a.processBinding || batch.start || batch.jobIds.length >= 64)) return done("native_batch_identity_changed");
    if (!batch) { batch = { presetIdentity: a.presetIdentity, processBinding: a.processBinding, jobIds: [], start: null }; slot.batches[a.batchId] = batch; }
    entry = { handleKey: a.jobId, batchId: a.batchId, sourcePath: a.sourcePath, sourceGuid: a.sourceGuid, outputPath: a.outputPath, presetIdentity: a.presetIdentity, range: a.range, processBinding: a.processBinding, wrapper: null, associated: false, status: "unknown_outcome", finished: false, nativeResult: null };
    slot.jobs[a.jobId] = entry; slot.count++; batch.jobIds.push(a.jobId);
    if (!slot.hostListeners && typeof host.addEventListener === "function") {
      function hostEvent(event, complete) { var key, e; for (key in slot.jobs) if (Object.prototype.hasOwnProperty.call(slot.jobs, key)) { e = slot.jobs[key]; if (e.associated && event && norm(event.sourceFilePath) === norm(e.sourcePath) && norm(event.outputFilePath) === norm(e.outputPath)) { if (complete) finish(e, event, "host_exact_paths"); else if (!e.finished) { e.status = "running"; e.eventObservedAt = new Date().getTime(); } } } }
      slot.hostListeners = { started: function(e) { hostEvent(e, false); }, complete: function(e) { hostEvent(e, true); } };
      host.addEventListener("onItemEncodingStarted", slot.hostListeners.started); host.addEventListener("onItemEncodeComplete", slot.hostListeners.complete);
    }
    // Empty format is the documented automatic format derived from this exact EPR.
    entry.wrapper = frontend.addDLToBatch(a.sourcePath, "", a.presetPath, a.sourceGuid, a.outputPath);
    if (!entry.wrapper || typeof entry.wrapper.setWorkArea !== "function" || typeof entry.wrapper.addEventListener !== "function") return done("encoder_wrapper_unsupported_after_submit");
    entry.listeners = { progress: function() { if (!entry.finished) { entry.status = "running"; entry.eventObservedAt = new Date().getTime(); } }, finished: function(e) { finish(entry, e, "native_wrapper"); } };
    entry.wrapper.addEventListener("onEncodeProgress", entry.listeners.progress); entry.wrapper.addEventListener("onEncodeFinished", entry.listeners.finished);
    if (entry.wrapper.setWorkArea(3, a.range.startSeconds, a.range.endSeconds) !== true) return done("work_area_unverified_after_submit");
    entry.associated = true; if (entry.status === "unknown_outcome") entry.status = "queued"; reply.job = readEntry(entry); reply.nativeAssociationVerified = reply.job.nativeAssociationVerified;
    return done(reply.nativeAssociationVerified ? "job_enqueued" : "output_binding_unverified_after_submit");
  } catch (error) { reply.error = String(error).substring(0, 2000); return done("native_read_or_submit_error"); }
}

// Fixed AE sender. It never launches AME; unknown delivery blocks another send.
// Reconciliation pumps the SAME retained BridgeTalk message and never resubmits.
function nativeSend(a, messageBody) {
  var slot = $.global.aeAgentAMETitleSendV1;
  function reply(code) { return { schema: "ae-agent-ame-title-send.v1", code: code, requestNonce: slot ? slot.requestNonce : a.requestNonce, callback: slot ? slot.callback : null, responseBody: slot ? slot.body : null }; }
  function pump(ms) { var deadline = new Date().getTime() + ms; while (slot && (!slot.callback || slot.callback === "timeout") && new Date().getTime() < deadline) { if (typeof BridgeTalk.pump !== "function" || typeof $.sleep !== "function") break; BridgeTalk.pump(); if (!slot.callback || slot.callback === "timeout") $.sleep(20); } }
  if (typeof BridgeTalk !== "function" || typeof BridgeTalk.isRunning !== "function") return reply("bridgetalk_unsupported");
  try { if (!BridgeTalk.isRunning(a.targetSpecifier)) return reply("target_not_running"); } catch (_) { return reply("target_running_unknown"); }
  if (a.reconcileRequestNonce) { if (!slot || slot.requestNonce !== a.reconcileRequestNonce || slot.targetSpecifier !== a.targetSpecifier || slot.processBinding !== a.processBinding || slot.operationBinding !== a.operationBinding) return reply("reconciliation_mismatch"); pump(a.timeoutMs); return reply(slot.callback || "unknown"); }
  if (slot && (!slot.callback || slot.callback === "timeout")) return reply("previous_request_unresolved");
  var message = new BridgeTalk(); slot = { requestNonce: a.requestNonce, targetSpecifier: a.targetSpecifier, processBinding: a.processBinding, operationBinding: a.operationBinding, callback: null, body: null, message: message }; $.global.aeAgentAMETitleSendV1 = slot;
  message.target = a.targetSpecifier; message.body = messageBody; message.timeout = Math.ceil(a.timeoutMs / 1000);
  message.onResult = function(r) { slot.body = String(r.body || "").substring(0, 65537); slot.callback = "result"; };
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
  return { path: canonical, sha256: currentHash, size: after.size, mtimeMs: after.mtimeMs };
}
function write(file, value, exclusive = false) {
  fs.mkdirSync(path.dirname(file), { recursive: true }); const tmp = exclusive ? file : file + "." + crypto.randomUUID() + ".tmp", fd = fs.openSync(tmp, "wx");
  try { fs.writeFileSync(fd, JSON.stringify(value) + "\n", "utf8"); fs.fsyncSync(fd); } finally { fs.closeSync(fd); } if (!exclusive) fs.renameSync(tmp, file);
}
function createExecutor(deps) {
  if (!deps || !path.isAbsolute(deps.stateDir || "") || ["runExtendScriptBody", "inspectProcesses", "resolveOutputFilePath", "assertManualIngress", "assertServerContext"].some(k => typeof deps[k] !== "function")) fail("ame_title_invalid_dependencies");
  const caps = new WeakMap(), catalog = deps.listPresetCatalog || presets.listAmePresets, now = deps.now || Date.now; let busy = false;
  const recordFile = id => path.join(deps.stateDir, "batches", id + ".json"), guardDir = path.join(deps.stateDir, "outputs");
  function result(code, extra = {}) { return { schema: SCHEMA, ok: false, code, nativeJobId: null, nativeAssociationVerified: false, nativeQueueCompositionVerified: false, completionVerified: false, mediaVerified: false, automaticRetryAllowed: false, observedAt: new Date(now()).toISOString(), ...extra }; }
  function assertCap(cap, name, a) {
    const entry = caps.get(cap); if (!entry || !entry.active || entry.name !== name || entry.argsHash !== hash(a)) fail("ame_title_manual_capability_required");
    deps.assertManualIngress(entry.context, { name, argsHash: entry.argsHash }); deps.assertServerContext(entry.context, { name, argsHash: entry.argsHash }); return entry;
  }
  function authorize(name, raw, context) {
    if (![ENQUEUE, START].includes(name)) fail("ame_title_mutation_capability_only"); const a = validateInput(name, raw), cap = Object.freeze(Object.create(null));
    const entry = { name, argsHash: hash(a), context, active: true }; deps.assertManualIngress(context, { name, argsHash: entry.argsHash }); deps.assertServerContext(context, { name, argsHash: entry.argsHash }); caps.set(cap, entry); return cap;
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
  function pinned(job) {
    const source = stableFile(job.sourcePath, job.args.expectedSourceSha25664), preset = stableFile(job.presetPath, job.args.presetSha25664);
    if (hash(source) !== hash(job.sourcePin) || hash(preset) !== hash(job.presetPin)) fail("ame_title_file_changed");
  }
  async function send(a) {
    try {
      const raw = await deps.runExtendScriptBody(commandScript(a), 30000, { operation: a.operation, mutating: !a.reconcileRequestNonce && ["enqueue", "start"].includes(a.operation), requestNonce: a.reconcileRequestNonce || a.requestNonce, processBinding: a.processBinding }), reply = raw && Object.prototype.hasOwnProperty.call(raw, "result") ? raw.result : raw;
      if (!reply || reply.schema !== "ae-agent-ame-title-send.v1" || reply.requestNonce !== (a.reconcileRequestNonce || a.requestNonce)) return { resolved: false, code: "transport_correlation_unknown", native: null };
      if (reply.callback === "error") return { resolved: true, code: "native_delivery_error", native: null };
      if (reply.code !== "result" || typeof reply.responseBody !== "string" || reply.responseBody.length > 65536) return { resolved: false, code: reply.code || "transport_unknown", native: null };
      let native; try { native = JSON.parse(reply.responseBody); } catch (_) { return { resolved: true, code: "native_response_invalid", native: null }; }
      if (!native || native.schema !== NATIVE_SCHEMA || native.requestNonce !== (a.reconcileRequestNonce || a.requestNonce) || native.operationBinding !== a.operationBinding || native.appSpecifier !== a.targetSpecifier || a.expectedSessionNonce && native.sessionNonce !== a.expectedSessionNonce || !Number.isFinite(native.observedAt) || native.observedAt <= 0 || native.observedAt < a.minimumObservedAt || native.observedAt > now() + 60000) return { resolved: false, code: "native_correlation_unknown", native: null };
      return { resolved: true, code: native.code, native };
    } catch (error) { return { resolved: false, code: "ae_delivery_unknown", error: String(error.message || error).slice(0, 2000), native: null }; }
  }
  function associated(job, native) {
    const n = native && native.job; return !!(n && n.nativeJobId === null && n.handleKey === job.jobId && n.nativeAssociationVerified === true && n.sourceGuid === job.args.sourceGuid && samePath(n.sourcePath, job.sourcePath) && samePath(n.outputPath, job.outputPath) && n.presetIdentity === job.presetIdentity && n.processBinding === job.processBinding && hash(n.range) === hash(job.args.range) &&
      (!n.nativeCompletionObserved || Number.isFinite(n.eventObservedAt) && n.eventObservedAt >= Date.parse(job.submittedAt) && n.eventObservedAt <= native.observedAt));
  }
  function updateJob(job, observation) {
    job.transportResolved = observation.resolved; if (observation.native) job.nativeObservation = observation.native;
    job.nativeAssociationVerified = associated(job, observation.native); job.readyForStart = job.nativeAssociationVerified && observation.native.job.status === "queued" && (observation.code === "job_enqueued" || observation.code === "job_observed" && job.readyForStart);
    job.state = job.nativeAssociationVerified ? observation.native.job.status : "unknown_outcome";
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
    let batch = load(a.batchId); if (batch && (batch.presetIdentity !== presetIdentity || batch.processBinding !== processBinding || batch.start || batch.jobs.length >= 64)) return result("batch_identity_or_preset_changed");
    const outputPath = outputFile(a.outputFileName), intent = { schema: reservation.SCHEMA || "ae-agent-ame-submit-intent.v1", sourcePath: source.path, sourceIdentity: hash({ guid: a.sourceGuid, sha256: source.sha256 }), preset: presetIdentity, outputPath, range: a.range };
    assertCap(cap, ENQUEUE, a); await processPin(a, processInfo); if (hash(stableFile(source.path, source.sha256)) !== hash(source) || hash(stableFile(presetPin.path, presetPin.sha256)) !== hash(presetPin)) fail("ame_title_file_changed");
    const reserved = reservation.reserveSubmissionIntent(intent, guardDir, new Date(now())); if (reserved.blocked || !reserved.ok) return result(reserved.reason, { attemptId: reserved.attemptId || null });
    const job = { jobId: reserved.attemptId, handleKey: reserved.attemptId, nativeJobId: null, requestNonce: crypto.randomUUID(), operationBinding: hash({ operation: "enqueue", jobId: reserved.attemptId, args: a }), args: a, sourcePath: source.path, sourcePin: source, presetPath: presetPin.path, presetPin, presetIdentity, processBinding, process: processInfo, outputPath, submittedAt: reserved.reservedAt, transportResolved: false, nativeAssociationVerified: false, readyForStart: false, state: "unknown_outcome" };
    const initial = !batch; if (!batch) batch = { schema: LEDGER_SCHEMA, batchId: a.batchId, presetIdentity, processBinding, jobs: [], start: null }; batch.jobs.push(job); write(recordFile(a.batchId), batch, initial);
    assertCap(cap, ENQUEUE, a); entry.active = false;
    const observed = await send({ ...a, operation: "enqueue", sourcePath: job.sourcePath, presetPath: job.presetPath, presetIdentity, processBinding, operationBinding: job.operationBinding, outputPath, jobId: job.jobId, requestNonce: job.requestNonce, minimumObservedAt: Date.parse(job.submittedAt) });
    try { deps.assertManualIngress(entry.context, { name: ENQUEUE, argsHash: entry.argsHash }); deps.assertServerContext(entry.context, { name: ENQUEUE, argsHash: entry.argsHash }); await processPin(a, processInfo); pinned(job); }
    catch (error) { return result(error.code || "post_submit_context_changed", { batchId: a.batchId, jobId: job.jobId, requestNonce: job.requestNonce, unknownOutcome: true, nativeMutationMayHaveOccurred: true }); }
    updateJob(job, observed); write(recordFile(a.batchId), batch);
    return result(observed.code, { ok: job.nativeAssociationVerified && observed.code === "job_enqueued", batchId: a.batchId, jobId: job.jobId, handleKey: job.handleKey, nativeAssociationVerified: job.nativeAssociationVerified, requestNonce: job.requestNonce, state: job.state, unknownOutcome: !job.nativeAssociationVerified, outputPath, presetEncodingMode: "exact_epr_automatic_format", native: observed.native });
  }
  async function start(a, cap) {
    const entry = assertCap(cap, START, a), processInfo = await processPin(a), batch = load(a.batchId); if (!batch || batch.processBinding !== binding(a, processInfo) || !batch.jobs.length) return result("batch_not_bound");
    if (batch.start) return result("batch_start_already_reserved", { requestNonce: batch.start.requestNonce });
    if (batch.jobs.some(j => !j.readyForStart || !j.nativeAssociationVerified)) return result("batch_jobs_unverified"); for (const job of batch.jobs) pinned(job);
    // Our wrappers/ledger, isBatchRunning, status and files cannot establish the
    // entire native queue composition. No default implementation grants this.
    if (typeof deps.assertQueueOwnership !== "function" || await deps.assertQueueOwnership(entry.context, JSON.parse(JSON.stringify(batch))) !== true) return result("queue_composition_unavailable");
    assertCap(cap, START, a); await processPin(a, processInfo); for (const job of batch.jobs) pinned(job);
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
    const pendingStart = batch.start && !batch.start.transportResolved, nonce = pendingStart ? batch.start.requestNonce : !job.transportResolved ? job.requestNonce : null;
    const operationBinding = pendingStart ? batch.start.operationBinding : nonce ? job.operationBinding : hash({ operation: "status", jobId: job.jobId });
    const observed = await send({ ...a, operation: "status", jobId: job.jobId, processBinding: batch.processBinding, operationBinding, requestNonce: crypto.randomUUID(), minimumObservedAt: pendingStart ? Date.parse(batch.start.reservedAt) : nonce ? Date.parse(job.submittedAt) : now(), ...(nonce ? { reconcileRequestNonce: nonce } : {}) });
    await processPin(a, processInfo); pinned(job);
    if (pendingStart) { batch.start.transportResolved = observed.resolved; batch.start.state = observed.code === "batch_start_accepted" ? "accepted" : "unknown_outcome"; }
    else updateJob(job, observed); write(recordFile(a.batchId), batch);
    const native = pendingStart ? null : observed.native, nativeJob = native && native.job, verified = associated(job, native);
    let file = { exists: false }; try { const stat = fs.lstatSync(job.outputPath); if (stat.isFile() && !stat.isSymbolicLink()) file = { exists: true, bytes: stat.size, modifiedAt: stat.mtime.toISOString() }; } catch (error) { if (error.code !== "ENOENT") return result("output_read_error"); }
    const passiveJob = { schema: "ae-agent-ame-job.v1", jobId: job.jobId, preset: job.presetIdentity, outputPath: job.outputPath, range: job.args.range, submittedAt: job.submittedAt };
    const nativeStatus = verified && ["queued", "running"].includes(nativeJob.status) ? { ...passiveJob, status: nativeJob.status, observedAt: new Date(native.observedAt).toISOString() } : null;
    const passiveResult = passive.evaluateAmePassiveStatus(passiveJob, nativeStatus, file, job.passivePrevious, now()); job.passivePrevious = passiveResult.ok ? passiveResult : null; write(recordFile(a.batchId), batch);
    const completion = verified && nativeJob.hostCompletion, exactCompletion = !!(completion && samePath(completion.sourceFilePath, job.sourcePath) && samePath(completion.outputFilePath, job.outputPath) && Number.isFinite(completion.observedAt) && completion.observedAt >= Date.parse(job.submittedAt) && completion.observedAt <= native.observedAt);
    // EncoderHostWrapperEvent documents strings 'True'/'False'. Wrapper events
    // retain raw observations but do not invent a numeric or boolean success map.
    const complete = exactCompletion && completion.result === "True", failed = exactCompletion && completion.result === "False";
    return result(observed.code, { ok: verified, batchId: a.batchId, jobId: job.jobId, handleKey: job.handleKey, nativeAssociationVerified: verified, nativeCompletionObserved: !!(verified && nativeJob.nativeCompletionObserved), nativeResult: exactCompletion ? completion.result : verified ? nativeJob.nativeResult : null, completionVerified: complete,
      state: complete ? "needs_media_probe" : failed ? "failed" : verified && nativeJob.nativeCompletionObserved ? "needs_result_interpretation" : passiveResult.state, passive: passiveResult, file, native, requestNonce: nonce || native && native.requestNonce });
  }
  async function execute(name, raw, cap) {
    const a = validateInput(name, raw), mutation = name === ENQUEUE || name === START; if (mutation) { assertCap(cap, name, a); if (busy) fail("ame_title_writer_busy"); busy = true; }
    try { return await (name === INSPECT ? inspectSources(a) : name === ENQUEUE ? enqueue(a, cap) : name === START ? start(a, cap) : status(a)); }
    catch (error) { return result(error.code || "ame_title_read_error", { error: String(error.message || error).slice(0, 2000) }); }
    finally { if (mutation) busy = false; }
  }
  return { authorize, assertAuthorization: (cap, name, raw) => { assertCap(cap, name, validateInput(name, raw)); return true; }, execute };
}

const common = { targetSpecifier: { type: "string", pattern: "^ame-[0-9]{1,3}\\.[0-9]{1,3}$" }, expectedProcess: { type: "object", additionalProperties: false, required: ["pid", "startedAt"], properties: { pid: { type: "integer", minimum: 1 }, startedAt: { type: "string" } } }, expectedSessionNonce: { type: "string" }, timeoutMs: { type: "integer", minimum: 1000, maximum: 10000 } };
const source = { sourceProjectFile: { type: "string" }, expectedSourceSha25664: { type: "string", pattern: SHA.source } }, batchId = { type: "string", pattern: UUID.source };
const definitions = [
  [INSPECT, "Read exact DL GUID strings from one pinned saved AEP in an already running AME. Reconcile an exact unknown read nonce without resend. No first-comp inference, submit or launch.", { ...source, reconcileRequestNonce: { type: "string", pattern: UUID.source } }, ["sourceProjectFile", "expectedSourceSha25664"]],
  [ENQUEUE, "Manually gated fixed addDLToBatch with one exact GUID, exact catalog EPR and reserved output. Our jobId/handleKey is not a native ID. Unknown submission cannot replay.", { ...source, batchId, sourceGuid: { type: "string" }, presetId: { type: "string", pattern: "^amep_[a-f0-9]{40}$" }, presetSha25664: { type: "string", pattern: SHA.source }, outputFileName: { type: "string" }, range: { type: "object", additionalProperties: false, required: ["startSeconds", "endSeconds"], properties: { startSeconds: { type: "number", minimum: 0 }, endSeconds: { type: "number" } } } }, ["sourceProjectFile", "expectedSourceSha25664", "batchId", "sourceGuid", "presetId", "presetSha25664", "outputFileName", "range"]],
  [START, "Manual single batch start. Fails closed with queue_composition_unavailable until an injected server gate proves the entire native queue; our ledger and files are insufficient.", { batchId }, ["batchId"]],
  [STATUS, "Fixed read of one retained native EncoderWrapper and listeners. Exact unresolved nonce is reconciled without resubmit. File growth is activity, not native completion or media proof.", { batchId, jobId: { type: "string", pattern: UUID.source } }, ["batchId", "jobId"]]
];
const tools = definitions.map(([name, description, fields, required]) => ({ name, description, inputSchema: { type: "object", additionalProperties: false, properties: { ...common, ...fields }, required: ["targetSpecifier", "expectedProcess", ...required] }, annotations: { readOnlyHint: name === INSPECT || name === STATUS, destructiveHint: false, idempotentHint: false, openWorldHint: false } }));
module.exports = { INSPECT, ENQUEUE, START, STATUS, SCHEMA, NATIVE_SCHEMA, LEDGER_SCHEMA, SLOT, SENDER_SLOT, tools, validateInput, operationArgsHash, messageScript, commandScript, createExecutor };

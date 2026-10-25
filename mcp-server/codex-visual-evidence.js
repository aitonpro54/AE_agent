"use strict";
// Offline delivery/provenance evidence; never dispatches a model or grants AE authority.
const fs = require("fs"), path = require("path"), os = require("os");
const { fileURLToPath } = require("url");
const { TextDecoder } = require("util");
const { hash } = require("./placeholder-review-service");
const { validateReviewOutputs } = require("./placeholder-visual-review");
const DEFAULT_SESSIONS_ROOT = path.join(os.homedir(), ".codex", "sessions");
const DEFAULT_WORKSPACE_ROOT = path.resolve(__dirname, "..");
const MAX_SESSION_LOG_BYTES = 64 * 1024 * 1024, MAX_SESSION_EVENTS = 25000;
const MAX_IMAGE_BASE64_BYTES = 45 * 1024 * 1024, MAX_IMAGE_BYTES = 32 * 1024 * 1024;
const MAX_SEARCH_ENTRIES = 10000, MAX_SEARCH_DIRECTORIES = 512;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PNG_MAGIC = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const PIN_PREFIX = "AE_PLACEHOLDER_REVIEW_PIN:";
function fail(code) { const error = new Error(code); error.code = code; throw error; }
function uuid(value) { if (typeof value !== "string" || !UUID_REGEX.test(value)) fail("invalid_codex_uuid"); return value.toLowerCase(); }
function normalized(file) { const result = path.resolve(file).replace(/\\/g, "/"); return process.platform === "win32" ? result.toLowerCase() : result; }
function samePath(a, b) { return typeof a === "string" && typeof b === "string" && normalized(a) === normalized(b); }
function contained(root, file) { const relative = path.relative(root, file); return relative !== ".." && !relative.startsWith(".." + path.sep) && !path.isAbsolute(relative); }
function canonicalRoot(root) {
  if (typeof root !== "string" || !path.isAbsolute(root)) fail("codex_sessions_root_invalid");
  const lexical = path.resolve(root), stat = fs.lstatSync(lexical), real = fs.realpathSync(lexical);
  if (!stat.isDirectory() || stat.isSymbolicLink() || !samePath(real, lexical)) fail("codex_sessions_containment_escape");
  return real;
}
function checkPath(root, file, directory = false) {
  const lexical = path.resolve(file);
  if (!contained(root, lexical)) fail("codex_sessions_containment_escape");
  const parts = path.relative(root, lexical).split(path.sep).filter(Boolean); let current = root;
  for (let i = 0; i < parts.length; i++) {
    current = path.join(current, parts[i]); const stat = fs.lstatSync(current);
    if (stat.isSymbolicLink() || !samePath(fs.realpathSync(current), current) || ((i < parts.length - 1 || directory) && !stat.isDirectory())) fail("codex_sessions_containment_escape");
  }
  return lexical;
}
function identity(stat) { return JSON.stringify([stat.dev, stat.ino, stat.size, stat.mtimeMs, stat.ctimeMs]); }
function stableBytes(file, root, maximum, code = "codex_session_log") {
  const realRoot = canonicalRoot(root), lexical = checkPath(realRoot, file); let fd;
  try {
    const beforePath = fs.lstatSync(lexical);
    fd = fs.openSync(lexical, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0)); const before = fs.fstatSync(fd);
    if (!before.isFile() || identity(beforePath) !== identity(before)) fail(code + "_identity_changed");
    if (!before.size) fail(code + "_empty");
    if (before.size > maximum) fail(code + "_budget_exceeded");
    const buffer = Buffer.alloc(before.size + 1); let length = 0, count;
    while (length < buffer.length && (count = fs.readSync(fd, buffer, length, buffer.length - length, null)) > 0) length += count;
    checkPath(realRoot, lexical);
    if (length !== before.size || identity(before) !== identity(fs.fstatSync(fd)) || identity(before) !== identity(fs.lstatSync(lexical))) fail(code + "_unstable");
    return buffer.subarray(0, length);
  } finally { if (fd !== undefined) fs.closeSync(fd); }
}
function findSessionFile(sessionsRoot, threadId) {
  threadId = uuid(threadId); const root = canonicalRoot(sessionsRoot), candidates = []; let entriesSeen = 0, directoriesSeen = 0;
  function walk(directory, depth) {
    if (++directoriesSeen > MAX_SEARCH_DIRECTORIES || depth > 6) fail("codex_session_search_budget_exceeded");
    checkPath(root, directory, true); const handle = fs.opendirSync(directory);
    try {
      let entry;
      while ((entry = handle.readSync()) !== null) {
        if (++entriesSeen > MAX_SEARCH_ENTRIES) fail("codex_session_search_budget_exceeded");
        const file = path.join(directory, entry.name); checkPath(root, file, entry.isDirectory());
        if (entry.isDirectory()) walk(file, depth + 1);
        else if (entry.isFile() && /^rollout-.*\.jsonl$/i.test(entry.name) && entry.name.toLowerCase().endsWith("-" + threadId + ".jsonl")) candidates.push(file);
      }
    } finally { handle.closeSync(); }
  }
  walk(root, 0);
  if (!candidates.length) fail("codex_session_thread_not_found");
  if (candidates.length !== 1) fail("codex_session_thread_conflict");
  return candidates[0];
}
function readCodexSessionRecords(filePath, expectedThreadId, options = {}) {
  const bytes = stableBytes(filePath, options.sessionsRoot || path.dirname(filePath), MAX_SESSION_LOG_BYTES);
  if (bytes[bytes.length - 1] !== 10) fail("codex_session_log_incomplete");
  let text; try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); } catch (_error) { fail("codex_session_log_malformed"); }
  const lines = text.split("\n"); lines.pop();
  if (lines.length > MAX_SESSION_EVENTS) fail("codex_session_event_budget_exceeded");
  let records; try { records = lines.map(line => JSON.parse(line)); } catch (_error) { fail("codex_session_log_malformed"); }
  if (records.some(record => !record || typeof record !== "object" || Array.isArray(record))) fail("codex_session_log_malformed");
  const metadata = records.filter(record => record.type === "session_meta");
  if (metadata.length !== 1 || records[0] !== metadata[0] || !metadata[0].payload) fail("codex_session_metadata_missing_or_conflicting");
  if (expectedThreadId && uuid(metadata[0].payload.id) !== uuid(expectedThreadId)) fail("codex_session_thread_identity_mismatch");
  if (!samePath(metadata[0].payload.cwd, options.workspaceRoot || DEFAULT_WORKSPACE_ROOT)) fail("codex_session_workspace_mismatch");
  Object.defineProperty(records, "logSha256", { value: hash(bytes) }); return records;
}
function extractTurnRecords(records, turnId) {
  turnId = uuid(turnId); const starts = [], completes = [];
  records.forEach((record, index) => {
    const p = record.payload;
    if (record.type === "event_msg" && p && p.turn_id && String(p.turn_id).toLowerCase() === turnId) {
      if (p.type === "task_started") starts.push(index); if (p.type === "task_complete") completes.push(index);
    }
  });
  if (!starts.length) fail("codex_turn_not_found");
  if (starts.length !== 1 || completes.length > 1) fail("codex_turn_identity_conflict");
  if (!completes.length || completes[0] <= starts[0]) fail("codex_turn_not_completed");
  const start = starts[0], end = completes[0];
  if (records.slice(start + 1, end).some(r => r.type === "event_msg" && ["task_started", "task_complete", "turn_aborted", "task_cancelled"].includes(r.payload?.type))) fail("codex_turn_interrupted_or_overlapping");
  let inputStart = start;
  while (inputStart > 1) { const previous = records[inputStart - 1]; if (previous.type === "event_msg" && ["task_complete", "task_started"].includes(previous.payload?.type)) break; inputStart--; }
  return { turnRecords: records.slice(inputStart, end + 1), taskStarted: records[start], taskComplete: records[end] };
}
function viewPath(uri) {
  if (typeof uri !== "string") fail("codex_native_view_path_missing");
  try { const url = new URL(uri); if (url.protocol !== "file:" || (url.hostname && url.hostname !== "localhost") || url.search || url.hash) fail("codex_native_view_uri_invalid"); return normalized(fileURLToPath(url)); }
  catch (_error) { fail("codex_native_view_uri_invalid"); }
}
function outputItems(record) {
  if (record.type !== "response_item" || !["custom_tool_call_output", "function_call_output"].includes(record.payload?.type)) return [];
  return Array.isArray(record.payload.output) ? record.payload.output : [];
}
function readCodexTurnEvidence(options) {
  const threadId = uuid(options.threadId), turnId = uuid(options.turnId), sessionsRoot = options.sessionsRoot || DEFAULT_SESSIONS_ROOT, workspaceRoot = options.workspaceRoot || DEFAULT_WORKSPACE_ROOT;
  const records = readCodexSessionRecords(findSessionFile(sessionsRoot, threadId), threadId, { sessionsRoot, workspaceRoot });
  const { turnRecords, taskComplete } = extractTurnRecords(records, turnId);
  const promptTexts = [], deliveredTexts = [], views = [], attachments = [], finals = []; let firstImageRecordIndex = Infinity, lastImageRecordIndex = -1, imageByteLength = 0;
  const contexts = turnRecords.filter(r => r.type === "turn_context");
  if (!contexts.length || contexts.some(r => uuid(r.payload?.turn_id) !== turnId || !samePath(r.payload?.cwd, workspaceRoot))) fail("codex_turn_context_mismatch");
  turnRecords.forEach((record, index) => {
    const p = record.payload || {}, ids = [p.turn_id, p.internal_chat_message_metadata_passthrough?.turn_id, record.metadata?.retained_source?.id?.turn_id].filter(value => value !== undefined);
    if (ids.some(value => uuid(value) !== turnId) || (p.thread_id !== undefined && uuid(p.thread_id) !== threadId)) fail("codex_event_identity_mismatch");
    const texts = [];
    if (record.type === "event_msg" && p.type === "user_message" && typeof p.message === "string") texts.push(p.message);
    if (record.type === "response_item" && p.type === "message" && p.role === "user") for (const item of p.content || []) if (item?.type === "input_text" && typeof item.text === "string") texts.push(item.text);
    for (const text of texts) { promptTexts.push(text); deliveredTexts.push({ text, index, source: "user_input" }); }
    // Encrypted requests and JavaScript wrapper source are never interpreted.
    if (record.type === "event_msg" && p.type === "item_completed" && p.item?.type === "ImageView") {
      if (uuid(p.thread_id) !== threadId || uuid(p.turn_id) !== turnId) fail("codex_event_identity_mismatch");
      views.push(viewPath(p.item.path)); firstImageRecordIndex = Math.min(firstImageRecordIndex, index); lastImageRecordIndex = index;
    }
    for (const item of outputItems(record)) {
      if (item?.type === "input_text" && typeof item.text === "string") {
        if (p.internal_chat_message_metadata_passthrough?.turn_id === undefined) fail("codex_event_identity_missing");
        deliveredTexts.push({ text: item.text, index, source: "tool_output" });
      }
      if (item?.type !== "input_image") continue;
      if (p.internal_chat_message_metadata_passthrough?.turn_id === undefined) fail("codex_event_identity_missing");
      firstImageRecordIndex = Math.min(firstImageRecordIndex, index); lastImageRecordIndex = index;
      const prefix = "data:image/png;base64,", url = item.image_url;
      if (item.detail !== "original") fail("codex_attachment_original_required");
      if (typeof url !== "string" || !url.startsWith(prefix)) fail("codex_attachment_not_png_data_url");
      const base64 = url.slice(prefix.length);
      if (!base64.length || base64.length > MAX_IMAGE_BASE64_BYTES || base64.length % 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) fail("codex_attachment_size_or_encoding_invalid");
      const bytes = Buffer.from(base64, "base64");
      if (bytes.toString("base64") !== base64 || bytes.length < 24 || bytes.length > MAX_IMAGE_BYTES) fail("codex_attachment_size_or_encoding_invalid");
      imageByteLength += bytes.length;
      if (imageByteLength > MAX_SESSION_LOG_BYTES || attachments.length >= 11) fail("codex_attachment_budget_exceeded");
      if (!bytes.subarray(0, 8).equals(PNG_MAGIC) || bytes.toString("ascii", 12, 16) !== "IHDR") fail("codex_attachment_not_png");
      attachments.push({ bytes, byteLength: bytes.length, sha256: hash(bytes), width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) });
    }
    if (record.type === "response_item" && p.type === "message" && p.role === "assistant" && p.phase === "final_answer") {
      if (p.internal_chat_message_metadata_passthrough?.turn_id === undefined) fail("codex_event_identity_missing"); finals.push({ payload: p, index });
    }
  });
  if (finals.length !== 1) fail("codex_final_answer_missing_or_conflicting");
  const final = finals[0];
  if (final.index <= lastImageRecordIndex) fail("codex_images_after_final_answer");
  const content = final.payload.content;
  if (!Array.isArray(content) || content.length !== 1 || content[0].type !== "output_text" || typeof content[0].text !== "string" || content[0].text.length > 256 * 1024) fail("codex_final_answer_invalid");
  const finalText = content[0].text.trim();
  if (typeof taskComplete.payload.last_agent_message !== "string" || finalText !== taskComplete.payload.last_agent_message.trim()) fail("codex_final_answer_mismatch_task_complete");
  let finalAnswer; try { finalAnswer = JSON.parse(finalText); } catch (_error) { fail("codex_final_answer_not_json"); }
  if (!finalAnswer || Object.keys(finalAnswer).some(key => !["schema", "reviews"].includes(key)) || finalAnswer.schema !== "ae-agent-codex-visual-review.v1" || !Array.isArray(finalAnswer.reviews) || finalAnswer.reviews.length !== 1) fail("codex_final_answer_schema_invalid");
  const review = finalAnswer.reviews[0];
  if (!review || Object.keys(review).some(key => !["manifestSha256", "outputs"].includes(key)) || typeof review.manifestSha256 !== "string" || !/^[a-f0-9]{64}$/.test(review.manifestSha256) || !Array.isArray(review.outputs) || review.outputs.length > 10 ||
      review.outputs.some(o => !o || typeof o !== "object" || Array.isArray(o) || Object.keys(o).some(key => !["frameId", "decision", "observation"].includes(key)))) fail("codex_final_answer_schema_invalid");
  return { threadId, turnId, promptTexts, deliveredTexts, firstImageRecordIndex, views, attachments, finalAnswer, logSha256: records.logSha256 };
}
function verifyCodexBatchReview(batch, evidence, options = {}) {
  const pending = reason => ({ ok: false, status: "insufficient_material", artisticAccepted: false, reason, limits: batch.manifest.limits });
  const review = evidence.finalAnswer.reviews[0], material = batch.material;
  if (review.manifestSha256 !== material.manifestSha256) return pending("codex_review_manifest_sha_mismatch");
  const canonical = JSON.stringify(batch.manifest);
  // An entire canonical body must actually be delivered; a file reference/hash is insufficient.
  const deliveries = evidence.deliveredTexts.filter(item => item.text.split(/\r?\n/).some(line => line === canonical));
  if (!deliveries.length) return pending("codex_full_manifest_delivery_missing");
  const delivery = deliveries.find(item => item.index < evidence.firstImageRecordIndex);
  if (!delivery) return pending("codex_images_precede_manifest_delivery");
  for (const text of [...evidence.promptTexts, ...evidence.deliveredTexts.map(item => item.text)]) {
    if (text.includes(PIN_PREFIX)) {
      const prefixes = text.split(PIN_PREFIX).length - 1;
      const pins = text.match(/AE_PLACEHOLDER_REVIEW_PIN:[0-9a-f]{64}(?![0-9a-z])/gi) || [];
      if (pins.length !== prefixes || pins.some(pin => pin !== material.pin)) return pending("codex_manifest_pin_mismatch");
    }
  }
  const expectedImages = [batch.manifest.sheet?.image, ...batch.manifest.frames.filter(f => f.viewKind !== "source").map(f => f.image)];
  if (expectedImages.some(image => !image)) return pending("codex_review_target_images_missing");
  if (evidence.views.length !== expectedImages.length) return pending("codex_native_view_multiset_mismatch");
  if (evidence.attachments.length !== expectedImages.length) return pending("codex_attachment_multiset_mismatch");
  const availableViews = [...evidence.views], availableAttachments = [...evidence.attachments];
  for (const image of expectedImages) {
    const file = path.resolve(options.workspaceRoot || DEFAULT_WORKSPACE_ROOT, image.filePath); let bytes;
    try { bytes = stableBytes(file, options.workspaceRoot || DEFAULT_WORKSPACE_ROOT, MAX_IMAGE_BYTES, "codex_expected_image"); } catch (error) { return pending(error.code || "codex_expected_image_unavailable"); }
    if (hash(bytes) !== image.sha256 || bytes.length !== image.byteLength) return pending("codex_expected_image_hash_mismatch");
    const view = availableViews.indexOf(normalized(file)); if (view < 0) return pending("codex_native_view_multiset_mismatch"); availableViews.splice(view, 1);
    const attachment = availableAttachments.findIndex(item => item.sha256 === image.sha256 && item.byteLength === image.byteLength && item.width === image.width && item.height === image.height && item.bytes.equals(bytes));
    if (attachment < 0) return pending("codex_attachment_missing_or_mismatch"); availableAttachments.splice(attachment, 1);
  }
  // Native objects normalize here; the shared AGY contract remains JSON strings only.
  const validation = validateReviewOutputs(batch.manifest, review.outputs.map(output => JSON.stringify(output))); if (!validation.ok) return pending(validation.reason);
  return { ok: true, status: validation.accepted ? "accepted_sampled_frames" : "rejected_sampled_frames", artisticAccepted: validation.accepted, observations: validation.observations,
    manifestSha256: material.manifestSha256, limits: batch.manifest.limits, provenance: { source: "codex-visual-evidence", threadId: evidence.threadId, turnId: evidence.turnId,
      actualViewedImages: expectedImages.length, fullManifestDelivered: true, manifestDeliverySha256: hash(Buffer.from(canonical, "utf8")), sessionLogSha256: evidence.logSha256 } };
}
function verifyCodexBatch(batch, threadId, turnId, options = {}) {
  try { return verifyCodexBatchReview(batch, readCodexTurnEvidence({ ...options, threadId, turnId }), options); }
  catch (error) { return { ok: false, status: "insufficient_material", artisticAccepted: false, reason: error.code || "codex_evidence_unavailable", limits: batch.manifest?.limits }; }
}
function verifyCodexVisualReviewBatches(manifest, refs, options = {}) {
  let built;
  const pending = (reason, batchResults = []) => ({ ok: false, status: "insufficient_material", artisticAccepted: false, reason, batchResults,
    coverage: { reviewedFrames: batchResults.reduce((count, r) => count + r.observations.length, 0), expectedFrames: built ? built.batches.reduce((count, b) => count + b.frameIds.length, 0) : 0 }, limits: manifest?.limits });
  try {
    built = require("./placeholder-visual-batches").buildInspectionBatches(manifest, { ...options, allowManifestWrite: false });
    if (!Array.isArray(refs) || !refs.length || refs.length > 8) return pending("codex_reviews_missing_or_over_budget");
    for (const ref of refs) { if (!ref || typeof ref !== "object" || Array.isArray(ref) || Object.keys(ref).some(key => !["threadId", "turnId"].includes(key))) return pending("codex_review_reference_invalid"); uuid(ref.threadId); uuid(ref.turnId); }
    const keys = refs.map(ref => uuid(ref.threadId) + ":" + uuid(ref.turnId));
    if (new Set(keys).size !== keys.length) return pending("codex_reviews_duplicate_reference");
    if (refs.length !== built.batches.length) return pending("inspection_batch_missing_or_duplicate");
    const loaded = refs.map(ref => readCodexTurnEvidence({ ...options, ...ref })), used = new Set(), batchResults = [];
    for (const batch of built.batches) {
      const candidates = loaded.filter(evidence => evidence.finalAnswer.reviews[0].manifestSha256 === batch.material.manifestSha256);
      if (candidates.length !== 1 || used.has(candidates[0])) return pending("inspection_batch_missing_or_duplicate", batchResults); used.add(candidates[0]);
      const result = verifyCodexBatchReview(batch, candidates[0], options); if (!result.ok) return pending(result.reason, batchResults); batchResults.push(result);
    }
    const observations = batchResults.flatMap(result => result.observations), accepted = batchResults.every(result => result.artisticAccepted);
    return { ok: true, status: accepted ? "accepted_sampled_frames" : "rejected_sampled_frames", artisticAccepted: accepted, observations, batchResults, manifestSha256: built.baseManifestSha256,
      coverage: { reviewedFrames: observations.length, expectedFrames: built.batches.reduce((count, batch) => count + batch.frameIds.length, 0) }, limits: manifest.limits };
  } catch (error) { return pending(error.code || "codex_evidence_unavailable"); }
}
module.exports = { DEFAULT_SESSIONS_ROOT, MAX_SESSION_LOG_BYTES, MAX_SESSION_EVENTS, MAX_IMAGE_BASE64_BYTES, MAX_IMAGE_BYTES,
  findSessionFile, readCodexSessionRecords, extractTurnRecords, readCodexTurnEvidence, verifyCodexBatchReview, verifyCodexBatch, verifyCodexVisualReviewBatches };

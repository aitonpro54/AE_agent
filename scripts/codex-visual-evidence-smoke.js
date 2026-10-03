#!/usr/bin/env node
"use strict";
// Actual-shaped offline contract fixtures; no live AE, provider or user-session writes.
const assert = require("assert/strict"), fs = require("fs"), path = require("path"), os = require("os");
const { randomUUID } = require("crypto"), { pathToFileURL } = require("url");
const { hash } = require("../mcp-server/placeholder-review-service");
const { buildInspectionBatches, verifyVisualReviewBatches } = require("../mcp-server/placeholder-visual-batches");
const { verifyCodexVisualReviewBatches, findSessionFile, readCodexSessionRecords, MAX_SESSION_LOG_BYTES, MAX_SESSION_EVENTS, MAX_IMAGE_BASE64_BYTES } = require("../mcp-server/codex-visual-evidence");
const { validateReviewOutputs } = require("../mcp-server/placeholder-visual-review");
const { visualReviewSelector, tools } = require("../mcp-server/placeholder-review-tools");
const { png } = require("./placeholder-visual-fixture");
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "ae-codex-visual-"));
const workspaceRoot = path.join(temporary, "workspace"), sessionsRoot = path.join(temporary, "sessions");
fs.mkdirSync(workspaceRoot); fs.mkdirSync(sessionsRoot);
const options = { workspaceRoot, sessionsRoot };
let checks = 0;
function check(name, action) { action(); checks++; console.log("PASS: " + name); }
function manifest(count = 3, canonical = false) {
  const image = (name, width, height) => {
    const bytes = png(width, height), filePath = path.join(workspaceRoot, name);
    fs.writeFileSync(filePath, bytes); return { filePath, sha256: hash(bytes), byteLength: bytes.length, width, height };
  };
  return { schema: "ae-placeholder-review-manifest.v1", owner: "fixture-owner", projectKey: "e".repeat(64), receiptHash: "f".repeat(64),
    frames: Array.from({ length: count }, (_, i) => ({ frameId: "frame-" + i, itemId: i + 1, viewKind: "target_comp", image: image("native frame #% " + i + ".png", 320, 180) })),
    sheet: { itemId: 999, image: image("contact sheet.png", 640, 360) }, ...(canonical ? { canonicalBinding: { schema: "offline-fixture" } } : {}), limits: "Only synthetic samples." };
}
function newRef() { return { threadId: randomUUID(), turnId: randomUUID() }; }
function toolOutput(ref, output) { return { type: "response_item", payload: { type: "custom_tool_call_output", call_id: randomUUID(), output,
  internal_chat_message_metadata_passthrough: { turn_id: ref.turnId } } }; }
function recordsFor(batch, ref) {
  const images = [batch.manifest.sheet.image, ...batch.manifest.frames.filter(f => f.viewKind !== "source").map(f => f.image)];
  const final = { schema: "ae-agent-codex-visual-review.v1", reviews: [{ manifestSha256: batch.material.manifestSha256, outputs: batch.frameIds.map(frameId => ({
    frameId, decision: "safe", observation: "Голова человека целиком видна: сверху безопасный отступ, плечи сохраняются у левого и правого края." })) }] };
  const text = JSON.stringify(final);
  return [
    { type: "session_meta", payload: { id: ref.threadId, cwd: workspaceRoot } },
    { type: "event_msg", payload: { type: "task_started", turn_id: ref.turnId } },
    { type: "turn_context", payload: { turn_id: ref.turnId, cwd: workspaceRoot, model: "fixture", effort: "fixture" } },
    { type: "response_item", payload: { type: "agent_message", encrypted_content: "opaque fixture: never decrypt" } },
    toolOutput(ref, [{ type: "input_text", text: batch.material.pin + "\n" + JSON.stringify(batch.manifest) + "\n" }]),
    ...images.map(image => ({ type: "event_msg", payload: { type: "item_completed", thread_id: ref.threadId, turn_id: ref.turnId,
      item: { type: "ImageView", id: randomUUID(), path: pathToFileURL(image.filePath).href } } })),
    toolOutput(ref, images.map(image => ({ type: "input_image", detail: "original", image_url: "data:image/png;base64," + fs.readFileSync(image.filePath).toString("base64") }))),
    { type: "response_item", payload: { type: "message", role: "assistant", phase: "final_answer", content: [{ type: "output_text", text }],
      internal_chat_message_metadata_passthrough: { turn_id: ref.turnId } } },
    { type: "event_msg", payload: { type: "task_complete", turn_id: ref.turnId, last_agent_message: text } }
  ];
}
function finalEdit(records, edit) {
  const final = records.find(r => r.payload?.phase === "final_answer"), json = JSON.parse(final.payload.content[0].text);
  edit(json); const text = JSON.stringify(json); final.payload.content[0].text = text; records.at(-1).payload.last_agent_message = text;
}
function fileFor(ref) { return path.join(sessionsRoot, "rollout-2026-10-03T22-00-00-" + ref.threadId + ".jsonl"); }
function write(ref, records) { fs.writeFileSync(fileFor(ref), records.map(record => JSON.stringify(record)).join("\n") + "\n"); }
function exercise(m, mutation, expectation = false, reason) {
  const built = buildInspectionBatches(m, { workspaceRoot }), ref = newRef(), records = recordsFor(built.batches[0], ref);
  mutation(records, ref, built.batches[0]); write(ref, records);
  const result = verifyCodexVisualReviewBatches(m, [ref], options);
  assert.equal(result.ok, expectation, result.reason); if (reason) assert.equal(result.reason, reason); return result;
}
try {
  const m = manifest();
  check("completed encrypted request + exact tool manifest + native views/original pixels", () => {
    const result = exercise(m, () => {}, true); assert.equal(result.artisticAccepted, true); assert.equal(result.coverage.reviewedFrames, 3);
    assert.equal(result.batchResults[0].provenance.fullManifestDelivered, true);
  });
  check("valid visual reject preserves ok=true, artisticAccepted=false", () => {
    const result = exercise(m, records => finalEdit(records, json => json.reviews[0].outputs[0].decision = "reject"), true);
    assert.equal(result.artisticAccepted, false); assert.equal(result.status, "rejected_sampled_frames");
  });
  check("same SHA at different paths retains both occurrences", () => exercise(m, () => {}, true));
  check("same path/SHA repeated twice requires two native views and attachments", () => {
    const duplicate = structuredClone(m); duplicate.frames[1].image = duplicate.frames[0].image;
    exercise(duplicate, () => {}, true);
    exercise(duplicate, records => records.splice(6, 1), false, "codex_native_view_multiset_mismatch");
    exercise(duplicate, records => records.find(r => r.payload?.output?.some(i => i.type === "input_image")).payload.output.pop(), false, "codex_attachment_multiset_mismatch");
  });
  const imageOutput = records => records.find(r => r.payload?.output?.some(i => i.type === "input_image"));
  const negatives = [
    ["manifest-only control", r => { for (let i = r.length - 1; i >= 0; i--) if (r[i].payload?.item?.type === "ImageView") r.splice(i, 1); imageOutput(r).payload.output = []; }, "codex_native_view_multiset_mismatch"],
    ["sheet-only", r => { for (let i = r.length - 1; i >= 0; i--) if (r[i].payload?.item?.type === "ImageView" && i !== 5) r.splice(i, 1); imageOutput(r).payload.output.splice(1); }, "codex_native_view_multiset_mismatch"],
    ["missing pixels", r => imageOutput(r).payload.output = [], "codex_attachment_multiset_mismatch"],
    ["wrong/resized bytes", r => imageOutput(r).payload.output[1].image_url = "data:image/png;base64," + png(100, 100).toString("base64"), "codex_attachment_missing_or_mismatch"],
    ["missing original detail", r => delete imageOutput(r).payload.output[0].detail, "codex_attachment_original_required"],
    ["invalid base64 encoding", r => imageOutput(r).payload.output[0].image_url += "!", "codex_attachment_size_or_encoding_invalid"],
    ["unknown PNG media type", r => imageOutput(r).payload.output[0].image_url = "data:image/jpeg;base64,abcd", "codex_attachment_not_png_data_url"],
    ["SHA/link-only manifest", (r, _, batch) => r[4].payload.output[0].text = batch.material.pin + "\nAE_PLACEHOLDER_REVIEW_MANIFEST:" + JSON.stringify({ sha256: batch.material.manifestSha256 }), "codex_full_manifest_delivery_missing"],
    ["truncated manifest despite header pin and complete images/final", r => r[4].payload.output[0].text = r[4].payload.output[0].text.slice(0, 600) + "...12129 tokens truncated...", "codex_full_manifest_delivery_missing"],
    ["modified full manifest", r => r[4].payload.output[0].text = r[4].payload.output[0].text.replace("fixture-owner", "other-owner"), "codex_full_manifest_delivery_missing"],
    ["images precede manifest", r => r.splice(r.length - 2, 0, r.splice(4, 1)[0]), "codex_images_precede_manifest_delivery"],
    ["wrong plaintext task pin", (r, ref) => r.splice(4, 0, { type: "event_msg", payload: { type: "user_message", message: "AE_PLACEHOLDER_REVIEW_PIN:" + "0".repeat(64), turn_id: ref.turnId } }), "codex_manifest_pin_mismatch"],
    ["wrong final hash", r => finalEdit(r, json => json.reviews[0].manifestSha256 = "0".repeat(64)), "inspection_batch_missing_or_duplicate"],
    ["wrong final schema", r => finalEdit(r, json => json.schema = "client-evidence"), "codex_final_answer_schema_invalid"],
    ["duplicate reviews in final", r => finalEdit(r, json => json.reviews.push(json.reviews[0])), "codex_final_answer_schema_invalid"],
    ["Codex string observations disallowed", r => finalEdit(r, json => json.reviews[0].outputs = json.reviews[0].outputs.map(JSON.stringify)), "codex_final_answer_schema_invalid"],
    ["generic observations", r => finalEdit(r, json => json.reviews[0].outputs[0].observation = "Кадр хороший, очень гармоничный, красивый и выразительный."), "concrete_sample_observation_required"],
    ["duplicate frame observation", r => finalEdit(r, json => json.reviews[0].outputs[1].frameId = json.reviews[0].outputs[0].frameId), "observation_sample_count_mismatch"],
    ["null frame observation", r => finalEdit(r, json => json.reviews[0].outputs[0] = null), "codex_final_answer_schema_invalid"],
    ["client evidence field in native observation", r => finalEdit(r, json => json.reviews[0].outputs[0].viewed = true), "codex_final_answer_schema_invalid"],
    ["wrong session UUID", r => r[0].payload.id = randomUUID(), "codex_session_thread_identity_mismatch"],
    ["missing session metadata", r => r.splice(0, 1), "codex_session_metadata_missing_or_conflicting"],
    ["wrong session cwd", r => r[0].payload.cwd = temporary, "codex_session_workspace_mismatch"],
    ["wrong context cwd", r => r[2].payload.cwd = temporary, "codex_turn_context_mismatch"],
    ["missing turn context", r => r.splice(2, 1), "codex_turn_context_mismatch"],
    ["wrong ImageView turn", r => r[5].payload.turn_id = randomUUID(), "codex_event_identity_mismatch"],
    ["wrong attachment turn", r => imageOutput(r).payload.internal_chat_message_metadata_passthrough.turn_id = randomUUID(), "codex_event_identity_mismatch"],
    ["wrong final turn", r => r.at(-2).payload.internal_chat_message_metadata_passthrough.turn_id = randomUUID(), "codex_event_identity_mismatch"],
    ["missing final turn identity", r => delete r.at(-2).payload.internal_chat_message_metadata_passthrough, "codex_event_identity_missing"],
    ["missing manifest tool turn identity", r => delete r[4].payload.internal_chat_message_metadata_passthrough, "codex_event_identity_missing"],
    ["images after final", r => r.splice(6, 0, r.splice(r.length - 2, 1)[0]), "codex_images_after_final_answer"],
    ["missing complete", r => r.pop(), "codex_turn_not_completed"],
    ["wrong completed turn", r => r.at(-1).payload.turn_id = randomUUID(), "codex_turn_not_completed"],
    ["interrupted turn", (r, ref) => r.splice(4, 0, { type: "event_msg", payload: { type: "turn_aborted", turn_id: ref.turnId } }), "codex_turn_interrupted_or_overlapping"],
    ["nested unrelated turn", (r, ref) => r.splice(4, 0, { type: "event_msg", payload: { type: "task_started", turn_id: randomUUID() } }), "codex_turn_interrupted_or_overlapping"],
    ["complete/final mismatch", r => r.at(-1).payload.last_agent_message = "other", "codex_final_answer_mismatch_task_complete"],
    ["malformed final JSON", r => { r.at(-2).payload.content[0].text = "{"; r.at(-1).payload.last_agent_message = "{"; }, "codex_final_answer_not_json"],
    ["remote file URI", r => r[5].payload.item.path = "file://remote/share/image.png", "codex_native_view_uri_invalid"],
    ["URI with query", r => r[5].payload.item.path += "?changed", "codex_native_view_uri_invalid"]
  ];
  for (const [name, mutate, reason] of negatives) check(name, () => exercise(m, mutate, false, reason));
  check("pin punctuation and full manifest body binding", () => exercise(m, (r, ref, batch) => r.splice(4, 0, { type: "event_msg", payload: { type: "user_message", message: batch.material.pin + "." } }), true));
  check("canonical pinned manifest file must remain unchanged", () => {
    const canonical = manifest(3, true), batch = buildInspectionBatches(canonical, { workspaceRoot }).batches[0], ref = newRef(); write(ref, recordsFor(batch, ref));
    assert(verifyCodexVisualReviewBatches(canonical, [ref], options).ok);
    const file = batch.material.manifestReference.filePath; fs.writeFileSync(file, "{}");
    assert.equal(verifyCodexVisualReviewBatches(canonical, [ref], options).reason, "inspection_manifest_file_changed");
  });
  check("full owner coverage: 12 samples need two unique completed turns", () => {
    const multi = manifest(12), built = buildInspectionBatches(multi, { workspaceRoot }), refs = built.batches.map(batch => { const ref = newRef(); write(ref, recordsFor(batch, ref)); return ref; });
    const full = verifyCodexVisualReviewBatches(multi, refs, options); assert(full.ok, full.reason); assert.equal(full.coverage.expectedFrames, 12);
    assert.equal(verifyCodexVisualReviewBatches(multi, refs.slice(0, 1), options).reason, "inspection_batch_missing_or_duplicate");
    assert.equal(verifyCodexVisualReviewBatches(multi, [refs[0], refs[0]], options).reason, "codex_reviews_duplicate_reference");
    const duplicate = newRef(); write(duplicate, recordsFor(built.batches[0], duplicate)); assert.equal(verifyCodexVisualReviewBatches(multi, [refs[0], duplicate], options).reason, "inspection_batch_missing_or_duplicate");
  });
  check("invalid UUID (including 36 hyphens) and client flags rejected", () => {
    for (const threadId of ["-".repeat(36), "bad", "z".repeat(36)]) assert.equal(verifyCodexVisualReviewBatches(m, [{ threadId, turnId: randomUUID() }], options).reason, "invalid_codex_uuid");
    assert.equal(verifyCodexVisualReviewBatches(m, [{ ...newRef(), viewed: true }], options).reason, "codex_review_reference_invalid");
  });
  check("selector presence fails closed even for null/empty mixed values", () => {
    const args = { owner: m.owner, codexReviews: [newRef()] }; assert.equal(visualReviewSelector(args).kind, "codex");
    for (const value of [null, "", []]) assert.throws(() => visualReviewSelector({ ...args, inspectionRunId: value }), /mixed_inspection_selectors_forbidden/);
    assert.throws(() => visualReviewSelector({ ...args, sessionsRoot }), /client_evidence_paths_forbidden/);
    assert.throws(() => visualReviewSelector({ ...args, codexReviews: [{ ...newRef(), viewed: true }] }), /codex_review_reference_invalid/);
    const schema = tools.find(tool => tool.name === "verify_placeholder_visual_review").inputSchema;
    assert(!schema.properties.codexReview); assert(!new RegExp(schema.properties.codexReviews.items.properties.threadId.pattern).test("-".repeat(36)));
  });
  check("malformed/incomplete/newline/event/byte budgets", () => {
    for (const [content, reason] of [["{}", "codex_session_log_incomplete"], ["{\n", "codex_session_log_malformed"], [Buffer.from([0xff, 10]), "codex_session_log_malformed"], ["{}\n".repeat(MAX_SESSION_EVENTS + 1), "codex_session_event_budget_exceeded"]]) {
      const ref = newRef(); fs.writeFileSync(fileFor(ref), content); assert.throws(() => readCodexSessionRecords(fileFor(ref), ref.threadId, options), new RegExp(reason)); fs.unlinkSync(fileFor(ref));
    }
    const ref = newRef(), fd = fs.openSync(fileFor(ref), "w"); fs.ftruncateSync(fd, MAX_SESSION_LOG_BYTES + 1); fs.closeSync(fd);
    assert.throws(() => readCodexSessionRecords(fileFor(ref), ref.threadId, options), /codex_session_log_budget_exceeded/); fs.unlinkSync(fileFor(ref));
  });
  check("oversized image payload rejects before base64 decoding", () => {
    exercise(m, records => imageOutput(records).payload.output[0].image_url = "data:image/png;base64," + "A".repeat(MAX_IMAGE_BASE64_BYTES + 4), false, "codex_attachment_size_or_encoding_invalid");
  });
  check("unbounded directory discovery cannot return partial candidate sets", () => {
    const boundedRoot = path.join(temporary, "budget-sessions"); fs.mkdirSync(boundedRoot);
    for(let i=0;i<513;i++)fs.mkdirSync(path.join(boundedRoot,"day-"+i));
    assert.throws(() => findSessionFile(boundedRoot, randomUUID()), /codex_session_search_budget_exceeded/);
  });
  check("no header fallback; conflicting official filenames fail closed", () => {
    const ref = newRef(), batch = buildInspectionBatches(m, { workspaceRoot }).batches[0], unofficial = path.join(sessionsRoot, "unofficial.jsonl");
    write(ref, recordsFor(batch, ref)); fs.renameSync(fileFor(ref), unofficial); assert.throws(() => findSessionFile(sessionsRoot, ref.threadId), /codex_session_thread_not_found/);
    fs.renameSync(unofficial, fileFor(ref)); const second = path.join(sessionsRoot, "rollout-other-" + ref.threadId + ".jsonl"); fs.copyFileSync(fileFor(ref), second);
    assert.throws(() => findSessionFile(sessionsRoot, ref.threadId), /codex_session_thread_conflict/); fs.unlinkSync(second);
  });
  check("junction/symlink escape rejected before reading external files", () => {
    const external = path.join(temporary, "external"), link = path.join(sessionsRoot, "escape"); fs.mkdirSync(external);
    fs.symlinkSync(external, link, process.platform === "win32" ? "junction" : "dir");
    try { assert.throws(() => findSessionFile(sessionsRoot, randomUUID()), /codex_sessions_containment_escape/); } finally { fs.rmdirSync(link); }
  });
  check("FD short read and same-size replacement fail closed", () => {
    const ref = newRef(), batch = buildInspectionBatches(m, { workspaceRoot }).batches[0]; write(ref, recordsFor(batch, ref));
    const originalRead = fs.readSync; let once = false;
    try { fs.readSync = (...args) => { if (!once) { once = true; return 0; } return originalRead(...args); }; assert.throws(() => readCodexSessionRecords(fileFor(ref), ref.threadId, options), /codex_session_log_unstable/); } finally { fs.readSync = originalRead; }
    once = false;
    try { fs.readSync = (...args) => { const result = originalRead(...args); if (!once) { once = true; const file = fileFor(ref), bytes = fs.readFileSync(file), next = file + ".next"; fs.writeFileSync(next, bytes); fs.renameSync(file, file + ".old"); fs.renameSync(next, file); } return result; };
      assert.throws(() => readCodexSessionRecords(fileFor(ref), ref.threadId, options), /codex_session_log_unstable/);
    } finally { fs.readSync = originalRead; }
  });
  check("AGY contract remains JSON strings; objects/null/arrays never normalize implicitly", () => {
    const outputs = m.frames.map(frame => ({ frameId: frame.frameId, decision: "safe", observation: "Голова человека полностью видна; сверху достаточно отступа, левый и правый края сохраняют фигуру." }));
    assert(validateReviewOutputs(m, outputs.map(JSON.stringify)).ok);
    for (const bad of [outputs, ["null", ...outputs.slice(1).map(JSON.stringify)], ["[]", ...outputs.slice(1).map(JSON.stringify)]]) assert.equal(validateReviewOutputs(m, bad).ok, false);
    assert.equal(verifyVisualReviewBatches(m, [{ threadId: randomUUID(), turnId: randomUUID() }], options).reason, "inspection_run_identity_conflict");
  });
  check("concrete four-side margin phrase with absent people is valid rejection", () => {
    const result = exercise(m, r => finalEdit(r, json => { json.reviews[0].outputs[0].decision = "reject"; json.reviews[0].outputs[0].observation = "Белая внутренняя рамка отсутствует; контрольные поля по четырём сторонам оценить нельзя. Людей и голов не видно."; }), true);
    assert.equal(result.artisticAccepted, false);
    const generic = m.frames.map(frame => JSON.stringify({ frameId: frame.frameId, decision: "safe", observation: "Людей и голов не видно, контрольные поля красивы и выглядят гармонично." }));
    assert.equal(validateReviewOutputs(m, generic).ok, false);
  });
  console.log("PASS: " + checks + " offline Codex evidence checks; live AE/provider 0.");
} finally {
  // The only recursive deletion is the exact mkdtemp root created by this script.
  assert(path.resolve(temporary).startsWith(path.resolve(os.tmpdir()) + path.sep)); fs.rmSync(temporary, { recursive: true, force: true });
}

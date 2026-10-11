"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { normalizeProjectLifecycleState } = require("./project-lifecycle-state");

const SCHEMA = "ae-agent.ame-clean-saved-source.v1";
const OPERATION = "ame_clean_saved_source_copy";
const MAX_BYTES = 1024 * 1024 * 1024;
const CHUNK_BYTES = 64 * 1024;
const sha = value => crypto.createHash("sha256").update(value).digest("hex");
const digest = value => sha(JSON.stringify(value));
const same = (a, b) => digest(a) === digest(b);
const samePath = (a, b) => process.platform === "win32" ? a.toLowerCase() === b.toLowerCase() : a === b;
function need(test, code) { if (!test) { const error = new Error(code); error.code = code; throw error; } }
function exact(value, keys, code = "clean_source_invalid_private_facts") {
  need(value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === keys.length && keys.every(k => Object.hasOwn(value, k)), code);
}
function text(value) { need(typeof value === "string" && value.length > 0 && value.length <= 4096 && value === value.trim() && !/[\x00-\x1f]/.test(value), "clean_source_invalid_text"); return value; }
function id(value) { need(Number.isSafeInteger(value) && value > 0, "clean_source_invalid_id"); return value; }
function ids(value) {
  need(Array.isArray(value) && value.length > 0 && value.length <= 64 && new Set(value).size === value.length, "clean_source_invalid_ids");
  return value.map(id).sort((a, b) => a - b);
}
function localPath(value) {
  text(value);
  need(path.isAbsolute(value) && !/^(\\\\|\/\/)/.test(value) && !value.replace(/\\/g, "/").split("/").some(v => v === "." || v === "..") &&
    !(process.platform === "win32" && /:/.test(value.slice(2))), "clean_source_nonlocal_or_aliased_path");
  return path.resolve(value);
}
function fileId(stat) { need(stat.dev >= 0n && stat.ino > 0n, "clean_source_file_id_unavailable"); return `${stat.dev}:${stat.ino}`; }
function stamp(stat) { return { fileId: fileId(stat), bytes: String(stat.size), mtimeNs: String(stat.mtimeNs), ctimeNs: String(stat.ctimeNs), birthtimeNs: String(stat.birthtimeNs), links: String(stat.nlink) }; }
function metadata(facts) { const { fileId, bytes, mtimeNs, ctimeNs, birthtimeNs, links } = facts; return { fileId, bytes, mtimeNs, ctimeNs, birthtimeNs, links }; }
function freeze(value) { if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
function clone(value) { return JSON.parse(JSON.stringify(value)); }

// Bounded path checks, not a same-user hostile-writer or held Win32-handle guarantee.
async function directories(directory) {
  const target = localPath(directory), result = [];
  for (let cursor = target; ; cursor = path.dirname(cursor)) {
    const stat = await fs.promises.lstat(cursor, { bigint: true });
    need(stat.isDirectory() && !stat.isSymbolicLink() && samePath(await fs.promises.realpath(cursor), cursor), "clean_source_directory_reparse_or_escape");
    result.push({ path: cursor, fileId: fileId(stat) });
    if (path.dirname(cursor) === cursor) break;
  }
  return result;
}
async function makeDirectory(directory) {
  try { await fs.promises.mkdir(directory, { mode: 0o700 }); } catch (error) { if (error.code !== "EEXIST") throw error; }
  return directories(directory);
}
async function fileFacts(file) {
  const resolved = localPath(file), parents = await directories(path.dirname(resolved));
  const initial = await fs.promises.lstat(resolved, { bigint: true });
  need(initial.isFile() && !initial.isSymbolicLink() && samePath(await fs.promises.realpath(resolved), resolved), "clean_source_regular_canonical_file_required");
  need(initial.size > 0n && initial.size <= BigInt(MAX_BYTES), "clean_source_file_size_outside_bound");
  const handle = await fs.promises.open(resolved, "r");
  try {
    const before = await handle.stat({ bigint: true });
    need(same(stamp(initial), stamp(before)), "clean_source_file_identity_changed");
    const hash = crypto.createHash("sha256"); let bytes = 0;
    for await (const chunk of handle.createReadStream({ autoClose: false })) { bytes += chunk.length; need(bytes <= MAX_BYTES, "clean_source_file_size_outside_bound"); hash.update(chunk); }
    const after = await handle.stat({ bigint: true }), current = await fs.promises.lstat(resolved, { bigint: true });
    need(current.isFile() && !current.isSymbolicLink() && samePath(await fs.promises.realpath(resolved), resolved) &&
      same(stamp(before), stamp(after)) && same(stamp(after), stamp(current)) && same(parents, await directories(path.dirname(resolved))) && BigInt(bytes) === after.size,
    "clean_source_file_changed_during_read");
    return { path: resolved, ...stamp(after), sha256: hash.digest("hex") };
  } finally { await handle.close(); }
}

// Retain exclusive output handle: unlike copyFile, failure never triggers unlink.
// The internal boundary callback runs synchronously before open and every write.
async function controlledCopy(source, output, boundary) {
  const input = await fs.promises.open(source.path, "r"); let destination = null;
  try {
    const before = await input.stat({ bigint: true });
    need(before.isFile() && same(stamp(before), metadata(source)), "clean_source_held_source_identity_drift");
    boundary(); destination = await fs.promises.open(output, "wx+", 0o600);
    const created = await destination.stat({ bigint: true });
    need(created.isFile() && created.nlink === 1n && fileId(created) !== source.fileId, "clean_source_exclusive_output_identity_required");
    const buffer = Buffer.allocUnsafe(CHUNK_BYTES), hash = crypto.createHash("sha256"), expectedBytes = Number(source.bytes); let position = 0;
    while (position < expectedBytes) {
      const read = await input.read(buffer, 0, Math.min(CHUNK_BYTES, expectedBytes - position), position);
      need(read.bytesRead > 0, "clean_source_copy_input_truncated");
      hash.update(buffer.subarray(0, read.bytesRead)); let offset = 0;
      while (offset < read.bytesRead) {
        boundary(); const written = await destination.write(buffer, offset, read.bytesRead - offset, position + offset);
        need(written.bytesWritten > 0, "clean_source_copy_zero_write"); offset += written.bytesWritten;
      }
      position += read.bytesRead;
    }
    const excess = await input.read(buffer, 0, 1, position); need(excess.bytesRead === 0, "clean_source_copy_input_grew");
    await destination.sync();
    const afterInput = await input.stat({ bigint: true }), copied = await fileFacts(output), heldOutput = await destination.stat({ bigint: true });
    need(same(stamp(before), stamp(afterInput)) && copied.sha256 === hash.digest("hex") && copied.sha256 === source.sha256 && copied.bytes === source.bytes &&
      copied.links === "1" && copied.fileId !== source.fileId && same(metadata(copied), stamp(heldOutput)), "clean_source_controlled_copy_identity_or_hash_drift");
    return copied;
  } finally {
    try { if (destination) await destination.close(); } finally { await input.close(); }
  }
}

function identity(raw) {
  exact(raw, ["sourceSessionId", "aePid", "aeBirth100ns", "actor"]);
  text(raw.sourceSessionId); id(raw.aePid); need(typeof raw.aeBirth100ns === "string" && /^[1-9][0-9]{0,19}$/.test(raw.aeBirth100ns), "clean_source_process_birth_required");
  exact(raw.actor, ["panelInstanceId", "panelLifecycleEpoch", "panelGeneration", "targetId"]);
  text(raw.actor.panelInstanceId); text(raw.actor.panelGeneration); text(raw.actor.targetId);
  need(Number.isSafeInteger(raw.actor.panelLifecycleEpoch) && raw.actor.panelLifecycleEpoch >= 0, "clean_source_actor_epoch_required");
  return clone(raw);
}
function selection(raw) {
  exact(raw, ["rootCompItemId", "variantCompItemId", "controlledLayerIds", "variants"]);
  const result = { rootCompItemId: id(raw.rootCompItemId), variantCompItemId: id(raw.variantCompItemId), controlledLayerIds: ids(raw.controlledLayerIds), variants: [] };
  need(Array.isArray(raw.variants) && raw.variants.length > 0 && raw.variants.length <= 64, "clean_source_variants_required");
  for (const v of raw.variants) {
    exact(v, ["variantId", "activeLayerIds", "range"]); exact(v.range, ["startFrame", "frameCount"]);
    const activeLayerIds = ids(v.activeLayerIds);
    need(activeLayerIds.every(i => result.controlledLayerIds.includes(i)) && Number.isSafeInteger(v.range.startFrame) && v.range.startFrame >= 0 &&
      Number.isSafeInteger(v.range.frameCount) && v.range.frameCount > 0 && Number.isSafeInteger(v.range.startFrame + v.range.frameCount), "clean_source_variant_scope_invalid");
    result.variants.push({ variantId: text(v.variantId), activeLayerIds, range: clone(v.range) });
  }
  need(new Set(result.variants.map(v => v.variantId)).size === result.variants.length, "clean_source_duplicate_variant"); return result;
}
function binding(raw, key) {
  exact(raw, ["actionId", "runId", "operation", "actionLease", "expectedSourceFile", "expectedRevision", "expectedSelectionSha256", "expectedNativeIdentity", "selection"]);
  need(raw.actionId === key.actionId && raw.runId === key.runId && raw.operation === OPERATION, "clean_source_server_record_mismatch");
  const file = localPath(raw.expectedSourceFile);
  need(/\.aep$/i.test(file) && Number.isSafeInteger(raw.expectedRevision) && raw.expectedRevision >= 0 && /^[a-f0-9]{64}$/.test(raw.expectedSelectionSha256), "clean_source_server_baseline_invalid");
  return { ...clone(raw), actionLease: actionLease(raw.actionLease), expectedSourceFile: file, expectedNativeIdentity: identity(raw.expectedNativeIdentity), selection: selection(raw.selection) };
}
function actionLease(raw) {
  exact(raw, ["actionGeneration", "contextGeneration", "expiresAtMs", "terminalState"], "clean_source_action_boundary_invalid");
  need([raw.actionGeneration, raw.contextGeneration].every(v => Number.isSafeInteger(v) && v >= 0) && Number.isSafeInteger(raw.expiresAtMs) && raw.expiresAtMs > 0 &&
    ["executing", "revoked", "completed", "failed", "unknown"].includes(raw.terminalState), "clean_source_action_boundary_invalid"); return clone(raw);
}
function titleFacts(raw, expected) {
  exact(raw, ["rootCompItemId", "variantCompItemId", "controlledLayerIds", "frameDuration", "duration", "graph", "controlled", "definitionSha256"]);
  need(raw.rootCompItemId === expected.rootCompItemId && raw.variantCompItemId === expected.variantCompItemId && same(ids(raw.controlledLayerIds), expected.controlledLayerIds) &&
    Number.isFinite(raw.frameDuration) && raw.frameDuration > 0 && Number.isFinite(raw.duration) && raw.duration > 0 && /^[a-f0-9]{64}$/.test(raw.definitionSha256), "clean_source_title_target_invalid");
  need(Array.isArray(raw.graph) && raw.graph.length > 0 && raw.graph.length <= 100 && Array.isArray(raw.controlled) && raw.controlled.length === expected.controlledLayerIds.length, "clean_source_title_graph_bound");
  const graph = new Map(); let total = 0;
  for (const node of raw.graph) {
    exact(node, ["id", "layers"]); id(node.id); need(!graph.has(node.id) && Array.isArray(node.layers), "clean_source_title_graph_ambiguous");
    total += node.layers.length; need(total <= 1000, "clean_source_title_graph_bound"); const seen = new Set();
    for (const layer of node.layers) {
      exact(layer, ["id", "sourceCompItemId", "enabled", "solo", "guide", "locked", "kind"]); id(layer.id);
      need(!seen.has(layer.id) && [layer.enabled, layer.solo, layer.guide, layer.locked].every(v => typeof v === "boolean") && !layer.solo &&
        ["text", "comp", "other"].includes(layer.kind) && (layer.sourceCompItemId === null || layer.kind === "comp" && id(layer.sourceCompItemId)), "clean_source_title_layer_invalid");
      seen.add(layer.id);
    }
    graph.set(node.id, node);
  }
  let visits = 0, occurrences = 0; const reached = new Set();
  function walk(compId, stack, live) {
    need(++visits <= 100 && !stack.includes(compId) && graph.has(compId), "clean_source_title_graph_cycle_or_missing"); reached.add(compId);
    if (compId === expected.variantCompItemId) { occurrences++; need(live, "clean_source_variant_path_disabled"); }
    for (const layer of graph.get(compId).layers) if (layer.sourceCompItemId !== null) {
      need(!layer.guide && !layer.locked, "clean_source_variant_path_flags"); walk(layer.sourceCompItemId, stack.concat(compId), live && layer.enabled);
    }
  }
  walk(expected.rootCompItemId, [], true);
  need(occurrences === 1 && reached.size === graph.size, "clean_source_variant_not_uniquely_reachable");
  const controlled = new Set(), target = graph.get(expected.variantCompItemId);
  for (const row of raw.controlled) {
    exact(row, ["id", "enabled", "text"]); const layer = target.layers.find(v => v.id === row.id);
    need(expected.controlledLayerIds.includes(row.id) && !controlled.has(row.id) && layer && layer.kind === "text" && !layer.guide && !layer.locked &&
      row.enabled === layer.enabled && typeof row.text === "string" && row.text.length <= 65536, "clean_source_controlled_layer_invalid"); controlled.add(row.id);
  }
  const frames = Math.floor(raw.duration / raw.frameDuration + 0.000001);
  need(expected.variants.every(v => v.range.startFrame + v.range.frameCount <= frames), "clean_source_range_outside_comp");
  return clone(raw);
}
function nativeFacts(raw, record) {
  exact(raw, ["identity", "lifecycle", "titleGraph"]);
  const lifecycle = normalizeProjectLifecycleState(raw.lifecycle);
  need(lifecycle.lifecycleReady && lifecycle.project === "named", "clean_source_named_supported_lifecycle_required");
  need(lifecycle.dirty === false, "clean_source_dirty_refused");
  need(samePath(localPath(lifecycle.file), record.expectedSourceFile) && lifecycle.revision === record.expectedRevision, "clean_source_path_or_revision_drift");
  const trustedIdentity = identity(raw.identity), title = titleFacts(raw.titleGraph, record.selection);
  need(same(trustedIdentity, record.expectedNativeIdentity), "clean_source_session_or_actor_drift");
  need(digest(title) === record.expectedSelectionSha256, "clean_source_title_fingerprint_drift");
  return { identity: trustedIdentity, lifecycle: { file: lifecycle.file, dirty: lifecycle.dirty, revision: lifecycle.revision, supported: lifecycle.supported }, titleGraph: title };
}
function stageDraft(receipt, record) {
  const enabled = new Map(receipt.nativeBefore.titleGraph.controlled.map(v => [v.id, v.enabled]));
  return freeze({ schema: SCHEMA + ".stage-draft", status: "DRAFT", authority: false, wired: false, readyForStage: false,
    snapshotScope: "on_disk_saved_state", memorySnapshot: false, productionBackend: false,
    sourceReceiptSha256: digest(receipt), copiedBaseline: clone(receipt.copiedBaseline), sourceIdentity: clone(receipt.nativeBefore.identity),
    sourceRevision: record.expectedRevision, selectedVariantFingerprint: record.expectedSelectionSha256,
    rootCompItemId: record.selection.rootCompItemId, variantCompItemId: record.selection.variantCompItemId, controlledLayerIds: record.selection.controlledLayerIds.slice(),
    variants: record.selection.variants.map(v => ({ ...clone(v), allowedVisibilityDeltas: record.selection.controlledLayerIds.map(layerId =>
      ({ layerId, before: enabled.get(layerId), after: v.activeLayerIds.includes(layerId) })).filter(v => v.before !== v.after) })),
    dependencyCoverage: "not_inspected", nativeStageExecutor: "absent", ameDelivery: "absent" });
}

/** Private factory only; NEVER expose dependencies or accept their facts via MCP.
 * readValidatedServerAction(key): validates stored action/hash/revision/expiry,
 * confirmation, context and ownership, and returns the exact server-owned binding.
 * readNativeSource(record): fresh targeted trusted session/PID/birth/actor + native
 * lifecycle/title graph read; cache, remote assertions and allow flags are invalid.
 * readServerActionBoundary(key): SYNCHRONOUS authoritative lease/generation/state
 * read in the same server isolate; all invalidations must update it immediately.
 * No implementation of these runtime adapters is supplied by this foundation.
 */
function createFoundation(deps) {
  exact(deps, ["workspaceRoot", "readValidatedServerAction", "readNativeSource", "readServerActionBoundary"], "clean_source_private_adapters_required");
  const workspace = localPath(deps.workspaceRoot);
  need(typeof deps.readValidatedServerAction === "function" && typeof deps.readNativeSource === "function" && typeof deps.readServerActionBoundary === "function", "clean_source_private_adapters_required");
  const base = path.join(workspace, ".codex-runtime", "ame-clean-saved-source"), reservations = path.join(base, "reservations");
  const proofs = new WeakMap(); let busy = false;
  async function readRecord(key) { return freeze(binding(await deps.readValidatedServerAction(freeze(clone(key))), key)); }
  async function readNative(record) { return freeze(nativeFacts(await deps.readNativeSource(record), record)); }
  function assertBoundary(record) {
    const raw = deps.readServerActionBoundary(Object.freeze({ actionId: record.actionId, runId: record.runId }));
    need(raw && typeof raw.then !== "function", "clean_source_action_boundary_must_be_synchronous"); const current = actionLease(raw), expected = record.actionLease;
    need(current.terminalState === "executing" && expected.terminalState === "executing", "clean_source_action_terminal_revoked");
    need(current.actionGeneration === expected.actionGeneration && current.contextGeneration === expected.contextGeneration, "clean_source_action_generation_drift");
    need(current.expiresAtMs === expected.expiresAtMs && Date.now() < current.expiresAtMs, "clean_source_action_expired_or_lease_changed");
  }
  async function inspectSource(raw) {
    exact(raw, ["actionId", "runId"], "clean_source_only_action_run_input"); const key = { actionId: text(raw.actionId), runId: text(raw.runId) };
    const record = await readRecord(key), native = await readNative(record), source = await fileFacts(record.expectedSourceFile);
    need(same(native, await readNative(record)) && same(record, await readRecord(key)), "clean_source_delayed_reader_drift");
    assertBoundary(record);
    const proof = Object.freeze({}); proofs.set(proof, { key, record, native, source, state: "prepared" }); return proof;
  }
  async function copySavedSource(proof) {
    const p = proofs.get(proof); need(p && p.state === "prepared" && !busy, "clean_source_private_proof_or_replay_required");
    p.state = "consumed"; busy = true;
    let ledger = null, root = null, output = null, effect = false, attemptId = null;
    function append(event) { fs.writeFileSync(ledger, JSON.stringify({ ...event, at: new Date().toISOString() }) + "\n"); fs.fsyncSync(ledger); }
    try {
      const record = await readRecord(p.key), before = await readNative(record), source = await fileFacts(record.expectedSourceFile);
      need(same(record, p.record) && same(before, p.native) && same(source, p.source), "clean_source_pre_copy_drift");
      const workspaceIdentity = await directories(workspace);
      await makeDirectory(path.dirname(base)); await makeDirectory(base); const parentIdentity = await makeDirectory(reservations);
      attemptId = digest({ operation: OPERATION, ...p.key });
      const reservationPath = path.join(reservations, attemptId + ".jsonl");
      try { ledger = fs.openSync(reservationPath, "wx", 0o600); } catch (error) { if (error.code === "EEXIST") need(false, "clean_source_durable_replay_refused"); throw error; }
      const ledgerId = fileId(fs.fstatSync(ledger, { bigint: true }));
      root = path.join(base, crypto.randomUUID()); output = path.join(root, "baseline.aep");
      append({ schema: SCHEMA, state: "reserved", attemptId, ...p.key, root, output, replayAllowed: false });
      await fs.promises.mkdir(root, { mode: 0o700 }); const rootIdentity = await directories(root);
      need(same(workspaceIdentity, await directories(workspace)) && same(parentIdentity, await directories(reservations)) &&
        fileId(await fs.promises.lstat(reservationPath, { bigint: true })) === ledgerId &&
        same(record, await readRecord(p.key)) && same(source, await fileFacts(record.expectedSourceFile)) && same(before, await readNative(record)), "clean_source_before_effect_drift");
      try { await fs.promises.lstat(output); need(false, "clean_source_output_exists"); } catch (error) { if (error.code !== "ENOENT") throw error; }
      append({ state: "copy_may_have_occurred", attemptId });
      // The only source operation is read/copy; no save/open/new/rename/delete.
      const copied = await controlledCopy(source, output, () => { assertBoundary(record); effect = true; });
      const afterSource = await fileFacts(record.expectedSourceFile), after = await readNative(record);
      need(same(rootIdentity, await directories(root)) && same(parentIdentity, await directories(reservations)) &&
        same(record, await readRecord(p.key)) && same(source, afterSource) && same(before, after) &&
        samePath(copied.path, output) && copied.fileId !== source.fileId && copied.links === "1" && copied.sha256 === source.sha256 && copied.bytes === source.bytes,
      "clean_source_after_copy_drift_or_nonindependent_file");
      // Readers may have been delayed. Recheck actual files after those awaits;
      // metadata/path echoes from an earlier reader cannot finish the receipt.
      need(same(copied, await fileFacts(output)) && same(source, await fileFacts(record.expectedSourceFile)) && same(after, await readNative(record)) &&
        same(rootIdentity, await directories(root)) && same(parentIdentity, await directories(reservations)) &&
        fileId(await fs.promises.lstat(reservationPath, { bigint: true })) === ledgerId, "clean_source_delayed_after_copy_drift");
      const receipt = freeze({ schema: SCHEMA, state: "copied_saved_source", attemptId, ...p.key, authority: false,
        snapshotScope: "on_disk_saved_state", memorySnapshot: false, productionBackend: false, sourceBefore: source, sourceAfter: afterSource,
        nativeBefore: before, nativeAfter: after, copiedBaseline: copied, actionLease: record.actionLease, replayAllowed: false, runtimeAdapterCoverage: "unwired_private_contract" });
      const result = freeze({ ok: true, state: "copied_saved_source", receipt, stageDraft: stageDraft(receipt, record), replayAllowed: false });
      assertBoundary(record); append({ state: "consumed", attemptId, receipt });
      // No await remains: acceptance and ledger close are synchronous. Check real
      // expiry again after fsync, which may itself have taken time.
      assertBoundary(record);
      return result;
    } catch (error) {
      const state = effect ? "UNKNOWN" : "REFUSED_BEFORE_COPY";
      if (ledger !== null) { try { append({ state, attemptId, code: error.code || "clean_source_io_or_reader_error", replayAllowed: false }); } catch (_) { /* initial durable reservation remains consumed/unknown; never replay */ } }
      return freeze({ ok: false, state, code: error.code || "clean_source_io_or_reader_error", attemptId, artifactRoot: root, copiedPath: output, replayAllowed: false, artifactPreserved: root !== null });
    } finally { if (ledger !== null) { try { fs.closeSync(ledger); } catch (_) {} } busy = false; }
  }
  return Object.freeze({ inspectSource, copySavedSource });
}

module.exports = { SCHEMA, OPERATION, createFoundation };

"use strict";

// Real temporary filesystem; every native/action adapter below is FAKE, never AE.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const crypto = require("node:crypto");
const { createFoundation, OPERATION } = require("../mcp-server/ame-clean-saved-source");
const clone = v => JSON.parse(JSON.stringify(v));
const hash = v => crypto.createHash("sha256").update(v).digest("hex");
const digest = v => hash(JSON.stringify(v));
let checks = 0;
function check(test, message) { assert.ok(test, message); checks++; }

async function main() {
  const temporaryParent = await fs.promises.realpath(os.tmpdir());
  const root = await fs.promises.mkdtemp(path.join(temporaryParent, "ae-clean-saved-source-smoke-"));
  const rootStat = await fs.promises.lstat(root, { bigint: true });
  let serial = 0;
  async function fixture(customBytes) {
    const workspace = path.join(root, `case-${++serial}`); await fs.promises.mkdir(workspace);
    const source = path.join(workspace, "source.aep"), bytes = customBytes || Buffer.from("FAKE-AEP saved state: title A\n"); await fs.promises.writeFile(source, bytes);
    const identity = { sourceSessionId: "fake-session", aePid: 9001, aeBirth100ns: "134046876000000001", actor: { panelInstanceId: "fake-panel", panelLifecycleEpoch: 1, panelGeneration: "fake-generation", targetId: "fake-target" } };
    const selection = { rootCompItemId: 10, variantCompItemId: 20, controlledLayerIds: [201, 202], variants: [
      { variantId: "title-a", activeLayerIds: [201], range: { startFrame: 0, frameCount: 48 } },
      { variantId: "title-b", activeLayerIds: [202], range: { startFrame: 48, frameCount: 24 } }
    ] };
    const titleGraph = { rootCompItemId: 10, variantCompItemId: 20, controlledLayerIds: [201, 202], frameDuration: 1 / 24, duration: 5,
      graph: [{ id: 10, layers: [{ id: 101, sourceCompItemId: 20, enabled: true, solo: false, guide: false, locked: false, kind: "comp" }] },
        { id: 20, layers: [201, 202].map(id => ({ id, sourceCompItemId: null, enabled: id === 201, solo: false, guide: false, locked: false, kind: "text" })) }],
      controlled: [{ id: 201, enabled: true, text: "Title A" }, { id: 202, enabled: false, text: "Title B" }], definitionSha256: hash("fake bounded definition") };
    const key = { actionId: `fake-action-${serial}`, runId: "fake-run" };
    const lease = { actionGeneration: 1, contextGeneration: 1, expiresAtMs: Date.now() + 60000, terminalState: "executing" };
    const record = { ...key, operation: OPERATION, actionLease: clone(lease), expectedSourceFile: source, expectedRevision: 42, expectedSelectionSha256: digest(titleGraph), expectedNativeIdentity: clone(identity), selection: clone(selection) };
    const native = { identity, lifecycle: { projectPresent: true, file: source, dirty: false, revision: 42, supported: { appVersion: false, file: true, dirty: true, revision: true } }, titleGraph };
    let reads = 0, hook = null, actionHook = null;
    const deps = { workspaceRoot: workspace,
      readValidatedServerAction: async request => { assert.deepEqual(request, key); if (actionHook) await actionHook(); return clone(record); },
      readNativeSource: async () => { reads++; if (hook) await hook(reads); return clone(native); },
      readServerActionBoundary: request => { assert.deepEqual(request, key); return clone(lease); } };
    return { workspace, source, bytes, identity, selection, titleGraph, key, record, lease, native, deps, foundation: createFoundation(deps),
      hook: value => { hook = value; }, actionHook: value => { actionHook = value; }, get reads() { return reads; } };
  }
  async function rejectedInspect(change, code) {
    const f = await fixture(); await change(f);
    await assert.rejects(() => f.foundation.inspectSource(f.key), e => e.code === code); checks++;
    check(!fs.existsSync(path.join(f.workspace, ".codex-runtime")), "inspection refusal created no output/ledger");
  }
  try {
    const f = await fixture(), sourceBefore = await fs.promises.stat(f.source, { bigint: true });
    const proof = await f.foundation.inspectSource(f.key);
    await assert.rejects(() => f.foundation.copySavedSource({}), e => e.code === "clean_source_private_proof_or_replay_required"); checks++;
    await assert.rejects(() => f.foundation.inspectSource({ ...f.key, authorized: true }), e => e.code === "clean_source_only_action_run_input"); checks++;
    const success = await f.foundation.copySavedSource(proof);
    check(success.ok && success.state === "copied_saved_source", "copy completed using real filesystem");
    const copied = success.receipt.copiedBaseline, sourceAfter = await fs.promises.stat(f.source, { bigint: true });
    check(copied.sha256 === hash(f.bytes) && copied.bytes === String(f.bytes.length), "copy bytes/hash read independently");
    check(copied.fileId !== `${sourceAfter.dev}:${sourceAfter.ino}` && copied.links === "1", "copy has a new regular FileID, not a hardlink");
    check(sourceBefore.ino === sourceAfter.ino && sourceBefore.mtimeNs === sourceAfter.mtimeNs && sourceBefore.ctimeNs === sourceAfter.ctimeNs, "source identity/mtime/ctime stayed unchanged");
    check(path.relative(path.join(f.workspace, ".codex-runtime", "ame-clean-saved-source"), copied.path).split(path.sep).length === 2 && path.basename(copied.path) === "baseline.aep", "server owned UUID root and fixed filename");
    const draft = success.stageDraft;
    check(draft.status === "DRAFT" && draft.authority === false && draft.readyForStage === false && draft.wired === false && draft.memorySnapshot === false && draft.productionBackend === false, "manifest has no execution authority");
    assert.deepEqual(draft.variants[1].allowedVisibilityDeltas, [{ layerId: 201, before: true, after: false }, { layerId: 202, before: false, after: true }]); checks++;
    check(draft.sourceReceiptSha256 === digest(success.receipt) && draft.copiedBaseline.sha256 === copied.sha256 && draft.dependencyCoverage === "not_inspected" && draft.nativeStageExecutor === "absent", "stage draft binds receipt/copy and states missing coverage");
    await assert.rejects(() => f.foundation.copySavedSource(proof), e => e.code === "clean_source_private_proof_or_replay_required"); checks++;
    const restarted = createFoundation(f.deps), restartProof = await restarted.inspectSource(f.key), replay = await restarted.copySavedSource(restartProof);
    check(!replay.ok && replay.code === "clean_source_durable_replay_refused" && replay.state === "REFUSED_BEFORE_COPY", "durable reservation blocks replay after factory restart");
    await fs.promises.writeFile(copied.path, "independent destination change");
    check(hash(await fs.promises.readFile(f.source)) === hash(f.bytes), "destination edit cannot edit source bytes");

    await rejectedInspect(f => { f.native.lifecycle.dirty = true; }, "clean_source_dirty_refused");
    await rejectedInspect(f => { f.native.lifecycle.file = null; }, "clean_source_named_supported_lifecycle_required");
    await rejectedInspect(f => { f.native.lifecycle.supported.revision = false; }, "clean_source_named_supported_lifecycle_required");
    await rejectedInspect(f => { f.native.lifecycle.supported.dirty = false; }, "clean_source_named_supported_lifecycle_required");
    await rejectedInspect(f => { f.native.lifecycle.revision++; }, "clean_source_path_or_revision_drift");
    await rejectedInspect(f => { f.native.identity.aePid++; }, "clean_source_session_or_actor_drift");
    await rejectedInspect(f => { f.native.identity.sourceSessionId = "foreign-session"; }, "clean_source_session_or_actor_drift");
    await rejectedInspect(f => { f.native.identity.actor.targetId = "foreign-target"; }, "clean_source_session_or_actor_drift");
    await rejectedInspect(f => { f.titleGraph.controlled[0].text = "changed title"; }, "clean_source_title_fingerprint_drift");
    await rejectedInspect(f => { f.titleGraph.graph[0].layers[0].sourceCompItemId = 10; }, "clean_source_title_graph_cycle_or_missing");
    await rejectedInspect(f => { f.hook(n => { if (n === 2) f.native.lifecycle.dirty = true; }); }, "clean_source_dirty_refused");
    await rejectedInspect(f => { f.record.allowed = true; }, "clean_source_invalid_private_facts");
    await rejectedInspect(f => { f.deps.readServerActionBoundary = async () => clone(f.lease); }, "clean_source_action_boundary_must_be_synchronous");
    await rejectedInspect(f => { f.deps.readServerActionBoundary = () => ({ ...clone(f.lease), authorized: true }); }, "clean_source_action_boundary_invalid");

    for (const [name, invalidate, code] of [
      ["generation", f => { f.lease.actionGeneration++; }, "clean_source_action_generation_drift"],
      ["context", f => { f.lease.contextGeneration++; }, "clean_source_action_generation_drift"],
      ["terminal", f => { f.lease.terminalState = "revoked"; }, "clean_source_action_terminal_revoked"]
    ]) {
      const staleAction = await fixture(), staleProof = await staleAction.foundation.inspectSource(staleAction.key);
      staleAction.hook(async n => { if (n === 4) { await Promise.resolve(); invalidate(staleAction); } });
      const staleResult = await staleAction.foundation.copySavedSource(staleProof);
      check(staleResult.state === "REFUSED_BEFORE_COPY" && staleResult.code === code && !fs.existsSync(staleResult.copiedPath), `${name} invalidation in final pre-copy native await prevents output effect`);
    }
    const expired = await fixture();
    expired.record.actionLease.expiresAtMs = expired.lease.expiresAtMs = Date.now() + 500;
    const expiredProof = await expired.foundation.inspectSource(expired.key);
    expired.hook(async n => { if (n === 4) await new Promise(resolve => setTimeout(resolve, Math.max(1, expired.lease.expiresAtMs - Date.now() + 10))); });
    const expiredResult = await expired.foundation.copySavedSource(expiredProof);
    check(expiredResult.state === "REFUSED_BEFORE_COPY" && expiredResult.code === "clean_source_action_expired_or_lease_changed" && !fs.existsSync(expiredResult.copiedPath), "real expiry while awaiting native reader prevents output effect without changing lease facts");

    const postAction = await fixture(), postProof = await postAction.foundation.inspectSource(postAction.key);
    postAction.hook(async n => { if (n === 6) { await Promise.resolve(); postAction.lease.actionGeneration++; } });
    const postResult = await postAction.foundation.copySavedSource(postProof);
    check(postResult.state === "UNKNOWN" && postResult.code === "clean_source_action_generation_drift" && postResult.artifactPreserved && fs.existsSync(postResult.copiedPath), "action invalidated in final post-copy native await returns UNKNOWN with real copy preserved");
    postAction.hook(null); postAction.lease.actionGeneration = 1;
    const postAgain = createFoundation(postAction.deps), postReplay = await postAgain.copySavedSource(await postAgain.inspectSource(postAction.key));
    check(postReplay.code === "clean_source_durable_replay_refused", "post-copy action revocation cannot replay after new factory");

    const lastAwait = await fixture(), lastProof = await lastAwait.foundation.inspectSource(lastAwait.key), originalLstat = fs.promises.lstat;
    let reservationReads = 0;
    fs.promises.lstat = async (file, ...args) => {
      const actual = await originalLstat(file, ...args);
      if (file.startsWith(lastAwait.workspace + path.sep) && file.endsWith(".jsonl") && ++reservationReads === 2) lastAwait.lease.terminalState = "revoked";
      return actual;
    };
    let lastResult;
    try { lastResult = await lastAwait.foundation.copySavedSource(lastProof); } finally { fs.promises.lstat = originalLstat; }
    check(reservationReads === 2 && lastResult.state === "UNKNOWN" && lastResult.code === "clean_source_action_terminal_revoked" && fs.existsSync(lastResult.copiedPath), "terminal revocation in the final filesystem await is checked synchronously before acceptance");

    const chunks = await fixture(Buffer.alloc(2 * 65536 + 173, 107)), chunkProof = await chunks.foundation.inspectSource(chunks.key);
    const chunkResult = await chunks.foundation.copySavedSource(chunkProof);
    check(chunkResult.ok && (await fs.promises.readFile(chunkResult.receipt.copiedBaseline.path)).equals(chunks.bytes), "bounded controlled copy writes and verifies all real chunks");

    const changed = await fixture(), changedProof = await changed.foundation.inspectSource(changed.key);
    await fs.promises.appendFile(changed.source, "external saved edit");
    const refused = await changed.foundation.copySavedSource(changedProof);
    check(refused.state === "REFUSED_BEFORE_COPY" && refused.code === "clean_source_pre_copy_drift" && !refused.artifactRoot, "changed source is refused before copy/root effect");

    const delayed = await fixture(), delayedProof = await delayed.foundation.inspectSource(delayed.key);
    delayed.hook(n => { if (n === 4) delayed.native.lifecycle.revision++; });
    const delayedResult = await delayed.foundation.copySavedSource(delayedProof);
    check(delayedResult.state === "REFUSED_BEFORE_COPY" && delayedResult.artifactPreserved && !fs.existsSync(delayedResult.copiedPath), "late pre-copy native drift consumes reservation without copying");
    const delayedReplay = createFoundation(delayed.deps); delayed.native.lifecycle.revision = 42;
    const delayedRetry = await delayedReplay.copySavedSource(await delayedReplay.inspectSource(delayed.key));
    check(delayedRetry.code === "clean_source_durable_replay_refused", "late refused reservation cannot replay");

    const after = await fixture(), afterProof = await after.foundation.inspectSource(after.key);
    after.hook(n => { if (n === 5) after.native.identity.aeBirth100ns = "134046876000000002"; });
    const afterResult = await after.foundation.copySavedSource(afterProof);
    check(afterResult.state === "UNKNOWN" && afterResult.artifactPreserved && fs.existsSync(afterResult.copiedPath), "post-copy session/birth drift preserves copied artifact and returns UNKNOWN");

    // Real first chunk, then a real EBADF from the same opened output handle.
    // No replacement whole-copy implementation; production has no FS fault hooks.
    const partial = await fixture(Buffer.alloc(3 * 65536, 97)), partialProof = await partial.foundation.inspectSource(partial.key), originalOpen = fs.promises.open;
    let partialWrites = 0;
    fs.promises.open = async (file, flags, ...args) => {
      const handle = await originalOpen(file, flags, ...args);
      if (file.startsWith(partial.workspace + path.sep) && path.basename(file) === "baseline.aep" && flags === "wx+") {
        const write = handle.write.bind(handle);
        handle.write = async (...args) => { if (++partialWrites === 2) await handle.close(); return write(...args); };
      }
      return handle;
    };
    let partialResult;
    try { partialResult = await partial.foundation.copySavedSource(partialProof); } finally { fs.promises.open = originalOpen; }
    const partialBytes = await fs.promises.readFile(partialResult.copiedPath);
    check(partialResult.state === "UNKNOWN" && partialResult.code === "EBADF" && partialWrites === 2 && partialBytes.length === 65536 && hash(partialBytes) === hash(partial.bytes.subarray(0, 65536)), "controlled real first chunk is retained after real handle/write error");
    const ledgerPath = path.join(partial.workspace, ".codex-runtime", "ame-clean-saved-source", "reservations", partialResult.attemptId + ".jsonl");
    const events = (await fs.promises.readFile(ledgerPath, "utf8")).trim().split("\n").map(JSON.parse);
    check(events[0].state === "reserved" && events[1].state === "copy_may_have_occurred" && events.at(-1).state === "UNKNOWN", "durable consumed/unknown intent precedes partial copy");
    const partialAgain = createFoundation(partial.deps), partialReplay = await partialAgain.copySavedSource(await partialAgain.inspectSource(partial.key));
    check(partialReplay.code === "clean_source_durable_replay_refused", "UNKNOWN cannot replay after factory restart");

    const changedDuringCopy = await fixture(), cdProof = await changedDuringCopy.foundation.inspectSource(changedDuringCopy.key);
    fs.promises.open = async (file, flags, ...args) => {
      const handle = await originalOpen(file, flags, ...args);
      if (file.startsWith(changedDuringCopy.workspace + path.sep) && path.basename(file) === "baseline.aep" && flags === "wx+") {
        const write = handle.write.bind(handle);
        handle.write = async (...args) => { const result = await write(...args); await fs.promises.appendFile(changedDuringCopy.source, "changed during copy"); return result; };
      }
      return handle;
    };
    let cdResult;
    try { cdResult = await changedDuringCopy.foundation.copySavedSource(cdProof); } finally { fs.promises.open = originalOpen; }
    check(cdResult.state === "UNKNOWN" && fs.existsSync(cdResult.copiedPath), "source drift after copy is UNKNOWN");

    const destinationDrift = await fixture(), ddProof = await destinationDrift.foundation.inspectSource(destinationDrift.key);
    let ddActionReads = 0;
    destinationDrift.actionHook(async () => {
      if (++ddActionReads === 3) {
        const base = path.join(destinationDrift.workspace, ".codex-runtime", "ame-clean-saved-source");
        const owned = (await fs.promises.readdir(base)).find(name => /^[a-f0-9-]{36}$/.test(name));
        await fs.promises.writeFile(path.join(base, owned, "baseline.aep"), "destination drift during delayed context read");
      }
    });
    const ddResult = await destinationDrift.foundation.copySavedSource(ddProof);
    check(ddResult.state === "UNKNOWN" && ddResult.code === "clean_source_delayed_after_copy_drift" && fs.existsSync(ddResult.copiedPath), "late destination drift is independently read back and retained UNKNOWN");

    const collision = await fixture(), collisionProof = await collision.foundation.inspectSource(collision.key);
    fs.promises.open = async (file, flags, ...args) => {
      if (file.startsWith(collision.workspace + path.sep) && path.basename(file) === "baseline.aep" && flags === "wx+") await fs.promises.writeFile(file, "EXISTING", { flag: "wx" });
      return originalOpen(file, flags, ...args);
    };
    let collisionResult;
    try { collisionResult = await collision.foundation.copySavedSource(collisionProof); } finally { fs.promises.open = originalOpen; }
    check(collisionResult.state === "UNKNOWN" && collisionResult.code === "EEXIST" && (await fs.promises.readFile(collisionResult.copiedPath, "utf8")) === "EXISTING", "owned wx output refuses replacement of a concurrently existing target");

    const hardlink = await fixture(), hardlinkProof = await hardlink.foundation.inspectSource(hardlink.key);
    fs.promises.open = async (file, flags, ...args) => {
      const handle = await originalOpen(file, flags, ...args);
      if (file.startsWith(hardlink.workspace + path.sep) && path.basename(file) === "baseline.aep" && flags === "wx+") {
        await fs.promises.unlink(file); await fs.promises.link(hardlink.source, file);
      }
      return handle;
    };
    let hardlinkResult;
    try { hardlinkResult = await hardlink.foundation.copySavedSource(hardlinkProof); } finally { fs.promises.open = originalOpen; }
    check(hardlinkResult.state === "UNKNOWN" && hardlinkResult.artifactPreserved, "a hardlink cannot qualify as independent copied baseline");

    const link = await fixture(), linkProof = await link.foundation.inspectSource(link.key);
    await fs.promises.mkdir(path.join(link.workspace, ".codex-runtime"));
    const outside = path.join(root, "outside"); await fs.promises.mkdir(outside);
    await fs.promises.symlink(outside, path.join(link.workspace, ".codex-runtime", "ame-clean-saved-source"), process.platform === "win32" ? "junction" : "dir");
    const linkResult = await link.foundation.copySavedSource(linkProof);
    check(linkResult.state === "REFUSED_BEFORE_COPY" && linkResult.code === "clean_source_directory_reparse_or_escape" && (await fs.promises.readdir(outside)).length === 0, "junction/reparse cannot redirect output writes");

    console.log(`PASS ${checks} checks; real temporary FS copy/hash/FileID/exclusive ledger; FAKE native/action facts; no AE/AME/live proof.`);
  } finally {
    // Delete only this exact mkdtemp root, after independently verifying ownership.
    const current = await fs.promises.lstat(root, { bigint: true });
    assert.ok(current.isDirectory() && !current.isSymbolicLink() && current.dev === rootStat.dev && current.ino === rootStat.ino &&
      path.dirname(root) === temporaryParent && path.basename(root).startsWith("ae-clean-saved-source-smoke-") && await fs.promises.realpath(root) === root);
    await fs.promises.rm(root, { recursive: true, force: false });
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });

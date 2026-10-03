"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const c = require("./project-lifecycle-contract");
const t = require("./project-lifecycle-transition");
const memory = require("./project-intent-memory");
const MAX_AEP_BYTES = 512 * 1024 * 1024;
function identity(stat) { if (stat.dev === undefined || stat.ino === undefined || String(stat.ino) === "0") c.fail("lifecycle_file_identity_unknown"); return { device: String(stat.dev), inode: String(stat.ino) }; }
function sameIdentity(a, b) { return !!a && !!b && a.device === b.device && a.inode === b.inode; }
function recordEqual(a, b) { return c.samePath(a.path, b.path) && a.sha256 === b.sha256 && a.bytes === b.bytes && sameIdentity(a.fileIdentity, b.fileIdentity); }
function createProjectLifecycleService(dependencies) {
  c.object(dependencies, "lifecycle_invalid_dependencies"); const deps = dependencies;
  for (const method of ["readNative", "sourceCheckpoint", "verifyManualAuthorization", "retireContext", "assertIdle"]) if (typeof deps[method] !== "function") c.fail("lifecycle_invalid_dependencies", method);
  const storage = deps.storage || t.createLifecycleStorage(deps.storageOptions || {}), io = { ...fs, ...(deps.filesystem || {}) };
  function canonical(file, present) {
    c.projectPath(file); const parent = io.realpathSync(path.dirname(file)); if (!c.samePath(parent, path.dirname(file))) c.fail("lifecycle_ambiguous_parent");
    if (present) { if (!c.samePath(io.realpathSync(file), file) || io.lstatSync(file).isSymbolicLink()) c.fail("lifecycle_ambiguous_file"); }
    else if (io.existsSync(file)) c.fail("lifecycle_target_exists");
    return file;
  }
  function readFile(file, options = {}) {
    canonical(file, true); let fd;
    try {
      fd = io.openSync(file, "r"); const before = io.fstatSync(fd, { bigint: true });
      if (!before.isFile() || Number(before.size) > MAX_AEP_BYTES || Number(before.size) < (options.allowEmpty ? 0 : 1)) c.fail("lifecycle_file_size_or_type");
      const data = io.readFileSync(fd), after = io.fstatSync(fd, { bigint: true });
      if (before.size !== after.size || before.mtimeNs !== after.mtimeNs || before.ctimeNs !== after.ctimeNs || data.length !== Number(after.size)) c.fail("lifecycle_file_changed_during_read");
      const fileIdentity = identity(after); if (!sameIdentity(fileIdentity, identity(io.statSync(file, { bigint: true })))) c.fail("lifecycle_file_identity_changed");
      canonical(file, true); return { path: file, bytes: data.length, sha256: c.hash(data), fileIdentity, observedAt: new Date().toISOString() };
    } finally { if (fd !== undefined) io.closeSync(fd); }
  }
  function verifyRecord(expected) { const actual = readFile(expected.path, { allowEmpty: expected.bytes === 0 }); if (!recordEqual(expected, actual)) c.fail("lifecycle_file_pin_changed"); return actual; }
  function currentState(store, file) { return t.readState(store, file); }
  function requirePolicyPins(pending) {
    const store = storage.load();
    if (c.hash(currentState(store, pending.args.expectedSourceProjectFile)) !== pending.sourcePolicyHash || c.hash(store.projectState[memory.projectStateKey(pending.args.targetProjectFile)] || null) !== pending.targetPolicyHash) c.fail("lifecycle_policy_changed");
  }
  async function manual(context, name, args, hints) {
    const inputHash = c.hash({ name, args }), value = await deps.verifyManualAuthorization(context, Object.freeze({ name, args: Object.freeze(c.clone(args)), inputHash, ...hints }));
    if (!value || !Object.isFrozen(value) || value.channel !== "manual_cep" || value.confirmed !== true || value.dryRunVerified !== true || typeof value.actionId !== "string" || !value.actionId || value.actionId.length > 240 || typeof value.runId !== "string" || !value.runId || value.runId.length > 240 || !c.SHA.test(value.payloadHash || "") || value.inputHash !== inputHash || value.sourcePolicyHash !== hints.sourcePolicyHash || value.targetPolicyHash !== hints.targetPolicyHash) c.fail("lifecycle_manual_authorization_required");
    if (value.ownedEditSessionId !== undefined && (typeof value.ownedEditSessionId !== "string" || !value.ownedEditSessionId || value.ownedEditSessionId.length > 240)) c.fail("lifecycle_manual_authorization_required");
    return Object.freeze({ actionId: value.actionId, runId: value.runId, payloadHash: value.payloadHash, inputHash, sourcePolicyHash: value.sourcePolicyHash, targetPolicyHash: value.targetPolicyHash, ...(value.ownedEditSessionId ? { ownedEditSessionId: value.ownedEditSessionId } : {}) });
  }
  async function observe(transitionId, accepted, expectedNative) {
    return storage.withReadCapability(transitionId, { ...(expectedNative ? { expectedNative } : {}), accepted }, async (script, cap) => c.validateInventory(await deps.readNative(script, cap), accepted));
  }
  async function checkpoint(context, pending) {
    const before = pending.sourceBefore, label = pending.args.checkpointLabel;
    const value = await deps.sourceCheckpoint(Object.freeze({ context, transitionId: pending.transitionId, label, sourceFile: before.path, sourceBytes: before.bytes, sourceSha25664: before.sha256, snapshotScope: "on_disk_before_lifecycle" }));
    if (!value || value.label !== label || !c.samePath(value.sourceFile, before.path) || value.snapshotScope !== "on_disk_before_lifecycle" || c.samePath(value.checkpointFile, before.path)) c.fail("lifecycle_checkpoint_invalid");
    const copy = readFile(value.checkpointFile); if (copy.bytes !== before.bytes || copy.sha256 !== before.sha256 || sameIdentity(copy.fileIdentity, before.fileIdentity) || value.sha256 !== undefined && value.sha256 !== copy.sha256 || value.bytes !== undefined && value.bytes !== copy.bytes) c.fail("lifecycle_checkpoint_invalid");
    return { ...copy, checkpointFile: copy.path, sourceFile: before.path, label, snapshotScope: "on_disk_before_lifecycle" };
  }
  function ensureSource(p) { const actual = verifyRecord(p.sourceBefore); requirePolicyPins(p); return actual; }
  function reserveStage(p) {
    canonical(p.stageProjectFile, false); let fd;
    try { fd = io.openSync(p.stageProjectFile, "wx"); io.fsyncSync(fd); } finally { if (fd !== undefined) io.closeSync(fd); }
    return readFile(p.stageProjectFile, { allowEmpty: true });
  }
  async function nativePhase(lease, pending, phase, expectedNative, destination, accepted, filePin) {
    ensureSource(pending);
    const script = c.phaseScript({ operation: pending.operation, phase, expectedNative, destinationProjectFile: destination, accepted });
    const pins = [pending.sourceBefore, filePin, ...(phase === "open_final" ? [pending.stageFile] : [])];
    const response = await storage.withPhaseCapability(lease, pending, phase, expectedNative, script, cap => deps.readNative(script, cap), { file: pins, verify: records => records.forEach(verifyRecord) });
    let value = response; for (let i = 0; i < 4 && value && typeof value === "object" && Object.prototype.hasOwnProperty.call(value, "result"); i++) value = value.result;
    if (typeof value === "string") { try { value = JSON.parse(value); } catch (_) { c.fail("lifecycle_phase_receipt_unknown"); } }
    if (!value || value.phase !== phase) c.fail("lifecycle_phase_receipt_unknown"); const native = c.nativeTuple(value.native);
    if (!c.samePath(native.file, destination) || native.dirty !== false) c.fail("lifecycle_phase_readback_mismatch"); return native;
  }
  function publish(p) {
    const stage = verifyRecord(p.stageFile); canonical(p.args.targetProjectFile, false);
    // EXCL is mandatory. An interrupted copy may leave a partial final; preserve it.
    io.copyFileSync(stage.path, p.args.targetProjectFile, fs.constants.COPYFILE_EXCL); let fd;
    try { fd = io.openSync(p.args.targetProjectFile, "r+"); io.fsyncSync(fd); } finally { if (fd !== undefined) io.closeSync(fd); }
    const final = readFile(p.args.targetProjectFile);
    if (stage.sha256 !== final.sha256 || stage.bytes !== final.bytes || sameIdentity(stage.fileIdentity, final.fileIdentity)) c.fail("lifecycle_publish_readback_mismatch"); verifyRecord(stage); ensureSource(p); return final;
  }
  function mutatePending(lease, p, fields) { return storage.update(lease, p.transitionId, current => Object.assign(current, c.clone(fields))); }
  function makeReceipt(p, generation) {
    const proof = p.proof; const receipt = { contractVersion: c.VERSION, operation: p.operation, success: true, transitionId: p.transitionId, generation,
      inputHash:p.inputHash,sourceNative:p.sourceInventory.native,
      sourceBefore: p.sourceBefore, sourceAfter: proof.sourceAfter, targetFile: proof.targetFile, stageFile: p.stageFile || null,
      checkpoint: p.checkpoint, sourceInventoryHash: c.inventoryHash(p.sourceInventory), stageInventoryHash: p.stageInventory ? c.inventoryHash(p.stageInventory) : null,
      targetInventoryHash: c.inventoryHash(p.targetInventory), finalNative: p.targetInventory.native, targetEmpty: p.operation === "create_named_project" && p.targetInventory.items.length === 0,
      authorization: p.authorization, ...(p.finalizationAuthorization ? { finalizedBy: p.finalizationAuthorization } : {}), contextRetired: true, artisticAccepted: false, sourceCheckpointRestoresUnsavedMemory: false, undoContextChanged: true };
    c.verifyReceipt(receipt); return receipt;
  }
  async function retireAndCommit(context, lease, pending) {
    ensureSource(pending); verifyRecord(pending.proof.targetFile);
    const retirement = await deps.retireContext(context, Object.freeze({ transitionId: pending.transitionId, authorization: Object.freeze(c.clone(pending.authorization)), ...(pending.finalizationAuthorization ? { finalizationAuthorization: Object.freeze(c.clone(pending.finalizationAuthorization)) } : {}), sourceProjectFile: pending.args.expectedSourceProjectFile,
      targetProjectFile: pending.args.targetProjectFile, generation: pending.baseGeneration + 1 }));
    if (!retirement || ["sessionClosed", "proposalRetired", "cachesInvalidated", "desiredEnabledPreserved"].some(k => retirement[k] !== true)) c.fail("lifecycle_context_retirement_unproven");
    // Manual AE edits are outside the queue lock. Recheck after asynchronous retirement.
    const finalCurrent = await observe(pending.transitionId, pending.targetState.acceptedPlaceholders, pending.proof.finalNative);
    c.assertInventoryMatch(pending.targetInventory, finalCurrent); ensureSource(pending); verifyRecord(pending.proof.targetFile); if (pending.stageFile) verifyRecord(pending.stageFile);
    pending = mutatePending(lease, pending, { phase: "context_retired", retirement: { sessionClosed: true, proposalRetired: true, cachesInvalidated: true, desiredEnabledPreserved: true } });
    const receipt = makeReceipt(pending, pending.baseGeneration + 1); storage.commit(lease, pending.transitionId, receipt); return receipt;
  }
  async function execute(name, rawArgs, context) {
    const args = c.validateInput(name, rawArgs); if (name === "reconcile_project_lifecycle") return reconcile(args);
    if (name === "finalize_project_lifecycle") return finalize(args, context);
    // Barrier precedes any cached/idempotent response. This service never returns legacy cache hits.
    storage.assertMutationAllowed(); const beforeStore = storage.load(), sourceState = currentState(beforeStore, args.expectedSourceProjectFile), targetStateBefore = beforeStore.projectState[memory.projectStateKey(args.targetProjectFile)] || null;
    const sourcePolicyHash = c.hash(sourceState), targetPolicyHash = c.hash(targetStateBefore);
    if (name === "open_project" && !targetStateBefore) c.fail("lifecycle_target_policy_missing");
    if (name !== "open_project" && targetStateBefore) c.fail("lifecycle_target_policy_collision");
    const authorization = await manual(context, name, args, { sourcePolicyHash, targetPolicyHash, expectedNative: { file: args.expectedSourceProjectFile, dirty: args.expectedSourceDirty, revision: args.expectedSourceRevision } });
    if ((beforeStore.lifecycleReceipts || []).some(receipt => receipt.authorization.actionId === authorization.actionId && receipt.authorization.runId === authorization.runId)) c.fail("lifecycle_authorization_consumed");
    const lease = storage.acquireAdmission(authorization, () => deps.assertIdle(context) === true);
    let pending = null;
    try {
      const sourceBefore = readFile(args.expectedSourceProjectFile); if (sourceBefore.sha256 !== args.expectedSourceSavedSha25664) c.fail("lifecycle_source_disk_pin_changed");
      let targetFile = null; if (name === "open_project") { targetFile = readFile(args.targetProjectFile); if (targetFile.sha256 !== args.expectedTargetSavedSha25664 || sameIdentity(targetFile.fileIdentity, sourceBefore.fileIdentity)) c.fail("lifecycle_target_disk_pin_changed"); } else canonical(args.targetProjectFile, false);
      const sourceNative = { file: args.expectedSourceProjectFile, dirty: args.expectedSourceDirty, revision: args.expectedSourceRevision };
      const sourceInventory = await observe(null, sourceState.acceptedPlaceholders, sourceNative); t.assertOwnershipInventory(sourceState, sourceInventory);
      if (c.hash(currentState(storage.load(), args.expectedSourceProjectFile)) !== sourcePolicyHash) c.fail("lifecycle_policy_changed");
      const transitionId = crypto.randomUUID(), stageProjectFile = name === "open_project" ? null : path.join(path.dirname(args.targetProjectFile), ".ae-agent-stage-" + crypto.randomUUID() + ".aep");
      const targetState = name === "open_project" ? t.invalidateContextProofs(targetStateBefore, transitionId) : t.migrateTargetState(name, sourceState, args.targetProjectFile, transitionId, name === "create_named_project" ? { ...sourceInventory, items: [], protectedEvidence: [] } : sourceInventory, null);
      const candidate = { schema: c.VERSION + ".pending", transitionId, operation: name, args, inputHash: c.hash({ name, args }), authorization: { actionId: authorization.actionId, runId: authorization.runId, payloadHash: authorization.payloadHash, ...(authorization.ownedEditSessionId ? { ownedEditSessionId: authorization.ownedEditSessionId } : {}) },
        sourcePolicyHash, targetPolicyHash, sourceState, targetStateBefore, targetState, sourceBefore, sourceNative, sourceInventory, stageProjectFile, targetFile,
        baseGeneration: beforeStore.lifecycleGeneration || 0, phase: "prepared", status: "active", possibleDelivery: false, createdAt: new Date().toISOString() };
      t.capacityPreflight(storage.load(), candidate, targetState); candidate.checkpoint = await checkpoint(context, candidate); ensureSource(candidate); if (targetFile) verifyRecord(targetFile);
      pending = storage.begin(lease, candidate);
      if (name === "open_project") {
        pending = mutatePending(lease, pending, { phase: "open_target_submitted", possibleDelivery: true });
        const finalNative = await nativePhase(lease, pending, "open_target", sourceNative, args.targetProjectFile, sourceState.acceptedPlaceholders, targetFile);
        const targetInventory = await observe(pending.transitionId, targetState.acceptedPlaceholders, finalNative); t.assertOwnershipInventory(targetStateBefore, targetInventory); verifyRecord(targetFile);
        pending = mutatePending(lease, pending, { targetInventory });
      } else {
        const reservation = reserveStage(pending); pending = mutatePending(lease, pending, { phase: "stage_reserved", stageReservation: reservation });
        const phase = name === "save_project_as" ? "save_stage" : "create_stage";
        pending = mutatePending(lease, pending, { phase: phase + "_submitted", possibleDelivery: true });
        const stageNative = await nativePhase(lease, pending, phase, sourceNative, stageProjectFile, sourceState.acceptedPlaceholders, reservation);
        const stageInventory = await observe(pending.transitionId, name === "save_project_as" ? sourceState.acceptedPlaceholders : [], stageNative), stageFile = readFile(stageProjectFile);
        if (name === "save_project_as") c.assertInventoryMatch(sourceInventory, stageInventory); else if (stageInventory.items.length !== 0) c.fail("lifecycle_create_not_empty");
        ensureSource(pending); pending = mutatePending(lease, pending, { phase: "stage_verified", stageNative, stageInventory, stageFile });
        targetFile = publish(pending); pending = mutatePending(lease, pending, { phase: "published", targetFile });
        // Full independent stage read immediately before final open catches edits without disk writes.
        const stageCurrent = await observe(pending.transitionId, name === "save_project_as" ? sourceState.acceptedPlaceholders : [], stageNative); c.assertInventoryMatch(stageInventory, stageCurrent); verifyRecord(stageFile);
        pending = mutatePending(lease, pending, { phase: "open_final_submitted", possibleDelivery: true });
        const finalNative = await nativePhase(lease, pending, "open_final", stageNative, args.targetProjectFile, name === "save_project_as" ? sourceState.acceptedPlaceholders : [], targetFile);
        const targetInventory = await observe(pending.transitionId, targetState.acceptedPlaceholders, finalNative); c.assertInventoryMatch(stageInventory, targetInventory);
        if (name === "create_named_project" && targetInventory.items.length !== 0) c.fail("lifecycle_create_not_empty"); verifyRecord(targetFile);
        pending = mutatePending(lease, pending, { targetInventory });
      }
      ensureSource(pending); t.assertOwnershipInventory(pending.targetState, pending.targetInventory);
      pending = mutatePending(lease, pending, { phase: "final_proven", proof: { sourceAfter: verifyRecord(sourceBefore), targetFile: verifyRecord(targetFile), targetInventoryHash: c.inventoryHash(pending.targetInventory), finalNative: pending.targetInventory.native, provenAt: new Date().toISOString() } });
      return await retireAndCommit(context, lease, pending);
    } catch (error) {
      if (pending) { try { pending = storage.update(lease, pending.transitionId, current => { current.status = current.possibleDelivery ? "unknown" : "not_started"; current.errorCode = String(error.code || "lifecycle_phase_unknown").slice(0, 120); }); } catch (_) { /* Existing durable pending/marker still blocks writes. Never erase unknown evidence. */ } }
      throw error;
    } finally { storage.releaseAdmission(lease); }
  }
  async function reconcile(rawArgs) {
    const args = c.validateInput("reconcile_project_lifecycle", rawArgs), projection = storage.pendingProjection(); let p;
    try { const store = storage.load(); p = store.pendingLifecycle; if (!p || p.transitionId !== args.transitionId) return { ...projection, transitionId: args.transitionId, found: false, receipt: (store.lifecycleReceipts || []).find(r => r.transitionId === args.transitionId) || null, nativeReplay: false, stateWrites: false }; }
    catch (error) { return { ...projection, transitionId: args.transitionId, found: false, errorCode: error.code || "lifecycle_store_corrupt", nativeReplay: false, stateWrites: false }; }
    const files = {}; for (const [key, file] of [["source", p.args.expectedSourceProjectFile], ["stage", p.stageProjectFile], ["target", p.args.targetProjectFile]]) {
      if (!file) { files[key] = null; continue; } try { files[key] = readFile(file, { allowEmpty: true }); } catch (error) { files[key] = { path: file, errorCode: error.code || "lifecycle_file_unreadable" }; }
    }
    let native = null, errorCode = null;
    try { const inventory = await observe(p.transitionId, []); native = { tuple: inventory.native, inventoryHash: c.inventoryHash(inventory), itemCount: inventory.items.length }; } catch (error) { errorCode = error.code || "lifecycle_native_unknown"; }
    return { ...projection, found: true, files, native, errorCode, finalProofPersisted: !!p.proof, nativeReplay: false, stateWrites: false, recovery: p.proof ? "fresh_manual_finalize_only" : "explicit_recovery_scope_required" };
  }
  async function finalize(rawArgs, context) {
    const args = c.validateInput("finalize_project_lifecycle", rawArgs), store = storage.load(); let pending = store.pendingLifecycle;
    if (!pending || pending.transitionId !== args.transitionId || !pending.proof || !["final_proven", "context_retired"].includes(pending.phase)) c.fail("lifecycle_finalize_requires_persisted_final_proof");
    const authorization = await manual(context, "finalize_project_lifecycle", args, { sourcePolicyHash: pending.sourcePolicyHash, targetPolicyHash: pending.targetPolicyHash, pending: c.clone(pending), expectedNative: pending.proof.finalNative });
    const lease = storage.acquireFinalizeAdmission(authorization, args.transitionId, () => deps.assertIdle(context) === true);
    try {
      pending = storage.update(lease, pending.transitionId, current => { current.finalizationAuthorization = c.clone(authorization); });
      // Only fixed read-only native inventory. No save/new/open, even after unknown delivery.
      ensureSource(pending); verifyRecord(pending.proof.targetFile);
      const inventory = await observe(pending.transitionId, pending.targetState.acceptedPlaceholders, pending.proof.finalNative); c.assertInventoryMatch(pending.targetInventory, inventory); t.assertOwnershipInventory(pending.targetState, inventory);
      if (pending.stageFile) verifyRecord(pending.stageFile);
      pending = storage.update(lease, pending.transitionId, current => { current.status = "active"; });
      return await retireAndCommit(context, lease, pending);
    } catch (error) { try { storage.update(lease, pending.transitionId, current => { current.status = "unknown"; current.errorCode = String(error.code || "lifecycle_finalize_failed").slice(0, 120); }); } catch (_) {} throw error; }
    finally { storage.releaseAdmission(lease); }
  }
  return { execute, reconcile, finalize, storage, readFileRecord: readFile };
}
module.exports = { createProjectLifecycleService, MAX_AEP_BYTES, identity, sameIdentity, recordEqual };

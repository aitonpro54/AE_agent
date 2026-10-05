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
  const completionReadbacks = new WeakMap();
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
  async function observe(transitionId, accepted, expectedNative, witness, readbackRole) {
    return storage.withReadCapability(transitionId, { ...(expectedNative ? { expectedNative } : {}), accepted }, async (script, cap) => {
      const inventory = c.validateInventory(await deps.readNative(script, cap), accepted);
      if (witness) {
        const facts = t.phaseCapabilityFacts(cap);
        if (!facts || !c.UUID.test(facts.commandId || "") || facts.readbackRole !== readbackRole) c.fail("lifecycle_recovery_command_witness_missing");
        witness.commandId = facts.commandId; witness.readbackRole = facts.readbackRole;
      }
      return inventory;
    }, readbackRole);
  }
  async function checkpoint(context, pending) {
    const before = pending.sourceBefore, label = pending.args.checkpointLabel;
    const value = await deps.sourceCheckpoint(Object.freeze({ context, transitionId: pending.transitionId, label, sourceFile: before.path, sourceBytes: before.bytes, sourceSha25664: before.sha256, snapshotScope: "on_disk_before_lifecycle" }));
    if (!value || value.label !== label || !c.samePath(value.sourceFile, before.path) || value.snapshotScope !== "on_disk_before_lifecycle" || c.samePath(value.checkpointFile, before.path)) c.fail("lifecycle_checkpoint_invalid");
    const copy = readFile(value.checkpointFile); if (copy.bytes !== before.bytes || copy.sha256 !== before.sha256 || sameIdentity(copy.fileIdentity, before.fileIdentity) || value.sha256 !== undefined && value.sha256 !== copy.sha256 || value.bytes !== undefined && value.bytes !== copy.bytes) c.fail("lifecycle_checkpoint_invalid");
    return { ...copy, checkpointFile: copy.path, sourceFile: before.path, label, snapshotScope: "on_disk_before_lifecycle" };
  }
  function ensureSource(p) { const actual = verifyRecord(p.sourceBefore); requirePolicyPins(p); return actual; }
  function recoveryFiles(p) {
    requirePolicyPins(p);
    const files = {source:verifyRecord(p.sourceBefore), checkpoint:verifyRecord(p.checkpoint), stage:verifyRecord(p.stageFile), target:verifyRecord(p.targetFile)};
    for (const value of Object.values(files)) if (value.bytes < 1 || value.fileIdentity.device === "0") c.fail("lifecycle_recovery_file_identity_unknown");
    const records = Object.values(files);
    for (let i = 0; i < records.length; i++) for (let j = i + 1; j < records.length; j++) if (sameIdentity(records[i].fileIdentity, records[j].fileIdentity)) c.fail("lifecycle_recovery_file_alias");
    return files;
  }
  function fileProjection(files) {
    return Object.fromEntries(Object.entries(files).map(([key, value]) => [key, {path:c.normalizePath(value.path), sha256:value.sha256, bytes:value.bytes, fileIdentity:value.fileIdentity}]));
  }
  // Server-owned full assessment. Reconcile summaries and client observations are never inputs.
  async function assessRecovery(rawArgs, options = {}) {
    storage.assertRecoveryReadable();
    const args = c.validateInput("recover_project_lifecycle", rawArgs), projection = storage.pendingProjection(), before = storage.load(), p = before.pendingLifecycle;
    if (!projection.enabled || projection.problem || !p || p.transitionId !== args.transitionId || before.schema !== t.V2 || p.baseGeneration !== before.lifecycleGeneration) c.fail("lifecycle_recovery_ineligible");
    t.assertRecoveryEligible(p, options.proven === true);
    if (typeof deps.assertRecoveryIdle !== "function" || deps.assertRecoveryIdle(c.clone(p), options.context) !== true) c.fail("lifecycle_recovery_not_idle");
    const beforeHash = c.hash(before), files = recoveryFiles(p);
    const inventory = await observe(p.transitionId, p.targetState.acceptedPlaceholders, options.expectedNative || (options.proven ? p.proof.finalNative : undefined), options.witness, options.readbackRole);
    if (!c.samePath(inventory.native.file, p.args.targetProjectFile) || inventory.native.dirty !== false) c.fail("lifecycle_recovery_final_not_open");
    c.assertInventoryMatch(p.sourceInventory, inventory); c.assertInventoryMatch(p.stageInventory, inventory); t.assertOwnershipInventory(p.sourceState, inventory); t.assertOwnershipInventory(p.targetState, inventory);
    if (options.proven) c.assertInventoryMatch(p.targetInventory, inventory);
    const filesAfter = recoveryFiles(p), after = storage.load(); storage.assertRecoveryReadable();
    if (beforeHash !== c.hash(after) || c.hash(fileProjection(files)) !== c.hash(fileProjection(filesAfter)) || deps.assertRecoveryIdle(c.clone(p), options.context) !== true) c.fail("lifecycle_recovery_observation_changed");
    t.capacityPreflight(before, p, p.targetState);
    const pins = {mode:"published_save_as_state_only.v1", tool:"recover_project_lifecycle", inputHash:c.hash({name:"recover_project_lifecycle", args}), transitionId:p.transitionId,
      pendingHash:c.hash(p), baseGeneration:p.baseGeneration, sourcePolicyHash:p.sourcePolicyHash, targetPolicyHash:p.targetPolicyHash,
      targetStateHash:c.hash(p.targetState), nativeHash:c.hash(inventory.native), inventoryHash:c.inventoryHash(inventory), filePinsHash:c.hash(fileProjection(filesAfter))};
    return {pending:c.clone(p), inventory, files:filesAfter, pins:Object.freeze(pins)};
  }
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
      authorization: p.authorization, ...(p.finalizationAuthorization ? { finalizedBy: p.finalizationAuthorization } : {}), ...(p.recovery ? {recovery:p.recovery, recoveredBy:p.recoveryAuthorization} : {}), contextRetired: true, artisticAccepted: false, sourceCheckpointRestoresUnsavedMemory: false, undoContextChanged: true };
    c.verifyReceipt(receipt); return receipt;
  }
  async function retireAndCommit(context, lease, pending) {
    ensureSource(pending); verifyRecord(pending.proof.targetFile);
    const retirement = await deps.retireContext(context, Object.freeze({ transitionId: pending.transitionId, authorization: Object.freeze(c.clone(pending.authorization)), ...(pending.finalizationAuthorization ? { finalizationAuthorization: Object.freeze(c.clone(pending.finalizationAuthorization)) } : {}), ...(pending.recovery ? {recovery:c.clone(pending.recovery), recoveryAuthorization:c.clone(pending.recoveryAuthorization)} : {}), sourceProjectFile: pending.args.expectedSourceProjectFile,
      targetProjectFile: pending.args.targetProjectFile, generation: pending.baseGeneration + 1 }));
    if (!retirement || ["sessionClosed", "proposalRetired", "cachesInvalidated", "desiredEnabledPreserved"].some(k => retirement[k] !== true)) c.fail("lifecycle_context_retirement_unproven");
    // Manual AE edits are outside the queue lock. Recheck after asynchronous retirement.
    const postRetirement = {}, postCommit = {};
    const finalCurrent = pending.recovery ? (await assessRecovery({transitionId:pending.transitionId}, {proven:true, expectedNative:pending.proof.finalNative, context, witness:postRetirement, readbackRole:"recovery_post_retirement"})).inventory : await observe(pending.transitionId, pending.targetState.acceptedPlaceholders, pending.proof.finalNative);
    c.assertInventoryMatch(pending.targetInventory, finalCurrent); ensureSource(pending); verifyRecord(pending.proof.targetFile); if (pending.stageFile) verifyRecord(pending.stageFile);
    pending = mutatePending(lease, pending, { phase: "context_retired", retirement: { sessionClosed: true, proposalRetired: true, cachesInvalidated: true, desiredEnabledPreserved: true } });
    const receipt = makeReceipt(pending, pending.baseGeneration + 1); storage.commit(lease, pending.transitionId, receipt);
    if (pending.recovery) {
      const terminal = storage.load();
      if (terminal.pendingLifecycle !== null || terminal.lifecycleGeneration !== receipt.generation || c.hash(terminal.lifecycleReceipts.at(-1)) !== c.hash(receipt) || c.hash(currentState(terminal, pending.args.expectedSourceProjectFile)) !== pending.sourcePolicyHash || c.hash(currentState(terminal, pending.args.targetProjectFile)) !== c.hash(pending.targetState)) c.fail("lifecycle_recovery_terminal_unproven");
      const final = await observe(null, pending.targetState.acceptedPlaceholders, pending.proof.finalNative, postCommit, "recovery_post_commit"); c.assertInventoryMatch(pending.targetInventory, final);
      for (const record of [pending.sourceBefore, pending.checkpoint, pending.stageFile, pending.targetFile]) verifyRecord(record);
      if (c.hash(storage.load()) !== c.hash(terminal)) c.fail("lifecycle_recovery_terminal_changed");
      if (postRetirement.commandId === postCommit.commandId) c.fail("lifecycle_recovery_command_witness_missing");
      // Ephemeral execution witnesses are sibling tool-result evidence, never a
      // second authoritative store write or a replacement for the saved receipt.
      completionReadbacks.set(receipt, Object.freeze({schema:c.VERSION + ".recovery-readbacks.v1", transitionId:pending.transitionId,
        runId:(pending.finalizationAuthorization || pending.recoveryAuthorization).runId, postRetirement:Object.freeze(postRetirement), postCommit:Object.freeze(postCommit)}));
    }
    return receipt;
  }
  async function execute(name, rawArgs, context) {
    const args = c.validateInput(name, rawArgs); if (name === "reconcile_project_lifecycle") return reconcile(args);
    if (name === "finalize_project_lifecycle") return finalize(args, context);
    if (name === "recover_project_lifecycle") return recover(args, context);
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
    if (pending.recovery && [pending.authorization, pending.recoveryAuthorization].some(a => a.actionId === authorization.actionId || a.runId === authorization.runId)) c.fail("lifecycle_recovery_authority_reused");
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
  async function recover(rawArgs, context) {
    const args = c.validateInput("recover_project_lifecycle", rawArgs), assessed = await assessRecovery(args, {context});
    const original = assessed.pending;
    const authorization = await manual(context, "recover_project_lifecycle", args, {sourcePolicyHash:original.sourcePolicyHash, targetPolicyHash:original.targetPolicyHash, expectedNative:assessed.inventory.native, recoveryPins:assessed.pins});
    if (authorization.actionId === original.authorization.actionId || authorization.runId === original.authorization.runId || (storage.load().lifecycleReceipts || []).some(r => [r.authorization, r.finalizedBy, r.recoveredBy].filter(Boolean).some(a => a.actionId === authorization.actionId || a.runId === authorization.runId))) c.fail("lifecycle_recovery_authority_reused");
    const lease = storage.acquireRecoveryAdmission(authorization, args.transitionId, assessed.pins.pendingHash, () => deps.assertIdle(context) === true && deps.assertRecoveryIdle(c.clone(original), context) === true);
    let pending = original, proofWritten = false;
    try {
      const fresh = await assessRecovery(args, {context, expectedNative:assessed.inventory.native});
      if (c.hash(fresh.pins) !== c.hash(assessed.pins)) c.fail("lifecycle_dry_run_pins_changed");
      const provenAt = new Date().toISOString(), recovery = {schema:c.VERSION + ".recovery.v1", completionMethod:"state_only_final_readback", nativeMutations:0, provenAt, pinsHash:c.hash(fresh.pins),
        origin:{phase:original.phase, status:original.status, errorCode:original.errorCode, possibleDelivery:original.possibleDelivery, actionId:original.authorization.actionId, runId:original.authorization.runId, pendingHash:fresh.pins.pendingHash}};
      const fields = {phase:"final_proven", targetInventory:fresh.inventory, proof:{sourceAfter:fresh.files.source, targetFile:fresh.files.target, targetInventoryHash:c.inventoryHash(fresh.inventory), finalNative:fresh.inventory.native, provenAt}, recovery, recoveryAuthorization:authorization};
      const candidate = {...c.clone(pending), ...c.clone(fields)};
      t.validatePending(candidate); t.capacityPreflight(storage.load(), candidate, candidate.targetState, makeReceipt(candidate, candidate.baseGeneration + 1));
      pending = mutatePending(lease, pending, fields); proofWritten = true;
      return await retireAndCommit(context, lease, pending);
    } catch (error) {
      // Before first proof write the original unknown pending is byte-for-byte intact.
      if (proofWritten) try { storage.update(lease, pending.transitionId, current => {current.status = "unknown"; current.errorCode = String(error.code || "lifecycle_recovery_failed").slice(0,120);}); } catch (_) {}
      throw error;
    } finally { storage.releaseAdmission(lease); }
  }
  return { execute, reconcile, finalize, recover, assessRecovery, storage, readFileRecord: readFile,
    recoveryReadbacks:receipt=>{const result=completionReadbacks.get(receipt);if (!result) c.fail("lifecycle_recovery_command_witness_missing");return c.clone(result);} };
}
module.exports = { createProjectLifecycleService, MAX_AEP_BYTES, identity, sameIdentity, recordEqual };

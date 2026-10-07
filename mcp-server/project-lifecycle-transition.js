"use strict";

// One durable store and process-private capabilities. Never a reset/replay mechanism.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const c = require("./project-lifecycle-contract");
const V2 = "ae-project-intent-runtime.v2";
const MARKER = "ae-project-lifecycle-initialized.v1";
const MAX_RECEIPTS = 12, MAX_OWNERS = 32, MAX_OWNED_ITEMS = 200;
const PHASES = new Set(["prepared", "stage_reserved", "save_stage_submitted", "create_stage_submitted", "stage_verified", "published", "open_final_submitted", "open_target_submitted", "final_proven", "context_retired"]);
const guards = new Map(), locks = new Map(), capabilities = new WeakMap(), leases = new WeakMap(), initializedPaths = new Set();
const memory = () => require("./project-intent-memory");
const statePath = options => memory().projectStatePath(options || {});
const markerPath = file => file + ".lifecycle-initialized.json";
const keyFor = file => memory().projectStateKey(file);
function validateFileRecord(record) {
  c.exact(record, ["path", "bytes", "sha256", "fileIdentity", "observedAt"], "lifecycle_invalid_file_record"); c.projectPath(record.path);
  if (!Number.isSafeInteger(record.bytes) || record.bytes < 0 || !c.SHA.test(record.sha256 || "") || typeof record.observedAt !== "string" || !Number.isFinite(Date.parse(record.observedAt))) c.fail("lifecycle_invalid_file_record");
  c.exact(record.fileIdentity, ["device", "inode"], "lifecycle_invalid_file_record"); if (typeof record.fileIdentity.device !== "string" || !record.fileIdentity.device || typeof record.fileIdentity.inode !== "string" || !record.fileIdentity.inode || record.fileIdentity.inode === "0") c.fail("lifecycle_invalid_file_record"); return record;
}
function sameRecord(a, b) { return c.samePath(a.path, b.path) && a.bytes === b.bytes && a.sha256 === b.sha256 && c.stableJson(a.fileIdentity) === c.stableJson(b.fileIdentity); }
function validateNestedState(state, projectFile) {
  if (!state || state.projectKey !== keyFor(projectFile) || !c.samePath(state.projectFile, memory().canonicalSavedProject(projectFile))) c.fail("lifecycle_pending_policy_identity");
  memory().validateProjectStateStore({ schema: memory().PROJECT_STATE_SCHEMA, projectState: { [state.projectKey]: state } });
  if (state.inheritedOwnership !== undefined) validateInheritedOwnership(state.inheritedOwnership);
}
function validateInheritedOwnership(index) {
  if (!Array.isArray(index) || index.length > MAX_OWNERS) c.fail("lifecycle_invalid_inherited_ownership");
  const owners = new Set(), ids = new Set();
  for (const row of index) {
    c.exact(row, ["owner", "itemIds", "sourceKey", "transitionId", "proofValidity"], "lifecycle_invalid_inherited_ownership");
    if (!c.UUID.test(row.owner || "") || owners.has(row.owner) || !c.SHA.test(row.sourceKey || "") || !c.UUID.test(row.transitionId || "") || row.proofValidity !== "invalid" || !Array.isArray(row.itemIds) || !row.itemIds.length || row.itemIds.some(id => !Number.isSafeInteger(id) || id < 1 || ids.has(id))) c.fail("lifecycle_invalid_inherited_ownership");
    owners.add(row.owner); for (const id of row.itemIds) ids.add(id);
  }
  if (ids.size > MAX_OWNED_ITEMS) c.fail("lifecycle_inherited_ownership_budget"); return index;
}
function validatePending(p) {
  c.exact(p, ["schema", "transitionId", "operation", "args", "inputHash", "authorization", "sourcePolicyHash", "targetPolicyHash", "sourceState", "targetStateBefore", "targetState", "sourceBefore", "sourceNative", "sourceInventory", "stageProjectFile", "targetFile", "baseGeneration", "phase", "status", "possibleDelivery", "createdAt", "checkpoint", "stageReservation", "stageNative", "stageInventory", "stageFile", "targetInventory", "proof", "retirement", "errorCode", "finalizationAuthorization", "recovery", "recoveryAuthorization"], "lifecycle_invalid_pending");
  if (p.schema !== c.VERSION + ".pending" || !c.UUID.test(p.transitionId || "") || !c.MUTATIONS.slice(0, 3).includes(p.operation) || !PHASES.has(p.phase) || !["active", "unknown", "not_started"].includes(p.status) || typeof p.possibleDelivery !== "boolean" || !c.SHA.test(p.inputHash || "") || !c.SHA.test(p.sourcePolicyHash || "") || !c.SHA.test(p.targetPolicyHash || "") || !p.authorization || typeof p.authorization.actionId !== "string" || !p.authorization.actionId || typeof p.authorization.runId !== "string" || !p.authorization.runId || !c.SHA.test(p.authorization.payloadHash || "") || !Number.isSafeInteger(p.baseGeneration) || p.baseGeneration < 0) c.fail("lifecycle_invalid_pending");
  c.validateInput(p.operation, p.args); if (p.inputHash !== c.hash({ name: p.operation, args: p.args })) c.fail("lifecycle_pending_input_changed");
  validateNestedState(p.sourceState, p.args.expectedSourceProjectFile); validateNestedState(p.targetState, p.args.targetProjectFile);
  if (p.targetStateBefore !== null) validateNestedState(p.targetStateBefore, p.args.targetProjectFile);
  validateFileRecord(p.sourceBefore); if (p.sourceBefore.bytes < 1) c.fail("lifecycle_invalid_file_record");
  if (p.targetFile) validateFileRecord(p.targetFile); if (p.stageFile) validateFileRecord(p.stageFile); if (p.stageReservation) validateFileRecord(p.stageReservation);
  if (p.authorization.ownedEditSessionId !== undefined && (typeof p.authorization.ownedEditSessionId !== "string" || !p.authorization.ownedEditSessionId || p.authorization.ownedEditSessionId.length > 240)) c.fail("lifecycle_invalid_pending_authorization");
  if (p.finalizationAuthorization !== undefined) {
    c.exact(p.finalizationAuthorization, ["actionId", "runId", "payloadHash", "inputHash", "sourcePolicyHash", "targetPolicyHash", "ownedEditSessionId"], "lifecycle_invalid_pending_authorization");
    const a = p.finalizationAuthorization;
    if (typeof a.actionId !== "string" || !a.actionId || typeof a.runId !== "string" || !a.runId || !c.SHA.test(a.payloadHash || "") || a.inputHash !== c.hash({ name: "finalize_project_lifecycle", args: { transitionId: p.transitionId } }) || a.sourcePolicyHash !== p.sourcePolicyHash || a.targetPolicyHash !== p.targetPolicyHash || a.ownedEditSessionId !== undefined && (typeof a.ownedEditSessionId !== "string" || !a.ownedEditSessionId || a.ownedEditSessionId.length > 240)) c.fail("lifecycle_invalid_pending_authorization");
  }
  if (p.recovery !== undefined || p.recoveryAuthorization !== undefined) {
    c.validateRecovery(p.recovery, p.authorization); c.validateCompletionAuthority(p.recoveryAuthorization, "recover_project_lifecycle", p.transitionId);
    const a = p.recoveryAuthorization;
    if (!p.proof || p.operation !== "save_project_as" || a.sourcePolicyHash !== p.sourcePolicyHash || a.targetPolicyHash !== p.targetPolicyHash || a.actionId === p.authorization.actionId || a.runId === p.authorization.runId) c.fail("lifecycle_invalid_recovery_authorization");
    if (p.finalizationAuthorization && [p.authorization, a].some(authority => authority.actionId === p.finalizationAuthorization.actionId || authority.runId === p.finalizationAuthorization.runId)) c.fail("lifecycle_recovery_authority_reused");
  }
  c.nativeTuple(p.sourceNative); c.validateInventory(p.sourceInventory, p.sourceState.acceptedPlaceholders);
  if (!c.samePath(p.sourceNative.file, p.args.expectedSourceProjectFile) || p.sourceNative.dirty !== p.args.expectedSourceDirty || p.sourceNative.revision !== p.args.expectedSourceRevision || !c.samePath(p.sourceNative.file, p.sourceInventory.native.file) || p.sourceNative.dirty !== p.sourceInventory.native.dirty || p.sourceNative.revision !== p.sourceInventory.native.revision || !c.samePath(p.sourceBefore.path, p.args.expectedSourceProjectFile) || p.sourceBefore.sha256 !== p.args.expectedSourceSavedSha25664 || c.hash(p.sourceState) !== p.sourcePolicyHash || c.hash(p.targetStateBefore) !== p.targetPolicyHash) c.fail("lifecycle_pending_pin_changed");
  if (p.operation !== "open_project" && (!p.stageProjectFile || !c.samePath(path.dirname(p.stageProjectFile), path.dirname(p.args.targetProjectFile)) || !/^\.ae-agent-stage-[0-9a-f-]{36}\.aep$/i.test(path.basename(p.stageProjectFile)))) c.fail("lifecycle_invalid_stage");
  if (p.stageInventory) c.validateInventory(p.stageInventory, p.operation === "save_project_as" ? p.sourceState.acceptedPlaceholders : []);
  if (p.targetInventory) c.validateInventory(p.targetInventory, p.targetState.acceptedPlaceholders);
  if (p.proof && p.phase !== "final_proven" && p.phase !== "context_retired") c.fail("lifecycle_invalid_pending_proof");
  if (p.proof) {
    c.nativeTuple(p.proof.finalNative); validateFileRecord(p.proof.sourceAfter); validateFileRecord(p.proof.targetFile);
    if (!p.targetInventory || !p.targetFile || !sameRecord(p.sourceBefore, p.proof.sourceAfter) || !sameRecord(p.targetFile, p.proof.targetFile) || !c.samePath(p.proof.finalNative.file, p.args.targetProjectFile) || p.proof.finalNative.dirty !== false || c.hash(p.proof.finalNative) !== c.hash(p.targetInventory.native) || p.proof.targetInventoryHash !== c.inventoryHash(p.targetInventory)) c.fail("lifecycle_invalid_pending_proof");
    if (p.operation !== "open_project") { if (!p.stageFile || !p.stageInventory || p.stageFile.sha256 !== p.targetFile.sha256 || p.stageFile.bytes !== p.targetFile.bytes || !c.samePath(p.stageFile.path, p.stageProjectFile)) c.fail("lifecycle_invalid_pending_proof"); c.assertInventoryMatch(p.stageInventory, p.targetInventory); }
    if (p.operation === "save_project_as") c.assertInventoryMatch(p.sourceInventory, p.targetInventory);
    if (p.operation === "create_named_project" && p.targetInventory.items.length !== 0) c.fail("lifecycle_invalid_pending_proof");
  }
  if ((p.phase === "final_proven" || p.phase === "context_retired") && !p.proof) c.fail("lifecycle_invalid_pending_proof");
  if (p.phase === "context_retired" && (!p.retirement || ["sessionClosed", "proposalRetired", "cachesInvalidated", "desiredEnabledPreserved"].some(k => p.retirement[k] !== true))) c.fail("lifecycle_invalid_pending_retirement");
  return p;
}
// Completeness is separate from the backwards-compatible partial pending reader.
function assertRecoveryEligible(p, proven = false) {
  validatePending(p);
  if (p.operation !== "save_project_as" || (!proven && (p.phase !== "open_final_submitted" || p.status !== "unknown" || p.possibleDelivery !== true || p.proof || p.recovery || p.recoveryAuthorization || p.finalizationAuthorization)) || proven && (!p.recovery || !p.proof || !["final_proven", "context_retired"].includes(p.phase))) c.fail("lifecycle_recovery_ineligible");
  for (const key of ["checkpoint", "stageReservation", "stageNative", "stageInventory", "stageFile", "targetFile"]) if (!p[key]) c.fail("lifecycle_recovery_chain_incomplete", key);
  if (!proven && (typeof p.errorCode !== "string" || !p.errorCode || p.errorCode.length > 120)) c.fail("lifecycle_recovery_chain_incomplete", "errorCode");
  c.nativeTuple(p.stageNative);
  if (!c.UUID.test(path.basename(p.stageProjectFile).slice(".ae-agent-stage-".length,-".aep".length))) c.fail("lifecycle_invalid_stage");
  if (!c.samePath(p.stageNative.file, p.stageProjectFile) || p.stageNative.dirty !== false || c.hash(p.stageNative) !== c.hash(p.stageInventory.native) || !c.samePath(p.stageFile.path, p.stageProjectFile) || !c.samePath(p.stageReservation.path, p.stageProjectFile) || p.stageReservation.bytes !== 0 || p.stageReservation.sha256 !== c.hash(Buffer.alloc(0)) || !c.samePath(p.targetFile.path, p.args.targetProjectFile) || p.stageFile.bytes < 1 || p.stageFile.sha256 !== p.targetFile.sha256 || p.stageFile.bytes !== p.targetFile.bytes || p.targetStateBefore !== null) c.fail("lifecycle_recovery_chain_mismatch");
  const checkpoint = p.checkpoint;
  c.exact(checkpoint, ["path", "bytes", "sha256", "fileIdentity", "observedAt", "checkpointFile", "sourceFile", "label", "snapshotScope"], "lifecycle_checkpoint_invalid");
  validateFileRecord({path:checkpoint.path, bytes:checkpoint.bytes, sha256:checkpoint.sha256, fileIdentity:checkpoint.fileIdentity, observedAt:checkpoint.observedAt});
  if (!c.samePath(checkpoint.path, checkpoint.checkpointFile) || !c.samePath(checkpoint.sourceFile, p.sourceBefore.path) || checkpoint.label !== p.args.checkpointLabel || checkpoint.snapshotScope !== "on_disk_before_lifecycle" || checkpoint.bytes !== p.sourceBefore.bytes || checkpoint.sha256 !== p.sourceBefore.sha256) c.fail("lifecycle_checkpoint_invalid");
  const records = [p.sourceBefore, checkpoint, p.stageFile, p.targetFile];
  for (let i = 0; i < records.length; i++) for (let j = i + 1; j < records.length; j++) if (c.samePath(records[i].path, records[j].path) || c.hash(records[i].fileIdentity) === c.hash(records[j].fileIdentity)) c.fail("lifecycle_recovery_file_alias");
  c.assertInventoryMatch(p.sourceInventory, p.stageInventory); assertOwnershipInventory(p.sourceState, p.sourceInventory); assertOwnershipInventory(p.sourceState, p.stageInventory);
  const migrated = migrateTargetState(p.operation, p.sourceState, p.args.targetProjectFile, p.transitionId, p.stageInventory, null);
  if (c.hash(migrated) !== c.hash(p.targetState)) c.fail("lifecycle_recovery_migration_changed");
  return p;
}
function validateV2Store(store) {
  if (store.schema !== V2) {
    if(["pendingLifecycle","lifecycleGeneration","lifecycleReceipts"].some(key=>Object.prototype.hasOwnProperty.call(store,key)))c.fail("lifecycle_schema_downgrade");
    return store;
  }
  if (!Number.isSafeInteger(store.lifecycleGeneration) || store.lifecycleGeneration < 0 || !Object.prototype.hasOwnProperty.call(store, "pendingLifecycle") || !Array.isArray(store.lifecycleReceipts) || store.lifecycleReceipts.length > MAX_RECEIPTS) c.fail("lifecycle_invalid_v2_store");
  const ids = new Set(); for (const receipt of store.lifecycleReceipts) { c.verifyReceipt(receipt); if (ids.has(receipt.transitionId) || receipt.generation > store.lifecycleGeneration) c.fail("lifecycle_invalid_v2_receipts"); ids.add(receipt.transitionId); }
  if (store.lifecycleGeneration > 0 && (!store.lifecycleReceipts.length || store.lifecycleReceipts.at(-1).generation !== store.lifecycleGeneration) || store.lifecycleReceipts.some((r, i) => i > 0 && r.generation !== store.lifecycleReceipts[i - 1].generation + 1)) c.fail("lifecycle_invalid_v2_receipts");
  if (store.pendingLifecycle !== null) { validatePending(store.pendingLifecycle); if (store.pendingLifecycle.baseGeneration !== store.lifecycleGeneration || ids.has(store.pendingLifecycle.transitionId)) c.fail("lifecycle_invalid_v2_pending"); }
  if (store.pendingLifecycle) {
    const p = store.pendingLifecycle;
    if (c.hash(readState(store, p.args.expectedSourceProjectFile)) !== p.sourcePolicyHash || c.hash(store.projectState[keyFor(p.args.targetProjectFile)] || null) !== p.targetPolicyHash) c.fail("lifecycle_pending_store_policy_changed");
  }
  for (const state of Object.values(store.projectState)) if (state.inheritedOwnership !== undefined) validateInheritedOwnership(state.inheritedOwnership);
  return store;
}
function defaultState(projectFile) { const key = keyFor(projectFile); return { projectFile: memory().canonicalSavedProject(projectFile), projectKey: key, revision: 0, acceptedPlaceholders: [], groupMappings: [], constraints: null, reviewArtifacts: {}, sourceLoadEpochs: {} }; }
function readState(store, file) { return c.clone(store.projectState[keyFor(file)] || defaultState(file)); }
function assertOwnershipInventory(state, inventory) {
  const rows = [...(state.inheritedOwnership || []), ...Object.values(state.reviewArtifacts || {}).map(r => ({ itemIds: r.receipt.items.map(i => i.itemId) }))];
  for (const row of rows) for (const id of row.itemIds) if (!inventory.items.some(item => item.id === id)) c.fail("lifecycle_owned_item_identity_missing");
  for (const record of Object.values(state.reviewArtifacts || {})) for (const owned of record.receipt.items) {
    const item = inventory.items.find(value => value.id === owned.itemId);
    if (!item || item.kind !== "comp" || item.name !== owned.name || item.comment !== owned.comment) c.fail("lifecycle_owned_item_identity_mismatch");
  }
}
function invalidateContextProofs(state, transitionId) {
  const target = c.clone(state), inherited = (state.inheritedOwnership || []).map(row => ({ ...c.clone(row), transitionId, proofValidity: "invalid" }));
  for (const record of Object.values(state.reviewArtifacts || {})) inherited.push({ owner: record.owner, itemIds: record.receipt.items.map(item => item.itemId), sourceKey: state.projectKey, transitionId, proofValidity: "invalid" });
  if (inherited.length) { validateInheritedOwnership(inherited); target.inheritedOwnership = inherited; }
  target.reviewArtifacts = {}; target.sourceLoadEpochs = {}; return target;
}
function migrateTargetState(operation, source, targetFile, transitionId, inventory, existing) {
  if (operation === "open_project") { if (!existing) c.fail("lifecycle_target_policy_missing"); c.validateInventory(inventory, existing.acceptedPlaceholders); assertOwnershipInventory(existing, inventory); return invalidateContextProofs(existing, transitionId); }
  if (existing) c.fail("lifecycle_target_policy_collision");
  const target = defaultState(targetFile);
  if (operation === "create_named_project") { if (inventory.items.length !== 0) c.fail("lifecycle_create_not_empty"); return target; }
  if (operation !== "save_project_as") c.fail("lifecycle_invalid_operation");
  c.validateInventory(inventory, source.acceptedPlaceholders); assertOwnershipInventory(source, inventory);
  target.acceptedPlaceholders = c.clone(source.acceptedPlaceholders); target.groupMappings = c.clone(source.groupMappings); target.constraints = c.clone(source.constraints || null);
  const inherited = invalidateContextProofs(source, transitionId).inheritedOwnership;
  if (inherited) target.inheritedOwnership = inherited;
  // Reviews and source-load epochs stay empty: inherited objects carry no valid proof.
  return target;
}
function asV2(store) { return store.schema === V2 ? c.clone(store) : { ...c.clone(store), schema: V2, pendingLifecycle: null, lifecycleReceipts: [], lifecycleGeneration: 0 }; }
function packedCapacity(store) {
  memory().validateProjectStateStore(store);
  const logicalBytes = Buffer.byteLength(JSON.stringify(store), "utf8"), packedBytes = Buffer.byteLength(memory().serializeProjectStateStore(store), "utf8");
  if (logicalBytes > memory().MAX_STATE_LOGICAL_BYTES || packedBytes > memory().MAX_PACKED_STATE_BYTES) c.fail("lifecycle_store_capacity"); return { logicalBytes, packedBytes };
}
function capacityPreflight(store, pending, target, receipt) {
  const candidate = asV2(store); candidate.pendingLifecycle = c.clone(pending);
  // Reserve complete source/stage/final inventories and bounded future native/file proof before delivery.
  const inventory = pending.sourceInventory;
  const reserved = { ...candidate.pendingLifecycle, stageInventory: inventory, targetInventory: inventory, targetState: target,
    capacityReservation: "x".repeat(16384) };
  if (pending.operation === "create_named_project") { reserved.stageInventory = { ...inventory, items: [], protectedEvidence: [] }; reserved.targetInventory = reserved.stageInventory; }
  if (pending.operation === "open_project") { delete reserved.stageInventory; delete reserved.targetInventory; reserved.capacityReservation += "x".repeat(c.LIMITS.bytes); }
  candidate.pendingLifecycle = pending; packedCapacity(candidate);
  // Capacity is a size estimate, not a claim that the projected record is semantically complete.
  const logicalBytes = Buffer.byteLength(JSON.stringify({ ...candidate, pendingLifecycle: reserved, lifecycleReceipts: [...candidate.lifecycleReceipts.slice(-(MAX_RECEIPTS - 1)), receipt || { reserved: "x".repeat(16384) }], projectState: { ...candidate.projectState, [target.projectKey]: target } }), "utf8");
  const projected = { ...candidate, pendingLifecycle: reserved, projectState: { ...candidate.projectState, [target.projectKey]: target }, lifecycleReceipts: [...candidate.lifecycleReceipts.slice(-(MAX_RECEIPTS - 1)), receipt || { reserved: "x".repeat(16384) }] };
  const packedBytes = Buffer.byteLength(memory().serializeProjectStateStore(projected), "utf8");
  if (logicalBytes > memory().MAX_STATE_LOGICAL_BYTES || packedBytes > memory().MAX_PACKED_STATE_BYTES) c.fail("lifecycle_store_capacity"); return { logicalBytes, packedBytes };
}
function guardSnapshot(options = {}) {
  const file = statePath(options), io = options.filesystem || fs, enabled = options.enabled === undefined ? process.env.AE_PROJECT_LIFECYCLE_ENABLED === "1" : options.enabled === true;
  let marker = null, raw = null, problem = null, markerSeen = false;
  try { markerSeen = io.existsSync(markerPath(file)); if (markerSeen) { if (io.statSync(markerPath(file)).size > 4096) c.fail("lifecycle_marker_corrupt"); marker = JSON.parse(io.readFileSync(markerPath(file), "utf8")); c.exact(marker, ["schema", "storePathHash"], "lifecycle_marker_corrupt"); if (!marker || marker.schema !== MARKER || marker.storePathHash !== c.hash(path.resolve(file))) c.fail("lifecycle_marker_corrupt"); initializedPaths.add(file); } } catch (_) { problem = "lifecycle_marker_corrupt"; markerSeen = true; }
  try { if (io.existsSync(file)) { if (io.statSync(file).size > memory().MAX_PACKED_STATE_BYTES) c.fail("lifecycle_store_corrupt"); raw = JSON.parse(io.readFileSync(file, "utf8")); } } catch (_) { problem = problem || "lifecycle_store_corrupt"; }
  const lifecycleEvidence=raw && ["pendingLifecycle","lifecycleGeneration","lifecycleReceipts"].some(key=>Object.prototype.hasOwnProperty.call(raw,key));
  const required = enabled || markerSeen || initializedPaths.has(file) || raw && raw.schema === V2 || lifecycleEvidence;
  if (!required) problem = null; // Never-enabled legacy loader preserves its own errors/empty-state behavior.
  if (required && !raw) problem = problem || "lifecycle_store_missing";
  if ((initializedPaths.has(file) || raw && raw.schema === V2 || lifecycleEvidence) && !marker) problem = problem || "lifecycle_marker_missing";
  if (required && raw && !problem) { try { memory().validateProjectStateStore(memory().transformReviewStore(raw, false)); } catch (_) { problem = "lifecycle_store_corrupt"; } }
  return { file, enabled, required: !!required, marker, problem, generation: raw && raw.schema === V2 ? raw.lifecycleGeneration : 0, pending: raw && raw.schema === V2 ? raw.pendingLifecycle : null };
}
function assertReadableProtectionStore(options = {}) { const registered = guards.get(statePath(options)); const facts = guardSnapshot(registered ? { ...registered.options, ...options } : options); if (facts.problem) c.fail(facts.problem); return facts; }
function capabilityRecord(cap) { return cap && capabilities.get(cap); }
function validateCommandCapability(cap, command = {}) {
  const record = capabilityRecord(cap); if (!record || !record.active) c.fail("lifecycle_phase_capability_required");
  if (command.rawScript !== undefined && c.hash(command.rawScript) !== record.scriptHash || command.script !== undefined && command.rawScript === undefined && c.hash(command.script) !== record.scriptHash || command.phase !== undefined && command.phase !== record.phase) c.fail("lifecycle_phase_capability_mismatch");
  if (command.commandId !== undefined) {
    if (typeof command.commandId !== "string" || !command.commandId || record.commandId && record.commandId !== command.commandId) c.fail("lifecycle_phase_command_replay");
    record.commandId = command.commandId;
  }
  const facts = guardSnapshot(record.options); if (facts.problem && !record.allowBlockedRead) c.fail(facts.problem);
  if (record.readOnly) { if (record.transitionId && (!facts.pending || facts.pending.transitionId !== record.transitionId)) c.fail("lifecycle_read_capability_stale"); return true; }
  const p = facts.pending;
  if (!p || p.transitionId !== record.transitionId || p.phase !== record.pendingPhase || p.authorization.actionId !== record.binding.actionId || p.authorization.runId !== record.binding.runId || p.authorization.payloadHash !== record.binding.payloadHash || p.inputHash !== record.binding.inputHash || p.sourcePolicyHash !== record.binding.sourcePolicyHash || p.targetPolicyHash !== record.binding.targetPolicyHash || locks.get(record.file) !== record.lease) c.fail("lifecycle_phase_capability_stale");
  if (record.deliveryFile) record.verifyDeliveryFile(record.deliveryFile);
  return true;
}
function assertMutationAllowed(options = {}) {
  const active = guards.get(statePath(options)); const effective = active ? active.options : options;
  const facts = guardSnapshot(effective); if (facts.problem) c.fail(facts.problem);
  const lock = locks.get(facts.file);
  if (facts.pending || lock) { validateCommandCapability(options.capability, options.command || {}); const record = capabilityRecord(options.capability); if (record.file !== facts.file) c.fail("lifecycle_phase_capability_mismatch"); }
  return true;
}
function assertPolicyWriteAllowed(options = {}) { if (options.lifecycleWriteCapability && leases.has(options.lifecycleWriteCapability) && leases.get(options.lifecycleWriteCapability).active && locks.get(statePath(options)) === options.lifecycleWriteCapability) return assertReadableProtectionStore(options); return assertMutationAllowed(options); }
function createLifecycleStorage(options = {}) {
  const configured = { ...options, statePath: statePath(options) }, file = configured.statePath, io = options.filesystem || fs;
  guards.set(file, { options: configured });
  const load = () => { assertReadableProtectionStore(configured); return memory().loadProjectStateStore({ ...configured, skipLifecycleReadGuard: true }); };
  function assertRecoveryReadable() {
    const facts = assertReadableProtectionStore(configured);
    if (!facts.enabled || !facts.marker) c.fail("lifecycle_recovery_ineligible");
    for (const target of [file, markerPath(file)]) {
      const stat = io.lstatSync(target);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || !c.samePath(io.realpathSync(target), target) || !c.samePath(io.realpathSync(path.dirname(target)), path.dirname(target))) c.fail("lifecycle_recovery_store_ambiguous");
    }
    return facts;
  }
  function atomicMarker() {
    if (io.existsSync(markerPath(file))) return;
    const marker = { schema: MARKER, storePathHash: c.hash(path.resolve(file)) }, temporary = markerPath(file) + "." + crypto.randomUUID() + ".tmp";
    io.mkdirSync(path.dirname(file), { recursive: true }); let fd;
    try { fd = io.openSync(temporary, "wx"); io.writeFileSync(fd, JSON.stringify(marker) + "\n", "utf8"); io.fsyncSync(fd); io.closeSync(fd); fd = null; io.renameSync(temporary, markerPath(file)); initializedPaths.add(file); }
    finally { if (fd !== undefined && fd !== null) io.closeSync(fd); if (io.existsSync(temporary)) io.unlinkSync(temporary); }
  }
  function requireLease(lease) { const l = leases.get(lease); if (!l || !l.active || locks.get(file) !== lease) c.fail("lifecycle_admission_required"); return l; }
  function write(lease, mutate) {
    requireLease(lease); const before = load(), candidate = c.clone(before), sourceBytes = io.readFileSync(file), beforeHash = c.hash(sourceBytes);
    mutate(candidate); packedCapacity(candidate);
    if (c.hash(io.readFileSync(file)) !== beforeHash) c.fail("lifecycle_store_concurrent_write");
    memory().atomicProjectStateWrite(candidate, { ...configured, filesystem: io, lifecycleWriteCapability: lease }); return c.clone(candidate);
  }
  function acquireAdmission(binding, idle) {
    if (locks.has(file)) c.fail("lifecycle_concurrent_admission");
    const facts = assertReadableProtectionStore(configured); if (facts.pending) c.fail("lifecycle_pending_blocks_writes");
    if (facts.enabled !== true) c.fail("lifecycle_disabled"); if (facts.generation === Number.MAX_SAFE_INTEGER) c.fail("lifecycle_generation_exhausted"); if (typeof idle !== "function" || idle() !== true) c.fail("lifecycle_not_idle");
    const lease = Object.freeze(Object.create(null)); leases.set(lease, { active: true, binding }); locks.set(file, lease); return lease;
  }
  function acquireFinalizeAdmission(binding, transitionId, idle) {
    if (locks.has(file)) c.fail("lifecycle_concurrent_admission"); const facts = assertReadableProtectionStore(configured);
    if (!facts.enabled || !facts.pending || facts.pending.transitionId !== transitionId || typeof idle !== "function" || idle() !== true) c.fail("lifecycle_finalize_admission_denied");
    const lease = Object.freeze(Object.create(null)); leases.set(lease, { active: true, binding }); locks.set(file, lease); return lease;
  }
  function acquireRecoveryAdmission(binding, transitionId, pendingHash, idle) {
    if (locks.has(file)) c.fail("lifecycle_concurrent_admission");
    const facts = assertRecoveryReadable();
    if (!facts.enabled || !facts.marker || !facts.pending || facts.pending.transitionId !== transitionId || facts.generation !== facts.pending.baseGeneration || facts.generation === Number.MAX_SAFE_INTEGER || c.hash(facts.pending) !== pendingHash || typeof idle !== "function" || idle() !== true) c.fail("lifecycle_recovery_admission_denied");
    assertRecoveryEligible(facts.pending); c.validateCompletionAuthority(binding, "recover_project_lifecycle", transitionId);
    if (binding.actionId === facts.pending.authorization.actionId || binding.runId === facts.pending.authorization.runId) c.fail("lifecycle_recovery_authority_reused");
    const lease = Object.freeze(Object.create(null)); leases.set(lease, { active: true, binding, mode: "recovery", pendingHash }); locks.set(file, lease); return lease;
  }
  function releaseAdmission(lease) { requireLease(lease); leases.get(lease).active = false; locks.delete(file); }
  async function withCapability(lease, pending, phase, native, script, callback, delivery) {
    const l = requireLease(lease); if (l.mode === "recovery") c.fail("lifecycle_recovery_native_mutation_forbidden"); c.nativeTuple(native); const fresh = load().pendingLifecycle;
    if (!fresh || fresh.transitionId !== pending.transitionId || fresh.phase !== pending.phase || c.hash(fresh.authorization) !== c.hash(pending.authorization)) c.fail("lifecycle_phase_capability_stale");
    const cap = Object.freeze(Object.create(null)), record = { active: true, file, options: configured, transitionId: pending.transitionId, pendingPhase: pending.phase, phase,
      currentFile: native.file, expectedNative: c.clone(native), scriptHash: c.hash(script), binding: { ...pending.authorization, inputHash: pending.inputHash, sourcePolicyHash: pending.sourcePolicyHash, targetPolicyHash: pending.targetPolicyHash }, lease, readOnly: false,
      deliveryFile: delivery && delivery.file, verifyDeliveryFile: delivery && delivery.verify };
    if (l.binding.actionId !== pending.authorization.actionId || l.binding.runId !== pending.authorization.runId) c.fail("lifecycle_phase_authority_mismatch"); capabilities.set(cap, record);
    try { validateCommandCapability(cap, { rawScript: script, phase }); return await callback(cap); } finally { record.active = false; }
  }
  async function withReadCapability(transitionId, inventoryOptions, callback, readbackRole) {
    if (readbackRole !== undefined && !c.RECOVERY_READBACK_ROLES.includes(readbackRole)) c.fail("lifecycle_recovery_readback_role_invalid");
    const script = c.nativeInventoryScript(inventoryOptions), cap = Object.freeze(Object.create(null)), record = { active: true, file, options: configured, transitionId: transitionId || null, phase: "readonly_inventory", scriptHash: c.hash(script), readOnly: true, readbackRole:readbackRole || null };
    capabilities.set(cap, record); try { return await callback(script, cap); } finally { record.active = false; }
  }
  async function withStateReadCapability(callback) {
    const script = "return " + require("./project-lifecycle-state").nativeReadScript(), cap = Object.freeze(Object.create(null));
    const record = { active: true, file, options: configured, transitionId: null, phase: "readonly_state", scriptHash: c.hash(script), readOnly: true, allowBlockedRead: true };
    capabilities.set(cap, record); try { return await callback(script, cap); } finally { record.active = false; }
  }
  function begin(lease, pending) {
    const binding = requireLease(lease).binding; if (binding.actionId !== pending.authorization.actionId || binding.runId !== pending.authorization.runId) c.fail("lifecycle_authority_mismatch");
    validatePending(pending); atomicMarker(); return write(lease, candidate => { if (candidate.pendingLifecycle) c.fail("lifecycle_pending_blocks_writes"); Object.assign(candidate, asV2(candidate)); candidate.pendingLifecycle = c.clone(pending); }).pendingLifecycle;
  }
  function update(lease, transitionId, mutate) { return write(lease, candidate => {
    if (!candidate.pendingLifecycle || candidate.pendingLifecycle.transitionId !== transitionId) c.fail("lifecycle_pending_changed");
    const before = c.clone(candidate.pendingLifecycle); mutate(candidate.pendingLifecycle);
    if (requireLease(lease).mode === "recovery") {
      const immutable = p => Object.fromEntries(Object.entries(p).filter(([key]) => !["targetInventory", "proof", "phase", "status", "errorCode", "recovery", "recoveryAuthorization", "retirement"].includes(key)));
      const after = candidate.pendingLifecycle, admission = requireLease(lease);
      if (c.hash(immutable(before)) !== c.hash(immutable(after)) || !after.recovery || !after.proof || !["final_proven", "context_retired"].includes(after.phase) || c.hash(after.recoveryAuthorization) !== c.hash(admission.binding)) c.fail("lifecycle_recovery_origin_changed");
      if (!before.recovery && (after.recovery.origin.pendingHash !== admission.pendingHash || c.hash(before) !== admission.pendingHash || after.recovery.origin.errorCode !== before.errorCode || after.recovery.origin.phase !== before.phase || after.recovery.origin.status !== before.status || after.recovery.provenAt !== after.proof.provenAt)) c.fail("lifecycle_recovery_origin_changed");
      if (before.recovery && ["targetInventory", "proof", "recovery", "recoveryAuthorization"].some(key => c.hash(before[key]) !== c.hash(after[key]))) c.fail("lifecycle_recovery_origin_changed");
    }
  }).pendingLifecycle; }
  function commit(lease, transitionId, receipt) {
    c.verifyReceipt(receipt); return write(lease, candidate => {
      const p = candidate.pendingLifecycle; if (!p || p.transitionId !== transitionId || p.phase !== "context_retired" || !p.proof || !p.retirement || receipt.generation !== candidate.lifecycleGeneration + 1) c.fail("lifecycle_commit_not_proven");
      if (p.recovery && (c.hash(receipt.recovery) !== c.hash(p.recovery) || c.hash(receipt.recoveredBy) !== c.hash(p.recoveryAuthorization) || c.hash(receipt.authorization) !== c.hash(p.authorization) || c.hash(receipt.finalizedBy || null) !== c.hash(p.finalizationAuthorization || null))) c.fail("lifecycle_recovery_receipt_changed");
      if (c.hash(readState(candidate, p.args.expectedSourceProjectFile)) !== p.sourcePolicyHash || c.hash(candidate.projectState[keyFor(p.args.targetProjectFile)] || null) !== p.targetPolicyHash) c.fail("lifecycle_policy_changed");
      candidate.projectState[p.targetState.projectKey] = c.clone(p.targetState); candidate.lifecycleReceipts = [...candidate.lifecycleReceipts.slice(-(MAX_RECEIPTS - 1)), c.clone(receipt)]; candidate.lifecycleGeneration++; candidate.pendingLifecycle = null;
    });
  }
  return { load, begin, update, commit, acquireAdmission, acquireFinalizeAdmission, acquireRecoveryAdmission, assertRecoveryReadable, releaseAdmission, withPhaseCapability: withCapability, withReadCapability, withStateReadCapability,
    assertMutationAllowed: context => assertMutationAllowed({ ...configured, ...(context || {}) }), epoch: () => { const facts = assertReadableProtectionStore(configured); return facts.generation; },
    pendingProjection: () => { const facts = guardSnapshot(configured); const p = facts.pending; return { enabled: facts.enabled, blocked: !!facts.problem || !!p || locks.has(file), problem: facts.problem, generation: facts.generation, pending: p ? { transitionId: p.transitionId, operation: p.operation, phase: p.phase, status: p.status, possibleDelivery: p.possibleDelivery, sourceProjectFile: p.args && p.args.expectedSourceProjectFile, targetProjectFile: p.args && p.args.targetProjectFile } : null }; } };
}
module.exports = { V2, MARKER, MAX_RECEIPTS, validateV2Store, validatePending, validateFileRecord, assertRecoveryEligible, validateInheritedOwnership, defaultState, readState, assertOwnershipInventory, invalidateContextProofs, migrateTargetState, packedCapacity, capacityPreflight,
  createLifecycleStorage, assertReadableProtectionStore, assertMutationAllowed, assertPolicyWriteAllowed, guardSnapshot, markerPath, validateCommandCapability, isPhaseCapability: cap => !!capabilityRecord(cap)?.active,
  phaseCapabilityFacts: cap => { const r = capabilityRecord(cap); if (!r || !r.active) return null; return Object.freeze({ phase: r.phase, readOnly: r.readOnly, currentFile: r.currentFile || null, transitionId: r.transitionId, scriptHash: r.scriptHash, commandId:r.commandId || null, readbackRole:r.readbackRole || null }); },
  epoch: options => assertReadableProtectionStore(options).generation };

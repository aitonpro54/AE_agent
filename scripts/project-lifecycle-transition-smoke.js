"use strict";
const assert = require("assert"), fs = require("fs"), path = require("path"), vm = require("vm"), crypto = require("crypto");
const c = require("../mcp-server/project-lifecycle-contract"), t = require("../mcp-server/project-lifecycle-transition"), m = require("../mcp-server/project-intent-memory"), p = require("../mcp-server/placeholder-protection"), reviews = require("../mcp-server/placeholder-review-service");
const { fixture } = require("./project-lifecycle-fixture");
let checks = 0;
async function using(options, fn) { const f = fixture(options); try { await fn(f); } finally { f.dispose(); } }
function throws(fn, code) { checks++; assert.throws(fn, error => !code || error.code === code || String(error.message).includes(code)); }
async function rejects(promise, code) { checks++; await assert.rejects(promise, error => !code || error.code === code || String(error.message).includes(code)); }
function installPolicy(f, targetPolicy = false) {
  const store = f.storage.load(), file = targetPolicy ? f.target : f.source, state = store.projectState[m.projectStateKey(file)];
  const run = script => JSON.parse(JSON.stringify(vm.runInContext("(function(){" + script + "})()", f.runtime)));
  const native = c.validateInventory(run(c.nativeInventoryScript()));
  const evidence = run(p.aeSupportScript + "return __phEvidence(app.project.item(2),app.project.item(2).layer(1),[]);");
  state.acceptedPlaceholders = [p.snapshotFromEvidence(evidence, { complete: true, comps: [{ itemId: 2, layers: native.items[1].layers }] }, [])];
  state.groupMappings = [{ mediaKey: "media-one", groupId: "group-one", provenance: "user_confirmed", confirmed: true }];
  state.constraints = { distinctGroups: true, disallowSourceOverlap: true, selectedTargets: [{ compItemId: 2, layerId: 101 }] };
  const owner = crypto.randomUUID(), name = "AE_AGENT_REVIEW_" + owner, comment = "AE_AGENT_REVIEW:v1:" + state.projectKey + ":" + owner;
  const sheet = { name, comment, width: 100, height: 100, frameRate: 25, duration: 0.04, layers: [] }, spec = { schema: "ae-placeholder-review-artifact.v1", owner, projectKey: state.projectKey, comment, targets: [], controls: [], sheet };
  spec.specHash = reviews.hash({ targets: [], controls: [], sheet });
  const receipt = { projectFile: file, items: [{ itemId: 4, name, comment, width: 100, height: 100, frameRate: 25, duration: 0.04, pixelAspect: 1, layers: [] }] };
  const record = { schema: "ae-placeholder-review-artifact.v1", owner, projectKey: state.projectKey, spec, receipt, receiptHash: reviews.hash(receipt), images: [] };
  reviews.validateReviewRecord(record); state.reviewArtifacts = { [owner]: record };
  f.runtime.__ownedName = name; f.runtime.__ownedComment = comment;
  vm.runInContext("var owned=new CompItem(4,app.project.item(1));owned.name=__ownedName;owned.comment=__ownedComment;owned.width=100;owned.height=100;owned.duration=0.04;owned.rows=[];owned.parentFolder=app.project.rootFolder;app.project.rows.push(owned);", f.runtime);
  m.validateProjectStateStore(store); fs.writeFileSync(f.statePath, JSON.stringify(store)); return { owner, record, before: c.clone(state) };
}
async function main() {
  await using({}, async f => {
    const policy = installPolicy(f), sourceRaw = JSON.stringify(f.storage.load().projectState[m.projectStateKey(f.source)]);
    const receipt = await f.service.execute("save_project_as", f.args(), f.context), store = f.storage.load(), target = store.projectState[m.projectStateKey(f.target)];
    assert.strictEqual(JSON.stringify(store.projectState[m.projectStateKey(f.source)]), sourceRaw);
    assert.deepStrictEqual(target.acceptedPlaceholders, policy.before.acceptedPlaceholders); assert.deepStrictEqual(target.groupMappings, policy.before.groupMappings); assert.deepStrictEqual(target.constraints, policy.before.constraints);
    assert.deepStrictEqual(Object.keys(target.reviewArtifacts), []); assert.deepStrictEqual(target.sourceLoadEpochs, {});
    assert.deepStrictEqual(target.inheritedOwnership, [{ owner: policy.owner, itemIds: [4], sourceKey: policy.before.projectKey, transitionId: receipt.transitionId, proofValidity: "invalid" }]); checks++;
    const denied = [ { tool: "cleanup_test_items", args: { owner: policy.owner, itemIds: [4] } }, { tool: "set_comp_resolution", args: { compName: f.runtime.__ownedName } }, { tool: "delete_project_items", args: { itemIds: [4] } }, { tool: "set_property_value", args: { expectedCompItemId: 4, expectedLayerId: 777 } }, { tool: "raw_jsx", args: {} } ];
    for (const step of denied) { assert.strictEqual(m.checkInheritedOwnershipSteps({ state: target, steps: [step] }).ok, false); checks++; }
    assert.strictEqual(m.checkInheritedOwnershipSteps({ state: target, steps: [{ tool: "create_comp", args: { name: "new independent comp" } }] }).ok, true); checks++;
    const registered = c.clone(policy.record); registered.projectKey = target.projectKey; registered.receipt.projectFile = f.target; registered.spec.projectKey = target.projectKey; registered.spec.comment = "AE_AGENT_REVIEW:v1:" + target.projectKey + ":" + policy.owner; registered.spec.sheet.comment = registered.spec.comment; registered.receipt.items[0].comment = registered.spec.comment; registered.spec.specHash = reviews.hash({ targets: registered.spec.targets, controls: registered.spec.controls, sheet: registered.spec.sheet }); registered.receiptHash = reviews.hash(registered.receipt);
    const controller = m.createProjectStateController({ statePath: f.statePath });
    throws(() => controller.registerReview(f.target, registered, target.revision), "inherited_ownership_requires_adoption");
    throws(() => controller.unregisterReview(f.target, policy.owner, [4], target.revision), "inherited_ownership_requires_adoption");
    throws(() => controller.addReviewImage(f.target, policy.owner, { itemId: 4 }, target.revision), "inherited_ownership_requires_adoption");
    throws(() => controller.registerSourceLoadEpoch(f.target, { sourceItemId: 4 }, target.revision), "inherited_ownership_requires_adoption");
    const invalid = c.clone(target.inheritedOwnership); invalid[0].proofValidity = "valid"; throws(() => t.validateInheritedOwnership(invalid), "lifecycle_invalid_inherited_ownership");
    const next = t.migrateTargetState("save_project_as", target, path.join(f.root, "third.aep"), crypto.randomUUID(), c.validateInventory(JSON.parse(JSON.stringify(vm.runInContext("(function(){" + c.nativeInventoryScript({ accepted: target.acceptedPlaceholders }) + "})()", f.runtime))), target.acceptedPlaceholders), null);
    assert.strictEqual(next.inheritedOwnership[0].sourceKey, policy.before.projectKey); assert.notStrictEqual(next.inheritedOwnership[0].transitionId, receipt.transitionId); checks++;
  });
  await using({ open: true }, async f => {
    const policy = installPolicy(f, true), sourceState = c.clone(f.storage.load().projectState[m.projectStateKey(f.source)]);
    await f.service.execute("open_project", f.args(), f.context); const store = f.storage.load(), target = store.projectState[m.projectStateKey(f.target)];
    assert.deepStrictEqual(c.clone(store.projectState[m.projectStateKey(f.source)]), sourceState); assert.deepStrictEqual(target.acceptedPlaceholders, policy.before.acceptedPlaceholders);
    assert.deepStrictEqual(Object.keys(target.reviewArtifacts), []); assert.deepStrictEqual(target.sourceLoadEpochs, {}); assert.strictEqual(target.inheritedOwnership[0].sourceKey, target.projectKey); checks++;
  });
  await using({ nativeHook: data => { if (data.when === "before" && data.facts.phase === "save_stage") throw new Error("pending fixture"); } }, async f => {
    await rejects(f.service.execute("save_project_as", f.args(), f.context)); const pending = f.storage.load().pendingLifecycle;
    const restarted = t.createLifecycleStorage({ statePath: f.statePath, enabled: false });
    throws(() => restarted.assertMutationAllowed(), "lifecycle_phase_capability_required");
    throws(() => t.validateCommandCapability(Object.freeze({ transitionId: pending.transitionId, confirmed: true }), { phase: "save_stage" }), "lifecycle_phase_capability_required");
    throws(() => m.createProjectStateController({ statePath: f.statePath }).mapGroup(f.source, { mediaKey: "x", groupId: "x" }, 0), "lifecycle_phase_capability_required");
    const current = fs.readFileSync(f.statePath); await restarted.withStateReadCapability(async (script, cap) => { assert(t.isPhaseCapability(cap)); t.validateCommandCapability(cap, { rawScript: script, commandId: "cmd-one" }); t.validateCommandCapability(cap, { rawScript: script, commandId: "cmd-one" }); throws(() => t.validateCommandCapability(cap, { rawScript: script, commandId: "cmd-two" }), "lifecycle_phase_command_replay"); throws(() => t.validateCommandCapability(cap, { rawScript: script + ";app.newProject();" }), "lifecycle_phase_capability_mismatch"); }); assert(fs.readFileSync(f.statePath).equals(current)); checks++;
    assert.strictEqual(restarted.epoch(), 0); assert.strictEqual(restarted.pendingProjection().blocked, true); checks++;
  });
  for (const problem of ["missing_store", "corrupt_store", "missing_marker", "corrupt_marker", "both_removed_cached"]) await using({}, async f => {
    await f.service.execute("save_project_as", f.args(), f.context); const marker = t.markerPath(f.statePath);
    if (problem === "missing_store" || problem === "both_removed_cached") fs.unlinkSync(f.statePath);
    if (problem === "corrupt_store") fs.writeFileSync(f.statePath, "{bad json");
    if (problem === "missing_marker" || problem === "both_removed_cached") fs.unlinkSync(marker);
    if (problem === "corrupt_marker") fs.writeFileSync(marker, "{}");
    const restarted = t.createLifecycleStorage({ statePath: f.statePath, enabled: false }); throws(() => restarted.assertMutationAllowed()); throws(() => m.loadProjectStateStore({ statePath: f.statePath }));
    await restarted.withStateReadCapability(async (script, cap) => { t.validateCommandCapability(cap, { rawScript: script }); assert.strictEqual(t.phaseCapabilityFacts(cap).readOnly, true); }); checks++;
  });
  await using({ enabled: false }, async f => { fs.unlinkSync(f.statePath); assert.deepStrictEqual(m.loadProjectStateStore({ statePath: f.statePath }), { schema: m.PROJECT_STATE_SCHEMA, projectState: {} }); m.createProjectStateController({ statePath: f.statePath }).mapGroup(f.source, { mediaKey: "legacy", groupId: "legacy" }, 0); assert(fs.existsSync(f.statePath)); checks++; });
  await using({}, async f => { fs.unlinkSync(f.statePath); throws(() => f.storage.assertMutationAllowed(), "lifecycle_store_missing"); assert(!fs.existsSync(f.statePath)); checks++; });
  await using({}, async f => { fs.writeFileSync(f.statePath, "{}"); throws(() => f.storage.assertMutationAllowed(), "lifecycle_store_corrupt"); checks++; });
  // Marker/store atomic write fault injection never permits a native delivery.
  for (const failure of ["marker_fsync", "marker_rename", "pending_fsync", "pending_rename"]) await using({ storeFilesystem: { ...fs,
    openSync(file, flags, ...rest) { const fd = fs.openSync(file, flags, ...rest); descriptorFiles.set(fd, String(file)); return fd; },
    fsyncSync(fd) { const file = descriptorFiles.get(fd) || "", marker = file.includes("lifecycle-initialized"); if (failure === "marker_fsync" && marker || failure === "pending_fsync" && !marker) throw new Error("store fsync failure"); return fs.fsyncSync(fd); },
    renameSync(from, to) { const marker = String(to).includes("lifecycle-initialized"); if (failure === "marker_rename" && marker || failure === "pending_rename" && !marker) throw new Error("store rename failure"); return fs.renameSync(from, to); }
  } }, async f => { await rejects(f.service.execute("save_project_as", f.args(), f.context)); assert(!f.calls.some(call => !call.readOnly)); assert(fs.readFileSync(f.source).equals(Buffer.from("approved source disk"))); checks++; });
  await using({}, async f => {
    // Reserved future inventory/store capacity is checked before checkpoint/native mutation.
    f.setNativeHook(data => { if (data.when === "after" && data.facts.readOnly) {
      const row = data.result.items[1]; const original = data.result.items.slice(); data.result.items = [];
      for (let i = 0; i < 90; i++) { const copy = c.clone(row); copy.id = 1000 + i; copy.index = i + 1; copy.name = "n".repeat(4096); copy.comment = "c".repeat(4096); copy.layers = []; data.result.items.push(copy); }
      for (const item of original) { item.index = data.result.items.length + 1; data.result.items.push(item); }
    } });
    await rejects(f.service.execute("save_project_as", f.args(), f.context), "lifecycle_store_capacity"); assert(!f.calls.some(call => !call.readOnly)); assert.strictEqual(f.storage.load().pendingLifecycle, undefined); checks++;
  });
  await using({}, async f => {
    // Meaningful offline regression: inventory sized so projected pretty JSON exceeds 2MiB, but compact fits and executes.
    f.setNativeHook(data => { if (data.when === "after" && data.facts.readOnly) {
      const comp = data.result.items.find(i => i.kind === "comp");
      if (comp && comp.layers.length === 1) {
        const baseLayer = comp.layers[0];
        comp.layers = [];
        for (let l = 1; l <= 2600; l++) {
          comp.layers.push({ ...baseLayer, id: 100 + l, index: l, name: "layer_" + l });
        }
      }
    } });
    const receipt = await f.service.execute("save_project_as", f.args(), f.context);
    assert.strictEqual(receipt.success, true);
    const diskContent = fs.readFileSync(f.statePath, "utf8");
    const loaded = f.storage.load();
    assert.strictEqual(diskContent, m.serializeProjectStateStore(loaded));
    assert(diskContent.endsWith("\n"));
    assert(!diskContent.includes("\n  "));
    checks++;
  });
  await using({}, async f => {
    // True packed overflow (> 2MiB in compact) is still rejected.
    const store = f.storage.load();
    for (let i = 0; i < 3; i++) {
      const state = t.defaultState(path.join(f.root, "overflow_" + i + ".aep"));
      for (let m = 0; m < 500; m++) {
        state.groupMappings.push({ mediaKey: "k_" + i + "_" + m + "_" + "x".repeat(3500), groupId: "g", provenance: "user_confirmed", confirmed: true });
      }
      store.projectState[state.projectKey] = state;
    }
    throws(() => t.packedCapacity(store), "lifecycle_store_capacity");
    checks++;
  });
  await using({}, async f => {
    // Logical size overflow (> 32MiB) is still rejected.
    const store = f.storage.load();
    for (let i = 0; i < 20; i++) {
      const state = t.defaultState(path.join(f.root, "logical_" + i + ".aep"));
      for (let m = 0; m < 450; m++) {
        state.groupMappings.push({ mediaKey: "k_" + i + "_" + m + "_" + "y".repeat(3800), groupId: "g", provenance: "user_confirmed", confirmed: true });
      }
      store.projectState[state.projectKey] = state;
    }
    throws(() => t.packedCapacity(store), "lifecycle_store_capacity");
    checks++;
  });
  await using({}, async f => {
    // Legacy pretty JSON store on disk is readable without loss.
    const store = f.storage.load();
    fs.writeFileSync(f.statePath, JSON.stringify(m.transformReviewStore(store, true), null, 2) + "\n", "utf8");
    const loaded = f.storage.load();
    assert.deepStrictEqual(loaded, store);
    checks++;
  });
  await using({}, async f => { await f.service.execute("save_project_as", f.args(), f.context); const firstEpoch = f.storage.epoch(), store = f.storage.load(); store.lifecycleGeneration = -1; fs.writeFileSync(f.statePath, JSON.stringify(store)); throws(() => f.storage.epoch(), "lifecycle_store_corrupt"); assert.strictEqual(firstEpoch, 1); checks++; });
  await using({}, async f => {
    // A rollback may read finalized adoption history without restoring that operation or rewriting evidence.
    const prior = await f.service.execute("save_project_as", f.args(), f.context), store = f.storage.load();
    const operation = "adopt_saved_current_after_unknown_lifecycle", retiredTransitionId = crypto.randomUUID();
    const sourcePolicyHash = c.hash("source policy"), targetPolicyHash = c.hash(null);
    const historical = { schema: c.VERSION + ".saved-current-adoption.v1", operation, success: true, transitionId: crypto.randomUUID(), retiredTransitionId, generation: 2,
      origin: { pendingHash: c.hash("original unknown pending"), baseGeneration: 1, authorization: c.clone(prior.authorization) },
      authorization: { actionId: "historical-action", runId: "historical-run", payloadHash: c.hash("historical-plan"), inputHash: c.hash({ name: operation, args: { transitionId: retiredTransitionId } }), sourcePolicyHash, targetPolicyHash },
      capsule: { path: path.join(f.root, "historical-adoption.json"), sha256: c.hash("historical capsule") }, currentFile: c.clone(prior.targetFile), finalNative: c.clone(prior.finalNative),
      inventoryHash: prior.targetInventoryHash, sourcePolicyHash, targetPolicyHash, adoptedPolicyHash: c.hash("adopted policy"), sealHash: c.hash("seal"), activationHash: c.hash("activation"), nativeMutations: 0, contextRetired: true, artisticAccepted: false };
    assert.deepStrictEqual(c.verifyStoredReceipt(historical), { valid: true, transitionId: historical.transitionId, generation: 2 });
    throws(() => c.verifyReceipt(historical), "lifecycle_invalid_receipt");
    for (const name of [operation, "finalize_saved_current_adoption"]) {
      assert(!c.isLifecycleTool(name) && !c.isLifecycleMutation(name) && !c.isLifecycleCompletion(name));
      assert(!c.toolDefinitions.some(tool => tool.name === name));
      throws(() => c.validateInput(name, { transitionId: retiredTransitionId }), "lifecycle_unknown_tool");
    }
    store.lifecycleReceipts.push(historical); store.lifecycleGeneration = 2;
    const bytes = m.serializeProjectStateStore(store), markerBefore = fs.readFileSync(t.markerPath(f.statePath)), callCount = f.calls.length;
    fs.writeFileSync(f.statePath, bytes, "utf8");
    assert.deepStrictEqual(f.storage.load(), store); assert.strictEqual(f.storage.epoch(), 2); assert.strictEqual(f.storage.pendingProjection().blocked, false);
    assert.strictEqual(fs.readFileSync(f.statePath, "utf8"), bytes); assert(fs.readFileSync(t.markerPath(f.statePath)).equals(markerBefore)); assert.strictEqual(f.calls.length, callCount); checks++;
    for (const mutate of [
      r => { r.cloudOwner = "unsupported"; }, r => { r.schema += ".unknown"; }, r => { r.operation = "finalize_saved_current_adoption"; },
      r => { r.nativeMutations = 1; }, r => { r.contextRetired = false; }, r => { r.artisticAccepted = true; },
      r => { r.origin.baseGeneration = 0; }, r => { r.origin.pendingHash = "invalid"; }, r => { r.origin.authorization.cloudOwner = "unsupported"; },
      r => { r.authorization.actionId = r.origin.authorization.actionId; }, r => { r.authorization.runId = r.origin.authorization.runId; },
      r => { r.authorization.inputHash = c.hash({ name: operation, args: { transitionId: r.transitionId } }); },
      r => { r.authorization.sourcePolicyHash = c.hash("different policy"); }, r => { r.inventoryHash = "invalid"; },
      r => { r.capsule.path = "relative.json"; }, r => { r.capsule.sha256 = "invalid"; }, r => { r.capsule.authorization = {}; },
      r => { r.currentFile.bytes = 0; }, r => { r.currentFile.fileIdentity.inode = "0"; }, r => { r.finalNative.dirty = true; },
      r => { r.finalNative.file = f.source; }
    ]) {
      const bad = c.clone(store); mutate(bad.lifecycleReceipts.at(-1)); throws(() => m.validateProjectStateStore(bad));
    }
    const gap = c.clone(store); gap.lifecycleGeneration = 3; throws(() => t.validateV2Store(gap), "lifecycle_invalid_v2_receipts");
    const duplicate = c.clone(store); duplicate.lifecycleReceipts.push({ ...c.clone(historical), generation: 3, origin: { ...c.clone(historical.origin), baseGeneration: 2 } }); duplicate.lifecycleGeneration = 3;
    throws(() => t.validateV2Store(duplicate), "lifecycle_invalid_v2_receipts");
    const invalidPending = c.clone(store); invalidPending.pendingLifecycle = {}; throws(() => t.validateV2Store(invalidPending), "lifecycle_invalid_pending");
    const bad = c.clone(store); bad.lifecycleReceipts.at(-1).nativeMutations = 1; fs.writeFileSync(f.statePath, m.serializeProjectStateStore(bad), "utf8");
    throws(() => f.storage.assertMutationAllowed(), "lifecycle_store_corrupt"); assert.strictEqual(f.calls.length, callCount);
  });
  console.log("project-lifecycle-transition-smoke PASS", checks, "offline checks (V2/marker faults, migration, inherited ownership, capacity, barriers)");
}
const descriptorFiles = new Map();
main().catch(error => { console.error(error.stack); process.exitCode = 1; });

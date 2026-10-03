"use strict";
const assert = require("assert"), fs = require("fs"), path = require("path"), crypto = require("crypto");
const c = require("../mcp-server/project-lifecycle-contract"), t = require("../mcp-server/project-lifecycle-transition"), m = require("../mcp-server/project-intent-memory");
const { createProjectLifecycleService } = require("../mcp-server/project-lifecycle-service"), { fixture } = require("./project-lifecycle-fixture");
let checks = 0;
async function rejects(promise, code) { checks++; await assert.rejects(promise, error => !code || error.code === code || String(error.message).includes(code)); }
async function using(options, fn) { const f = fixture(options); try { await fn(f); } finally { f.dispose(); } }
async function main() {
  for (const operation of ["save_project_as", "create_named_project", "open_project"]) await using({ dirty: operation === "save_project_as", open: operation === "open_project" }, async f => {
    const sourceDisk = fs.readFileSync(f.source), sourceState = c.clone(f.storage.load().projectState[m.projectStateKey(f.source)]);
    const receipt = await f.service.execute(operation, f.args(), f.context); c.verifyReceipt(receipt);
    assert.strictEqual(receipt.generation, 1); assert(fs.readFileSync(f.source).equals(sourceDisk)); assert.deepStrictEqual(c.clone(f.storage.load().projectState[m.projectStateKey(f.source)]), sourceState);
    assert.strictEqual(f.storage.load().pendingLifecycle, null); assert.strictEqual(f.storage.epoch(), 1); assert.strictEqual(receipt.artisticAccepted, false);
    if (operation === "create_named_project") assert.strictEqual(f.runtime.app.project.numItems, 0);
    if (operation !== "open_project") assert(fs.existsSync(receipt.stageFile.path)); checks++;
    assert.throws(() => t.validateCommandCapability(f.calls.find(call => !call.readOnly).cap), error => error.code === "lifecycle_phase_capability_required"); checks++;
  });
  for (const context of [{ confirm: true }, { channel: "manual_cep", confirmed: true, dryRunVerified: true }, { autonomous: true }, { admin: true }]) await using({}, async f => {
    await rejects(f.service.execute("save_project_as", f.args(), context), "lifecycle_manual_authorization_required"); assert.strictEqual(f.calls.length, 0);
  });
  await using({ busy: true }, async f => { await rejects(f.service.execute("save_project_as", f.args(), f.context), "lifecycle_not_idle"); assert.strictEqual(f.calls.length, 0); });
  await using({ enabled: false }, async f => { await rejects(f.service.execute("save_project_as", f.args(), f.context), "lifecycle_disabled"); });
  await using({}, async f => { fs.writeFileSync(f.target, "collision"); await rejects(f.service.execute("save_project_as", f.args(), f.context), "lifecycle_target_exists"); assert.strictEqual(f.calls.length, 0); });
  await using({}, async f => { const store = f.storage.load(); store.projectState[m.projectStateKey(f.target)] = t.defaultState(f.target); fs.writeFileSync(f.statePath, JSON.stringify(store)); await rejects(f.service.execute("save_project_as", f.args(), f.context), "lifecycle_target_policy_collision"); assert.strictEqual(f.calls.length, 0); });
  await using({ checkpointFailure: true }, async f => { await rejects(f.service.execute("save_project_as", f.args(), f.context)); assert.strictEqual(f.storage.load().pendingLifecycle, undefined); assert(!f.calls.some(call => !call.readOnly)); });
  for (const phase of ["save_stage", "create_stage", "open_final", "open_target"]) for (const when of ["before", "after"]) await using({ open: phase === "open_target" }, async f => {
    f.setNativeHook(data => { if (data.facts.phase === phase && data.when === when) throw new Error("fixture phase failure"); });
    const operation = phase === "open_target" ? "open_project" : phase === "create_stage" ? "create_named_project" : "save_project_as";
    await rejects(f.service.execute(operation, f.args(), f.context)); const p = f.storage.load().pendingLifecycle;
    assert(p && p.possibleDelivery && p.status === "unknown"); const delivered = f.calls.filter(call => !call.readOnly).length;
    await rejects(f.service.execute(operation, p.args, f.context)); assert.strictEqual(f.calls.filter(call => !call.readOnly).length, delivered);
    const before = fs.readFileSync(f.statePath); const reconciliation = await f.service.reconcile({ transitionId: p.transitionId }); assert.strictEqual(reconciliation.nativeReplay, false); assert.strictEqual(reconciliation.stateWrites, false); assert(fs.readFileSync(f.statePath).equals(before));
    await rejects(f.service.finalize({ transitionId: p.transitionId }, f.context), "lifecycle_finalize_requires_persisted_final_proof"); checks++;
  });
  await using({ retireFailure: true }, async f => {
    await rejects(f.service.execute("save_project_as", f.args(), f.context)); const pending = f.storage.load().pendingLifecycle; assert.strictEqual(pending.phase, "final_proven");
    const nativeMutations = f.calls.filter(call => !call.readOnly).length;
    // Simulated restart: new service + storage, durable final proof, fresh manual finalize.
    const restarted = createProjectLifecycleService({ ...f.deps, storage: t.createLifecycleStorage({ statePath: f.statePath, enabled: true }),
      verifyManualAuthorization: async (context, hints) => Object.freeze({ ...await f.deps.verifyManualAuthorization(context, hints), actionId: "fresh-finalize-action", runId: "fresh-finalize-run" }),
      retireContext: async () => ({ sessionClosed: true, proposalRetired: true, cachesInvalidated: true, desiredEnabledPreserved: true }) });
    const receipt = await restarted.finalize({ transitionId: pending.transitionId }, f.context); assert.strictEqual(receipt.generation, 1); assert.strictEqual(receipt.authorization.runId, "fixture-run"); assert.strictEqual(receipt.finalizedBy.runId, "fresh-finalize-run"); assert.strictEqual(f.calls.filter(call => !call.readOnly).length, nativeMutations); assert.strictEqual(restarted.storage.load().pendingLifecycle, null); checks++;
  });
  for (const drift of ["native_dirty", "stage_disk", "target_disk", "proof_corrupt"]) await using({ retireFailure: true }, async f => {
    await rejects(f.service.execute("save_project_as", f.args(), f.context)); const pending = f.storage.load().pendingLifecycle, nativeMutations = f.calls.filter(call => !call.readOnly).length;
    if (drift === "native_dirty") f.runtime.app.project.dirty = true;
    if (drift === "stage_disk") fs.writeFileSync(pending.stageFile.path, "stage drift");
    if (drift === "target_disk") fs.writeFileSync(f.target, "target drift");
    if (drift === "proof_corrupt") { const store = f.storage.load(); store.pendingLifecycle.proof.targetInventoryHash = "f".repeat(64); fs.writeFileSync(f.statePath, JSON.stringify(store)); }
    await rejects(f.service.finalize({ transitionId: pending.transitionId }, f.context)); assert.strictEqual(f.calls.filter(call => !call.readOnly).length, nativeMutations); checks++;
  });
  await using({}, async f => { f.setNativeHook(data => { if (data.facts.phase === "save_stage" && data.when === "after") data.runtime.app.project.item(1).file.fsName += "-drift"; }); await rejects(f.service.execute("save_project_as", f.args(), f.context), "lifecycle_inventory_mismatch"); assert.strictEqual(f.calls.filter(call => call.phase === "open_final").length, 0); });
  await using({}, async f => { f.setNativeHook(data => { if (data.facts.phase === "save_stage" && data.when === "after") data.runtime.app.project.item(2).layer(1).id = 909; }); await rejects(f.service.execute("save_project_as", f.args(), f.context), "lifecycle_inventory_mismatch"); });
  await using({}, async f => { f.setNativeHook(data => { if (data.facts.phase === "save_stage" && data.when === "after") data.runtime.app.project.expressionEngine = "changed"; }); await rejects(f.service.execute("save_project_as", f.args(), f.context), "lifecycle_inventory_mismatch"); });
  await using({}, async f => { f.setNativeHook(data => { if (data.facts.phase === "save_stage" && data.when === "after") { data.runtime.app.project.item(1).proxySource = new data.runtime.FileSource(f.proxy); data.runtime.app.project.item(1).useProxy = true; } }); await rejects(f.service.execute("save_project_as", f.args(), f.context), "lifecycle_inventory_mismatch"); });
  await using({}, async f => { let reads = 0; f.setNativeHook(data => { if (data.when === "before" && data.facts.readOnly && ++reads === 3) data.runtime.app.project.dirty = true; }); await rejects(f.service.execute("save_project_as", f.args(), f.context), "lifecycle_native_guard_changed"); assert(!f.calls.some(call => call.phase === "open_final")); assert(fs.existsSync(f.target)); });
  await using({}, async f => { f.setNativeHook(data => { if (data.when === "after" && data.facts.phase === "save_stage") fs.writeFileSync(f.source, "external disk change"); }); await rejects(f.service.execute("save_project_as", f.args(), f.context), "lifecycle_file_pin_changed"); assert(!f.calls.some(call => call.phase === "open_final")); });
  await using({}, async f => {
    let release, entered; const enteredPromise = new Promise(resolve => { entered = resolve; }), wait = new Promise(resolve => { release = resolve; });
    f.setNativeHook(async data => { if (data.when === "before" && data.facts.phase === "save_stage") { entered(); await wait; } });
    const first = f.service.execute("save_project_as", f.args(), f.context); await enteredPromise;
    await rejects(f.service.execute("save_project_as", f.args(), f.context)); assert.throws(() => m.createProjectStateController({ statePath: f.statePath }).setConstraints(f.source, null, 0));
    release(); await first; checks++;
  });
  for (const failure of ["reservation", "publish", "fsync_final", "target_collision"]) await using({ filesystem: {
    openSync(file, flags, ...rest) { if (failure === "reservation" && flags === "wx" && path.basename(file).startsWith(".ae-agent-stage-")) throw new Error("reserve failure"); if (failure === "fsync_final" && flags === "r+") throw new Error("fsync failure"); return fs.openSync(file, flags, ...rest); },
    copyFileSync(source, target, flags) { assert.strictEqual(flags, fs.constants.COPYFILE_EXCL); if (failure === "publish") { fs.writeFileSync(target, "partial final"); throw new Error("copy failure"); } if (failure === "target_collision") fs.writeFileSync(target, "concurrent target"); return fs.copyFileSync(source, target, flags); }
  } }, async f => {
    await rejects(f.service.execute("save_project_as", f.args(), f.context)); const p = f.storage.load().pendingLifecycle; assert(p); if (failure === "reservation") assert.strictEqual(p.status, "not_started"); else assert.strictEqual(p.status, "unknown"); if (failure !== "reservation") assert(fs.existsSync(f.target)); assert(!f.calls.some(call => call.phase === "open_final"));
  });
  await using({}, async f => {
    const args = f.args(); await f.service.execute("save_project_as", args, f.context);
    await rejects(f.service.execute("save_project_as", { ...args, targetProjectFile: path.join(f.root, "new-copy.aep") }, f.context), "lifecycle_authorization_consumed");
  });
  console.log("project-lifecycle-service-smoke PASS", checks, "offline checks (VM, filesystem faults, no replay, finalize, concurrency)");
}
main().catch(error => { console.error(error.stack); process.exitCode = 1; });

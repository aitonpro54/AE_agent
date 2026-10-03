"use strict";
const assert = require("assert"), vm = require("vm");
const c = require("../mcp-server/project-lifecycle-contract"), protection = require("../mcp-server/placeholder-protection");
const { fixture } = require("./project-lifecycle-fixture");
let checks = 0;
function throws(fn, code) { checks++; assert.throws(fn, error => error.code === code || String(error.message).includes(code)); }
const f = fixture();
try {
  assert.strictEqual(c.toolDefinitions.length, 5); const args = f.args();
  assert.deepStrictEqual(c.validateInput("save_project_as", args), args); checks++;
  for (const field of ["overwrite", "rawScript", "authorization", "phase", "transitionId", "confirm", "expectedNative"]) throws(() => c.validateInput("save_project_as", { ...args, [field]: true }), "lifecycle_invalid_input");
  for (const revision of [undefined, null, -1, 0.1, "7", Number.MAX_SAFE_INTEGER + 1]) throws(() => c.validateInput("save_project_as", { ...args, expectedSourceRevision: revision }), revision === undefined ? "lifecycle_native_unknown" : "lifecycle_native_unknown");
  for (const dirty of [undefined, null, 0, "false"]) throws(() => c.validateInput("save_project_as", { ...args, expectedSourceDirty: dirty }), "lifecycle_native_unknown");
  throws(() => c.validateInput("open_project", { ...args, expectedSourceDirty: true, expectedTargetSavedSha25664: "a".repeat(64) }), "lifecycle_clean_source_required");
  throws(() => c.validateInput("create_named_project", { ...args, targetProjectFile: args.expectedSourceProjectFile }), "lifecycle_target_is_source");
  for (const file of ["relative.aep", "\\\\server\\folder\\p.aep", "C:/p/../q.aep", "C:/p/foo.aep:stream", "C:/p/foo.aepx"]) throws(() => c.validateInput("save_project_as", { ...args, targetProjectFile: file }), "lifecycle_invalid_input");
  throws(() => c.validateInput("finalize_project_lifecycle", { transitionId: "123", rawScript: "" }), "lifecycle_invalid_input");
  const emitted = c.nativeInventoryScript({ expectedNative: { file: f.source, dirty: false, revision: 7 } });
  const run = script => JSON.parse(JSON.stringify(vm.runInContext("(function(){" + script + "})()", f.runtime)));
  const inventory = c.validateInventory(run(emitted)); checks++; assert.strictEqual(inventory.items[2].mainSourceKind, "solid"); assert.strictEqual(inventory.items[2].mainFile, null);
  // Native FileSource proxy and already-known missing file are observed, never relinked.
  vm.runInContext("app.project.item(1).proxySource=new FileSource(__proxy);app.project.item(1).useProxy=true;", f.runtime);
  const proxyInventory = c.validateInventory(run(emitted)); checks++; assert.strictEqual(proxyInventory.items[0].proxy.kind, "file");
  vm.runInContext("app.project.item(1).file=new File(__asset+'-missing');app.project.item(1).mainSource.file=app.project.item(1).file;app.project.item(1).footageMissing=true;", f.runtime);
  const missing = c.validateInventory(run(emitted)); checks++; assert.strictEqual(missing.items[0].file.missing, true); assert.strictEqual(missing.items[0].file.path, f.asset + "-missing");
  vm.runInContext("app.project.item(1).file=new File(__asset);app.project.item(1).mainSource.file=app.project.item(1).file;app.project.item(1).footageMissing=false;app.project.item(1).proxySource=null;app.project.item(1).useProxy=false;", f.runtime);
  // Generate actual accepted snapshot evidence and prove the emitted protected guard.
  const native = run(c.nativeInventoryScript());
  const evidence = run(protection.aeSupportScript + "return __phEvidence(app.project.item(2),app.project.item(2).layer(1),[]);");
  const protectionInventory = { complete: true, comps: [{ itemId: 2, layers: native.items[1].layers }], sources: [{ itemId: 1, file: f.asset }] };
  const snapshot = protection.snapshotFromEvidence(evidence, protectionInventory, []);
  const protectedRead = c.nativeInventoryScript({ accepted: [snapshot] }); c.validateInventory(run(protectedRead), [snapshot]); checks++;
  f.runtime.app.project.item(2).layer(1).transform["ADBE Opacity"] = 70;
  throws(() => c.validateInventory(run(protectedRead), [snapshot]), "lifecycle_protected_snapshot_mismatch");
  const phase = c.phaseScript({ operation: "save_project_as", phase: "save_stage", expectedNative: { file: f.source, dirty: false, revision: 7 }, destinationProjectFile: f.target, accepted: [snapshot] });
  throws(() => run(phase), "accepted_placeholder_drift"); f.runtime.app.project.item(2).layer(1).transform["ADBE Opacity"] = 100;
  f.runtime.app.project.dirty = undefined; throws(() => run(phase), "lifecycle_native_unknown"); f.runtime.app.project.dirty = false;
  f.runtime.app.project.revision = undefined; throws(() => run(phase), "lifecycle_native_unknown"); f.runtime.app.project.revision = 7;
  f.runtime.app.project.dirty = true; throws(() => run(phase), "lifecycle_native_guard_changed"); f.runtime.app.project.dirty = false;
  f.runtime.app.project.revision = 8; throws(() => run(phase), "lifecycle_native_guard_changed"); f.runtime.app.project.revision = 7;
  delete f.runtime.app.project.expressionEngine; throws(() => run(emitted), "lifecycle_inventory_unknown"); f.runtime.app.project.expressionEngine = "fixture";
  vm.runInContext("app.project.rows.length=1001;", f.runtime); throws(() => run(emitted), "lifecycle_inventory_budget"); vm.runInContext("app.project.rows.length=3;", f.runtime);
  for (const mutation of [value => { value.items[0].proxy = undefined; }, value => { value.settings.expressionEngine = null; }, value => { value.items[1].layers[0].sourceItemId = 777; }, value => { value.items[1].layers[0].id = null; }]) {
    const changed = c.clone(inventory); mutation(changed); checks++; assert.throws(() => c.validateInventory(changed));
  }
  throws(() => c.assertInventoryMatch(inventory, proxyInventory), "lifecycle_inventory_mismatch");
  throws(() => c.verifyReceipt({ success: true }), "lifecycle_invalid_receipt");
  assert(!emitted.includes("app.open(") && !emitted.includes("app.newProject(") && !emitted.includes("app.project.save(")); checks++;
  console.log("project-lifecycle-contract-smoke PASS", checks, "offline checks (VM, strict inputs, inventory/protected guards)");
} finally { f.dispose(); }

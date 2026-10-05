"use strict";
const assert = require("assert"), vm = require("vm"), fs = require("fs");
const c = require("../mcp-server/project-lifecycle-contract"), protection = require("../mcp-server/placeholder-protection");
const { fixture } = require("./project-lifecycle-fixture");
let checks = 0;
function throws(fn, code) { checks++; assert.throws(fn, error => error.code === code || String(error.message).includes(code)); }
async function main() {
const f = fixture();
try {
  assert.strictEqual(c.toolDefinitions.length, 6); const args = f.args();
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
  const inventory = c.validateInventory(run(emitted)); checks++;
  assert.deepStrictEqual(inventory.items.map(item => item.kind), ["footage", "comp", "footage"]);
  assert.strictEqual(inventory.items[0].mainSourceKind, "file");
  assert.strictEqual(inventory.items[2].mainSourceKind, "solid"); assert.strictEqual(inventory.items[2].mainFile, null);
  // Exercise every native item/source class without changing the shared fixture.
  const originalRows = f.runtime.app.project.rows.slice();
  vm.runInContext('var placeholder=new FootageItem(4,__asset);placeholder.name="placeholder";placeholder.mainSource=new PlaceholderSource();placeholder.file=null;var folder=new FolderItem(5,"assets");folder.parentFolder=app.project.rootFolder;placeholder.parentFolder=folder;app.project.rows.push(placeholder,folder);', f.runtime);
  const allKinds = c.validateInventory(run(emitted));
  assert.deepStrictEqual(allKinds.items.map(item => item.kind), ["footage", "comp", "footage", "footage", "folder"]);
  assert.strictEqual(allKinds.items[3].mainSourceKind, "placeholder"); assert.strictEqual(allKinds.items[3].mainFile, null);
  assert.strictEqual(allKinds.items[3].parentId, 5); assert.strictEqual(allKinds.items[4].proxy, undefined); checks++;
  for (const [constructor, expectedKind] of [["FileSource(__proxy)", "file"], ["SolidSource()", "solid"], ["PlaceholderSource()", "placeholder"]]) {
    vm.runInContext("app.project.item(2).proxySource=new " + constructor + ";app.project.item(2).useProxy=true;", f.runtime);
    const observed = c.validateInventory(run(emitted)).items[1].proxy;
    assert.strictEqual(observed.kind, expectedKind); assert.strictEqual(observed.file === null, expectedKind !== "file"); checks++;
  }
  vm.runInContext("app.project.item(2).proxySource=null;app.project.item(2).useProxy=false;", f.runtime);
  f.runtime.app.project.rows = originalRows;
  const originalSource = f.runtime.app.project.item(1).mainSource;
  f.runtime.app.project.item(1).mainSource = { file: originalSource.file, isStill: false };
  throws(() => run(emitted), "lifecycle_inventory_source_unknown"); f.runtime.app.project.item(1).mainSource = originalSource;
  f.runtime.app.project.rows.push({}); throws(() => run(emitted), "lifecycle_inventory_unknown_item"); f.runtime.app.project.rows.pop();
  const noSource = c.clone(inventory); noSource.items[1].layers[0].sourceItemId = null;
  c.validateInventory(noSource); checks++;
  const precomp = c.clone(inventory), childComp = c.clone(inventory.items[1]);
  childComp.id = 4; childComp.index = 4; childComp.name = "PRECOMP"; childComp.layers = [];
  precomp.items[1].layers[0].sourceItemId = 4; precomp.items.push(childComp);
  c.validateInventory(precomp); checks++;
  // Actual AE CMS is numeric; reject the former string contract and unknown values.
  const cms = f.runtime.app.project.colorManagementSystem;
  assert.strictEqual(typeof cms, "number"); assert(Number.isFinite(cms));
  assert.strictEqual(inventory.settings.colorManagementSystem, cms); checks++;
  for (const bad of ["private_value_should_not_appear", undefined, NaN]) {
    f.runtime.app.project.colorManagementSystem = bad;
    assert.throws(() => run(emitted), error => {
      const message = String(error.message);
      return /^lifecycle_inventory_unknown:project\.colorManagementSystem:expected_number:actual_(string|undefined|number)$/.test(message)
        && message.length <= 120 && !message.includes("private_value_should_not_appear");
    }); checks++;
    const wire = c.clone(inventory); wire.settings.colorManagementSystem = bad;
    assert.throws(() => c.validateInventory(wire), error =>
      error.code === "lifecycle_inventory_settings_unknown" && error.message.includes("colorManagementSystem")); checks++;
  }
  f.runtime.app.project.colorManagementSystem = cms;
  assert.strictEqual(c.validateInventory(run(emitted)).settings.colorManagementSystem, cms); checks++;
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
  const protectedRead = c.nativeInventoryScript({ accepted: [snapshot] }), protectedNative = run(protectedRead);
  c.validateInventory(protectedNative, [snapshot]); checks++;
  // Captured native shape: comp item 2/layer 14/source 1 was wrongly emitted as two folders.
  const captured = c.clone(protectedNative);
  captured.items = [captured.items[1], captured.items[0]];
  captured.items[0].index = 1; captured.items[0].name = "TOOL_FIRST_ASSETS_20261005"; captured.items[0].layers[0].id = 14;
  captured.items[1].index = 2; captured.items[1].name = "TOOL_FIRST_MAIN_20261005";
  const capturedEvidence = captured.protectedEvidence[0];
  capturedEvidence.comp.itemIndex = 1; capturedEvidence.comp.name = captured.items[0].name; capturedEvidence.layer.id = 14;
  const capturedSnapshot = protection.snapshotFromEvidence(capturedEvidence, { complete: true, comps: [{ itemId: 2, layers: captured.items[0].layers }] }, []);
  c.validateInventory(captured, [capturedSnapshot]); checks++;
  const tolerated = c.clone(captured); tolerated.protectedEvidence[0].comp.frameRate += 5e-8;
  for (const key of ["startTime", "inPoint", "outPoint", "stretch"]) tolerated.protectedEvidence[0].layer[key] += 5e-8;
  c.validateInventory(tolerated, [capturedSnapshot]); checks++;
  const folderRow = item => ({ id: item.id, index: item.index, kind: "folder", name: item.name, comment: item.comment, parentId: item.parentId });
  const folderOnly = c.clone(captured); folderOnly.items = folderOnly.items.map(folderRow);
  throws(() => c.validateInventory(folderOnly, [capturedSnapshot]), "lifecycle_protected_snapshot_mismatch");
  for (const mutate of [
    value => { value.items[0] = folderRow(value.items[0]); },
    value => { value.protectedEvidence[0].comp.itemIndex = 2; },
    value => { value.protectedEvidence[0].comp.name = "different"; },
    value => { value.protectedEvidence[0].comp.frameRate = 24; },
    value => { value.protectedEvidence[0].comp.frameRate = NaN; },
    value => { value.items[0].layers[0].id = 15; },
    value => { value.items[0].layers[0].sourceItemId = 2; },
    value => { value.items[0].layers[0].inPoint = 1; },
    value => { value.protectedEvidence[0].layer.index = 2; },
    value => { value.protectedEvidence[0].layer.name = "different"; },
    value => { value.protectedEvidence[0].layer.inPoint = "0"; },
    value => { value.items[1].file.path += "-other"; value.items[1].mainFile.path += "-other"; },
    value => { value.items[1].footageMissing = true; },
    value => { value.items[1].file.missing = true; value.items[1].mainFile.missing = true; }
  ]) {
    const contradictory = c.clone(captured); mutate(contradictory);
    throws(() => c.validateInventory(contradictory, [capturedSnapshot]), "lifecycle_protected_snapshot_mismatch");
  }
  const folderSource = c.clone(captured); folderSource.items[1] = folderRow(folderSource.items[1]);
  throws(() => c.validateInventory(folderSource, [capturedSnapshot]), "lifecycle_inventory_source_identity_unknown");
  const folderWithLayers = c.clone(captured); folderWithLayers.items[0].kind = "folder";
  throws(() => c.validateInventory(folderWithLayers, [capturedSnapshot]), "lifecycle_inventory_unknown");
  // Complete inventories cannot silently omit media/proxy fields or invent booleans.
  for (const key of ["width", "height", "pixelAspect", "duration", "frameRate", "hasVideo", "hasAudio", "useProxy", "proxy"]) {
    const incomplete = c.clone(inventory); delete incomplete.items[0][key];
    throws(() => c.validateInventory(incomplete), "lifecycle_inventory_unknown");
  }
  for (const key of ["file", "mainFile", "mainSourceKind", "footageMissing", "isStill"]) {
    const incomplete = c.clone(inventory); delete incomplete.items[0][key];
    throws(() => c.validateInventory(incomplete), key === "file" || key === "mainFile" ? "lifecycle_inventory_file_unknown" : "lifecycle_inventory_source_unknown");
  }
  for (const key of ["hasVideo", "hasAudio", "useProxy", "footageMissing", "isStill"]) {
    const coerced = c.clone(inventory); coerced.items[0][key] = 0;
    throws(() => c.validateInventory(coerced), key === "footageMissing" || key === "isStill" ? "lifecycle_inventory_source_unknown" : "lifecycle_inventory_unknown");
  }
  for (const key of ["kind", "file", "isStill"]) {
    const incomplete = c.clone(proxyInventory); delete incomplete.items[0].proxy[key];
    throws(() => c.validateInventory(incomplete), key === "file" ? "lifecycle_inventory_file_unknown" : "lifecycle_inventory_proxy_unknown");
  }
  const absentActiveProxy = c.clone(inventory); absentActiveProxy.items[0].useProxy = true;
  throws(() => c.validateInventory(absentActiveProxy), "lifecycle_inventory_proxy_unknown");
  for (const key of ["path", "missing"]) {
    const incomplete = c.clone(inventory); delete incomplete.items[0].file[key];
    throws(() => c.validateInventory(incomplete), "lifecycle_inventory_file_unknown");
  }
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
  // Existing terminal V2 receipts retain hash-only history; no inventory migration is needed.
  const compatibility = fixture({ open: true });
  try {
    const historicalReceipt = await compatibility.service.execute("open_project", compatibility.args(), compatibility.context);
    const historical = compatibility.storage.load(), legacyInventoryHash = c.inventoryHash(folderOnly);
    historicalReceipt.generation = 4;
    for (const key of ["sourceInventoryHash", "targetInventoryHash"]) historicalReceipt[key] = legacyInventoryHash;
    historical.lifecycleGeneration = 4; historical.lifecycleReceipts = [historicalReceipt];
    assert.strictEqual(historical.pendingLifecycle, null);
    const bytes = JSON.stringify(historical); fs.writeFileSync(compatibility.statePath, bytes, "utf8");
    assert.deepStrictEqual(compatibility.storage.load(), historical);
    assert.strictEqual(compatibility.storage.epoch(), 4);
    assert.strictEqual(fs.readFileSync(compatibility.statePath, "utf8"), bytes); checks++;
  } finally { compatibility.dispose(); }
  console.log("project-lifecycle-contract-smoke PASS", checks, "offline checks (VM, strict inputs, inventory/protected guards)");
} finally { f.dispose(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });

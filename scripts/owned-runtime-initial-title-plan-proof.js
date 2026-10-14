"use strict";
// Offline pure-descriptor proof. No Native issuer, AE/AME, files or delivery.
const assert = require("node:assert/strict");
const path = require("node:path");
const plan = require("../mcp-server/owned-runtime-initial-title-plan");
const ame = require("../mcp-server/ame-title-jobs");
const nativeVariants = require("../mcp-server/native-render-variant");
const file = name => path.resolve(__dirname, "../.codex-runtime/pure-title-plan-fixture/" + name + ".aep");
const hash = character => character.repeat(64);
const batch1 = "11111111-1111-4111-8111-111111111111";
const batch2 = "22222222-2222-4222-8222-222222222222";
const job1 = "33333333-3333-4333-8333-333333333333";
const clone = value => JSON.parse(JSON.stringify(value));
let checks = 0;
function check(run) { run(); checks++; }
function rejected(run, code) {
  check(() => assert.throws(run, error => error.closed === true && (!code || error.code === code)));
}
function facts() {
  return { schema: plan.FACTS_SCHEMA, sourceProject: { file: file("source"), sha25664: hash("a") },
    baseline: { revision: 9, graphSha25664: hash("b"), rootCompItemId: 40, variantCompItemId: 50,
      controlled: [{ id: 900, contentSha25664: hash("c"), enabled: false },
        { id: 12, contentSha25664: hash("d"), enabled: true }, { id: 77, contentSha25664: hash("e"), enabled: false }] },
    selectedTextLayerIDs: [900, 12],
    variants: [{ slot: 1, variantId: "observed-first", workingProjectFile: file("first-working"), snapshotProjectFile: file("first"), outputFileName: "first.mov",
      range: { startFrame: 15, frameCount: 30, fpsNumerator: 30000, fpsDenominator: 1001 } },
    { slot: 2, variantId: "observed-second", workingProjectFile: file("second-working"), snapshotProjectFile: file("second"), outputFileName: "second.mov",
      range: { startFrame: 10, frameCount: 20, fpsNumerator: 25, fpsDenominator: 1 } }], ame: null };
}
function withAME() {
  const value = facts();
  value.ame = { targetSpecifier: "ame-26.0", expectedProcess: { pid: 444, startedAt: "2026-10-14T07:00:00.000Z" },
    expectedSessionNonce: "retained-fixture-session", presetId: "amep_" + "a".repeat(40), presetSha25664: hash("f"), timeoutMs: 5000,
    slots: [{ slot: 1, batchId: batch1, sourceProjectFile: file("first"), expectedSourceSha25664: hash("1"),
      sourceGuid: "actual-first-copy-guid", queueManifestSha25664: hash("2"), completedOwnedPrefix: [] },
    { slot: 2, batchId: batch2, sourceProjectFile: file("second"), expectedSourceSha25664: hash("3"),
      sourceGuid: "actual-second-copy-guid", queueManifestSha25664: hash("4"), completedOwnedPrefix: [{ batchId: batch1, jobId: job1 }] }] };
  return value;
}
function selected(table, operation, slot) { return plan.selectFixedTitleOperation(table, { operation, slot }); }
function main() {
  // A builder must not turn descriptor work into an executor/factory call.
  const oldAMEExecutor = ame.createExecutor, oldVariantsExecutor = nativeVariants.createExecutor;
  ame.createExecutor = nativeVariants.createExecutor = () => { throw new Error("unexpected effect factory"); };
  try {
    const original = facts(), table = plan.buildFixedTitlePlan(original);
    check(() => assert.deepEqual(table.rows.map(row => row.key), [
      "checkpoint:0", "clean_copy:1", "clean_copy:2", "stage:1", "stage:2",
      "enqueue:1", "enqueue:2", "start:1", "start:2", "restore:1", "restore:2"]));
    check(() => assert.equal(new Set(table.rows.map(row => row.key)).size, 11));
    check(() => assert.equal(table.ready, false));
    check(() => assert.equal(table.nativeAuthority, false));
    check(() => assert.equal(table.sourceOnly, true));
    check(() => {
      const seen = new WeakSet();
      function deeplyFrozen(value) {
        if (!value || typeof value !== "object" || seen.has(value)) return;
        seen.add(value); assert.ok(Object.isFrozen(value)); Object.values(value).forEach(deeplyFrozen);
      }
      deeplyFrozen(table);
    });
    check(() => assert.ok(table.rows.every(row => row.status === "CLOSED" && row.args === null && row.argsHash === null)));
    check(() => assert.equal(selected(table, "stage", 1).guard.selectedTextLayerID, 900)); // Never sort IDs into an invented first pair.
    check(() => assert.equal(selected(table, "stage", 2).guard.selectedTextLayerID, 12));
    original.baseline.controlled[0].enabled = true;
    original.variants[0].range.frameCount = 100;
    check(() => assert.equal(table.facts.baseline.controlled[0].enabled, false));
    check(() => assert.equal(table.facts.variants[0].range.frameCount, 30));
    check(() => assert.throws(() => { selected(table, "stage", 1).guard.baseline.controlled[0].enabled = true; }, TypeError));
    check(() => assert.strictEqual(selected(table, "restore", 2), table.rows[10]));
    rejected(() => selected(clone(table), "stage", 1), "owned_title_plan_foreign_descriptor_table");
    rejected(() => selected(table, "inspect", 0), "owned_title_plan_fixed_operation_required");
    rejected(() => selected(table, "checkpoint", 1), "owned_title_plan_fixed_operation_required");
    rejected(() => selected(table, "stage", "1"), "owned_title_plan_fixed_operation_required");
    rejected(() => plan.selectFixedTitleOperation(table, { operation: "stage", slot: 1, ready: true }));
    const mutate = (edit, code) => rejected(() => { const value = facts(); edit(value); plan.buildFixedTitlePlan(value); }, code);
    mutate(value => { value.schema = "foreign"; }, "owned_title_plan_facts_schema_required");
    mutate(value => { value.m100 = {}; });
    mutate(value => { value.sourceProject.sha25664 = hash("0"); }, "owned_title_plan_missing_hash_provenance");
    mutate(value => { delete value.sourceProject.sha25664; });
    mutate(value => { value.baseline.revision = "9"; });
    mutate(value => { value.baseline.controlled[0].enabled = 1; }, "owned_title_plan_invalid_baseline_enabled");
    mutate(value => { value.baseline.controlled[1].id = 900; }, "owned_title_plan_duplicate_controlled_id");
    mutate(value => { value.selectedTextLayerIDs[0] = 123456; }, "owned_title_plan_selected_id_not_controlled");
    mutate(value => { value.selectedTextLayerIDs[1] = 900; }, "owned_title_plan_selected_id_not_controlled");
    mutate(value => { value.baseline.controlled = value.baseline.controlled.slice(1); }, "owned_title_plan_selected_id_not_controlled");
    mutate(value => { value.variants[1].snapshotProjectFile = value.variants[0].snapshotProjectFile; }, "owned_title_plan_distinct_variant_bindings_required");
    mutate(value => { value.variants[0].snapshotProjectFile = value.sourceProject.file; }, "owned_title_plan_distinct_variant_bindings_required");
    mutate(value => { value.variants[0].workingProjectFile = value.variants[0].snapshotProjectFile; }, "owned_title_plan_distinct_variant_bindings_required");
    mutate(value => { value.variants[1].workingProjectFile = value.variants[0].workingProjectFile.toUpperCase(); }, "owned_title_plan_distinct_variant_bindings_required");
    mutate(value => { value.variants[1].snapshotProjectFile = value.variants[0].workingProjectFile; }, "owned_title_plan_distinct_variant_bindings_required");
    mutate(value => { value.variants[0].workingProjectFile = value.sourceProject.file; }, "owned_title_plan_distinct_variant_bindings_required");
    mutate(value => { delete value.variants[0].workingProjectFile; });
    mutate(value => { value.variants[1].outputFileName = "FIRST.MOV"; }, "owned_title_plan_distinct_variant_bindings_required");
    mutate(value => { value.variants[0].range.fpsNumerator = 0; });
    mutate(value => { value.variants[0].range.startFrame = Number.MAX_SAFE_INTEGER; }, "owned_title_plan_invalid_frame_range");
    mutate(value => { value.variants[0].range.timeText = "unknown"; });
    mutate(value => { value.baseline.controlled[0].dependencySafe = true; });
    mutate(value => { value.sourceProject.file = file("source").replace("source.aep", "../source.aep"); }, "owned_title_plan_invalid_project_path");
    mutate(value => { value.sourceProject.file = "\\root-relative.aep"; }, "owned_title_plan_invalid_project_path");
    mutate(value => { value.sourceProject.file = "\\\\?\\C:\\device.aep"; }, "owned_title_plan_invalid_project_path");
    mutate(value => { value.variants[0].outputFileName = "foreign.csv"; }, "owned_title_plan_existing_inspection_contract_closed");
    let getterCalls = 0;
    rejected(() => { const value = facts(); Object.defineProperty(value, "ame", { enumerable: true, get() { getterCalls++; return null; } }); plan.buildFixedTitlePlan(value); });
    check(() => assert.equal(getterCalls, 0));
    const bound = plan.buildFixedTitlePlan(withAME());
    check(() => assert.equal(bound.ready, false));
    check(() => assert.equal(bound.rows.filter(row => row.status === "DESCRIPTOR_ONLY").length, 4));
    for (const slot of [1, 2]) {
      const enqueue = selected(bound, "enqueue", slot), start = selected(bound, "start", slot);
      check(() => assert.deepEqual(enqueue.args, ame.validateInput(ame.ENQUEUE, enqueue.args)));
      check(() => assert.equal(enqueue.argsHash, ame.operationArgsHash(ame.ENQUEUE, enqueue.args)));
      check(() => assert.equal(start.argsHash, ame.operationArgsHash(ame.START, start.args)));
      check(() => assert.notEqual(enqueue.args.sourceGuid, bound.facts.sourceProject.sha25664));
      check(() => assert.equal(selected(bound, "clean_copy", slot).status, "CLOSED"));
      check(() => assert.equal(selected(bound, "restore", slot).argsHash, null));
    }
    check(() => assert.equal(selected(bound, "enqueue", 1).args.range.startSeconds, 15 * 1001 / 30000));
    const incomplete = withAME(); incomplete.ame.slots[0].queueManifestSha25664 = null;
    const partial = plan.buildFixedTitlePlan(incomplete);
    check(() => assert.equal(selected(partial, "enqueue", 1).status, "DESCRIPTOR_ONLY"));
    check(() => assert.equal(selected(partial, "start", 1).status, "CLOSED"));
    incomplete.ame.slots[1].sourceGuid = null;
    const noCopyGuid = plan.buildFixedTitlePlan(incomplete);
    check(() => assert.equal(selected(noCopyGuid, "enqueue", 2).args, null));
    check(() => assert.equal(selected(noCopyGuid, "start", 2).status, "DESCRIPTOR_ONLY"));
    const nullSlot = withAME(); Object.keys(nullSlot.ame.slots[1]).filter(key => key !== "slot").forEach(key => { nullSlot.ame.slots[1][key] = null; });
    const unboundSlot = plan.buildFixedTitlePlan(nullSlot);
    check(() => assert.equal(selected(unboundSlot, "enqueue", 2).status, "CLOSED"));
    check(() => assert.equal(selected(unboundSlot, "start", 2).status, "CLOSED"));
    const ameMutation = (edit, code) => rejected(() => { const value = withAME(); edit(value); plan.buildFixedTitlePlan(value); }, code);
    const observedNull=withAME();observedNull.ame.expectedSessionNonce=null;const nullProbeTable=plan.buildFixedTitlePlan(observedNull);
    check(()=>assert.equal(nullProbeTable.facts.ame.expectedSessionNonce,null));
    check(()=>assert.equal(Object.hasOwn(selected(nullProbeTable,"enqueue",1).args,"expectedSessionNonce"),false));
    check(()=>assert.equal(Object.hasOwn(selected(nullProbeTable,"start",1).args,"expectedSessionNonce"),false));
    for(const value of [undefined,"",true,42,"x".repeat(129)])ameMutation(facts=>{facts.ame.expectedSessionNonce=value;});
    ameMutation(facts=>{delete facts.ame.expectedSessionNonce;});
    ameMutation(value => { value.ame.slots[0].sourceProjectFile = file("foreign"); }, "owned_title_plan_foreign_snapshot_source");
    ameMutation(value => { value.ame.slots[1].completedOwnedPrefix[0].batchId = batch2; }, "owned_title_plan_foreign_completed_prefix");
    ameMutation(value => { value.ame.slots[1].batchId = batch1; }, "owned_title_plan_distinct_batch_ids_required");
    ameMutation(value => { value.ame.slots[0].expectedSourceSha25664 = hash("0"); }, "owned_title_plan_missing_hash_provenance");
    ameMutation(value => { value.ame.presetSha25664 = null; }, "owned_title_plan_missing_hash_provenance");
    ameMutation(value => { value.ame.expectedProcess.pid = "444"; });
    ameMutation(value => { value.ame.presetId = { toString() { throw new Error("must not coerce"); } }; }, "owned_title_plan_invalid_ame_provenance");
    const noActualPreviousJob = withAME(); noActualPreviousJob.ame.slots[1].completedOwnedPrefix = [];
    check(() => assert.equal(selected(plan.buildFixedTitlePlan(noActualPreviousJob), "start", 2).status, "CLOSED"));
    const originalValidator = ame.validateInput;
    try {
      ame.validateInput = () => { throw new Error("typed contract unavailable"); };
      const refused = plan.buildFixedTitlePlan(withAME());
      check(() => assert.ok(refused.rows.every(row => row.status === "CLOSED" && row.args === null && row.argsHash === null)));
    } finally { ame.validateInput = originalValidator; }
    process.stdout.write(JSON.stringify({ schema: "ae-agent.owned-runtime-initial-title-plan-proof.v1", checks,
      sourceOnly: true, nativeAuthority: false, actualEffects: 0, nativeAdmission: false }) + "\n");
  } finally {
    ame.createExecutor = oldAMEExecutor; nativeVariants.createExecutor = oldVariantsExecutor;
  }
}
try { main(); } catch (error) { process.stderr.write(error.stack + "\n"); process.exitCode = 1; }

"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { buildPlaceholderPlan } = require("../mcp-server/placeholder-plan-builder");

const input = {
  rootComp: { itemId: 10, itemIndex: 2, name: "Final Comp", duration: 12, frameRate: 30 },
  targetComp: { itemId: 20, itemIndex: 4, name: "Pre-comp 1", duration: 12, frameRate: 30 },
  route: [{ parentCompItemId: 10, childCompItemId: 20, layerId: 30, layerIndex: 1,
    startTime: 0, inPoint: 0, outPoint: 12, stretch: 100, timeRemapEnabled: false }],
  targetLayer: { id: 40, index: 3, name: "Image 03", sourceItemId: 50,
    locked: false, stretch: 100, timeRemapEnabled: false },
  sourceItem: { itemId: 60, itemIndex: 8, name: "Shot A", type: "footage", duration: 220 },
  rootRange: [4, 8], sourceRange: [200, 204]
};

const built = buildPlaceholderPlan(input);
assert.equal(built.ok, true);
assert.equal(built.plan.requiresCheckpoint, true);
assert.deepEqual(built.plan.steps.map((s) => s.tool), ["replace_layer_source", "set_layer_time_range", "get_layer_details"]);
assert.equal(built.plan.steps[0].args.expectedPreviousSourceItemId, 50);
assert.equal(built.plan.steps[0].args.expectedSourceItemId, 60);
assert.equal(built.plan.steps[1].args.expectedLayerId, 40);
assert.equal(built.plan.steps[1].args.startTime, -196);
assert.deepEqual([built.expectedReadBack.inPoint, built.expectedReadBack.outPoint], [4, 8]);

const rejects = [
  [{ targetComp: { ...input.targetComp, itemId: 21 } }, "target_comp_mismatch"],
  [{ route: [{ ...input.route[0], childCompItemId: 21 }] }, "target_comp_mismatch"],
  [{ route: [{ ...input.route[0], stretch: 50 }] }, "unsupported_or_stale_route"],
  [{ targetLayer: { ...input.targetLayer, timeRemapEnabled: true } }, "unsupported_target_layer"],
  [{ rootRange: [4, 8], sourceRange: [200, 205] }, "source_duration_mismatch"],
  [{ rootRange: [4.01, 8] }, "off_frame_boundary"],
  [{ sourceItem: { ...input.sourceItem, duration: 201 } }, "invalid_time_range"],
  [{ route: [] }, "target_comp_mismatch"]
];
for (const [change, code] of rejects) assert.equal(buildPlaceholderPlan({ ...input, ...change }).code, code);
const daemon = fs.readFileSync(path.join(__dirname, "..", "mcp-server", "bridge-daemon.js"), "utf8");
for (const [tool, next, guards] of [
  ["set_layer_time_range", "stagger_layers", ["Composition identity changed before timing edit", "Layer identity changed before timing edit", "Layer source changed before timing edit"]],
  ["replace_layer_source", "rename_layers", ["Composition identity changed before source replacement", "Layer identity changed before source replacement", "Previous layer source changed before replacement", "Replacement source identity changed"]]
]) {
  const start = daemon.indexOf(`if (name === "${tool}")`);
  const end = daemon.indexOf(`if (name === "${next}")`, start + 1);
  const branch = daemon.slice(start, end);
  const mutate = branch.indexOf("app.beginUndoGroup");
  assert(start >= 0 && end > start && mutate > 0, `${tool} handler missing`);
  for (const guard of guards) assert(branch.indexOf(guard) > 0 && branch.indexOf(guard) < mutate, `${tool}: ${guard} must precede mutation`);
}
console.log(JSON.stringify({ ok: true, checks: "nested root/source timing, exact IDs, frame/route/source fail closed, guarded typed plan" }));

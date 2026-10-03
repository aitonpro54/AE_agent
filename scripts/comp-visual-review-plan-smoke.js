"use strict";

const assert = require("node:assert/strict");
const { buildCompVisualReviewPlanTool, buildCompVisualReviewPlan } = require("../mcp-server/comp-visual-review-plan");

const reviewId = "74c0a3b1-1d92-4ae7-9a76-134073fdb281";
const observedAt = "2026-10-03T08:30:00.000Z";
const projectFile = "C:/work/project.aep";
const comp = (itemId, itemIndex, name, frameRate = 24, duration = 10) => ({ itemId, itemIndex, name, width: 1920, height: 1080, frameRate, duration });
const context = { projectFile, observedAt, comps: [comp(1, 5, "Same Name"), comp(2, 9, "Same Name"), comp(3, 12, "Third"), comp(4, 18, "Fourth", 23.976)] };
const clone = (value) => JSON.parse(JSON.stringify(value));
function build(input, ctx = context, id = reviewId) { return buildCompVisualReviewPlan(input, ctx, id); }
function rejects(input, ctx = context, id = reviewId, code) {
  assert.throws(() => build(input, ctx, id), (error) => !code || error.code === code);
}

assert.equal(buildCompVisualReviewPlanTool.name, "build_comp_visual_review_plan");
assert.deepEqual(buildCompVisualReviewPlanTool.inputSchema.required, ["targets"]);
assert.equal(buildCompVisualReviewPlanTool.inputSchema.additionalProperties, false);

const input = { targets: [
  { compItemId: 2, times: [1 / 24, 0, 1 / 24] },
  { compItemId: 1, times: [0.5] }
] };
const inputBefore = clone(input);
const contextBefore = clone(context);
const result = build(input);
assert.deepEqual(input, inputBefore);
assert.deepEqual(context, contextBefore);
assert.equal(result.previewOnly, true);
assert.equal(result.projectMutations, 0);
assert.equal(result.plan.targetProject.file, projectFile);
assert.equal(result.plan.risk, "medium");
assert.deepEqual(result.review.frames.map((frame) => frame.compItemId), [2, 2, 1]);
assert.deepEqual(result.review.frames.map((frame) => frame.frameNumber), [1, 0, 12]);
assert.equal(result.review.frames[0].compItemIndex, 9);
assert.equal(result.review.frames[0].compName, result.review.frames[2].compName);
assert.equal(result.review.frames[0].outputFileName, `comp-review-${reviewId}-1.png`);
assert.equal(result.review.frames[0].stepIndex, 2);
assert.deepEqual(result.review.frames.map((frame) => frame.stepIndex), [2, 3, 4]);
for (const frame of result.review.frames) assert.equal(result.plan.steps[frame.stepIndex - 1].args.expectedCompItemId, frame.compItemId);
assert.equal(result.plan.steps.length, 7);
assert.equal(result.plan.steps[0].tool, "get_project_info");
assert.equal(result.plan.steps.at(-1).tool, "get_project_info");
const saveStep = result.plan.steps[1];
assert.deepEqual(saveStep.args.resolutionFactor, [1, 1]);
assert.equal(saveStep.args.expectedCompItemId, 2);
assert.equal(saveStep.args.compItemIndex, 9);
assert.equal(saveStep.args.allowOverwrite, false);
assert.equal(saveStep.args.deleteAfterReadBack, false);
assert.equal(saveStep.args.verifyAfter, true);
assert.equal(saveStep.args.idempotencyKey, `${reviewId}:1`);
assert.equal(saveStep.args.idempotencyScope, "comp-visual-review");
assert.deepEqual(result.plan.steps[4], { tool: "get_comp_details", args: { compItemId: 2, includeLayers: false } });
assert.deepEqual(result.plan.steps[5], { tool: "get_comp_details", args: { compItemId: 1, includeLayers: false } });
assert.deepEqual(result.review.limits, { projectCurrentState: "unknown", artisticStatus: "unknown", canonicalStatus: "unknown" });

const maxInput = { targets: [
  { compItemId: 1, times: [0, 1 / 24, 2 / 24] },
  { compItemId: 2, times: [0, 1 / 24, 2 / 24] },
  { compItemId: 3, times: [0, 1 / 24, 2 / 24] },
  { compItemId: 4, times: [0, 1 / 23.976, 2 / 23.976] }
] };
const maxResult = build(maxInput);
assert.equal(maxResult.review.frames.length, 12);
assert.equal(maxResult.plan.steps.length, 18);
assert.equal(maxResult.plan.steps.filter((step) => step.tool === "save_comp_frame_png").length, 12);
assert.equal(maxResult.plan.steps.filter((step) => step.tool === "get_comp_details").length, 4);

rejects({ targets: [{ compItemId: 1, times: [0] }], extra: true });
rejects({ targets: [{ compItemId: 1, times: [0], extra: 1 }] });
rejects({ targets: [{ compItemId: 1, times: [0] }, { compItemId: 1, times: [1 / 24] }] }, context, reviewId, "invalid_or_duplicate_comp_id");
rejects({ targets: [{ compItemId: 77, times: [0] }] }, context, reviewId, "requested_comp_not_observed");
rejects({ targets: [{ compItemId: 1, times: [10] }] }, context, reviewId, "time_outside_comp");
rejects({ targets: [{ compItemId: 1, times: [0.01] }] }, context, reviewId, "time_off_frame_grid");
rejects({ targets: [{ compItemId: 1, times: ["0"] }] });
rejects({ targets: [{ compItemId: 1, times: [0] }] }, context, "../unsafe", "invalid_review_id");
rejects({ targets: [{ compItemId: 1, times: [0] }] }, { ...context, observedAt: "2026-02-31T08:30:00.000Z" }, reviewId, "invalid_server_observation");
rejects({ targets: [{ compItemId: 1, times: Array.from({ length: 25 }, (_, i) => i / 24) }] }, context, reviewId, "input_slot_limit_exceeded");
rejects({ targets: [{ compItemId: 1, times: Array.from({ length: 13 }, (_, i) => i / 24) }] }, context, reviewId, "frame_limit_exceeded");
rejects({ targets: [{ compItemId: 1, times: [0] }] }, { ...context, comps: context.comps.filter((item) => item.itemId !== 1) }, reviewId, "requested_comp_not_observed");
rejects({ targets: [{ compItemId: 1, times: [0] }] }, { ...context, comps: [...context.comps, comp(1, 99, "duplicate")] }, reviewId, "invalid_observed_comp");
rejects({ targets: [{ compItemId: 1, times: [0] }] }, { ...context, comps: context.comps.map((item) => item.itemId === 2 ? { ...item, itemIndex: 5 } : item) }, reviewId, "invalid_observed_comp");
rejects({ targets: [{ compItemId: 1, times: [0] }] }, { ...context, projectFile: "relative.aep" }, reviewId, "invalid_server_observation");
rejects({ targets: [{ compItemId: 1, times: [10 - 1e-8] }] }, context, reviewId, "time_outside_comp");

const fractionalFps = build({ targets: [{ compItemId: 4, times: [1 / 23.976] }] });
assert.equal(fractionalFps.review.frames[0].frameNumber, 1);
assert.equal(fractionalFps.review.frames[0].time, 1 / 23.976);
const exactCoverage = build({ targets: [{ compItemId: 1, times: Array.from({ length: 12 }, (_, i) => i / 24) }] });
assert.equal(exactCoverage.review.frames.length, 12);
assert.deepEqual(exactCoverage.review.frames.map((frame) => frame.frameNumber), Array.from({ length: 12 }, (_, i) => i));
console.log(JSON.stringify({ ok: true, checks: "bounded compiler, explicit IDs, observed identities, frame normalization/dedup, strict inputs, safe plan limits" }));

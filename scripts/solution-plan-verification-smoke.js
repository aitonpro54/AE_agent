"use strict";

const assert = require("assert");
const { buildSolutionPlan } = require("../mcp-server/solution-plan-builder");
const {
  checkSolutionPlanPreflight,
  verifySolutionPlanReadBack
} = require("../mcp-server/solution-plan-verification");

const SOLUTION_ID = "ar-distributekeyframesevenly-typed-plan";
const PROPERTY_PATH = [
  { propertyIndex: 2, matchName: "ADBE Transform Group", name: "Transform" },
  { propertyIndex: 11, matchName: "ADBE Opacity", name: "Opacity" }
];

function keyframe(index, time, value, interpolation = "linear") {
  return { index, time, value, inInterpolation: interpolation, outInterpolation: interpolation };
}

function inputs() {
  return {
    comp: { itemIndex: 7, name: "Main", frameRate: 24, startTime: 0, endTime: 8 },
    bounds: { source: "explicit", startTime: 1, endTime: 3 },
    targets: [{
      layerIndex: 2,
      layerName: "Card",
      propertyPath: PROPERTY_PATH,
      expressionEnabled: false,
      valueType: "scalar",
      completeKeyframeCount: 3,
      keyframes: [keyframe(1, 0.5, 0), keyframe(2, 1.5, 50), keyframe(3, 4, 100)],
      selectedKeyframeIndices: [1, 2]
    }]
  };
}

function plan() {
  const built = buildSolutionPlan(SOLUTION_ID, inputs());
  assert.strictEqual(built.ok, true, JSON.stringify(built.error));
  return built.plan;
}

function property(expected, patch = {}) {
  return {
    name: "Opacity",
    matchName: "ADBE Opacity",
    propertyIndex: 11,
    expressionEnabled: false,
    propertyPath: PROPERTY_PATH,
    numKeys: expected.length,
    keyframes: expected.map((item) => ({ ...item })),
    keyframesTruncated: false,
    ...patch
  };
}

function readStep(index, expected, patch = {}) {
  const prop = property(expected, patch.property || {});
  return {
    index,
    tool: "get_layer_details",
    status: patch.status || "completed",
    mutatesProject: false,
    result: {
      comp: patch.comp || { itemIndex: 7, name: "Main" },
      layer: patch.layer || { index: 2, name: "Card" },
      propertyTree: patch.propertyTree || [{ name: "Transform", propertyPath: [PROPERTY_PATH[0]], children: [prop] }],
      propertyTreeTruncated: patch.propertyTreeTruncated === true
    }
  };
}

function mutationStep(index, tool = "set_property_keyframes", status = "completed") {
  return { index, tool, status, mutatesProject: true, result: {} };
}

function fullRun(targetPlan, afterStep) {
  return {
    ok: true,
    dryRun: false,
    steps: [
      readStep(1, targetPlan.expectedReadBack.before[0].completeKeyframes),
      mutationStep(2),
      mutationStep(3, "apply_keyframe_ease"),
      afterStep
    ]
  };
}

function expectStatus(label, result, status, code) {
  assert(result, `${label}: expected builder verification result`);
  assert.strictEqual(result.status, status, `${label}: ${JSON.stringify(result, null, 2)}`);
  if (code) assert(result.errors.some((error) => error.code === code), `${label}: missing ${code}: ${JSON.stringify(result.errors)}`);
}

const targetPlan = plan();
const before = targetPlan.expectedReadBack.before[0].completeKeyframes;
const after = targetPlan.expectedReadBack.after[0].completeKeyframes;

assert.strictEqual(verifySolutionPlanReadBack({ summary: "ordinary plan" }, { steps: [] }), null);
expectStatus("complete preflight", checkSolutionPlanPreflight(targetPlan, [readStep(1, before)]), "passed");
expectStatus("complete post-readback", verifySolutionPlanReadBack(targetPlan, fullRun(targetPlan, readStep(4, after))), "passed");
expectStatus("expression enabled since inspection", checkSolutionPlanPreflight(targetPlan,
  [readStep(1, before, {property: {expressionEnabled: true}})]), "failed", "EXPRESSION_STATE_UNPROVEN");
expectStatus("empty expectations", verifySolutionPlanReadBack({...targetPlan, expectedReadBack: {after: []}}, {steps: []}),
  "needs_review", "MISSING_AFTER_EXPECTATIONS");

expectStatus("missing evidence", verifySolutionPlanReadBack(targetPlan, {
  ok: true,
  steps: [readStep(1, before), mutationStep(2), mutationStep(3, "apply_keyframe_ease")]
}), "needs_review", "MISSING_TARGET_EVIDENCE");

{
  const wrongPath = [PROPERTY_PATH[0], { propertyIndex: 10, matchName: "ADBE Rotate Z", name: "Rotation" }];
  const wrong = property(after, { name: "Rotation", matchName: "ADBE Rotate Z", propertyIndex: 10, propertyPath: wrongPath });
  expectStatus("wrong property", verifySolutionPlanReadBack(targetPlan, fullRun(targetPlan,
    readStep(4, after, { propertyTree: [{ propertyPath: [PROPERTY_PATH[0]], children: [wrong] }] }))), "needs_review", "MISSING_PROPERTY_EVIDENCE");
}

{
  const wrong = after.map((item) => ({ ...item }));
  wrong[0].inInterpolation = "bezier";
  expectStatus("wrong interpolation", verifySolutionPlanReadBack(targetPlan, fullRun(targetPlan, readStep(4, wrong))), "failed", "KEYFRAME_MISMATCH");
}

{
  const wrong = after.map((item) => ({ ...item }));
  wrong[1].value += 1;
  expectStatus("wrong value", verifySolutionPlanReadBack(targetPlan, fullRun(targetPlan, readStep(4, wrong))), "failed", "KEYFRAME_MISMATCH");
}

{
  const wrong = after.map((item) => ({ ...item }));
  wrong[1].time += 1 / 24;
  expectStatus("wrong time", verifySolutionPlanReadBack(targetPlan, fullRun(targetPlan, readStep(4, wrong))), "failed", "KEYFRAME_MISMATCH");
}

expectStatus("incomplete evidence", verifySolutionPlanReadBack(targetPlan, fullRun(targetPlan,
  readStep(4, after, { property: { keyframes: after.slice(0, 2), keyframesTruncated: true } }))), "needs_review", "INCOMPLETE_KEYFRAME_EVIDENCE");

expectStatus("wrong count", verifySolutionPlanReadBack(targetPlan, fullRun(targetPlan,
  readStep(4, after, { property: { numKeys: 2, keyframes: after.slice(0, 2) } }))), "failed", "KEYFRAME_MISMATCH");

expectStatus("foreign comp", verifySolutionPlanReadBack(targetPlan, fullRun(targetPlan,
  readStep(4, after, { comp: { itemIndex: 8, name: "Other" } }))), "needs_review", "MISSING_TARGET_EVIDENCE");

expectStatus("stale preflight", checkSolutionPlanPreflight(targetPlan, [
  readStep(1, before.map((item, index) => index === 0 ? { ...item, value: item.value + 1 } : item))
]), "failed", "KEYFRAME_MISMATCH");

expectStatus("late preflight", checkSolutionPlanPreflight(targetPlan, [readStep(1, before), mutationStep(2)]), "failed", "PREFLIGHT_TOO_LATE");

console.log(JSON.stringify({ ok: true, exactAfterReadBack: true, failClosedMissingForeignIncomplete: true, preflight: true }));

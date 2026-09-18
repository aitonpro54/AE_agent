"use strict";

const assert = require("assert");
const {
  SUPPORTED_SOLUTION_IDS,
  supportedSolutionIds,
  builderInputContract,
  getBuilderContract,
  buildSolutionPlan
} = require("../mcp-server/solution-plan-builder");

const PATH = [
  { name: "Transform", matchName: "ADBE Transform Group", propertyIndex: 2 },
  { name: "Opacity", matchName: "ADBE Opacity", propertyIndex: 11 }
];

function keyframe(index, time, value, extra = {}) {
  return {
    index,
    time,
    value,
    inInterpolation: "linear",
    outInterpolation: "linear",
    ...extra
  };
}

function fixture(source) {
  const bounds = { source, startTime: 1, endTime: 3 };
  if (source === "comp") { bounds.startTime = 0; bounds.endTime = 8; }
  if (source === "layer") {
    bounds.sourceLayerIndex = 2;
    bounds.sourceLayerName = "Card";
  }
  return {
    comp: { itemIndex: 7, name: "Main", frameRate: 24, startTime: 0, endTime: 8 },
    bounds,
    targets: [{
      layerIndex: 2,
      layerName: "Card",
      propertyPath: PATH,
      expressionEnabled: false,
      valueType: "scalar",
      completeKeyframeCount: 4,
      keyframes: [
        keyframe(1, 0.5, 5),
        keyframe(2, 1, 10),
        keyframe(3, 2, 20),
        keyframe(4, 4, 40)
      ],
      selectedKeyframeIndices: [2, 3]
    }]
  };
}

const sourceById = {
  "ar-distributekeyframesevenly-typed-plan": "explicit",
  "ar-distributekeyframestoworkarea-typed-plan": "workArea",
  "ar-distributekeyframestocomp-typed-plan": "comp",
  "ar-distributekeyframestolayer-typed-plan": "layer"
};

assert.deepStrictEqual(SUPPORTED_SOLUTION_IDS, Object.keys(sourceById));
assert.strictEqual(supportedSolutionIds, SUPPORTED_SOLUTION_IDS);
assert.deepStrictEqual(Object.keys(builderInputContract), SUPPORTED_SOLUTION_IDS);
assert.strictEqual(getBuilderContract("not-a-solution"), null);

for (const solutionId of SUPPORTED_SOLUTION_IDS) {
  const contract = getBuilderContract(solutionId);
  assert.strictEqual(contract.solutionId, solutionId);
  assert.strictEqual(contract.inputSchema.properties.bounds.properties.source.const, sourceById[solutionId]);
  assert.strictEqual(contract.example.bounds.source, sourceById[solutionId]);
  assert.strictEqual(contract.restrictions.length, 5);
  contract.description = "mutated by caller";
  assert.notStrictEqual(getBuilderContract(solutionId).description, contract.description, "contract getter must return a defensive copy");
}

for (const solutionId of SUPPORTED_SOLUTION_IDS) {
  const inputs = fixture(sourceById[solutionId]);
  const before = JSON.stringify(inputs);
  const first = buildSolutionPlan(solutionId, inputs);
  const second = buildSolutionPlan(solutionId, inputs);
  assert.strictEqual(first.ok, true, `${solutionId}: should build`);
  assert.deepStrictEqual(first, second, `${solutionId}: output must be deterministic`);
  assert.strictEqual(JSON.stringify(inputs), before, `${solutionId}: input must not be mutated`);
  assert.deepStrictEqual(first.solutionIds, [solutionId]);
  assert.deepStrictEqual(first.plan.solutionIds, [solutionId]);
  assert.strictEqual(first.previewLocal, true);
  assert.strictEqual(first.mutatesProject, false);
  assert.strictEqual(first.plan.requiresFreshEvidenceReview, true);
  assert.strictEqual(first.plan.mutatesProject, true);
  assert.strictEqual(first.plan.executionMode, "preview-only-build");
  assert.strictEqual(first.plan.requiresCheckpoint, true);
  assert.deepStrictEqual(first.plan.steps.map((step) => step.tool), [
    "get_layer_details",
    "set_property_keyframes",
    "apply_keyframe_ease",
    "get_layer_details"
  ]);
  assert.deepStrictEqual(first.plan.steps.map((step) => step.mutatesProject), [false, true, true, false]);
  const replacement = first.plan.steps[1].args.keyframes;
  assert.deepStrictEqual(replacement, sourceById[solutionId] === "comp" ? [
    { time: 0, value: 10 }, { time: 0.5, value: 5 }, { time: 4, value: 40 }, { time: 8, value: 20 }
  ] : [
    { time: 0.5, value: 5 },
    { time: 1, value: 10 },
    { time: 3, value: 20 },
    { time: 4, value: 40 }
  ]);
  assert.strictEqual(first.plan.steps[1].args.clearExisting, true);
  assert.deepStrictEqual(first.plan.steps[2].args.keyIndices, [1, 2, 3, 4]);
  assert.strictEqual(first.plan.steps[2].args.interpolation, "linear");
  assert.strictEqual(first.plan.expectedReadBack.before[0].completeKeyframes.length, 4);
  assert.strictEqual(first.plan.expectedReadBack.after[0].completeKeyframes[2].time, sourceById[solutionId] === "comp" ? 4 : 3);
}

{
  const inputs = fixture("explicit");
  inputs.bounds.startTime = 1.01;
  inputs.bounds.endTime = 1.2;
  inputs.targets[0].selectedKeyframeIndices = [1, 2, 3, 4];
  const result = buildSolutionPlan("ar-distributekeyframesevenly-typed-plan", inputs);
  assert.strictEqual(result.ok, true, "valid fractional bounds should round to frame grid");
  assert.deepStrictEqual(result.plan.steps[1].args.keyframes.map((item) => item.time), [1, 1.0833333333333333, 1.125, 1.2083333333333333]);
}

function rejects(label, solutionId, inputs, code) {
  const result = buildSolutionPlan(solutionId, inputs);
  assert.strictEqual(result.ok, false, `${label}: should reject`);
  assert.strictEqual(result.error.code, code, `${label}: unexpected error ${JSON.stringify(result.error)}`);
  assert.strictEqual(Object.prototype.hasOwnProperty.call(result, "plan"), false, `${label}: failed result must not expose a plan`);
}

rejects("unknown solution", "not-a-solution", fixture("explicit"), "UNSUPPORTED_SOLUTION");

{
  const inputs = fixture("comp");
  inputs.bounds.endTime = 3;
  rejects("comp bounds must be full range", "ar-distributekeyframestocomp-typed-plan", inputs, "BOUNDARY_SOURCE_MISMATCH");
}
{
  const inputs = fixture("explicit");
  delete inputs.targets[0].completeKeyframeCount;
  rejects("complete sequence count required", "ar-distributekeyframesevenly-typed-plan", inputs, "INVALID_INPUT");
}

{
  const inputs = fixture("explicit");
  inputs.targets[0].keyframes[1].value = NaN;
  rejects("nonfinite value", "ar-distributekeyframesevenly-typed-plan", inputs, "NONFINITE_NUMBER");
}

{
  const inputs = fixture("explicit");
  inputs.targets[0].keyframes[1].inInterpolation = "bezier";
  rejects("bezier interpolation", "ar-distributekeyframesevenly-typed-plan", inputs, "UNSUPPORTED_INTERPOLATION");
}

{
  const inputs = fixture("explicit");
  inputs.targets[0].keyframes[1].inSpatialTangent = [0, 0];
  rejects("spatial metadata", "ar-distributekeyframesevenly-typed-plan", inputs, "UNSUPPORTED_KEYFRAME_METADATA");
}

{
  const inputs = fixture("explicit");
  inputs.targets[0].keyframes[1].unknownMetadata = true;
  rejects("unknown keyframe metadata", "ar-distributekeyframesevenly-typed-plan", inputs, "UNSUPPORTED_KEYFRAME_METADATA");
}

{
  const inputs = fixture("explicit");
  inputs.targets[0].selectedKeyframeIndices = [3, 2];
  rejects("ambiguous selection order", "ar-distributekeyframesevenly-typed-plan", inputs, "AMBIGUOUS_SELECTED_KEYFRAME_ORDER");
}

{
  const inputs = fixture("explicit");
  inputs.targets[0].expressionEnabled = true;
  rejects("enabled expression", "ar-distributekeyframesevenly-typed-plan", inputs, "EXPRESSION_ENABLED");
}

{
  const inputs = fixture("explicit");
  inputs.targets[0].keyframes.pop();
  rejects("incomplete sequence", "ar-distributekeyframesevenly-typed-plan", inputs, "INCOMPLETE_KEYFRAME_SEQUENCE");
}

{
  const inputs = fixture("explicit");
  inputs.targets[0].selectedKeyframeIndices = [1, 2];
  inputs.bounds.startTime = 3;
  inputs.bounds.endTime = 4;
  rejects("collision with unselected", "ar-distributekeyframesevenly-typed-plan", inputs, "KEYFRAME_TIME_COLLISION");
}

{
  const inputs = fixture("workArea");
  inputs.bounds.source = "comp";
  rejects("wrong boundary source", "ar-distributekeyframestoworkarea-typed-plan", inputs, "BOUNDARY_SOURCE_MISMATCH");
}

{
  const inputs = fixture("layer");
  inputs.bounds.sourceLayerIndex = 3;
  rejects("ambiguous layer bounds", "ar-distributekeyframestolayer-typed-plan", inputs, "AMBIGUOUS_LAYER_BOUNDS");
}

{
  const inputs = fixture("comp");
  inputs.bounds.endTime = 9;
  rejects("bounds outside comp", "ar-distributekeyframestocomp-typed-plan", inputs, "DISTRIBUTION_BOUNDS_OUT_OF_COMP");
}

for (const modify of [
  (value) => { value.unknown = true; },
  (value) => { value.comp.unknown = true; },
  (value) => { value.bounds.unknown = true; },
  (value) => { value.targets[0].unknown = true; }
]) {
  const inputs = fixture("explicit"); modify(inputs);
  rejects("unsupported fields", "ar-distributekeyframesevenly-typed-plan", inputs, "UNKNOWN_INPUT_FIELD");
}
{
  const inputs = fixture("explicit");
  inputs.targets.push({...inputs.targets[0], propertyPath: PATH.map(({propertyIndex, matchName}) => ({propertyIndex, matchName}))});
  rejects("same index chain with alternate descriptors", "ar-distributekeyframesevenly-typed-plan", inputs, "DUPLICATE_PROPERTY_TARGET");
}
{
  const inputs = fixture("explicit");
  inputs.targets[0].propertyPath = PATH.map(({matchName}) => matchName);
  rejects("noncanonical alias path", "ar-distributekeyframesevenly-typed-plan", inputs, "INVALID_PROPERTY_PATH");
}
assert.deepStrictEqual(buildSolutionPlan("ar-distributekeyframesevenly-typed-plan", fixture("explicit")).plan.steps[1].args.propertyPath, [2, 11]);
console.log("solution-plan-builder-smoke: ok");

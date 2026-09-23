"use strict";

const assert = require("node:assert/strict");
const { buildSemanticVerification } = require("../mcp-server/semantic-verification");

const value = [0, 0, 1, 1];
const pathFor = (effectIndex = 2, effectName = "Fill", group = "ADBE Effect Parade") => [
  { propertyIndex: 1, name: "Effects", matchName: group },
  { propertyIndex: effectIndex, name: effectName, matchName: "ADBE Fill" },
  { propertyIndex: 2, name: "Color", matchName: "ADBE Fill-0002" }
];
const property = (path = pathFor()) => ({
  propertyIndex: 2, name: "Color", matchName: "ADBE Fill-0002", propertyPath: path, value
});
const comp = (itemIndex = 7) => ({ itemIndex, name: itemIndex === 7 ? "TargetComp" : "OtherComp" });
const layer = (index = 3) => ({ index, name: `Layer ${index}` });

function scenario({ label, targets = [3], argsPath = pathFor(), resultPaths, resultComp = 7,
  resultLayerIndices = targets, readPaths, readComp = 7,
  readLayers = targets, readArgsComp = readComp, readArgsLayers = readLayers, readArgsEffect = 2,
  expected = "needs_review" }) {
  const args = { compItemIndex: 7, compName: "TargetComp",
    layerIndex: targets.length === 1 ? targets[0] : targets, propertyPath: argsPath, value };
  const resultLayers = resultLayerIndices.map(layer);
  const resultProperties = (resultPaths || targets.map(() => pathFor())).map(property);
  const steps = [{ index: 1, tool: "set_property_value", args, status: "completed",
    mutatesProject: true, result: { comp: comp(resultComp), layers: resultLayers,
      layer: targets.length === 1 ? resultLayers[0] : null,
      properties: resultProperties,
      property: targets.length === 1 ? resultProperties[0] : null } }];
  (readPaths || targets.map(() => pathFor())).forEach((path, index) => {
    const readLayer = readLayers[index];
    steps.push({ index: index + 2, tool: "get_effect_details", status: "completed",
      args: { compItemIndex: readArgsComp, layerIndex: readArgsLayers[index], effectIndex: readArgsEffect },
      result: { comp: comp(readComp), layer: readLayer === null ? null : layer(readLayer),
      properties: [property(path)] } });
  });
  const actual = buildSemanticVerification({ summary: label, steps: [] },
    { ok: true, dryRun: false, steps });
  assert.equal(actual.status, expected, `${label}: ${JSON.stringify(actual.checks)}`);
  if (expected === "passed") {
    for (const check of actual.checks) {
      assert.equal(check.binding.mutationStep, 1);
      assert.equal(check.binding.readBack.status, "completed");
      assert.equal(check.binding.target.compItemIndex, 7);
      assert.equal(check.binding.readBack.comp.itemIndex, 7);
      assert.equal(check.binding.target.propertyPath, argsPath);
      assert.equal(check.binding.readBack.propertyPath[1].propertyIndex, 2);
    }
  }
  return { label, status: actual.status, checks: actual.checks.map(({ id, status }) => ({ id, status })) };
}

const results = [
  scenario({ label: "wrong duplicate result and read-back", resultPaths: [pathFor(1)], readPaths: [pathFor(1)] }),
  scenario({ label: "right request but wrong result composition", resultComp: 99 }),
  scenario({ label: "right request but wrong result layer", resultLayerIndices: [4] }),
  scenario({ label: "wrong duplicate read-back", readPaths: [pathFor(1)] }),
  scenario({ label: "string request still binds result to read-back instance",
    argsPath: "ADBE Effect Parade.ADBE Fill.ADBE Fill-0002", readPaths: [pathFor(1)] }),
  scenario({ label: "changed name at same index", readPaths: [pathFor(2, "Other Fill")] }),
  scenario({ label: "wrong composition", readComp: 99 }),
  scenario({ label: "wrong layer", readLayers: [4] }),
  scenario({ label: "missing read-back owner", readLayers: [null], readArgsLayers: [3] }),
  scenario({ label: "wrong property group", readPaths: [pathFor(2, "Fill", "ADBE Mask Parade")] }),
  scenario({ label: "one correct target masks missing bulk target", targets: [3, 4], readPaths: [pathFor()], readLayers: [3], readArgsLayers: [3] }),
  scenario({ label: "read-back step targeted another layer", readArgsLayers: [4] }),
  scenario({ label: "read-back step targeted another effect", readArgsEffect: 1 }),
  scenario({ label: "exact result and independent read-back", expected: "passed" }),
  scenario({ label: "string request with same full observed instance", argsPath: "ADBE Effect Parade.ADBE Fill.ADBE Fill-0002", expected: "passed" }),
  scenario({ label: "each bulk target has own read-back", targets: [3, 4], expected: "passed" })
];

function effectScenario(label, readComp, readLayer, readPath, expected) {
  const args = { compItemIndex: 7, compName: "TargetComp", layerIndex: 3,
    effectIndex: 2, effectName: "Fill", effectMatchName: "ADBE Fill",
    propertyPath: [{ propertyIndex: 2, name: "Color", matchName: "ADBE Fill-0002" }], value };
  const effect = { propertyIndex: 2, name: "Fill", matchName: "ADBE Fill" };
  const steps = [
    { index: 1, tool: "set_effect_property", args, status: "completed", mutatesProject: true,
      result: { comp: comp(), layer: layer(), effect, property: property() } },
    { index: 2, tool: "get_effect_details", args: { compItemIndex: readComp, layerIndex: readLayer, effectIndex: 2 },
      status: "completed", result: { comp: comp(readComp), layer: layer(readLayer), effect,
        properties: [property(readPath)] } }
  ];
  const actual = buildSemanticVerification({ summary: label }, { ok: true, dryRun: false, steps });
  assert.equal(actual.status, expected, `${label}: ${JSON.stringify(actual.checks)}`);
  if (expected === "passed") assert.equal(actual.checks[0].binding.readBack.stepIndex, 2);
  results.push({ label, status: actual.status, checks: actual.checks.map(({ id, status }) => ({ id, status })) });
}
effectScenario("effect property wrong duplicate read-back", 7, 3, pathFor(1), "needs_review");
effectScenario("effect property wrong composition", 99, 3, pathFor(), "needs_review");
effectScenario("effect property wrong layer", 7, 4, pathFor(), "needs_review");
effectScenario("effect property exact read-back", 7, 3, pathFor(), "passed");
console.log(JSON.stringify({ module: "actual semantic-verification.js", results }, null, 2));

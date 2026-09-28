"use strict";

const assert = require("node:assert/strict");
const { verifyPlaceholderReadBack } = require("../mcp-server/placeholder-readback");
const expected = { compItemIndex: 4, compItemId: 20, compName: "Pre-comp 1", frameRate: 30,
  layerIndex: 3, layerId: 40, layerName: "Image 03", sourceItemId: 60, sourceName: "Shot A",
  startTime: -196, inPoint: 4, outPoint: 8 };
const observed = { comp: { itemIndex: 4, itemId: 20, name: "Pre-comp 1", frameRate: 30 },
  layer: { index: 3, id: 40, name: "Image 03", source: { itemId: 60, name: "Shot A" },
    startTime: -196, inPoint: 4, outPoint: 8, stretch: 100, timeRemapEnabled: false } };

assert.equal(verifyPlaceholderReadBack(expected, observed).status, "passed");
for (const [label, wrong] of [
  ["comp", { ...observed, comp: { ...observed.comp, itemId: 21 } }],
  ["layer", { ...observed, layer: { ...observed.layer, id: 41 } }],
  ["source", { ...observed, layer: { ...observed.layer, source: { itemId: 50, name: "Shot A" } } }],
  ["time", { ...observed, layer: { ...observed.layer, startTime: -195 } }],
  ["remap", { ...observed, layer: { ...observed.layer, timeRemapEnabled: true } }]
]) assert.equal(verifyPlaceholderReadBack(expected, wrong).status, "needs_review", label);
assert.equal(verifyPlaceholderReadBack(expected, { ...observed, layer: { ...observed.layer, outPoint: 8 + 0.3 / 30 } }).status, "needs_review");
assert.equal(verifyPlaceholderReadBack(expected, { ...observed, layer: { ...observed.layer, outPoint: 8 + 0.1 / 30 } }).status, "passed");
assert.equal(verifyPlaceholderReadBack(expected, { comp: observed.comp }).reason, "incomplete_evidence");
assert.equal(verifyPlaceholderReadBack({ ...expected, sourceItemId: undefined }, observed).reason, "invalid_expected_evidence");
assert.equal(verifyPlaceholderReadBack({ ...expected, outPoint: NaN }, observed).reason, "invalid_expected_evidence");
console.log(JSON.stringify({ ok: true, checks: "independent comp/layer/source/timing read-back, missing evidence and frame tolerance" }));

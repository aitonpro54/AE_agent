"use strict";

const expectedFields = ["compItemIndex", "compItemId", "compName", "frameRate", "layerIndex", "layerId", "layerName",
  "sourceItemId", "sourceName", "startTime", "inPoint", "outPoint"];
const ID = { type: "integer", minimum: 1 };
const TEXT = { type: "string", minLength: 1 };
const TIME = { type: "number" };
const inputSchema = { type: "object", required: ["expected", "observed"], properties: {
  expected: { type: "object", required: expectedFields,
    description: "expectedReadBack returned by build_placeholder_plan.",
    properties: { compItemIndex: ID, compItemId: ID, compName: TEXT, frameRate: TIME,
      layerIndex: ID, layerId: ID, layerName: TEXT, sourceItemId: ID, sourceName: TEXT,
      startTime: TIME, inPoint: TIME, outPoint: TIME } },
  observed: { type: "object", required: ["comp", "layer"],
    description: "Fresh independent get_layer_details result for the target layer.",
    properties: { comp: { type: "object", required: ["itemIndex", "itemId", "name", "frameRate"],
      properties: { itemIndex: ID, itemId: ID, name: TEXT, frameRate: TIME } },
    layer: { type: "object", required: ["index", "id", "name", "source", "startTime", "inPoint", "outPoint", "stretch", "timeRemapEnabled"],
      properties: { index: ID, id: ID, name: TEXT, startTime: TIME, inPoint: TIME, outPoint: TIME,
        stretch: TIME, timeRemapEnabled: { type: "boolean" },
        source: { type: "object", required: ["itemId", "name"], properties: { itemId: ID, name: TEXT } } } } } }
} };

function verifyPlaceholderReadBack(expected, observed) {
  if (!expected || !observed || !observed.comp || !observed.layer
    || !expectedFields.every((key) => Object.prototype.hasOwnProperty.call(expected, key))) {
    return { ok: false, status: "needs_review", reason: "incomplete_evidence", checks: [] };
  }
  const expectedIds = ["compItemIndex", "compItemId", "layerIndex", "layerId", "sourceItemId"];
  const expectedNames = ["compName", "layerName", "sourceName"];
  const expectedTimes = ["startTime", "inPoint", "outPoint"];
  if (!expectedIds.every((key) => Number.isSafeInteger(expected[key]) && expected[key] > 0)
    || !expectedNames.every((key) => typeof expected[key] === "string" && expected[key].length > 0)
    || !expectedTimes.every((key) => typeof expected[key] === "number" && Number.isFinite(expected[key]))) {
    return { ok: false, status: "needs_review", reason: "invalid_expected_evidence", checks: [] };
  }
  const comp = observed.comp;
  const layer = observed.layer;
  const source = layer.source || {};
  const checks = [];
  const exact = (field, wanted, got) => checks.push({ field, passed: got === wanted, expected: wanted, observed: got ?? null });
  const time = (field, wanted, got) => checks.push({ field,
    passed: typeof got === "number" && Number.isFinite(got) && Math.abs(got - wanted) <= 0.25 / expected.frameRate,
    expected: wanted, observed: got ?? null });
  if (typeof expected.frameRate !== "number" || !Number.isFinite(expected.frameRate) || expected.frameRate <= 0) {
    return { ok: false, status: "needs_review", reason: "invalid_expected_frame_rate", checks: [] };
  }
  exact("comp.itemIndex", expected.compItemIndex, comp.itemIndex);
  exact("comp.itemId", expected.compItemId, comp.itemId);
  exact("comp.name", expected.compName, comp.name);
  exact("comp.frameRate", expected.frameRate, comp.frameRate);
  exact("layer.index", expected.layerIndex, layer.index);
  exact("layer.id", expected.layerId, layer.id);
  exact("layer.name", expected.layerName, layer.name);
  exact("source.itemId", expected.sourceItemId, source.itemId);
  exact("source.name", expected.sourceName, source.name);
  time("layer.startTime", expected.startTime, layer.startTime);
  time("layer.inPoint", expected.inPoint, layer.inPoint);
  time("layer.outPoint", expected.outPoint, layer.outPoint);
  exact("layer.stretch", 100, layer.stretch);
  exact("layer.timeRemapEnabled", false, layer.timeRemapEnabled);
  const ok = checks.every((check) => check.passed);
  return { ok, status: ok ? "passed" : "needs_review", reason: ok ? null : "read_back_mismatch", checks };
}

module.exports = { inputSchema, verifyPlaceholderReadBack };

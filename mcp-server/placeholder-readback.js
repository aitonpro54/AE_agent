"use strict";
const { pathsEqual } = require("./placeholder-source-recovery");
const { valueEqual, propertyKey, transformValueEqual } = require("./placeholder-protection");
const {isValidStretch} = require("./placeholder-timing");

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
      startTime: TIME, inPoint: TIME, outPoint: TIME, stretch: TIME } },
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
    || !expectedTimes.every((key) => typeof expected[key] === "number" && Number.isFinite(expected[key]))
    || (expected.stretch !== undefined && !isValidStretch(expected.stretch)) || expected.outPoint <= expected.inPoint) {
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
  exact("comp.itemId", expected.compItemId, comp.itemId);
  exact("comp.name", expected.compName, comp.name);
  exact("comp.frameRate", expected.frameRate, comp.frameRate);
  exact("layer.id", expected.layerId, layer.id);
  exact("layer.name", expected.layerName, layer.name);
  exact("source.itemId", expected.sourceItemId, source.itemId);
  exact("source.name", expected.sourceName, source.name);
  time("layer.startTime", expected.startTime, layer.startTime);
  time("layer.inPoint", expected.inPoint, layer.inPoint);
  time("layer.outPoint", expected.outPoint, layer.outPoint);
  const expectedStretch = expected.stretch !== undefined ? expected.stretch : 100;
  exact("layer.stretch", expectedStretch, layer.stretch);
  exact("layer.timeRemapEnabled", false, layer.timeRemapEnabled);
  if (expected.sourceFile !== undefined) checks.push({ field: "source.file", passed: pathsEqual(expected.sourceFile, source.file), expected: expected.sourceFile, observed: source.file ?? null });
  if (expected.footageMissing !== undefined) exact("source.footageMissing", expected.footageMissing, source.footageMissing);
  const geometryLayer = observed.geometry && observed.geometry.layer;
  const geometryMode = geometryLayer && geometryLayer.threeDLayer;
  const dimensionEvidenceContradictory = typeof layer.threeDLayer === "boolean" && typeof geometryMode === "boolean" &&
    layer.threeDLayer !== geometryMode;
  const provenDimensionMode = typeof layer.threeDLayer === "boolean" &&
    (observed.geometry === undefined || geometryMode === layer.threeDLayer) ? layer.threeDLayer : null;
  if (expected.transform) for (const [field, wanted] of Object.entries(expected.transform)) {
    const preview = observed.transform && observed.transform[field];
    const got = preview && typeof preview === "object" && !Array.isArray(preview) ? preview.value : preview;
    checks.push({ field: "transform." + field, passed: !dimensionEvidenceContradictory && transformValueEqual(wanted, got, field, provenDimensionMode) &&
      (!preview || typeof preview !== "object" || Array.isArray(preview) || preview.numKeys === 0 && preview.expressionEnabled === false && preview.dimensionsSeparated !== true),
      expected: wanted, observed: got ?? null });
  }
  if (expected.properties) for (const wanted of expected.properties) {
    let matches = [];
    try { matches = (observed.properties || []).filter(value => propertyKey(value.path) === propertyKey(wanted.path)); } catch (_error) {}
    const got = matches.length === 1 ? matches[0] : null;
    checks.push({ field: "protectedProperty", passed: Boolean(got) && valueEqual(wanted.value, got.value) && got.numKeys === 0 && got.expressionEnabled === false && got.dimensionsSeparated !== true,
      expected: wanted.value, observed: got && got.value });
  }
  let coverage=null;
  if(expected.geometry){
    const proven2D = layer.threeDLayer === false && geometryLayer && geometryLayer.threeDLayer === false;
    const equal=proven2D && Object.entries(expected.geometry).every(([group,fields])=>observed.geometry[group] && Object.entries(fields).every(([field,value])=>{
      if(group==="layer" && field==="anchorPoint") return transformValueEqual(value, observed.geometry[group][field], "anchorPoint", false);
      return valueEqual(value,observed.geometry[group][field]);
    }));
    checks.push({field:"geometry",passed:Boolean(equal),expected:expected.geometry,observed:observed.geometry || null});
    coverage=require("./placeholder-framing").verifyPlaceholderCoverage({geometry:observed.geometry,transform:observed.transform});
    checks.push({field:"rectangularCoverage",passed:coverage.eligible===true && coverage.covered===true,expected:true,observed:coverage.covered===true});
  }
  const ok = checks.every((check) => check.passed);
  return { ok, status: ok ? "passed" : "needs_review", reason: ok ? null : "read_back_mismatch", checks,
    ...(coverage ? {coverage,artisticAccepted:false} : {}),addressDrift: { compItemIndex: comp.itemIndex !== expected.compItemIndex, layerIndex: layer.index !== expected.layerIndex } };
}

module.exports = { inputSchema, verifyPlaceholderReadBack };

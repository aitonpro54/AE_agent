#!/usr/bin/env node
"use strict";

const assert = require("assert/strict");

const {
  canonicalize2DVector,
  transformNumberEqual,
  transformValueEqual,
  valueEqual
} = require("../mcp-server/placeholder-protection");

const {
  validateGeometry,
  verifyPlaceholderCoverage
} = require("../mcp-server/placeholder-framing");

const {
  verifyPlaceholderReadBack
} = require("../mcp-server/placeholder-readback");

const service = require("../mcp-server/placeholder-review-service");
const { createVisualProject, request } = require("./placeholder-visual-fixture");

let testCount = 0;
let passCount = 0;

function test(name, fn) {
  testCount++;
  try {
    fn();
    passCount++;
    console.log(`  PASS: ${name}`);
  } catch (err) {
    console.error(`  FAIL: ${name}`, err);
    process.exitCode = 1;
  }
}

console.log("Running native contract parity regression suite...");

// -------------------------------------------------------------
// 1. Guarded 2D canonicalization unit tests
// -------------------------------------------------------------
test("canonicalize2DVector: explicit false positive for 2D and 3D native vectors", () => {
  assert.deepEqual(canonicalize2DVector([640, 360], "position", false), [640, 360]);
  assert.deepEqual(canonicalize2DVector([640, 360, 0], "position", false), [640, 360]);
  assert.deepEqual(canonicalize2DVector([640, 360, 0], "anchorPoint", false), [640, 360]);
  assert.deepEqual(canonicalize2DVector([200, 200], "scale", false), [200, 200]);
  assert.deepEqual(canonicalize2DVector([200, 200, 100], "scale", false), [200, 200]);
  assert.equal(canonicalize2DVector(150, "scale", false), null);
});

test("canonicalize2DVector: reject threeDLayer true/unknown", () => {
  assert.equal(canonicalize2DVector([640, 360, 0], "position", true), null);
  assert.equal(canonicalize2DVector([640, 360, 0], "position", null), null);
  assert.equal(canonicalize2DVector([640, 360, 0], "position", undefined), null);
  assert.equal(canonicalize2DVector([640, 360, 0], "position", "false"), null);
});

test("canonicalize2DVector: reject bad z, extra coords, NaN", () => {
  assert.equal(canonicalize2DVector([640, 360, 1], "position", false), null);
  assert.equal(canonicalize2DVector([640, 360, -0.01], "position", false), null);
  assert.equal(canonicalize2DVector([200, 200, 50], "scale", false), null);
  assert.equal(canonicalize2DVector([200, 200, 0], "scale", false), null);
  assert.equal(canonicalize2DVector([640, 360, 0, 0], "position", false), null);
  assert.equal(canonicalize2DVector([640], "position", false), null);
  assert.equal(canonicalize2DVector([], "position", false), null);
  assert.equal(canonicalize2DVector([NaN, 360, 0], "position", false), null);
  assert.equal(canonicalize2DVector([640, Infinity, 0], "position", false), null);
});

test("transformNumberEqual: exact and Float32 representation parity", () => {
  assert.equal(transformNumberEqual(640, 640), true);
  assert.equal(transformNumberEqual(100, 100), true);
  // Real captured Float32 delta: 33.33333333333333 vs 33.3333320617676 (Math.fround delta ~1.27e-6)
  assert.equal(transformNumberEqual(33.33333333333333, 33.3333320617676), true);
  assert.equal(transformNumberEqual(33.3333320617676, 33.33333333333333), true);
  // Outside Float32 epsilon is rejected
  assert.equal(transformNumberEqual(33.33333, 33.33333333333333), false);
  assert.equal(transformNumberEqual(33.3, 33.33333333333333), false);
});

test("transformValueEqual: guarded comparison with 2D canonicalization and Float32", () => {
  assert.equal(transformValueEqual([640, 360, 0], [640, 360], "position", false), true);
  assert.equal(transformValueEqual([200, 200, 100], [200, 200], "scale", false), true);
  assert.equal(transformValueEqual([33.33333333333333, 33.33333333333333], [33.3333320617676, 33.3333320617676, 100], "scale", false), true);
  // Rejections
  assert.equal(transformValueEqual([640, 360, 0], [640, 360], "position", true), false);
  assert.equal(transformValueEqual([640, 360, 1], [640, 360], "position", false), false);
  assert.equal(transformValueEqual([200, 200, 50], [200, 200], "scale", false), false);
});

// -------------------------------------------------------------
// 2. Framing & Coverage verification with native 3D vectors
// -------------------------------------------------------------
const baseGeo = {
  comp: { width: 1280, height: 720, pixelAspect: 1, frameRate: 25 },
  source: { width: 1280, height: 720, pixelAspect: 1, duration: 10, frameRate: 25 },
  layer: {
    threeDLayer: false,
    parentLayerId: null,
    rotation: 0,
    anchorPoint: [640, 360, 0], // Native 3D vector
    transformStatic: true,
    hasMasks: false,
    collapseTransformation: false
  }
};

test("validateGeometry: accepts native [ax, ay, 0] when threeDLayer: false", () => {
  const res = validateGeometry(baseGeo);
  assert.equal(res.valid, true, JSON.stringify(res.reasons));
});

test("validateGeometry: rejects 3D layer with [ax, ay, 0]", () => {
  const bad = JSON.parse(JSON.stringify(baseGeo));
  bad.layer.threeDLayer = true;
  assert.equal(validateGeometry(bad).valid, false);
});

test("validateGeometry: rejects bad z [ax, ay, 1]", () => {
  const bad = JSON.parse(JSON.stringify(baseGeo));
  bad.layer.anchorPoint = [640, 360, 1];
  assert.equal(validateGeometry(bad).valid, false);
});

test("validateGeometry: rejects excess coords and NaN", () => {
  const bad4 = JSON.parse(JSON.stringify(baseGeo));
  bad4.layer.anchorPoint = [640, 360, 0, 0];
  assert.equal(validateGeometry(bad4).valid, false);

  const badNaN = JSON.parse(JSON.stringify(baseGeo));
  badNaN.layer.anchorPoint = [NaN, 360, 0];
  assert.equal(validateGeometry(badNaN).valid, false);
});

test("verifyPlaceholderCoverage: accepts native transform vectors [640,360,0], [100,100,100]", () => {
  const nativeTransform = {
    anchorPoint: [640, 360, 0],
    position: [640, 360, 0],
    scale: [100, 100, 100],
    rotation: 0
  };
  const cov = verifyPlaceholderCoverage({ geometry: baseGeo, transform: nativeTransform });
  assert.equal(cov.eligible, true, JSON.stringify(cov.reasons));
  assert.equal(cov.covered, true);
});

test("verifyPlaceholderCoverage: rejects native 3D vectors when threeDLayer: true", () => {
  const threeDGeo = JSON.parse(JSON.stringify(baseGeo));
  threeDGeo.layer.threeDLayer = true;
  const nativeTransform = {
    anchorPoint: [640, 360, 0],
    position: [640, 360, 0],
    scale: [100, 100, 100],
    rotation: 0
  };
  const cov = verifyPlaceholderCoverage({ geometry: threeDGeo, transform: nativeTransform });
  assert.equal(cov.eligible, false);
  assert.equal(cov.covered, false);
});

test("verifyPlaceholderCoverage: rejects bad z in transform coordinates", () => {
  for (const z of [1e-8, -1e-8]) {
    const geometry = structuredClone(baseGeo);
    geometry.layer.anchorPoint[2] = z;
    assert.equal(validateGeometry(geometry).valid, false, "Nonzero z never becomes 2D by epsilon");
    for (const field of ["anchorPoint", "position", "scale"]) {
      const transform = { anchorPoint:[640,360,0],position:[640,360,0],scale:[100,100,100],rotation:0 };
      transform[field][2] += z;
      assert.equal(verifyPlaceholderCoverage({geometry:baseGeo,transform}).covered, false, field);
    }
  }
  const covBadAnchor = verifyPlaceholderCoverage({
    geometry: baseGeo,
    transform: { anchorPoint: [640, 360, 1], position: [640, 360, 0], scale: [100, 100, 100], rotation: 0 }
  });
  assert.equal(covBadAnchor.covered, false);

  const covBadPos = verifyPlaceholderCoverage({
    geometry: baseGeo,
    transform: { anchorPoint: [640, 360, 0], position: [640, 360, -1], scale: [100, 100, 100], rotation: 0 }
  });
  assert.equal(covBadPos.covered, false);

  const covBadScale = verifyPlaceholderCoverage({
    geometry: baseGeo,
    transform: { anchorPoint: [640, 360, 0], position: [640, 360, 0], scale: [100, 100, 50], rotation: 0 }
  });
  assert.equal(covBadScale.covered, false);
});

// -------------------------------------------------------------
// 3. ReadBack verification with native 3D vectors
// -------------------------------------------------------------
test("verifyPlaceholderReadBack: passes with native 3D observed transforms", () => {
  const expected = {
    compItemIndex: 1, compItemId: 10, compName: "Comp", frameRate: 25,
    layerIndex: 1, layerId: 100, layerName: "Layer",
    sourceItemId: 200, sourceName: "Footage",
    startTime: 0, inPoint: 0, outPoint: 5,
    transform: {
      anchorPoint: [640, 360],
      position: [640, 360],
      scale: [100, 100],
      rotation: 0
    }
  };
  const observed = {
    comp: { itemIndex: 1, itemId: 10, name: "Comp", frameRate: 25 },
    layer: {
      index: 1, id: 100, name: "Layer", threeDLayer: false,
      source: { itemId: 200, name: "Footage" },
      startTime: 0, inPoint: 0, outPoint: 5, stretch: 100, timeRemapEnabled: false
    },
    transform: {
      anchorPoint: [640, 360, 0],
      position: [640, 360, 0],
      scale: [100, 100, 100],
      rotation: 0
    }
  };
  const res = verifyPlaceholderReadBack(expected, observed);
  assert.equal(res.ok, true, JSON.stringify(res.checks));
});

test("verifyPlaceholderReadBack: rejects 3D layer with length mismatch", () => {
  const expected = {
    compItemIndex: 1, compItemId: 10, compName: "Comp", frameRate: 25,
    layerIndex: 1, layerId: 100, layerName: "Layer",
    sourceItemId: 200, sourceName: "Footage",
    startTime: 0, inPoint: 0, outPoint: 5,
    transform: { anchorPoint: [640, 360] }
  };
  const observed = {
    comp: { itemIndex: 1, itemId: 10, name: "Comp", frameRate: 25 },
    layer: {
      index: 1, id: 100, name: "Layer", threeDLayer: true, // 3D layer
      source: { itemId: 200, name: "Footage" },
      startTime: 0, inPoint: 0, outPoint: 5, stretch: 100, timeRemapEnabled: false
    },
    transform: { anchorPoint: [640, 360, 0] }
  };
  const res = verifyPlaceholderReadBack(expected, observed);
  assert.equal(res.ok, false);
});

const clone = value => structuredClone(value);
const readExpected = {
  compItemIndex: 1, compItemId: 10, compName: "Comp", frameRate: 25,
  layerIndex: 1, layerId: 100, layerName: "Layer", sourceItemId: 200, sourceName: "Footage",
  startTime: 0, inPoint: 0, outPoint: 5,
  transform: { anchorPoint: [640, 360], position: [640, 360], scale: [100, 100], rotation: 0 }
};
const readObserved = {
  comp: { itemIndex: 1, itemId: 10, name: "Comp", frameRate: 25 },
  layer: { index: 1, id: 100, name: "Layer", threeDLayer: false,
    source: { itemId: 200, name: "Footage" }, startTime: 0, inPoint: 0, outPoint: 5, stretch: 100, timeRemapEnabled: false },
  transform: { anchorPoint: [640, 360, 0], position: [640, 360, 0], scale: [100, 100, 100], rotation: 0 }
};

test("finite comparisons reject malformed values and unsupported vector kinds", () => {
  for (const value of [Infinity, -Infinity, NaN, null, undefined, "100", {}, true]) {
    assert.equal(transformNumberEqual(value, value), false);
    assert.equal(transformValueEqual(value, value, "rotation", false), false);
  }
  for (const value of [[null, null], ["1", "2"], [Infinity, Infinity], [], [1], [1, 2, 0, 0], new Array(2)]) {
    assert.equal(transformValueEqual(value, value, "position", false), false);
    assert.equal(canonicalize2DVector(value, "position", false), null);
  }
  for (const kind of [null, undefined, "unknown", "rotation", "orientation"]) assert.equal(canonicalize2DVector([1, 2, 0], kind, false), null);
  assert.equal(transformValueEqual([1, 2], [1, 2], "unknown", false), false);
  assert.equal(transformValueEqual(150, 150, "scale", false), false);
  assert.equal(canonicalize2DVector([1, 2, 1e-9], "position", false), null);
  assert.equal(canonicalize2DVector([100, 100, 100 + 1e-9], "scale", false), null);
  assert.equal(valueEqual(33.33333333333333, 33.3333320617676), false, "global comparator remains strict");
  assert.equal(transformNumberEqual(33.33333333333333, 33.3333), false);
});

for (const flag of [undefined, null, "false", 0, true]) test(`read-back rejects native triples with layer flag ${String(flag)}`, () => {
  const observed = clone(readObserved);
  if (flag === undefined) delete observed.layer.threeDLayer;
  else observed.layer.threeDLayer = flag;
  assert.equal(verifyPlaceholderReadBack(readExpected, observed).ok, false);
});

test("historical exact 2D equality does not authorize dimensional conversion or Float32 tolerance", () => {
  const observed = clone(readObserved);delete observed.layer.threeDLayer;observed.transform = clone(readExpected.transform);
  assert.equal(verifyPlaceholderReadBack(readExpected, observed).ok, true);
  observed.transform.scale = [33.3333320617676, 33.3333320617676];
  const expected = clone(readExpected);expected.transform.scale = [33.33333333333333, 33.33333333333333];
  assert.equal(verifyPlaceholderReadBack(expected, observed).ok, false);
});

for (const flag of [undefined, null, "false", true]) test(`read-back rejects conflicting geometry flag ${String(flag)}`, () => {
  const observed = clone(readObserved);observed.geometry = clone(baseGeo);
  if (flag === undefined) delete observed.geometry.layer.threeDLayer;
  else observed.geometry.layer.threeDLayer = flag;
  assert.equal(verifyPlaceholderReadBack(readExpected, observed).ok, false);
  assert.equal(verifyPlaceholderReadBack({ ...readExpected, geometry: clone(baseGeo) }, observed).ok, false);
});

test("geometry read-back needs both explicit 2D flags", () => {
  const observed = clone(readObserved);observed.geometry = clone(baseGeo);
  const expected = clone(readExpected);expected.geometry = clone(baseGeo);expected.geometry.layer.anchorPoint = [640, 360];
  assert.equal(verifyPlaceholderReadBack(expected, observed).ok, true);
  for (const flag of [undefined, null, "false", true]) {
    const bad = clone(observed);bad.layer.threeDLayer = flag;
    assert.equal(verifyPlaceholderReadBack(expected, bad).ok, false);
  }
});

for (const [label, change] of [
  ["PAR", geometry => { geometry.source.pixelAspect = 1.09401709401709; }],
  ["3D", geometry => { geometry.layer.threeDLayer = true; }],
  ["parent", geometry => { geometry.layer.parentLayerId = 9; }],
  ["rotation", geometry => { geometry.layer.rotation = 1; }],
  ["animation", geometry => { geometry.layer.transformStatic = false; }],
  ["unknown static", geometry => { delete geometry.layer.transformStatic; }],
  ["masks", geometry => { geometry.layer.hasMasks = true; }],
  ["collapse", geometry => { geometry.layer.collapseTransformation = true; }]
]) test(`native coverage still rejects ${label}`, () => {
  const geometry = clone(baseGeo);change(geometry);
  assert.equal(verifyPlaceholderCoverage({ geometry, transform: readObserved.transform }).covered, false);
});

test("pure framing retains its finite scalar scale contract", () => {
  const result = verifyPlaceholderCoverage({ geometry: baseGeo, transform: { ...readObserved.transform, scale: 100 } });
  assert.equal(result.eligible, true, JSON.stringify(result));assert.equal(result.covered, true);
});

// Production create/read JSX runs only in a VM with native triple/Float32
// setters and actual Text Properties; receipt type proof is never hand-filled.
const projectFile = "C:/Synthetic/Protected.aep";
const projectKey = require("../mcp-server/project-intent-memory").projectStateKey(projectFile);
function nativeReceipt() {
  const project = createVisualProject();
  project.change(`
    root.width=1920;root.height=1080;
    var originalSetValue=Property.prototype.setValue;
    Property.prototype.setValue=function(value){
      if(value instanceof Array && ["ADBE Anchor Point","ADBE Position","ADBE Scale"].indexOf(this.matchName)>=0){
        value=value.slice();if(value.length===2)value.push(this.matchName==="ADBE Scale" ? 100 : 0);
        if(this.matchName==="ADBE Scale"){value[0]=Math.fround(value[0]);value[1]=Math.fround(value[1]);}
      }
      originalSetValue.call(this,value);
    };
  `);
  const found = project.read(`({complete:true,comps:[child,root].map(function(comp){return {
    itemId:comp.id,width:comp.width,height:comp.height,pixelAspect:comp.pixelAspect,duration:comp.duration,frameRate:comp.frameRate,
    layers:comp._layers.map(function(layer){return {id:layer.id,sourceItemId:layer.source.id,enabled:layer.enabled,
      startTime:layer.startTime,inPoint:layer.inPoint,outPoint:layer.outPoint,stretch:layer.stretch,timeRemapEnabled:layer.timeRemapEnabled};})};}),
    sources:[a].map(function(source){return {itemId:source.id,type:"footage",file:source.file.fsName,footageMissing:source.footageMissing,
      hasVideo:source.hasVideo,width:source.width,height:source.height,pixelAspect:source.pixelAspect,duration:source.duration,frameRate:source.frameRate};})})`);
  const input = clone(request);input.targets[0].viewKinds = ["source", "target_comp", "root_comp"];
  const spec = service.createServiceSpecification(service.resolveReviewTargets(input, found), projectKey, "33333333-3333-4333-8333-333333333333");
  const created = project.body(service.createServiceScript(spec, projectFile));
  assert.equal(created.ok, true, JSON.stringify(created));
  const receipt = project.body(service.readServiceScript(created.createdItemIds));
  return { project, spec, created, receipt };
}
const native = nativeReceipt();
const labelLayer = rows => rows.at(-1).layers.find(layer => layer.sourceItemId === null);
const cellLayer = rows => rows.at(-1).layers.find(layer => layer.sourceItemId !== null);

test("production create/read JSX validates native vectors, text collapse and Float32 receipt", () => {
  assert.equal(native.created.createdItemIds.length, 10);
  assert.deepEqual(native.receipt.items[0].layers[0].scale, [100, 100, 100]);
  const label = labelLayer(native.receipt.items);
  assert.equal(label.collapseTransformation, true);assert.equal(label.matchName, "ADBE Text Layer");assert.equal(label.layerKind, "text");
  assert.deepEqual(label.textDocument, { matchName: "ADBE Text Document", numKeys: 0, expressionEnabled: false });
  assert(native.receipt.items.at(-1).layers.some(layer => layer.scale[0] === Math.fround(100 / 3)));
  assert.equal(service.verifyServiceReceipt(native.spec, native.receipt.items, projectKey).ok, true);
});

for (const [label, mutate] of [
  ["missing label matchName", rows => { delete labelLayer(rows).matchName; }],
  ["wrong label matchName despite font20", rows => { labelLayer(rows).matchName = "ADBE AV Layer"; }],
  ["missing label kind despite font20", rows => { delete labelLayer(rows).layerKind; }],
  ["wrong label kind despite font20", rows => { labelLayer(rows).layerKind = "shape"; }],
  ["historical receipt without native type proof", rows => { for (const layer of rows.at(-1).layers) { delete layer.matchName;delete layer.layerKind;delete layer.textDocument; } }],
  ["missing static Source Text proof", rows => { delete labelLayer(rows).textDocument; }],
  ["unknown Source Text numKeys", rows => { delete labelLayer(rows).textDocument.numKeys; }],
  ["unknown Source Text expression", rows => { delete labelLayer(rows).textDocument.expressionEnabled; }],
  ["animated Source Text", rows => { labelLayer(rows).textDocument.numKeys = 1; }],
  ["expression Source Text", rows => { labelLayer(rows).textDocument.expressionEnabled = true; }],
  ["wrong text document kind", rows => { labelLayer(rows).textDocument.matchName = "Other"; }],
  ["missing unsupported array", rows => { delete rows[0].layers[0].unsupported; }],
  ["null unsupported array", rows => { rows[0].layers[0].unsupported = null; }],
  ["malformed unsupported array", rows => { rows[0].layers[0].unsupported = {}; }],
  ["false unsupported field", rows => { labelLayer(rows).unsupported = false; }],
  ["empty string unsupported field", rows => { labelLayer(rows).unsupported = ""; }],
  ["transform expression", rows => { rows[0].layers[0].unsupported = ["unsupported_expression_property"]; }],
  ["reference source", rows => { rows[0].layers[0].sourceItemId = 999; }],
  ["label source", rows => { labelLayer(rows).sourceItemId = 100; }],
  ["label text", rows => { labelLayer(rows).text = "Altered"; }],
  ["label font", rows => { labelLayer(rows).fontSize = 21; }],
  ["label timing", rows => { labelLayer(rows).inPoint = 1; }],
  ["reference timing", rows => { rows[0].layers[0].startTime -= 1e-5; }],
  ["foreign comment", rows => { rows[0].comment = "foreign"; }],
  ["foreign owner name", rows => { rows[0].name = rows[0].name.replace(native.spec.owner, "44444444-4444-4444-8444-444444444444"); }],
  ["layer order", rows => { rows.at(-1).layers.reverse(); }],
  ["masks", rows => { rows[0].layers[0].hasMasks = true; }],
  ["reference collapse", rows => { rows[0].layers[0].collapseTransformation = true; }],
  ["cell collapse", rows => { cellLayer(rows).collapseTransformation = true; }],
  ["label parent", rows => { labelLayer(rows).parentLayerId = 10; }],
  ["native 3D flag", rows => { rows[0].layers[0].threeDLayer = true; }],
  ["illegal position z", rows => { cellLayer(rows).position[2] = 1; }],
  ["illegal scale z", rows => { cellLayer(rows).scale[2] = 99; }],
  ["outside Float32 bound", rows => { cellLayer(rows).scale[0] += 0.001; }],
  ["nonfinite transform", rows => { cellLayer(rows).anchorPoint[0] = Infinity; }],
  ["malformed numeric transform", rows => { cellLayer(rows).scale = ["100", "100", 100]; }],
  ["missing layers array", rows => { delete rows[0].layers; }]
]) test(`production receipt rejects ${label}`, () => {
  const rows = clone(native.receipt.items);mutate(rows);
  assert.equal(service.verifyServiceReceipt(native.spec, rows, projectKey).ok, false);
});

test("production reader rejects unknown/animated/expression Source Text", () => {
  const textProperty = 'items[items.length-1]._layers.filter(function(layer){return layer.matchName==="ADBE Text Layer";})[0].property("ADBE Text Properties").property("ADBE Text Document")';
  for (const mutation of [".numKeys=1;", ".expressionEnabled=true;", ".numKeys=undefined;", ".expressionEnabled=undefined;"]) {
    const sample = nativeReceipt();sample.project.change(textProperty + mutation);
    const fresh = sample.project.body(service.readServiceScript(sample.created.createdItemIds));
    assert(labelLayer(fresh.items).unsupported.includes("review_label_animation"));
    assert.equal(service.verifyServiceReceipt(sample.spec, fresh.items, projectKey).ok, false);
  }
});

test("production reader rejects missing transform static evidence", () => {
  const sample = nativeReceipt();
  sample.project.change('items[items.length-1]._layers[1].property("ADBE Transform Group").property("ADBE Scale").numKeys=undefined;');
  const fresh = sample.project.body(service.readServiceScript(sample.created.createdItemIds));
  assert(fresh.items.at(-1).layers.some(layer => layer.unsupported.includes("unsupported_animated_property")));
  assert.equal(service.verifyServiceReceipt(sample.spec, fresh.items, projectKey).ok, false);
});

test("production record retains owner/project/spec/receipt hash guards", () => {
  const record = { schema: native.spec.schema, owner: native.spec.owner, projectKey, spec: native.spec,
    receipt: native.receipt, receiptHash: service.hash(native.receipt), images: [] };
  assert.doesNotThrow(() => service.validateReviewRecord(record));
  for (const mutate of [
    value => { value.owner = "44444444-4444-4444-8444-444444444444"; },
    value => { value.projectKey = "f".repeat(64); },
    value => { value.spec.specHash = "e".repeat(64); },
    value => { value.receiptHash = "f".repeat(64); },
    value => { value.receipt.projectFile = "C:/Synthetic/Other.aep";value.receiptHash = service.hash(value.receipt); }
  ]) {
    const wrong = clone(record);mutate(wrong);
    assert.throws(() => service.validateReviewRecord(wrong), /invalid_review_artifact_record|project_mismatch/);
  }
});

console.log(`\nNative contract regression: ${passCount}/${testCount} passed; production JSX VM, AE 0.`);
if (process.exitCode) console.error("Native contract regression FAILED.");

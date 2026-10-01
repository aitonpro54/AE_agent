"use strict";

const assert = require("node:assert/strict");
const { projectPlaceholderLayerEvidence } = require("../mcp-server/placeholder-evidence");
const full = {
  comp: { itemIndex: 2, itemId: 10, name: "Root", frameRate: 30, time: 3, numLayers: 100 },
  layer: { index: 1, id: 11, name: "Image", locked: false,
    source: { itemId: 12, name: "Shot", duration: 4, frameRate: 30, file: "private-path" },
    startTime: 0, inPoint: 0, outPoint: 4, stretch: 100, timeRemapEnabled: false,
    comment: "irrelevant", text: { text: "irrelevant" } },
  transform: { position: new Array(10000).fill(0) },
  effects: new Array(10000).fill({ name: "irrelevant" }),
  masks: new Array(10000).fill({ name: "irrelevant" }),
  propertyTree: new Array(10000).fill({ name: "irrelevant" })
};
const compact = projectPlaceholderLayerEvidence(full);
assert.equal(compact.evidenceView, "placeholder.v1");
assert.equal(compact.layer.source.itemId, 12);
assert.equal(compact.layer.outPoint, 4);
assert.equal(compact.layer.locked, false);
assert.equal(compact.comp.frameRate, 30);
assert.equal(JSON.stringify(compact).includes("irrelevant"), false);
assert.equal(compact.layer.source.file, "private-path", "Independent source read-back retains explicit file identity.");
assert.deepEqual(compact.transform, {}, "Oversized transform values must not escape compact projection.");
const bounded = projectPlaceholderLayerEvidence({ ...full, transform: { position: { kind: "array", value: [2, 3], numKeys: 0,
  expressionEnabled: false, dimensionsSeparated: false, expression: "irrelevant" } },
  protectedProperties: new Array(20).fill({ path: ["ADBE Transform Group", "ADBE Opacity"], value: 100, numKeys: 0,
    expressionEnabled: false, dimensionsSeparated: false, expression: "irrelevant" }) });
assert.equal(bounded.properties.length, 12);
assert.equal(JSON.stringify(bounded).includes("irrelevant"), false);
assert.deepEqual(bounded.transform.position.value, [2, 3]);
assert.ok(JSON.stringify(compact).length < JSON.stringify(full).length / 100);
assert.throws(() => projectPlaceholderLayerEvidence({ comp: full.comp }), /incomplete/);
const native = structuredClone(full);
native.layer.threeDLayer = false;
native.transform = { anchorPoint: [160,90,0],position: [160,90,0],scale: [100,100,100],rotation: 0 };
native.geometry = { comp: { width:320,height:180,pixelAspect:1,frameRate:30 },
  source: { width:320,height:180,pixelAspect:1,duration:4,frameRate:30 },
  layer: { threeDLayer:false,parentLayerId:null,rotation:0,anchorPoint:[160,90,0],transformStatic:true,hasMasks:false,collapseTransformation:false } };
const expected = { compItemIndex:2,compItemId:10,compName:"Root",frameRate:30,layerIndex:1,layerId:11,layerName:"Image",
  sourceItemId:12,sourceName:"Shot",startTime:0,inPoint:0,outPoint:4,
  transform: { anchorPoint:[160,90],position:[160,90],scale:[100,100],rotation:0 },geometry:structuredClone(native.geometry) };
expected.geometry.layer.anchorPoint = [160,90];
const verifier = require("../mcp-server/placeholder-readback").verifyPlaceholderReadBack;
const projected = projectPlaceholderLayerEvidence(native);
assert.equal(projected.layer.threeDLayer,false);
assert.deepEqual(projected.geometry.layer.anchorPoint,[160,90,0],"Preserve raw native triple; projector does not canonicalize");
assert.equal(verifier(expected,projected).ok,true);
for (const flag of [undefined,null,"false",0,true]) {
  const unknown = structuredClone(native);unknown.layer.threeDLayer = flag;
  const evidence = projectPlaceholderLayerEvidence(unknown);
  if (typeof flag === "boolean") assert.equal(evidence.layer.threeDLayer,flag);
  else assert.equal(Object.hasOwn(evidence.layer,"threeDLayer"),false,"Never default an unknown flag to false");
  assert.equal(verifier(expected,evidence).ok,false);
}
for (const anchor of [[160,90,1],[160,90,0,0],[160,NaN,0],[160,"90",0],null]) {
  const malformed = structuredClone(native);malformed.geometry.layer.anchorPoint = anchor;malformed.transform.anchorPoint = anchor;
  const evidence = projectPlaceholderLayerEvidence(malformed);
  if (anchor && anchor.length === 3 && anchor.every(Number.isFinite)) assert.deepEqual(evidence.geometry.layer.anchorPoint,anchor);
  else assert.equal(evidence.geometry.layer.anchorPoint,null);
  assert.equal(verifier(expected,evidence).ok,false);
}
console.log(JSON.stringify({ ok: true, checks: "bounded projection, source/static identity, native raw vectors and actual flags; malformed/unknown evidence rejected by production verifier" }));

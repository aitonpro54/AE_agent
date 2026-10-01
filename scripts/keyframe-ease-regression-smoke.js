"use strict";

// Offline actual-module JSX execution and semantic contracts. This fixture is
// an AE API model, not native AE proof; it deliberately models a no-op setter.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { createRequire } = require("node:module");
const { prepareToolScript, buildServerSemanticVerification } = require("../mcp-server/bridge-daemon");
const { buildSemanticVerification } = require("../mcp-server/semantic-verification");

const args = { compItemIndex: 1, compName: "Target", layerIndex: 1,
  propertyPath: ["ADBE Transform Group", "ADBE Position"], keyIndices: [1, 2], interpolation: "hold" };
const results = [];
const clone = value => JSON.parse(JSON.stringify(value));

const fixture = `
var writes = [], undo = { begin: 0, end: 0 };
var KeyframeInterpolationType = { LINEAR: 6612, BEZIER: 6613, HOLD: 6614 };
var PropertyValueType = { NO_VALUE: 0, TwoD_SPATIAL: 6413, ThreeD_SPATIAL: 6414 };
function KeyframeEase(speed, influence) { this.speed = speed; this.influence = influence; }
function Layer() {}
function AVLayer() {}
function TextLayer() {}
function ShapeLayer() {}
function FootageItem() {}
function FolderItem() {}
function CompItem() {}
var prop = {
  name: "Position", matchName: "ADBE Position", propertyIndex: 1, propertyDepth: 2,
  propertyValueType: 6413, propertyType: 1, numProperties: 0, canVaryOverTime: true,
  value: [250,355,0], selectedKeys: [1,2], expressionEnabled: false,
  keys: [{ time: 0, value: [250,355,0], inType: 6612, outType: 6612 },
    { time: 1.78080773353577, value: [420,355,0], inType: 6612, outType: 6612 }],
  keyTime: function(i) { return this.keys[i-1].time; },
  keyValue: function(i) { return this.keys[i-1].value; },
  keyInInterpolationType: function(i) { return this.keys[i-1].inType; },
  keyOutInterpolationType: function(i) { return this.keys[i-1].outType; },
  keyInTemporalEase: function(i) { return this.keys[i-1].inEase || [new KeyframeEase(0,33)]; },
  keyOutTemporalEase: function(i) { return this.keys[i-1].outEase || [new KeyframeEase(0,33)]; },
  isInterpolationTypeValid: function() { return true; },
  setTemporalEaseAtKey: function(i,a,b) { writes.push("ease:"+i); this.keys[i-1].inEase=a; this.keys[i-1].outEase=b; },
  setInterpolationTypeAtKey: function(i,a,b) { writes.push("interpolation:"+i+":"+a); if (!noOp) { this.keys[i-1].inType=a; this.keys[i-1].outType=b; } }
};
Object.defineProperty(prop, "numKeys", { get: function() { return this.keys.length; } });
var group = { name: "Transform", matchName: "ADBE Transform Group", propertyIndex: 1,
  numProperties: 1, property: function(i) { return i===1 || i==="ADBE Position" ? prop : null; } };
var layer = new Layer();
layer.name="Footage"; layer.id=4852; layer.index=1; layer.matchName="ADBE AV Layer";
layer.locked=false; layer.numProperties=1;
layer.property=function(i) { return i===1 || i==="ADBE Transform Group" ? group : null; };
group.parentProperty=layer; prop.parentProperty=group;
var comp=new CompItem(); comp.id=3810; comp.name="Target"; comp.time=0.92; comp.numLayers=1;
comp.layer=function(i) { return i===1 ? layer : null; };
var app={ project: { numItems: 1, item: function(i) { return i===1 ? comp : null; }, activeItem: comp },
  beginUndoGroup: function() { undo.begin++; }, endUndoGroup: function() { undo.end++; } };
`;

// A bounded adapter models the left-associated evaluation matching the native
// diagnostic. It is not an ExtendScript compiler or native AE execution.
function modelNativeConditionalPath(script) {
  const chained = /([A-Za-z_][A-Za-z_0-9]*) === "hold" \? KeyframeInterpolationType\.HOLD : \1 === "linear" \? KeyframeInterpolationType\.LINEAR : KeyframeInterpolationType\.BEZIER/g;
  return script.replace(chained, (_, name) => `(${name} === "hold" ? KeyframeInterpolationType.HOLD : ${name} === "linear") ? KeyframeInterpolationType.LINEAR : KeyframeInterpolationType.BEZIER`);
}

async function execute(toolArgs, setup = "", noOp = false, adapter = script => script) {
  const prepared = await prepareToolScript("apply_keyframe_ease", toolArgs);
  assert.equal(typeof prepared.script, "string");
  const context = vm.createContext({ noOp });
  vm.runInContext(fixture + setup, context);
  const result = JSON.parse(vm.runInContext(adapter(prepared.script), context, { timeout: 2000 }));
  return { prepared, context, result };
}

function semanticRun(payload, readPayload = clone(payload), request = args) {
  return { ok: true, dryRun: false, steps: [
    { index: 1, tool: "apply_keyframe_ease", args: clone(request), status: "completed", mutatesProject: true, result: clone(payload) },
    { index: 2, tool: "get_property_value", args: { compItemId: 3810, layerId: 4852, propertyPath: clone(args.propertyPath) }, status: "completed",
      result: { comp: clone(readPayload.comp), layer: clone(readPayload.layer), property: clone(readPayload.property) } }
  ] };
}
function checkSemantic(label, run, expected = "needs_review") {
  const semantic = buildSemanticVerification({ summary: label }, run);
  assert.equal(semantic.status, expected, `${label}: ${JSON.stringify(semantic.checks)}`);
  results.push({ label, status: semantic.status });
  return semantic;
}

async function main() {
  const readPrepared = await prepareToolScript("get_property_value", { compItemId: 3810, layerId: 4852, propertyPath: args.propertyPath });
  for (const aliased of [false, true]) {
    const readContext=vm.createContext({noOp:false});
    vm.runInContext(fixture + (aliased ? "KeyframeInterpolationType.HOLD=KeyframeInterpolationType.LINEAR;" : ""), readContext);
    const read=JSON.parse(vm.runInContext(readPrepared.script, readContext, {timeout:2000}));
    assert.equal(read.ok,true);
    assert.deepEqual(Array.from(readContext.writes),[],"Interpolation diagnostics must remain read-only.");
    const diagnostic=read.result.property.interpolationDiagnostics;
    assert.equal(diagnostic.schema,"ae-agent-keyframe-interpolation-diagnostic.v1");
    assert.equal(diagnostic.constants.linear.numeric,6612);
    assert.equal(diagnostic.constants.bezier.numeric,6613);
    assert.equal(diagnostic.constants.hold.numeric,aliased ? 6612 : 6614);
    assert.equal(diagnostic.holdConditionalProbe.request.type,"string");
    assert.equal(diagnostic.holdConditionalProbe.request.text,"hold");
    assert.equal(diagnostic.holdConditionalProbe.selected.numeric,diagnostic.constants.hold.numeric);
    assert.equal(diagnostic.holdExplicitBranchProbe.selected.numeric,diagnostic.constants.hold.numeric);
    assert.equal(diagnostic.holdDirect.numeric,diagnostic.constants.hold.numeric);
    assert.equal(diagnostic.holdEqualsLinear,aliased);
    results.push({label:aliased ? "typed read surfaces aliased HOLD constant without writing" : "typed read exposes native enum constants and HOLD conditional probe without writing",status:"passed"});
  }
  const modeledReadContext=vm.createContext({noOp:false});vm.runInContext(fixture,modeledReadContext);
  const modeledRead=JSON.parse(vm.runInContext(modelNativeConditionalPath(readPrepared.script),modeledReadContext,{timeout:2000}));
  assert.equal(modeledRead.result.property.interpolationDiagnostics.holdConditionalProbe.selected.numeric,6612);
  assert.equal(modeledRead.result.property.interpolationDiagnostics.holdExplicitBranchProbe.selected.numeric,6614);
  assert.deepEqual(Array.from(modeledReadContext.writes),[]);
  results.push({label:"read-only diagnostic compares conditional6612 and explicit6614 under bounded native model",status:"passed"});
  const nativeModel = await execute(args);
  const selector = nativeModel.prepared.script.slice(nativeModel.prepared.script.indexOf("var interpolationType;"),
    nativeModel.prepared.script.indexOf("var interpolationValid ="));
  assert(selector.includes('if (interpolation === "hold")'));
  assert(selector.includes('interpolationType = KeyframeInterpolationType.HOLD;'));
  assert(!selector.includes("?"),"Actual generated mutation enum selector must not use a chained conditional.");
  assert.equal(nativeModel.result.ok, true);
  const payload = nativeModel.result.result;
  assert.deepEqual(Array.from(nativeModel.context.writes), ["interpolation:1:6614", "interpolation:2:6614"]);
  assert.equal(payload.keyframeEase.verified, true);
  assert.equal(payload.keyframeEase.interpolationNativeValue, 6614);
  assert.equal(payload.keyframeEase.interpolationValid, true);
  assert.equal(payload.keyframeEase.temporalEaseApplied, false);
  for (const key of payload.property.keyframes) assert.equal(key.outInterpolation, "hold");
  checkSemantic("native HOLD model with preserved times/values and exact independent target", semanticRun(payload), "passed");

  const conditionalModel=await execute(args,"",false,modelNativeConditionalPath);
  const modeledDiagnostic=conditionalModel.result.result.property.interpolationDiagnostics;
  assert.equal(modeledDiagnostic.holdConditionalProbe.selected.numeric,6612,"Bounded adapter must reproduce the observed native diagnostic selection.");
  assert.equal(modeledDiagnostic.holdExplicitBranchProbe.selected.numeric,6614);
  assert.equal(conditionalModel.result.result.keyframeEase.interpolationNativeValue,6614);
  assert.equal(conditionalModel.result.result.keyframeEase.verified,true);
  assert.deepEqual(Array.from(conditionalModel.context.writes),["interpolation:1:6614","interpolation:2:6614"]);
  checkSemantic("explicit generated selector retains HOLD under bounded native-conditional model",semanticRun(conditionalModel.result.result),"passed");
  const legacySelector=nativeModel.prepared.script.replace(selector,
    'var interpolationType = interpolation === "hold" ? KeyframeInterpolationType.HOLD : interpolation === "linear" ? KeyframeInterpolationType.LINEAR : KeyframeInterpolationType.BEZIER;\n      ');
  const legacyContext=vm.createContext({noOp:false});vm.runInContext(fixture,legacyContext);
  const modeledLegacy=JSON.parse(vm.runInContext(modelNativeConditionalPath(legacySelector),legacyContext,{timeout:2000}));
  assert.equal(modeledLegacy.result.keyframeEase.interpolationNativeValue,6612);
  assert.equal(modeledLegacy.result.keyframeEase.verified,false);
  checkSemantic("former chained selector reproduces LINEAR failure under the same bounded model",semanticRun(modeledLegacy.result));

  const noop = await execute(args, "", true);
  assert.equal(noop.result.result.keyframeEase.verified, false);
  assert(noop.result.result.keyframeEase.errors.every(message => message.includes("Interpolation mismatch")));
  const returned = await prepareToolScript("apply_keyframe_ease", args, noop.result.result);
  assert.equal(returned.result.isError, true, "Native no-op must return an error receipt, retaining native diagnostics.");
  const failed = checkSemantic("native setter no-op cannot pass echoed HOLD/keyIndices", semanticRun(noop.result.result));
  assert.equal(failed.failedChecks, 1);

  const badIndex = await execute({ ...args, keyIndices: [1, 99] });
  assert.equal(badIndex.result.ok, false);
  assert.deepEqual(Array.from(badIndex.context.writes), []);
  assert.equal(badIndex.context.undo.begin, 0);
  results.push({ label: "bad later index rejected before all writes", status: "passed" });

  const bezier = await execute({ ...args, interpolation: "bezier", easeIn: { speed: 0, influence: 40 }, easeOut: { speed: 0, influence: 40 } });
  assert.deepEqual(Array.from(bezier.context.writes), ["ease:1", "ease:2", "interpolation:1:6613", "interpolation:2:6613"]);
  checkSemantic("bezier keeps temporal ease in native read-back", semanticRun(bezier.result.result, bezier.result.result,
    { ...args, interpolation: "bezier", easeIn: { speed: 0, influence: 40 }, easeOut: { speed: 0, influence: 40 } }), "passed");
  for (const invalid of ["1", ["1", "2"], [0], [1.2], [], [Number.MAX_SAFE_INTEGER + 1]]) {
    await assert.rejects(() => prepareToolScript("apply_keyframe_ease", { ...args, keyIndices: invalid }), /positive|integers/);
  }
  const scalar = await execute({ ...args, keyIndices: 1 });
  assert.deepEqual(scalar.result.result.keyIndices, [1]);
  checkSemantic("scalar integer key index has the same contract", semanticRun(scalar.result.result, scalar.result.result, { ...args, keyIndices: 1 }), "passed");
  const selected = await execute({ ...args, keyIndices: undefined });
  checkSemantic("selected keys require native before/after evidence", semanticRun(selected.result.result, selected.result.result, { ...args, keyIndices: undefined }), "passed");
  const sourceText = fs.readFileSync(require.resolve("../mcp-server/bridge-daemon"), "utf8");
  const definition = sourceText.slice(sourceText.indexOf('name: "apply_keyframe_ease"'));
  const schema = vm.runInNewContext(`(${definition.match(/keyIndices: (\{[^\n]+\}),\r?\n/)[1]})`);
  assert.deepEqual(Array.from(schema.type), ["integer", "array"]);
  assert.equal(schema.items.type, "integer"); assert.equal(schema.items.minimum, 1); assert.equal(schema.minimum, 1); assert.equal(schema.minItems, 1);
  results.push({ label: "schema and runtime reject string, fractional and zero key indices", status: "passed" });

  const negatives = [
    ["HOLD echo without native property", run => { delete run.steps[0].result.property; delete run.steps[0].result.keyframeEase; }],
    ["no independent read", run => { run.steps.pop(); }],
    ["wrong read composition ID", run => { run.steps[1].result.comp.itemId++; }],
    ["wrong read layer ID", run => { run.steps[1].result.layer.id++; run.steps[1].result.property.layer.id++; }],
    ["read args point to another layer", run => { run.steps[1].args.layerId++; }],
    ["wrong native property instance", run => { run.steps[1].result.property.propertyPath.at(-1).propertyIndex++; }],
    ["same count wrong key indices", run => { run.steps[0].result.keyIndices=[2,3]; }],
    ["changed native key time", run => { run.steps[1].result.property.keyframes[0].time+=0.01; }],
    ["changed native key value", run => { run.steps[1].result.property.keyframes[0].value[0]++; }],
    ["flattened dimensions rejected", run => { run.steps[1].result.property.keyframes[0].value.pop(); }],
    ["linear read cannot corroborate HOLD receipt", run => { run.steps[1].result.property.keyframes[0].outInterpolation="linear"; }],
    ["missing before state cannot prove preservation", run => { delete run.steps[0].result.keyframeEase.before; }],
    ["later conflicting same-target read cannot be masked", run => { const late=clone(run.steps[1]); late.index=3; late.result.property.keyframes[0].outInterpolation="linear"; run.steps.push(late); }]
  ];
  for (const [label, alter] of negatives) { const run=semanticRun(payload); alter(run); checkSemantic(label, run); }

  sourceContracts();
  if (process.argv.includes("--local-evidence")) {
    const file = ".codex-runtime/live-bohemian2016/root-sol19c-hold-numeric-run.json";
    const run = JSON.parse(fs.readFileSync(file, "utf8"));
    const semantic = await buildServerSemanticVerification({ summary: "Historical native HOLD failure" }, run);
    assert.equal(semantic.status, "needs_review"); assert.equal(semantic.failedChecks, 2);
    results.push({ label: "historical native linear receipts fail both former false PASS checks", status: semantic.status });
  }
  console.log(JSON.stringify({ scope: "offline actual-module JSX and semantic contracts; no native AE execution", cases: results.length, results }, null, 2));
}

function sourceContracts() {
  const source = { itemIndex: 45, itemId: 5157, name: "replacement.mp4", type: "footage", file: "C:/media/replacement.mp4" };
  const comp = { itemIndex: 7, itemId: 3810, name: "Source target" };
  const layer = { index: 3, id: 4852, name: "Replacement", source: clone(source) };
  const request = { compItemIndex: 7, expectedCompItemId: 3810, layerIndices: 3, expectedLayerId: 4852,
    sourceItemIndex: 45, expectedSourceItemId: 5157, sourceItemType: "footage" };
  const base = { ok: true, dryRun: false, steps: [
    { index: 1, tool: "replace_layer_source", status: "completed", mutatesProject: true, args: request,
      result: { comp, sourceItem: source, layers: [layer], changedCount: 1 } },
    { index: 2, tool: "get_layer_details", status: "completed", args: { compItemId: 3810, layerId: 4852 }, result: { comp: clone(comp), layer: clone(layer) } }
  ] };
  checkSemantic("numeric source index binds native stable ID and path", base, "passed");
  const legacy=clone(base); delete legacy.steps[0].result.comp.itemId;
  legacy.steps[0].result.verification={ comp: clone(comp) };
  checkSemantic("self-reported verification cannot repair unbound older native receipt", legacy);
  for (const [label, alter] of [
    ["wrong requested source index", run => { run.steps[0].args.sourceItemIndex=46; }],
    ["wrong new source ID", run => { run.steps[0].result.sourceItem.itemId++; }],
    ["conflicting source ID aliases", run => { run.steps[0].result.sourceItem.id=5158; }],
    ["source name request is exact", run => { run.steps[0].args.sourceItemName="other.mp4"; }],
    ["source read path differs at same ID", run => { run.steps[1].result.layer.source.file="C:/media/other.mp4"; }],
    ["null source file is malformed proof", run => { run.steps[0].result.sourceItem.file=null; run.steps[0].result.layers[0].source.file=null; run.steps[1].result.layer.source.file=null; }],
    ["non-string read file cannot corroborate a native path", run => { run.steps[1].result.layer.source.file={path:source.file}; }],
    ["wrong source read ID", run => { run.steps[1].result.layer.source.itemId++; }],
    ["wrong source read target", run => { run.steps[1].args.layerId++; }],
    ["wrong source read composition", run => { run.steps[1].result.comp.itemId++; }],
    ["source echo has no independent read", run => { run.steps.pop(); }],
    ["mismatched attached comp identity cannot repair legacy receipt", run => { delete run.steps[0].result.comp.itemId; run.steps[0].result.verification={comp:{...comp,name:"Other"}}; }]
  ]) { const run=clone(base); alter(run); checkSemantic(label, run); }
  const filename=require.resolve("../mcp-server/semantic-verification");
  const module={exports:{}};
  vm.runInNewContext(fs.readFileSync(filename,"utf8"), { module, exports:module.exports,
    require:createRequire(filename), __dirname:require("node:path").dirname(filename), process:{platform:"linux",env:process.env} }, {filename});
  const posix=clone(base);
  posix.steps[0].result.sourceItem.file="/media/replacement.mp4";
  posix.steps[0].result.layers[0].source.file="/media/replacement.mp4";
  posix.steps[1].result.layer.source.file="/media/Replacement.mp4";
  assert.equal(module.exports.buildSemanticVerification({summary:"POSIX path case"},posix).status,"needs_review");
  results.push({label:"actual semantic module preserves POSIX path case",status:"needs_review"});
}

main().catch(error => { console.error(error); process.exitCode=1; });

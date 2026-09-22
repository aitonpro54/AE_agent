"use strict";

const assert = require("assert");
const vm = require("vm");

const {
  prepareToolScript,
  requiredPositiveInteger,
  requiredPositiveIntegerList
} = require("../mcp-server/bridge-daemon");

class PropertyNode {
  constructor(name, matchName, value, children) {
    this.name = name;
    this.matchName = matchName || name;
    this.value = value;
    this.propertyValueType = 1;
    this.propertyType = children && children.length ? 2 : 1;
    this.propertyDepth = 1;
    this.canSetExpression = true;
    this.canVaryOverTime = true;
    this.expression = "";
    this.expressionEnabled = false;
    this.expressionError = "";
    this.enabled = true;
    this.selectedKeys = [];
    this.keys = [];
    this.writeLog = [];
    this.children = [];
    this.setChildren(children || []);
  }

  setChildren(children) {
    this.children = children;
    for (let index = 0; index < children.length; index += 1) {
      const child = children[index];
      child.parentProperty = this;
      child.propertyIndex = index + 1;
      child.propertyDepth = (this.propertyDepth || 0) + 1;
    }
    this.numProperties = children.length;
  }

  property(identity) {
    if (typeof identity === "number") return Number.isInteger(identity) ? this.children[identity - 1] || null : null;
    const text = String(identity);
    return this.children.find((child) => child.name === text || child.matchName === text) || null;
  }

  setValue(value) {
    this.writeLog.push({ method: "setValue", value });
    this.value = value;
  }

  setValueAtTime(time, value) {
    this.writeLog.push({ method: "setValueAtTime", time, value });
    const existing = this.keys.find((key) => key.time === time);
    if (existing) existing.value = value;
    else this.keys.push({ time, value });
    this.keys.sort((a, b) => a.time - b.time);
    this.value = value;
  }

  removeKey(index) {
    this.writeLog.push({ method: "removeKey", index });
    this.keys.splice(index - 1, 1);
  }

  keyTime(index) { return this.keys[index - 1].time; }
  keyValue(index) { return this.keys[index - 1].value; }
  keyInInterpolationType() { return "linear"; }
  keyOutInterpolationType() { return "linear"; }
  keyInSpatialTangent() { return [0, 0]; }
  keyOutSpatialTangent() { return [0, 0]; }
  valueAtTime() { return this.value; }

  get numKeys() { return this.keys.length; }
  get isTimeVarying() { return this.keys.length > 0; }
}

class Layer {
  constructor(index, name, properties) {
    this.index = index;
    this.id = 1000 + index;
    this.name = name;
    this.matchName = "ADBE AV Layer";
    this.enabled = true;
    this.locked = false;
    this.shy = false;
    this.solo = false;
    this.motionBlur = false;
    this.startTime = 0;
    this.inPoint = 0;
    this.outPoint = 10;
    this.propertyValueType = undefined;
    this.properties = [];
    this.setProperties(properties || []);
  }

  setProperties(properties) {
    this.properties = properties;
    for (let index = 0; index < properties.length; index += 1) {
      const property = properties[index];
      property.parentProperty = this;
      property.propertyIndex = index + 1;
      property.propertyDepth = 1;
    }
    this.numProperties = properties.length;
  }

  property(identity) {
    if (typeof identity === "number") return Number.isInteger(identity) ? this.properties[identity - 1] || null : null;
    const text = String(identity);
    return this.properties.find((property) => property.name === text || property.matchName === text) || null;
  }
}

class TextLayer extends Layer {}
class ShapeLayer extends Layer {}
class AVLayer extends Layer {}
class FootageItem {}
class FolderItem {}

class CompItem {
  constructor(name, layers) {
    this.id = 501;
    this.name = name;
    this.typeName = "Composition";
    this.layers = layers;
    this.numLayers = layers.length;
    this.time = 0;
    this.frameDuration = 1 / 30;
    this.frameRate = 30;
    this.duration = 10;
    this.workAreaStart = 0;
    this.workAreaDuration = 10;
  }

  layer(index) { return Number.isInteger(index) ? this.layers[index - 1] || null : null; }
}

function leaf(name, matchName, value) {
  return new PropertyNode(name, matchName, value, []);
}

function group(name, matchName, children) {
  return new PropertyNode(name, matchName, undefined, children);
}

function effectParade(effects) {
  return group("Effects", "ADBE Effect Parade", effects);
}

function makeFixture(layerProperties) {
  const layers = layerProperties.map((properties, index) => new Layer(index + 1, `Layer ${index + 1}`, properties));
  const comp = new CompItem("Identity Fixture", layers);
  const project = {
    activeItem: comp,
    numItems: 1,
    rootFolder: {},
    item(index) { return index === 1 ? comp : null; }
  };
  const undo = { begin: 0, end: 0 };
  const app = {
    project,
    beginUndoGroup() { undo.begin += 1; },
    endUndoGroup() { undo.end += 1; }
  };
  return { app, comp, layers, undo };
}

function vmContext(fixture) {
  return {
    app: fixture.app,
    CompItem,
    FootageItem,
    FolderItem,
    Layer,
    TextLayer,
    ShapeLayer,
    AVLayer,
    PropertyValueType: { NO_VALUE: 0, TwoD_SPATIAL: 2, ThreeD_SPATIAL: 3 },
    KeyframeInterpolationType: { LINEAR: "linear", BEZIER: "bezier", HOLD: "hold" },
    ParagraphJustification: { LEFT_JUSTIFY: 0, CENTER_JUSTIFY: 1, RIGHT_JUSTIFY: 2 },
    TrackMatteType: { NO_TRACK_MATTE: 0, ALPHA: 1, ALPHA_INVERTED: 2, LUMA: 3, LUMA_INVERTED: 4 },
    BlendingMode: { NORMAL: 0 }
  };
}

async function runTool(name, args, fixture) {
  const prepared = await prepareToolScript(name, args);
  assert.strictEqual(typeof prepared.script, "string", `${name} must expose the actual generated JSX.`);
  assert(prepared.script.includes("__codexResolveProperty"), `${name} must use the production property resolver.`);
  const raw = vm.runInNewContext(prepared.script, vmContext(fixture), { timeout: 2000 });
  assert.strictEqual(typeof raw, "string", `${name} VM result must be serialized by the production wrapper.`);
  return JSON.parse(raw);
}

function assertRejectedBeforeWrite(result, properties, message) {
  assert.strictEqual(result.ok, false, `${message}: generated JSX must reject the target.`);
  assert.match(String(result.error || ""), /ambiguous|conflict|identity|index|integer|not found|segment/i, `${message}: error must identify target resolution failure.`);
  for (const property of properties) {
    assert.strictEqual(property.writeLog.length, 0, `${message}: no property write may occur.`);
  }
}

const descriptor = (propertyIndex) => ({ name: "Fill", matchName: "ADBE Fill", propertyIndex });

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

test("ID01 ID06 ID07 indexed duplicate selects the exact second property", async () => {
  const first = leaf("Fill", "ADBE Fill", 10);
  const second = leaf("Fill", "ADBE Fill", 20);
  const neighbour = leaf("Neighbour", "ADBE Neighbour", 30);
  const fixture = makeFixture([[first, second, neighbour]]);
  const result = await runTool("set_property_value", {
    compItemIndex: 1,
    layerIndex: 1,
    propertyPath: [descriptor(2)],
    value: 22.5
  }, fixture);

  assert.strictEqual(result.ok, true);
  assert.strictEqual(first.value, 10, "First duplicate must be preserved.");
  assert.strictEqual(first.writeLog.length, 0, "First duplicate must not receive a write.");
  assert.strictEqual(second.value, 22.5, "Direct fixture read-back must identify the second duplicate.");
  assert.deepStrictEqual(second.writeLog, [{ method: "setValue", value: 22.5 }]);
  assert.strictEqual(neighbour.value, 30, "Neighbouring property must be preserved.");
  assert.strictEqual(neighbour.writeLog.length, 0);
  assert.strictEqual(result.result.property.propertyIndex, 2, "Serialized read-back must independently report property index 2.");
  assert.strictEqual(result.result.property.value.value, 22.5, "Serialized read-back must report the written value.");
});

test("ID02 conflicting stale descriptor is denied before write", async () => {
  const staleIndex = leaf("Tint", "ADBE Tint", 10);
  const movedFill = leaf("Fill", "ADBE Fill", 20);
  const fixture = makeFixture([[staleIndex, movedFill]]);
  const result = await runTool("set_property_value", {
    compItemIndex: 1,
    layerIndex: 1,
    propertyPath: [descriptor(1)],
    value: 99
  }, fixture);
  assertRejectedBeforeWrite(result, [staleIndex, movedFill], "stale descriptor");
  assert.strictEqual(staleIndex.value, 10);
  assert.strictEqual(movedFill.value, 20);
});

test("ID03 descriptor without index rejects ambiguous names before write", async () => {
  const first = leaf("Fill", "ADBE Fill", 10);
  const second = leaf("Fill", "ADBE Fill", 20);
  const fixture = makeFixture([[first, second]]);
  const result = await runTool("set_property_value", {
    compItemIndex: 1,
    layerIndex: 1,
    propertyPath: [{ name: "Fill", matchName: "ADBE Fill" }],
    value: 99
  }, fixture);
  assertRejectedBeforeWrite(result, [first, second], "ambiguous descriptor");

  const stringFirst = leaf("Fill", "ADBE Fill", 30);
  const stringSecond = leaf("Fill", "ADBE Fill", 40);
  const stringFixture = makeFixture([[stringFirst, stringSecond]]);
  const stringResult = await runTool("set_property_value", {
    compItemIndex: 1,
    layerIndex: 1,
    propertyPath: ["Fill"],
    value: 99
  }, stringFixture);
  assertRejectedBeforeWrite(stringResult, [stringFirst, stringSecond], "ambiguous string segment");
});

test("ID04 identity integers reject fractional NaN null zero and out-of-range targets", async () => {
  for (const value of [1.9, NaN, null, 0, -1]) {
    assert.throws(
      () => requiredPositiveInteger({ index: value }, "index"),
      /positive 1-based integer/i,
      `requiredPositiveInteger must reject ${String(value)}.`
    );
    assert.throws(
      () => requiredPositiveIntegerList({ indexes: [value] }, "indexes"),
      /positive 1-based integer/i,
      `requiredPositiveIntegerList must reject ${String(value)}.`
    );
  }

  for (const segment of [1.9, NaN, null, 0, 99]) {
    const target = leaf("Only", "ADBE Only", 10);
    const fixture = makeFixture([[target]]);
    const result = await runTool("set_property_value", {
      compItemIndex: 1,
      layerIndex: 1,
      propertyPath: [segment],
      value: 99
    }, fixture);
    assertRejectedBeforeWrite(result, [target], `invalid property path segment ${String(segment)}`);
    assert.strictEqual(target.value, 10);
  }
});

test("ID05 fractional property value and time remain valid on a unique path", async () => {
  const opacity = leaf("Opacity", "ADBE Opacity", 50);
  const neighbour = leaf("Rotation", "ADBE Rotate Z", 15);
  const fixture = makeFixture([[opacity, neighbour]]);
  const result = await runTool("set_property_value", {
    compItemIndex: 1,
    layerIndex: 1,
    propertyPath: ["Opacity"],
    value: 62.75,
    time: 1.25,
    setAtTime: true
  }, fixture);

  assert.strictEqual(result.ok, true);
  assert.deepStrictEqual(opacity.writeLog, [{ method: "setValueAtTime", time: 1.25, value: 62.75 }]);
  assert.deepStrictEqual(opacity.keys, [{ time: 1.25, value: 62.75 }]);
  assert.strictEqual(neighbour.value, 15);
  assert.strictEqual(neighbour.writeLog.length, 0);
  assert.strictEqual(result.result.time, 1.25);
});

test("ID02 ID06 bulk set_property_value preflights every target before the first write", async () => {
  const firstTarget = leaf("Fill", "ADBE Fill", 10);
  const firstNeighbour = leaf("Neighbour", "ADBE Neighbour", 11);
  const staleSecond = leaf("Tint", "ADBE Tint", 20);
  const fixture = makeFixture([[firstTarget, firstNeighbour], [staleSecond]]);
  const result = await runTool("set_property_value", {
    compItemIndex: 1,
    layerIndex: [1, 2],
    propertyPath: [descriptor(1)],
    value: 99
  }, fixture);

  assertRejectedBeforeWrite(result, [firstTarget, firstNeighbour, staleSecond], "bulk second target conflict");
  assert.strictEqual(firstTarget.value, 10, "First bulk target must remain unchanged when a later preflight fails.");
  assert.strictEqual(firstNeighbour.value, 11);
  assert.strictEqual(staleSecond.value, 20);

  const attributeFixture = makeFixture([[leaf("One", "ADBE One", 1)], [leaf("Two", "ADBE Two", 2)]]);
  attributeFixture.layers[1].locked = true;
  const attributeResult = await runTool("set_property_value", {
    compItemIndex: 1,
    layerIndex: [1, 2],
    propertyPath: ["motionBlur"],
    value: true
  }, attributeFixture);
  assert.strictEqual(attributeResult.ok, false, "Locked second attribute target must fail the bulk operation.");
  assert.strictEqual(attributeFixture.layers[0].motionBlur, false, "Attribute preflight must preserve the first target.");
  assert.strictEqual(attributeFixture.layers[1].motionBlur, false, "Locked target must stay unchanged.");
});

test("ID07 set_property_keyframes uses the same exact property identity", async () => {
  const first = leaf("Fill", "ADBE Fill", 10);
  const second = leaf("Fill", "ADBE Fill", 20);
  const fixture = makeFixture([[first, second]]);
  const result = await runTool("set_property_keyframes", {
    compItemIndex: 1,
    layerIndex: 1,
    propertyPath: [descriptor(2)],
    keyframes: [{ time: 0.375, value: 20.5 }]
  }, fixture);

  assert.strictEqual(result.ok, true);
  assert.strictEqual(first.writeLog.length, 0);
  assert.deepStrictEqual(second.writeLog, [{ method: "setValueAtTime", time: 0.375, value: 20.5 }]);
  assert.deepStrictEqual(second.keys, [{ time: 0.375, value: 20.5 }]);
  assert.strictEqual(result.result.property.propertyIndex, 2);
});

test("ID07 set_expression uses the same exact property identity", async () => {
  const first = leaf("Fill", "ADBE Fill", 10);
  const second = leaf("Fill", "ADBE Fill", 20);
  const fixture = makeFixture([[first, second]]);
  const result = await runTool("set_expression", {
    compItemIndex: 1,
    layerIndex: 1,
    propertyPath: [descriptor(2)],
    expression: "time * 2",
    enabled: true
  }, fixture);

  assert.strictEqual(result.ok, true);
  assert.strictEqual(first.expression, "");
  assert.strictEqual(second.expression, "time * 2");
  assert.strictEqual(second.expressionEnabled, true);
  assert.strictEqual(result.result.property.propertyIndex, 2);
});

test("ID02 composite property index aliases cannot disagree", async () => {
  const first = leaf("Fill", "ADBE Fill", 10);
  const second = leaf("Fill", "ADBE Fill", 20);
  const fixture = makeFixture([[first, second]]);
  const result = await runTool("set_property_value", {
    compItemIndex: 1,
    layerIndex: 1,
    propertyPath: [{ name: "Fill", matchName: "ADBE Fill", propertyIndex: 1, index: 2 }],
    value: 99
  }, fixture);
  assertRejectedBeforeWrite(result, [first, second], "conflicting propertyIndex/index aliases");
});

test("ID01 ID06 set_effect_property selects the exact second duplicate effect", async () => {
  const firstColor = leaf("Color", "ADBE Fill-0002", 0.1);
  const secondColor = leaf("Color", "ADBE Fill-0002", 0.2);
  const neighbourValue = leaf("Amount", "ADBE Tint-0001", 0.3);
  const firstFill = group("Fill", "ADBE Fill", [firstColor]);
  const secondFill = group("Fill", "ADBE Fill", [secondColor]);
  const neighbour = group("Tint", "ADBE Tint", [neighbourValue]);
  const fixture = makeFixture([[effectParade([firstFill, secondFill, neighbour])]]);
  const result = await runTool("set_effect_property", {
    compItemIndex: 1,
    layerIndex: 1,
    effectIndex: 2,
    effectName: "Fill",
    effectMatchName: "ADBE Fill",
    propertyIndex: 1,
    propertyName: "Color",
    propertyMatchName: "ADBE Fill-0002",
    value: 0.75
  }, fixture);

  assert.strictEqual(result.ok, true);
  assert.strictEqual(firstColor.value, 0.1);
  assert.strictEqual(firstColor.writeLog.length, 0);
  assert.strictEqual(secondColor.value, 0.75);
  assert.deepStrictEqual(secondColor.writeLog, [{ method: "setValue", value: 0.75 }]);
  assert.strictEqual(neighbourValue.value, 0.3);
  assert.strictEqual(neighbourValue.writeLog.length, 0);
  assert.strictEqual(result.result.effect.propertyIndex, 2);
  assert.strictEqual(result.result.property.propertyIndex, 1);
});

test("ID02 set_effect_property rejects stale indexed effect identity before write", async () => {
  const tintValue = leaf("Amount", "ADBE Tint-0001", 0.1);
  const fillValue = leaf("Color", "ADBE Fill-0002", 0.2);
  const tint = group("Tint", "ADBE Tint", [tintValue]);
  const fill = group("Fill", "ADBE Fill", [fillValue]);
  const fixture = makeFixture([[effectParade([tint, fill])]]);
  const result = await runTool("set_effect_property", {
    compItemIndex: 1,
    layerIndex: 1,
    effectIndex: 1,
    effectName: "Fill",
    effectMatchName: "ADBE Fill",
    propertyIndex: 1,
    value: 0.9
  }, fixture);
  assertRejectedBeforeWrite(result, [tintValue, fillValue], "stale indexed effect identity");
  assert.strictEqual(tintValue.value, 0.1);
  assert.strictEqual(fillValue.value, 0.2);
});

test("ID02 set_effect_property rejects conflicting indexed property identity before write", async () => {
  const amount = leaf("Amount", "ADBE Fill-0001", 0.1);
  const color = leaf("Color", "ADBE Fill-0002", 0.2);
  const fill = group("Fill", "ADBE Fill", [amount, color]);
  const fixture = makeFixture([[effectParade([fill])]]);
  const result = await runTool("set_effect_property", {
    compItemIndex: 1,
    layerIndex: 1,
    effectIndex: 1,
    effectName: "Fill",
    effectMatchName: "ADBE Fill",
    propertyIndex: 1,
    propertyName: "Color",
    propertyMatchName: "ADBE Fill-0002",
    value: 0.9
  }, fixture);
  assertRejectedBeforeWrite(result, [amount, color], "conflicting indexed effect property identity");
  assert.strictEqual(amount.value, 0.1);
  assert.strictEqual(color.value, 0.2);
});

test("ID07 get_effect_details reads the exact duplicate and rejects an indexed conflict", async () => {
  const firstColor = leaf("Color", "ADBE Fill-0002", 0.1);
  const secondColor = leaf("Color", "ADBE Fill-0002", 0.2);
  const firstFill = group("Fill", "ADBE Fill", [firstColor]);
  const secondFill = group("Fill", "ADBE Fill", [secondColor]);
  const fixture = makeFixture([[effectParade([firstFill, secondFill])]]);
  const exact = await runTool("get_effect_details", {
    compItemIndex: 1,
    layerIndex: 1,
    effectIndex: 2,
    effectName: "Fill",
    effectMatchName: "ADBE Fill",
    includeProperties: true,
    propertyDepth: 1,
    includeValues: true
  }, fixture);
  assert.strictEqual(exact.ok, true);
  assert.strictEqual(exact.result.effect.propertyIndex, 2);
  assert.strictEqual(exact.result.properties[0].value.value, 0.2);
  assert.strictEqual(firstColor.writeLog.length, 0);
  assert.strictEqual(secondColor.writeLog.length, 0);

  const conflict = await runTool("get_effect_details", {
    compItemIndex: 1,
    layerIndex: 1,
    effectIndex: 1,
    effectName: "Tint",
    effectMatchName: "ADBE Tint"
  }, fixture);
  assert.strictEqual(conflict.ok, false);
  assert.match(String(conflict.error || ""), /identity|mismatch|conflict/i);
  assert.strictEqual(firstColor.writeLog.length, 0);
  assert.strictEqual(secondColor.writeLog.length, 0);
});

async function main() {
  const failures = [];
  const passed = [];
  for (const entry of tests) {
    try {
      await entry.fn();
      passed.push(entry.name);
    } catch (error) {
      failures.push({ name: entry.name, error: error && error.stack || String(error) });
    }
  }

  const report = { ok: failures.length === 0, passed, failures };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (failures.length) process.exitCode = 1;
}

main().catch((error) => {
  process.stderr.write(`${error && error.stack || error}\n`);
  process.exitCode = 1;
});

"use strict";

const vm = require("vm");

class LeafProperty {
  constructor(name, keys = [], options = {}) {
    this.name = name;
    this.matchName = options.matchName || name;
    this.propertyIndex = options.propertyIndex || 1;
    this.keys = keys.map((row) => ({...row}));
    this.numProperties = 0;
    this.canVaryOverTime = options.canVaryOverTime !== false;
    this.propertyValueType = options.propertyValueType === undefined ? 1 : options.propertyValueType;
    this.canSetExpression = options.canSetExpression === true;
    this.expression = options.expression || "";
    this.expressionEnabled = this.canSetExpression && Boolean(this.expression);
    this.expressionError = options.expressionError || "";
    this.isSpatial = options.isSpatial !== false;
    this.value = options.value === undefined ? [100, 100] : options.value;
    this.simulateNeighborRecalc = false;
  }
  get numKeys() { return this.keys.length; }
  keyTime(i) { return this.keys[i - 1].time; }
  keyValue(i) { return this.keys[i - 1].value; }
  keyInInterpolationType(i) { return this.keys[i - 1].inType; }
  keyOutInterpolationType(i) { return this.keys[i - 1].outType; }
  keyInTemporalEase(i) { return this.keys[i - 1].inEase || []; }
  keyOutTemporalEase(i) { return this.keys[i - 1].outEase || []; }
  keyTemporalContinuous(i) { return Boolean(this.keys[i - 1].temporalContinuous); }
  keyTemporalAutoBezier(i) { return Boolean(this.keys[i - 1].temporalAutoBezier); }
  keyInSpatialTangent(i) { return this.keys[i - 1].inSpatial || [0, 0]; }
  keyOutSpatialTangent(i) { return this.keys[i - 1].outSpatial || [0, 0]; }
  keyRoving(i) { return Boolean(this.keys[i - 1].roving); }
  keySpatialContinuous(i) { return Boolean(this.keys[i - 1].spatialContinuous); }
  keySpatialAutoBezier(i) { return Boolean(this.keys[i - 1].spatialAutoBezier); }
  removeKey(i) { this.keys.splice(i - 1, 1); }
  setValueAtTime(time, value) {
    this.keys.push({time, value, inType: "LINEAR", outType: "LINEAR", inEase: [], outEase: []});
    this.keys.sort((a, b) => a.time - b.time);
  }
  nearestKeyIndex(time) { return this.keys.findIndex((row) => Math.abs(row.time - time) < 1e-6) + 1; }
  setInterpolationTypeAtKey(i, a, b) { this.keys[i - 1].inType = a; this.keys[i - 1].outType = b; }
  setTemporalEaseAtKey(i, a, b) { this.keys[i - 1].inEase = a; this.keys[i - 1].outEase = b; }
  setTemporalContinuousAtKey(i, value) { this.keys[i - 1].temporalContinuous = value; }
  setTemporalAutoBezierAtKey(i, value) { this.keys[i - 1].temporalAutoBezier = value; }
  setSpatialTangentsAtKey(i, a, b) { this.keys[i - 1].inSpatial = a; this.keys[i - 1].outSpatial = b; }
  setRovingAtKey(i, value) { this.keys[i - 1].roving = value; }
  setSpatialContinuousAtKey(i, value) { this.keys[i - 1].spatialContinuous = value; }
  setSpatialAutoBezierAtKey(i, value) { this.keys[i - 1].spatialAutoBezier = value; }
  setValue(value) { this.value = value; }
}

class Group {
  constructor(map = {}, name = "Group", matchName = "ADBE Group") {
    this.name = name;
    this.matchName = matchName;
    this.propertyIndex = 1;
    this.map = map;
    this.list = Object.values(map);
    this.list.forEach((property, index) => { property.propertyIndex = index + 1; });
    this.numProperties = this.list.length;
  }
  property(key) { return typeof key === "number" ? this.list[key - 1] : this.map[key] || null; }
}

class FootageItem {
  constructor(name, file, duration = 4, options = {}) {
    this.name = name;
    this.file = {fsName: file};
    this.duration = duration;
    this.width = 320;
    this.height = 180;
    this.hasAudio = options.hasAudio !== false;
    this.hasVideo = options.hasVideo !== false;
    this.frameDuration = options.frameDuration === undefined ? 1 / 30 : options.frameDuration;
    this.mainSource = {isStill: options.isStill === true};
  }
}

class AVLayer {
  constructor(name, source = null, props = []) {
    this.name = name;
    this.source = source;
    this.props = props;
    this.props.forEach((property, index) => { property.propertyIndex = index + 1; });
    this.numProperties = props.length;
    this.startTime = 0;
    this.inPoint = 0;
    this.outPoint = source && source.duration || 4;
    this.stretch = 100;
    this.timeRemapEnabled = false;
    this.motionBlur = false;
    this.enabled = true;
    this.audioEnabled = true;
    this.locked = false;
    this.comment = "";
    this.guideLayer = false;
    this.adjustmentLayer = false;
    this.threeDLayer = false;
    this.collapseTransformation = false;
    this.effectGroup = new Group({}, "Effects", "ADBE Effect Parade");
    const scale = new LeafProperty("Scale", [], {matchName: "ADBE Scale"});
    const position = new LeafProperty("Position", [], {matchName: "ADBE Position", value: [0, 0]});
    this.transform = new Group({"ADBE Scale": scale, "ADBE Position": position, "ADBE Opacity": new LeafProperty("Opacity", [], {matchName: "ADBE Opacity"})}, "Transform", "ADBE Transform Group");
  }
  get hasAudio() {
    if (this.source instanceof CompItem) return this.source.containsAudio();
    return Boolean(this.source && this.source.hasAudio);
  }
  property(key) {
    if (typeof key === "number") return this.props[key - 1];
    if (key === "ADBE Effect Parade") return this.effectGroup;
    if (key === "ADBE Transform Group") return this.transform;
    if (key === "ADBE Text Properties") return null;
    return null;
  }
  get index() { return this.comp ? this.comp.layers.indexOf(this) + 1 : null; }
  replaceSource(source) { this.source = source; }
  duplicate() { return this.comp.insertLayer(this.clone(), 0); }
  clone() {
    const copy = new AVLayer(this.name, this.source, this.props.map((property) => new LeafProperty(property.name, property.keys, property)));
    for (const key of ["startTime", "inPoint", "outPoint", "stretch", "timeRemapEnabled", "motionBlur", "enabled", "audioEnabled", "comment"]) copy[key] = this[key];
    copy.effectGroup = this.effectGroup;
    return copy;
  }
  copyToComp(comp) { comp.insertLayer(this.clone(), comp.numLayers ? 1 : 0); }
}

class ShapeLayer extends AVLayer {}

class CompItem {
  constructor(project, name, width = 1280, height = 720, pixelAspect = 1, duration = 4, frameRate = 30) {
    this.project = project;
    this.name = name;
    this.width = width;
    this.height = height;
    this.pixelAspect = pixelAspect;
    this.duration = duration;
    this.frameRate = frameRate;
    this.frameDuration = 1 / frameRate;
    this.comment = "";
    this.motionBlur = false;
    this.shutterAngle = 0;
    const layers = [];
    layers.add = (source) => this.insertLayer(new AVLayer(source.name, source), 0);
    this.layers = layers;
  }
  get numLayers() { return this.layers.length; }
  layer(i) { return this.layers[i - 1]; }
  insertLayer(layer, index) { layer.comp = this; layer.id = this.project.nextLayerId++; this.layers.splice(index, 0, layer); return layer; }
  addLayer(layer) { return this.insertLayer(layer, this.layers.length); }
  containsAudio(seen = {}) {
    if (seen[this.id]) return false;
    seen[this.id] = true;
    return this.layers.some((layer) => layer.hasAudio || (layer.source instanceof CompItem && layer.source.containsAudio(seen)));
  }
}

class Project {
  constructor(file) {
    this.file = {fsName: file};
    this._items = [];
    this.nextId = 1;
    this.nextLayerId = 1000;
    this.items = {addComp: (...args) => this.addComp(...args)};
  }
  get numItems() { return this._items.length; }
  item(i) { return this._items[i - 1]; }
  add(item) { item.id = this.nextId++; this._items.push(item); return item; }
  addComp(name, width, height, pixelAspect, duration, frameRate) { return this.add(new CompItem(this, name, width, height, pixelAspect, duration, frameRate)); }
  importFile() { throw new Error("unexpected import"); }
}

function context(project) {
  return {
    app: {project, beginUndoGroup() {}, endUndoGroup() {}},
    CompItem,
    FootageItem,
    AVLayer,
    ShapeLayer,
    PropertyValueType: {MARKER: 99, CUSTOM_VALUE: 98, NO_VALUE: 97},
    File: function File(path) { this.fsName = path; this.exists = true; },
    ImportOptions: function ImportOptions(file) { this.file = file; },
    ParagraphJustification: {CENTER_JUSTIFY: 1}
  };
}

function runPrepared(prepared, project) {
  return vm.runInNewContext(`(function(){${prepared.script}})()`, context(project), {timeout: 3000});
}

function owned(comp, prefix, rootName) {
  comp.comment = `AE_AGENT_SLIDESHOW:${prefix}:${rootName}`;
  return comp;
}

function key(time, value) {
  return {time, value, inType: "LINEAR", outType: "LINEAR", inEase: [], outEase: [], temporalContinuous: false, temporalAutoBezier: false, inSpatial: [0, 0], outSpatial: [0, 0], roving: false, spatialContinuous: false, spatialAutoBezier: false};
}

module.exports = {AVLayer, CompItem, FootageItem, Group, LeafProperty, Project, ShapeLayer, key, owned, runPrepared};

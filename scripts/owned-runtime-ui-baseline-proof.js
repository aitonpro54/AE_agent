"use strict";
// VM mocks only. No AE/CEP/native authority, project reopen, build or live proof.
const assert = require("node:assert/strict");
const vm = require("node:vm");
const baseline = require("../mcp-server/owned-runtime-ui-baseline");
const sourceFile = "C:\\owned-fixture\\source.aep";
const clone = value => JSON.parse(JSON.stringify(value));
let checks = 0;
function check(run) { run(); checks++; }
function freeze(value) {
  if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
function host(offset = 0, options = {}) {
  const state = {writes: 0, viewerCalls: 0, activationCalls: 0, selectionOverride: null, layerSelectionOverride: null};
  const ViewerType = {VIEWER_COMPOSITION: 1, VIEWER_FOOTAGE: 2, VIEWER_LAYER: 3};
  let project;
  class Viewer {
    constructor(item, type) { this.item = item; this.type = type; }
    setActive() {
      state.activationCalls++;
      if (options.activationThrows) throw Error("fixture_activation_throw");
      if (options.activationReturnsFalse) return false;
      if (!options.activationNoEffect) { project.activeItem = this.item; context.app.activeViewer = this; }
      if (options.afterActivation) options.afterActivation(context, state);
      return true;
    }
  }
  class Item {
    constructor(id, name) { this.id = id + offset; this.name = name; this._selected = false; }
    get selected() { return this._selected; }
    set selected(value) { state.writes++; if (!options.ignoreItemSelection) this._selected = value; }
  }
  class CompItem extends Item {
    constructor(id, name, layers, time) {
      super(id, name); this.layers = layers; this._time = time;
      layers.forEach((layer, index) => { layer.index = index + 1; });
    }
    get numLayers() { return this.layers.length; }
    get time() { return this._time; }
    set time(value) { state.writes++; this._time = options.roundTime ? Math.round(value) : value; }
    layer(index) { return this.layers[index - 1]; }
    get selectedLayers() { return state.layerSelectionOverride || this.layers.filter(layer => layer.selected).reverse(); }
    openInViewer() {
      state.viewerCalls++;
      if (options.viewerThrows) throw Error("fixture_viewer_throw");
      if (options.viewerMissing) return null;
      const viewer = new Viewer(this, ViewerType.VIEWER_COMPOSITION);
      if (options.setActiveMissing) viewer.setActive = undefined;
      return viewer;
    }
  }
  class FootageItem extends Item {
    openInViewer() { state.viewerCalls++; return new Viewer(this, ViewerType.VIEWER_FOOTAGE); }
  }
  class FolderItem extends Item {}
  class AVLayer extends Item {}
  class TextLayer extends AVLayer {}
  class ShapeLayer extends AVLayer {}
  class CameraLayer extends Item {}
  class LightLayer extends Item {}
  const items = [new FolderItem(1, "folder"), new CompItem(2, "same name", [new TextLayer(10, "same"), new ShapeLayer(11, "same")], 1 / 3),
    new FootageItem(3, "footage"), new CompItem(4, "same name", [new CameraLayer(12, "camera"), new LightLayer(13, "light"), new AVLayer(14, "AV")], 1.2345678901234567)];
  items[0]._selected = true; items[3]._selected = true;
  items[1].layers[0]._selected = true; items[3].layers[0]._selected = true; items[3].layers[2]._selected = true;
  project = {file: {fsName: sourceFile}, dirty: false, items, activeItem: items[1],
    get numItems() { return this.items.length; }, item(index) { return this.items[index - 1]; },
    get selection() { return state.selectionOverride || this.items.filter(item => item.selected).reverse(); }};
  const context = {app: {project, activeViewer: new Viewer(items[1], ViewerType.VIEWER_COMPOSITION)}, ViewerType,
    CompItem, FootageItem, FolderItem, AVLayer, TextLayer, ShapeLayer, CameraLayer, LightLayer};
  vm.createContext(context);
  for (const [name, fn] of Object.entries(baseline)) vm.runInContext("this." + name + "=(" + fn.toString() + ");", context);
  return {context, project, items, state};
}
function capture(fixture) { return fixture.context.captureUiBaseline(); }
function restore(fixture, original, expected = sourceFile) { return fixture.context.restoreUiBaseline(original, expected); }
function rejected(run, pattern = /owned_ui_/) { check(() => assert.throws(run, pattern)); }
function rejectBeforeEffects(fixture, original, expected, pattern) {
  rejected(() => restore(fixture, original, expected), pattern);
  check(() => assert.equal(fixture.state.writes + fixture.state.viewerCalls + fixture.state.activationCalls, 0));
}
function original() { return capture(host()); }
function disturb(fixture) {
  fixture.items.forEach(item => { item._selected = false; if (item.layers) { item._time = 0; item.layers.forEach(layer => { layer._selected = false; }); } });
  fixture.project.activeItem = fixture.items[2]; fixture.context.app.activeViewer.type = fixture.context.ViewerType.VIEWER_FOOTAGE;
}
function main() {
  const immutable = freeze(original()), pristine = JSON.stringify(immutable), fixture = host(100);
  disturb(fixture);
  const result = restore(fixture, immutable);
  check(() => assert.deepEqual(Object.keys(result), ["before", "after", "projectItemIdMap", "layerIdMap"]));
  check(() => assert.deepEqual(Object.keys(result.after), ["schema", "projectFile", "dirty", "activeItem", "viewerKind", "projectSelectionIds", "items", "comps"]));
  check(() => assert.equal(result.before.activeItem.id, 103));
  check(() => assert.equal(result.after.activeItem.id, 102));
  check(() => assert.deepEqual(clone(result.projectItemIdMap), [1, 2, 3, 4].map(id => ({originalId: id, reopenedId: id + 100}))));
  check(() => assert.deepEqual(clone(result.layerIdMap), [[2, 10], [2, 11], [4, 12], [4, 13], [4, 14]].map(([comp, id]) =>
    ({originalCompId: comp, reopenedCompId: comp + 100, originalId: id, reopenedId: id + 100}))));
  check(() => assert.deepEqual(clone(result.after.comps.map(comp => comp.time)), ["0.33333333333333331", "1.2345678901234567"]));
  check(() => assert.deepEqual(clone(result.after.comps.map(comp => comp.selectedLayerIds)), [[110], [114, 112]]));
  check(() => assert.deepEqual(clone(result.after.projectSelectionIds), [104, 101]));
  check(() => assert.equal(JSON.stringify(immutable), pristine));
  check(() => assert.equal(fixture.state.viewerCalls, 1));
  check(() => assert.equal(fixture.state.activationCalls, 1));
  check(() => assert.equal(baseline.supportedOperand(immutable), true));
  const footage = host(); footage.project.activeItem = footage.items[2]; footage.context.app.activeViewer.type = footage.context.ViewerType.VIEWER_FOOTAGE;
  const footageOriginal = capture(footage), footageReopened = host(200); disturb(footageReopened);
  check(() => assert.equal(restore(footageReopened, footageOriginal).after.activeItem.id, 203));
  // Capability facts are captured without action trials, and pure supported
  // validation cannot invent them from a kind or a caller-supplied path.
  for (const field of ["openInViewerAvailable", "viewerSetActiveAvailable"]) {
    const value = clone(immutable); value.activeItem[field] = false;
    check(() => assert.equal(baseline.supportedOperand(value), false));
    rejectBeforeEffects(host(100), value);
    delete value.activeItem[field]; rejected(() => baseline.supportedOperand(value));
    value.activeItem[field] = "true"; rejected(() => baseline.supportedOperand(value));
  }
  for (const mutate of [f => { f.items[1].openInViewer = undefined; }, f => { f.context.app.activeViewer.setActive = undefined; }]) {
    const f = host(); mutate(f); const value = capture(f);
    check(() => assert.equal(baseline.supportedOperand(value), false));
    check(() => assert.equal(f.state.writes + f.state.viewerCalls + f.state.activationCalls, 0));
  }
  for (const mutate of [v => { v.activeItem = null; }, v => { v.activeItem.kind = "folder"; v.activeItem.id = 1; },
    v => { v.viewerKind = "layer"; }, v => { v.viewerKind = "none"; }, v => { v.viewerKind = "footage"; }]) {
    const value = clone(immutable); mutate(value);
    check(() => assert.equal(baseline.supportedOperand(value), false)); rejectBeforeEffects(host(100), value);
  }
  for (const mutate of [
    v => { v.extra = true; }, v => { delete v.comps; }, v => { v.dirty = "false"; }, v => { v.dirty = true; },
    v => { v.schema += "x"; }, v => { v.projectFile = 42; }, v => { v.activeItem.id = "2"; }, v => { v.activeItem.id = 999; },
    v => { v.items[1].id = v.items[0].id; }, v => { v.items[1].index = 1; }, v => { v.items[1].name = {}; },
    v => { v.comps.pop(); }, v => { v.comps[1].id = v.comps[0].id; }, v => { v.comps.reverse(); },
    v => { v.comps[0].numLayers = "2"; }, v => { v.comps[0].numLayers++; }, v => { v.comps[0].layers.pop(); },
    v => { v.comps[1].layers[0].id = v.comps[0].layers[0].id; }, v => { v.comps[0].layers[0].selected = 1; },
    v => { v.comps[0].layers[0].kind = "unknown"; }, v => { v.comps[0].layers[0].index = 2; },
    v => { v.comps[0].selectedLayerIds.push(10); }, v => { v.comps[0].selectedLayerIds.push(12); },
    v => { v.comps[0].selectedLayerIds = []; }, v => { v.comps[0].selectedLayerIds = [11]; },
    v => { v.projectSelectionIds.push(1); }, v => { v.projectSelectionIds.push(999); },
    v => { v.comps[0].time = "0.333333"; }, v => { v.comps[0].time = "NaN"; }, v => { v.comps[0].time = "Infinity"; },
    v => { v.comps[0].time = "-0.0000000000000000"; }, v => { v.comps[0].time = 1 / 3; }
  ]) { const value = clone(immutable); mutate(value); rejectBeforeEffects(host(100), value); }
  for (const mutate of [
    f => { f.project.dirty = true; }, f => { f.project.dirty = 0; }, f => { f.project.file.fsName = "C:\\foreign.aep"; },
    f => { f.items.pop(); }, f => { f.items[1].id = f.items[0].id; }, f => { f.items[1].name = "foreign"; },
    f => { f.items[1].layers[0].name = "foreign"; }, f => { f.items[1].layers[0].id = f.items[3].layers[0].id; },
    f => { f.items[1].layers.pop(); }, f => { f.items[1].layers[0] = new f.context.AVLayer(77, "same"); f.items[1].layers[0].index = 1; },
    f => { f.items[1]._time = NaN; }, f => { f.items[1]._time = Infinity; }, f => { f.items[1]._time = -0; },
    f => { f.state.selectionOverride = [new f.context.FolderItem(1, "folder")]; },
    f => { f.state.selectionOverride = [f.items[0], f.items[0]]; }, f => { f.state.selectionOverride = []; },
    f => { f.state.layerSelectionOverride = [new f.context.TextLayer(10, "same")]; },
    f => { f.state.layerSelectionOverride = [f.items[1].layers[0], f.items[1].layers[0]]; },
    f => { f.state.layerSelectionOverride = []; }, f => { f.project.activeItem = new f.context.CompItem(2, "same name", [], 0); }
  ]) { const f = host(100); mutate(f); rejectBeforeEffects(f, immutable); }
  rejectBeforeEffects(host(100), immutable, "C:\\caller-retarget.aep");
  rejectBeforeEffects(host(100), immutable, {toString: () => sourceFile});
  const noMethod = host(100); noMethod.items[1].openInViewer = undefined; rejectBeforeEffects(noMethod, immutable);
  // Bounds charge every original/reopened layer, including non-target comps.
  const itemOverflow = host(); while (itemOverflow.items.length <= 1000) itemOverflow.items.push(new itemOverflow.context.FolderItem(2000 + itemOverflow.items.length, "folder"));
  rejected(() => capture(itemOverflow));
  itemOverflow.items.pop(); check(() => assert.equal(capture(itemOverflow).items.length, 1000));
  const originalItemsOverflow = clone(immutable); originalItemsOverflow.items.length = 1001;
  rejectBeforeEffects(host(100), originalItemsOverflow);
  const layersAtLimit = host();
  while (layersAtLimit.items[3].layers.length < 998) {
    const layer = new layersAtLimit.context.AVLayer(2000 + layersAtLimit.items[3].layers.length, "AV");
    layer.index = layersAtLimit.items[3].layers.length + 1; layersAtLimit.items[3].layers.push(layer);
  }
  check(() => assert.equal(capture(layersAtLimit).comps.reduce((sum, comp) => sum + comp.numLayers, 0), 1000));
  const extra = new layersAtLimit.context.AVLayer(5000, "AV"); extra.index = 999; layersAtLimit.items[3].layers.push(extra);
  rejected(() => capture(layersAtLimit));
  const originalLayersOverflow = clone(capture(host()));
  while (originalLayersOverflow.comps[1].layers.length < 999) {
    const index = originalLayersOverflow.comps[1].layers.length + 1;
    originalLayersOverflow.comps[1].layers.push({index, id: 6000 + index, name: "AV", kind: "av", selected: false});
  }
  originalLayersOverflow.comps[1].numLayers = 999;
  rejectBeforeEffects(host(100), originalLayersOverflow);
  for (const options of [{viewerMissing: true}, {viewerThrows: true}, {setActiveMissing: true}, {activationReturnsFalse: true},
    {activationThrows: true}, {activationNoEffect: true}, {roundTime: true}, {ignoreItemSelection: true},
    {afterActivation: context => { context.app.project.items[3].layers[2]._selected = false; }},
    {afterActivation: context => { context.app.project.items[3].name = "drift"; }},
    {afterActivation: context => { context.app.project.items[3].layers[2].id = 9914; }},
    {afterActivation: context => { context.app.project.file.fsName = "C:\\foreign.aep"; }},
    {afterActivation: context => { context.app.project.dirty = true; }},
    {afterActivation: context => { context.app.project.items[1].openInViewer = undefined; }},
    {afterActivation: context => { context.app.activeViewer.type = context.ViewerType.VIEWER_LAYER; }}]) {
    const f = host(100, options); disturb(f); rejected(() => restore(f, immutable), /owned_ui_|fixture_/);
    check(() => assert.equal(JSON.stringify(immutable), pristine));
  }
  // Existing selection array order differs from original and still represents
  // the same exact selected sets. Times retain all binary64 precision.
  for (const value of [0, Number.MIN_VALUE, -Number.MIN_VALUE, 1e100, -12.345678901234567]) {
    const initial = host(); initial.items[1]._time = value;
    const saved = capture(initial), reopened = host(100); disturb(reopened);
    check(() => assert.equal(restore(reopened, saved).after.comps[0].time, value.toPrecision(17)));
  }
  for (const fn of Object.values(baseline)) {
    check(() => assert.doesNotMatch(fn.toString(), /\b(?:const|let|require|module|process)\b|=>|app\.(?:open|newProject)|\.save\s*\(/));
  }
  console.log("PASS " + checks + " UI baseline VM checks: complete bounded census, ID remap, immutable original, exact time/selected/viewer read-back and closed drift/unsupported cases. Offline mocks only; no live proof.");
}
main();

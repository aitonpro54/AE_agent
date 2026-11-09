'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { capacityFootage } = require('./media-layer-host');

const PropertyValueType = { OneD: 1, TwoD: 2, TwoD_SPATIAL: 3, COLOR: 4, SHAPE: 5, LAYER_INDEX: 6, CUSTOM_VALUE: 7, ThreeD: 8, ThreeD_SPATIAL: 9 };
const group = (entries = []) => ({ propertyType: 2, numProperties: entries.length,
  property(key) { return typeof key === 'number' ? entries[key - 1] : entries.find(item => item.matchName === key); } });
const leaf = (matchName, propertyValueType, value) => ({
  matchName, value, propertyType: 1, propertyValueType, numKeys: 0, canSetExpression: true, expressionEnabled: false, expression: ''
});
const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j2XcAAAAASUVORK5CYII=', 'base64');

function overlayEnvironment(state) {
  let next = 20;
  class FootageItem {
    constructor(name, hasAlpha = false) {
      const fsName = path.join(state.fixtureDirectory, name);
      fs.writeFileSync(fsName, name);
      const stats = fs.statSync(fsName);
      Object.assign(this, { id: ++next, width: 1920, height: 1080, pixelAspect: 1, useProxy: false,
        footageMissing: false, hasVideo: true, hasAudio: false, mainSource: { isStill: true, hasAlpha, alphaMode: 2, invertAlpha: false },
        file: { fsName, exists: true, alias: false, length: stats.size, modified: stats.mtime } });
    }
  }
  class CompItem {
    constructor(name) {
      Object.assign(this, { id: ++next, name, width: 1920, height: 1080, pixelAspect: 1, duration: 5,
        frameDuration: 1 / 25, displayStartTime: 0, time: 0, resolutionFactor: [1, 1], stack: [] });
    }
    get numLayers() { return this.stack.length; }
    layer(index) { return this.stack[index - 1]; }
    saveFrameToPng(time, file) {
      fs.writeFileSync(file.fsName, state.flags.truncatedPng ? pixel.subarray(0, -12) : pixel, { flag: 'wx' });
    }
  }
  const { OneD, TwoD, TwoD_SPATIAL, COLOR, SHAPE, ThreeD, ThreeD_SPATIAL } = PropertyValueType;
  const native = state.flags.nativeTransformComponents;
  const spatial = native ? ThreeD_SPATIAL : TwoD_SPATIAL;
  const point = (x, y) => native ? [x, y, 0] : [x, y];
  const position = leaf('ADBE Position', spatial, point(100, 120));
  const ease = () => [{ speed: 0, influence: 33 }];
  Object.assign(position, { numKeys: 2, keyTime: i => i - 1, keyValue: i => point(100 * i, 120),
    keyInInterpolationType: () => 1, keyOutInterpolationType: () => 1, keyInTemporalEase: ease, keyOutTemporalEase: ease,
    keyTemporalContinuous: () => false, keyTemporalAutoBezier: () => false, keyInSpatialTangent: () => point(0, 0),
    keyOutSpatialTangent: () => point(0, 0), keySpatialContinuous: () => false, keySpatialAutoBezier: () => false, keyRoving: () => false });
  const transform = group([leaf('ADBE Anchor Point', spatial, point(960, 540)), position,
    leaf('ADBE Scale', native ? ThreeD : TwoD, native ? [90, 90, 100] : [90, 90]), leaf('ADBE Rotate Z', OneD, 5), leaf('ADBE Opacity', OneD, 80)]);
  const shape = { closed: true, vertices: [[0, 0], [190, 0], [90, 180]], inTangents: [[0, 0], [0, 0], [0, 0]],
    outTangents: [[0, 0], [0, 0], [0, 0]], featherSegLocs: null, featherRelSegLocs: null, featherRadii: null,
    featherInterps: null, featherTensions: null, featherTypes: null, featherRelCornerAngles: null };
  const masks = group([Object.assign(group([leaf('ADBE Mask Shape', SHAPE, shape)]), {
    matchName: 'ADBE Mask Atom', name: 'Photo mask', enabled: true, maskMode: 1, inverted: false,
    rotoBezier: false, maskMotionBlur: 1, maskFeatherFalloff: 1, locked: false
  })]);
  const effects = group([Object.assign(group([leaf('ADBE Fill-0002', COLOR, [0.1, 0.2, 0.3, 1])]),
    { matchName: 'ADBE Fill', name: 'Fill', enabled: true })]);
  state.writes = { duplicate: 0, replace: 0, matte: 0 };
  class AVLayer {
    constructor(comp, source, name) {
      Object.assign(this, { id: ++next, containingComp: comp, source, name, matchName: 'ADBE AV Layer',
        propertyType: 2, numProperties: 2, comment: 'note', enabled: true, solo: false, locked: false,
        shy: false, label: 8, startTime: 0.5, inPoint: 1, outPoint: 4, stretch: 100, parent: null,
        trackMatteLayer: null, trackMatteType: 0, hasTrackMatte: false, isTrackMatte: false, threeDLayer: false,
        nullLayer: false, adjustmentLayer: false, timeRemapEnabled: false, hasAudio: false,
        collapseTransformation: false, motionBlur: true, guideLayer: false, effectsActive: true, frameBlending: false,
        preserveTransparency: false, blendingMode: 1, quality: 2, samplingQuality: 3, autoOrient: 0,
        transforms: transform, masks, effects });
    }
    get index() { return this.containingComp.stack.indexOf(this) + 1; }
    property(key) { return ({
      'ADBE Transform Group': this.transforms, 'ADBE Mask Parade': this.masks, 'ADBE Effect Parade': this.effects,
      1: this.masks, 2: this.effects
    })[key] ?? null; }
    duplicate() {
      state.writes.duplicate++;
      if (state.flags.returnsExisting) return state.parent;
      const copy = Object.assign(new AVLayer(this.containingComp, this.source, this.name), this, { id: ++next });
      copy.trackMatteLayer = null;
      copy.trackMatteType = 0;
      copy.hasTrackMatte = false;
      this.containingComp.stack.splice(this.index - 1, 0, copy);
      state.project.revision++;
      if (state.flags.duplicateThrows) throw new Error('duplicate callback failed after creating a layer');
      if (state.flags.ignoresMarker) Object.defineProperty(copy, 'comment', { get: () => this.comment, set() {} });
      return copy;
    }
    replaceSource(source, fixExpressions) {
      assert.equal(fixExpressions, false);
      state.writes.replace++;
      this.source = source;
      state.project.revision++;
    }
    setTrackMatte(layer, type) {
      state.writes.matte++;
      this.trackMatteLayer = layer; this.trackMatteType = type; this.hasTrackMatte = true;
    }
  }
  const comp = state.comp = new CompItem('Photo slot');
  const master = new CompItem('Shared master');
  const unrelated = new CompItem('Other layers');
  const originalSource = state.originalSource = new FootageItem('Old.png');
  const replacement = state.replacement = new FootageItem('Фото с альфа.png', true);
  const replacements = [replacement];
  if (state.flags.twoImports) {
    state.second = new FootageItem('Фото Б.png');
    state.second.name = path.basename(state.second.file.fsName);
    replacements.push(state.second);
  }
  const otherSource = new FootageItem('Controls.png');
  const original = state.original = new AVLayer(comp, originalSource, 'Photo');
  const parent = state.parent = new AVLayer(comp, otherSource, 'Parent');
  const matte = state.matte = new AVLayer(comp, otherSource, 'Matte');
  matte.isTrackMatte = true;
  matte.enabled = false;
  original.parent = parent;
  original.trackMatteLayer = matte; original.trackMatteType = 1; original.hasTrackMatte = true;
  comp.stack.push(parent, original, matte);
  for (let i = 0; i < (state.flags.longOverlayLayers || 0); i++) {
    const layer = new AVLayer(comp, otherSource, 'Protected context');
    layer.comment = 'x'.repeat(415);
    comp.stack.push(layer);
  }
  master.stack.push(new AVLayer(master, comp, 'Use 1'), new AVLayer(master, comp, 'Use 2'));
  state.shared = master;
  if (state.flags.fullLayerBudget) {
    const filler = new AVLayer(unrelated, otherSource, 'Outside slot');
    unrelated.stack = Array(2048 - comp.numLayers - master.numLayers).fill(filler);
  }
  const items = [comp, master, unrelated, originalSource, otherSource];
  if (!state.flags.importOnDemand) items.push(...replacements);
  while (items.length < (state.flags.items || 0)) {
    const index = items.length;
    if (state.flags.montageCapacity && index < 179) {
      const item = capacityFootage(FootageItem, index, 14);
      item.footageMissing = false;
      item.mainSource.isStill = index >= 62;
      items.push(item);
    } else items.push(state.flags.montageCapacity
      ? { id: 50000 + 17 * index, name: 'Разворот «Сцена» "' + index + '" 🚀' }
      : { id: 5000 + index, name: 'Кадр "🚀" А ' + index });
  }
  class File {
    constructor(fsName) {
      fsName = path.normalize(fsName);
      const stat = fs.statSync(fsName, { throwIfNoEntry: false });
      Object.assign(this, { fsName, exists: !!stat, alias: false, length: stat?.size, modified: stat?.mtime });
    }
    open() { this.data = fs.readFileSync(this.fsName); return true; }
    seek(offset) { this.offset = offset; return true; }
    read(count) { return this.data.subarray(this.offset, this.offset + count).toString('latin1'); }
    close() { this.data = null; }
  }
  class ImportOptions {
    constructor(file) { this.file = file; }
    canImportAs(kind) { return kind === 1; }
  }
  const project = state.project = { file: { fsName: state.projectId, name: path.basename(state.projectId), exists: true,
    parent: { fsName: path.dirname(state.projectId) } }, revision: 7, dirty: false, activeItem: comp,
    get numItems() { return items.length; }, item: index => items[index - 1], itemByID: id => items.find(item => item.id === id),
    importFile(options) {
      assert.equal(options.importAs, 1);
      assert.equal(options.sequence, false);
      const footage = replacements.find(item => item.file.fsName === options.file.fsName);
      assert.ok(footage && !items.includes(footage));
      items.push(footage);
      this.revision++;
      return footage;
    }
  };
  replacement.name = path.basename(replacement.file.fsName);
  originalSource.name = path.basename(originalSource.file.fsName);
  otherSource.name = path.basename(otherSource.file.fsName);
  return { app: { project, version: '26-fixture', beginUndoGroup() {}, endUndoGroup() {} }, CompItem, AVLayer, FootageItem, File, Folder: File, ImportOptions,
    $: { sleep() {} },
    ImportAsType: { FOOTAGE: 1 }, PropertyType: { PROPERTY: 1 }, PropertyValueType, AlphaMode: { PREMULTIPLIED: 1 } };
}

module.exports = { overlayEnvironment };

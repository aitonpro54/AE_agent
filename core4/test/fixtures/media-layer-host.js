'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function capacityFootage(FootageItem, index) {
  const name = 'Кадр 🚀 documentary sequence ' + String(index).padStart(4, '0') + '.jpg';
  const folder = 'Архив_' + 'SeasonPart'.repeat(18);
  const prefix = [`C:\\Проект\\${folder}\\`, `c:/Проект/${folder}/`, `C:\\Проект/${folder}\\`][index % 3];
  return Object.assign(Object.create(FootageItem.prototype), { id: 5000 + index,
    name: index % 31 === 0 ? name.toUpperCase() : name, file: { fsName: prefix + name },
    hasVideo: true, mainSource: { isStill: index % 11 !== 0 }, footageMissing: index % 13 === 0 });
}

function mediaEnvironment(state) {
  let next = 20;
  const folder = { id: 1 };
  const file = state.overlayFile = path.join(state.fixtureDirectory, 'Фото для слоя.png');
  fs.writeFileSync(file, 'fixture media bytes');
  class File {
    constructor(fsName) {
      const info = fs.statSync(fsName, { throwIfNoEntry: false });
      Object.assign(this, { fsName, exists: !!info, length: info?.size, modified: info?.mtime, alias: false });
    }
  }
  class FootageItem {
    constructor(file) {
      Object.assign(this, { id: ++next, name: path.basename(file.fsName), parentFolder: folder,
        file, hasVideo: true, mainSource: { isStill: true }, duration: 0, footageMissing: false, useProxy: false });
    }
  }
  class ImportOptions {
    constructor(file) { this.file = file; }
    canImportAs(kind) { return kind === 1; }
  }
  function property(value) {
    return { value, propertyType: 1, canSetExpression: true, expressionEnabled: false,
      setValue(nextValue) { this.value = nextValue; } };
  }
  class AVLayer {
    constructor(comp, source, name) {
      Object.assign(this, { id: ++next, comp, source, name, matchName: 'ADBE AV Layer', numProperties: 0,
        hasTrackMatte: false, trackMatteLayer: null, trackMatteType: 5012, parent: null,
        startTime: 0, inPoint: 0, outPoint: comp.duration, enabled: true, solo: false, stretch: 100 });
      const properties = [property([320, 180]), property([100, 100])];
      this.transform = { numProperties: 2, property: key => properties[{ 'ADBE Position': 0, 'ADBE Scale': 1 }[key] ?? key - 1] };
    }
    get index() { return this.comp.stack.indexOf(this) + 1; }
    property(key) { return key === 'ADBE Transform Group' ? this.transform : null; }
    moveBefore(anchor) { this.move(anchor, 0); }
    moveAfter(anchor) { this.move(anchor, 1); }
    move(anchor, offset) {
      if (state.flags.moveThrows) throw new Error('injected move failure');
      const stack = this.comp.stack;
      stack.splice(this.index - 1, 1);
      stack.splice(anchor.index - 1 + offset, 0, this);
    }
  }
  class CompItem {
    constructor(name) {
      Object.assign(this, { id: ++next, name, parentFolder: folder, duration: 30, frameDuration: 1001 / 30000 });
      this.stack = [];
      this.layers = { add: source => {
        const layer = new AVLayer(this, source, 'Duplicated name');
        this.stack.unshift(layer);
        return layer;
      } };
    }
    layer(index) { return this.stack[index - 1]; }
    get numLayers() { return this.stack.length; }
  }
  const comp = state.comp = new CompItem('Placeholder');
  const master = state.master = new CompItem('Master');
  const stock = state.stock = new FootageItem(new File(path.join(state.fixtureDirectory, 'stock.png')));
  fs.writeFileSync(stock.file.fsName, 'existing fixture bytes');
  stock.file = new File(stock.file.fsName);
  state.anchor = comp.layers.add(stock);
  state.neighbor = comp.layers.add(stock);
  while (comp.numLayers < (state.flags.wideStack || 0)) comp.layers.add(stock);
  if (state.flags.wideStack) for (const layer of comp.stack) layer.name = '層'.repeat(255);
  master.layers.add(comp);
  master.layers.add(comp);
  const items = [comp, master, stock];
  for (let index = items.length; index < (state.flags.items || 0); index++) {
    const name = state.flags.longNames ? 'Фото'.repeat(45) : state.flags.wireNames ? 'Кадр "🚀" А ' + index : 'Кадр ' + index;
    items.push(state.flags.capacityFootage ? capacityFootage(FootageItem, index) : { id: 5000 + index, name });
  }
  const project = {
    file: { fsName: state.projectId, exists: true },
    revision: 7,
    get numItems() { return items.length; },
    item(index) { return items[index - 1]; },
    itemByID(id) { return items.find(item => item.id === id); },
    importFile(options) {
      assert.equal(options.importAs, 1);
      assert.equal(options.sequence, false);
      const item = new FootageItem(new File(options.file.fsName));
      items.push(item);
      this.revision++;
      if (state.flags.importThrows) throw new Error('injected callback failure');
      return item;
    }
  };
  state.items = items;
  return { app: { project, beginUndoGroup() {}, endUndoGroup() {} }, File, FootageItem, CompItem, AVLayer, ImportOptions,
    ImportAsType: { FOOTAGE: 1 }, PropertyType: { PROPERTY: 1 }, PropertyValueType: { LAYER_INDEX: 2 } };
}

module.exports = { mediaEnvironment, capacityFootage };

'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { hash } = require('../protocol/json');
const { harness } = require('./fixtures/manual-http-runtime');

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
  master.layers.add(comp);
  master.layers.add(comp);
  const items = [comp, master, stock];
  const project = {
    file: { fsName: state.projectId, exists: true },
    get numItems() { return items.length; },
    item(index) { return items[index - 1]; },
    itemByID(id) { return items.find(item => item.id === id); },
    importFile(options) {
      assert.equal(options.importAs, 1);
      assert.equal(options.sequence, false);
      const item = new FootageItem(new File(options.file.fsName));
      items.push(item);
      if (state.flags.importThrows) throw new Error('injected callback failure');
      return item;
    }
  };
  state.items = items;
  return { app: { project, beginUndoGroup() {}, endUndoGroup() {} }, File, FootageItem, CompItem, AVLayer, ImportOptions,
    ImportAsType: { FOOTAGE: 1 }, PropertyType: { PROPERTY: 1 }, PropertyValueType: { LAYER_INDEX: 2 } };
}

function operation(h, moduleId, target, params) {
  const { contractId } = h.broker.getContract({ moduleId });
  const inspect = () => h.broker.inspect({ moduleId, contractId, target });
  const plan = async (input = params) => {
    const evidence = await inspect();
    return h.broker.build({ oneStep: true, steps: [{ stepId: 'operation', moduleId, contractId,
      evidenceRef: evidence.evidenceRef, input: { ...target, ...input } }] });
  };
  const proposal = async input => {
    const built = await plan(input);
    const { proposalId } = h.broker.propose({ buildId: built.buildId });
    const { dryrunRef } = await h.broker.dryrun({ proposalId });
    return { proposalId, dryrunRef, taskId: built.taskId };
  };
  return { inspect, plan, run: async input => h.broker.run(await proposal(input)) };
}
function importer(h) {
  const file = h.state.overlayFile;
  return operation(h, 'media-import', { projectId: h.state.projectId, sessionId: h.installation.installationId, file },
    { sha256: hash(fs.readFileSync(file)) });
}
function inserter(h, sourceId = h.state.stock.id, placement = 'above') {
  return operation(h, 'layer-insert', { projectId: h.state.projectId, sessionId: h.installation.installationId,
    compId: h.state.comp.id, layerId: h.state.anchor.id, itemId: sourceId }, {
    name: 'Обработанный вариант', placement, startFrame: 12, inFrame: 18, outFrame: 72, position: [160, 90], scale: [80, 80]
  });
}

const windows = { skip: process.platform !== 'win32' };
test('media-layers imports once and inserts by ID above a same-named layer with signed read-back', windows, async t => {
  const h = await harness({ mediaEnvironment, confirm: ({ message }) => {
    if (message.includes('в существующую композицию')) assert.match(message, /Вхождения comp\/layer → source: \d+\/\d+ → \d+, \d+\/\d+ → \d+/);
    return true;
  } });
  t.after(() => h.close());
  const ingest = importer(h);
  const imported = await ingest.run();
  assert.equal(imported.state, 'succeeded');
  const newItem = (await ingest.inspect()).snapshot.items.find(item => item.file === h.state.overlayFile);
  assert.equal(imported.outputs.operation.createdItemId, newItem.id);
  await assert.rejects(ingest.plan(), /media_already_imported/);
  const insert = inserter(h, newItem.id);
  const before = (await insert.inspect()).snapshot;
  const result = await insert.run();
  assert.equal(result.state, 'succeeded', JSON.stringify(result));
  const after = (await insert.inspect()).snapshot;
  assert.deepEqual([after.stack[0], after.stack[2]], before.stack);
  assert.equal(result.outputs.operation.createdLayerId, after.stack[1].id);
  assert.equal(after.stack[1].sourceId, newItem.id);
  assert.deepEqual(after.stack[1].position, [160, 90]);
  assert.equal(after.stack[1].outPoint, 72 * before.frameDuration);
  assert.equal(h.confirmations, 2);
  assert.deepEqual(h.broker.ledger.commands().map(command => command.verificationKind), Array(2).fill('local-transaction-receipt'));
});

test('media-layers refuses matte split, cross-comp expression, and source ranges before dispatch', windows, async t => {
  const h = await harness({ mediaEnvironment });
  t.after(() => h.close());
  const { anchor, neighbor, master, stock } = h.state;
  anchor.hasTrackMatte = true;
  anchor.trackMatteLayer = neighbor;
  await assert.rejects(inserter(h).plan(), /layer_insert_matte_pair/);
  const external = master.layer(1).transform.property(1);
  external.expressionEnabled = true;
  await assert.rejects(inserter(h, stock.id, 'below').plan(), /layer_insert_expression_scope/);
  external.expressionEnabled = false;
  stock.mainSource.isStill = false;
  stock.duration = 1;
  await assert.rejects(inserter(h, stock.id, 'below').plan(), /layer_insert_frame_range/);
  stock.duration = 10;
  const insertion = inserter(h, stock.id, 'below');
  assert.equal((await insertion.run()).state, 'succeeded');
  assert.equal((await insertion.inspect()).snapshot.stack[1].matteId, neighbor.id);
});

test('media-layers rejects a wrong input SHA before confirm and a changed stack after confirm', windows, async t => {
  const h = await harness({ mediaEnvironment, confirm: ({ state }) => {
    state.anchor.name = 'Changed while confirming';
    return true;
  } });
  t.after(() => h.close());
  const wrong = await importer(h).run({ sha256: '0'.repeat(64) });
  assert.equal(wrong.code, 'media_import_digest_mismatch', JSON.stringify(wrong));
  assert.equal(h.confirmations, 0);
  const stale = await inserter(h).run();
  assert.equal(stale.message, 'stale_target');
  assert.equal(h.state.comp.numLayers, 2);
});

for (const [flag, action] of [['importThrows', importer], ['moveThrows', inserter]]) {
  test('media-layers preserves UNKNOWN after a partial ' + flag, windows, async t => {
    const h = await harness({ mediaEnvironment, flags: { [flag]: true }, callbackTimeout: 350 });
    t.after(() => h.close());
    const operation = action(h);
    await operation.run();
    assert.equal(h.broker.ledger.commands()[0].state, 'UNKNOWN');
    await assert.rejects(operation.plan(), /controller_unresolved/);
  });
}

'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { hash } = require('../protocol/json');
const { issue } = require('../runtime/operator-confirmation');
const { createLayerOverlayProof } = require('../runtime/layer-overlay-proof');
const { inspectReceiverHistory, inspectLedgerHistory } = require('../runtime/recovery-inspection');
const { scopesOverlap } = require('../core/resources');
const { harness } = require('./fixtures/manual-http-runtime');

const PropertyValueType = { OneD: 1, TwoD: 2, TwoD_SPATIAL: 3, COLOR: 4, SHAPE: 5, LAYER_INDEX: 6, CUSTOM_VALUE: 7 };
const moduleId = 'layer-overlay';
const sessionId = 'fixture-installation';
const group = (entries = []) => ({ propertyType: 2, numProperties: entries.length,
  property(key) { return typeof key === 'number' ? entries[key - 1] : entries.find(item => item.matchName === key); } });
const leaf = (matchName, propertyValueType, value) => ({
  matchName, value, propertyType: 1, propertyValueType, numKeys: 0, canSetExpression: true, expressionEnabled: false, expression: ''
});

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
        frameDuration: 1 / 25, displayStartTime: 0, stack: [] });
    }
    get numLayers() { return this.stack.length; }
    layer(index) { return this.stack[index - 1]; }
  }
  const { OneD, TwoD, TwoD_SPATIAL, COLOR, SHAPE } = PropertyValueType;
  const position = leaf('ADBE Position', TwoD_SPATIAL, [100, 120]);
  const ease = () => [{ speed: 0, influence: 33 }];
  Object.assign(position, { numKeys: 2, keyTime: i => i - 1, keyValue: i => [100 * i, 120],
    keyInInterpolationType: () => 1, keyOutInterpolationType: () => 1, keyInTemporalEase: ease, keyOutTemporalEase: ease,
    keyTemporalContinuous: () => false, keyTemporalAutoBezier: () => false, keyInSpatialTangent: () => [0, 0],
    keyOutSpatialTangent: () => [0, 0], keySpatialContinuous: () => false, keySpatialAutoBezier: () => false, keyRoving: () => false });
  const transform = group([leaf('ADBE Anchor Point', TwoD_SPATIAL, [960, 540]), position,
    leaf('ADBE Scale', TwoD, [90, 90]), leaf('ADBE Rotate Z', OneD, 5), leaf('ADBE Opacity', OneD, 80)]);
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
  const otherSource = new FootageItem('Controls.png');
  const original = state.original = new AVLayer(comp, originalSource, 'Photo');
  const parent = state.parent = new AVLayer(comp, otherSource, 'Parent');
  const matte = state.matte = new AVLayer(comp, otherSource, 'Matte');
  matte.isTrackMatte = true;
  matte.enabled = false;
  original.parent = parent;
  original.trackMatteLayer = matte; original.trackMatteType = 1; original.hasTrackMatte = true;
  comp.stack.push(parent, original, matte);
  master.stack.push(new AVLayer(master, comp, 'Use 1'), new AVLayer(master, comp, 'Use 2'));
  state.shared = master;
  if (state.flags.fullLayerBudget) {
    const filler = new AVLayer(unrelated, otherSource, 'Outside slot');
    unrelated.stack = Array(2048 - comp.numLayers - master.numLayers).fill(filler);
  }
  const items = [comp, master, unrelated, originalSource, replacement, otherSource];
  const project = state.project = { file: { fsName: state.projectId, exists: true }, revision: 7,
    get numItems() { return items.length; }, item: index => items[index - 1], itemByID: id => items.find(item => item.id === id) };
  return { app: { project, beginUndoGroup() {}, endUndoGroup() {} }, CompItem, AVLayer, FootageItem,
    PropertyType: { PROPERTY: 1 }, PropertyValueType, AlphaMode: { PREMULTIPLIED: 1 } };
}

async function fixture(t, options = {}) {
  const h = await harness({ overlayEnvironment, operatorSession: () => sessionId, ...options });
  t.after(() => h.close());
  const { state, broker } = h;
  const { contractId } = broker.getContract({ moduleId });
  const target = { projectId: state.projectId, sessionId, compId: state.comp.id,
    layerId: state.original.id, originalSourceId: state.originalSource.id, itemId: state.replacement.id };
  const file = state.replacement.file.fsName;
  const input = { ...target, file, sha256: hash(fs.readFileSync(file)) };
  const inspect = () => broker.inspect({ moduleId, contractId, target });
  const build = async (options = {}) => {
    const { evidenceRef } = await inspect();
    return broker.build({ oneStep: true, steps: [{ stepId: 'overlay', moduleId, contractId, evidenceRef, input }], ...options });
  };
  const prepare = async (approved = true) => {
    const { buildId } = await build();
    const proposal = broker.propose({ buildId });
    if (approved) issue(h.installation, { sessionId, proposalId: proposal.proposalId, approvalDigest: proposal.operatorApprovalDigest });
    const { dryrunRef } = await broker.dryrun({ proposalId: proposal.proposalId });
    return { proposalId: proposal.proposalId, dryrunRef };
  };
  return { ...h, target, input, inspect, build, prepare, get confirmations() { return h.confirmations; } };
}

test('layer-overlay copies the exact slot and verifies shared uses, keys, mask, effect, parent, matte and alpha', async t => {
  const h = await fixture(t);
  assert.equal((await h.broker.run(await h.prepare(false))).code, 'operator_confirmation_required');
  const { snapshot: before } = await h.inspect();
  const result = await h.broker.run(await h.prepare());
  assert.equal(result.state, 'succeeded', JSON.stringify(result));
  const { snapshot: after } = await h.inspect(), copy = h.state.comp.layer(2);
  assert.equal(after.overlay.id, copy.id);
  assert.equal(after.overlay.signature, before.signature);
  assert.deepEqual(after.stack.filter(layer => layer.id !== copy.id), before.stack);
  assert.deepEqual(after.uses, before.uses);
  assert.equal(after.uses.length, 2);
  assert.equal(copy.source, h.state.replacement);
  assert.equal(copy.parent, h.state.parent);
  assert.equal(copy.trackMatteLayer, h.state.matte);
  assert.deepEqual(h.state.writes, { duplicate: 1, replace: 1, matte: 1 });
  assert.equal(JSON.parse(after.source.alpha)[0], true);
  assert.equal(h.confirmations, 0);
  assert.equal(h.broker.ledger.commands()[0].verificationKind, 'local-transaction-receipt');
  const receiver = inspectReceiverHistory(fs.readFileSync(path.join(h.installation.stateDir, 'receiver/completions.ndjson')));
  const ledger = inspectLedgerHistory(fs.readFileSync(path.join(h.installation.stateDir, 'broker/ledger.ndjson')),
    { receiver, installationId: h.installation.installationId });
  assert.equal(ledger.settled, true);
  assert.equal(scopesOverlap(h.target, { ...h.target, itemId: 300 }), true);
  assert.equal(scopesOverlap(h.target, { ...h.target, layerId: 300 }), false);
  await assert.rejects(h.build(), /layer_overlay_existing_or_partial/);
  copy.comment += '\nUser annotation';
  assert.equal((await h.inspect()).snapshot.overlay.state, 'partial');
  await assert.rejects(h.build(), /layer_overlay_existing_or_partial/);
  assert.equal(h.state.writes.duplicate, 1);
  const proof = createLayerOverlayProof(() => sessionId);
  for (const damaged of [
    { ...after, stack: [after.stack[0], after.stack[1], ...after.stack.slice(1)] },
    { ...after, overlay: { ...after.overlay, sourceId: h.target.originalSourceId } }
  ]) assert.throws(() => proof.validateResult({ input: h.input, before }, damaged), { code: 'layer_overlay_readback' });
});

test('layer-overlay rejects external indexed expressions and revision drift before native duplicate', async t => {
  const h = await fixture(t);
  const external = h.state.shared.layer(1).transforms.property('ADBE Position');
  external.expressionEnabled = true;
  external.expression = 'thisComp.layer(2).position';
  await assert.rejects(h.inspect(), /inspection_failed/);
  external.expressionEnabled = false;
  external.expression = '';
  const proposed = await h.prepare();
  h.state.project.revision++;
  const result = await h.broker.run(proposed);
  assert.equal(result.code, 'approved_target_drift');
  assert.equal(h.state.writes.duplicate, 0);
});

test('layer-overlay rejects a project at the total layer limit before duplicate', async t => {
  const h = await fixture(t, { flags: { fullLayerBudget: true } });
  const result = await h.broker.run(await h.prepare());
  assert.equal(result.message, 'inspection_result_budget');
  assert.deepEqual(h.state.writes, { duplicate: 0, replace: 0, matte: 0 });
});

for (const flag of ['duplicateThrows', 'ignoresMarker', 'returnsExisting', 'holdMutationCallback']) {
  test('layer-overlay preserves UNKNOWN and forbids a fresh proposal after ' + flag, async t => {
    const h = await fixture(t, { flags: { [flag]: true }, callbackTimeout: 300, callerTimeout: 1500 });
    const proposed = await h.prepare();
    const result = await h.broker.run(proposed);
    assert.equal(result.state, 'stopped');
    const command = h.broker.ledger.commands()[0];
    assert.equal(command.state, 'UNKNOWN');
    assert.equal(h.state.writes.duplicate, 1);
    assert.equal(h.state.writes.replace, flag === 'holdMutationCallback' ? 1 : 0);
    assert.equal(h.state.original.source, h.state.originalSource);
    assert.equal(h.state.parent.comment, 'note');
    await assert.rejects(h.build(), /controller_unresolved/);
    if (flag === 'holdMutationCallback') {
      assert.throws(() => h.state.retryPendingMutation(), /physical_latch_present/);
      const file = path.join(h.installation.stateDir, 'receiver/completions.ndjson');
      const before = fs.readFileSync(file);
      h.state.releaseMutationCallback();
      await new Promise(resolve => setTimeout(resolve, 30));
      assert.deepEqual(fs.readFileSync(file), before);
      assert.equal(h.state.writes.duplicate, 1);
    }
  });
}

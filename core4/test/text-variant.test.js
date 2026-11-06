'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { build } = require('../modules/text-variant/implementation');
const { validateTextVariantCompletion } = require('../runtime/text-variant-proof');

const projectId = 'C:/test/owned.aep';
const input = { projectId, compId: 7, controlledLayerIds: [20, 21] };
const source = fs.readFileSync(path.join(__dirname, '../modules/text-variant/executor.jsx'), 'utf8');

function fixture({ collision = false, rotation = 0, confirm = () => true } = {}) {
  class CompItem {}
  const property = value => ({ numKeys: 0, value, dimensionsSeparated: false, setValue(next) { this.value = next; } });
  const group = (...names) => ({ numProperties: names.length, property: i => ({ matchName: names[i - 1] }) });
  const styles = active => {
    const entries = [
      { matchName: 'ADBE Blend Options Group', enabled: active, canSetEnabled: false, isModified: false },
      { matchName: 'dropShadow/enabled', enabled: false, canSetEnabled: active, isModified: true },
      { matchName: 'frameFX/enabled', enabled: active, canSetEnabled: active, isModified: false },
    ];
    return { numProperties: entries.length, property: i => entries[i - 1] };
  };
  const marker = comment => ({ comment, chapter: '', url: '', frameTarget: '', cuePointName: '', duration: 0, label: 2,
    eventCuePoint: false, protectedRegion: false, getParameters: () => ['marker', comment] });
  const layers = [];
  function layer(id, name, comment, text, enabled, animated, markers, position) {
    const t = { 'ADBE Anchor Point': property([0, 0]), 'ADBE Position': property(position), 'ADBE Scale': property([100, 100, 100]),
      'ADBE Rotate Z': property(animated ? rotation : 0) };
    const source = property({ pointText: true, text });
    const markerKeys = {
      get numKeys() { return markers.length; }, keyValue: index => markers[index - 1][1], keyTime: index => markers[index - 1][0],
      setValueAtTime(time, value) { markers.push([time, value]); markers.sort((a, b) => a[0] - b[0]); },
    };
    const textProperties = { property: key => key === 'ADBE Text Document' ? source : animated ? group('ADBE Text Animator') : group() };
    const item = {
      id, name, comment, enabled, inPoint: 0, outPoint: 3, trackMatteLayer: animated ? { id: 99 } : null, hasTrackMatte: animated,
      sourceRectAtTime: time => ({ left: 0, top: animated ? time * 40 : 0, width: 100, height: 50 }),
      property(key) {
        return { 'ADBE Transform Group': { property: key => t[key] }, 'ADBE Text Properties': textProperties,
          'ADBE Marker': markerKeys, 'ADBE Effect Parade': animated ? group('ADBE Gaussian Blur 2') : group(),
          'ADBE Layer Styles': styles(animated) }[key];
      },
      duplicate() {
        const dup = layer(22, name, comment, text, this.enabled, animated, markers.slice(), position);
        layers.splice(layers.indexOf(this), 0, dup);
        return dup;
      },
      remove() { layers.splice(layers.indexOf(this), 1); },
    };
    return item;
  }
  layers.push(layer(20, 'Template', '', 'Legacy', true, true, [[collision ? 0.5 : 1.5, marker('User')]], [80, 120]),
    layer(21, 'Layout', 'AE_CORE4_TEXT_V1:short', 'New\rText', true, false, [], [400, 200]),
    layer(23, 'Marker source', '', 'Marker reference', false, false, [[0.5, marker('IN')]], [40, 80]));
  const comp = Object.assign(new CompItem(), { id: 7, name: 'Copy', comment: 'AE_CORE4_TEXT_WORKSPACE_V1',
    pixelAspect: 1, width: 800, height: 400, duration: 3, time: 1, layer: index => layers[index - 1] });
  Object.defineProperty(comp, 'numLayers', { get: () => layers.length });
  const app = { project: { file: { fsName: projectId }, itemByID: id => id === comp.id ? comp : null }, beginUndoGroup() {}, endUndoGroup() {} };
  const jsx = vm.runInNewContext(source, { app, CompItem, confirm });
  const plain = value => JSON.parse(JSON.stringify(value));
  const before = plain(jsx.inspect(input));
  function run(desired) {
    const p = build({ input: { ...input, ...desired }, evidence: before }).input;
    const result = plain(jsx.mutate({ ...p, _execution: { policyId: 'current-matching-target-after-local-confirmation-v1',
      baselineRevision: before.revision, baselineProtected: before.protected, target: before.target } }));
    return { result, p };
  }
  return { before, run, read: () => plain(jsx.inspect(input)) };
}

test('text-variant: exact visibility selection preserves the unmanaged marker source', () => {
  const env = fixture();
  const { result, p } = env.run({ activeLayerId: 21 });
  assert.equal(result.outcome, 'applied');
  validateTextVariantCompletion({ input: p, before: env.before }, result.snapshot);
  assert.deepEqual(env.read().layers.map(layer => [layer.layerId, layer.enabled]), [[20, false], [21, true], [23, false]]);
});

const derive = { templateLayerId: 20, layoutLayerId: 21, slot: 'short', name: 'Decorated short', markerSourceLayerId: 23 };
test('text-variant: duplicate carries effect, layer style, animator and matte while adding just IN', () => {
  const env = fixture();
  const { result, p } = env.run({ derive });
  assert.equal(result.outcome, 'applied');
  validateTextVariantCompletion({ input: p, before: env.before }, result.snapshot);
  assert.deepEqual(env.read().layers[0].markers.map(marker => marker.comment), ['IN', 'User']);
  assert.deepEqual(env.read().layers[0].styles, ['frameFX/enabled']);
  assert.deepEqual(env.read().layers[1].markers.map(marker => marker.comment), ['User']);
});

test('text-variant: collision with a user marker refuses before confirmation or write', () => {
  const env = fixture({ collision: true, confirm: () => assert.fail('unexpected confirmation') });
  const { result } = env.run({ derive });
  assert.deepEqual(result, { outcome: 'rejected', code: 'text_variant_marker_collision' });
  assert.deepEqual(env.read(), env.before);
});

test('text-variant: hold alignment offsets the animated bounds and binds the receipt to the measured centers', () => {
  const env = fixture();
  const { result, p } = env.run({ derive: { ...derive, holdTime: 1.5 } });
  assert.equal(result.outcome, 'applied');
  assert.deepEqual(result.snapshot.alignment, { time: 1.5, layoutCenter: [50, 25], variantCenter: [50, 85] });
  assert.deepEqual(result.snapshot.layers[0].transform.position, [400, 140]);
  validateTextVariantCompletion({ input: p, before: env.before }, result.snapshot);
  result.snapshot.layers[0].transform.position[1] = 200;
  assert.throws(() => validateTextVariantCompletion({ input: p, before: env.before }, result.snapshot), /text_variant_derive_readback/);
});

test('text-variant: hold alignment refuses rotated or out-of-span text before confirmation', () => {
  for (const [rotation, holdTime] of [[2, 1], [0, 3]]) {
    const env = fixture({ rotation, confirm: () => assert.fail('unexpected confirmation') });
    assert.deepEqual(env.run({ derive: { ...derive, holdTime } }).result, { outcome: 'rejected', code: 'text_variant_hold_geometry' });
    assert.deepEqual(env.read(), env.before);
  }
});

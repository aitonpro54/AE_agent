'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { localOperation } = require('./fixtures/local-operation');
const { textEnvironment } = require('./fixtures/text-layer-ae');
const { validateTextLayerCompletion } = require('../runtime/text-layer-proof');

test('text-layer: font fallback and stroke-aware fit survive local readback', () => {
  const operation = localOperation('text-layer', textEnvironment);
  const { before, input, result } = operation.run({ projectId: operation.state.projectId, compId: 7,
    slot: 'title-01', name: 'Title', text: 'Title\nNorth', leading: 72, justification: 'right',
    ranges: [
      { start: 0, end: 6, font: 'Unavailable-Regular', fallbackFont: 'Fixture-Regular', fontSize: 36, tracking: 12, fill: [1, 1, 1] },
      { start: 6, end: 11, font: 'Fixture-Bold', fontSize: 64, tracking: 20, fill: [0.8, 0.9, 1], stroke: { color: [0, 0, 0], width: 3 } },
    ],
    placement: { frame: { left: 170, top: 65, width: 80, height: 92 }, minimumScale: 0.6 } });
  assert.equal(result.outcome, 'applied');
  const [layer] = result.snapshot.layers;
  assert.equal(layer.ranges[0].font, 'Fixture-Regular');
  assert.deepEqual(layer.ranges[1].stroke, { color: [0, 0, 0], width: 3 });
  assert.deepEqual(layer.position, [210, 111]);
  assert.ok(Math.abs(layer.scale - 92 / 126) < 1e-7);
  assert.doesNotThrow(() => validateTextLayerCompletion({ before, input }, result.snapshot));

  const altered = structuredClone(result.snapshot);
  altered.layers[0].ranges[0].font = 'Fixture-Bold';
  assert.throws(() => validateTextLayerCompletion({ before, input }, altered), /text_layer_style_readback/);
  assert.throws(() => validateTextLayerCompletion({ before, input }, { ...result.snapshot,
    layers: [{ ...layer, position: [210, 112] }] }), /text_layer_placement_readback/);
});

'use strict';
const { canonical, fail } = require('../protocol/json');

const near = (a, b, epsilon = 0.002) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= epsilon;
const equal = (a, b) => canonical(a ?? null) === canonical(b ?? null);
const color = (a, b) => (!a && !b) || (a && b && a.length === b.length && a.every((value, index) => near(value, b[index])));

function validateTextLayerCompletion({ input, before }, after) {
  const { slot, layerId, name, text, leading, justification, ranges, placement } = input;
  const previous = before.layers.find(layer => layer.slot === slot);
  const result = after.layers.find(layer => layer.slot === slot);
  const otherLayers = snapshot => snapshot.layers.filter(layer => layer.slot !== slot);
  if (!result || result.issue || result.name !== name || result.text !== text || !near(result.leading, leading) ||
      result.justification !== justification || result.enabled !== (previous?.enabled ?? true) ||
      layerId !== undefined && result.layerId !== layerId ||
      before.layers.some(layer => layer.slot !== slot && layer.layerId === result.layerId) ||
      !equal(otherLayers(before), otherLayers(after)) || !equal(before.guides, after.guides) || !equal(before.size, after.size)) {
    fail('text_layer_readback');
  }
  let actual = 0;
  for (const desired of ranges) {
    for (let index = desired.start; index < desired.end; index++) {
      if (text[index] === '\n') continue;
      while (actual < result.ranges.length && index >= result.ranges[actual].end) actual++;
      const observed = result.ranges[actual];
      if (!observed || observed.start > index || observed.substitute !== false ||
          observed.font !== desired.font && observed.font !== desired.fallbackFont ||
          !near(observed.fontSize, desired.fontSize) || !near(observed.tracking, desired.tracking) ||
          !color(observed.fill, desired.fill) || Boolean(observed.stroke) !== Boolean(desired.stroke) ||
          observed.stroke && (!near(observed.stroke.width, desired.stroke.width) || !color(observed.stroke.color, desired.stroke.color))) {
        fail('text_layer_style_readback');
      }
    }
  }
  if (previous && !equal(result.anchor, previous.anchor)) fail('text_layer_anchor_readback');
  if (!placement) {
    if (previous && (!equal(result.position, previous.position) || !near(result.scale, previous.scale))) fail('text_layer_transform_readback');
    return;
  }
  const { frame, minimumScale } = placement;
  const { bounds, anchor, position, scale } = result;
  const stroke = Math.max(0, ...result.ranges.map(range => range.stroke?.width ?? 0));
  if (scale < minimumScale - 0.0001 || scale > 1.0001 ||
      (bounds.width + 2 * stroke) * scale > frame.width + 0.05 ||
      (bounds.height + 2 * stroke) * scale > frame.height + 0.05 ||
      !near(position[0] + (bounds.left + bounds.width / 2 - anchor[0]) * scale, frame.left + frame.width / 2, 0.05) ||
      !near(position[1] + (bounds.top + bounds.height / 2 - anchor[1]) * scale, frame.top + frame.height / 2, 0.05)) {
    fail('text_layer_placement_readback');
  }
}

module.exports = { validateTextLayerCompletion };

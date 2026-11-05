'use strict';
const { canonical, fail } = require('../protocol/json');

function validateTextVariantCompletion({ input, before }, after) {
  const { controlledLayerIds, activeLayerId, derive } = input;
  const tag = derive && 'AE_CORE4_VARIANT_V1:' + derive.slot;
  const created = derive && after.layers.find(layer => layer.tag === tag);
  const retained = derive ? after.layers.filter(layer => layer.tag !== tag) : after.layers;
  const controlled = new Set(controlledLayerIds);
  const expected = before.layers.map(layer => controlled.has(layer.layerId) ? { ...layer, enabled: layer.layerId === activeLayerId } : layer);
  if (canonical(retained) !== canonical(expected)) fail('text_variant_neighbors');
  if (!derive) return;
  const template = before.layers.find(layer => layer.layerId === derive.templateLayerId);
  const layout = before.layers.find(layer => layer.layerId === derive.layoutLayerId);
  const markers = template.markers.slice();
  if (derive.markerSourceLayerId !== undefined) {
    const marker = before.layers.find(layer => layer.layerId === derive.markerSourceLayerId).markers.find(marker => marker.comment === 'IN');
    if (!markers.some(item => canonical(item) === canonical(marker))) markers.push(marker);
    markers.sort((a, b) => a.time - b.time);
  }
  if (!created || after.layers.length !== before.layers.length + 1 || before.layers.some(layer => layer.layerId === created.layerId) ||
      created.name !== derive.name || !created.eligible || created.enabled !== true || created.text !== layout.text ||
      created.matteLayerId !== template.matteLayerId ||
      ['effects', 'animators', 'styles'].some(key => canonical(created[key]) !== canonical(template[key])) ||
      canonical(created.transform) !== canonical(layout.transform) || canonical(created.markers) !== canonical(markers)) {
    fail('text_variant_derive_readback');
  }
}

module.exports = { validateTextVariantCompletion };

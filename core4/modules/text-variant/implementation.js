'use strict';

function build({ input, evidence }) {
  const { controlledLayerIds, activeLayerId, derive } = input;
  const byId = new Map(evidence.layers.map(layer => [layer.layerId, layer]));
  const controlled = new Set(controlledLayerIds);
  if (controlled.size !== controlledLayerIds.length || controlledLayerIds.some(id => !byId.get(id)?.eligible) ||
      (derive === undefined) === (activeLayerId === undefined) || activeLayerId !== undefined && !controlled.has(activeLayerId)) {
    throw new Error('text_variant_targets');
  }
  if (derive) {
    const template = byId.get(derive.templateLayerId), layout = byId.get(derive.layoutLayerId);
    if (template === layout || !controlled.has(derive.templateLayerId) || !controlled.has(derive.layoutLayerId) ||
        !template?.text || !template.transform || !layout?.tag.startsWith('AE_CORE4_TEXT_V1:') || !layout.text || !layout.transform ||
        !/^[a-z][a-z0-9-]{0,39}$/.test(derive.slot) || /[\x00-\x1f\x7f]/.test(derive.name) ||
        evidence.layers.some(layer => layer.tag === 'AE_CORE4_VARIANT_V1:' + derive.slot)) throw new Error('text_variant_derive');
    if (derive.markerSourceLayerId !== undefined) {
      const markers = byId.get(derive.markerSourceLayerId)?.markers.filter(marker => marker.comment === 'IN');
      if (markers?.length !== 1) throw new Error('text_variant_in_marker');
    }
  }
  return { operationId: 'stage-text-variant', input: { ...input, expectedRevision: evidence.revision } };
}

module.exports = { build };

"use strict";

function projectPlaceholderLayerEvidence(full) {
  if (!full || !full.comp || !full.layer) {
    throw new Error("Placeholder layer evidence is incomplete.");
  }
  const comp = full.comp;
  const layer = full.layer;
  const source = layer.source;
  return {
    evidenceView: "placeholder.v1",
    comp: {
      itemIndex: comp.itemIndex, itemId: comp.itemId, name: comp.name, frameRate: comp.frameRate
    },
    layer: {
      index: layer.index, id: layer.id, name: layer.name, locked: layer.locked,
      source: source ? { itemId: source.itemId, name: source.name,
        duration: source.duration, frameRate: source.frameRate } : null,
      startTime: layer.startTime, inPoint: layer.inPoint, outPoint: layer.outPoint,
      stretch: layer.stretch, timeRemapEnabled: layer.timeRemapEnabled
    }
  };
}

module.exports = { projectPlaceholderLayerEvidence };

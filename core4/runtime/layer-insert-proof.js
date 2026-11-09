'use strict';
const { canonical, fail } = require('../protocol/json');

const same = (a, b) => canonical(a) === canonical(b);
const near = (a, b) => Math.abs(a - b) <= 0.00002;

function createLayerInsertProof(currentSessionId) {
  return {
    assertTarget(target) {
      if (target.sessionId !== currentSessionId()) fail('media_layer_work_session_changed');
    },
    validateResult({ input, before }, after) {
      const index = before.stack.findIndex(layer => layer.id === input.layerId) + (input.placement === 'below' ? 1 : 0);
      const inserted = after.stack[index], frame = before.frameDuration;
      if (after.stack.length !== before.stack.length + 1 || !inserted || after.createdLayerId !== inserted.id ||
          before.stack.some(layer => layer.id === inserted.id) || inserted.sourceId !== input.itemId ||
          inserted.name !== input.name || !inserted.enabled || inserted.solo || inserted.parentId || inserted.matteId ||
          inserted.stretch !== 100 || !near(inserted.start, input.startFrame * frame) ||
          !near(inserted.inPoint, input.inFrame * frame) || !near(inserted.outPoint, input.outFrame * frame) ||
          input.position && !same(inserted.position, input.position) || input.scale && !same(inserted.scale, input.scale) ||
          !same(after.stack.filter(layer => layer.id !== inserted.id), before.stack) ||
          !same(after.uses, before.uses) || !same(after.source, before.source) ||
          after.hasExpressions || after.frameDuration !== frame || after.duration !== before.duration) fail('layer_insert_readback');
    }
  };
}

module.exports = { createLayerInsertProof };

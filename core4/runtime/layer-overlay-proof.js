'use strict';

const { canonical, fail } = require('../protocol/json');
const { assertImportFile } = require('./media-layer-proof');

function createLayerOverlayProof(currentSessionId) {
  function assertTarget(target) {
    if (target.sessionId !== currentSessionId()) fail('layer_overlay_work_session_changed');
  }
  function assertSource(input, snapshot) {
    if (input.file !== snapshot.source.file) fail('layer_overlay_source_path');
    assertImportFile(input, snapshot.source);
  }
  return {
    assertTarget,
    prepareCheckpoint({ input, before }) {
      if (before.overlay.state !== 'none') fail('layer_overlay_existing_or_partial');
      assertSource(input, before);
    },
    validateResult({ input, before }, after) {
      assertSource(input, after);
      const { id, state, signature } = after.overlay;
      const index = before.stack.findIndex(layer => layer.id === input.layerId);
      const original = before.stack[index];
      const inserted = after.stack[index];
      if (before.overlay.state !== 'none' || !original || original.sourceId !== input.originalSourceId ||
          state !== 'applied' || !id || signature !== before.signature || !inserted || inserted.id !== id ||
          inserted.sourceId !== input.itemId || before.stack.some(layer => layer.id === id) ||
          after.protected !== before.protected ||
          canonical(after.stack.filter(layer => layer.id !== id)) !== canonical(before.stack) ||
          canonical(after.source) !== canonical(before.source) || canonical(after.uses) !== canonical(before.uses)) {
        fail('layer_overlay_readback');
      }
    }
  };
}

module.exports = { createLayerOverlayProof };

'use strict';
const { fail } = require('../protocol/json');

function createPhotoSourceProof(currentSessionId) {
  return {
    assertTarget(target) {
      if (target.sessionId !== currentSessionId()) fail('photo_work_session_changed');
    },
    validateResult({ input, before }, after) {
      if (after.sourceId !== input.newSourceId || !after.source?.file || !before.source ||
          ['width', 'height', 'pixelAspect'].some(key => before.source[key] !== after.source[key])) fail('photo_source_readback');
    }
  };
}

module.exports = { createPhotoSourceProof };

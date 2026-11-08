'use strict';

function build({ input, evidence }) {
  if (!evidence.fullResolution || evidence.width > 4096 || evidence.height > 4096) throw Error('frame_export_resolution');
  if (input.frame * evidence.frameDuration >= evidence.duration) throw Error('frame_export_range');
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,90}\.png$/.test(input.fileName) ||
      /^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])\./i.test(input.fileName)) throw Error('frame_export_filename');
  return { operationId: 'save-comp-frame-png', input: { ...input, expectedRevision: evidence.revision } };
}

module.exports = { build };

'use strict';

function build({ input, evidence }) {
  if (evidence.target.itemId === undefined) throw new Error('layer_overlay_preflight_only');
  if (evidence.overlay.state !== 'none') throw new Error('layer_overlay_existing_or_partial');
  if (evidence.source.file !== input.file) throw new Error('layer_overlay_source_path');
  if (!/^[a-f0-9]{64}$/.test(input.sha256)) throw new Error('layer_overlay_source_digest');
  return { operationId: 'duplicate-and-replace-still', input: { ...input, expectedRevision: evidence.revision } };
}

module.exports = { build };

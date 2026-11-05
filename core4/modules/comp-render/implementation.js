'use strict';

function build({ input, evidence }) {
  const ids = new Set(input.controlledLayerIds);
  if (ids.size !== input.controlledLayerIds.length || !ids.has(input.activeLayerId) ||
      [...ids].some(id => !evidence.layers.some(layer => layer.layerId === id && layer.controllable))) {
    throw new Error('comp_render_targets');
  }
  if (!evidence.queueIdle) throw new Error('comp_render_queue_busy');
  if ((input.startFrame + input.frameCount) * evidence.frameDuration > evidence.duration + 0.00001 ||
      input.frameCount * evidence.frameDuration > 8) throw new Error('comp_render_frame_range');
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,90}\.mp4$/.test(input.fileName) ||
      /^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])\./i.test(input.fileName)) throw new Error('comp_render_output');
  if ([input.renderTemplate, input.outputTemplate].some(name => /[\x00-\x1f\x7f]/.test(name))) throw new Error('comp_render_template');
  return { operationId: 'render-text-variant', input: { ...input, expectedRevision: evidence.revision } };
}

module.exports = { build };

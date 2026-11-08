'use strict';

function build({ input, evidence }) {
  if (evidence.hasExpressions) throw new Error('layer_insert_expression_scope');
  const anchor = evidence.stack.findIndex(layer => layer.id === input.layerId);
  if (anchor < 0 || evidence.stack.length >= 96 || evidence.revision.length > 31700) throw new Error('layer_insert_stack');
  const index = anchor + (input.placement === 'below' ? 1 : 0);
  const upper = evidence.stack[index - 1], lower = evidence.stack[index];
  if (upper && lower && (upper.matteId === lower.id || lower.matteId === upper.id)) throw new Error('layer_insert_matte_pair');
  const frame = evidence.frameDuration;
  if (input.inFrame >= input.outFrame || input.outFrame * frame > evidence.duration + 0.00002 || Math.abs(input.startFrame * frame) > 10800 ||
      input.startFrame > input.inFrame ||
      evidence.source.kind !== 'still' && (input.outFrame - input.startFrame) * frame > evidence.source.duration + 0.00002) {
    throw new Error('layer_insert_frame_range');
  }
  if (/[\x00-\x1f]/.test(input.name) ||
      [input.position, input.scale].some(vector => vector && vector.length !== 2)) throw new Error('layer_insert_properties');
  return { operationId: 'insert-footage-layer', input: { ...input, expectedRevision: evidence.revision } };
}

module.exports = { build };

'use strict';

function build({ input, evidence }) {
  const { slot, layerId, name, text, ranges, placement } = input;
  if (!/^[a-z][a-z0-9-]{0,39}$/.test(slot) || /[\u0000-\u001f\u007f-\u009f]/.test(name)) throw new Error('text_layer_name');
  const lines = text.split('\n');
  if (lines.length > 12 || lines.some(line => !line.trim() || /[\u0000-\u001f\u007f-\u009f\u2028\u2029\ud800-\udfff]/.test(line))) {
    throw new Error('text_layer_text');
  }
  let end = 0;
  for (const range of ranges) {
    if (range.start !== end || range.end <= range.start || range.end > text.length ||
        !/\S/.test(text.slice(range.start, range.end)) ||
        [range.font, range.fallbackFont].filter(Boolean).some(font => !/^[\x21-\x7e]+$/.test(font)) ||
        !range.fill && !range.stroke) throw new Error('text_layer_range');
    end = range.end;
  }
  if (end !== text.length) throw new Error('text_layer_range');
  const current = evidence.layers.find(layer => layer.slot === slot);
  if (layerId === undefined ? current || evidence.layers.length >= 10 :
      !current || current.layerId !== layerId || current.name !== name || current.issue) {
    throw new Error('text_layer_target');
  }
  if (placement) {
    const { left, top, width, height } = placement.frame;
    if (left + width > evidence.size[0] || top + height > evidence.size[1]) throw new Error('text_layer_frame');
  }
  return { operationId: 'write-point-text', input: { ...input, expectedRevision: evidence.revision } };
}

module.exports = { build };

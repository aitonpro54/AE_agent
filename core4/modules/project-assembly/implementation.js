'use strict';

const canonicalFile = file => file.replace(/\\/g, '/').toLowerCase();
function reject(code) { throw new Error(code); }

function build({ input, evidence }) {
  if (input.durationFrames > input.fps * 10800 || /[\x00-\x1f]/.test(input.name) ||
      evidence.items.some(item => item.name.toLowerCase() === input.name.toLowerCase())) reject('assembly_composition_name_or_duration');
  const imported = new Set(evidence.items.filter(item => item.file).map(item => canonicalFile(item.file)));
  for (const layer of input.layers) {
    if (/[\x00-\x1f]/.test(layer.name) || layer.inFrame >= layer.outFrame || layer.outFrame > input.durationFrames ||
        (layer.sourceId === undefined) === (layer.file === undefined)) reject('assembly_layer_specification');
    if (layer.sourceId !== undefined) {
      const source = evidence.items.find(item => item.id === layer.sourceId);
      if (!source || !['comp', 'still'].includes(source.kind) || source.kind === 'comp' &&
          source.duration + 0.00002 < (layer.outFrame - layer.inFrame) / input.fps) reject('assembly_source_unavailable');
      continue;
    }
    const file = canonicalFile(layer.file);
    if (!/^[a-z]:\/(?:[^/:*?"<>|\x00-\x1f]+\/)*[^/:*?"<>|\x00-\x1f]+\.(?:jpe?g|png)$/.test(file) ||
        file.slice(3).split('/').some(part => /[. ]$/.test(part) || /^(?:con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/.test(part)) ||
        imported.has(file)) reject('assembly_import_path');
    imported.add(file);
  }
  return { operationId: 'assemble-composition', input: { ...input, expectedRevision: evidence.revision } };
}

module.exports = { build };

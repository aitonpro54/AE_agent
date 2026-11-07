'use strict';
const { canonical, fail } = require('../protocol/json');
const canonicalFile = file => file.replace(/\\/g, '/').toLowerCase();
const near = (a, b) => Math.abs(a - b) <= 0.00002;

function createProjectAssemblyProof(currentSessionId) {
  return {
    assertTarget(target) {
      if (target.sessionId !== currentSessionId()) fail('assembly_work_session_changed');
    },
    validateResult({ input, before }, after) {
      const previous = new Set(before.items.map(item => item.id));
      const additions = after.items.filter(item => !previous.has(item.id));
      const compItem = additions.find(item => item.kind === 'comp' && item.name === input.name);
      const comp = after.assemblies.find(item => item.id === compItem?.id);
      if (!comp || comp.width !== input.width || comp.height !== input.height || comp.pixelAspect !== 1 ||
          Math.abs(1 / comp.frameDuration - input.fps) > input.fps * 0.000005 ||
          !near(comp.duration, input.durationFrames * comp.frameDuration) ||
          comp.layers.length !== input.layers.length || canonical(after.items.filter(item => previous.has(item.id))) !== canonical(before.items) ||
          canonical(after.assemblies.filter(item => item.id !== comp.id)) !== canonical(before.assemblies) ||
          additions.length !== 1 + input.layers.filter(layer => layer.file !== undefined).length) fail('assembly_readback');
      const newSources = new Set();
      for (const [index, layer] of input.layers.entries()) {
        const actual = comp.layers[index];
        const start = layer.inFrame * comp.frameDuration, end = layer.outFrame * comp.frameDuration;
        if (actual.name !== layer.name || actual.enabled !== true || !near(actual.startTime, start) ||
            !near(actual.inPoint, start) || !near(actual.outPoint, end)) fail('assembly_layer_readback');
        if (layer.file === undefined) {
          if (actual.sourceId !== layer.sourceId) fail('assembly_source_readback');
        } else {
          const source = additions.find(item => item.id === actual.sourceId);
          if (!source || source.kind !== 'still' || !source.file || canonicalFile(source.file) !== canonicalFile(layer.file) ||
              newSources.has(source.id)) fail('assembly_source_readback');
          newSources.add(source.id);
        }
      }
    }
  };
}

module.exports = { createProjectAssemblyProof };

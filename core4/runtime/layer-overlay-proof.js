'use strict';

const { canonical, fail } = require('../protocol/json');
const { validReplacementScope } = require('../core/resources');
const { assertImportFile, lockImportFile } = require('./media-layer-proof');
const { plainPath, samePath } = require('./project-file');

function verifiedCopyFiles(target) {
  const { projectId, replacement: { referenceProject, projectSha256 } } = target;
  if (!/\.aep$/i.test(projectId)) fail('layer_overlay_copy_binding');
  const working = plainPath(projectId), reference = plainPath(referenceProject);
  if (samePath(working.resolved, reference.resolved) ||
      working.info.dev === reference.info.dev && working.info.ino === reference.info.ino ||
      working.info.size !== reference.info.size || working.info.size < 1n || working.info.size > 1073741824n) {
    fail('layer_overlay_copy_binding');
  }
  return [working, reference].map(({ resolved, info }) => ({
    input: { file: resolved, sha256: projectSha256 },
    observed: { bytes: Number(info.size), modifiedMs: Number(info.mtimeNs / 1000000n) }
  }));
}

function createLayerOverlayProof(currentSessionId, lock = lockImportFile) {
  function assertTarget(target) {
    if (target.sessionId !== currentSessionId()) fail('layer_overlay_work_session_changed');
    if (!validReplacementScope(target)) fail('layer_overlay_copy_binding');
  }
  function assertSource(input, snapshot) {
    if (input.file !== snapshot.source.file) fail('layer_overlay_source_path');
    assertImportFile(input, snapshot.source);
  }
  return {
    assertTarget,
    async lockSource({ input, before, descriptor }) {
      if (before.overlay.state !== 'none') fail('layer_overlay_existing_or_partial');
      if (input.file !== before.source.file) fail('layer_overlay_source_path');
      const origin = descriptor.executionScope.origin;
      if (!input.replacement) return lock(input, before.source, origin);
      const files = verifiedCopyFiles(input);
      files.push({ input, observed: before.source });
      const results = await Promise.allSettled(files.map(async file => lock(file.input, file.observed, origin)));
      const locks = results.filter(result => result.status === 'fulfilled').map(result => result.value);
      const release = () => { for (const held of locks) held.release(); };
      const assert = () => { for (const held of locks) held.assert(); };
      try {
        const error = results.find(result => result.status === 'rejected');
        if (error) throw error.reason;
        assert();
        for (const file of verifiedCopyFiles(input)) assertImportFile(file.input, file.observed);
        return { assert, release };
      } catch (error) {
        release();
        throw error;
      }
    },
    validateResult({ input, before }, after) {
      assertSource(input, after);
      const { id, state, signature, sourceId } = after.overlay;
      const index = before.stack.findIndex(layer => layer.id === input.layerId);
      const original = before.stack[index];
      const inserted = after.stack[index];
      const replacement = input.replacement;
      const expectedStack = before.stack.slice();
      if (replacement) {
        for (const file of verifiedCopyFiles(input)) assertImportFile(file.input, file.observed);
        const old = before.stack[index - 1];
        if (old?.id !== replacement.retiredLayerId || old.sourceId !== input.itemId) fail('layer_overlay_readback');
        const oldStamp = JSON.parse(old.stamp);
        if (oldStamp[2] !== true) fail('layer_overlay_readback');
        oldStamp[2] = false;
        expectedStack[index - 1] = { ...old, stamp: JSON.stringify(oldStamp) };
      }
      if (before.overlay.state !== 'none' || !original || original.sourceId !== input.originalSourceId ||
          after.stack.length !== before.stack.length + 1 || state !== 'applied' || !id ||
          sourceId !== input.itemId || after.signature !== before.signature || signature !== before.signature || !inserted || inserted.id !== id ||
          inserted.sourceId !== input.itemId || before.stack.some(layer => layer.id === id) ||
          after.protected !== before.protected ||
          canonical(after.stack.filter(layer => layer.id !== id).map(layer => [layer.id, layer.sourceId, JSON.parse(layer.stamp)])) !==
            canonical(expectedStack.map(layer => [layer.id, layer.sourceId, JSON.parse(layer.stamp)])) ||
          canonical(after.source) !== canonical(before.source) || canonical(after.uses) !== canonical(before.uses)) {
        fail('layer_overlay_readback');
      }
      const expectedStamp = JSON.parse(original.stamp);
      if (replacement) {
        if (expectedStamp[2] !== true) fail('layer_overlay_readback');
        expectedStamp[0] = replacement.name;
      }
      expectedStamp[1] += '\n[AECore4 overlay v1:' + input.layerId + ':' + input.itemId + ']';
      if (canonical(JSON.parse(inserted.stamp)) !== canonical(expectedStamp)) fail('layer_overlay_readback');
    }
  };
}

module.exports = { createLayerOverlayProof };

'use strict';
const fs = require('node:fs');
const { createHash } = require('node:crypto');
const { canonical, fail } = require('../protocol/json');
const { plainPath } = require('./project-save-proof');

const fileKey = file => file.replace(/\\/g, '/').toLowerCase();
const same = (a, b) => canonical(a) === canonical(b);
const near = (a, b) => Math.abs(a - b) <= 0.00002;

function assertImportFile(input, observed) {
  const { resolved, info } = plainPath(input.file);
  const modifiedMs = Number(info.mtimeNs / 1000000n);
  const nativeTime = observed.modifiedMs;
  if (info.size !== BigInt(observed.bytes) ||
      (nativeTime % 1000 === 0 ? Math.floor(modifiedMs / 1000) * 1000 !== nativeTime : Math.abs(modifiedMs - nativeTime) > 1)) {
    fail('media_import_file_changed');
  }
  const digest = createHash('sha256');
  const fd = fs.openSync(resolved, 'r');
  const assertSame = current => {
    if (['dev', 'ino', 'size', 'mtimeNs', 'ctimeNs', 'nlink'].some(key => info[key] !== current[key])) fail('media_import_file_changed');
  };
  try {
    assertSame(fs.fstatSync(fd, { bigint: true }));
    const buffer = Buffer.allocUnsafe(1024 * 1024);
    for (let remaining = observed.bytes; remaining > 0;) {
      const count = fs.readSync(fd, buffer, 0, Math.min(remaining, buffer.length), null);
      if (count === 0) fail('media_import_file_changed');
      digest.update(buffer.subarray(0, count));
      remaining -= count;
    }
    assertSame(fs.fstatSync(fd, { bigint: true }));
    assertSame(plainPath(resolved).info);
    if (digest.digest('hex') !== input.sha256) fail('media_import_digest_mismatch');
  } finally { fs.closeSync(fd); }
}

function createMediaLayerProof(moduleId, currentSessionId) {
  const assertTarget = target => {
    if (target.sessionId !== currentSessionId()) fail('media_layer_work_session_changed');
  };
  if (moduleId === 'media-import') return {
    assertTarget,
    prepareCheckpoint({ input, before }) { assertImportFile(input, before); },
    validateResult({ input, before }, after) {
      assertImportFile(input, after);
      const previous = new Set(before.items.map(item => item.id));
      const additions = after.items.filter(item => !previous.has(item.id));
      if (additions.length !== 1 || after.createdItemId !== additions[0].id || !['still', 'av'].includes(additions[0].kind) ||
          fileKey(additions[0].file) !== fileKey(input.file) || before.bytes !== after.bytes ||
          before.modifiedMs !== after.modifiedMs ||
          !same(after.items.filter(item => previous.has(item.id)), before.items)) fail('media_import_readback');
    }
  };
  if (moduleId !== 'layer-insert') fail('media_layer_proof_module');
  return {
    assertTarget,
    validateResult({ input, before }, after) {
      const index = before.stack.findIndex(layer => layer.id === input.layerId) + (input.placement === 'below' ? 1 : 0);
      const inserted = after.stack[index], frame = before.frameDuration;
      if (after.stack.length !== before.stack.length + 1 || !inserted || after.createdLayerId !== inserted.id ||
          before.stack.some(layer => layer.id === inserted.id) || inserted.sourceId !== input.itemId ||
          inserted.name !== input.name || !inserted.enabled || inserted.solo || inserted.parentId || inserted.matteId ||
          inserted.stretch !== 100 || !near(inserted.start, input.startFrame * frame) ||
          !near(inserted.inPoint, input.inFrame * frame) || !near(inserted.outPoint, input.outFrame * frame) ||
          input.position && !same(inserted.position, input.position) || input.scale && !same(inserted.scale, input.scale) ||
          !same(after.stack.filter(layer => layer.id !== inserted.id), before.stack) ||
          !same(after.uses, before.uses) || !same(after.source, before.source) ||
          after.hasExpressions || after.frameDuration !== frame || after.duration !== before.duration) fail('layer_insert_readback');
    }
  };
}

module.exports = { createMediaLayerProof, assertImportFile };

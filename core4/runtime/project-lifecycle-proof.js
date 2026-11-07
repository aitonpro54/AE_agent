'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { canonical, exact, fail } = require('../protocol/json');
const { createProjectSaveProof, plainPath, readAep, samePath } = require('./project-save-proof');

const fileKey = file => path.normalize(file);
const sha = /^[a-f0-9]{64}$/;

function createProjectLifecycleProof(options) {
  const save = createProjectSaveProof(options);
  const checkpointFile = (payload, ref) => save.checkpointPath(payload.checkpointRoot, ref);
  const dirIdentity = directory => {
    const { resolved, info } = plainPath(directory, true);
    return { path: resolved, device: String(info.dev), inode: String(info.ino) };
  };
  function reserveDestination(destination, marker) {
    const parent = path.dirname(fileKey(destination));
    plainPath(path.dirname(parent), true);
    try { fs.mkdirSync(parent, { mode: 0o700 }); }
    catch (error) { if (error.code === 'EEXIST') fail('lifecycle_new_directory_required'); throw error; }
    const record = { destination, directory: dirIdentity(parent) };
    const fd = fs.openSync(marker, 'wx', 0o600);
    try { fs.writeFileSync(fd, canonical(record)); fs.fsyncSync(fd); }
    finally { fs.closeSync(fd); }
  }
  function assertDestination(destination, marker) {
    const file = plainPath(marker).resolved;
    if (fs.statSync(file).size > 16384) fail('lifecycle_destination_reservation');
    const record = { destination, directory: dirIdentity(path.dirname(fileKey(destination))) };
    if (canonical(record) !== fs.readFileSync(file, 'utf8')) fail('lifecycle_destination_reservation');
  }
  return {
    assertTarget: save.assertTarget,
    prepareCheckpoint(ctx) {
      if (!['save-as', 'create'].includes(ctx.input.action) || !ctx.input.destination || samePath(fileKey(ctx.input.destination), fileKey(ctx.input.projectId))) fail('lifecycle_destination_path');
      if (ctx.input.action === 'create' && ctx.before.dirty) fail('lifecycle_clean_source_required');
      save.prepareCheckpoint(ctx);
      reserveDestination(ctx.input.destination, checkpointFile(ctx.input, ctx.checkpoint.ref) + '.destination.json');
    },
    observe(command, snapshot) {
      exact(snapshot, ['target', 'revision', 'protected', 'currentProject', 'dirty', 'fileStamp', 'inventory']);
      const { sessionId, projectId, destination, action, _execution } = command.payload;
      const changed = command.phase === 'mutate';
      if (canonical(snapshot.target) !== canonical({ projectId, sessionId }) || snapshot.protected !== projectId ||
          typeof snapshot.currentProject !== 'string' || !samePath(fileKey(snapshot.currentProject), fileKey(changed ? destination : projectId)) ||
          typeof snapshot.dirty !== 'boolean' || typeof snapshot.inventory !== 'string') fail('lifecycle_native_readback');
      const current = readAep(snapshot.currentProject, snapshot.fileStamp);
      const checkpointRoot = save.checkpointDirectory();
      const observed = { ...snapshot, savedFileSha256: current.digest, checkpointRoot };
      if (!changed) return observed;
      const { expectedSavedSha256, expectedFileStamp } = command.payload;
      if (snapshot.dirty || !['save-as', 'create'].includes(action) || readAep(projectId, expectedFileStamp).digest !== expectedSavedSha256 ||
          checkpointRoot !== command.payload.checkpointRoot) fail('lifecycle_source_changed');
      const file = checkpointFile(command.payload, _execution.checkpointRef);
      assertDestination(destination, file + '.destination.json');
      const checkpoint = save.checkpointFacts(file, expectedSavedSha256, expectedFileStamp.bytes);
      return { ...observed, transition: { action, sourceSha256: expectedSavedSha256, checkpoint } };
    },
    validateResult({ input, before, checkpoint }, after) {
      const file = checkpointFile(input, checkpoint.ref);
      const expected = { action: input.action, sourceSha256: input.expectedSavedSha256,
        checkpoint: { path: file, sha256: input.expectedSavedSha256, bytes: before.fileStamp.bytes, scope: 'on-disk-before-save' } };
      if (after.dirty !== false || !sha.test(after.savedFileSha256) || !samePath(fileKey(after.currentProject), fileKey(input.destination)) ||
          after.inventory !== (input.action === 'create' ? '[]' : before.inventory) || canonical(after.transition) !== canonical(expected)) fail('lifecycle_disk_readback');
    }
  };
}

module.exports = { createProjectLifecycleProof };

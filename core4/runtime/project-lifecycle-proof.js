'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { canonical, exact, fail } = require('../protocol/json');
const { createProjectSaveProof, plainPath, readAep, samePath } = require('./project-save-proof');

const fileKey = file => path.normalize(file);
const sha = /^[a-f0-9]{64}$/;
const supportedActions = ['save-as', 'create', 'open'];

function writeExclusive(file, bytes) {
  const fd = fs.openSync(file, 'wx', 0o600);
  try { fs.writeFileSync(fd, bytes); fs.fsyncSync(fd); }
  finally { fs.closeSync(fd); }
}

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
    writeExclusive(marker, canonical(record));
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
      const { action, destination, projectId, expectedDestinationSha256 } = ctx.input;
      if (!supportedActions.includes(action) || !destination || samePath(fileKey(destination), fileKey(projectId))) fail('lifecycle_destination_path');
      if (action !== 'save-as' && ctx.before.dirty) fail('lifecycle_clean_source_required');
      const target = action === 'open' ? readAep(destination) : null;
      if (target && target.digest !== expectedDestinationSha256) fail('lifecycle_destination_hash');
      save.prepareCheckpoint(ctx);
      const file = checkpointFile(ctx.input, ctx.checkpoint.ref);
      if (target) {
        const copy = file.replace(/\.aep$/, '.open.aep');
        writeExclusive(copy, target.bytes);
        save.checkpointFacts(copy, target.digest, target.bytes.length);
      } else reserveDestination(destination, file + '.destination.json');
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
      if (snapshot.dirty || !supportedActions.includes(action) || readAep(projectId, expectedFileStamp).digest !== expectedSavedSha256 ||
          checkpointRoot !== command.payload.checkpointRoot) fail('lifecycle_source_changed');
      const file = checkpointFile(command.payload, _execution.checkpointRef);
      if (action === 'open') {
        if (current.digest !== command.payload.expectedDestinationSha256) fail('lifecycle_destination_hash');
        save.checkpointFacts(file.replace(/\.aep$/, '.open.aep'), current.digest, current.bytes.length);
      } else assertDestination(destination, file + '.destination.json');
      const checkpoint = save.checkpointFacts(file, expectedSavedSha256, expectedFileStamp.bytes);
      return { ...observed, transition: { action, sourceSha256: expectedSavedSha256, checkpoint } };
    },
    validateResult({ input, before, checkpoint }, after) {
      const file = checkpointFile(input, checkpoint.ref);
      const expected = { action: input.action, sourceSha256: input.expectedSavedSha256,
        checkpoint: { path: file, sha256: input.expectedSavedSha256, bytes: before.fileStamp.bytes, scope: 'on-disk-before-save' } };
      if (after.dirty !== false || !sha.test(after.savedFileSha256) || !samePath(fileKey(after.currentProject), fileKey(input.destination)) ||
          (input.action === 'open' ? after.savedFileSha256 !== input.expectedDestinationSha256 :
            after.inventory !== (input.action === 'create' ? '[]' : before.inventory)) || canonical(after.transition) !== canonical(expected)) fail('lifecycle_disk_readback');
    }
  };
}

module.exports = { createProjectLifecycleProof };

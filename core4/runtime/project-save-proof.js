'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { canonical, exact, fail } = require('../protocol/json');
const { plainPath, samePath } = require('./project-file');

const MAX_BYTES = 96 * 1024 * 1024;
const CHUNK_BYTES = 1024 * 1024;
const diskError = 'save_disk_proof_unavailable';
const sha256 = /^[a-f0-9]{64}$/;

function readAep(file, expectedStamp, copyFd) {
  if (!/\.aep$/i.test(file) || /[\x00-\x1f]/.test(file) || file.replace(/^[a-z]:/i, '').includes(':')) fail(diskError);
  const { resolved, info } = plainPath(file);
  if (info.size < 1n || info.size > BigInt(MAX_BYTES)) fail(diskError);
  const stamp = { bytes: Number(info.size), modifiedMs: Number(info.mtimeNs / 1000000n) };
  if (expectedStamp) {
    const { modifiedMs } = expectedStamp;
    // AE's Windows File.modified has second precision. SHA-256 binds the full preimage.
    const matchesTime = Number.isSafeInteger(modifiedMs) && (modifiedMs % 1000 === 0
      ? Math.floor(stamp.modifiedMs / 1000) * 1000 === modifiedMs : Math.abs(stamp.modifiedMs - modifiedMs) <= 1);
    if (stamp.bytes !== expectedStamp.bytes || !matchesTime) fail(diskError);
  }
  const fd = fs.openSync(resolved, 'r');
  const assertSame = observed => {
    if (['dev', 'ino', 'size', 'mtimeNs', 'ctimeNs', 'nlink'].some(key => observed[key] !== info[key])) fail(diskError);
  };
  try {
    assertSame(fs.fstatSync(fd, { bigint: true }));
    const chunk = Buffer.allocUnsafe(Math.min(CHUNK_BYTES, stamp.bytes));
    const digest = createHash('sha256');
    for (let offset = 0; offset < stamp.bytes;) {
      const count = fs.readSync(fd, chunk, 0, Math.min(chunk.length, stamp.bytes - offset), offset);
      if (!count) fail(diskError);
      digest.update(chunk.subarray(0, count));
      if (copyFd !== undefined) {
        for (let written = 0; written < count;) {
          const size = fs.writeSync(copyFd, chunk, written, count - written);
          if (!size) fail(diskError);
          written += size;
        }
      }
      offset += count;
    }
    assertSame(fs.fstatSync(fd, { bigint: true }));
    assertSame(plainPath(resolved).info);
    return { bytes: stamp.bytes, digest: digest.digest('hex') };
  } finally { fs.closeSync(fd); }
}

function copyAep(source, destination, expected, expectedStamp) {
  const fd = fs.openSync(destination, 'wx', 0o600);
  try {
    const copied = readAep(source, expectedStamp, fd);
    if (copied.digest !== expected.digest || copied.bytes !== expected.bytes) fail('save_checkpoint_changed');
    fs.fsyncSync(fd);
  } finally { fs.closeSync(fd); }
}

function createProjectSaveProof({ stateDir, currentSessionId }) {
  function checkpointDirectory() {
    const logical = fs.lstatSync(stateDir, { bigint: true });
    if (!logical.isDirectory() || logical.isSymbolicLink() || !samePath(fs.realpathSync(stateDir), stateDir)) fail(diskError);
    // AE runs outside Codex's MSIX filesystem redirection and needs the physical path.
    const physical = plainPath(fs.realpathSync.native(stateDir), true);
    if (logical.dev !== physical.info.dev || logical.ino !== physical.info.ino) fail(diskError);
    return path.join(physical.resolved, 'project-save-checkpoints');
  }
  function checkpointPath(checkpointRoot, ref) {
    if (!/^checkpoint-[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(ref)) fail('save_checkpoint_binding');
    return path.join(checkpointRoot, ref + '.aep');
  }
  function checkpointFacts(file, digest, bytes) {
    const verified = readAep(file);
    if (verified.digest !== digest || verified.bytes !== bytes) fail('save_checkpoint_changed');
    return { path: file, sha256: digest, bytes, scope: 'on-disk-before-save' };
  }
  return {
    checkpointDirectory, checkpointPath, checkpointFacts,
    assertTarget(target) {
      if (target.sessionId !== currentSessionId()) fail('save_work_session_changed');
    },
    prepareCheckpoint({ input, before, checkpoint }) {
      const checkpointRoot = checkpointDirectory();
      if (input.checkpointRoot !== checkpointRoot || !sha256.test(input.expectedSavedSha256)) fail('save_checkpoint_binding');
      const source = readAep(input.projectId, before.fileStamp);
      if (source.digest !== input.expectedSavedSha256) fail('save_disk_changed');
      try { fs.mkdirSync(checkpointRoot, { mode: 0o700 }); }
      catch (error) { if (error.code !== 'EEXIST') throw error; }
      plainPath(checkpointRoot, true);
      const file = checkpointPath(checkpointRoot, checkpoint.ref);
      copyAep(input.projectId, file, source, before.fileStamp);
      checkpointFacts(file, source.digest, source.bytes);
    },
    observe(command, snapshot) {
      exact(snapshot, ['target', 'revision', 'protected', 'dirty', 'fileStamp']);
      const { projectId, sessionId } = command.payload;
      if (canonical(snapshot.target) !== canonical({ projectId, sessionId }) || snapshot.protected !== projectId ||
          typeof snapshot.revision !== 'string' || typeof snapshot.dirty !== 'boolean' || !snapshot.fileStamp) fail(diskError);
      const saved = readAep(projectId, snapshot.fileStamp);
      const checkpointRoot = checkpointDirectory();
      const observed = { ...snapshot, savedFileSha256: saved.digest, checkpointRoot };
      if (command.phase !== 'mutate') return observed;
      const { expectedSavedSha256, expectedFileStamp, _execution } = command.payload;
      if (snapshot.dirty || !sha256.test(expectedSavedSha256) || command.payload.checkpointRoot !== checkpointRoot) fail(diskError);
      plainPath(checkpointRoot, true);
      const checkpoint = checkpointFacts(checkpointPath(checkpointRoot, _execution.checkpointRef), expectedSavedSha256, expectedFileStamp.bytes);
      return { ...observed, checkpoint };
    },
    validateResult({ input, before, checkpoint }, after) {
      const checkpointRoot = checkpointDirectory();
      const expected = { path: checkpointPath(checkpointRoot, checkpoint.ref), sha256: input.expectedSavedSha256,
        bytes: before.fileStamp.bytes, scope: 'on-disk-before-save' };
      if (after.dirty !== false || !sha256.test(after.savedFileSha256) || after.checkpointRoot !== checkpointRoot ||
          canonical(after.checkpoint) !== canonical(expected)) fail('save_disk_readback');
    }
  };
}

module.exports = { createProjectSaveProof, plainPath, readAep, copyAep, samePath };

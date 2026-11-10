'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { canonical, exact, fail } = require('../protocol/json');
const { createProjectSaveProof, plainPath, readAep, copyAep, samePath } = require('./project-save-proof');

const fileKey = file => path.normalize(file);
const sha = /^[a-f0-9]{64}$/;
const renderAction = 'stage-render-copy';
const supportedActions = ['save-as', 'create', 'open', renderAction];
const scratchName = 'core4-r1-scratch.mp4';
const mediaBudget = 1024 ** 3;
const boundedInteger = (value, min, max = 2147483647) => Number.isSafeInteger(value) && value >= min && value <= max;
const mediaName = /\.(?:png|jpe?g|tiff?|bmp|mp4|mov|wav|aiff?|mp3|m4a)$/i;
const invalidPathChar = /[\x00-\x1f:*?"<>|]/;
const reserved = /^(?:con|prn|aux|nul|com[0-9¹²³]|lpt[0-9¹²³])(?:\.|$)/i;

function validateRenderInput({ action, render }, allowRenderCopy) {
  if (action !== renderAction) {
    if (render !== undefined) fail('lifecycle_render_policy');
    return;
  }
  if (allowRenderCopy !== true) fail('lifecycle_render_policy');
  exact(render, ['compId', 'fps', 'audio', 'output', 'startFrame', 'endFrameExclusive']);
  if (!boundedInteger(render.compId, 1) || typeof render.fps !== 'string' || !/^[1-9]\d{0,6}\/[1-9]\d{0,6}$/.test(render.fps) ||
      typeof render.audio !== 'boolean' || (render.startFrame === undefined) !== (render.endFrameExclusive === undefined) ||
      render.startFrame !== undefined && (!boundedInteger(render.startFrame, 0) || !boundedInteger(render.endFrameExclusive, render.startFrame + 1)))
    fail('lifecycle_render_target');
}

function assertNewOutput(output) {
  if (typeof output !== 'string' || !path.isAbsolute(output) || !samePath(fileKey(output), output) ||
      invalidPathChar.test(output.replace(/^[a-z]:/i, '')) || !/^[\w.-]+\.mp4$/i.test(path.basename(output)) ||
      reserved.test(path.basename(output)) || fs.lstatSync(output, { throwIfNoEntry: false })) fail('lifecycle_render_output');
  plainPath(path.dirname(output), true);
}

function renderWitness(job, input, pinned) {
  exact(job, ['target', 'queue', 'media', 'output', 'scratchOutput']);
  const { target, queue, media } = job, { render, destination } = input;
  exact(target, ['compId', 'compName', 'queueIndex', 'frames', 'width', 'height', 'fps', 'audio', 'timeline', 'range']);
  exact(target.timeline, ['startFrame', 'frameCount']);
  const { startFrame, frameCount } = target.timeline;
  if (target.compId !== render.compId || target.fps !== render.fps || target.audio !== render.audio ||
      !boundedInteger(target.width, 1, 30000) || !boundedInteger(target.height, 1, 30000) ||
      !boundedInteger(startFrame, 0) || !boundedInteger(frameCount, 1) || startFrame + frameCount - 1 > 2147483647 ||
      typeof target.compName !== 'string' || !target.compName.length || target.compName.length > 128 || /[\x00-\x1f]/.test(target.compName) ||
      job.output !== render.output || typeof job.scratchOutput !== 'string' ||
      !samePath(job.scratchOutput, path.join(path.dirname(fileKey(destination)), scratchName)) ||
      !Array.isArray(queue) || !queue.length || queue.length > 64 || target.queueIndex !== queue.length ||
      !Array.isArray(media) || media.length > 128) fail('lifecycle_render_readback');
  if (render.startFrame === undefined) {
    if (target.range !== undefined || target.frames !== frameCount) fail('lifecycle_render_readback');
  } else if (render.endFrameExclusive > frameCount || target.frames !== render.endFrameExclusive - render.startFrame ||
      canonical(target.range) !== canonical({ startFrame: startFrame + render.startFrame, endFrameExclusive: startFrame + render.endFrameExclusive })) {
    fail('lifecycle_render_readback');
  }
  for (const [offset, row] of queue.entries()) {
    if (offset === queue.length - 1) {
      if (canonical(row) !== canonical({ index: target.queueIndex, name: target.compName, status: 'Queued',
        compId: target.compId, format: 'H.264', frames: frameCount, startFrame })) fail('lifecycle_render_readback');
    } else {
      exact(row, ['index', 'name', 'status']);
      if (row.index !== offset + 1 || typeof row.name !== 'string' || !row.name.length || row.name.length > 128 ||
          !['Unqueued', 'Needs Output', 'User Stopped', 'Error Stopped', 'Done'].includes(row.status)) fail('lifecycle_render_readback');
    }
  }
  const seen = new Set();
  let bytes = 0;
  for (const item of media) {
    exact(item, ['path', 'bytes', 'modifiedMs', ...(pinned ? ['sha256'] : [])]);
    if (typeof item.path !== 'string' || !path.isAbsolute(item.path) || !samePath(fileKey(item.path), item.path) ||
        item.path.length > 4096 || invalidPathChar.test(item.path.replace(/^[a-z]:/i, '')) || !mediaName.test(item.path) ||
        !boundedInteger(item.bytes, 1, mediaBudget) || !boundedInteger(item.modifiedMs, 0, Number.MAX_SAFE_INTEGER) ||
        (bytes += item.bytes) > mediaBudget || pinned && !sha.test(item.sha256)) fail('lifecycle_render_media');
    const key = process.platform === 'win32' ? item.path.toLowerCase() : item.path;
    if (seen.has(key)) fail('lifecycle_render_media');
    seen.add(key);
  }
}

function pinMedia(item) {
  const { resolved, info } = plainPath(item.path);
  const modified = Number(info.mtimeNs / 1000000n);
  const matchesTime = item.modifiedMs % 1000 === 0
    ? Math.floor(modified / 1000) * 1000 === item.modifiedMs : Math.abs(modified - item.modifiedMs) <= 1;
  if (info.size !== BigInt(item.bytes) || !matchesTime) fail('lifecycle_render_media_changed');
  const fd = fs.openSync(resolved, 'r');
  const assertSame = current => {
    if (['dev', 'ino', 'size', 'mtimeNs', 'ctimeNs', 'nlink'].some(field => current[field] !== info[field]))
      fail('lifecycle_render_media_changed');
  };
  try {
    assertSame(fs.fstatSync(fd, { bigint: true }));
    const hash = createHash('sha256'), buffer = Buffer.allocUnsafe(Math.min(item.bytes, 1024 * 1024));
    for (let offset = 0; offset < item.bytes;) {
      const read = fs.readSync(fd, buffer, 0, Math.min(buffer.length, item.bytes - offset), offset);
      if (!read) fail('lifecycle_render_media_changed');
      hash.update(buffer.subarray(0, read));
      offset += read;
    }
    assertSame(fs.fstatSync(fd, { bigint: true }));
    assertSame(plainPath(resolved).info);
    return { ...item, sha256: hash.digest('hex') };
  } finally { fs.closeSync(fd); }
}
function allowsDirtyDestination({ action, allowDirtyDestination }) {
  if (allowDirtyDestination !== undefined && (action !== 'open' || typeof allowDirtyDestination !== 'boolean')) fail('lifecycle_dirty_destination_policy');
  return action === 'open' && allowDirtyDestination === true;
}

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
      allowsDirtyDestination(ctx.input);
      validateRenderInput(ctx.input, options.allowRenderCopy);
      if (action === renderAction) assertNewOutput(ctx.input.render.output);
      const target = action === 'open' ? readAep(destination) : null;
      if (target && target.digest !== expectedDestinationSha256) fail('lifecycle_destination_hash');
      save.prepareCheckpoint(ctx);
      const file = checkpointFile(ctx.input, ctx.checkpoint.ref);
      if (target) {
        const copy = file.replace(/\.aep$/, '.open.aep');
        copyAep(destination, copy, target);
        save.checkpointFacts(copy, target.digest, target.bytes);
      } else reserveDestination(destination, file + '.destination.json');
    },
    observe(command, snapshot) {
      const { sessionId, projectId, destination, action, _execution } = command.payload;
      const changed = command.phase === 'mutate';
      const staged = changed && action === renderAction;
      exact(snapshot, ['target', 'revision', 'protected', 'currentProject', 'dirty', 'fileStamp', 'inventory', ...(staged ? ['renderJob'] : [])]);
      if (canonical(snapshot.target) !== canonical({ projectId, sessionId }) || snapshot.protected !== projectId ||
          typeof snapshot.currentProject !== 'string' || !samePath(fileKey(snapshot.currentProject), fileKey(changed ? destination : projectId)) ||
          typeof snapshot.dirty !== 'boolean' || typeof snapshot.inventory !== 'string') fail('lifecycle_native_readback');
      const current = readAep(snapshot.currentProject, snapshot.fileStamp);
      const checkpointRoot = save.checkpointDirectory();
      const observed = { ...snapshot, savedFileSha256: current.digest, checkpointRoot };
      if (!changed) return observed;
      const { expectedSavedSha256, expectedFileStamp } = command.payload;
      const dirtyAllowed = allowsDirtyDestination(command.payload);
      validateRenderInput(command.payload, options.allowRenderCopy);
      if (snapshot.dirty && !dirtyAllowed) fail('lifecycle_native_readback');
      if (!supportedActions.includes(action) || readAep(projectId, expectedFileStamp).digest !== expectedSavedSha256 ||
          checkpointRoot !== command.payload.checkpointRoot) fail('lifecycle_source_changed');
      const file = checkpointFile(command.payload, _execution.checkpointRef);
      if (action === 'open') {
        if (current.digest !== command.payload.expectedDestinationSha256) fail('lifecycle_destination_hash');
        save.checkpointFacts(file.replace(/\.aep$/, '.open.aep'), current.digest, current.bytes);
      } else assertDestination(destination, file + '.destination.json');
      const checkpoint = save.checkpointFacts(file, expectedSavedSha256, expectedFileStamp.bytes);
      if (staged) {
        renderWitness(snapshot.renderJob, command.payload, false);
        const { renderJob } = snapshot;
        assertNewOutput(renderJob.output);
        assertNewOutput(renderJob.scratchOutput);
        observed.renderJob = { ...renderJob, media: renderJob.media.map(pinMedia) };
        if (readAep(snapshot.currentProject, snapshot.fileStamp).digest !== current.digest) fail('lifecycle_disk_readback');
      }
      return { ...observed, transition: { action, sourceSha256: expectedSavedSha256, checkpoint } };
    },
    validateResult({ input, before, checkpoint }, after) {
      const file = checkpointFile(input, checkpoint.ref);
      const expected = { action: input.action, sourceSha256: input.expectedSavedSha256,
        checkpoint: { path: file, sha256: input.expectedSavedSha256, bytes: before.fileStamp.bytes, scope: 'on-disk-before-save' } };
      const dirtyAllowed = allowsDirtyDestination(input);
      validateRenderInput(input, options.allowRenderCopy);
      if (input.action === renderAction) renderWitness(after.renderJob, input, true);
      if (typeof after.dirty !== 'boolean' || after.dirty && !dirtyAllowed || !sha.test(after.savedFileSha256) || !samePath(fileKey(after.currentProject), fileKey(input.destination)) ||
          (input.action === 'open' ? after.savedFileSha256 !== input.expectedDestinationSha256 :
            after.inventory !== (input.action === 'create' ? '[]' : before.inventory)) || canonical(after.transition) !== canonical(expected)) fail('lifecycle_disk_readback');
    }
  };
}

module.exports = { createProjectLifecycleProof };

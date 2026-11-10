'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { canonical, fail, hash } = require('../protocol/json');
const { plainPath, samePath } = require('./project-file');
const { createJobs } = require('./aerender-jobs');

const uuid = '[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}';
const jobId = new RegExp('^' + uuid + '$');
const taskIdPattern = new RegExp('^task-' + uuid + '$');
const commandIdPattern = new RegExp('^command-' + uuid + '$');
const sha256 = /^[0-9a-f]{64}$/;
const policy = 'current-matching-target-after-local-confirmation-v1';
const toolNames = ['engine', 'ffmpeg', 'ffprobe'];
const noGuard = () => {};

const matches = (value, pattern) => typeof value === 'string' && pattern.test(value);
const exact = (value, keys) => value && Object.getPrototypeOf(value) === Object.prototype &&
  Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const absolute = file => typeof file === 'string' && path.isAbsolute(file) &&
  samePath(path.normalize(file), path.resolve(file)) && !/[\x00-\x1f"<>|?*]/.test(file) &&
  (process.platform !== 'win32' || /^[a-z]:[\\/]/i.test(file) &&
    !file.slice(3).split(/[\\/]/).some(part => part.includes(':') || /[. ]$/.test(part) ||
      /^(?:con|prn|aux|nul|com[0-9¹²³]|lpt[0-9¹²³])(?:\.|$)/i.test(part)));
const equalPath = (a, b) => absolute(a) && absolute(b) && samePath(path.normalize(a), path.normalize(b));

function inDirectory(directory, file) {
  const relative = path.relative(directory, file);
  return relative === '' || !path.isAbsolute(relative) && relative !== '..' && !relative.startsWith('..' + path.sep);
}

function stableId(installationId, commandId) {
  const hex = hash(['ae-core4/render-job/v1', installationId, commandId]);
  const variant = ((parseInt(hex[16], 16) & 3) | 8).toString(16);
  return [hex.slice(0,8), hex.slice(8,12), '8' + hex.slice(13,16),
    variant + hex.slice(17,20), hex.slice(20,32)].join('-');
}

function readToolchain(directory) {
  const file = path.join(directory, 'render-job-toolchain.json');
  let value;
  try {
    const { info, resolved } = plainPath(file);
    if (info.size < 1n || info.size > 16384n) fail('render_job_toolchain');
    const unchanged = current => ['dev', 'ino', 'size', 'mtimeNs', 'ctimeNs', 'nlink'].every(key => info[key] === current[key]);
    const fd = fs.openSync(resolved, 'r');
    try {
      if (!unchanged(fs.fstatSync(fd, { bigint: true }))) fail('render_job_toolchain');
      const bytes = Buffer.alloc(Number(info.size));
      if (fs.readSync(fd, bytes, 0, bytes.length, 0) !== bytes.length || !unchanged(fs.fstatSync(fd, { bigint: true })) ||
          !unchanged(plainPath(file).info)) fail('render_job_toolchain');
      value = JSON.parse(bytes.toString('utf8'));
    } finally { fs.closeSync(fd); }
  } catch { fail('render_job_toolchain'); }
  if (!exact(value, toolNames) || !toolNames.every(key =>
    exact(value[key], ['path', 'sha256']) && absolute(value[key].path) && matches(value[key].sha256, sha256))) {
    fail('render_job_toolchain');
  }
  return Object.fromEntries(toolNames.map(key => [key, { path:path.normalize(value[key].path), sha256:value[key].sha256 }]));
}

function stageSpec(command, taskId, commandId, protectedDirectories) {
  const { input, after, selected, executionPolicy } = command || {};
  if (command?.taskId !== taskId || command.commandId !== commandId || command.state !== 'succeeded' ||
      command.verificationKind !== 'local-transaction-receipt' || selected?.moduleId !== 'project-lifecycle' ||
      selected.contract?.operationId !== 'transition-project' || executionPolicy?.policyId !== policy ||
      input?.action !== 'stage-render-copy' || after?.dirty !== false || !matches(after.savedFileSha256, sha256)) {
    fail('render_job_stage_receipt');
  }
  const render = input.render, witness = after.renderJob, target = witness?.target;
  if (!render || !target?.timeline || target.compId !== render.compId || target.fps !== render.fps || target.audio !== render.audio ||
      !equalPath(after.currentProject, input.destination) || equalPath(after.currentProject, input.projectId) ||
      !equalPath(witness.output, render.output) || !absolute(witness.scratchOutput) || equalPath(witness.output, witness.scratchOutput) ||
      !equalPath(path.join(path.dirname(after.currentProject), 'core4-r1-scratch.mp4'), witness.scratchOutput) ||
      equalPath(path.dirname(after.currentProject), path.dirname(witness.output))) {
    fail('render_job_stage_binding');
  }
  const { startFrame, endFrameExclusive } = render;
  if (startFrame === undefined && endFrameExclusive === undefined ? target.range !== undefined :
    !Number.isSafeInteger(startFrame) || !Number.isSafeInteger(endFrameExclusive) ||
    target.range?.startFrame !== target.timeline.startFrame + startFrame ||
    target.range?.endFrameExclusive !== target.timeline.startFrame + endFrameExclusive) {
    fail('render_job_stage_binding');
  }
  const output = path.normalize(witness.output), projectPath = path.normalize(after.currentProject);
  if (protectedDirectories.some(directory => inDirectory(directory, output) || inDirectory(directory, projectPath))) {
    fail('render_job_protected_path');
  }
  if (!Array.isArray(witness.queue) || !Array.isArray(witness.media) ||
      !witness.media.every(item => absolute(item?.path) && matches(item.sha256, sha256))) fail('render_job_stage_binding');
  return { project:{path:projectPath,sha256:after.savedFileSha256}, output, target, queue:witness.queue,
    media:witness.media.map(item => ({path:path.normalize(item.path),sha256:item.sha256})) };
}

function safeFailure(error) {
  const code = error?.code || error?.message;
  if (matches(code, /^[a-z][a-z0-9_]{1,99}$/)) {
    return { state:'rejected', code };
  }
  return { state:'rejected', code:'render_job_local_failure' };
}

function publicResult(result) {
  const { id, state, media, output } = result;
  if (state === 'published') return { id, state, path:result.path, sha256:result.sha256, bytes:result.bytes, media };
  if (state === 'verified') return { id, state, output:{sha256:output.sha256,bytes:output.bytes}, media };
  if (matches(result.error, /^aerender_[a-z_]+$/)) return { id, state, code:result.error };
  return { id, state };
}

function createRenderJobOwner({ stateDir, installationId, getCommand }) {
  function locations() {
    if (!absolute(stateDir)) fail('render_job_state');
    const logical = fs.lstatSync(stateDir, { bigint:true });
    const { resolved, info } = plainPath(fs.realpathSync.native(stateDir), true);
    if (!logical.isDirectory() || logical.isSymbolicLink() || logical.dev !== info.dev || logical.ino !== info.ino ||
        !samePath(fs.realpathSync(stateDir), stateDir)) fail('render_job_state');
    const stateParent = path.dirname(resolved);
    const installRoot = samePath(path.basename(stateParent), 'state') && samePath(path.basename(resolved), 'production')
      ? path.dirname(stateParent) : resolved;
    return { directory:resolved, root:path.join(resolved, 'render-jobs-v1'),
      protectedDirectories:[installRoot, path.resolve(__dirname, '..')] };
  }

  function authorizationFor(taskId, commandId, spec) {
    return { installationId, taskId, commandId, stageHash:hash(spec) };
  }

  function readPreparation(jobs, id, preparation = jobs.preparation(id)) {
    const authorization = preparation?.intent?.authorization;
    if (!authorization || authorization.installationId !== installationId ||
        !matches(authorization.taskId, taskIdPattern) || !matches(authorization.commandId, commandIdPattern) ||
        !matches(authorization.stageHash, sha256) || stableId(installationId, authorization.commandId) !== id ||
        preparation.intent.id !== id) fail('render_job_missing');
    const job = preparation.job;
    if (job) {
      const { engine, ffmpeg, ffprobe, ...staged } = job.spec;
      if (job.id !== id || canonical(job.authorization) !== canonical(authorization) ||
          hash(staged) !== authorization.stageHash ||
          job.working !== path.join(path.dirname(staged.project.path), 'core4-render-' + id + '.aep') ||
          job.partial !== path.join(path.dirname(staged.output), 'core4-render-' + id + '.partial.mp4')) fail('render_job_binding');
    }
    return { job, authorization };
  }

  const exists = file => Boolean(fs.lstatSync(file, { throwIfNoEntry:false }));
  const readStatus = (jobs, id, job) => job ? publicResult(jobs.status(id)) : { id, state:'unknown' };
  return {
    prepare(args, assertCurrent = noGuard) {
      try {
        if (!exact(args, ['taskId', 'commandId']) || !matches(args.taskId, taskIdPattern) ||
            !matches(args.commandId, commandIdPattern)) fail('render_job_arguments');
        const { taskId, commandId } = args, { directory, root, protectedDirectories } = locations();
        const spec = stageSpec(getCommand(taskId, commandId), taskId, commandId, protectedDirectories);
        const id = stableId(installationId, commandId), authorization = authorizationFor(taskId, commandId, spec);
        if (exists(root)) {
          const jobs = createJobs(root), previous = jobs.preparation(id);
          if (previous) {
            if (!previous.intent && !previous.job) return { id, state:'unknown' };
            const saved = readPreparation(jobs, id, previous);
            if (canonical(saved.authorization) !== canonical(authorization)) fail('render_job_binding');
            return readStatus(jobs, id, saved.job);
          }
        }
        const toolchain = readToolchain(directory);
        assertCurrent();
        const jobs = createJobs(root);
        try { return jobs.prepare({ ...spec, ...toolchain }, { id, authorization, assertCurrent }); }
        catch (error) {
          const previous = jobs.preparation(id);
          if (!previous) throw error;
          if (!previous.intent && !previous.job) return { id, state:'unknown' };
          const saved = readPreparation(jobs, id, previous);
          if (canonical(saved.authorization) !== canonical(authorization)) fail('render_job_binding');
          return readStatus(jobs, id, saved.job);
        }
      } catch (error) { return safeFailure(error); }
    },
    ...Object.fromEntries(['start', 'status', 'reconcile', 'finalize', 'cancel'].map(action =>
      [action, async (args, assertCurrent = noGuard) => {
        try {
          if (!exact(args, ['id']) || !matches(args.id, jobId)) fail('render_job_arguments');
          const { id } = args, { root, directory, protectedDirectories } = locations();
          if (!exists(root)) fail('render_job_missing');
          const jobs = createJobs(root), { job, authorization } = readPreparation(jobs, id);
          if (!job || action === 'status') return readStatus(jobs, id, job);
          if (action === 'start') {
            const state = readStatus(jobs, id, job);
            if (state.state !== 'prepared') return state;
            const { taskId, commandId } = authorization;
            const spec = stageSpec(getCommand(taskId, commandId), taskId, commandId, protectedDirectories);
            if (hash(spec) !== authorization.stageHash) fail('render_job_binding');
          }
          const invokesToolchain = action === 'start' || action === 'reconcile';
          const assertToolchain = () => {
            const activeToolchain = readToolchain(directory);
            if (toolNames.some(key => canonical(activeToolchain[key]) !== canonical(job.spec[key]))) fail('render_job_toolchain_changed');
          };
          if (invokesToolchain) assertToolchain();
          try {
            return publicResult(await jobs[action](id, () => {
              if (invokesToolchain) assertToolchain();
              assertCurrent();
            }));
          }
          catch (error) {
            const state = readStatus(jobs, id, job);
            if (state.state === 'unknown' || action === 'start' && error.message === 'aerender_active_or_already_dispatched' &&
                state.state !== 'prepared') return state;
            throw error;
          }
        } catch (error) { return safeFailure(error); }
      }]))
  };
}

module.exports = { createRenderJobOwner };

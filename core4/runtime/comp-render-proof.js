'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { canonical, fail } = require('../protocol/json');

function output(input, directory) {
  if (!/^[a-z][a-z0-9-]{0,63}$/.test(directory) || !path.isAbsolute(input.projectId) ||
      !/^[A-Za-z0-9][A-Za-z0-9_-]{0,90}\.mp4$/.test(input.fileName) ||
      /^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])\./i.test(input.fileName)) fail('comp_render_output');
  return path.join(path.dirname(input.projectId), directory, input.fileName);
}

function plainOutputDirectory(file) {
  const dir = path.dirname(file);
  const stat = fs.lstatSync(dir, { throwIfNoEntry: false });
  if (!stat?.isDirectory() || stat.isSymbolicLink() || fs.realpathSync(dir) !== dir) fail('comp_render_output_directory');
}

function plainMedia(file, bytes) {
  const stat = fs.lstatSync(file, { throwIfNoEntry: false });
  if (!stat?.isFile() || stat.isSymbolicLink() || fs.realpathSync(file) !== file ||
      stat.size < 1 || stat.size !== bytes) fail('comp_render_output_readback');
}

// Pure comparison of the native result with the approved input and snapshot.
function validateRenderResult({ input, before }, after, { file, format }) {
  const { render, job, revision, queueIdle, ...snapshot } = after;
  const { job: previous, revision: beforeRevision, queueIdle: beforeIdle, ...preimage } = before;
  if (canonical(snapshot) !== canonical(preimage)) fail('comp_render_result');
  const parameters = ['renderTemplate', 'outputTemplate', 'startFrame', 'frameCount'];
  if (input.mode === 'stage') {
    if (!beforeIdle || queueIdle || previous || render || !job || job.jobCompId === input.compId || job.file !== file ||
        job.status !== 'QUEUED' || job.rendering || job.bytes !== 0 ||
        [...parameters, 'activeLayerId', 'controlledLayerIds', 'fileName'].some(field => canonical(job[field]) !== canonical(input[field]))) fail('comp_render_stage_result');
    return;
  }
  if (input.mode === 'start') {
    if (render || !previous || previous.jobCompId !== input.jobCompId || previous.file !== file ||
        previous.status !== 'QUEUED' || previous.bytes !== 0 || previous.rendering ||
        !job || job.status !== 'DONE' || job.bytes < 1 ||
        canonical(job) !== canonical({ ...previous, status: 'DONE', bytes: job.bytes })) fail('comp_render_start_result');
    return;
  }
  if (job || !previous || previous.jobCompId !== input.jobCompId || previous.file !== file || previous.rendering) fail('comp_render_result');
  if (input.mode === 'discard') {
    if (render || previous.status === 'DONE') fail('comp_render_result');
    return;
  }
  if (!render || previous.status !== 'DONE' || render.jobCompId !== input.jobCompId || render.file !== file ||
      render.bytes !== previous.bytes || render.status !== 'DONE' || render.format !== format ||
      parameters.some(field => render[field] !== input[field] || render[field] !== previous[field])) fail('comp_render_result');
}

// Only the trusted runtime resolves and examines paths on the host.
function createRenderProof({ directory, format }) {
  return {
    proof: {
      beforeReservation({ input, before }) {
        const file = output(input, directory);
        plainOutputDirectory(file);
        if ((input.mode === 'stage' || input.mode === 'start') && fs.lstatSync(file, { throwIfNoEntry: false })) fail('comp_render_output_exists');
        if (input.mode === 'finalize') plainMedia(file, before.job.bytes);
      },
    },
    validateResult(ctx, after) {
      const file = output(ctx.input, directory);
      validateRenderResult(ctx, after, { file, format });
      plainOutputDirectory(file);
      if (ctx.input.mode === 'stage' && fs.lstatSync(file, { throwIfNoEntry: false })) fail('comp_render_stage_result');
      if (ctx.input.mode === 'start') plainMedia(file, after.job.bytes);
      if (ctx.input.mode === 'finalize') plainMedia(file, after.render.bytes);
    },
  };
}

module.exports = { createRenderProof, validateRenderResult };

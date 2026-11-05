'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { canonical, fail } = require('../protocol/json');

function output(input) {
  return path.join(path.dirname(input.projectId), 'titles-output', input.fileName);
}

function plainOutputDirectory(file) {
  const dir = path.dirname(file);
  const stat = fs.lstatSync(dir, { throwIfNoEntry: false });
  if (!stat?.isDirectory() || stat.isSymbolicLink() || fs.realpathSync(dir) !== dir) fail('comp_render_output_directory');
}

const compRenderProof = {
  beforeReservation({ input, before }) {
    const file = output(input);
    plainOutputDirectory(file);
    if (input.mode === 'stage' && fs.lstatSync(file, { throwIfNoEntry: false })) fail('comp_render_output_exists');
    if (input.mode === 'finalize') plainMedia(file, before.job.bytes);
  },
};

function plainMedia(file, bytes) {
  const stat = fs.lstatSync(file, { throwIfNoEntry: false });
  if (!stat?.isFile() || stat.isSymbolicLink() || fs.realpathSync(file) !== file ||
      stat.size < 1 || stat.size !== bytes) fail('comp_render_output_readback');
}

function validateCompRenderCompletion({ input, before }, after) {
  const { render, job, revision, queueIdle, ...snapshot } = after;
  const { job: previous, revision: beforeRevision, queueIdle: beforeIdle, ...preimage } = before;
  if (canonical(snapshot) !== canonical(preimage)) fail('comp_render_result');
  const file = output(input);
  plainOutputDirectory(file);
  const parameters = ['renderTemplate', 'outputTemplate', 'startFrame', 'frameCount'];
  if (input.mode === 'stage') {
    if (!beforeIdle || queueIdle || previous || render || !job || job.jobCompId === input.compId || job.file !== file ||
        job.status !== 'QUEUED' || job.rendering || job.bytes !== 0 ||
        [...parameters, 'activeLayerId', 'controlledLayerIds', 'fileName'].some(field => canonical(job[field]) !== canonical(input[field])) ||
        fs.lstatSync(file, { throwIfNoEntry: false })) fail('comp_render_stage_result');
    return;
  }
  if (job || !previous || previous.jobCompId !== input.jobCompId || previous.file !== file || previous.rendering) fail('comp_render_result');
  if (input.mode === 'discard') {
    if (render || previous.status === 'DONE') fail('comp_render_result');
    return;
  }
  if (!render || previous.status !== 'DONE' || render.jobCompId !== input.jobCompId || render.file !== file ||
      render.bytes !== previous.bytes || render.status !== 'DONE' || render.format !== 'H.264' ||
      parameters.some(field => render[field] !== input[field] || render[field] !== previous[field])) fail('comp_render_result');
  plainMedia(file, render.bytes);
}

module.exports = { compRenderProof, validateCompRenderCompletion };

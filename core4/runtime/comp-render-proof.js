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
  beforeReservation({ input }) {
    const file = output(input);
    plainOutputDirectory(file);
    if (fs.lstatSync(file, { throwIfNoEntry: false })) fail('comp_render_output_exists');
  },
};

function validateCompRenderCompletion({ input, before }, after) {
  const { render, ...snapshot } = after;
  if (canonical(snapshot) !== canonical(before) || !render || render.file !== output(input) ||
      render.status !== 'DONE' || render.format !== 'H.264' ||
      ['renderTemplate', 'outputTemplate', 'startFrame', 'frameCount'].some(field => render[field] !== input[field])) {
    fail('comp_render_result');
  }
  plainOutputDirectory(render.file);
  const stat = fs.lstatSync(render.file, { throwIfNoEntry: false });
  if (!stat?.isFile() || stat.isSymbolicLink() || fs.realpathSync(render.file) !== render.file ||
      stat.size < 1 || stat.size !== render.bytes) fail('comp_render_output_readback');
}

module.exports = { compRenderProof, validateCompRenderCompletion };

'use strict';

const key = file => file.replace(/\\/g, '/').toLowerCase();
const plainParts = file => !file.slice(3).split('/').some(part => /[. ]$/.test(part) || /^(?:con|prn|aux|nul|com[0-9¹²³]|lpt[0-9¹²³])(?:\.|$)/.test(part));

function checkRender(input) {
  const render = input.render;
  if (input.action !== 'stage-render-copy') {
    if (render !== undefined) throw new Error('lifecycle_render_policy');
    return;
  }
  if (!render || !/^[1-9]\d{0,6}\/[1-9]\d{0,6}$/.test(render.fps) ||
      (render.startFrame === undefined) !== (render.endFrameExclusive === undefined) ||
      render.startFrame !== undefined && render.startFrame >= render.endFrameExclusive) throw new Error('lifecycle_render_target');
  const output = key(render.output), directory = key(input.destination).split('/').slice(0, -1).join('/');
  if (!/^[a-z]:\/(?:[^/:*?"<>|\x00-\x1f]+\/)+[\w.-]+\.mp4$/.test(output) ||
      !plainParts(output) || output.slice(0, output.lastIndexOf('/')) === directory) throw new Error('lifecycle_render_output');
}

function build({ input, evidence }) {
  const destination = key(input.destination);
  if (!/^[a-z]:\/(?:[^/:*?"<>|\x00-\x1f]+\/)+[^/:*?"<>|\x00-\x1f]+\.aep$/.test(destination) ||
      !plainParts(destination) ||
      destination === key(input.projectId)) throw new Error('lifecycle_destination_path');
  if (input.action !== 'save-as' && evidence.dirty) throw new Error('lifecycle_clean_source_required');
  if (input.allowDirtyDestination !== undefined && input.action !== 'open') throw new Error('lifecycle_dirty_destination_policy');
  if (input.action === 'open' ? !/^[a-f0-9]{64}$/.test(input.expectedDestinationSha256) : input.expectedDestinationSha256 !== undefined)
    throw new Error('lifecycle_destination_hash');
  checkRender(input);
  return { operationId: 'transition-project', input: { ...input, expectedRevision: evidence.revision,
    expectedSavedSha256: evidence.savedFileSha256, expectedFileStamp: evidence.fileStamp, checkpointRoot: evidence.checkpointRoot } };
}

module.exports = { build };

'use strict';

const JOB_FIELDS = ['fileName', 'activeLayerId', 'controlledLayerIds', 'startFrame', 'frameCount', 'renderTemplate', 'outputTemplate'];
const COMPOSITION_WORKSPACE = 'AE_CORE4_COMP_WORKSPACE_V1';

function matchesJob(input, job) {
  return !!job && JOB_FIELDS.every(key => JSON.stringify(input[key]) === JSON.stringify(job[key]));
}

function build({ input, evidence }) {
  const ids = new Set(input.controlledLayerIds);
  const wholeComposition = JSON.parse(evidence.protected)[1] === COMPOSITION_WORKSPACE;
  if (ids.size !== input.controlledLayerIds.length || wholeComposition !== (ids.size === 0 && input.activeLayerId === 0) ||
      (!wholeComposition && (!ids.has(input.activeLayerId) ||
        [...ids].some(id => !evidence.layers.some(layer => layer.layerId === id && layer.controllable))))) {
    throw new Error('comp_render_targets');
  }
  if (input.mode === 'stage') {
    if (!evidence.queueIdle || evidence.job || input.jobCompId !== undefined) throw new Error('comp_render_queue_busy');
  } else {
    const job = evidence.job;
    if (!matchesJob(input, job) || job.jobCompId !== input.jobCompId || job.rendering ||
        input.mode === 'finalize' && (job.status !== 'DONE' || job.bytes < 1) ||
        input.mode === 'discard' && job.status === 'DONE') throw new Error('comp_render_job');
  }
  if ((input.startFrame + input.frameCount) * evidence.frameDuration > evidence.duration + 0.00001 ||
      input.frameCount * evidence.frameDuration > 12) throw new Error('comp_render_frame_range');
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,90}\.mp4$/.test(input.fileName) ||
      /^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])\./i.test(input.fileName)) throw new Error('comp_render_output');
  if ([input.renderTemplate, input.outputTemplate].some(name => /[\x00-\x1f\x7f]/.test(name))) throw new Error('comp_render_template');
  return { operationId: 'render-text-variant', input: { ...input, expectedRevision: evidence.revision } };
}

module.exports = { build };

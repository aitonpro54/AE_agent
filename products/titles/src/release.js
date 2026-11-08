'use strict';

const PHASES = {
  derive: ['text-variant', 'stage-text-variant'],
  stage: ['comp-render', 'render-text-variant'],
  start: ['comp-render', 'render-text-variant'],
  finalize: ['comp-render', 'render-text-variant'],
  discard: ['comp-render', 'render-text-variant'],
};
const isId = value => Number.isSafeInteger(value) && value > 0;

function fail(code) {
  throw Object.assign(new Error(code), { code });
}

function fields(value, required, optional = []) {
  return value && Object.getPrototypeOf(value) === Object.prototype && required.every(key => Object.hasOwn(value, key)) &&
    Object.keys(value).every(key => required.includes(key) || optional.includes(key));
}

function prepareRelease(job, selection, contract, inspection) {
  const preserved3D = job?.variant?.preserveAdvanced3D === true;
  if (!fields(job, ['schemaVersion', 'target', 'controlledLayerIds', 'variant', 'render']) || job.schemaVersion !== 'release-1' ||
      !fields(job.target, ['projectId', 'compId']) || typeof job.target.projectId !== 'string' || !job.target.projectId ||
      !isId(job.target.compId) || !Array.isArray(job.controlledLayerIds) || !job.controlledLayerIds.length ||
      !job.controlledLayerIds.every(isId) || new Set(job.controlledLayerIds).size !== job.controlledLayerIds.length ||
      !fields(job.variant, preserved3D ? ['templateLayerId', 'slot', 'name', 'preserveAdvanced3D'] :
        ['templateLayerId', 'layoutLayerId', 'slot', 'name', 'holdTime'], ['markerSourceLayerId']) ||
      !fields(job.render, ['fileName', 'startFrame', 'frameCount', 'renderTemplate', 'outputTemplate'])) fail('release_job');
  if (!fields(selection, ['phase'], ['variantLayerId', 'jobCompId']) || typeof selection.phase !== 'string' ||
      !Object.hasOwn(PHASES, selection.phase)) fail('release_phase');
  const { phase, variantLayerId, jobCompId } = selection;
  const [moduleId, operationId] = PHASES[phase];
  const snapshot = inspection?.snapshot;
  if (contract?.moduleId !== moduleId || contract.operationId !== operationId || typeof contract.contractId !== 'string' ||
      !/^[a-f0-9]{64}$/.test(contract.contractId) || typeof contract.modulePin !== 'string' ||
      contract.modulePin !== inspection?.modulePin || inspection.synthetic !== false || typeof inspection.evidenceRef !== 'string' ||
      !inspection.evidenceRef || snapshot?.target?.projectId !== job.target.projectId || snapshot.target.compId !== job.target.compId ||
      !Array.isArray(snapshot.layers)) fail('release_contract');
  if (phase === 'start' && !contract.contract?.buildSchema?.properties?.mode?.enum?.includes('start')) fail('release_contract');
  const { target, controlledLayerIds, variant, render } = job;
  let input;
  if (phase === 'derive') {
    if (variantLayerId !== undefined || jobCompId !== undefined) fail('release_phase');
    if (preserved3D && !snapshot.layers.some(layer => layer.layerId === variant.templateLayerId && layer.advanced3D && layer.eligible)) {
      fail('release_target');
    }
    input = { ...target, controlledLayerIds, derive: variant };
  } else {
    if (!isId(variantLayerId) || controlledLayerIds.includes(variantLayerId) ||
        !snapshot.layers.some(layer => layer.layerId === variantLayerId && layer.controllable) ||
        (phase === 'stage' ? jobCompId !== undefined : !isId(jobCompId) || snapshot.job?.jobCompId !== jobCompId)) fail('release_target');
    if (phase === 'start' && (snapshot.job.status !== 'QUEUED' || snapshot.job.rendering || snapshot.job.bytes !== 0)) fail('release_target');
    input = { ...target, ...render, mode: phase, controlledLayerIds: [...controlledLayerIds, variantLayerId], activeLayerId: variantLayerId,
      ...(phase === 'stage' ? {} : { jobCompId }) };
  }
  return { oneStep: true, steps: [{ stepId: phase, moduleId, contractId: contract.contractId, evidenceRef: inspection.evidenceRef, input }] };
}

module.exports = { prepareRelease };

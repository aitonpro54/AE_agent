'use strict';

const { boundedCopy, hash, exact, fail } = require('./compiler');
const { prepareLayout, fitLayout } = require('./layout');
const MODULE = 'titles-point-layout';
const OPERATION = 'measure-or-apply-point-layout';
const MODULE_PIN = 'd62f3363b6677e6b5cfde0ee5f179ea3dcc27c0b3edc5393d490f2ee2bd253eb';
const CONTRACT_PIN = '617e69c4de6ca14c7c1e3731c329ad8291d2f9796e8b8276160d87b4a2c7df25';
const HEX = /^[a-f0-9]{64}$/;
const UUID = '[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}';

function reference(value, prefix) { return typeof value === 'string' && new RegExp(`^${prefix}-${UUID}$`).test(value); }

function prepareLayoutBuild(mode, job, targetValue, contractValue, inspectionValue, taskValue) {
  const preview = prepareLayout(job);
  const { frame, fit, layoutId } = preview;
  if (!fit || fit.padding < 1) fail('layout_fit_preferences');
  const target = boundedCopy(targetValue), contract = boundedCopy(contractValue), inspection = boundedCopy(inspectionValue);
  exact(target, ['projectId', 'compId', 'layerId']);
  if (typeof target.projectId !== 'string' || !target.projectId || target.projectId.length > 8192 ||
      ![target.compId, target.layerId].every(id => Number.isSafeInteger(id) && id >= 1 && id <= 2147483647)) fail('layout_target');
  exact(contract, ['contractId', 'moduleId', 'operationId', 'modulePin', 'admissionPin', 'contract']);
  if (contract.moduleId !== MODULE || contract.operationId !== OPERATION || contract.modulePin !== MODULE_PIN ||
      hash(contract.contract) !== CONTRACT_PIN || ![contract.contractId, contract.admissionPin].every(ref => typeof ref === 'string' && HEX.test(ref))) fail('incompatible_contract');
  exact(inspection, ['evidenceRef', 'modulePin', 'synthetic', 'snapshot']);
  if (inspection.synthetic !== false || inspection.modulePin !== MODULE_PIN || !reference(inspection.evidenceRef, 'evidence')) fail('layout_inspection');
  const snapshot = inspection.snapshot;
  if (!snapshot || hash(snapshot.target) !== hash(target) || snapshot.role !== mode) fail('inspection_target');
  const candidates = preview.candidates.map(candidate => ({ id: candidate.id, text: candidate.lines.map(line => line.text).join('\n') }));
  const input = { ...target, mode, frame, fit, layoutId };
  let taskId;
  if (mode === 'measure') input.candidates = candidates;
  else if (mode === 'apply') {
    const task = boundedCopy(taskValue);
    if (!reference(task.taskId, 'task') || task.reset !== false || !Array.isArray(task.commands)) fail('layout_measurement_task');
    const measurements = task.commands.filter(command => command.state === 'succeeded' && command.modulePin === MODULE_PIN &&
      command.after?.role === 'measure' && command.after.layoutId === layoutId && command.after.style === snapshot.style &&
      command.after.time === snapshot.time && command.target?.projectId === target.projectId && command.target?.compId === target.compId &&
      command.target?.layerId !== target.layerId && reference(command.commandId, 'command'));
    if (measurements.length !== 1) fail('layout_measurement_task');
    const command = measurements[0];
    if (!Array.isArray(command.after.samples)) fail('layout_measurement_task');
    const fitted = fitLayout(job, { layoutId, geometry: 'unparented-unrotated-2d-point-text', anchor: snapshot.anchor,
      samples: command.after.samples.map(({ id, bounds }) => ({ id, bounds })) });
    if (fitted.status !== 'fit') fail('layout_below_minimum_scale');
    Object.assign(input, { candidateId: fitted.candidateId, text: candidates.find(candidate => candidate.id === fitted.candidateId).text,
      measurementCommandId: command.commandId, scale: fitted.scale, position: fitted.position });
    taskId = task.taskId;
  } else fail('layout_mode');
  return { ...(taskId ? { taskId } : {}), oneStep: true, steps: [{ stepId: `${mode}-title-layout`, moduleId: MODULE,
    contractId: contract.contractId, evidenceRef: inspection.evidenceRef, input }] };
}

module.exports = { prepareLayoutBuild };

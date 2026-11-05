'use strict';

const { canonical, fail, hash } = require('../protocol/json');
const { check } = require('../protocol/schema');
const MAX_MEASUREMENT_AGE_MS = 15 * 60 * 1000;
const BOUNDS_TOLERANCE = 0.02;
const REQUEST_TOLERANCE = 1e-7;

function equal(left, right) { return canonical(left) === canonical(right); }
function near(left, right, tolerance) { return Number.isFinite(left) && Number.isFinite(right) && Math.abs(left - right) <= tolerance; }

function createPointLayoutProof({ getBroker, getPeer }) {
  function sampleFor(ctx, execution, fresh) {
    const broker = getBroker();
    const { input, before, descriptor, selected, target } = ctx;
    if (!broker || broker.ledger.corrupt) fail('layout_measurement_required');
    const command = broker.ledger.commands(execution.taskId).find(item => item.commandId === input.measurementCommandId);
    if (!command || command.state !== 'succeeded' || command.verificationKind !== 'local-transaction-receipt' ||
        command.taskEpoch !== execution.taskEpoch || command.input.mode !== 'measure' || command.selected.pin !== selected.pin ||
        hash(command.selected.admission) !== hash(selected.admission) || !command.after?.samples ||
        command.target.projectId !== target.projectId || command.target.compId !== target.compId || command.target.layerId === target.layerId ||
        !equal(command.executionPolicy.executionScope.origin, descriptor.executionScope.origin) ||
        command.dispatchBinding.receiverStoreIdentity !== (fresh ? getPeer().status().receiverStoreIdentity : ctx.originalBinding.receiverStoreIdentity) ||
        command.after.layoutId !== input.layoutId || command.input.layoutId !== input.layoutId || !equal(command.input.frame, input.frame) || !equal(command.input.fit, input.fit) ||
        command.after.style !== before.style || command.after.time !== before.time || !equal(command.after.comp, before.comp)) fail('layout_measurement_required');
    const age = Date.now() - command.dispatchedAt;
    if (fresh && (!Number.isFinite(age) || age < 0 || age > MAX_MEASUREMENT_AGE_MS)) fail('layout_measurement_expired');

    const candidate = command.input.candidates.find(item => item.id === input.candidateId);
    const sample = command.after.samples.find(item => item.id === input.candidateId);
    if (!candidate || !sample || candidate.text !== input.text) fail('layout_measurement_candidate');
    const { frame, fit } = input;
    const { left, top, width, height } = sample.bounds;
    const scale = Math.min(fit.preferredScale, (frame.width - 2 * fit.padding) / width, (frame.height - 2 * fit.padding) / height);
    const x = frame.left + frame.width / 2 - (left + width / 2 - before.anchor[0]) * scale;
    const y = frame.top + frame.height / 2 - (top + height / 2 - before.anchor[1]) * scale;
    if (scale < fit.minimumScale || !near(input.scale, scale, REQUEST_TOLERANCE) ||
        !near(input.position[0], x, REQUEST_TOLERANCE) || !near(input.position[1], y, REQUEST_TOLERANCE)) fail('layout_placement_mismatch');
    return sample;
  }

  function validateCompletion(ctx, snapshot, execution) {
    check(ctx.selected.contract.snapshotSchema, snapshot);
    const { samples, layoutId, ...after } = snapshot;
    const { before, input } = ctx;
    if (input.mode === 'measure') {
      if (!equal(before, after) || layoutId !== input.layoutId || !samples || samples.length !== input.candidates.length ||
          samples.some((item, index) => item.id !== input.candidates[index].id ||
            item.baselines.length !== input.candidates[index].text.split('\n').length * 4)) fail('layout_measurement_readback');
      return before.text;
    }

    const measured = sampleFor(ctx, execution, false);
    if (samples || layoutId !== undefined || after.role !== 'apply' || after.time !== before.time || after.style !== before.style ||
        !equal(after.anchor, before.anchor) || !equal(after.comp, before.comp) ||
        !['left', 'top', 'width', 'height'].every(key => near(after.bounds[key], measured.bounds[key], BOUNDS_TOLERANCE)) ||
        after.baselines.length !== measured.baselines.length ||
        !after.baselines.every((value, index) => near(value, measured.baselines[index], BOUNDS_TOLERANCE)) ||
        !after.position.every((value, index) => near(value, input.position[index], BOUNDS_TOLERANCE)) ||
        !after.scale.every(value => near(value, input.scale * 100, 0.001))) fail('layout_apply_readback');

    const { frame, fit } = input;
    const scale = after.scale[0] / 100;
    const left = after.position[0] + (after.bounds.left - after.anchor[0]) * scale;
    const top = after.position[1] + (after.bounds.top - after.anchor[1]) * scale;
    if (left < frame.left + fit.padding - BOUNDS_TOLERANCE || top < frame.top + fit.padding - BOUNDS_TOLERANCE ||
        left + after.bounds.width * scale > frame.left + frame.width - fit.padding + BOUNDS_TOLERANCE ||
        top + after.bounds.height * scale > frame.top + frame.height - fit.padding + BOUNDS_TOLERANCE) fail('layout_apply_frame');
    return input.text;
  }

  return {
    beforeReservation(ctx) {
      if (ctx.input.mode === 'apply') sampleFor(ctx, { taskId: ctx.plan.taskId, taskEpoch: ctx.plan.taskEpoch }, true);
    },
    validateCompletion,
  };
}

module.exports = { createPointLayoutProof };

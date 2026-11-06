'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { localOperation } = require('./fixtures/local-operation');
const { layoutEnvironment } = require('./fixtures/point-layout-ae');
const { createPointLayoutProof } = require('../runtime/point-layout-proof');

test('point-layout: measured text fits a padded frame with a nonzero anchor', () => {
  const operation = localOperation('titles-point-layout', layoutEnvironment);
  const candidate = { id: 'base', text: 'North\nShore' };
  const request = { projectId: operation.state.projectId, compId: 1, layoutId: '1'.repeat(64),
    frame: { left: 70, top: 40, width: 50, height: 58 }, fit: { padding: 5, preferredScale: 1, minimumScale: 0.5 } };
  const measure = operation.run({ ...request, mode: 'measure', layerId: 103, candidates: [candidate] });
  assert.equal(measure.result.outcome, 'applied');
  assert.deepEqual(operation.inspect(measure.input), measure.before);
  const measurementCommandId = 'command-11111111-1111-4111-8111-111111111111';
  const execution = { taskId: 'local-layout', taskEpoch: 1 };
  const executionScope = { origin: 'fixture' };
  const dispatchBinding = { receiverStoreIdentity: 'fixture-store' };
  const command = { commandId: measurementCommandId, state: 'succeeded', verificationKind: 'local-transaction-receipt',
    taskEpoch: execution.taskEpoch, input: measure.input, selected: operation.selected, after: measure.result.snapshot,
    target: measure.before.target, executionPolicy: { executionScope }, dispatchBinding, dispatchedAt: Date.now() };
  const proof = createPointLayoutProof({ getBroker: () => ({ ledger: { commands: taskId => taskId === execution.taskId ? [command] : [] } }),
    getPeer: () => ({ status: () => dispatchBinding }) });
  assert.equal(proof.validateCompletion({ before: measure.before, input: measure.input, selected: operation.selected }, measure.result.snapshot), 'BASE');
  const apply = operation.run({ ...request, mode: 'apply', layerId: 104, text: candidate.text,
    candidateId: candidate.id, measurementCommandId, scale: 0.75, position: [80, 59.25] });
  assert.equal(apply.result.outcome, 'applied');
  const context = { before: apply.before, input: apply.input, target: apply.before.target, selected: operation.selected,
    descriptor: { executionScope }, originalBinding: dispatchBinding, plan: execution };
  assert.doesNotThrow(() => proof.beforeReservation(context));
  assert.equal(proof.validateCompletion(context, apply.result.snapshot, execution), candidate.text);
  assert.throws(() => proof.beforeReservation({ ...context, input: { ...apply.input, position: [80, 59] } }), /layout_placement_mismatch/);
  assert.throws(() => proof.validateCompletion(context, { ...apply.result.snapshot, position: [80, 59] }, execution), /layout_apply_readback/);
});

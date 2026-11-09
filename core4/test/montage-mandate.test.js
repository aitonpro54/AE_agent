'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const test = require('node:test');
const { canonical } = require('../protocol/json');
const { createOperatorConfirmation } = require('../runtime/operator-confirmation');
const { issueMontageMandate, observeMontageMandate, revokeMontageMandate } = require('../runtime/montage-mandate');

function fixture(t) {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'core4-mandate-'));
  t.after(() => {
    for (const name of fs.readdirSync(stateDir)) fs.unlinkSync(path.join(stateDir, name));
    fs.rmdirSync(stateDir);
  });
  const installation = { installationId: 'installation-1', packageHash: 'a'.repeat(64), controlToken: 'b'.repeat(64), stateDir };
  const projectId = path.join(stateDir, 'fixture.aep'), taskId = 'task-11111111-1111-4111-8111-111111111111';
  const taskEpoch = 1, sessionId = 'session-1';
  const file = path.join(stateDir, 'prepared.png'), sha256 = 'c'.repeat(64);
  const input = { projectId, sessionId, file, sha256 };
  const scope = { projectId, sessionId, taskId, taskEpoch, expiresAt: Date.now() + 60000,
    actions: [{ moduleId: 'media-import', input },
      { moduleId: 'layer-overlay', input: { ...input, compId: 9, layerId: 10, originalSourceId: 11, itemId: 12 } },
      { moduleId: 'comp-frame-export', input: { projectId, compId: 9, frame: 30, fileName: 'control.png' } }] };
  const proposalId = 'proposal-11111111-1111-4111-8111-111111111111';
  const approval = { taskId, taskEpoch, proposalId, steps: [{ moduleId: 'media-import', operationId: 'ingest-footage',
    effectPolicy: { effect: 'project-media-import' }, target: { projectId, sessionId, file },
    input: { ...input, expectedRevision: 'new-revision' } }] };
  const reservation = { commandId: 'command-1', ref: 'reservation-1', checkpointRef: 'checkpoint-1', checkpointDigest: 'd'.repeat(64) };
  return { installation, scope, approval, reservation };
}

test('montage-mandate reuses exact operator claim and checks cancellation before handoff', t => {
  const { installation, scope, approval, reservation } = fixture(t);
  let project = null, session = scope.sessionId;
  const authorize = createOperatorConfirmation(installation, () => session, () => project);
  assert.throws(() => authorize(approval, reservation), { code: 'operator_confirmation_required' });
  const issued = issueMontageMandate(installation, scope);
  assert.equal(issued.backend, 'core');
  assert.equal(issued.policies.dirty, 'preserve-in-memory');
  assert.throws(() => authorize(approval, reservation), { code: 'montage_mandate_binding' });
  project = scope.projectId;
  const proof = authorize(approval, reservation);
  assert.equal(proof.mandateDigest, issued.digest);
  assert.deepEqual(authorize(approval, reservation), proof);
  assert.throws(() => authorize(approval, { ...reservation, commandId: 'another' }), { code: 'operator_confirmation_used' });
  const command = { phase: 'mutate', payload: { projectId: scope.projectId, _execution: {
    taskId: scope.taskId, taskEpoch: scope.taskEpoch, operatorConfirmation: proof } } };
  authorize.assertDelivery(command);
  session = 'foreign-session';
  assert.throws(() => authorize.assertDelivery(command), { code: 'montage_mandate_binding' });
  session = scope.sessionId;
  assert.deepEqual(revokeMontageMandate(installation, scope.taskId), { taskId: scope.taskId, revoked: true });
  assert.throws(() => authorize.assertDelivery(command), { code: 'montage_mandate_revoked' });
});

test('montage-mandate rejects expanded tasks, changed files and invalid binding', t => {
  const { installation, scope, approval, reservation } = fixture(t);
  const authorize = createOperatorConfirmation(installation, () => scope.sessionId, () => scope.projectId);
  for (const moduleId of ['project-save', 'project-lifecycle', 'comp-render']) {
    assert.throws(() => issueMontageMandate(installation, { ...scope, actions: [{ moduleId, input: {} }] }), { code: 'montage_mandate_action' });
  }
  issueMontageMandate(installation, scope);
  const step = approval.steps[0];
  const foreignFile = { ...step, input: { ...step.input, sha256: 'f'.repeat(64) } };
  assert.throws(() => authorize({ ...approval, steps: [foreignFile] }, reservation), { code: 'montage_mandate_action' });
  assert.throws(() => authorize({ ...approval, taskEpoch: 2 }, reservation), { code: 'montage_mandate_binding' });
  assert.throws(() => observeMontageMandate(installation, scope.taskId, scope.sessionId, scope.expiresAt), { code: 'montage_mandate_expired' });
  const file = path.join(installation.stateDir, 'montage-mandate-' + scope.taskId + '.json');
  const tampered = JSON.parse(fs.readFileSync(file, 'utf8'));
  tampered.body.actions[0].input.sha256 = 'f'.repeat(64);
  fs.writeFileSync(file, canonical(tampered));
  assert.throws(() => authorize(approval, reservation), { code: 'montage_mandate_signature' });
});

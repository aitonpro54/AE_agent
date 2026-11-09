'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const test = require('node:test');
const { canonical } = require('../protocol/json');
const { createOperatorConfirmation } = require('../runtime/operator-confirmation');
const montage = require('../runtime/montage-mandate');
const { issueMontageMandate, observeMontageMandate, revokeMontageMandate, importedMontageItem } = montage;

function fixture(t) {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'core4-mandate-'));
  t.after(() => {
    for (const name of fs.readdirSync(stateDir)) fs.unlinkSync(path.join(stateDir, name));
    fs.rmdirSync(stateDir);
  });
  const installation = { installationId: 'installation-1', packageHash: 'a'.repeat(64), controlToken: 'b'.repeat(64), panelToken: 'e'.repeat(64), stateDir };
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
  const authorize = createOperatorConfirmation(installation, () => session, () => project, undefined, undefined, montage);
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
  const command = { phase: 'mutate', moduleId: approval.steps[0].moduleId, operationId: approval.steps[0].operationId,
    payload: { ...approval.steps[0].input, _execution: {
    taskId: scope.taskId, taskEpoch: scope.taskEpoch, operatorConfirmation: proof } } };
  authorize.assertDelivery(command);
  session = 'foreign-session';
  assert.throws(() => authorize.assertDelivery(command), { code: 'montage_mandate_binding' });
  session = scope.sessionId;
  assert.deepEqual(revokeMontageMandate(installation, scope.taskId), { taskId: scope.taskId, revoked: true });
  assert.throws(() => authorize.assertDelivery(command), { code: 'montage_mandate_revoked' });
});

test('montage-mandate binds a future footage ID to one settled import of the same mandate and epoch', t => {
  const { installation, scope, approval, reservation } = fixture(t);
  const overlay = scope.actions[1];
  const { itemId, ...future } = overlay.input;
  const action = { ...overlay, input: future };
  assert.throws(() => issueMontageMandate(installation, { ...scope, actions: [action] }), { code: 'montage_mandate_import_required' });
  const issued = issueMontageMandate(installation, { ...scope, actions: [scope.actions[0], action] });
  const step = { moduleId: overlay.moduleId, operationId: 'duplicate-and-replace-still',
    effectPolicy: { effect: 'composition-layer-overlay' },
    target: { projectId: scope.projectId, sessionId: scope.sessionId, compId: future.compId, layerId: future.layerId,
      originalSourceId: future.originalSourceId, itemId },
    input: { ...overlay.input, expectedRevision: 'revision' } };
  const pending = { ...approval, steps: [step] };
  const command = { taskId: scope.taskId, taskEpoch: scope.taskEpoch, state: 'succeeded',
    verificationKind: 'local-transaction-receipt', selected: { moduleId: 'media-import' },
    grant: { operatorConfirmation: { mandateDigest: issued.digest } }, input: scope.actions[0].input,
    after: { createdItemId: itemId, items: [{ id: itemId, file: future.file, kind: 'still' }] } };
  let history = [];
  const authorize = createOperatorConfirmation(installation, () => scope.sessionId, () => scope.projectId,
    () => scope.sessionId, (mandate, input) => importedMontageItem(history, mandate, input), montage);
  for (const mismatched of [[], [{ ...command, taskEpoch: 2 }], [{ ...command, state: 'UNKNOWN' }],
    [{ ...command, grant: {} }], [command, command]]) {
    history = mismatched;
    assert.throws(() => authorize(pending, reservation), { code: 'montage_mandate_action' });
  }
  history = [command];
  const foreign = { ...step, target: { ...step.target, itemId: 99 }, input: { ...step.input, itemId: 99 } };
  assert.throws(() => authorize({ ...pending, steps: [foreign] }, reservation), { code: 'montage_mandate_action' });
  const proof = authorize(pending, reservation);
  const delivery = { phase: 'mutate', moduleId: step.moduleId, operationId: step.operationId,
    payload: { ...step.input, _execution: { taskId: scope.taskId, taskEpoch: scope.taskEpoch, operatorConfirmation: proof } } };
  authorize.assertDelivery(delivery);
  history = [];
  assert.throws(() => authorize.assertDelivery(delivery), { code: 'montage_mandate_binding' });
});

test('montage-mandate stages fsync before publication and requires both role credentials', t => {
  const { installation, scope } = fixture(t);
  assert.throws(() => issueMontageMandate({ ...installation, panelToken: undefined }, scope), { code: 'montage_mandate_signer' });
  const sync = fs.fsyncSync;
  let beforePublish = false;
  try {
    fs.fsyncSync = fd => {
      beforePublish = true;
      assert.equal(observeMontageMandate(installation, scope.taskId, scope.sessionId), null);
      sync(fd);
    };
    issueMontageMandate(installation, scope);
  } finally { fs.fsyncSync = sync; }
  assert.equal(beforePublish, true);
  assert.equal(observeMontageMandate(installation, scope.taskId, scope.sessionId).body.version, 2);
  assert.deepEqual(fs.readdirSync(installation.stateDir), ['montage-mandate-' + scope.taskId + '.json']);
});

test('montage-mandate rejects expanded tasks, changed files and invalid binding', t => {
  const { installation, scope, approval, reservation } = fixture(t);
  const authorize = createOperatorConfirmation(installation, () => scope.sessionId, () => scope.projectId, undefined, undefined, montage);
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

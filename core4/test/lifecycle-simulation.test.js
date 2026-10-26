'use strict';
// Synthetic events + real Core/worker/receiver/JSX in VM. Native AE calls: zero.
const test = require('node:test');
const assert = require('node:assert/strict');
const { Broker } = require('../core/broker');
const { createLifecycleSource, validateLifecycleBinding } = require('../core/authority');
const { TOOL_METHODS } = require('../core/stdio');
const { selectChecks } = require('../tools/validate-diff');
const { fixture, workspace, prepare, run, target } = require('./helpers');
const { canonical } = require('../protocol/json');
const code = expected => error => error.code === expected;
const clone = value => JSON.parse(canonical(value));
function cleanup(t, f) { t.after(() => f.close()); return f; }
function source() { return createLifecycleSource({ sourceId: 'synthetic-observer', sourceEpoch: 'epoch-1', synthetic: true }); }
function event(s, type = 'project_open', extra = {}) {
  const current = s.snapshot(); return { sourceId: current.sourceId, sourceEpoch: current.sourceEpoch, sequence: current.sequence + 1, type, projectId: 'C:/same/project.aep', ...extra };
}

test('[lifecycle-simulation] C1 source-less startup and public tools provide no event or issuance authority', async t => {
  const ws = workspace(); const broker = new Broker(ws); t.after(() => broker.close());
  assert.equal(broker.status().ready, true); assert.equal(broker.status().connection, 'unavailable');
  assert.equal((await broker.connect()).available, false);
  assert.doesNotMatch(Object.keys(TOOL_METHODS).join(','), /lifecycle|event|grant|confirm|issuer|register/);
  assert.throws(() => createLifecycleSource({ sourceId: 'production', sourceEpoch: '1', synthetic: false }), code('explicit_synthetic_lifecycle_required'));
  assert.equal(validateLifecycleBinding({ kind: 'project-incarnation', lifecycleVerified: true, sessionId: 'forged', projectId: 'forged' }), false);
});

test('[lifecycle-simulation] C2 transitions rotate same-path incarnation and unsaved new closes admission', () => {
  const s = source(); assert.equal(s.snapshot().state, 'unavailable'); const epochs = new Set(); let old;
  for (const type of ['project_new', 'project_open', 'project_revert', 'project_replacement']) {
    const current = s.apply(event(s, type)); assert.equal(current.state, 'current');
    if (old) assert.equal(validateLifecycleBinding(old), false);
    assert.equal(validateLifecycleBinding(current.binding), true); assert.equal(epochs.has(current.sessionId), false);
    epochs.add(current.sessionId); old = current.binding;
  }
  const unsaved = s.apply(event(s, 'project_new', { projectId: undefined }));
  assert.equal(unsaved.state, 'unavailable'); assert.equal(epochs.has(unsaved.sessionId), false); assert.equal(unsaved.binding, undefined); assert.equal(validateLifecycleBinding(old), false);
});

test('[lifecycle-simulation] C2 uncertain sequences permanently lose that source epoch', () => {
  for (const corrupt of [e => ({ ...e, sequence: e.sequence + 1 }), e => ({ ...e, sequence: e.sequence - 1 }), e => ({ ...e, sourceId: 'other' }), e => ({ ...e, sourceEpoch: 'other' }), e => ({ ...e, type: 'unknown' }), e => ({ ...e, extra: true }), e => ({ ...e, projectId: 2 }), () => null]) {
    const s = source(), old = s.apply(event(s)).binding;
    assert.equal(s.apply(corrupt(event(s))).state, 'lost'); assert.equal(validateLifecycleBinding(old), false);
    assert.equal(s.apply(event(s)).state, 'lost');
  }
  const s = source(), old = s.apply(event(s)).binding;
  assert.throws(() => s.restart({ sourceEpoch: 'next', unexpected: true })); assert.equal(s.snapshot().state, 'lost'); assert.equal(validateLifecycleBinding(old), false);
});

test('[lifecycle-simulation] C3 loss reconnect and restart never recover old project proof', async t => {
  const f = cleanup(t, fixture()); const p = await prepare(f); const old = f.broker.sessionBinding;
  f.lifecycle.lose('synthetic_gap');
  assert.equal(f.broker.status().connection, 'unavailable'); assert.equal((await f.broker.connect()).available, false);
  await f.broker.disconnect(); assert.equal((await f.broker.connect()).available, false); assert.equal(validateLifecycleBinding(old), false);
  const prior = f.lifecycle.snapshot(); f.lifecycle.restart({ sourceEpoch: 'new-synthetic-source-epoch' });
  assert.equal(f.lifecycle.snapshot().state, 'unavailable'); assert.equal((await f.broker.connect()).available, false);
  assert.throws(() => f.lifecycle.restart({ sourceEpoch: prior.sourceEpoch }), code('new_source_epoch_required'));
  f.lifecycle.restart({ sourceEpoch: 'third-synthetic-source-epoch' }); f.transport.projectEvent('project_open');
  assert.notEqual(f.state.sessionId, old.sessionId); assert.equal((await f.broker.connect()).available, true);
  const result = await run(f, p); assert.equal(result.code, 'project_incarnation_changed'); assert.equal(f.state.counts.titles, 0);
});

test('[lifecycle-simulation] C4 confirmation binds complete canonical proposal and exact step', async t => {
  const f = cleanup(t, fixture()); const p = await prepare(f); assert.throws(() => f.authority.confirm('client-claim'), code('registered_proposal_required'));
  const { proposal, plan } = f.broker.proposal(p.proposalId), approval = f.broker.approval(proposal, plan);
  const request = { proposalId: approval.proposalId, planDigest: approval.planDigest, taskId: approval.taskId, taskEpoch: approval.taskEpoch, ...approval.steps[0] };
  assert.equal(f.authority.authorize(request).allowedEffect, 'layer.text');
  for (const field of ['planDigest', 'taskId', 'taskEpoch', 'stepId', 'moduleId', 'operationId', 'modulePin', 'admissionPin', 'expectedSnapshotDigest']) {
    const changed = clone(request); changed[field] = field === 'taskEpoch' ? 99 : 'changed';
    assert.throws(() => f.authority.authorize(changed), code('approval_binding_changed'), field);
  }
  for (const change of [r => { r.input.text = 'unapproved'; }, r => { r.target.layerId++; }, r => { r.effectPolicy.effect = 'other'; }]) {
    const changed = clone(request); change(changed); assert.throws(() => f.authority.authorize(changed), code('approval_binding_changed'));
  }
  f.authority.revoke(p.proposalId); assert.throws(() => f.authority.authorize(request), code('confirmation_checkpoint_ownership_required'));
  f.authority.confirm(p.proposalId); assert.equal((await run(f, p)).state, 'succeeded');
});

test('[lifecycle-simulation] C4 project transition needs new proposal ownership and checkpoint bindings', async t => {
  const f = cleanup(t, fixture()); const old = await prepare(f); const oldSession = f.state.sessionId;
  f.transport.projectEvent('project_revert'); assert.throws(() => f.authority.confirm(old.proposalId), code('authority_target'));
  f.close(); const next = cleanup(t, fixture({ workspace: f, state: f.state, transport: f.transport }));
  assert.notEqual(next.state.sessionId, oldSession); const fresh = await prepare(next, false, { taskId: 'fresh-task', workflowId: 'fresh-workflow' });
  assert.equal((await run(next, fresh)).state, 'succeeded');
  const constraints = next.broker.resources.records(), prior = constraints.find(r => r.resource.sessionId === oldSession), current = constraints.find(r => r.resource.sessionId === next.state.sessionId);
  assert.ok(prior); assert.ok(current); assert.notEqual(current.checkpointRef, prior.checkpointRef);
});

for (const action of ['loss', 'revoke', 'reset']) for (const boundary of ['afterAuthorize', 'beforeIntent', 'afterIntent', 'afterPhysicalSend']) {
  test('[lifecycle-simulation] C5 ' + action + ' at ' + boundary + ' preserves the send boundary', async t => {
    let f, p;
    f = cleanup(t, fixture({ hooks: { [boundary](receipt, broker) {
      if (action === 'loss') f.lifecycle.lose('synthetic-loss');
      if (action === 'revoke') f.authority.revoke(p.proposalId);
      if (action === 'reset') broker.reset({ taskId: p.taskId });
    } } }));
    p = await prepare(f); const result = await run(f, p); assert.equal(result.state, 'stopped');
    const commands = f.broker.ledger.commands();
    if (boundary === 'afterAuthorize' || boundary === 'beforeIntent') { assert.equal(commands.length, 0); assert.equal(f.state.counts.titles, 0); }
    else if (boundary === 'afterIntent') { assert.equal(commands.length, 1); assert.equal(commands[0].state, 'rejected'); assert.equal(f.state.counts.titles, 0); }
    else {
      assert.equal(commands.length, 1); assert.ok(!['succeeded', 'rejected'].includes(commands[0].state));
      assert.equal(f.broker.ledger.unresolved().length, 1); assert.equal(f.state.counts.titles, 1); assert.ok(commands[0].dispatchBinding.receiverStoreIdentity);
      f.broker.reset({ taskId: 'another-task' }); assert.equal(f.broker.ledger.unresolved().length, 1);
      assert.equal(f.state.counts.titles, 1);
    }
  });
}

for (const boundary of ['afterAck', 'afterReadback']) for (const action of ['loss', 'revoke']) {
  test('[lifecycle-simulation] C5 late ' + action + ' at ' + boundary + ' preserves ACK and fence', async t => {
    let f, p; f = cleanup(t, fixture({ hooks: { [boundary]() {
      if (action === 'loss') f.lifecycle.lose('late-event'); else f.authority.revoke(p.proposalId);
    } } }));
    p = await prepare(f); assert.equal((await run(f, p)).state, 'stopped');
    const command = f.broker.ledger.commands()[0]; assert.equal(command.state, 'acknowledged');
    assert.equal(f.broker.ledger.unresolved().length, 1); assert.equal(f.state.counts.titles, 1); assert.ok(command.dispatchBinding.receiverStoreIdentity);
  });
}

test('[lifecycle-simulation] C5 throwing physical-send hook cannot classify a submitted mutation as rejected', async t => {
  const f = cleanup(t, fixture({ hooks: { afterPhysicalSend() { throw Object.assign(new Error('synthetic-hook-fault'), { code: 'synthetic-hook-fault' }); } } }));
  const p = await prepare(f); assert.equal((await run(f, p)).code, 'synthetic-hook-fault');
  assert.equal(f.state.counts.titles, 1); assert.equal(f.broker.ledger.commands()[0].state, 'UNKNOWN'); assert.equal(f.broker.ledger.unresolved().length, 1);
});

test('[lifecycle-simulation] C5 event during evaluate retains applied receipt and cannot fabricate readback success', async t => {
  let f; f = cleanup(t, fixture({ transportOptions: { afterEvaluate({ phase }) { if (phase === 'mutate') f.lifecycle.lose('event-after-evaluate'); } } }));
  const p = await prepare(f); const outcome = await run(f, p); assert.equal(outcome.state, 'stopped');
  assert.equal(f.state.counts.titles, 1); assert.equal(f.broker.ledger.unresolved().length, 1); assert.equal(f.broker.ledger.commands()[0].state, 'UNKNOWN');
  await assert.rejects(f.broker.reconcile({ taskId: p.taskId }), code('trusted_project_lifecycle_unavailable'));
});

test('[lifecycle-simulation] C5 retained observer permits original completion plus independent verification after broker reopen', async t => {
  const f = cleanup(t, fixture({ transportOptions: { loseAck: command => command.phase === 'mutate' } }));
  const p = await prepare(f); assert.equal((await run(f, p)).state, 'stopped');
  const original = clone(f.broker.ledger.commands()[0].dispatchBinding); f.close();
  const next = cleanup(t, fixture({ workspace: f, state: f.state, transport: f.transport })); await next.broker.connect();
  const before = f.transport.sends; const reconciled = await next.broker.reconcile({ taskId: p.taskId });
  assert.equal(reconciled.commands[0].state, 'succeeded'); assert.equal(f.transport.sends, before + 1); assert.equal(f.state.counts.titles, 1);
  assert.deepEqual(next.broker.ledger.commands()[0].dispatchBinding, original);
});

test('[lifecycle-simulation] C5 replacement observer cannot infer continuity from same AE values and completion store', async t => {
  const f = cleanup(t, fixture({ transportOptions: { loseAck: command => command.phase === 'mutate' } }));
  const p = await prepare(f); await run(f, p); const original = clone(f.broker.ledger.commands()[0]); f.close();
  const next = cleanup(t, fixture({ workspace: f, state: clone(f.state) })); await next.broker.connect();
  assert.notEqual(next.state.sessionId, f.state.sessionId); const before = next.transport.sends;
  const reconciled = await next.broker.reconcile({ taskId: p.taskId }); assert.equal(reconciled.commands[0].state, 'UNKNOWN'); assert.equal(next.transport.sends, before);
  assert.deepEqual(next.broker.ledger.commands()[0].dispatchBinding, original.dispatchBinding); assert.equal(next.broker.ledger.unresolved().length, 1);
  await assert.rejects(next.broker.inspect({ moduleId: 'titles', contractId: next.broker.getContract({ moduleId: 'titles' }).contractId, target: target(next, true) }), code('controller_unresolved'));
});

test('[lifecycle-simulation] C6 validation selects actual lifecycle consumers and preserves offline certification', () => {
  for (const file of ['core4/core/authority.js', 'core4/core/broker.js', 'core4/test/lifecycle-simulation.test.js', 'core4/test/fixtures/authority.js', 'core4/test/fixtures/ae.js']) {
    const report = selectChecks([file]); const check = report.checks.find(c => c.check === 'lifecycle-simulation');
    assert.ok(check, file); assert.ok(check.dependencies.includes('test/lifecycle-simulation.test.js')); assert.ok(check.dependencies.includes('test/fixtures/authority.js'));
    assert.equal(report.releaseCertified, false); assert.equal(check.command[3], 'test/lifecycle-simulation.test.js');
  }
});

for (const boundary of ['completion', 'verify']) for (const change of ['loss', 'revert']) {
  test('[lifecycle-simulation] C5 reconciliation microtask ' + change + ' after ' + boundary + ' cannot record terminal success', async t => {
    const f = cleanup(t, fixture({ transportOptions: { loseAck: command => command.phase === 'mutate' } }));
    const p = await prepare(f); await run(f, p); const before = clone(f.broker.ledger.commands()[0]);
    const event = () => { if (change === 'loss') f.lifecycle.lose('microtask-boundary'); else f.transport.projectEvent('project_revert'); };
    if (boundary === 'completion') {
      const completion = f.transport.completion.bind(f.transport);
      f.transport.completion = async (...args) => { const result = await completion(...args); queueMicrotask(event); return result; };
    } else {
      const send = f.broker.send.bind(f.broker);
      f.broker.send = async (...args) => { const result = await send(...args); if (args[1] === 'verify') queueMicrotask(event); return result; };
    }
    await assert.rejects(f.broker.reconcile({ taskId: p.taskId }), code('trusted_project_lifecycle_unavailable'));
    assert.equal(f.broker.ledger.unresolved().length, 1); assert.equal(f.broker.ledger.commands()[0].state, before.state);
    assert.deepEqual(f.broker.ledger.commands()[0].dispatchBinding, before.dispatchBinding); assert.equal(f.state.counts.titles, 1);
  });
}

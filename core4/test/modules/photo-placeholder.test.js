'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { moduleFixture } = require('../module-harness');
test('[photo-owner] deterministic photo intent without titles or engine package', async t => {
  const f = await moduleFixture(t, 'photo-placeholder'); const before = await f.snapshot(); const desired = { ...f.target, newSourceId: 12 };
  const input = await f.intent(desired, before); assert.deepEqual(input, await f.intent(desired, before)); assert.equal(input.expectedOldSourceId, 11);
  assert.deepEqual(f.broker.worker.status().loaded, ['photo-placeholder@' + f.selected.pin]); assert.equal(f.trace.filter(file => /modules\/titles|plan-engine/.test(file)).length, 0);
  assert.equal(fs.existsSync(path.join(f.root, 'modules/titles')), false); assert.equal(fs.existsSync(path.join(f.root, 'plan-engine')), false);
});
test('[photo-executor-contract] imported still only exact source/revision CAS and preserved transform timing', async t => {
  const f = await moduleFixture(t, 'photo-placeholder'); const before = await f.snapshot(); const input = await f.intent({ ...f.target, newSourceId: 12 }, before);
  for (const patch of [{ newSourceId: 13 }, { newSourceId: 1 }, { newSourceId: 999 }, { expectedOldSourceId: 99 }, { expectedRevision: 'stale' }, { layerId: 102 }]) assert.equal((await f.mutate({ ...input, ...patch })).outcome, 'rejected');
  assert.equal(f.state.counts.photo, 0); assert.equal((await f.mutate(input)).outcome, 'applied'); const after = await f.verify(input, before); assert.equal(after.sourceId, 12); assert.equal(after.protected, before.protected); assert.equal(f.state.counts.photo, 1);
});
test('[photo-executor-contract] mutation setter error protected drift and time remap fail closed', async t => {
  for (const flag of ['photoSetterThrows', 'damageTransform']) {
    const f = await moduleFixture(t, 'photo-placeholder'); const before = await f.snapshot(); const input = await f.intent({ ...f.target, newSourceId: 12 }, before); f.state.flags[flag] = true;
    assert.equal((await f.mutate(input)).outcome, 'unknown'); assert.equal(f.state.counts.photo, 1);
  }
  const f = await moduleFixture(t, 'photo-placeholder'); f.state.flags.timeRemap = true; await assert.rejects(f.snapshot()); assert.equal(f.state.counts.photo, 0);
});
test('[photo-executor-contract] installed registry requires native confirmation and rechecks photos and neighbors across it', () => {
  const vm = require('node:vm');
  const { buildPackage } = require('../../tools/package-installable');
  const { initialState, environment } = require('../fixtures/ae');
  const { createPhotoSourceProof } = require('../../runtime/photo-source-proof');
  const pkg = buildPackage(undefined, 'manual-titles-variants', { runtimeModel: 'owner' });
  const pilot = buildPackage(undefined, 'operator-titles-photo-pilot', { runtimeModel: 'owner' });
  const read = file => Buffer.from(pkg.files[file], 'base64').toString('utf8');
  const executorHash = JSON.parse(read('config/admissions/photo-placeholder.json')).executorHash;
  const state = initialState(), host = environment(state, () => {});
  const project = host.app.project, comp = project.item(1), neighbor = comp.layer(2);
  delete host.AE_CORE_SESSION_ID;
  Object.assign(comp, { name: 'Fixture', width: 600, height: 400, pixelAspect: 1, duration: 5, frameDuration: 1 / 30 });
  Object.assign(neighbor, { name: 'Guard', enabled: false, inPoint: 0, outPoint: 5 });
  for (const index of [2, 3]) {
    const photo = project.item(index);
    Object.assign(photo, { name: 'photo-' + photo.id, width: 600, height: 400, pixelAspect: 1, hasVideo: true,
      file: { fsName: 'C:/fixture/photo-' + photo.id + '.jpg', exists: true } });
  }
  let dialogCount = 0, decision = () => false;
  host.confirm = (message, defaultNo) => {
    dialogCount++;
    assert.equal(defaultNo, true);
    assert.match(message, /compId: 1 \/ layerId: 101/);
    assert.match(message, /#11: "C:\/fixture\/photo-11.jpg"[\s\S]*#12: "C:\/fixture\/photo-12.jpg"/);
    return decision();
  };
  const context = vm.createContext(host);
  vm.runInContext(read('cep/jsx/registry.jsx'), context);
  const call = (phase, typedPayload) => JSON.parse(vm.runInContext(
    'AECore4Host.dispatch(' + JSON.stringify(JSON.stringify({
      assetKey: 'photo-placeholder-v1', phase, pins: { executorHash }, typedPayload
    })) + ')', context));
  const target = { sessionId: 'work-session', projectId: state.projectId, compId: 1, layerId: 101 };
  const before = call('inspect', target);
  assert.equal(before.sourceId, 11);
  assert.equal(call('inspect', { ...target, projectId: 'C:/foreign.aep' }).code, 'inspection_failed');
  const input = { ...target, newSourceId: 12, expectedOldSourceId: 11, expectedRevision: before.revision,
    _execution: { policyId: 'current-matching-target-after-local-confirmation-v1', proposalId: 'proposal', planDigest: 'plan',
      taskId: 'task', taskEpoch: 0, stepId: 'photo', checkpointRef: 'checkpoint', checkpointDigest: 'digest',
      baselineDigest: 'baseline', baselineRevision: before.revision, baselineProtected: before.protected, target } };
  assert.equal(call('mutate', { ...input, _execution: null }).code, 'manual_approval_binding');
  assert.equal(dialogCount, 0);
  assert.equal(call('mutate', input).code, 'local_cancelled');
  decision = () => { neighbor.enabled = true; return true; };
  assert.equal(call('mutate', input).code, 'stale_target');
  neighbor.enabled = false;
  decision = () => { project.item(3).file.fsName = 'C:/different.jpg'; return true; };
  assert.equal(call('mutate', input).code, 'stale_new_source');
  project.item(3).file.fsName = 'C:/fixture/photo-12.jpg';
  assert.equal(state.counts.photo, 0);
  decision = () => true;
  const result = call('mutate', input), after = call('inspect', target);
  assert.equal(result.outcome, 'applied');
  assert.deepEqual(result.snapshot, after);
  assert.equal(after.protected, before.protected);
  assert.equal(result.transactionReceipt.resultRevision, after.revision);
  assert.equal(result.transactionReceipt.checkpointRef, 'checkpoint');
  const proof = createPhotoSourceProof(() => 'work-session');
  assert.doesNotThrow(() => proof.assertTarget(target));
  assert.throws(() => proof.assertTarget({ ...target, sessionId: 'older-session' }), /photo_work_session_changed/);
  assert.doesNotThrow(() => proof.validateResult({ input, before }, after));
  assert.throws(() => proof.validateResult({ input, before }, { ...after, sourceId: 13 }), /photo_source_readback/);
  assert.equal(state.counts.photo, 1);
  const baseline = { ...target, newSourceId: 11, expectedOldSourceId: 12, expectedRevision: after.revision };
  const execution = { ...input._execution, baselineRevision: after.revision, baselineProtected: after.protected,
    operatorConfirmation: { digest: 'a'.repeat(64), expiresAt: Date.now() - 1000 } };
  vm.runInContext(Buffer.from(pilot.files['cep/jsx/registry.jsx'], 'base64').toString('utf8'), context);
  const confirmations = dialogCount;
  assert.equal(call('mutate', { ...baseline, _execution: execution }).code, 'operator_confirmation_expired');
  execution.operatorConfirmation.expiresAt = Date.now() + 10000;
  const delegated = call('mutate', { ...baseline, _execution: execution });
  assert.equal(delegated.outcome, 'applied');
  assert.equal(delegated.snapshot.sourceId, 11);
  assert.equal(delegated.snapshot.protected, before.protected);
  assert.equal(dialogCount, confirmations);
  assert.equal(state.counts.photo, 2);
});

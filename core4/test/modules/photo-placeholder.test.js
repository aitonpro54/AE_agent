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

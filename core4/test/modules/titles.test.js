'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { canonical } = require('../../protocol/json');
const { moduleFixture } = require('../module-harness');
test('[titles-owner] deterministic builder selects titles only; photo and engine physically absent', async t => {
  const f = await moduleFixture(t, 'titles'); const before = await f.snapshot(); const desired = { ...f.target, text: 'A title' };
  const first = await f.intent(desired, before), second = await f.intent(desired, before); assert.deepEqual(first, second); assert.equal(first.expectedText, 'Before');
  assert.deepEqual(f.broker.worker.status().loaded, ['titles@' + f.selected.pin]); assert.equal(f.trace.filter(file => /photo-placeholder|plan-engine/.test(file)).length, 0);
  assert.equal(fs.existsSync(path.join(f.root, 'modules/photo-placeholder')), false); assert.equal(fs.existsSync(path.join(f.root, 'plan-engine')), false);
  await assert.rejects(f.intent({ ...desired, text: 'two\nlines' }, before));
});
test('[titles-executor-contract] actual fixed JSX set-text CAS and independent uniform-style readback', async t => {
  const f = await moduleFixture(t, 'titles'); const before = await f.snapshot(), style = canonical(f.state.style); const input = await f.intent({ ...f.target, text: 'After' }, before);
  assert.equal((await f.mutate({ ...input, expectedText: 'stale' })).outcome, 'rejected'); assert.equal(f.state.counts.titles, 0);
  assert.equal((await f.mutate({ ...input, expectedRevision: 'stale' })).outcome, 'rejected'); assert.equal(f.state.counts.titles, 0);
  const result = await f.mutate(input); assert.equal(result.outcome, 'applied'); const after = await f.verify(input, before); assert.equal(after.text, 'After'); assert.equal(canonical(f.state.style), style); assert.equal(f.state.counts.titles, 1);
});
test('[titles-executor-contract] unsupported style API mixed text keys expressions and identity fail closed', async t => {
  for (const flag of ['mixed', 'animated', 'expression', 'noCharacterRange']) {
    const f = await moduleFixture(t, 'titles'); f.state.flags[flag] = true; await assert.rejects(f.snapshot()); assert.equal(f.state.counts.titles, 0);
  }
  const f = await moduleFixture(t, 'titles'); const before = await f.snapshot(); const input = await f.intent({ ...f.target, text: 'After' }, before);
  for (const patch of [{ layerId: 101 }, { compId: 99 }]) assert.equal((await f.mutate({ ...input, ...patch })).outcome, 'rejected');
  for (const patch of [{ sessionId: 'old-project-incarnation' }, { projectId: 'foreign-project' }]) {
    await assert.rejects(f.mutate({ ...input, ...patch }), error => error.code === 'project_incarnation_changed');
    assert.equal((await f.mutateExecutor({ ...input, ...patch })).outcome, 'rejected');
  }
  assert.equal(f.state.counts.titles, 0);
});
test('[titles-executor-contract] setter mutation then error and protected style change remain unknown', async t => {
  for (const flag of ['textSetterThrows', 'damageStyle']) {
    const f = await moduleFixture(t, 'titles'); const before = await f.snapshot(); const input = await f.intent({ ...f.target, text: 'After' }, before); f.state.flags[flag] = true;
    assert.equal((await f.mutate(input)).outcome, 'unknown'); assert.equal(f.state.counts.titles, 1);
  }
});

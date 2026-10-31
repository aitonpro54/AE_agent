'use strict';
const nodeTest = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { harness } = require('./fixtures/stopped-host-readoption');
const test = (name, fn) => nodeTest('readoption-enable ' + name, { timeout: 90000 }, fn);
const code = c => e => e.code === c;
const synthetic = () => Object.assign(Error('explicit TEMP enable crash'), { code: 'fixture_enable_crash' });
async function applied(h) { const p = await h.inspect(); await h.api.applyStoppedReadoption({ ...h.options, expectedProofHash: p.proofHash, witness: h.witness }); h.nextActor(); return h.inspect(); }
function crash(h, method, match) {
  const original = h.f.io[method]; let fired = false;
  h.f.io[method] = (...args) => { const value = original(...args); if (!fired && match(...args)) { fired = true; throw synthetic(); } return value; };
  return () => { h.f.io[method] = original; assert.equal(fired, true, 'enable crash hook must fire'); };
}
const boundaries = {
  intent: ['linkSync', (h, a, b) => b === h.path('readopt-enable-intent.json')],
  install: ['linkSync', (h, a, b) => b === path.join(h.f.root, 'install.lock')],
  broker: ['linkSync', (h, a, b) => b === h.f.path('broker/broker-owner.gate')],
  ready: ['linkSync', (h, a, b) => b === h.path('readopt-enable-ready.json')],
  archive: ['linkSync', (h, a, b) => b === h.path('readopt-stop.json')],
  unlink: ['unlinkSync', (h, a) => a === h.f.path('runtime-maintenance.json')],
  enabled: ['linkSync', (h, a, b) => b === h.path('readopt-enabled.json')],
  releaseBroker: ['unlinkSync', (h, a) => a === h.f.path('broker/broker-owner.gate')],
  releaseInstall: ['unlinkSync', (h, a) => a === path.join(h.f.root, 'install.lock')]
};
for (const [boundary, [method, match]] of Object.entries(boundaries)) test('H08/F04 exact enable prefix ' + boundary + ' finishes locally with host absent', async t => {
  const h = await harness(t, { hostAdoption: true }), seen = await applied(h), adoption = fs.readFileSync(h.adoptionPath), probes = h.hostProbes(), restore = crash(h, method, (...args) => match(h, ...args));
  try { await assert.rejects(h.api.enableStoppedReadoption({ ...h.options, expectedProofHash: seen.proofHash }), code('fixture_enable_crash')); } finally { restore(); }
  const originalIntent = fs.readFileSync(h.path('readopt-enable-intent.json')); h.nextActor(); h.hostUnavailable(true);
  if (boundary === 'unlink' || boundary === 'enabled') {
    // A cold owner may attempt startup after unlink, but the remaining private
    // install gate must refuse before owner/diagnostic publication or cleanup.
    const before = h.f.snapshot(), gate = fs.readFileSync(path.join(h.f.root, 'install.lock')); let candidate;
    try { candidate = await h.f.create(); } catch (error) { assert.ok(error.code); }
    if (candidate) assert.notEqual(candidate.state().mode, 'active');
    assert.deepEqual(h.f.snapshot(), before); assert.deepEqual(fs.readFileSync(path.join(h.f.root, 'install.lock')), gate);
    for (const n of ['runtime-owner.json', 'runtime-diagnostic.json', 'broker/broker-owner.lock', 'receiver/owner']) assert.equal(fs.existsSync(h.f.path(n)), false);
  }
  const current = await h.inspect(), done = await h.api.finishEnableStoppedReadoption({ ...h.options, expectedProofHash: current.proofHash });
  assert.equal(done.phase, 'enabled'); assert.equal(h.hostProbes(), probes); assert.deepEqual(fs.readFileSync(h.adoptionPath), adoption);
  assert.deepEqual(fs.readFileSync(h.path('readopt-enable-intent.json')), originalIntent);
  assert.equal(fs.existsSync(h.f.path('runtime-maintenance.json')), false); assert.equal(fs.existsSync(path.join(h.f.root, 'install.lock')), false); assert.equal(fs.existsSync(h.f.path('broker/broker-owner.gate')), false);
  for (const k of ['runtimeStarted', 'mutationGrant', 'lifecycleEpoch', 'aeAuthority']) assert.equal(done[k], false);
});
test('broker-only is foreign release state; the legitimate install-only prefix is covered above', async t => {
  const h = await harness(t, { hostAdoption: true }), seen = await applied(h), restore = crash(h, 'linkSync', (a, b) => b === h.path('readopt-enabled.json'));
  try { await assert.rejects(h.api.enableStoppedReadoption({ ...h.options, expectedProofHash: seen.proofHash })); } finally { restore(); }
  h.nextActor(); fs.unlinkSync(path.join(h.f.root, 'install.lock')); const before = h.f.snapshot(), writes = h.writes();
  await assert.rejects(h.inspect(), code('readopt_gate_prefix')); assert.deepEqual(h.f.snapshot(), before); assert.equal(h.writes(), writes);
});
test('second crashed enable finisher is attributed, must die and never repeats adoption or barrier unlink', async t => {
  const h = await harness(t, { hostAdoption: true }), seen = await applied(h), restore = crash(h, 'unlinkSync', p => p === h.f.path('runtime-maintenance.json'));
  try { await assert.rejects(h.api.enableStoppedReadoption({ ...h.options, expectedProofHash: seen.proofHash })); } finally { restore(); }
  const adoption = fs.readFileSync(h.adoptionPath); h.nextActor(); const first = await h.inspect(), again = crash(h, 'linkSync', (a, b) => b === h.path('readopt-attempt-01.json'));
  try { await assert.rejects(h.api.finishEnableStoppedReadoption({ ...h.options, expectedProofHash: first.proofHash }), code('fixture_enable_crash')); } finally { again(); }
  await assert.rejects(h.inspect(), code('readopt_actor_not_dead')); h.nextActor(); h.hostUnavailable(true);
  const next = await h.inspect(); assert.equal((await h.api.finishEnableStoppedReadoption({ ...h.options, expectedProofHash: next.proofHash })).phase, 'enabled');
  assert.deepEqual(fs.readFileSync(h.adoptionPath), adoption); assert.equal(fs.existsSync(h.f.path('runtime-maintenance.json')), false); assert.ok(fs.existsSync(h.path('readopt-attempt-02.json')));
});

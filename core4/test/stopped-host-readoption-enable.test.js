'use strict';
const nodeTest = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
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
test('terminal receipt stays readonly with a live finisher, new startup gate, ready owner and later transaction/history', async t => {
  const h = await harness(t, { hostAdoption: true }), seen = await applied(h);
  const done = await h.api.enableStoppedReadoption({ ...h.options, expectedProofHash: seen.proofHash });
  const original = h.options, proof = done.proofHash; let actorQueries = 0;
  h.onObserve(() => { actorQueries++; throw Object.assign(Error('terminal queried an actor'), { code: 'fixture_terminal_actor_query' }); }); h.hostUnavailable(true);
  async function terminal() {
    const before = h.f.snapshot(), writes = h.writes(), probes = h.hostProbes(), current = await h.inspect();
    assert.equal(current.phase, 'enabled'); assert.equal(current.proofHash, proof); assert.equal(current.terminalHistorical, true);
    const finished = await h.api.finishEnableStoppedReadoption({ ...original, expectedProofHash: current.proofHash });
    for (const result of [current, finished]) for (const flag of ['runtimeStarted', 'mutationGrant', 'lifecycleEpoch', 'aeAuthority', 'currentRuntimeObserved', 'currentHistoryObserved', 'currentBarrierObserved']) assert.equal(result[flag], false);
    await assert.rejects(h.api.finishEnableStoppedReadoption({ ...original, expectedProofHash: '0'.repeat(64) }), code('readopt_action_phase'));
    for (const action of ['applyStoppedReadoption', 'finishStoppedReadoption', 'enableStoppedReadoption']) await assert.rejects(h.api[action]({ ...original, expectedProofHash: proof, ...(action === 'applyStoppedReadoption' ? { witness: h.witness } : {}) }), code('readopt_action_phase'));
    await assert.rejects(h.api.verifyStoppedReadoptionEvidence({ ...original, expectedProofHash: proof }), code('readopt_baseline_only'));
    assert.deepEqual(h.f.snapshot(), before); assert.equal(h.writes(), writes); assert.equal(h.hostProbes(), probes); assert.equal(actorQueries, 0);
  }
  await terminal(); // The original finisher is still alive; no death guard runs.
  const owner = await h.f.create(), startupGate = fs.readFileSync(path.join(h.f.root, 'install.lock'));
  await terminal(); assert.deepEqual(fs.readFileSync(path.join(h.f.root, 'install.lock')), startupGate);
  const stores = h.f.stores(owner); owner.markReady(); owner.releaseStartup(); await terminal();
  const state = owner.state(), id = crypto.randomUUID(), scope = { bootId: state.processBootId, pid: state.pid, birthTicks: state.birthTicks };
  const stop = h.maintenance.createOwnerMaintenance({ installation: h.f.d, descriptorPath: h.f.descriptorPath, lifecycle: owner, freeze() {}, activity: () => ({ pending: false }), accepted: () => 0, async close() { h.f.close(owner, stores); }, intervalMs: 1 });
  stop.request(h.maintenance.createStopAuthorization({ installation: h.f.d, descriptorPath: h.f.descriptorPath, scope, id })); assert.equal((await stop.done).phase, 'stopped');
  const newBarrier = fs.readFileSync(h.f.path('runtime-maintenance.json')); await terminal(); assert.deepEqual(fs.readFileSync(h.f.path('runtime-maintenance.json')), newBarrier);
  // Current history is deliberately opaque here, including corruption. Reading
  // an old receipt never asserts current admission, settlement or UNKNOWN=0.
  fs.appendFileSync(h.f.path('receiver/completions.ndjson'), 'opaque later history\n'); fs.appendFileSync(h.f.path('broker/ledger.ndjson'), 'opaque later history\n');
  await terminal();
});
test('terminal after last unlink ignores foreign gate/barrier payload before helper return and never follows direct foreign links', async t => {
  const h = await harness(t, { hostAdoption: true }), seen = await applied(h), gate = path.join(h.f.root, 'install.lock'), barrier = h.f.path('runtime-maintenance.json');
  const unlink = h.f.io.unlinkSync, open = h.f.io.openSync, realpath = h.f.io.realpathSync; let foreign = false;
  h.f.io.openSync = (file, ...args) => { assert.ok(!foreign || ![gate, barrier].includes(String(file)), 'foreign canonical payload must not be opened'); return open(file, ...args); };
  h.f.io.unlinkSync = file => { const value = unlink(file); if (file === gate) { fs.writeFileSync(gate, Buffer.alloc(200 * 1024, 0x67)); fs.writeFileSync(barrier, Buffer.alloc(200 * 1024, 0x62)); foreign = true; } return value; };
  let done;
  try { done = await h.api.enableStoppedReadoption({ ...h.options, expectedProofHash: seen.proofHash }); } finally { h.f.io.unlinkSync = unlink; }
  assert.equal(foreign, true); assert.equal(done.terminalHistorical, true); const gateBytes = fs.readFileSync(gate), barrierBytes = fs.readFileSync(barrier), writes = h.writes();
  const current = await h.inspect(); assert.equal(current.proofHash, done.proofHash); await h.api.finishEnableStoppedReadoption({ ...h.options, expectedProofHash: current.proofHash });
  assert.deepEqual(fs.readFileSync(gate), gateBytes); assert.deepEqual(fs.readFileSync(barrier), barrierBytes); assert.equal(h.writes(), writes);
  fs.unlinkSync(gate); const target = path.join(h.f.base, 'opaque-directory'); fs.mkdirSync(target); fs.writeFileSync(path.join(target, 'untouched'), 'foreign'); fs.symlinkSync(target, gate, 'junction');
  const identity = fs.lstatSync(gate, { bigint: true }).ino;
  h.f.io.realpathSync = file => { assert.notEqual(String(file), gate, 'direct foreign link must not be followed'); return realpath(file); };
  const before = h.writes(); assert.equal((await h.inspect()).proofHash, done.proofHash); assert.equal(h.writes(), before); assert.equal(fs.lstatSync(gate, { bigint: true }).ino, identity);
});
const terminalTamper = {
  'original install alias reappears': h => {
    const intent = JSON.parse(fs.readFileSync(h.path('readopt-enable-intent.json'))).body;
    fs.linkSync(path.join(h.f.root, 'transactions', 'readopt-preparation-' + intent.preparation.id, 'install-gate'), path.join(h.f.root, 'install.lock'));
  },
  'original role anchor gains an unaccounted alias': h => {
    const intent = JSON.parse(fs.readFileSync(h.path('readopt-enable-intent.json'))).body;
    fs.linkSync(path.join(h.f.root, 'transactions', 'readopt-preparation-' + intent.preparation.id, 'broker-gate'), path.join(h.f.base, 'foreign-alias'));
  },
  'original stop alias reappears': h => fs.linkSync(h.path('readopt-stop.json'), h.f.path('runtime-maintenance.json')),
  'original certificate is byte-equal replaced': h => { const file = h.path('stopped-certificate.json'), other = path.join(h.f.base, 'new-certificate'); fs.writeFileSync(other, fs.readFileSync(file)); fs.renameSync(other, file); },
  'original phase has an unrecognized entry': h => fs.writeFileSync(h.path('unrecognized-original-entry'), 'foreign'),
  'protected client is byte-equal replaced': h => { const file = path.join(h.f.root, 'core-client.json'), other = path.join(h.f.base, 'new-client'); fs.writeFileSync(other, fs.readFileSync(file)); fs.renameSync(other, file); }
};
for (const [name, tamper] of Object.entries(terminalTamper)) test('terminal zero-write refusal when ' + name, async t => {
  const h = await harness(t, { hostAdoption: true }), seen = await applied(h);
  await h.api.enableStoppedReadoption({ ...h.options, expectedProofHash: seen.proofHash }); tamper(h);
  const before = h.f.snapshot(), writes = h.writes(); await assert.rejects(h.inspect()); assert.deepEqual(h.f.snapshot(), before); assert.equal(h.writes(), writes);
});
test('terminal refuses ancestor junctions without following the parent or writing', async t => {
  const h = await harness(t, { hostAdoption: true }), seen = await applied(h); await h.api.enableStoppedReadoption({ ...h.options, expectedProofHash: seen.proofHash });
  const broker = h.f.path('broker'), retired = h.f.path('broker-original'), target = path.join(h.f.base, 'opaque-broker');
  fs.mkdirSync(target); fs.renameSync(broker, retired); fs.symlinkSync(target, broker, 'junction');
  const realpath = h.f.io.realpathSync, identity = fs.lstatSync(broker, { bigint: true }).ino;
  h.f.io.realpathSync = file => { assert.notEqual(String(file), broker, 'junction parent must fail before realpath traversal'); return realpath(file); };
  const writes = h.writes(), receipt = fs.readFileSync(h.path('readopt-enabled.json'));
  await assert.rejects(h.inspect(), code('maintenance_path')); assert.equal(h.writes(), writes); assert.equal(fs.lstatSync(broker, { bigint: true }).ino, identity); assert.deepEqual(fs.readFileSync(h.path('readopt-enabled.json')), receipt);
});
for (const boundary of ['enabled', 'releaseBroker']) test('terminal does not bypass actor death while original ' + boundary + ' release gates remain', async t => {
  const h = await harness(t, { hostAdoption: true }), seen = await applied(h), [method, match] = boundaries[boundary], restore = crash(h, method, (...args) => match(h, ...args));
  try { await assert.rejects(h.api.enableStoppedReadoption({ ...h.options, expectedProofHash: seen.proofHash }), code('fixture_enable_crash')); } finally { restore(); }
  h.unavailable(true); const before = h.f.snapshot(), writes = h.writes();
  await assert.rejects(h.inspect(), code('owner_process_probe_unavailable')); assert.deepEqual(h.f.snapshot(), before); assert.equal(h.writes(), writes);
});

'use strict';
const nodeTest = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { harness } = require('./fixtures/stopped-host-readoption');
const test = (name, fn) => nodeTest('readoption-recovery ' + name, { timeout: 90000 }, fn);
const code = c => e => e.code === c;
const synthetic = () => Object.assign(Error('explicit TEMP crash after filesystem operation'), { code: 'fixture_readopt_crash' });
async function apply(h) { const seen = await h.inspect(); return h.api.applyStoppedReadoption({ ...h.options, expectedProofHash: seen.proofHash, witness: h.witness }); }
function crash(h, method, match) {
  const original = h.f.io[method]; let fired = false;
  h.f.io[method] = (...args) => { const value = original(...args); if (!fired && match(...args)) { fired = true; throw synthetic(); } return value; };
  return { restore() { h.f.io[method] = original; assert.equal(fired, true, 'crash hook must fire'); }, fired: () => fired };
}
const applyBoundaries = {
  claim: ['linkSync', (h, a, b) => b === h.path('readopt-intent.json')],
  install: ['linkSync', (h, a, b) => b === path.join(h.f.root, 'install.lock')],
  broker: ['linkSync', (h, a, b) => b === h.f.path('broker/broker-owner.gate')],
  lease: ['linkSync', (h, a, b) => b === h.path('readopt-lease.json')],
  archive: ['linkSync', (h, a, b) => b === h.path('readopt-old.json')],
  stage: ['linkSync', (h, a, b) => b === h.f.path('host-adoption.readopt-' + h.id + '.json')],
  ready: ['linkSync', (h, a, b) => b === h.path('readopt-cas-ready.json')],
  cas: ['renameSync', (h, a, b) => b === h.adoptionPath],
  completed: ['linkSync', (h, a, b) => b === h.path('readopt-completed.json')],
  releaseBroker: ['unlinkSync', (h, a) => a === h.f.path('broker/broker-owner.gate')],
  releaseInstall: ['unlinkSync', (h, a) => a === path.join(h.f.root, 'install.lock')]
};
for (const [boundary, [method, match]] of Object.entries(applyBoundaries)) test('H05/F04 forward original apply prefix ' + boundary + ' without replay', async t => {
  const h = await harness(t, { hostAdoption: true, priorAnchor: true }), hook = crash(h, method, (...args) => match(h, ...args));
  try { await assert.rejects(apply(h), code('fixture_readopt_crash')); } finally { hook.restore(); }
  const claim = fs.readFileSync(h.path('readopt-intent.json')), afterCas = ['cas', 'completed', 'releaseBroker', 'releaseInstall'].includes(boundary), probes = h.hostProbes();
  h.nextActor(); if (afterCas) h.hostUnavailable(true);
  const originalInspection = await h.inspect(), stable = h.f.snapshot(), writes = h.writes();
  await assert.rejects(h.api.finishStoppedReadoption({ ...h.options, expectedProofHash: '0'.repeat(64) }), code('readopt_proof_changed'));
  assert.deepEqual(h.f.snapshot(), stable); assert.equal(h.writes(), writes);
  const done = await h.api.finishStoppedReadoption({ ...h.options, expectedProofHash: originalInspection.proofHash });
  assert.equal(done.phase, 'readopt-completed-stopped'); assert.deepEqual(fs.readFileSync(h.path('readopt-intent.json')), claim);
  assert.deepEqual(fs.readFileSync(h.path('readopt-old.json')), h.oldAdoption); assert.ok(fs.existsSync(h.f.path('runtime-maintenance.json')));
  assert.equal(fs.existsSync(path.join(h.f.root, 'install.lock')), false); assert.equal(fs.existsSync(h.f.path('broker/broker-owner.gate')), false);
  if (afterCas) assert.equal(h.hostProbes(), probes, 'post-CAS settlement must not query AE');
});
for (const boundary of ['claim', 'install', 'broker']) test('H04 generic admission refuses claim with prefix ' + boundary, async t => {
  const h = await harness(t, { hostAdoption: true }), [method, match] = applyBoundaries[boundary], hook = crash(h, method, (...args) => match(h, ...args));
  try { await assert.rejects(apply(h), code('fixture_readopt_crash')); } finally { hook.restore(); }
  h.nextActor(); const before = h.f.snapshot(), writes = h.writes();
  await assert.rejects(h.maintenance.inspectMaintenance(h.options)); await assert.rejects(h.certifier.inspectStoppedCertification(h.options));
  await assert.rejects(h.certifier.certifyStoppedInstallation({ ...h.options, expectedProofHash: '0'.repeat(64) }));
  assert.deepEqual(h.f.snapshot(), before); assert.equal(h.writes(), writes);
});
for (const name of ['replacement.json', 'candidate.json', 'publication.json']) test('F02 partial external ' + name + ' is inert, never a canonical intent', async t => {
  const h = await harness(t, { hostAdoption: true }), original = h.f.io.writeSync; let fired = false;
  h.f.io.writeSync = (fd, value, ...args) => {
    if (!fired && h.f.openFiles.get(fd)?.includes(name + '.stage-')) { fired = true; return original(fd, value.subarray(0, Math.max(1, Math.floor(value.length / 2)))); }
    return original(fd, value, ...args);
  };
  try { await assert.rejects(apply(h), code('maintenance_short_write')); } finally { h.f.io.writeSync = original; }
  assert.equal(fired, true); assert.equal(fs.existsSync(h.path('readopt-intent.json')), false); assert.deepEqual(fs.readFileSync(h.adoptionPath), h.oldAdoption);
  assert.equal((await h.inspect()).phase, 'readopt-preflight');
  assert.equal((await apply(h)).phase, 'readopt-completed-stopped');
});
test('H09 pre-CAS host loss preserves stopped fence and finish refuses before any writes', async t => {
  const h = await harness(t, { hostAdoption: true }), [method, match] = applyBoundaries.ready, hook = crash(h, method, (...args) => match(h, ...args));
  try { await assert.rejects(apply(h), code('fixture_readopt_crash')); } finally { hook.restore(); }
  h.nextActor(); const seen = await h.inspect(); h.hostUnavailable(true); const before = h.f.snapshot(), writes = h.writes();
  await assert.rejects(h.api.finishStoppedReadoption({ ...h.options, expectedProofHash: seen.proofHash }), code('fixture_host_unavailable'));
  assert.deepEqual(h.f.snapshot(), before); assert.equal(h.writes(), writes); assert.deepEqual(fs.readFileSync(h.adoptionPath), h.oldAdoption);
});
test('H06 two interrupted actors retain distinct lineage; live actor and unavailable death proof refuse', async t => {
  const h = await harness(t, { hostAdoption: true }), first = crash(h, 'linkSync', (a, b) => b === h.path('readopt-intent.json'));
  try { await assert.rejects(apply(h)); } finally { first.restore(); }
  const before = h.f.snapshot(), writes = h.writes(); await assert.rejects(h.inspect(), code('readopt_actor_not_dead')); assert.deepEqual(h.f.snapshot(), before); assert.equal(h.writes(), writes);
  h.nextActor(); const seen = await h.inspect(), next = crash(h, 'linkSync', (a, b) => b === h.path('readopt-attempt-01.json'));
  try { await assert.rejects(h.api.finishStoppedReadoption({ ...h.options, expectedProofHash: seen.proofHash }), code('fixture_readopt_crash')); } finally { next.restore(); }
  await assert.rejects(h.inspect(), code('readopt_actor_not_dead')); h.nextActor(); h.unavailable(true); await assert.rejects(h.inspect(), code('owner_process_probe_unavailable')); h.unavailable(false);
  const current = await h.inspect(); assert.equal((await h.api.finishStoppedReadoption({ ...h.options, expectedProofHash: current.proofHash })).phase, 'readopt-completed-stopped');
  assert.ok(fs.existsSync(h.path('readopt-attempt-02.json')));
});
for (const drift of ['adoption-inode', 'replacement-inode', 'replacement-extra-alias', 'gate-inode', 'unknown-record', 'corrupt-record', 'missing-recorded-gate', 'journal', 'ledger', 'certificate-inode', 'origin']) test('H03 zero-write refusal ' + drift, async t => {
  const h = await harness(t, { hostAdoption: true }), [method, match] = applyBoundaries.ready, hook = crash(h, method, (...args) => match(h, ...args));
  try { await assert.rejects(apply(h)); } finally { hook.restore(); } h.nextActor();
  const intent = JSON.parse(fs.readFileSync(h.path('readopt-intent.json'))).body, prep = path.join(h.f.root, 'transactions', 'readopt-preparation-' + intent.preparation.id);
  const replace = file => { const b = fs.readFileSync(file); fs.renameSync(file, path.join(h.f.base, 'retained-foreign')); fs.writeFileSync(file, b); };
  if (drift === 'adoption-inode') replace(h.adoptionPath);
  if (drift === 'replacement-inode') replace(path.join(prep, 'replacement.json'));
  if (drift === 'replacement-extra-alias') fs.linkSync(path.join(prep, 'replacement.json'), path.join(h.f.base, 'foreign-alias'));
  if (drift === 'gate-inode') replace(path.join(h.f.root, 'install.lock'));
  if (drift === 'unknown-record') fs.writeFileSync(h.path('readopt-foreign.json'), '{}');
  if (drift === 'corrupt-record') fs.appendFileSync(h.path('readopt-cas-ready.json'), ' ');
  if (drift === 'missing-recorded-gate') fs.unlinkSync(h.f.path('broker/broker-owner.gate'));
  if (drift === 'journal') fs.appendFileSync(h.f.path('receiver/completions.ndjson'), 'foreign');
  if (drift === 'ledger') fs.writeFileSync(h.f.path('broker/ledger.ndjson'), 'foreign');
  if (drift === 'certificate-inode') replace(h.path('stopped-certificate.json'));
  if (drift === 'origin') fs.appendFileSync(path.join(h.f.root, 'origin.json'), ' ');
  const before = h.f.snapshot(), writes = h.writes(); await assert.rejects(h.inspect()); assert.deepEqual(h.f.snapshot(), before); assert.equal(h.writes(), writes);
});
test('EXDEV first canonical link has no copy fallback and leaves only inert preparation', async t => {
  const h = await harness(t, { hostAdoption: true }), link = h.f.io.linkSync; let fired = false;
  h.f.io.linkSync = (a, b) => { if (b === h.path('readopt-intent.json')) { fired = true; throw Object.assign(Error('offline cross-volume refusal'), { code: 'EXDEV' }); } return link(a, b); };
  try { await assert.rejects(apply(h), code('EXDEV')); } finally { h.f.io.linkSync = link; }
  assert.equal(fired, true); assert.equal(fs.existsSync(h.path('readopt-intent.json')), false); assert.deepEqual(fs.readFileSync(h.adoptionPath), h.oldAdoption); assert.equal((await h.inspect()).phase, 'readopt-preflight');
});
test('EEXIST original publication requires inspection and original finish, never another apply', async t => {
  const h = await harness(t, { hostAdoption: true }), seen = await h.inspect(), link = h.f.io.linkSync; let fired = false;
  h.f.io.linkSync = (a, b) => { if (!fired && b === h.path('readopt-intent.json')) { fired = true; link(a, b); throw Object.assign(Error('offline winner already published'), { code: 'EEXIST' }); } return link(a, b); };
  try { await assert.rejects(h.api.applyStoppedReadoption({ ...h.options, expectedProofHash: seen.proofHash, witness: h.witness }), code('EEXIST')); } finally { h.f.io.linkSync = link; }
  assert.equal(fired, true); const original = fs.readFileSync(h.path('readopt-intent.json')); h.nextActor(); const inspected = await h.inspect(), before = h.f.snapshot(), writes = h.writes();
  await assert.rejects(h.api.applyStoppedReadoption({ ...h.options, expectedProofHash: seen.proofHash, witness: h.witness }), code('readopt_original_inspection_required')); assert.deepEqual(h.f.snapshot(), before); assert.equal(h.writes(), writes);
  assert.equal((await h.api.finishStoppedReadoption({ ...h.options, expectedProofHash: inspected.proofHash })).phase, 'readopt-completed-stopped'); assert.deepEqual(fs.readFileSync(h.path('readopt-intent.json')), original);
});
test('last pre-CAS host await revalidates old manual bytes and never overwrites them', async t => {
  const h = await harness(t, { hostAdoption: true }), manual = Buffer.from(h.oldAdoption.toString() + ' '); let intentBytes;
  h.onHostProbe(n => { if (n === 3) { intentBytes = fs.readFileSync(h.path('readopt-intent.json')); fs.writeFileSync(h.adoptionPath, manual); } });
  await assert.rejects(apply(h), code('readopt_adoption_changed')); assert.deepEqual(fs.readFileSync(h.adoptionPath), manual); assert.deepEqual(fs.readFileSync(h.path('readopt-old.json')), manual);
  const live = fs.statSync(h.adoptionPath, { bigint: true }), archive = fs.statSync(h.path('readopt-old.json'), { bigint: true }); assert.equal(live.dev, archive.dev); assert.equal(live.ino, archive.ino); assert.equal(live.nlink, 2n); assert.equal(archive.nlink, 2n);
  assert.deepEqual(fs.readFileSync(h.path('readopt-intent.json')), intentBytes); assert.deepEqual(Buffer.from(JSON.parse(intentBytes).body.payload.old.bytes, 'base64'), h.oldAdoption); assert.ok(fs.existsSync(h.f.path('runtime-maintenance.json')));
  h.nextActor(); const before = h.f.snapshot(), writes = h.writes(); await assert.rejects(h.inspect()); await assert.rejects(h.api.finishStoppedReadoption({ ...h.options, expectedProofHash: '0'.repeat(64) })); assert.deepEqual(h.f.snapshot(), before); assert.equal(h.writes(), writes);
});
test('H06 bounded attempts preserve every original record and refuse the next publication', async t => {
  const h = await harness(t, { hostAdoption: true }), initial = crash(h, 'linkSync', (a, b) => b === h.path('readopt-intent.json'));
  try { await assert.rejects(apply(h)); } finally { initial.restore(); }
  const original = fs.readFileSync(h.path('readopt-intent.json'));
  for (let i = 1; i <= 8; i++) {
    h.nextActor(); const seen = await h.inspect(), hook = crash(h, 'linkSync', (a, b) => b === h.path('readopt-attempt-' + String(i).padStart(2, '0') + '.json'));
    try { await assert.rejects(h.api.finishStoppedReadoption({ ...h.options, expectedProofHash: seen.proofHash }), code('fixture_readopt_crash')); } finally { hook.restore(); }
  }
  h.nextActor(); const seen = await h.inspect(), before = h.f.snapshot(), writes = h.writes(); await assert.rejects(h.api.finishStoppedReadoption({ ...h.options, expectedProofHash: seen.proofHash }), code('readopt_attempt_budget'));
  assert.deepEqual(h.f.snapshot(), before); assert.equal(h.writes(), writes); assert.deepEqual(fs.readFileSync(h.path('readopt-intent.json')), original);
});

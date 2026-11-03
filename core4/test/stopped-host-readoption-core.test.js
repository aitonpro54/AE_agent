'use strict';
const nodeTest = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const { harness } = require('./fixtures/stopped-host-readoption');
const test = (name, fn, timeout = 90000) => nodeTest('readoption-core ' + name, { timeout }, fn);
const code = c => e => e.code === c;
async function apply(h) { const observed = await h.inspect(); return h.api.applyStoppedReadoption({ ...h.options, expectedProofHash: observed.proofHash, witness: h.witness }); }
test('pinned hardlink gate anchors work with the unchanged sealed lease consumer', async t => {
  const h = await harness(t, { leasePlumbing: true }), directory = path.join(h.f.base, 'inert-gates'); fs.mkdirSync(directory);
  const paths = [path.join(h.f.root, 'install.lock'), h.f.path('broker/broker-owner.gate')], gates = ['install', 'broker'].map(v => Buffer.from('fixture-inert-' + v)), fields = ['dev', 'ino', 'size', 'birthtimeNs', 'mtimeNs', 'ctimeNs'];
  const anchors = gates.map((b, i) => { const file = path.join(directory, String(i)); fs.writeFileSync(file, b); fs.linkSync(file, paths[i]); return file; });
  const facts = paths.map((file, i) => ({ file, hash: crypto.createHash('sha256').update(gates[i]).digest('hex'), stat: Object.fromEntries(fields.map(k => [k, String(fs.statSync(file, { bigint: true })[k])])) }));
  const permit = h.issueSyntheticLease({ scope: { installRoot: h.f.root, stateDir: h.f.state, descriptorPath: h.f.descriptorPath }, gates, nonce: crypto.randomUUID(), recovery: true, facts });
  const lease = h.update.acquireStoppedReadoptionLease(permit); h.leases.releaseInstallLease(lease);
  paths.forEach(p => assert.equal(fs.existsSync(p), false)); anchors.forEach((p, i) => { assert.deepEqual(fs.readFileSync(p), gates[i]); assert.equal(fs.statSync(p).nlink, 1); });
});
for (const priorAnchor of [false, true]) test('H01 one CAS preserves old bytes and supports original baseline nlink ' + (priorAnchor ? '2' : '1'), async t => {
  const h = await harness(t, { hostAdoption: true, priorAnchor }), done = await apply(h);
  assert.equal(done.phase, 'readopt-completed-stopped'); for (const k of ['runtimeStarted', 'mutationGrant', 'lifecycleEpoch', 'aeAuthority']) assert.equal(done[k], false);
  assert.deepEqual(fs.readFileSync(h.path('readopt-old.json')), h.oldAdoption);
  assert.deepEqual(JSON.parse(fs.readFileSync(h.adoptionPath)).host, JSON.parse(h.witness).host);
  assert.ok(fs.existsSync(h.f.path('runtime-maintenance.json'))); assert.equal(fs.existsSync(path.join(h.f.root, 'install.lock')), false);
  assert.equal(fs.statSync(h.path('readopt-old.json')).nlink, priorAnchor ? 2 : 1);
  h.nextActor(); const current = await h.inspect(); assert.equal(current.phase, 'readopt-completed-stopped');
});
test('H07 explicit enable changes only barrier/gates and never needs the host after committed CAS', async t => {
  const h = await harness(t, { hostAdoption: true }); await apply(h); const adoption = fs.readFileSync(h.adoptionPath), probes = h.hostProbes(); h.nextActor(); h.hostUnavailable(true);
  const current = await h.inspect(), enabled = await h.api.enableStoppedReadoption({ ...h.options, expectedProofHash: current.proofHash });
  assert.equal(enabled.phase, 'enabled'); assert.equal(fs.existsSync(h.f.path('runtime-maintenance.json')), false); assert.deepEqual(fs.readFileSync(h.adoptionPath), adoption); assert.equal(h.hostProbes(), probes);
});
test('Windows repeatability: two whole stopped cycles preserve prior anchors and close old inode FDs before CAS', async t => {
  const h = await harness(t, { hostAdoption: true }), rename = h.f.io.renameSync; let replacements = 0;
  h.f.io.renameSync = (a, b) => {
    if (b === h.adoptionPath) {
      const old = fs.statSync(h.adoptionPath, { bigint: true });
      for (const fd of h.f.tracked) { const current = fs.fstatSync(fd, { bigint: true }); assert.ok(String(current.dev) !== String(old.dev) || String(current.ino) !== String(old.ino), 'no own old-inode FD may block Windows atomic replace'); }
      assert.ok([...h.f.openFiles.values()].some(p => p.endsWith('replacement.json')), 'new inode anchor is retained over rename'); replacements++;
    }
    return rename(a, b);
  };
  await apply(h); h.nextActor(); let seen = await h.inspect(); await h.api.enableStoppedReadoption({ ...h.options, expectedProofHash: seen.proofHash });
  const firstAdoption = fs.readFileSync(h.adoptionPath), firstPhase = h.path('readopt-old.json'), oldObservation = h.observation();
  await h.newStoppedCycle(); h.overrideObservation(() => ({ ...oldObservation, observedAt: new Date(Date.now()).toISOString(), completedAt: Date.now(), processes: [{ ...oldObservation.processes[0], pid: 424243, birth: '2026-10-31T01:00:00.0000000Z' }] }));
  const witness = JSON.parse(h.witness); witness.host = { ...witness.host, aePid: 424243, aeProcessBirth: '2026-10-31T01:00:00.0000000Z' };
  seen = await h.inspect(); const done = await h.api.applyStoppedReadoption({ ...h.options, expectedProofHash: seen.proofHash, witness: Buffer.from(JSON.stringify(witness)) });
  assert.equal(done.phase, 'readopt-completed-stopped'); assert.equal(replacements, 2); assert.deepEqual(fs.readFileSync(h.path('readopt-old.json')), firstAdoption); assert.deepEqual(fs.readFileSync(firstPhase), h.oldAdoption); assert.equal(fs.statSync(h.path('readopt-old.json')).nlink, 2);
// Two complete real-filesystem stopped cycles need their own observation budget;
// production timeouts and all byte/inode/FD/CAS assertions remain unchanged.
}, 240000);
test('forged operation/context/lease capabilities cannot write', async t => {
  const h = await harness(t), before = h.f.snapshot(), writes = h.writes();
  for (const cap of [{}, Object.freeze({}), { mode: 'context', verified: true }]) {
    assert.throws(() => h.api.stoppedReadoptionOperation(cap), code('stopped_readoption_operation_brand'));
    assert.throws(() => h.load('tools/stopped-host-readoption-store').open(cap), code('stopped_readoption_operation_brand'));
    await assert.rejects(h.load('tools/stopped-host-readoption-transaction').execute('apply', cap, {}), code('stopped_readoption_operation_brand'));
  }
  assert.deepEqual(h.f.snapshot(), before); assert.equal(h.writes(), writes);
});
for (const drift of ['valid-bytes', 'byte-equal-inode']) test('H03/P2 inspect-to-apply old adoption ' + drift + ' is a zero-write refusal', async t => {
  const h = await harness(t, { hostAdoption: true }), seen = await h.inspect(); assert.equal(seen.phase, 'readopt-preflight');
  const handle = await h.api.verifyStoppedReadoptionEvidence({ ...h.options, expectedProofHash: seen.proofHash });
  assert.equal(h.api.stoppedReadoptionEvidenceFacts(handle).proofHash, seen.proofHash);
  if (drift === 'valid-bytes') { const data = JSON.parse(fs.readFileSync(h.adoptionPath)); data.rootObservationDigest = '9'.repeat(64); fs.writeFileSync(h.adoptionPath, JSON.stringify(data)); }
  else { const bytes = fs.readFileSync(h.adoptionPath); fs.renameSync(h.adoptionPath, path.join(h.f.base, 'pre-apply-old-inode')); fs.writeFileSync(h.adoptionPath, bytes); }
  const before = h.f.snapshot(), writes = h.writes();
  await assert.rejects(h.api.applyStoppedReadoption({ ...h.options, expectedProofHash: seen.proofHash, witness: h.witness }), code('readopt_proof_changed'));
  await assert.rejects(h.api.assertStoppedReadoptionEvidence(handle), code('stopped_readoption_evidence_changed'));
  assert.deepEqual(h.f.snapshot(), before); assert.equal(h.writes(), writes); assert.equal(fs.existsSync(h.path('readopt-intent.json')), false);
});
for (const variant of ['whitespace-50k', 'canonical-over-budget']) test('P2 replay ' + variant + ' refuses before any preparation or claim', async t => {
  const h = await harness(t, { hostAdoption: true });
  if (variant === 'whitespace-50k') fs.appendFileSync(h.adoptionPath, ' '.repeat(50 * 1024));
  else {
    const data = JSON.parse(h.oldAdoption), prefix = path.parse(h.adoptionPath).root; data.allowedProject = prefix;
    const target = 49153; data.allowedProject += 'x'.repeat(target - Buffer.byteLength(JSON.stringify(data))); const b = Buffer.from(JSON.stringify(data)); assert.equal(b.length, target); fs.writeFileSync(h.adoptionPath, b);
  }
  const before = h.f.snapshot(), writes = h.writes(); await assert.rejects(h.inspect(), code('readopt_encoded_bytes'));
  await assert.rejects(h.api.applyStoppedReadoption({ ...h.options, expectedProofHash: '0'.repeat(64), witness: h.witness }), code('readopt_encoded_bytes'));
  assert.deepEqual(h.f.snapshot(), before); assert.equal(h.writes(), writes); assert.equal(fs.existsSync(h.path('readopt-intent.json')), false);
});
test('P2 exact serialized old-byte budget remains replayable through claim and CAS', async t => {
  const h = await harness(t, { hostAdoption: true }), data = JSON.parse(h.oldAdoption), prefix = path.parse(h.adoptionPath).root; data.allowedProject = prefix;
  const target = 49152; data.allowedProject += 'x'.repeat(target - Buffer.byteLength(JSON.stringify(data))); const b = Buffer.from(JSON.stringify(data)); assert.equal(b.length, target); fs.writeFileSync(h.adoptionPath, b);
  const done = await apply(h); assert.equal(done.phase, 'readopt-completed-stopped'); assert.deepEqual(fs.readFileSync(h.path('readopt-old.json')), b); h.nextActor(); assert.equal((await h.inspect()).phase, done.phase);
});
for (const role of ['install', 'broker']) test('P2 foreign ' + role + ' gate during inert publication cannot become owned or publish a claim', async t => {
  const h = await harness(t, { hostAdoption: true }), seen = await h.inspect(), gate = role === 'install' ? path.join(h.f.root, 'install.lock') : h.f.path('broker/broker-owner.gate'), original = h.f.io.linkSync; let fired = false;
  const foreign = Buffer.from('explicit foreign ' + role + ' gate');
  h.f.io.linkSync = (a, b) => { const value = original(a, b); if (!fired && path.basename(b) === 'publication.json') { fired = true; fs.writeFileSync(gate, foreign); } return value; };
  try { await assert.rejects(h.api.applyStoppedReadoption({ ...h.options, expectedProofHash: seen.proofHash, witness: h.witness }), code('readopt_preclaim_gate_busy')); } finally { h.f.io.linkSync = original; }
  assert.equal(fired, true); assert.equal(fs.existsSync(h.path('readopt-intent.json')), false); assert.deepEqual(fs.readFileSync(gate), foreign); assert.deepEqual(fs.readFileSync(h.adoptionPath), h.oldAdoption);
});

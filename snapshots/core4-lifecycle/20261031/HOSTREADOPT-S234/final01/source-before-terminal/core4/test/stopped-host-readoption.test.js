'use strict';
const nodeTest = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const { canonical } = require('../protocol/json');
const { harness } = require('./fixtures/stopped-host-readoption');
const test = (name, fn) => nodeTest('stopped-host-readoption ' + name, { timeout: 20000 }, fn);
const code = value => error => error.code === value;
async function evidence(h) { const inspected = await h.inspect(); return h.api.verifyStoppedReadoptionEvidence({ ...h.options, expectedProofHash: inspected.proofHash }); }

test('disk baseline survives a new module generation without rehydrating a normal certificate', async t => {
  const h = await harness(t), before = h.f.snapshot(), writes = h.writes(), inspection = await h.inspect(), handle = await evidence(h), value = h.api.stoppedReadoptionEvidenceFacts(handle);
  assert.equal(inspection.phase, 'stopped-certified-baseline'); assert.equal(inspection.aeAuthority, false); assert.equal(inspection.runtimeStarted, false);
  assert.deepEqual(value.facts, h.certified); assert.equal(value.proofHash, inspection.proofHash);
  assert.deepEqual(await h.api.assertStoppedReadoptionEvidence(handle), value);
  value.facts.snapshot.origin.hash = '0'.repeat(64); assert.deepEqual(h.api.stoppedReadoptionEvidenceFacts(handle).facts, h.certified);
  assert.throws(() => h.certifier.assertStoppedCertificate(handle, h.options), code('stopped_certification_brand'));
  assert.throws(() => h.update.assertStoppedUpdatePermit(handle), code('stopped_update_permit_brand'));
  assert.throws(() => h.update.acquireStoppedReadoptionLease(handle), code('stopped_readoption_lease_brand'));
  assert.deepEqual(h.f.snapshot(), before); assert.equal(h.writes(), writes);
  h.nextActor();
  assert.throws(() => h.api.stoppedReadoptionEvidenceFacts(handle), code('stopped_readoption_evidence_brand'));
  const next = await evidence(h); assert.deepEqual(h.api.stoppedReadoptionEvidenceFacts(next).facts, h.certified);
});

test('copied capabilities and read-only evidence never issue certificate context or leases', async t => {
  const h = await harness(t), handle = await evidence(h), before = h.f.snapshot(), writes = h.writes();
  for (const forged of [{}, { ...handle }, JSON.parse(JSON.stringify(handle)), { verified: true, facts: h.certified }]) {
    assert.throws(() => h.api.stoppedReadoptionEvidenceFacts(forged), code('stopped_readoption_evidence_brand'));
    await assert.rejects(h.api.assertStoppedReadoptionEvidence(forged), code('stopped_readoption_evidence_brand'));
    assert.throws(() => h.certifier.readStoppedReadoptionCertificate(forged), code('stopped_readoption_evidence_brand'));
    assert.throws(() => h.update.acquireStoppedReadoptionLease(forged), code('stopped_readoption_lease_brand'));
  }
  await assert.rejects(h.api.verifyStoppedReadoptionEvidence({ ...h.options, expectedProofHash: '0'.repeat(64) }), code('stopped_readoption_proof_changed'));
  await assert.rejects(h.api.inspectStoppedReadoption({ ...h.options, owned: new Map() }), code('stopped_readoption_options'));
  assert.deepEqual(h.f.snapshot(), before); assert.equal(h.writes(), writes);
});

test('certificate pull capability is scoped to one awaited inspection and then revoked', async t => {
  const h = await harness(t), original = h.certifier.readStoppedReadoptionCertificate; let captured;
  h.certifier.readStoppedReadoptionCertificate = capability => { if (h.api.stoppedReadoptionCertificateRequest(capability).mode === 'baseline') captured = capability; return original(capability); };
  await h.inspect(); assert.ok(captured);
  assert.throws(() => h.api.stoppedReadoptionCertificateRequest(captured), code('stopped_readoption_evidence_brand'));
  assert.throws(() => h.certifier.readStoppedReadoptionCertificate(captured), code('stopped_readoption_evidence_brand'));
});

for (const drift of ['descriptor', 'origin', 'anchor', 'client', 'journal', 'ledger', 'stop-bytes', 'stop-inode', 'certificate-bytes', 'certificate-inode', 'phase', 'install-gate', 'broker-gate']) test('baseline refuses ' + drift + ' with zero writes', async t => {
  const h = await harness(t), handle = await evidence(h), originalProof = h.api.stoppedReadoptionEvidenceFacts(handle).proofHash;
  const files = { descriptor: h.f.descriptorPath, origin: path.join(h.f.root, 'origin.json'), anchor: h.f.path('origin.json'), client: path.join(h.f.root, 'core-client.json'), journal: h.f.path('receiver/completions.ndjson'), ledger: h.f.path('broker/ledger.ndjson'), 'stop-bytes': h.f.path('runtime-maintenance.json'), 'stop-inode': h.f.path('runtime-maintenance.json'), 'certificate-bytes': h.path('stopped-certificate.json'), 'certificate-inode': h.path('stopped-certificate.json'), phase: h.path('readopt-intent.json'), 'install-gate': path.join(h.f.root, 'install.lock'), 'broker-gate': h.f.path('broker/broker-owner.gate') };
  const file = files[drift];
  if (drift.endsWith('-inode')) { const bytes = fs.readFileSync(file); fs.renameSync(file, path.join(h.f.base, 'retained-' + drift)); fs.writeFileSync(file, bytes); }
  else fs.writeFileSync(file, 'foreign-' + drift);
  const before = h.f.snapshot(), writes = h.writes(); await assert.rejects(h.api.assertStoppedReadoptionEvidence(handle));
  if (drift.endsWith('-inode')) {
    // Before a canonical readoption claim there is no durable pin for these
    // self-inodes. Fresh inspection may observe a new baseline; the previously
    // reviewed proof/handle must never accept it as the original incarnation.
    const next = await h.inspect(); assert.notEqual(next.proofHash, originalProof);
    await assert.rejects(h.api.verifyStoppedReadoptionEvidence({ ...h.options, expectedProofHash: originalProof }), code('stopped_readoption_proof_changed'));
  } else await assert.rejects(h.inspect());
  assert.deepEqual(h.f.snapshot(), before); assert.equal(h.writes(), writes);
});

test('new baseline never permits unknown extension or generic certificate/update bypass', async t => {
  const h = await harness(t); fs.writeFileSync(h.path('readopt-intent.json'), canonical({ future: 'unsupported-slice2' }));
  const before = h.f.snapshot(), writes = h.writes();
  await assert.rejects(h.inspect());
  await assert.rejects(h.certifier.inspectStoppedCertification(h.options), code('stopped_certification_phase'));
  await assert.rejects(h.maintenance.inspectMaintenance(h.options), code('maintenance_phase'));
  assert.throws(() => h.certifier.readStoppedUpdateCertificate({}), code('stopped_update_prepared_brand'));
  assert.deepEqual(h.f.snapshot(), before); assert.equal(h.writes(), writes);
});

test('unavailable and live certifier remain fenced without writes', async t => {
  const h = await harness(t), before = h.f.snapshot(), writes = h.writes();
  h.unavailable(true); await assert.rejects(h.inspect(), code('owner_process_probe_unavailable')); h.unavailable(false);
  h.reviveCertifier(); await assert.rejects(h.inspect(), code('stopped_readoption_process_not_dead'));
  assert.deepEqual(h.f.snapshot(), before); assert.equal(h.writes(), writes);
});

for (const at of [1, 2, 3]) test('disk facts are checked immediately after process await ' + at, async t => {
  const h = await harness(t), writes = h.writes(); let calls = 0;
  h.onObserve(async () => { if (++calls !== at) return; const bytes = fs.readFileSync(h.path('stopped-certificate.json')); fs.renameSync(h.path('stopped-certificate.json'), path.join(h.f.base, 'retained-await')); fs.writeFileSync(h.path('stopped-certificate.json'), bytes); });
  await assert.rejects(h.inspect(), code('stopped_readoption_evidence_changed')); assert.equal(h.writes(), writes);
  assert.equal(calls, at);
});

function syntheticPermit(h, overrides = {}) {
  return { scope: { installRoot: h.f.root, stateDir: h.f.state, descriptorPath: h.f.descriptorPath }, nonce: crypto.randomUUID(), gates: ['install', 'broker'].map(role => Buffer.from('offline-readoption-' + role + '-' + crypto.randomUUID())), ...overrides };
}
test('isolated adapter plumbing acquires and releases only fixture-issued permits; production issuer remains closed', async t => {
  const h = await harness(t, { leasePlumbing: true }), permit = syntheticPermit(h), capability = h.issueSyntheticLease(permit), before = h.f.snapshot();
  for (const forged of [{}, { ...capability }]) assert.throws(() => h.update.acquireStoppedReadoptionLease(forged), code('fixture_lease_brand'));
  assert.throws(() => h.api.stoppedReadoptionLeasePermit(capability), code('stopped_readoption_lease_brand'));
  let adapterCapability; const consume = h.leases.acquireStoppedUpdateLease;
  h.leases.acquireStoppedUpdateLease = value => { adapterCapability = value; assert.equal(h.update.stoppedUpdateLeasePermit(value), permit); return consume(value); };
  const lease = h.update.acquireStoppedReadoptionLease(capability);
  assert.throws(() => h.update.stoppedUpdateLeasePermit(adapterCapability), code('stopped_update_lease_brand'));
  h.leases.assertInstallLease(lease, permit.scope, { full: true }); assert.equal(h.leases.maintenanceLeaseFacts(lease).length, 2);
  h.leases.releaseInstallLease(lease); assert.deepEqual(h.f.snapshot(), before);
});

test('isolated adapter recovery preserves exact gate bytes/inodes and release-only skips only proven missing gates', async t => {
  const h = await harness(t, { leasePlumbing: true }), original = syntheticPermit(h), lease = h.update.acquireStoppedReadoptionLease(h.issueSyntheticLease(original));
  const facts = h.leases.maintenanceLeaseFacts(lease); h.nextActor();
  const recovery = syntheticPermit(h, { gates: original.gates, recovery: true, facts });
  const recovered = h.update.acquireStoppedReadoptionLease(h.issueSyntheticLease(recovery)); assert.deepEqual(h.leases.maintenanceLeaseFacts(recovered), facts); h.nextActor();
  fs.unlinkSync(facts[1].file);
  const tail = syntheticPermit(h, { gates: original.gates, recovery: true, releaseOnly: true, facts });
  const released = h.update.acquireStoppedReadoptionLease(h.issueSyntheticLease(tail)); assert.equal(h.leases.maintenanceLeaseFacts(released).length, 1);
  h.leases.releaseInstallLease(released); assert.equal(fs.existsSync(facts[0].file), false); assert.equal(fs.existsSync(facts[1].file), false);
});

for (const drift of ['bytes', 'inode']) test('isolated adapter recovery refuses gate ' + drift + ' and revokes temporary capability on failure', async t => {
  const h = await harness(t, { leasePlumbing: true }), original = syntheticPermit(h), lease = h.update.acquireStoppedReadoptionLease(h.issueSyntheticLease(original)), facts = h.leases.maintenanceLeaseFacts(lease); h.nextActor();
  if (drift === 'bytes') fs.writeFileSync(facts[0].file, 'foreign'); else { fs.renameSync(facts[0].file, path.join(h.f.base, 'retained-gate')); fs.writeFileSync(facts[0].file, original.gates[0]); }
  const before = h.f.snapshot(), writes = h.writes(), consume = h.leases.acquireStoppedUpdateLease; let temporary;
  h.leases.acquireStoppedUpdateLease = value => { temporary = value; return consume(value); };
  assert.throws(() => h.update.acquireStoppedReadoptionLease(h.issueSyntheticLease(syntheticPermit(h, { gates: original.gates, recovery: true, facts }))), code('install_lease_changed'));
  assert.throws(() => h.update.stoppedUpdateLeasePermit(temporary), code('stopped_update_lease_brand')); assert.deepEqual(h.f.snapshot(), before); assert.equal(h.writes(), writes);
});

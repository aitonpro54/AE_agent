'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const inline = require('../runtime/stdio-entry'), spec = require('../runtime/composition-spec');
const { buildPackage, verifyPackage } = require('../tools/package-installable');
const { hash, canonical } = require('../protocol/json');
const { fixedFormat1Package } = require('./fixtures/fixed-format1-package');
const { fixturePackage, runtime, moduleId } = require('./fixtures/portable-text-runtime');
const { projectClientDescriptor, verifyClientDescriptor } = require('../runtime/client-entry');
const { bundleStandalone } = require('../tools/package-standalone-installer');
const { verifyStandalone } = require('../tools/standalone-installer');
const read = p => file => Buffer.from(p.files[file], 'base64');
function put(p, file, value) { const bytes = Buffer.from(typeof value === 'string' ? value : canonical(value)); p.files[file] = bytes.toString('base64'); p.release.hashes[file] = hash(bytes); p.packageHash = hash(p.release); }
function outcome(fn) { try { return { value: fn() }; } catch (e) { return { error: e.code || e.message }; } }
function parity(p) { const a = outcome(() => inline.deriveComposition(p.release, read(p))), b = outcome(() => spec.deriveComposition(p.release, read(p))); assert.deepEqual(b, a); return a; }
function legacy(version) {
  const p = buildPackage(undefined, 'readonly'); p.release.version = version;
  if (!spec.releaseFeatures(p.release).versionedComposition) {
    const policy = JSON.parse(read(p)('runtime/composition-policy.json')); delete policy.version; delete policy.capabilities; put(p, 'runtime/composition-policy.json', policy);
  }
  const selected = parity(p); assert.equal(selected.error, undefined);
  const identityRequired = spec.releaseFeatures(p.release).registryIdentity;
  put(p, 'cep/jsx/registry.jsx', spec.registrySource(selected.value.assets, read(p)('runtime/host/json-codec.jsx').toString(), identityRequired));
  if (identityRequired) {
    put(p, 'cep/CSXS/manifest.xml', read(p)('cep/CSXS/manifest.xml').toString().replaceAll('4.2.7', version));
    const panel = require('../integrations/cep/panel-identity');
    put(p, 'cep/js/panel.js', panel.stamp(read(p)('cep/js/panel.js').toString(), panel.identity(read(p))));
  }
  return p;
}
function writeTree(t, p) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'core4-version-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  for (const [file, bytes] of Object.entries(p.files)) { const target = path.join(directory, file); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, Buffer.from(bytes, 'base64')); }
  fs.writeFileSync(path.join(directory, 'release.json'), canonical(p.release)); return directory;
}
for (const version of ['4.0.0', '4.1.0', '4.1.1', '4.1.2', '4.2.1', '4.2.2', '4.2.3', '4.2.4', '4.2.5', '4.2.6', '4.2.7']) test('release policy exact supported format2: ' + version, t => {
  const current = ['4.2.6', '4.2.7'].includes(version), p = version === '4.2.7' ? buildPackage(undefined, 'readonly') : legacy(version);
  assert.deepEqual(spec.releaseFeatures(p.release), inline.releaseFeatures(p.release));
  const selected = parity(p); assert.equal(selected.error, undefined);
  assert.equal(Object.hasOwn(selected.value, 'registryVerification'), current);
  assert.equal(verifyPackage(p), p); inline.verifyRelease(writeTree(t, p), p.release);
  if (current) assert.equal(selected.value.registryVerification, true);
  else assert.equal(selected.value.registryVerification, undefined);
});
test('release policy legacy format1 is exact and future versions fail before reading composition', t => {
  const old = fixedFormat1Package(); assert.equal(verifyPackage(old), old); inline.verifyRelease(writeTree(t, old), old.release); assert.equal(parity(old).value.legacy, true);
  for (const version of ['4.2.8', '4.3.0', '5.0.0', '__proto__', '4.2.7-future']) for (const marker of [false, true]) {
    const p = buildPackage(undefined, 'readonly'); p.release.version = version;
    if (!marker) put(p, 'cep/jsx/registry.jsx', read(p)('cep/jsx/registry.jsx').toString().replace(/registryBuildId/g, 'removedBuildId'));
    p.packageHash = hash(p.release);
    for (const role of [inline, spec]) { let reads = 0; assert.throws(() => role.deriveComposition(p.release, () => { reads++; throw Error('must not read'); }), /unsupported_release/); assert.equal(reads, 0); }
    assert.throws(() => verifyPackage(p), /unsupported_release/);
    assert.throws(() => inline.verifyRelease('does-not-exist', p.release), /unsupported_release/);
  }
  for (const version of ['4.1.0', '4.2.2', '4.2.6', '4.2.7']) assert.throws(() => spec.releaseFeatures({ version, format: 1 }), /release_format/);
});
for (const version of ['4.2.6', '4.2.7']) test('release policy registry and panel markers remain mandatory: ' + version, t => {
  const p = version === '4.2.7' ? buildPackage(undefined, 'readonly') : legacy(version), noRegistry = structuredClone(p);
  put(noRegistry, 'cep/jsx/registry.jsx', read(p)('cep/jsx/registry.jsx').toString().replace(/registryBuildId/g, 'removedBuildId'));
  assert.throws(() => verifyPackage(noRegistry), /registry_identity_integrity/);
  assert.throws(() => inline.verifyRelease(writeTree(t, noRegistry), noRegistry.release), /composition_registry/);
  const noPanel = structuredClone(p); put(noPanel, 'cep/js/panel.js', read(p)('cep/js/panel.js').toString().replace('CORE4_LOADED_IDENTITY', 'REMOVED_PANEL'));
  assert.throws(() => verifyPackage(noPanel), /panel_identity/);
});
test('release policy panel manifest identity must match its release version', () => {
  for (const version of ['4.2.6', '4.2.7']) {
    const p = version === '4.2.7' ? buildPackage(undefined, 'readonly') : legacy(version);
    p.release.version = version === '4.2.7' ? '4.2.6' : '4.2.7'; p.packageHash = hash(p.release);
    assert.throws(() => verifyPackage(p), /panel_identity_version/);
  }
  const p = buildPackage(undefined, 'readonly'), panel = require('../integrations/cep/panel-identity');
  for (const version of ['4.2.8', '4.2.7-future']) {
    const bad = structuredClone(p); put(bad, 'cep/CSXS/manifest.xml', read(p)('cep/CSXS/manifest.xml').toString().replaceAll('4.2.7', version));
    assert.throws(() => panel.identity(read(bad)), /panel_identity_version/);
  }
});
test('release policy client and own-root owner retain their narrower exact whitelist', t => {
  const nodeHash = hash(fs.readFileSync(process.execPath));
  for (const version of ['4.0.0', '4.1.0', '4.1.1', '4.1.2', '4.2.1', '4.2.2', '4.2.3', '4.2.4', '4.2.5', '4.2.6', '4.2.7', '4.2.8', '5.0.0']) {
    const installRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'core4-role-version-')); t.after(() => fs.rmSync(installRoot, { recursive: true, force: true }));
    const files = Object.fromEntries(['runtime/owner-entry.js', 'runtime/client-entry.js', 'runtime/stdio-entry.js'].map(file => [file, fs.readFileSync(path.join(__dirname, '..', file))]));
    const release = { version, format: 2, hashes: Object.fromEntries(Object.entries(files).map(([file, bytes]) => [file, hash(bytes)])) }, packageHash = hash(release), releaseDir = path.join(installRoot, 'releases', packageHash);
    for (const [file, bytes] of Object.entries(files)) { const target = path.join(releaseDir, file); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, bytes); }
    fs.writeFileSync(path.join(releaseDir, 'release.json'), canonical(release));
    const d = { version: 2, installationId: 'fixture-role-version', machineId: 'fixture-host', installRoot, releaseDir, packageHash, nodePath: fs.realpathSync(process.execPath), nodeHash, controlToken: 'a'.repeat(64) };
    fs.writeFileSync(path.join(installRoot, 'origin.json'), canonical({ installationId: d.installationId, machineId: d.machineId }));
    const descriptor = path.join(installRoot, 'installation.json'), client = path.join(installRoot, 'core-client.json');
    fs.writeFileSync(descriptor, canonical(d)); fs.writeFileSync(client, canonical(projectClientDescriptor(d)));
    const owner = require(path.join(releaseDir, 'runtime/owner-entry.js'));
    if (['4.2.2', '4.2.3', '4.2.4', '4.2.5', '4.2.6', '4.2.7'].includes(version)) { assert.equal(owner.verifyOwnerInstallation(descriptor).packageHash, packageHash); assert.equal(verifyClientDescriptor(client).packageHash, packageHash); }
    else { assert.throws(() => owner.verifyOwnerInstallation(descriptor), /owner_release_schema/); assert.throws(() => verifyClientDescriptor(client), /client_release/); }
  }
});
test('release policy standalone outer data gate has exact product versions independent of manifest v3', t => {
  const base = bundleStandalone(buildPackage(undefined, 'readonly'));
  for (const version of ['4.0.0', '4.1.0', '4.1.1', '4.1.2', '4.2.1', '4.2.2', '4.2.3', '4.2.4', '4.2.5', '4.2.6', '4.2.7', '4.2.8', '5.0.0']) {
    // Only the outer data reader is under test. Official dry-run performs the
    // separate composition validation; B1 fixtures cover valid old rebundling.
    const bundle = structuredClone(base), candidate = JSON.parse(Buffer.from(bundle.files['candidate.json'], 'base64'));
    candidate.release.version = version; candidate.packageHash = hash(candidate.release); bundle.manifest.packageHash = candidate.packageHash;
    bundle.files['candidate.json'] = Buffer.from(canonical(candidate)).toString('base64'); bundle.manifest.hashes['candidate.json'] = hash(canonical(candidate));
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'core4-standalone-version-')); t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    for (const [file, bytes] of Object.entries(bundle.files)) { const target = path.join(directory, file); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, Buffer.from(bytes, 'base64')); }
    fs.writeFileSync(path.join(directory, 'standalone.json'), canonical(bundle.manifest));
    if (['4.2.8', '5.0.0'].includes(version)) assert.throws(() => verifyStandalone(directory, hash(bundle.manifest)), /standalone_candidate/);
    else assert.equal(verifyStandalone(directory, hash(bundle.manifest)).manifestVersion, 3);
  }
});

test('portable owned-text profile actual package has independent pins and retains fixed-profile refusals', t => {
  const { pkg } = fixturePackage(t); assert.equal(verifyPackage(pkg), pkg);
  const selected = parity(pkg); assert.equal(selected.error, undefined);
  assert.deepEqual(selected.value.assets.map(a => a.moduleId), ['project-inspection', moduleId]);
  assert.equal(selected.value.assets[1].resultProfile, 'owned-text-layer-v1');
  assert.equal(selected.value.assets[1].contract.moduleId, moduleId);
  assert.equal(selected.value.assets[1].admission.moduleId, moduleId);
  for (const mutate of [p => { p.profiles[moduleId].resultProfile = 'manual-text-v1'; }, p => { p.profiles[moduleId].operatorConfirmation = true; }, p => { p.profiles[moduleId].operatorConfirmation = 'registry-v1'; }]) {
    const rejected = structuredClone(pkg), policy = JSON.parse(read(pkg)('runtime/composition-policy.json')); mutate(policy); put(rejected, 'runtime/composition-policy.json', policy);
    assert.equal(parity(rejected).error, 'composition_not_admitted'); assert.throws(() => verifyPackage(rejected), /composition_not_admitted/);
  }
  assert.throws(() => fixturePackage(t, 'manual-text-v1'), /composition_not_admitted/);
  assert.throws(() => fixturePackage(t, 'owned-text-layer-v1', true), /composition_not_admitted/);
  assert.throws(() => fixturePackage(t, 'owned-text-layer-v1', 'registry-v1'), /composition_not_admitted/);
});
const desired = { slot: 'title-01', name: 'Титр 01', text: 'Title', leading: 72, justification: 'center', ranges: [{ start: 0, end: 5, font: 'Fixture-Regular', fontSize: 36, tracking: 0, fill: [1, 1, 1] }] };
function api(h) {
  const { contractId } = h.broker.getContract({ moduleId }), target = { projectId: h.state.projectId, compId: 7 };
  const inspect = () => h.broker.inspect({ moduleId, contractId, target });
  return { inspect, async propose(input) { const { evidenceRef } = await inspect(); const { buildId, taskId } = await h.broker.build({ oneStep: true, steps: [{ stepId: 'text', moduleId, contractId, evidenceRef, input: { ...target, ...input } }] }); const { proposalId } = h.broker.propose({ buildId }); const { dryrunRef } = await h.broker.dryrun({ proposalId }); return { taskId, proposalId, dryrunRef }; } };
}
test('portable owned-text profile actual runtime factory HTTP receipt and sibling readback', { timeout: 40000 }, async t => {
  const h = await runtime(t), a = api(h);
  assert.equal(h.runtime.status().product, 'AE Agent Core 4.2.7');
  assert.equal((await h.rpc('initialize')).result.serverInfo.version, '4.2.7');
  assert.deepEqual((await h.rpc('tools/list')).result.tools.map(tool => tool.name).sort(), Object.keys(require('../core/stdio').TOOL_METHODS).sort());
  const created = await h.broker.run(await a.propose(desired)); assert.equal(created.state, 'succeeded', JSON.stringify(created));
  const first = created.outputs.text.layers[0];
  assert.deepEqual((await a.inspect()).snapshot, created.outputs.text);
  const sibling = await h.broker.run(await a.propose({ ...desired, slot: 'title-02', name: 'Титр 02' })); assert.equal(sibling.state, 'succeeded', JSON.stringify(sibling));
  const edited = await h.broker.run(await a.propose({ ...desired, layerId: first.layerId, leading: 84 })); assert.equal(edited.state, 'succeeded', JSON.stringify(edited));
  assert.deepEqual(edited.outputs.text.layers[0], sibling.outputs.text.layers[0]);
  assert.equal(edited.outputs.text.layers[1].leading, 84); assert.deepEqual((await a.inspect()).snapshot, edited.outputs.text);
  assert.equal(h.proofCalls, 3, 'factory-selected real text proof validated all HTTP completions'); assert.equal(h.confirmations, 3);
  assert.deepEqual(h.broker.ledger.unresolved(), []);
});
test('portable owned-text profile native cancellation stays rejected with unchanged readback', { timeout: 30000 }, async t => {
  const h = await runtime(t, { confirm: () => false }), a = api(h), before = (await a.inspect()).snapshot;
  const result = await h.broker.run(await a.propose(desired)); assert.equal(result.message, 'local_cancelled'); assert.equal(result.state, 'stopped');
  assert.equal(h.proofCalls, 0); assert.equal(h.confirmations, 1); assert.deepEqual((await a.inspect()).snapshot, before); assert.deepEqual(h.broker.ledger.unresolved(), []);
});
test('portable owned-text profile invalid original receipt cannot succeed or replay', { timeout: 30000 }, async t => {
  const h = await runtime(t, { corruptReceipt: true }), a = api(h), proposal = await a.propose(desired);
  const result = await h.broker.run(proposal); assert.notEqual(result.state, 'succeeded'); assert.equal(h.corruptedReceipts, 1);
  assert.equal(h.proofCalls, 1); assert.equal(result.message, 'local_transaction_receipt_mismatch');
  await assert.rejects(h.broker.run(proposal)); assert.equal(h.confirmations, 1);
});

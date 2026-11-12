'use strict';
// Actual packaging and isolated TEMP mutations only; no install or runtime start.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { execFileSync } = require('node:child_process');
const { buildPackage, verifyPackage, selectedCatalogRevision } = require('../tools/package-installable');
const { hash, canonical } = require('../protocol/json');
const { workspace, SOURCE } = require('./helpers');
const read = (p, file) => JSON.parse(Buffer.from(p.files[file], 'base64'));
const revision = p => read(p, 'config/catalog.json').catalogRevision;
const build = (root, selector = 'manual-titles') => buildPackage(root, selector, { runtimeModel: 'owner' });
function fixture(t) {
  const f = workspace(); assert.notEqual(f.root, SOURCE);
  assert.ok(path.resolve(f.temp).startsWith(path.join(os.tmpdir(), 'ae-core4-')));
  t.after(() => { assert.ok(path.resolve(f.temp).startsWith(path.join(os.tmpdir(), 'ae-core4-'))); fs.rmSync(f.temp, { recursive: true, force: true }); }); return f;
}
function edit(root, file, change) { const target = path.join(root, file), value = JSON.parse(fs.readFileSync(target)); change(value); fs.writeFileSync(target, canonical(value)); }
function seal(root, args) {
  assert.ok(root.startsWith(path.join(os.tmpdir(), 'ae-core4-')));
  return execFileSync(process.execPath, [path.join(root, 'tools/seal.js'), ...args], { encoding: 'utf8', windowsHide: true });
}

for (const position of ['first', 'first-dynamic', 'last']) for (const kind of ['manifest', 'admission']) test('catalog-revision actual first/last selected ' + position + ' ' + kind, t => {
  const f = fixture(t), before = build(f.root), catalog = read(before, 'config/catalog.json');
  const sourceIds = JSON.parse(fs.readFileSync(path.join(f.root, 'config/catalog.json'))).modules.map(m => m.id);
  const dynamic = catalog.modules.filter(m => !sourceIds.includes(m.id)); assert.ok(dynamic.length >= 2);
  const entry = position === 'first' ? catalog.modules[0] : position === 'first-dynamic' ? dynamic[0] : catalog.modules.at(-1);
  const beforeArtifact = read(before, entry.path + '/artifact.json'), beforeAdmission = read(before, entry.admission);
  if (kind === 'manifest') {
    fs.appendFileSync(path.join(f.root, entry.path, 'implementation.js'), '\n// isolated selected revision fixture\n');
    const report = JSON.parse(seal(f.root, ['--module', entry.id, '--reviewed-source'])); assert.equal(report.admissionsWritten, true);
  } else edit(f.root, entry.admission, value => { value.trustApprovalId += '-fixture-next'; });
  const after = build(f.root); assert.notEqual(revision(after), revision(before)); assert.match(revision(after), /^selected-v1-[a-f0-9]{64}$/);
  assert.notEqual(hash(read(after, entry.admission)), hash(beforeAdmission));
  if (kind === 'manifest') assert.notEqual(hash(read(after, entry.path + '/artifact.json')), hash(beforeArtifact));
  else assert.deepEqual(read(after, entry.path + '/artifact.json'), beforeArtifact);
});

test('catalog-revision actual excluded module and source-wide revision changes do not affect the selected package', t => {
  const f = fixture(t), before = build(f.root);
  assert.equal(read(before, 'config/catalog.json').modules.some(m => m.id === 'layer-overlay'), false);
  fs.appendFileSync(path.join(f.root, 'modules/layer-overlay/implementation.js'), '\n// isolated excluded-module fixture\n');
  seal(f.root, ['--module', 'layer-overlay', '--reviewed-source']);
  edit(f.root, 'config/admissions/layer-overlay.json', value => { value.trustApprovalId += '-excluded'; });
  edit(f.root, 'config/catalog.json', value => { value.catalogRevision = 'unrelated-source-wide-revision'; });
  const after = build(f.root); assert.equal(revision(after), revision(before)); assert.equal(after.packageHash, before.packageHash);
});

test('catalog-revision actual engine changes affect identity and identical inputs repeat exactly', t => {
  const f = fixture(t), before = build(f.root); assert.deepEqual(build(f.root), before);
  fs.appendFileSync(path.join(f.root, 'plan-engine/index.js'), '\n// isolated engine revision fixture\n');
  seal(f.root, ['--component', 'engine']); const after = build(f.root);
  assert.notEqual(revision(after), revision(before)); assert.notDeepEqual(read(after, 'config/catalog.json').engine, read(before, 'config/catalog.json').engine);
  assert.deepEqual(build(f.root), after);
});

test('catalog-revision actual module and asset array order remains significant', t => {
  for (const field of ['modules', 'assets']) {
    const f = fixture(t), before = build(f.root, 'manual');
    edit(f.root, 'runtime/source-package.json', source => {
      const part = source.compositions.manual;
      if (field === 'modules') part.modules.reverse(); else part.assets = [part.assets[0], ...part.assets.slice(1).reverse()];
    });
    const after = build(f.root, 'manual'); assert.notEqual(revision(after), revision(before));
    const other = field === 'modules' ? 'assets' : 'modules';
    assert.deepEqual(read(after, 'runtime/composition.json')[other], read(before, 'runtime/composition.json')[other]);
  }
});

test('catalog-revision exact v1 preimage covers engine profile capability and registry flag without incidental identifiers', () => {
  const p = build(SOURCE), json = file => read(p, file), catalog = json('config/catalog.json'), composition = json('runtime/composition.json'), policy = json('runtime/composition-policy.json');
  const input = { catalog, composition, policy, registryVerification: true };
  const preimage = {
    kind: 'ae-core4-selected-catalog', version: 1,
    composition: { version: 2, id: composition.id, policyVersion: 2 },
    modules: catalog.modules.map(entry => ({ entry, artifactPin: hash(json(entry.path + '/artifact.json')), admissionPin: hash(json(entry.admission)) })),
    engine: catalog.engine,
    assets: composition.assets.map(declaration => ({ declaration, artifactPin: hash(json(declaration.path + '/artifact.json')), admissionPin: hash(json(declaration.admission)) })),
    profiles: policy.profiles, capabilities: policy.capabilities, registryVerification: true
  };
  const expected = 'selected-v1-' + hash(preimage); assert.equal(selectedCatalogRevision(input, json), expected); assert.equal(revision(p), expected);
  for (const change of [
    v => { v.catalog.engine = null; },
    v => { v.catalog.engine.artifactHash = 'a'.repeat(64); },
    v => { v.policy.profiles['text-layer'].operatorConfirmation = 'registry-v1'; },
    v => { v.policy.capabilities['render-jobs'] = 1; },
    v => { v.registryVerification = false; }
  ]) { const next = structuredClone(input); change(next); assert.notEqual(selectedCatalogRevision(next, json), expected); }
  const incidental = structuredClone(input); incidental.catalog.catalogRevision = 'source-only'; incidental.packageHash = 'b'.repeat(64); incidental.runtimeId = 'fixture'; incidental.machinePath = 'C:/fixture';
  assert.equal(selectedCatalogRevision(incidental, json), expected);
  const reordered = structuredClone(input); reordered.policy.profiles = Object.fromEntries(Object.entries(reordered.policy.profiles).reverse());
  assert.equal(selectedCatalogRevision(reordered, json), expected);
  const inspection = preimage.assets[0]; assert.equal(inspection.artifactPin, inspection.admissionPin);
});

test('catalog-revision existing duplicate cycle and undeclared extra-file refusals remain effective', t => {
  const duplicates = fixture(t); edit(duplicates.root, 'runtime/source-package.json', value => { value.compositions.manual.modules.push('titles'); });
  assert.throws(() => build(duplicates.root, 'manual'), /composition_assets|composition_catalog/);
  const cycle = fixture(t); edit(cycle.root, 'runtime/source-package.json', value => { value.compositions.manual.parent = 'manual'; });
  assert.throws(() => build(cycle.root, 'manual'), /composition_selector/);
  const p = structuredClone(build(SOURCE)), file = 'runtime/unselected-extra.json'; p.files[file] = Buffer.from('{}').toString('base64'); p.release.hashes[file] = hash('{}'); p.packageHash = hash(p.release);
  assert.throws(() => verifyPackage(p), /composition_optional_closure/);
});

test('catalog-revision readers preserve opaque historical revisions without requiring the new generator', () => {
  const p = structuredClone(build(SOURCE)); const catalog = read(p, 'config/catalog.json'); catalog.catalogRevision = 'opaque-issued-revision';
  const bytes = canonical(catalog); p.files['config/catalog.json'] = Buffer.from(bytes).toString('base64'); p.release.hashes['config/catalog.json'] = hash(bytes); p.packageHash = hash(p.release);
  assert.equal(verifyPackage(p), p);
});

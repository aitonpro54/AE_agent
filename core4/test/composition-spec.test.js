'use strict';
// Pure/TEMP-only proof. No installed config, owner process, native AE or listener.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { spawnSync } = require('node:child_process');
const inline = require('../runtime/stdio-entry'), spec = require('../runtime/composition-spec');
const { canonical, hash } = require('../protocol/json');
const { buildPackage, verifyPackage } = require('../tools/package-installable');
const { planInstall, applyInstall } = require('../tools/install-core4');
const { buildStandalone, bundleStandalone, writeStandalone } = require('../tools/package-standalone-installer');
const { HELPERS, LEGACY_HELPERS, verifyStandalone, verifyManifest } = require('../tools/standalone-installer');
const { selectChecks } = require('../tools/validate-diff');
const { checkEntrySource, checkClientEntrySource, checkCompositionSpecSource } = require('../tools/check-boundaries');
const { fixedFormat1Package } = require('./fixtures/fixed-format1-package');
const SOURCE = path.resolve(__dirname, '..'), SPEC = 'runtime/composition-spec.js';
const selectors = ['readonly', 'manual', 'manual-titles-variants', 'operator-render-jobs'];
const packages = new Map();
function pkg(id = 'readonly') { if (!packages.has(id)) packages.set(id, buildPackage(undefined, id, { runtimeModel: 'owner' })); return packages.get(id); }
const read = p => file => Buffer.from(p.files[file], 'base64');
function put(p, file, value) { const bytes = Buffer.from(typeof value === 'string' ? value : canonical(value)); p.files[file] = bytes.toString('base64'); p.release.hashes[file] = hash(bytes); p.packageHash = hash(p.release); }
function drop(p, file) { delete p.files[file]; delete p.release.hashes[file]; p.packageHash = hash(p.release); }
function outcome(fn) { try { return { value: fn() }; } catch (e) { return { error: e.code || e.name }; } }
function parity(p, error) {
  const a = outcome(() => inline.deriveComposition(p.release, read(p))), b = outcome(() => spec.deriveComposition(p.release, read(p)));
  assert.deepEqual(b, a); if (error) assert.equal(a.error, error); else assert.equal(a.error, undefined);
  return a.value;
}
function temp(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'core4-composition-spec-'));
  t.after(() => { assert.ok(path.resolve(root).startsWith(path.join(os.tmpdir(), 'core4-composition-spec-'))); fs.rmSync(root, { recursive: true, force: true }); });
  return root;
}
function installation(t, packageData = buildPackage(undefined, 'readonly')) {
  const directory = temp(t), installRoot = path.join(directory, 'AEAgentCore4'), extensionsDir = path.join(directory, 'extensions'), configPath = path.join(directory, 'project/config.toml');
  fs.mkdirSync(path.dirname(configPath)); fs.writeFileSync(configPath, '# isolated fixture\n');
  const plan = planInstall({ pkg: packageData, nodePath: fs.realpathSync(process.execPath), installRoot, extensionsDir, configPath, machineId: os.hostname() });
  for (const file of [plan.descriptor.installRoot, plan.descriptor.stateDir, plan.descriptor.releaseDir, plan.descriptor.cepDir, plan.configPath, plan.descriptorPath]) assert.ok(path.resolve(file).startsWith(directory + path.sep), file);
  const applied = applyInstall(plan); return { directory, plan, descriptor: applied.descriptorPath, releaseDir: plan.descriptor.releaseDir };
}
function tree(directory) {
  const result = {};
  function visit(dir, prefix = '') { for (const name of fs.readdirSync(dir)) { const file = path.join(dir, name), relative = prefix + name; if (fs.statSync(file).isDirectory()) visit(file, relative + '/'); else result[relative] = hash(fs.readFileSync(file)); } }
  visit(directory); return result;
}

for (const id of selectors) test('composition-spec selected parity and registry/config bytes: ' + id, () => {
  const p = pkg(id), selected = parity(p);
  const codec = read(p)('runtime/host/json-codec.jsx').toString('utf8');
  assert.equal(spec.registrySource(selected.assets, codec, true), inline.registrySource(selected.assets, codec, true));
  assert.equal(spec.registrySource(selected.assets, codec, true), read(p)('cep/jsx/registry.jsx').toString('utf8'));
  const d = { installationId: 'synthetic-fixture', packageHash: p.packageHash, panelToken: 'a'.repeat(64) };
  assert.deepEqual(spec.installationConfig(d, selected), inline.installationConfig(d, selected));
  assert.deepEqual(spec.installationMarker(d, selected), inline.installationMarker(d, selected));
  assert.equal(Object.keys(p.files).filter(file => file === SPEC).length, 1);
});

test('composition-spec legacy format1 and composition-v1 remain readable without the new helper', () => {
  const old = structuredClone(fixedFormat1Package()); drop(old, SPEC);
  assert.equal(parity(old).legacy, true); assert.equal(verifyPackage(old), old);
  const v1 = structuredClone(pkg()); v1.release.version = '4.2.2';
  const composition = JSON.parse(read(v1)('runtime/composition.json')); composition.version = 1;
  put(v1, 'runtime/composition.json', composition); drop(v1, 'runtime/composition-policy.json'); drop(v1, SPEC);
  const selected = parity(v1); assert.equal(selected.composition.version, 1); assert.equal(Object.hasOwn(selected, 'registryVerification'), false);
  put(v1, 'cep/jsx/registry.jsx', spec.registrySource(selected.assets, read(v1)('runtime/host/json-codec.jsx').toString(), false));
  assert.equal(verifyPackage(v1), v1);
});

test('composition-spec current and legacy negative cases retain inline errors', () => {
  const cases = [
    p => { p.release.format = 9; },
    p => { p.release.hashes['runtime/composition.json'] = '0'.repeat(64); },
    p => { const v = JSON.parse(read(p)('runtime/composition-policy.json')); v.capabilities = { unreviewed: 1 }; put(p, 'runtime/composition-policy.json', v); },
    p => { const v = JSON.parse(read(p)('runtime/composition-policy.json')); v.files.push('tools/unsafe.js'); put(p, 'runtime/composition-policy.json', v); },
    p => { const v = JSON.parse(read(p)('runtime/composition.json')); v.assets.push(v.assets[0]); put(p, 'runtime/composition.json', v); },
    p => { const v = JSON.parse(read(p)('config/catalog.json')); v.engine = { path: 'other' }; put(p, 'config/catalog.json', v); }
  ];
  for (const mutate of cases) { const p = structuredClone(pkg()); mutate(p); const a = outcome(() => inline.deriveComposition(p.release, read(p))); assert.ok(a.error); parity(p, a.error); }
  const old = structuredClone(fixedFormat1Package()); put(old, 'runtime/composition.json', {}); parity(old, 'composition_downgrade');
  const v1 = structuredClone(pkg()), composition = JSON.parse(read(v1)('runtime/composition.json')); v1.release.version = '4.2.2';
  composition.version = 1; composition.assets[0].assetKey = 'foreign-inspection'; put(v1, 'runtime/composition.json', composition); drop(v1, 'runtime/composition-policy.json'); drop(v1, SPEC);
  parity(v1, 'composition_assets');
  for (const v of [{}, { 'render-jobs': 1 }, { 'render-jobs': 2 }, { unreviewed: 1 }]) assert.deepEqual(outcome(() => spec.builtinCapabilityFiles(v)), outcome(() => inline.builtinCapabilityFiles(v)));
  for (const v of [{ directory: 'movie', format: 'H.264' }, { directory: 'con', format: 'H.264' }, { directory: '../movie', format: 'H.264' }, { directory: 'movie', format: 'H.264', extra: true }]) assert.deepEqual(outcome(() => spec.validateCompRenderCompletion(v)), outcome(() => inline.validateCompRenderCompletion(v)));
  assert.deepEqual([...spec.compositionPaths(['safe.js'], [], () => assert.fail())], [...inline.compositionPaths(['safe.js'], [], () => assert.fail())]);
  assert.deepEqual(outcome(() => spec.compositionPaths(['tools/unsafe.js'], [], () => assert.fail())), outcome(() => inline.compositionPaths(['tools/unsafe.js'], [], () => assert.fail())));
});

test('composition-spec trusted readers treat a candidate helper as data without executing it', t => {
  const p = structuredClone(buildPackage(undefined, 'readonly')), marker = path.join(temp(t), 'candidate-must-not-run');
  put(p, SPEC, 'require("node:fs").writeFileSync(' + JSON.stringify(marker) + ',"bad");');
  assert.equal(verifyPackage(p), p);
  const f = installation(t, p); inline.verifyRelease(f.releaseDir, p.release); inline.verifyInstallation(f.descriptor);
  assert.equal(fs.existsSync(marker), false);
  const readerRoot = temp(t), runtime = path.join(readerRoot, 'runtime'), readerMarker = path.join(readerRoot, 'adjacent-must-not-run'); fs.mkdirSync(runtime);
  fs.copyFileSync(path.join(SOURCE, 'runtime/stdio-entry.js'), path.join(runtime, 'stdio-entry.js'));
  fs.writeFileSync(path.join(runtime, 'composition-spec.js'), 'require("node:fs").writeFileSync(' + JSON.stringify(readerMarker) + ',"bad");');
  const foreignReader = require(path.join(runtime, 'stdio-entry.js')); foreignReader.verifyInstallation(f.descriptor);
  assert.equal(fs.existsSync(readerMarker), false, 'foreign target verification does not trust an adjacent source helper');
  const before = tree(f.directory);
  return assert.rejects(foreignReader.start({ descriptor: f.descriptor, port: 0 }), /installation_entry_root_mismatch/).then(() => { assert.equal(fs.existsSync(marker), false); assert.equal(fs.existsSync(readerMarker), false); assert.deepEqual(tree(f.directory), before); });
});

test('composition-spec installed entry rejects missing or corrupt pinned helper before execution or state', async t => {
  for (const mode of ['missing', 'corrupt']) {
    const f = installation(t), helper = path.join(f.releaseDir, SPEC), marker = path.join(f.directory, 'must-not-run');
    if (mode === 'missing') fs.unlinkSync(helper); else fs.writeFileSync(helper, 'require("node:fs").writeFileSync(' + JSON.stringify(marker) + ',"bad");');
    const before = tree(f.directory), entry = require(path.join(f.releaseDir, 'runtime/stdio-entry.js'));
    await assert.rejects(entry.start({ descriptor: f.descriptor, port: 0 }), /release_tree_mismatch|installed_release_bytes/);
    assert.equal(fs.existsSync(marker), false); assert.deepEqual(tree(f.directory), before); assert.equal(fs.existsSync(path.join(f.plan.descriptor.installRoot, 'install.lock')), false);
  }
});

test('composition-spec exact bootstrap source guards reject premature, duplicate or dynamic helper imports', () => {
  const source = fs.readFileSync(path.join(SOURCE, 'runtime/stdio-entry.js'), 'utf8'), client = fs.readFileSync(path.join(SOURCE, 'runtime/client-entry.js'), 'utf8');
  assert.equal(checkEntrySource(source), true); assert.equal(checkClientEntrySource(client), true);
  const marker = "  const compositionSpec = require('./composition-spec.js');\n";
  assert.throws(() => checkEntrySource(marker + source.replace(marker, '')), /entry_verification_layout/);
  assert.throws(() => checkEntrySource(source + marker), /entry_verification_layout/);
  assert.throws(() => checkEntrySource(source.replace("require('./composition-spec.js')", "require('./' + 'composition-spec.js')")), /entry_verification_layout|unverified_entry_import/);
  const clientMarker = "  const { deriveComposition } = require('./composition-spec.js');\n";
  assert.throws(() => checkClientEntrySource(clientMarker + client.replace(clientMarker, '')), /client_entry_verification_layout/);
  const pure = fs.readFileSync(path.join(SOURCE, SPEC), 'utf8'); assert.equal(checkCompositionSpecSource(pure), true);
  for (const unsafe of ["require('node:fs');", "require('./other');", 'process.env.SECRET;', 'fetch("url");']) assert.throws(() => checkCompositionSpecSource(pure + unsafe), /composition_spec_impure/);
  assert.doesNotMatch(fs.readFileSync(path.join(SOURCE, 'tools/package-installable.js'), 'utf8'), /require\(['"]\.\.\/runtime\/stdio-entry/);
  assert.doesNotMatch(fs.readFileSync(path.join(SOURCE, 'tools/install-core4.js'), 'utf8'), /require\(['"]\.\.\/runtime\/stdio-entry/);
  assert.doesNotMatch(client, /require\(['"]\.\/stdio-entry/);
});

test('composition-spec standalone closure includes one candidate helper without a duplicate HELPERS entry', () => {
  const distribution = buildStandalone(undefined, 'readonly', { runtimeModel: 'owner' });
  assert.equal(HELPERS.includes(SPEC), false);
  assert.equal(Object.keys(distribution.files).filter(file => file === SPEC).length, 1);
  assert.equal(distribution.manifest.version, 3); assert.equal(distribution.manifest.capabilityBaseHash, null);
  assert.equal(distribution.files['tools/composition-spec.js'], fs.readFileSync(path.join(SOURCE, SPEC)).toString('base64'));
  assert.notEqual(distribution.files['tools/composition-spec.js'], fs.readFileSync(path.join(SOURCE, 'tools/composition-spec.js')).toString('base64'));
  assert.equal(require('../tools/composition-spec').deriveComposition, spec.deriveComposition);
});

function oldFormat2() {
  const p = structuredClone(buildPackage(undefined, 'readonly')); p.release.version = '4.2.2';
  const composition = JSON.parse(read(p)('runtime/composition.json')); composition.version = 1;
  put(p, 'runtime/composition.json', composition); drop(p, 'runtime/composition-policy.json'); drop(p, SPEC);
  const selected = parity(p); put(p, 'cep/jsx/registry.jsx', spec.registrySource(selected.assets, read(p)('runtime/host/json-codec.jsx').toString(), false));
  return verifyPackage(p);
}
function distribution(t, p, options) {
  const directory = temp(t), bundle = bundleStandalone(p, options), root = path.join(directory, 'distribution');
  writeStandalone(root, bundle); return { directory, root, bundle };
}
function dryrun(f, expectedHash = f.bundle.distributionHash) {
  const installRoot = path.join(f.directory, 'AEAgentCore4');
  const args = [path.join(f.root, 'tools/standalone-installer.js'), 'dry-run', '--expected-distribution-hash', expectedHash,
    '--install-root', installRoot, '--extensions-dir', path.join(f.directory, 'extensions'), '--config', path.join(f.directory, 'config.toml')];
  const result = spawnSync(process.execPath, args, { encoding: 'utf8', windowsHide: true, timeout: 15000 });
  assert.equal(result.error, undefined); assert.equal(fs.existsSync(installRoot), false); return result;
}
function writeRaw(root, bundle) {
  fs.mkdirSync(root);
  for (const [file, encoded] of Object.entries(bundle.files)) { const target = path.join(root, file); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, Buffer.from(encoded, 'base64')); }
  fs.writeFileSync(path.join(root, 'standalone.json'), canonical(bundle.manifest));
}
function reseal(bundle) { bundle.distributionHash = hash(canonical(bundle.manifest)); }

test('composition-spec v3 official dry-run never executes a matching-hash poisoned candidate helper', t => {
  const p = structuredClone(buildPackage(undefined, 'readonly')), marker = path.join(temp(t), 'candidate-must-not-run');
  put(p, SPEC, 'require("node:fs").writeFileSync(' + JSON.stringify(marker) + ',"bad");\n' + read(p)(SPEC).toString());
  const f = distribution(t, p), before = tree(f.root), result = dryrun(f);
  assert.equal(result.status, 0, result.stderr); assert.equal(JSON.parse(result.stdout).dryRun, true);
  assert.equal(fs.existsSync(marker), false); assert.deepEqual(tree(f.root), before);
  assert.equal(f.bundle.files[SPEC], p.files[SPEC]); assert.notEqual(f.bundle.files[SPEC], f.bundle.files['tools/composition-spec.js']);
});

test('composition-spec v3 rebundles supported old data without helper and preserves capability base gates', t => {
  const p = oldFormat2(), packageHash = p.packageHash, f = distribution(t, p), result = dryrun(f);
  assert.equal(result.status, 0, result.stderr); assert.equal(JSON.parse(result.stdout).packageHash, packageHash);
  const checked = verifyStandalone(f.root, f.bundle.distributionHash); assert.equal(Object.hasOwn(checked, 'capabilityBaseHash'), false);
  assert.equal(Object.hasOwn(checked.pkg.files, SPEC), false); assert.equal(checked.packageHash, packageHash);
  const base = 'b'.repeat(64), capability = distribution(t, p, { capabilityBaseHash: base });
  assert.equal(verifyStandalone(capability.root, capability.bundle.distributionHash).capabilityBaseHash, base);
  assert.equal(capability.bundle.packageHash, packageHash); const denied = dryrun(capability);
  assert.equal(denied.status, 1); assert.equal(JSON.parse(denied.stderr).error, 'capability_stopped_update_required');
});

test('composition-spec v3 rejects corrupt or missing trusted tooling before its code or destination writes', t => {
  for (const mode of ['corrupt', 'missing']) {
    const f = distribution(t, buildPackage(undefined, 'readonly')), helper = path.join(f.root, 'tools/composition-spec.js'), marker = path.join(f.directory, 'tool-must-not-run');
    if (mode === 'missing') fs.unlinkSync(helper); else fs.writeFileSync(helper, 'require("node:fs").writeFileSync(' + JSON.stringify(marker) + ',"bad");');
    const result = dryrun(f); assert.equal(result.status, 1); assert.match(JSON.parse(result.stderr).error, /standalone_closure_bytes|standalone_closure_tree/);
    assert.equal(fs.existsSync(marker), false);
  }
});

test('composition-spec standalone reserved tools namespace rejects Windows case and directory aliases before merge', t => {
  for (const file of ['tools/composition-spec.js', 'Tools/poison.js', 'TOOLS/composition-spec.js', 'tOoLs./poison.js']) {
    const p = structuredClone(pkg()); put(p, file, 'throw Error("must not execute");');
    assert.throws(() => bundleStandalone(p), /standalone_candidate_namespace/);
  }
  const base = buildStandalone(undefined, 'readonly'), invalid = structuredClone(base), file = 'Tools/poison.js', p = JSON.parse(Buffer.from(invalid.files['candidate.json'], 'base64'));
  put(p, file, 'throw Error("must not execute");');
  const policy = JSON.parse(read(p)('runtime/composition-policy.json')); policy.files.push(file); put(p, 'runtime/composition-policy.json', policy);
  invalid.packageHash = p.packageHash; invalid.manifest.packageHash = p.packageHash;
  invalid.files = { ...invalid.files, ...p.files, 'candidate.json': Buffer.from(canonical(p)).toString('base64') };
  invalid.manifest.hashes = Object.fromEntries(Object.entries(invalid.files).map(([path, data]) => [path, hash(Buffer.from(data, 'base64'))])); reseal(invalid);
  const output = path.join(temp(t), 'must-not-create'); assert.throws(() => writeStandalone(output, invalid), /standalone_candidate_namespace/); assert.equal(fs.existsSync(output), false);
});

test('composition-spec legacy v1 v2 distributions remain data-readable but current executable refuses tooling', t => {
  for (const version of [1, 2]) {
    const directory = temp(t), root = path.join(directory, 'legacy'), bundle = structuredClone(buildStandalone(undefined, 'readonly'));
    bundle.manifest.version = version; if (version === 1) delete bundle.manifest.capabilityBaseHash; else bundle.manifest.capabilityBaseHash = 'b'.repeat(64);
    delete bundle.files['tools/composition-spec.js']; delete bundle.manifest.hashes['tools/composition-spec.js']; reseal(bundle); writeRaw(root, bundle);
    const checked = verifyStandalone(root, bundle.distributionHash); assert.equal(checked.manifestVersion, version);
    assert.equal(checked.capabilityBaseHash, version === 2 ? 'b'.repeat(64) : undefined);
    const result = dryrun({ directory, root, bundle }); assert.equal(result.status, 1); assert.equal(JSON.parse(result.stderr).error, 'standalone_tooling_upgrade_required');
    assert.equal(Object.keys(bundle.files).filter(file => LEGACY_HELPERS.includes(file)).length, LEGACY_HELPERS.length);
    bundle.files['tools/composition-spec.js'] = fs.readFileSync(path.join(SOURCE, SPEC)).toString('base64'); bundle.manifest.hashes['tools/composition-spec.js'] = hash(Buffer.from(bundle.files['tools/composition-spec.js'], 'base64')); reseal(bundle);
    const extra = path.join(directory, 'legacy-extra'); writeRaw(extra, bundle); assert.throws(() => verifyStandalone(extra, bundle.distributionHash), /standalone_helper_closure/);
  }
  const bundle = structuredClone(buildStandalone(undefined, 'readonly')); delete bundle.files['tools/composition-spec.js']; delete bundle.manifest.hashes['tools/composition-spec.js']; reseal(bundle);
  const output = path.join(temp(t), 'missing-v3-slot'); writeRaw(output, bundle); assert.throws(() => verifyStandalone(output, bundle.distributionHash), /standalone_helper_closure/);
  for (const value of [undefined, '', 'invalid', bundle.packageHash]) assert.throws(() => verifyManifest({ ...bundle.manifest, capabilityBaseHash: value }), /standalone_schema|capability_update_base/);
});

test('composition-spec declared consumers track the actual helper dependency without narrowing integration keys', () => {
  const result = selectChecks(['core4/runtime/composition-spec.js']);
  for (const id of ['composition-spec', 'client-entry', 'installable-runtime', 'standalone-installer', 'owner-runtime', 'panel-lifecycle']) assert.ok(result.checks.some(c => c.check === id), id);
  for (const check of result.checks) assert.ok(check.dependencies.includes(SPEC), check.check);
});

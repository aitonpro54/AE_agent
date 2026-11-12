'use strict';
// Offline build check: never imports an installer or starts a runtime.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { execFileSync, spawnSync } = require('node:child_process');

const VARIANTS = ['readonly', 'manual', 'manual-titles-variants', 'manual-project-assembly', 'manual-project-save', 'manual-project-lifecycle']
  .flatMap(composition => ['stdio', 'owner'].map(runtimeModel => ({ composition, runtimeModel })))
  .concat(['operator-titles-pilot', 'operator-titles-photo-pilot', 'manual-media-layers', 'operator-workflows', 'operator-frame-export',
    'operator-photo-montage'].map(composition => ({ composition, runtimeModel: 'owner' })));
const LOCATIONS = ['plain', 'with spaces', 'Юникод 日本語'];
const SOURCE_DIRS = new Set(['cep', 'config', 'core', 'integrations', 'modules', 'plan-engine', 'protocol', 'runtime']);
const LOCAL_FILES = [
  '.codex/config.toml', '.codex/auth.json', '.env', 'credentials/panel-token',
  'installation.json', 'core-client.json', '.core4-client-binding.json', 'origin.json',
  'cep/js/config.js', 'runtime/installation.json', 'runtime/core-client.json',
  'state/production/origin.json', 'state/production/runtime-owner.json',
  'state/production/host-adoption.json', 'state/production/broker/ledger.ndjson',
  'state/production/receiver/completions.ndjson', 'logs/runtime.log'
];
function digest(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }
function localPath(file) {
  return file.split('/').some(part => /^(?:\.git|node_modules|\.codex(?:-runtime|-autonomy)?|credentials|descriptors|state|logs|backups|snapshots)$/.test(part)) ||
    /(?:^|\/)(?:\.env(?:\..*)?|installation\.json|core-client\.json|\.core4-client-binding\.json|origin\.json|host-adoption\.json|runtime-owner\.json)$/.test(file) || file === 'cep/js/config.js';
}
function sourcePath(file) {
  return !localPath(file) && (SOURCE_DIRS.has(file.split('/')[0]) || ['worker.js', 'package.json', 'tools/package-installable.js', 'tools/composition-spec.js'].includes(file));
}
function git(root, args) {
  return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', windowsHide: true, maxBuffer: 8 * 1024 * 1024 });
}
function writeJson(file, value) { fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n', { flag: 'wx' }); }
function snapshot(root) {
  const files = git(root, ['ls-files', '--cached', '-z', '--', '.']).split('\0').filter(Boolean).filter(sourcePath).sort();
  assert.ok(['tools/package-installable.js', 'tools/composition-spec.js', 'runtime/source-package.json'].every(file => files.includes(file)), 'tracked Core source and fixed tooling shim required');
  const bytes = new Map(), hashes = {};
  for (const file of files) {
    assert.ok(!path.isAbsolute(file) && !file.split('/').includes('..') && !file.includes('\\'), 'unsafe source path');
    const full = path.join(root, file);
    assert.equal(fs.realpathSync(full), full, 'source symlink: ' + file);
    assert.ok(fs.lstatSync(full).isFile(), 'source must be a regular file: ' + file);
    bytes.set(file, fs.readFileSync(full)); hashes[file] = digest(bytes.get(file));
  }
  const changed = git(root, ['diff', '--relative', '--name-only', '-z', 'HEAD', '--', '.']).split('\0').filter(file => bytes.has(file)).sort();
  return { bytes, provenance: { commit: git(root, ['rev-parse', 'HEAD']).trim(), branch: git(root, ['branch', '--show-current']).trim(),
    changedSourceFiles: changed, files: hashes, sourceHash: digest(JSON.stringify(hashes)), policy: 'tracked source directories plus fixed tools/package-installable.js and tools/composition-spec.js; local data, tests and other tools excluded' } };
}
function copySnapshot(bytes, root) {
  for (const [file, data] of bytes) {
    const target = path.join(root, file); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, data, { flag: 'wx' });
    assert.ok(fs.readFileSync(target).equals(data), 'source copy bytes: ' + file);
  }
}
function comparePackages(expected, actual) {
  const names = Object.keys(expected.files).sort();
  assert.deepEqual(Object.keys(actual.files).sort(), names, 'package file set differs');
  for (const file of names) assert.ok(Buffer.from(expected.files[file], 'base64').equals(Buffer.from(actual.files[file], 'base64')), 'package bytes differ: ' + file);
  assert.equal(actual.packageHash, expected.packageHash, 'packageHash differs');
  assert.deepEqual(actual.release, expected.release, 'release differs');
}
function checkLocalExclusion(pkg, markers) {
  for (const [file, encoded] of Object.entries(pkg.files)) {
    assert.ok(!localPath(file), 'local path in package: ' + file);
    const bytes = Buffer.from(encoded, 'base64');
    for (const marker of markers) assert.ok(!bytes.includes(Buffer.from(marker)), 'synthetic local data in package: ' + file);
  }
}
function build(root, cwd, output, variant, verifyPackage) {
  // Do not inherit NODE_OPTIONS/NODE_PATH or credentials into the builder.
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => /^(?:SystemRoot|WINDIR|TEMP|TMP|LANG|LC_ALL)$/i.test(key)));
  const args = [path.join(root, 'tools/package-installable.js'), '--output', output, '--composition', variant.composition, '--runtime', variant.runtimeModel];
  const result = spawnSync(process.execPath, args, { cwd, env, encoding: 'utf8', windowsHide: true, timeout: 30000, maxBuffer: 1024 * 1024 });
  assert.ifError(result.error);
  assert.equal(result.status, 0, 'builder failed: ' + (result.stderr || result.signal || result.status));
  const pkg = JSON.parse(fs.readFileSync(output, 'utf8'));
  verifyPackage(pkg); // Explicit verification in addition to the builder's verification.
  return pkg;
}
function runCheck({ sourceRoot = path.resolve(__dirname, '..'), outputDir } = {}) {
  sourceRoot = fs.realpathSync(path.resolve(sourceRoot));
  const retain = outputDir !== undefined;
  const directory = retain ? path.resolve(outputDir) : fs.mkdtempSync(path.join(os.tmpdir(), 'core4-package-location-'));
  assert.ok(directory !== sourceRoot && !directory.startsWith(sourceRoot + path.sep), 'output must be outside Core source');
  if (retain) fs.mkdirSync(directory); // Refuse reuse or overwrite of existing evidence.
  const report = { version: 1, ok: false, scope: 'offline package location independence; no installation or live portability proof',
    environment: { platform: process.platform, arch: process.arch, os: os.type(), release: os.release(), node: process.version, nodeExecutable: process.execPath },
    sourceRoot, evidenceDirectory: directory, variants: [], cases: [], findings: [] };
  let phase = 'source snapshot';
  try {
    const source = snapshot(sourceRoot); report.source = source.provenance;
    writeJson(path.join(directory, 'source.json'), report.source);
    const roots = LOCATIONS.map(name => path.join(directory, 'sources', name));
    for (const root of roots) copySnapshot(source.bytes, root);
    const foreign = path.join(directory, 'unrelated cwd'); fs.mkdirSync(foreign);
    // Decoys would break a builder accidentally reading relative to cwd.
    fs.mkdirSync(path.join(foreign, 'runtime')); fs.writeFileSync(path.join(foreign, 'runtime/source-package.json'), 'invalid cwd decoy');
    const outputs = path.join(directory, 'packages'); fs.mkdirSync(outputs);
    const { verifyPackage } = require(path.join(roots[0], 'tools/package-installable.js'));
    const references = [];
    for (const variant of VARIANTS) {
      const id = variant.composition + '-' + variant.runtimeModel;
      phase = 'clean baseline ' + id;
      const pkg = build(roots[0], roots[0], path.join(outputs, id + '-clean.json'), variant, verifyPackage);
      checkLocalExclusion(pkg, []); references.push(pkg);
      report.variants.push({ ...variant, packageHash: pkg.packageHash, files: Object.keys(pkg.files).length,
        fileBytes: Object.fromEntries(Object.keys(pkg.files).sort().map(file => [file, { bytes: Buffer.from(pkg.files[file], 'base64').length, sha256: digest(Buffer.from(pkg.files[file], 'base64')) }])) });
    }
    const markers = [];
    for (const [index, root] of roots.entries()) for (const [n, file] of LOCAL_FILES.entries()) {
      assert.ok(!source.bytes.has(file), 'local canary would overwrite source');
      const target = path.join(root, file), marker = 'SYNTHETIC-LOCAL-ONLY-' + index + '-' + n + '-DO-NOT-SHIP'; markers.push(marker);
      fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, marker, { flag: 'wx' });
    }
    for (const [variantIndex, variant] of VARIANTS.entries()) {
      const id = variant.composition + '-' + variant.runtimeModel, reference = references[variantIndex];
      for (const [index, root] of roots.entries()) for (const [cwdName, cwd] of [['source', root], ['foreign', foreign]]) {
        phase = id + ' / ' + LOCATIONS[index] + ' / ' + cwdName;
        const pkg = build(root, cwd, path.join(outputs, id + '-' + index + '-' + cwdName + '.json'), variant, verifyPackage);
        checkLocalExclusion(pkg, markers); comparePackages(reference, pkg);
        report.cases.push({ ...variant, location: LOCATIONS[index], cwd: cwdName, verifyPackage: true, identicalHashFilesAndBytes: true, localDataExcluded: true });
      }
      phase = 'negative controls ' + id;
      const tampered = structuredClone(reference), file = 'cep/panel.css', bytes = Buffer.from(tampered.files[file], 'base64');
      assert.ok(bytes.length > 0); bytes[0] ^= 1; tampered.files[file] = bytes.toString('base64');
      assert.throws(() => comparePackages(reference, tampered), /package bytes differ/);
      let rejection;
      assert.throws(() => verifyPackage(tampered), error => { rejection = error.code; return error.code === 'package_integrity'; });
      writeJson(path.join(outputs, id + '-tampered.json'), tampered);
      // Also change a source byte: a freshly verified package must change identity.
      const target = path.join(roots[2], file), original = fs.readFileSync(target), changed = Buffer.from(original); changed[0] ^= 1;
      let rebuilt;
      try {
        fs.writeFileSync(target, changed);
        rebuilt = build(roots[2], foreign, path.join(outputs, id + '-changed-source.json'), variant, verifyPackage);
      } finally { fs.writeFileSync(target, original); }
      assert.throws(() => comparePackages(reference, rebuilt), /package bytes differ/);
      assert.notEqual(rebuilt.packageHash, reference.packageHash, 'source byte must change packageHash');
      report.variants[variantIndex].negativeControls = { file, changedBytes: 1, comparisonRejected: true, verifyPackageRejection: rejection,
        changedSourceVerified: true, changedSourcePackageHash: rebuilt.packageHash };
    }
    report.localCanaries = { filesPerLocation: LOCAL_FILES.length, locations: roots.length, realLocalDataRead: false };
    report.ok = true; writeJson(path.join(directory, 'report.json'), report);
    if (!retain) { fs.rmSync(directory, { recursive: true, force: true }); report.evidenceDirectory = null; }
    return report;
  } catch (error) {
    report.findings.push({ phase, code: error.code || 'check_failed', message: error.message });
    writeJson(path.join(directory, 'report.json'), report);
    return report; // Failure evidence is retained, including original package bytes.
  }
}
if (require.main === module) {
  try {
    const args = process.argv.slice(2), options = {};
    for (let i = 0; i < args.length; i += 2) {
      assert.ok(['--source', '--output-dir'].includes(args[i]) && args[i + 1] && !args[i + 1].startsWith('--') && !Object.hasOwn(options, args[i]), 'usage: node check-package-location.js [--source CORE_ROOT] [--output-dir NEW_DIRECTORY]');
      options[args[i]] = args[i + 1];
    }
    const report = runCheck({ sourceRoot: options['--source'], outputDir: options['--output-dir'] });
    console.log(JSON.stringify(report, null, 2)); process.exitCode = report.ok ? 0 : 1;
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { runCheck };

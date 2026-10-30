'use strict';
// Reviewed local bootstrap: only builtins until every distributed byte passes.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const HELPERS = Object.freeze(['tools/disposition-install-preflight.js', 'tools/install-core4.js', 'tools/maintain-owner.js', 'tools/package-installable.js', 'tools/standalone-installer.js']);
const HASH = /^[a-f0-9]{64}$/;
function fail(code) { throw Object.assign(new Error(code), { code }); }
function canonical(v) { if (v === null || typeof v === 'boolean' || typeof v === 'string' || typeof v === 'number' && Number.isFinite(v)) return JSON.stringify(v); if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']'; if (!v || Object.getPrototypeOf(v) !== Object.prototype) fail('standalone_json'); return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + canonical(v[k])).join(',') + '}'; }
function hash(v) { return crypto.createHash('sha256').update(Buffer.isBuffer(v) || typeof v === 'string' ? v : canonical(v)).digest('hex'); }
function exact(v, keys) { if (!v || Object.getPrototypeOf(v) !== Object.prototype || canonical(Object.keys(v).sort()) !== canonical([...keys].sort())) fail('standalone_schema'); }
function absolute(file) { if (typeof file !== 'string' || !path.isAbsolute(file) || path.resolve(file) !== file) fail('standalone_absolute_exact_path'); return file; }
function safe(file, directory = false) { absolute(file); const s = fs.lstatSync(file); if (s.isSymbolicLink() || s.reparsePoint || fs.realpathSync(file) !== file || (directory ? !s.isDirectory() : !s.isFile())) fail('standalone_path'); return s; }
function read(file) {
  const named = safe(file), fd = fs.openSync(file, 'r');
  try {
    const stat = fs.fstatSync(fd);
    if (!stat.isFile() || stat.dev !== named.dev || stat.ino !== named.ino) fail('standalone_path');
    if (!Number.isSafeInteger(stat.size) || stat.size < 0 || stat.size > 16 * 1024 * 1024) fail('standalone_budget');
    const bytes = Buffer.alloc(stat.size); let offset = 0;
    while (offset < bytes.length) { const count = fs.readSync(fd, bytes, offset, bytes.length - offset, offset); if (!count) fail('standalone_file_changed'); offset += count; }
    // A growing file cannot cause an unbounded read or bypass the original size.
    if (fs.readSync(fd, Buffer.alloc(1), 0, 1, offset) || fs.fstatSync(fd).size !== stat.size) fail('standalone_file_changed');
    return bytes;
  } finally { fs.closeSync(fd); }
}
function verifyStandalone(root, expectedHash) {
  safe(root, true); const manifestBytes = read(path.join(root, 'standalone.json')), manifest = JSON.parse(manifestBytes);
  exact(manifest, ['version', 'purpose', 'packageHash', 'hashes']);
  if (!HASH.test(expectedHash) || hash(manifestBytes) !== expectedHash || manifest.version !== 1 || manifest.purpose !== 'core4-standalone-installer-v1' || !HASH.test(manifest.packageHash)) fail('standalone_reviewed_hash');
  const files = new Set(['standalone.json']), dirs = new Set(['']);
  exact(manifest.hashes, Object.keys(manifest.hashes));
  for (const [file, digest] of Object.entries(manifest.hashes)) {
    if (!/^[A-Za-z0-9_./-]+$/.test(file) || file.split('/').some(p => !p || p === '.' || p === '..') || file === 'standalone.json' || !HASH.test(digest)) fail('standalone_manifest_path');
    files.add(file); for (let dir = path.posix.dirname(file); dir !== '.'; dir = path.posix.dirname(dir)) dirs.add(dir);
  }
  function visit(directory, relative) {
    safe(directory, true); if (!dirs.delete(relative)) fail('standalone_closure_tree');
    for (const name of fs.readdirSync(directory)) {
      const file = path.join(directory, name), rel = relative ? relative + '/' + name : name, stat = fs.lstatSync(file); safe(file, stat.isDirectory());
      if (stat.isDirectory()) visit(file, rel);
      else if (!files.delete(rel) || rel !== 'standalone.json' && hash(read(file)) !== manifest.hashes[rel]) fail('standalone_closure_bytes');
    }
  }
  visit(root, ''); if (files.size || dirs.size) fail('standalone_closure_tree');
  const pkg = JSON.parse(read(path.join(root, 'candidate.json'))); exact(pkg, ['packageHash', 'release', 'files']);
  if (pkg.packageHash !== manifest.packageHash || hash(pkg.release) !== pkg.packageHash || pkg.release.version !== '4.0.0' || pkg.release.format !== 2) fail('standalone_candidate');
  exact(pkg.files, Object.keys(pkg.release.hashes));
  const expected = [...Object.keys(pkg.files), ...HELPERS, 'candidate.json', 'README.txt'].sort();
  if (canonical(Object.keys(manifest.hashes).sort()) !== canonical(expected)) fail('standalone_helper_closure');
  for (const [file, encoded] of Object.entries(pkg.files)) {
    if (/^(test|experiments|node_modules|\.git|logs|state|tools)\//.test(file) || manifest.hashes[file] !== pkg.release.hashes[file] || hash(Buffer.from(encoded, 'base64')) !== pkg.release.hashes[file]) fail('standalone_candidate_bytes');
  }
  return { distributionHash: expectedHash, packageHash: pkg.packageHash, pkg };
}
function main(args = process.argv.slice(2)) {
  const options = {}, mode = args[0];
  if (!['dry-run', 'apply'].includes(mode) || args.length % 2 !== 1) fail('standalone_usage');
  for (let i = 1; i < args.length; i += 2) { const key = args[i], value = args[i + 1]; if (!['--expected-distribution-hash', '--expected-package-hash', '--install-root', '--extensions-dir', '--config'].includes(key) || Object.hasOwn(options, key) || typeof value !== 'string' || value.startsWith('--')) fail('standalone_usage'); options[key] = value; }
  if (!options['--expected-distribution-hash'] || !options['--install-root'] || !options['--extensions-dir'] || !options['--config'] || mode === 'apply' && !options['--expected-package-hash']) fail('standalone_usage');
  const destination = { installRoot: absolute(options['--install-root']), extensionsDir: absolute(options['--extensions-dir']), configPath: absolute(options['--config']) };
  const checked = verifyStandalone(path.resolve(__dirname, '..'), options['--expected-distribution-hash']);
  if (options['--expected-package-hash'] !== undefined && (!HASH.test(options['--expected-package-hash']) || options['--expected-package-hash'] !== checked.packageHash)) fail('reviewed_package_hash_mismatch');
  // All eager and lazy imports, including signed-history preflight, were checked.
  const { planInstall, applyInstall } = require('./install-core4.js');
  const plan = planInstall({ ...destination, pkg: checked.pkg, nodePath: process.execPath });
  return mode === 'apply' ? applyInstall(plan) : { dryRun: true, distributionHash: checked.distributionHash, packageHash: checked.packageHash, ...destination, descriptorPath: plan.descriptorPath, stateDir: plan.descriptor.stateDir, cepDir: plan.cepDir, baseline: plan.baseline, liveProof: false };
}
if (require.main === module) { try { console.log(canonical(main())); } catch (e) { console.error(canonical({ error: e.code || 'standalone_failed', ...(e.transactionFile ? { transactionFile: e.transactionFile } : {}) })); process.exitCode = 1; } }
module.exports = { HELPERS, verifyStandalone, main };

'use strict';
// Reviewed local bootstrap: only builtins until every distributed byte passes.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const HELPERS = Object.freeze(['runtime/stopped-certification.js', 'tools/disposition-install-preflight.js', 'tools/finish-owner-maintenance.js', 'tools/install-core4.js', 'tools/legacy-owner-migration.js', 'tools/maintain-owner.js', 'tools/operate-start-over.js', 'tools/operate-stopped-readoption.js', 'tools/operate-stopped-update.js', 'tools/package-installable.js', 'tools/standalone-installer.js', 'tools/stopped-host-readoption-store.js', 'tools/stopped-host-readoption-transaction.js', 'tools/stopped-host-readoption.js', 'tools/stopped-update.js', 'tools/windows-retained-process.js']);
const HASH = /^[a-f0-9]{64}$/;
const maintenanceBootstraps = new WeakMap();
const updateBootstraps = new WeakMap();
const readoptionBootstraps = new WeakMap();
const startOverBootstraps = new WeakMap();
function fail(code) { throw Object.assign(new Error(code), { code }); }
function canonical(v) { if (v === null || typeof v === 'boolean' || typeof v === 'string' || typeof v === 'number' && Number.isFinite(v)) return JSON.stringify(v); if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']'; if (!v || Object.getPrototypeOf(v) !== Object.prototype) fail('standalone_json'); return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + canonical(v[k])).join(',') + '}'; }
function hash(v) { return crypto.createHash('sha256').update(Buffer.isBuffer(v) || typeof v === 'string' ? v : canonical(v)).digest('hex'); }
function exact(v, keys) { if (!v || Object.getPrototypeOf(v) !== Object.prototype || canonical(Object.keys(v).sort()) !== canonical([...keys].sort())) fail('standalone_schema'); }
function verifyManifest(manifest) {
  const keys = ['version', 'purpose', 'packageHash', 'hashes'];
  if (manifest?.version === 2) keys.push('capabilityBaseHash');
  exact(manifest, keys);
  if (![1, 2].includes(manifest.version) || manifest.purpose !== 'core4-standalone-installer-v1' ||
      typeof manifest.packageHash !== 'string' || !HASH.test(manifest.packageHash)) fail('standalone_schema');
  if (manifest.version === 2 && (typeof manifest.capabilityBaseHash !== 'string' || !HASH.test(manifest.capabilityBaseHash) ||
      manifest.capabilityBaseHash === manifest.packageHash)) fail('capability_update_base');
}
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
  if (!HASH.test(expectedHash) || hash(manifestBytes) !== expectedHash) fail('standalone_reviewed_hash');
  verifyManifest(manifest);
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
  if (pkg.packageHash !== manifest.packageHash || hash(pkg.release) !== pkg.packageHash || !['4.0.0', '4.1.0', '4.1.1', '4.1.2', '4.2.1', '4.2.2', '4.2.3', '4.2.4', '4.2.5'].includes(pkg.release.version) || pkg.release.format !== 2) fail('standalone_candidate');
  exact(pkg.files, Object.keys(pkg.release.hashes));
  const expected = [...Object.keys(pkg.files), ...HELPERS, 'candidate.json', 'README.txt'].sort();
  if (canonical(Object.keys(manifest.hashes).sort()) !== canonical(expected)) fail('standalone_helper_closure');
  for (const [file, encoded] of Object.entries(pkg.files)) {
    if (/^(test|experiments|node_modules|\.git|logs|state|tools)\//.test(file) || manifest.hashes[file] !== pkg.release.hashes[file] || hash(Buffer.from(encoded, 'base64')) !== pkg.release.hashes[file]) fail('standalone_candidate_bytes');
  }
  return { distributionHash: expectedHash, packageHash: pkg.packageHash, pkg, ...(manifest.version === 2 ? { capabilityBaseHash: manifest.capabilityBaseHash } : {}) };
}
function main(args = process.argv.slice(2)) {
  const options = {}, mode = args[0];
  const maintenance = ['maintenance-inspect', 'maintenance-finish', 'stopped-inspect', 'stopped-certify'].includes(mode);
  const update = ['migrate-legacy', 'owner-update', 'update-inspect', 'update-finish', 'update-enable', 'enable-finish', 'legacy-inspect', 'legacy-finish', 'owner-pre-ready-inspect', 'owner-pre-ready-finish'].includes(mode);
  const readoption = ['readopt-inspect', 'readopt-apply', 'readopt-finish', 'readopt-enable', 'readopt-enable-finish'].includes(mode);
  const startOver = ['start-over-plan', 'start-over-request', 'start-over-stopped-plan', 'start-over-stopped-request', 'start-over-inspect', 'start-over-finish', 'start-over-continue'].includes(mode);
  const action = ['maintenance-finish', 'stopped-certify'].includes(mode);
  if (!['dry-run', 'apply'].includes(mode) && !maintenance && !update && !readoption && !startOver || args.length % 2 !== 1) fail('standalone_usage');
  if (startOver) {
    const pin = ['start-over-request', 'start-over-stopped-request'].includes(mode) ? ['--confirm-plan-hash'] :
      ['start-over-finish', 'start-over-continue'].includes(mode) ? ['--expected-intent-hash'] : [];
    const allowed = ['--expected-distribution-hash', '--expected-current-package-hash', '--installation', '--operation', ...pin];
    for (let i = 1; i < args.length; i += 2) { if (!allowed.includes(args[i]) || Object.hasOwn(options, args[i]) || typeof args[i + 1] !== 'string' || !args[i + 1] || args[i + 1].startsWith('--')) fail('standalone_usage'); options[args[i]] = args[i + 1]; }
    if (Object.keys(options).length !== allowed.length || allowed.filter(k => k.includes('hash')).some(k => !HASH.test(options[k])) || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(options['--operation'])) fail('standalone_usage');
    absolute(options['--installation']);
    const checked = verifyStandalone(path.resolve(__dirname, '..'), options['--expected-distribution-hash']);
    for (const name of ['owner-contract.json', 'start-over-state.js', 'start-over-finisher.js', 'start-over-driver.js', 'work-session.js']) if (!Object.hasOwn(checked.pkg.release.hashes, 'runtime/' + name)) fail('start_over_distribution_unavailable');
    const capability = Object.freeze({}); startOverBootstraps.set(capability, Object.freeze({ mode, descriptor: options['--installation'], id: options['--operation'], expectedCurrentPackageHash: options['--expected-current-package-hash'], expectedIntentHash: options['--expected-intent-hash'], confirmedPlanHash: options['--confirm-plan-hash'] }));
    return (async () => { try { return await require('./operate-start-over.js').operate(capability); } finally { startOverBootstraps.delete(capability); } })();
  }
  if (readoption) {
    const allowed = ['--expected-distribution-hash', '--expected-current-package-hash', '--installation', '--operation', ...(mode !== 'readopt-inspect' ? ['--expected-proof-hash'] : []), ...(mode === 'readopt-apply' ? ['--witness', '--expected-witness-hash'] : [])];
    for (let i = 1; i < args.length; i += 2) { if (!allowed.includes(args[i]) || Object.hasOwn(options, args[i]) || typeof args[i + 1] !== 'string' || !args[i + 1] || args[i + 1].startsWith('--')) fail('standalone_usage'); options[args[i]] = args[i + 1]; }
    if (Object.keys(options).length !== allowed.length || allowed.filter(k => k.includes('hash')).some(k => !HASH.test(options[k])) || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(options['--operation'])) fail('standalone_usage');
    absolute(options['--installation']); if (mode === 'readopt-apply') absolute(options['--witness']);
    const checked = verifyStandalone(path.resolve(__dirname, '..'), options['--expected-distribution-hash']);
    if (checked.packageHash !== options['--expected-current-package-hash']) fail('readoption_distribution_package_mismatch');
    for (const name of ['owner-contract.json', 'owner-entry.js', 'owner-maintenance.js', 'recovery-inspection.js', 'windows-owner-process.js', 'windows-reservation-provider.js', 'manual-policy.js']) if (!Object.hasOwn(checked.pkg.release.hashes, 'runtime/' + name)) fail('readoption_distribution_unavailable');
    const capability = Object.freeze({}); readoptionBootstraps.set(capability, Object.freeze({ mode, descriptorPath: options['--installation'], id: options['--operation'], expectedCurrentPackageHash: options['--expected-current-package-hash'], expectedProofHash: options['--expected-proof-hash'], witnessPath: options['--witness'], expectedWitnessHash: options['--expected-witness-hash'] }));
    // Catch synchronous import/call failures too; revoke only after the complete
    // awaited operation, including its election cleanup, has settled.
    return (async () => { try { return await require('./operate-stopped-readoption.js').operate(capability); } finally { readoptionBootstraps.delete(capability); } })();
  }
  if (update) {
    const primary = ['migrate-legacy', 'owner-update'].includes(mode), inspecting = ['update-inspect', 'legacy-inspect', 'owner-pre-ready-inspect'].includes(mode);
    const allowed = ['--expected-distribution-hash', '--expected-package-hash', '--expected-current-package-hash', '--expected-previous-descriptor-hash', '--installation', '--operation', ...(primary ? ['--config'] : []), ...(mode === 'migrate-legacy' ? ['--root-status', '--expected-root-status-hash'] : []), ...(!primary && !inspecting ? ['--expected-proof-hash'] : [])];
    for (let i = 1; i < args.length; i += 2) { if (!allowed.includes(args[i]) || Object.hasOwn(options, args[i]) || !args[i + 1] || args[i + 1].startsWith('--')) fail('standalone_usage'); options[args[i]] = args[i + 1]; }
    if (Object.keys(options).length !== allowed.length || allowed.filter(k => k.includes('hash')).some(k => !HASH.test(options[k])) || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(options['--operation'])) fail('standalone_usage');
    for (const k of ['--installation', ...(primary ? ['--config'] : []), ...(mode === 'migrate-legacy' ? ['--root-status'] : [])]) absolute(options[k]);
    const checked = verifyStandalone(path.resolve(__dirname, '..'), options['--expected-distribution-hash']);
    if (checked.packageHash !== options['--expected-package-hash'] || !Object.hasOwn(checked.pkg.release.hashes, 'runtime/owner-contract.json')) fail('update_distribution_unavailable');
    if (checked.capabilityBaseHash && (mode.includes('legacy') || checked.capabilityBaseHash !== options['--expected-current-package-hash'])) fail('capability_update_base');
    const capability = Object.freeze({});
    updateBootstraps.set(capability, Object.freeze({ mode, descriptorPath: options['--installation'], expectedPreviousDescriptorHash: options['--expected-previous-descriptor-hash'], expectedCurrentPackageHash: options['--expected-current-package-hash'], expectedPackageHash: options['--expected-package-hash'], id: options['--operation'], pkg: checked.pkg, configPath: options['--config'], rootStatusPath: options['--root-status'], rootStatusHash: options['--expected-root-status-hash'], expectedProofHash: options['--expected-proof-hash'] }));
    return Promise.resolve(require('./operate-stopped-update.js').operate(capability)).finally(() => updateBootstraps.delete(capability));
  }
  if (maintenance) {
    const allowed = ['--expected-distribution-hash', '--expected-current-package-hash', '--installation', '--operation', ...(action ? ['--expected-proof-hash'] : [])];
    for (let i = 1; i < args.length; i += 2) { if (!allowed.includes(args[i]) || Object.hasOwn(options, args[i]) || !args[i + 1] || args[i + 1].startsWith('--')) fail('standalone_usage'); options[args[i]] = args[i + 1]; }
    if (Object.keys(options).length !== allowed.length || !HASH.test(options['--expected-current-package-hash']) || action && !HASH.test(options['--expected-proof-hash']) || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(options['--operation'])) fail('standalone_usage');
    absolute(options['--installation']);
    const checked = verifyStandalone(path.resolve(__dirname, '..'), options['--expected-distribution-hash']);
    for (const name of ['owner-contract.json', 'owner-maintenance.js', 'recovery-inspection.js', 'windows-owner-process.js']) if (!Object.hasOwn(checked.pkg.release.hashes, 'runtime/' + name)) fail('maintenance_distribution_unavailable');
    const capability = Object.freeze({}); maintenanceBootstraps.set(capability, Object.freeze({ mode, descriptor: options['--installation'], id: options['--operation'], expectedPackageHash: options['--expected-current-package-hash'], expectedProofHash: options['--expected-proof-hash'] }));
    // The only continuation import is from this exact reviewed distribution.
    return Promise.resolve(require('./finish-owner-maintenance.js').operate(capability)).finally(() => maintenanceBootstraps.delete(capability));
  }
  for (let i = 1; i < args.length; i += 2) { const key = args[i], value = args[i + 1]; if (!['--expected-distribution-hash', '--expected-package-hash', '--install-root', '--extensions-dir', '--config'].includes(key) || Object.hasOwn(options, key) || typeof value !== 'string' || value.startsWith('--')) fail('standalone_usage'); options[key] = value; }
  if (!options['--expected-distribution-hash'] || !options['--install-root'] || !options['--extensions-dir'] || !options['--config'] || mode === 'apply' && !options['--expected-package-hash']) fail('standalone_usage');
  const destination = { installRoot: absolute(options['--install-root']), extensionsDir: absolute(options['--extensions-dir']), configPath: absolute(options['--config']) };
  const checked = verifyStandalone(path.resolve(__dirname, '..'), options['--expected-distribution-hash']);
  if (checked.capabilityBaseHash) fail('capability_stopped_update_required');
  if (options['--expected-package-hash'] !== undefined && (!HASH.test(options['--expected-package-hash']) || options['--expected-package-hash'] !== checked.packageHash)) fail('reviewed_package_hash_mismatch');
  // All eager and lazy imports, including signed-history preflight, were checked.
  const { planInstall, applyInstall } = require('./install-core4.js');
  const plan = planInstall({ ...destination, pkg: checked.pkg, nodePath: process.execPath });
  return mode === 'apply' ? applyInstall(plan) : { dryRun: true, distributionHash: checked.distributionHash, packageHash: checked.packageHash, ...destination, descriptorPath: plan.descriptorPath, stateDir: plan.descriptor.stateDir, cepDir: plan.cepDir, baseline: plan.baseline, liveProof: false };
}
function assertMaintenanceBootstrap(capability) { const value = capability && maintenanceBootstraps.get(capability); if (!value) fail('maintenance_bootstrap_brand'); return value; }
function assertUpdateBootstrap(capability) { const value = capability && updateBootstraps.get(capability); if (!value) fail('update_bootstrap_brand'); return value; }
function assertReadoptionBootstrap(capability) { const value = capability && readoptionBootstraps.get(capability); if (!value) fail('readoption_bootstrap_brand'); return value; }
function assertStartOverBootstrap(capability) { const value = capability && startOverBootstraps.get(capability); if (!value) fail('start_over_bootstrap_brand'); return value; }
if (require.main === module) { Promise.resolve().then(() => main()).then(value => console.log(canonical(value))).catch(e => { console.error(canonical({ error: /^[a-z][a-z0-9_]{0,80}$/.test(e.code || '') ? e.code : 'standalone_failed', ...(e.transactionFile ? { transactionFile: e.transactionFile } : {}) })); process.exitCode = 1; }); }
module.exports = { HELPERS, verifyManifest, verifyStandalone, main, assertMaintenanceBootstrap, assertUpdateBootstrap, assertReadoptionBootstrap, assertStartOverBootstrap };

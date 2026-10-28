'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
// ONLY builtins are loaded until the entire installed release is verified.
function fail(code) { throw Object.assign(new Error(code), { code }); }
function canonical(value) {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (!value || Object.getPrototypeOf(value) !== Object.prototype) fail('invalid_installation_json');
  return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
}
function hash(value) { return crypto.createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : canonical(value)).digest('hex'); }
function verifyRelease(directory, release) {
  const root = path.resolve(directory), expectedFiles = new Set(['release.json']), expectedDirs = new Set(['']);
  for (const relative of Object.keys(release.hashes || {})) {
    if (!/^[A-Za-z0-9_./-]+$/.test(relative) || relative.includes('\\') || relative.split('/').some(p => !p || p === '.' || p === '..') || path.isAbsolute(relative) || relative === 'release.json') fail('release_path');
    expectedFiles.add(relative);
    for (let dir = path.posix.dirname(relative); dir !== '.'; dir = path.posix.dirname(dir)) expectedDirs.add(dir);
  }
  function visit(directory, relative) {
    const stat = fs.lstatSync(directory);
    if (stat.isSymbolicLink() || !stat.isDirectory() || fs.realpathSync(directory) !== directory || !expectedDirs.delete(relative)) fail('release_tree_mismatch');
    for (const item of fs.readdirSync(directory)) {
      const file = path.join(directory, item), rel = relative ? relative + '/' + item : item, child = fs.lstatSync(file);
      if (child.isSymbolicLink() || fs.realpathSync(file) !== file) fail('release_tree_mismatch');
      if (child.isDirectory()) visit(file, rel);
      else if (!child.isFile() || !expectedFiles.delete(rel)) fail('release_tree_mismatch');
      else if (rel === 'release.json' ? fs.readFileSync(file, 'utf8') !== canonical(release) : hash(fs.readFileSync(file)) !== release.hashes[rel]) fail('installed_release_bytes');
    }
  }
  visit(root, ''); if (expectedFiles.size || expectedDirs.size) fail('release_tree_mismatch');
}
function assertPlainPath(file, directory = false) {
  if (!path.isAbsolute(file) || path.resolve(file) !== file) fail('installation_path');
  const stat = fs.lstatSync(file); if (stat.isSymbolicLink() || stat.reparsePoint || fs.realpathSync(file) !== file || (directory ? !stat.isDirectory() : !stat.isFile())) fail('installation_path');
}
function verifyCep(d, manifest, cepDir) {
  assertPlainPath(cepDir, true); if (path.basename(cepDir) !== 'com.codex.aeagentcore4') fail('installation_cep_scope');
  const inspection = JSON.parse(fs.readFileSync(path.join(d.releaseDir, 'modules/project-inspection/artifact.json'), 'utf8'));
  const manual = JSON.parse(fs.readFileSync(path.join(d.releaseDir, 'config/admissions/titles-current-target.json'), 'utf8'));
  const expected = Object.fromEntries(Object.entries(manifest.hashes).filter(([file]) => file.startsWith('cep/')).map(([file, digest]) => [file.slice(4), digest]));
  if (Object.keys(expected).length !== 6) fail('installation_cep_closure');
  const cfg = { installationId: d.installationId, packageHash: d.packageHash, panelToken: d.panelToken, executorHash: inspection.executorHash, assetKey: 'project-inspection-v1', assets: [{ assetKey: 'project-inspection-v1', executorHash: inspection.executorHash, phases: ['inspect'] }, { assetKey: 'titles-current-target-v1', executorHash: manual.executorHash, phases: ['inspect', 'mutate', 'verify'] }] };
  expected['installation.js'] = hash('window.Core4Installation=' + canonical(cfg) + ';\n');
  const files = new Set(Object.keys(expected)), dirs = new Set(['']); for (const file of files) for (let dir = path.posix.dirname(file); dir !== '.'; dir = path.posix.dirname(dir)) dirs.add(dir);
  function visit(directory, relative) { assertPlainPath(directory, true); if (!dirs.delete(relative)) fail('installation_cep_tree'); for (const name of fs.readdirSync(directory)) { const file = path.join(directory, name), rel = relative ? relative + '/' + name : name, stat = fs.lstatSync(file); assertPlainPath(file, stat.isDirectory()); if (stat.isDirectory()) visit(file, rel); else if (!files.delete(rel) || hash(fs.readFileSync(file)) !== expected[rel]) fail('installation_cep_bytes'); } }
  visit(cepDir, ''); if (files.size || dirs.size) fail('installation_cep_tree');
}
function verifyInstallation(file, options = {}) {
  if (Object.keys(options).some(key => key !== 'cepDir')) fail('installation_verifier_options');
  const { cepDir } = options;
  if (!path.isAbsolute(file)) fail('absolute_descriptor_required');
  assertPlainPath(file);
  const d = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (![1, 2].includes(d.version) || !path.isAbsolute(d.installRoot) || file !== path.join(d.installRoot, 'installation.json') || d.releaseDir !== path.join(d.installRoot, 'releases', d.packageHash) || d.stateDir !== path.join(d.installRoot, 'state/production') || !path.isAbsolute(d.nodePath) || !/^[a-f0-9]{64}$/.test(d.nodeHash) || !d.installationId || d.panelToken === d.controlToken || !/^[a-f0-9]{64}$/.test(d.panelToken) || !/^[a-f0-9]{64}$/.test(d.controlToken)) fail('installation_descriptor');
  if (d.version === 2) {
    const keys = ['version', 'installRoot', 'installationId', 'machineId', 'packageHash', 'releaseDir', 'stateDir', 'nodePath', 'nodeHash', 'nodeVersion', 'panelToken', 'controlToken', 'cepDir', 'receiverFormatVersion', 'predecessor'];
    if (Object.keys(d).length !== keys.length || keys.some(key => !Object.hasOwn(d, key)) || !path.isAbsolute(d.cepDir) || d.receiverFormatVersion !== 2) fail('installation_descriptor_v2');
    if (d.predecessor !== null && (!d.predecessor || Object.keys(d.predecessor).sort().join(',') !== 'previousDescriptorHash,transactionId' || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(d.predecessor.transactionId) || !/^[a-f0-9]{64}$/.test(d.predecessor.previousDescriptorHash))) fail('installation_predecessor');
  }
  assertPlainPath(path.join(d.installRoot, 'origin.json')); assertPlainPath(path.join(d.stateDir, 'origin.json'));
  const origin = JSON.parse(fs.readFileSync(path.join(d.installRoot, 'origin.json'), 'utf8'));
  const anchor = JSON.parse(fs.readFileSync(path.join(d.stateDir, 'origin.json'), 'utf8'));
  if (canonical(origin) !== canonical(anchor) || origin.installationId !== d.installationId || origin.machineId !== d.machineId) fail('installation_origin_mismatch');
  if ((path.resolve(process.execPath).toLowerCase() !== path.resolve(d.nodePath).toLowerCase() || hash(fs.readFileSync(d.nodePath)) !== d.nodeHash || Number(process.versions.node.split('.')[0]) < 20)) fail('external_node_mismatch');
  const manifest = JSON.parse(fs.readFileSync(path.join(d.releaseDir, 'release.json'), 'utf8'));
  if (hash(manifest) !== d.packageHash) fail('installation_package_hash');
  verifyRelease(d.releaseDir, manifest);
  if (d.version === 2) { const receiver = JSON.parse(fs.readFileSync(path.join(d.releaseDir, 'runtime/receiver-contract.json'), 'utf8')); if (receiver.version !== 1 || receiver.descriptorVersion !== 2 || receiver.journalFormat !== d.receiverFormatVersion || receiver.terminalReadFailureDispositionVersion !== 1) fail('installation_receiver_contract'); verifyCep(d, manifest, d.cepDir); }
  else if (cepDir) verifyCep(d, manifest, cepDir);
  return Object.freeze(d);
}
// Reviewed operator bootstrap imports provider ONLY from the verified release.
async function adopt({ descriptor, witness }) {
  const installation = verifyInstallation(descriptor);
  const expected = JSON.parse(fs.readFileSync(witness, 'utf8'));
  if (expected.installationId !== installation.installationId || expected.machineId !== installation.machineId) fail('adoption_witness_identity');
  const gate = path.join(installation.installRoot, 'install.lock'), fd = fs.openSync(gate, 'wx');
  try {
    if (canonical(verifyInstallation(descriptor)) !== canonical(installation)) fail('installation_changed_during_adoption');
    if (['broker/broker-owner.lock', 'broker/broker-owner.gate', 'receiver/owner'].some(relative => fs.existsSync(path.join(installation.stateDir, relative)))) fail('adoption_requires_stopped_runtime');
    const { createWindowsReservationProvider } = require(path.join(installation.releaseDir, 'runtime/windows-reservation-provider.js'));
    const provider = createWindowsReservationProvider({ installation });
    return await provider.adopt({ expected: expected.host, allowedProject: expected.allowedProject, rootObservationDigest: expected.rootObservationDigest });
  } finally { fs.closeSync(fd); fs.unlinkSync(gate); }
}
if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.length !== 4 || args[0] !== '--installation' || args[2] !== '--witness') { process.stderr.write('adopt-host --installation ABS_DESCRIPTOR --witness ABS_ROOT_WITNESS\n'); process.exitCode = 2; }
  else adopt({ descriptor: args[1], witness: args[3] }).then(value => console.log(canonical(value))).catch(e => { process.stderr.write((e.code || 'host_adoption_failed') + '\n'); process.exitCode = 1; });
}
module.exports = { adopt };

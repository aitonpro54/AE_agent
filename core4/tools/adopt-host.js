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
function verifyInstallation(file, { verifyNode = true } = {}) {
  if (!path.isAbsolute(file)) fail('absolute_descriptor_required');
  const d = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (d.version !== 1 || !path.isAbsolute(d.releaseDir) || !path.isAbsolute(d.stateDir) || !path.isAbsolute(d.nodePath) || !/^[a-f0-9]{64}$/.test(d.nodeHash) || !d.installationId || d.panelToken === d.controlToken || !/^[a-f0-9]{64}$/.test(d.panelToken) || !/^[a-f0-9]{64}$/.test(d.controlToken)) fail('installation_descriptor');
  const origin = JSON.parse(fs.readFileSync(path.join(d.installRoot, 'origin.json'), 'utf8'));
  const anchor = JSON.parse(fs.readFileSync(path.join(d.stateDir, 'origin.json'), 'utf8'));
  if (canonical(origin) !== canonical(anchor) || origin.installationId !== d.installationId || origin.machineId !== d.machineId) fail('installation_origin_mismatch');
  if (verifyNode && (path.resolve(process.execPath).toLowerCase() !== path.resolve(d.nodePath).toLowerCase() || hash(fs.readFileSync(d.nodePath)) !== d.nodeHash || Number(process.versions.node.split('.')[0]) < 20)) fail('external_node_mismatch');
  const manifest = JSON.parse(fs.readFileSync(path.join(d.releaseDir, 'release.json'), 'utf8'));
  if (hash(manifest) !== d.packageHash) fail('installation_package_hash');
  verifyRelease(d.releaseDir, manifest); return Object.freeze(d);
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

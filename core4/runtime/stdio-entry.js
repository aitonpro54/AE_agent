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
async function start({ descriptor, port = 3457, input = process.stdin, output = process.stdout } = {}) {
  const installation = verifyInstallation(descriptor), root = installation.releaseDir;
  if (fs.realpathSync(path.resolve(__dirname, '..')) !== fs.realpathSync(root)) fail('installation_entry_root_mismatch');
  const installGate = path.join(installation.installRoot, 'install.lock');
  const startupGate = fs.openSync(installGate, 'wx');
  let broker, peer;
  try {
  if (canonical(verifyInstallation(descriptor)) !== canonical(installation)) fail('installation_changed_during_start');
  const { Broker } = require('../core/broker.js');
  const { serve } = require('../core/stdio.js');
  const { exact, id } = require('../protocol/json.js');
  const { createHttpPeer } = require('../integrations/cep/http-peer.js');
  const profile = JSON.parse(fs.readFileSync(path.join(root, 'runtime/profiles.json'), 'utf8')).profiles.find(p => p.id === 'project-inspection');
  if (!profile || profile.path !== 'modules/project-inspection' || profile.executionPolicy !== 'read-only-current-observation-v1') fail('inspection_profile_not_admitted');
  const contract = JSON.parse(fs.readFileSync(path.join(root, profile.path, 'contract.json'), 'utf8'));
  const admission = JSON.parse(fs.readFileSync(path.join(root, profile.path, 'artifact.json'), 'utf8'));
  const source = fs.readFileSync(path.join(root, profile.path, 'executor.jsx'), 'utf8');
  if (admission.executorHash !== hash(source) || admission.contractHash !== hash(contract) || admission.executionPolicy !== profile.executionPolicy) fail('inspection_admission');
  const asset = { assetKey: 'project-inspection-v1', executorHash: admission.executorHash };
  broker = new Broker({ root, stateDir: path.join(installation.stateDir, 'broker') });
  const admissionGuard = () => {
    if (broker.closed) fail('broker_closed');
    if (broker.stateLock.error) fail(broker.stateLock.error);
    if (broker.ledger.corrupt) fail('ledger_corrupt');
    if (broker.ledger.unresolved().length) fail('controller_unresolved');
  };
  peer = createHttpPeer({ installation, directory: path.join(installation.stateDir, 'receiver'), asset, port, admissionGuard });
  const contractId = hash({ packageHash: installation.packageHash, admission, contract }); let closed = false;
  const facade = Object.create(broker);
  facade.status = () => ({ ...broker.status(), product: 'AE Agent Core 4.0.0', installation: { installationId: installation.installationId, packageHash: installation.packageHash, nodeVersion: process.versions.node, nodeVerified: true, machineId: installation.machineId }, physical: peer.status(), automaticLifecycle: 'unavailable', inspectionPolicy: profile.executionPolicy, externalLegacyCoverage: 'unobserved' });
  facade.diagnostics = () => ({ ...broker.diagnostics(), ...facade.status() });
  facade.connect = async () => ({ available: peer.status().peer.connected, inspectionOnly: true, automaticLifecycle: 'unavailable', physical: peer.status() });
  facade.disconnect = async () => ({ disconnected: false, reason: 'physical_link_owned_by_stdio_lifetime', physical: peer.status() });
  facade.listModules = value => { const result = broker.listModules(value); return { ...result, modules: [...result.modules, { id: profile.id, version: '4.0.0', executionPolicy: profile.executionPolicy }] }; };
  facade.getContract = value => { if (value.moduleId !== profile.id) return broker.getContract(value); exact(value, ['moduleId']); return { contractId, moduleId: profile.id, operationId: contract.operationId, modulePin: hash(admission), contract: JSON.parse(canonical(contract)) }; };
  facade.inspect = async value => {
    if (value.contractId !== contractId) return broker.inspect(value);
    exact(value, ['moduleId', 'contractId', 'target']);
    if (value.moduleId !== profile.id) fail('contract_identity');
    const result = await peer.inspect(value.target || {});
    return { evidenceRef: id('observation'), moduleId: profile.id, contractId, ...result, authority: false };
  };
  facade.build = value => { if (value.contractId === contractId || value.steps?.some(s => s.contractId === contractId)) fail('read_only_module_build_unsupported'); return broker.build(value); };
  facade.close = async () => { if (closed) return; closed = true; await peer.close(); await broker.close(); };
  try { await peer.listen(); } catch (e) { await facade.close(); throw e; }
  serve(facade, input, output, { serverInfo: { name: 'ae-agent-core4', version: '4.0.0' } });
  return { close: facade.close, status: facade.status };
  } catch (e) { if (peer) await peer.close(); if (broker) await broker.close(); throw e; }
  finally { fs.closeSync(startupGate); fs.unlinkSync(installGate); }
}
if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== '--installation') { process.stderr.write('Explicit --installation ABSOLUTE_DESCRIPTOR required.\n'); process.exitCode = 2; }
  else start({ descriptor: args[1] }).then(runtime => {
    for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => runtime.close().then(() => process.exit(0)));
  }).catch(e => { process.stderr.write((e.code || 'runtime_start_failed') + '\n'); process.exitCode = 1; });
}
module.exports = { start, verifyInstallation, verifyRelease };

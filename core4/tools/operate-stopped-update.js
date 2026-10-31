'use strict';
// Only the fully verified NEW standalone distribution invokes this operator.
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), crypto = require('node:crypto');
function fail(code) { throw Object.assign(Error(code), { code }); }
function digest(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }
function read(file, limit = 128 * 1024) {
  if (!path.isAbsolute(file) || path.resolve(file) !== file) fail('update_operator_path');
  let cursor = path.parse(file).root; const parts = file.slice(cursor.length).split(path.sep).filter(Boolean);
  for (const [i, part] of parts.entries()) { cursor = path.join(cursor, part); const s = fs.lstatSync(cursor); if (s.isSymbolicLink() || s.reparsePoint || fs.realpathSync(cursor) !== cursor || (i < parts.length - 1 ? !s.isDirectory() : !s.isFile())) fail('update_operator_path'); }
  const fd = fs.openSync(file, 'r');
  try {
    const s = fs.fstatSync(fd, { bigint: true }), keys = ['dev', 'ino', 'size', 'mtimeNs', 'ctimeNs', 'birthtimeNs'];
    if (s.size > BigInt(limit)) fail('update_operator_budget');
    const b = Buffer.alloc(Number(s.size) + 1); let at = 0, n; while (at < b.length && (n = fs.readSync(fd, b, at, b.length - at, at))) at += n;
    const named = fs.lstatSync(file, { bigint: true }), held = fs.fstatSync(fd, { bigint: true });
    if (at !== Number(s.size) || keys.some(k => s[k] !== named[k] || s[k] !== held[k])) fail('update_operator_changed'); return b.subarray(0, at);
  } finally { fs.closeSync(fd); }
}
async function operate(capability) {
  const options = require('./standalone-installer').assertUpdateBootstrap(capability);
  const { mode, descriptorPath, expectedPreviousDescriptorHash, expectedCurrentPackageHash, expectedPackageHash, id, pkg } = options;
  const { canonical } = require('../protocol/json');
  const update = require('./stopped-update'), legacy = require('./legacy-owner-migration');
  let old, result, lease, server;
  async function reserve() {
    server = http.createServer(); await new Promise((resolve, reject) => { const refused = () => reject(Object.assign(Error('update_operator_endpoint_unavailable'), { code: 'update_operator_endpoint_unavailable' })); server.once('error', refused); server.listen(3457, '127.0.0.1', () => { server.removeListener('error', refused); resolve(); }); }); return server;
  }
  try {
    if (['migrate-legacy', 'owner-update'].includes(mode)) {
      const oldBytes = read(descriptorPath);
      if (digest(oldBytes) !== expectedPreviousDescriptorHash) fail('update_operator_descriptor_pin');
      old = require('../runtime/stdio-entry').verifyInstallation(descriptorPath);
      if (old.packageHash !== expectedCurrentPackageHash || !Buffer.from(canonical(old)).equals(oldBytes)) fail('update_operator_package_pin');
      const plan = require('./install-core4').planInstall({ pkg, nodePath: process.execPath, installRoot: old.installRoot, extensionsDir: path.dirname(old.cepDir), configPath: options.configPath });
      if (plan.pkg.packageHash !== expectedPackageHash || plan.descriptorPath !== descriptorPath) fail('update_operator_scope');
      if (mode === 'migrate-legacy') {
        const statusBytes = read(options.rootStatusPath);
        if (digest(statusBytes) !== options.rootStatusHash) fail('update_operator_status_pin');
        let observation; try { observation = JSON.parse(statusBytes); } catch { fail('update_operator_status'); }
        if (!observation || Object.keys(observation).sort().join(',') !== 'observedAt,status') fail('update_operator_status');
        const preflight = { plan, rootStatus: observation.status, observedAt: observation.observedAt, id };
        const inspected = await legacy.inspectLegacyMigration(preflight);
        const stopped = await legacy.stopLegacyForUpdate({ ...preflight, expectedProofHash: inspected.proofHash }); lease = stopped.lease;
        const prepared = await update.prepareLegacyStoppedUpdate({ plan, lease, stoppedCapability: stopped.stoppedCapability, reservedServer: await reserve() });
        result = update.applyStoppedUpdate({ plan, ...prepared }); lease = null;
      } else {
        const certificate = require('../runtime/stopped-certification'), reservedServer = await reserve();
        const inputs = { installation: old, descriptorPath, id, reservedServer }, inspected = await certificate.inspectStoppedCertification(inputs);
        const certified = await certificate.certifyStoppedInstallation({ ...inputs, expectedProofHash: inspected.proofHash });
        const prepared = await update.prepareStoppedUpdate({ plan, certificate: certified, ...inputs }); lease = prepared.lease;
        result = update.applyStoppedUpdate({ plan, ...prepared }); lease = null;
      }
      return { ...result, migrationId: id, expectedPreviousDescriptorHash, expectedPackageHash, runtimeStarted: false };
    }
    const reservedServer = await reserve();
    if (mode.startsWith('legacy-')) {
      const bytes = read(descriptorPath); let current; try { current = JSON.parse(bytes); } catch { fail('update_operator_original_descriptor'); }
      if (digest(bytes) !== expectedPreviousDescriptorHash || current.packageHash !== expectedCurrentPackageHash) fail('update_operator_original_descriptor');
      const inputs = { descriptorPath, id, expectedPreviousDescriptorHash, expectedPackageHash, reservedServer };
      if (mode === 'legacy-inspect') return await legacy.inspectLegacyPreparedRecovery(inputs);
      const certified = await legacy.finishLegacyPreparedRecovery({ ...inputs, expectedProofHash: options.expectedProofHash });
      const prepared = await update.createLegacyStoppedRecovery(certified);
      return await update.stageStoppedRecovery(prepared);
    }
    const installRoot = path.dirname(descriptorPath), directory = path.join(installRoot, 'transactions', id + '-stopped-update');
    let intent; try { intent = JSON.parse(read(path.join(directory, 'intent.json'), 64 * 1024 * 1024)).body; old = JSON.parse(Buffer.from(intent.oldDescriptor, 'base64')); } catch { fail('update_operator_original_descriptor'); }
    const oldBytes = Buffer.from(intent.oldDescriptor, 'base64');
    if (digest(oldBytes) !== expectedPreviousDescriptorHash || old.packageHash !== expectedCurrentPackageHash || old.installRoot !== installRoot || path.join(old.installRoot, 'installation.json') !== descriptorPath || !Buffer.from(canonical(old)).equals(oldBytes)) fail('update_operator_original_descriptor');
    if (path.resolve(process.execPath).toLowerCase() !== old.nodePath.toLowerCase() || digest(read(old.nodePath, 512 * 1024 * 1024)) !== old.nodeHash) fail('external_node_mismatch');
    const inputs = { installation: old, descriptorPath, transactionId: id, expectedPreviousDescriptorHash, expectedPackageHash, reservedServer, expectedProofHash: options.expectedProofHash };
    if (mode === 'update-inspect') return await update.inspectStoppedUpdate(inputs);
    if (mode === 'update-finish') return await update.finishStoppedUpdate(inputs);
    if (mode === 'update-enable') return await update.enableStoppedUpdate(inputs);
    if (mode === 'enable-finish') return await update.finishEnableStoppedUpdate(inputs);
    fail('update_operator_mode');
  } catch (e) { if (lease) require('../runtime/install-lease').retainInstallLease(lease); throw e; }
  finally { if (server) { if (server.listening) await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }); else server.closeAllConnections(); } }
}
module.exports = { operate };

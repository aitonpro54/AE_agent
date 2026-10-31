'use strict';
// Loaded only behind the distribution verifier. Old installed modules are data.
const path = require('node:path'), http = require('node:http');
async function operate(capability) {
  const { mode, descriptor, id, expectedPackageHash, expectedProofHash } = require('./standalone-installer').assertMaintenanceBootstrap(capability);
  const d = require('./maintain-owner').verifyOwnerInstallation(descriptor, expectedPackageHash);
  if (d.releaseDir === path.resolve(__dirname, '..')) throw Object.assign(Error('maintenance_distribution_separate'), { code: 'maintenance_distribution_separate' });
  // This is the NEW reviewed verifier, which checks the old installation bytes
  // without executing any of its source modules.
  const { canonical } = require('../protocol/json');
  const verified = require('../runtime/stdio-entry').verifyInstallation(descriptor);
  if (canonical(d) !== canonical(verified)) throw Object.assign(Error('maintenance_installation_changed'), { code: 'maintenance_installation_changed' });
  const maintenance = require('../runtime/owner-maintenance');
  const options = { installation: d, descriptorPath: descriptor, id };
  if (mode === 'maintenance-inspect') return maintenance.inspectMaintenanceFinish(options);
  if (!['maintenance-finish', 'stopped-inspect', 'stopped-certify'].includes(mode)) throw Object.assign(Error('maintenance_command'), { code: 'maintenance_command' });
  const server = http.createServer();
  try {
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(3457, '127.0.0.1', () => { server.removeListener('error', reject); resolve(); }); });
    if (mode === 'maintenance-finish') return await maintenance.finishMaintenance({ ...options, expectedProofHash, reservedServer: server });
    const certification = require('../runtime/stopped-certification');
    if (mode === 'stopped-inspect') return await certification.inspectStoppedCertification({ ...options, reservedServer: server });
    const certificate = await certification.certifyStoppedInstallation({ ...options, expectedProofHash, reservedServer: server });
    const facts = certification.assertStoppedCertificate(certificate, options);
    return { certified: true, id, certificateHash: facts.certificateHash, stopped: true, runtimeStarted: false, aeAuthority: false };
  } finally {
    // Election only: no request handler or execution lane. Do not let a request
    // that arrived during CIM inspection keep the operator/port alive.
    if (server.listening) await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
    else server.closeAllConnections();
  }
}
module.exports = { operate };

'use strict';
// Only the verified same-package manual/owner distribution calls this helper.
// Installed source is data; no startup, process control, AE dispatch or CLI here.
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), crypto = require('node:crypto');
function fail(code) { throw Object.assign(Error(code), { code }); }
function witnessSnapshot(file, expectedHash) {
  function plain() {
    if (!path.isAbsolute(file) || path.resolve(file) !== file) fail('readoption_witness_path');
    let cursor = path.parse(file).root; const parts = file.slice(cursor.length).split(path.sep).filter(Boolean);
    for (const [i, part] of parts.entries()) { cursor = path.join(cursor, part); const s = fs.lstatSync(cursor); if (s.isSymbolicLink() || s.reparsePoint || fs.realpathSync(cursor) !== cursor || (i < parts.length - 1 ? !s.isDirectory() : !s.isFile())) fail('readoption_witness_path'); }
  }
  const fields = ['dev', 'ino', 'mode', 'nlink', 'size', 'birthtimeNs', 'mtimeNs', 'ctimeNs'], same = (a, b) => fields.every(k => a[k] === b[k]);
  plain(); const named = fs.lstatSync(file, { bigint: true }), fd = fs.openSync(file, 'r'); let bytes;
  try {
    const held = fs.fstatSync(fd, { bigint: true }); if (!held.isFile() || !same(named, held)) fail('readoption_witness_changed');
    if (held.size < 1n || held.size > 16384n) fail('readoption_witness_budget');
    bytes = Buffer.alloc(Number(held.size)); let offset = 0;
    while (offset < bytes.length) { const count = fs.readSync(fd, bytes, offset, bytes.length - offset, offset); if (!count) fail('readoption_witness_changed'); offset += count; }
    plain(); if (fs.readSync(fd, Buffer.alloc(1), 0, 1, offset) || !same(held, fs.fstatSync(fd, { bigint: true })) || !same(held, fs.lstatSync(file, { bigint: true }))) fail('readoption_witness_changed');
  } finally { fs.closeSync(fd); }
  if (!Buffer.from(bytes.toString('utf8'), 'utf8').equals(bytes)) fail('readoption_witness_utf8');
  if (crypto.createHash('sha256').update(bytes).digest('hex') !== expectedHash) fail('readoption_witness_pin');
  return Buffer.from(bytes); // Owned byte snapshot; the private library copies it.
}
async function operate(capability) {
  const options = require('./standalone-installer').assertReadoptionBootstrap(capability);
  const { mode, descriptorPath, id, expectedCurrentPackageHash, expectedProofHash } = options;
  const installation = require('./maintain-owner').verifyOwnerInstallation(descriptorPath, expectedCurrentPackageHash);
  if (installation.releaseDir === path.resolve(__dirname, '..')) fail('readoption_distribution_separate');
  const witness = mode === 'readopt-apply' ? witnessSnapshot(options.witnessPath, options.expectedWitnessHash) : null;
  const { canonical } = require('../protocol/json');
  const verified = require('../runtime/stdio-entry').verifyInstallation(descriptorPath);
  if (canonical(installation) !== canonical(verified)) fail('readoption_installation_changed');
  const server = http.createServer();
  try {
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(3457, '127.0.0.1', () => { server.removeListener('error', reject); resolve(); }); });
    // Constant imports from this exact distribution, never installation paths.
    const api = require('./stopped-host-readoption'), common = { installation, descriptorPath, id, reservedServer: server };
    if (mode === 'readopt-inspect') return await api.inspectStoppedReadoption(Object.freeze(common));
    const action = Object.freeze({ ...common, expectedProofHash });
    if (mode === 'readopt-apply') return await api.applyStoppedReadoption(Object.freeze({ ...action, witness }));
    if (mode === 'readopt-finish') return await api.finishStoppedReadoption(action);
    if (mode === 'readopt-enable') return await api.enableStoppedReadoption(action);
    if (mode === 'readopt-enable-finish') return await api.finishEnableStoppedReadoption(action);
    fail('readoption_operator_mode');
  } finally {
    if (server.listening) await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
    else server.closeAllConnections();
  }
}
module.exports = { operate };

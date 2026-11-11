'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const os = require('node:os');

// Operator bootstrap is builtin-only until the exact installed release and
// external Node are checked. No launch, termination, AE or credential output.
function fail(code) { throw Object.assign(new Error(code), { code }); }
function canonical(value) {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (!value || Object.getPrototypeOf(value) !== Object.prototype) fail('owner_installation_json');
  return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
}
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
function plain(file, directory = false) {
  if (!path.isAbsolute(file) || path.resolve(file) !== file) fail('owner_installation_path');
  let cursor = path.parse(file).root; const parts = file.slice(cursor.length).split(path.sep).filter(Boolean);
  for (const [index, part] of parts.entries()) { cursor = path.join(cursor, part); const stat = fs.lstatSync(cursor); if (stat.isSymbolicLink() || stat.reparsePoint || fs.realpathSync(cursor) !== cursor || (index < parts.length - 1 || directory ? !stat.isDirectory() : !stat.isFile())) fail('owner_installation_path'); }
}
function read(file, limit = 8 * 1024 * 1024) {
  plain(file); const named = fs.lstatSync(file, { bigint: true }), fd = fs.openSync(file, 'r'), fields = ['dev', 'ino', 'size', 'birthtimeNs', 'mtimeNs', 'ctimeNs'];
  const same = (a, b) => fields.every(k => String(a[k]) === String(b[k]));
  try {
    const stat = fs.fstatSync(fd, { bigint: true }); if (!stat.isFile() || stat.size > BigInt(limit) || !same(named, stat)) fail('owner_installation_budget');
    const bytes = Buffer.alloc(Number(stat.size)); let at = 0;
    while (at < bytes.length) { const n = fs.readSync(fd, bytes, at, bytes.length - at, at); if (!n) fail('owner_installation_changed'); at += n; }
    if (fs.readSync(fd, Buffer.alloc(1), 0, 1, at) || !same(stat, fs.fstatSync(fd, { bigint: true }))) fail('owner_installation_changed');
    plain(file); if (!same(stat, fs.lstatSync(file, { bigint: true }))) fail('owner_installation_changed'); return bytes;
  } finally { fs.closeSync(fd); }
}
function verifyOwnerInstallation(descriptor, expectedPackageHash) {
  if (!/^[a-f0-9]{64}$/.test(expectedPackageHash || '')) fail('maintenance_package_pin_required');
  plain(descriptor);
  const d = JSON.parse(read(descriptor, 16384));
  if (d.machineId !== os.hostname()) fail('maintenance_machine');
  if (![1, 2].includes(d.version) || !path.isAbsolute(d.installRoot) || descriptor !== path.join(d.installRoot, 'installation.json') ||
      !/^[a-f0-9]{64}$/.test(d.packageHash) || d.releaseDir !== path.join(d.installRoot, 'releases', d.packageHash) ||
      !path.isAbsolute(d.nodePath) || !/^[a-f0-9]{64}$/.test(d.nodeHash)) fail('owner_installation_descriptor');
  if (d.packageHash !== expectedPackageHash) fail('maintenance_package_pin_changed');
  if (path.resolve(process.execPath).toLowerCase() !== path.resolve(d.nodePath).toLowerCase() ||
      hash(read(d.nodePath, 512 * 1024 * 1024)) !== d.nodeHash || Number(process.versions.node.split('.')[0]) < 20) fail('external_node_mismatch');
  plain(d.releaseDir, true);

  const manifestFile = path.join(d.releaseDir, 'release.json'); plain(manifestFile);
  const manifestBytes = read(manifestFile, 1024 * 1024), release = JSON.parse(manifestBytes);
  if (canonical(release) !== manifestBytes.toString('utf8') || hash(manifestBytes) !== d.packageHash || (release.version !== '4.0.0' && !(['4.1.0', '4.1.1', '4.1.2', '4.2.1', '4.2.2', '4.2.3', '4.2.4', '4.2.5'].includes(release.version) && release.format === 2)) ||
      ![1, 2].includes(release.format) || Object.keys(release).sort().join(',') !== 'format,hashes,version' ||
      !release.hashes || Object.getPrototypeOf(release.hashes) !== Object.prototype ||
      !Object.hasOwn(release.hashes, 'runtime/owner-entry.js') || !Object.hasOwn(release.hashes, 'runtime/stdio-entry.js')) fail('owner_release_schema');
  const files = new Set(['release.json']), dirs = new Set(['']);
  for (const [relative, digest] of Object.entries(release.hashes)) {
    if (!/^[A-Za-z0-9_./-]+$/.test(relative) || relative.includes('\\') || relative.split('/').some(p => !p || p === '.' || p === '..') ||
        path.isAbsolute(relative) || relative === 'release.json' || !/^[a-f0-9]{64}$/.test(digest)) fail('owner_release_path');
    files.add(relative);
    for (let dir = path.posix.dirname(relative); dir !== '.'; dir = path.posix.dirname(dir)) dirs.add(dir);
  }
  function visit(directory, relative) {
    plain(directory, true); if (!dirs.delete(relative)) fail('release_tree_mismatch');
    for (const name of fs.readdirSync(directory)) {
      const file = path.join(directory, name), rel = relative ? relative + '/' + name : name;
      const stat = fs.lstatSync(file); plain(file, stat.isDirectory());
      if (stat.isDirectory()) visit(file, rel);
      else if (!files.delete(rel) || (rel === 'release.json' ? !read(file).equals(manifestBytes) : hash(read(file)) !== release.hashes[rel])) fail('installed_release_bytes');
    }
  }
  visit(d.releaseDir, ''); if (files.size || dirs.size) fail('release_tree_mismatch');
  return Object.freeze(d);
}
async function operate({ command, descriptor, id, expectedProofHash, expectedPackageHash }) {
  if (!['stop', 'inspect', 'resume'].includes(command) || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(id || '')) fail('maintenance_options');
  const d = verifyOwnerInstallation(descriptor, expectedPackageHash);
  // The first non-builtin imports are from the fully verified current release.
  const verified = require(path.join(d.releaseDir, 'runtime/stdio-entry.js')).verifyInstallation(descriptor);
  if (canonical(verified) !== canonical(d)) fail('maintenance_installation_changed');
  const maintenance = require(path.join(d.releaseDir, 'runtime/owner-maintenance.js'));
  if (command === 'inspect') return maintenance.inspectMaintenance({ installation: d, descriptorPath: descriptor, id });
  if (command === 'stop') {
    const { createIpcClient } = require(path.join(d.releaseDir, 'runtime/client-ipc.js'));
    const { ownerEndpoint } = require(path.join(d.releaseDir, 'runtime/client-entry.js'));
    const client = await createIpcClient({ endpoint: ownerEndpoint(d), identity: { installationId: d.installationId, machineId: d.machineId, packageHash: d.packageHash }, secret: d.controlToken, timeoutMs: 5000 });
    try {
      const status = await client.call('core_status', {}); if (!status?.ok || !status.value?.lifecycle) fail('maintenance_owner_unobserved');
      const s = status.value.lifecycle, scope = { bootId: s.processBootId, pid: s.pid, birthTicks: s.birthTicks };
      const proof = maintenance.createStopAuthorization({ installation: d, descriptorPath: descriptor, scope, id });
      const response = await client.call('maintenance_stop', proof);
      if (!response?.ok) fail(['maintenance_persist_failed', 'render_job_maintenance_unsettled',
        'render_job_maintenance_unverifiable', 'render_job_maintenance_toolchain_changed'].includes(response?.code) ? response.code : 'maintenance_refused');
      return { accepted: true, id: response.value.id, phase: response.value.phase, automaticReplay: false, aeAuthority: false };
    } finally { client.close(); }
  }
  if (command !== 'resume') fail('maintenance_command');
  const server = require('node:http').createServer();
  try {
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(3457, '127.0.0.1', () => { server.removeListener('error', reject); resolve(); }); });
    return await maintenance.resumeMaintenance({ installation: d, descriptorPath: descriptor, id, expectedProofHash, reservedServer: server });
  } finally {
    // This listener only elects the stopped operator; it has no execution lane.
    // An unsolicited CEP request must never hold the maintenance port open.
    if (server.listening) await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
    else server.closeAllConnections();
  }
}
if (require.main === module) {
  const args = process.argv.slice(2), allowed = ['--installation', '--operation', '--expected-package-hash', '--expected-proof-hash'], get = key => args[args.indexOf(key) + 1];
  const flags = args.slice(1).filter((_, index) => index % 2 === 0);
  if (!['stop', 'inspect', 'resume'].includes(args[0]) || args.length % 2 !== 1 || new Set(flags).size !== flags.length || flags.some(k => !allowed.includes(k)) || !flags.includes('--installation') || !flags.includes('--operation') || !flags.includes('--expected-package-hash') || args[0] === 'resume' && !flags.includes('--expected-proof-hash')) {
    process.stderr.write('maintain-owner stop|inspect|resume --installation ABS_DESCRIPTOR --operation UUID --expected-package-hash SHA256 [--expected-proof-hash SHA256]\n'); process.exitCode = 2;
  } else operate({ command: args[0], descriptor: get('--installation'), id: get('--operation'), expectedPackageHash: get('--expected-package-hash'), ...(flags.includes('--expected-proof-hash') ? { expectedProofHash: get('--expected-proof-hash') } : {}) })
    .then(result => process.stdout.write(canonical(result) + '\n')).catch(error => { const code = /^[a-z][a-z0-9_]{0,80}$/.test(error.code || '') ? error.code : 'maintenance_failed'; process.stderr.write(canonical({ error: code, automaticReplay: false, aeAuthority: false }) + '\n'); process.exitCode = 1; });
}
module.exports = { operate, verifyOwnerInstallation };

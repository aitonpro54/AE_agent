'use strict';
// Bootstrap is builtin-only until the entire installed client release is read
// back. The thin client never reads installation.json, panelToken or AE state.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const KEYS = ['version', 'role', 'installationId', 'machineId', 'installRoot', 'releaseDir', 'packageHash', 'nodePath', 'nodeHash', 'controlToken', 'originHash', 'ownerEndpoint'];
function fail(code) { throw Object.assign(new Error(code), { code }); }
function canonical(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (!value || Object.getPrototypeOf(value) !== Object.prototype) fail('client_json');
  return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
}
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const hex = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const id = value => typeof value === 'string' && /^[A-Za-z0-9._:-]{1,128}$/.test(value);
function plain(file, directory = false) {
  if (!path.isAbsolute(file) || path.resolve(file) !== file) fail('client_path');
  let cursor = path.parse(file).root;
  const parts = file.slice(cursor.length).split(path.sep).filter(Boolean);
  for (let n = 0; n < parts.length; n++) {
    cursor = path.join(cursor, parts[n]); const stat = fs.lstatSync(cursor);
    if (stat.isSymbolicLink() || stat.reparsePoint || fs.realpathSync(cursor) !== cursor || (n < parts.length - 1 || directory ? !stat.isDirectory() : !stat.isFile())) fail('client_path');
  }
}
function read(file, limit) {
  plain(file); const named = fs.lstatSync(file), fd = fs.openSync(file, 'r');
  try {
    const stat = fs.fstatSync(fd);
    if (!named.isFile() || !stat.isFile() || named.dev !== stat.dev || named.ino !== stat.ino) fail('client_path');
    if (!Number.isSafeInteger(stat.size) || stat.size < 1 || stat.size > limit) fail('client_file_budget');
    const bytes = Buffer.alloc(stat.size); let offset = 0;
    while (offset < bytes.length) { const count = fs.readSync(fd, bytes, offset, bytes.length - offset, offset); if (!count) fail('client_file_changed'); offset += count; }
    const extra = fs.readSync(fd, Buffer.alloc(1), 0, 1, offset), after = fs.fstatSync(fd);
    if (extra || ['dev', 'ino', 'size', 'mtimeMs', 'ctimeMs'].some(key => after[key] !== stat[key])) fail('client_file_changed');
    let final;
    try { plain(file); final = fs.lstatSync(file); } catch { fail('client_file_changed'); }
    if (!final.isFile() || ['dev', 'ino', 'size', 'mtimeMs', 'ctimeMs'].some(key => final[key] !== after[key])) fail('client_file_changed');
    return bytes;
  } finally { fs.closeSync(fd); }
}
function ownerEndpoint({ installationId, machineId }) {
  if (!id(installationId) || !id(machineId)) fail('client_identity');
  return '\\\\.\\pipe\\ae-core4-owner-' + hash(JSON.stringify({ installationId, machineId })).slice(0, 32);
}
function projectClientDescriptor(installation, options = {}) {
  // Role projection for a verified installer/owner embedding. It does not
  // issue credentials, create files or make a caller-supplied installation safe.
  const { installationId, machineId, installRoot, releaseDir, packageHash, nodePath, nodeHash, controlToken } = installation;
  if (!id(installationId) || !id(machineId) || !hex(packageHash) || !hex(nodeHash) || !hex(controlToken) || !path.isAbsolute(installRoot) || path.resolve(installRoot) !== installRoot || releaseDir !== path.join(installRoot, 'releases', packageHash) || !path.isAbsolute(nodePath) || path.resolve(nodePath) !== nodePath) fail('client_descriptor');
  if (!options || Object.getPrototypeOf(options) !== Object.prototype || Object.keys(options).some(key => key !== 'originBytes')) fail('client_projection_options');
  const originBytes = Object.hasOwn(options, 'originBytes') ? options.originBytes : read(path.join(installRoot, 'origin.json'), 8192);
  if (!Buffer.isBuffer(originBytes) || originBytes.length < 1 || originBytes.length > 8192 || !Buffer.from(originBytes.toString('utf8')).equals(originBytes)) fail('client_origin');
  let origin; try { origin = JSON.parse(originBytes.toString('utf8')); } catch { fail('client_origin'); }
  if (origin?.installationId !== installationId || origin?.machineId !== machineId) fail('client_origin');
  const descriptor = { version: 1, role: 'core4-control-client', installationId, machineId, installRoot, releaseDir, packageHash, nodePath, nodeHash, controlToken,
    originHash: hash(originBytes), ownerEndpoint: ownerEndpoint({ installationId, machineId }) };
  if (Buffer.byteLength(canonical(descriptor)) > 16384) fail('client_file_budget');
  return Object.freeze(descriptor);
}
function verifyClientDescriptor(file) {
  const bytes = read(file, 16384); let descriptor;
  try { descriptor = JSON.parse(bytes.toString('utf8')); } catch { fail('client_descriptor'); }
  const d = descriptor;
  if (!d || Object.getPrototypeOf(d) !== Object.prototype || Object.keys(d).length !== KEYS.length || KEYS.some(k => !Object.hasOwn(d, k)) || canonical(d) !== bytes.toString('utf8') || d.version !== 1 || d.role !== 'core4-control-client' || !id(d.installationId) || !id(d.machineId) || !hex(d.packageHash) || !hex(d.nodeHash) || !hex(d.controlToken) || !hex(d.originHash)) fail('client_descriptor');
  if (!path.isAbsolute(d.installRoot) || file !== path.join(d.installRoot, 'core-client.json') || d.releaseDir !== path.join(d.installRoot, 'releases', d.packageHash) || !path.isAbsolute(d.nodePath) || d.ownerEndpoint !== ownerEndpoint(d)) fail('client_descriptor_scope');
  plain(d.installRoot, true); plain(d.releaseDir, true);
  const originBytes = read(path.join(d.installRoot, 'origin.json'), 8192), origin = JSON.parse(originBytes.toString('utf8'));
  if (hash(originBytes) !== d.originHash || origin.installationId !== d.installationId || origin.machineId !== d.machineId) fail('client_origin');
  if (path.resolve(process.execPath).toLowerCase() !== path.resolve(d.nodePath).toLowerCase() || Number(process.versions.node.split('.')[0]) < 20 || hash(read(d.nodePath, 512 * 1024 * 1024)) !== d.nodeHash) fail('client_node');
  const manifestBytes = read(path.join(d.releaseDir, 'release.json'), 1024 * 1024), manifest = JSON.parse(manifestBytes.toString('utf8'));
  if (hash(manifestBytes) !== d.packageHash || canonical(manifest) !== manifestBytes.toString('utf8') || Object.keys(manifest).sort().join(',') !== 'format,hashes,version' || !['4.2.2', '4.2.3'].includes(manifest.version) || manifest.format !== 2 || !manifest.hashes || Object.getPrototypeOf(manifest.hashes) !== Object.prototype) fail('client_release');
  const files = new Set(['release.json']), dirs = new Set(['']); let total = 0;
  const entries = Object.entries(manifest.hashes);
  if (entries.length < 1 || entries.length > 1024 || !Object.hasOwn(manifest.hashes, 'runtime/client-entry.js')) fail('client_release');
  for (const [relative, digest] of entries) {
    if (!/^[A-Za-z0-9_./-]+$/.test(relative) || relative.split('/').some(v => !v || v === '.' || v === '..') || path.isAbsolute(relative) || relative === 'release.json' || !hex(digest)) fail('client_release_path');
    files.add(relative); for (let parent = path.posix.dirname(relative); parent !== '.'; parent = path.posix.dirname(parent)) dirs.add(parent);
  }
  function visit(directory, relative) {
    plain(directory, true); if (!dirs.delete(relative)) fail('client_release_tree');
    for (const name of fs.readdirSync(directory)) {
      const full = path.join(directory, name), rel = relative ? relative + '/' + name : name, stat = fs.lstatSync(full);
      if (stat.isDirectory()) visit(full, rel);
      else {
        if (!files.delete(rel)) fail('client_release_tree');
        const value = read(full, 4 * 1024 * 1024); total += value.length;
        if (total > 32 * 1024 * 1024 || (rel === 'release.json' ? !value.equals(manifestBytes) : hash(value) !== manifest.hashes[rel])) fail('client_release_bytes');
      }
    }
  }
  visit(d.releaseDir, ''); if (files.size || dirs.size) fail('client_release_tree');
  return Object.freeze(d);
}
async function startClient({ descriptor, input = process.stdin, output = process.stdout } = {}) {
  const d = verifyClientDescriptor(descriptor);
  if (fs.realpathSync(path.resolve(__dirname, '..')) !== fs.realpathSync(d.releaseDir)) fail('client_entry_root');
  // All non-builtin imports are below full release and exact-entry verification.
  const { createIpcClient, isPreSendClosed } = require('./client-ipc');
  const { serveAttachment } = require('./client-stdio');
  const { spawn } = require('node:child_process');
  const lifetime = new AbortController();
  let linked = null, connecting = null, closed = false, launchAttempted = false;
  const preSpawnStops = new WeakSet();
  const absent = error => error?.code === 'ipc_endpoint_absent' && error.phase === 'preconnect' && ['ENOENT', 'ECONNREFUSED'].includes(error.reason);
  const unavailable = () => fail('owner_unavailable');
  function stopped() {
    // This role cannot verify the full-role maintenance seal. Observed presence
    // only denies launch; it never asserts a valid stop/death/maintenance grant.
    for (const dir of [path.join(d.installRoot, 'state'), path.join(d.installRoot, 'state/production')]) {
      try { plain(dir, true); } catch (e) { if (e.code === 'ENOENT') return false; throw e; }
    }
    // In the admitted v4 cluster this only routes bootstrap to the verified
    // read-only reset driver. Presence cannot authorize stores or a new session;
    // the full-role entry validates even malformed/partial reset state first.
    try { fs.lstatSync(path.join(d.installRoot, 'state/production/runtime-start-over.json')); return false; }
    catch (e) { if (e.code !== 'ENOENT') throw e; }
    try { fs.lstatSync(path.join(d.installRoot, 'state/production/runtime-maintenance.json')); return true; }
    catch (e) { if (e.code === 'ENOENT') return false; throw e; }
  }
  function refuseStopped() { const error = Object.assign(new Error('owner_desired_stopped'), { code: 'owner_desired_stopped' }); preSpawnStops.add(error); throw error; }
  function attach(handshakeMs) {
    if (closed) unavailable();
    return createIpcClient({ endpoint: d.ownerEndpoint, identity: { installationId: d.installationId, machineId: d.machineId, packageHash: d.packageHash },
      secret: d.controlToken, timeoutMs: 120000, signal: lifetime.signal, ...(handshakeMs ? { limits: { handshakeMs } } : {}) });
  }
  async function launch() {
    // Let an already queued stdio EOF revoke bootstrap before verification/spawn.
    await new Promise(resolve => setImmediate(resolve));
    if (closed) unavailable();
    if (stopped()) refuseStopped();
    const fresh = verifyClientDescriptor(descriptor);
    if (canonical(fresh) !== canonical(d)) fail('client_descriptor_changed');
    if (fs.realpathSync(path.resolve(__dirname, '..')) !== fs.realpathSync(fresh.releaseDir)) fail('client_entry_root_changed');
    const manifestBytes = read(path.join(d.releaseDir, 'release.json'), 1024 * 1024), manifest = JSON.parse(manifestBytes);
    const ownerFiles = ['runtime/owner-entry.js', 'runtime/client-entry.js', 'runtime/client-ipc.js', 'runtime/client-stdio.js', 'runtime/controller-lease.js', 'runtime/attachment-owner.js', 'runtime/owner-lifecycle.js', 'runtime/recovery-inspection.js', 'runtime/windows-owner-process.js', 'runtime/owner-maintenance.js', 'runtime/start-over-inspection.js', 'runtime/start-over-process.js', 'runtime/start-over-state.js', 'runtime/start-over-barrier.js', 'runtime/start-over-archive.js', 'runtime/start-over-finisher.js', 'runtime/work-session.js', 'runtime/start-over-panel-control.js', 'runtime/start-over-driver.js', 'runtime/owner-launch.js'];
    const contractBytes = read(path.join(d.releaseDir, 'runtime/owner-contract.json'), 8192);
    const expected = { version: 4, runtimeModel: 'owner', clientEntry: 'runtime/client-entry.js', clientArgument: '--client-descriptor',
      ownerEntry: 'runtime/owner-entry.js', ownerArgument: '--installation', clientDescriptorFile: 'core-client.json', requiredFiles: ownerFiles };
    if (hash(manifestBytes) !== d.packageHash || hash(contractBytes) !== manifest.hashes['runtime/owner-contract.json'] ||
        canonical(JSON.parse(contractBytes)) !== canonical(expected) || ownerFiles.some(file => !hex(manifest.hashes[file]))) fail('client_owner_contract');
    const entry = path.join(d.releaseDir, 'runtime/owner-entry.js'), installation = path.join(d.installRoot, 'installation.json');
    plain(entry); plain(installation);
    const env = Object.create(null);
    // Windows process creation may restore omitted OS/user variables; Node also
    // propagates NODE_V8_COVERAGE. Explicit empties prevent value inheritance.
    for (const key of ['PATH', 'HOMEDRIVE', 'HOMEPATH', 'LOGONSERVER', 'SYSTEMDRIVE', 'USERDOMAIN', 'USERNAME', 'USERPROFILE', 'NODE_V8_COVERAGE']) env[key] = '';
    for (const key of ['SystemRoot', 'WINDIR', 'TEMP', 'TMP']) {
      const value = process.env[key]; if (typeof value === 'string' && path.isAbsolute(value) && !value.includes('\0')) env[key] = value;
    }
    // EOF/config rotation queued during the synchronous hash pass must run
    // before spawn. Finish with a bounded descriptor CAS, not another hash pass.
    await new Promise(resolve => setImmediate(resolve));
    if (closed) unavailable();
    if (!read(descriptor, 16384).equals(Buffer.from(canonical(d)))) fail('client_descriptor_changed');
    plain(d.releaseDir, true);
    if (stopped()) refuseStopped();
    if (closed) unavailable();
    await new Promise((resolve, reject) => {
      let child;
      try { child = spawn(d.nodePath, [entry, '--installation', installation], { shell: false, windowsHide: true, detached: true, stdio: 'ignore', cwd: d.releaseDir, env }); }
      catch { reject(Object.assign(new Error('owner_launch_failed'), { code: 'owner_launch_failed' })); return; }
      child.once('error', () => reject(Object.assign(new Error('owner_launch_failed'), { code: 'owner_launch_failed' })));
      child.once('spawn', () => { try { child.unref(); resolve(); } catch { reject(Object.assign(new Error('owner_launch_failed'), { code: 'owner_launch_failed' })); } });
    });
  }
  function pause(ms) {
    return new Promise(resolve => {
      const done = () => { clearTimeout(timer); lifetime.signal.removeEventListener('abort', done); resolve(); };
      const timer = setTimeout(done, ms);
      lifetime.signal.addEventListener('abort', done, { once: true }); if (closed) done();
    });
  }
  async function connect() {
    try { return await attach(); }
    catch (error) {
      if (!absent(error) || closed || launchAttempted) throw error;
      if (stopped()) refuseStopped();
      launchAttempted = true;
      try { await launch(); }
      catch (failure) { if (preSpawnStops.has(failure)) launchAttempted = false; throw failure; }
      // Installation and history checks can keep the pipe absent past 15s on
      // Windows. Wait within the normal MCP tool budget after one guarded launch.
      const deadline = performance.now() + 45000;
      while (!closed) {
        const remaining = Math.ceil(deadline - performance.now()); if (remaining < 1) unavailable();
        try { return await attach(Math.min(3000, remaining)); }
        catch (next) { if (!absent(next)) throw next; }
        await pause(Math.min(100, Math.max(1, deadline - performance.now())));
      }
      unavailable();
    }
  }
  const client = {
    async call(method, payload) {
      // A fresh attachment may serve this same request only with private proof
      // that the old call never reached send. It never transfers lease state.
      for (let attachment = 0; attachment < 2; attachment++) {
        if (closed) fail('owner_unavailable');
        if (!linked) {
          if (!connecting) connecting = connect();
          const attempt = connecting;
          try { linked = await attempt; launchAttempted = false; }
          catch { return method === 'owner_status' ? { ok: true, value: { available: false, reason: 'owner_connection_unavailable', coverage: 'unobserved' } } : { ok: false, code: 'owner_unavailable' }; }
          finally { if (connecting === attempt) connecting = null; }
        }
        if (closed) { linked.close(); linked = null; fail('owner_unavailable'); }
        const connection = linked;
        try { return await connection.call(method, payload); }
        catch (error) {
          if (error?.code === 'ipc_outcome_uncertain' || error?.code === 'ipc_closed') {
            connection.close(); if (linked === connection) linked = null;
          }
          if (attachment === 0 && !closed && typeof isPreSendClosed === 'function' && isPreSendClosed(error)) continue;
          throw error;
        }
      }
    },
    close() { closed = true; lifetime.abort(); if (linked) linked.close(); linked = null; }
  };
  // Initialize/tools-list remain available without an owner. A failed accepted
  // call is never resent. Only a privately proven pre-send idle closure permits
  // one fresh attachment within a request; other losses need explicit requests.
  try {
    const release = read(path.join(d.releaseDir, 'release.json'), 1024 * 1024);
    if (hash(release) !== d.packageHash) fail('client_release');
    const manifest = JSON.parse(release);
    if (!hex(manifest.hashes['runtime/stdio-entry.js'])) fail('client_release');
    const { deriveComposition } = require('./stdio-entry.js');
    const renderJobs = deriveComposition(manifest, file => read(path.join(d.releaseDir, file), 4 * 1024 * 1024)).renderJobs === true;
    return serveAttachment({ client, input, output, ...(renderJobs ? { renderJobs: true } : {}) });
  } catch (error) { client.close(); throw error; }
}
module.exports = { ownerEndpoint, projectClientDescriptor, verifyClientDescriptor, startClient };
if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== '--client-descriptor') { process.stderr.write('Explicit --client-descriptor ABSOLUTE_PATH required.\n'); process.exitCode = 2; }
  else startClient({ descriptor: args[1] }).catch(error => { process.stderr.write((error.code || 'client_start_failed') + '\n'); process.exitCode = 1; });
}

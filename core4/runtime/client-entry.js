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
function read(file, limit) { plain(file); const stat = fs.statSync(file); if (stat.size < 1 || stat.size > limit) fail('client_file_budget'); const bytes = fs.readFileSync(file); if (bytes.length !== stat.size) fail('client_file_changed'); return bytes; }
function ownerEndpoint({ installationId, machineId }) {
  if (!id(installationId) || !id(machineId)) fail('client_identity');
  return '\\\\.\\pipe\\ae-core4-owner-' + hash(JSON.stringify({ installationId, machineId })).slice(0, 32);
}
function projectClientDescriptor(installation) {
  // Role projection for a verified installer/owner embedding. It does not
  // issue credentials, create files or make a caller-supplied installation safe.
  const { installationId, machineId, installRoot, releaseDir, packageHash, nodePath, nodeHash, controlToken } = installation;
  if (!id(installationId) || !id(machineId) || !hex(packageHash) || !hex(nodeHash) || !hex(controlToken) || !path.isAbsolute(installRoot) || releaseDir !== path.join(installRoot, 'releases', packageHash) || !path.isAbsolute(nodePath)) fail('client_descriptor');
  return Object.freeze({ version: 1, role: 'core4-control-client', installationId, machineId, installRoot, releaseDir, packageHash, nodePath, nodeHash, controlToken,
    originHash: hash(read(path.join(installRoot, 'origin.json'), 8192)), ownerEndpoint: ownerEndpoint({ installationId, machineId }) });
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
  if (hash(manifestBytes) !== d.packageHash || canonical(manifest) !== manifestBytes.toString('utf8') || Object.keys(manifest).sort().join(',') !== 'format,hashes,version' || manifest.version !== '4.0.0' || manifest.format !== 2 || !manifest.hashes || Object.getPrototypeOf(manifest.hashes) !== Object.prototype) fail('client_release');
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
  const { createIpcClient } = require('./client-ipc');
  const { serveAttachment } = require('./client-stdio');
  let linked = null, connecting = null, closed = false;
  const client = {
    async call(method, payload) {
      if (closed) fail('owner_unavailable');
      if (!linked) {
        if (!connecting) connecting = createIpcClient({ endpoint: d.ownerEndpoint, identity: { installationId: d.installationId, machineId: d.machineId, packageHash: d.packageHash }, secret: d.controlToken, timeoutMs: 120000 });
        const attempt = connecting;
        try { linked = await attempt; }
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
        throw error;
      }
    },
    close() { closed = true; if (linked) linked.close(); linked = null; }
  };
  // Initialize/tools-list remain available without an owner. A failed accepted
  // call is never resent; a later explicit request may make a fresh attachment.
  try { return serveAttachment({ client, input, output }); } catch (error) { client.close(); throw error; }
}
module.exports = { ownerEndpoint, projectClientDescriptor, verifyClientDescriptor, startClient };
if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== '--client-descriptor') { process.stderr.write('Explicit --client-descriptor ABSOLUTE_PATH required.\n'); process.exitCode = 2; }
  else startClient({ descriptor: args[1] }).catch(error => { process.stderr.write((error.code || 'client_start_failed') + '\n'); process.exitCode = 1; });
}

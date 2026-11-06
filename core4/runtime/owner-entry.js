'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

// Bootstrap is builtin-only until the complete exact installed release, this
// entry and external Node have been checked. stdio-entry performs the full
// descriptor/origin/CEP verification again under its existing install gate.
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
  const stat = fs.lstatSync(file);
  if (stat.isSymbolicLink() || stat.reparsePoint || fs.realpathSync(file) !== file || (directory ? !stat.isDirectory() : !stat.isFile())) fail('owner_installation_path');
}
function verifyOwnerInstallation(descriptor) {
  plain(descriptor);
  const d = JSON.parse(fs.readFileSync(descriptor, 'utf8'));
  if (![1, 2].includes(d.version) || !path.isAbsolute(d.installRoot) || descriptor !== path.join(d.installRoot, 'installation.json') ||
      !/^[a-f0-9]{64}$/.test(d.packageHash) || d.releaseDir !== path.join(d.installRoot, 'releases', d.packageHash) ||
      !path.isAbsolute(d.nodePath) || !/^[a-f0-9]{64}$/.test(d.nodeHash)) fail('owner_installation_descriptor');
  if (path.resolve(process.execPath).toLowerCase() !== path.resolve(d.nodePath).toLowerCase() ||
      hash(fs.readFileSync(d.nodePath)) !== d.nodeHash || Number(process.versions.node.split('.')[0]) < 20) fail('external_node_mismatch');
  plain(d.releaseDir, true);
  if (fs.realpathSync(path.resolve(__dirname, '..')) !== d.releaseDir) fail('installation_entry_root_mismatch');
  const manifestFile = path.join(d.releaseDir, 'release.json'); plain(manifestFile);
  const manifestBytes = fs.readFileSync(manifestFile), release = JSON.parse(manifestBytes);
  if (canonical(release) !== manifestBytes.toString('utf8') || hash(manifestBytes) !== d.packageHash || release.version !== '4.1.1' ||
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
      else if (!files.delete(rel) || (rel === 'release.json' ? !fs.readFileSync(file).equals(manifestBytes) : hash(fs.readFileSync(file)) !== release.hashes[rel])) fail('installed_release_bytes');
    }
  }
  visit(d.releaseDir, ''); if (files.size || dirs.size) fail('release_tree_mismatch');
  return Object.freeze(d);
}
async function startOwner({ descriptor, port } = {}) {
  verifyOwnerInstallation(descriptor);
  // This is the first trusted import. No caller-selected executable imports.
  const { start } = require('./stdio-entry.js');
  return start({ descriptor, ...(port === undefined ? {} : { port }), mode: 'owner' });
}
module.exports = { startOwner, verifyOwnerInstallation };
if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== '--installation') { process.stderr.write('Explicit --installation ABSOLUTE_DESCRIPTOR required.\n'); process.exitCode = 2; }
  else startOwner({ descriptor: args[1] }).then(runtime => {
    for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => {
      // Signals request durable desired-stop too; pending work is drained without
      // force exit. A failed/ambiguous stop keeps its fence and cannot mean resume.
      runtime.close().then(() => { process.exitCode = 0; }, e => { if (e.code !== 'owner_draining') process.exitCode = 1; process.stderr.write((e.code === 'owner_draining' ? e.code : 'owner_shutdown_failed') + '\n'); });
    });
  }).catch(e => { process.stderr.write((e.code || 'owner_start_failed') + '\n'); process.exitCode = 1; });
}

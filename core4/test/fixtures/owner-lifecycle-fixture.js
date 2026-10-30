'use strict';
// Explicit synthetic verifier/process observations for TEMP state-machine tests.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), os = require('node:os'), http = require('node:http'), Module = require('node:module'), crypto = require('node:crypto');
const { canonical } = require('../../protocol/json');
const { acquireStateLock } = require('../../core/state-lock');
const { openCompletionStore } = require('../../integrations/cep/completion-store');
const { classifyOwnerProcess } = require('../../runtime/windows-owner-process');
const filename = path.resolve(__dirname, '../../runtime/owner-lifecycle.js'), source = fs.readFileSync(filename, 'utf8');
function files(directory) {
  const result = {};
  function visit(dir) { for (const item of fs.readdirSync(dir, { withFileTypes: true })) { const full = path.join(dir, item.name); if (item.isDirectory()) visit(full); else result[path.relative(directory, full)] = fs.readFileSync(full).toString('base64'); } }
  visit(directory); return result;
}
async function fixture(t) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'core4-owner-lifecycle-')), root = path.join(base, 'AEAgentCore4'), state = path.join(root, 'state/production');
  fs.mkdirSync(state, { recursive: true }); fs.mkdirSync(path.join(root, 'transactions'));
  const d = { installRoot: root, stateDir: state, installationId: 'fixture-' + crypto.randomUUID(), machineId: os.hostname(), nodePath: process.execPath, panelToken: 'a'.repeat(64), controlToken: 'b'.repeat(64) };
  const origin = Buffer.from(canonical({ installationId: d.installationId, machineId: d.machineId }));
  fs.writeFileSync(path.join(root, 'origin.json'), origin); fs.writeFileSync(path.join(state, 'origin.json'), origin);
  const descriptorPath = path.join(root, 'installation.json'); fs.writeFileSync(descriptorPath, canonical(d));
  const tracked = new Set(), openFiles = new Map(), io = { ...fs, openSync(...args) { const fd = fs.openSync(...args); tracked.add(fd); openFiles.set(fd, String(args[0])); return fd; }, closeSync(fd) { tracked.delete(fd); openFiles.delete(fd); return fs.closeSync(fd); } };
  let birth = 638000000000000000n, server, probeFailure = false, probeCalls = 0;
  const f = { root, state, base, d, descriptorPath, io, tracked, openFiles, path: name => path.join(state, name), probeCount: () => probeCalls,
    snapshot() { return files(root); }, failProbe(value) { probeFailure = value; },
    load() {
      const mod = new Module(filename, module); mod.filename = filename; mod.paths = Module._nodeModulePaths(path.dirname(filename));
      mod.require = function (name) {
        if (name === 'node:fs') return io;
        if (name === './stdio-entry') return { verifyInstallation(file) { assert.equal(file, descriptorPath); return JSON.parse(fs.readFileSync(descriptorPath)); } };
        if (name === './windows-owner-process') return { classifyOwnerProcess, async observeOwnerProcess(pid) {
          probeCalls++; if (probeFailure === true || probeFailure === probeCalls) throw Object.assign(Error('owner_process_probe_unavailable'), { code: 'owner_process_probe_unavailable' });
          return Object.freeze({ version: 1, pid, status: 'present', birthTicks: String(birth), executablePath: process.execPath, observedAt: new Date().toISOString() });
        } };
        return require(name.startsWith('.') ? path.resolve(path.dirname(filename), name) : name);
      };
      mod._compile(source, filename); return mod.exports;
    },
    async create() { if (!server) { server = http.createServer(); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); } return f.load().createOwnerLifecycle({ installation: d, descriptorPath, reservedServer: server }); },
    stores(cap) {
      const lock = acquireStateLock(path.join(state, 'broker'), { token: cap.brokerToken }); assert.equal(lock.error, null);
      const store = openCompletionStore({ directory: path.join(state, 'receiver'), io, ownerToken: cap.receiverToken }); assert.equal(store.closed, false);
      return { lock, store };
    },
    async crash() { for (const fd of [...tracked]) { fs.closeSync(fd); tracked.delete(fd); openFiles.delete(fd); } if (server) { await new Promise(resolve => server.close(resolve)); server = null; } birth += 10n; },
    close(cap, stores) { cap.beginClose(); stores?.store.close(); stores?.lock.release(); cap.finishClose(); }
  };
  t.after(async () => { for (const fd of [...tracked]) { try { fs.closeSync(fd); } catch {} tracked.delete(fd); } if (server) await new Promise(resolve => server.close(resolve)); assert.equal(path.resolve(base), base); assert.ok(base.startsWith(path.join(os.tmpdir(), 'core4-owner-lifecycle-'))); fs.rmSync(base, { recursive: true, force: true }); });
  return f;
}

module.exports = { fixture };

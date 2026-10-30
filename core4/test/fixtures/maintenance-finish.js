'use strict';
// Synthetic verifier/process births only; real TEMP filesystem and HTTP port0.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), http = require('node:http'), Module = require('node:module');
const { canonical } = require('../../protocol/json');
const { fixture } = require('./owner-lifecycle-fixture');
const { classifyOwnerProcess } = require('../../runtime/windows-owner-process');
async function harness(t, diagnostic = false) {
  const f = await fixture(t); fs.writeFileSync(path.join(f.root, 'core-client.json'), canonical({ fixture: 'role-only-client' }));
  if (diagnostic) { fs.mkdirSync(f.path('receiver')); fs.writeFileSync(f.path('receiver/owner'), ''); }
  let cap = await f.create(), stores = diagnostic ? null : f.stores(cap); if (!diagnostic) cap.markReady(); cap.releaseStartup();
  let birth = BigInt(cap.state().birthTicks), pending = false, count = 0, freezes = 0, closes = 0, frozen = false, observeHook;
  const modules = new Map();
  function load(name) {
    const filename = path.resolve(__dirname, '../../runtime/' + name + '.js'); if (modules.has(name)) return modules.get(name).exports;
    const mod = new Module(filename, module); modules.set(name, mod); mod.filename = filename; mod.paths = Module._nodeModulePaths(path.dirname(filename));
    mod.require = target => {
      if (target === 'node:fs') return f.io;
      if (target === './owner-maintenance' || target === './install-lease') return load(target.slice(2));
      if (target === './stdio-entry') return { verifyInstallation(file) { assert.equal(file, f.descriptorPath); return JSON.parse(fs.readFileSync(file)); } };
      if (target === './windows-owner-process') return { classifyOwnerProcess, async observeOwnerProcess(pid) { if (observeHook) await observeHook(pid); return { version: 1, pid, status: 'present', birthTicks: String(birth), executablePath: process.execPath, observedAt: new Date().toISOString() }; } };
      return require(target.startsWith('.') ? path.resolve(path.dirname(filename), target) : target);
    };
    mod._compile(fs.readFileSync(filename, 'utf8'), filename); return mod.exports;
  }
  const api = load('owner-maintenance');
  function coordinator(extra = {}) { return api.createOwnerMaintenance({ installation: f.d, descriptorPath: f.descriptorPath, lifecycle: cap,
    freeze() { freezes++; frozen = true; }, activity: () => ({ pending }), accepted: () => count,
    async close() { closes++; f.close(cap, stores); }, intervalMs: 2, ...extra }); }
  let m = coordinator();
  const options = () => ({ installation: f.d, descriptorPath: f.descriptorPath });
  const scope = () => { const s = cap.state(); return { bootId: s.processBootId, pid: s.pid, birthTicks: s.birthTicks }; };
  const auth = (id = crypto.randomUUID(), override = {}) => api.createStopAuthorization({ ...options(), scope: { ...scope(), ...override }, id });
  let server;
  async function reserved() { if (!server) { server = http.createServer(); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); t.after(() => new Promise(resolve => server.close(resolve))); } return server; }
  return { f, api, get m() { return m; }, coordinator, auth, scope, options, reserved, get stores() { return stores; },
    get frozen() { return frozen; }, get freezes() { return freezes; }, get closes() { return closes; },
    pending(v) { pending = v; }, accepted(v) { count = v; },
    onObserve(callback) { observeHook = callback; },
    async dead() { await f.crash(); birth += 10n; },
    async next() { cap = await f.create(); stores = f.stores(cap); cap.markReady(); cap.releaseStartup(); frozen = false; m = coordinator(); },
    async stop() { const request = auth(); const ack = m.request(request); const done = await m.done; assert.equal(done.phase, 'stopped'); return ack.id; },
    inspectFinish: id => api.inspectMaintenanceFinish({ ...options(), id }),
    async finish(id, expectedProofHash) { return api.finishMaintenance({ ...options(), id, expectedProofHash, reservedServer: await reserved() }); },
    inspect: id => api.inspectMaintenance({ ...options(), id }),
    async resume(id, expectedProofHash) { return api.resumeMaintenance({ ...options(), id, expectedProofHash, reservedServer: await reserved() }); }
  };
}
function inject(h, method, handler) { const original = h.f.io[method]; h.f.io[method] = (...args) => handler(original, ...args); return () => { h.f.io[method] = original; }; }

module.exports = { harness, inject };

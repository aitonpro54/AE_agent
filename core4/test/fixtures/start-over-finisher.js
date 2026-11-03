'use strict';
// Explicit test-only verifier/process observations and logical3457. TEMP files,
// file handles, loopback and installation-specific named IPC are real.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), http = require('node:http'), Module = require('node:module');
const { canonical, hash } = require('../../protocol/json'), { dispatchBinding } = require('../../protocol/dispatch');
const { fixture } = require('./owner-lifecycle-fixture');
async function harness(t, { diagnostic = false, noInventory = false, oldSession = false, aeProcesses = [] } = {}) {
  const f = await fixture(t); f.d.packageHash = 'c'.repeat(64); f.d.releaseDir = path.resolve(__dirname, '../..'); fs.writeFileSync(f.descriptorPath, canonical(f.d)); fs.writeFileSync(path.join(f.root, 'core-client.json'), canonical({ fixture: 'client' }));
  let cap = await f.create(), stores = f.stores(cap); cap.markReady(); cap.releaseStartup();
  const command = { protocolVersion: 1, controllerId: 'controller-test', channelEpoch: 'epoch-test', commandId: 'old-read', moduleId: 'project-inspection', operationId: 'inspect', executorHash: 'a'.repeat(64), phase: 'inspect', payloadHash: hash({}), payload: {} };
  stores.store.begin(command, dispatchBinding(command, stores.store.identity)); stores.store.unknown(command.commandId);
  if (diagnostic) { await f.crash(); cap = await f.create(); cap.releaseStartup(); stores = null; }
  if (oldSession) { fs.writeFileSync(f.path('work-session.json'), 'preserve old opaque session bytes'); fs.writeFileSync(f.path('work-session-baseline.json'), 'preserve old baseline bytes'); }
  const modules = new Map(), servers = [], probes = [], ipcServers = [], timers = new Set(); let birth = 639300000000000000n, scanFailure = noInventory, aeAlive = false, launches = 0;
  const observation = (processes = []) => ({ version: 1, machineId: f.d.machineId, observedAt: new Date().toISOString(), processes });
  function load(name) {
    if (modules.has(name)) return modules.get(name).exports;
    const filename = path.resolve(__dirname, '../../runtime/' + name + '.js'), mod = new Module(filename, module); modules.set(name, mod); mod.filename = filename; mod.paths = Module._nodeModulePaths(path.dirname(filename));
    mod.require = target => {
      if (target === 'node:fs') return f.io;
      if (['./start-over-state', './start-over-barrier', './start-over-archive', './start-over-finisher', './start-over-driver', './start-over-panel-control'].includes(target)) return load(target.slice(2));
      if (target === './installation') return { verifyInstallation(file) { assert.equal(file, f.descriptorPath); return JSON.parse(fs.readFileSync(file)); } };
      if (target === './windows-owner-process') return { async observeOwnerProcess(pid) { return { version: 1, status: 'present', pid, birthTicks: String(birth), executablePath: process.execPath, observedAt: new Date().toISOString() }; } };
      if (target === './start-over-process') return { async observeStartOverInventory() { if (scanFailure) throw Object.assign(Error('probe unavailable'), { code: 'start_over_process_probe_unavailable' }); return observation(aeProcesses); }, async observeStartOverStop(request) {
        probes.push(structuredClone(request)); const results = (scopes, ae = false) => scopes.map(s => ({ ...s, state: (ae ? aeAlive && aeProcesses.some(p => p.pid === s.pid && p.birthTicks === s.birthTicks) : s.pid === process.pid && s.birthTicks === String(birth)) ? 'alive' : 'absent', observedBirthTicks: null })), actors = results(request.actors), ae = results(request.ae, true);
        return { coverage: 'native-process-snapshot', inventory: observation(aeAlive ? aeProcesses : []), actors, ae, allObservedIncarnationsGone: [...actors, ...ae].every(s => s.state !== 'alive'), resetPermit: false, aeAuthority: false };
      } };
      if (target === 'node:http' && ['start-over-barrier', 'start-over-driver'].includes(name)) return { createServer(...args) { const s = http.createServer(...args), listen = s.listen.bind(s), address = s.address.bind(s); servers.push(s); s.fixtureActualAddress = address; s.listen = (options, ...rest) => listen(typeof options === 'number' ? 0 : { ...options, port: 0 }, ...rest); s.address = () => { const a = address(); return a && { ...a, port: 3457 }; }; return s; } };
      if (target === 'node:timers' && name === 'start-over-driver') return { setTimeout(callback, ms) { const timer = setTimeout(() => { timers.delete(timer); callback(); }, ms); timers.add(timer); return timer; }, clearTimeout(timer) { timers.delete(timer); clearTimeout(timer); } };
      if (target === './client-ipc' && name === 'start-over-driver') { const api = require('../../runtime/client-ipc'); return { createIpcServer(options) { const server = api.createIpcServer(options); ipcServers.push(server); return server; } }; }
      if (target === './owner-launch' && name === 'start-over-driver') return { async launchInstalledOwner() { launches++; return { launched: true }; } };
      return require(target.startsWith('.') ? path.resolve(path.dirname(filename), target) : target);
    };
    mod._compile(fs.readFileSync(filename, 'utf8'), filename); return mod.exports;
  }
  const state = load('start-over-state'), finisher = load('start-over-finisher'), owner = state.createOwnerStartOver({ installation: f.d, descriptorPath: f.descriptorPath, lifecycle: cap, freeze() {}, fencePhysical() {}, stop(id) { f.close(cap, stores); return { requested: true, id, fault: null }; } });
  let result; if (noInventory) { await assert.rejects(owner.request(), e => e.code === 'start_over_process_probe_unavailable'); await f.crash(); scanFailure = false; result = state.inspectStartOver({ installation: f.d, descriptorPath: f.descriptorPath }); } else result = await owner.request();
  t.after(async () => { for (const timer of timers) clearTimeout(timer); for (const s of ipcServers) await s.close(); for (const s of servers) if (s.listening) await new Promise(resolve => { s.close(resolve); s.closeAllConnections(); }); });
  const directory = path.join(f.root, 'transactions', result.id + '-start-over');
  return { ...f, state, finisher, result, directory, probes, load, launches: () => launches, setAEAlive(value) { aeAlive = value; }, options: { installation: f.d, descriptorPath: f.descriptorPath, id: result.id, expectedIntentHash: result.intentHash }, restart() { birth += 10n; }, servers,
    onceAfter(method, predicate) { const original = f.io[method]; let armed = true; f.io[method] = (...args) => { const result = original(...args); if (armed && predicate(...args)) { armed = false; throw Object.assign(Error('injected_finisher_crash'), { code: 'injected_finisher_crash' }); } return result; }; }
  };
}
module.exports = { harness };

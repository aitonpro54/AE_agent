'use strict';
// Synthetic native incarnations and logical canonical HTTP port, real TEMP
// filesystem/loopback listeners/named IPC. No public production injection seam.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), http = require('node:http'), Module = require('node:module');
const { canonical, hash } = require('../../protocol/json'), { dispatchBinding } = require('../../protocol/dispatch');
const { fixture } = require('./owner-lifecycle-fixture');
const { ownerEndpoint } = require('../../runtime/client-entry');
async function harness(t, { unknown = false, diagnostic = false, noInventory = false } = {}) {
  const f = await fixture(t); f.d.packageHash = 'c'.repeat(64); fs.writeFileSync(f.descriptorPath, canonical(f.d)); fs.writeFileSync(path.join(f.root, 'core-client.json'), canonical({ fixture: 'client' }));
  let cap = await f.create(), stores = f.stores(cap); cap.markReady(); cap.releaseStartup();
  const c = { protocolVersion: 1, controllerId: 'controller-test', channelEpoch: 'epoch-test', commandId: 'old-read', moduleId: 'project-inspection', operationId: 'inspect', executorHash: 'a'.repeat(64), phase: 'inspect', payloadHash: hash({}), payload: {} }, receiverIdentity = stores.store.identity;
  if (unknown || diagnostic) { stores.store.begin(c, dispatchBinding(c, receiverIdentity)); stores.store.unknown(c.commandId); }
  if (diagnostic) { await f.crash(); cap = await f.create(); cap.releaseStartup(); stores = null; }
  const modules = new Map(), servers = [], probes = []; let hook, actorsAlive = [], aeAlive = [], currentAE = [], inventoryFailure = noInventory;
  const observation = () => ({ version: 1, machineId: f.d.machineId, observedAt: new Date().toISOString(), processes: currentAE.map(s => ({ ...s, executablePath: 'C:\\AE\\AfterFX.exe' })) });
  const rootAE = { pid: 42, birthTicks: '639292254253597850' };
  const native = { async observeStartOverInventory() { if (inventoryFailure) throw Object.assign(Error('probe unavailable'), { code: 'start_over_process_probe_unavailable' }); return { ...observation(), processes: [{ ...rootAE, executablePath: 'C:\\AE\\AfterFX.exe' }] }; }, async observeStartOverStop(request) {
    probes.push(structuredClone(request)); if (hook) await hook(request, probes.length);
    const results = (scopes, alive) => scopes.map(s => ({ ...s, state: alive.some(p => p.pid === s.pid && p.birthTicks === s.birthTicks) ? 'alive' : 'absent', observedBirthTicks: alive.some(p => p.pid === s.pid && p.birthTicks === s.birthTicks) ? s.birthTicks : null }));
    const actors = results(request.actors, actorsAlive), ae = results(request.ae, aeAlive);
    return { coverage: 'native-process-snapshot', inventory: observation(), actors, ae, allObservedIncarnationsGone: [...actors, ...ae].every(s => s.state !== 'alive'), resetPermit: false, aeAuthority: false };
  } };
  function load(name) {
    if (modules.has(name)) return modules.get(name).exports;
    const filename = path.resolve(__dirname, '../../runtime/' + name + '.js'), mod = new Module(filename, module); modules.set(name, mod); mod.filename = filename; mod.paths = Module._nodeModulePaths(path.dirname(filename));
    mod.require = target => {
      if (target === 'node:fs') return f.io;
      if (['./start-over-state', './start-over-barrier'].includes(target)) return load(target.slice(2));
      if (target === './installation') return { verifyInstallation(file) { assert.equal(file, f.descriptorPath); return JSON.parse(fs.readFileSync(file)); } };
      if (target === './start-over-process') return native;
      if (target === 'node:http' && name === 'start-over-barrier') return { createServer(...args) {
        const server = http.createServer(...args), listen = server.listen.bind(server), address = server.address.bind(server); servers.push(server);
        server.listen = (options, callback) => listen({ ...options, port: 0 }, callback);
        server.address = () => { const a = address(); return a && { ...a, port: 3457 }; }; return server;
      } };
      return require(target.startsWith('.') ? path.resolve(path.dirname(filename), target) : target);
    };
    mod._compile(fs.readFileSync(filename, 'utf8'), filename); return mod.exports;
  }
  const state = load('start-over-state'), api = load('start-over-barrier'), owner = state.createOwnerStartOver({ installation: f.d, descriptorPath: f.descriptorPath, lifecycle: cap, freeze() {}, fencePhysical() {}, stop(id) { f.close(cap, stores); return { requested: true, id, fault: null }; } });
  let result; if (noInventory) { await assert.rejects(owner.request(), e => e.code === 'start_over_process_probe_unavailable'); await f.crash(); result = state.inspectStartOver({ installation: f.d, descriptorPath: f.descriptorPath }); } else result = await owner.request();
  t.after(async () => { for (const s of servers) if (s.listening) await new Promise(resolve => { s.close(resolve); s.closeAllConnections(); }); });
  const options = { installation: f.d, descriptorPath: f.descriptorPath, id: result.id, expectedIntentHash: result.intentHash };
  return { ...f, api, state, cap, rootAE, result, options, probes, servers, c, receiverIdentity, endpoint: ownerEndpoint(f.d), set(patch) { if (patch.actorsAlive) actorsAlive = patch.actorsAlive; if (patch.aeAlive) aeAlive = patch.aeAlive; if (patch.currentAE) currentAE = patch.currentAE; if (patch.hook) hook = patch.hook; if ('inventoryFailure' in patch) inventoryFailure = patch.inventoryFailure; } };
}
module.exports = { harness };

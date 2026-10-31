'use strict';
// TEMP only. Synthetic owner observations/verifier and optional isolated lease
// permit substitution at the module loader; no production issuer or OS probe.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), http = require('node:http'), crypto = require('node:crypto'), Module = require('node:module');
const { canonical } = require('../../protocol/json');
const { classifyOwnerProcess } = require('../../runtime/windows-owner-process');
const { fixture } = require('./owner-lifecycle-fixture');
const SOURCE = path.resolve(__dirname, '../..');
const error = code => Object.assign(Error(code), { code });
async function harness(t, { leasePlumbing = false } = {}) {
  const f = await fixture(t); fs.writeFileSync(path.join(f.root, 'core-client.json'), canonical({ fixture: 'readoption-client' }));
  const owner = await f.create(), stores = f.stores(owner); owner.markReady(); owner.releaseStartup();
  let birth = BigInt(owner.state().birthTicks), unavailable = false, observationHook, writes = 0, modules = new Map();
  const permits = new WeakMap();
  for (const name of ['writeSync', 'fsyncSync', 'writeFileSync', 'appendFileSync', 'mkdirSync', 'linkSync', 'renameSync', 'unlinkSync', 'rmSync']) {
    const previous = f.io[name]; f.io[name] = (...args) => { writes++; return previous(...args); };
  }
  const opening = f.io.openSync;
  f.io.openSync = (file, flags, ...args) => { assert.ok(path.resolve(String(file)).startsWith(f.base + path.sep), 'fixture file outside TEMP'); if (typeof flags === 'string' && /[wa+]/.test(flags)) writes++; return opening(file, flags, ...args); };
  function load(relative) {
    const filename = path.resolve(SOURCE, relative.endsWith('.js') ? relative : relative + '.js');
    assert.ok(filename.startsWith(SOURCE + path.sep));
    if (modules.has(filename)) return modules.get(filename).exports;
    const mod = new Module(filename, module); modules.set(filename, mod); mod.filename = filename; mod.paths = Module._nodeModulePaths(path.dirname(filename));
    mod.require = target => {
      if (target === 'node:fs') return f.io;
      if (target === 'node:child_process') return Object.fromEntries(['spawn', 'spawnSync', 'exec', 'execSync', 'execFile', 'execFileSync', 'fork'].map(k => [k, () => { throw error('fixture_native_forbidden'); }]));
      if (target === 'node:net') return { connect() { throw error('fixture_network_forbidden'); } };
      if (target.startsWith('.')) {
        const resolved = path.resolve(path.dirname(filename), target), rel = path.relative(SOURCE, resolved).replace(/\\/g, '/').replace(/\.js$/, '');
        if (rel === 'runtime/stdio-entry') return { verifyInstallation(file) { assert.equal(file, f.descriptorPath); return JSON.parse(fs.readFileSync(file)); } };
        if (rel === 'runtime/windows-owner-process') return { classifyOwnerProcess, async observeOwnerProcess(pid) {
          if (observationHook) await observationHook(pid);
          if (unavailable) throw error('owner_process_probe_unavailable');
          return { version: 1, pid, status: 'present', birthTicks: String(birth), executablePath: process.execPath, observedAt: new Date().toISOString() };
        } };
        if (leasePlumbing && rel === 'tools/stopped-host-readoption' && filename === path.join(SOURCE, 'tools/stopped-update.js')) return { ...load(rel), stoppedReadoptionLeasePermit(capability) {
          const value = permits.get(capability); if (!value) throw error('fixture_lease_brand'); return value;
        } };
        if (resolved.startsWith(SOURCE + path.sep)) return load(rel);
      }
      return require(target);
    };
    mod._compile(fs.readFileSync(filename, 'utf8'), filename); return mod.exports;
  }
  const maintenance = load('runtime/owner-maintenance'), scope = { bootId: owner.state().processBootId, pid: owner.state().pid, birthTicks: owner.state().birthTicks }, id = crypto.randomUUID();
  const stop = maintenance.createOwnerMaintenance({ installation: f.d, descriptorPath: f.descriptorPath, lifecycle: owner, freeze() {}, activity: () => ({ pending: false }), accepted: () => 0, async close() { f.close(owner, stores); }, intervalMs: 1 });
  stop.request(maintenance.createStopAuthorization({ installation: f.d, descriptorPath: f.descriptorPath, scope, id })); assert.equal((await stop.done).phase, 'stopped');
  await f.crash(); birth += 10n;
  const server = http.createServer(); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const options = { installation: f.d, descriptorPath: f.descriptorPath, id, reservedServer: server }, certifier = load('runtime/stopped-certification');
  const certificate = await certifier.certifyStoppedInstallation({ ...options, expectedProofHash: (await certifier.inspectStoppedCertification(options)).proofHash });
  const certified = certifier.stoppedCertificateFacts(certificate);
  birth += 10n; modules = new Map(); // New module generation: no live certificate brand survives.
  return { f, id, options, server, certified, load, writes: () => writes,
    get api() { return load('tools/stopped-host-readoption'); }, get certifier() { return load('runtime/stopped-certification'); },
    get maintenance() { return load('runtime/owner-maintenance'); }, get update() { return load('tools/stopped-update'); }, get leases() { return load('runtime/install-lease'); },
    onObserve(fn) { observationHook = fn; }, unavailable(value) { unavailable = value; }, reviveCertifier() { birth -= 10n; },
    nextActor() { for (const fd of [...f.tracked]) f.io.closeSync(fd); birth += 10n; modules = new Map(); },
    path: name => path.join(f.root, 'transactions', id + '-owner-maintenance', name),
    inspect: () => load('tools/stopped-host-readoption').inspectStoppedReadoption(options),
    issueSyntheticLease(permit) { assert.equal(leasePlumbing, true); const capability = Object.freeze({}); permits.set(capability, permit); return capability; }
  };
}
module.exports = { harness };

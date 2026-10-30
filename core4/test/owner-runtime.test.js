'use strict';
const nodeTest = require('node:test');
const test = (name, fn) => nodeTest('owner-runtime ' + name, { timeout: 15000 }, fn);
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const vm = require('node:vm');
const { AsyncLocalStorage } = require('node:async_hooks');
const { fork, spawn } = require('node:child_process');
const { once } = require('node:events');
const { canonical } = require('../protocol/json');
const { buildPackage } = require('../tools/package-installable');
const { planInstall, applyInstall } = require('../tools/install-core4');
const { verifyInstallation } = require('../runtime/stdio-entry');
const { projectClientDescriptor, ownerEndpoint } = require('../runtime/client-entry');
const { createIpcClient } = require('../runtime/client-ipc');
const { createAttachmentOwner } = require('../runtime/attachment-owner');
const { createHttpPeer } = require('../integrations/cep/http-peer');
const { openCompletionStore } = require('../integrations/cep/completion-store');
const { mac } = require('../integrations/cep/peer-protocol');
const { checkEntrySource } = require('../tools/check-boundaries');
const SOURCE = path.resolve(__dirname, '..'), preload = path.join(__dirname, 'fixtures/owner-runtime-child.js');
const EXTRA = ['owner-entry', 'client-entry', 'client-ipc', 'client-stdio', 'controller-lease', 'attachment-owner', 'owner-lifecycle', 'recovery-inspection', 'windows-owner-process'].map(name => 'runtime/' + name + '.js');
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
function remove(directory) {
  const prefix = path.join(os.tmpdir(), 'core4-owner-');
  assert.ok(path.isAbsolute(directory) && path.resolve(directory) === directory && directory.startsWith(prefix));
  fs.rmSync(directory, { recursive: true, force: true });
}
const cleanup = new WeakMap();
function resources(t) {
  if (!cleanup.has(t)) {
    const record = { closers: [], directories: [] }; cleanup.set(t, record);
    t.after(async () => {
      let failure;
      for (const close of record.closers.reverse()) try { await close(); } catch (e) { failure ||= e; }
      for (const directory of record.directories.reverse()) remove(directory);
      if (failure) throw failure;
    });
  }
  return cleanup.get(t);
}
function temp(t) { const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'core4-owner-')); resources(t).directories.push(directory); return directory; }
async function until(predicate) {
  const limit = Date.now() + 4000;
  while (!await predicate()) { if (Date.now() > limit) assert.fail('owner fixture condition timeout'); await new Promise(r => setTimeout(r, 5)); }
}
let cachedPackage;
function testPackage() {
  if (cachedPackage) return cachedPackage;
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'core4-owner-')), root = path.join(directory, 'source');
  try {
    fs.mkdirSync(root);
    for (const name of ['core', 'protocol', 'modules', 'plan-engine', 'runtime', 'config', 'cep', 'integrations']) fs.cpSync(path.join(SOURCE, name), path.join(root, name), { recursive: true });
    fs.copyFileSync(path.join(SOURCE, 'worker.js'), path.join(root, 'worker.js'));
    cachedPackage = buildPackage(root, 'readonly', { runtimeModel: 'owner' }); return cachedPackage;
  } finally { remove(directory); }
}
function install(t, pkg = testPackage()) {
  const directory = temp(t);
  const args = { pkg, installRoot: path.join(directory, 'AEAgentCore4'), extensionsDir: path.join(directory, 'extensions'),
    configPath: path.join(directory, 'config.toml'), nodePath: fs.realpathSync(process.execPath), machineId: os.hostname() };
  const applied = applyInstall(planInstall(args)), descriptor = applied.descriptorPath, d = verifyInstallation(descriptor);
  const clientDescriptor = path.join(d.installRoot, 'core-client.json');
  if (Object.hasOwn(pkg.files, 'runtime/owner-contract.json')) assert.equal(fs.readFileSync(clientDescriptor, 'utf8'), canonical(projectClientDescriptor(d)));
  return { directory, pkg, descriptor, clientDescriptor, d };
}
function stateBytes(directory) {
  const result = {};
  function visit(dir, relative = '') {
    for (const name of fs.readdirSync(dir).sort()) {
      const file = path.join(dir, name), rel = relative ? relative + '/' + name : name;
      if (fs.statSync(file).isDirectory()) { result[rel] = { directory: true }; visit(file, rel); }
      else result[rel] = { bytes: fs.readFileSync(file).toString('base64') };
    }
  }
  visit(directory); return result;
}
function childMain(t, f, entry = 'owner-entry') {
  const child = fork(path.join(f.d.releaseDir, 'runtime/' + entry + '.js'), ['--installation', f.descriptor],
    { execArgv: ['--require', preload], windowsHide: true, cwd: f.directory, stdio: ['pipe', 'pipe', 'pipe', 'ipc'] });
  let stderr = '', stdout = ''; const events = new Map();
  const exit = new Promise(resolve => child.once('exit', (code, signal) => resolve({ code, signal })));
  child.stderr.on('data', bytes => { stderr += bytes; }); child.stdout.on('data', bytes => { stdout += bytes; });
  child.on('message', value => { if (!events.has(value.event)) events.set(value.event, deferred()); events.get(value.event).resolve(value); });
  resources(t).closers.push(async () => { if (child.exitCode === null && child.signalCode === null) child.kill(); await exit; });
  return { child, exit, get stderr() { return stderr; }, get stdout() { return stdout; },
    event(name) { if (!events.has(name)) events.set(name, deferred()); return events.get(name).promise; } };
}
function rpcProcess(t, f) {
  const child = spawn(process.execPath, [path.join(f.d.releaseDir, 'runtime/client-entry.js'), '--client-descriptor', f.clientDescriptor],
    { windowsHide: true, cwd: f.directory, stdio: ['pipe', 'pipe', 'pipe'] });
  const pending = new Map(); let serial = 0, buffer = '', stderr = '';
  const exit = new Promise(resolve => child.once('exit', (code, signal) => resolve({ code, signal })));
  child.stderr.on('data', data => { stderr += data; });
  child.stdout.on('data', data => {
    buffer += data;
    while (buffer.includes('\n')) { const n = buffer.indexOf('\n'), value = JSON.parse(buffer.slice(0, n)); buffer = buffer.slice(n + 1); pending.get(value.id)?.(value); pending.delete(value.id); }
  });
  const rpc = (method, params = {}) => new Promise(resolve => { const id = ++serial; pending.set(id, resolve); child.stdin.write(canonical({ jsonrpc: '2.0', id, method, params }) + '\n'); });
  resources(t).closers.push(async () => { if (child.exitCode === null && child.signalCode === null) child.kill(); await exit; });
  return { child, rpc, exit, get stderr() { return stderr; }, async call(name, payload = {}) {
    const response = await rpc('tools/call', { name, arguments: { payload } }); assert.equal(response.error, undefined, JSON.stringify(response.error)); return JSON.parse(response.result.content[0].text);
  } };
}
async function ipc(t, f) {
  const client = await createIpcClient({ endpoint: ownerEndpoint(f.d), identity: { installationId: f.d.installationId, machineId: f.d.machineId, packageHash: f.d.packageHash }, secret: f.d.controlToken });
  resources(t).closers.push(() => client.close()); return client;
}
async function ok(promise) { const result = await promise; assert.equal(result.ok, true, JSON.stringify(result)); return result.value; }
async function directOwner(t, f) {
  const runtime = await require(path.join(f.d.releaseDir, 'runtime/owner-entry.js')).startOwner({ descriptor: f.descriptor, port: 0 });
  resources(t).closers.push(() => runtime.close()); return runtime;
}
function raw(port, route, body) {
  return new Promise((resolve, reject) => {
    const request = http.request({ hostname: '127.0.0.1', port, path: route, method: 'POST', agent: false, headers: { Origin: 'null', 'Content-Type': 'application/json' } }, response => {
      let bytes = ''; response.on('data', data => { bytes += data; }); response.on('end', () => { try { resolve({ status: response.statusCode, value: JSON.parse(bytes) }); } catch (e) { reject(e); } });
    }); request.on('error', reject); request.end(canonical(body));
  });
}
async function panel(port, installation) {
  const challenge = (await raw(port, '/challenge', { role: 'panel' })).value, peerId = 'owner-runtime-panel'; let sequence = 0;
  const response = await raw(port, '/link', { challenge, peerId, proof: mac({ challenge, peerId }, installation.panelToken) }); assert.equal(response.status, 200);
  return { async request(route, payload) {
    const body = { epoch: challenge.epoch, peerId, sequence: ++sequence, method: 'POST', path: route, payload };
    const response = await raw(port, route, { body, mac: mac(body, installation.panelToken) });
    if (response.status === 200) { assert.equal(response.value.mac, mac(response.value.body, installation.panelToken)); return { status: 200, value: response.value.body.payload }; }
    return response;
  } };
}
function observation() { return { observationVersion: 1, target: { projectId: null, compId: null }, project: { name: 'fixture', numItems: 0, saved: false }, compositions: [], layers: [], truncated: false, aeVersion: '26-fixture' }; }
function vmObservation(pkg, frame) {
  const context = vm.createContext({ JSON: undefined, Math, Error, CompItem: function CompItem() {},
    app: { version: '26-fixture', project: { file: null, numItems: 0 } }, serialized: canonical(frame) });
  vm.runInContext(Buffer.from(pkg.files['cep/jsx/registry.jsx'], 'base64').toString('utf8'), context);
  return JSON.parse(vm.runInContext('AECore4Host.dispatch(serialized)', context));
}
const completion = (frame, result = observation()) => ({ commandId: frame.commandId, originalBinding: frame.originalBinding, pins: frame.pins, result });

test('default verified entry markers remain exact and new owner files stay outside the ordinary source package', async t => {
  const entrySource = fs.readFileSync(path.join(SOURCE, 'runtime/stdio-entry.js'), 'utf8');
  assert.equal(checkEntrySource(entrySource), true);
  const barrier = 'ownerLifecycle = await createOwnerLifecycle({ installation, descriptorPath: descriptor, reservedServer });';
  assert.throws(() => checkEntrySource(entrySource.replace(barrier, "const unchecked = require('../core/broker.js');\n" + barrier)), /owner_store_before_lifecycle/);
  assert.throws(() => checkEntrySource(entrySource.replace(barrier, '/* missing process/gate/history admission */')), /entry_verification_layout/);
  assert.ok(EXTRA.every(file => !Object.hasOwn(buildPackage(SOURCE, 'readonly').files, file)));
  const f = install(t, buildPackage(SOURCE, 'readonly')), main = childMain(t, f, 'stdio-entry'); await main.event('http');
  const response = once(main.child.stdout, 'data');
  main.child.stdin.write(canonical({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }) + '\n');
  assert.equal(JSON.parse(String((await response)[0])).result.serverInfo.name, 'ae-agent-core4');
  main.child.stdin.end(); assert.equal((await main.exit).code, 0); assert.equal(main.stderr, '');
});

test('normal package without the complete owner cluster refuses private owner mode before any listener or store opens', async t => {
  const f = install(t, buildPackage(SOURCE, 'readonly')), before = stateBytes(f.d.stateDir);
  const entry = require(path.join(f.d.releaseDir, 'runtime/stdio-entry.js')), createServer = http.createServer; let servers = 0;
  http.createServer = (...args) => { servers++; return createServer(...args); };
  try { await assert.rejects(entry.start({ descriptor: f.descriptor, port: 0, mode: 'owner' }), error => error.code === 'owner_composition_unavailable'); }
  finally { http.createServer = createServer; }
  assert.equal(servers, 0); assert.deepEqual(stateBytes(f.d.stateDir), before);
  assert.equal(require.cache[path.join(f.d.releaseDir, 'core/broker.js')], undefined);
  assert.equal(fs.existsSync(path.join(f.d.installRoot, 'install.lock')), false);
});

test('TEMP installed owner and two real thin Node clients retain the same owner after both client EOF and owner stdin EOF', async t => {
  const f = install(t), main = childMain(t, f); await main.event('ipc');
  const a = rpcProcess(t, f), b = rpcProcess(t, f);
  await Promise.all([a.rpc('initialize'), b.rpc('initialize')]);
  const [one, two] = await Promise.all([a.call('core_status'), b.call('core_status')]);
  assert.equal(one.pid, main.child.pid); assert.equal(two.pid, main.child.pid);
  assert.equal(one.attachmentOwner.bootId, two.attachmentOwner.bootId);
  assert.equal(one.physical.receiverStoreIdentity, two.physical.receiverStoreIdentity); assert.equal(one.attachmentOwner.generation, 0);
  assert.ok((await b.rpc('tools/list')).result.tools.some(tool => tool.name === 'controller_acquire'));
  a.child.stdin.end(); assert.equal((await a.exit).code, 0); main.child.stdin.end();
  assert.equal((await b.call('core_status')).pid, main.child.pid); b.child.stdin.end(); assert.equal((await b.exit).code, 0);
  const observer = await ipc(t, f); assert.equal((await ok(observer.call('core_status', {}))).pid, main.child.pid);
  assert.equal((await ok(observer.call('owner_status', {}))).generation, 0);
  main.child.send('signal'); assert.equal((await main.exit).code, 0);
  assert.equal(main.stderr + a.stderr + b.stderr, ''); assert.equal(main.stdout, '');
});

test('foreign HTTP endpoint refuses owner startup before stores open and preserves both empty and retained state byte for byte', async t => {
  const foreign = http.createServer((req, res) => { res.setHeader('Content-Type', 'application/json'); res.end('{"foreign":true}'); });
  await new Promise(resolve => foreign.listen(0, '127.0.0.1', resolve)); resources(t).closers.push(() => new Promise(resolve => foreign.close(resolve)));
  const port = foreign.address().port;
  for (const seeded of [false, true]) {
    const f = install(t);
    if (seeded) {
      openCompletionStore({ directory: path.join(f.d.stateDir, 'receiver') }).close();
      fs.writeFileSync(path.join(f.d.stateDir, 'broker/broker-owner.lock'), 'synthetic-retained-owner');
      fs.writeFileSync(path.join(f.d.stateDir, 'broker/ledger.ndjson'), 'synthetic-retained-ledger\n');
    }
    const before = stateBytes(f.d.stateDir), entry = require(path.join(f.d.releaseDir, 'runtime/owner-entry.js'));
    await assert.rejects(entry.startOwner({ descriptor: f.descriptor, port }), error => error.code === 'EADDRINUSE');
    assert.deepEqual(stateBytes(f.d.stateDir), before, 'no artifact/store/origin publication before successful endpoint reservation');
    assert.equal(require.cache[path.join(f.d.releaseDir, 'core/broker.js')], undefined);
    assert.equal(fs.existsSync(path.join(f.d.installRoot, 'install.lock')), false);
    assert.deepEqual((await raw(port, '/challenge', { role: 'panel' })).value, { foreign: true });
  }
});

test('competing starts reserve under the install gate and later owner attempts cannot displace the winner or rewrite its markers', async t => {
  const f = install(t), entry = require(path.join(f.d.releaseDir, 'runtime/owner-entry.js'));
  const attempts = await Promise.allSettled([entry.startOwner({ descriptor: f.descriptor, port: 0 }), entry.startOwner({ descriptor: f.descriptor, port: 0 })]);
  assert.equal(attempts.filter(result => result.status === 'fulfilled').length, 1);
  const winner = attempts.find(result => result.status === 'fulfilled').value;
  resources(t).closers.push(() => winner.close()); assert.ok(['EEXIST', 'owner_lifecycle_alive'].includes(attempts.find(result => result.status === 'rejected').reason.code));
  const before = stateBytes(f.d.stateDir), port = winner.status().physical.port, client = await ipc(t, f);
  await assert.rejects(entry.startOwner({ descriptor: f.descriptor, port }), error => error.code === 'EADDRINUSE');
  assert.deepEqual(stateBytes(f.d.stateDir), before);
  const status = await ok(client.call('core_status', {})); assert.equal(status.attachmentOwner.bootId, winner.bootId);
  assert.equal(status.physical.receiverStoreIdentity, winner.status().physical.receiverStoreIdentity);
  assert.equal(status.ownershipFault, null); assert.equal(status.physical.storeClosed, false);
  const events = fs.readFileSync(path.join(f.d.stateDir, 'receiver/completions.ndjson'), 'utf8').trim().split('\n').map(JSON.parse);
  assert.deepEqual(events.map(event => event.type), ['origin']);
});

test('reserved HTTP server closes and attributed startup fence remains if Broker construction fails before peer creation', async t => {
  const f = install(t), entry = require(path.join(f.d.releaseDir, 'runtime/owner-entry.js'));
  fs.writeFileSync(path.join(f.d.stateDir, 'broker/artifacts'), 'synthetic-blocked-artifacts-directory');
  const createServer = http.createServer; let reserved;
  // Observe the actual private native server, without adding production hooks.
  http.createServer = (...args) => { reserved = createServer(...args); return reserved; };
  try { await assert.rejects(entry.startOwner({ descriptor: f.descriptor, port: 0 }), error => error.code === 'EEXIST'); }
  finally { http.createServer = createServer; }
  assert.ok(reserved instanceof http.Server); assert.equal(reserved.listening, false); assert.equal(reserved.address(), null);
  assert.equal(fs.existsSync(path.join(f.d.stateDir, 'receiver')), false);
  const gate = JSON.parse(fs.readFileSync(path.join(f.d.installRoot, 'install.lock'))), owner = JSON.parse(fs.readFileSync(path.join(f.d.stateDir, 'runtime-owner.json')));
  assert.equal(gate.body.kind, 'startup-gate'); assert.equal(gate.body.phase, 'startup');
  assert.equal(owner.body.kind, 'runtime-owner'); assert.equal(owner.body.phase, 'starting');
  assert.deepEqual(gate.body.scope, owner.body.scope); assert.equal(owner.body.scope.pid, process.pid);
  const before = stateBytes(f.d.stateDir), gateBefore = fs.readFileSync(path.join(f.d.installRoot, 'install.lock'));
  await assert.rejects(entry.startOwner({ descriptor: f.descriptor, port: 0 }), error => error.code === 'owner_lifecycle_alive');
  assert.deepEqual(stateBytes(f.d.stateDir), before); assert.deepEqual(fs.readFileSync(path.join(f.d.installRoot, 'install.lock')), gateBefore);
});

test('private prebound peer requires a listening native loopback HTTP server and reuses its one listener', async t => {
  const directory = temp(t), installation = { installationId: 'prebound-fixture', packageHash: 'a'.repeat(64), panelToken: 'b'.repeat(64), controlToken: 'c'.repeat(64) };
  const options = { installation, directory: path.join(directory, 'receiver'), asset: { assetKey: 'project-inspection-v1', executorHash: 'd'.repeat(64) }, port: 0 };
  const unbound = http.createServer();
  for (const preboundServer of [{ listening: true }, unbound]) assert.throws(() => createHttpPeer({ ...options, preboundServer }), error => error.code === 'http_prebound_server');
  assert.equal(fs.existsSync(options.directory), false);
  const bound = http.createServer(); await new Promise(resolve => bound.listen(0, '127.0.0.1', resolve));
  resources(t).closers.push(() => bound.listening ? new Promise(resolve => bound.close(resolve)) : undefined);
  const port = bound.address().port, peer = createHttpPeer({ ...options, preboundServer: bound }); resources(t).closers.push(() => peer.close());
  const listen = bound.listen; bound.listen = () => assert.fail('must reuse the reserved listener');
  try { assert.equal((await peer.listen()).port, port); assert.equal((await peer.listen()).port, port); await panel(port, installation); }
  finally { bound.listen = listen; }
});

test('initial receiver owner marker leaves status available and refuses controller acquisition without clearing the marker', async t => {
  const f = install(t), directory = path.join(f.d.stateDir, 'receiver');
  openCompletionStore({ directory }).close(); const marker = path.join(directory, 'owner'); fs.writeFileSync(marker, 'synthetic-retained-owner');
  const runtime = await directOwner(t, f), client = await ipc(t, f);
  const status = await ok(client.call('core_status', {})); assert.equal(status.physical.storeClosed, true); assert.equal(status.attachmentOwner.activity.unresolved, true);
  assert.deepEqual(await client.call('controller_acquire', {}), { ok: false, code: 'owner_recovery_required' });
  assert.equal((await ok(client.call('core_diagnostics', {}))).pid, process.pid);
  await runtime.close(); assert.equal(fs.readFileSync(marker, 'utf8'), 'synthetic-retained-owner');
});

test('initial corrupt Broker ledger blocks acquisition while owner diagnostics remain available', async t => {
  const f = install(t), directory = path.join(f.d.stateDir, 'broker'); fs.mkdirSync(directory, { recursive: true }); fs.writeFileSync(path.join(directory, 'ledger.ndjson'), 'corrupt\n');
  await directOwner(t, f); const client = await ipc(t, f), status = await ok(client.call('core_status', {}));
  assert.equal(status.lifecycle.mode, 'diagnostic'); assert.equal(status.lifecycle.reason, 'owner_lifecycle_history_fault'); assert.equal(status.attachmentOwner.activity.fault, true);
  assert.equal(fs.readFileSync(path.join(directory, 'ledger.ndjson'), 'utf8'), 'corrupt\n'); assert.equal(fs.existsSync(path.join(directory, 'artifacts')), false);
  assert.deepEqual(await client.call('controller_acquire', {}), { ok: false, code: 'owner_recovery_required' });
});

test('actual dead settled owner restarts with fresh process proof and unchanged journal and installation', async t => {
  const f = install(t), first = childMain(t, f); await first.event('ipc');
  const before = await ok((await ipc(t, f)).call('core_status', {}));
  const journalFile = path.join(f.d.stateDir, 'receiver/completions.ndjson'), originalJournal = fs.readFileSync(journalFile), descriptor = fs.readFileSync(f.descriptor);
  assert.equal(before.lifecycle.mode, 'active'); assert.equal(typeof before.lifecycle.birthTicks, 'string');
  // Retained child handle belongs only to this TEMP installed fixture process.
  assert.equal(first.child.kill('SIGKILL'), true); await first.exit;
  assert.equal(fs.existsSync(path.join(f.d.stateDir, 'runtime-owner.json')), true);
  const second = childMain(t, f); await second.event('ipc'); const after = await ok((await ipc(t, f)).call('core_status', {}));
  assert.equal(after.lifecycle.mode, 'active'); assert.notEqual(after.pid, before.pid); assert.notEqual(after.lifecycle.processBootId, before.lifecycle.processBootId);
  assert.equal(after.physical.receiverStoreIdentity, before.physical.receiverStoreIdentity); assert.equal(after.physical.storeClosed, false); assert.equal(after.ownershipFault, null);
  assert.deepEqual(fs.readFileSync(journalFile), originalJournal); assert.deepEqual(fs.readFileSync(f.descriptor), descriptor);
  const recovery = fs.readdirSync(path.join(f.d.installRoot, 'transactions')).filter(name => name.endsWith('-owner-lifecycle')).map(name => path.join(f.d.installRoot, 'transactions', name, 'intent.json')).filter(file => fs.existsSync(file)).map(file => JSON.parse(fs.readFileSync(file)));
  assert.ok(recovery.some(r => r.body.kind === 'owner-recovery-intent' && r.body.previousScope.pid === before.pid && r.body.previousScope.birthTicks === before.lifecycle.birthTicks));
  second.child.send('signal'); assert.equal((await second.exit).code, 0); assert.equal(second.stderr, '');
});

test('actual legacy receiver fence exposes only recovery diagnostics without a Broker writer or replay', async t => {
  const f = install(t), directory = path.join(f.d.stateDir, 'receiver'); openCompletionStore({ directory }).close();
  const marker = path.join(directory, 'owner'), journalFile = path.join(directory, 'completions.ndjson'); fs.writeFileSync(marker, ''); const journal = fs.readFileSync(journalFile);
  const main = childMain(t, f); await main.event('ipc'); const client = await ipc(t, f), status = await ok(client.call('core_status', {}));
  assert.equal(status.ready, false); assert.equal(status.lifecycle.mode, 'diagnostic'); assert.equal(status.lifecycle.reason, 'owner_lifecycle_legacy_marker');
  assert.equal(status.lifecycle.historyAtStartup.receiver.settled, true); assert.equal(fs.existsSync(path.join(f.d.stateDir, 'broker/artifacts')), false);
  assert.deepEqual(await client.call('controller_acquire', {}), { ok: false, code: 'owner_recovery_required' });
  const response = await raw(status.physical.port, '/challenge', { role: 'panel' }); assert.equal(response.status, 503); assert.deepEqual(response.value, { error: 'owner_recovery_required' });
  assert.equal(fs.readFileSync(marker).length, 0); assert.deepEqual(fs.readFileSync(journalFile), journal);
  main.child.send('signal'); assert.equal((await main.exit).code, 0); assert.equal(fs.readFileSync(marker).length, 0); assert.deepEqual(fs.readFileSync(journalFile), journal);
});

test('actual owner crash after durable delivery restarts diagnostic and never promotes or replays original ongoing work', async t => {
  const f = install(t), first = childMain(t, f); await first.event('ipc'); const client = await ipc(t, f), status = await ok(client.call('core_status', {}));
  const p = await panel(status.physical.port, f.d); await ok(client.call('controller_acquire', {}));
  const contract = await ok(client.call('get_module_contract', { moduleId: 'project-inspection' }));
  const request = client.call('inspect_module_target', { moduleId: 'project-inspection', contractId: contract.contractId, target: {} });
  const lost = assert.rejects(request, e => e.code === 'ipc_outcome_uncertain');
  const frame = (await p.request('/poll', {})).value.command; assert.ok(frame);
  const journalFile = path.join(f.d.stateDir, 'receiver/completions.ndjson'), journal = fs.readFileSync(journalFile), marker = fs.readFileSync(path.join(f.d.stateDir, 'receiver/owner'));
  assert.equal(first.child.kill('SIGKILL'), true); await first.exit; await lost;
  const second = childMain(t, f); await second.event('ipc'); const observer = await ipc(t, f), diagnostic = await ok(observer.call('core_status', {}));
  assert.equal(diagnostic.lifecycle.mode, 'diagnostic'); assert.equal(diagnostic.lifecycle.reason, 'owner_lifecycle_unresolved'); assert.equal(diagnostic.lifecycle.historyAtStartup.receiver.unresolvedCount, 1);
  assert.deepEqual(await observer.call('controller_acquire', {}), { ok: false, code: 'owner_recovery_required' });
  assert.equal((await raw(diagnostic.physical.port, '/poll', {})).status, 503);
  assert.equal((await raw(diagnostic.physical.port, '/complete', completion(frame))).status, 503);
  assert.deepEqual(fs.readFileSync(journalFile), journal); assert.deepEqual(fs.readFileSync(path.join(f.d.stateDir, 'receiver/owner')), marker);
  assert.deepEqual(journal.toString('utf8').trim().split('\n').map(JSON.parse).map(e => e.type), ['origin', 'begin']);
  second.child.send('signal'); assert.equal((await second.exit).code, 0); assert.deepEqual(fs.readFileSync(journalFile), journal);
});

test('inherited generic methods execute on the actual Broker so activity observes its control state', async t => {
  const f = install(t); await directOwner(t, f); const client = await ipc(t, f);
  const { Broker } = require(path.join(f.d.releaseDir, 'core/broker.js')), getTask = Broker.prototype.getTask;
  let receiver;
  // TEMP module-memory instrumentation only: emulate Broker activity while
  // retaining the real inherited method. No release bytes/provider/grants change.
  Broker.prototype.getTask = function (payload) { receiver = this; this.controllerBusy = true; return getTask.call(this, payload); };
  try {
    await ok(client.call('get_task', { taskId: 'owner-receiver-fixture' }));
    assert.equal((await ok(client.call('owner_status', {}))).activity.pending, true);
    assert.deepEqual(await client.call('controller_acquire', {}), { ok: false, code: 'owner_draining' });
  } finally { if (receiver) receiver.controllerBusy = false; Broker.prototype.getTask = getTask; }
});

test('verified owner captures controller context for physical inspection and completes original work after client detach', async t => {
  const f = install(t), runtime = await directOwner(t, f), client = await ipc(t, f), observer = await ipc(t, f);
  const p = await panel(runtime.status().physical.port, f.d); await ok(client.call('controller_acquire', {}));
  const contract = await ok(client.call('get_module_contract', { moduleId: 'project-inspection' }));
  const result = client.call('inspect_module_target', { moduleId: 'project-inspection', contractId: contract.contractId, target: {} });
  await until(() => runtime.status().physical.pending); await assert.rejects(runtime.close(), e => e.code === 'owner_draining');
  const frame = (await p.request('/poll', {})).value.command; assert.ok(frame);
  const unknown = assert.rejects(result, e => e.code === 'ipc_outcome_uncertain'); client.close(); await unknown;
  assert.equal((await observer.call('controller_acquire', {})).code, 'owner_draining');
  const ack = await p.request('/complete', completion(frame, vmObservation(f.pkg, frame))); assert.equal(ack.status, 200);
  await until(() => runtime.status().attachmentOwner.accepted === 0);
  assert.equal(runtime.status().physical.pending, null); assert.equal(runtime.status().physical.storeClosed, false);
  assert.equal((await ok(observer.call('controller_acquire', {}))).generation, 2);
  const events = fs.readFileSync(path.join(f.d.stateDir, 'receiver/completions.ndjson'), 'utf8').trim().split('\n').map(JSON.parse);
  assert.deepEqual(events.map(e => e.type), ['origin', 'begin', 'complete']);
});

test('owner main signal handler refuses pending shutdown and keeps diagnostics/original completion available', async t => {
  const f = install(t), main = childMain(t, f); await main.event('ipc');
  const client = await ipc(t, f), observer = await ipc(t, f), status = await ok(observer.call('core_status', {}));
  const p = await panel(status.physical.port, f.d); await ok(client.call('controller_acquire', {}));
  const contract = await ok(client.call('get_module_contract', { moduleId: 'project-inspection' }));
  const result = client.call('inspect_module_target', { moduleId: 'project-inspection', contractId: contract.contractId, target: {} });
  await until(async () => (await ok(observer.call('core_status', {}))).physical.pending);
  main.child.send('signal'); await until(() => main.stderr.includes('owner_draining'));
  assert.equal(main.child.exitCode, null); assert.equal((await ok(observer.call('core_diagnostics', {}))).pid, main.child.pid);
  const frame = (await p.request('/poll', {})).value.command; assert.ok(frame);
  assert.equal((await p.request('/complete', completion(frame, vmObservation(f.pkg, frame)))).status, 200);
  assert.equal((await ok(result)).observation.project.saved, false);
  main.child.send('signal'); assert.equal((await main.exit).code, 0); assert.equal(main.stderr, 'owner_draining\n');
});

test('later panel poll after controller detach cannot deliver a queued command and keeps the receiver fenced', async t => {
  const f = install(t), runtime = await directOwner(t, f), client = await ipc(t, f), observer = await ipc(t, f), p = await panel(runtime.status().physical.port, f.d);
  await ok(client.call('controller_acquire', {})); const contract = await ok(client.call('get_module_contract', { moduleId: 'project-inspection' }));
  const result = client.call('inspect_module_target', { moduleId: 'project-inspection', contractId: contract.contractId, target: {} });
  await until(() => runtime.status().physical.pending); const unknown = assert.rejects(result, e => e.code === 'ipc_outcome_uncertain'); client.close(); await unknown;
  await until(() => runtime.status().attachmentOwner.attachments === 1);
  const denied = await p.request('/poll', {}); assert.equal(denied.status, 403); assert.equal(denied.value.error, 'controller_client_detached');
  await until(() => runtime.status().attachmentOwner.accepted === 0); assert.equal(runtime.status().physical.storeClosed, true);
  assert.equal((await observer.call('controller_acquire', {})).code, 'owner_recovery_required');
  const events = fs.readFileSync(path.join(f.d.stateDir, 'receiver/completions.ndjson'), 'utf8').trim().split('\n').map(JSON.parse);
  assert.deepEqual(events.map(e => e.type), ['origin', 'begin', 'unknown']);
});

async function guardedFixture(t, { expireAtBegin = false, beforeSubmit } = {}) {
  const directory = temp(t), installation = { installationId: 'guard-fixture', packageHash: 'a'.repeat(64), panelToken: 'b'.repeat(64), controlToken: 'c'.repeat(64) };
  const als = new AsyncLocalStorage(), asset = { assetKey: 'project-inspection-v1', executorHash: 'd'.repeat(64) };
  let time = 0, checks = 0, owner;
  const peer = createHttpPeer({ installation, directory: path.join(directory, 'receiver'), asset, port: 0, timeout: 2000, pollTimeout: 100,
    captureDeliveryGuard() {
      const context = als.getStore(); if (!context) throw Object.assign(new Error('missing_context'), { code: 'missing_context' });
      return () => { context.assertCurrent(); checks++; if (expireAtBegin && checks === 1) time = 1000; };
    } });
  await peer.listen();
  owner = createAttachmentOwner({ runtime: { status: peer.status, close: peer.close }, clock: () => time, ttlMs: 1000, drainIntervalMs: 1,
    activity() { const status = peer.status(); return { pending: !!status.pending, unresolved: status.storeClosed, fault: status.storeFault }; },
    invoke(method, payload, context) { return als.run(context, async () => { if (beforeSubmit) await beforeSubmit; return peer.inspect(payload); }); } });
  const session = Object.freeze({ clientSessionId: 'guard-session' }); owner.onAttach(session);
  resources(t).closers.push(() => owner.close()); const p = await panel(peer.status().port, installation);
  const call = (method, payload = {}) => owner.onRequest({ session, method, payload });
  await ok(call('controller_acquire'));
  return { directory, peer, owner, p, call, at(value) { time = value; }, checks: () => checks };
}

test('captured lease guard survives absent ALS during a delayed poll and blocks delivery after expiry', async t => {
  const f = await guardedFixture(t), result = f.call('inspect_module_target'); await until(() => f.peer.status().pending); f.at(1000);
  const denied = await f.p.request('/poll', {}); assert.equal(denied.status, 403); assert.equal(denied.value.error, 'controller_lease_expired');
  assert.equal((await result).code, 'owner_outcome_uncertain'); await until(() => f.owner.status().accepted === 0);
  assert.equal(f.peer.status().storeClosed, true); assert.equal(f.checks(), 1);
});

test('active poll delivery checks the captured lease again immediately after store.begin', async t => {
  const f = await guardedFixture(t, { expireAtBegin: true }), waitingPoll = f.p.request('/poll', {});
  await new Promise(resolve => setTimeout(resolve, 10));
  const result = await f.call('inspect_module_target'); assert.equal(result.code, 'owner_outcome_uncertain');
  assert.equal((await waitingPoll).value.command, null); assert.equal(f.peer.status().pending, null); assert.equal(f.peer.status().storeClosed, true);
});

test('lease expiry across a trusted await is checked at physical submit before durable begin', async t => {
  const gate = deferred(), f = await guardedFixture(t, { beforeSubmit: gate.promise });
  const result = f.call('inspect_module_target'); await until(() => f.owner.status().accepted === 1);
  f.at(1000); gate.resolve(); assert.equal((await result).code, 'owner_outcome_uncertain');
  assert.equal(f.peer.status().pending, null); assert.equal(f.peer.status().storeClosed, false); assert.equal(f.checks(), 0);
  assert.deepEqual(fs.readFileSync(path.join(f.directory, 'receiver/completions.ndjson'), 'utf8').trim().split('\n').map(JSON.parse).map(e => e.type), ['origin']);
});

test('no captured controller context rejects before durable begin; original completion remains accepted after lease expiry', async t => {
  const f = await guardedFixture(t);
  assert.throws(() => f.peer.inspect({}), e => e.code === 'missing_context');
  assert.deepEqual(fs.readFileSync(path.join(f.directory, 'receiver/completions.ndjson'), 'utf8').trim().split('\n').map(JSON.parse).map(e => e.type), ['origin']);
  const result = f.call('inspect_module_target'); await until(() => f.peer.status().pending);
  const frame = (await f.p.request('/poll', {})).value.command; assert.ok(frame); assert.equal(f.checks(), 2); f.at(1000);
  const complete = await f.p.request('/complete', completion(frame)); assert.equal(complete.status, 200); assert.equal((await result).ok, true);
  assert.equal(f.checks(), 2); assert.equal(f.peer.status().storeClosed, false); assert.equal(f.peer.status().pending, null);
});

test('owner bootstrap rejects complete-tree tampering before importing a modified Broker', async t => {
  const f = install(t), marker = path.join(f.directory, 'unexpected-import'), file = path.join(f.d.releaseDir, 'core/broker.js');
  fs.writeFileSync(file, "require('node:fs').writeFileSync(" + JSON.stringify(marker) + ",'unexpected');\n" + fs.readFileSync(file, 'utf8'));
  const main = childMain(t, f); assert.equal((await main.exit).code, 1); assert.equal(fs.existsSync(marker), false);
  assert.equal(main.stdout, ''); assert.match(main.stderr, /installed_release_bytes/);
});

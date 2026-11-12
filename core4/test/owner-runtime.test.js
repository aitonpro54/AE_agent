'use strict';
const nodeTest = require('node:test');
// Observation budget for multi-step Windows TEMP install/IPC fixtures;
// production startup, transport and per-RPC deadlines remain independent.
const test = (name, fn) => nodeTest('owner-runtime ' + name, { timeout: 30000 }, fn);
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const vm = require('node:vm');
const { AsyncLocalStorage } = require('node:async_hooks');
const { PassThrough } = require('node:stream');
const { fork, spawn, spawnSync } = require('node:child_process');
const { once } = require('node:events');
const { canonical, hash } = require('../protocol/json');
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
const { decodeMediaInventory } = require('../runtime/media-layer-proof');
const SOURCE = path.resolve(__dirname, '..'), preload = path.join(__dirname, 'fixtures/owner-runtime-child.js');
const EXTRA = ['owner-entry', 'client-entry', 'client-ipc', 'client-stdio', 'controller-lease', 'attachment-owner', 'owner-lifecycle', 'recovery-inspection', 'windows-owner-process', 'owner-maintenance', 'start-over-inspection', 'start-over-process', 'start-over-state', 'start-over-barrier', 'start-over-archive', 'start-over-finisher', 'work-session', 'start-over-panel-control', 'start-over-driver', 'owner-launch'].map(name => 'runtime/' + name + '.js');
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
  const child = spawn(process.execPath, ['--require', preload, path.join(f.d.releaseDir, 'runtime/client-entry.js'), '--client-descriptor', f.clientDescriptor],
    { windowsHide: true, cwd: f.directory, stdio: ['pipe', 'pipe', 'pipe'] });
  const pending = new Map(); let serial = 0, buffer = '', stderr = '';
  const exit = new Promise(resolve => child.once('exit', (code, signal) => resolve({ code, signal })));
  child.stderr.on('data', data => { stderr += data; });
  child.stdout.setEncoding('utf8');
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
async function directOwner(t, f, syntheticReadiness = false) {
  const { startOwner } = require(path.join(f.d.releaseDir, 'runtime/owner-entry.js'));
  const readiness = require(path.join(f.d.releaseDir, 'runtime/ae-readiness.js'));
  const create = readiness.createAeReadiness;
  // The VM panel must not depend on the user's real AE windows.
  if (syntheticReadiness) readiness.createAeReadiness = () => create({ platform: 'fixture' });
  let runtime;
  try { runtime = await startOwner({ descriptor: f.descriptor, port: 0 }); }
  finally { readiness.createAeReadiness = create; }
  resources(t).closers.push(() => runtime.close()); return runtime;
}
function raw(port, route, body) {
  return new Promise((resolve, reject) => {
    const request = http.request({ hostname: '127.0.0.1', port, path: route, method: 'POST', agent: false, headers: { Origin: 'null', 'Content-Type': 'application/json' } }, response => {
      let bytes = ''; response.setEncoding('utf8'); response.on('data', data => { bytes += data; }); response.on('end', () => { try { resolve({ status: response.statusCode, value: JSON.parse(bytes) }); } catch (e) { reject(e); } });
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

test('thin-client preload refuses all nested child factories before native calls and preserves owner hooks in VM', () => {
  const source = fs.readFileSync(preload, 'utf8');
  const names = ['spawn', 'spawnSync', 'exec', 'execSync', 'execFile', 'execFileSync', 'fork'];
  for (const entry of ['client-entry.js', 'owner-entry.js', 'stdio-entry.js']) {
    let nativeCalls = 0, connections = 0, unrefs = 0;
    const originals = Object.fromEntries(names.map(name => [name, () => { nativeCalls++; throw Error('unexpected_native_child_call'); }]));
    const childProcess = { ...originals }, listens = [], reports = [], handlers = new Map();
    class Server {
      constructor(address) { this.location = address; this.events = new Map(); }
      once(name, fn) { this.events.set(name, fn); return this; }
      address() { return this.location; }
      listen(...args) { listens.push(args); this.events.get('listening')?.(); return this; }
    }
    const net = { Server, connect() { connections++; return 'synthetic-ipc'; } }, connect = net.connect;
    const process = { argv: ['node', path.join('fixture', entry)], connected: true,
      send(value) { reports.push(value); }, disconnect() { this.connected = false; },
      channel: { unref() { unrefs++; } }, on(name, fn) { handlers.set(name, fn); },
      emit(name) { reports.push({ event: name }); } };
    vm.runInNewContext(source, { process, require(name) {
      if (name === 'node:net') return net;
      if (name === 'node:path') return path;
      if (name === 'node:child_process') return childProcess;
      assert.fail('unexpected preload import: ' + name);
    } }, { filename: preload, timeout: 1000 });
    if (entry === 'client-entry.js') for (const name of names) {
      assert.throws(() => childProcess[name]('synthetic-child'), error => error.code === 'owner_fixture_nested_process_forbidden', name);
    }
    else for (const name of names) assert.equal(childProcess[name], originals[name], name);
    assert.equal(nativeCalls, 0); assert.equal(net.connect, connect);
    assert.equal(net.connect('synthetic-pipe'), 'synthetic-ipc'); assert.equal(connections, 1);
    const http = new Server({ port: 49152 }); assert.equal(http.listen(3457, '127.0.0.1'), http);
    assert.equal(listens[0][0], 0); assert.equal(listens[0][1], '127.0.0.1');
    const endpoint = "\\\\.\\pipe\\ae-core4-owner-synthetic", ipc = new Server(endpoint); ipc.listen(endpoint);
    assert.equal(listens[1][0], endpoint);
    assert.throws(() => new Server().listen(3457, '0.0.0.0'), /owner_fixture_unexpected_listener/);
    assert.throws(() => new Server().listen(0, '127.0.0.1'), /owner_fixture_unexpected_listener/);
    assert.equal(listens.length, 2); assert.equal(unrefs, 1);
    handlers.get('message')('signal'); assert.equal(reports.at(-1).event, 'SIGTERM');
    http.events.get('close')(); assert.equal(process.connected, true);
    ipc.events.get('close')(); assert.equal(process.connected, false); assert.equal(reports.at(-1).event, 'closed');
    assert.equal(nativeCalls, 0);
  }
});

test('durable project read rejections cross the production owner IPC and stdio without uncertainty or grants', async t => {
  const f = install(t), runtime = await directOwner(t, f), c = rpcProcess(t, f), p = await panel(runtime.status().physical.port, f.d);
  const grant = await c.call('controller_acquire'), contract = await c.call('get_module_contract', { moduleId: 'project-inspection' });
  const journalFile = path.join(f.d.stateDir, 'receiver/completions.ndjson');
  const before = fs.readFileSync(journalFile);
  const missing = await c.rpc('tools/call', { name: 'inspect_module_target', arguments: { payload: { moduleId: 'project-inspection', target: {} } } });
  assert.equal(missing.error.message, 'owner_inspection_contract_required'); assert.deepEqual(missing.error.data, { nextAction: 'get_module_contract' });
  assert.ok(fs.readFileSync(journalFile).equals(before)); assert.equal(runtime.status().attachmentOwner.accepted, 0);
  assert.equal(runtime.status().physical.pending, null);
  for (const code of ['inspection_failed', 'inspection_result_budget', 'host_json_unavailable', 'host_registry_unavailable']) {
    const read = c.rpc('tools/call', { name: 'inspect_module_target', arguments: { payload: { moduleId: 'project-inspection', contractId: contract.contractId, target: {} } } });
    const frame = (await p.request('/poll', {})).value.command; assert.ok(frame);
    assert.equal((await p.request('/complete', completion(frame, { readFailureVersion: 1, outcome: 'rejected', code }))).status, 200);
    const response = await read; assert.equal(response.error, undefined); assert.equal(response.result.isError, true);
    const outcome = JSON.parse(response.result.content[0].text);
    assert.equal(outcome.outcome, 'rejected'); assert.equal(outcome.code, code); assert.equal(outcome.nextAction, 'core_diagnostics');
    assert.equal(outcome.physical.commandId, frame.commandId); assert.equal(outcome.physical.phase, 'inspect');
    assert.equal(outcome.physical.handoff, 'offered'); assert.equal(outcome.physical.nativeStart, 'unknown');
    assert.equal(outcome.physical.terminalReceipt.receiptRef, frame.originalBinding.receiptRef);
    assert.equal(outcome.physical.terminalReceipt.source, code.startsWith('host_') ? 'registry' : 'host');
    const events = fs.readFileSync(journalFile, 'utf8').trim().split('\n').map(JSON.parse);
    assert.equal(events.at(-1).type, 'complete'); assert.equal(events.at(-1).response.result.code, code);
    assert.equal(runtime.status().attachmentOwner.fenced, false); assert.equal(runtime.status().attachmentOwner.accepted, 0);
    assert.equal(runtime.status().physical.pending, null); assert.equal(runtime.status().physical.storeClosed, false);
  }
  const read = c.call('inspect_module_target', { moduleId: 'project-inspection', contractId: contract.contractId, target: {} });
  const frame = (await p.request('/poll', {})).value.command;
  assert.equal((await p.request('/complete', completion(frame, vmObservation(f.pkg, frame)))).status, 200);
  assert.equal((await read).authority, false);
  await c.call('controller_release', { leaseToken: grant.leaseToken });
  assert.deepEqual(fs.readFileSync(journalFile, 'utf8').trim().split('\n').map(JSON.parse).map(e => e.type), ['origin', ...Array(5).fill(['begin', 'complete']).flat()]);
});

test('operator-confirmation owner composition reads a project without requiring a mutation grant', async t => {
  const f = install(t, buildPackage(SOURCE, 'operator-frame-export', { runtimeModel: 'owner' }));
  const runtime = await directOwner(t, f), c = rpcProcess(t, f), p = await panel(runtime.status().physical.port, f.d);
  const status = await c.call('core_status');
  const grant = await c.call('controller_acquire', { sessionId: status.workSession.sessionId });
  const { contractId } = await c.call('get_module_contract', { moduleId: 'project-inspection' });
  const frameContract = await c.call('get_module_contract', { moduleId: 'comp-frame-export' });
  assert.equal(frameContract.operatorConfirmation, 'local-operator-exact-confirmation-v1');
  const read = c.call('inspect_module_target', { moduleId: 'project-inspection', contractId, target: {} });
  await until(() => runtime.status().physical.pending);
  const frame = (await p.request('/poll', {})).value.command;
  assert.equal(frame.phase, 'inspect');
  assert.equal((await p.request('/complete', completion(frame, vmObservation(f.pkg, frame)))).status, 200);
  assert.equal((await read).authority, false);
  await c.call('controller_release', { leaseToken: grant.leaseToken });
  assert.equal(runtime.status().physical.storeClosed, false);
});

test('installed montage CLI scopes one task across controller generations using fresh evidence', async t => {
  const f = install(t, buildPackage(SOURCE, 'operator-photo-montage', { runtimeModel: 'owner' }));
  const runtime = await directOwner(t, f, true), c = rpcProcess(t, f), p = await panel(runtime.status().physical.port, f.d);
  const { workSession } = await c.call('core_status');
  const sessionId = workSession.sessionId ?? f.d.installationId;
  const leaseInput = workSession.sessionId ? { sessionId } : {};
  const projectId = path.join(f.directory, 'fixture.aep');
  const target = { projectId, compId: 8 };
  const input = { ...target, frame: 3, fileName: 'control.png' };
  const projectContract = await c.call('get_module_contract', { moduleId: 'project-inspection' });
  const exportContract = await c.call('get_module_contract', { moduleId: 'comp-frame-export' });
  async function observe(moduleId, contractId, target, snapshot) {
    const reading = c.call('inspect_module_target', { moduleId, contractId, target });
    await until(() => runtime.status().physical.pending);
    const { command } = (await p.request('/poll', {})).value;
    assert.equal(command.phase, 'inspect');
    assert.equal((await p.request('/complete', completion(command, snapshot))).status, 200);
    return reading;
  }
  const root = () => observe('project-inspection', projectContract.contractId, {}, {
    observationVersion: 1, target: { projectId, compId: null }, project: { name: 'fixture.aep', numItems: 1, saved: true },
    compositions: [{ compId: target.compId, name: 'Fixture', numLayers: 0, duration: 1 }],
    layers: [], truncated: false, aeVersion: 'fixture'
  });
  const frame = () => observe('comp-frame-export', exportContract.contractId, target, {
    target, revision: '7', protected: 'fixture', width: 1920, height: 1080, duration: 1, frameDuration: 1 / 25, fullResolution: true
  });
  const request = (evidenceRef, taskId) => ({ oneStep: true, ...(taskId ? { taskId } : {}),
    steps: [{ stepId: 'frame', moduleId: 'comp-frame-export', contractId: exportContract.contractId, evidenceRef, input }] });
  const call = (name, payload) => c.rpc('tools/call', { name, arguments: { payload } });
  const first = await c.call('controller_acquire', leaseInput);
  await c.call('core_connect');
  await root();
  const mediaContract = await c.call('get_module_contract', { moduleId: 'media-import' });
  const mediaTarget = { projectId, sessionId };
  const rows = Array.from({ length: 1079 }, (_, i) => [i + 1, 'Кадр "🚀" А ' + 'Ф'.repeat(15) + i, 0, 0, '']);
  const inventory = { target: mediaTarget, revision: '7', protected: projectId, inventory: JSON.stringify([1, [], rows]) };
  assert.ok(Buffer.byteLength(canonical(inventory)) > 65536);
  const wide = await observe('media-import', mediaContract.contractId, mediaTarget, inventory);
  assert.equal(wide.snapshot.inventory, inventory.inventory);
  const overlayContract = await c.call('get_module_contract', { moduleId: 'layer-overlay' });
  const refused = call('inspect_module_target', { moduleId: 'layer-overlay', contractId: overlayContract.contractId,
    target: { ...mediaTarget, compId: target.compId, layerId: 9, originalSourceId: 10 } });
  await until(() => runtime.status().physical.pending);
  const overlayFrame = (await p.request('/poll', {})).value.command;
  assert.equal((await p.request('/complete', completion(overlayFrame,
    { readFailureVersion: 1, outcome: 'rejected', code: 'layer_overlay_layer_profile' }))).status, 200);
  const refusal = (await refused).result;
  assert.equal(refusal.isError, true);
  assert.equal(JSON.parse(refusal.content[0].text).code, 'layer_overlay_layer_profile');
  assert.equal(runtime.status().physical.storeClosed, false);
  const { evidenceRef } = await frame();
  const built = await c.call('build_solution_plan', request(evidenceRef));
  const proposal = await c.call('propose_plan', { buildId: built.buildId });
  const file = path.join(f.directory, 'mandate.json');
  const scope = { taskId: built.taskId, taskEpoch: 0, sessionId, projectId, expiresAt: Date.now() + 60000,
    actions: [{ moduleId: 'comp-frame-export', input }] };
  const cli = (action, value) => spawnSync(process.execPath, [path.join(f.d.releaseDir, 'runtime/operator-confirmation.js'),
    f.descriptor, f.d.packageHash, action, value], { encoding: 'utf8', windowsHide: true, timeout: 5000 });
  fs.writeFileSync(file, JSON.stringify({ ...scope, sessionId: 'foreign-session' }));
  assert.match(cli('--montage-issue', file).stderr, /operator_confirmation_baseline/);
  fs.writeFileSync(file, JSON.stringify(scope));
  const issued = cli('--montage-issue', file);
  assert.equal(issued.status, 0, issued.stderr);
  assert.equal(JSON.parse(issued.stdout).taskId, built.taskId);
  await c.call('controller_release', { leaseToken: first.leaseToken });
  const second = await c.call('controller_acquire', leaseInput);
  assert.equal((await call('dry_run_plan', { proposalId: proposal.proposalId })).error.message, 'owner_reference_generation');
  assert.equal((await call('build_solution_plan', request(evidenceRef, built.taskId))).error.message, 'owner_reference_generation');
  await root();
  const fresh = await frame();
  assert.equal((await c.call('build_solution_plan', request(fresh.evidenceRef, built.taskId))).taskId, built.taskId);
  const revoked = cli('--montage-revoke', built.taskId);
  assert.equal(revoked.status, 0, revoked.stderr);
  assert.equal(JSON.parse(revoked.stdout).revoked, true);
  await c.call('controller_release', { leaseToken: second.leaseToken });
  const third = await c.call('controller_acquire', leaseInput);
  await root();
  const reread = await frame();
  assert.equal((await call('build_solution_plan', request(reread.evidenceRef, built.taskId))).error.message, 'owner_reference_generation');
  await c.call('controller_release', { leaseToken: third.leaseToken });
  assert.equal(runtime.status().physical.storeClosed, false);
});

async function syntheticHostProcess(t) {
  const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore', windowsHide: true });
  const exit = once(child, 'exit');
  const stop = async () => { if (child.exitCode === null && child.signalCode === null) child.kill(); await exit; };
  resources(t).closers.push(stop);
  const { observeOwnerProcess } = require('../runtime/windows-owner-process');
  const observed = await observeOwnerProcess(child.pid);
  assert.equal(observed.status, 'present');
  const ticks = BigInt(observed.birthTicks) - 621355968000000000n;
  const birth = new Date(Number(ticks / 10000n)).toISOString().slice(0, -1) + String(ticks % 10000n).padStart(4, '0') + 'Z';
  return { pid: child.pid, birth, executablePath: observed.executablePath, stop };
}

async function adoptedOwner(t, f, projectId) {
  const { pid, birth, executablePath } = await syntheticHostProcess(t);
  const executableHash = hash(fs.readFileSync(executablePath));
  const expected = { machineId: f.d.machineId, aePid: pid, aeProcessBirth: birth, executablePath, executableHash };
  const windows = require(path.join(f.d.releaseDir, 'runtime/windows-reservation-provider.js'));
  const originalFactory = windows.createWindowsReservationProvider;
  let provider, runtime;
  windows.createWindowsReservationProvider = options => (provider = originalFactory({ ...options, probe: async () => ({
    version: 1, observedAt: new Date().toISOString(), hostname: f.d.machineId,
    processes: [{ pid, birth, executablePath, executableHash }],
    endpoints: [{ port: 3456, state: 'observed-absent' }, { port: 8787, state: 'observed-absent' }], completedAt: Date.now()
  }) }));
  try { runtime = await directOwner(t, f, true); }
  finally { windows.createWindowsReservationProvider = originalFactory; }
  const adoption = await provider.adopt({ expected, allowedProject: projectId, rootObservationDigest: '6'.repeat(64) });
  assert.equal(adoption.adopted, true);
  return { runtime, adoption };
}

async function ownerVm(t, f, runtime, host) {
  const client = rpcProcess(t, f), p = await panel(runtime.status().physical.port, f.d);
  const { sessionId } = (await client.call('core_status')).workSession;
  await client.call('controller_acquire', sessionId ? { sessionId } : {});
  await client.call('core_connect');
  const context = vm.createContext({ ...host, JSON: undefined, confirm: () => true });
  vm.runInContext(Buffer.from(f.pkg.files['cep/jsx/registry.jsx'], 'base64').toString('utf8'), context);
  async function deliver(phase, expect = 200, beforeNative = () => {}) {
    await until(() => runtime.status().physical.pending);
    const frame = (await p.request('/poll', {})).value.command;
    assert.equal(frame.phase, phase);
    beforeNative(frame);
    context.serialized = canonical(frame);
    const result = JSON.parse(vm.runInContext('AECore4Host.dispatch(serialized)', context));
    const sent = completion(frame, result);
    const reply = await p.request('/complete', sent);
    assert.equal(reply.status, expect, JSON.stringify(reply));
    if (expect === 200) assert.equal(reply.value.ack.receiptRef, frame.originalBinding.receiptRef);
    return { frame, result, sent, reply };
  }
  return { client, p, sessionId: sessionId ?? f.d.installationId, deliver };
}

const records = file => fs.readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);

nodeTest('owner-runtime media lock survives owner EOF until the adopted host exits',
  { timeout: 15000, skip: process.platform !== 'win32' }, async t => {
    const directory = temp(t);
    const sourceDir = path.join(directory, 'approved');
    const file = path.join(sourceDir, 'source.png');
    fs.mkdirSync(sourceDir);
    const bytes = Buffer.from('approved image bytes');
    fs.writeFileSync(file, bytes);
    const proof = { bytes: bytes.length, modifiedMs: Math.floor(fs.statSync(file).mtimeMs) };
    const host = await syntheticHostProcess(t);
    const origin = { aePid: host.pid, aeProcessBirth: host.birth };
    const source = `const { lockImportFile } = require(process.argv[1]);
      lockImportFile(...JSON.parse(process.argv[2])).then(() => console.log('held'), error => {
        console.error(error); process.exitCode = 1;
      });`;
    const owner = spawn(process.execPath, ['-e', source, require.resolve('../runtime/media-layer-proof'),
      JSON.stringify([{ file, sha256: hash(bytes) }, proof, origin])], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    const ownerExit = once(owner, 'exit');
    resources(t).closers.push(async () => { if (owner.exitCode === null && owner.signalCode === null) owner.kill(); await ownerExit; });
    let out = '', err = '';
    owner.stdout.setEncoding('utf8').on('data', chunk => { out += chunk; });
    owner.stderr.setEncoding('utf8').on('data', chunk => { err += chunk; });
    await once(owner, 'close');
    assert.equal(owner.exitCode, 0, err);
    assert.equal(out.trim(), 'held');
    const denied = { code: /^(EPERM|EACCES|EBUSY)$/ };
    assert.throws(() => fs.writeFileSync(file, Buffer.alloc(bytes.length)), denied);
    assert.throws(() => fs.renameSync(sourceDir, path.join(directory, 'renamed')), denied);
    assert.deepEqual(fs.readFileSync(file), bytes);
    await host.stop();
    await until(() => {
      try { fs.closeSync(fs.openSync(file, 'r+')); return true; }
      catch (error) { assert.match(error.code, denied.code); return false; }
    });
  });

nodeTest('owner-runtime installed montage locks approved bytes, binds receipts and returns bounded task outcomes',
  { timeout: 45000, skip: process.platform !== 'win32' }, async t => {
    const f = install(t, buildPackage(SOURCE, 'operator-photo-montage', { runtimeModel: 'owner' }));
    const state = { projectId: path.join(f.directory, 'Стальной снимок.aep'), fixtureDirectory: f.directory,
      flags: { importOnDemand: true, twoImports: true, items: 1109, montageCapacity: true, longOverlayLayers: 12 } };
    fs.writeFileSync(state.projectId, 'synthetic AEP');
    const outputDir = path.join(f.directory, 'frames-output');
    fs.mkdirSync(outputDir);
    const host = require('./fixtures/montage-host').overlayEnvironment(state);
    state.comp.width = state.comp.height = 1;
    const { runtime, adoption } = await adoptedOwner(t, f, state.projectId);
    const { client, p, sessionId, deliver } = await ownerVm(t, f, runtime, host);
    const locks = [];
    function checkMediaLock(frame) {
      if (!['media-import-v1', 'layer-overlay-v1'].includes(frame.assetKey)) return;
      const { file, sha256 } = frame.typedPayload;
      const bytes = fs.readFileSync(file);
      assert.equal(hash(bytes), sha256);
      assert.throws(() => fs.writeFileSync(file, Buffer.alloc(bytes.length, 0x78)), { code: /^(EPERM|EACCES|EBUSY)$/ });
      assert.deepEqual(fs.readFileSync(file), bytes);
      locks.push(file);
    }
    const contracts = {};
    for (const id of ['project-inspection', 'media-import', 'layer-overlay', 'comp-frame-export'])
      contracts[id] = (await client.call('get_module_contract', { moduleId: id })).contractId;
    async function inspect(moduleId, target) {
      const pending = client.call('inspect_module_target', { moduleId, contractId: contracts[moduleId], target });
      await deliver('inspect');
      return pending;
    }
    await inspect('project-inspection', { compId: state.comp.id, includeLayerContext: true });
    const projectId = state.projectId;
    const preflightResult = await inspect('media-import', { projectId, sessionId });
    const { snapshot: preflight } = preflightResult;
    assert.ok(preflight, JSON.stringify(preflightResult));
    const [version, directories, rows] = JSON.parse(preflight.inventory);
    assert.equal(version, 2);
    assert.equal(directories.length, 15);
    assert.equal(rows.filter(row => row.length === 2).length, 933);
    assert.equal(rows.filter(row => row.length === 5).length, 176);
    let previousId = 0;
    const v1Rows = rows.map(([delta, name, ...fields]) => {
      previousId += delta;
      return fields.length ? [previousId, name, ...fields] : [previousId, name || null, 0, 0, ''];
    });
    const v1 = { ...preflight, inventory: JSON.stringify([1, directories, v1Rows]) };
    const decoded = decodeMediaInventory(preflight.inventory);
    assert.equal(decoded.filter(item => item.kind === 'still').length, 119);
    assert.equal(decoded.filter(item => item.kind === 'av').length, 57);
    assert.deepEqual(decodeMediaInventory(v1.inventory), decoded);
    const projectedIntentBytes = snapshot => Buffer.byteLength(canonical(snapshot)) + 8192 +
      2 * Buffer.byteLength(canonical(snapshot.inventory));
    const oldProjectedBytes = projectedIntentBytes(v1), newProjectedBytes = projectedIntentBytes(preflight);
    assert.ok(oldProjectedBytes > 224 * 1024 && newProjectedBytes < 216 * 1024, `${oldProjectedBytes} → ${newProjectedBytes}`);
    t.diagnostic(`mixed 1109-item fixture prospective intent v1=${oldProjectedBytes}, v2=${newProjectedBytes} bytes`);
    const importInput = item => ({ projectId, sessionId, file: item.file.fsName, sha256: hash(fs.readFileSync(item.file.fsName)) });
    const first = importInput(state.replacement), second = importInput(state.second);
    const overlay = { ...first, compId: state.comp.id, layerId: state.original.id, originalSourceId: state.originalSource.id };
    const png = { projectId, compId: state.comp.id, frame: 3, fileName: 'control.png' };
    async function build(moduleId, target, input, taskId) {
      const { evidenceRef } = await inspect(moduleId, target);
      return client.call('build_solution_plan', { oneStep: true, ...(taskId ? { taskId } : {}),
        steps: [{ stepId: 'operation', moduleId, contractId: contracts[moduleId], evidenceRef, input }] });
    }
    async function proposal(plan) {
      const { proposalId } = await client.call('propose_plan', { buildId: plan.buildId });
      const { dryrunRef } = await client.call('dry_run_plan', { proposalId });
      return { proposalId, dryrunRef };
    }
    const fileTarget = ({ projectId, sessionId, file }) => ({ projectId, sessionId, file });
    const duplicate = importInput(state.originalSource);
    const { evidenceRef: duplicateEvidence } = await inspect('media-import', fileTarget(duplicate));
    const receiverPath = path.join(f.d.stateDir, 'receiver/completions.ndjson');
    const ledgerPath = path.join(f.d.stateDir, 'broker/ledger.ndjson');
    const receiverBeforeDuplicate = fs.readFileSync(receiverPath), ledgerBeforeDuplicate = records(ledgerPath).length;
    const refusedDuplicate = await client.rpc('tools/call', { name: 'build_solution_plan', arguments: { payload: {
      oneStep: true, steps: [{ stepId: 'duplicate', moduleId: 'media-import', contractId: contracts['media-import'],
        evidenceRef: duplicateEvidence, input: duplicate }]
    } } });
    assert.deepEqual(refusedDuplicate.error, { code: -32000, message: 'media_already_imported' });
    assert.deepEqual(fs.readFileSync(receiverPath), receiverBeforeDuplicate);
    assert.deepEqual(records(ledgerPath).slice(ledgerBeforeDuplicate).map(record => record.type), ['task']);
    assert.deepEqual((await client.call('core_status')).attachmentOwner.activity, { pending: false, unresolved: false, fault: false });
    assert.equal(state.project.numItems, 1109);
    const firstPlan = await build('media-import', fileTarget(first), first);
    const { taskId } = firstPlan;
    const { issueMontageMandate, revokeMontageMandate } = require(path.join(f.d.releaseDir, 'runtime/montage-mandate.js'));
    const actions = [{ moduleId: 'media-import', input: first }, { moduleId: 'media-import', input: second },
      { moduleId: 'layer-overlay', input: overlay }, { moduleId: 'comp-frame-export', input: png }];
    const scope = { taskId, taskEpoch: 0, sessionId, projectId, expiresAt: Date.now() + 60000, actions };
    const mandate = issueMontageMandate(f.d, scope);
    const captures = [];
    async function apply(plan) {
      const pending = client.call('run_plan', await proposal(plan));
      await deliver('inspect');
      captures.push(await deliver('mutate', 200, checkMediaLock));
      const value = await pending;
      assert.equal(value.state, 'succeeded', JSON.stringify(value));
      return value.outputs.operation;
    }
    const imported = await apply(firstPlan);
    assert.equal(decodeMediaInventory(imported.inventory).length, 1110);
    assert.equal(imported.createdItemId, state.replacement.id);
    const overlayTarget = { projectId, sessionId, compId: overlay.compId, layerId: overlay.layerId,
      originalSourceId: overlay.originalSourceId, itemId: imported.createdItemId };
    const applied = await apply(await build('layer-overlay', overlayTarget, { ...overlay, itemId: imported.createdItemId }, taskId));
    assert.equal(applied.overlay.sourceId, imported.createdItemId);
    assert.equal(state.original.source.id, state.originalSource.id);
    const secondImport = await apply(await build('media-import', fileTarget(second), second, taskId));
    assert.equal(decodeMediaInventory(secondImport.inventory).length, 1111);
    const pngTarget = { projectId, compId: state.comp.id };
    const rendered = await apply(await build('comp-frame-export', pngTarget, png, taskId));
    assert.equal(rendered.output.file, path.join(outputDir, png.fileName));
    assert.deepEqual(locks, [first.file, first.file, second.file]);
    const next = await proposal(await build('comp-frame-export', pngTarget, { ...png, fileName: 'revoked.png' }, taskId));
    revokeMontageMandate(f.d, taskId);
    const stopped = client.call('run_plan', next);
    await deliver('inspect');
    const refusal = await stopped;
    assert.equal(refusal.state, 'stopped');
    assert.equal(refusal.code, 'montage_mandate_revoked');
    assert.equal(refusal.task.commands.length, captures.length);
    assert.ok(refusal.task.commands.every(command => command.afterOmitted === true));
    const firstReceipt = await client.call('get_task', { taskId, commandId: captures[0].frame.commandId });
    assert.equal(firstReceipt.commands[0].after.inventory, imported.inventory);
    assert.equal(fs.existsSync(path.join(outputDir, 'revoked.png')), false);
    const receiverFile = path.join(f.d.stateDir, 'receiver/completions.ndjson');
    const ledgerFile = path.join(f.d.stateDir, 'broker/ledger.ndjson');
    const receiver = records(receiverFile), ledger = records(ledgerFile);
    const receiverMax = Math.max(...fs.readFileSync(receiverFile, 'utf8').trimEnd().split('\n').map(line => Buffer.byteLength(line)));
    const ledgerMax = Math.max(...fs.readFileSync(ledgerFile, 'utf8').trimEnd().split('\n').map(line => Buffer.byteLength(line)));
    assert.ok(receiverMax < 256 * 1024 && ledgerMax < 256 * 1024);
    t.diagnostic(`receiver max=${receiverMax}, broker ledger max=${ledgerMax}, owner run output=${Buffer.byteLength(canonical(imported))} bytes`);
    assert.equal(receiver.filter(row => row.type === 'begin' && row.command.phase === 'mutate').length, 4);
    for (const { frame, result } of captures) {
      const begin = receiver.find(row => row.type === 'begin' && row.commandId === frame.commandId);
      const complete = receiver.find(row => row.type === 'complete' && row.commandId === frame.commandId);
      const intent = ledger.find(row => row.type === 'intent' && row.commandId === frame.commandId);
      assert.deepEqual(begin.originalBinding, frame.originalBinding);
      assert.deepEqual(intent.dispatchBinding, frame.originalBinding);
      assert.equal(intent.grant.operatorConfirmation.mandateDigest, mandate.digest);
      const reservation = ledger.find(row => row.type === 'reservation' && row.state === 'reserved' &&
        row.reservation.ref === intent.grant.reservationRef);
      assert.equal(reservation.reservation.adoptionDigest, adoption.adoptionDigest);
      assert.deepEqual(complete.response.result.transactionReceipt, result.transactionReceipt);
      assert.equal(result.transactionReceipt.checkpointRef, intent.checkpoint.ref);
      if (frame.assetKey === 'media-import-v1') {
        assert.equal(intent.input.expectedInventory, intent.before.inventory);
        assert.equal(intent.physicalInput.expectedInventory, intent.before.inventory);
      }
      if (frame.assetKey === 'layer-overlay-v1') assert.ok(Buffer.byteLength(intent.before.revision) > 8192);
      assert.ok(ledger.some(row => row.type === 'command' && row.commandId === frame.commandId && row.state === 'succeeded'));
    }
    const inspectHistory = require(path.join(f.d.releaseDir, 'runtime/start-over-inspection.js')).inspectStartOverHistory;
    const history = inspectHistory({ installationId: f.d.installationId, machineId: f.d.machineId, descriptorPath: f.descriptor,
      receiverBytes: fs.readFileSync(receiverFile), ledgerBytes: fs.readFileSync(ledgerFile) });
    assert.equal(history.archiveEligibleHistory, true, JSON.stringify(history.blockedConstraints));
    assert.equal(history.requiresAEExit, false);
    const faultInput = { ...png, fileName: 'partial.png' };
    const faultPlan = await build('comp-frame-export', pngTarget, faultInput);
    issueMontageMandate(f.d, { ...scope, taskId: faultPlan.taskId, actions: [{ moduleId: 'comp-frame-export', input: faultInput }] });
    const faultRun = await proposal(faultPlan);
    state.flags.truncatedPng = true;
    const fault = client.rpc('tools/call', { name: 'run_plan', arguments: { payload: faultRun } });
    await deliver('inspect');
    const { frame, sent } = await deliver('mutate', 403);
    assert.equal((await fault).error.message, 'owner_outcome_uncertain');
    assert.equal((await p.request('/complete', sent)).value.error, 'unknown_no_promotion');
    const retry = await client.rpc('tools/call', { name: 'run_plan', arguments: { payload: faultRun } });
    assert.equal(retry.error.message, 'owner_recovery_required');
    const retained = await client.call('get_task', { taskId: faultPlan.taskId, commandId: frame.commandId });
    assert.equal(retained.commands[0].state, 'UNKNOWN');
    assert.ok(records(receiverFile).some(row => row.type === 'unknown' && row.commandId === frame.commandId));
    assert.equal(runtime.status().physical.storeClosed, true);
  });

nodeTest('owner-runtime installed layer insertion refuses wide inspection and intent before any mutation offer',
  { timeout: 30000, skip: process.platform !== 'win32' }, async t => {
    const f = install(t, buildPackage(SOURCE, 'manual-media-layers', { runtimeModel: 'owner' }));
    const state = { projectId: path.join(f.directory, 'Слои.aep'), fixtureDirectory: f.directory,
      flags: { items: 1079, wideStack: 68 } };
    fs.writeFileSync(state.projectId, 'synthetic AEP');
    const host = require('./fixtures/media-layer-host').mediaEnvironment(state);
    const runtime = await directOwner(t, f);
    const { client, sessionId, deliver } = await ownerVm(t, f, runtime, host);
    const moduleId = 'layer-insert';
    const { contractId } = await client.call('get_module_contract', { moduleId });
    const target = { projectId: state.projectId, sessionId, compId: state.comp.id, layerId: state.anchor.id, itemId: state.stock.id };
    const read = client.rpc('tools/call', { name: 'inspect_module_target', arguments: { payload: { moduleId, contractId, target } } });
    const rejected = await deliver('inspect');
    const refusal = await read;
    assert.equal(refusal.result?.isError, true, JSON.stringify(refusal));
    assert.equal(JSON.parse(refusal.result.content[0].text).code, 'inspection_result_budget');
    assert.equal(rejected.result.code, 'inspection_result_budget');
    state.comp.stack.splice(0, 8);
    const inspect = client.call('inspect_module_target', { moduleId, contractId, target });
    await deliver('inspect');
    const { evidenceRef } = await inspect;
    assert.equal(typeof evidenceRef, 'string');
    const input = { ...target, name: 'Новый слой', placement: 'above', startFrame: 12, inFrame: 18,
      outFrame: 72, position: [160, 90], scale: [80, 80] };
    const plan = await client.rpc('tools/call', { name: 'build_solution_plan', arguments: { payload: {
      oneStep: true, steps: [{ stepId: 'insert', moduleId, contractId, evidenceRef, input }]
    } } });
    assert.ok(plan.error);
    assert.equal(state.comp.numLayers, 60);
    const receiver = records(path.join(f.d.stateDir, 'receiver/completions.ndjson'));
    const completion = receiver.find(row => row.type === 'complete' && row.commandId === rejected.frame.commandId);
    assert.deepEqual(completion.response.result, rejected.result);
    assert.ok(receiver.filter(row => row.type === 'begin').every(row => row.command.phase === 'inspect'));
    assert.ok(records(path.join(f.d.stateDir, 'broker/ledger.ndjson')).every(row => row.type !== 'intent'));
  });

function seedCompletedWorkSessionFixture(f) {
  // Only the pre-existing reset records are synthetic. The initial baseline
  // below must come through the installed Owner and the signed VM panel.
  const { randomUUID, createHmac } = require('node:crypto');
  const resetId = randomUUID(), sessionId = randomUUID(), intentHash = 'a'.repeat(64);
  const tx = path.join(f.d.installRoot, 'transactions', resetId + '-start-over');
  const key = createHmac('sha256', Buffer.from(f.d.panelToken, 'hex')).update('ae-core4/start-over-key/v1\0')
    .update(Buffer.from(f.d.controlToken, 'hex')).digest();
  const descriptorHash = hash(fs.readFileSync(f.descriptor));
  const seal = (kind, fields) => {
    const body = { version: 1, kind, descriptorHash, installationId: f.d.installationId, machineId: f.d.machineId, ...fields };
    return canonical({ body, mac: createHmac('sha256', key).update('ae-core4/start-over-record/v1\0' + canonical(body)).digest('hex') });
  };
  fs.mkdirSync(tx);
  const master = seal('work-session', { resetId, sessionId, intentHash, baselineRequired: true });
  fs.writeFileSync(path.join(tx, 'session-candidate.json'), master);
  fs.linkSync(path.join(tx, 'session-candidate.json'), path.join(f.d.stateDir, 'work-session.json'));
  const completed = seal('start-over-completed', { id: resetId, intentHash, archiveManifestHash: 'b'.repeat(64), sessionHash: hash(master), baselineRequired: true });
  fs.writeFileSync(path.join(tx, 'reset-completed.json'), completed);
  fs.writeFileSync(path.join(tx, 'enable-intent.json'), seal('start-over-enable-intent', { id: resetId, intentHash, completedHash: hash(completed) }));
}

for (const [selector, enabled] of [['operator-r1-minimal', true], ['operator-project-lifecycle', false]]) {
  nodeTest('owner-runtime installed ' + selector + ' enforces R1 admission without montage',
    { timeout: 45000, skip: process.platform !== 'win32' }, async t => {
      const f = install(t, buildPackage(SOURCE, selector, { runtimeModel: 'owner' }));
      assert.equal(f.pkg.files['runtime/montage-mandate.js'], undefined);
      seedCompletedWorkSessionFixture(f);
      const state = { projectId: path.join(f.directory, 'Source.aep'), flags: { clean: true, allowRenderCopy: true } };
      const { lifecycleEnvironment, original } = require('./fixtures/project-lifecycle-host');
      const host = lifecycleEnvironment(state), destination = path.join(f.directory, 'render-copy', 'Copy.aep');
      host.app.version = '26-fixture';
      const { runtime } = await adoptedOwner(t, f, state.projectId);
      const { client, sessionId, deliver } = await ownerVm(t, f, runtime, host);
      const project = await client.call('get_module_contract', { moduleId: 'project-inspection' });
      const baseline = client.call('inspect_module_target', { moduleId: project.moduleId, contractId: project.contractId, target: {} });
      await deliver('inspect');
      const observed = await baseline;
      assert.equal(observed.observation?.target.projectId, state.projectId, JSON.stringify(observed));
      const names = (await client.rpc('tools/list')).result.tools.map(item => item.name);
      assert.equal(names.includes('render_job_prepare'), enabled);
      const moduleId = 'project-lifecycle', contract = await client.call('get_module_contract', { moduleId });
      const { contractId } = contract, target = { projectId: state.projectId, sessionId };
      assert.equal(contract.operatorConfirmation, 'local-operator-exact-confirmation-v1');
      const inspect = client.call('inspect_module_target', { moduleId, contractId, target });
      await deliver('inspect');
      const { evidenceRef } = await inspect;
      const input = { ...target, action: 'stage-render-copy', destination,
        render: { compId: 20, fps: '30000/1001', audio: false, startFrame: 151, endFrameExclusive: 239,
          output: path.join(f.directory, 'result.mp4') } };
      const { taskId, buildId } = await client.call('build_solution_plan', { oneStep: true,
        steps: [{ stepId: 'stage', moduleId, contractId, evidenceRef, input }] });
      const proposal = await client.call('propose_plan', { buildId });
      assert.equal(proposal.confirmationRequired, true);
      const { issue } = require(path.join(f.d.releaseDir, 'runtime/operator-confirmation.js'));
      issue(f.d, { sessionId, proposalId: proposal.proposalId, approvalDigest: proposal.operatorApprovalDigest });
      const { dryrunRef } = await client.call('dry_run_plan', { proposalId: proposal.proposalId });
      const pending = client.call('run_plan', { proposalId: proposal.proposalId, dryrunRef });
      await deliver('inspect');
      if (enabled) {
        const early = pending.then(value => { assert.fail('render-copy ended before offer: ' + JSON.stringify(value)); });
        const { frame, result } = await Promise.race([deliver('mutate'), early]);
        assert.equal(result.outcome, 'applied');
        assert.equal((await pending).state, 'succeeded');
        const toolchain = Object.fromEntries(Object.entries({ engine: 'aerender.exe', ffmpeg: 'ffmpeg.exe', ffprobe: 'ffprobe.exe' })
          .map(([role, name]) => {
            const file = path.join(f.directory, name);
            fs.writeFileSync(file, name);
            return [role, { path: file, sha256: hash(name) }];
          }));
        fs.writeFileSync(path.join(f.d.stateDir, 'render-job-toolchain.json'), canonical(toolchain));
        const prepared = await client.call('render_job_prepare', { taskId, commandId: frame.commandId });
        assert.equal(prepared.state, 'prepared', JSON.stringify(prepared));
        assert.equal((await client.call('render_job_cancel', { id: prepared.id })).state, 'cancelled');
        assert.equal(state.writes, 2);
        assert.ok(fs.existsSync(destination));
      } else {
        assert.equal((await pending).code, 'lifecycle_render_policy');
        assert.equal(state.writes, 0);
        assert.equal(fs.existsSync(path.dirname(destination)), false);
        assert.ok(records(path.join(f.d.stateDir, 'receiver/completions.ndjson')).filter(row => row.type === 'begin')
          .every(row => row.command.phase === 'inspect'));
      }
      assert.deepEqual(fs.readFileSync(state.projectId), original);
    });
}

nodeTest('owner-runtime installed lifecycle retains open observation and both checkpoints after disk proof fails',
  { timeout: 30000, skip: process.platform !== 'win32' }, async t => {
    const f = install(t, buildPackage(SOURCE, 'manual-project-lifecycle', { runtimeModel: 'owner' }));
    const state = { projectId: path.join(f.directory, 'Source.aep'), flags: { clean: true, diskChangedAfterOpen: true } };
    const { lifecycleEnvironment, original, working } = require('./fixtures/project-lifecycle-host');
    const host = lifecycleEnvironment(state), destination = path.join(f.directory, 'Target.aep');
    fs.writeFileSync(destination, working);
    const { runtime } = await adoptedOwner(t, f, state.projectId);
    const { client, sessionId, deliver } = await ownerVm(t, f, runtime, host);
    const moduleId = 'project-lifecycle', { contractId } = await client.call('get_module_contract', { moduleId });
    const target = { projectId: state.projectId, sessionId };
    const inspect = client.call('inspect_module_target', { moduleId, contractId, target });
    await deliver('inspect');
    const { evidenceRef } = await inspect;
    const input = { ...target, action: 'open', destination, expectedDestinationSha256: hash(working) };
    const { taskId, buildId } = await client.call('build_solution_plan', { oneStep: true,
      steps: [{ stepId: 'open', moduleId, contractId, evidenceRef, input }] });
    const { proposalId } = await client.call('propose_plan', { buildId });
    const { dryrunRef } = await client.call('dry_run_plan', { proposalId });
    const run = client.rpc('tools/call', { name: 'run_plan', arguments: { payload: { proposalId, dryrunRef } } });
    await deliver('inspect');
    const { frame, result, reply } = await deliver('mutate', 403);
    assert.equal(result.outcome, 'applied');
    assert.equal(reply.value.error, 'lifecycle_disk_proof_unavailable');
    assert.equal((await run).error.message, 'owner_outcome_uncertain');
    const { commands } = await client.call('get_task', { taskId, commandId: frame.commandId });
    assert.equal(commands[0].state, 'UNKNOWN');
    const outcome = (await client.call('core_status')).physical.lastCommandOutcome;
    assert.deepEqual(outcome.openObservation, { currentProject: destination, dirty: false, diskVerified: false });
    const receiver = records(path.join(f.d.stateDir, 'receiver/completions.ndjson')).filter(row => row.commandId === frame.commandId);
    const intent = records(path.join(f.d.stateDir, 'broker/ledger.ndjson')).find(row => row.type === 'intent' && row.commandId === frame.commandId);
    assert.deepEqual(receiver.map(row => row.type), ['begin', 'unknown']);
    assert.deepEqual(receiver[0].originalBinding, intent.dispatchBinding);
    const checkpoint = path.join(f.d.stateDir, 'project-save-checkpoints', intent.checkpoint.ref);
    assert.deepEqual(fs.readFileSync(checkpoint + '.aep'), original);
    assert.deepEqual(fs.readFileSync(checkpoint + '.open.aep'), working);
    const retry = await client.rpc('tools/call', { name: 'run_plan', arguments: { payload: { proposalId, dryrunRef } } });
    assert.equal(retry.error.message, 'owner_recovery_required');
    assert.equal(state.opens, 1);
  });

test('only a Broker-issued fresh dry-run refusal crosses the owner boundary as a known refusal', async () => {
  const { Broker } = require('../core/broker');
  const proposalId = 'proposal', dryrunRef = 'dryrun';
  const broker = { proposal: () => ({ plan: { taskEpoch: 1 } }), dryruns: new Map([[dryrunRef, {
    proposalId, taskEpoch: 1, createdAt: Date.now() - 6000
  }]]) };
  const values = { inspect: { evidenceRef: 'evidence' }, build: { buildId: 'build', taskId: 'task' },
    propose: { proposalId }, dryrun: { dryrunRef } };
  let forged = false;
  const owner = createAttachmentOwner({ runtime: { status: () => ({}), close: async () => {} },
    activity: () => ({ pending: false, unresolved: false, fault: false }), isFreshDryrunRefusal: Broker.isFreshDryrunRefusal,
    invoke(method, payload) {
      if (method !== 'run') return values[method];
      if (forged) throw Object.assign(new Error('fresh_dryrun_required'), { code: 'fresh_dryrun_required' });
      return Broker.prototype.run.call(broker, payload);
    } });
  const session = {};
  owner.onAttach(session);
  const call = (method, payload = {}) => owner.onRequest({ session, method, payload });
  await ok(call('controller_acquire'));
  await ok(call('inspect_module_target', { contractId: 'a'.repeat(64) }));
  await ok(call('build_solution_plan', { steps: [{ evidenceRef: 'evidence' }] }));
  await ok(call('propose_plan', { buildId: 'build' }));
  await ok(call('dry_run_plan', { proposalId }));
  assert.deepEqual(await call('run_plan', { proposalId, dryrunRef }), { ok: false, code: 'fresh_dryrun_required' });
  forged = true;
  assert.equal((await call('run_plan', { proposalId, dryrunRef })).code, 'owner_outcome_uncertain');
  await owner.close();
});

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

async function closeFixture(t, ownerMode = false) {
  const f = install(t, ownerMode ? testPackage() : buildPackage(SOURCE, 'readonly'));
  const peerModule = require(path.join(f.d.releaseDir, 'integrations/cep/http-peer.js'));
  const brokerModule = require(path.join(f.d.releaseDir, 'core/broker.js'));
  const readiness = require(path.join(f.d.releaseDir, 'runtime/ae-readiness.js'));
  const originalPeer = peerModule.createHttpPeer, OriginalBroker = brokerModule.Broker, originalReadiness = readiness.createAeReadiness;
  let resolve, reject, physical, broker, physicalClosed = false, peerCloses = 0, brokerCloses = 0;
  const gate = new Promise((yes, no) => { resolve = yes; reject = no; });
  const input = new PassThrough(), output = new PassThrough(), pending = new Map(); let serial = 0, buffer = '';
  output.on('data', bytes => {
    buffer += bytes;
    while (buffer.includes('\n')) { const at = buffer.indexOf('\n'), reply = JSON.parse(buffer.slice(0, at)); buffer = buffer.slice(at + 1); pending.get(reply.id)?.(reply); pending.delete(reply.id); }
  });
  // TEMP release module-memory instrumentation only: delay/reject the physical
  // close without adding runtime injection hooks or observing the user's AE.
  peerModule.createHttpPeer = options => {
    physical = originalPeer(options);
    return { ...physical, async close() { peerCloses++; await gate; await physical.close(); physicalClosed = true; } };
  };
  brokerModule.Broker = class extends OriginalBroker {
    constructor(options) { super(options); broker = this; }
    close() { brokerCloses++; return super.close(); }
  };
  readiness.createAeReadiness = () => originalReadiness({ platform: 'fixture' });
  // A rejected product close deliberately retains resources. Only fixture
  // teardown closes the isolated peer and lock directly, never retries close.
  resources(t).closers.push(async () => {
    resolve();
    if (physical && !physicalClosed) await physical.close();
    if (broker && !broker.closed) OriginalBroker.prototype.close.call(broker);
  });
  let runtime;
  try {
    runtime = ownerMode
      ? await require(path.join(f.d.releaseDir, 'runtime/owner-entry.js')).startOwner({ descriptor: f.descriptor, port: 0 })
      : await require(path.join(f.d.releaseDir, 'runtime/stdio-entry.js')).start({ descriptor: f.descriptor, port: 0, input, output });
  } finally {
    peerModule.createHttpPeer = originalPeer; brokerModule.Broker = OriginalBroker; readiness.createAeReadiness = originalReadiness;
  }
  if (ownerMode) resources(t).closers.push(async () => { resolve(); await runtime.close(); });
  const call = name => new Promise(done => {
    const id = ++serial; pending.set(id, done);
    input.write(canonical({ jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: { payload: {} } } }) + '\n');
  });
  return { f, runtime, call, resolve, reject, get broker() { return broker; }, get peerCloses() { return peerCloses; }, get brokerCloses() { return brokerCloses; } };
}

for (const rejected of [false, true]) test('A1 direct stdio concurrent close shares deferred peer ' + (rejected ? 'rejection' : 'success'), async t => {
  const f = await closeFixture(t), error = new Error('fixture_peer_close_failed');
  const lock = path.join(f.f.d.stateDir, 'broker/broker-owner.lock'), originalLock = fs.readFileSync(lock);
  assert.equal(f.runtime.status().ready, true);
  const settled = [], first = f.runtime.close(), second = f.runtime.close();
  const outcomes = Promise.allSettled([first, second]);
  first.then(() => settled.push('first'), () => settled.push('first'));
  second.then(() => settled.push('second'), () => settled.push('second'));
  const closing = f.runtime.status();
  assert.equal(closing.closed, true); assert.equal(closing.ready, false); assert.equal(closing.connection, 'unavailable');
  assert.equal(closing.physical.inspectionAvailable, false);
  for (const name of Object.keys(require('../core/stdio').TOOL_METHODS)) {
    const reply = await f.call(name);
    assert.equal(reply.error?.message, 'broker_closed', name);
  }
  await until(() => f.peerCloses === 1); await new Promise(done => setImmediate(done));
  assert.deepEqual(settled, []); assert.equal(f.brokerCloses, 0); assert.equal(f.broker.closed, false);
  assert.deepEqual(fs.readFileSync(lock), originalLock);
  if (rejected) f.reject(error); else f.resolve();
  const results = await outcomes;
  assert.ok(results.every(result => result.status === (rejected ? 'rejected' : 'fulfilled')));
  if (rejected) {
    assert.ok(results.every(result => result.reason === error));
    await assert.rejects(f.runtime.close(), value => value === error);
    assert.equal(f.brokerCloses, 0); assert.equal(f.broker.closed, false);
    assert.deepEqual(fs.readFileSync(lock), originalLock);
  } else {
    await f.runtime.close(); assert.equal(f.brokerCloses, 1); assert.equal(f.broker.closed, true);
    assert.equal(fs.existsSync(lock), false);
  }
  assert.equal(f.peerCloses, 1); assert.equal(f.runtime.status().ready, false);
});

test('A1 upper Owner wrapper rejects draining before sharing the deferred lower cleanup', async t => {
  const f = await closeFixture(t, true), settled = [];
  f.broker.controlPending = 1;
  await assert.rejects(f.runtime.close(), error => error.code === 'owner_draining');
  assert.equal(f.peerCloses, 0); assert.equal(f.runtime.status().attachmentOwner.closed, false);
  f.broker.controlPending = 0;
  const first = f.runtime.close(), second = f.runtime.close();
  const outcomes = Promise.all([first, second]);
  first.then(() => settled.push('first')); second.then(() => settled.push('second'));
  await until(() => f.peerCloses === 1); await new Promise(done => setImmediate(done));
  assert.deepEqual(settled, []); assert.equal(f.brokerCloses, 0);
  assert.equal(f.runtime.status().attachmentOwner.closed, true);
  f.resolve(); await outcomes; await f.runtime.close();
  assert.equal(f.peerCloses, 1); assert.equal(f.brokerCloses, 1);
  assert.equal(f.runtime.status().maintenance.phase, 'stopped');
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

test('desired-stop freezes new control while captured original inspection completes after client detach', async t => {
  const f = install(t), runtime = await directOwner(t, f), client = await ipc(t, f), observer = await ipc(t, f);
  const p = await panel(runtime.status().physical.port, f.d); await ok(client.call('controller_acquire', {}));
  const contract = await ok(client.call('get_module_contract', { moduleId: 'project-inspection' }));
  const result = client.call('inspect_module_target', { moduleId: 'project-inspection', contractId: contract.contractId, target: {} });
  await until(() => runtime.status().physical.pending); await assert.rejects(runtime.close(), e => e.code === 'owner_draining');
  const frame = (await p.request('/poll', {})).value.command; assert.ok(frame);
  const unknown = assert.rejects(result, e => e.code === 'ipc_outcome_uncertain'); client.close(); await unknown;
  assert.equal((await observer.call('controller_acquire', {})).code, 'owner_draining');
  const ack = await p.request('/complete', completion(frame, vmObservation(f.pkg, frame))); assert.equal(ack.status, 200);
  await until(() => runtime.status().maintenance.phase === 'stopped');
  assert.equal(runtime.status().physical.pending, null); assert.equal(runtime.status().physical.storeClosed, true);
  assert.equal(runtime.status().attachmentOwner.frozen, true); assert.equal(runtime.status().attachmentOwner.closed, true);
  assert.equal(fs.existsSync(path.join(f.d.stateDir, 'runtime-maintenance.json')), true);
  const events = fs.readFileSync(path.join(f.d.stateDir, 'receiver/completions.ndjson'), 'utf8').trim().split('\n').map(JSON.parse);
  assert.deepEqual(events.map(e => e.type), ['origin', 'begin', 'complete']);
});

test('owner main signal persists desired-stop and drains original completion without a second shutdown request', async t => {
  const f = install(t), main = childMain(t, f); await main.event('ipc');
  const client = await ipc(t, f), observer = await ipc(t, f), status = await ok(observer.call('core_status', {}));
  const p = await panel(status.physical.port, f.d); await ok(client.call('controller_acquire', {}));
  const contract = await ok(client.call('get_module_contract', { moduleId: 'project-inspection' }));
  const result = client.call('inspect_module_target', { moduleId: 'project-inspection', contractId: contract.contractId, target: {} });
  await until(async () => (await ok(observer.call('core_status', {}))).physical.pending);
  main.child.send('signal'); await until(() => main.stderr.includes('owner_draining'));
  assert.equal(main.child.exitCode, null); const diagnostic = await ok(observer.call('core_diagnostics', {})); assert.equal(diagnostic.pid, main.child.pid); assert.equal(diagnostic.attachmentOwner.frozen, true);
  const frame = (await p.request('/poll', {})).value.command; assert.ok(frame);
  assert.equal((await p.request('/complete', completion(frame, vmObservation(f.pkg, frame)))).status, 200);
  assert.equal((await ok(result)).observation.project.saved, false);
  assert.equal((await main.exit).code, 0); assert.equal(main.stderr, 'owner_draining\n'); assert.equal(fs.existsSync(path.join(f.d.stateDir, 'runtime-maintenance.json')), true);
});

test('later panel poll after controller detach durably settles an undelivered read without a receiver fence', async t => {
  const f = install(t), runtime = await directOwner(t, f), client = await ipc(t, f), observer = await ipc(t, f), p = await panel(runtime.status().physical.port, f.d);
  await ok(client.call('controller_acquire', {})); const contract = await ok(client.call('get_module_contract', { moduleId: 'project-inspection' }));
  const result = client.call('inspect_module_target', { moduleId: 'project-inspection', contractId: contract.contractId, target: {} });
  await until(() => runtime.status().physical.pending); const unknown = assert.rejects(result, e => e.code === 'ipc_outcome_uncertain'); client.close(); await unknown;
  await until(() => runtime.status().attachmentOwner.attachments === 1);
  const denied = await p.request('/poll', {}); assert.equal(denied.status, 200); assert.equal(denied.value.command, null);
  await until(() => runtime.status().attachmentOwner.accepted === 0); assert.equal(runtime.status().physical.storeClosed, false);
  assert.equal(runtime.status().physical.lastCommandOutcome.reason, 'controller_client_detached');
  const grant = await ok(observer.call('controller_acquire', {}));
  await ok(observer.call('controller_release', { leaseToken: grant.leaseToken }));
  const events = fs.readFileSync(path.join(f.d.stateDir, 'receiver/completions.ndjson'), 'utf8').trim().split('\n').map(JSON.parse);
  assert.deepEqual(events.map(e => e.type), ['origin', 'begin', 'complete']);
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
    invoke(method, payload, context) { return als.run(context, async () => { if (beforeSubmit) await beforeSubmit; return peer.inspect(payload.target || {}); }); } });
  const session = Object.freeze({ clientSessionId: 'guard-session' }); owner.onAttach(session);
  resources(t).closers.push(() => owner.close()); const p = await panel(peer.status().port, installation);
  const call = (method, payload = {}) => owner.onRequest({ session, method, payload });
  await ok(call('controller_acquire'));
  return { directory, peer, owner, p, call, at(value) { time = value; }, checks: () => checks };
}

test('captured lease guard survives absent ALS during a delayed poll and blocks delivery after expiry', async t => {
  const f = await guardedFixture(t), result = f.call('inspect_module_target', { contractId: 'a'.repeat(64), target: {} }); await until(() => f.peer.status().pending); f.at(1000);
  const denied = await f.p.request('/poll', {}); assert.equal(denied.status, 200); assert.equal(denied.value.command, null);
  assert.equal((await result).code, 'owner_outcome_uncertain'); await until(() => f.owner.status().accepted === 0);
  assert.equal(f.peer.status().storeClosed, false); assert.equal(f.peer.status().lastCommandOutcome.reason, 'controller_lease_expired'); assert.equal(f.checks(), 1);
});

test('active poll delivery checks the captured lease again immediately after store.begin', async t => {
  const f = await guardedFixture(t, { expireAtBegin: true }), waitingPoll = f.p.request('/poll', {});
  await new Promise(resolve => setTimeout(resolve, 10));
  const result = await f.call('inspect_module_target', { contractId: 'a'.repeat(64), target: {} }); assert.equal(result.code, 'owner_outcome_uncertain');
  assert.equal((await waitingPoll).value.command, null); assert.equal(f.peer.status().pending, null); assert.equal(f.peer.status().storeClosed, false);
});

test('lease expiry across a trusted await is checked at physical submit before durable begin', async t => {
  const gate = deferred(), f = await guardedFixture(t, { beforeSubmit: gate.promise });
  const result = f.call('inspect_module_target', { contractId: 'a'.repeat(64), target: {} }); await until(() => f.owner.status().accepted === 1);
  f.at(1000); gate.resolve(); assert.equal((await result).code, 'owner_outcome_uncertain');
  assert.equal(f.peer.status().pending, null); assert.equal(f.peer.status().storeClosed, false); assert.equal(f.checks(), 0);
  assert.deepEqual(fs.readFileSync(path.join(f.directory, 'receiver/completions.ndjson'), 'utf8').trim().split('\n').map(JSON.parse).map(e => e.type), ['origin']);
});

test('no captured controller context rejects before durable begin; original completion remains accepted after lease expiry', async t => {
  const f = await guardedFixture(t);
  assert.throws(() => f.peer.inspect({}), e => e.code === 'missing_context');
  assert.deepEqual(fs.readFileSync(path.join(f.directory, 'receiver/completions.ndjson'), 'utf8').trim().split('\n').map(JSON.parse).map(e => e.type), ['origin']);
  const result = f.call('inspect_module_target', { contractId: 'a'.repeat(64), target: {} }); await until(() => f.peer.status().pending);
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

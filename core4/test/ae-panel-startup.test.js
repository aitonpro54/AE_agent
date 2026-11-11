'use strict';
// Offline TEMP/VM and loopback tests only. No installed AE or production state.
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path'), vm = require('node:vm');
const { createAePanelStartup, validateStartupInput, collisionPreflight, ownsRegistryBootstrap } = require('../runtime/ae-panel-startup');
const { createAttachmentOwner } = require('../runtime/attachment-owner');
const { buildPackage } = require('../tools/package-installable');
const { identity, verify } = require('../integrations/cep/panel-identity');
const { createHttpPeer } = require('../integrations/cep/http-peer');
const { hash, canonical } = require('../protocol/json');
const { mac } = require('../integrations/cep/peer-protocol');
const id = '10000000-0000-4000-8000-000000000001', other = '10000000-0000-4000-8000-000000000002';
const source = path.resolve(__dirname, '..'), fixed = fs.readFileSync(path.join(source, 'runtime/host/ensure-panel.jsx'), 'utf8');
const facts = { appVersion: '26.3', projectPresent: true, file: null, dirty: false, numItems: 0 };
function harness(t, options = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'core4 startup spaces ')); t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const stateDir = path.join(dir, 'state'); fs.mkdirSync(stateDir);
  const executablePath = path.join(dir, 'AfterFX.exe'); fs.writeFileSync(executablePath, 'fixture-executable-never-launched');
  const installation = { installationId: 'fixture', machineId: 'fixture-machine', packageHash: 'a'.repeat(64), stateDir, releaseDir: source, cepDir: path.join(dir, 'extensions/com.codex.aeagentcore4') };
  fs.writeFileSync(path.join(stateDir, 'host-adoption.json'), canonical({ version: 1, installationId: 'fixture', machineId: installation.machineId, host: { machineId: installation.machineId, executablePath, executableHash: hash(fs.readFileSync(executablePath)) } }));
  let scans = 0, preflights = 0, connection = 0;
  let time = 1000, connected = false, rows = options.absent ? [] : [{ pid: 123, birth: '2026-01-01T00:00:00.0000000Z', executablePath }], launches = [], idle = true, reverified = 0;
  const expected = options.expected || { protocolVersion: 1, productVersion: '4.2.6', panelBuildId: 'b'.repeat(64), extensionId: 'com.codex.aeagentcore4.panel' };
  const context = { assertCurrent() { if (options.fenced) throw new Error('fenced'); } };
  function ack(code = 'menu_executed', operationId = id) { fs.writeFileSync(path.join(stateDir, 'panel-startup', id, 'ack.json'), JSON.stringify({ code, operationId, hostFacts: facts })); }
  const service = createAePanelStartup({ installation, expectedIdentity: expected, peerStatus: options.peerStatus || (() => ({ peer: { connected, acceptedIdentity: expected, peerId: 'fixture-peer-' + connection, identityEpoch: 'fixture-epoch', identityObservedAt: connection } })),
    assertIdle(request) { if (!idle) throw new Error('startup_lane_busy'); if (options.assertIdle) options.assertIdle(request); }, reverify() { reverified++; if (reverified === options.reverifyFailAt) throw new Error('startup_reverify_failed'); }, observeSubmission: async pid => ({ pid, status: options.submissionPresent ? 'present' : 'absent' }), preflight() { if (++preflights === options.preflightFailAt) throw new Error('startup_preflight_failed'); }, now: () => time,
    scan: async () => { if (++scans === options.scanFailAt) throw new Error('startup_scan_failed'); return structuredClone(rows); }, wait: async ms => { time += ms; if (options.waitHook) await options.waitHook(); if (options.forwarding && rows.length === 2) rows = rows.slice(0, 1); }, launch: async (exe, args) => { launches.push({ exe, args }); if (options.launchHook) await options.launchHook(); if (!options.timeout) { rows = [{ pid: 123, birth: '2026-01-01T00:00:00.0000000Z', executablePath }]; fs.writeFileSync(path.join(path.dirname(args[1]), 'ack.json'), JSON.stringify({ code: options.stale ? 'requires_host_restart' : 'menu_executed', operationId: path.basename(path.dirname(args[1])), hostFacts: facts })); connected = !options.stale; if (!options.staleConnected) connection++; if (options.forwarding) { rows.push({ pid: 456, birth: '2026-01-01T00:00:01.0000000Z', executablePath }); return { pid: 456 }; } } if (options.submission) return { pid: 456 }; } });
  return { service, installation, context, launches, ack, expected, executablePath, get reverified() { return reverified; }, connect() { connected = true; connection++; }, busy() { idle = false; }, rows(value) { rows = value; }, advance(ms) { time += ms; } };
}
test('ae-panel-startup cold absent launches exact executable with one fixed -r asset and authentic panel', async t => {
  const f = harness(t, { absent: true }), result = await f.service.ensure({ operationId: id, timeoutMs: 1000 }, f.context);
  assert.equal(result.outcome, 'ready'); assert.equal(result.nativeVerified, false); assert.equal(f.launches.length, 1); assert.equal(f.launches[0].exe, f.executablePath);
  assert.deepEqual(f.launches[0].args, ['-r', path.join(f.installation.stateDir, 'panel-startup', id, 'bootstrap.jsx')]); assert.equal(f.reverified, 2);
  assert.equal((await f.service.ensure({ operationId: id }, f.context)).outcome, 'ready'); assert.equal(f.launches.length, 1);
});
test('ae-panel-startup existing connected host is idempotent and keeps PID/birth without dispatch', async t => {
  const f = harness(t); f.connect(); assert.equal((await f.service.ensure({ operationId: id }, f.context)).outcome, 'ready'); assert.equal(f.launches.length, 0);
  assert.equal(f.service.status({ operationId: id }).attempt.original.pid, 123);
  const restored = createAePanelStartup({ installation: f.installation, expectedIdentity: f.expected, peerStatus: () => ({ peer: { connected: false } }), assertIdle() {}, launch() { assert.fail('restored UUID must not dispatch'); } });
  assert.equal(restored.status({ operationId: id }).completion.code, 'already_authenticated'); assert.equal((await restored.ensure({ operationId: id }, f.context)).outcome, 'ready'); assert.equal(restored.status({ operationId: id }).panel, null);
});
test('ae-panel-startup existing host waits for its exact forwarding CLI to exit before accepting readiness', async t => {
  const f = harness(t, { forwarding: true }); assert.equal((await f.service.ensure({ operationId: id }, f.context)).outcome, 'ready'); assert.equal(f.launches.length, 1); assert.equal(f.service.status({ operationId: id }).attempt.original.pid, 123);
});
test('ae-panel-startup cached connected peer with no AE still launches cold and requires a new accepted peer', async t => {
  const f = harness(t, { absent: true }); f.connect(); const before = f.service.activity(); assert.equal(before.pending, false);
  const result = await f.service.ensure({ operationId: id, timeoutMs: 1000 }, f.context); assert.equal(f.launches.length, 1); assert.equal(result.outcome, 'ready'); assert.equal(result.completion.host.pid, 123);
  const stale = harness(t, { absent: true, staleConnected: true }); stale.connect(); assert.equal((await stale.service.ensure({ operationId: id, timeoutMs: 1000 }, stale.context)).outcome, 'unknown'); assert.equal(stale.launches.length, 1);
});
test('ae-panel-startup expired warm host plus absent own forwarder interrupts only startup and preserves receiver UNKNOWN', async t => {
  const f = harness(t, { timeout: true, submission: true }); assert.equal((await f.service.ensure({ operationId: id, timeoutMs: 1000 }, f.context)).outcome, 'unknown'); f.rows([]);
  const { openCompletionStore } = require('../integrations/cep/completion-store'), { dispatchBinding } = require('../protocol/dispatch');
  const directory = path.join(f.installation.stateDir, 'receiver'), store = openCompletionStore({ directory }), payload = {};
  const command = { protocolVersion: 1, controllerId: 'fixture', channelEpoch: 'old-epoch', commandId: 'old-registry', moduleId: 'registry-bootstrap', operationId: 'verify-registry', executorHash: 'a'.repeat(64), phase: 'inspect', payloadHash: hash(payload), payload };
  store.begin(command, dispatchBinding(command, store.identity)); store.unknown(command.commandId); store.close();
  const file = path.join(directory, 'completions.ndjson'), original = fs.readFileSync(file);
  assert.equal((await f.service.observe({ operationId: id })).outcome, 'interrupted'); assert.equal(f.service.activity().unresolved, false); assert.equal(f.launches.length, 1); assert.deepEqual(fs.readFileSync(file), original);
  assert.equal(require('../runtime/recovery-inspection').inspectReceiverHistory(original).settled, false);
});
test('ae-panel-startup before deadline or live own forwarder cannot retire UNKNOWN startup', async t => {
  const options = { timeout: true, submission: true, waitHook() { options.fenced = true; } }, before = harness(t, options);
  assert.equal((await before.service.ensure({ operationId: id, timeoutMs: 10000 }, before.context)).outcome, 'unknown'); before.rows([]); assert.equal((await before.service.observe({ operationId: id })).outcome, 'unknown');
  const live = harness(t, { timeout: true, submission: true, submissionPresent: true }); await live.service.ensure({ operationId: id, timeoutMs: 1000 }, live.context); live.rows([]); assert.equal((await live.service.observe({ operationId: id })).outcome, 'unknown'); assert.equal(live.service.activity().unresolved, true);
});
test('ae-panel-startup new AE B never proves old warm A ready; after deadline it records interrupted without replay', async t => {
  const f = harness(t, { timeout: true, submission: true }); await f.service.ensure({ operationId: id, timeoutMs: 1000 }, f.context); f.rows([{ pid: 999, birth: '2026-01-02T00:00:00.0000000Z', executablePath: f.executablePath }]); f.ack(); f.connect();
  const result = await f.service.observe({ operationId: id }); assert.equal(result.outcome, 'interrupted'); assert.equal(result.completion.original.pid, 123); assert.equal(f.launches.length, 1);
});
test('ae-panel-startup redirected state ancestor cannot receive request/bootstrap writes', async t => {
  const f = harness(t), destination = path.join(path.dirname(f.installation.stateDir), 'redirect'); fs.mkdirSync(destination);
  fs.symlinkSync(destination, path.join(f.installation.stateDir, 'panel-startup'), process.platform === 'win32' ? 'junction' : 'dir');
  assert.equal((await f.service.ensure({ operationId: id }, f.context)).code, 'startup_path_redirected'); assert.equal(f.launches.length, 0); assert.deepEqual(fs.readdirSync(destination), []);
});
test('ae-panel-startup multiple AE and busy/UNKNOWN lane reject without dispatch', async t => {
  const f = harness(t); f.rows([{ pid: 1 }, { pid: 2 }]); assert.equal((await f.service.ensure({ operationId: id }, f.context)).code, 'startup_ambiguous_ae');
  f.busy(); assert.equal((await f.service.ensure({ operationId: other }, f.context)).code, 'startup_lane_busy'); assert.equal(f.launches.length, 0);
});
test('ae-panel-startup closed input rejects executable/scripts/menu/args and invalid UUID/timeouts', () => {
  for (const value of [{}, { operationId: 'x' }, { operationId: id, timeoutMs: 0 }, { operationId: id, timeoutMs: 90001 }, ...['executable', 'script', 'menuId', 'args'].map(k => ({ operationId: id, [k]: 'x' }))]) assert.throws(() => validateStartupInput(value), /startup_input/);
});
for (const key of ['reverifyFailAt', 'preflightFailAt', 'scanFailAt']) test('ae-panel-startup proven second ' + key + ' failure is rejected before dispatch and permits new UUID', async t => {
  const f = harness(t, { [key]: 2 }), result = await f.service.ensure({ operationId: id }, f.context);
  assert.equal(result.code, 'rejected_before_dispatch'); assert.equal(f.launches.length, 0); assert.equal(f.service.activity().unresolved, false);
  assert.equal((await f.service.ensure({ operationId: other }, f.context)).outcome, 'ready'); assert.equal(f.launches.length, 1);
});
test('ae-panel-startup failed bootstrap write and partial prepared-only directory cannot create a permanent UNKNOWN', async t => {
  const f = harness(t), open = fs.openSync;
  const mock = t.mock.method(fs, 'openSync', function (file, ...args) { if (typeof file === 'string' && path.basename(file).startsWith('bootstrap.jsx.stage-')) throw Object.assign(new Error('fixture_write_denied'), { code: 'EACCES' }); return open.call(fs, file, ...args); });
  const failed = await f.service.ensure({ operationId: id }, f.context); mock.mock.restore(); assert.equal(failed.code, 'rejected_before_dispatch'); assert.equal(f.launches.length, 0);
  assert.equal((await f.service.ensure({ operationId: other }, f.context)).outcome, 'ready');
  const g = harness(t), orphan = path.join(g.installation.stateDir, 'panel-startup', id); fs.mkdirSync(orphan, { recursive: true }); fs.writeFileSync(path.join(orphan, 'request.json'), '{}');
  assert.equal((await g.service.ensure({ operationId: other }, g.context)).outcome, 'ready'); assert.equal(g.service.status({ operationId: id }).code, 'rejected_before_dispatch');
});
test('ae-panel-startup lease expiry retains startup fence for incompatible tools until observer settles original late ACK', async t => {
  let clock = 0, connectedCalls = 0; const f = harness(t, { timeout: true, waitHook() { clock = 2000; } });
  const owner = createAttachmentOwner({ runtime: { status() {}, close() {} }, activity: () => ({ pending: false, unresolved: false, fault: false }), startupGate: () => f.service.activity(), clock: () => clock, ttlMs: 1000,
    async invoke(method, payload, context) { if (method === 'ensureAePanel') return f.service.ensure(payload, context); if (method === 'aePanelStartupStatus') return f.service.observe(payload); connectedCalls++; return {}; } });
  const session = {}; owner.onAttach(session); const call = (method, payload = {}) => owner.onRequest({ session, method, payload });
  const grant = (await call('controller_acquire')).value;
  const result = await call('core_ensure_ae_panel', { operationId: id, timeoutMs: 10000 }); assert.equal(result.value.outcome, 'unknown'); assert.equal(f.launches.length, 1); assert.equal(f.service.activity().unresolved, true);
  assert.equal((await call('core_connect')).code, 'owner_startup_pending'); await call('controller_release', { leaseToken: grant.leaseToken }); assert.equal((await call('controller_acquire')).ok, true); assert.equal((await call('core_connect')).code, 'owner_startup_pending');
  f.ack(); f.connect(); assert.equal((await call('core_ae_panel_startup_status', { operationId: id })).value.outcome, 'ready'); assert.equal((await call('core_connect')).ok, true); assert.equal(connectedCalls, 1); assert.equal(f.launches.length, 1); await owner.close();
});
test('ae-panel-startup ensure waits only for its exact provisional registry bootstrap then becomes ready', async t => {
  const pkg = buildPackage(undefined, 'manual', { runtimeModel: 'owner' }), expected = verify(file => Buffer.from(pkg.files[file], 'base64')); let peer, linked, sequence = 0, completed = false;
  const f = harness(t, { expected, peerStatus: () => peer.status(), assertIdle(request) { const p = peer.status(); if (p.pending && !ownsRegistryBootstrap(p, request.operationId)) throw new Error('startup_lane_busy'); },
    async launchHook() { const challenge = await post('/challenge', { role: 'panel' }), claim = { challenge, peerId: 'startup-provisional', loadedPanel: expected, extensionRoot: f.installation.cepDir.replace(/\\/g, '/') }; linked = await post('/link', { ...claim, proof: mac(claim, token) }); assert.equal(linked.body.registryReady, false); },
    async waitHook() {
      if (completed) return; const p = peer.status(); assert.equal(ownsRegistryBootstrap(p, id), true); assert.equal(ownsRegistryBootstrap(p, other), false); assert.throws(() => peer.inspect({}), /registry_not_ready/);
      const body = { epoch: linked.body.epoch, peerId: 'startup-provisional', sequence: ++sequence, method: 'POST', path: '/registry-ready', payload: { nonce: linked.body.bootstrap.nonce, registryBuildId: expected.registryBuildId, refreshed: true, sessionId: null } };
      assert.equal((await post('/registry-ready', { body, mac: mac(body, token) })).body.payload.registryReady, true); completed = true;
    } });
  const token = 'c'.repeat(64), directory = path.join(f.installation.stateDir, 'receiver');
  peer = createHttpPeer({ installation: { ...f.installation, panelToken: token, controlToken: 'd'.repeat(64) }, directory, asset: { assetKey: 'project-inspection-v1', executorHash: 'e'.repeat(64) }, expectedPanelIdentity: expected, port: 0, captureBootstrapStartup: () => f.service.activity().operationId }); await peer.listen(); t.after(() => peer.close());
  async function post(route, value) { return (await fetch('http://127.0.0.1:' + peer.status().port + route, { method: 'POST', headers: { Origin: 'file://', 'Content-Type': 'application/json' }, body: canonical(value) })).json(); }
  const result = await f.service.ensure({ operationId: id }, f.context); assert.equal(result.outcome, 'ready'); assert.equal(completed, true); assert.equal(f.launches.length, 1); assert.equal(peer.status().pending, null);
});
test('ae-panel-startup timeout and owner recreation never replay; late ack reconciles same UUID', async t => {
  const f = harness(t, { timeout: true }); assert.equal((await f.service.ensure({ operationId: id, timeoutMs: 1000 }, f.context)).outcome, 'unknown');
  assert.equal((await f.service.ensure({ operationId: id }, f.context)).outcome, 'unknown'); assert.equal((await f.service.ensure({ operationId: other }, f.context)).code, 'startup_outcome_unresolved'); assert.equal(f.launches.length, 1);
  f.ack(); f.connect(); assert.equal((await f.service.ensure({ operationId: id }, f.context)).outcome, 'ready'); assert.equal(f.launches.length, 1);
});
test('ae-panel-startup stale stable-menu cache requires host restart with project facts and no restart', async t => {
  const f = harness(t, { stale: true }); const result = await f.service.ensure({ operationId: id }, f.context); assert.equal(result.code, 'requires_host_restart'); assert.deepEqual(result.ack.hostFacts, facts); assert.equal(f.launches.length, 1);
});
test('ae-panel-startup changed executable and forged late ack cannot establish readiness', async t => {
  const f = harness(t, { timeout: true }); await f.service.ensure({ operationId: id, timeoutMs: 1000 }, f.context); f.ack('menu_executed', other); f.connect(); assert.equal((await f.service.ensure({ operationId: id }, f.context)).code, 'startup_ack_invalid'); assert.equal(f.launches.length, 1);
  const g = harness(t); fs.appendFileSync(g.executablePath, 'changed'); assert.equal((await g.service.ensure({ operationId: id }, g.context)).code, 'startup_executable_changed'); assert.equal(g.launches.length, 0);
});
test('ae-panel-startup owner controller/baseline gates allow ensure without granting project authority', async () => {
  const calls = [], owner = createAttachmentOwner({ runtime: { status() {}, close() {} }, activity: () => ({ pending: false, unresolved: false, fault: false }), workSession: () => ({ sessionId: id, baselineRequired: true, resetPending: false }), invoke: async (method, payload, context) => { context.assertCurrent(); calls.push(method); return { outcome: 'ready', nativeVerified: false }; } });
  const session = {}; owner.onAttach(session); const call = (method, payload) => owner.onRequest({ session, method, payload });
  assert.equal((await call('core_ensure_ae_panel', { operationId: id })).code, 'owner_controller_required');
  await call('controller_acquire', { sessionId: id }); assert.equal((await call('core_ensure_ae_panel', { operationId: id })).ok, true); assert.deepEqual(calls, ['ensureAePanel']); assert.equal(owner.status().workSession.baselineRequired, true);
  assert.equal((await call('core_ensure_ae_panel', { operationId: id, args: [] })).code, 'owner_payload'); await owner.close();
});
function runJsx({ command = 42, throws = false, file = 'C:\\space dir\\title "x"\r\n\u0001\ud800.aep' } = {}) {
  const files = new Map([['/fixture/request.json', canonical({ deadline: Date.now() + 10000, operationId: id })]]); const executed = [];
  function File(name) { this.name = name; this.parent = { fsName: '/fixture' }; this.exists = files.has(name); this.open = mode => { this.mode = mode; return true; }; this.read = () => files.get(name); this.write = s => { files.set(name, s); return true; }; this.close = () => {}; }
  vm.runInNewContext(fixed, { File, $: { fileName: '/fixture/bootstrap.jsx' }, app: { version: '26.3', project: { file: { fsName: file }, dirty: false, numItems: 0 }, findMenuCommandId(label) { assert.equal(label, 'AE Agent Core'); if (throws) throw new Error('API failure'); return command; }, executeCommand(value) { assert.ok(files.has('/fixture/executing.json')); executed.push(value); } } });
  return { files, executed };
}
test('ae-panel-startup fixed JSX escapes host facts, receipts before execute, no arbitrary script and no exception modal', () => {
  const f = runJsx(), receipt = JSON.parse(f.files.get('/fixture/ack.json')); assert.equal(receipt.hostFacts.file, 'C:\\space dir\\title "x"\r\n\u0001\ud800.aep'); assert.deepEqual(f.executed, [42]);
  assert.deepEqual(runJsx({ command: 0 }).executed, []); assert.doesNotThrow(() => runJsx({ throws: true }));
});
test('ae-panel-startup installed duplicate owners and ScriptUI title collision fail before find/execute', t => {
  const f = harness(t), ext = f.installation.cepDir; fs.mkdirSync(path.join(ext, 'CSXS'), { recursive: true }); fs.copyFileSync(path.join(source, 'cep/CSXS/manifest.xml'), path.join(ext, 'CSXS/manifest.xml'));
  collisionPreflight(f.installation, f.executablePath, [path.dirname(ext)]);
  const scripts = path.join(path.dirname(f.executablePath), 'Scripts/ScriptUI Panels'); fs.mkdirSync(scripts, { recursive: true }); fs.writeFileSync(path.join(scripts, 'AE Agent Core.jsx'), ''); assert.throws(() => collisionPreflight(f.installation, f.executablePath, [path.dirname(ext)]), /startup_script_menu_collision/);
  fs.unlinkSync(path.join(scripts, 'AE Agent Core.jsx')); const duplicate = path.join(path.dirname(ext), 'duplicate/CSXS'); fs.mkdirSync(duplicate, { recursive: true }); fs.copyFileSync(path.join(ext, 'CSXS/manifest.xml'), path.join(duplicate, 'manifest.xml')); assert.throws(() => collisionPreflight(f.installation, f.executablePath, [path.dirname(ext)]), /startup_panel_ambiguous/);
});
test('ae-panel-startup packaged fingerprint covers executing panel/dispatcher/registry and is portable', () => {
  const pkg = buildPackage(undefined, 'manual', { runtimeModel: 'owner' }), read = f => Buffer.from(pkg.files[f], 'base64'), expected = verify(read);
  assert.equal(expected.productVersion, '4.2.6'); assert.equal(pkg.release.version, '4.2.6'); assert.ok(pkg.files['runtime/host/ensure-panel.jsx']);
  for (const changed of ['cep/js/panel.js', 'cep/js/poll-dispatcher.js']) assert.notDeepEqual(identity(f => f === changed ? Buffer.concat([read(f), Buffer.from('// changed')]) : read(f)), expected);
  const decoded = Object.values(pkg.files).map(value => Buffer.from(value, 'base64').toString('utf8')).join('\n');
  assert.equal(decoded.includes(os.hostname()), false); assert.equal(decoded.includes(os.userInfo().homedir), false); assert.equal(decoded.includes(os.userInfo().homedir.replace(/\\/g, '\\\\')), false);
  assert.throws(() => verify(file => file === 'cep/js/panel.js' ? Buffer.from(read(file).toString().replace('"productVersion":"4.2.6"', '"productVersion":"4.2.5"')) : read(file)), /panel_identity_integrity/);
});
test('ae-panel-startup handshake authenticates loaded build/version; spoof/missing/stale identities never acquire peer', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'core4-panel-link-')); t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const installation = { installationId: 'fixture', packageHash: 'a'.repeat(64), panelToken: 'b'.repeat(64), controlToken: 'c'.repeat(64) }, expected = { protocolVersion: 1, productVersion: '4.2.6', panelBuildId: 'd'.repeat(64), extensionId: 'com.codex.aeagentcore4.panel' };
  const peer = createHttpPeer({ installation, directory: dir, asset: { assetKey: 'inspection', moduleId: 'project-inspection', operationId: 'inspect', executorHash: 'e'.repeat(64) }, expectedPanelIdentity: expected, port: 0 }); await peer.listen(); t.after(() => peer.close());
  const url = 'http://127.0.0.1:' + peer.status().port;
  const post = async (route, body) => (await fetch(url + route, { method: 'POST', headers: { Origin: 'file://', 'Content-Type': 'application/json' }, body: canonical(body) })).json();
  for (const loadedPanel of [undefined, { ...expected, productVersion: '4.2.5' }, { ...expected, panelBuildId: 'f'.repeat(64) }]) {
    const challenge = await post('/challenge', { role: 'panel' }), body = { challenge, peerId: 'fixture-peer', ...(loadedPanel ? { loadedPanel } : {}) };
    assert.equal((await post('/link', { ...body, proof: mac(body, installation.panelToken) })).error, 'panel_identity_mismatch'); assert.equal(peer.status().peer.connected, false);
  }
  let challenge = await post('/challenge', { role: 'panel' }), body = { challenge, peerId: 'fixture-peer', loadedPanel: expected };
  assert.equal((await post('/link', { ...body, proof: '0'.repeat(64) })).error, 'peer_auth');
  challenge = await post('/challenge', { role: 'panel' }); body = { ...body, challenge }; const linked = await post('/link', { ...body, proof: mac(body, installation.panelToken) });
  assert.deepEqual(linked.body.acceptedIdentity, expected); assert.deepEqual(peer.status().peer.acceptedIdentity, expected); assert.equal(peer.status().peer.origin, 'file://'); assert.ok(peer.status().peer.identityObservedAt); assert.equal(peer.status().peer.identityEpoch, linked.body.epoch);
});

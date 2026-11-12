'use strict';
// TEMP/VM/loopback evidence only; no installed panel, real AE or production state.
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), os = require('node:os'), vm = require('node:vm');
const { webcrypto } = require('node:crypto');
const { buildPackage } = require('../tools/package-installable');
const { deriveComposition, installationConfig, installationMarker } = require('../runtime/stdio-entry');
const { verify: panelIdentity } = require('../integrations/cep/panel-identity');
const { createHttpPeer } = require('../integrations/cep/http-peer');
const { canonical, hash } = require('../protocol/json');
const { mac } = require('../integrations/cep/peer-protocol');
const { createStartOverPanelControl } = require('../runtime/start-over-panel-control');
const root = path.resolve(__dirname, '..'), pkg = buildPackage(undefined, 'readonly');
const read = file => Buffer.from(pkg.files[file], 'base64'), expected = panelIdentity(read);
const descriptor = { installationId: 'lifecycle-fixture', packageHash: pkg.packageHash, panelToken: 'a'.repeat(64), controlToken: 'b'.repeat(64), cepDir: 'C:/Fixture Core' };
const selected = deriveComposition(pkg.release, read), cfg = installationConfig(descriptor, selected);
function storage() { const data = new Map(); return { get length() { return data.size; }, key: i => [...data.keys()][i] ?? null, getItem: k => data.has(k) ? data.get(k) : null, setItem: (k, v) => data.set(k, String(v)), removeItem: k => data.delete(k) }; }
async function until(fn) { const deadline = Date.now() + 3000; while (!fn()) { if (Date.now() > deadline) assert.fail('lifecycle fixture did not settle'); await new Promise(r => setTimeout(r, 2)); } }
function nativeHost(current = false, localRegistryScope = false) {
  const loaded = [], context = vm.createContext({ File: function (file) { this.fsName = file; }, CompItem: function () {}, app: { version: '26-fixture', project: { file: null, numItems: 0 } }, $: { evalFile(file) { assert.equal(file.fsName, descriptor.cepDir + '/jsx/registry.jsx'); loaded.push(file.fsName); vm.runInContext(read('cep/jsx/registry.jsx').toString(), context); } } });
  context.$.global = context;
  if (current) vm.runInContext(read('cep/jsx/registry.jsx').toString(), context);
  return { context, loaded, run(script) {
    if (localRegistryScope) {
      // Direct eval models ExtendScript evalFile's caller-local var declaration.
      // Each run remains a separate CEP evalScript in the same engine context.
      const load = '$.evalFile(new File(' + JSON.stringify(descriptor.cepDir + '/jsx/registry.jsx') + '));';
      if (script.includes(load)) { loaded.push(descriptor.cepDir + '/jsx/registry.jsx'); script = script.replace(load, 'eval(' + JSON.stringify(read('cep/jsx/registry.jsx').toString()) + ');'); }
    }
    return vm.runInContext(script, context);
  } };
}
function panel(t, options = {}) {
  const config = options.config || cfg, local = options.local || storage(), session = options.session || storage(), native = nativeHost(options.currentRegistry, options.localRegistryScope), elements = {}, calls = [], evals = [], proofs = [], markerReads = [], reloads = [], timers = new Set();
  let sequence = 0, peerId, nonceCount = 0, polls = 0, unload, click, completeResolve, bootstrapCallback, linkCount = 0;
  const marker = options.marker || installationMarker({ ...descriptor, panelToken: 'c'.repeat(64) }, selected);
  for (const id of ['status', 'detail', 'connect', 'start-over']) elements[id] = { dataset: {}, textContent: '', addEventListener(event, callback) { if (id === 'connect') click = callback; } };
  const pins = { installationId: config.installationId, packageHash: config.packageHash, executorHash: config.executorHash };
  const resetState = options.resetState || { id: null, sessionId: null, ownerBootId: '10000000-0000-4000-8000-000000000001', phase: 'ready', requiresAEExit: false, resetComplete: false, baselineRequired: false, fault: null, eligibility: { action: 'request', reason: 'start_over_ready' }, aeAuthority: false };
  const reset = createStartOverPanelControl({ installation: { ...descriptor, panelToken: config.panelToken }, status: () => resetState, request: async () => { throw new Error('fixture_forbids_reset_request'); } });
  function response(body, ok = true) { return { ok, status: ok ? 200 : 403, json: async () => body }; }
  function signed(body) { return response({ body, mac: mac(body, config.panelToken) }); }
  const context = vm.createContext({ JSON, Object, Array, Promise, Error, isFinite, TextEncoder, Uint8Array, AbortController, crypto: webcrypto, localStorage: local, sessionStorage: session, Core4Installation: config,
    document: { getElementById: id => elements[id] }, location: { reload() { reloads.push(true); } },
    cep: { fs: { readFile(file, encoding) { markerReads.push(file); assert.equal(file, descriptor.cepDir + '/installation-state.json'); assert.equal(encoding, 'UTF-8'); return { err: 0, data: JSON.stringify(marker) }; } } },
    __adobe_cep__: { getSystemPath(kind) { assert.equal(kind, 'extension'); return 'file:///' + descriptor.cepDir; }, getExtensionId() { return expected.extensionId; }, evalScript(script, callback) { evals.push(script); const value = native.run(script); if (options.holdBootstrap && evals.length === 1) bootstrapCallback = () => callback(value); else callback(value); } },
    addEventListener(event, callback) { assert.equal(event, 'unload'); unload = callback; },
    setTimeout(callback, ms) { const timer = setTimeout(() => { timers.delete(timer); callback(); }, /requestTimedOut|resetRequestTimedOut/.test(callback.name) ? ms : Math.min(ms, 5)); timers.add(timer); return timer; }, clearTimeout(timer) { clearTimeout(timer); timers.delete(timer); },
    async fetch(url, request) {
      const route = new URL(url).pathname, value = JSON.parse(request.body); calls.push({ route, value });
      if (route.startsWith('/start-over/')) { if (options.resetFailure) throw new TypeError('owner unavailable during status'); const result = await reset.handle(route, value, 'file://'); if (result.body && options.resetTamper) { if (options.resetTamper === 'missing-mac') delete result.mac; else if (options.resetTamper === 'mac') result.mac = '0'.repeat(64); else { result.body[options.resetTamper] = 'wrong'; result.mac = mac({ domain: 'ae-core4/panel-start-over/v1', kind: 'response', body: result.body }, config.panelToken); } } return response(result); }
      if (route === '/challenge') return response({ nonce: String(++nonceCount).padStart(64, '0'), epoch: 'fixture-epoch', controllerId: 'fixture-controller', role: 'panel', origin: 'file://', ...pins });
      if (route === '/link') {
        proofs.push(value); const { proof, ...claim } = value; assert.equal(proof, mac(claim, config.panelToken)); assert.equal(value.extensionRoot, descriptor.cepDir); assert.deepEqual(value.loadedPanel, expected);
        assert.equal(evals.length, 0, 'no native bootstrap before provisional admission');
        if (++linkCount <= (options.duplicates || 0)) return response({ error: 'duplicate_peer' }, false);
        peerId = value.peerId; sequence = 0;
        return signed({ linked: true, epoch: 'fixture-epoch', peerId, controllerId: 'fixture-controller', pins, receiverStoreIdentity: 'fixture-receiver', laneClosed: false, acceptedIdentity: expected, registryReady: false, bootstrap: { nonce: 'd'.repeat(64), expectedRegistryBuildId: expected.registryBuildId, deadline: Date.now() + 90000, sessionId: resetState.sessionId }, ...(config.startOverSupported ? { workSessionId: resetState.sessionId, startOver: resetState } : {}) });
      }
      const b = value.body; assert.equal(value.mac, mac(b, config.panelToken)); assert.equal(b.epoch, 'fixture-epoch'); assert.equal(b.peerId, peerId); assert.equal(b.sequence, ++sequence);
      const reply = payload => signed({ epoch: b.epoch, peerId, sequence: b.sequence, payload });
      if (route === '/registry-ready') { assert.equal(b.payload.registryBuildId, expected.registryBuildId); return reply({ registryReady: true, nonce: b.payload.nonce, registryBuildId: expected.registryBuildId, sessionId: options.wrongAckSession ? '10000000-0000-4000-8000-000000000009' : b.payload.sessionId }); }
      if (route === '/complete') {
        if (options.completeFailure) return response({ error: 'completed_result_conflict' }, false);
        const ack = { ack: { commandId: b.payload.commandId, receiptRef: b.payload.originalBinding.receiptRef } };
        if (options.holdComplete) return new Promise(resolve => { completeResolve = () => resolve(reply(ack)); });
        return reply(ack);
      }
      assert.equal(route, '/poll'); polls++;
      if (options.command && polls === 1) return reply({ command: { assetKey: config.assetKey, phase: 'inspect', typedPayload: {}, commandId: 'fixture-inspection', originalBinding: { commandId: 'fixture-inspection', executorHash: config.executorHash, phase: 'inspect', receiptRef: 'fixture-receipt' }, pins } });
      if (options.failure) { if (options.failure === 'network') throw new TypeError('network unavailable'); return response({ error: 'peer_auth_or_replay' }, false); }
      return new Promise((resolve, reject) => request.signal.addEventListener('abort', () => reject(Object.assign(new Error('abort'), { name: 'AbortError' })), { once: true }));
    }
  });
  vm.runInContext('window=this;', context); vm.runInContext(read('cep/js/poll-dispatcher.js').toString(), context); if (options.beforeStart) options.beforeStart(context); vm.runInContext(read('cep/js/panel.js').toString(), context);
  t.after(async () => { unload(); for (const timer of timers) clearTimeout(timer); await new Promise(r => setTimeout(r, 5)); });
  return { context, calls, evals, proofs, native, local, session, markerReads, reloads, elements, click: () => click(), get polls() { return polls; }, get completePending() { return !!completeResolve; }, releaseComplete() { completeResolve(); }, get bootstrapPending() { return !!bootstrapCallback; }, releaseBootstrap() { bootstrapCallback(); } };
}
test('panel-lifecycle manifest has no pre-admission ScriptPath loader', () => { assert.doesNotMatch(read('cep/CSXS/manifest.xml').toString(), /<ScriptPath>/); });
test('panel-lifecycle old registry refreshes only fixed own path; current registry uses no evalFile', async t => {
  for (const currentRegistry of [false, true]) {
    const f = panel(t, { currentRegistry }); await until(() => f.polls === 1);
    assert.equal(f.evals.length, 1); assert.equal(f.native.loaded.length, currentRegistry ? 0 : 1); assert.deepEqual(JSON.parse(JSON.stringify(f.native.context.AECore4Host.identity())), { protocolVersion: 1, registryBuildId: expected.registryBuildId });
    assert.deepEqual(f.calls.slice(0, 4).map(c => c.route), ['/challenge', '/link', '/registry-ready', '/poll']);
  }
});

test('panel-lifecycle caller-local registry survives bootstrap into a separate native dispatch', async t => {
  const old = nativeHost(false, true);
  assert.equal(old.run('(function(){$.evalFile(new File(' + JSON.stringify(descriptor.cepDir + '/jsx/registry.jsx') + '));return AECore4Host.identity().registryBuildId;}())'), expected.registryBuildId);
  assert.equal(old.run('typeof AECore4Host'), 'undefined', 'local bootstrap identity alone cannot establish global readiness');
  const f = panel(t, { localRegistryScope: true, command: true });
  await until(() => f.calls.some(c => c.route === '/complete'));
  assert.equal(f.evals.length, 2); assert.equal(f.native.loaded.length, 1);
  assert.equal(f.native.run('AECore4Host === $.global.AECore4Host'), true);
  const result = f.calls.find(c => c.route === '/complete').value.body.payload.result;
  assert.equal(result.observationVersion, 1); assert.equal(result.readFailureVersion, undefined);
  assert.deepEqual(f.calls.slice(0, 5).map(c => c.route), ['/challenge', '/link', '/registry-ready', '/poll', '/complete']);
});

test('panel-lifecycle bootstrap never publishes a wrong or nondispatching registry', async () => {
  for (const candidate of [
    '({identity:function(){return {protocolVersion:1,registryBuildId:"' + expected.registryBuildId + '"};}})',
    '({identity:function(){return {protocolVersion:1,registryBuildId:"' + '0'.repeat(64) + '"};},dispatch:function(){}})'
  ]) {
    const api = isolatedDispatcher(), local = storage(), native = nativeHost(false, true), original = native.run('$.global.AECore4Host={old:true}'); let completeCalls = 0;
    const binding = { epoch: 'fixture', peerId: 'fixture-peer', nonce: 'd'.repeat(64), packageHash: cfg.packageHash, sessionId: null };
    await assert.rejects(api.bootstrapRegistry({ installationId: cfg.installationId, storage: local, extensionRoot: descriptor.cepDir, registryBuildId: expected.registryBuildId, binding,
      csInterface: { evalScript(script, done) { const load = '$.evalFile(new File(' + JSON.stringify(descriptor.cepDir + '/jsx/registry.jsx') + '));'; done(native.run(script.replace(load, 'eval(' + JSON.stringify('var AECore4Host=' + candidate + ';') + ');'))); } },
      complete() { completeCalls++; return Promise.resolve(); }
    }), /invalid_frame/);
    assert.equal(native.context.AECore4Host, original); assert.equal(completeCalls, 0); assert.notEqual(local.getItem(api.registryKey(cfg.installationId)), null);
  }
});
test('panel-lifecycle duplicate peer gets no native bootstrap until accepted provisional link', async t => {
  const f = panel(t, { duplicates: 2 }); await until(() => f.polls === 1); assert.equal(f.calls.filter(c => c.route === '/link').length, 3); assert.equal(f.evals.length, 1); assert.equal(f.calls.filter(c => c.route === '/registry-ready').length, 1);
});
test('panel-lifecycle changed marker rotates same-package config through one fixed reload and preserves closure credentials', async t => {
  const session = storage(), rotated = { ...cfg, panelToken: 'c'.repeat(64) }, marker = { version: 1, installationId: cfg.installationId, packageHash: cfg.packageHash, panelConfigHash: hash(rotated) };
  const f = panel(t, { failure: 'auth', marker, session }); await until(() => f.reloads.length === 1); assert.equal(f.markerReads.length, 1); assert.equal(f.context.Core4Installation.panelToken, cfg.panelToken); assert.equal(f.proofs.length, 1);
  const pair = 'aeagentcore4-reload-' + cfg.installationId + '-' + hash(cfg) + '-' + hash(rotated); assert.equal(session.getItem(pair), 'pending');
  const next = panel(t, { config: rotated, marker, session, currentRegistry: true }); await until(() => next.polls === 1); assert.equal(next.reloads.length, 0); assert.equal(session.getItem(pair), 'settled');
  const repeatOldDocument = panel(t, { failure: 'auth', marker, session }); await until(() => repeatOldDocument.elements.connect.disabled === false); assert.equal(repeatOldDocument.reloads.length, 0);
});
test('panel-lifecycle unchanged marker and auth/network errors alone never reload', async t => {
  const marker = { version: 1, installationId: cfg.installationId, packageHash: cfg.packageHash, panelConfigHash: hash(cfg) };
  const f = panel(t, { failure: 'auth', marker }); await until(() => f.elements.connect.disabled === false); assert.equal(f.reloads.length, 0);
  const foreign = panel(t, { failure: 'auth', marker: { ...marker, installationId: 'foreign', panelConfigHash: 'f'.repeat(64) } }); await until(() => foreign.elements.connect.disabled === false); assert.equal(foreign.reloads.length, 0);
});
test('panel-lifecycle owner signed session watcher unwinds before changed-marker reload and never sends reset', async t => {
  const config = { ...cfg, startOverSupported: true }, marker = { version: 1, installationId: config.installationId, packageHash: config.packageHash, panelConfigHash: hash({ ...config, panelToken: 'c'.repeat(64) }) };
  const f = panel(t, { config }); await until(() => f.polls === 1); assert.equal(f.evals.length, 1); assert.equal(f.calls.some(c => c.route === '/start-over/request'), false);
  const disconnected = panel(t, { config, marker, resetFailure: true }); await until(() => disconnected.reloads.length === 1); assert.equal(disconnected.evals.length, 0); assert.equal(disconnected.calls.some(c => c.route === '/start-over/request'), false);
});
test('panel-lifecycle dispatch completion ACK and bootstrap callback keep reload guard closed', async t => {
  const f = panel(t, { command: true, holdComplete: true, failure: 'auth' }); await until(() => f.completePending);
  assert.equal(f.context.Core4PollDispatcher.nativePending(), false); assert.equal(f.context.Core4PollDispatcher.reloadIdle(f.local, cfg.installationId, null, false), false); await f.click(); assert.equal(f.reloads.length, 0);
  f.releaseComplete(); await until(() => f.reloads.length === 1);
  const b = panel(t, { holdBootstrap: true }); await until(() => b.bootstrapPending); assert.equal(b.context.Core4PollDispatcher.nativePending(), true); assert.equal(b.context.Core4PollDispatcher.reloadIdle(b.local, cfg.installationId, null, false), false); assert.equal(b.calls.some(c => c.route === '/poll'), false);
  b.releaseBootstrap(); await until(() => b.polls === 1);
});
test('panel-lifecycle registry bootstrap latch survives a new document and forbids native replay', async t => {
  const local = storage(), f = panel(t, { local, holdBootstrap: true }); await until(() => f.bootstrapPending);
  const next = panel(t, { local }); await until(() => next.elements.connect.disabled === false); assert.equal(next.evals.length, 0); assert.equal(next.calls.some(c => c.route === '/poll'), false); assert.equal(local.getItem(f.context.Core4PollDispatcher.registryKey(cfg.installationId)) !== null, true);
});
test('panel-lifecycle reload guard retains historical latches unless signed reset retires their session', async t => {
  const f = panel(t); await until(() => f.polls === 1); const api = f.context.Core4PollDispatcher, oldSession = '10000000-0000-4000-8000-000000000001', newSession = '10000000-0000-4000-8000-000000000002';
  const key = api.storageKey(cfg.installationId, oldSession); f.local.setItem(key, '{"unresolved":true}'); assert.equal(api.reloadIdle(f.local, cfg.installationId, newSession, false), false); assert.equal(api.reloadIdle(f.local, cfg.installationId, newSession, true), true); assert.equal(f.local.getItem(key), '{"unresolved":true}');
});
async function wire(t, options = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'core4-registry-')); t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const installation = { ...descriptor, cepDir: path.join(directory, 'com.codex.aeagentcore4') }, peer = createHttpPeer({ ...options, installation, directory: path.join(directory, 'receiver'), asset: { assetKey: 'project-inspection-v1', executorHash: cfg.executorHash }, expectedPanelIdentity: expected, port: 0 }); await peer.listen(); t.after(() => peer.close());
  const post = async (route, body) => (await fetch('http://127.0.0.1:' + peer.status().port + route, { method: 'POST', headers: { Origin: 'file://', 'Content-Type': 'application/json' }, body: canonical(body) })).json();
  async function link(patch = {}) { const challenge = await post('/challenge', { role: 'panel' }), claim = { challenge, peerId: 'registry-fixture', loadedPanel: expected, extensionRoot: installation.cepDir.replace(/\\/g, '/'), ...patch }; return post('/link', { ...claim, proof: mac(claim, installation.panelToken) }); }
  let sequence = 0; function frame(route, payload, bad = false) { const body = { epoch: peer.status().peer.identityEpoch, peerId: 'registry-fixture', sequence: sequence + 1, method: 'POST', path: route, payload }; if (!bad) sequence++; return { body, mac: bad ? '0'.repeat(64) : mac(body, installation.panelToken) }; }
  return { peer, installation, directory, post, link, frame };
}
test('panel-lifecycle provisional peer rejects poll/inspection/connect and wrong root/nonce/build/MAC before ready', async t => {
  const f = await wire(t); assert.equal((await f.link({ extensionRoot: 'C:/foreign' })).error, 'panel_extension_root'); assert.equal(f.peer.status().registryBootstrap, null);
  const linked = await f.link(); assert.equal(linked.body.registryReady, false); assert.equal(f.peer.status().pending.stage, 'registry-bootstrap');
  assert.equal((await f.link()).error, 'duplicate_peer');
  assert.throws(() => f.peer.inspect({}), /registry_not_ready/); await assert.rejects(f.peer.transport.connect({ controllerId: 'x', channelEpoch: 'y', secret: 'z' }), /registry_not_ready/);
  assert.equal((await f.post('/poll', f.frame('/poll', {}))).error, 'registry_not_ready');
  const value = { nonce: linked.body.bootstrap.nonce, registryBuildId: expected.registryBuildId, refreshed: true, sessionId: null };
  assert.equal((await f.post('/registry-ready', f.frame('/registry-ready', value, true))).error, 'peer_auth_or_replay');
  for (const patch of [{ nonce: 'f'.repeat(64) }, { registryBuildId: 'e'.repeat(64) }]) assert.equal((await f.post('/registry-ready', f.frame('/registry-ready', { ...value, ...patch }))).error, 'registry_ready_binding');
  const ack = await f.post('/registry-ready', f.frame('/registry-ready', value)); assert.equal(ack.body.payload.registryReady, true); assert.equal(f.peer.status().peer.registryReady, true); assert.equal(f.peer.status().peer.registryBuildId, expected.registryBuildId); assert.equal(f.peer.status().pending, null);
  const records = fs.readFileSync(path.join(f.directory, 'receiver/completions.ndjson'), 'utf8'); assert.ok(records.indexOf('"type":"begin"') < records.indexOf('"type":"complete"'));
});
test('panel-lifecycle old executing JS cannot adopt a new on-disk cfg identity or receive bootstrap admission', async t => {
  const f = await wire(t), { registryBuildId, ...oldLiteral } = expected;
  assert.equal((await f.link({ loadedPanel: oldLiteral })).error, 'panel_identity_mismatch'); assert.equal(f.peer.status().peer.connected, false); assert.equal(f.peer.status().registryBootstrap, null);
});
test('panel-lifecycle native bootstrap timeout retains durable UNKNOWN and rejects late ready without new epoch promotion', async t => {
  const f = await wire(t, { registryTimeoutMs: 15 }), linked = await f.link(); await until(() => f.peer.status().unknown === true);
  const value = { nonce: linked.body.bootstrap.nonce, registryBuildId: expected.registryBuildId, refreshed: true, sessionId: null };
  assert.equal((await f.post('/registry-ready', f.frame('/registry-ready', value))).error, 'registry_outcome_unknown'); assert.equal(f.peer.status().peer.registryReady, false);
  const bytes = fs.readFileSync(path.join(f.directory, 'receiver/completions.ndjson')); assert.equal(bytes.toString().includes('"type":"unknown"'), true); assert.equal(bytes.toString().includes('"type":"complete"'), false);
  assert.equal((await f.link({ peerId: 'new-epoch-attempt' })).error, 'duplicate_peer'); assert.deepEqual(fs.readFileSync(path.join(f.directory, 'receiver/completions.ndjson')), bytes);
});
test('panel-lifecycle different composition changes registry ID and same-package credential rotation changes marker only', () => {
  const operator = buildPackage(undefined, 'operator-render-jobs', { runtimeModel: 'owner' }), operatorId = panelIdentity(file => Buffer.from(operator.files[file], 'base64'));
  assert.equal(Object.hasOwn(pkg.files, 'runtime/ae-panel-startup.js'), false); assert.equal(Object.hasOwn(pkg.files, 'runtime/host/ensure-panel.jsx'), false); assert.ok(operator.files['runtime/ae-panel-startup.js']); assert.ok(operator.files['runtime/host/ensure-panel.jsx']);
  assert.notEqual(operatorId.registryBuildId, expected.registryBuildId); const a = installationMarker(descriptor, selected), b = installationMarker({ ...descriptor, panelToken: 'c'.repeat(64) }, selected);
  assert.equal(a.packageHash, b.packageHash); assert.notEqual(a.panelConfigHash, b.panelConfigHash); assert.equal(JSON.stringify(b).includes('c'.repeat(64)), false);
});
const S1 = '10000000-0000-4000-8000-000000000011', S2 = '10000000-0000-4000-8000-000000000012', RESET = '10000000-0000-4000-8000-000000000013';
const completedReset = { id: RESET, sessionId: S2, ownerBootId: '10000000-0000-4000-8000-000000000001', phase: 'baseline-required', requiresAEExit: false, resetComplete: true, baselineRequired: true, fault: null, eligibility: { action: 'none', reason: 'start_over_baseline_required' }, aeAuthority: false };
const bootKey = 'aeagentcore4-registry-' + cfg.installationId;
function oldLatch(sessionId = S1) { return JSON.stringify({ binding: { epoch: 'old-epoch', peerId: 'old-peer', nonce: 'e'.repeat(64), packageHash: cfg.packageHash, sessionId }, registryBuildId: expected.registryBuildId, extensionRoot: descriptor.cepDir }, null, 1); }
function isolatedDispatcher() { const context = vm.createContext({ JSON, Object, Array, Promise, Error, isFinite }); vm.runInContext(read('cep/js/poll-dispatcher.js').toString(), context); return context.Core4PollDispatcher; }
async function resetProof(state = completedReset) {
  const control = createStartOverPanelControl({ installation: descriptor, status: () => state, request: async () => { throw new Error('no reset mutation'); } });
  const challenge = (await control.handle('/start-over/challenge', { action: 'status' }, 'file://')).challenge;
  const response = await control.handle('/start-over/status', { challenge, proof: mac({ domain: 'ae-core4/panel-start-over/v1', kind: 'request', challenge }, cfg.panelToken) }, 'file://');
  return { challenge, response };
}
function retireOptions(local, proof, patch = {}) { return { installationId: cfg.installationId, storage: local, proof, async digest(raw) { return hash(raw); }, async verifyProof(p) { const c = p.challenge, b = p.response.body; return c.purpose === 'start-over' && c.action === 'status' && c.installationId === cfg.installationId && c.packageHash === cfg.packageHash && b.nonce === c.nonce && b.epoch === c.epoch && b.installationId === c.installationId && b.packageHash === c.packageHash && p.response.mac === mac({ domain: 'ae-core4/panel-start-over/v1', kind: 'response', body: b }, cfg.panelToken); }, ...patch }; }
test('panel-lifecycle retirement rejects missing/forged MAC and wrong nonce or pins with exact active bytes and zero eval', async t => {
  for (const resetTamper of ['missing-mac', 'mac', 'nonce', 'packageHash']) {
    const local = storage(), raw = oldLatch(); local.setItem(bootKey, raw);
    const f = panel(t, { config: { ...cfg, startOverSupported: true }, local, resetState: completedReset, resetTamper }); await until(() => f.elements.connect.disabled === false);
    assert.equal(local.getItem(bootKey), raw); assert.equal(f.evals.length, 0); assert.equal(f.calls.some(c => c.route === '/link'), false);
  }
});
test('panel-lifecycle retirement rejects incomplete/same/null/missing-session/fault/awaiting proof', async () => {
  for (const state of [{ ...completedReset, resetComplete: false }, { ...completedReset, sessionId: S1 }, { ...completedReset, sessionId: null }, { ...completedReset, phase: 'blocked' }, { ...completedReset, phase: 'awaiting-ae' }, { ...completedReset, fault: 'retained_unknown' }, { ...completedReset, requiresAEExit: true }]) {
    const local = storage(), raw = oldLatch(); local.setItem(bootKey, raw); assert.equal(await isolatedDispatcher().retireRegistryLatch(retireOptions(local, await resetProof(state))), false); assert.equal(local.getItem(bootKey), raw);
  }
  const local = storage(), missing = JSON.parse(oldLatch()); delete missing.binding.sessionId; const raw = JSON.stringify(missing); local.setItem(bootKey, raw);
  assert.equal(await isolatedDispatcher().retireRegistryLatch(retireOptions(local, await resetProof())), false); assert.equal(local.getItem(bootKey), raw);
});
test('panel-lifecycle ordinary reload/new epoch/config rotation cannot retire old UNKNOWN', async t => {
  const local = storage(), raw = oldLatch(); local.setItem(bootKey, raw);
  const f = panel(t, { local, failure: 'auth' }); await until(() => f.elements.connect.disabled === false); assert.equal(f.reloads.length, 0); assert.equal(f.evals.length, 0); assert.equal(local.getItem(bootKey), raw);
});
test('panel-lifecycle signed completed S1 or explicit null to S2 archives exact UNKNOWN then permits one new session bootstrap', async t => {
  for (const old of [S1, null]) {
    const local = storage(), raw = oldLatch(old); local.setItem(bootKey, raw);
    const f = panel(t, { config: { ...cfg, startOverSupported: true }, local, resetState: completedReset }); await until(() => f.polls === 1);
    const archives = Array.from({ length: local.length }, (_, i) => local.key(i)).filter(key => key.startsWith(bootKey + '-archive-')); assert.equal(archives.length, 1);
    const archived = JSON.parse(local.getItem(archives[0])); assert.equal(archived.raw, raw); assert.equal(archived.digest, hash(raw)); assert.equal(archived.oldSessionId, old); assert.equal(archived.newSessionId, S2); assert.equal(archived.outcome, 'unknown_preserved'); assert.equal(archived.proof.response.body.status.baselineRequired, true); assert.equal(local.getItem(bootKey), null); assert.equal(f.evals.length, 1);
    const ready = f.calls.find(c => c.route === '/registry-ready'); assert.equal(ready.value.body.payload.sessionId, S2); assert.match(f.elements.status.textContent, /требуется чтение проекта/);
  }
});
function pendingBoot(api, local, sessionId, options = {}) {
  const native = nativeHost(true); let callback, ackResolve, posts = 0;
  const binding = { epoch: sessionId, peerId: 'fixture-peer', nonce: sessionId === S1 ? 'e'.repeat(64) : 'f'.repeat(64), packageHash: cfg.packageHash, sessionId };
  const promise = api.bootstrapRegistry({ installationId: cfg.installationId, storage: local, extensionRoot: descriptor.cepDir, registryBuildId: expected.registryBuildId, binding, csInterface: { evalScript(script, done) { const raw = native.run(script); callback = () => done(raw); if (options.immediate) callback(); } }, complete(value) { posts++; const ack = { registryReady: true, nonce: value.nonce, registryBuildId: value.registryBuildId, sessionId: value.sessionId }; if (options.holdAck) return new Promise(resolve => { ackResolve = () => resolve(ack); }); return Promise.resolve(ack); } });
  return { promise, callback: () => callback(), ack: () => ackResolve(), get posts() { return posts; } };
}
test('panel-lifecycle native callback or completion ACK in flight blocks retirement even with valid reset proof', async () => {
  for (const holdAck of [false, true]) {
    const local = storage(), api = isolatedDispatcher(), boot = pendingBoot(api, local, S1, { immediate: holdAck, holdAck }); const raw = local.getItem(bootKey);
    assert.equal(await api.retireRegistryLatch(retireOptions(local, await resetProof())), false); assert.equal(local.getItem(bootKey), raw);
    if (holdAck) boot.ack(); else boot.callback(); await boot.promise;
  }
});
test('panel-lifecycle archive conflict/write failure and raw change during digest never delete active latch', async () => {
  const proof = await resetProof();
  for (const failure of ['conflict', 'write', 'changed']) {
    const local = storage(), raw = oldLatch(), api = isolatedDispatcher(); local.setItem(bootKey, raw);
    const archiveKey = bootKey + '-archive-' + hash(raw) + '-reset-' + RESET;
    if (failure === 'conflict') local.setItem(archiveKey, 'foreign archive');
    const set = local.setItem;
    if (failure === 'write') local.setItem = (key, value) => { if (key === archiveKey) throw new Error('fixture_archive_write'); set(key, value); };
    const options = retireOptions(local, proof, failure === 'changed' ? { async digest() { local.setItem(bootKey, 'new active bytes'); return hash(raw); } } : {});
    if (failure === 'changed') assert.equal(await api.retireRegistryLatch(options), false); else await assert.rejects(api.retireRegistryLatch(options), /registry_archive_conflict|fixture_archive_write/);
    assert.equal(local.getItem(bootKey), failure === 'changed' ? 'new active bytes' : raw);
  }
});
test('panel-lifecycle old S1 callback or ACK cannot overwrite/save/post/clear replacement S2 latch', async () => {
  for (const holdAck of [false, true]) {
    const local = storage(), oldApi = isolatedDispatcher(), prior = pendingBoot(oldApi, local, S1, { immediate: holdAck, holdAck }); const rejected = assert.rejects(prior.promise, /registry_latch_replaced/);
    const nextApi = isolatedDispatcher(); assert.equal(await nextApi.retireRegistryLatch(retireOptions(local, await resetProof())), true);
    const next = pendingBoot(nextApi, local, S2), nextRaw = local.getItem(bootKey);
    if (holdAck) prior.ack(); else prior.callback(); await rejected; assert.equal(local.getItem(bootKey), nextRaw); assert.equal(prior.posts, holdAck ? 1 : 0);
    next.callback(); await next.promise; assert.equal(local.getItem(bootKey), null);
  }
});
test('panel-lifecycle registry ready session tamper/missing fails binding and wrong signed ACK session retains latch', async t => {
  const f = await wire(t, { workSessionId: S2 }), linked = await f.link(), payload = { nonce: linked.body.bootstrap.nonce, registryBuildId: expected.registryBuildId, refreshed: true, sessionId: S2 };
  const missing = { ...payload }; delete missing.sessionId;
  for (const value of [missing, { ...payload, sessionId: S1 }]) assert.equal((await f.post('/registry-ready', f.frame('/registry-ready', value))).error, 'registry_ready_binding');
  assert.equal((await f.post('/registry-ready', f.frame('/registry-ready', payload))).body.payload.sessionId, S2);
  const panelFixture = panel(t, { wrongAckSession: true }); await until(() => panelFixture.elements.connect.disabled === false); assert.equal(panelFixture.local.getItem(bootKey) !== null, true); assert.equal(panelFixture.polls, 0);
});
test('panel-lifecycle signed reset status precedes old latch gate; no new provisional link while UNKNOWN remains', async t => {
  const local = storage(), raw = oldLatch(); local.setItem(bootKey, raw);
  const f = panel(t, { config: { ...cfg, startOverSupported: true }, local, resetState: { ...completedReset, resetComplete: false } }); await until(() => f.elements.connect.disabled === false);
  assert.deepEqual(f.calls.map(c => c.route), ['/start-over/challenge', '/start-over/status']); assert.equal(f.evals.length, 0); assert.equal(local.getItem(bootKey), raw);
});

const legacyPhysicalKey = 'aeagentcore4-physical-' + cfg.installationId;
const historicalPhysicalRaw = JSON.stringify({ frame: { commandId: 'legacy-inspection', originalBinding: { receiptRef: 'legacy-receipt' }, pins: { packageHash: 'old-package' } }, result: { preserved: true } });
function legacyPhysicalStorage() { const local = storage(); local.setItem(legacyPhysicalKey, historicalPhysicalRaw); local.setItem(legacyPhysicalKey + '-session-' + S1, '{"oldUnknown":true}'); return local; }
test('panel-lifecycle completed authenticated reset admits legacy null and old UUID history without recovery or changing bytes', async t => {
  const local = legacyPhysicalStorage(), before = Array.from({ length: local.length }, (_, i) => [local.key(i), local.getItem(local.key(i))]);
  const f = panel(t, { config: { ...cfg, startOverSupported: true }, local, resetState: completedReset }); await until(() => f.polls === 1);
  assert.equal(f.evals.length, 1); assert.equal(f.calls.filter(c => c.route === '/link').length, 1); assert.equal(f.calls.some(c => c.route === '/complete'), false);
  for (const [key, raw] of before) assert.equal(local.getItem(key), raw);
  assert.equal(local.getItem(legacyPhysicalKey + '-session-' + S2), null); assert.match(f.elements.status.textContent, /требуется чтение проекта/);
});
test('panel-lifecycle legacy history remains closed without complete authenticated nonnull reset session', async t => {
  const cases = [
    { config: cfg },
    ...[{ resetComplete: false }, { id: null }, { sessionId: null }, { fault: 'retained_unknown' }, { requiresAEExit: true }, { phase: 'blocked' }].map(patch => ({ resetState: { ...completedReset, ...patch } })),
    ...['missing-mac', 'mac', 'nonce', 'packageHash'].map(resetTamper => ({ resetTamper }))
  ];
  for (const options of cases) {
    const local = legacyPhysicalStorage(), f = panel(t, { config: { ...cfg, startOverSupported: true }, resetState: completedReset, ...options, local });
    await until(() => f.elements.connect.disabled === false); assert.equal(f.calls.some(c => c.route === '/link'), false); assert.equal(f.evals.length, 0); assert.equal(f.calls.some(c => c.route === '/complete'), false); assert.equal(local.getItem(legacyPhysicalKey), historicalPhysicalRaw);
  }
  const local = legacyPhysicalStorage(), f = panel(t, { config: { ...cfg, startOverSupported: true }, local, resetState: { ...completedReset, phase: 'awaiting-ae', resetComplete: false, requiresAEExit: true } });
  await until(() => f.calls.some(c => c.route === '/start-over/status')); await new Promise(r => setTimeout(r, 20));
  assert.equal(f.calls.some(c => c.route === '/link'), false); assert.equal(f.evals.length, 0); assert.equal(local.getItem(legacyPhysicalKey), historicalPhysicalRaw);
});
test('panel-lifecycle current session native and completion operations deny admission before any provisional link', async t => {
  for (const busy of ['current', 'native', 'completion']) {
    const local = legacyPhysicalStorage(); let release, pending;
    if (busy === 'current') local.setItem(legacyPhysicalKey + '-session-' + S2, '{"currentUnknown":true}');
    const f = panel(t, { config: { ...cfg, startOverSupported: true }, local, resetState: completedReset, beforeStart(context) {
      if (busy === 'native') context.__aeCore4NativeCallbackGuard.active = { originalCallback: true };
      if (busy === 'completion') {
        const api = context.Core4PollDispatcher, record = { frame: { commandId: 'old-completion', originalBinding: { receiptRef: 'old-receipt' } }, result: { preserved: true } };
        local.setItem(api.storageKey(cfg.installationId, S1), JSON.stringify(record));
        pending = api.createDispatcher({ installationId: cfg.installationId, sessionId: S1, storage: local, complete: () => new Promise(resolve => { release = () => resolve({ ack: { commandId: 'old-completion', receiptRef: 'old-receipt' } }); }) }).recover();
      }
    } });
    await until(() => f.elements.connect.disabled === false); assert.match(f.elements.status.textContent, /registry_local_busy/); assert.equal(f.calls.some(c => c.route === '/link'), false); assert.equal(f.evals.length, 0); assert.equal(local.getItem(legacyPhysicalKey), historicalPhysicalRaw);
    if (pending) { release(); await pending; }
  }
});
test('panel-lifecycle legacy exemption requires explicit nonnull valid current session even at dispatcher seam', () => {
  const api = isolatedDispatcher(), local = legacyPhysicalStorage();
  for (const session of [undefined, null, '', 'not-a-session']) {
    if (session !== undefined && session !== null) assert.throws(() => api.reloadIdle(local, cfg.installationId, session, true), /physical_session_binding/);
    else assert.equal(api.reloadIdle(local, cfg.installationId, session, true), false);
  }
  assert.equal(api.reloadIdle(local, cfg.installationId, S2, false), false); assert.equal(api.reloadIdle(local, cfg.installationId, S2, true), true); assert.equal(local.getItem(legacyPhysicalKey), historicalPhysicalRaw);
});

test('panel-lifecycle admission retains current saved-result recovery by one completion ACK before registry bootstrap', async t => {
  const local = legacyPhysicalStorage(), key = legacyPhysicalKey + '-session-' + S2;
  const frame = { commandId: 'saved-current-inspection', originalBinding: { commandId: 'saved-current-inspection', executorHash: cfg.executorHash, phase: 'inspect', receiptRef: 'saved-current-receipt' }, pins: { installationId: cfg.installationId, packageHash: cfg.packageHash, executorHash: cfg.executorHash } };
  local.setItem(key, JSON.stringify({ frame, result: { alreadyExecuted: true } }));
  const f = panel(t, { config: { ...cfg, startOverSupported: true }, local, resetState: completedReset }); await until(() => f.polls === 1);
  assert.equal(local.getItem(key), null); assert.equal(local.getItem(legacyPhysicalKey), historicalPhysicalRaw); assert.equal(f.evals.length, 1); assert.doesNotMatch(f.evals[0], /AECore4Host.dispatch/);
  assert.equal(f.calls.filter(c => c.route === '/complete').length, 1); const routes = f.calls.map(c => c.route); assert.ok(routes.indexOf('/link') < routes.indexOf('/complete')); assert.ok(routes.indexOf('/complete') < routes.indexOf('/registry-ready'));
});

const initialNullReset = { ...completedReset, id: null, sessionId: null, phase: 'ready', resetComplete: false, baselineRequired: false };
function currentResultRecord() { return { frame: { commandId: 'current-inspection', originalBinding: { commandId: 'current-inspection', executorHash: cfg.executorHash, phase: 'inspect', receiptRef: 'current-receipt' }, pins: { installationId: cfg.installationId, packageHash: cfg.packageHash, executorHash: cfg.executorHash } }, result: { alreadyExecuted: true } }; }
test('panel-lifecycle signed initial explicit null session preserves current base result ACK-only recovery', async t => {
  const local = storage(); local.setItem(legacyPhysicalKey, JSON.stringify(currentResultRecord()));
  const f = panel(t, { config: { ...cfg, startOverSupported: true }, local, resetState: initialNullReset }); await until(() => f.polls === 1);
  assert.equal(local.getItem(legacyPhysicalKey), null); assert.equal(f.calls.filter(c => c.route === '/complete').length, 1); assert.equal(f.evals.length, 1); assert.doesNotMatch(f.evals[0], /AECore4Host.dispatch/);
  const routes = f.calls.map(c => c.route); assert.ok(routes.indexOf('/complete') < routes.indexOf('/registry-ready'));
});
test('panel-lifecycle explicit null result recovery rejects stale pins missing session and failed original ACK before native bootstrap', async t => {
  for (const mode of ['stale-pins', 'no-result', 'missing-session', 'forged-status', 'ack-refused']) {
    const local = storage(), record = currentResultRecord();
    if (mode === 'stale-pins') record.frame.pins.packageHash = 'f'.repeat(64);
    if (mode === 'no-result') delete record.result;
    const state = { ...initialNullReset }; if (mode === 'missing-session') delete state.sessionId;
    const raw = JSON.stringify(record); local.setItem(legacyPhysicalKey, raw);
    const f = panel(t, { config: { ...cfg, startOverSupported: true }, local, resetState: state, resetTamper: mode === 'forged-status' ? 'mac' : undefined, completeFailure: mode === 'ack-refused' });
    await until(() => f.elements.connect.disabled === false); assert.equal(f.evals.length, 0); assert.equal(f.calls.some(c => c.route === '/registry-ready'), false); assert.equal(local.getItem(legacyPhysicalKey), raw);
    assert.equal(f.calls.filter(c => c.route === '/link').length, mode === 'ack-refused' ? 1 : 0);
    assert.equal(f.calls.filter(c => c.route === '/complete').length, mode === 'ack-refused' ? 1 : 0);
  }
});

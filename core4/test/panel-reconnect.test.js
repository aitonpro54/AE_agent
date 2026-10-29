'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto, createHmac } = require('node:crypto');
const { canonical } = require('../protocol/json');

// Strict signed-fetch fixture: production panel + dispatcher + real WebCrypto,
// synthetic HTTP responses and test-only clock. No socket, installed config,
// credentials, production port/state, CEP UI or AE is accessed by this suite.
const panelSource = fs.readFileSync(path.join(__dirname, '../cep/js/panel.js'), 'utf8');
const dispatcherSource = fs.readFileSync(path.join(__dirname, '../cep/js/poll-dispatcher.js'), 'utf8');
const cfg = { installationId: 'reconnect-fixture', packageHash: 'fixture-package', executorHash: 'fixture-executor', panelToken: 'test-only-panel-secret', assetKey: 'fixture-inspection' };
const pins = { installationId: cfg.installationId, packageHash: cfg.packageHash, executorHash: cfg.executorHash };
const latchKey = 'aeagentcore4-physical-' + cfg.installationId;
function storage(initial) {
  const values = new Map(initial ? [[latchKey, JSON.stringify(initial)]] : []);
  return { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
}
function reply(status, body) { return { ok: status >= 200 && status < 300, status, json: async () => JSON.parse(JSON.stringify(body)) }; }
function mac(body, secret) { return createHmac('sha256', secret).update(canonical(body)).digest('hex'); }
function signed(body) { return reply(200, { body, mac: mac(body, cfg.panelToken) }); }
async function until(predicate) {
  const deadline = Date.now() + 3000;
  while (!predicate()) { if (Date.now() >= deadline) assert.fail('fixture did not settle'); await new Promise(resolve => setTimeout(resolve, 1)); }
}
function panel(options = {}) {
  const calls = [], timers = [], waits = [], statuses = [], failures = [], linkProofs = [], challenges = [];
  const localStorage = options.storage || storage();
  let now = 0, finished = false, click, challengeSerial = 0, linkedPeer, requestSequence = 0, nativeCalls = 0, recovered = 0, dispatches = 0, disabled = false;
  const elements = { detail: {}, status: { set textContent(value) { statuses.push(value); }, get textContent() { return statuses.at(-1); } }, connect: {
    addEventListener(event, handler) { assert.equal(event, 'click'); click = handler; },
    get disabled() { return disabled; }, set disabled(value) { disabled = value; if (!value) finished = true; }
  } };
  class Clock extends Date { static now() { return now; } }
  const context = vm.createContext({ TextEncoder, Uint8Array, Date: Clock, crypto: webcrypto, localStorage, Core4Installation: cfg,
    document: { getElementById: id => elements[id] },
    __adobe_cep__: { evalScript() { nativeCalls++; throw new Error('fixture_forbids_native_dispatch'); } },
    setTimeout(callback, ms) { assert.ok(ms > 0 && ms <= 3000); timers.push({ callback, ms }); waits.push(ms); },
    async fetch(url, request) {
      try {
        const route = new URL(url).pathname, value = JSON.parse(request.body);
        assert.equal(url, 'http://127.0.0.1:3457' + route); // String assertion only; no real fetch.
        assert.equal(request.method, 'POST'); assert.deepEqual(Object.keys(request.headers), ['Content-Type']); assert.equal(request.headers['Content-Type'], 'application/json');
        assert.equal(request.credentials, 'omit'); assert.equal(request.cache, 'no-store'); assert.equal(request.body, canonical(value));
        calls.push({ route, value, at: now });
        if (route === '/challenge') {
          assert.deepEqual(value, { role: 'panel' });
          const challenge = { nonce: 'nonce-' + ++challengeSerial, epoch: 'fixture-epoch', controllerId: 'fixture-controller', role: 'panel', origin: 'null', ...pins };
          challenges.push(challenge);
          return options.challenge ? await options.challenge({ challenge, attempt: challengeSerial, reply, elapse: ms => { now += ms; } }) : reply(200, challenge);
        }
        if (route === '/link') {
          assert.deepEqual(Object.keys(value).sort(), ['challenge', 'peerId', 'proof']); assert.equal(canonical(value.challenge), canonical(challenges.at(-1)));
          assert.equal(value.proof, mac({ challenge: value.challenge, peerId: value.peerId }, cfg.panelToken));
          assert.ok(!linkProofs.includes(value.proof), 'fresh challenge and proof required on every attempt'); linkProofs.push(value.proof);
          const attempt = calls.filter(call => call.route === '/link').length;
          if (attempt <= (options.duplicates || 0)) return reply(403, { error: 'duplicate_peer' });
          linkedPeer = value.peerId;
          const body = { linked: true, epoch: value.challenge.epoch, peerId: value.peerId, controllerId: 'fixture-controller', pins, receiverStoreIdentity: 'fixture-store', laneClosed: false };
          return options.link ? await options.link({ body, attempt, reply, signed, elapse: ms => { now += ms; } }) : signed(body);
        }
        assert.ok(['/poll', '/complete'].includes(route), 'no other transport route');
        assert.deepEqual(Object.keys(value).sort(), ['body', 'mac']); assert.equal(value.mac, mac(value.body, cfg.panelToken));
        assert.equal(value.body.path, route); assert.equal(value.body.method, 'POST'); assert.equal(value.body.epoch, 'fixture-epoch'); assert.equal(value.body.peerId, linkedPeer); assert.equal(value.body.sequence, ++requestSequence);
        if (options.channel) return await options.channel({ route, value, reply, signed });
        assert.equal(route, '/poll'); throw new Error('fixture_stop_after_poll');
      } catch (error) { if (error instanceof assert.AssertionError) failures.push(error); throw error; }
    }
  });
  vm.runInContext('window=this;', context);
  vm.runInContext(dispatcherSource, context);
  const createDispatcher = context.Core4PollDispatcher.createDispatcher;
  context.Core4PollDispatcher.createDispatcher = options => {
    const actual = createDispatcher(options);
    return { recover() { recovered++; return actual.recover(); }, dispatch(frame) { dispatches++; return actual.dispatch(frame); } };
  };
  vm.runInContext(panelSource, context);
  return {
    calls, timers, waits, statuses, challenges, linkProofs, elements, storage: localStorage,
    get finished() { return finished; }, get now() { return now; }, get nativeCalls() { return nativeCalls; }, get recovered() { return recovered; }, get dispatches() { return dispatches; },
    click() { if (!disabled) finished = false; return click(); },
    async waitForTurn() { await until(() => finished || timers.length > 0); if (failures.length) throw failures[0]; },
    async tick() { await this.waitForTurn(); assert.ok(!finished); const timer = timers.shift(); now += timer.ms; timer.callback(); },
    async finish() { for (let i = 0; i < 40 && !finished; i++) { await this.waitForTurn(); if (!finished) await this.tick(); } assert.ok(finished, 'bounded fixture completion'); assert.equal(timers.length, 0); assert.equal(disabled, false); assert.equal(nativeCalls, 0); if (failures.length) throw failures[0]; },
    count(route) { return calls.filter(call => call.route === route).length; }
  };
}

test('panel-reconnect repeated duplicate peers get fresh challenge/proof then one linked channel', async () => {
  const p = panel({ duplicates: 2 });
  await p.waitForTurn(); assert.equal(p.elements.connect.disabled, true, 'must wait after first duplicate: ' + JSON.stringify({ routes: p.calls.map(c => c.route), status: p.elements.status.textContent })); assert.match(p.elements.status.textContent, /Ожидание завершения прежнего подключения/);
  assert.match(p.elements.detail.textContent, /до 50 с/); await p.finish();
  assert.deepEqual(p.calls.map(call => call.route), ['/challenge', '/link', '/challenge', '/link', '/challenge', '/link', '/poll']);
  assert.deepEqual(p.waits, [3000, 3000]); assert.equal(new Set(p.challenges.map(c => c.nonce)).size, 3); assert.equal(new Set(p.linkProofs).size, 3);
  assert.equal(new Set(p.calls.filter(c => c.route === '/link').map(c => c.value.peerId)).size, 1);
  assert.equal(p.recovered, 1); assert.equal(p.dispatches, 0); assert.equal(p.now, 6000); assert.equal(p.statuses.filter(s => s === 'Подключено к Core 4.0.0').length, 1);
});

test('panel-reconnect deadline stops after exactly 17 handshake pairs and 50 seconds', async () => {
  const p = panel({ duplicates: 100 }); await p.finish();
  assert.equal(p.now, 50000); assert.equal(p.count('/challenge'), 17); assert.equal(p.count('/link'), 17); assert.equal(p.count('/poll'), 0); assert.equal(p.count('/complete'), 0);
  assert.deepEqual(p.waits, [...Array(16).fill(3000), 2000]); assert.ok(p.calls.every(call => call.at < 50000)); assert.equal(p.recovered, 0); assert.equal(p.dispatches, 0);
  assert.equal(p.elements.status.textContent, 'Остановлено: duplicate_peer_wait_expired'); assert.match(p.elements.detail.textContent, /нажмите «Подключить»/); assert.match(p.elements.detail.textContent, /UNKNOWN не повторяется/);
  assert.ok(!p.statuses.some(value => /Подключено|safe|idle/i.test(value)));
});

test('panel-reconnect single start spans in-flight fetch and retry wait; manual button works after exhaustion', async () => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const p = panel({ duplicates: 100, async challenge({ challenge, reply }) { await gate; return reply(200, challenge); } });
  await until(() => p.count('/challenge') === 1); assert.equal(p.elements.connect.disabled, true);
  await Promise.all([p.click(), p.click()]); assert.equal(p.calls.length, 1);
  release(); await p.waitForTurn(); await Promise.all([p.click(), p.click()]); assert.equal(p.calls.length, 2); assert.equal(p.timers.length, 1);
  await p.finish(); const before = p.calls.length;
  const manual = p.click(); assert.equal(p.elements.connect.disabled, true); assert.equal(p.calls.length, before + 1);
  // A new user click gets its own bounded window; it is not an automatic restart.
  await p.finish(); await manual;
  assert.equal(p.now, 100000); assert.equal(p.calls.length, before + 34); assert.equal(p.count('/poll'), 0);
});

for (const afterDuplicate of [false, true]) test('panel-reconnect late challenge cannot send a link after deadline: ' + afterDuplicate, async () => {
  const p = panel({ duplicates: afterDuplicate ? 1 : 0, challenge: ({ challenge, attempt, elapse }) => {
    if (attempt === (afterDuplicate ? 2 : 1)) elapse(afterDuplicate ? 47000 : 50000);
    return reply(200, challenge);
  } }); await p.finish();
  assert.equal(p.now, 50000); assert.equal(p.count('/challenge'), afterDuplicate ? 2 : 1); assert.equal(p.count('/link'), afterDuplicate ? 1 : 0);
  assert.deepEqual(p.waits, afterDuplicate ? [3000] : []); assert.equal(p.recovered, 0); assert.equal(p.elements.status.textContent, 'Остановлено: duplicate_peer_wait_expired');
});
test('panel-reconnect late duplicate link response cannot start another handshake', async () => {
  const p = panel({ link: ({ elapse }) => { elapse(50001); return reply(403, { error: 'duplicate_peer' }); } }); await p.finish();
  assert.equal(p.now, 50001); assert.deepEqual(p.calls.map(c => c.route), ['/challenge', '/link']); assert.deepEqual(p.waits, []);
});
test('panel-reconnect hard attempt limit remains finite if wall clock moves backwards', async () => {
  const p = panel({ link: ({ elapse }) => { elapse(-3000); return reply(403, { error: 'duplicate_peer' }); } }); await p.finish();
  assert.equal(p.count('/challenge'), 17); assert.equal(p.count('/link'), 17); assert.equal(p.waits.length, 17); assert.equal(p.now, 0); assert.equal(p.recovered, 0);
});

const refusalCases = [
  ['auth', 403, { error: 'peer_auth' }], ['Origin', 403, { error: 'cep_origin_required' }],
  ['role', 403, { error: 'panel_role_required' }], ['lane', 403, { error: 'receiver_lane_closed' }],
  ['missing code', 403, {}], ['wrong code field', 403, { code: 'duplicate_peer' }],
  ['extra fields', 403, { error: 'duplicate_peer', retry: true }], ['null body', 403, null],
  ['array body', 403, ['duplicate_peer']], ['substring', 403, { error: 'prefix_duplicate_peer' }],
  ['HTTP 500', 500, { error: 'duplicate_peer' }], ['HTTP 401', 401, { error: 'duplicate_peer' }],
  ['HTTP 429', 429, { error: 'duplicate_peer' }], ['HTTP 200 error body', 200, { error: 'duplicate_peer' }]
];
for (const [label, status, body] of refusalCases) test('panel-reconnect no retry for untrusted/non-duplicate link refusal: ' + label, async () => {
  const p = panel({ link: () => reply(status, body) }); await p.finish();
  assert.deepEqual(p.calls.map(c => c.route), ['/challenge', '/link']); assert.deepEqual(p.waits, []); assert.equal(p.recovered, 0); assert.ok(!p.statuses.includes('Подключено к Core 4.0.0'));
});
for (const stage of ['challenge', 'link']) test('panel-reconnect transport/JSON errors containing duplicate_peer do not retry: ' + stage, async () => {
  for (const invalidJson of [false, true]) {
    const p = panel({ [stage]: () => { if (invalidJson) return { ok: false, status: 403, json: async () => { throw new Error('duplicate_peer'); } }; throw new Error('duplicate_peer'); } });
    await p.finish(); assert.equal(p.count('/challenge'), 1); assert.equal(p.count('/link'), stage === 'link' ? 1 : 0); assert.deepEqual(p.waits, []);
  }
});
test('panel-reconnect exact duplicate refusal from challenge never retries', async () => {
  const p = panel({ challenge: () => reply(403, { error: 'duplicate_peer' }) }); await p.finish(); assert.equal(p.calls.length, 1); assert.deepEqual(p.waits, []);
});

for (const field of ['origin', 'packageHash', 'installationId', 'executorHash', 'role']) test('panel-reconnect validates every fresh challenge binding before the next proof: ' + field, async () => {
  const p = panel({ duplicates: 1, challenge: ({ challenge, attempt }) => reply(200, attempt === 1 ? challenge : { ...challenge, [field]: 'foreign' }) }); await p.finish();
  assert.equal(p.count('/challenge'), 2); assert.equal(p.count('/link'), 1); assert.equal(p.linkProofs.length, 1); assert.deepEqual(p.waits, [3000]); assert.equal(p.recovered, 0);
  assert.equal(p.elements.status.textContent, 'Остановлено: installation_binding');
});
for (const binding of ['mac', 'peerId', 'epoch']) test('panel-reconnect successful HTTP link still requires original signed response binding: ' + binding, async () => {
  const p = panel({ duplicates: 1, link: ({ body }) => binding === 'mac' ? reply(200, { body, mac: '0'.repeat(64) }) : signed({ ...body, [binding]: 'foreign' }) }); await p.finish();
  assert.equal(p.count('/challenge'), 2); assert.equal(p.count('/link'), 2); assert.deepEqual(p.waits, [3000]); assert.equal(p.recovered, 0); assert.equal(p.elements.status.textContent, 'Остановлено: link_auth');
});

for (const failure of ['duplicate_peer', 'peer_auth_or_replay', 'response_auth']) test('panel-reconnect poll failure never restarts handshake: ' + failure, async () => {
  const p = panel({ channel: ({ value }) => failure === 'response_auth' ? signed({ ...value.body, peerId: 'foreign', payload: { command: null } }) : reply(403, { error: failure }) }); await p.finish();
  assert.deepEqual(p.calls.map(c => c.route), ['/challenge', '/link', '/poll']); assert.deepEqual(p.waits, []); assert.equal(p.recovered, 1); assert.equal(p.dispatches, 0); assert.match(p.elements.status.textContent, new RegExp(failure));
});
test('panel-reconnect completion recovery duplicate refusal is not retried and persisted receipt is retained', async () => {
  const saved = { frame: { commandId: 'saved-command', originalBinding: { receiptRef: 'saved-receipt' }, pins }, result: { outcome: 'rejected' } }, state = storage(saved), before = state.getItem(latchKey);
  const p = panel({ storage: state, channel: ({ route }) => { assert.equal(route, '/complete'); return reply(403, { error: 'duplicate_peer' }); } }); await p.finish();
  assert.deepEqual(p.calls.map(c => c.route), ['/challenge', '/link', '/complete']); assert.deepEqual(p.waits, []); assert.equal(p.recovered, 1); assert.equal(p.dispatches, 0); assert.equal(state.getItem(latchKey), before);
});
test('panel-reconnect reload preserves UNKNOWN latch and never polls, completes or dispatches', async () => {
  const state = storage({ frame: { commandId: 'unknown-command', pins } }), before = state.getItem(latchKey);
  for (let reload = 0; reload < 2; reload++) {
    const p = panel({ storage: state, duplicates: 1 }); await p.finish();
    assert.deepEqual(p.calls.map(c => c.route), ['/challenge', '/link', '/challenge', '/link']); assert.equal(p.recovered, 1); assert.equal(p.dispatches, 0); assert.equal(state.getItem(latchKey), before);
    assert.equal(p.elements.status.textContent, 'Остановлено: physical_outcome_unknown_no_replay');
  }
});
test('panel-reconnect dispatcher pin refusal cannot trigger handshake retry or native evaluation', async () => {
  const p = panel({ channel: ({ value }) => signed({ epoch: value.body.epoch, peerId: value.body.peerId, sequence: value.body.sequence, payload: { command: { assetKey: cfg.assetKey, phase: 'inspect', typedPayload: {}, commandId: 'foreign-pins', originalBinding: { commandId: 'foreign-pins', executorHash: cfg.executorHash, phase: 'inspect' }, pins: { ...pins, packageHash: 'foreign' } } } }) }); await p.finish();
  assert.deepEqual(p.calls.map(c => c.route), ['/challenge', '/link', '/poll']); assert.equal(p.dispatches, 1); assert.deepEqual(p.waits, []); assert.equal(p.elements.status.textContent, 'Остановлено: fixed_asset_binding');
});
for (const stage of ['recover', 'dispatch']) test('panel-reconnect dispatcher-local duplicate_peer error cannot retry: ' + stage, async () => {
  let loads = 0;
  const state = { getItem() { if (++loads === (stage === 'recover' ? 1 : 2)) throw new Error('duplicate_peer'); return null; }, setItem() { assert.fail('must fail before latch write'); }, removeItem() { assert.fail('no receipt ACK'); } };
  const p = panel({ storage: state, channel: ({ value }) => signed({ epoch: value.body.epoch, peerId: value.body.peerId, sequence: value.body.sequence, payload: { command: { assetKey: cfg.assetKey, phase: 'inspect', typedPayload: {}, commandId: 'fixture-command', originalBinding: { commandId: 'fixture-command', executorHash: cfg.executorHash, phase: 'inspect' }, pins } } }) }); await p.finish();
  assert.deepEqual(p.calls.map(c => c.route), stage === 'recover' ? ['/challenge', '/link'] : ['/challenge', '/link', '/poll']);
  assert.equal(p.recovered, 1); assert.equal(p.dispatches, stage === 'dispatch' ? 1 : 0); assert.deepEqual(p.waits, []); assert.equal(p.elements.status.textContent, 'Остановлено: duplicate_peer');
});
test('panel-reconnect signed laneClosed success retains receiver fence and does not poll', async () => {
  const p = panel({ link: ({ body }) => signed({ ...body, laneClosed: true }) }); await p.finish();
  assert.deepEqual(p.calls.map(c => c.route), ['/challenge', '/link']); assert.deepEqual(p.waits, []); assert.equal(p.elements.status.textContent, 'Остановлено: receiver_lane_closed'); assert.equal(p.recovered, 1);
});

'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto, createHmac } = require('node:crypto');
const { canonical } = require('../protocol/json');

// Strict signed-fetch VM fixture: production panel/dispatcher + real WebCrypto,
// synthetic responses and clock. Final two cases additionally use TEMP loopback
// HTTP. No installed config/credentials, production port/state, CEP UI or AE.
const panelSource = fs.readFileSync(path.join(__dirname, '../cep/js/panel.js'), 'utf8');
const dispatcherSource = fs.readFileSync(path.join(__dirname, '../cep/js/poll-dispatcher.js'), 'utf8');
const cfg = { installationId: 'reconnect-fixture', packageHash: 'a'.repeat(64), executorHash: 'b'.repeat(64), panelToken: 'c'.repeat(64), assetKey: 'fixture-inspection' };
const pins = { installationId: cfg.installationId, packageHash: cfg.packageHash, executorHash: cfg.executorHash };
const latchKey = 'aeagentcore4-physical-' + cfg.installationId;
function storage(initial) {
  const values = new Map(initial ? [[latchKey, JSON.stringify(initial)]] : []);
  return { getItem: key => values.has(key) ? values.get(key) : null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
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
  let now = 0, finished = false, click, unload, challengeSerial = 0, linkedPeer, requestSequence = 0, nativeCalls = 0, recovered = 0, dispatches = 0, disabled = false;
  const elements = { detail: {}, status: { dataset: {}, set textContent(value) { statuses.push(value); }, get textContent() { return statuses.at(-1); } }, connect: {
    addEventListener(event, handler) { assert.equal(event, 'click'); click = handler; },
    get disabled() { return disabled; }, set disabled(value) { disabled = value; if (!value) finished = true; }
  } };
  class Clock extends Date { static now() { return now; } }
  const context = vm.createContext({ TextEncoder, Uint8Array, AbortController, Date: Clock, crypto: webcrypto, localStorage, Core4Installation: cfg,
    addEventListener(event, handler) { assert.equal(event, 'unload'); unload = handler; },
    document: { getElementById: id => elements[id] },
    __adobe_cep__: { evalScript(script, callback) { nativeCalls++; if (options.evalScript) return options.evalScript(script, callback); throw new Error('fixture_forbids_native_dispatch'); } },
    setTimeout(callback, ms) { assert.ok(ms > 0 && ms <= 20000); const timer = { callback, ms, request: callback.name === 'requestTimedOut' }; timers.push(timer); if (!timer.request) waits.push(ms); return timer; },
    clearTimeout(timer) { const at = timers.indexOf(timer); if (at >= 0) timers.splice(at, 1); },
    async fetch(url, request) {
      try {
        const route = new URL(url).pathname, value = JSON.parse(request.body);
        assert.equal(url, 'http://127.0.0.1:3457' + route); // String assertion only; no real fetch.
        assert.equal(request.method, 'POST'); assert.deepEqual(Object.keys(request.headers), ['Content-Type']); assert.equal(request.headers['Content-Type'], 'application/json');
        assert.equal(request.credentials, 'omit'); assert.equal(request.cache, 'no-store'); assert.equal(request.body, canonical(value));
        calls.push({ route, value, at: now });
        if (options.wire) return await options.wire({ route, value, request });
        if (route === '/challenge') {
          assert.deepEqual(value, { role: 'panel' });
          const challenge = { nonce: 'nonce-' + ++challengeSerial, epoch: 'fixture-epoch', controllerId: 'fixture-controller', role: 'panel', origin: 'null', ...pins };
          challenges.push(challenge);
          return options.challenge ? await options.challenge({ challenge, attempt: challengeSerial, reply, signal: request.signal, elapse: ms => { now += ms; } }) : reply(200, challenge);
        }
        if (route === '/link') {
          assert.deepEqual(Object.keys(value).sort(), ['challenge', 'peerId', 'proof']); assert.equal(canonical(value.challenge), canonical(challenges.at(-1)));
          assert.equal(value.proof, mac({ challenge: value.challenge, peerId: value.peerId }, cfg.panelToken));
          assert.ok(!linkProofs.includes(value.proof), 'fresh challenge and proof required on every attempt'); linkProofs.push(value.proof);
          const attempt = calls.filter(call => call.route === '/link').length;
          if (attempt <= (options.duplicates || 0)) return reply(403, { error: 'duplicate_peer' });
          linkedPeer = value.peerId; requestSequence = 0;
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
  context.Core4PollDispatcher.createDispatcher = dispatcherOptions => {
    const actual = createDispatcher(dispatcherOptions);
    return { recover() { recovered++; if (options.dispatcherFailure === 'recover') throw new Error('duplicate_peer'); return actual.recover(); }, dispatch(frame) { dispatches++; if (options.dispatcherFailure === 'dispatch') throw new Error('duplicate_peer'); return actual.dispatch(frame); } };
  };
  vm.runInContext(panelSource, context);
  return {
    calls, timers, waits, statuses, challenges, linkProofs, elements, storage: localStorage,
    get finished() { return finished; }, get now() { return now; }, get nativeCalls() { return nativeCalls; }, get recovered() { return recovered; }, get dispatches() { return dispatches; },
    click() { if (!disabled) finished = false; return click(); },
    unload() { unload(); }, elapse(ms) { now += ms; },
    async waitForTurn() { await until(() => finished || timers.some(t => !t.request)); if (failures.length) throw failures[0]; },
    async tick() { await this.waitForTurn(); assert.ok(!finished); const at = timers.findIndex(t => !t.request), timer = timers.splice(at, 1)[0]; now += timer.ms; timer.callback(); },
    async timeout() { await until(() => timers.some(t => t.request)); const at = timers.findIndex(t => t.request), timer = timers.splice(at, 1)[0]; now += timer.ms; timer.callback(); },
    async finish() { for (let i = 0; i < 40 && !finished; i++) { await this.waitForTurn(); if (!finished) await this.tick(); } assert.ok(finished, 'bounded fixture completion'); assert.equal(timers.length, 0); assert.equal(disabled, false); if (!options.evalScript) assert.equal(nativeCalls, 0); if (failures.length) throw failures[0]; },
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
  assert.equal(p.recovered, 1); assert.equal(p.dispatches, 0); assert.equal(p.now, 6000); assert.equal(p.statuses.filter(s => s === 'Подключено к Core 4.2.4').length, 1);
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
  assert.deepEqual(p.calls.map(c => c.route), ['/challenge', '/link']); assert.deepEqual(p.waits, []); assert.equal(p.recovered, 0); assert.ok(!p.statuses.includes('Подключено к Core 4.2.4'));
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
    assert.equal(p.elements.status.textContent, 'Требуется восстановление: physical_outcome_unknown_no_replay');
  }
});
test('panel-reconnect dispatcher pin refusal cannot trigger handshake retry or native evaluation', async () => {
  const p = panel({ channel: ({ value }) => signed({ epoch: value.body.epoch, peerId: value.body.peerId, sequence: value.body.sequence, payload: { command: { assetKey: cfg.assetKey, phase: 'inspect', typedPayload: {}, commandId: 'foreign-pins', originalBinding: { commandId: 'foreign-pins', executorHash: cfg.executorHash, phase: 'inspect' }, pins: { ...pins, packageHash: 'foreign' } } } }) }); await p.finish();
  assert.deepEqual(p.calls.map(c => c.route), ['/challenge', '/link', '/poll']); assert.equal(p.dispatches, 1); assert.deepEqual(p.waits, []); assert.equal(p.elements.status.textContent, 'Требуется восстановление: fixed_asset_binding');
});
for (const stage of ['recover', 'dispatch']) test('panel-reconnect dispatcher-local duplicate_peer error cannot retry: ' + stage, async () => {
  const p = panel({ dispatcherFailure: stage, channel: ({ value }) => signed({ epoch: value.body.epoch, peerId: value.body.peerId, sequence: value.body.sequence, payload: { command: { assetKey: cfg.assetKey, phase: 'inspect', typedPayload: {}, commandId: 'fixture-command', originalBinding: { commandId: 'fixture-command', executorHash: cfg.executorHash, phase: 'inspect' }, pins } } }) }); await p.finish();
  assert.deepEqual(p.calls.map(c => c.route), stage === 'recover' ? ['/challenge', '/link'] : ['/challenge', '/link', '/poll']);
  assert.equal(p.recovered, 1); assert.equal(p.dispatches, stage === 'dispatch' ? 1 : 0); assert.deepEqual(p.waits, []); assert.equal(p.elements.status.textContent, (stage === 'dispatch' ? 'Требуется восстановление: ' : 'Остановлено: ') + 'duplicate_peer');
});
test('panel-reconnect signed laneClosed success retains receiver fence and does not poll', async () => {
  const p = panel({ link: ({ body }) => signed({ ...body, laneClosed: true }) }); await p.finish();
  assert.deepEqual(p.calls.map(c => c.route), ['/challenge', '/link']); assert.deepEqual(p.waits, []); assert.equal(p.elements.status.textContent, 'Требуется восстановление: receiver_lane_closed'); assert.equal(p.recovered, 1);
});

function frame(commandId = 'fixture-command') { return { assetKey: cfg.assetKey, phase: 'inspect', typedPayload: {}, commandId, originalBinding: { commandId, executorHash: cfg.executorHash, phase: 'inspect', receiptRef: 'fixture-receipt' }, pins }; }
function pollReply(value, command) { return signed({ epoch: value.body.epoch, peerId: value.body.peerId, sequence: value.body.sequence, payload: { command } }); }
function completionReply(value) { return signed({ epoch: value.body.epoch, peerId: value.body.peerId, sequence: value.body.sequence, payload: { ack: { commandId: value.body.payload.commandId, receiptRef: value.body.payload.originalBinding.receiptRef } } }); }

test('panel-reconnect idle transport loss uses a fresh channel and sequence without repeating the old poll envelope', async () => {
  let polls = 0;
  const p = panel({ channel({ route }) { assert.equal(route, '/poll'); if (++polls === 1) throw new TypeError('Failed to fetch'); throw new Error('fixture_stop_after_poll'); } }); await p.finish();
  assert.deepEqual(p.calls.map(c => c.route), ['/challenge', '/link', '/poll', '/challenge', '/link', '/poll']);
  const links = p.calls.filter(c => c.route === '/link'), requests = p.calls.filter(c => c.route === '/poll');
  assert.notEqual(links[0].value.peerId, links[1].value.peerId); assert.deepEqual(requests.map(c => c.value.body.sequence), [1, 1]);
  assert.notEqual(requests[0].value.mac, requests[1].value.mac); assert.deepEqual(p.waits, [3000]); assert.equal(p.dispatches, 0); assert.equal(p.recovered, 2);
});
test('panel-reconnect missing Core enters slow background wait and connects after more than one initial window', async () => {
  const p = panel({ challenge({ challenge, attempt, reply }) { if (attempt <= 20) throw new TypeError('Failed to fetch'); return reply(200, challenge); } });
  for (let turn = 0; turn < 17; turn++) await p.tick();
  await p.waitForTurn(); assert.equal(p.now, 50000); assert.equal(p.finished, false); assert.equal(p.count('/challenge'), 17);
  assert.equal(p.elements.status.dataset.state, 'waiting'); assert.match(p.elements.detail.textContent, /15 с/);
  await p.finish(); assert.equal(p.count('/challenge'), 21); assert.equal(p.count('/link'), 1); assert.equal(p.count('/poll'), 1);
  assert.equal(p.now, 74000); assert.ok(p.waits.includes(15000)); assert.equal(p.nativeCalls, 0);
});
test('panel-reconnect runtime missing long after idle also reaches background recovery without a manual click', async () => {
  let absent = false, attempts = 0;
  const p = panel({ challenge({ challenge, reply }) { if (absent && ++attempts <= 18) throw new TypeError('Failed to fetch'); return reply(200, challenge); },
    channel() { if (!absent) { absent = true; p.elapse(120000); throw new TypeError('Failed to fetch'); } throw new Error('fixture_stop_after_poll'); } });
  await p.finish(); assert.equal(p.count('/link'), 2); assert.equal(p.count('/poll'), 2); assert.ok(p.waits.filter(ms => ms === 15000).length >= 2);
  assert.equal(p.recovered, 2); assert.equal(p.dispatches, 0);
});
for (const latch of [false, true]) test('panel-reconnect background wait stops on ' + (latch ? 'a new physical latch' : 'unload'), async () => {
  const p = panel({ challenge() { throw new TypeError('Failed to fetch'); } });
  for (let turn = 0; turn < 17; turn++) await p.tick(); await p.waitForTurn();
  const before = p.calls.length;
  if (latch) { p.storage.setItem(latchKey, JSON.stringify({ frame: frame() })); await p.tick(); await p.finish(); assert.equal(p.elements.status.dataset.state, 'recovery'); assert.notEqual(p.storage.getItem(latchKey), null); }
  else { p.unload(); await until(() => p.timers.length === 0); }
  assert.equal(p.calls.length, before); assert.equal(p.nativeCalls, 0);
});
test('panel-reconnect aborts a hanging fetch and ignores its late response after a new generation', async () => {
  let release, oldSignal;
  const first = new Promise(resolve => { release = resolve; });
  const p = panel({ async challenge({ challenge, attempt, signal }) { if (attempt === 1) { oldSignal = signal; return first; } return reply(200, challenge); } });
  await until(() => p.count('/challenge') === 1); const old = p.challenges[0]; await p.timeout(); await p.waitForTurn(); assert.equal(oldSignal.aborted, true);
  release(reply(200, old)); await p.finish(); assert.equal(p.count('/challenge'), 2); assert.equal(p.count('/link'), 1); assert.equal(p.count('/poll'), 1); assert.equal(p.dispatches, 0);
});
test('panel-reconnect unload invalidates an outstanding poll before a late command can dispatch', async () => {
  let release, oldValue;
  const gate = new Promise(resolve => { release = resolve; });
  const p = panel({ async channel({ value }) { oldValue = value; return gate; } });
  await until(() => p.count('/poll') === 1); const before = [...p.statuses]; p.unload(); release(pollReply(oldValue, frame()));
  await until(() => p.timers.length === 0); await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(p.statuses, before); assert.equal(p.dispatches, 0); assert.equal(p.nativeCalls, 0); assert.equal(p.count('/poll'), 1);
});
test('panel-reconnect delayed AE callback stays busy without a poll or reconnect timeout', async () => {
  let callback, polls = 0;
  const p = panel({ evalScript(script, cb) { callback = cb; }, channel({ route, value }) { if (route === '/complete') return completionReply(value); if (++polls === 1) return pollReply(value, frame()); throw new Error('fixture_stop_after_poll'); } });
  await until(() => p.nativeCalls === 1); assert.equal(p.elements.status.dataset.state, 'busy'); assert.equal(p.timers.length, 0);
  p.elapse(90000); await Promise.all([p.click(), p.click()]); assert.equal(p.count('/poll'), 1); assert.equal(p.count('/challenge'), 1); assert.equal(p.count('/complete'), 0);
  callback(JSON.stringify({ readFailureVersion: 1, outcome: 'rejected', code: 'host_registry_unavailable' })); await p.finish();
  assert.equal(p.nativeCalls, 1); assert.equal(p.count('/complete'), 1); assert.equal(p.storage.getItem(latchKey), null);
});
test('panel-reconnect lost completion ACK preserves original result until explicit reconnect without a second eval', async () => {
  let polls = 0, completions = 0;
  const p = panel({ evalScript(script, cb) { cb(JSON.stringify({ readFailureVersion: 1, outcome: 'rejected', code: 'host_registry_unavailable' })); }, channel({ route, value }) {
    if (route === '/complete') { if (++completions === 1) throw new TypeError('ACK lost'); return completionReply(value); }
    if (++polls === 1) return pollReply(value, frame()); throw new Error('fixture_stop_after_poll');
  } }); await p.finish();
  const saved = p.storage.getItem(latchKey); assert.ok(JSON.parse(saved).result); assert.equal(p.elements.status.dataset.state, 'recovery'); assert.equal(p.count('/challenge'), 1); assert.deepEqual(p.waits, []);
  const manual = p.click(); await p.finish(); await manual;
  assert.equal(p.nativeCalls, 1); assert.equal(p.dispatches, 1); assert.equal(p.count('/complete'), 2); assert.equal(p.storage.getItem(latchKey), null);
  const payloads = p.calls.filter(c => c.route === '/complete').map(c => canonical(c.value.body.payload)); assert.equal(payloads[0], payloads[1]);
});
test('panel-reconnect lost delivered poll with an empty local latch still obeys the new server lane fence', async () => {
  const p = panel({ channel() { throw new TypeError('poll reply lost'); }, link({ body, attempt }) { return signed({ ...body, laneClosed: attempt > 1 }); } }); await p.finish();
  assert.equal(p.count('/link'), 2); assert.equal(p.count('/poll'), 1); assert.equal(p.nativeCalls, 0); assert.equal(p.elements.status.dataset.state, 'recovery'); assert.equal(p.storage.getItem(latchKey), null);
});
test('panel-reconnect corrupted latch remains recovery and never replays or removes storage', async () => {
  const state = storage(); state.setItem(latchKey, '{torn'); const p = panel({ storage: state }); await p.finish();
  assert.equal(p.elements.status.dataset.state, 'recovery'); assert.equal(p.count('/poll'), 0); assert.equal(p.count('/complete'), 0); assert.equal(state.getItem(latchKey), '{torn');
});

for (const stage of ['challenge', 'link', 'channel']) for (const status of [403, 503]) test('panel-reconnect known HTTP refusal cannot become a transport retry when its body hangs: ' + stage + '/' + status, async () => {
  let reading = false;
  const p = panel({ [stage]() { return { ok: false, status, json() { reading = true; return new Promise(() => {}); } }; } });
  await until(() => reading); await p.timeout(); await p.finish();
  assert.equal(p.count('/challenge'), 1); assert.equal(p.count('/link'), stage === 'challenge' ? 0 : 1); assert.equal(p.count('/poll'), stage === 'channel' ? 1 : 0);
  assert.deepEqual(p.waits, []); assert.equal(p.elements.status.textContent, 'Остановлено: http_' + status + '_body_timeout');
});
test('panel-reconnect missing successful HTTP body is bounded without accepting a late response', async () => {
  let reading = false;
  const p = panel({ challenge({ attempt, challenge }) { return attempt === 1 ? { ok: true, status: 200, json() { reading = true; return new Promise(() => {}); } } : reply(200, challenge); } });
  await until(() => reading); await p.timeout(); await p.finish();
  assert.equal(p.count('/challenge'), 2); assert.equal(p.count('/link'), 1); assert.equal(p.count('/poll'), 1); assert.equal(p.nativeCalls, 0);
});
test('panel-reconnect successful long AE operation starts a new idle recovery window after ACK', async () => {
  let callback, polls = 0;
  const p = panel({ evalScript(script, cb) { callback = cb; }, channel({ route, value }) {
    if (route === '/complete') return completionReply(value);
    if (++polls === 1) return pollReply(value, frame()); if (polls === 2) throw new TypeError('idle Core lost after long confirmation'); throw new Error('fixture_stop_after_poll');
  } });
  await until(() => p.nativeCalls === 1); p.elapse(90000); callback(JSON.stringify({ readFailureVersion: 1, outcome: 'rejected', code: 'host_registry_unavailable' })); await p.finish();
  assert.equal(p.count('/link'), 2); assert.equal(p.count('/poll'), 3); assert.equal(p.nativeCalls, 1); assert.equal(p.storage.getItem(latchKey), null); assert.deepEqual(p.waits, [3000]);
});

for (const raw of ['', 'null', 'false', '0', '""']) test('panel-reconnect any remaining raw latch blocks readiness even when dispatcher parses a falsy value: ' + JSON.stringify(raw), async () => {
  const state = storage(); state.setItem(latchKey, raw);
  const p = panel({ storage: state, channel({ value }) { return pollReply(value, frame()); } }); await p.finish();
  assert.equal(p.count('/poll'), 0); assert.equal(p.count('/complete'), 0); assert.equal(p.nativeCalls, 0); assert.equal(p.elements.status.dataset.state, 'recovery');
  assert.equal(state.getItem(latchKey), raw); assert.ok(!p.statuses.includes('Канал Core 4.2.4 готов к командам'));
});
test('panel-reconnect a raw latch inserted during poll is checked again before evaluation', async () => {
  const state = storage(), p = panel({ storage: state, channel({ value }) { state.setItem(latchKey, 'false'); return pollReply(value, frame()); } }); await p.finish();
  assert.equal(p.count('/poll'), 1); assert.equal(p.nativeCalls, 0); assert.equal(p.dispatches, 0); assert.equal(state.getItem(latchKey), 'false'); assert.equal(p.elements.status.dataset.state, 'recovery');
});
test('panel-reconnect silent latch removal failure after original ACK keeps recovery and prevents another poll', async () => {
  const state = storage(); state.removeItem = () => {};
  const p = panel({ storage: state, evalScript(script, cb) { cb(JSON.stringify({ readFailureVersion: 1, outcome: 'rejected', code: 'host_registry_unavailable' })); }, channel({ route, value }) { return route === '/poll' ? pollReply(value, frame()) : completionReply(value); } }); await p.finish();
  assert.equal(p.nativeCalls, 1); assert.equal(p.count('/poll'), 1); assert.equal(p.count('/complete'), 1); assert.ok(state.getItem(latchKey)); assert.equal(p.elements.status.dataset.state, 'recovery');
});

// Real loopback HTTP/TEMP store complements the signed VM refusals above.
// The server-only wall clock is advanced to expire its old 45s peer lease;
// production port, installed state/credentials, CEP UI and AE remain untouched.
async function livePeer(t) {
  const os = require('node:os'), { createHttpPeer } = require('../integrations/cep/http-peer');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'core4-panel-http-'));
  const peer = createHttpPeer({ installation: { ...cfg, controlToken: 'd'.repeat(64) }, directory, asset: { assetKey: cfg.assetKey, executorHash: cfg.executorHash }, port: 0, timeout: 1000, pollTimeout: 10 });
  const realNow = Date.now; let clockOffset = 0, p;
  t.after(async () => {
    if (p) p.unload(); Date.now = realNow; await peer.close();
    assert.ok(path.isAbsolute(directory) && path.resolve(directory) === directory && directory.startsWith(path.join(os.tmpdir(), 'core4-panel-http-')));
    fs.rmSync(directory, { recursive: true, force: true });
  });
  await peer.listen(); const port = peer.status().port; assert.ok(port > 0 && port !== 3457);
  Date.now = () => realNow() + clockOffset;
  return { peer, directory, attach(value) { p = value; }, expirePeer() { clockOffset += 46000; },
    send(route, request) { assert.ok(['/challenge', '/link', '/poll', '/complete'].includes(route)); return fetch('http://127.0.0.1:' + port + route, { ...request, headers: { ...request.headers, Origin: 'null' } }); }
  };
}
test('panel-reconnect actual HTTP lost delivered poll keeps durable UNKNOWN and never evaluates on a fresh channel', async t => {
  const live = await livePeer(t); let lost = false, original;
  const p = panel({ async wire({ route, request }) {
    if (route === '/poll' && !lost) {
      lost = true; original = live.peer.inspect({}).then(() => ({ outcome: 'unexpected-success' }), e => ({ error: e.code }));
      const response = await live.send(route, request), body = await response.json(); assert.ok(body.body.payload.command);
      throw new TypeError('actual delivered poll reply lost before panel receive');
    }
    return live.send(route, request);
  } }); live.attach(p);
  await p.waitForTurn(); assert.equal(p.storage.getItem(latchKey), null); assert.equal(live.peer.status().pending.delivered, true);
  await until(() => live.peer.status().storeClosed); assert.equal((await original).error, 'host_callback_timeout');
  live.expirePeer(); await p.finish();
  assert.equal(p.count('/link'), 2); assert.equal(p.count('/poll'), 1); assert.equal(p.nativeCalls, 0); assert.equal(p.elements.status.dataset.state, 'recovery');
  const events = fs.readFileSync(path.join(live.directory, 'completions.ndjson'), 'utf8').trim().split('\n').map(JSON.parse);
  assert.deepEqual(events.map(e => e.type), ['origin', 'begin', 'unknown']); assert.equal(live.peer.status().storeClosed, true);
});
test('panel-reconnect actual HTTP lost durable completion ACK is acknowledged on explicit reconnect with exactly one evaluation', async t => {
  const live = await livePeer(t); let sent = false, lost = false, original; const completed = [];
  const p = panel({ evalScript(script, callback) { callback(JSON.stringify({ readFailureVersion: 1, outcome: 'rejected', code: 'host_registry_unavailable' })); }, async wire({ route, value, request }) {
    if (route === '/poll') {
      if (sent) throw new Error('fixture_stop_after_poll');
      sent = true; original = live.peer.inspect({}).then(() => ({ outcome: 'unexpected-success' }), e => ({ error: e.code }));
    }
    const response = await live.send(route, request);
    if (route === '/complete') {
      completed.push(canonical(value.body.payload));
      if (!lost) { lost = true; const body = await response.json(); assert.ok(body.body.payload.ack); throw new TypeError('actual durable ACK lost'); }
    }
    return response;
  } }); live.attach(p); await p.finish();
  assert.equal((await original).error, 'host_registry_unavailable'); assert.equal(p.elements.status.dataset.state, 'recovery'); assert.ok(p.storage.getItem(latchKey));
  const before = fs.readFileSync(path.join(live.directory, 'completions.ndjson'));
  assert.deepEqual(before.toString('utf8').trim().split('\n').map(JSON.parse).map(e => e.type), ['origin', 'begin', 'complete']);
  live.expirePeer(); const manual = p.click(); await p.finish(); await manual;
  assert.equal(p.nativeCalls, 1); assert.equal(p.dispatches, 1); assert.equal(completed.length, 2); assert.equal(completed[0], completed[1]);
  assert.equal(p.storage.getItem(latchKey), null); assert.deepEqual(fs.readFileSync(path.join(live.directory, 'completions.ndjson')), before); assert.equal(live.peer.status().storeClosed, false);
});

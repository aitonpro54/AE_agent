'use strict';
const nodeTest = require('node:test');
const test = (name, fn) => nodeTest(name, { timeout: 5000 }, fn);
const assert = require('node:assert/strict');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { randomUUID, randomBytes, createHmac } = require('node:crypto');
const { createIpcServer, createIpcClient, IPC_LIMITS } = require('../runtime/client-ipc');

const secret = 'synthetic-control-secret-'.repeat(3), panelSecret = 'synthetic-panel-secret-'.repeat(3);
const identity = Object.freeze({ installationId: 'installation-fixture', machineId: 'machine-fixture', packageHash: 'a'.repeat(64) });
const bootId = 'boot-' + randomUUID(), domain = 'ae-core4/local-client-ipc/v1\0';
const nonce = () => randomBytes(32).toString('hex');
const canonical = v => Array.isArray(v) ? '[' + v.map(canonical).join(',') + ']' :
  v && typeof v === 'object' ? '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + canonical(v[k])).join(',') + '}' : JSON.stringify(v);
const mac = (key, kind, body, prefix = domain) => createHmac('sha256', key).update(prefix + kind + '\0' + canonical(body)).digest('hex');
const sign = (key, kind, body) => ({ ...body, mac: mac(key, kind, body) });
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const endpoint = () => process.platform === 'win32' ? '\\\\.\\pipe\\core4-test-' + randomUUID() : path.join(os.tmpdir(), 'core4-' + randomUUID() + '.sock');
async function until(fn) {
  const end = Date.now() + 2000;
  while (!fn()) { if (Date.now() > end) assert.fail('fixture condition timeout'); await new Promise(r => setTimeout(r, 5)); }
}
async function fixture(t, opts = {}) {
  const address = endpoint(), server = createIpcServer({ endpoint: address, identity, secret, bootId,
    methods: ['status', 'work'], onRequest: ({ payload }) => payload, ...opts });
  t.after(() => server.close()); await server.listen();
  return { server, endpoint: address, async client(extra = {}) {
    const client = await createIpcClient({ endpoint: address, identity, secret, ...extra });
    t.after(() => client.close()); return client;
  } };
}
function wire(socket) {
  const closed = deferred(), frames = [], readers = [];
  let buffer = '', ended = false;
  socket.on('error', () => {});
  socket.on('data', bytes => {
    buffer += bytes.toString('utf8');
    for (;;) {
      const index = buffer.indexOf('\n'); if (index < 0) break;
      const value = JSON.parse(buffer.slice(0, index)); buffer = buffer.slice(index + 1);
      if (readers.length) readers.shift().resolve(value); else frames.push(value);
    }
  });
  socket.on('close', () => { ended = true; closed.resolve(); for (const r of readers.splice(0)) r.reject(new Error('fixture_closed')); });
  return { socket, closed: closed.promise, send: frame => socket.write(canonical(frame) + '\n'),
    next() {
      if (frames.length) return Promise.resolve(frames.shift());
      if (ended) return Promise.reject(new Error('fixture_closed'));
      return new Promise((resolve, reject) => readers.push({ resolve, reject }));
    } };
}
function connect(t, address) { const peer = wire(net.createConnection(address)); t.after(() => peer.socket.destroy()); return peer; }
async function authenticate(t, address) {
  const peer = connect(t, address), challenge = await peer.next(), clientNonce = nonce();
  const auth = sign(secret, 'authenticate', { type: 'authenticate', v: 1, role: 'control', identity,
    bootId: challenge.bootId, serverNonce: challenge.serverNonce, clientNonce });
  peer.send(auth); const ready = await peer.next();
  const key = mac(secret, 'session-key', { identity, bootId: challenge.bootId,
    serverNonce: challenge.serverNonce, clientNonce, sessionId: ready.sessionId });
  let seq = 0;
  return { ...peer, auth, ready, key, request(payload = {}, extra = {}) {
    return sign(key, 'request', { type: 'request', sessionId: ready.sessionId,
      seq: ++seq, requestId: nonce(), method: 'work', payload, ...extra });
  } };
}
async function fakeOwner(t, onRequest, adjust = {}) {
  const address = endpoint(), sockets = new Set();
  const server = net.createServer(socket => {
    sockets.add(socket); socket.on('close', () => sockets.delete(socket));
    const peer = wire(socket), serverNonce = nonce();
    peer.send(sign(secret, 'challenge', { type: 'challenge', v: 1, role: 'control', identity, bootId, serverNonce, ...adjust.challenge }));
    (async () => {
      const auth = await peer.next(), sessionId = nonce();
      const key = mac(secret, 'session-key', { identity, bootId, serverNonce, clientNonce: auth.clientNonce, sessionId });
      peer.send({ ...sign(key, 'ready', { type: 'ready', v: 1, bootId, sessionId }), ...adjust.ready });
      await onRequest(peer, key, sessionId);
    })().catch(() => {});
  });
  t.after(() => { for (const socket of sockets) socket.destroy(); return new Promise(resolve => server.close(resolve)); });
  await new Promise(resolve => server.listen(address, resolve));
  return { endpoint: address, identity, secret };
}
const rejects = (promise, code) => assert.rejects(promise, error => error.code === code);

test('IPC authenticates two independent observers and passes the identical opaque session to callbacks', async t => {
  const attached = [], requested = [], detached = [];
  const f = await fixture(t, { onAttach(s) { assert.equal(Object.isFrozen(s), true); attached.push(s); },
    onDetach: s => { detached.push(s); }, onRequest({ session, payload }) { requested.push(session); return { id: session.clientSessionId, payload }; } });
  const a = await f.client(), b = await f.client();
  assert.notEqual(a.sessionId, b.sessionId); assert.equal(a.bootId, bootId); assert.equal(attached.length, 2);
  const response = await a.call('status', { nested: ['Ж', true, 2], clientSessionId: b.sessionId });
  assert.equal(response.id, a.sessionId); assert.equal(requested[0], attached[0]);
  assert.equal(response.payload.clientSessionId, b.sessionId);
  assert.deepEqual(await b.call('status', {}), { id: b.sessionId, payload: {} });
  a.close(); a.close(); await until(() => detached.length === 1); assert.equal(detached[0], attached[0]);
  assert.equal(f.server.status().sessions, 1); b.close(); await until(() => detached.length === 2);
});

test('IPC refuses wrong control secret, panel secret and all identity pins without attaching', async t => {
  let count = 0; const f = await fixture(t, { onAttach() { count++; } });
  for (const extra of [{ secret: panelSecret }, { secret: 'wrong-'.repeat(10) },
    ...['installationId', 'machineId', 'packageHash'].map(k => ({ identity: { ...identity, [k]: k === 'packageHash' ? 'b'.repeat(64) : 'other' } }))]) {
    await rejects(f.client(extra), 'ipc_authentication');
  }
  assert.equal(count, 0); assert.equal(f.server.status().pending, 0);
});

test('IPC rejects wrong role/domain, stale boot/challenge and extra authentication fields', async t => {
  let count = 0; const f = await fixture(t, { onAttach() { count++; } });
  let old;
  for (const variant of ['role', 'domain', 'boot', 'extra', 'stale', 'mac']) {
    const peer = connect(t, f.endpoint), challenge = await peer.next();
    const body = { type: 'authenticate', v: 1, role: 'control', identity, bootId,
      serverNonce: challenge.serverNonce, clientNonce: nonce() };
    if (!old) old = sign(secret, 'authenticate', body);
    if (variant === 'role') body.role = 'panel';
    if (variant === 'boot') body.bootId = 'old-boot';
    if (variant === 'extra') body.sessionId = nonce();
    peer.send(variant === 'stale' ? old : variant === 'mac' ? { ...body, mac: '0'.repeat(64) } :
      variant === 'domain' ? { ...body, mac: mac(secret, 'authenticate', body, 'cep\0') } : sign(secret, 'authenticate', body));
    await peer.closed;
  }
  assert.equal(count, 0);
});

test('IPC accepts chunked canonical frames including Unicode and rejects invalid framing before dispatch', async t => {
  let calls = 0; const f = await fixture(t, { onRequest({ payload }) { calls++; return payload; }, limits: { frameMs: 30, handshakeMs: 200 } });
  const peer = await authenticate(t, f.endpoint), bytes = Buffer.from(canonical(peer.request({ text: 'Разделено' })) + '\n');
  for (let i = 0; i < bytes.length; i += 7) peer.socket.write(bytes.subarray(i, i + 7));
  assert.deepEqual((await peer.next()).result, { text: 'Разделено' }); peer.socket.destroy();
  for (const raw of [Buffer.from('{broken\n'), Buffer.from('{"type":"a","type":"b"}\n'), Buffer.from('{ }\n'),
    Buffer.from([0xff, 10]), Buffer.alloc(IPC_LIMITS.frameBytes, 65), Buffer.from('{')]) {
    const bad = connect(t, f.endpoint); await bad.next(); bad.socket.write(raw); await bad.closed;
  }
  assert.equal(calls, 1);
});

test('IPC fail-closes request replay, reused id, wrong MAC/sequence/session, unknown method and extra fields', async t => {
  let calls = 0; const f = await fixture(t, { onRequest() { calls++; return null; } });
  for (const variant of ['replay', 'id', 'mac', 'seq', 'session', 'method', 'extra', 'array']) {
    const peer = await authenticate(t, f.endpoint), first = peer.request();
    peer.send(first); await peer.next();
    let frame = peer.request();
    if (variant === 'replay') frame = first;
    if (variant === 'id') frame = peer.request({}, { requestId: first.requestId, seq: 2 });
    if (variant === 'mac') frame.mac = '0'.repeat(64);
    if (variant === 'seq') frame = peer.request({}, { seq: 4 });
    if (variant === 'session') frame = peer.request({}, { sessionId: nonce(), seq: 2 });
    if (variant === 'method') frame = peer.request({}, { method: 'import_source', seq: 2 });
    if (variant === 'extra') { const { mac: ignored, ...body } = frame; frame = sign(peer.key, 'request', { ...body, session: { clientSessionId: peer.ready.sessionId } }); }
    if (variant === 'array') frame = peer.request([], { seq: 2 });
    peer.send(frame); await peer.closed;
  }
  assert.equal(calls, 8);
});

test('IPC clients verify challenge/ready role, identity, boot shape and MAC before exposing attachment', async t => {
  for (const adjust of [{ challenge: { role: 'panel' } }, { challenge: { identity: { ...identity, machineId: 'wrong' } } },
    { challenge: { bootId: 'bad boot' } }, { ready: { bootId: 'stale' } }, { ready: { mac: '0'.repeat(64) } }]) {
    const opts = await fakeOwner(t, async () => {}, adjust);
    await rejects(createIpcClient(opts), 'ipc_authentication');
  }
});

test('IPC clients reject forged replies, correlation mismatches and response replay without accepting invented result', async t => {
  for (const variant of ['mac', 'request', 'seq', 'session', 'extra', 'error', 'ordinary-error']) {
    const opts = await fakeOwner(t, async (peer, key, sessionId) => {
      const request = await peer.next();
      const body = { type: 'response', sessionId, seq: request.seq, requestId: request.requestId, ok: true, result: 'invented' };
      if (variant === 'request') body.requestId = nonce();
      if (variant === 'seq') body.seq++;
      if (variant === 'session') body.sessionId = nonce();
      if (variant === 'extra') body.extra = true;
      if (variant === 'error' || variant === 'ordinary-error') { body.ok = false; delete body.result; body.error = variant === 'error' ? secret : 'ipc_request_failed'; }
      const response = sign(key, 'response', body); if (variant === 'mac') response.mac = '0'.repeat(64);
      peer.send(response);
    });
    const client = await createIpcClient(opts); t.after(() => client.close());
    await rejects(client.call('work', {}), 'ipc_outcome_uncertain');
  }
  const opts = await fakeOwner(t, async (peer, key, sessionId) => {
    const req = await peer.next(), response = sign(key, 'response', { type: 'response', sessionId, seq: req.seq, requestId: req.requestId, ok: true, result: 1 });
    peer.send(response); peer.send(response);
  });
  const client = await createIpcClient(opts); t.after(() => client.close());
  assert.equal(await client.call('status', {}), 1);
  await new Promise(r => setTimeout(r, 20)); await rejects(client.call('status', {}), 'ipc_closed');
});

test('IPC disconnect detaches once while the accepted callback drains exactly once', async t => {
  const gate = deferred(), started = deferred(); let calls = 0, done = 0; const sessions = [];
  const f = await fixture(t, { onAttach: s => { sessions.push(s); }, onDetach: s => { assert.equal(s, sessions[0]); done++; },
    async onRequest({ session }) { calls++; assert.equal(session, sessions[0]); started.resolve(); await gate.promise; return { completed: true }; } });
  const client = await f.client(), result = client.call('work', {}); const uncertain = rejects(result, 'ipc_outcome_uncertain');
  await started.promise; client.close(); client.close(); await uncertain; await until(() => done === 1);
  assert.equal(calls, 1); assert.equal(f.server.status().pending, 1);
  const shutdown = await f.server.close(); assert.deepEqual(shutdown, { pending: 1 });
  assert.deepEqual(await f.server.close(), { pending: 1 }); gate.resolve(); await until(() => f.server.status().pending === 0);
  assert.equal(done, 1); assert.equal(calls, 1);
});

test('IPC client timeout never retries and the original accepted operation still completes', async t => {
  const gate = deferred(), started = deferred(); let calls = 0, completed = 0;
  const f = await fixture(t, { async onRequest() { calls++; started.resolve(); await gate.promise; completed++; return null; } });
  const client = await f.client({ timeoutMs: 25 });
  const result = client.call('work', {}); await started.promise;
  await assert.rejects(result, e => e.code === 'ipc_outcome_uncertain' && e.outcome === 'unknown' && /^[a-f0-9]{64}$/.test(e.requestId));
  assert.equal(f.server.status().pending, 1); await rejects(client.call('work', {}), 'ipc_closed');
  gate.resolve(); await until(() => completed === 1); assert.equal(calls, 1);
});

test('IPC enforces global pending capacity across detached sessions without cancelling their work', async t => {
  const gate = deferred(); let calls = 0;
  const f = await fixture(t, { limits: { pending: 1 }, async onRequest() { calls++; await gate.promise; return null; } });
  const a = await f.client(), accepted = rejects(a.call('work', {}), 'ipc_outcome_uncertain');
  await until(() => calls === 1); a.close(); await accepted;
  const b = await f.client(); await rejects(b.call('work', {}), 'ipc_outcome_uncertain');
  assert.equal(calls, 1); assert.equal(f.server.status().pending, 1); gate.resolve(); await until(() => f.server.status().pending === 0);
});

test('IPC bounds connections, authenticated sessions, inflight and per-session request history', async t => {
  const f = await fixture(t, { limits: { connections: 2, sessions: 1, requests: 2 } });
  const a = await f.client({ limits: { requests: 2 } }); await rejects(f.client(), 'ipc_authentication');
  assert.deepEqual(await a.call('status', {}), {}); assert.deepEqual(await a.call('status', {}), {});
  await rejects(a.call('status', {}), 'ipc_capacity');
  const idle = connect(t, f.endpoint); await idle.next();
  const overflow = connect(t, f.endpoint); await overflow.closed; idle.socket.destroy(); a.close();
  await until(() => f.server.status().sessions === 0);
  const gate = deferred(), g = await fixture(t, { limits: { inflight: 1 }, async onRequest() { await gate.promise; return 1; } });
  const c = await g.client({ limits: { inflight: 1 } }), pending = c.call('work', {});
  await rejects(c.call('work', {}), 'ipc_capacity'); gate.resolve(); assert.equal(await pending, 1);
});

test('IPC handshake/absolute session deadlines are bounded and do not infer authority from an idle socket', async t => {
  let attaches = 0; const f = await fixture(t, { limits: { handshakeMs: 30, sessionMs: 40 }, onAttach() { attaches++; } });
  const idle = connect(t, f.endpoint); await idle.next(); await idle.closed; assert.equal(attaches, 0);
  const client = await f.client(); await until(() => f.server.status().sessions === 0);
  await rejects(client.call('status', {}), 'ipc_closed'); assert.equal(attaches, 1);
});

test('IPC preserves uncertainty for handler errors/invalid results and refuses non-JSON payloads before send', async t => {
  let calls = 0;
  const f = await fixture(t, { onRequest({ payload }) {
    calls++; if (payload.mode === 'throw') { const e = new Error(secret); e.code = secret; throw e; }
    if (payload.mode === 'large') return 'x'.repeat(IPC_LIMITS.frameBytes); return undefined;
  } });
  for (const mode of ['throw', 'large', 'undefined']) {
    const caller = await f.client();
    await assert.rejects(caller.call('work', { mode }), e => e.code === 'ipc_outcome_uncertain' && !String(e).includes(secret));
  }
  await until(() => f.server.status().sessions === 0);
  const client = await f.client();
  const cyclic = {}; cyclic.self = cyclic;
  const getter = Object.defineProperty({}, 'x', { enumerable: true, get() { assert.fail('must not execute accessor'); } });
  for (const payload of [[], null, { x: undefined }, { x: NaN }, { x: 1n }, cyclic, getter,
    JSON.parse('{"__proto__":{}}'), { x: 'x'.repeat(IPC_LIMITS.frameBytes) }]) await assert.rejects(client.call('work', payload));
  assert.equal(calls, 3); assert.equal(f.server.status().sessions, 1);
});

test('IPC reports unknown outcome after an effect followed by oversized result or throw and never replays on reconnect', async t => {
  for (const mode of ['oversized', 'throw']) {
    let counter = 0, originalRequestId;
    const f = await fixture(t, { onRequest({ requestId }) {
      counter++; originalRequestId = requestId;
      if (mode === 'throw') { const error = new Error(secret); error.code = secret; throw error; }
      return { value: 'x'.repeat(IPC_LIMITS.frameBytes) };
    } });
    const caller = await f.client();
    await assert.rejects(caller.call('work', {}), error => error.code === 'ipc_outcome_uncertain' &&
      error.outcome === 'unknown' && error.requestId === originalRequestId && !JSON.stringify(error).includes(secret) && !String(error).includes(secret));
    assert.equal(counter, 1); await until(() => f.server.status().pending === 0 && f.server.status().sessions === 0);
    const reconnected = await f.client(); assert.notEqual(reconnected.sessionId, caller.sessionId);
    assert.equal(counter, 1); reconnected.close(); await until(() => f.server.status().sessions === 0); assert.equal(counter, 1);
  }
});

test('IPC accepted callback failure marks every pending caller uncertain while other accepted work still drains', async t => {
  const gate = deferred(); let calls = 0, completed = 0;
  const f = await fixture(t, { async onRequest({ payload }) {
    calls++;
    if (payload.fail) throw new Error(secret);
    await gate.promise; completed++; return null;
  } });
  const client = await f.client(), draining = client.call('work', {}), failing = client.call('work', { fail: true });
  await Promise.all([rejects(draining, 'ipc_outcome_uncertain'), rejects(failing, 'ipc_outcome_uncertain')]);
  assert.equal(calls, 2); assert.equal(f.server.status().pending, 1);
  gate.resolve(); await until(() => completed === 1 && f.server.status().pending === 0); assert.equal(calls, 2);
});

test('IPC onAttach must finish synchronously; detach faults are latched and close the transport', async t => {
  let calls = 0, detaches = 0;
  const f = await fixture(t, { onAttach: () => Promise.resolve(), onDetach() { detaches++; }, onRequest() { calls++; } });
  await rejects(f.client(), 'ipc_authentication'); await until(() => detaches === 1); assert.equal(calls, 0);
  const g = await fixture(t, { onDetach() { throw new Error(secret); } });
  const client = await g.client(); client.close(); await until(() => g.server.status().faulted);
  assert.equal(g.server.status().closing, true);
});

test('IPC cleans up a partially registered attachment exactly once when synchronous onAttach throws', async t => {
  const enrolled = new Set(); let attempted, detaches = 0, calls = 0;
  const f = await fixture(t, {
    onAttach(session) { attempted = session; enrolled.add(session); throw new Error(secret); },
    onDetach(session) { assert.equal(session, attempted); detaches++; enrolled.delete(session); },
    onRequest() { calls++; return null; }
  });
  await rejects(f.client(), 'ipc_authentication');
  await until(() => detaches === 1 && f.server.status().connections === 0);
  assert.equal(enrolled.size, 0); assert.equal(f.server.status().sessions, 0);
  assert.equal(f.server.status().pending, 0); assert.equal(f.server.status().faulted, false);
  await f.server.close(); await f.server.close(); assert.equal(detaches, 1); assert.equal(calls, 0);
});

test('IPC endpoint collision does not displace the original owner; concurrent close/listen leaves no listener', async t => {
  const f = await fixture(t), other = createIpcServer({ endpoint: f.endpoint, identity, secret, bootId: 'other-boot', methods: ['status'], onRequest: () => null });
  t.after(() => other.close()); await assert.rejects(other.listen(), e => e.code === 'EADDRINUSE');
  assert.deepEqual(await (await f.client()).call('status', {}), {});
  const address = endpoint(), starting = createIpcServer({ endpoint: address, identity, secret, bootId, methods: ['status'], onRequest: () => null });
  t.after(() => starting.close()); const listen = starting.listen(), close = starting.close(); await listen; await close;
  assert.equal(starting.status().listening, false); await rejects(createIpcClient({ endpoint: address, identity, secret }), 'ipc_endpoint_absent');
});

test('IPC server enforces its own inflight/history limits even against a client ignoring client-side limits', async t => {
  const gate = deferred(); let calls = 0;
  const f = await fixture(t, { limits: { inflight: 1 }, async onRequest() { calls++; await gate.promise; return null; } });
  const peer = await authenticate(t, f.endpoint); peer.send(peer.request()); await until(() => calls === 1);
  peer.send(peer.request()); await peer.closed; assert.equal(calls, 1); assert.equal(f.server.status().pending, 1);
  gate.resolve(); await until(() => f.server.status().pending === 0);
  const g = await fixture(t, { limits: { requests: 1 }, onRequest() { calls++; return null; } });
  const raw = await authenticate(t, g.endpoint); raw.send(raw.request()); await raw.next();
  raw.send(raw.request()); await raw.closed; assert.equal(calls, 2);
});

test('IPC correlates concurrent replies arriving in reverse order and rejects a captured request on another session', async t => {
  const gates = [deferred(), deferred()]; let calls = 0;
  const f = await fixture(t, { async onRequest({ payload }) { calls++; await gates[payload.index].promise; return payload.index; } });
  const client = await f.client(), first = client.call('work', { index: 0 }), second = client.call('work', { index: 1 });
  await until(() => calls === 2); gates[1].resolve(); assert.equal(await second, 1); gates[0].resolve(); assert.equal(await first, 0);
  const a = await authenticate(t, f.endpoint), b = await authenticate(t, f.endpoint);
  const captured = a.request({ index: 0 }); a.send(captured); await a.next(); b.send(captured); await b.closed;
  assert.equal(calls, 3); assert.notEqual(a.ready.sessionId, b.ready.sessionId);
});

test('IPC client handshake timeout is bounded even when a local listener never sends a challenge', async t => {
  const address = endpoint(), sockets = new Set(), server = net.createServer(socket => {
    sockets.add(socket); socket.on('close', () => sockets.delete(socket)); socket.on('error', () => {});
  });
  t.after(() => { for (const socket of sockets) socket.destroy(); return new Promise(resolve => server.close(resolve)); });
  await new Promise(resolve => server.listen(address, resolve));
  await rejects(createIpcClient({ endpoint: address, identity, secret, limits: { handshakeMs: 25 } }), 'ipc_authentication');
});

test('IPC absolute session expiry disconnects a pending caller without cancelling the accepted callback', async t => {
  const gate = deferred(); let done = 0;
  const f = await fixture(t, { limits: { sessionMs: 40 }, async onRequest() { await gate.promise; done++; return null; } });
  const client = await f.client(); await rejects(client.call('work', {}), 'ipc_outcome_uncertain');
  assert.equal(f.server.status().pending, 1); gate.resolve(); await until(() => done === 1 && f.server.status().pending === 0);
});

test('IPC classifies only preconnect ENOENT and ECONNREFUSED as absence and sanitizes permission/unknown failures', async () => {
  const original = net.createConnection;
  try {
    for (const code of ['ENOENT', 'ECONNREFUSED', 'EACCES', 'EPERM', 'ETIMEDOUT']) {
      net.createConnection = () => {
        const socket = new net.Socket();
        process.nextTick(() => socket.destroy(Object.assign(new Error(secret), { code })));
        return socket;
      };
      await assert.rejects(createIpcClient({ endpoint: endpoint(), identity, secret }), error => {
        if (['ENOENT', 'ECONNREFUSED'].includes(code)) assert.deepEqual({ code: error.code, reason: error.reason, phase: error.phase }, { code: 'ipc_endpoint_absent', reason: code, phase: 'preconnect' });
        else { assert.equal(error.code, 'ipc_authentication'); assert.equal(error.reason, undefined); }
        assert.equal(String(error).includes(secret), false); return true;
      });
    }
    net.createConnection = () => { throw new Error(secret); };
    await rejects(createIpcClient({ endpoint: endpoint(), identity, secret }), 'ipc_authentication');
  } finally { net.createConnection = original; }
});

test('IPC errors after a real socket connect and a handshake timeout never count as endpoint absence', async t => {
  const address = endpoint(), sockets = new Set(), server = net.createServer(socket => { sockets.add(socket); socket.on('error', () => {}); socket.on('close', () => sockets.delete(socket)); });
  t.after(() => { for (const socket of sockets) socket.destroy(); return new Promise(resolve => server.close(resolve)); });
  await new Promise(resolve => server.listen(address, resolve));
  const original = net.createConnection;
  net.createConnection = (...args) => {
    const socket = original(...args);
    socket.once('connect', () => socket.destroy(Object.assign(new Error('synthetic postconnect refusal'), { code: 'ECONNREFUSED' })));
    return socket;
  };
  try { await rejects(createIpcClient({ endpoint: address, identity, secret }), 'ipc_authentication'); }
  finally { net.createConnection = original; }
  await rejects(createIpcClient({ endpoint: address, identity, secret, limits: { handshakeMs: 20 } }), 'ipc_authentication');
  await assert.rejects(createIpcClient({ endpoint: endpoint(), identity, secret }), error => error.code === 'ipc_endpoint_absent' && error.phase === 'preconnect');
});

test('IPC private AbortSignal cancels handshake and pending delivery without replay or callback cancellation', async t => {
  const gate = deferred(), controller = new AbortController(); let calls = 0, done = 0;
  const f = await fixture(t, { async onRequest() { calls++; await gate.promise; done++; return null; } });
  t.after(() => gate.resolve());
  const client = await f.client({ signal: controller.signal }), pending = client.call('work', {});
  await until(() => calls === 1); controller.abort(); await rejects(pending, 'ipc_outcome_uncertain');
  assert.equal(f.server.status().pending, 1); gate.resolve(); await until(() => done === 1 && f.server.status().pending === 0); assert.equal(calls, 1);
  const already = new AbortController(); already.abort();
  await rejects(createIpcClient({ endpoint: endpoint(), identity, secret, signal: already.signal }), 'ipc_connection_cancelled');
  const address = endpoint(), accepted = deferred(), sockets = new Set(), server = net.createServer(socket => { sockets.add(socket); socket.on('error', () => {}); socket.on('close', () => sockets.delete(socket)); accepted.resolve(); });
  t.after(() => { for (const socket of sockets) socket.destroy(); return new Promise(resolve => server.close(resolve)); });
  await new Promise(resolve => server.listen(address, resolve));
  const stopped = new AbortController(), connecting = createIpcClient({ endpoint: address, identity, secret, signal: stopped.signal });
  await accepted.promise; stopped.abort(); await rejects(connecting, 'ipc_connection_cancelled');
});

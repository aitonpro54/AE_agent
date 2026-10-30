'use strict';
const net = require('node:net');
const { createHmac, randomBytes, timingSafeEqual } = require('node:crypto');

// Private attachment transport, deliberately separate from CEP authentication.
// A pipe is neither singleton election nor controller/project authority. This
// module does not configure Windows ACLs or infer peer OS identity from a pipe.
// Wire frames are canonical JSON + LF (no duplicate keys/alternate encodings).
// Session keys bind both fresh nonces, exact pins and owner boot. Responses may
// finish out of order, but must match an outstanding request's id AND sequence.
const DOMAIN = 'ae-core4/local-client-ipc/v1\0';
const IPC_LIMITS = Object.freeze({ frameBytes: 65536, connections: 64, sessions: 32,
  inflight: 8, pending: 64, requests: 4096, handshakeMs: 3000, frameMs: 3000, sessionMs: 300000 });
const nonce = () => randomBytes(32).toString('hex');
const token = value => typeof value === 'string' && /^[a-zA-Z0-9._:-]{1,128}$/.test(value);
const hex = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
function fail(code) { const e = new Error(code); e.code = code; throw e; }
function exact(value, keys) {
  return value && Object.getPrototypeOf(value) === Object.prototype &&
    Object.keys(value).length === keys.length && keys.every(k => Object.hasOwn(value, k));
}
function canonical(value) {
  let nodes = 0;
  function walk(v, depth) {
    if (++nodes > 8192 || depth > 24) fail('ipc_json');
    if (v === null || typeof v === 'boolean') return JSON.stringify(v);
    if (typeof v === 'number') { if (!Number.isFinite(v)) fail('ipc_json'); return JSON.stringify(v); }
    if (typeof v === 'string') { if (Buffer.byteLength(v) > IPC_LIMITS.frameBytes) fail('ipc_json'); return JSON.stringify(v); }
    if (!v || typeof v !== 'object') fail('ipc_json');
    const array = Array.isArray(v), proto = Object.getPrototypeOf(v);
    if (!array && proto !== Object.prototype && proto !== null) fail('ipc_json');
    const keys = Reflect.ownKeys(v).filter(k => !(array && k === 'length'));
    if (keys.length > 4096 || (array && (keys.length !== v.length || v.length > 4096))) fail('ipc_json');
    for (const k of keys) {
      const d = Object.getOwnPropertyDescriptor(v, k);
      if (typeof k !== 'string' || !d.enumerable || !Object.hasOwn(d, 'value') ||
          ['__proto__', 'prototype', 'constructor'].includes(k)) fail('ipc_json');
    }
    if (array) {
      if (keys.some((k, i) => k !== String(i))) fail('ipc_json');
      return '[' + keys.map(k => walk(v[k], depth + 1)).join(',') + ']';
    }
    return '{' + keys.sort().map(k => JSON.stringify(k) + ':' + walk(v[k], depth + 1)).join(',') + '}';
  }
  const result = walk(value, 0);
  if (Buffer.byteLength(result) > IPC_LIMITS.frameBytes - 1) fail('ipc_frame_size');
  return result;
}
function mac(key, kind, body) { return createHmac('sha256', key).update(DOMAIN + kind + '\0' + canonical(body)).digest('hex'); }
function signed(key, kind, body) { return { ...body, mac: mac(key, kind, body) }; }
function verified(key, kind, value) {
  if (!hex(value.mac)) return false;
  const { mac: proof, ...body } = value;
  return timingSafeEqual(Buffer.from(proof, 'hex'), Buffer.from(mac(key, kind, body), 'hex'));
}
function options({ endpoint, identity, secret }) {
  if (typeof endpoint !== 'string' || endpoint.length > 240 || endpoint.includes('\0') ||
      !(process.platform === 'win32' ? endpoint.startsWith('\\\\.\\pipe\\') : endpoint.startsWith('/'))) fail('ipc_options');
  if (!exact(identity, ['installationId', 'machineId', 'packageHash']) || !token(identity.installationId) ||
      !token(identity.machineId) || !hex(identity.packageHash) || typeof secret !== 'string' ||
      Buffer.byteLength(secret) < 32 || Buffer.byteLength(secret) > 512) fail('ipc_options');
  return Object.freeze({ ...identity });
}
function limits(input = {}) {
  if (!input || Object.getPrototypeOf(input) !== Object.prototype || Object.keys(input).some(k => !Object.hasOwn(IPC_LIMITS, k))) fail('ipc_options');
  const result = { ...IPC_LIMITS, ...input };
  for (const [k, v] of Object.entries(result)) if (!Number.isSafeInteger(v) || v < 1 || v > IPC_LIMITS[k]) fail('ipc_options');
  // Framing/JSON bounds are protocol constants, not negotiable by peers.
  if (result.frameBytes !== IPC_LIMITS.frameBytes) fail('ipc_options');
  return result;
}
function transport(socket, onFrame, onClose, config) {
  let parts = [], length = 0, partialTimer = null, closed = false;
  function stopPartial() { clearTimeout(partialTimer); partialTimer = null; }
  socket.on('error', () => socket.destroy());
  socket.once('close', () => { closed = true; stopPartial(); parts = []; onClose(); });
  socket.on('data', data => {
    try {
      let offset = 0;
      while (offset < data.length && !socket.destroyed) {
        const end = data.indexOf(10, offset), last = end < 0 ? data.length : end;
        const part = data.subarray(offset, last);
        length += part.length;
        if (length >= config.frameBytes) fail('ipc_frame_size');
        parts.push(part);
        if (end < 0) {
          if (!partialTimer) partialTimer = setTimeout(() => socket.destroy(), config.frameMs);
          break;
        }
        stopPartial();
        const bytes = Buffer.concat(parts, length), raw = bytes.toString('utf8');
        parts = []; length = 0;
        const frame = JSON.parse(raw);
        if (!bytes.equals(Buffer.from(raw)) || canonical(frame) !== raw) fail('ipc_frame');
        onFrame(frame); offset = end + 1;
      }
    } catch { socket.destroy(); }
  });
  return body => {
    if (closed || socket.destroyed) return false;
    try {
      const bytes = Buffer.from(canonical(body) + '\n');
      if (socket.writableLength + bytes.length > config.frameBytes * config.inflight) { socket.destroy(); return false; }
      socket.write(bytes); return true;
    } catch { socket.destroy(); return false; }
  };
}

function createIpcServer(opts) {
  const identity = options(opts), config = limits(opts.limits);
  const { endpoint, secret, bootId, onRequest, onAttach = () => {}, onDetach = () => {} } = opts;
  if (!token(bootId) || !Array.isArray(opts.methods) || opts.methods.length < 1 || opts.methods.length > 128 ||
      opts.methods.some(m => !token(m)) || new Set(opts.methods).size !== opts.methods.length ||
      [onAttach, onDetach, onRequest].some(fn => typeof fn !== 'function')) fail('ipc_options');
  const methods = new Set(opts.methods), sockets = new Set();
  let listening = false, closing = false, faulted = false, sessions = 0, pending = 0, listenPromise, closePromise;
  const server = net.createServer(socket => {
    if (closing || faulted || sockets.size >= config.connections) { socket.destroy(); return; }
    sockets.add(socket);
    let session = null, key = null, expectedSeq = 1, inflight = 0, attached = false, detached = false;
    const seen = new Set(), serverNonce = nonce();
    const challenge = { type: 'challenge', v: 1, role: 'control', identity, bootId, serverNonce };
    const deadline = setTimeout(() => socket.destroy(), config.handshakeMs);
    let lifetime;
    const send = transport(socket, frame => {
      if (closing || faulted) fail('ipc_closed');
      if (!session) {
        if (!exact(frame, ['type', 'v', 'role', 'identity', 'bootId', 'serverNonce', 'clientNonce', 'mac']) ||
            frame.type !== 'authenticate' || frame.v !== 1 || frame.role !== 'control' || frame.bootId !== bootId ||
            canonical(frame.identity) !== canonical(identity) || frame.serverNonce !== serverNonce ||
            !hex(frame.clientNonce) || !verified(secret, 'authenticate', frame) || sessions >= config.sessions) fail('ipc_authentication');
        const sessionId = nonce();
        key = mac(secret, 'session-key', { identity, bootId, serverNonce, clientNonce: frame.clientNonce, sessionId });
        session = Object.freeze({ clientSessionId: sessionId });
        // An attempted enrollment needs cleanup even when onAttach registers
        // the session and then throws. onDetach must tolerate partial attach.
        attached = true; sessions++;
        const result = onAttach(session);
        if (result && typeof result.then === 'function') { Promise.resolve(result).catch(() => {}); fail('ipc_attach_async'); }
        clearTimeout(deadline);
        lifetime = setTimeout(() => socket.destroy(), config.sessionMs);
        send(signed(key, 'ready', { type: 'ready', v: 1, bootId, sessionId }));
        return;
      }
      if (!exact(frame, ['type', 'sessionId', 'seq', 'requestId', 'method', 'payload', 'mac']) ||
          frame.type !== 'request' || frame.sessionId !== session.clientSessionId || frame.seq !== expectedSeq ||
          !hex(frame.requestId) || seen.has(frame.requestId) || !methods.has(frame.method) ||
          !frame.payload || Object.getPrototypeOf(frame.payload) !== Object.prototype ||
          !verified(key, 'request', frame) || expectedSeq > config.requests || inflight >= config.inflight || pending >= config.pending) fail('ipc_request');
      expectedSeq++; seen.add(frame.requestId); inflight++; pending++;
      const base = { type: 'response', sessionId: session.clientSessionId, seq: frame.seq, requestId: frame.requestId };
      // Acceptance survives socket loss. The owner must retain the original
      // durable result; this transport never cancels/replays an accepted call.
      Promise.resolve().then(() => onRequest({ session, method: frame.method, payload: frame.payload, requestId: frame.requestId }))
        .then(result => {
          // A callback may already have caused an effect. Failure to obtain a
          // deliverable result is uncertainty, never an ordinary RPC rejection.
          try { const reply = signed(key, 'response', { ...base, ok: true, result }); canonical(reply); send(reply); }
          catch { socket.destroy(); }
        }, () => socket.destroy())
        .finally(() => { inflight--; pending--; });
    }, () => {
      sockets.delete(socket); clearTimeout(deadline); clearTimeout(lifetime);
      if (attached && !detached) {
        detached = true; sessions--;
        try {
          const result = onDetach(session);
          if (result && typeof result.then === 'function') { Promise.resolve(result).catch(() => {}); fail('ipc_detach_async'); }
        } catch { faulted = true; void close(); }
      }
    }, config);
    send(signed(secret, 'challenge', challenge));
  });
  server.on('error', () => { faulted = true; void close(); });
  function close() {
    if (closePromise) return closePromise;
    closing = true; listening = false;
    closePromise = Promise.resolve(listenPromise).catch(() => {}).then(() => new Promise(resolve => {
      for (const socket of sockets) socket.destroy();
      if (!server.listening) { resolve(Object.freeze({ pending })); return; }
      server.close(() => resolve(Object.freeze({ pending })));
    }));
    return closePromise;
  }
  return Object.freeze({
    listen() {
      if (closing) return Promise.reject(Object.assign(new Error('ipc_closed'), { code: 'ipc_closed' }));
      if (!listenPromise) listenPromise = new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(endpoint, () => { server.removeListener('error', reject); listening = !closing; resolve(); });
      });
      return listenPromise;
    }, close,
    status: () => Object.freeze({ listening, closing, faulted, connections: sockets.size, sessions, pending })
  });
}

async function createIpcClient(opts) {
  const identity = options(opts), config = limits(opts.limits), timeoutMs = opts.timeoutMs ?? 30000;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 300000 || opts.signal !== undefined && !(opts.signal instanceof AbortSignal)) fail('ipc_options');
  if (opts.signal?.aborted) fail('ipc_connection_cancelled');
  return new Promise((resolve, reject) => {
    let socket;
    try { socket = net.createConnection(opts.endpoint); } catch { reject(Object.assign(new Error('ipc_authentication'), { code: 'ipc_authentication' })); return; }
    const pending = new Map();
    let challenge, clientNonce, key, sessionId, bootId, seq = 0, ready = false, failed = false, connected = false, absence = null, cancelled = false, timedOut = false;
    socket.once('connect', () => { connected = true; absence = null; });
    socket.on('error', error => {
      if (!connected && !cancelled && !timedOut) absence = absence === null && ['ENOENT', 'ECONNREFUSED'].includes(error.code) ? error.code : 'unknown';
    });
    const handshakeTimer = setTimeout(() => { timedOut = true; absence = null; abort(); }, config.handshakeMs);
    function abort() { socket.destroy(); }
    function cancel() { cancelled = true; absence = null; abort(); }
    opts.signal?.addEventListener('abort', cancel, { once: true });
    if (opts.signal?.aborted) cancel();
    function uncertain(entry) {
      clearTimeout(entry.timer);
      const error = new Error('ipc_outcome_uncertain');
      Object.assign(error, { code: 'ipc_outcome_uncertain', outcome: 'unknown', requestId: entry.requestId });
      entry.reject(error);
    }
    const send = transport(socket, frame => {
      if (!challenge) {
        if (!exact(frame, ['type', 'v', 'role', 'identity', 'bootId', 'serverNonce', 'mac']) || frame.type !== 'challenge' ||
            frame.v !== 1 || frame.role !== 'control' || canonical(frame.identity) !== canonical(identity) ||
            !token(frame.bootId) || !hex(frame.serverNonce) || !verified(opts.secret, 'challenge', frame)) fail('ipc_authentication');
        challenge = frame; bootId = frame.bootId; clientNonce = nonce();
        send(signed(opts.secret, 'authenticate', { type: 'authenticate', v: 1, role: 'control', identity,
          bootId, serverNonce: frame.serverNonce, clientNonce })); return;
      }
      if (!ready) {
        if (!exact(frame, ['type', 'v', 'bootId', 'sessionId', 'mac']) || frame.type !== 'ready' || frame.v !== 1 ||
            frame.bootId !== bootId || !hex(frame.sessionId)) fail('ipc_authentication');
        sessionId = frame.sessionId;
        key = mac(opts.secret, 'session-key', { identity, bootId, serverNonce: challenge.serverNonce, clientNonce, sessionId });
        if (!verified(key, 'ready', frame)) fail('ipc_authentication');
        ready = true; clearTimeout(handshakeTimer);
        resolve(Object.freeze({ bootId, sessionId, close: abort,
          call(method, payload) {
            if (failed || socket.destroyed) return Promise.reject(Object.assign(new Error('ipc_closed'), { code: 'ipc_closed' }));
            let frame;
            try {
              if (!token(method) || !payload || Object.getPrototypeOf(payload) !== Object.prototype) fail('ipc_payload');
              if (pending.size >= config.inflight || seq >= config.requests) fail('ipc_capacity');
              frame = signed(key, 'request', { type: 'request', sessionId, seq: seq + 1, requestId: nonce(), method, payload }); canonical(frame);
            } catch (error) { return Promise.reject(error); }
            return new Promise((fulfill, rejectCall) => {
              seq++;
              const entry = { requestId: frame.requestId, seq, resolve: fulfill, reject: rejectCall,
                timer: setTimeout(abort, timeoutMs) };
              pending.set(entry.requestId, entry); send(frame);
            });
          }
        })); return;
      }
      const entry = pending.get(frame.requestId);
      if (!exact(frame, ['type', 'sessionId', 'seq', 'requestId', 'ok', 'result', 'mac']) ||
          frame.type !== 'response' || frame.sessionId !== sessionId || !entry || frame.seq !== entry.seq || frame.ok !== true ||
          !verified(key, 'response', frame)) fail('ipc_response');
      pending.delete(frame.requestId); clearTimeout(entry.timer);
      entry.resolve(frame.result);
    }, () => {
      failed = true; clearTimeout(handshakeTimer);
      opts.signal?.removeEventListener('abort', cancel);
      if (!ready) {
        const absent = !connected && !cancelled && !timedOut && ['ENOENT', 'ECONNREFUSED'].includes(absence);
        const code = cancelled ? 'ipc_connection_cancelled' : absent ? 'ipc_endpoint_absent' : 'ipc_authentication';
        reject(Object.assign(new Error(code), { code, ...(absent ? { reason: absence, phase: 'preconnect' } : {}) }));
      }
      for (const entry of pending.values()) uncertain(entry);
      pending.clear();
    }, config);
  });
}
module.exports = { createIpcServer, createIpcClient, IPC_LIMITS };

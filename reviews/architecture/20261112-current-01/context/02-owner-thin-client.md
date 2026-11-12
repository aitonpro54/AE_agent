# 02-owner-thin-client

Выбранные точные исходники; вне обозначенных диапазонов контекст не включён.

## `core4/runtime/owner-entry.js:58–75`
Полный файл SHA256 (hex groups, concatenate) `f5764b7a:da15a35d:2624fbfe:c1bf96ed:9d3feb64:13a97c36:953733cd:33b5c327`; Git blob `11ff8f40:280cb090:a5f349e5:c8abff00:7537ee93`. Выдержка: строки 58–75, 1244 bytes.

```javascript
async function startOwner({ descriptor, port } = {}) {
  verifyOwnerInstallation(descriptor);
  // This is the first trusted import. No caller-selected executable imports.
  const { start } = require('./stdio-entry.js');
  return start({ descriptor, ...(port === undefined ? {} : { port }), mode: 'owner' });
}
module.exports = { startOwner, verifyOwnerInstallation };
if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== '--installation') { process.stderr.write('Explicit --installation ABSOLUTE_DESCRIPTOR required.\n'); process.exitCode = 2; }
  else startOwner({ descriptor: args[1] }).then(runtime => {
    for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => {
      // Signals request durable desired-stop too; pending work is drained without
      // force exit. A failed/ambiguous stop keeps its fence and cannot mean resume.
      runtime.close().then(() => { process.exitCode = 0; }, e => { if (e.code !== 'owner_draining') process.exitCode = 1; process.stderr.write((e.code === 'owner_draining' ? e.code : 'owner_shutdown_failed') + '\n'); });
    });
  }).catch(e => { process.stderr.write((e.code || 'owner_start_failed') + '\n'); process.exitCode = 1; });
}
```

## `core4/runtime/owner-contract.json:1–31`
Полный файл SHA256 (hex groups, concatenate) `1313117a:a67e63e9:08ebc069:4d3b067b:740c3a72:a5b26757:22794daa:b94d103b`; Git blob `082717a7:53619556:a281adab:1f04810a:2052e297`. Выдержка: строки 1–31, 987 bytes.

```json
{
  "version": 4,
  "runtimeModel": "owner",
  "clientEntry": "runtime/client-entry.js",
  "clientArgument": "--client-descriptor",
  "ownerEntry": "runtime/owner-entry.js",
  "ownerArgument": "--installation",
  "clientDescriptorFile": "core-client.json",
  "requiredFiles": [
    "runtime/owner-entry.js",
    "runtime/client-entry.js",
    "runtime/client-ipc.js",
    "runtime/client-stdio.js",
    "runtime/controller-lease.js",
    "runtime/attachment-owner.js",
    "runtime/owner-lifecycle.js",
    "runtime/recovery-inspection.js",
    "runtime/windows-owner-process.js",
    "runtime/owner-maintenance.js",
    "runtime/start-over-inspection.js",
    "runtime/start-over-process.js",
    "runtime/start-over-state.js",
    "runtime/start-over-barrier.js",
    "runtime/start-over-archive.js",
    "runtime/start-over-finisher.js",
    "runtime/work-session.js",
    "runtime/start-over-panel-control.js",
    "runtime/start-over-driver.js",
    "runtime/owner-launch.js"
  ]
}
```

## `core4/runtime/client-entry.js:97–128`
Полный файл SHA256 (hex groups, concatenate) `b2a84ad7:b58525b8:46ced716:cb905187:151588fb:020f8c12:ead16b20:fec2daba`; Git blob `9f9fb296:c3f3c33b:74905be9:60a33f9c:c9c6fc70`. Выдержка: строки 97–128, 2387 bytes.

```javascript
async function startClient({ descriptor, input = process.stdin, output = process.stdout } = {}) {
  const d = verifyClientDescriptor(descriptor);
  if (fs.realpathSync(path.resolve(__dirname, '..')) !== fs.realpathSync(d.releaseDir)) fail('client_entry_root');
  // All non-builtin imports are below full release and exact-entry verification.
  const { createIpcClient, isPreSendClosed } = require('./client-ipc');
  const { serveAttachment } = require('./client-stdio');
  const { spawn } = require('node:child_process');
  const lifetime = new AbortController();
  let linked = null, connecting = null, closed = false, launchAttempted = false;
  const preSpawnStops = new WeakSet();
  const absent = error => error?.code === 'ipc_endpoint_absent' && error.phase === 'preconnect' && ['ENOENT', 'ECONNREFUSED'].includes(error.reason);
  const unavailable = () => fail('owner_unavailable');
  function stopped() {
    // This role cannot verify the full-role maintenance seal. Observed presence
    // only denies launch; it never asserts a valid stop/death/maintenance grant.
    for (const dir of [path.join(d.installRoot, 'state'), path.join(d.installRoot, 'state/production')]) {
      try { plain(dir, true); } catch (e) { if (e.code === 'ENOENT') return false; throw e; }
    }
    // In the admitted v4 cluster this only routes bootstrap to the verified
    // read-only reset driver. Presence cannot authorize stores or a new session;
    // the full-role entry validates even malformed/partial reset state first.
    try { fs.lstatSync(path.join(d.installRoot, 'state/production/runtime-start-over.json')); return false; }
    catch (e) { if (e.code !== 'ENOENT') throw e; }
    try { fs.lstatSync(path.join(d.installRoot, 'state/production/runtime-maintenance.json')); return true; }
    catch (e) { if (e.code === 'ENOENT') return false; throw e; }
  }
  function refuseStopped() { const error = Object.assign(new Error('owner_desired_stopped'), { code: 'owner_desired_stopped' }); preSpawnStops.add(error); throw error; }
  function attach(handshakeMs) {
    if (closed) unavailable();
    return createIpcClient({ endpoint: d.ownerEndpoint, identity: { installationId: d.installationId, machineId: d.machineId, packageHash: d.packageHash },
      secret: d.controlToken, timeoutMs: 120000, signal: lifetime.signal, ...(handshakeMs ? { limits: { handshakeMs } } : {}) });
  }
```

## `core4/runtime/client-entry.js:196–235`
Полный файл SHA256 (hex groups, concatenate) `b2a84ad7:b58525b8:46ced716:cb905187:151588fb:020f8c12:ead16b20:fec2daba`; Git blob `9f9fb296:c3f3c33b:74905be9:60a33f9c:c9c6fc70`. Выдержка: строки 196–235, 2297 bytes.

```javascript
  const client = {
    async call(method, payload) {
      // A fresh attachment may serve this same request only with private proof
      // that the old call never reached send. It never transfers lease state.
      for (let attachment = 0; attachment < 2; attachment++) {
        if (closed) fail('owner_unavailable');
        if (!linked) {
          if (!connecting) connecting = connect();
          const attempt = connecting;
          try { linked = await attempt; launchAttempted = false; }
          catch { return method === 'owner_status' ? { ok: true, value: { available: false, reason: 'owner_connection_unavailable', coverage: 'unobserved' } } : { ok: false, code: 'owner_unavailable' }; }
          finally { if (connecting === attempt) connecting = null; }
        }
        if (closed) { linked.close(); linked = null; fail('owner_unavailable'); }
        const connection = linked;
        try { return await connection.call(method, payload); }
        catch (error) {
          if (error?.code === 'ipc_outcome_uncertain' || error?.code === 'ipc_closed') {
            connection.close(); if (linked === connection) linked = null;
          }
          if (attachment === 0 && !closed && typeof isPreSendClosed === 'function' && isPreSendClosed(error)) continue;
          throw error;
        }
      }
    },
    close() { closed = true; lifetime.abort(); if (linked) linked.close(); linked = null; }
  };
  // Initialize/tools-list remain available without an owner. A failed accepted
  // call is never resent. Only a privately proven pre-send idle closure permits
  // one fresh attachment within a request; other losses need explicit requests.
  try {
    const release = read(path.join(d.releaseDir, 'release.json'), 1024 * 1024);
    if (hash(release) !== d.packageHash) fail('client_release');
    const manifest = JSON.parse(release);
    if (!hex(manifest.hashes['runtime/stdio-entry.js'])) fail('client_release');
    const { deriveComposition } = require('./stdio-entry.js');
    const renderJobs = deriveComposition(manifest, file => read(path.join(d.releaseDir, file), 4 * 1024 * 1024)).renderJobs === true;
    return serveAttachment({ client, input, output, ...(renderJobs ? { renderJobs: true } : {}) });
  } catch (error) { client.close(); throw error; }
}
```

## `core4/runtime/client-ipc.js:210–240`
Полный файл SHA256 (hex groups, concatenate) `48f30d19:4b90e59b:05183a51:16f92372:546e1d21:1fb15c56:c53e17c7:fdabac71`; Git blob `8c09bdf4:4a650afc:3e703794:5dd8882e:eb5a1fa7`. Выдержка: строки 210–240, 2369 bytes.

```javascript
async function createIpcClient(opts) {
  const identity = options(opts), config = limits(opts.limits), timeoutMs = opts.timeoutMs ?? 30000;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 300000 || opts.signal !== undefined && !(opts.signal instanceof AbortSignal)) fail('ipc_options');
  if (opts.signal?.aborted) fail('ipc_connection_cancelled');
  return new Promise((resolve, reject) => {
    let socket;
    try { socket = net.createConnection(opts.endpoint); } catch { reject(Object.assign(new Error('ipc_authentication'), { code: 'ipc_authentication' })); return; }
    const pending = new Map();
    let challenge, clientNonce, key, sessionId, bootId, seq = 0, ready = false, failed = false, connected = false, absence = null, cancelled = false, timedOut = false, cleanClosure = false, locallyClosed = false;
    socket.once('connect', () => { connected = true; absence = null; });
    socket.on('error', error => {
      if (!connected && !cancelled && !timedOut) absence = absence === null && ['ENOENT', 'ECONNREFUSED'].includes(error.code) ? error.code : 'unknown';
    });
    const handshakeTimer = setTimeout(() => { timedOut = true; absence = null; abort(); }, config.handshakeMs);
    function abort() { locallyClosed = true; cleanClosure = false; socket.destroy(); }
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
```

## `core4/runtime/client-ipc.js:270–297`
Полный файл SHA256 (hex groups, concatenate) `48f30d19:4b90e59b:05183a51:16f92372:546e1d21:1fb15c56:c53e17c7:fdabac71`; Git blob `8c09bdf4:4a650afc:3e703794:5dd8882e:eb5a1fa7`. Выдержка: строки 270–297, 1547 bytes.

```javascript
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
    }, faulted => {
      // A clean, fully observed close can retire an idle attachment. No call
      // already in pending is eligible: every such outcome remains unknown.
      cleanClosure = ready && !faulted && !cancelled && !locallyClosed && !socket.writableLength && pending.size === 0;
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
module.exports = { createIpcServer, createIpcClient, IPC_LIMITS, isPreSendClosed, fitsIpcResult };
```

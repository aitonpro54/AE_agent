# Allowlisted implementation excerpts

Read-only context. Full-source hashes and exact origins are in the package manifest. One token-source expression is summarized at `http-peer.js:46`; installer-generated credential expressions at `install-core4.js:74` are omitted. No credential values are included.

## `core4/cep/js/panel.js`

Source lines 1-27:

```javascript
   1: (function () {
   2:   'use strict';
   3:   var cfg = window.Core4Installation, api = window.Core4PollDispatcher, status = document.getElementById('status'), detail = document.getElementById('detail'), button = document.getElementById('connect');
   4:   var peerId, epoch, sequence = 0, linked = false, running = false;
   5:   function show(s) { status.textContent = s; }
   6:   async function sign(value) { var key = await crypto.subtle.importKey('raw', new TextEncoder().encode(cfg.panelToken), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']); var bytes = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(api.canonical(value)))); return Array.from(bytes).map(function (b) { return ('0' + b.toString(16)).slice(-2); }).join(''); }
   7:   async function post(path, value) { var response = await fetch('http://127.0.0.1:3457' + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: api.canonical(value), credentials: 'omit', cache: 'no-store' }); var body = await response.json(); if (!response.ok) throw new Error(body.error || 'http_' + response.status); return body; }
   8:   async function authenticated(path, payload) { var b = { epoch: epoch, peerId: peerId, sequence: ++sequence, method: 'POST', path: path, payload: payload }; var response = await post(path, { body: b, mac: await sign(b) }); if (response.mac !== await sign(response.body) || response.body.epoch !== epoch || response.body.peerId !== peerId || response.body.sequence !== b.sequence) throw new Error('response_auth'); return response.body.payload; }
   9:   async function start() {
  10:     if (running) return; running = true; button.disabled = true;
  11:     try {
  12:       if (!cfg || !window.crypto || !crypto.subtle || typeof TextEncoder !== 'function' || typeof fetch !== 'function' || !window.__adobe_cep__ || typeof __adobe_cep__.evalScript !== 'function') throw new Error('CEP_WebCrypto_or_host_unavailable');
  13:       var random = new Uint8Array(24); crypto.getRandomValues(random); peerId = 'panel-' + Array.from(random).map(function (b) { return b.toString(16); }).join('');
  14:       var challenge = await post('/challenge', { role: 'panel' });
  15:       if (challenge.packageHash !== cfg.packageHash || challenge.installationId !== cfg.installationId || challenge.executorHash !== cfg.executorHash || challenge.role !== 'panel' || (challenge.origin !== 'null' && challenge.origin !== 'file://')) throw new Error('installation_binding');
  16:       var response = await post('/link', { challenge: challenge, peerId: peerId, proof: await sign({ challenge: challenge, peerId: peerId }) });
  17:       if (response.mac !== await sign(response.body) || response.body.peerId !== peerId || response.body.epoch !== challenge.epoch) throw new Error('link_auth');
  18:       epoch = response.body.epoch; sequence = 0; linked = true;
  19:       var dispatcher = api.createDispatcher({ installationId: cfg.installationId, assetKey: cfg.assetKey, assets: cfg.assets, pins: response.body.pins, storage: localStorage, csInterface: { evalScript: function (s, cb) { __adobe_cep__.evalScript(s, cb); } }, complete: function (p) { return authenticated('/complete', p); } });
  20:       await dispatcher.recover(); if (response.body.laneClosed) throw new Error('receiver_lane_closed');
  21:       show('Подключено к Core 4.0.0'); detail.textContent = 'Изменения текста требуют подтверждения в After Effects';
  22:       while (linked) { var next = await authenticated('/poll', {}); if (next.command) await dispatcher.dispatch(next.command); }
  23:     } catch (e) { linked = false; show('Остановлено: ' + e.message); detail.textContent = 'UNKNOWN не повторяется. Проверяйте core_status; перезагрузка не снимает fence.'; }
  24:     finally { running = false; button.disabled = false; }
  25:   }
  26:   button.addEventListener('click', start); start();
  27: }());
```

## `core4/cep/js/poll-dispatcher.js`

Source lines 1-44:

```javascript
   1: (function (root) {
   2:   'use strict';
   3:   function canonical(v) {
   4:     if (v === null || typeof v === 'boolean' || typeof v === 'string') return JSON.stringify(v);
   5:     if (typeof v === 'number' && isFinite(v)) return JSON.stringify(v);
   6:     if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
   7:     if (!v || typeof v !== 'object') throw new Error('invalid_json');
   8:     return '{' + Object.keys(v).sort().map(function (k) { return JSON.stringify(k) + ':' + canonical(v[k]); }).join(',') + '}';
   9:   }
  10:   function exact(v, keys) { if (!v || typeof v !== 'object' || Array.isArray(v) || Object.keys(v).some(function (k) { return keys.indexOf(k) < 0; })) throw new Error('invalid_frame'); }
  11:   function createDispatcher(options) {
  12:     var key = 'aeagentcore4-physical-' + options.installationId;
  13:     var active = false;
  14:     function load() { var value = options.storage.getItem(key); return value ? JSON.parse(value) : null; }
  15:     function save(v) { var value = canonical(v); options.storage.setItem(key, value); if (options.storage.getItem(key) !== value) throw new Error('latch_write_failed'); }
  16:     function post(record) { return options.complete({ commandId: record.frame.commandId, originalBinding: record.frame.originalBinding, pins: record.frame.pins, result: record.result }).then(function (reply) {
  17:       if (!reply.ack || reply.ack.commandId !== record.frame.commandId || reply.ack.receiptRef !== record.frame.originalBinding.receiptRef) throw new Error('completion_ack_mismatch');
  18:       options.storage.removeItem(key); active = false;
  19:     }); }
  20:     return {
  21:       pending: load,
  22:       recover: function () { var prior = load(); if (!prior) return Promise.resolve(); if (!prior.result) return Promise.reject(new Error('physical_outcome_unknown_no_replay')); active = true; return post(prior); },
  23:       dispatch: function (frame) {
  24:         exact(frame, ['assetKey', 'phase', 'typedPayload', 'commandId', 'originalBinding', 'pins']);
  25:         if (active || load()) throw new Error('physical_latch_present');
  26:         var assets = options.assets || [{ assetKey: options.assetKey, executorHash: options.pins.executorHash, phases: ['inspect'] }];
  27:         var selected = assets.filter(function (a) { return a.assetKey === frame.assetKey; })[0];
  28:         var expectedPins = { packageHash: options.pins.packageHash, installationId: options.pins.installationId, executorHash: selected ? selected.executorHash : '' };
  29:         if (!selected || selected.phases.indexOf(frame.phase) < 0 || canonical(frame.pins) !== canonical(expectedPins) || frame.originalBinding.commandId !== frame.commandId || frame.originalBinding.executorHash !== selected.executorHash || frame.originalBinding.phase !== frame.phase) throw new Error('fixed_asset_binding');
  30:         var record = { frame: frame }; save(record); active = true;
  31:         // This persistent latch is not fsync proof. The Node durable begin/fence
  32:         // is authoritative and remains closed after lost callback/reload.
  33:         return new Promise(function (resolve, reject) {
  34:           var data = canonical(frame).replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  35:           var script = '(function(){if(typeof AECore4Host==="undefined"||typeof AECore4Host.dispatch!=="function")return "{\\"readFailureVersion\\":1,\\"outcome\\":\\"rejected\\",\\"code\\":\\"host_registry_unavailable\\"}";return AECore4Host.dispatch(' + JSON.stringify(data) + ');}())';
  36:           try { options.csInterface.evalScript(script, function (raw) {
  37:             try { record.result = JSON.parse(raw); save(record); post(record).then(resolve, reject); } catch (e) { reject(e); }
  38:           }); } catch (e) { reject(e); }
  39:         });
  40:       }
  41:     };
  42:   }
  43:   root.Core4PollDispatcher = { canonical: canonical, createDispatcher: createDispatcher };
  44:   if (typeof module === 'object') module.exports = root.Core4PollDispatcher;
```

## `core4/integrations/cep/http-peer.js`

Source lines 23-67:

```javascript
  23:   const server = http.createServer(async (req, res) => {
  24:     const origin = req.headers.origin;
  25:     let corsOrigin;
  26:     try {
  27:       if (closed || req.headers.host !== '127.0.0.1:' + server.address().port || req.socket.remoteAddress !== '127.0.0.1') fail('loopback_host_required');
  28:       // Package-owned CEP file origins. They are accepted only with fresh role-secret MAC;
  29:       // never wildcard CORS, cookies, unauthenticated status or source ingress.
  30:       if ((origin !== 'null' && origin !== 'file://') || req.rawHeaders.filter((value, index) => index % 2 === 0 && value.toLowerCase() === 'origin').length !== 1) fail('cep_origin_required');
  31:       corsOrigin = origin;
  32:       if (req.method === 'OPTIONS') { res.writeHead(204, { 'Access-Control-Allow-Origin': corsOrigin, 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'Content-Type', Vary: 'Origin' }); res.end(); return; }
  33:       if (req.method !== 'POST') fail('post_required');
  34:       let bytes = 0, chunks = [];
  35:       for await (const chunk of req) { bytes += chunk.length; if (bytes > 256 * 1024) fail('frame_too_large'); chunks.push(chunk); }
  36:       const input = parse(Buffer.concat(chunks));
  37:       if (req.url === '/challenge') {
  38:         exact(input, ['role']); if (!['panel', 'control'].includes(input.role)) fail('role_required');
  39:         for (const [key, c] of challenges) if (Date.now() - c.time > 10000) challenges.delete(key);
  40:         if (challenges.size >= 16) fail('challenge_backpressure');
  41:         const nonce = crypto.randomBytes(32).toString('hex'); const value = { nonce, epoch, role: input.role, origin: corsOrigin, ...pins, controllerId };
  42:         challenges.set(nonce, { value, time: Date.now() }); reply(res, 200, value, corsOrigin); return;
  43:       }
  44:       if (req.url === '/link') {
  45:         exact(input, ['challenge', 'peerId', 'proof']); const challenge = challenges.get(input.challenge?.nonce); challenges.delete(input.challenge?.nonce);
  46:         const role = challenge?.value.role, secret = [REDACTED: role-selected installation-held key reference];
  47:         if (!challenge || origin !== challenge.value.origin || Date.now() - challenge.time > 10000 || canonical(input.challenge) !== canonical(challenge.value) || typeof input.peerId !== 'string' || !/^[a-zA-Z0-9-]{1,100}$/.test(input.peerId) || !validMac({ challenge: input.challenge, peerId: input.peerId }, input.proof, secret)) fail('peer_auth');
  48:         if (role !== 'panel') fail('panel_role_required');
  49:         if (peer && (Date.now() - peer.lastSeen < 45000 || pending)) fail('duplicate_peer');
  50:         peer = { peerId: input.peerId, origin: challenge.value.origin, sequence: 0, lastSeen: Date.now() };
  51:         const body = { linked: true, epoch, peerId: peer.peerId, controllerId, pins, receiverStoreIdentity: store.identity, laneClosed: store.closed };
  52:         reply(res, 200, { body, mac: mac(body, secret) }, corsOrigin); return;
  53:       }
  54:       exact(input, ['body', 'mac']); const b = requestBody(input.body);
  55:       if (!peer || origin !== peer.origin || b.epoch !== epoch || b.peerId !== peer.peerId || b.sequence !== peer.sequence + 1 || b.method !== req.method || b.path !== req.url || !validMac(b, input.mac, installation.panelToken)) fail('peer_auth_or_replay');
  56:       peer.sequence = b.sequence; peer.lastSeen = Date.now();
  57:       function signed(payload) { const body = { epoch, peerId: peer.peerId, sequence: b.sequence, payload }; reply(res, 200, { body, mac: mac(body, installation.panelToken) }, corsOrigin); }
  58:       if (req.url === '/poll') {
  59:         exact(b.payload, []); if (activePoll) fail('concurrent_poll');
  60:         if (pending && !pending.delivered) { try { admissionGuard(pending.command); } catch (e) { disconnect(e.code || 'physical_admission_closed'); throw e; } }
  61:         if (frame()) { const value = frame(); pending.delivered = true; signed({ command: value }); return; }
  62:         await new Promise(resolve => {
  63:           const timer = setTimeout(() => { if (activePoll === finish) activePoll = null; signed({ command: null }); resolve(); }, pollTimeout);
  64:           const finish = value => { clearTimeout(timer); signed({ command: value }); resolve(); };
  65:           activePoll = finish;
  66:           res.on('close', () => { if (activePoll === finish) { activePoll = null; clearTimeout(timer); resolve(); } });
  67:         }); return;
```

Source lines 69-102:

```javascript
  69:       if (req.url === '/complete') {
  70:         exact(b.payload, ['commandId', 'originalBinding', 'pins', 'result']);
  71:         const c = store.get(b.payload.commandId);
  72:         if (!c || canonical(c.originalBinding) !== canonical(b.payload.originalBinding) || canonical(b.payload.pins) !== canonical(commandPins(c.command))) fail('completion_correlation');
  73:         if (c.state === 'completed') { if (canonical(c.response.result) !== canonical(b.payload.result)) fail('completion_conflict'); signed({ ack: { commandId: b.payload.commandId, receiptRef: c.originalBinding.receiptRef } }); return; }
  74:         if (!pending || c.state !== 'ongoing' || !pending.delivered || pending.command.commandId !== b.payload.commandId) fail('unknown_no_promotion');
  75:         const result = b.payload.result;
  76:         const selectedAsset = assets.get(c.command.executorHash);
  77:         if (result.readFailureVersion === 1) {
  78:           exact(result, ['readFailureVersion', 'outcome', 'code']);
  79:           if (result.outcome !== 'rejected' || !['inspection_failed', 'inspection_result_budget', 'host_json_unavailable', 'host_registry_unavailable'].includes(result.code)) fail('inspection_result');
  80:         } else if (selectedAsset.resultProfile === 'manual-text-v1') {
  81:           if (c.command.phase === 'mutate') {
  82:             exact(result, ['outcome', 'snapshot', 'code', 'transactionReceipt']);
  83:             if (result.outcome === 'unknown') { disconnect('manual_effect_unknown'); fail('manual_effect_unknown'); }
  84:             if (!['applied', 'rejected'].includes(result.outcome)) fail('manual_result');
  85:           } else { exact(result, ['target', 'revision', 'text', 'protected']); if (!result.target || typeof result.revision !== 'string' || typeof result.text !== 'string' || typeof result.protected !== 'string') fail('manual_snapshot'); }
  86:         } else {
  87:           // Private asset-selected versioned observation profile. No caller chooses
  88:           // the validator and no lifecycle/session is manufactured for discovery.
  89:           exact(result, ['observationVersion', 'target', 'project', 'compositions', 'layers', 'truncated', 'aeVersion']);
  90:           if (result.observationVersion !== 1 || !result.target || !result.project || !Array.isArray(result.compositions) || result.compositions.length > 50 || !Array.isArray(result.layers) || result.layers.length > 100 || typeof result.truncated !== 'boolean' || typeof result.aeVersion !== 'string') fail('inspection_result');
  91:           exact(result.target, ['projectId', 'compId']); exact(result.project, ['name', 'numItems', 'saved']);
  92:           if (result.target.projectId !== null && typeof result.target.projectId !== 'string' || result.target.compId !== null && (!Number.isSafeInteger(result.target.compId) || result.target.compId < 1) || typeof result.project.name !== 'string' || !Number.isSafeInteger(result.project.numItems) || result.project.numItems < 0 || typeof result.project.saved !== 'boolean') fail('inspection_result');
  93:           for (const item of result.compositions) { exact(item, ['compId', 'name', 'numLayers', 'duration']); if (!Number.isSafeInteger(item.compId) || item.compId < 1 || typeof item.name !== 'string' || !Number.isSafeInteger(item.numLayers) || item.numLayers < 0 || typeof item.duration !== 'number' || item.duration < 0) fail('inspection_result'); }
  94:           for (const item of result.layers) { exact(item, ['layerId', 'index', 'name', 'textLayer']); if (!Number.isSafeInteger(item.layerId) || item.layerId < 1 || !Number.isSafeInteger(item.index) || item.index < 1 || typeof item.name !== 'string' || typeof item.textLayer !== 'boolean') fail('inspection_result'); }
  95:         }
  96:         const response = { protocolVersion: 1, commandId: c.command.commandId, executorHash: c.command.executorHash, payloadHash: c.command.payloadHash, result }; store.complete(b.payload.commandId, response);
  97:         const done = pending; pending = null; clearTimeout(done.timer);
  98:         signed({ ack: { commandId: b.payload.commandId, receiptRef: c.originalBinding.receiptRef } });
  99:         if (result.readFailureVersion === 1) done.reject(Object.assign(new Error(result.code || 'inspection_failed'), { code: result.code || 'inspection_failed' })); else done.resolve(done.broker ? response : { observation: result, originalBinding: c.originalBinding, pins: commandPins(c.command), continuity: false });
 100:         return;
 101:       }
 102:       fail('unknown_peer_route');
```

Source lines 119-128:

```javascript
 119:       async completion(commandId) { if (!brokerBinding) fail('transport_disconnected'); const c = store.get(commandId); return encode({ commandId, state: c?.state || 'unknown', ...(c?.originalBinding ? { originalBinding: c.originalBinding } : {}), ...(c?.response ? { response: c.response } : {}) }, brokerBinding.secret); },
 120:       async disconnect() { if (pending) fail('physical_lane_pending'); brokerBinding = undefined; }
 121:     }),
 122:     async listen() { await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); }); return status(); },
 123:     inspect(payload = {}) {
 124:       exact(payload, ['compId']); if (payload.compId !== undefined && (!Number.isSafeInteger(payload.compId) || payload.compId < 1)) fail('invalid_comp_id');
 125:       const command = { protocolVersion: 1, controllerId, channelEpoch: epoch, commandId: id('inspect'), moduleId: 'project-inspection', operationId: 'inspect', executorHash: asset.executorHash, phase: 'inspect', payloadHash: hash(canonical(payload)), payload };
 126:       return submit(command);
 127:     },
 128:     async close() { closed = true; disconnect('runtime_closed'); if (activePoll) { const poll = activePoll; activePoll = null; poll(null); } await new Promise(resolve => server.close(resolve)); store.close(); }
```

## `core4/integrations/cep/completion-store.js`

Source lines 1-81:

```javascript
   1: 'use strict';
   2: const fs = require('node:fs');
   3: const path = require('node:path');
   4: const { hash, bounded, parse, canonical, id, fail, sameDispatch } = require('../../core/receiver-api');
   5: // No automatic orphan/PID recovery. An abandoned owner permits proof reads only.
   6: function openCompletionStore({ directory, io = fs }) {
   7:   if (!directory || !path.isAbsolute(directory)) fail('explicit_receiver_store_required');
   8:   io.mkdirSync(directory, { recursive: true });
   9:   const file = path.join(directory, 'completions.ndjson'), ownerFile = path.join(directory, 'owner');
  10:   let owner, closed = false, fault = false, events = [], identity;
  11:   const records = new Map();
  12:   try { owner = io.openSync(ownerFile, 'wx'); } catch (e) { if (e.code !== 'EEXIST') throw e; closed = true; }
  13:   function append(event) {
  14:     if (closed || fault || owner === undefined) fail('receiver_lane_closed');
  15:     const body = { ...event, seq: events.length + 1, previousHash: events.at(-1)?.recordHash || 'origin' };
  16:     const record = { ...body, recordHash: hash(body) }, line = bounded(record) + '\n';
  17:     let fd;
  18:     try {
  19:       fd = io.openSync(file, 'a');
  20:       if (io.writeSync(fd, line) !== Buffer.byteLength(line)) fail('receiver_short_write');
  21:       io.fsyncSync(fd); io.closeSync(fd); fd = undefined;
  22:     } catch (e) { fault = true; closed = true; throw e; }
  23:     finally { if (fd !== undefined) { try { io.closeSync(fd); } catch { fault = true; closed = true; } } }
  24:     events.push(record); return record;
  25:   }
  26:   try {
  27:     if (io.existsSync(file)) {
  28:       const data = io.readFileSync(file, 'utf8');
  29:       if (!data || !data.endsWith('\n')) fail('receiver_store_corrupt');
  30:       for (const line of data.trimEnd().split('\n')) {
  31:         const event = parse(line), { recordHash, ...body } = event;
  32:         if (event.seq !== events.length + 1 || event.previousHash !== (events.at(-1)?.recordHash || 'origin') || recordHash !== hash(body)) fail('receiver_store_corrupt');
  33:         if (!events.length) { if (event.type !== 'origin' || typeof event.identity !== 'string') fail('receiver_store_corrupt'); identity = event.identity; }
  34:         else if (event.type === 'begin') {
  35:           if (records.has(event.commandId) || event.originalBinding.receiverStoreIdentity !== identity || !sameDispatch(event.originalBinding, event.originalBinding) || event.commandDigest !== hash(event.command)) fail('receiver_store_corrupt');
  36:           records.set(event.commandId, { state: 'ongoing', command: event.command, originalBinding: event.originalBinding });
  37:         } else if (event.type === 'complete' || event.type === 'unknown') {
  38:           const prior = records.get(event.commandId);
  39:           if (!prior || prior.state !== 'ongoing') fail('receiver_store_corrupt');
  40:           records.set(event.commandId, { ...prior, state: event.type === 'complete' ? 'completed' : 'unknown', ...(event.response ? { response: event.response } : {}) });
  41:         } else fail('receiver_store_corrupt');
  42:         events.push(event);
  43:       }
  44:     } else { identity = id('receiver-store'); append({ type: 'origin', identity }); }
  45:     if ([...records.values()].some(r => r.state !== 'completed')) closed = true;
  46:   } catch { fault = true; closed = true; }
  47:   return Object.freeze({
  48:     get identity() { return identity; },
  49:     get closed() { return closed || fault; },
  50:     get fault() { return fault; },
  51:     has(commandId) { return records.has(commandId); },
  52:     get(commandId) { if (fault) return undefined; const value = records.get(commandId); return value && JSON.parse(canonical(value)); },
  53:     begin(command, originalBinding) {
  54:       if (records.has(command.commandId)) fail('duplicate_command_no_replay');
  55:       if (closed || fault || [...records.values()].some(r => r.state !== 'completed')) fail('receiver_lane_closed');
  56:       if (!sameDispatch(originalBinding, originalBinding) || originalBinding.receiverStoreIdentity !== identity) fail('receiver_store_binding');
  57:       append({ type: 'begin', commandId: command.commandId, commandDigest: hash(command), command, originalBinding });
  58:       records.set(command.commandId, { state: 'ongoing', command: JSON.parse(canonical(command)), originalBinding });
  59:     },
  60:     complete(commandId, response) {
  61:       const record = records.get(commandId); if (!record || record.state !== 'ongoing') fail('receiver_completion_order');
  62:       append({ type: 'complete', commandId, response });
  63:       records.set(commandId, { ...record, state: 'completed', response: JSON.parse(canonical(response)) });
  64:     },
  65:     unknown(commandId) {
  66:       const record = records.get(commandId);
  67:       if (record?.state === 'ongoing' && !fault && !closed) {
  68:         try { append({ type: 'unknown', commandId }); records.set(commandId, { ...record, state: 'unknown' }); } finally { closed = true; }
  69:       }
  70:     },
  71:     close() {
  72:       closed = true;
  73:       // Retain the owner marker whenever physical lifetime or durability is ambiguous.
  74:       if (owner !== undefined) {
  75:         io.closeSync(owner); owner = undefined;
  76:         if (!fault && [...records.values()].every(r => r.state === 'completed')) io.unlinkSync(ownerFile);
  77:       }
  78:     }
  79:   });
  80: }
  81: module.exports = { openCompletionStore, sourceHash: hash(fs.readFileSync(__filename)) };
```

## `core4/runtime/stdio-entry.js`

Source lines 36-105:

```javascript
  36: function verifyInstallation(file, { verifyNode = true } = {}) {
  37:   if (!path.isAbsolute(file)) fail('absolute_descriptor_required');
  38:   const d = JSON.parse(fs.readFileSync(file, 'utf8'));
  39:   if (d.version !== 1 || !path.isAbsolute(d.releaseDir) || !path.isAbsolute(d.stateDir) || !path.isAbsolute(d.nodePath) || !/^[a-f0-9]{64}$/.test(d.nodeHash) || !d.installationId || d.panelToken === d.controlToken || !/^[a-f0-9]{64}$/.test(d.panelToken) || !/^[a-f0-9]{64}$/.test(d.controlToken)) fail('installation_descriptor');
  40:   const origin = JSON.parse(fs.readFileSync(path.join(d.installRoot, 'origin.json'), 'utf8'));
  41:   const anchor = JSON.parse(fs.readFileSync(path.join(d.stateDir, 'origin.json'), 'utf8'));
  42:   if (canonical(origin) !== canonical(anchor) || origin.installationId !== d.installationId || origin.machineId !== d.machineId) fail('installation_origin_mismatch');
  43:   if (verifyNode && (path.resolve(process.execPath).toLowerCase() !== path.resolve(d.nodePath).toLowerCase() || hash(fs.readFileSync(d.nodePath)) !== d.nodeHash || Number(process.versions.node.split('.')[0]) < 20)) fail('external_node_mismatch');
  44:   const manifest = JSON.parse(fs.readFileSync(path.join(d.releaseDir, 'release.json'), 'utf8'));
  45:   if (hash(manifest) !== d.packageHash) fail('installation_package_hash');
  46:   verifyRelease(d.releaseDir, manifest); return Object.freeze(d);
  47: }
  48: async function start({ descriptor, port = 3457, input = process.stdin, output = process.stdout } = {}) {
  49:   const installation = verifyInstallation(descriptor), root = installation.releaseDir;
  50:   if (fs.realpathSync(path.resolve(__dirname, '..')) !== fs.realpathSync(root)) fail('installation_entry_root_mismatch');
  51:   const installGate = path.join(installation.installRoot, 'install.lock');
  52:   const startupGate = fs.openSync(installGate, 'wx');
  53:   let broker, peer;
  54:   try {
  55:   if (canonical(verifyInstallation(descriptor)) !== canonical(installation)) fail('installation_changed_during_start');
  56:   const { Broker } = require('../core/broker.js');
  57:   const { serve } = require('../core/stdio.js');
  58:   const { exact, id } = require('../protocol/json.js');
  59:   const { createHttpPeer } = require('../integrations/cep/http-peer.js');
  60:   const { createWindowsReservationProvider } = require('./windows-reservation-provider.js');
  61:   const { createManualPolicy } = require('./manual-policy.js');
  62:   const profile = JSON.parse(fs.readFileSync(path.join(root, 'runtime/profiles.json'), 'utf8')).profiles.find(p => p.id === 'project-inspection');
  63:   if (!profile || profile.path !== 'modules/project-inspection' || profile.executionPolicy !== 'read-only-current-observation-v1') fail('inspection_profile_not_admitted');
  64:   const contract = JSON.parse(fs.readFileSync(path.join(root, profile.path, 'contract.json'), 'utf8'));
  65:   const admission = JSON.parse(fs.readFileSync(path.join(root, profile.path, 'artifact.json'), 'utf8'));
  66:   const source = fs.readFileSync(path.join(root, profile.path, 'executor.jsx'), 'utf8');
  67:   if (admission.executorHash !== hash(source) || admission.contractHash !== hash(contract) || admission.executionPolicy !== profile.executionPolicy) fail('inspection_admission');
  68:   const asset = { assetKey: 'project-inspection-v1', executorHash: admission.executorHash };
  69:   const manualPath = path.join(root, 'modules/titles-current-target');
  70:   const manualContract = JSON.parse(fs.readFileSync(path.join(manualPath, 'contract.json'), 'utf8'));
  71:   const manualManifest = JSON.parse(fs.readFileSync(path.join(manualPath, 'artifact.json'), 'utf8'));
  72:   const manualAdmission = JSON.parse(fs.readFileSync(path.join(root, 'config/admissions/titles-current-target.json'), 'utf8'));
  73:   const selectedManual = { pin: hash(manualManifest), contract: manualContract, admission: manualAdmission };
  74:   const provider = createWindowsReservationProvider({ installation, getBroker: () => broker, getPeer: () => peer });
  75:   const manual = createManualPolicy({ selected: selectedManual, provider, installation, getPeer: () => peer });
  76:   const transport = { identity: hash({ packageHash: installation.packageHash, manualAdmission }), connect: value => peer.transport.connect(value), send: value => peer.transport.send(value), completion: value => peer.transport.completion(value), disconnect: () => peer.transport.disconnect() };
  77:   broker = new Broker({ root, stateDir: path.join(installation.stateDir, 'broker'), transportTimeout: PRODUCTION_TIMING.callerTimeoutMs, privateEmbedding: { authority: manual.authority, executionPolicy: manual.port, transport } });
  78:   const admissionGuard = command => {
  79:     if (broker.closed) fail('broker_closed');
  80:     if (broker.stateLock.error) fail(broker.stateLock.error);
  81:     if (broker.ledger.corrupt) fail('ledger_corrupt');
  82:     if (broker.ledger.unresolved().some(c => c.commandId !== command?.commandId)) fail('controller_unresolved');
  83:   };
  84:   peer = createHttpPeer({ installation, directory: path.join(installation.stateDir, 'receiver'), asset, additionalAssets: [{ assetKey: 'titles-current-target-v1', moduleId: 'titles-current-target', operationId: manualContract.operationId, executorHash: manualAdmission.executorHash, resultProfile: 'manual-text-v1' }], timeout: PRODUCTION_TIMING.callbackTimeoutMs, port, admissionGuard });
  85:   const contractId = hash({ packageHash: installation.packageHash, admission, contract }); let closed = false;
  86:   const facade = Object.create(broker);
  87:   facade.status = () => ({ ...broker.status(), product: 'AE Agent Core 4.0.0', installation: { installationId: installation.installationId, packageHash: installation.packageHash, nodeVersion: process.versions.node, nodeVerified: true, machineId: installation.machineId }, physical: peer.status(), automaticLifecycle: 'unavailable', inspectionPolicy: profile.executionPolicy, manualPolicy: manual.policyId, resourceProvider: provider.status(), externalLegacyCoverage: 'unobserved' });
  88:   facade.diagnostics = () => ({ ...broker.diagnostics(), ...facade.status() });
  89:   facade.connect = async () => ({ ...await broker.connect(), automaticLifecycle: 'unavailable', physical: peer.status() });
  90:   facade.disconnect = async () => ({ disconnected: false, reason: 'physical_link_owned_by_stdio_lifetime', physical: peer.status() });
  91:   facade.listModules = value => { const result = broker.listModules(value); return { ...result, modules: [...result.modules, { id: profile.id, version: '4.0.0', executionPolicy: profile.executionPolicy }] }; };
  92:   facade.getContract = value => { if (value.moduleId !== profile.id) return broker.getContract(value); exact(value, ['moduleId']); return { contractId, moduleId: profile.id, operationId: contract.operationId, modulePin: hash(admission), contract: JSON.parse(canonical(contract)) }; };
  93:   facade.inspect = async value => {
  94:     if (value.contractId !== contractId) return broker.inspect(value);
  95:     exact(value, ['moduleId', 'contractId', 'target']);
  96:     if (value.moduleId !== profile.id) fail('contract_identity');
  97:     const result = await peer.inspect(value.target || {});
  98:     if (result.observation?.readFailureVersion === 1) fail(result.observation.code || 'inspection_failed');
  99:     return { evidenceRef: id('observation'), moduleId: profile.id, contractId, ...result, authority: false };
 100:   };
 101:   facade.build = value => { if (value.contractId === contractId || value.steps?.some(s => s.contractId === contractId)) fail('read_only_module_build_unsupported'); return broker.build(value); };
 102:   facade.close = async () => { if (closed) return; closed = true; await peer.close(); await broker.close(); };
 103:   try { await peer.listen(); } catch (e) { await facade.close(); throw e; }
 104:   serve(facade, input, output, { serverInfo: { name: 'ae-agent-core4', version: '4.0.0' } });
 105:   return { close: facade.close, status: facade.status };
```

## `core4/tools/install-core4.js`

Source lines 53-165:

```javascript
  53:   const timeout = timeouts.length ? timeouts[0] + (timeouts[0].endsWith('\n') ? '' : newline) : 'tool_timeout_sec = 120' + newline;
  54:   return text.slice(0, own.end) + (own.line.endsWith('\n') ? '' : newline) + preference + timeout + body + text.slice(following ? following.start : text.length);
  55: }
  56: function planInstall({ pkg, nodePath, installRoot, extensionsDir, configPath, machineId }) {
  57:   verifyPackage(pkg);
  58:   for (const value of [nodePath, installRoot, extensionsDir, configPath]) if (!path.isAbsolute(value)) fail('absolute_install_paths_required');
  59:   if (path.basename(installRoot).toLowerCase() !== 'aeagentcore4' || path.basename(path.join(extensionsDir, BUNDLE)) !== BUNDLE) fail('install_scope');
  60:   nodePath = path.resolve(nodePath);
  61:   const resolvedNode = fs.realpathSync(nodePath); if (resolvedNode !== nodePath) fail('node_path_not_exact');
  62:   const version = execFileSync(nodePath, ['--version'], { encoding: 'utf8', windowsHide: true, env: { SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR } }).trim();
  63:   if (!/^v(2\d|[3-9]\d)\./.test(version)) fail('node_20_required');
  64:   const releaseDir = path.join(installRoot, 'releases', pkg.packageHash), descriptor = path.join(installRoot, 'installation.json'), stateDir = path.join(installRoot, 'state', 'production'), cepDir = path.join(extensionsDir, BUNDLE);
  65:   const originBytes = bytes(path.join(installRoot, 'origin.json')), anchorBytes = bytes(path.join(stateDir, 'origin.json'));
  66:   if (!!originBytes !== !!anchorBytes || (originBytes && !originBytes.equals(anchorBytes))) fail('stable_state_origin_missing_or_mismatch');
  67:   if (!originBytes && (fs.existsSync(descriptor) || fs.existsSync(cepDir) || fs.existsSync(stateDir))) fail('existing_installation_without_origin');
  68:   const origin = originBytes ? JSON.parse(originBytes) : { version: 1, installationId: 'installation-' + crypto.randomUUID(), machineId: machineId || os.hostname(), createdAt: new Date().toISOString() };
  69:   if (origin.machineId !== (machineId || os.hostname())) fail('machine_origin_mismatch');
  70:   const previousDescriptor = bytes(descriptor), previousConfig = bytes(configPath), previousCep = snapshot(cepDir);
  71:   if (previousDescriptor) {
  72:     const old = JSON.parse(previousDescriptor); if (old.installationId !== origin.installationId || old.installRoot !== installRoot || old.stateDir !== stateDir) fail('installation_identity_mismatch');
  73:   }
  74:   // [REDACTED: installer generates new panel/control credential values; no values included]
  75:   const inspection = JSON.parse(Buffer.from(pkg.files['modules/project-inspection/artifact.json'], 'base64'));
  76:   const manualAdmission = JSON.parse(Buffer.from(pkg.files['config/admissions/titles-current-target.json'], 'base64'));
  77:   const cep = Object.fromEntries(Object.entries(pkg.files).filter(([f]) => f.startsWith('cep/')).map(([f, data]) => [f.slice(4), data]));
  78:   cep['installation.js'] = Buffer.from('window.Core4Installation=' + canonical({ installationId: d.installationId, packageHash: d.packageHash, panelToken: d.panelToken, executorHash: inspection.executorHash, assetKey: 'project-inspection-v1', assets: [{ assetKey: 'project-inspection-v1', executorHash: inspection.executorHash, phases: ['inspect'] }, { assetKey: 'titles-current-target-v1', executorHash: manualAdmission.executorHash, phases: ['inspect', 'mutate', 'verify'] }] }) + ';\n').toString('base64');
  79:   const nextConfig = configText(previousConfig, descriptor, nodePath, path.join(releaseDir, 'runtime/stdio-entry.js'));
  80:   return { pkg, origin, descriptor: d, descriptorPath: descriptor, configPath, nextConfig, cepDir, cep, previousDescriptor, previousConfig, previousCep, baseline: { config: previousConfig ? hash(previousConfig) : null, descriptor: previousDescriptor ? hash(previousDescriptor) : null, cep: treeHash(previousCep) } };
  81: }
  82: function assertBaseline(plan) { if ((bytes(plan.configPath) ? hash(bytes(plan.configPath)) : null) !== plan.baseline.config || (bytes(plan.descriptorPath) ? hash(bytes(plan.descriptorPath)) : null) !== plan.baseline.descriptor || treeHash(snapshot(plan.cepDir)) !== plan.baseline.cep) fail('install_baseline_changed'); }
  83: function assertRuntimeStopped(stateDir) {
  84:   for (const relative of ['broker/broker-owner.lock', 'broker/broker-owner.gate', 'receiver/owner']) if (fs.existsSync(path.join(stateDir, relative))) fail('runtime_state_owned_or_unknown');
  85: }
  86: function checkRelease(directory, release) {
  87:   const expectedFiles = new Set(['release.json']), expectedDirs = new Set(['']);
  88:   for (const relative of Object.keys(release.hashes)) {
  89:     if (!/^[A-Za-z0-9_./-]+$/.test(relative) || relative.split('/').some(p => !p || p === '.' || p === '..') || path.isAbsolute(relative) || relative === 'release.json') fail('immutable_release_mismatch');
  90:     expectedFiles.add(relative); for (let dir = path.posix.dirname(relative); dir !== '.'; dir = path.posix.dirname(dir)) expectedDirs.add(dir);
  91:   }
  92:   function visit(dir, rel) {
  93:     const stat = fs.lstatSync(dir); if (stat.isSymbolicLink() || !stat.isDirectory() || fs.realpathSync(dir) !== dir || !expectedDirs.delete(rel)) fail('immutable_release_mismatch');
  94:     for (const item of fs.readdirSync(dir)) {
  95:       const file = path.join(dir, item), relative = rel ? rel + '/' + item : item, stat = fs.lstatSync(file);
  96:       if (stat.isSymbolicLink() || fs.realpathSync(file) !== file) fail('immutable_release_mismatch');
  97:       if (stat.isDirectory()) visit(file, relative);
  98:       else if (!stat.isFile() || !expectedFiles.delete(relative)) fail('immutable_release_mismatch');
  99:       else if (relative === 'release.json' ? fs.readFileSync(file, 'utf8') !== canonical(release) : hash(fs.readFileSync(file)) !== release.hashes[relative]) fail('immutable_release_mismatch');
 100:     }
 101:   }
 102:   visit(path.resolve(directory), ''); if (expectedFiles.size || expectedDirs.size) fail('immutable_release_mismatch');
 103: }
 104: function applyInstall(plan) {
 105:   assertBaseline(plan);
 106:   const d = plan.descriptor; fs.mkdirSync(d.installRoot, { recursive: true });
 107:   const gate = path.join(d.installRoot, 'install.lock'); const fd = fs.openSync(gate, 'wx');
 108:   let txnFile, txn, switched = false;
 109:   try {
 110:     assertBaseline(plan);
 111:     assertRuntimeStopped(d.stateDir);
 112:     // State is stable across reinstall and rollback; no cleanup/reclaim is performed.
 113:     if (!fs.existsSync(path.join(d.installRoot, 'origin.json'))) {
 114:       durable(path.join(d.installRoot, 'origin.json'), canonical(plan.origin));
 115:       durable(path.join(d.stateDir, 'origin.json'), canonical(plan.origin));
 116:     }
 117:     if (!fs.existsSync(d.releaseDir)) {
 118:       const stage = path.join(d.installRoot, 'releases', '.stage-' + crypto.randomUUID());
 119:       for (const [relative, b64] of Object.entries(plan.pkg.files)) durable(path.join(stage, relative), Buffer.from(b64, 'base64'));
 120:       durable(path.join(stage, 'release.json'), canonical(plan.pkg.release)); checkRelease(stage, plan.pkg.release); fs.renameSync(stage, d.releaseDir);
 121:     }
 122:     checkRelease(d.releaseDir, plan.pkg.release);
 123:     const transactionId = crypto.randomUUID(); txnFile = path.join(d.installRoot, 'transactions', transactionId + '.json');
 124:     const backupCep = path.join(d.installRoot, 'transactions', transactionId + '-cep');
 125:     txn = { version: 1, transactionId, installRoot: d.installRoot, descriptorPath: plan.descriptorPath, configPath: plan.configPath, cepDir: plan.cepDir, backupCep, previousDescriptor: plan.previousDescriptor?.toString('base64') || null, previousConfig: plan.previousConfig?.toString('base64') || null, previousCepHash: treeHash(plan.previousCep), appliedDescriptorHash: hash(canonical(d)), appliedConfigHash: hash(plan.nextConfig), appliedCepHash: treeHash(plan.cep), stateDir: d.stateDir };
 126:     durable(txnFile, canonical(txn));
 127:     // Last CAS before any visible switch. Unknown filesystem outcomes are not retried.
 128:     assertBaseline(plan);
 129:     if (fs.existsSync(plan.cepDir)) fs.renameSync(plan.cepDir, backupCep);
 130:     switched = true;
 131:     restoreTree(plan.cepDir, plan.cep);
 132:     durable(plan.descriptorPath + '.next', canonical(d));
 133:     durable(plan.configPath + '.core4-next', plan.nextConfig);
 134:     fs.renameSync(plan.descriptorPath + '.next', plan.descriptorPath);
 135:     fs.renameSync(plan.configPath + '.core4-next', plan.configPath);
 136:     if (hash(bytes(plan.descriptorPath)) !== txn.appliedDescriptorHash || hash(bytes(plan.configPath)) !== txn.appliedConfigHash || treeHash(snapshot(plan.cepDir)) !== txn.appliedCepHash) fail('install_readback_mismatch');
 137:     return { installed: true, packageHash: d.packageHash, installationId: d.installationId, descriptorPath: plan.descriptorPath, transactionFile: txnFile, stateDir: d.stateDir, requiresPanelOpen: true, requiresMcpReconnect: true, liveProof: false };
 138:   } catch (e) { if (switched) e.transactionFile = txnFile; throw e; }
 139:   finally { fs.closeSync(fd); fs.unlinkSync(gate); }
 140: }
 141: function rollback(file) {
 142:   const t = JSON.parse(fs.readFileSync(file, 'utf8'));
 143:   if (t.version !== 1 || !path.isAbsolute(t.installRoot) || path.basename(t.installRoot).toLowerCase() !== 'aeagentcore4' || t.descriptorPath !== path.join(t.installRoot, 'installation.json') || t.backupCep !== path.join(t.installRoot, 'transactions', t.transactionId + '-cep') || path.basename(t.cepDir) !== BUNDLE || !path.resolve(file).startsWith(path.join(t.installRoot, 'transactions') + path.sep)) fail('rollback_scope');
 144:   if (hash(bytes(t.descriptorPath)) !== t.appliedDescriptorHash || hash(bytes(t.configPath)) !== t.appliedConfigHash || treeHash(snapshot(t.cepDir)) !== t.appliedCepHash) fail('rollback_baseline_changed');
 145:   const gate = path.join(t.installRoot, 'install.lock'), fd = fs.openSync(gate, 'wx');
 146:   try {
 147:     assertRuntimeStopped(t.stateDir);
 148:     if (t.previousCepHash !== treeHash(fs.existsSync(t.backupCep) ? snapshot(t.backupCep) : null)) fail('rollback_backup_mismatch');
 149:     // Move only the exact owned bundle. Keep recoverable applied files as evidence.
 150:     fs.renameSync(t.cepDir, path.join(t.installRoot, 'transactions', t.transactionId + '-applied-cep'));
 151:     if (fs.existsSync(t.backupCep)) fs.renameSync(t.backupCep, t.cepDir);
 152:     for (const [target, prior] of [[t.descriptorPath, t.previousDescriptor], [t.configPath, t.previousConfig]]) {
 153:       if (prior === null) fs.unlinkSync(target);
 154:       else { durable(target + '.rollback', Buffer.from(prior, 'base64')); fs.renameSync(target + '.rollback', target); }
 155:     }
 156:     return { rolledBack: true, transactionId: t.transactionId, statePreserved: true, liveProof: false };
 157:   } finally { fs.closeSync(fd); fs.unlinkSync(gate); }
 158: }
 159: function defaults(pkg, nodePath) { return { pkg, nodePath, installRoot: path.join(process.env.LOCALAPPDATA, 'AEAgentCore4'), extensionsDir: path.join(process.env.APPDATA, 'Adobe/CEP/extensions'), configPath: path.join(process.cwd(), '.codex/config.toml') }; }
 160: if (require.main === module) {
 161:   try {
 162:     const args = process.argv.slice(2), get = flag => args[args.indexOf(flag) + 1];
 163:     if (args[0] === 'rollback' && args.length === 2) console.log(canonical(rollback(path.resolve(args[1]))));
 164:     else {
 165:       const flags = args.slice(1).filter((_, index) => index % 2 === 0);
```

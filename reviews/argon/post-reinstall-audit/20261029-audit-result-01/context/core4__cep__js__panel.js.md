# core4/cep/js/panel.js

Commit: e6cde7c1f061763b6d0008162580039d2717aeb7
Full source SHA-256: 861a0c797276f1ec52f47b204f4f6a7c819ea432b9f93f223bf58e37f3a07ba7
Classification: INTERNAL; source code/documentation only.

## Source lines 1-57

```text
1: (function () {
2:   'use strict';
3:   var cfg = window.Core4Installation, api = window.Core4PollDispatcher, status = document.getElementById('status'), detail = document.getElementById('detail'), button = document.getElementById('connect');
4:   var peerId, epoch, sequence = 0, linked = false, running = false;
5:   function show(s) { status.textContent = s; }
6:   async function sign(value) { var key = await crypto.subtle.importKey('raw', new TextEncoder().encode(cfg.panelToken), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']); var bytes = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(api.canonical(value)))); return Array.from(bytes).map(function (b) { return ('0' + b.toString(16)).slice(-2); }).join(''); }
7:   async function post(path, value) {
8:     var response = await fetch('http://127.0.0.1:3457' + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: api.canonical(value), credentials: 'omit', cache: 'no-store' });
9:     var body = await response.json();
10:     if (!response.ok) {
11:       var error = new Error(body && body.error || 'http_' + response.status);
12:       error.linkDuplicatePeer = path === '/link' && response.status === 403 && body !== null && typeof body === 'object' && !Array.isArray(body) && Object.keys(body).length === 1 && body.error === 'duplicate_peer';
13:       throw error;
14:     }
15:     return body;
16:   }
17:   async function authenticated(path, payload) { var b = { epoch: epoch, peerId: peerId, sequence: ++sequence, method: 'POST', path: path, payload: payload }; var response = await post(path, { body: b, mac: await sign(b) }); if (response.mac !== await sign(response.body) || response.body.epoch !== epoch || response.body.peerId !== peerId || response.body.sequence !== b.sequence) throw new Error('response_auth'); return response.body.payload; }
18:   async function link() {
19:     var deadline = Date.now() + 50000, attempts = 0;
20:     while (true) {
21:       if (Date.now() >= deadline) throw new Error('duplicate_peer_wait_expired');
22:       attempts++;
23:       var challenge = await post('/challenge', { role: 'panel' });
24:       if (challenge.packageHash !== cfg.packageHash || challenge.installationId !== cfg.installationId || challenge.executorHash !== cfg.executorHash || challenge.role !== 'panel' || (challenge.origin !== 'null' && challenge.origin !== 'file://')) throw new Error('installation_binding');
25:       var proof = await sign({ challenge: challenge, peerId: peerId });
26:       if (Date.now() >= deadline) throw new Error('duplicate_peer_wait_expired');
27:       try { return { challenge: challenge, response: await post('/link', { challenge: challenge, peerId: peerId, proof: proof }) }; }
28:       catch (e) {
29:         // Only this exact handshake refusal permits another fresh challenge/proof.
30:         // Poll, completion and persisted UNKNOWN recovery never enter this loop.
31:         if (!e.linkDuplicatePeer) throw e;
32:         var remaining = deadline - Date.now();
33:         if (remaining <= 0) throw new Error('duplicate_peer_wait_expired');
34:         show('Ожидание завершения прежнего подключения Core 4.0.0');
35:         detail.textContent = 'Повтор подключения каждые 3 с, до 50 с. Состояние команд и UNKNOWN не меняется.';
36:         await new Promise(function (resolve) { setTimeout(resolve, Math.min(3000, remaining)); });
37:         if (Date.now() >= deadline || attempts >= 17) throw new Error('duplicate_peer_wait_expired');
38:       }
39:     }
40:   }
41:   async function start() {
42:     if (running) return; running = true; button.disabled = true;
43:     try {
44:       if (!cfg || !window.crypto || !crypto.subtle || typeof TextEncoder !== 'function' || typeof fetch !== 'function' || !window.__adobe_cep__ || typeof __adobe_cep__.evalScript !== 'function') throw new Error('CEP_WebCrypto_or_host_unavailable');
45:       var random = new Uint8Array(24); crypto.getRandomValues(random); peerId = 'panel-' + Array.from(random).map(function (b) { return b.toString(16); }).join('');
46:       var handshake = await link(), challenge = handshake.challenge, response = handshake.response;
47:       if (response.mac !== await sign(response.body) || response.body.peerId !== peerId || response.body.epoch !== challenge.epoch) throw new Error('link_auth');
48:       epoch = response.body.epoch; sequence = 0; linked = true;
49:       var dispatcher = api.createDispatcher({ installationId: cfg.installationId, assetKey: cfg.assetKey, assets: cfg.assets, pins: response.body.pins, storage: localStorage, csInterface: { evalScript: function (s, cb) { __adobe_cep__.evalScript(s, cb); } }, complete: function (p) { return authenticated('/complete', p); } });
50:       await dispatcher.recover(); if (response.body.laneClosed) throw new Error('receiver_lane_closed');
51:       show('Подключено к Core 4.0.0'); detail.textContent = 'Изменения текста требуют подтверждения в After Effects';
52:       while (linked) { var next = await authenticated('/poll', {}); if (next.command) await dispatcher.dispatch(next.command); }
53:     } catch (e) { linked = false; show('Остановлено: ' + e.message); detail.textContent = (e.message === 'duplicate_peer_wait_expired' ? 'Время ожидания подключения истекло. Для новой попытки нажмите «Подключить». ' : '') + 'UNKNOWN не повторяется. Проверяйте core_status; перезагрузка не снимает fence.'; }
54:     finally { running = false; button.disabled = false; }
55:   }
56:   button.addEventListener('click', start); start();
57: }());
```


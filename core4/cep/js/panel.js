(function () {
  'use strict';
  var cfg = window.Core4Installation, api = window.Core4PollDispatcher, status = document.getElementById('status'), detail = document.getElementById('detail'), button = document.getElementById('connect');
  var peerId, epoch, sequence = 0, linked = false, running = false;
  function show(s) { status.textContent = s; }
  async function sign(value) { var key = await crypto.subtle.importKey('raw', new TextEncoder().encode(cfg.panelToken), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']); var bytes = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(api.canonical(value)))); return Array.from(bytes).map(function (b) { return ('0' + b.toString(16)).slice(-2); }).join(''); }
  async function post(path, value) { var response = await fetch('http://127.0.0.1:3457' + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: api.canonical(value), credentials: 'omit', cache: 'no-store' }); var body = await response.json(); if (!response.ok) throw new Error(body.error || 'http_' + response.status); return body; }
  async function authenticated(path, payload) { var b = { epoch: epoch, peerId: peerId, sequence: ++sequence, method: 'POST', path: path, payload: payload }; var response = await post(path, { body: b, mac: await sign(b) }); if (response.mac !== await sign(response.body) || response.body.epoch !== epoch || response.body.peerId !== peerId || response.body.sequence !== b.sequence) throw new Error('response_auth'); return response.body.payload; }
  async function start() {
    if (running) return; running = true; button.disabled = true;
    try {
      if (!cfg || !window.crypto || !crypto.subtle || typeof TextEncoder !== 'function' || typeof fetch !== 'function' || !window.__adobe_cep__ || typeof __adobe_cep__.evalScript !== 'function') throw new Error('CEP_WebCrypto_or_host_unavailable');
      var random = new Uint8Array(24); crypto.getRandomValues(random); peerId = 'panel-' + Array.from(random).map(function (b) { return b.toString(16); }).join('');
      var challenge = await post('/challenge', { role: 'panel' });
      if (challenge.packageHash !== cfg.packageHash || challenge.installationId !== cfg.installationId || challenge.executorHash !== cfg.executorHash || challenge.role !== 'panel') throw new Error('installation_binding');
      var response = await post('/link', { challenge: challenge, peerId: peerId, proof: await sign({ challenge: challenge, peerId: peerId }) });
      if (response.mac !== await sign(response.body) || response.body.peerId !== peerId || response.body.epoch !== challenge.epoch) throw new Error('link_auth');
      epoch = response.body.epoch; sequence = 0; linked = true;
      var dispatcher = api.createDispatcher({ installationId: cfg.installationId, assetKey: cfg.assetKey, assets: cfg.assets, pins: response.body.pins, storage: localStorage, csInterface: { evalScript: function (s, cb) { __adobe_cep__.evalScript(s, cb); } }, complete: function (p) { return authenticated('/complete', p); } });
      await dispatcher.recover(); if (response.body.laneClosed) throw new Error('receiver_lane_closed');
      show('Подключено к Core 4.0.0'); detail.textContent = 'Изменения текста требуют подтверждения в After Effects';
      while (linked) { var next = await authenticated('/poll', {}); if (next.command) await dispatcher.dispatch(next.command); }
    } catch (e) { linked = false; show('Остановлено: ' + e.message); detail.textContent = 'UNKNOWN не повторяется. Проверяйте core_status; перезагрузка не снимает fence.'; }
    finally { running = false; button.disabled = false; }
  }
  button.addEventListener('click', start); start();
}());

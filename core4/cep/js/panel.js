(function () {
  'use strict';
  var cfg = window.Core4Installation, api = window.Core4PollDispatcher, status = document.getElementById('status'), detail = document.getElementById('detail'), button = document.getElementById('connect');
  var peerId, epoch, sequence = 0, running = false, disposed = false, generation = 0, activeRequest, retryTimer, cancelWait;
  function show(state, text) { if (status.dataset) status.dataset.state = state; status.textContent = text; }
  function error(code, transport) { var e = new Error(code); e.transportUnavailable = transport === true; return e; }
  function current(g) { if (disposed || g !== generation) throw error('stale_channel'); }
  function object(value, keys) { return value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === keys.length && keys.every(function (k) { return Object.prototype.hasOwnProperty.call(value, k); }); }
  function latched() { return localStorage.getItem('aeagentcore4-physical-' + cfg.installationId) !== null; }
  function newChannel() {
    generation++; var random = new Uint8Array(24); crypto.getRandomValues(random);
    peerId = 'panel-' + Array.from(random).map(function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
    epoch = undefined; sequence = 0;
  }
  async function sign(value) { var key = await crypto.subtle.importKey('raw', new TextEncoder().encode(cfg.panelToken), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']); var bytes = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(api.canonical(value)))); return Array.from(bytes).map(function (b) { return ('0' + b.toString(16)).slice(-2); }).join(''); }
  async function post(path, value, g, deadline) {
    current(g);
    var controller = new AbortController(), timedOut = false, received = false, refusalStatus = null, timer;
    activeRequest = controller;
    var ms = Math.min(path === '/poll' ? 20000 : 10000, deadline === undefined ? 20000 : Math.max(1, deadline - Date.now()));
    try {
      var timeout = new Promise(function (resolve, reject) { timer = setTimeout(function requestTimedOut() { timedOut = true; controller.abort(); reject(error('transport_timeout', true)); }, ms); });
      var request = fetch('http://127.0.0.1:3457' + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: api.canonical(value), credentials: 'omit', cache: 'no-store', signal: controller.signal }).then(async function (response) { received = true; if (!response.ok) refusalStatus = response.status; return { response: response, body: await response.json() }; });
      var result = await Promise.race([request, timeout]); current(g);
      if (!result.response.ok) {
        var e = error(result.body && result.body.error || 'http_' + result.response.status);
        e.linkDuplicatePeer = path === '/link' && result.response.status === 403 && object(result.body, ['error']) && result.body.error === 'duplicate_peer';
        throw e;
      }
      return result.body;
    } catch (e) {
      current(g);
      if (timedOut && refusalStatus !== null) throw error('http_' + refusalStatus + '_body_timeout');
      if (timedOut || !received && e && e.name === 'TypeError') throw error(timedOut ? 'transport_timeout' : 'transport_unavailable', true);
      throw e;
    } finally { clearTimeout(timer); if (activeRequest === controller) activeRequest = null; }
  }
  async function authenticated(path, payload, g) {
    current(g); var b = { epoch: epoch, peerId: peerId, sequence: ++sequence, method: 'POST', path: path, payload: payload }, proof = await sign(b); current(g);
    var response = await post(path, { body: b, mac: proof }, g);
    if (!object(response, ['body', 'mac']) || !object(response.body, ['epoch', 'peerId', 'sequence', 'payload']) || response.mac !== await sign(response.body) || response.body.epoch !== b.epoch || response.body.peerId !== b.peerId || response.body.sequence !== b.sequence) throw error('response_auth');
    current(g); return response.body.payload;
  }
  async function waitRetry(budget, duplicate) {
    var remaining = budget.deadline - Date.now(); budget.reason = duplicate ? 'duplicate_peer_wait_expired' : 'runtime_wait_expired';
    if (remaining <= 0) throw error(budget.reason);
    show('waiting', duplicate ? 'Ожидание завершения прежнего подключения Core 4.0.0' : 'Ожидание Core 4.0.0');
    detail.textContent = 'Повтор подключения каждые 3 с, до 50 с. Состояние команд и UNKNOWN не меняется.';
    var g = generation;
    await new Promise(function (resolve, reject) { cancelWait = function () { reject(error('stale_channel')); }; retryTimer = setTimeout(resolve, Math.min(3000, remaining)); });
    retryTimer = null; cancelWait = null; current(g);
    if (Date.now() >= budget.deadline || budget.attempts >= 17) throw error(budget.reason);
  }
  async function link(budget) {
    while (true) {
      if (Date.now() >= budget.deadline || budget.attempts >= 17) throw error(budget.reason || 'runtime_wait_expired');
      budget.attempts++; var g = generation;
      try {
        var challenge = await post('/challenge', { role: 'panel' }, g, budget.deadline);
        if (!object(challenge, ['nonce', 'epoch', 'controllerId', 'role', 'origin', 'packageHash', 'executorHash', 'installationId']) || typeof challenge.nonce !== 'string' || typeof challenge.epoch !== 'string' || typeof challenge.controllerId !== 'string' || challenge.packageHash !== cfg.packageHash || challenge.installationId !== cfg.installationId || challenge.executorHash !== cfg.executorHash || challenge.role !== 'panel' || (challenge.origin !== 'null' && challenge.origin !== 'file://')) throw error('installation_binding');
        var proof = await sign({ challenge: challenge, peerId: peerId }); current(g);
        if (Date.now() >= budget.deadline) throw error(budget.reason || 'duplicate_peer_wait_expired');
        var response = await post('/link', { challenge: challenge, peerId: peerId, proof: proof }, g, budget.deadline);
        if (Date.now() >= budget.deadline) throw error(budget.reason || 'duplicate_peer_wait_expired');
        return { challenge: challenge, response: response, generation: g };
      } catch (e) {
        if (!e.linkDuplicatePeer && !(e.transportUnavailable && !latched())) throw e;
        await waitRetry(budget, e.linkDuplicatePeer);
        if (e.transportUnavailable) newChannel();
      }
    }
  }
  async function start() {
    if (running || disposed) return; running = true; button.disabled = true;
    var delivered = false;
    try {
      if (!cfg || !api || !window.crypto || !crypto.subtle || typeof TextEncoder !== 'function' || typeof fetch !== 'function' || typeof AbortController !== 'function' || !window.__adobe_cep__ || typeof __adobe_cep__.evalScript !== 'function') throw error('CEP_WebCrypto_or_host_unavailable');
      newChannel(); var budget = { deadline: Date.now() + 50000, attempts: 0 };
      while (!disposed) {
        var handshake = await link(budget), response = handshake.response, g = handshake.generation;
        if (!object(response, ['body', 'mac']) || !object(response.body, ['linked', 'epoch', 'peerId', 'controllerId', 'pins', 'receiverStoreIdentity', 'laneClosed']) || response.mac !== await sign(response.body) || response.body.linked !== true || response.body.peerId !== peerId || response.body.epoch !== handshake.challenge.epoch || response.body.controllerId !== handshake.challenge.controllerId || api.canonical(response.body.pins) !== api.canonical({ installationId: cfg.installationId, packageHash: cfg.packageHash, executorHash: cfg.executorHash }) || typeof response.body.receiverStoreIdentity !== 'string' || typeof response.body.laneClosed !== 'boolean') throw error('link_auth');
        current(g); epoch = response.body.epoch; sequence = 0; show('connected', 'Подключено к Core 4.0.0');
        var dispatcher = api.createDispatcher({ installationId: cfg.installationId, assetKey: cfg.assetKey, assets: cfg.assets, pins: response.body.pins, storage: localStorage, csInterface: { evalScript: function (s, cb) { __adobe_cep__.evalScript(s, cb); } }, complete: (function (channel) { return function (p) { return authenticated('/complete', p, channel); }; }(g)) });
        await dispatcher.recover(); current(g); if (latched()) throw error('physical_latch_present'); if (response.body.laneClosed) throw error('receiver_lane_closed');
        show('ready', 'Канал Core 4.0.0 готов к командам'); detail.textContent = 'Изменения текста требуют подтверждения в After Effects';
        while (true) {
          if (latched()) throw error('physical_latch_present');
          var next;
          try { next = await authenticated('/poll', {}, g); }
          catch (e) {
            // A lost poll may already be delivered on the server. Only a NEW
            // handshake may reconnect; server duplicate/lane/UNKNOWN fences stay.
            if (!e.transportUnavailable || latched()) throw e;
            await waitRetry(budget, false); newChannel(); break;
          }
          current(g); if (!object(next, ['command']) || next.command !== null && (typeof next.command !== 'object' || Array.isArray(next.command))) throw error('poll_frame');
          budget = { deadline: Date.now() + 50000, attempts: 0 };
          if (next.command) {
            if (latched()) throw error('physical_latch_present');
            delivered = true; show('busy', 'After Effects: выполняется команда'); detail.textContent = 'Ожидание ответа After Effects и подтверждения результата.';
            // No reconnect/poll timer spans evalScript or native confirmation.
            await dispatcher.dispatch(next.command); current(g); delivered = false;
            if (latched()) throw error('physical_latch_present');
            budget = { deadline: Date.now() + 50000, attempts: 0 };
            show('ready', 'Канал Core 4.0.0 готов к командам'); detail.textContent = 'Изменения текста требуют подтверждения в After Effects';
          }
        }
      }
    } catch (e) {
      if (!disposed) {
        var recovery = delivered || e.message === 'receiver_lane_closed' || e.message === 'owner_recovery_required';
        try { recovery = recovery || latched(); } catch (ignored) { recovery = true; }
        show(recovery ? 'recovery' : 'stopped', (recovery ? 'Требуется восстановление: ' : 'Остановлено: ') + e.message);
        detail.textContent = (/wait_expired$/.test(e.message) ? 'Время ожидания подключения истекло. Для новой попытки нажмите «Подключить». ' : '') + 'UNKNOWN не повторяется. Проверяйте core_status; перезагрузка не снимает fence.';
      }
    } finally { running = false; if (!disposed) button.disabled = false; }
  }
  if (typeof window.addEventListener === 'function') window.addEventListener('unload', function () { disposed = true; generation++; if (activeRequest) activeRequest.abort(); if (retryTimer) clearTimeout(retryTimer); if (cancelWait) cancelWait(); });
  button.addEventListener('click', start); start();
}());

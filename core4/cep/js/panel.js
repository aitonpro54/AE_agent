(function () {
  'use strict';
  var loadedPanelIdentity = {"protocolVersion":1,"productVersion":"4.2.6","panelBuildId":"0000000000000000000000000000000000000000000000000000000000000000","extensionId":"com.codex.aeagentcore4.panel","registryBuildId":"0000000000000000000000000000000000000000000000000000000000000000"}; // CORE4_LOADED_IDENTITY
  var cfg = window.Core4Installation && JSON.parse(JSON.stringify(window.Core4Installation)), api = window.Core4PollDispatcher, status = document.getElementById('status'), detail = document.getElementById('detail'), button = document.getElementById('connect'), resetButton = document.getElementById('start-over');
  var delivered = false, wirePending = 0, resetWatching = 0, reloadFlight = false, configHashPromise = null, verifiedResetProof = null, channelBinding = null, reconnectBinding = null;
  var markerTimer, markerGeneration = 0, reconnectNewBoot = false;
  var peerId, epoch, sequence = 0, running = false, disposed = false, generation = 0, activeRequest, retryTimer, cancelWait;
  var workSessionId = null, resetGeneration = 0, resetControllers = [], resetTimer, cancelResetWait, resetPosting = false, resetRequested = false, resetState = null, resetUncertain = null, resumeRequested = false;
  function show(state, text) { if (status.dataset) status.dataset.state = state; status.textContent = text; }
  function error(code, transport) { var e = new Error(code); e.transportUnavailable = transport === true; return e; }
  function current(g) { if (disposed || g !== generation) throw error('stale_channel'); }
  function object(value, keys) { return value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === keys.length && keys.every(function (k) { return Object.prototype.hasOwnProperty.call(value, k); }); }
  function latched() { return api.nativePending() || localStorage.getItem(api.storageKey(cfg.installationId, workSessionId)) !== null || cfg.registryVerification === 1 && localStorage.getItem(api.registryKey(cfg.installationId)) !== null; }
  function resetCurrent(g) { if (disposed || g !== resetGeneration) throw error('stale_reset'); }
  function validReset(value) {
    var uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
    return object(value, ['id', 'sessionId', 'ownerBootId', 'phase', 'requiresAEExit', 'resetComplete', 'baselineRequired', 'fault', 'eligibility', 'aeAuthority']) && (value.id === null || typeof value.id === 'string' && uuid.test(value.id)) && (value.sessionId === null || typeof value.sessionId === 'string' && uuid.test(value.sessionId)) && typeof value.ownerBootId === 'string' && uuid.test(value.ownerBootId) && ['ready', 'stopping', 'awaiting-core', 'awaiting-ae', 'finishing', 'baseline-required', 'blocked'].indexOf(value.phase) >= 0 && ['requiresAEExit', 'resetComplete', 'baselineRequired'].every(function (k) { return typeof value[k] === 'boolean'; }) && (value.fault === null || typeof value.fault === 'string' && /^[a-z][a-z0-9_]{0,99}$/.test(value.fault)) && object(value.eligibility, ['action', 'reason']) && ['request', 'continue', 'none'].indexOf(value.eligibility.action) >= 0 && typeof value.eligibility.reason === 'string' && /^[a-z][a-z0-9_]{0,99}$/.test(value.eligibility.reason) && value.aeAuthority === false;
  }
  function sessionAvailable(value) { return value.phase === 'ready' || value.phase === 'baseline-required'; }
  function resetBinding(value) { return { ownerBootId: value.ownerBootId, id: value.id, sessionId: value.sessionId, action: value.eligibility.action, reason: value.eligibility.reason }; }
  function updateResetButton() {
    if (!resetButton || disposed) return;
    var action = resetState && resetState.eligibility.action;
    resetButton.textContent = action === 'continue' ? 'Продолжить сброс' : 'Начать заново';
    resetButton.title = resetUncertain ? 'start_over_request_unconfirmed' : resetState ? resetState.eligibility.reason : '';
    resetButton.disabled = resetPosting || !!resetUncertain || !action || action === 'none';
  }
  function showReset(value) {
    resetState = value;
    if (resetUncertain && value.id && value.id !== resetUncertain.id) resetUncertain = null;
    updateResetButton();
    if (value.phase === 'blocked') { show('recovery', 'Сброс требует проверки'); detail.textContent = 'Старая история сохранена. Причина: ' + value.eligibility.reason + '. Проверьте core_diagnostics; команды не повторяются.'; }
    else if (value.phase === 'awaiting-ae') { show('recovery', 'Для завершения сброса нужно закрыть прежний After Effects'); detail.textContent = 'Сохраните проекты и закройте прежние экземпляры After Effects. Сброс продолжится автоматически; старые UNKNOWN останутся в истории.'; }
    else if (!sessionAvailable(value)) { show('waiting', value.phase === 'finishing' ? 'Подготовка нового сеанса' : 'Завершение прежней работы'); detail.textContent = 'Старая история сохраняется. Ожидайте завершения сброса; команды не повторяются.'; }
  }
  function showReady() {
    var baseline = resetState && resetState.baselineRequired;
    show('ready', baseline ? 'Новый сеанс: требуется чтение проекта' : 'Канал Core 4.2.6 готов к командам');
    detail.textContent = baseline ? 'Сначала Core должен прочитать текущее состояние проекта. Допуск к изменениям выдаётся отдельно.' : 'Подключение готово. Допуск к изменению проекта выдаётся отдельно.';
  }
  async function resetPost(path, value, g) {
    resetCurrent(g); var controller = new AbortController(), received = false, refused = null, timedOut = false, timer;
    resetControllers.push(controller);
    try {
      var timeout = new Promise(function (resolve, reject) { timer = setTimeout(function resetRequestTimedOut() { timedOut = true; controller.abort(); reject(error('transport_timeout', true)); }, 10000); });
      wirePending++;
      var request = fetch('http://127.0.0.1:3457' + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: api.canonical(value), credentials: 'omit', cache: 'no-store', signal: controller.signal }).then(async function (r) { received = true; if (!r.ok) refused = r.status; return { response: r, value: await r.json() }; }).then(function (v) { wirePending--; return v; }, function (e) { wirePending--; throw e; });
      var result = await Promise.race([request, timeout]); resetCurrent(g);
      if (!result.response.ok) throw error(result.value && result.value.error || 'http_' + result.response.status);
      return result.value;
    } catch (e) { resetCurrent(g); if (timedOut && refused !== null) throw error('http_' + refused + '_body_timeout'); if (timedOut || !received && e && e.name === 'TypeError') throw error(timedOut ? 'transport_timeout' : 'transport_unavailable', true); throw e; }
    finally { clearTimeout(timer); var at = resetControllers.indexOf(controller); if (at >= 0) resetControllers.splice(at, 1); }
  }
  async function resetRpc(action, g, expected, guard) {
    function check() { resetCurrent(g); if (guard) guard(); }
    check();
    var input = { action: action }, keys = ['version', 'purpose', 'role', 'action', 'nonce', 'epoch', 'origin', 'installationId', 'packageHash'];
    if (expected) { input.expected = expected; keys.push('expected'); }
    var reply = await resetPost('/start-over/challenge', input, g), c = reply.challenge; check();
    if (!object(reply, ['challenge']) || !object(c, keys) || c.version !== 1 || c.purpose !== 'start-over' || c.role !== 'panel' || c.action !== action || typeof c.nonce !== 'string' || !/^[a-f0-9]{64}$/.test(c.nonce) || typeof c.epoch !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(c.epoch) || ['null', 'file://'].indexOf(c.origin) < 0 || expected && api.canonical(c.expected) !== api.canonical(expected)) throw error('start_over_challenge_auth');
    if (c.installationId !== cfg.installationId || c.packageHash !== cfg.packageHash) throw error('start_over_binding_changed');
    var proof = await sign({ domain: 'ae-core4/panel-start-over/v1', kind: 'request', challenge: c }); check();
    var response = await resetPost('/start-over/' + action, { challenge: c, proof: proof }, g), body = response.body;
    check();
    if (!object(response, ['body', 'mac']) || !object(body, ['version', 'purpose', 'action', 'epoch', 'nonce', 'origin', 'installationId', 'packageHash', 'status']) || body.version !== 1 || body.purpose !== 'start-over' || body.action !== action || body.epoch !== c.epoch || body.nonce !== c.nonce || body.origin !== c.origin || body.installationId !== c.installationId || body.packageHash !== c.packageHash || !validReset(body.status)) throw error('start_over_response_auth');
    var responseMac = await sign({ domain: 'ae-core4/panel-start-over/v1', kind: 'response', body: body }); check();
    if (response.mac !== responseMac) throw error('start_over_response_auth');
    resetCurrent(g); if (action === 'status') verifiedResetProof = { envelope: { challenge: c, response: response }, observedAt: Date.now(), generation: g }; return body.status;
  }
  async function resetWait(ms, g) {
    var timer, cancel;
    try { await new Promise(function (resolve, reject) { cancel = function () { reject(error('stale_reset')); }; cancelResetWait = cancel; timer = setTimeout(resolve, ms); resetTimer = timer; }); }
    finally { clearTimeout(timer); if (resetTimer === timer) resetTimer = null; if (cancelResetWait === cancel) cancelResetWait = null; }
    resetCurrent(g);
  }
  async function watchReset(initial, g, unconfirmedId) {
    resetWatching++; try {
    var value = initial, deadline = Date.now() + 50000;
    while (!disposed) {
      resetCurrent(g);
      if (!value) {
        try { value = await resetRpc('status', g); }
        catch (e) {
          if (e.message === 'stale_reset') throw e;
          if (await changedMarker()) throw error('installation_config_changed');
          resetState = null; updateResetButton();
          if (resetButton) resetButton.title = e.transportUnavailable ? 'start_over_owner_not_ready' : e.message;
          if (!e.transportUnavailable) throw e;
          show('waiting', 'Ожидание Core для проверки сеанса'); detail.textContent = 'Проверка состояния возобновится автоматически. Запрос сброса не повторяется.'; await resetWait(Date.now() >= deadline ? 15000 : 3000, g); continue;
        }
      }
      showReset(value);
      if (sessionAvailable(value)) {
        if (unconfirmedId !== undefined && value.id === unconfirmedId) throw error('start_over_request_unconfirmed');
        workSessionId = value.sessionId; resetRequested = false; return true;
      }
      resetRequested = true;
      if (value.phase === 'blocked') return false;
      await resetWait(3000, g); value = null;
    }
    throw error('stale_reset');
    } finally { resetWatching--; }
  }
  function cancelMarkerWatch() { markerGeneration++; if (markerTimer) clearTimeout(markerTimer); markerTimer = null; }
  function interruptMain() { cancelMarkerWatch(); generation++; if (activeRequest) activeRequest.abort(); if (retryTimer) clearTimeout(retryTimer); if (cancelWait) cancelWait(); }
  function interruptReset() { resetGeneration++; resetControllers.slice().forEach(function (c) { c.abort(); }); if (resetTimer) clearTimeout(resetTimer); if (cancelResetWait) cancelResetWait(); }
  async function beginReset() {
    if (disposed || resetPosting || resetUncertain || !resetState || resetState.eligibility.action === 'none') return;
    var expected = resetBinding(resetState), g = resetGeneration, value, uncertain = false;
    resetPosting = true; updateResetButton();
    try {
      var observed = await resetRpc('status', g);
      showReset(observed);
      if (api.canonical(resetBinding(observed)) !== api.canonical(expected)) return;
      if (expected.action === 'request' && !window.confirm('Прекратить прежнюю работу и начать новый сеанс? UNKNOWN сохранятся в истории, внесённые изменения не откатываются. Может потребоваться сохранить проекты и закрыть After Effects.')) return;
      resetRequested = true; interruptReset(); interruptMain(); g = resetGeneration;
      show('waiting', expected.action === 'continue' ? 'Продолжение прежнего сброса' : 'Запрос нового сеанса');
      try { value = await resetRpc('request', g, expected); }
      catch (e) { if (!e.transportUnavailable) throw e; uncertain = true; if (expected.action === 'request') resetUncertain = expected; }
      var ready = await watchReset(value, g, uncertain && expected.action === 'request' ? expected.id : undefined);
      if (ready) { if (running) resumeRequested = true; else start(); }
    } catch (e) { if (!disposed && e.message !== 'stale_reset') { show('recovery', 'Сброс не завершён: ' + e.message); detail.textContent = 'Автоматической повторной отправки нет. Проверьте core_status и core_diagnostics; история и UNKNOWN сохраняются.'; } }
    finally { resetPosting = false; updateResetButton(); }
  }
  function newChannel() {
    cancelMarkerWatch(); generation++; var random = new Uint8Array(24); crypto.getRandomValues(random);
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
      wirePending++;
      var request = fetch('http://127.0.0.1:3457' + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: api.canonical(value), credentials: 'omit', cache: 'no-store', signal: controller.signal }).then(async function (response) { received = true; if (!response.ok) refusalStatus = response.status; return { response: response, body: await response.json() }; }).then(function (v) { wirePending--; return v; }, function (e) { wirePending--; throw e; });
      var result = await Promise.race([request, timeout]); current(g);
      if (!result.response.ok) {
        var e = error(result.body && result.body.error || 'http_' + result.response.status);
        e.linkDuplicatePeer = path === '/link' && result.response.status === 403 && object(result.body, ['error']) && result.body.error === 'duplicate_peer';
        e.pollPeerRejected = path === '/poll' && result.response.status === 403 && object(result.body, ['error']) && result.body.error === 'peer_auth_or_replay';
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
    if (duplicate && remaining <= 0) throw error(budget.reason);
    var background = !duplicate && (remaining <= 0 || budget.background === true);
    if (!duplicate && latched()) throw error('physical_latch_present');
    show('waiting', duplicate ? 'Ожидание завершения прежнего подключения Core 4.2.6' : background ? 'Core пока недоступен; подключение возобновится автоматически' : 'Ожидание Core 4.2.6');
    detail.textContent = background ? 'Следующая попытка через 15 с. Оставьте панель открытой и запустите Core через MCP. Состояние команд и UNKNOWN не меняется.' : 'Повтор подключения каждые 3 с, до 50 с. Состояние команд и UNKNOWN не меняется.';
    var g = generation;
    await new Promise(function (resolve, reject) { cancelWait = function () { reject(error('stale_channel')); }; retryTimer = setTimeout(resolve, background ? 15000 : Math.min(3000, remaining)); });
    retryTimer = null; cancelWait = null; current(g);
    if (!duplicate && latched()) throw error('physical_latch_present');
    if (background) { budget.deadline = Date.now() + 50000; budget.attempts = 0; budget.background = false; }
    else if (Date.now() >= budget.deadline || budget.attempts >= 17) {
      if (duplicate) throw error(budget.reason);
      budget.background = true;
      await waitRetry(budget, false);
    }
  }
  function extensionRoot() {
    if (!window.__adobe_cep__ || typeof __adobe_cep__.getSystemPath !== 'function' || typeof __adobe_cep__.getExtensionId !== 'function' || __adobe_cep__.getExtensionId() !== loadedPanelIdentity.extensionId) throw error('extension_path_unavailable');
    var root = decodeURI(__adobe_cep__.getSystemPath('extension')).replace(/^file:\/\/\//, '').replace(/\\/g, '/').replace(/\/$/, '');
    if (!/^(?:[A-Za-z]:\/|\/)/.test(root) || /[\x00-\x1f]/.test(root) || /(?:^|\/)\.\.(?:\/|$)/.test(root) || root.length > 4096) throw error('extension_path_unavailable');
    return root;
  }
  async function digestRaw(value) { var bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)); return Array.from(new Uint8Array(bytes)).map(function (b) { return ('0' + b.toString(16)).slice(-2); }).join(''); }
  async function verifyRetirementProof(proof) {
    if (!verifiedResetProof || proof !== verifiedResetProof.envelope || verifiedResetProof.generation !== resetGeneration || Date.now() - verifiedResetProof.observedAt > 5000 || resetWatching || resetPosting || resetRequested || resetUncertain || activeRequest || wirePending) return false;
    var c = proof.challenge, response = proof.response, body = response.body;
    if (!object(c, ['version', 'purpose', 'role', 'action', 'nonce', 'epoch', 'origin', 'installationId', 'packageHash']) || c.version !== 1 || c.purpose !== 'start-over' || c.role !== 'panel' || c.action !== 'status' || c.installationId !== cfg.installationId || c.packageHash !== cfg.packageHash || !object(body, ['version', 'purpose', 'action', 'epoch', 'nonce', 'origin', 'installationId', 'packageHash', 'status']) || body.version !== 1 || body.purpose !== c.purpose || body.action !== c.action || body.epoch !== c.epoch || body.nonce !== c.nonce || body.origin !== c.origin || body.installationId !== cfg.installationId || body.packageHash !== cfg.packageHash || !validReset(body.status)) return false;
    return response.mac === await sign({ domain: 'ae-core4/panel-start-over/v1', kind: 'response', body: body });
  }
  function configHash() {
    if (!configHashPromise) configHashPromise = crypto.subtle.digest('SHA-256', new TextEncoder().encode(api.canonical(cfg))).then(function (bytes) { return Array.from(new Uint8Array(bytes)).map(function (b) { return ('0' + b.toString(16)).slice(-2); }).join(''); });
    return configHashPromise;
  }
  async function changedMarker() {
    try {
      if (cfg.registryVerification !== 1 || !window.cep || !cep.fs || typeof cep.fs.readFile !== 'function') return null;
      var result = cep.fs.readFile(extensionRoot() + '/installation-state.json', 'UTF-8');
      if (!result || result.err !== 0 || typeof result.data !== 'string' || result.data.length > 4096) return null;
      var value = JSON.parse(result.data);
      if (!object(value, ['version', 'installationId', 'packageHash', 'panelConfigHash']) || value.version !== 1 || value.installationId !== cfg.installationId || !/^[a-f0-9]{64}$/.test(value.packageHash) || !/^[a-f0-9]{64}$/.test(value.panelConfigHash)) return null;
      return value.panelConfigHash !== await configHash() ? value : null;
    } catch (ignored) { return null; }
  }
  function retiredSessions() { return !!(cfg.startOverSupported === true && resetState && validReset(resetState) && resetState.id !== null && typeof workSessionId === 'string' && resetState.sessionId === workSessionId && resetState.resetComplete === true && sessionAvailable(resetState) && resetState.requiresAEExit === false && resetState.fault === null); }
  function reloadIdle(admitSavedResult) {
    var admission = admitSavedResult === true ? { packageHash: cfg.packageHash, executorHashes: (cfg.assets || [{ executorHash: cfg.executorHash }]).map(function (asset) { return asset.executorHash; }), explicitNullSession: !!(cfg.startOverSupported === true && resetState && validReset(resetState) && resetState.sessionId === null && workSessionId === null && resetState.id === null && resetState.resetComplete === false && sessionAvailable(resetState) && resetState.requiresAEExit === false && resetState.fault === null) } : null;
    return !disposed && !delivered && !resetPosting && !resetRequested && !resetUncertain && !resetWatching && !resetControllers.length && !activeRequest && !wirePending && api.reloadIdle(localStorage, cfg.installationId, workSessionId, retiredSessions(), admission);
  }
  function reloadCause(cause) { return cause && (cause.transportUnavailable || ['installation_config_changed', 'installation_binding', 'start_over_binding_changed', 'peer_auth', 'peer_auth_or_replay', 'panel_identity_mismatch', 'link_auth', 'start_over_challenge_auth', 'start_over_response_auth'].indexOf(cause.message) >= 0); }
  function watchMarker(cause) {
    if (cfg.registryVerification !== 1 || !reloadCause(cause) || !reloadIdle()) return;
    cancelMarkerWatch(); var token = markerGeneration, g = generation, attempts = 0;
    // Only the fixed local marker is watched after a terminal stop. No refused
    // HTTP request is retried: 3 s for 17 observations, then 15 s while idle.
    function valid() { return token === markerGeneration && g === generation && !running && reloadIdle(); }
    async function observe() {
      markerTimer = null;
      if (!valid()) return;
      var marker = await changedMarker();
      if (!valid()) return;
      if (marker && await maybeReload(cause)) return;
      if (valid()) schedule();
    }
    function schedule() { markerTimer = setTimeout(observe, attempts++ < 17 ? 3000 : 15000); }
    schedule();
  }
  async function maybeReload(cause) {
    if (reloadFlight || cfg.registryVerification !== 1 || !reloadIdle() || !reloadCause(cause)) return false;
    reloadFlight = true;
    try {
      var marker = await changedMarker();
      if (!marker || !reloadIdle() || !window.sessionStorage || !window.location || typeof location.reload !== 'function') return false;
      var key = 'aeagentcore4-reload-' + cfg.installationId + '-' + await configHash() + '-' + marker.panelConfigHash;
      if (!reloadIdle() || sessionStorage.getItem(key) !== null) return false;
      sessionStorage.setItem(key, 'pending'); if (sessionStorage.getItem(key) !== 'pending') throw error('reload_budget_write');
      interruptMain(); interruptReset();
      if (!reloadIdle()) return false;
      disposed = true; show('waiting', 'Обновление установленной панели Core'); location.reload(); return true;
    } catch (ignored) { return false; }
    finally { reloadFlight = false; }
  }
  async function recoverOwner(cause, g, budget, observed) {
    var binding = channelBinding;
    function guard() { current(g); if (!binding || channelBinding !== binding || !reloadIdle()) throw error('reconnect_local_busy'); }
    guard();
    while (true) {
      var value = observed; observed = null;
      if (!value) {
        try { guard(); value = await resetRpc('status', resetGeneration, undefined, guard); guard(); }
        catch (e) {
          guard(); if (!e.transportUnavailable) throw e;
          if (await maybeReload(e)) throw error('panel_reload_scheduled'); guard();
          await waitRetry(budget, false); guard(); continue;
        }
      }
      guard();
      if (value.sessionId !== binding.workSessionId || !sessionAvailable(value)) throw error('start_over_in_progress');
      showReset(value);
      if (value.ownerBootId === binding.ownerBootId) {
        if (cause.pollPeerRejected) throw cause;
        return false;
      }
      if (value.phase !== 'ready' || value.requiresAEExit || value.fault !== null) throw error('owner_reconnect_not_ready');
      guard(); reconnectBinding = binding; reconnectNewBoot = true; newChannel(); return true;
    }
  }
  async function settleReload() {
    if (cfg.registryVerification !== 1 || !window.sessionStorage) return;
    var suffix = '-' + await configHash(), prefix = 'aeagentcore4-reload-' + cfg.installationId + '-';
    for (var i = 0; i < sessionStorage.length; i++) { var key = sessionStorage.key(i); if (key.indexOf(prefix) === 0 && key.slice(-suffix.length) === suffix && sessionStorage.getItem(key) === 'pending') sessionStorage.setItem(key, 'settled'); }
  }
  async function link(budget) {
    function guard() { if (reconnectBinding && !reloadIdle()) throw error('reconnect_local_busy'); }
    while (true) {
      guard();
      if (Date.now() >= budget.deadline || budget.attempts >= 17) throw error(budget.reason || 'runtime_wait_expired');
      budget.attempts++; var g = generation;
      try {
        var challenge = await post('/challenge', { role: 'panel' }, g, budget.deadline);
        guard();
        if (!object(challenge, ['nonce', 'epoch', 'controllerId', 'role', 'origin', 'packageHash', 'executorHash', 'installationId']) || typeof challenge.nonce !== 'string' || typeof challenge.epoch !== 'string' || typeof challenge.controllerId !== 'string' || challenge.packageHash !== cfg.packageHash || challenge.installationId !== cfg.installationId || challenge.executorHash !== cfg.executorHash || challenge.role !== 'panel' || (challenge.origin !== 'null' && challenge.origin !== 'file://')) throw error('installation_binding');
        var claim = { challenge: challenge, peerId: peerId, loadedPanel: loadedPanelIdentity };
        if (cfg.registryVerification === 1) claim.extensionRoot = extensionRoot();
        var proof = await sign(claim); current(g); guard();
        if (Date.now() >= budget.deadline) throw error(budget.reason || 'duplicate_peer_wait_expired');
        if (cfg.registryVerification === 1 && !reloadIdle(true)) throw error('registry_local_busy');
        var response = await post('/link', Object.assign({}, claim, { proof: proof }), g, budget.deadline);
        guard();
        if (Date.now() >= budget.deadline) throw error(budget.reason || 'duplicate_peer_wait_expired');
        return { challenge: challenge, response: response, generation: g, extensionRoot: claim.extensionRoot };
      } catch (e) {
        if (await maybeReload(e)) throw error('panel_reload_scheduled');
        if (!e.linkDuplicatePeer && !(e.transportUnavailable && !latched())) throw e;
        await waitRetry(budget, e.linkDuplicatePeer);
        guard();
        if (e.transportUnavailable) newChannel();
      }
    }
  }
  async function start() {
    if (running || disposed) return; cancelMarkerWatch(); running = true; button.disabled = true;
    var stoppedCause = null;
    delivered = false; channelBinding = null; reconnectBinding = null; reconnectNewBoot = false;
    try {
      if (!cfg || !api || !window.crypto || !crypto.subtle || typeof TextEncoder !== 'function' || typeof fetch !== 'function' || typeof AbortController !== 'function' || !window.__adobe_cep__ || typeof __adobe_cep__.evalScript !== 'function') throw error('CEP_WebCrypto_or_host_unavailable');
      if (cfg.startOverSupported === true && !await watchReset(null, resetGeneration)) return;
      if (cfg.registryVerification === 1 && cfg.startOverSupported === true && verifiedResetProof) await api.retireRegistryLatch({ installationId: cfg.installationId, storage: localStorage, proof: verifiedResetProof.envelope, verifyProof: verifyRetirementProof, digest: digestRaw });
      if (cfg.registryVerification === 1 && localStorage.getItem(api.registryKey(cfg.installationId)) !== null) throw error('registry_bootstrap_unknown_no_replay');
      if (cfg.registryVerification === 1 && !reloadIdle(true)) throw error('registry_local_busy');
      newChannel(); var budget = { deadline: Date.now() + 50000, attempts: 0 };
      while (!disposed) {
        var handshake = await link(budget), response = handshake.response, g = handshake.generation;
        var linkKeys = ['linked', 'epoch', 'peerId', 'controllerId', 'pins', 'receiverStoreIdentity', 'laneClosed', 'acceptedIdentity'];
        if (cfg.registryVerification === 1) linkKeys = linkKeys.concat(['registryReady', 'bootstrap']);
        if (cfg.startOverSupported === true) linkKeys = linkKeys.concat(['workSessionId', 'startOver']);
        if (!object(response, ['body', 'mac']) || !object(response.body, linkKeys) || response.mac !== await sign(response.body) || api.canonical(response.body.acceptedIdentity) !== api.canonical(loadedPanelIdentity) || response.body.linked !== true || response.body.peerId !== peerId || response.body.epoch !== handshake.challenge.epoch || response.body.controllerId !== handshake.challenge.controllerId || api.canonical(response.body.pins) !== api.canonical({ installationId: cfg.installationId, packageHash: cfg.packageHash, executorHash: cfg.executorHash }) || typeof response.body.receiverStoreIdentity !== 'string' || typeof response.body.laneClosed !== 'boolean') throw error('link_auth');
        current(g); if (reconnectBinding && !reloadIdle()) throw error('reconnect_local_busy');
        if (cfg.startOverSupported === true) {
          if (!validReset(response.body.startOver)) throw error('link_auth');
          if (!sessionAvailable(response.body.startOver)) throw error('start_over_in_progress');
          if (response.body.workSessionId !== response.body.startOver.sessionId) throw error('link_auth');
          if (reconnectBinding && response.body.workSessionId !== reconnectBinding.workSessionId) throw error('start_over_in_progress');
          if (reconnectBinding && (reconnectNewBoot && response.body.startOver.ownerBootId === reconnectBinding.ownerBootId || response.body.startOver.ownerBootId !== reconnectBinding.ownerBootId && (response.body.startOver.phase !== 'ready' || response.body.startOver.requiresAEExit || response.body.startOver.fault !== null))) throw error('owner_reconnect_binding');
          if (reconnectBinding && response.body.receiverStoreIdentity !== reconnectBinding.receiverStoreIdentity) throw error('receiver_store_changed');
          workSessionId = response.body.workSessionId; showReset(response.body.startOver);
        }
        if (reconnectBinding && response.body.receiverStoreIdentity !== reconnectBinding.receiverStoreIdentity) throw error('receiver_store_changed');
        channelBinding = Object.freeze({ ownerBootId: cfg.startOverSupported === true ? response.body.startOver.ownerBootId : null, workSessionId: workSessionId, receiverStoreIdentity: response.body.receiverStoreIdentity }); reconnectBinding = null;
        current(g); epoch = response.body.epoch; sequence = 0; show('connected', 'Подключено к Core 4.2.6');
        var dispatcher = api.createDispatcher({ installationId: cfg.installationId, sessionId: workSessionId, assetKey: cfg.assetKey, assets: cfg.assets, pins: response.body.pins, storage: localStorage, csInterface: { evalScript: function (s, cb) { __adobe_cep__.evalScript(s, cb); } }, complete: (function (channel) { return function (p) { return authenticated('/complete', p, channel); }; }(g)) });
        await dispatcher.recover(); current(g); if (latched()) throw error('physical_latch_present'); if (response.body.laneClosed) throw error('receiver_lane_closed');
        if (cfg.registryVerification === 1) {
          var bootstrap = response.body.bootstrap;
          if (response.body.registryReady !== false || !object(bootstrap, ['nonce', 'expectedRegistryBuildId', 'deadline', 'sessionId']) || !/^[a-f0-9]{64}$/.test(bootstrap.nonce) || bootstrap.sessionId !== workSessionId || bootstrap.expectedRegistryBuildId !== loadedPanelIdentity.registryBuildId || typeof bootstrap.deadline !== 'number' || bootstrap.deadline <= Date.now() || bootstrap.deadline > Date.now() + 91000) throw error('registry_bootstrap_auth');
          if (extensionRoot() !== handshake.extensionRoot) throw error('registry_extension_changed');
          if (!reloadIdle()) throw error('registry_local_busy');
          await api.bootstrapRegistry({ installationId: cfg.installationId, storage: localStorage, extensionRoot: handshake.extensionRoot, registryBuildId: loadedPanelIdentity.registryBuildId, binding: { epoch: epoch, peerId: peerId, nonce: bootstrap.nonce, packageHash: cfg.packageHash, sessionId: workSessionId }, csInterface: { evalScript: function (script, callback) { __adobe_cep__.evalScript(script, callback); } }, complete: (function (channel) { return function (value) { return authenticated('/registry-ready', value, channel); }; }(g)) }); current(g);
        }
        await settleReload(); showReady();
        while (true) {
          if (latched()) throw error('physical_latch_present');
          var next;
          try { next = await authenticated('/poll', {}, g); }
          catch (e) {
            // A lost poll may already be delivered on the server. Only a NEW
            // handshake may reconnect; server duplicate/lane/UNKNOWN fences stay.
            if (e.pollPeerRejected && cfg.startOverSupported === true) { if (await recoverOwner(e, g, budget)) break; }
            if (!e.transportUnavailable || !reloadIdle()) throw e;
            await waitRetry(budget, false); current(g); if (!reloadIdle()) throw error('reconnect_local_busy'); reconnectBinding = channelBinding; reconnectNewBoot = false; newChannel(); break;
          }
          current(g); if (!object(next, ['command']) || next.command !== null && (typeof next.command !== 'object' || Array.isArray(next.command))) throw error('poll_frame');
          budget = { deadline: Date.now() + 50000, attempts: 0 };
          if (next.command) {
            if (resetRequested) throw error('start_over_in_progress');
            if (latched()) throw error('physical_latch_present');
            delivered = true; show('busy', 'After Effects: выполняется команда'); detail.textContent = 'Ожидание ответа After Effects и подтверждения результата.';
            // No reconnect/poll timer spans evalScript or native confirmation.
            await dispatcher.dispatch(next.command); current(g); delivered = false;
            if (latched()) throw error('physical_latch_present');
            budget = { deadline: Date.now() + 50000, attempts: 0 };
            showReady();
          }
          if (cfg.startOverSupported === true && !resetPosting) {
            var updated;
            function idleStatus() { current(g); if (!reloadIdle()) throw error('reconnect_local_busy'); }
            try { idleStatus(); updated = await resetRpc('status', resetGeneration, undefined, idleStatus); idleStatus(); }
            catch (e) { if (!e.transportUnavailable) throw e; if (await recoverOwner(e, g, budget)) break; showReady(); continue; }
            if (channelBinding && updated.ownerBootId !== channelBinding.ownerBootId) { if (await recoverOwner(error('owner_boot_changed'), g, budget, updated)) break; }
            showReset(updated);
            if (!sessionAvailable(updated) || updated.sessionId !== workSessionId) throw error('start_over_in_progress');
            showReady();
          }
        }
      }
    } catch (e) {
      if (await maybeReload(e)) return;
      if (!disposed && cfg && cfg.startOverSupported === true && e.message === 'start_over_in_progress' && !resetPosting) {
        try { resetRequested = true; if (await watchReset(null, resetGeneration)) resumeRequested = true; }
        catch (resetError) { if (resetError.message !== 'stale_reset') { show('recovery', 'Проверка сброса остановлена: ' + resetError.message); detail.textContent = 'Новая отправка сброса не выполнялась. Проверьте core_status и core_diagnostics.'; } }
        return;
      }
      if (resetRequested || e.message === 'stale_reset') return;
      if (!disposed) {
        stoppedCause = e;
        var recovery = delivered || e.message === 'receiver_lane_closed' || e.message === 'owner_recovery_required';
        try { recovery = recovery || latched(); } catch (ignored) { recovery = true; }
        show(recovery ? 'recovery' : 'stopped', (recovery ? 'Требуется восстановление: ' : 'Остановлено: ') + e.message);
        detail.textContent = (/wait_expired$/.test(e.message) ? 'Время ожидания подключения истекло. Для новой попытки нажмите «Подключить». ' : '') + 'UNKNOWN не повторяется. Проверяйте core_status; перезагрузка не снимает fence.';
      }
    } finally { running = false; if (!disposed) button.disabled = false; if (resumeRequested && !disposed) { resumeRequested = false; setTimeout(start, 0); } else if (stoppedCause) watchMarker(stoppedCause); }
  }
  if (typeof window.addEventListener === 'function') window.addEventListener('unload', function () { disposed = true; interruptMain(); interruptReset(); });
  if (resetButton) { resetButton.disabled = true; resetButton.addEventListener('click', beginReset); }
  button.addEventListener('click', start); start();
}());

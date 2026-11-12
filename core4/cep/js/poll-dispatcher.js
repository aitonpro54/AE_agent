(function (root) {
  'use strict';
  function canonical(v) {
    if (v === null || typeof v === 'boolean' || typeof v === 'string') return JSON.stringify(v);
    if (typeof v === 'number' && isFinite(v)) return JSON.stringify(v);
    if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
    if (!v || typeof v !== 'object') throw new Error('invalid_json');
    return '{' + Object.keys(v).sort().map(function (k) { return JSON.stringify(k) + ':' + canonical(v[k]); }).join(',') + '}';
  }
  function exact(v, keys) { if (!v || typeof v !== 'object' || Array.isArray(v) || Object.keys(v).some(function (k) { return keys.indexOf(k) < 0; })) throw new Error('invalid_frame'); }
  // A new dispatcher/session in this CEP window cannot bypass an unresolved
  // evalScript callback. Reload is still NOT proof that native AE has stopped.
  var guardName = '__aeCore4NativeCallbackGuard';
  if (!Object.prototype.hasOwnProperty.call(root, guardName)) Object.defineProperty(root, guardName, { value: { active: null } });
  var nativeGuard = root[guardName];
  var operations = 0;
  function tracked(promise) { operations++; return Promise.resolve(promise).then(function (v) { operations--; return v; }, function (e) { operations--; throw e; }); }
  if (!nativeGuard || typeof nativeGuard !== 'object' || !Object.prototype.hasOwnProperty.call(nativeGuard, 'active')) throw new Error('physical_callback_guard');
  function storageKey(installationId, sessionId) {
    if (typeof installationId !== 'string' || !installationId || sessionId !== undefined && sessionId !== null && !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(sessionId)) throw new Error('physical_session_binding');
    return 'aeagentcore4-physical-' + installationId + (sessionId ? '-session-' + sessionId : '');
  }
  function createDispatcher(options) {
    var key = storageKey(options.installationId, options.sessionId);
    var active = false;
    function load() { var value = options.storage.getItem(key); return value ? JSON.parse(value) : null; }
    function save(v) { var value = canonical(v); options.storage.setItem(key, value); if (options.storage.getItem(key) !== value) throw new Error('latch_write_failed'); }
    function post(record) { return options.complete({ commandId: record.frame.commandId, originalBinding: record.frame.originalBinding, pins: record.frame.pins, result: record.result }).then(function (reply) {
      if (!reply.ack || reply.ack.commandId !== record.frame.commandId || reply.ack.receiptRef !== record.frame.originalBinding.receiptRef) throw new Error('completion_ack_mismatch');
      options.storage.removeItem(key); active = false;
    }); }
    return {
      pending: load,
      recover: function () { if (nativeGuard.active) return Promise.reject(new Error('physical_callback_pending')); var prior = load(); if (!prior) return Promise.resolve(); if (!prior.result) return Promise.reject(new Error('physical_outcome_unknown_no_replay')); active = true; return tracked(post(prior)); },
      dispatch: function (frame) {
        exact(frame, ['assetKey', 'phase', 'typedPayload', 'commandId', 'originalBinding', 'pins']);
        if (active || load()) throw new Error('physical_latch_present');
        if (nativeGuard.active) throw new Error('physical_callback_pending');
        var assets = options.assets || [{ assetKey: options.assetKey, executorHash: options.pins.executorHash, phases: ['inspect'] }];
        var selected = assets.filter(function (a) { return a.assetKey === frame.assetKey; })[0];
        var expectedPins = { packageHash: options.pins.packageHash, installationId: options.pins.installationId, executorHash: selected ? selected.executorHash : '' };
        if (!selected || selected.phases.indexOf(frame.phase) < 0 || canonical(frame.pins) !== canonical(expectedPins) || frame.originalBinding.commandId !== frame.commandId || frame.originalBinding.executorHash !== selected.executorHash || frame.originalBinding.phase !== frame.phase) throw new Error('fixed_asset_binding');
        var record = { frame: frame }, callbackToken = {}; save(record); active = true; nativeGuard.active = callbackToken;
        // This persistent latch is not fsync proof. The Node durable begin/fence
        // is authoritative and remains closed after lost callback/reload.
        return tracked(new Promise(function (resolve, reject) {
          var data = canonical(frame).replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
          var script = '(function(){if(typeof AECore4Host==="undefined"||typeof AECore4Host.dispatch!=="function")return "{\\"readFailureVersion\\":1,\\"outcome\\":\\"rejected\\",\\"code\\":\\"host_registry_unavailable\\"}";return AECore4Host.dispatch(' + JSON.stringify(data) + ');}())';
          try { options.csInterface.evalScript(script, function (raw) {
            // Keep the old storage key and completion closure. Switching the
            // session never redirects a late callback to a new channel.
            if (nativeGuard.active !== callbackToken) { reject(new Error('physical_callback_guard')); return; }
            try { record.result = JSON.parse(raw); save(record); } catch (e) { nativeGuard.active = null; reject(e); return; }
            nativeGuard.active = null;
            try { post(record).then(resolve, reject); } catch (e) { reject(e); }
          }); } catch (e) { reject(e); }
        }));
      }
    };
  }
  function registryKey(installationId) { return 'aeagentcore4-registry-' + installationId; }
  function reloadIdle(storage, installationId, sessionId, retiredSessions, admitSavedResult) {
    // Admission may recover only a saved current result by POST/ACK after link.
    // Native/operation guards still apply, and bootstrap uses the strict check.
    var recoverableCurrent = false;
    if (admitSavedResult && typeof admitSavedResult === 'object') {
      try {
        var prior = JSON.parse(storage.getItem(storageKey(installationId, sessionId))), frame = prior && prior.frame, binding = frame && frame.originalBinding, pins = frame && frame.pins;
        recoverableCurrent = !!(frame && typeof frame.commandId === 'string' && frame.commandId && binding && typeof binding.receiptRef === 'string' && binding.commandId === frame.commandId && pins && pins.installationId === installationId && pins.packageHash === admitSavedResult.packageHash && Array.isArray(admitSavedResult.executorHashes) && admitSavedResult.executorHashes.indexOf(pins.executorHash) >= 0 && binding.executorHash === pins.executorHash && prior.result && (typeof sessionId === 'string' || sessionId === null && admitSavedResult.explicitNullSession === true));
      } catch (ignored) {}
    }
    var historicalNullSession = retiredSessions === true && typeof sessionId === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(sessionId);
    if (nativeGuard.active || operations || storage.getItem(registryKey(installationId)) !== null || storage.getItem(storageKey(installationId, sessionId)) !== null && !recoverableCurrent || storage.getItem(storageKey(installationId)) !== null && !historicalNullSession && !(recoverableCurrent && sessionId === null)) return false;
    if (typeof storage.key !== 'function' || typeof storage.length !== 'number') return false;
    var prefix = storageKey(installationId), currentKey = storageKey(installationId, sessionId);
    for (var i = 0; i < storage.length; i++) {
      var key = storage.key(i);
      if (typeof key !== 'string' || key.indexOf(prefix) !== 0 || storage.getItem(key) === null) continue;
      // Only a signed completed work-session reset retires historical null/UUID session
      // latches. Their bytes remain intact; they are never replayed or deleted.
      if (recoverableCurrent && key === currentKey) continue;
      if (historicalNullSession && key === prefix) continue;
      if (retiredSessions === true && key !== currentKey && key.indexOf(prefix + '-session-') === 0 && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(key.slice((prefix + '-session-').length))) continue;
      return false;
    }
    return true;
  }
  function bootstrapRegistry(options) {
    var key = registryKey(options.installationId), binding = options.binding, token = {}, ownRaw = null;
    if (nativeGuard.active || operations || options.storage.getItem(key) !== null) return Promise.reject(new Error('registry_bootstrap_unknown_no_replay'));
    if (!Object.prototype.hasOwnProperty.call(binding, 'sessionId') || binding.sessionId !== null && !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(binding.sessionId) || !/^[a-f0-9]{64}$/.test(binding.nonce) || !/^[a-f0-9]{64}$/.test(options.registryBuildId) || typeof options.extensionRoot !== 'string' || options.extensionRoot.length > 4096 || /[\x00-\x1f]/.test(options.extensionRoot) || /(?:^|\/)\.\.(?:\/|$)/.test(options.extensionRoot) || !/^(?:[A-Za-z]:\/|\/)/.test(options.extensionRoot)) return Promise.reject(new Error('registry_bootstrap_binding'));
    var record = { binding: binding, registryBuildId: options.registryBuildId, extensionRoot: options.extensionRoot };
    function owned() { if (options.storage.getItem(key) !== ownRaw) throw new Error('registry_latch_replaced'); }
    function save() { owned(); var bytes = canonical(record); options.storage.setItem(key, bytes); if (options.storage.getItem(key) !== bytes) throw new Error('registry_latch_write'); ownRaw = bytes; }
    save(); nativeGuard.active = token;
    var file = JSON.stringify(options.extensionRoot + '/jsx/registry.jsx').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
    var script = '(function(){try{function identity(){return typeof AECore4Host!=="undefined"&&typeof AECore4Host.identity==="function"?AECore4Host.identity():null;}var before=identity(),refreshed=false;if(!before||before.protocolVersion!==1||before.registryBuildId!=="' + options.registryBuildId + '"){refreshed=true;$.evalFile(new File(' + file + '));}var after=identity();if(!after||after.protocolVersion!==1||after.registryBuildId!=="' + options.registryBuildId + '")throw new Error("registry_identity");return "{\\"version\\":1,\\"nonce\\":\\"' + binding.nonce + '\\",\\"registryBuildId\\":\\"' + options.registryBuildId + '\\",\\"refreshed\\":"+(refreshed?"true":"false")+"}";}catch(e){return "{\\"version\\":1,\\"nonce\\":\\"' + binding.nonce + '\\",\\"code\\":\\"registry_refresh_failed\\"}";}}())';
    return tracked(new Promise(function (resolve, reject) {
      try { options.csInterface.evalScript(script, function (raw) {
        if (nativeGuard.active !== token) { reject(new Error('registry_native_guard')); return; }
        try {
          var result = JSON.parse(raw);
          exact(result, ['version', 'nonce', 'registryBuildId', 'refreshed']);
          if (Object.keys(result).length !== 4 || result.version !== 1 || result.nonce !== binding.nonce || result.registryBuildId !== options.registryBuildId || typeof result.refreshed !== 'boolean') throw new Error('registry_native_identity');
          record.result = result; save(); nativeGuard.active = null;
          owned();
          Promise.resolve(options.complete({ nonce: result.nonce, registryBuildId: result.registryBuildId, refreshed: result.refreshed, sessionId: binding.sessionId })).then(function (ack) {
            owned();
            if (!ack || ack.registryReady !== true || ack.nonce !== binding.nonce || ack.registryBuildId !== options.registryBuildId || ack.sessionId !== binding.sessionId) throw new Error('registry_ack_binding');
            options.storage.removeItem(key); if (options.storage.getItem(key) !== null) throw new Error('registry_latch_clear'); resolve(ack);
          }).catch(reject);
        } catch (e) { nativeGuard.active = null; reject(e); }
      }); } catch (e) { reject(e); }
      // No timeout clears the callback guard or persistent bootstrap latch.
    }));
  }
  async function retireRegistryLatch(options) {
    var key = registryKey(options.installationId), oldRaw = options.storage.getItem(key), proof = options.proof, uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
    function idle() { return !nativeGuard.active && operations === 0; }
    if (oldRaw === null || !idle() || !proof || typeof options.verifyProof !== 'function') return false;
    var old = JSON.parse(oldRaw), status = proof.response && proof.response.body && proof.response.body.status;
    if (!old || !old.binding || !Object.prototype.hasOwnProperty.call(old.binding, 'sessionId') || old.binding.sessionId !== null && !uuid.test(old.binding.sessionId) || !status || !uuid.test(status.sessionId) || !uuid.test(status.id) || old.binding.sessionId === status.sessionId || status.resetComplete !== true || status.requiresAEExit !== false || status.fault !== null || ['ready', 'baseline-required'].indexOf(status.phase) < 0 || !await options.verifyProof(proof)) return false;
    var digest = await options.digest(oldRaw);
    if (!/^[a-f0-9]{64}$/.test(digest) || !idle() || options.storage.getItem(key) !== oldRaw || !await options.verifyProof(proof)) return false;
    var archiveKey = key + '-archive-' + digest + '-reset-' + status.id;
    var archive = canonical({ version: 1, outcome: 'unknown_preserved', disposition: 'retired_after_completed_reset', raw: oldRaw, digest: digest, oldSessionId: old.binding.sessionId, newSessionId: status.sessionId, resetId: status.id, proof: proof });
    var existing = options.storage.getItem(archiveKey);
    if (existing !== null && existing !== archive) throw new Error('registry_archive_conflict');
    if (existing === null) options.storage.setItem(archiveKey, archive);
    if (options.storage.getItem(archiveKey) !== archive) throw new Error('registry_archive_write');
    if (!idle() || options.storage.getItem(key) !== oldRaw) throw new Error('registry_latch_replaced');
    options.storage.removeItem(key); if (options.storage.getItem(key) !== null) throw new Error('registry_latch_clear');
    return true;
  }
  root.Core4PollDispatcher = { canonical: canonical, storageKey: storageKey, registryKey: registryKey, createDispatcher: createDispatcher, bootstrapRegistry: bootstrapRegistry, retireRegistryLatch: retireRegistryLatch, reloadIdle: reloadIdle, nativePending: function () { return nativeGuard.active !== null; } };
  if (typeof module === 'object') module.exports = root.Core4PollDispatcher;
}(typeof globalThis !== 'undefined' ? globalThis : this));

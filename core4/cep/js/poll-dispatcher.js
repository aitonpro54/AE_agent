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
      recover: function () { if (nativeGuard.active) return Promise.reject(new Error('physical_callback_pending')); var prior = load(); if (!prior) return Promise.resolve(); if (!prior.result) return Promise.reject(new Error('physical_outcome_unknown_no_replay')); active = true; return post(prior); },
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
        return new Promise(function (resolve, reject) {
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
        });
      }
    };
  }
  root.Core4PollDispatcher = { canonical: canonical, storageKey: storageKey, createDispatcher: createDispatcher, nativePending: function () { return nativeGuard.active !== null; } };
  if (typeof module === 'object') module.exports = root.Core4PollDispatcher;
}(typeof globalThis !== 'undefined' ? globalThis : this));

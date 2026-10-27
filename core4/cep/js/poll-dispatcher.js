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
  function createDispatcher(options) {
    var key = 'aeagentcore4-physical-' + options.installationId;
    var active = false;
    function load() { var value = options.storage.getItem(key); return value ? JSON.parse(value) : null; }
    function save(v) { var value = canonical(v); options.storage.setItem(key, value); if (options.storage.getItem(key) !== value) throw new Error('latch_write_failed'); }
    function post(record) { return options.complete({ commandId: record.frame.commandId, originalBinding: record.frame.originalBinding, pins: record.frame.pins, result: record.result }).then(function (reply) {
      if (!reply.ack || reply.ack.commandId !== record.frame.commandId || reply.ack.receiptRef !== record.frame.originalBinding.receiptRef) throw new Error('completion_ack_mismatch');
      options.storage.removeItem(key); active = false;
    }); }
    return {
      pending: load,
      recover: function () { var prior = load(); if (!prior) return Promise.resolve(); if (!prior.result) return Promise.reject(new Error('physical_outcome_unknown_no_replay')); active = true; return post(prior); },
      dispatch: function (frame) {
        exact(frame, ['assetKey', 'phase', 'typedPayload', 'commandId', 'originalBinding', 'pins']);
        if (active || load()) throw new Error('physical_latch_present');
        if (frame.assetKey !== options.assetKey || frame.phase !== 'inspect' || canonical(frame.pins) !== canonical(options.pins) || frame.originalBinding.commandId !== frame.commandId || frame.originalBinding.executorHash !== options.pins.executorHash || frame.originalBinding.phase !== frame.phase) throw new Error('fixed_asset_binding');
        var record = { frame: frame }; save(record); active = true;
        // This persistent latch is not fsync proof. The Node durable begin/fence
        // is authoritative and remains closed after lost callback/reload.
        return new Promise(function (resolve, reject) {
          var data = canonical(frame).replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
          var script = '(function(){if(typeof JSON==="undefined"||typeof JSON.parse!=="function"||typeof JSON.stringify!=="function")return "{\\"readFailureVersion\\":1,\\"outcome\\":\\"rejected\\",\\"code\\":\\"host_json_unavailable\\"}";if(typeof AECore4Host==="undefined"||typeof AECore4Host.dispatch!=="function")return "{\\"readFailureVersion\\":1,\\"outcome\\":\\"rejected\\",\\"code\\":\\"host_registry_unavailable\\"}";return AECore4Host.dispatch(JSON.parse(' + JSON.stringify(data) + '));}())';
          try { options.csInterface.evalScript(script, function (raw) {
            try { record.result = JSON.parse(raw); save(record); post(record).then(resolve, reject); } catch (e) { reject(e); }
          }); } catch (e) { reject(e); }
        });
      }
    };
  }
  root.Core4PollDispatcher = { canonical: canonical, createDispatcher: createDispatcher };
  if (typeof module === 'object') module.exports = root.Core4PollDispatcher;
}(typeof globalThis !== 'undefined' ? globalThis : this));

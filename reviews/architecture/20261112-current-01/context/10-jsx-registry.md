# 10-jsx-registry

Выбранные точные исходники; вне обозначенных диапазонов контекст не включён.

## `core4/runtime/stdio-entry.js:264–293`
Полный файл SHA256 (hex groups, concatenate) `456a936c:20c41e6e:8ac82ae0:a617525c:04278142:3eb4ba9e:773e24a6:2ca25a6e`; Git blob `c3e06c19:c64def5d:23113020:8704fdcb:603f90f8`. Выдержка: строки 264–293, 2844 bytes.

```javascript
function registrySource(assets, codecSource, identityEnabled = false) {
  const declarations = [], entries = assets.map((asset, index) => {
    const name = 'executor' + index; declarations.push('var ' + name + '=' + asset.executor + ';');
    const calls = asset.phases.map(phase => {
      const method = asset.resultProfile === 'photo-source-v1' ? phase + 'Current' : phase;
      const call = name + '[' + JSON.stringify(method) + ']';
      const guarded = phase === 'mutate' && asset.registryOperatorConfirmation;
      const target = guarded ? 'function(p){return applyOperatorApproval(' + call + ',p);}' : call;
      return JSON.stringify(phase) + ':' + target;
    });
    return JSON.stringify(asset.assetKey) + ':{"hash":' + JSON.stringify(asset.executorHash) + ',"calls":{' + calls.join(',') + '}}';
  });
  const approval = assets.some(asset => asset.registryOperatorConfirmation) ? [
    'function applyOperatorApproval(call,p){',
    'var proof=p&&p._execution&&p._execution.operatorConfirmation;',
    'if(!proof)return {"outcome":"rejected","code":"operator_confirmation_required"};',
    'if(typeof proof.digest!=="string"||!/^[a-f0-9]{64}$/.test(proof.digest)||',
    'typeof proof.expiresAt!=="number"||!isFinite(proof.expiresAt)||proof.expiresAt<=new Date().getTime())',
    'return {"outcome":"rejected","code":"operator_confirmation_expired"};',
    'return call(p,function(){if(proof.expiresAt<=new Date().getTime()){',
    'var e=new Error("operator_confirmation_expired");e.coreCode="operator_confirmation_expired";throw e;}return true;});}',
  ].join('') : '';
  let source = '/* Fixed package-owned registry. Runtime frames contain data only. */\nvar AECore4Host=(function(){var JSON=' + codecSource + ';' + declarations.join('') + approval + 'var assets={' + entries.join(',') + '};return {"dispatch":function(serialized){var frame=JSON.parse(serialized),own=Object.prototype.hasOwnProperty,a=frame&&own.call(assets,frame.assetKey)&&assets[frame.assetKey],call=a&&own.call(a.calls,frame.phase)&&a.calls[frame.phase];if(!call||frame.pins.executorHash!==a.hash)throw new Error("fixed_asset_binding");if(frame.phase==="mutate")return JSON.stringify(call(frame.typedPayload));try{return JSON.stringify(call(frame.typedPayload));}catch(e){return JSON.stringify({"readFailureVersion":1,"outcome":"rejected","code":"inspection_failed"});}}};}());\n';
  if (identityEnabled) {
    source = source.replace('var AECore4Host=(function(){', 'var AECore4Host=(function(){var registryBuildId="' + '0'.repeat(64) + '";/*CORE4_REGISTRY_ID*/')
      .replace('return {"dispatch":', 'return {"identity":function(){return {"protocolVersion":1,"registryBuildId":registryBuildId};},"dispatch":');
    source = source.replace('0'.repeat(64) + '";/*CORE4_REGISTRY_ID*/', hash(source) + '";/*CORE4_REGISTRY_ID*/');
  }
  return source;
}
```

## `core4/cep/js/poll-dispatcher.js:23–66`
Полный файл SHA256 (hex groups, concatenate) `3199bbd8:b98bc1d7:8c74e278:f6bf2da3:b405575f:4709468d:70758f7d:f582e065`; Git blob `deb40fd0:70c1df64:ecd27856:06fc42e8:a08c9cb5`. Выдержка: строки 23–66, 4070 bytes.

```javascript
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
```

## `core4/cep/js/poll-dispatcher.js:88–118`
Полный файл SHA256 (hex groups, concatenate) `3199bbd8:b98bc1d7:8c74e278:f6bf2da3:b405575f:4709468d:70758f7d:f582e065`; Git blob `deb40fd0:70c1df64:ecd27856:06fc42e8:a08c9cb5`. Выдержка: строки 88–118, 4124 bytes.

```javascript
  function bootstrapRegistry(options) {
    var key = registryKey(options.installationId), binding = options.binding, token = {}, ownRaw = null;
    if (nativeGuard.active || operations || options.storage.getItem(key) !== null) return Promise.reject(new Error('registry_bootstrap_unknown_no_replay'));
    if (!Object.prototype.hasOwnProperty.call(binding, 'sessionId') || binding.sessionId !== null && !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(binding.sessionId) || !/^[a-f0-9]{64}$/.test(binding.nonce) || !/^[a-f0-9]{64}$/.test(options.registryBuildId) || typeof options.extensionRoot !== 'string' || options.extensionRoot.length > 4096 || /[\x00-\x1f]/.test(options.extensionRoot) || /(?:^|\/)\.\.(?:\/|$)/.test(options.extensionRoot) || !/^(?:[A-Za-z]:\/|\/)/.test(options.extensionRoot)) return Promise.reject(new Error('registry_bootstrap_binding'));
    var record = { binding: binding, registryBuildId: options.registryBuildId, extensionRoot: options.extensionRoot };
    function owned() { if (options.storage.getItem(key) !== ownRaw) throw new Error('registry_latch_replaced'); }
    function save() { owned(); var bytes = canonical(record); options.storage.setItem(key, bytes); if (options.storage.getItem(key) !== bytes) throw new Error('registry_latch_write'); ownRaw = bytes; }
    save(); nativeGuard.active = token;
    var file = JSON.stringify(options.extensionRoot + '/jsx/registry.jsx').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
    // evalFile may declare the registry in this IIFE's local scope. Publish only
    // the verified registry so the next, separate evalScript can dispatch it.
    var script = '(function(){try{function current(){return typeof AECore4Host!=="undefined"?AECore4Host:null;}function valid(registry){var id=registry&&typeof registry.identity==="function"?registry.identity():null;return !!(registry&&typeof registry.dispatch==="function"&&id&&id.protocolVersion===1&&id.registryBuildId==="' + options.registryBuildId + '");}var registry=current(),refreshed=false;if(!valid(registry)){refreshed=true;$.evalFile(new File(' + file + '));registry=current();}if(!valid(registry))throw new Error("registry_identity");$.global.AECore4Host=registry;if($.global.AECore4Host!==registry||!valid($.global.AECore4Host))throw new Error("registry_identity");return "{\\"version\\":1,\\"nonce\\":\\"' + binding.nonce + '\\",\\"registryBuildId\\":\\"' + options.registryBuildId + '\\",\\"refreshed\\":"+(refreshed?"true":"false")+"}";}catch(e){return "{\\"version\\":1,\\"nonce\\":\\"' + binding.nonce + '\\",\\"code\\":\\"registry_refresh_failed\\"}";}}())';
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
```

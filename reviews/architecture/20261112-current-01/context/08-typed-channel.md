# 08-typed-channel

Выбранные точные исходники; вне обозначенных диапазонов контекст не включён.

## `core4/protocol/codec.js:1–20`
Полный файл SHA256 (hex groups, concatenate) `64057672:c5c9123e:1c3e5f49:c2b448d7:04e1cdbc:99d8c1d5:f1ee3892:b09810c1`; Git blob `65100fc6:725f7307:1a7551a2:dc537c36:66ec3b52`. Выдержка: строки 1–20, 1360 bytes.

```javascript
'use strict';
const crypto = require('node:crypto');
const { bounded, parse, exact, fail, hash, canonical } = require('./json');
const VERSION = 1;
function sign(body, secret) { return crypto.createHmac('sha256', secret).update(bounded(body)).digest('hex'); }
function encode(body, secret) { return bounded({ body, mac: sign(body, secret) }); }
function decode(frame, secret) {
  const outer = parse(frame); exact(outer, ['body', 'mac']);
  const expected = sign(outer.body, secret);
  if (typeof outer.mac !== 'string' || outer.mac.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(outer.mac))) fail('channel_auth');
  return outer.body;
}
function envelope(value) {
  exact(value, ['protocolVersion', 'controllerId', 'channelEpoch', 'commandId', 'moduleId', 'operationId', 'executorHash', 'phase', 'payloadHash', 'payload']);
  if (value.protocolVersion !== VERSION || !['inspect', 'mutate', 'verify'].includes(value.phase)) fail('protocol_mismatch');
  for (const k of ['controllerId', 'channelEpoch', 'commandId', 'moduleId', 'operationId', 'executorHash', 'payloadHash']) if (typeof value[k] !== 'string' || value[k].length > 256) fail('invalid_envelope');
  if (hash(canonical(value.payload)) !== value.payloadHash) fail('payload_binding');
  return value;
}
module.exports = { VERSION, encode, decode, envelope };
```

## `core4/protocol/dispatch.js:1–14`
Полный файл SHA256 (hex groups, concatenate) `d9fd64ad:c931d32f:65ab0b57:104afce7:f199f5e1:ce96f17c:f00e19fc:1d95645d`; Git blob `3856416e:893b7af0:1e5e699f:84401ded:1f0c6e05`. Выдержка: строки 1–14, 904 bytes.

```javascript
'use strict';
const { hash, canonical, exact, fail } = require('./json');
const FIELDS = ['controllerId', 'channelEpoch', 'commandId', 'moduleId', 'operationId', 'executorHash', 'payloadHash', 'phase'];
function dispatchBinding(command, receiverStoreIdentity) {
  if (typeof receiverStoreIdentity !== 'string' || !receiverStoreIdentity) fail('receiver_store_identity_required');
  const origin = Object.fromEntries(FIELDS.map(k => [k, command[k]]));
  return { ...origin, receiverStoreIdentity, receiptRef: hash({ ...origin, receiverStoreIdentity }) };
}
function sameDispatch(actual, expected) {
  if (!actual || !expected) return false;
  exact(actual, [...FIELDS, 'receiverStoreIdentity', 'receiptRef']);
  return canonical(actual) === canonical(expected) && actual.receiptRef === dispatchBinding(actual, actual.receiverStoreIdentity).receiptRef;
}
module.exports = { dispatchBinding, sameDispatch };
```

## `core4/core/receiver.js:1–52`
Полный файл SHA256 (hex groups, concatenate) `3a3fcdd3:d783e309:e8ff9e06:8e4b0749:add8430f:1e0b5308:87998e05:7d0836c2`; Git blob `d463b7b1:e56ee352:4079af65:f251d83d:80e3ca3a`. Выдержка: строки 1–52, 3521 bytes.

```javascript
'use strict';
const { decode, encode, envelope } = require('../protocol/codec');
const { hash, fail, exact } = require('../protocol/json');
const { dispatchBinding } = require('../protocol/dispatch');
const { id } = require('../protocol/json');
function readFailure(result) {
  if (!result || !Object.hasOwn(result, 'readFailureVersion')) return false;
  exact(result, ['readFailureVersion', 'outcome', 'code']);
  if (result.readFailureVersion !== 1 || result.outcome !== 'rejected' || typeof result.code !== 'string' || !/^[a-z][a-z0-9_]{0,63}$/.test(result.code)) fail('invalid_read_failure');
  return true;
}
// Production receiver boundary, shared by fixture transport. No script field, executor path
// or worker-produced executable token is accepted. Provisioning is a private install action.
function createReceiver({ controllerId, channelEpoch, secret, admittedExecutors, evaluate, completionStore, receiverStoreIdentity }) {
  const assets = new Map(); const completions = completionStore || new Map(); let busy = false;
  const storeIdentity = receiverStoreIdentity || completions.identity || id('receiver-store');
  for (const asset of admittedExecutors) {
    if (hash(asset.source) !== asset.executorHash) fail('executor_bytes');
    assets.set(asset.executorHash, Object.freeze({ ...asset }));
  }
  async function receive(frame) {
    const command = envelope(decode(frame, secret));
    if (command.controllerId !== controllerId || command.channelEpoch !== channelEpoch) fail('controller_binding');
    const asset = assets.get(command.executorHash);
    if (!asset || asset.moduleId !== command.moduleId || asset.operationId !== command.operationId) fail('receiver_not_admitted');
    if (completions.has(command.commandId)) fail('duplicate_command_no_replay');
    if (busy) fail('controller_busy');
    busy = true;
    const originalBinding = dispatchBinding(command, storeIdentity);
    try {
      if (completions.begin) completions.begin(command, originalBinding);
      else completions.set(command.commandId, { state: 'ongoing', command, originalBinding });
      const result = await evaluate({ source: asset.source, phase: command.phase, payload: command.payload, command });
      if (command.phase === 'mutate' || !readFailure(result)) exact(result, command.phase === 'mutate' ? ['outcome', 'snapshot', 'code'] : ['target', 'revision', 'sourceId', 'text', 'protected']);
      const response = { protocolVersion: 1, commandId: command.commandId, executorHash: command.executorHash, payloadHash: command.payloadHash, result };
      if (completions.complete) completions.complete(command.commandId, response);
      else completions.set(command.commandId, { state: 'completed', command, originalBinding, response });
      return encode(response, secret);
    } catch (e) {
      // A receiver/eval exception cannot certify that ExtendScript did not run.
      if (completions.unknown) completions.unknown(command.commandId);
      else completions.set(command.commandId, { state: 'unknown', command, originalBinding });
      throw e;
    } finally { busy = false; }
  }
  function completion(commandId) {
    const c = completions.get(commandId);
    return encode({ commandId, state: c ? c.state : 'unknown', ...(c?.originalBinding ? { originalBinding: c.originalBinding } : {}), ...(c && c.response ? { response: c.response } : {}) }, secret);
  }
  return Object.freeze({ receive, completion, receiverStoreIdentity: storeIdentity });
}
module.exports = { createReceiver, readFailure };
```

## `core4/integrations/cep/host-dispatcher.js:1–52`
Полный файл SHA256 (hex groups, concatenate) `57db0822:461593d2:2540a139:abd126dc:f67b85b5:da57c5ff:288d2f44:b2f5784c`; Git blob `15d6d97c:019b72a4:7c08556c:b3bd3457:2afd9e9c`. Выдержка: строки 1–52, 3712 bytes.

```javascript
'use strict';
const { hash, bounded, parse, exact, fail } = require('../../core/receiver-api');
const sourceHash = hash(require('node:fs').readFileSync(__filename));
const PHASES = Object.freeze({ inspect: 'inspect', mutate: 'mutate', verify: 'verify' });
function literal(value) { return JSON.stringify(value).replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029'); }
function createHostDispatcher({ csInterface, installExecutors, reviewedAdmissions, callbackTimeout = 2000 }) {
  if (!csInterface || typeof csInterface.evalScript !== 'function') fail('private_host_required');
  const assets = new Map(); let physicalPending = false;
  for (const item of installExecutors) {
    exact(item, ['moduleId', 'operationId', 'executorHash', 'source', 'admissionRef']);
    const admission = reviewedAdmissions.find(a => a.admissionRef === item.admissionRef);
    if (!admission || admission.revoked || admission.moduleId !== item.moduleId || admission.operationId !== item.operationId || admission.executorHash !== item.executorHash || hash(item.source) !== item.executorHash || assets.has(item.executorHash)) fail('executor_install_admission');
    assets.set(item.executorHash, Object.freeze({ ...item }));
  }
  const admittedExecutors = Object.freeze([...assets.values()]);
  return Object.freeze({
    admittedExecutors,
    get physicalPending() { return physicalPending; },
    evaluate({ phase, payload, command }) {
      const asset = assets.get(command.executorHash);
      if (!asset || asset.moduleId !== command.moduleId || asset.operationId !== command.operationId || !Object.hasOwn(PHASES, phase)) fail('host_not_admitted');
      if (physicalPending) fail('physical_lane_pending');
      // Only reviewed source enters the executable position. Every runtime value is a
      // JSON string literal parsed as data. No path/file/raw command ingress exists.
      const call = 'executor.' + PHASES[phase] + '(input)';
      const invoke = phase === 'mutate' ? 'return JSON.stringify(' + call + ');' :
        'try{return JSON.stringify(' + call + ');}catch(e){return JSON.stringify({readFailureVersion:1,outcome:"rejected",code:e&&typeof e.coreCode==="string"&&/^[a-z][a-z0-9_]{0,63}$/.test(e.coreCode)?e.coreCode:"snapshot_failed"});}';
      const script = '(function(){var executor=' + asset.source + ';var input=JSON.parse(' + literal(bounded(payload)) + ');' + invoke + '}())';
      physicalPending = true;
      return new Promise((resolve, reject) => {
        let settled = false;
        const timer = setTimeout(() => { settled = true; reject(Object.assign(new Error('host_callback_timeout'), { code: 'host_callback_timeout' })); }, callbackTimeout);
        try {
          csInterface.evalScript(script, result => {
            // A late callback proves physical termination but cannot promote a timeout
            // to success; the durable UNKNOWN tombstone and lane remain fenced.
            if (settled) return;
            // A read callback proves physical termination. The fixed wrapper reports
            // executor refusals as data; the known CEP sentinel is also read-only.
            if (phase !== 'mutate') physicalPending = false;
            try {
              const value = phase !== 'mutate' && result === 'EvalScript error.' ? { readFailureVersion: 1, outcome: 'rejected', code: 'snapshot_failed' } : parse(result);
              physicalPending = false; settled = true; clearTimeout(timer); resolve(value);
            }
            catch (e) { settled = true; clearTimeout(timer); reject(e); }
          });
        } catch (e) { settled = true; clearTimeout(timer); reject(e); }
      });
    }
  });
}
module.exports = { createHostDispatcher, sourceHash };
```

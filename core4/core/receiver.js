'use strict';
const { decode, encode, envelope } = require('../protocol/codec');
const { hash, fail, exact } = require('../protocol/json');
const { dispatchBinding } = require('../protocol/dispatch');
const { id } = require('../protocol/json');
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
      exact(result, command.phase === 'mutate' ? ['outcome', 'snapshot', 'code'] : ['target', 'revision', 'sourceId', 'text', 'protected']);
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
module.exports = { createReceiver };

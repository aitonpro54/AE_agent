'use strict';
const { createReceiver, encode } = require('../../core/receiver-api');
const { openCompletionStore } = require('../../integrations/cep/completion-store');
const { createHostDispatcher } = require('../../integrations/cep/host-dispatcher');
const { install } = require('./cep-host');
const [directory, boundary, commandJSON] = process.argv.slice(2);
const command = JSON.parse(commandJSON), store = openCompletionStore({ directory });
if (typeof process.send !== 'function') throw new Error('synthetic_parent_host_required');
const csInterface = { evalScript(script, callback) {
  process.once('message', message => {
    if (message.type !== 'evaluated') throw new Error('synthetic_parent_response');
    // AE/persist has completed in the surviving parent; deliberately lose its callback.
    if (boundary === 'pending') process.exit(74);
    callback(message.result);
  });
  process.send({ type: 'evalScript', script });
} };
const dispatcher = createHostDispatcher({ ...install(require('node:path').resolve(__dirname, '../..')), csInterface });
const receiver = createReceiver({ controllerId: command.controllerId, channelEpoch: command.channelEpoch, secret: 'synthetic-crash-secret', admittedExecutors: dispatcher.admittedExecutors, completionStore: store, evaluate: args => {
  if (boundary === 'intent') process.exit(71);
  return dispatcher.evaluate(args);
} });
receiver.receive(encode(command, 'synthetic-crash-secret')).then(() => { process.exit(72); }).catch(e => { console.error(e); process.exit(73); });

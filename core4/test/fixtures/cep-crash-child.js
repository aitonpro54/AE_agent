'use strict';
const fs = require('node:fs');
const { createReceiver, encode } = require('../../core/receiver-api');
const { openCompletionStore } = require('../../integrations/cep/completion-store');
const { createHostDispatcher } = require('../../integrations/cep/host-dispatcher');
const { install, vmHost } = require('./cep-host');
const [directory, marker, boundary, commandJSON] = process.argv.slice(2);
const command = JSON.parse(commandJSON), store = openCompletionStore({ directory });
let host;
host = vmHost({ persist: () => {
  const fd = fs.openSync(marker + '.state.json', 'w'); try { fs.writeSync(fd, JSON.stringify(host.state)); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
} });
const evaluate = host.csInterface.evalScript;
host.csInterface.evalScript = (script, callback) => {
  const fd = fs.openSync(marker, 'a'); try { fs.writeSync(fd, 'evaluate\n'); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  if (boundary === 'pending') { evaluate(script, () => {}); setTimeout(() => process.exit(74), 5); return; }
  return evaluate(script, callback);
};
const dispatcher = createHostDispatcher({ ...install(require('node:path').resolve(__dirname, '../..')), csInterface: host.csInterface });
const receiver = createReceiver({ controllerId: command.controllerId, channelEpoch: command.channelEpoch, secret: 'synthetic-crash-secret', admittedExecutors: dispatcher.admittedExecutors, completionStore: store, evaluate: args => {
  if (boundary === 'intent') process.exit(71);
  return dispatcher.evaluate(args);
} });
receiver.receive(encode(command, 'synthetic-crash-secret')).then(() => { process.exit(72); }).catch(e => { console.error(e); process.exit(73); });

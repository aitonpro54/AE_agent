'use strict';
// TEST PRELOAD ONLY: direct installed main entries, never production port3457.
// IPC remains the installation-derived random pipe of this TEMP installation.
// Thin-client fixtures attach only to their already registered TEMP owner.
// Auto-launch scrubs the environment, so a nested child cannot inherit this
// preload's ephemeral listener mapping or the parent's exact child cleanup.
if (require('node:path').basename(process.argv[1] || '') === 'client-entry.js') {
  const childProcess = require('node:child_process');
  for (const name of ['spawn', 'spawnSync', 'exec', 'execSync', 'execFile', 'execFileSync', 'fork']) {
    childProcess[name] = () => { throw Object.assign(new Error('owner_fixture_nested_process_forbidden'), { code: 'owner_fixture_nested_process_forbidden' }); };
  }
}
const net = require('node:net');
const listen = net.Server.prototype.listen, servers = new Set();
function report(value) { if (process.connected) process.send(value); }
net.Server.prototype.listen = function (...args) {
  if (args[0] === 3457 && args[1] === '127.0.0.1') args[0] = 0;
  else if (typeof args[0] !== 'string' || !args[0].startsWith('\\\\.\\pipe\\ae-core4-owner-')) throw new Error('owner_fixture_unexpected_listener');
  servers.add(this);
  this.once('listening', () => {
    const address = this.address(); report(typeof address === 'string' ? { event: 'ipc', endpoint: address } : { event: 'http', port: address.port });
  });
  this.once('close', () => {
    servers.delete(this);
    if (!servers.size && process.connected) { report({ event: 'closed' }); process.disconnect(); }
  });
  return listen.apply(this, args);
};
process.on('message', value => { if (value === 'signal') process.emit('SIGTERM'); });
if (process.channel) process.channel.unref();

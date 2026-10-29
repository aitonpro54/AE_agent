'use strict';
// Test preload: real installed direct-main entry, ephemeral listener, cache report.
// No runtime production flags, credentials or provider injection.
const net = require('node:net');
const listen = net.Server.prototype.listen;
net.Server.prototype.listen = function (port, host, ...rest) {
  if (port !== 3457 || host !== '127.0.0.1') throw new Error('fixture_unexpected_listener');
  this.once('listening', () => process.send({ event: 'listening', port: this.address().port }));
  return listen.call(this, 0, host, ...rest);
};
process.on('message', value => { if (value === 'cache') process.send({ event: 'cache', modules: Object.keys(require.cache) }); });

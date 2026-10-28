'use strict';
// TEST PRELOAD ONLY. Keep the real entry's require.main/CLI/import order, but
// never bind its production endpoint. No production flags or probe injection.
const net = require('node:net');
const originalListen = net.Server.prototype.listen;
net.Server.prototype.listen = function (port, host, ...rest) {
  if (port !== 3457 || host !== '127.0.0.1') throw new Error('fixture_unexpected_listener');
  return originalListen.call(this, 0, host, ...rest);
};

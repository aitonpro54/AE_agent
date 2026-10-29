'use strict';
// Observation only: no descriptor, environment, runtime or application protocol.
const net = require('node:net');

function boundedErrorCode(error) {
  try {
    const code = error && error.code;
    return typeof code === 'string' && /^[A-Z][A-Z0-9_]{0,63}$/.test(code) ? code : null;
  } catch { return null; }
}

async function readCore4Endpoint() {
  if (arguments.length) throw new TypeError('readCore4Endpoint accepts no arguments');
  return new Promise(resolve => {
    let socket, timer, settled = false;
    function finish(state, reason, error) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { if (socket) socket.destroy(); }
      catch (cleanupError) { state = 'unknown'; reason = 'cleanup-error'; error = cleanupError; }
      resolve({
        schemaVersion: 1,
        scope: 'fixed-endpoint-observation',
        observedAt: new Date().toISOString(),
        endpoint: { host: '127.0.0.1', port: 3457, family: 4 },
        method: 'tcp-connect-zero-payload',
        timeoutMs: 1000,
        state, reason, osErrorCode: boundedErrorCode(error),
        bindability: 'unverified',
        aeCapabilities: 'unobserved',
        cepCapabilities: 'unobserved',
        environmentPreflight: 'incomplete',
        authority: false,
        liveProof: false
      });
    }
    function onError(error) {
      const refused = boundedErrorCode(error) === 'ECONNREFUSED';
      finish(refused ? 'absent' : 'unknown', refused ? 'connection-refused' : 'socket-error', error);
    }
    try {
      socket = new net.Socket();
      socket.once('connect', () => finish('occupied', 'connected'));
      // Retain the error guard until close: destroy may have a queued error.
      socket.on('error', onError);
      socket.once('close', () => {
        finish('unknown', 'premature-close');
        socket.removeListener('error', onError);
        socket.removeAllListeners('connect');
      });
      timer = setTimeout(() => finish('unknown', 'deadline-exceeded'), 1000);
      socket.connect({ host: '127.0.0.1', port: 3457, family: 4 });
    } catch (error) { finish('unknown', 'probe-exception', error); }
  });
}

if (require.main === module) {
  if (process.argv.length !== 2) {
    process.stderr.write(JSON.stringify({ schemaVersion: 1, error: 'unexpected-arguments' }) + '\n');
    process.exitCode = 64;
  } else {
    readCore4Endpoint().then(report => {
      process.stdout.write(JSON.stringify(report) + '\n');
      process.exitCode = { absent: 0, occupied: 2, unknown: 3 }[report.state];
    });
  }
}
module.exports = { readCore4Endpoint };

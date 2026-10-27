'use strict';
// Explicit offline composition. Actual Core/stdio/HTTP/store/JSX VM, synthetic OS
// observations and delayed native-confirm model; never installed or public.
const { harness } = require('./manual-http-runtime');
const { serve } = require('../../core/stdio');
const { Broker } = require('../../core/broker');
const { PRODUCTION_TIMING } = require('../../runtime/stdio-entry');
async function start() {
  const h = await harness({ humanDelayMs: 2600, callerTimeout: PRODUCTION_TIMING.callerTimeoutMs, callbackTimeout: PRODUCTION_TIMING.callbackTimeoutMs });
  const facade = {};
  for (const name of Object.getOwnPropertyNames(Broker.prototype)) if (name !== 'constructor' && typeof h.broker[name] === 'function') facade[name] = h.broker[name].bind(h.broker);
  facade.close = () => h.close();
  serve(facade, process.stdin, process.stdout, { serverInfo: { name: 'core4-human-window-offline-fixture', version: '4.0.0' } });
}
if (require.main === module) start().catch(e => { process.stderr.write((e.code || e.message) + '\n'); process.exitCode = 1; });

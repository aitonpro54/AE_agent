'use strict';
// Test-only child; no installed discovery, production endpoint or real AE.
const { AsyncLocalStorage } = require('node:async_hooks');
const { createInterface } = require('node:readline');
const { createIpcServer, createIpcClient } = require('../../runtime/client-ipc');
const { createAttachmentOwner, OWNER_METHODS } = require('../../runtime/attachment-owner');
const { serveAttachment } = require('../../runtime/client-stdio');
const identity = { installationId: 'attachment-process-fixture', machineId: 'fixture', packageHash: '1'.repeat(64) };
const secret = 'test-only-owner-control-secret-value-123456789';
async function main() {
  const [mode, endpoint] = process.argv.slice(2);
  if (mode === 'client') {
    const client = await createIpcClient({ endpoint, identity, secret, timeoutMs: 10000 });
    serveAttachment({ client, input: process.stdin, output: process.stdout }); return;
  }
  if (mode !== 'owner') throw new Error('fixture_mode');
  const { fixture } = require('../helpers'); const f = fixture(), contexts = new AsyncLocalStorage();
  const originalSend = f.transport.send.bind(f.transport);
  f.transport.send = (...args) => { const context = contexts.getStore(); if (!context) throw new Error('fixture_context_required'); context.assertCurrent(); return originalSend(...args); };
  const runtime = f.broker;
  const owner = createAttachmentOwner({ runtime,
    activity: () => ({ pending: !!(runtime.running || runtime.reconciling || runtime.controllerBusy || runtime.controlPending || runtime.worker.pending.size), unresolved: runtime.ledger.unresolved().length > 0, fault: !!(runtime.closed || runtime.stateLock.error || runtime.ledger.corrupt) }),
    invoke(method, payload, context) { return contexts.run(context, () => { if (!context.observer) context.assertCurrent(); return runtime[method](payload); }); }
  });
  const server = createIpcServer({ endpoint, identity, secret, bootId: owner.bootId, methods: OWNER_METHODS,
    onAttach: owner.onAttach, onDetach: owner.onDetach, onRequest: owner.onRequest });
  await server.listen();
  process.stdout.write(JSON.stringify({ ready: true, bootId: owner.bootId, pid: process.pid, fixtureStateDir: f.stateDir,
    fixtureTarget: { sessionId: f.state.sessionId, projectId: f.state.projectId, compId: 1, layerId: 102 } }) + '\n');
  const lines = createInterface({ input: process.stdin });
  lines.once('line', async line => {
    if (line !== 'fixture-shutdown') return;
    try { if (owner.status().accepted) throw new Error('fixture_still_pending'); await server.close(); await owner.close(); lines.close(); process.stdin.destroy(); }
    catch (error) { process.stderr.write(error.code || 'fixture_shutdown_failed'); process.exitCode = 1; }
  });
}
main().catch(error => { process.stderr.write(error.code || 'fixture_failed'); process.exitCode = 1; });

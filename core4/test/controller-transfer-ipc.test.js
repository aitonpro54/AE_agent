'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');
const { randomUUID } = require('node:crypto');
const { createAttachmentOwner, OWNER_METHODS } = require('../runtime/attachment-owner');
const { createIpcServer, createIpcClient } = require('../runtime/client-ipc');

test('controller-transfer actual authenticated clients require exact expired holder and observed quiescence', async t => {
  let time = 0, effects = 0, evidence = 0;
  const facts = { pending: false, unresolved: false, fault: false };
  const owner = createAttachmentOwner({ runtime: { status: () => ({}), close() {} }, clock: () => time, ttlMs: 1000,
    activity: () => ({ ...facts }), invoke(method, _payload, context) {
      if (method === 'inspect') { context.assertCurrent(); return { evidenceRef: 'fixture-evidence-' + ++evidence }; }
      if (method === 'connect') { context.assertCurrent(); effects++; }
      return {};
    } });
  const endpoint = process.platform === 'win32' ? '\\\\.\\pipe\\core4-transfer-test-' + randomUUID() : path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'core4-transfer-')), 'owner.sock');
  const identity = { installationId: 'controller-transfer-fixture', machineId: 'fixture', packageHash: '1'.repeat(64) }, secret = 'test-only-transfer-control-secret-123456789';
  const server = createIpcServer({ endpoint, identity, secret, bootId: owner.bootId, methods: OWNER_METHODS,
    onAttach: owner.onAttach, onDetach: owner.onDetach, onRequest: owner.onRequest });
  await server.listen(); const clients = [];
  t.after(async () => { for (const client of clients) client.close(); await server.close(); await owner.close(); });
  const connect = async () => { const client = await createIpcClient({ endpoint, identity, secret }); clients.push(client); return client; };
  const a = await connect(), b = await connect(), c = await connect();
  const lease = (await a.call('controller_acquire', {})).value;
  const before = (await a.call('inspect_module_target', {})).value;
  const snapshot = (await b.call('owner_status', {})).value;
  const expected = { bootId: snapshot.bootId, generation: snapshot.generation, holderClientId: snapshot.holderClientId };
  assert.deepEqual(await b.call('controller_transfer', { expected }), { ok: false, code: 'controller_not_expired' });
  time = 1000;
  for (const field of ['pending', 'unresolved', 'fault']) {
    facts[field] = true;
    assert.deepEqual(await b.call('controller_transfer', { expected }), { ok: false, code: field === 'pending' ? 'owner_draining' : 'owner_recovery_required' });
    facts[field] = false;
  }
  assert.deepEqual(await b.call('controller_transfer', { expected: { ...expected, safe: true } }), { ok: false, code: 'controller_expected' });
  const next = await b.call('controller_transfer', { expected }); assert.equal(next.ok, true); assert.equal(next.value.generation, lease.generation + 1);
  assert.deepEqual(await a.call('controller_release', { leaseToken: lease.leaseToken }), { ok: false, code: 'controller_lease_identity' });
  assert.deepEqual(await c.call('controller_transfer', { expected }), { ok: false, code: 'controller_transfer_changed' });
  assert.deepEqual(await a.call('core_connect', {}), { ok: false, code: 'controller_lease_identity' });
  assert.deepEqual(await b.call('build_solution_plan', { steps: [{ evidenceRef: before.evidenceRef }] }), { ok: false, code: 'owner_reference_generation' });
  assert.equal((await b.call('core_connect', {})).ok, true); assert.equal(effects, 1);
  a.close(); assert.equal((await b.call('owner_status', {})).value.generation, next.value.generation);
});

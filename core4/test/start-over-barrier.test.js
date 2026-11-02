'use strict';
const nodeTest = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), net = require('node:net'), crypto = require('node:crypto');
const { canonical, hash } = require('../protocol/json'), { dispatchBinding } = require('../protocol/dispatch');
const { harness } = require('./fixtures/start-over-barrier');
const test = (name, fn) => nodeTest('start-over-barrier ' + name, { timeout: 12000 }, fn);
const error = code => e => e.code === code;
test('idle barrier holds both endpoints without requiring AE exit and exposes no reset or mutation authority', async t => {
  const f = await harness(t); f.set({ currentAE: [f.rootAE], aeAlive: [f.rootAE] }); const before = f.snapshot();
  const cap = await f.api.acquireStartOverBarrier(f.options), facts = f.api.startOverBarrierFacts(cap);
  assert.equal(facts.endpointsReserved, true); assert.equal(facts.resetComplete, false); assert.equal(facts.aeAuthority, false); assert.deepEqual(f.probes[0].ae, []);
  assert.deepEqual(f.snapshot(), before); assert.equal(fs.existsSync(path.join(f.root, 'install.lock')), false);
  await f.api.releaseStartOverBarrier(cap); assert.throws(() => f.api.startOverBarrierFacts(cap), error('start_over_barrier_brand')); assert.equal(f.servers.every(s => !s.listening), true);
});
test('UNKNOWN requires exact old AE exit while a new AE birth does not cause an endless restart requirement', async t => {
  const f = await harness(t, { unknown: true }), before = fs.readFileSync(f.path('receiver/completions.ndjson')); f.set({ aeAlive: [f.rootAE], currentAE: [f.rootAE] });
  await assert.rejects(f.api.acquireStartOverBarrier(f.options), e => e.code === 'start_over_requires_ae_exit' && e.ae[0].birthTicks === f.rootAE.birthTicks);
  f.set({ aeAlive: [], currentAE: [{ pid: 43, birthTicks: '639292254253597851' }] }); const cap = await f.api.acquireStartOverBarrier(f.options);
  assert.deepEqual(f.probes.at(-1).ae, [f.rootAE]); assert.deepEqual(fs.readFileSync(f.path('receiver/completions.ndjson')), before); await f.api.releaseStartOverBarrier(cap);
});
test('diagnostic owner absence cannot substitute death of the previous active producer', async t => {
  const f = await harness(t, { diagnostic: true }), previous = f.result.actors[0]; f.set({ actorsAlive: [previous] });
  await assert.rejects(f.api.acquireStartOverBarrier(f.options), e => e.code === 'start_over_producer_still_alive' && e.actors[0].birthTicks === previous.birthTicks);
  assert.equal(f.probes[0].actors.length, 2); assert.equal(f.servers.every(s => !s.listening), true); assert.equal(fs.existsSync(f.path('runtime-owner.json')), true);
});
test('crash before inventory captures the complete AE set once after producer death and retains it across retry', async t => {
  const f = await harness(t, { unknown: true, noInventory: true }); f.set({ currentAE: [f.rootAE], aeAlive: [f.rootAE] });
  await assert.rejects(f.api.acquireStartOverBarrier(f.options), error('start_over_requires_ae_exit'));
  const record = path.join(f.root, 'transactions', f.result.id + '-start-over', 'continuation-inventory.json'), before = fs.readFileSync(record);
  f.set({ currentAE: [{ pid: 43, birthTicks: '639292254253597851' }], aeAlive: [] }); const cap = await f.api.acquireStartOverBarrier(f.options);
  assert.deepEqual(fs.readFileSync(record), before); assert.deepEqual(f.probes.at(-1).ae, [f.rootAE]); await f.api.releaseStartOverBarrier(cap);
});
test('missing old stopped receipt does not prevent process-gone proof and does not relabel UNKNOWN', async t => {
  const f = await harness(t, { unknown: true }), before = fs.readFileSync(f.path('receiver/completions.ndjson'));
  assert.equal(fs.existsSync(path.join(f.root, 'transactions', f.result.id + '-owner-maintenance', 'stopped.json')), false);
  const cap = await f.api.acquireStartOverBarrier(f.options); assert.deepEqual(fs.readFileSync(f.path('receiver/completions.ndjson')), before); assert.equal(f.api.startOverBarrierFacts(cap).resetComplete, false); await f.api.releaseStartOverBarrier(cap);
});
test('foreign marker written across native await refuses before any store archive or lease claim', async t => {
  const f = await harness(t, { unknown: true }); f.set({ hook: async () => { fs.writeFileSync(f.path('receiver/owner'), 'foreign'); } });
  await assert.rejects(f.api.acquireStartOverBarrier(f.options), error('start_over_foreign_marker'));
  assert.equal(fs.existsSync(f.path('broker')), true); assert.equal(fs.existsSync(f.path('receiver')), true); assert.equal(fs.existsSync(path.join(f.root, 'install.lock')), false); assert.equal(f.servers.every(s => !s.listening), true);
});
test('strengthened history risk across native await forces a new AE observation instead of accepting cheap idle proof', async t => {
  const f = await harness(t); f.set({ aeAlive: [f.rootAE], currentAE: [f.rootAE], hook: async (_request, n) => {
    if (n !== 1) return; const body = { type: 'intent', commandId: f.c.commandId, dispatchBinding: dispatchBinding(f.c, f.receiverIdentity), seq: 1, previousHash: 'origin' };
    fs.writeFileSync(f.path('broker/ledger.ndjson'), canonical({ ...body, recordHash: hash(body) }) + '\n');
  } });
  await assert.rejects(f.api.acquireStartOverBarrier(f.options), error('start_over_requires_ae_exit'));
  assert.equal(f.probes.length, 2); assert.deepEqual(f.probes[0].ae, []); assert.deepEqual(f.probes[1].ae, [f.rootAE]);
});
test('held barrier detects phase drift and releases endpoints even when its proof has become invalid', async t => {
  const f = await harness(t), cap = await f.api.acquireStartOverBarrier(f.options);
  fs.writeFileSync(path.join(f.root, 'transactions', f.result.id + '-start-over', 'inventory.json.stage-12345678-1234-4123-8123-123456789abc'), 'torn');
  assert.throws(() => f.api.assertStartOverBarrier(cap), error('start_over_barrier_changed')); await f.api.releaseStartOverBarrier(cap); assert.equal(f.servers.every(s => !s.listening), true);
});
test('busy canonical IPC does not steal the endpoint or keep the new HTTP reservation', async t => {
  const f = await harness(t), other = net.createServer(socket => socket.destroy()); await new Promise((resolve, reject) => { other.once('error', reject); other.listen(f.endpoint, resolve); });
  try { await assert.rejects(f.api.acquireStartOverBarrier(f.options), error('start_over_endpoint_busy')); assert.equal(other.listening, true); assert.equal(f.servers.every(s => !s.listening), true); }
  finally { await new Promise(resolve => other.close(resolve)); }
});
test('JSON lookalikes stale intent pins and caller-native overrides do not acquire a barrier', async t => {
  const f = await harness(t);
  assert.throws(() => f.api.assertStartOverBarrier({}), error('start_over_barrier_brand')); assert.throws(() => f.state.startOverBarrierContext({}), error('start_over_barrier_brand'));
  await assert.rejects(f.api.acquireStartOverBarrier({ ...f.options, probe: () => [] }), error('start_over_barrier_options'));
  await assert.rejects(f.api.acquireStartOverBarrier({ ...f.options, expectedIntentHash: '0'.repeat(64) }), error('start_over_intent_changed'));
  assert.equal(f.probes.length, 0);
});
test('corrupt stop-requested metadata cannot be ignored merely because old process death would otherwise be available', async t => {
  const f = await harness(t), file = path.join(f.root, 'transactions', f.result.id + '-start-over', 'stop-requested.json'); fs.writeFileSync(file, '{corrupt');
  await assert.rejects(f.api.acquireStartOverBarrier(f.options), error('start_over_record')); assert.equal(f.probes.length, 0); assert.equal(f.servers.every(s => !s.listening), true);
});
test('a shutdown gate binds the exact full original scope and never just matching PID birth and boot', async t => {
  for (const changed of [false, true]) {
    const f = await harness(t), intent = JSON.parse(fs.readFileSync(f.path('runtime-start-over.json'))).body;
    const original = JSON.parse(Buffer.from(intent.markers['runtime-owner.json'].bytes, 'base64')).body.scope, scope = { ...original, ...(changed ? { brokerToken: crypto.randomUUID() } : {}) };
    const body = { version: 1, kind: 'startup-gate', installationId: f.d.installationId, machineId: f.d.machineId, descriptorHash: hash(fs.readFileSync(f.descriptorPath)), scope, recoveryId: crypto.randomUUID(), readyId: null, takeoverId: null, phase: 'shutdown' };
    const key = crypto.createHmac('sha256', Buffer.from(f.d.panelToken, 'hex')).update('ae-core4/lifecycle-key/v1\0').update(Buffer.from(f.d.controlToken, 'hex')).digest();
    const mac = crypto.createHmac('sha256', key).update('ae-core4/lifecycle-record/v1\0' + canonical(body)).digest('hex'), bytes = Buffer.from(canonical({ body, mac })), file = path.join(f.root, 'install.lock'); fs.writeFileSync(file, bytes);
    if (changed) await assert.rejects(f.api.acquireStartOverBarrier(f.options), error('start_over_foreign_marker'));
    else { const cap = await f.api.acquireStartOverBarrier(f.options); assert.deepEqual(fs.readFileSync(file), bytes); await f.api.releaseStartOverBarrier(cap); }
  }
});

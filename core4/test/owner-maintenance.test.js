'use strict';
// Synthetic verifier/process births, real TEMP filesystem and loopback port0.
const nodeTest = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), http = require('node:http'), Module = require('node:module');
const { canonical, hash } = require('../protocol/json'), { dispatchBinding } = require('../protocol/dispatch');
const { fixture } = require('./fixtures/owner-lifecycle-fixture');
const { classifyOwnerProcess } = require('../runtime/windows-owner-process');
const { createAttachmentOwner, OWNER_METHODS } = require('../runtime/attachment-owner');
const { Ledger } = require('../core/ledger');
const test = (name, fn) => nodeTest('owner-maintenance ' + name, { timeout: 10000 }, fn);
const bytes = file => fs.existsSync(file) ? fs.readFileSync(file) : null;
async function harness(t, diagnostic = false) {
  const f = await fixture(t); fs.writeFileSync(path.join(f.root, 'core-client.json'), canonical({ fixture: 'role-only-client' }));
  if (diagnostic) { fs.mkdirSync(f.path('receiver')); fs.writeFileSync(f.path('receiver/owner'), ''); }
  let cap = await f.create(), stores = diagnostic ? null : f.stores(cap); if (!diagnostic) cap.markReady(); cap.releaseStartup();
  let birth = BigInt(cap.state().birthTicks), pending = false, count = 0, freezes = 0, closes = 0, frozen = false, observeHook;
  const modules = new Map();
  function load(name) {
    const filename = path.resolve(__dirname, '../runtime/' + name + '.js'); if (modules.has(name)) return modules.get(name).exports;
    const mod = new Module(filename, module); modules.set(name, mod); mod.filename = filename; mod.paths = Module._nodeModulePaths(path.dirname(filename));
    mod.require = target => {
      if (target === 'node:fs') return f.io;
      if (target === './owner-maintenance' || target === './install-lease') return load(target.slice(2));
      if (target === './stdio-entry') return { verifyInstallation(file) { assert.equal(file, f.descriptorPath); return JSON.parse(fs.readFileSync(file)); } };
      if (target === './windows-owner-process') return { classifyOwnerProcess, async observeOwnerProcess(pid) { if (observeHook) await observeHook(pid); return { version: 1, pid, status: 'present', birthTicks: String(birth), executablePath: process.execPath, observedAt: new Date().toISOString() }; } };
      return require(target.startsWith('.') ? path.resolve(path.dirname(filename), target) : target);
    };
    mod._compile(fs.readFileSync(filename, 'utf8'), filename); return mod.exports;
  }
  const api = load('owner-maintenance');
  function coordinator(extra = {}) { return api.createOwnerMaintenance({ installation: f.d, descriptorPath: f.descriptorPath, lifecycle: cap,
    freeze() { freezes++; frozen = true; }, activity: () => ({ pending }), accepted: () => count,
    async close() { closes++; f.close(cap, stores); }, intervalMs: 2, ...extra }); }
  let m = coordinator();
  const options = () => ({ installation: f.d, descriptorPath: f.descriptorPath });
  const scope = () => { const s = cap.state(); return { bootId: s.processBootId, pid: s.pid, birthTicks: s.birthTicks }; };
  const auth = (id = crypto.randomUUID(), override = {}) => api.createStopAuthorization({ ...options(), scope: { ...scope(), ...override }, id });
  let server;
  async function reserved() { if (!server) { server = http.createServer(); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); t.after(() => new Promise(resolve => server.close(resolve))); } return server; }
  return { f, api, get m() { return m; }, coordinator, auth, scope, options, reserved, get stores() { return stores; },
    get frozen() { return frozen; }, get freezes() { return freezes; }, get closes() { return closes; },
    pending(v) { pending = v; }, accepted(v) { count = v; },
    onObserve(callback) { observeHook = callback; },
    async dead() { await f.crash(); birth += 10n; },
    async next() { cap = await f.create(); stores = f.stores(cap); cap.markReady(); cap.releaseStartup(); frozen = false; m = coordinator(); },
    async stop() { const request = auth(); const ack = m.request(request); const done = await m.done; assert.equal(done.phase, 'stopped'); return ack.id; },
    inspect: id => api.inspectMaintenance({ ...options(), id }),
    async resume(id, expectedProofHash) { return api.resumeMaintenance({ ...options(), id, expectedProofHash, reservedServer: await reserved() }); }
  };
}
function inject(h, method, handler) { const original = h.f.io[method]; h.f.io[method] = (...args) => handler(original, ...args); return () => { h.f.io[method] = original; }; }
const code = expected => e => e.code === expected;

test('full-role proof is bound to exact process incarnation; control role and stale boot cannot freeze or stop', async t => {
  const h = await harness(t), correct = h.auth(), wrong = structuredClone(correct);
  wrong.mac = crypto.createHmac('sha256', h.f.d.controlToken).update('ae-core4/maintenance-request/v1\0' + canonical(wrong.body)).digest('hex');
  assert.throws(() => h.m.request(wrong), code('maintenance_authorization'));
  assert.throws(() => h.m.request(h.auth(crypto.randomUUID(), { bootId: crypto.randomUUID() })), code('maintenance_authorization'));
  assert.equal(h.freezes, 0); assert.equal(bytes(h.f.path('runtime-maintenance.json')), null); assert.equal(h.closes, 0);
});

test('freeze precedes durable publication, rejects all new control, and accepted work drains without repeat', async t => {
  const h = await harness(t), session = Object.freeze({ clientSessionId: 'maintenance-test' }); let finish, invoked = 0;
  const owner = createAttachmentOwner({ runtime: { status: () => ({}), close: async () => {} }, activity: () => ({ pending: false, unresolved: false, fault: false }),
    invoke: async () => { invoked++; await new Promise(resolve => { finish = resolve; }); return { completed: true }; }, drainIntervalMs: 1 });
  owner.onAttach(session); const call = (method, payload = {}) => owner.onRequest({ session, method, payload }); const grant = (await call('controller_acquire')).value;
  const original = call('core_connect'); assert.equal(owner.status().accepted, 1);
  const m = h.coordinator({ freeze: owner.freeze, accepted: () => owner.status().accepted });
  const restore = inject(h, 'linkSync', (link, from, to) => { if (to === h.f.path('runtime-maintenance.json')) assert.equal(owner.status().frozen, true); return link(from, to); });
  const authorization = h.auth(), ack = m.request(authorization); restore(); assert.equal(ack.phase, 'draining');
  assert.equal(m.request(authorization).id, ack.id);
  for (const [method, payload] of [['controller_acquire', {}], ['controller_renew', { leaseToken: grant.leaseToken }], ['controller_release', { leaseToken: grant.leaseToken }], ['core_connect', {}]]) assert.equal((await call(method, payload)).code, 'owner_draining');
  assert.equal((await call('owner_status')).ok, true); assert.equal(h.closes, 0); finish(); assert.equal((await original).ok, true); assert.equal((await m.done).phase, 'stopped'); assert.equal(invoked, 1); assert.equal(h.closes, 1);
});

test('desired-stop persist failure keeps volatile freeze and partial evidence without forcing close', async t => {
  const h = await harness(t); let stage;
  const restore = inject(h, 'fsyncSync', (sync, fd) => { const file = h.f.openFiles.get(fd); if (file?.startsWith(h.f.path('runtime-maintenance.json.stage-'))) { stage = file; fs.ftruncateSync(fd, 5); throw Error('synthetic disk fault'); } return sync(fd); });
  try { assert.throws(() => h.m.request(h.auth()), code('maintenance_persist_failed')); } finally { restore(); }
  assert.equal(h.frozen, true); assert.equal(h.m.status().phase, 'fenced'); assert.equal(h.closes, 0); assert.equal(bytes(stage).length, 5); assert.equal(bytes(h.f.path('runtime-maintenance.json')), null);
  assert.throws(() => h.m.request(h.auth()), code('maintenance_in_progress')); assert.equal(h.freezes, 1);
});

test('normal stop and explicit same-descriptor resume work for consecutive cycles without starting runtime', async t => {
  const h = await harness(t), protectedFiles = [h.f.descriptorPath, path.join(h.f.root, 'origin.json'), h.f.path('origin.json'), path.join(h.f.root, 'core-client.json'), h.f.path('receiver/completions.ndjson')], original = protectedFiles.map(bytes);
  for (let cycle = 0; cycle < 2; cycle++) {
    const id = await h.stop(); assert.ok(bytes(h.f.path('runtime-maintenance.json'))); await assert.rejects(h.inspect(id), code('maintenance_process_not_dead'));
    await h.dead(); const inspected = await h.inspect(id); assert.equal(inspected.phase, 'stopped');
    const result = await h.resume(id, inspected.proofHash); assert.equal(result.resumed, true); assert.equal(result.runtimeStarted, false); assert.equal(result.aeAuthority, false);
    assert.equal(bytes(h.f.path('runtime-maintenance.json')), null); assert.equal(bytes(path.join(h.f.root, 'install.lock')), null); assert.equal(bytes(h.f.path('broker/broker-owner.gate')), null);
    protectedFiles.forEach((file, n) => assert.deepEqual(bytes(file), original[n])); if (cycle === 0) await h.next();
  }
});

test('a stop receipt does not substitute process death and desired-stop blocks lifecycle startup', async t => {
  const h = await harness(t), id = await h.stop(); await assert.rejects(h.inspect(id), code('maintenance_process_not_dead'));
  await h.dead(); const before = h.f.snapshot(); await assert.rejects(h.f.create(), code('owner_lifecycle_maintenance')); assert.deepEqual(h.f.snapshot(), before);
});

test('diagnostic stop preserves legacy execution marker; resume refuses rather than migrating it', async t => {
  const h = await harness(t, true), marker = h.f.path('receiver/owner'), before = bytes(marker), id = await h.stop();
  assert.deepEqual(bytes(marker), before); await h.dead(); const result = await h.inspect(id); assert.equal(result.phase, 'stopped-fenced'); assert.equal(result.proofHash, null);
  await assert.rejects(h.resume(id, 'a'.repeat(64)), code('maintenance_unsettled')); assert.deepEqual(bytes(marker), before);
});

test('UNKNOWN and original history survive stop; no replay or fresh receiver is created', async t => {
  const h = await harness(t), command = { protocolVersion: 1, controllerId: 'maintenance-test', channelEpoch: 'fixture', commandId: 'read-unknown', moduleId: 'project-inspection', operationId: 'inspect', executorHash: 'a'.repeat(64), phase: 'inspect', payloadHash: hash({}), payload: {} };
  h.stores.store.begin(command, dispatchBinding(command, h.stores.store.identity)); h.stores.store.unknown(command.commandId);
  const journal = h.f.path('receiver/completions.ndjson'), marker = h.f.path('receiver/owner'), before = bytes(journal), owner = bytes(marker), id = await h.stop();
  assert.deepEqual(bytes(journal), before); assert.deepEqual(bytes(marker), owner); await h.dead(); assert.equal((await h.inspect(id)).phase, 'stopped-fenced'); assert.deepEqual(bytes(journal), before);
});

for (const hasIntent of [false, true]) test(`stop with original reservation ${hasIntent ? 'and an unclassified intent stays fenced' : 'before intent can resume normally'}`, async t => {
  const h = await harness(t), journal = h.f.path('receiver/completions.ndjson'), ledgerPath = h.f.path('broker/ledger.ndjson');
  const ledger = new Ledger(ledgerPath), target = { projectId: 'fixture.aep', compId: 1 };
  const checkpoint = { ref: 'checkpoint-one', digest: hash(target) }, proposalId = 'proposal-one', taskId = 'task-one', taskEpoch = 0, effect = 'owned-native-render';
  const commandId = 'reserved-write', receiverStoreIdentity = h.stores.store.identity, ref = 'reservation-one';
  ledger.append({ type: 'checkpoint', checkpoint, proposalId, taskId, taskEpoch, target, effectPolicy: { effect } });
  ledger.append({ type: 'reservation', state: 'reserved', reservation: { ref, commandId, checkpointRef: checkpoint.ref, checkpointDigest: checkpoint.digest,
    proposalId, receiverStoreIdentity, executionScope: { schemaVersion: 2, target } }, taskId, taskEpoch, effect });
  if (hasIntent) {
    const command = { controllerId: 'controller-one', channelEpoch: 'epoch-one', commandId, moduleId: 'comp-render', operationId: 'render', executorHash: 'a'.repeat(64), phase: 'mutate', payloadHash: hash(target) };
    ledger.append({ type: 'intent', commandId, dispatchBinding: dispatchBinding(command, receiverStoreIdentity), grant: { reservationRef: ref } });
  }
  const originalReceiver = bytes(journal), originalLedger = bytes(ledgerPath), id = await h.stop();
  await h.dead(); const inspection = await h.inspect(id);
  if (hasIntent) {
    assert.equal(inspection.phase, 'stopped-fenced');
    await assert.rejects(h.resume(id, 'a'.repeat(64)), code('maintenance_unsettled'));
  } else {
    assert.equal(inspection.phase, 'stopped');
    assert.equal((await h.resume(id, inspection.proofHash)).resumed, true);
    await h.next();
    assert.equal(h.stores.store.identity, receiverStoreIdentity);
  }
  assert.deepEqual(bytes(journal), originalReceiver); assert.deepEqual(bytes(ledgerPath), originalLedger);
});

for (const drift of ['descriptor', 'history', 'client']) test(drift + ' CAS drift refuses resume before lease or destination writes', async t => {
  const h = await harness(t), id = await h.stop(); await h.dead(); const inspection = await h.inspect(id);
  const file = drift === 'descriptor' ? h.f.descriptorPath : drift === 'client' ? path.join(h.f.root, 'core-client.json') : h.f.path('receiver/completions.ndjson');
  if (drift === 'descriptor') { const candidate = file + '.replacement'; fs.writeFileSync(candidate, bytes(file)); fs.renameSync(candidate, file); } else fs.appendFileSync(file, ' ');
  const before = h.f.snapshot(); await assert.rejects(h.resume(id, inspection.proofHash), code('maintenance_changed')); assert.deepEqual(h.f.snapshot(), before);
});

test('interrupted pending resume remains stopped and fenced; a new process never retries the mutation', async t => {
  const h = await harness(t), id = await h.stop(); await h.dead(); const inspection = await h.inspect(id), gate = path.join(h.f.root, 'install.lock');
  const restore = inject(h, 'linkSync', (link, from, to) => { const result = link(from, to); if (to === gate) throw Error('synthetic crash after publication'); return result; });
  try { await assert.rejects(h.resume(id, inspection.proofHash)); } finally { restore(); }
  assert.equal(JSON.parse(bytes(gate)).body.kind, 'maintenance-lease-gate'); assert.ok(bytes(h.f.path('runtime-maintenance.json')));
  await h.dead(); const pending = await h.inspect(id); assert.equal(pending.phase, 'resume-fenced'); const before = h.f.snapshot();
  await assert.rejects(h.resume(id, pending.proofHash), code('maintenance_resume_in_progress')); assert.deepEqual(h.f.snapshot(), before);
});

test('completed resume can explicitly release only its exact dead process-bound lease without repeating resume', async t => {
  const h = await harness(t), id = await h.stop(); await h.dead(); const inspection = await h.inspect(id), barrier = h.f.path('runtime-maintenance.json');
  const restore = inject(h, 'unlinkSync', (unlink, file) => { const value = unlink(file); if (file === barrier) throw Error('synthetic crash before lease release'); return value; });
  try { await assert.rejects(h.resume(id, inspection.proofHash)); } finally { restore(); }
  assert.equal(bytes(barrier), null); assert.ok(bytes(path.join(h.f.root, 'install.lock'))); await h.dead();
  const completed = await h.inspect(id), result = await h.resume(id, completed.proofHash); assert.equal(result.recoveredLeaseOnly, true); assert.equal(result.runtimeStarted, false); assert.equal(bytes(path.join(h.f.root, 'install.lock')), null); assert.equal(bytes(h.f.path('broker/broker-owner.gate')), null);
});

test('maintenance methods and opaque lease capabilities are absent from the public MCP tool contract', async t => {
  const h = await harness(t), api = require('../runtime/install-lease');
  assert.deepEqual(h.api.PRIVATE_METHODS, ['maintenance_stop']); assert.equal(OWNER_METHODS.includes('maintenance_stop'), false);
  for (const value of [{}, { scope: h.options() }, JSON.parse(JSON.stringify(h.auth()))]) assert.throws(() => api.acquireMaintenanceInstallLease(value), code('maintenance_lease_brand'));
});

test('inspect proof binds the exact stopped receipt incarnation even when replacement preserves valid bytes', async t => {
  const h = await harness(t), id = await h.stop(); await h.dead(); const inspected = await h.inspect(id), dir = path.join(h.f.root, 'transactions', id + '-owner-maintenance'), receipt = path.join(dir, 'stopped.json');
  const candidate = receipt + '.replacement'; fs.writeFileSync(candidate, bytes(receipt)); fs.renameSync(candidate, receipt);
  const before = h.f.snapshot(); await assert.rejects(h.resume(id, inspected.proofHash), code('maintenance_proof_changed')); assert.deepEqual(h.f.snapshot(), before);
});

for (const [label, probe, change] of [['receipt corrupt during old death', 1, 'corrupt'], ['receipt inode during self observation', 2, 'replace'], ['receipt bytes during self observation', 2, 'corrupt'], ['unknown tree during self observation', 2, 'tree']]) test(label + ' refuses before publishing a resume intent or removing stop', async t => {
  const h = await harness(t), id = await h.stop(); await h.dead(); const inspected = await h.inspect(id), dir = path.join(h.f.root, 'transactions', id + '-owner-maintenance'), receipt = path.join(dir, 'stopped.json'), barrier = bytes(h.f.path('runtime-maintenance.json')); let calls = 0;
  h.onObserve(() => {
    if (++calls !== probe) return;
    if (change === 'tree') fs.writeFileSync(path.join(dir, 'unexpected.json'), '{}');
    else if (change === 'corrupt') fs.appendFileSync(receipt, ' ');
    else { const candidate = receipt + '.replacement'; fs.writeFileSync(candidate, bytes(receipt)); fs.renameSync(candidate, receipt); }
  });
  await assert.rejects(h.resume(id, inspected.proofHash), e => ['maintenance_changed', 'maintenance_phase'].includes(e.code));
  assert.equal(calls >= probe, true); assert.deepEqual(bytes(h.f.path('runtime-maintenance.json')), barrier); assert.equal(bytes(path.join(dir, 'resume-intent.json')), null); assert.equal(bytes(path.join(h.f.root, 'install.lock')), null);
});

for (const change of ['receipt', 'tree']) test(change + ' drift during lease acquisition cannot publish completion or remove stop', async t => {
  const h = await harness(t), id = await h.stop(); await h.dead(); const inspected = await h.inspect(id), dir = path.join(h.f.root, 'transactions', id + '-owner-maintenance'), barrier = bytes(h.f.path('runtime-maintenance.json')); let changed = false;
  const restore = inject(h, 'linkSync', (link, from, to) => {
    const result = link(from, to);
    if (!changed && to === h.f.path('broker/broker-owner.gate')) { changed = true; if (change === 'receipt') fs.appendFileSync(path.join(dir, 'stopped.json'), ' '); else fs.writeFileSync(path.join(dir, 'unexpected.json'), '{}'); }
    return result;
  });
  try { await assert.rejects(h.resume(id, inspected.proofHash), e => ['maintenance_changed', 'maintenance_phase'].includes(e.code)); } finally { restore(); }
  assert.equal(changed, true); assert.deepEqual(bytes(h.f.path('runtime-maintenance.json')), barrier); assert.equal(bytes(path.join(dir, 'resume-completed.json')), null); assert.ok(bytes(path.join(dir, 'resume-intent.json'))); assert.ok(bytes(path.join(h.f.root, 'install.lock')));
});

test('completed dead-lease cleanup rechecks receipt after its last operator-death await before deleting any gate', async t => {
  const h = await harness(t), id = await h.stop(); await h.dead(); const first = await h.inspect(id), barrier = h.f.path('runtime-maintenance.json');
  const restore = inject(h, 'unlinkSync', (unlink, file) => { const value = unlink(file); if (file === barrier) throw Error('synthetic completed crash'); return value; });
  try { await assert.rejects(h.resume(id, first.proofHash)); } finally { restore(); }
  await h.dead(); const complete = await h.inspect(id), dir = path.join(h.f.root, 'transactions', id + '-owner-maintenance'), gate = path.join(h.f.root, 'install.lock'), brokerGate = h.f.path('broker/broker-owner.gate'), before = [bytes(gate), bytes(brokerGate)]; let calls = 0;
  h.onObserve(() => { if (++calls === 2) fs.appendFileSync(path.join(dir, 'stopped.json'), ' '); });
  await assert.rejects(h.resume(id, complete.proofHash), code('maintenance_changed')); assert.equal(calls >= 2, true); assert.deepEqual(bytes(gate), before[0]); assert.deepEqual(bytes(brokerGate), before[1]);
});

test('foreign-machine copied descriptor, origins and valid seals never enter the local process namespace', async t => {
  const h = await harness(t), id = await h.stop(); await h.dead();
  const dir = path.join(h.f.root, 'transactions', id + '-owner-maintenance'), barrier = h.f.path('runtime-maintenance.json'), receipt = path.join(dir, 'stopped.json');
  const originalBarrier = JSON.parse(bytes(barrier)), originalReceipt = JSON.parse(bytes(receipt)); h.f.d.machineId = 'foreign-machine-fixture';
  fs.writeFileSync(h.f.descriptorPath, canonical(h.f.d)); const origin = Buffer.from(canonical({ installationId: h.f.d.installationId, machineId: h.f.d.machineId })); fs.writeFileSync(path.join(h.f.root, 'origin.json'), origin); fs.writeFileSync(h.f.path('origin.json'), origin);
  const fields = ['dev', 'ino', 'size', 'birthtimeNs', 'mtimeNs', 'ctimeNs'], info = file => ({ hash: hash(bytes(file)), stat: Object.fromEntries(fields.map(k => [k, String(fs.lstatSync(file, { bigint: true })[k])])) });
  const key = crypto.createHmac('sha256', Buffer.from(h.f.d.panelToken, 'hex')).update('ae-core4/maintenance-key/v1\0').update(Buffer.from(h.f.d.controlToken, 'hex')).digest();
  function reseal(record) { record.body.machineId = h.f.d.machineId; record.body.descriptorHash = hash(bytes(h.f.descriptorPath)); for (const [name, file] of [['descriptor', h.f.descriptorPath], ['origin', path.join(h.f.root, 'origin.json')], ['anchor', h.f.path('origin.json')]]) record.body.protected[name] = info(file); record.mac = crypto.createHmac('sha256', key).update('ae-core4/maintenance-record/v1\0' + canonical(record.body)).digest('hex'); return Buffer.from(canonical(record)); }
  fs.writeFileSync(barrier, reseal(originalBarrier)); originalReceipt.body.stopHash = hash(bytes(barrier)); fs.writeFileSync(receipt, reseal(originalReceipt));
  let probes = 0; h.onObserve(() => { probes++; }); const before = h.f.snapshot();
  await assert.rejects(h.inspect(id), code('maintenance_machine')); await assert.rejects(h.resume(id, 'a'.repeat(64)), code('maintenance_machine'));
  assert.equal(probes, 0); assert.deepEqual(h.f.snapshot(), before);
});

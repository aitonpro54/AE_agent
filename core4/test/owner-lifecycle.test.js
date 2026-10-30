'use strict';
// TEMP filesystem state-machine tests. Installed bootstrap/OS death are separate.
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), crypto = require('node:crypto'), path = require('node:path');
const { canonical, hash } = require('../protocol/json');
const { dispatchBinding } = require('../protocol/dispatch');
const { fixture } = require('./fixtures/owner-lifecycle-fixture');
const c = id => ({ protocolVersion: 1, controllerId: 'controller-fixture', channelEpoch: 'epoch-fixture', commandId: id, moduleId: 'project-inspection', operationId: 'inspect', executorHash: 'a'.repeat(64), phase: 'inspect', payloadHash: hash({}), payload: {} });
const error = code => e => e.code === code;
function journal(bodies) {
  const events = [];
  for (const value of bodies) { const body = { ...value, seq: events.length + 1, previousHash: events.at(-1)?.recordHash || 'origin' }; events.push({ ...body, recordHash: hash(body) }); }
  return Buffer.from(events.map(canonical).join('\n') + '\n');
}

test('owner-lifecycle publishes boot before stores and exposes no active lease until markReady owns exact markers', async t => {
  const f = await fixture(t), cap = await f.create();
  assert.equal(cap.mode, 'active'); assert.equal(fs.existsSync(path.join(f.root, 'install.lock')), true);
  const record = JSON.parse(fs.readFileSync(f.path('runtime-owner.json'))); assert.equal(record.body.phase, 'starting'); assert.equal(record.body.receiverIdentity, null);
  assert.throws(() => cap.releaseStartup(), error('owner_lifecycle_released'));
  const stores = f.stores(cap); cap.markReady(); cap.releaseStartup();
  assert.equal(JSON.parse(fs.readFileSync(f.path('runtime-owner.json'))).body.phase, 'active');
  assert.equal(fs.existsSync(path.join(f.root, 'install.lock')), false);
  assert.equal(JSON.parse(fs.readFileSync(f.path('receiver/owner'))).token, cap.receiverToken);
  f.close(cap, stores); assert.equal(fs.existsSync(f.path('runtime-owner.json')), false); assert.equal(f.tracked.size, 0);
});

test('owner-lifecycle refuses same live incarnation without touching its stores and removes only the failed contender gate', async t => {
  const f = await fixture(t), cap = await f.create(), stores = f.stores(cap); cap.markReady(); cap.releaseStartup();
  const before = f.snapshot(); await assert.rejects(f.create(), error('owner_lifecycle_alive')); assert.deepEqual(f.snapshot(), before);
  f.close(cap, stores);
});

test('owner-lifecycle settled dead boot archives exact markers and preserves receiver journal identity and bytes', async t => {
  const f = await fixture(t), first = await f.create(); f.stores(first); first.markReady(); first.releaseStartup();
  const journal = fs.readFileSync(f.path('receiver/completions.ndjson')), oldOwner = fs.readFileSync(f.path('runtime-owner.json'));
  await f.crash(); const second = await f.create();
  assert.equal(second.mode, 'active'); assert.notEqual(second.state().processBootId, first.state().processBootId); assert.deepEqual(fs.readFileSync(f.path('receiver/completions.ndjson')), journal);
  assert.equal(fs.existsSync(f.path('receiver/owner')), false); assert.equal(fs.existsSync(f.path('broker/broker-owner.lock')), false);
  const archived = fs.readdirSync(path.join(f.root, 'transactions')).flatMap(name => { const file = path.join(f.root, 'transactions', name, 'owner'); return fs.existsSync(file) ? [fs.readFileSync(file)] : []; });
  assert.ok(archived.some(bytes => bytes.equals(oldOwner)));
  const stores = f.stores(second); second.markReady(); second.releaseStartup(); assert.deepEqual(fs.readFileSync(f.path('receiver/completions.ndjson')), journal); f.close(second, stores);
});

test('owner-lifecycle crash before first stores reclaims only an attributable startup gate without an absent gate window', async t => {
  const f = await fixture(t); await f.create(); await f.crash();
  const originalRename = f.io.renameSync; let replaced = false;
  f.io.renameSync = function (from, to) { if (to === path.join(f.root, 'install.lock')) { assert.equal(fs.existsSync(to), true); replaced = true; } return originalRename(from, to); };
  const second = await f.create(); assert.equal(replaced, true); assert.equal(second.mode, 'active');
  const stores = f.stores(second); second.markReady(); second.releaseStartup(); f.close(second, stores);
});

test('owner-lifecycle unknown physical history keeps old execution markers and opens only diagnostic ownership', async t => {
  const f = await fixture(t), first = await f.create(), stores = f.stores(first); first.markReady(); first.releaseStartup();
  const command = c('read-pending'); stores.store.begin(command, dispatchBinding(command, stores.store.identity));
  const protectedFiles = ['runtime-owner.json', 'broker/broker-owner.lock', 'receiver/owner', 'receiver/completions.ndjson'];
  const before = Object.fromEntries(protectedFiles.map(name => [name, fs.readFileSync(f.path(name))]));
  await f.crash(); const diagnostic = await f.create();
  assert.equal(diagnostic.mode, 'diagnostic'); assert.equal(diagnostic.state().reason, 'owner_lifecycle_unresolved'); diagnostic.releaseStartup();
  for (const name of protectedFiles) assert.deepEqual(fs.readFileSync(f.path(name)), before[name]);
  f.close(diagnostic); for (const name of protectedFiles) assert.deepEqual(fs.readFileSync(f.path(name)), before[name]);
});

test('owner-lifecycle legacy empty receiver marker is never attributed to a new boot or deleted', async t => {
  const f = await fixture(t); fs.mkdirSync(f.path('receiver')); fs.writeFileSync(f.path('receiver/owner'), '');
  const cap = await f.create(); assert.equal(cap.mode, 'diagnostic'); assert.equal(cap.state().reason, 'owner_lifecycle_legacy_marker');
  assert.equal(fs.readFileSync(f.path('receiver/owner')).length, 0); cap.releaseStartup(); f.close(cap); assert.equal(fs.readFileSync(f.path('receiver/owner')).length, 0);
});

test('owner-lifecycle generic install gate and unavailable process proof refuse without changing protected state', async t => {
  const f = await fixture(t); fs.writeFileSync(path.join(f.root, 'install.lock'), 'foreign-installer-gate'); const before = f.snapshot();
  await assert.rejects(f.create(), error('owner_lifecycle_record')); assert.deepEqual(f.snapshot(), before);
  fs.unlinkSync(path.join(f.root, 'install.lock')); f.failProbe(true); const empty = f.snapshot();
  await assert.rejects(f.create(), error('owner_process_probe_unavailable')); assert.deepEqual(f.snapshot(), empty);
});

test('owner-lifecycle one role key cannot forge provenance and malformed owner data never authorizes marker cleanup', async t => {
  const f = await fixture(t), first = await f.create(), stores = f.stores(first); first.markReady(); first.releaseStartup(); await f.crash();
  const file = f.path('runtime-owner.json'), value = JSON.parse(fs.readFileSync(file)); value.body.scope.birthTicks = '1';
  value.mac = crypto.createHmac('sha256', f.d.controlToken).update('ae-core4/lifecycle-record/v1\0' + canonical(value.body)).digest('hex'); fs.writeFileSync(file, canonical(value));
  const before = f.snapshot(); await assert.rejects(f.create(), error('owner_lifecycle_record')); assert.deepEqual(f.snapshot(), before);
});

test('owner-lifecycle receiver close retains foreign in-place token and replaced inode instead of deleting another marker', async t => {
  for (const replace of [false, true]) {
    const f = await fixture(t), cap = await f.create(), stores = f.stores(cap); cap.markReady(); cap.releaseStartup();
    const file = f.path('receiver/owner'), foreign = Buffer.from(canonical({ version: 1, pid: process.pid, token: crypto.randomUUID() }));
    if (replace) fs.renameSync(file, f.path('receiver/original-owner'));
    fs.writeFileSync(file, foreign); f.close(cap, stores);
    assert.equal(stores.store.fault, true); assert.deepEqual(fs.readFileSync(file), foreign); assert.equal(fs.existsSync(f.path('runtime-owner.json')), true); assert.equal(f.tracked.size, 0);
  }
});

test('owner-lifecycle conflicting ledger and receiver outcomes keep the old writer markers and diagnostic fence', async t => {
  for (const [outcome, state] of [['applied', 'rejected'], ['rejected', 'succeeded']]) {
    const f = await fixture(t), cap = await f.create(), stores = f.stores(cap); cap.markReady(); cap.releaseStartup();
    const command = { ...c('mutation-conflict'), phase: 'mutate', moduleId: 'titles-current-target', operationId: 'replace-text' }, binding = dispatchBinding(command, stores.store.identity);
    stores.store.begin(command, binding); stores.store.complete(command.commandId, { protocolVersion: 1, commandId: command.commandId, executorHash: command.executorHash, payloadHash: command.payloadHash, result: { outcome } });
    fs.writeFileSync(f.path('broker/ledger.ndjson'), journal([{ type: 'intent', commandId: command.commandId, dispatchBinding: binding }, { type: 'command', commandId: command.commandId, state }]));
    const protectedNames = ['runtime-owner.json', 'broker/broker-owner.lock', 'receiver/owner', 'receiver/completions.ndjson', 'broker/ledger.ndjson'];
    const before = Object.fromEntries(protectedNames.map(name => [name, fs.readFileSync(f.path(name))]));
    await f.crash(); const diagnostic = await f.create(); assert.equal(diagnostic.mode, 'diagnostic'); assert.equal(diagnostic.state().reason, 'owner_lifecycle_history_correlation'); diagnostic.releaseStartup();
    for (const name of protectedNames) assert.deepEqual(fs.readFileSync(f.path(name)), before[name]);
    f.close(diagnostic);
  }
});

test('owner-lifecycle matching foreign origin drift during process observation never becomes a new recovery baseline', async t => {
  const f = await fixture(t), cap = await f.create(); f.stores(cap); cap.markReady(); cap.releaseStartup(); await f.crash();
  const protectedNames = ['runtime-owner.json', 'broker/broker-owner.lock', 'receiver/owner', 'receiver/completions.ndjson'], before = Object.fromEntries(protectedNames.map(name => [name, fs.readFileSync(f.path(name))]));
  const open = f.io.openSync; let queued = false;
  f.io.openSync = (...args) => { const fd = open(...args); if (!queued && args[0] === f.path('runtime-owner.json') && args[1] === 'r') { queued = true; queueMicrotask(() => {
    const foreign = canonical({ installationId: 'foreign-installation', machineId: f.d.machineId }); fs.writeFileSync(path.join(f.root, 'origin.json'), foreign); fs.writeFileSync(f.path('origin.json'), foreign);
  }); } return fd; };
  await assert.rejects(f.create(), error('owner_lifecycle_changed')); assert.equal(queued, true);
  for (const name of protectedNames) assert.deepEqual(fs.readFileSync(f.path(name)), before[name]); assert.equal(fs.existsSync(f.path('runtime-diagnostic.json')), false);
});

test('owner-lifecycle origin byte drift after stores before markReady refuses active publication', async t => {
  const f = await fixture(t), cap = await f.create(); f.stores(cap);
  const owner = fs.readFileSync(f.path('runtime-owner.json')), raw = fs.readFileSync(path.join(f.root, 'origin.json'));
  fs.writeFileSync(path.join(f.root, 'origin.json'), Buffer.concat([raw, Buffer.from('\n')])); fs.writeFileSync(f.path('origin.json'), Buffer.concat([raw, Buffer.from('\n')]));
  assert.throws(() => cap.markReady(), error('owner_lifecycle_changed')); assert.deepEqual(fs.readFileSync(f.path('runtime-owner.json')), owner); assert.equal(fs.existsSync(f.path('runtime-owner.next')), false);
});

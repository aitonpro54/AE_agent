'use strict';
// Explicit synthetic installation verifier/lifecycle/native inventory; real TEMP
// files. There is no caller-selected production probe or live reset in this suite.
const nodeTest = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), Module = require('node:module');
const { canonical, hash } = require('../protocol/json'), { dispatchBinding } = require('../protocol/dispatch');
const { fixture } = require('./fixtures/owner-lifecycle-fixture');
const test = (name, fn) => nodeTest('start-over-state ' + name, { timeout: 10000 }, fn);
const error = code => e => e.code === code;
const command = () => ({ protocolVersion: 1, controllerId: 'controller-test', channelEpoch: 'epoch-test', commandId: 'old-read', moduleId: 'project-inspection', operationId: 'inspect', executorHash: 'a'.repeat(64), phase: 'inspect', payloadHash: hash({}), payload: {} });
async function harness(t, diagnostic = false) {
  const f = await fixture(t); f.d.packageHash = 'c'.repeat(64); fs.writeFileSync(f.descriptorPath, canonical(f.d)); fs.writeFileSync(path.join(f.root, 'core-client.json'), canonical({ fixture: 'client' }));
  let cap = await f.create(), stores = f.stores(cap); cap.markReady(); cap.releaseStartup();
  const previous = cap, c = command();
  if (diagnostic) { stores.store.begin(c, dispatchBinding(c, stores.store.identity)); await f.crash(); cap = await f.create(); assert.equal(cap.mode, 'diagnostic'); cap.releaseStartup(); stores = null; }
  const calls = []; let scanHook, closeOnStop = false;
  const filename = path.resolve(__dirname, '../runtime/start-over-state.js'), mod = new Module(filename, module); mod.filename = filename; mod.paths = Module._nodeModulePaths(path.dirname(filename));
  mod.require = name => {
    if (name === 'node:fs') return f.io;
    if (name === './installation') return { verifyInstallation(file) { assert.equal(file, f.descriptorPath); return JSON.parse(fs.readFileSync(file)); } };
    if (name === './start-over-process') return { async observeStartOverInventory() { calls.push('inventory'); if (scanHook) { const result = await scanHook(); if (result !== undefined) return result; } return { version: 1, machineId: f.d.machineId, observedAt: new Date().toISOString(), processes: [{ pid: 42, birthTicks: '639292254253597850', executablePath: 'C:\\AE\\AfterFX.exe' }] }; } };
    return require(name.startsWith('.') ? path.resolve(path.dirname(filename), name) : name);
  };
  mod._compile(fs.readFileSync(filename, 'utf8'), filename); const api = mod.exports;
  const options = { installation: f.d, descriptorPath: f.descriptorPath, lifecycle: cap, freeze() { calls.push('freeze'); }, fencePhysical() { calls.push('physical-fence'); }, stop(id) { calls.push('stop:' + id); if (closeOnStop) f.close(cap, stores); return { requested: true, id, fault: null }; } };
  const owner = api.createOwnerStartOver(options);
  return { ...f, cap, previous, stores, c, api, options, owner, calls, scan(fn) { scanHook = fn; }, closeOnStop(value) { closeOnStop = value; }, inspect() { return api.inspectStartOver({ installation: f.d, descriptorPath: f.descriptorPath }); } };
}
test('an ancestor junction cannot redirect retained receiver bytes outside their original directory', async t => {
  const f = await harness(t), source = f.path('receiver'), retained = f.path('receiver-retained-for-path-check');
  assert.equal(path.resolve(source), source); assert.equal(path.resolve(retained), retained);
  assert.ok(source.startsWith(f.d.stateDir + path.sep) && retained.startsWith(f.d.stateDir + path.sep));
  const before = fs.readFileSync(path.join(source, 'completions.ndjson'));
  fs.renameSync(source, retained);
  try {
    fs.symlinkSync(retained, source, 'junction');
    try { await assert.rejects(f.owner.request(), error('start_over_path')); }
    finally { fs.unlinkSync(source); }
    assert.deepEqual(fs.readFileSync(path.join(retained, 'completions.ndjson')), before);
    assert.equal(fs.existsSync(f.path('runtime-start-over.json')), false);
  } finally { fs.renameSync(retained, source); }
});
test('a missing file still requires the complete existing parent path to be canonical', async t => {
  const f = await harness(t), real = f.io.realpathSync, missing = f.path('runtime-start-over.json');
  assert.equal(fs.existsSync(missing), false);
  f.io.realpathSync = file => file === f.d.stateDir ? f.d.stateDir + '-foreign' : real(file);
  try { await assert.rejects(f.owner.request(), error('start_over_path')); }
  finally { f.io.realpathSync = real; }
  assert.equal(fs.existsSync(missing), false);
  assert.deepEqual(f.calls, ['freeze', 'physical-fence']);
});
test('noncanonical spelling of an existing full marker path refuses before intent publication', async t => {
  const f = await harness(t), real = f.io.realpathSync, marker = f.path('receiver/owner');
  f.io.realpathSync = file => file === marker ? marker + '-foreign' : real(file);
  try { await assert.rejects(f.owner.request(), error('start_over_path')); }
  finally { f.io.realpathSync = real; }
  assert.equal(fs.existsSync(f.path('runtime-start-over.json')), false);
  assert.deepEqual(f.calls, ['freeze', 'physical-fence']);
});
test('freezes admission and physical delivery before durable intent; exactly one new ID and stop request survive repeat', async t => {
  const f = await harness(t), before = fs.readFileSync(f.path('receiver/completions.ndjson'));
  f.scan(async () => {
    assert.deepEqual(f.calls, ['freeze', 'physical-fence', 'inventory']); const v = f.inspect(); assert.equal(v.phase, 'intent-without-inventory'); assert.equal(v.resetPermit, false);
    assert.equal(fs.existsSync(f.path('runtime-start-over.json')), true);
  });
  const a = f.owner.request(), b = f.owner.request(); assert.equal(a, b); const result = await a;
  assert.equal(result.phase, 'stop-requested'); assert.equal(result.requiresAEExit, false); assert.equal(result.resetComplete, false); assert.equal(result.aeAuthority, false);
  assert.equal(f.calls.filter(v => v.startsWith('stop:')).length, 1); assert.equal((await f.owner.request()).id, result.id);
  assert.deepEqual(fs.readFileSync(f.path('receiver/completions.ndjson')), before);
  const intent = fs.readFileSync(f.path('runtime-start-over.json')), directory = path.join(f.root, 'transactions', result.id + '-start-over');
  assert.deepEqual(fs.readFileSync(path.join(directory, 'intent.json')), intent); assert.equal(fs.statSync(f.path('runtime-start-over.json'), { bigint: true }).nlink, 2n);
  assert.equal(f.inspect().id, result.id); assert.notEqual(result.newSessionId, result.id);
});
test('diagnostic request retains previous active producer and UNKNOWN rather than trusting diagnostic mode as a barrier', async t => {
  const f = await harness(t, true), before = fs.readFileSync(f.path('receiver/completions.ndjson')), result = await f.owner.request();
  assert.equal(result.requiresAEExit, true); assert.equal(result.actors.length, 2); assert.notEqual(result.actors[0].birthTicks, result.actors[1].birthTicks);
  assert.equal(result.actors.some(s => s.bootId === f.previous.state().processBootId), true); assert.equal(result.actors.some(s => s.bootId === f.cap.state().processBootId), true);
  assert.deepEqual(fs.readFileSync(f.path('receiver/completions.ndjson')), before); assert.equal(fs.existsSync(f.path('runtime-owner.json')), true); assert.equal(fs.existsSync(f.path('receiver/owner')), true);
});
test('native query failure retains original intent and markers; status does not invent process death or completion', async t => {
  const f = await harness(t); f.scan(async () => { throw Object.assign(Error('probe failed'), { code: 'start_over_process_probe_unavailable' }); });
  const before = fs.readFileSync(f.path('runtime-owner.json')); await assert.rejects(f.owner.request(), error('start_over_process_probe_unavailable'));
  assert.equal(f.owner.status().fault, 'start_over_process_probe_unavailable'); assert.equal(f.inspect().phase, 'intent-without-inventory'); assert.deepEqual(fs.readFileSync(f.path('runtime-owner.json')), before);
  await assert.rejects(f.owner.request(), error('start_over_process_probe_unavailable')); assert.equal(f.calls.filter(v => v === 'inventory').length, 1); assert.equal(f.calls.some(v => v.startsWith('stop:')), false);
});
test('late original completion during native observation is append-only history without weakening the initial risk requirement', async t => {
  const f = await harness(t); f.stores.store.begin(f.c, dispatchBinding(f.c, f.stores.store.identity));
  f.scan(async () => f.stores.store.complete(f.c.commandId, { protocolVersion: 1, commandId: f.c.commandId, executorHash: f.c.executorHash, payloadHash: f.c.payloadHash, result: { outcome: 'rejected' } }));
  const result = await f.owner.request(); assert.equal(result.requiresAEExit, true); assert.equal(result.phase, 'stop-requested');
});
test('new physical begin across the observation await preserves the intent and refuses stop continuation', async t => {
  const f = await harness(t); f.scan(async () => f.stores.store.begin(f.c, dispatchBinding(f.c, f.stores.store.identity)));
  await assert.rejects(f.owner.request(), error('start_over_new_physical_command')); assert.equal(fs.existsSync(f.path('runtime-start-over.json')), true); assert.equal(f.calls.some(v => v.startsWith('stop:')), false);
});
test('clean close after request keeps inspection valid even when ordinary close removed current owner markers', async t => {
  const f = await harness(t); f.closeOnStop(true); const result = await f.owner.request(); assert.equal(result.phase, 'stop-requested'); assert.equal(fs.existsSync(f.path('runtime-owner.json')), false); assert.equal(f.inspect().id, result.id);
});
test('descriptor bytes changed across native await refuse publication and keep the reset fence', async t => {
  const f = await harness(t); f.scan(async () => fs.appendFileSync(f.descriptorPath, '\n'));
  await assert.rejects(f.owner.request(), error('start_over_changed')); assert.equal(fs.existsSync(f.path('runtime-start-over.json')), true); assert.equal(f.calls.some(v => v.startsWith('stop:')), false);
});
test('same bytes in a replaced barrier inode cannot substitute the original published intent', async t => {
  const f = await harness(t); await f.owner.request(); const file = f.path('runtime-start-over.json'), bytes = fs.readFileSync(file); fs.unlinkSync(file); fs.writeFileSync(file, bytes);
  assert.throws(() => f.inspect(), error('start_over_intent_identity'));
});
test('same bytes replacing both intent aliases across await cannot become a fresh identity baseline', async t => {
  const f = await harness(t); f.scan(async () => {
    const file = f.path('runtime-start-over.json'), b = fs.readFileSync(file), id = JSON.parse(b).body.id, original = path.join(f.root, 'transactions', id + '-start-over', 'intent.json');
    fs.unlinkSync(file); fs.unlinkSync(original); fs.writeFileSync(original, b); fs.linkSync(original, file);
  });
  await assert.rejects(f.owner.request(), error('start_over_intent_identity')); assert.equal(f.calls.some(v => v.startsWith('stop:')), false);
});
test('foreign marker and already-running maintenance refuse before an intent is published', async t => {
  for (const mode of ['marker', 'maintenance', 'gate']) {
    const f = await harness(t);
    if (mode === 'marker') { fs.unlinkSync(f.path('receiver/owner')); fs.writeFileSync(f.path('receiver/owner'), 'foreign'); }
    if (mode === 'maintenance') fs.writeFileSync(f.path('runtime-maintenance.json'), 'foreign');
    if (mode === 'gate') fs.writeFileSync(path.join(f.root, 'install.lock'), 'foreign');
    await assert.rejects(f.owner.request(), error(mode === 'marker' ? 'start_over_foreign_marker' : 'start_over_install_busy'));
    assert.deepEqual(f.calls, ['freeze', 'physical-fence']); assert.equal(fs.existsSync(f.path('runtime-start-over.json')), false);
  }
});
test('publication failure retains freeze and unpublished preparation without removing any marker or retrying', async t => {
  const f = await harness(t), link = f.io.linkSync; f.io.linkSync = (from, to) => { if (to === f.path('runtime-start-over.json')) throw Object.assign(Error('denied'), { code: 'EACCES' }); return link(from, to); };
  const before = fs.readFileSync(f.path('runtime-owner.json')); await assert.rejects(f.owner.request(), error('EACCES')); await assert.rejects(f.owner.request(), error('EACCES'));
  assert.deepEqual(f.calls, ['freeze', 'physical-fence']); assert.deepEqual(fs.readFileSync(f.path('runtime-owner.json')), before); assert.equal(f.owner.status().fault, 'EACCES'); assert.equal(fs.existsSync(f.path('runtime-start-over.json')), false);
  assert.equal(fs.readdirSync(path.join(f.root, 'transactions')).some(n => n.endsWith('-start-over')), true);
});
test('source API has no native injection finisher restart or fence removal and foreign-machine descriptor cannot enter local scope', async t => {
  const f = await harness(t); assert.deepEqual(Object.keys(f.api).sort(), ['createOwnerStartOver', 'inspectStartOver', 'startOverBarrierContext', 'startOverFinisherContext']);
  assert.throws(() => f.api.startOverBarrierContext({}), error('start_over_barrier_brand'));
  assert.throws(() => f.api.startOverFinisherContext({}), error('start_over_finish_brand'));
  assert.throws(() => f.api.createOwnerStartOver({ ...f.options, probe: () => [] }), error('start_over_schema'));
  assert.throws(() => f.api.inspectStartOver({ installation: { ...f.d, machineId: 'foreign-machine' }, descriptorPath: f.descriptorPath }), error('start_over_installation'));
  assert.equal(f.inspect().phase, 'running'); assert.deepEqual(f.calls, []);
});
test('journal inode anchors preserve original bytes and refuse a recreated current journal even when its chain is identical', async t => {
  const f = await harness(t); f.scan(async () => {
    const file = f.path('receiver/completions.ndjson'), bytes = fs.readFileSync(file); fs.unlinkSync(file); fs.writeFileSync(file, bytes);
  });
  await assert.rejects(f.owner.request(), error('start_over_prefix_changed')); const id = f.owner.status().id;
  const anchor = path.join(f.root, 'transactions', id + '-start-over', 'original-receiver'); assert.equal(fs.existsSync(anchor), true); assert.notEqual(fs.statSync(anchor, { bigint: true }).ino, fs.statSync(f.path('receiver/completions.ndjson'), { bigint: true }).ino);
});
test('stages are retained inert bytes but directory or symlink replacements cannot enter an accepted phase', async t => {
  const f = await harness(t), result = await f.owner.request(), dir = path.join(f.root, 'transactions', result.id + '-start-over'), file = path.join(dir, 'inventory.json.stage-12345678-1234-4123-8123-123456789abc');
  fs.writeFileSync(file, '{torn'); assert.equal(f.inspect().phase, 'stop-requested'); fs.unlinkSync(file); fs.mkdirSync(file); assert.throws(() => f.inspect(), error('start_over_path'));
});
test('native inventory schema and freshness are checked before persistence or stop request', async t => {
  for (const patch of [{ machineId: 'foreign' }, { observedAt: new Date(Date.now() - 7000).toISOString() }, { processes: [{ pid: 42, birthTicks: '1', executablePath: null }] }]) {
    const f = await harness(t); f.scan(async () => ({ version: 1, machineId: f.d.machineId, observedAt: new Date().toISOString(), processes: [], ...patch }));
    await assert.rejects(f.owner.request(), error('start_over_inventory')); assert.equal(f.inspect().phase, 'intent-without-inventory'); assert.equal(f.calls.some(v => v.startsWith('stop:')), false);
  }
});
test('stop refusal leaves a durable intent with inventory and never claims a stopped receipt', async t => {
  const f = await harness(t), owner = f.api.createOwnerStartOver({ ...f.options, stop() { throw Object.assign(Error('stop refused'), { code: 'maintenance_in_progress' }); } });
  await assert.rejects(owner.request(), error('maintenance_in_progress')); assert.equal(f.inspect().phase, 'intent-with-inventory'); assert.equal(f.inspect().resetComplete, false); assert.equal(owner.status().fault, 'maintenance_in_progress');
});
test('physical fence callback failure is a persistent volatile fault in the requester and no intent or retry is fabricated', async t => {
  const f = await harness(t), owner = f.api.createOwnerStartOver({ ...f.options, fencePhysical() { throw Object.assign(Error('fence failed'), { code: 'physical_fence_failed' }); } });
  await assert.rejects(owner.request(), error('physical_fence_failed')); await assert.rejects(owner.request(), error('physical_fence_failed'));
  assert.equal(owner.status().fault, 'physical_fence_failed'); assert.deepEqual(f.calls, ['freeze']); assert.equal(f.inspect().phase, 'running');
});

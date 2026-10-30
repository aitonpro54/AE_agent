'use strict';
// TEMP files only. Faults/probes are synthetic; no process is signalled.
const nodeTest = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), os = require('node:os'), crypto = require('node:crypto'), Module = require('node:module');
const { canonical } = require('../protocol/json');
const { fixture } = require('./fixtures/owner-lifecycle-fixture');
const test = (name, fn) => nodeTest('owner-marker-publication ' + name, { timeout: 10000 }, fn);
const fault = () => Object.assign(new Error('synthetic publication crash'), { code: 'fixture_publication_crash' });
const bytes = file => fs.existsSync(file) ? fs.readFileSync(file) : null;
function harness(t) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'core4-owner-marker-')), opened = new Map();
  const io = { ...fs,
    openSync(...args) { const fd = fs.openSync(...args); opened.set(fd, String(args[0])); return fd; },
    closeSync(fd) { opened.delete(fd); return fs.closeSync(fd); }
  };
  function load(relative) {
    const filename = path.resolve(__dirname, relative), mod = new Module(filename, module);
    mod.filename = filename; mod.paths = Module._nodeModulePaths(path.dirname(filename));
    mod.require = name => name === 'node:fs' ? io : require(name.startsWith('.') ? path.resolve(path.dirname(filename), name) : name);
    mod._compile(fs.readFileSync(filename, 'utf8'), filename); return mod.exports;
  }
  const lockApi = load('../core/state-lock.js'), storeApi = load('../integrations/cep/completion-store.js');
  t.after(() => { for (const fd of opened.keys()) { try { fs.closeSync(fd); } catch {} } assert.ok(base.startsWith(path.join(os.tmpdir(), 'core4-owner-marker-'))); fs.rmSync(base, { recursive: true, force: true }); });
  return { base, io, opened, ...lockApi, ...storeApi };
}
const kinds = ['acquire-gate', 'broker-owner', 'release-gate', 'receiver-owner'];
function operation(t, kind) {
  const h = harness(t), token = crypto.randomUUID(), directory = path.join(h.base, kind === 'receiver-owner' ? 'receiver' : 'broker');
  fs.mkdirSync(directory); let first;
  if (kind === 'release-gate') { first = h.acquireStateLock(directory, { token }); assert.equal(first.error, null); }
  const target = path.join(directory, kind.endsWith('gate') ? 'broker-owner.gate' : kind === 'broker-owner' ? 'broker-owner.lock' : 'owner');
  const expected = Buffer.from(kind.endsWith('gate') ? token : kind === 'broker-owner' ? JSON.stringify({ pid: process.pid, token }) : canonical({ version: 1, pid: process.pid, token }));
  return { ...h, token, directory, target, expected, stage: target + '.stage-' + token,
    run() { if (first) return first.release(); return kind === 'receiver-owner' ? h.openCompletionStore({ directory, io: h.io, ownerToken: token }) : h.acquireStateLock(directory, { token }); },
    finish(result) { if (kind === 'receiver-owner') result?.close(); else result?.release?.(); }
  };
}
function patch(h, method, fn) { const original = h.io[method]; h.io[method] = (...args) => fn(original, ...args); return () => { h.io[method] = original; }; }
function broken(result) { if (result && 'closed' in result) assert.equal(result.closed, true); else if (result) assert.notEqual(result.error, null); }

test('all process markers publish one complete fsynced inode, including the release gate nonce', t => {
  for (const kind of kinds) {
    const h = operation(t, kind), synced = new Set(); let published = 0;
    const restoreSync = patch(h, 'fsyncSync', (sync, fd) => { const value = sync(fd); if (h.opened.get(fd) === h.stage) { assert.equal(bytes(h.target), null); synced.add(fd); } return value; });
    const restoreLink = patch(h, 'linkSync', (link, from, to) => {
      if (to !== h.target) return link(from, to);
      const fd = [...h.opened].find(([, file]) => file === from)?.[0];
      assert.ok(synced.has(fd)); assert.equal(bytes(to), null); assert.deepEqual(bytes(from), h.expected);
      const value = link(from, to); published++; assert.deepEqual(bytes(to), h.expected);
      assert.equal(fs.statSync(from, { bigint: true }).ino, fs.statSync(to, { bigint: true }).ino); return value;
    });
    const result = h.run(); restoreSync(); restoreLink(); assert.equal(published, 1); assert.equal(bytes(h.stage), null);
    if (kind !== 'release-gate') { assert.equal(kind === 'receiver-owner' ? result.closed : result.error !== null, false); h.finish(result); }
    assert.equal(bytes(h.target), null);
  }
});

for (const kind of kinds) test(kind + ' short stage write never publishes an incomplete target and retains partial evidence', t => {
  const h = operation(t, kind); let fired = false;
  const restore = patch(h, 'writeSync', (write, fd, data, ...args) => {
    if (h.opened.get(fd) !== h.stage) return write(fd, data, ...args);
    fired = true; assert.equal(bytes(h.target), null); return write(fd, data.subarray(0, 7));
  });
  const result = h.run(); restore(); broken(result); assert.equal(fired, true); assert.equal(bytes(h.target), null); assert.deepEqual(bytes(h.stage), h.expected.subarray(0, 7)); h.finish(result);
  assert.equal(bytes(h.target), null); assert.deepEqual(bytes(h.stage), h.expected.subarray(0, 7));
});

test('fsync faults leave only unpublished stage evidence for every process marker', t => {
  for (const kind of kinds) {
    const h = operation(t, kind); let fired = false;
    const restore = patch(h, 'fsyncSync', (sync, fd) => { if (h.opened.get(fd) !== h.stage) return sync(fd); fired = true; fs.ftruncateSync(fd, 5); throw fault(); });
    const result = h.run(); restore(); broken(result); assert.equal(fired, true); assert.equal(bytes(h.target), null); assert.deepEqual(bytes(h.stage), h.expected.subarray(0, 5)); h.finish(result);
    assert.equal(bytes(h.target), null); assert.deepEqual(bytes(h.stage), h.expected.subarray(0, 5));
  }
});

test('a crash before link leaves target absent although the complete stage was already fsynced', t => {
  for (const kind of kinds) {
    const h = operation(t, kind); let fired = false;
    const restore = patch(h, 'linkSync', (link, from, to) => { if (to !== h.target) return link(from, to); fired = true; assert.equal(bytes(to), null); assert.deepEqual(bytes(from), h.expected); throw fault(); });
    const result = h.run(); restore(); broken(result); assert.equal(fired, true); assert.equal(bytes(h.target), null); assert.deepEqual(bytes(h.stage), h.expected); h.finish(result);
    assert.equal(bytes(h.target), null);
  }
});

test('a crash immediately after link preserves the whole published marker and never guesses that acquisition succeeded', t => {
  for (const kind of kinds) {
    const h = operation(t, kind); let fired = false;
    const restore = patch(h, 'linkSync', (link, from, to) => { const value = link(from, to); if (to === h.target) { fired = true; assert.deepEqual(bytes(to), h.expected); throw fault(); } return value; });
    const result = h.run(); restore(); broken(result); assert.equal(fired, true); assert.deepEqual(bytes(h.target), h.expected); assert.deepEqual(bytes(h.stage), h.expected); h.finish(result);
    assert.deepEqual(bytes(h.target), h.expected);
  }
});

test('exclusive publication collision preserves foreign markers byte for byte', t => {
  for (const kind of kinds) {
    const h = operation(t, kind), foreign = Buffer.from('foreign marker including a torn body'); fs.writeFileSync(h.target, foreign);
    const before = fs.statSync(h.target, { bigint: true }), result = h.run(); broken(result); h.finish(result);
    assert.deepEqual(bytes(h.target), foreign); assert.equal(fs.statSync(h.target, { bigint: true }).ino, before.ino);
  }
});

test('an existing same-nonce stage is never reused, truncated, or mistaken for authority', t => {
  for (const kind of ['acquire-gate', 'receiver-owner']) {
    const h = operation(t, kind), partial = Buffer.from('uncertain old partial'); fs.writeFileSync(h.stage, partial);
    const result = h.run(); broken(result); h.finish(result); assert.deepEqual(bytes(h.stage), partial); assert.equal(bytes(h.target), null);
    const next = crypto.randomUUID(), opened = kind === 'acquire-gate' ? h.acquireStateLock(h.directory, { token: next }) : h.openCompletionStore({ directory: h.directory, io: h.io, ownerToken: next });
    assert.equal(kind === 'acquire-gate' ? opened.error : opened.closed, kind === 'acquire-gate' ? null : false); h.finish(opened); assert.deepEqual(bytes(h.stage), partial);
  }
});

test('stage replacement after publication is retained as foreign evidence while the target stays complete', t => {
  for (const kind of ['broker-owner', 'receiver-owner']) {
    const h = operation(t, kind), foreign = Buffer.from('foreign stage');
    const restore = patch(h, 'linkSync', (link, from, to) => { const value = link(from, to); if (to === h.target) { fs.unlinkSync(from); fs.writeFileSync(from, foreign); } return value; });
    const result = h.run(); restore(); broken(result); h.finish(result); assert.deepEqual(bytes(h.target), h.expected); assert.deepEqual(bytes(h.stage), foreign);
  }
});

test('release refuses modified or replaced broker owners and preserves the foreign bytes', t => {
  for (const replace of [false, true]) {
    const h = harness(t), directory = path.join(h.base, 'broker'), token = crypto.randomUUID(), owner = path.join(directory, 'broker-owner.lock'), lock = h.acquireStateLock(directory, { token }); assert.equal(lock.error, null);
    if (replace) fs.renameSync(owner, owner + '.original');
    const foreign = Buffer.from(JSON.stringify({ pid: process.pid, token: crypto.randomUUID() })); fs.writeFileSync(owner, foreign); lock.release(); assert.deepEqual(bytes(owner), foreign); assert.equal(bytes(path.join(directory, 'broker-owner.gate')), null);
  }
});

test('known-dead legacy reclaim can retry exclusive publication with the same trusted nonce', t => {
  const h = harness(t), directory = path.join(h.base, 'broker'); fs.mkdirSync(directory);
  fs.writeFileSync(path.join(directory, 'broker-owner.lock'), JSON.stringify({ pid: 123456789, token: 'legacy-owner' }));
  const kill = process.kill; let probes = 0, lock;
  process.kill = (pid, signal) => { assert.equal(pid, 123456789); assert.equal(signal, 0); probes++; throw Object.assign(new Error('synthetic absent PID'), { code: 'ESRCH' }); };
  try { lock = h.acquireStateLock(directory, { token: crypto.randomUUID() }); } finally { process.kill = kill; }
  assert.equal(probes, 1); assert.equal(lock.error, null); lock.release(); assert.equal(bytes(path.join(directory, 'broker-owner.lock')), null);
});

test('settled dead boot recovery ignores unpublished orphan stages and a new nonce publishes fresh complete markers', async t => {
  const f = await fixture(t), h = harness(t), first = await f.create();
  const lock = h.acquireStateLock(f.path('broker'), { token: first.brokerToken }); assert.equal(lock.error, null);
  const store = h.openCompletionStore({ directory: f.path('receiver'), io: f.io, ownerToken: first.receiverToken }); assert.equal(store.closed, false); first.markReady(); first.releaseStartup();
  const orphanGate = f.path('broker/broker-owner.gate.stage-' + first.brokerToken), originalWrite = h.io.writeSync;
  h.io.writeSync = (fd, data, ...args) => h.opened.get(fd) === orphanGate ? originalWrite(fd, data.subarray(0, 6)) : originalWrite(fd, data, ...args);
  try { lock.release(); } finally { h.io.writeSync = originalWrite; }
  const contenderToken = crypto.randomUUID(), contender = h.openCompletionStore({ directory: f.path('receiver'), io: f.io, ownerToken: contenderToken }); assert.equal(contender.closed, true); contender.close();
  const orphanReceiver = f.path('receiver/owner.stage-' + contenderToken), preserved = { [orphanGate]: bytes(orphanGate), [orphanReceiver]: bytes(orphanReceiver) };
  assert.equal(preserved[orphanGate].length, 6); assert.ok(preserved[orphanReceiver].length > 0);
  const protectedFiles = [f.descriptorPath, path.join(f.root, 'origin.json'), f.path('origin.json'), f.path('receiver/completions.ndjson')], before = protectedFiles.map(bytes);
  await f.crash(); const next = await f.create(); assert.equal(next.mode, 'active'); assert.notEqual(next.brokerToken, first.brokerToken); assert.notEqual(next.receiverToken, first.receiverToken);
  const stores = f.stores(next); next.markReady(); next.releaseStartup();
  for (const [file, value] of Object.entries(preserved)) assert.deepEqual(bytes(file), value);
  protectedFiles.forEach((file, i) => assert.deepEqual(bytes(file), before[i])); f.close(next, stores);
});

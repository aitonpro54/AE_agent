'use strict';
// Synthetic verifier/process birth, real TEMP files/fds and HTTP port0 only.
const nodeTest = require('node:test');
const test = (name, fn) => nodeTest('owner-lifecycle-faults ' + name, { timeout: 10000 }, fn);
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { fixture } = require('./fixtures/owner-lifecycle-fixture');
const FAULT = () => Object.assign(new Error('explicit synthetic phase crash'), { code: 'fixture_phase_crash' });
const bytes = file => fs.existsSync(file) ? fs.readFileSync(file) : null;
const body = file => { try { return JSON.parse(fs.readFileSync(file)).body; } catch { return null; } };
const kind = file => body(path.join(path.dirname(file), 'intent.json'))?.kind;
const publication = file => file.replace(/\.stage-[a-f0-9-]{36}$/, '');
const crashError = error => error.code === 'fixture_phase_crash';
function transactions(f, type) {
  return fs.readdirSync(path.join(f.root, 'transactions')).map(name => path.join(f.root, 'transactions', name)).filter(dir => body(path.join(dir, 'intent.json'))?.kind === type);
}
function protectedBytes(f) {
  return Object.fromEntries([f.descriptorPath, path.join(f.root, 'origin.json'), f.path('origin.json'), f.path('receiver/completions.ndjson'), f.path('broker/ledger.ndjson')].map(file => [file, bytes(file)]));
}
function unchanged(saved) { for (const [file, expected] of Object.entries(saved)) assert.deepEqual(bytes(file), expected, file); }
function incomplete(f, type) { const found = transactions(f, type).filter(dir => !fs.existsSync(path.join(dir, 'completion.json'))); assert.equal(found.length, 1); return found[0]; }
function inject(f, method, intercept) {
  const original = f.io[method]; f.io[method] = (...args) => intercept(original, ...args);
  return () => { f.io[method] = original; };
}
async function active(f, brokerGate = false) {
  const cap = await f.create(), stores = f.stores(cap); cap.markReady(); cap.releaseStartup();
  if (brokerGate) fs.writeFileSync(f.path('broker/broker-owner.gate'), cap.brokerToken);
  return { cap, stores };
}
async function certifyNew(f, cap, saved) {
  assert.equal(cap.mode, 'active'); assert.equal(body(f.path('runtime-owner.json')).phase, 'starting');
  assert.throws(() => cap.releaseStartup(), error => error.code === 'owner_lifecycle_released');
  const stores = f.stores(cap); cap.markReady(); cap.releaseStartup();
  assert.equal(body(f.path('runtime-owner.json')).phase, 'active'); unchanged(saved); f.close(cap, stores); unchanged(saved);
}
async function fencedTwice(f, saved, provenance) {
  for (let attempt = 0; attempt < 2; attempt++) {
    await f.crash();
    let cap;
    try { cap = await f.create(); }
    catch (error) { assert.match(error.code, /^owner_lifecycle_|^owner_process_probe_unavailable$/); }
    if (cap) assert.equal(cap.mode, 'diagnostic', 'startup attempt ' + (attempt + 1) + ' must not bypass an incomplete/corrupt lifecycle transaction');
    unchanged(saved); unchanged(provenance);
  }
}
async function interruptedRecovery(f, marker = 'owner') {
  await active(f, true); const saved = protectedBytes(f); await f.crash(); let fired = false;
  const restore = inject(f, 'renameSync', (rename, from, to) => {
    const value = rename(from, to);
    if (!fired && path.basename(to) === marker && kind(to) === 'owner-recovery-intent') { fired = true; throw FAULT(); }
    return value;
  });
  try { await assert.rejects(f.create(), crashError); } finally { restore(); }
  assert.equal(fired, true); return { saved, dir: incomplete(f, 'owner-recovery-intent') };
}
function crashReadyStage(f, cap, record) {
  let stage;
  const restore = inject(f, 'fsyncSync', (sync, fd) => {
    const file = f.openFiles.get(fd);
    if (!stage && file && path.basename(publication(file)) === record && (record === 'intent.json' ? body(file)?.kind : kind(file)) === 'owner-ready-intent') {
      stage = file; fs.ftruncateSync(fd, 9); throw FAULT();
    }
    return sync(fd);
  });
  try { assert.throws(() => cap.markReady(), crashError); } finally { restore(); }
  assert.ok(stage); assert.equal(bytes(publication(stage)), null); assert.equal(bytes(stage).length, 9);
  assert.throws(() => cap.releaseStartup(), error => error.code === 'owner_lifecycle_released'); return stage;
}

test('markReady crash after starting-owner archive resumes exact intent before publishing a fresh boot', async t => {
  const f = await fixture(t), cap = await f.create(); f.stores(cap); const saved = protectedBytes(f), starting = bytes(f.path('runtime-owner.json')); let fired = false;
  const restore = inject(f, 'renameSync', (rename, from, to) => {
    const result = rename(from, to); if (!fired && path.basename(to) === 'starting-owner') { fired = true; throw FAULT(); } return result;
  });
  try { assert.throws(() => cap.markReady(), crashError); } finally { restore(); }
  assert.equal(fired, true); assert.throws(() => cap.releaseStartup(), error => error.code === 'owner_lifecycle_released');
  const dir = incomplete(f, 'owner-ready-intent'); assert.deepEqual(bytes(path.join(dir, 'starting-owner')), starting);
  assert.equal(bytes(f.path('runtime-owner.json')), null); await f.crash();
  const resumed = await f.create(); assert.ok(bytes(path.join(dir, 'completion.json'))); assert.deepEqual(bytes(path.join(dir, 'starting-owner')), starting);
  await certifyNew(f, resumed, saved);
});

test('markReady crash after active publish but before completion does not release readiness and resumes once', async t => {
  const f = await fixture(t), cap = await f.create(); f.stores(cap); const saved = protectedBytes(f); let fired = false;
  const restore = inject(f, 'openSync', (open, file, flags, ...args) => {
    if (!fired && flags === 'wx+' && path.basename(publication(file)) === 'completion.json' && kind(file) === 'owner-ready-intent') { fired = true; throw FAULT(); }
    return open(file, flags, ...args);
  });
  try { assert.throws(() => cap.markReady(), crashError); } finally { restore(); }
  assert.equal(fired, true); const published = bytes(f.path('runtime-owner.json')), dir = incomplete(f, 'owner-ready-intent');
  assert.equal(body(f.path('runtime-owner.json')).phase, 'active'); assert.throws(() => cap.releaseStartup(), error => error.code === 'owner_lifecycle_released');
  await f.crash(); const next = await f.create(); assert.ok(bytes(path.join(dir, 'completion.json')));
  assert.ok(transactions(f, 'owner-recovery-intent').some(recovery => bytes(path.join(recovery, 'owner'))?.equals(published)));
  await certifyNew(f, next, saved);
});

test('gate takeover crash after atomic replacement preserves a hardlink inode and never exposes an absent gate window', async t => {
  const f = await fixture(t), starting = await f.create(); f.stores(starting);
  const gate = path.join(f.root, 'install.lock'), originalGate = bytes(gate), originalStat = fs.statSync(gate, { bigint: true }), saved = protectedBytes(f);
  await f.crash(); let replaced = false, crashed = false;
  const restoreRename = inject(f, 'renameSync', (rename, from, to) => {
    if (to === gate) {
      const archive = path.join(path.dirname(from), 'original-gate'); assert.ok(fs.existsSync(to));
      assert.equal(fs.statSync(archive, { bigint: true }).ino, originalStat.ino); assert.deepEqual(bytes(archive), originalGate);
      assert.equal([...f.openFiles.values()].filter(file => file === gate).length, 0, 'old target read fd is closed before Windows replacement');
      const result = rename(from, to); assert.ok(fs.existsSync(to)); assert.notDeepEqual(bytes(to), originalGate); replaced = true; return result;
    }
    return rename(from, to);
  });
  const restoreOpen = inject(f, 'openSync', (open, file, flags, ...args) => {
    if (!crashed && flags === 'wx+' && path.basename(publication(file)) === 'completion.json' && kind(file) === 'gate-takeover-intent') { crashed = true; throw FAULT(); }
    return open(file, flags, ...args);
  });
  try { await assert.rejects(f.create(), crashError); } finally { restoreOpen(); restoreRename(); }
  assert.equal(replaced && crashed, true); const dir = incomplete(f, 'gate-takeover-intent');
  await f.crash(); const cap = await f.create(); assert.ok(bytes(path.join(dir, 'completion.json'))); assert.deepEqual(bytes(path.join(dir, 'original-gate')), originalGate);
  assert.equal(fs.statSync(path.join(dir, 'original-gate'), { bigint: true }).ino, originalStat.ino); await certifyNew(f, cap, saved);
});

for (const marker of ['owner', 'brokerOwner', 'brokerGate', 'receiverOwner']) test('owner recovery crash after ' + marker + ' archive resumes without rewriting protected bytes', async t => {
  const f = await fixture(t), { saved, dir } = await interruptedRecovery(f, marker), archived = bytes(path.join(dir, marker)), intent = bytes(path.join(dir, 'intent.json'));
  await f.crash(); const cap = await f.create();
  assert.ok(bytes(path.join(dir, 'completion.json'))); assert.deepEqual(bytes(path.join(dir, marker)), archived); assert.deepEqual(bytes(path.join(dir, 'intent.json')), intent);
  await certifyNew(f, cap, saved);
});

test('owner recovery crash before durable completion retains all archived marker bytes and completes before a new writer record', async t => {
  const f = await fixture(t); await active(f, true); const saved = protectedBytes(f); await f.crash(); let fired = false;
  const restore = inject(f, 'openSync', (open, file, flags, ...args) => {
    if (!fired && flags === 'wx+' && path.basename(publication(file)) === 'completion.json' && kind(file) === 'owner-recovery-intent') { fired = true; throw FAULT(); }
    return open(file, flags, ...args);
  });
  try { await assert.rejects(f.create(), crashError); } finally { restore(); }
  assert.equal(fired, true); const dir = incomplete(f, 'owner-recovery-intent'), records = Object.fromEntries(['owner', 'brokerOwner', 'brokerGate', 'receiverOwner', 'intent.json'].map(name => [path.join(dir, name), bytes(path.join(dir, name))]));
  let checked = false; const restorePublish = inject(f, 'linkSync', (link, from, to) => {
    if (to === f.path('runtime-owner.json')) { assert.ok(bytes(path.join(dir, 'completion.json'))); checked = true; }
    return link(from, to);
  });
  let cap; try { await f.crash(); cap = await f.create(); } finally { restorePublish(); }
  assert.equal(checked, true); unchanged(records); await certifyNew(f, cap, saved);
});

test('marker CAS drift after recovery intent refuses cleanup and cannot produce a fresh active record on retry', async t => {
  const f = await fixture(t); await active(f); await f.crash(); let fired = false;
  const restore = inject(f, 'openSync', (open, file, flags, ...args) => {
    const fd = open(file, flags, ...args);
    if (!fired && flags === 'r' && path.basename(file) === 'intent.json' && body(file)?.kind === 'owner-recovery-intent') { fired = true; fs.appendFileSync(f.path('runtime-owner.json'), ' '); }
    return fd;
  });
  try { await assert.rejects(f.create(), error => error.code === 'owner_lifecycle_changed'); } finally { restore(); }
  assert.equal(fired, true); const dir = incomplete(f, 'owner-recovery-intent'), saved = protectedBytes(f), provenance = { [path.join(dir, 'intent.json')]: bytes(path.join(dir, 'intent.json')), [f.path('runtime-owner.json')]: bytes(f.path('runtime-owner.json')) };
  await fencedTwice(f, saved, provenance);
});

test('valid origin-byte drift after recovery intent is still CAS failure and never silently rebaselines on retry', async t => {
  const f = await fixture(t); await active(f); await f.crash(); let fired = false;
  const restore = inject(f, 'openSync', (open, file, flags, ...args) => {
    const fd = open(file, flags, ...args);
    if (!fired && flags === 'r' && path.basename(file) === 'intent.json' && body(file)?.kind === 'owner-recovery-intent') { fired = true; fs.appendFileSync(path.join(f.root, 'origin.json'), ' '); fs.appendFileSync(f.path('origin.json'), ' '); }
    return fd;
  });
  try { await assert.rejects(f.create(), error => error.code === 'owner_lifecycle_changed'); } finally { restore(); }
  assert.equal(fired, true); const dir = incomplete(f, 'owner-recovery-intent'), saved = protectedBytes(f);
  await fencedTwice(f, saved, { [path.join(dir, 'intent.json')]: bytes(path.join(dir, 'intent.json')) });
});

test('corrupt published ready intent is a persistent fence and is never inferred to have completed', async t => {
  const f = await fixture(t), cap = await f.create(); f.stores(cap); const saved = protectedBytes(f); let fired = false, tornFile;
  const restore = inject(f, 'linkSync', (link, from, to) => {
    const value = link(from, to);
    if (!fired && path.basename(to) === 'intent.json' && body(to)?.kind === 'owner-ready-intent') { fired = true; tornFile = to; fs.truncateSync(to, 9); throw FAULT(); }
    return value;
  });
  try { assert.throws(() => cap.markReady(), crashError); } finally { restore(); }
  assert.equal(fired, true); assert.equal(bytes(tornFile).length, 9); await fencedTwice(f, saved, { [tornFile]: bytes(tornFile) });
});

test('corrupt published ready completion remains fenced rather than guessing done', async t => {
  const f = await fixture(t), cap = await f.create(); f.stores(cap); const saved = protectedBytes(f); let fired = false, tornFile;
  const restore = inject(f, 'linkSync', (link, from, to) => {
    const value = link(from, to);
    if (!fired && path.basename(to) === 'completion.json' && kind(to) === 'owner-ready-intent') { fired = true; tornFile = to; fs.truncateSync(to, 7); throw FAULT(); }
    return value;
  });
  try { assert.throws(() => cap.markReady(), crashError); } finally { restore(); }
  assert.equal(fired, true); assert.equal(bytes(tornFile).length, 7); await fencedTwice(f, saved, { [tornFile]: bytes(tornFile) });
});

test('contradictory original and archive cannot authorize recovery even when both contain matching sealed bytes', async t => {
  const f = await fixture(t), { saved, dir } = await interruptedRecovery(f), archive = path.join(dir, 'owner');
  const original = bytes(archive); assert.equal(bytes(f.path('runtime-owner.json')), null); fs.writeFileSync(f.path('runtime-owner.json'), original, { flag: 'wx' });
  await fencedTwice(f, saved, { [archive]: original, [f.path('runtime-owner.json')]: original, [path.join(dir, 'intent.json')]: bytes(path.join(dir, 'intent.json')) });
});

test('missing both original and archive does not reconstruct provenance from intent bytes or clear other markers', async t => {
  const f = await fixture(t), { saved, dir } = await interruptedRecovery(f), archive = path.join(dir, 'owner'); fs.unlinkSync(archive);
  const provenance = { [path.join(dir, 'intent.json')]: bytes(path.join(dir, 'intent.json')), [f.path('broker/broker-owner.lock')]: bytes(f.path('broker/broker-owner.lock')), [f.path('receiver/owner')]: bytes(f.path('receiver/owner')) };
  await fencedTwice(f, saved, provenance); assert.equal(bytes(archive), null);
});

test('unexpected extra archive file fences incomplete recovery and never disappears during subsequent starts', async t => {
  const f = await fixture(t), { saved, dir } = await interruptedRecovery(f), extra = path.join(dir, 'unexpected.bin'); fs.writeFileSync(extra, 'retained synthetic foreign bytes');
  await fencedTwice(f, saved, { [extra]: bytes(extra), [path.join(dir, 'intent.json')]: bytes(path.join(dir, 'intent.json')) });
});

for (const name of ['install.lock', 'runtime-owner.json']) test(name + ' fault before exclusive publication leaves only an inert stage and a dead retry can start safely', async t => {
  const f = await fixture(t), seeded = await active(f); f.close(seeded.cap, seeded.stores);
  const saved = protectedBytes(f), target = name === 'install.lock' ? path.join(f.root, name) : f.path(name); let stage;
  const restore = inject(f, 'fsyncSync', (sync, fd) => {
    const file = f.openFiles.get(fd);
    if (!stage && file && publication(file) === target) { stage = file; assert.equal(bytes(target), null); fs.ftruncateSync(fd, 5); throw FAULT(); }
    return sync(fd);
  });
  try { await assert.rejects(f.create(), crashError); } finally { restore(); }
  assert.ok(stage); assert.equal(bytes(target), null); const partial = bytes(stage); assert.equal(partial.length, 5); unchanged(saved);
  await f.crash(); const next = await f.create(); assert.deepEqual(bytes(stage), partial); await certifyNew(f, next, saved);
});

for (const record of ['intent.json', 'completion.json']) test('unpublished ready ' + record + ' partial stage is preserved while a new nonce independently finishes recovery', async t => {
  const f = await fixture(t), cap = await f.create(); f.stores(cap); const saved = protectedBytes(f), stage = crashReadyStage(f, cap, record), partial = bytes(stage);
  await f.crash(); const next = await f.create(); assert.deepEqual(bytes(stage), partial);
  if (record === 'completion.json') assert.equal(body(publication(stage)).kind, 'owner-ready-completed');
  else assert.equal(bytes(publication(stage)), null, 'an unpublished intent is never promoted or read as authority');
  await certifyNew(f, next, saved); assert.deepEqual(bytes(stage), partial);
});

test('a missing intent with a published archive or completion is contradictory and stays fenced across retries', async t => {
  for (const extraName of ['starting-owner', 'completion.json']) {
    const f = await fixture(t), cap = await f.create(); f.stores(cap); const saved = protectedBytes(f), stage = crashReadyStage(f, cap, 'intent.json');
    const extra = path.join(path.dirname(stage), extraName); fs.writeFileSync(extra, 'contradictory published metadata');
    await fencedTwice(f, saved, { [stage]: bytes(stage), [extra]: bytes(extra), [f.path('runtime-owner.json')]: bytes(f.path('runtime-owner.json')) });
  }
});

test('descriptor atomic replacement during pre-election process observation is unblocked and exact identity CAS refuses startup without stores', async t => {
  const f = await fixture(t), original = bytes(f.descriptorPath), before = fs.statSync(f.descriptorPath, { bigint: true }), origins = [path.join(f.root, 'origin.json'), f.path('origin.json')];
  const preserved = protectedBytes(f); let queued = false, replaced = false, replacementError;
  const restore = inject(f, 'openSync', (open, file, flags, ...args) => {
    const fd = open(file, flags, ...args);
    if (!queued && file === f.descriptorPath && flags === 'r') {
      queued = true; queueMicrotask(() => {
        try {
          assert.ok(f.probeCount() > 0);
          for (const protectedFile of [f.descriptorPath, ...origins]) assert.equal([...f.openFiles.values()].includes(protectedFile), false, 'no initial metadata FD crosses the observation await');
          const candidate = f.descriptorPath + '.synthetic-replacement'; fs.writeFileSync(candidate, original); fs.renameSync(candidate, f.descriptorPath);
          assert.notEqual(fs.statSync(f.descriptorPath, { bigint: true }).ino, before.ino); replaced = true;
        } catch (error) { replacementError = error; }
      });
    }
    return fd;
  });
  try { await assert.rejects(f.create(), error => error.code === 'owner_lifecycle_changed'); } finally { restore(); }
  if (replacementError) throw replacementError;
  assert.equal(queued && replaced, true); unchanged(preserved); assert.equal(f.tracked.size, 0);
  for (const file of [path.join(f.root, 'install.lock'), f.path('runtime-owner.json'), f.path('runtime-diagnostic.json'), f.path('broker'), f.path('receiver')]) assert.equal(fs.existsSync(file), false);
});

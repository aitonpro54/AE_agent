'use strict';
const nodeTest = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { harness, inject } = require('./fixtures/maintenance-finish');
const test = (name, fn) => nodeTest('maintenance-finish ' + name, { timeout: 15000 }, fn);
const bytes = file => fs.existsSync(file) ? fs.readFileSync(file) : null;
const dir = (h, id) => path.join(h.f.root, 'transactions', id + '-owner-maintenance');
const protectedFiles = h => [h.f.descriptorPath, path.join(h.f.root, 'origin.json'), h.f.path('origin.json'), path.join(h.f.root, 'core-client.json'), h.f.path('receiver/completions.ndjson'), h.f.path('broker/ledger.ndjson')];
async function pending(h, phase = 'install') {
  const id = await h.stop(); await h.dead(); const proof = await h.inspect(id);
  const files = { intent: path.join(dir(h, id), 'resume-intent.json'), install: path.join(h.f.root, 'install.lock'), broker: h.f.path('broker/broker-owner.gate'), lease: path.join(dir(h, id), 'resume-lease.json'), completed: path.join(dir(h, id), 'resume-completed.json'), archive: path.join(dir(h, id), 'stop-barrier') };
  const method = phase === 'remove' || phase === 'release' ? 'unlinkSync' : 'linkSync';
  let fired = false;
  const restore = inject(h, method, (original, ...args) => { const result = original(...args), target = method === 'linkSync' ? args[1] : args[0];
    if (target === (phase === 'remove' ? h.f.path('runtime-maintenance.json') : phase === 'release' ? files.broker : files[phase]) && !fired) { fired = true; throw Error('synthetic original operator crash'); } return result; });
  try { await assert.rejects(h.resume(id, proof.proofHash)); } finally { restore(); }
  assert.equal(fired, true); await h.dead(); return id;
}
async function finish(h, id) { const p = await h.inspectFinish(id); return h.finish(id, p.proofHash); }
function finished(h, id, before) {
  assert.equal(bytes(h.f.path('runtime-maintenance.json')), null); assert.ok(bytes(path.join(dir(h, id), 'stop-barrier')));
  assert.equal(bytes(path.join(h.f.root, 'install.lock')), null); assert.equal(bytes(h.f.path('broker/broker-owner.gate')), null);
  protectedFiles(h).forEach((file, i) => assert.deepEqual(bytes(file), before[i]));
}
for (const phase of ['intent', 'install', 'broker', 'lease', 'completed', 'archive', 'remove', 'release']) test('finishes original known ' + phase + ' prefix without changing intent or histories', async t => {
  const h = await harness(t), before = protectedFiles(h).map(bytes), id = await pending(h, phase), original = bytes(path.join(dir(h, id), 'resume-intent.json'));
  const result = await finish(h, id); assert.equal(result.finished, true); assert.equal(result.runtimeStarted, false); assert.equal(result.aeAuthority, false);
  assert.deepEqual(bytes(path.join(dir(h, id), 'resume-intent.json')), original); finished(h, id, before);
  await h.dead(); assert.equal((await h.inspectFinish(id)).phase, 'resumed');
});
for (const phase of ['attempt', 'old', 'rename', 'new-link', 'commit', 'archive', 'remove', 'release-intent', 'release-gate']) test('a new explicit actor finishes after continuation crash at ' + phase, async t => {
  const h = await harness(t), before = protectedFiles(h).map(bytes), id = await pending(h), barrier = h.f.path('runtime-maintenance.json'); let fired = false;
  const method = phase === 'rename' ? 'renameSync' : ['remove', 'release-gate'].includes(phase) ? 'unlinkSync' : 'linkSync';
  const restore = inject(h, method, (original, ...args) => {
    const result = original(...args), target = method === 'linkSync' ? args[1] : method === 'renameSync' ? args[1] : args[0];
    const match = phase === 'attempt' ? /finish-[a-f0-9-]{36}\.json$/.test(target) : phase === 'old' ? /-install-old$/.test(target) : phase === 'rename' ? target === path.join(h.f.root, 'install.lock') : phase === 'new-link' ? target === h.f.path('broker/broker-owner.gate') : phase === 'commit' ? target.endsWith('finish-commit.json') : phase === 'archive' ? target === path.join(dir(h, id), 'stop-barrier') : phase === 'remove' ? target === barrier : phase === 'release-gate' ? target === h.f.path('broker/broker-owner.gate') : /finish-[a-f0-9-]{36}\.json$/.test(target) && JSON.parse(bytes(target)).body.mode === 'release';
    if (match && !fired) { fired = true; throw Error('synthetic finisher crash'); } return result;
  });
  try { await assert.rejects(finish(h, id)); } finally { restore(); }
  assert.equal(fired, true); await h.dead(); assert.equal((await finish(h, id)).finished, true); finished(h, id, before);
});
test('repeat takeover crashes keep a single bounded sealed chain and original actor is never republished', async t => {
  const h = await harness(t), id = await pending(h), initial = JSON.parse(bytes(path.join(dir(h, id), 'resume-intent.json'))).body.operator;
  for (let n = 0; n < 3; n++) {
    const restore = inject(h, 'renameSync', (original, from, to) => { const r = original(from, to); if (to === path.join(h.f.root, 'install.lock')) throw Error('repeat crash'); return r; });
    try { await assert.rejects(finish(h, id)); } finally { restore(); }
    const current = JSON.parse(bytes(path.join(h.f.root, 'install.lock'))).body; assert.notEqual(current.actor.birthTicks, initial.birthTicks); await h.dead();
  }
  assert.equal((await finish(h, id)).resumed, true); assert.ok(fs.readdirSync(dir(h, id)).filter(n => /^finish-.*\.json$/.test(n)).length >= 5);
});
for (const drift of ['receipt-replace', 'receipt-inplace', 'tree', 'history', 'foreign-gate', 'missing-recorded-gate']) test('refuses ' + drift + ' without removing stop or other destination writes', async t => {
  const h = await harness(t), id = await pending(h, drift === 'missing-recorded-gate' ? 'lease' : 'install');
  const oldProof = await h.inspectFinish(id);
  if (drift === 'foreign-gate') fs.writeFileSync(path.join(h.f.root, 'install.lock'), 'foreign');
  else if (drift === 'missing-recorded-gate') fs.unlinkSync(path.join(h.f.root, 'install.lock'));
  else if (drift === 'history') fs.appendFileSync(h.f.path('receiver/completions.ndjson'), 'torn');
  else h.onObserve(() => { h.onObserve(null); const receipt = path.join(dir(h, id), 'stopped.json'); if (drift === 'tree') fs.writeFileSync(path.join(dir(h, id), 'unexpected'), 'x'); else if (drift === 'receipt-inplace') fs.appendFileSync(receipt, ' '); else { fs.writeFileSync(receipt + '.next', bytes(receipt)); fs.renameSync(receipt + '.next', receipt); } });
  const barrier = bytes(h.f.path('runtime-maintenance.json')); await assert.rejects(finish(h, id)); assert.deepEqual(bytes(h.f.path('runtime-maintenance.json')), barrier);
  const before = h.f.snapshot(); await assert.rejects(h.finish(id, oldProof.proofHash)); assert.deepEqual(h.f.snapshot(), before);
});
test('finished proof and phase CAS cannot be replayed after receipt replacement during final self probe', async t => {
  const h = await harness(t), id = await pending(h), proof = await h.inspectFinish(id); let calls = 0;
  h.onObserve(() => { if (++calls === 3) { const receipt = path.join(dir(h, id), 'stopped.json'); fs.appendFileSync(receipt, ' '); } });
  await assert.rejects(h.finish(id, proof.proofHash), e => e.code === 'maintenance_changed'); assert.ok(bytes(h.f.path('runtime-maintenance.json')));
  assert.equal(fs.readdirSync(dir(h, id)).some(n => /^finish-/.test(n)), false);
});
test('unpublished torn attempt stage has no authority and a later fresh actor leaves it as evidence', async t => {
  const h = await harness(t), id = await pending(h); let stage;
  const restore = inject(h, 'writeSync', (write, fd, ...args) => {
    const file = h.f.openFiles.get(fd);
    if (/finish-[a-f0-9-]{36}\.json\.stage-/.test(file || '')) { stage = file; write(fd, Buffer.from('torn')); throw Error('crash before attempt publication'); }
    return write(fd, ...args);
  });
  try { await assert.rejects(finish(h, id)); } finally { restore(); }
  assert.ok(stage); assert.equal(bytes(stage).toString(), 'torn'); assert.equal(bytes(stage.slice(0, stage.indexOf('.stage-'))), null);
  await h.dead(); assert.equal((await finish(h, id)).finished, true); assert.equal(bytes(stage).toString(), 'torn');
});
test('a still-live previous continuation actor refuses before any new attempt', async t => {
  const h = await harness(t), id = await pending(h), restore = inject(h, 'renameSync', (rename, from, to) => { const value = rename(from, to); throw Error('crash at takeover'); });
  try { await assert.rejects(finish(h, id)); } finally { restore(); }
  const before = h.f.snapshot(); await assert.rejects(h.inspectFinish(id), e => e.code === 'maintenance_process_not_dead'); assert.deepEqual(h.f.snapshot(), before);
  await h.dead(); assert.equal((await finish(h, id)).resumed, true);
});
test('corrupt published continuation and original records fence two further explicit attempts', async t => {
  for (const kind of ['resume-intent.json', 'resume-completed.json', 'finish-attempt', 'finish-commit.json']) {
    const h = await harness(t), id = await pending(h, kind === 'resume-completed.json' ? 'completed' : 'install'); let file;
    if (kind.startsWith('finish-')) {
      const restore = inject(h, 'linkSync', (link, from, to) => { const value = link(from, to); if (kind === 'finish-attempt' ? /finish-[a-f0-9-]{36}\.json$/.test(to) : to.endsWith(kind)) { file = to; throw Error('crash after public metadata'); } return value; });
      try { await assert.rejects(finish(h, id)); } finally { restore(); } await h.dead();
    } else file = path.join(dir(h, id), kind);
    assert.ok(file); fs.appendFileSync(file, 'torn'); const before = h.f.snapshot();
    for (let n = 0; n < 2; n++) { await assert.rejects(finish(h, id)); assert.deepEqual(h.f.snapshot(), before); }
  }
});
test('sealed forks and an unexpected archive refuse without guessing a continuation', async t => {
  const h = await harness(t), id = await pending(h); let published;
  const restore = inject(h, 'linkSync', (link, from, to) => { const value = link(from, to); if (/finish-[a-f0-9-]{36}\.json$/.test(to)) { published = to; throw Error('crash after intent'); } return value; });
  try { await assert.rejects(finish(h, id)); } finally { restore(); } await h.dead();
  const crypto = require('node:crypto'), { canonical } = require('../protocol/json');
  const key = crypto.createHmac('sha256', Buffer.from(h.f.d.panelToken, 'hex')).update('ae-core4/maintenance-key/v1\0').update(Buffer.from(h.f.d.controlToken, 'hex')).digest();
  const seal = body => Buffer.from(canonical({ body, mac: crypto.createHmac('sha256', key).update('ae-core4/maintenance-record/v1\0' + canonical(body)).digest('hex') }));
  const fork = JSON.parse(bytes(published)).body; fork.attemptId = crypto.randomUUID();
  fork.targets = fork.targets.map(value => { const b = JSON.parse(Buffer.from(value, 'base64')).body; b.attemptId = fork.attemptId; return seal(b).toString('base64'); });
  const file = path.join(dir(h, id), 'finish-' + fork.attemptId + '.json'); fs.writeFileSync(file, seal(fork));
  const before = h.f.snapshot(); await assert.rejects(finish(h, id), e => e.code === 'maintenance_phase'); assert.deepEqual(h.f.snapshot(), before);
  fs.unlinkSync(file); fs.writeFileSync(path.join(dir(h, id), 'finish-' + crypto.randomUUID() + '-install-old'), 'foreign');
  const extra = h.f.snapshot(); await assert.rejects(finish(h, id), e => e.code === 'maintenance_phase'); assert.deepEqual(h.f.snapshot(), extra);
});
test('continuation budget stops further publication while preserving the stopped fence', async t => {
  const h = await harness(t), id = await pending(h); let attempts = 0;
  const restore = inject(h, 'linkSync', (link, from, to) => { const value = link(from, to); if (/finish-[a-f0-9-]{36}\.json$/.test(to)) { attempts++; throw Error('crash before acquiring any new gate'); } return value; });
  try { for (let n = 0; n < 15; n++) { await assert.rejects(finish(h, id)); await h.dead(); } } finally { restore(); }
  assert.equal(attempts, 15); const before = h.f.snapshot(); await assert.rejects(finish(h, id), e => e.code === 'maintenance_budget'); assert.deepEqual(h.f.snapshot(), before); assert.ok(bytes(h.f.path('runtime-maintenance.json')));
});
test('completed finish permits a fresh lifecycle while keeping keys and history unchanged', async t => {
  const h = await harness(t), oldBoot = h.scope().bootId, id = await pending(h), before = protectedFiles(h).map(bytes);
  await finish(h, id); finished(h, id, before);
  for (const name of fs.readdirSync(dir(h, id))) { const value = fs.readFileSync(path.join(dir(h, id), name), 'utf8'); for (const secret of [h.f.d.panelToken, h.f.d.controlToken, 'panelToken', 'controlToken']) assert.equal(value.includes(secret), false); }
  await h.next(); assert.notEqual(h.scope().bootId, oldBoot); protectedFiles(h).forEach((file, i) => assert.deepEqual(bytes(file), before[i])); await h.stop();
});
test('unavailable process observation preserves every pending file and never infers absence', async t => {
  const h = await harness(t), id = await pending(h), before = h.f.snapshot();
  h.onObserve(() => { throw Object.assign(Error('owner_process_probe_unavailable'), { code: 'owner_process_probe_unavailable' }); });
  await assert.rejects(h.inspectFinish(id), e => e.code === 'owner_process_probe_unavailable'); assert.deepEqual(h.f.snapshot(), before);
});

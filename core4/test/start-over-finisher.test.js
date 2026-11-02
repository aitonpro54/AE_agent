'use strict';
const nodeTest = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { harness } = require('./fixtures/start-over-finisher');
const test = (name, fn) => nodeTest('start-over-finisher ' + name, { timeout: 120000 }, fn);
const error = code => e => e.code === code;
test('preserves UNKNOWN bytes and old identity while enabling only a new signed baseline-required session', async t => {
  const f = await harness(t), journal = fs.readFileSync(f.path('receiver/completions.ndjson')), origin = fs.readFileSync(path.join(f.root, 'origin.json')), descriptor = fs.readFileSync(f.descriptorPath);
  const value = await f.finisher.finishStartOver(f.options); assert.equal(value.resetComplete, true); assert.equal(value.baselineRequired, true); assert.equal(value.aeAuthority, false); assert.equal(value.commandsReplayed, 0);
  assert.deepEqual(fs.readFileSync(path.join(f.directory, 'archive-receiver/completions.ndjson')), journal); assert.match(journal.toString(), /"type":"unknown"/);
  assert.deepEqual(fs.readFileSync(f.descriptorPath), descriptor); assert.deepEqual(fs.readFileSync(path.join(f.root, 'origin.json')), origin);
  assert.equal(fs.existsSync(f.path('runtime-start-over.json')), false); assert.equal(fs.existsSync(path.join(f.root, 'install.lock')), false);
  assert.equal(fs.existsSync(f.path('receiver')), false); assert.equal(fs.existsSync(f.path('broker')), false); assert.equal(fs.existsSync(f.path('work-session-baseline.json')), false);
  const session = JSON.parse(fs.readFileSync(f.path('work-session.json'))).body; assert.equal(session.sessionId, f.result.newSessionId); assert.equal(session.resetId, f.result.id); assert.equal(session.baselineRequired, true);
});
test('repeat same reset is historical data only and preserves current new-work files', async t => {
  const f = await harness(t); await f.finisher.finishStartOver(f.options); fs.mkdirSync(f.path('broker')); fs.writeFileSync(f.path('broker/current-work'), 'new work');
  const before = f.snapshot(), probes = f.probes.length, result = await f.finisher.finishStartOver(f.options);
  assert.equal(result.historical, true); assert.equal(result.currentRuntimeObserved, false); assert.equal(result.aeAuthority, false); assert.equal(f.probes.length, probes); assert.deepEqual(f.snapshot(), before);
});
test('stopped receipt and initial owner inventory are optional after exact producer death', async t => {
  const f = await harness(t, { diagnostic: true, noInventory: true });
  assert.equal(fs.existsSync(path.join(f.directory, 'inventory.json')), false); const result = await f.finisher.finishStartOver(f.options);
  assert.equal(result.resetComplete, true); assert.equal(fs.existsSync(path.join(f.directory, 'continuation-inventory.json')), true); assert.equal(f.probes[0].actors.length, 2);
});
const crashes = [
  ['attempt publication before canonical claim', 'linkSync', (_from, to) => /attempt-[a-f0-9-]{36}\.json$/.test(to)],
  ['canonical gate claim', 'linkSync', (_from, to, f) => to === path.join(f.root, 'install.lock')],
  ['broker archive', 'renameSync', (from, _to, f) => from === f.path('broker')],
  ['receiver archive', 'renameSync', (from, _to, f) => from === f.path('receiver')],
  ['owner archive', 'renameSync', (from, _to, f) => from === f.path('runtime-owner.json')],
  ['session candidate publication', 'linkSync', (_from, to) => to.endsWith('session-candidate.json')],
  ['session publish intent', 'linkSync', (_from, to) => to.endsWith('session-publish-intent.json')],
  ['new session alias', 'linkSync', (_from, to, f) => to === f.path('work-session.json')],
  ['session receipt', 'linkSync', (_from, to) => to.endsWith('session-published.json')],
  ['reset completion receipt', 'linkSync', (_from, to) => to.endsWith('reset-completed.json')],
  ['owned gate release', 'unlinkSync', (file, _unused, f) => file === path.join(f.root, 'install.lock')]
];
for (const [name, method, predicate] of crashes) test('resumes same intent after crash at ' + name + ' and former finisher death', async t => {
  const f = await harness(t), before = fs.readFileSync(f.path('receiver/completions.ndjson')); f.onceAfter(method, (...args) => predicate(args[0], args[1], f));
  await assert.rejects(f.finisher.finishStartOver(f.options), error('injected_finisher_crash'));
  assert.equal(fs.existsSync(f.path('runtime-start-over.json')), true); await assert.rejects(f.finisher.finishStartOver(f.options), error('start_over_producer_still_alive'));
  f.restart(); const result = await f.finisher.finishStartOver(f.options); assert.equal(result.resetComplete, true); assert.equal(result.id, f.result.id);
  assert.deepEqual(fs.readFileSync(path.join(f.directory, 'archive-receiver/completions.ndjson')), before);
});
test('loss after final barrier removal returns historical completion without a second lease or reset', async t => {
  const f = await harness(t); f.onceAfter('unlinkSync', file => file === f.path('runtime-start-over.json'));
  await assert.rejects(f.finisher.finishStartOver(f.options), error('injected_finisher_crash')); const before = f.snapshot(), probes = f.probes.length;
  const result = await f.finisher.finishStartOver(f.options); assert.equal(result.historical, true); assert.deepEqual(f.snapshot(), before); assert.equal(f.probes.length, probes);
});
test('old opaque session and baseline bytes remain archived and cannot clear the new baseline', async t => {
  const f = await harness(t, { oldSession: true }), old = fs.readFileSync(f.path('work-session.json')), baseline = fs.readFileSync(f.path('work-session-baseline.json'));
  const result = await f.finisher.finishStartOver(f.options); assert.equal(result.baselineRequired, true);
  assert.deepEqual(fs.readFileSync(path.join(f.directory, 'archive-session')), old); assert.deepEqual(fs.readFileSync(path.join(f.directory, 'archive-baseline')), baseline);
});
test('foreign source introduced after partial archive is retained and blocks continuation', async t => {
  const f = await harness(t); f.onceAfter('renameSync', from => from === f.path('broker')); await assert.rejects(f.finisher.finishStartOver(f.options), error('injected_finisher_crash'));
  fs.mkdirSync(f.path('broker')); fs.writeFileSync(f.path('broker/foreign'), 'foreign resource'); f.restart();
  await assert.rejects(f.finisher.finishStartOver(f.options), error('start_over_archive_collision')); assert.equal(fs.readFileSync(f.path('broker/foreign'), 'utf8'), 'foreign resource');
});
test('same bytes in a foreign archive incarnation cannot replace the exact planned object', async t => {
  const f = await harness(t); f.onceAfter('renameSync', from => from === f.path('runtime-owner.json')); await assert.rejects(f.finisher.finishStartOver(f.options), error('injected_finisher_crash'));
  const archive = path.join(f.directory, 'archive-owner'), bytes = fs.readFileSync(archive); fs.renameSync(archive, path.join(f.base, 'retained-original-owner')); fs.writeFileSync(archive, bytes); f.restart();
  await assert.rejects(f.finisher.finishStartOver(f.options), error('start_over_archive_changed'));
});
test('lookalike capabilities and stale intent pin cannot enter archive or claim authority', async t => {
  const f = await harness(t); assert.throws(() => f.finisher.startOverArchiveRequest({}), error('start_over_finish_brand'));
  await assert.rejects(f.finisher.finishStartOver({ ...f.options, expectedIntentHash: '0'.repeat(64) }), error('start_over_intent_changed'));
  assert.equal(fs.existsSync(f.path('receiver')), true); assert.equal(fs.existsSync(path.join(f.root, 'install.lock')), false);
});
test('foreign candidate alias outside the transaction cannot be mistaken for a retained atomic stage', async t => {
  const f = await harness(t); f.onceAfter('linkSync', (_from, to) => to.endsWith('session-candidate.json'));
  await assert.rejects(f.finisher.finishStartOver(f.options), error('injected_finisher_crash'));
  fs.linkSync(path.join(f.directory, 'session-candidate.json'), path.join(f.base, 'foreign-candidate-alias')); f.restart();
  await assert.rejects(f.finisher.finishStartOver(f.options), error('start_over_session_alias')); assert.equal(fs.existsSync(f.path('runtime-start-over.json')), true);
});

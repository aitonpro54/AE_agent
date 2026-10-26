'use strict';
// Inverse regressions for the same-version H1-H4 audit. No sockets or live host.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');
const { Broker } = require('../core/broker');
const { Artifacts } = require('../core/artifacts');
const { Ledger } = require('../core/ledger');
const { Resources } = require('../core/resources');
const { acquireStateLock } = require('../core/state-lock');
const { createReceiver, readFailure } = require('../core/receiver');
const { hash, canonical } = require('../protocol/json');
const { decode } = require('../protocol/codec');
const { check } = require('../protocol/schema');
const { createHostDispatcher } = require('../integrations/cep/host-dispatcher');
const { openCompletionStore } = require('../integrations/cep/completion-store');
const { install } = require('./fixtures/cep-host');
const { initialState, environment, lifecycleFor } = require('./fixtures/ae');
const { SOURCE, fixture, prepare, requestStep, run, target, delay } = require('./helpers');
const code = expected => error => error.code === expected;
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const temp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'ae-core4-repairs-'));
function offline(t, options = {}) {
  const directory = temp();
  const f = fixture({ workspace: { root: SOURCE, temp: directory, stateDir: path.join(directory, 'broker') }, workerTimeout: 3000, transportTimeout: 250, ...options });
  t.after(() => f.close()); return f;
}
function hostFixture(t, { mode = 'normal', callbackTimeout = 25, loseAck = false, hooks } = {}) {
  const directory = temp(), state = initialState(), lifecycle = lifecycleFor(state);
  const storeDir = path.join(directory, 'receiver'), store = openCompletionStore({ directory: storeDir });
  const host = { mode, calls: 0, callbacks: [], forceCallbackError: false };
  const dispatcher = createHostDispatcher({ ...install(SOURCE), callbackTimeout, csInterface: { evalScript(script, callback) {
    host.calls++;
    if (host.mode === 'external-throw') throw Object.assign(new Error('external_eval_throw'), { code: 'external_eval_throw' });
    const result = new vm.Script(script).runInContext(vm.createContext(environment(state, () => {})), { timeout: 1000 });
    const deliver = () => callback(host.forceCallbackError ? 'EvalScript error.' : result);
    if (host.mode === 'drop' || host.mode === 'late') { host.callbacks.push(deliver); return; }
    queueMicrotask(deliver);
  } } });
  let receiver, binding;
  const transport = { state, lifecycle,
    async connect(channel) { binding = channel; receiver = createReceiver({ ...channel, admittedExecutors: dispatcher.admittedExecutors, evaluate: args => dispatcher.evaluate(args), completionStore: store }); return { receiverStoreIdentity: store.identity, sessionBinding: lifecycle.snapshot().binding }; },
    async send(frame) { const command = decode(frame, binding.secret), response = await receiver.receive(frame); if (loseAck && command.phase === 'mutate') throw new Error('synthetic_lost_ack'); return response; },
    completion: commandId => receiver.completion(commandId), async disconnect() {}
  };
  const f = offline(t, { transport, state, hooks }); t.after(() => store.close());
  return Object.assign(f, { host, dispatcher, store, storeDir });
}
for (const moduleId of ['titles', 'photo-placeholder']) for (const phase of ['inspect', 'verify']) for (const failure of ['wrapper-throw', 'callback-error']) {
  test('[audit-repairs] H1 ' + moduleId + ' ' + phase + ' ' + failure + ' completes refusal and permits next read', async t => {
    const f = hostFixture(t); await f.broker.connect();
    const contract = f.broker.getContract({ moduleId }), selected = f.broker.selected(contract.contractId), resource = target(f, moduleId === 'titles');
    const before = (await f.broker.inspect({ moduleId, contractId: contract.contractId, target: resource })).snapshot;
    const payload = { ...resource, expectedRevision: before.revision, ...(moduleId === 'titles' ? { expectedText: before.text, text: 'After' } : { expectedOldSourceId: before.sourceId, newSourceId: 12 }) };
    assert.deepEqual(await f.broker.send(selected, 'verify', payload), before);
    const evidenceCount = f.broker.evidence.size;
    f.state.flags[moduleId === 'titles' ? 'animated' : 'timeRemap'] = true;
    f.host.forceCallbackError = failure === 'callback-error';
    const invoke = () => phase === 'inspect' ? f.broker.inspect({ moduleId, contractId: contract.contractId, target: resource }) : f.broker.send(selected, 'verify', payload);
    await assert.rejects(invoke(), code(failure === 'callback-error' ? 'snapshot_failed' : moduleId === 'titles' ? 'unsupported_animated_text' : 'unsupported_layer'));
    assert.equal(f.dispatcher.physicalPending, false); assert.equal(f.store.closed, false); assert.equal(f.broker.evidence.size, evidenceCount);
    const events = fs.readFileSync(path.join(f.storeDir, 'completions.ndjson'), 'utf8').trim().split('\n').map(JSON.parse);
    const refused = events.filter(event => event.type === 'begin').at(-1);
    assert.equal(refused.command.phase, phase); assert.equal(f.store.get(refused.commandId).state, 'completed');
    assert.equal(readFailure(f.store.get(refused.commandId).response.result), true);
    assert.equal(f.broker.ledger.commands().length, 0); assert.deepEqual(f.state.counts, { photo: 0, titles: 0 });
    f.state.flags = {}; f.host.forceCallbackError = false;
    assert.deepEqual((await f.broker.inspect({ moduleId, contractId: contract.contractId, target: resource })).snapshot, before);
    f.store.close(); const reopened = openCompletionStore({ directory: f.storeDir }); t.after(() => reopened.close());
    assert.equal(reopened.fault, false); assert.equal(reopened.closed, false); assert.equal(reopened.get(refused.commandId).state, 'completed');
  });
}
for (const mode of ['external-throw', 'drop', 'late']) {
  test('[audit-repairs] H1 ' + mode + ' retains UNKNOWN and physical fence', async t => {
    const f = hostFixture(t, { mode, callbackTimeout: 15 }); await f.broker.connect();
    const contract = f.broker.getContract({ moduleId: 'titles' });
    await assert.rejects(f.broker.inspect({ moduleId: 'titles', contractId: contract.contractId, target: target(f, true) }), code(mode === 'external-throw' ? 'external_eval_throw' : 'host_callback_timeout'));
    if (mode === 'late') { f.host.callbacks[0](); await Promise.resolve(); }
    assert.equal(f.store.closed, true); assert.equal(f.dispatcher.physicalPending, true);
    const events = fs.readFileSync(path.join(f.storeDir, 'completions.ndjson'), 'utf8').trim().split('\n').map(JSON.parse);
    const begun = events.find(event => event.type === 'begin'); assert.equal(f.store.get(begun.commandId).state, 'unknown');
    await assert.rejects(f.broker.inspect({ moduleId: 'titles', contractId: contract.contractId, target: target(f, true) }), code('receiver_lane_closed'));
    assert.equal(f.host.calls, 1); assert.deepEqual(f.state.counts, { photo: 0, titles: 0 });
  });
}
test('[audit-repairs] H1 pending callback keeps physical latch before timeout', async t => {
  const f = hostFixture(t, { mode: 'drop', callbackTimeout: 50 }); await f.broker.connect();
  const contract = f.broker.getContract({ moduleId: 'titles' }), selected = f.broker.selected(contract.contractId);
  const pending = f.broker.inspect({ moduleId: 'titles', contractId: contract.contractId, target: target(f, true) });
  assert.equal(f.dispatcher.physicalPending, true); assert.equal(f.store.closed, false);
  assert.throws(() => f.dispatcher.evaluate({ phase: 'inspect', payload: target(f, true), command: { ...selected.admission } }), code('physical_lane_pending'));
  await assert.rejects(pending, code('host_callback_timeout')); assert.equal(f.store.closed, true);
});
test('[audit-repairs] H1 verify refusal after applied mutation preserves unresolved command', async t => {
  let f; f = hostFixture(t, { hooks: { beforeReadback() { f.state.flags.animated = true; } } });
  const plan = await prepare(f), result = await run(f, plan);
  assert.equal(result.code, 'unsupported_animated_text'); assert.equal(f.state.counts.titles, 1);
  assert.equal(f.broker.ledger.commands()[0].state, 'acknowledged'); assert.equal(f.broker.ledger.unresolved().length, 1);
  assert.equal(f.store.closed, false); assert.equal(f.dispatcher.physicalPending, false);
  f.state.flags = {}; assert.equal((await f.broker.reconcile({ taskId: plan.taskId })).commands[0].state, 'succeeded'); assert.equal(f.state.counts.titles, 1);
});
test('[audit-repairs] H1 read-failure exact version shape cannot masquerade as mutation completion', async t => {
  for (const result of [{ readFailureVersion: 2, outcome: 'rejected', code: 'test' }, { readFailureVersion: 1, outcome: 'rejected' }, { readFailureVersion: 1, outcome: 'rejected', code: 'test', extra: true }]) assert.throws(() => readFailure(result));
  const f = hostFixture(t); await f.broker.connect();
  f.host.forceCallbackError = true;
  const selected = f.broker.selected(f.broker.getContract({ moduleId: 'titles' }).contractId);
  await assert.rejects(f.broker.send(selected, 'mutate', target(f, true)));
  assert.equal(f.store.closed, true); assert.equal(f.dispatcher.physicalPending, true); assert.equal(f.state.counts.titles, 0);
});
async function unknown(t, rejected = false) {
  const f = offline(t, { transportOptions: { beforeEvaluate({ state, phase }) { if (rejected && phase === 'mutate') state.flags.animated = true; }, loseAck: command => command.phase === 'mutate' } });
  const plan = await prepare(f); assert.equal((await run(f, plan)).state, 'stopped');
  assert.equal(f.broker.ledger.commands()[0].state, 'UNKNOWN');
  const proof = await f.transport.completion(f.broker.ledger.commands()[0].commandId);
  const reached = deferred(), gate = deferred(); let calls = 0;
  f.transport.completion = () => { calls++; reached.resolve(); return gate.promise.then(() => proof); };
  return { f, plan, reached: reached.promise, release: gate.resolve, get calls() { return calls; } };
}
for (const rejected of [true, false]) {
  test('[audit-repairs] H2 exclusive reconcile records one ' + (rejected ? 'rejection' : 'success and verify'), async t => {
    const state = await unknown(t, rejected), { f, plan } = state, sends = f.transport.sends;
    const pending = f.broker.reconcile({ taskId: plan.taskId }); await state.reached;
    await assert.rejects(f.broker.reconcile({ taskId: plan.taskId }), code('broker_busy'));
    await assert.rejects(run(f, plan), code('broker_busy'));
    assert.equal(f.broker.controlPending, 1); state.release(); await pending;
    await f.broker.reconcile({ taskId: plan.taskId });
    assert.equal(state.calls, 1); assert.equal(f.transport.sends - sends, rejected ? 0 : 1);
    const terminal = f.broker.ledger.events.filter(event => event.type === 'command' && event.state === (rejected ? 'rejected' : 'succeeded'));
    assert.equal(terminal.length, 1); assert.equal(f.broker.ledger.events.filter(event => event.type === 'engine' && event.event.reconciled).length, rejected ? 0 : 1);
    assert.equal(f.state.counts.titles, rejected ? 0 : 1);
  });
}
test('[audit-repairs] H2 run excludes reconcile before terminal command processing', async t => {
  const reached = deferred(), gate = deferred();
  const f = offline(t, { hooks: { async afterAck() { reached.resolve(); await gate.promise; } } });
  const plan = await prepare(f), pending = run(f, plan); await reached.promise;
  await assert.rejects(f.broker.reconcile({ taskId: plan.taskId }), code('broker_busy'));
  gate.resolve(); assert.equal((await pending).state, 'succeeded'); assert.equal(f.state.counts.titles, 1);
});
test('[audit-repairs] H2 caller deadline retains actual completion lease and prevents retry until settle', async t => {
  const state = await unknown(t), { f, plan } = state; f.broker.transportTimeout = 35;
  const pending = f.broker.reconcile({ taskId: plan.taskId }); await state.reached;
  const started = Date.now(); await assert.rejects(pending, code('transport_timeout')); assert.ok(Date.now() - started < 1000);
  assert.equal(f.broker.reconciling, false); assert.equal(f.broker.controlPending, 1);
  await assert.rejects(f.broker.reconcile({ taskId: plan.taskId }), code('broker_busy'));
  await assert.rejects(run(f, plan), code('broker_busy')); assert.equal(state.calls, 1);
  f.broker.reset({ taskId: 'other-task' }); assert.equal(f.broker.status().closed, false);
  const ledgerFile = path.join(f.stateDir, 'ledger.ndjson'), before = fs.readFileSync(ledgerFile, 'utf8');
  f.close(); assert.equal(fs.existsSync(path.join(f.stateDir, 'broker-owner.lock')), true);
  const blocked = new Broker({ root: SOURCE, stateDir: f.stateDir }); t.after(() => blocked.close()); assert.equal(blocked.stateLock.error, 'state_owner_busy');
  state.release(); await delay(10);
  assert.equal(f.broker.controlPending, 0); assert.equal(f.broker.released, true); assert.equal(fs.readFileSync(ledgerFile, 'utf8'), before);
  assert.equal(f.broker.ledger.commands()[0].state, 'UNKNOWN');
  const next = new Broker({ root: SOURCE, stateDir: f.stateDir }); t.after(() => next.close()); assert.equal(next.stateLock.error, null);
});
test('[audit-repairs] H2 close while completion pending drains before lease release and prohibits late metadata', async t => {
  const state = await unknown(t, true), { f, plan } = state;
  const pending = f.broker.reconcile({ taskId: plan.taskId }); await state.reached;
  const ledgerFile = path.join(f.stateDir, 'ledger.ndjson'), before = fs.readFileSync(ledgerFile, 'utf8');
  f.close(); assert.equal(fs.existsSync(path.join(f.stateDir, 'broker-owner.lock')), true);
  const blocked = new Broker({ root: SOURCE, stateDir: f.stateDir }); t.after(() => blocked.close()); assert.equal(blocked.stateLock.error, 'state_owner_busy');
  state.release(); await assert.rejects(pending, code('broker_closed'));
  assert.equal(f.broker.released, true); assert.equal(fs.readFileSync(ledgerFile, 'utf8'), before); assert.equal(f.broker.ledger.commands()[0].state, 'UNKNOWN');
});
function constraint(constraintId, resource, patch = {}) {
  return { constraintId, schemaVersion: 1, resource, owner: 'owner', checkpointRef: 'checkpoint', allowedEffects: ['layer.source'], reservationOwner: 'owner', unresolvedOutcome: false, revision: null, provenance: 'synthetic-audit-regression', ...patch };
}
test('[audit-repairs] H3 all 18 dimension restrictions remain effective alongside broad grant', () => {
  const directory = temp(), target = { sessionId: 'session', projectId: 'project', compId: 1, layerId: 101 }, base = { sessionId: target.sessionId, projectId: target.projectId };
  const grant = { owner: 'owner', checkpointRef: 'checkpoint' }, policy = { effect: 'layer.source' }, snapshot = { revision: 'revision' };
  const schema = JSON.parse(fs.readFileSync(path.join(SOURCE, 'modules/photo-placeholder/contract.json'))).targetSchema;
  for (const dimension of [{ itemId: 12 }, { file: 'C:/fixture/photo.jpg' }, { output: 'C:/fixture/render.mp4' }]) for (const restriction of [{ unresolvedOutcome: true }, { owner: 'other' }, { reservationOwner: 'other' }, { allowedEffects: [] }, { checkpointRef: 'other' }, { revision: 'other' }]) {
    const name = Object.keys(dimension)[0] + '-' + Object.keys(restriction)[0];
    const resources = new Resources(new Ledger(path.join(directory, name)), [constraint('broad', base), constraint('narrow', { ...base, ...dimension }, restriction)]);
    assert.throws(() => resources.authorize(target, policy, grant, snapshot), name);
    assert.throws(() => resources.authorize({ ...target, ...dimension }, policy, grant, snapshot), name);
    assert.throws(() => check(schema, { ...target, ...dimension }));
  }
  for (const restriction of [{}, { unresolvedOutcome: true }]) {
    const resources = new Resources(new Ledger(path.join(directory, 'narrow-' + !!restriction.unresolvedOutcome)), [constraint('narrow', { ...base, itemId: 12 }, restriction)]);
    assert.throws(() => resources.authorize(target, policy, grant, snapshot), code('resource_constraints_required'));
  }
  const resources = new Resources(new Ledger(path.join(directory, 'scope-controls')), [constraint('broad', base), constraint('sibling', { ...target, layerId: 102, itemId: 12 }, { unresolvedOutcome: true }), constraint('foreign', { ...base, projectId: 'other', output: 'out' }, { unresolvedOutcome: true })]);
  assert.doesNotThrow(() => resources.authorize(target, policy, grant, snapshot));
  const matching = new Resources(new Ledger(path.join(directory, 'matching')), [constraint('broad', base), constraint('same', { ...base, itemId: 13 }, { unresolvedOutcome: true })]);
  assert.doesNotThrow(() => matching.authorize({ ...target, itemId: 12 }, policy, grant, snapshot));
});
for (const dimension of [{ itemId: 12 }, { file: 'C:/fixture/photo.jpg' }, { output: 'C:/fixture/render.mp4' }]) {
  test('[audit-repairs] H3 Broker fences ' + Object.keys(dimension)[0] + ' before mutation', async t => {
    const f = offline(t); await f.broker.connect(); const step = await requestStep(f, 'photo-placeholder');
    const base = f.authority.resourceConstraints[0]; f.broker.ledger.append({ type: 'constraint', record: { ...base, constraintId: 'narrow', resource: { ...base.resource, ...dimension }, unresolvedOutcome: true } });
    const build = await f.broker.build({ steps: [step] }), plan = f.broker.propose({ buildId: build.buildId }); f.authority.confirm(plan.proposalId);
    assert.equal((await run(f, plan)).code, 'shared_resource_fenced'); assert.deepEqual(f.state.counts, { photo: 0, titles: 0 }); assert.equal(f.broker.ledger.commands().length, 0);
  });
}
test('[audit-repairs] H4 busy constructor is metadata-only and cannot select or publish', async t => {
  const directory = temp(), owner = acquireStateLock(directory); t.after(() => owner.release());
  const marker = fs.readFileSync(path.join(directory, 'broker-owner.lock'), 'utf8');
  const broker = new Broker({ root: SOURCE, stateDir: directory }); t.after(() => broker.close());
  assert.equal(broker.status().ownershipFault, 'state_owner_busy'); assert.equal((await broker.connect()).reason, 'state_owner_busy');
  assert.equal(broker.artifacts.runtime, undefined); assert.equal(broker.worker.runtime, undefined); assert.equal(fs.existsSync(path.join(directory, 'artifacts')), false);
  assert.throws(() => broker.getContract({ moduleId: 'titles' }), code('state_owner_busy')); assert.throws(() => broker.artifacts.selectEngine(), code('state_owner_busy'));
  assert.equal(broker.ledger.events.length, 0); assert.equal(fs.readFileSync(path.join(directory, 'broker-owner.lock'), 'utf8'), marker);
});
function injectWrite(store, action, corrupt = false) {
  const open = fs.openSync, write = fs.writeSync, close = fs.closeSync, descriptors = new Map(); let injected;
  fs.openSync = function(file, ...args) { const fd = open.call(fs, file, ...args); descriptors.set(fd, path.resolve(file)); return fd; };
  fs.closeSync = function(fd) { descriptors.delete(fd); return close.call(fs, fd); };
  fs.writeSync = function(fd, data, ...args) {
    const file = descriptors.get(fd);
    if (!injected && file?.startsWith(path.resolve(store) + path.sep) && path.relative(store, file).startsWith('.stage-')) {
      const bytes = Buffer.from(data); injected = { file, expected: bytes.length };
      if (corrupt) { bytes[0] ^= 1; return write.call(fs, fd, bytes); }
      return write.call(fs, fd, bytes.subarray(0, 19));
    }
    return write.call(fs, fd, data, ...args);
  };
  try { action(); } finally { fs.openSync = open; fs.writeSync = write; fs.closeSync = close; }
  return injected;
}
for (const kind of ['core', 'module']) for (const corrupt of [false, true]) {
  test('[audit-repairs] H4 ' + kind + ' ' + (corrupt ? 'corrupt stage' : 'short write') + ' never publishes final bytes', () => {
    const store = path.join(temp(), 'artifacts'); let artifacts;
    if (kind === 'module') artifacts = new Artifacts({ root: SOURCE, store });
    const manifest = JSON.parse(fs.readFileSync(path.join(SOURCE, kind === 'core' ? 'core/artifact.json' : 'modules/titles/artifact.json')));
    const final = path.join(store, (kind === 'core' ? 'core-' : '') + hash(manifest));
    assert.throws(() => injectWrite(store, () => kind === 'core' ? new Artifacts({ root: SOURCE, store }) : artifacts.select('titles'), corrupt), code(corrupt ? kind === 'core' ? 'immutable_runtime_integrity' : 'immutable_integrity' : kind === 'core' ? 'runtime_copy_short_write' : 'artifact_copy_short_write'));
    assert.equal(fs.existsSync(final), false); assert.ok(fs.readdirSync(store).every(name => !name.startsWith('.stage-')));
    artifacts = new Artifacts({ root: SOURCE, store }); if (kind === 'module') artifacts.verifyCopy(artifacts.select('titles'));
    assert.equal(fs.existsSync(final), true);
  });
}
for (const kind of ['core', 'module']) {
  test('[audit-repairs] H4 ' + kind + ' process crash leaves private orphan and next owner publishes full closure', () => {
    const directory = temp(), store = path.join(directory, 'artifacts');
    const child = spawnSync(process.execPath, [path.join(__dirname, 'fixtures/artifact-publish-crash.js'), SOURCE, directory, kind], { encoding: 'utf8', timeout: 10000, windowsHide: true });
    assert.equal(child.status, 86, child.stderr); const partial = JSON.parse(child.stdout.trim());
    assert.equal(fs.statSync(partial.file).size, 19); assert.ok(partial.file.includes(path.sep + '.stage-')); assert.equal(fs.existsSync(partial.final), false);
    const broker = new Broker({ root: SOURCE, stateDir: directory });
    try {
      assert.equal(broker.stateLock.error, null); if (kind === 'module') broker.artifacts.verifyCopy(broker.artifacts.select('titles'));
      assert.equal(fs.existsSync(partial.final), true); assert.equal(fs.statSync(partial.file).size, 19);
    } finally { broker.close(); }
  });
}
test('[audit-repairs] H4 final CAS appears only after whole closure verification and corrupt finals stay unchanged', () => {
  const store = path.join(temp(), 'artifacts'), rename = fs.renameSync; let observed = 0;
  fs.renameSync = function(from, to) {
    if (from.startsWith(store + path.sep + '.stage-')) { observed++; assert.equal(fs.existsSync(to), false); assert.ok(fs.statSync(path.join(from, observed === 1 ? 'worker.js' : 'implementation.js')).size > 100); }
    return rename.call(fs, from, to);
  };
  let artifacts, selected;
  try { artifacts = new Artifacts({ root: SOURCE, store }); selected = artifacts.select('titles'); }
  finally { fs.renameSync = rename; }
  assert.equal(observed, 2);
  const moduleFile = path.join(selected.path, 'implementation.js'); fs.writeFileSync(moduleFile, 'corrupt-final');
  assert.throws(() => artifacts.select('titles'), code('immutable_integrity')); assert.equal(fs.readFileSync(moduleFile, 'utf8'), 'corrupt-final');
  const runtimeFile = path.join(artifacts.runtime.path, 'worker.js'); fs.writeFileSync(runtimeFile, 'corrupt-runtime');
  assert.throws(() => new Artifacts({ root: SOURCE, store }), code('immutable_runtime_integrity')); assert.equal(fs.readFileSync(runtimeFile, 'utf8'), 'corrupt-runtime');
});
test('[audit-repairs] H4 closed publication guard denies module and engine copies and constructor faults release own lease', t => {
  const f = offline(t); f.close(); const before = fs.readdirSync(path.join(f.stateDir, 'artifacts'));
  assert.throws(() => f.broker.getContract({ moduleId: 'titles' }), code('broker_closed')); assert.throws(() => f.broker.artifacts.selectEngine(), code('broker_closed'));
  assert.deepEqual(fs.readdirSync(path.join(f.stateDir, 'artifacts')), before);
  const stateDir = temp(), store = path.join(stateDir, 'artifacts');
  assert.throws(() => injectWrite(store, () => new Broker({ root: SOURCE, stateDir })), code('runtime_copy_short_write'));
  assert.equal(fs.existsSync(path.join(stateDir, 'broker-owner.lock')), false);
  const recovered = new Broker({ root: SOURCE, stateDir }); recovered.close();
});

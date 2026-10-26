'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync, execFileSync } = require('node:child_process');
const { encode, decode, hash, canonical, dispatchBinding, createReceiver } = require('../../core/receiver-api');
const { Broker } = require('../../core/broker');
const { createTransport } = require('../../integrations/cep/transport');
const { createHostDispatcher } = require('../../integrations/cep/host-dispatcher');
const { openCompletionStore } = require('../../integrations/cep/completion-store');
const { packet, createParser } = require('../../integrations/cep/wire');
const { loopback, install, vmHost } = require('../fixtures/cep-host');
const { initialState } = require('../fixtures/ae');
const { workspace, fixture, prepare, run, SOURCE } = require('../helpers');
const { selectChecks } = require('../../tools/validate-diff');
const channel = n => ({ controllerId: 'synthetic-controller-' + n, channelEpoch: 'synthetic-channel-' + n, secret: 'synthetic-secret-' + n });
const target = state => ({ sessionId: state.sessionId, projectId: state.projectId, compId: 1, layerId: 102 });
function command(binding, phase, payload, commandId = 'synthetic-command', moduleId = 'titles') {
  const asset = install(SOURCE).installExecutors.find(a => a.moduleId === moduleId);
  return { protocolVersion: 1, controllerId: binding.controllerId, channelEpoch: binding.channelEpoch, commandId, moduleId: asset.moduleId, operationId: asset.operationId, executorHash: asset.executorHash, phase, payloadHash: hash(canonical(payload)), payload };
}
const cleanup = new WeakMap();
function resources(t) {
  if (!cleanup.has(t)) { const r = { directories: [], closers: [] }; cleanup.set(t, r); t.after(async () => { for (const close of r.closers.reverse()) await close(); for (const dir of r.directories) fs.rmSync(dir, { recursive: true, force: true }); }); }
  return cleanup.get(t);
}
function temp(t) { const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'core4-cep-')); resources(t).directories.push(directory); return directory; }
async function wire(t, options = {}) { const directory = options.directory || path.join(temp(t), 'store'); const f = await loopback({ root: SOURCE, directory, ...options }); resources(t).closers.push(() => f.close()); return f; }
async function send(f, binding, phase, payload, id, moduleId) { return decode(await f.transport.send(encode(command(binding, phase, payload, id, moduleId), binding.secret)), binding.secret).result; }
function counterIO(failAt) {
  let writes = 0, syncs = 0;
  return { ...fs, writeSync(...args) { writes++; if (failAt.write === writes) throw new Error('synthetic_disk_write'); return fs.writeSync(...args); }, fsyncSync(...args) { syncs++; if (failAt.sync === syncs) throw new Error('synthetic_disk_sync'); return fs.fsyncSync(...args); } };
}

test('[cep-transport] B1 Core physically lacks integration and import performs no channel/state IO', async t => {
  const ws = workspace(); t.after(() => fs.rmSync(ws.temp, { recursive: true, force: true }));
  fs.rmSync(path.join(ws.root, 'integrations'), { recursive: true });
  const broker = new Broker({ root: ws.root, stateDir: ws.stateDir }); t.after(() => broker.close());
  assert.equal((await broker.connect()).reason, 'live_transport_not_installed');
  const script = "const fs=require('node:fs'),net=require('node:net'),cp=require('node:child_process');let calls=0;net.createServer=()=>{calls++;throw Error('listener')};cp.spawn=()=>{calls++;throw Error('spawn')};const before=fs.readdirSync(process.cwd());require('./integrations/cep/transport');require('./integrations/cep/completion-store');require('./integrations/cep/host-dispatcher');if(calls||JSON.stringify(before)!==JSON.stringify(fs.readdirSync(process.cwd())))process.exit(1)";
  assert.equal(spawnSync(process.execPath, ['-e', script], { cwd: SOURCE, windowsHide: true }).status, 0);
});

test('[cep-transport] B2 actual fragmented wire and VM source dispatch keep typed text as data', async t => {
  const f = await wire(t), binding = channel(1); await f.transport.connect(binding);
  const snapshot = await send(f, binding, 'inspect', target(f.host.state), 'inspect');
  const text = 'Quote " \\ Ω \u2028\u2029 <script>app.quit()</script>';
  const payload = { ...snapshot.target, text, expectedText: snapshot.text, expectedRevision: snapshot.revision };
  const result = await send(f, binding, 'mutate', payload, 'mutate');
  assert.equal(result.outcome, 'applied'); assert.equal(result.snapshot.text, text);
  assert.equal((await send(f, binding, 'verify', payload, 'verify')).text, text);
  const rejected = await send(f, binding, 'mutate', { ...payload, expectedText: text, expectedRevision: result.snapshot.revision, text: 'a\n\");app.quit();//' }, 'newline');
  assert.equal(rejected.outcome, 'rejected'); assert.equal(f.host.state.text, text);
  assert.equal(f.host.state.counts.titles, 1); assert.equal(f.host.counts.native, 0); assert.equal(f.wireFrames, 4);
  assert.ok(f.host.scripts.every(script => !script.includes('\u2028') && !script.includes('\u2029')));
  const photo = await send(f, binding, 'inspect', { ...target(f.host.state), layerId: 101 }, 'photo-inspect', 'photo-placeholder');
  const photoInput = { ...photo.target, expectedRevision: photo.revision, expectedOldSourceId: photo.sourceId, newSourceId: 12 };
  assert.equal((await send(f, binding, 'mutate', photoInput, 'photo-mutate', 'photo-placeholder')).outcome, 'applied');
  assert.equal((await send(f, binding, 'verify', photoInput, 'photo-verify', 'photo-placeholder')).sourceId, 12);
  assert.equal(f.host.state.counts.photo, 1); assert.equal(f.host.counts.native, 0);
});

test('[cep-transport] B3 admission identity bytes phase auth and runtime code fields reject before eval', async t => {
  const installed = install(SOURCE), host = vmHost();
  for (const patch of [{ source: installed.installExecutors[0].source + '//altered' }, { moduleId: 'foreign' }, { operationId: 'foreign' }, { admissionRef: 'foreign' }, { executorHash: hash('altered') }]) {
    assert.throws(() => createHostDispatcher({ ...installed, installExecutors: [{ ...installed.installExecutors[0], ...patch }], csInterface: host.csInterface }), /executor_install_admission/);
  }
  const f = await wire(t), binding = channel(1); await f.transport.connect(binding);
  const body = command(binding, 'inspect', target(f.host.state));
  for (const patch of [{ script: 'app.quit()' }, { source: 'app.quit()' }, { path: 'unsafe.jsx' }, { phase: 'raw' }, { moduleId: 'foreign' }, { operationId: 'foreign' }, { executorHash: 'altered' }, { controllerId: 'other' }, { channelEpoch: 'other' }, { payloadHash: 'altered' }]) await assert.rejects(f.transport.send(encode({ ...body, ...patch }, binding.secret)));
  await assert.rejects(f.transport.send(encode(body, 'wrong-secret')), /channel_auth/);
  assert.equal(f.host.counts.evaluate, 0);
  const frames = [], faults = []; const parse = createParser(v => frames.push(v), e => faults.push(e));
  const bytes = packet({ text: 'Ω\n\u2028' }); for (const byte of bytes) parse(Buffer.from([byte]));
  assert.deepEqual(frames, [{ text: 'Ω\n\u2028' }]); parse(Buffer.from([255,255,255,255])); assert.equal(faults.length, 1);
});

test('[cep-transport] B4 missing callback second controller disconnect timeout retain physical latch', async t => {
  const f = await wire(t, { hostOptions: { mode: 'missing' }, callbackTimeout: 20 }), binding = channel(1); await f.transport.connect(binding);
  const second = createTransport({ channel: f.channel, lifecycleProducer: f.lifecycleProducer });
  await assert.rejects(second.connect(channel(2)), /controller_busy/);
  await assert.rejects(send(f, binding, 'inspect', target(f.host.state), 'pending'), /host_callback_timeout/);
  assert.equal(f.dispatcher.physicalPending, true); assert.equal(f.store.closed, true);
  await f.transport.disconnect(); await f.transport.connect(channel(2));
  await assert.rejects(send(f, channel(2), 'inspect', target(f.host.state), 'new-command'), /receiver_lane_closed/);
  await assert.rejects(f.transport.send(encode(command(channel(2), 'inspect', target(f.host.state), 'pending'), channel(2).secret)), /duplicate_command_no_replay/);
  assert.equal(f.host.counts.evaluate, 1);
});

test('[cep-transport] B4 external throws malformed mutation and late callback never free UNKNOWN lane', async t => {
  for (const options of [{ mode: 'throw' }, { mode: 'malformed' }, { delay: 40 }]) {
    const f = await wire(t, { hostOptions: options, callbackTimeout: 10 }), binding = channel(1); await f.transport.connect(binding);
    await assert.rejects(send(f, binding, options.mode === 'malformed' ? 'mutate' : 'inspect', target(f.host.state), 'failed'));
    await new Promise(resolve => setTimeout(resolve, 50));
    assert.equal(f.store.closed, true); assert.equal(f.dispatcher.physicalPending, true);
    await assert.rejects(send(f, binding, 'inspect', target(f.host.state), 'next'), /receiver_lane_closed/); assert.equal(f.host.counts.evaluate, 1);
  }
});

test('[cep-transport] B4 concurrent private connects reserve one controller and cancelled connect stays disconnected', async t => {
  const f = await wire(t), other = createTransport({ channel: f.channel, lifecycleProducer: f.lifecycleProducer });
  const attempts = await Promise.allSettled([f.transport.connect(channel(1)), other.connect(channel(2))]);
  assert.deepEqual(attempts.map(result => result.status).sort(), ['fulfilled', 'rejected']); assert.equal(f.connects, 1);
  await f.transport.disconnect(); await other.disconnect();
  let release; const gate = new Promise(resolve => { release = resolve; });
  const slow = createTransport({ channel: { async connect(binding) { await gate; return f.channel.connect(binding); } }, lifecycleProducer: f.lifecycleProducer });
  const connecting = slow.connect(channel(3)); await Promise.resolve(); await slow.disconnect(); release();
  await assert.rejects(connecting, /transport_connection_cancelled/); assert.throws(() => slow.send('frame'), /transport_disconnected/);
});

test('[cep-transport] B5 completed duplicate after graceful reopen keeps original origin and one evaluate', async t => {
  const directory = path.join(temp(t), 'store'), f = await loopback({ root: SOURCE, directory }), first = channel(1);
  await f.transport.connect(first); await send(f, first, 'inspect', target(f.host.state), 'durable'); const identity = f.store.identity; await f.transport.disconnect(); await f.close();
  const g = await wire(t, { directory }), second = channel(2); await g.transport.connect(second);
  const proof = decode(await g.transport.completion('durable'), second.secret);
  assert.equal(proof.state, 'completed'); assert.equal(proof.originalBinding.controllerId, first.controllerId); assert.equal(proof.originalBinding.receiverStoreIdentity, identity);
  await assert.rejects(send(g, second, 'inspect', target(g.host.state), 'durable'), /duplicate_command_no_replay/);
  assert.equal(f.host.counts.evaluate + g.host.counts.evaluate, 1);
});

test('[cep-transport] B6 actual child crash intent and completion fsync boundaries survive reopen without replay', async t => {
  for (const boundary of ['intent', 'pending', 'completion']) {
    const directory = path.join(temp(t), 'store'), marker = path.join(path.dirname(directory), 'evaluations');
    const binding = { controllerId: 'crash-controller', channelEpoch: 'crash-channel', secret: 'synthetic-crash-secret' };
    const setupHost = vmHost(), setupDispatcher = createHostDispatcher({ ...install(SOURCE), csInterface: setupHost.csInterface });
    const inspection = command(binding, 'inspect', target(initialState()), 'setup');
    const before = await setupDispatcher.evaluate({ phase: 'inspect', payload: inspection.payload, command: inspection });
    const body = command(binding, 'mutate', { ...before.target, text: 'Crash-tested Ω', expectedText: before.text, expectedRevision: before.revision }, 'crashed');
    const child = spawnSync(process.execPath, [path.join(SOURCE, 'test/fixtures/cep-crash-child.js'), directory, marker, boundary, JSON.stringify(body)], { windowsHide: true, encoding: 'utf8' });
    assert.equal(child.status, boundary === 'intent' ? 71 : boundary === 'pending' ? 74 : 72, child.stderr);
    const f = await wire(t, { directory }), current = channel(2); await f.transport.connect(current);
    const proof = decode(await f.transport.completion('crashed'), current.secret);
    assert.equal(proof.state, boundary === 'completion' ? 'completed' : 'ongoing');
    await assert.rejects(send(f, current, 'inspect', target(f.host.state), 'crashed'), /duplicate_command_no_replay/);
    await assert.rejects(send(f, current, 'inspect', target(f.host.state), 'other'), /receiver_lane_closed/);
    assert.equal(f.host.counts.evaluate, 0); assert.equal(fs.existsSync(marker), boundary !== 'intent');
    if (fs.existsSync(marker)) assert.equal(fs.readFileSync(marker, 'utf8').trim(), 'evaluate');
    if (boundary !== 'intent') { const state = JSON.parse(fs.readFileSync(marker + '.state.json', 'utf8')); assert.equal(state.counts.titles, 1); assert.equal(state.text, 'Crash-tested Ω'); }
  }
});

test('[cep-transport] B6 disk write fsync failures and corruption close lane before false reply', async t => {
  // Origin=1, begin=2, completion=3. Both write and fsync faults are actual IO seam failures.
  for (const failAt of [{ write: 1 }, { sync: 1 }, { write: 2 }, { sync: 2 }, { write: 3 }, { sync: 3 }]) {
    const f = await wire(t, { io: counterIO(failAt) }), binding = channel(1); await f.transport.connect(binding);
    await assert.rejects(send(f, binding, 'inspect', target(f.host.state), 'fault'));
    assert.equal(f.host.counts.evaluate, (failAt.write || failAt.sync) < 3 ? 0 : 1);
    const proof = decode(await f.transport.completion('fault'), binding.secret); assert.equal(proof.state, 'unknown');
    assert.equal(f.store.closed, true); await assert.rejects(send(f, binding, 'inspect', target(f.host.state), 'next'));
  }
  const directory = path.join(temp(t), 'store'), store = openCompletionStore({ directory }); store.close(); fs.appendFileSync(path.join(directory, 'completions.ndjson'), '{torn');
  const broken = openCompletionStore({ directory }); t.after(() => broken.close()); assert.equal(broken.fault, true); assert.equal(broken.closed, true); assert.equal(broken.get('anything'), undefined);
});

test('[cep-transport] B7 Broker new authenticated channel reconciles original store proof then independent verify', async t => {
  const state = initialState(); let lose = true;
  const w = await wire(t, { state, loseReply: request => request.method === 'send' && decode(request.frame, bindingSecret).phase === 'mutate' && lose });
  // Capture only synthetic binding used by this private test channel.
  let bindingSecret; const originalConnect = w.channel.connect;
  w.channel.connect = async binding => { bindingSecret = binding.secret; return originalConnect(binding); };
  const f = fixture({ state, transport: w.transport }); f.state = state; t.after(() => { f.close(); fs.rmSync(f.temp, { recursive: true, force: true }); });
  const plan = await prepare(f); const stopped = await run(f, plan); assert.equal(stopped.state, 'stopped'); assert.equal(state.counts.titles, 1);
  const receipt = f.broker.ledger.commands()[0], origin = { ...receipt.dispatchBinding }; assert.equal(plan.pins.transport, w.transport.identity);
  const originalSecret = f.broker.secret;
  lose = false; await f.broker.disconnect(); await f.broker.connect();
  assert.notEqual(f.broker.channelEpoch, origin.channelEpoch); assert.notEqual(f.broker.secret, originalSecret);
  const prior = w.host.counts.evaluate; const task = await f.broker.reconcile({ taskId: plan.taskId });
  assert.equal(task.commands[0].state, 'succeeded'); assert.equal(w.host.counts.evaluate, prior + 1); assert.equal(state.counts.titles, 1);
  assert.deepEqual(f.broker.ledger.commands()[0].dispatchBinding, origin);
});

test('[cep-transport] B5 same Broker replacement journal rejects captured frame even after old CAS restored', async t => {
  const state = initialState(), first = await wire(t, { state }), second = await wire(t, { state });
  let active = first, capturedFrame;
  const transport = createTransport({ lifecycleProducer: first.lifecycleProducer, channel: { async connect(binding) {
    const connected = await active.channel.connect(binding);
    return { ...connected, send(frame) {
      if (!capturedFrame && decode(frame, binding.secret).phase === 'mutate') capturedFrame = frame;
      return connected.send(frame);
    } };
  } } });
  const f = fixture({ state, transport, hooks: { afterSend() { throw new Error('synthetic_lost_ack'); } } }); f.state = state;
  t.after(() => { f.close(); fs.rmSync(f.temp, { recursive: true, force: true }); });
  const plan = await prepare(f); assert.equal((await run(f, plan)).state, 'stopped');
  const receipt = f.broker.ledger.commands()[0], originalBinding = { ...receipt.dispatchBinding }, oldSecret = f.broker.secret;
  assert.equal(state.counts.titles, 1); assert.ok(capturedFrame); const originalFrame = capturedFrame;
  const body = decode(originalFrame, oldSecret);
  await f.broker.disconnect(); active = second; state.text = receipt.before.text;
  // Same project/layer/style/text now satisfy the old command's exact CAS again.
  const setup = createHostDispatcher({ ...install(SOURCE), csInterface: vmHost({ state }).csInterface });
  const snapshot = await setup.evaluate({ phase: 'inspect', payload: body.payload, command: body });
  assert.equal(snapshot.revision, body.payload.expectedRevision); assert.equal(snapshot.text, body.payload.expectedText);
  assert.equal((await f.broker.connect()).available, true);
  assert.notEqual(f.broker.receiverStoreIdentity, originalBinding.receiverStoreIdentity);
  assert.notEqual(f.broker.channelEpoch, originalBinding.channelEpoch); assert.notEqual(f.broker.secret, oldSecret);
  // Replay the exact authenticated bytes through actual TCP; no re-sign or Broker send.
  await assert.rejects(transport.send(originalFrame), /channel_auth/);
  assert.equal(second.wireFrames, 1); assert.equal(second.host.counts.evaluate, 0); assert.equal(state.counts.titles, 1);
  assert.equal(second.host.counts.native, 0); assert.equal((await f.broker.reconcile({ taskId: plan.taskId })).commands[0].state, 'UNKNOWN');
  assert.deepEqual(f.broker.ledger.commands()[0].dispatchBinding, originalBinding);
});

test('[cep-transport] B7 wrong origin store continuity and legacy receipt retain UNKNOWN', async t => {
  for (const kind of ['origin', 'store', 'legacy']) {
    const f = fixture({ hooks: { afterSend() { throw new Error('synthetic_ack_loss'); } } }); t.after(() => { f.close(); fs.rmSync(f.temp, { recursive: true, force: true }); });
    const plan = await prepare(f); await run(f, plan); const original = f.transport.completion;
    if (kind === 'origin') f.transport.completion = async commandId => {
      const proof = decode(await original(commandId), f.broker.secret); proof.originalBinding.controllerId = 'forged-origin'; return encode(proof, f.broker.secret);
    };
    if (kind === 'store') f.broker.receiverStoreIdentity = 'different-store';
    if (kind === 'legacy') delete f.broker.ledger.events.find(e => e.type === 'intent').dispatchBinding;
    const count = f.state.counts.titles; const task = await f.broker.reconcile({ taskId: plan.taskId }); assert.equal(task.commands[0].state, 'UNKNOWN'); assert.equal(f.state.counts.titles, count);
  }
});

test('[cep-transport] B7 reconnect after durable intent is rejected before physical mutate', async t => {
  const f = fixture({ hooks: { async afterIntent(receipt, broker) { await broker.disconnect(); await broker.connect(); } } });
  t.after(() => { f.close(); fs.rmSync(f.temp, { recursive: true, force: true }); });
  const plan = await prepare(f), result = await run(f, plan);
  assert.equal(result.code, 'dispatch_binding_changed'); assert.equal(f.state.counts.titles, 0); assert.equal(f.broker.ledger.commands()[0].state, 'rejected');
});

test('[cep-transport] B8 production lacks lifecycle issuer shallow ready JSON and public issuer tools', async t => {
  const transport = createTransport(); assert.equal((await transport.connect(channel(1))).reason, 'trusted_project_lifecycle_unavailable');
  let called = 0; const forged = createTransport({ channel: { connect() { called++; } }, lifecycleProducer: () => ({ kind: 'project-incarnation', lifecycleVerified: true, sessionId: 'forged', projectId: 'forged' }) });
  assert.equal((await forged.connect(channel(1))).reason, 'trusted_project_lifecycle_unavailable'); assert.equal(called, 0);
  const f = fixture(); t.after(() => { f.close(); fs.rmSync(f.temp, { recursive: true, force: true }); });
  f.transport.connect = async () => ({ receiverStoreIdentity: 'forged', sessionBinding: { kind: 'project-incarnation', lifecycleVerified: true, sessionId: f.state.sessionId, projectId: f.state.projectId } });
  assert.equal((await f.broker.connect()).reason, 'trusted_project_lifecycle_unavailable');
  const source = fs.readFileSync(path.join(SOURCE, 'core/stdio.js'), 'utf8'); assert.doesNotMatch(source, /brandLifecycle|installExecutors|syntheticAuthority/);
});

test('[cep-transport] B9 independent transport pin scoped owner public seam and explicit deferred integration coverage', t => {
  const ws = workspace(); t.after(() => fs.rmSync(ws.temp, { recursive: true, force: true }));
  const broker = new Broker({ root: ws.root, stateDir: ws.stateDir }); t.after(() => broker.close());
  const core = broker.status().coreIdentity, title = broker.getContract({ moduleId: 'titles' }).modulePin, photo = broker.getContract({ moduleId: 'photo-placeholder' }).modulePin;
  const before = createTransport().identity; const file = path.join(ws.root, 'integrations/cep/transport.js'); fs.appendFileSync(file, '\n// private integration revision\n');
  const packaged = JSON.parse(execFileSync(process.execPath, [path.join(ws.root, 'tools/seal.js'), '--integration', 'cep', '--trace'], { windowsHide: true, encoding: 'utf8' }));
  assert.notEqual(packaged.pin, before); assert.ok(packaged.reads.every(file => file.startsWith('integrations/cep/')));
  assert.equal(broker.status().coreIdentity, core); assert.equal(broker.getContract({ moduleId: 'titles' }).modulePin, title); assert.equal(broker.getContract({ moduleId: 'photo-placeholder' }).modulePin, photo);
  const cachedFactoryScript = "const fs=require('node:fs'),cp=require('node:child_process');const {createTransport}=require('./integrations/cep/transport');const original=createTransport().identity;fs.appendFileSync('./integrations/cep/transport.js','\\n// revised after require\\n');cp.execFileSync(process.execPath,['tools/seal.js','--integration','cep']);try{createTransport();process.exit(1)}catch(e){if(e.code!=='transport_artifact_bytes')throw e}";
  // A second copy isolates the cached-module mutation from the pin locality assertions.
  const cacheDir = path.join(ws.temp, 'cached'); fs.cpSync(SOURCE, cacheDir, { recursive: true });
  assert.equal(spawnSync(process.execPath, ['-e', cachedFactoryScript], { cwd: cacheDir, windowsHide: true }).status, 0);
  const privateReport = selectChecks(['core4/integrations/cep/transport.js']); assert.deepEqual(privateReport.checks.map(c => c.check), ['cep-transport']);
  const seam = selectChecks(['core4/core/receiver-api.js']); assert.ok(seam.checks.some(c => c.check === 'cep-transport')); assert.equal(seam.releaseCertified, false);
  const titles = selectChecks(['core4/modules/titles/implementation.js']); assert.ok(titles.deferredCoverage.some(c => c.check === 'cep-transport')); assert.ok(!titles.checks.some(c => c.check === 'cep-transport'));
});

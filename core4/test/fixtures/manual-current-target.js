'use strict';
// Private synthetic embedding only. No network, installed runtime, Broker or issuer.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { Worker, isMainThread, parentPort, workerData } = require('node:worker_threads');
const { initialState, environment } = require('./ae');
const { createReceiver, hash, canonical, encode, decode, envelope, dispatchBinding, sameDispatch, id, fail } = require('../../core/receiver-api');
const { createHostDispatcher } = require('../../integrations/cep/host-dispatcher');
const { openCompletionStore } = require('../../integrations/cep/completion-store');
const POLICY = 'current-matching-target-after-local-confirmation';
const root = path.resolve(__dirname, '../..');
const titlesSource = fs.readFileSync(path.join(root, 'modules/titles/executor.jsx'), 'utf8');
const titlesAdmission = JSON.parse(fs.readFileSync(path.join(root, 'config/admissions/titles.json'), 'utf8'));
if (titlesAdmission.executorHash !== hash(titlesSource)) fail('manual_reviewed_titles_bytes');
const transactionSource = fs.readFileSync(path.join(root, 'experiments/manual-current-target/transaction.jsx'), 'utf8');
// Source composition is fixed here, never supplied by a runtime command or payload.
const source = '(' + transactionSource + ')(' + titlesSource + ')';
const pins = Object.freeze({ titlesExecutorHash: hash(titlesSource), transactionSourceHash: hash(transactionSource), executorHash: hash(source) });
const clone = value => JSON.parse(JSON.stringify(value));
function freeze(value) { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
function contextFor(state, confirm) { return vm.createContext({ ...environment(state, () => {}), confirm }); }

// Only the blocked modal model needs a separate JS thread: the main Node timer
// must keep running while synthetic confirm waits. This models a timing window;
// it says nothing about actual AE modal dispatch or main-thread reentry.
if (!isMainThread && workerData?.manualCurrentTargetWorker) {
  const state = workerData.state;
  const context = contextFor(state, message => {
    parentPort.postMessage({ type: 'confirm', message });
    const gate = new Int32Array(workerData.gate);
    Atomics.wait(gate, 0, 0);
    return Atomics.load(gate, 0) === 1;
  });
  try { parentPort.postMessage({ type: 'result', result: new vm.Script(workerData.script).runInContext(context), state }); }
  catch (error) { parentPort.postMessage({ type: 'error', error: error.message, state }); }
}

function createManualFixture({ directory, state = initialState(), callbackTimeout = 1000, queue = false, missingCallback = false, blockConfirm = false, confirm = () => true } = {}) {
  const store = openCompletionStore({ directory });
  const binding = freeze({ controllerId: id('manual-controller'), channelEpoch: id('manual-channel'), secret: id('private-test-key') });
  const registry = new Map(), pending = [], workers = new Set(), confirmations = [];
  let current = state, fenced = store.closed, confirmGate, confirmResolve, resultResolve;
  let confirmSignal = new Promise(resolve => { confirmResolve = resolve; });
  let resultSignal = new Promise(resolve => { resultResolve = resolve; });
  const counts = { evaluate: 0, native: 0 };
  function run(script, callback) {
    const loseCallback = missingCallback && script.includes('executor.mutate(input)');
    if (blockConfirm && script.includes('executor.mutate(input)')) {
      const gate = new SharedArrayBuffer(4); confirmGate = new Int32Array(gate);
      const worker = new Worker(__filename, { workerData: { manualCurrentTargetWorker: true, state: current, script, gate } }); workers.add(worker);
      worker.on('message', message => {
        if (message.type === 'confirm') { confirmations.push(message.message); confirmResolve(); return; }
        Object.assign(current, message.state);
        resultResolve(); if (!loseCallback) callback(message.type === 'result' ? message.result : 'EvalScript error.');
      });
      worker.on('error', () => { resultResolve(); if (!loseCallback) callback('EvalScript error.'); });
      worker.on('exit', () => workers.delete(worker));
      return;
    }
    const context = contextFor(current, message => { confirmations.push(message); return confirm({ message, state: current, context }); });
    const result = new vm.Script(script).runInContext(context, { timeout: 1000 });
    resultResolve(); if (!loseCallback) callback(result);
  }
  const admission = freeze({ moduleId: 'manual-current-target-experiment', operationId: 'replace-current-source-text', executorHash: pins.executorHash, admissionRef: 'private-synthetic-review-only' });
  const dispatcher = createHostDispatcher({ csInterface: { evalScript(script, callback) {
    counts.evaluate++;
    resultSignal = new Promise(resolve => { resultResolve = resolve; });
    // Assert the actual receiver fsynced begin before physical evaluation.
    const records = fs.readFileSync(path.join(directory, 'completions.ndjson'), 'utf8').trim().split('\n').map(JSON.parse);
    if (records.at(-1).type !== 'begin') fail('missing_durable_begin');
    if (queue) pending.push(() => run(script, callback)); else run(script, callback);
  } }, reviewedAdmissions: [admission], installExecutors: [{ ...admission, source }], callbackTimeout });
  const receiver = createReceiver({ ...binding, admittedExecutors: dispatcher.admittedExecutors, completionStore: store, evaluate: async args => {
    const result = await dispatcher.evaluate(args);
    // Conservative experimental embedding: an uncertain setter/readback becomes
    // actual receiver UNKNOWN, durably fencing reopen; never a successful command.
    if (args.phase === 'mutate' && result.outcome === 'unknown') fail('manual_effect_unknown');
    return result;
  } });
  function command(phase, payload) {
    return { protocolVersion: 1, controllerId: binding.controllerId, channelEpoch: binding.channelEpoch, commandId: id('manual-command'), moduleId: admission.moduleId,
      operationId: admission.operationId, executorHash: pins.executorHash, phase, payloadHash: hash(canonical(payload)), payload: clone(payload) };
  }
  function validateRegistered(candidate) {
    const decoded = envelope(candidate), registered = registry.get(decoded.commandId);
    if (!registered || canonical(decoded) !== canonical(registered.command) ||
        !sameDispatch(dispatchBinding(decoded, store.identity), registered.origin)) fail('manual_unregistered_proposal');
    if (fenced || store.closed || dispatcher.physicalPending) fail('manual_lane_fenced');
    return decoded;
  }
  return {
    get state() { return current; }, counts, confirmations, store, dispatcher, receiver, pins,
    replaceState(next) { current = next; },
    async propose(text = 'After') {
      if (fenced || store.closed) fail('manual_lane_fenced');
      const target = { sessionId: current.sessionId, projectId: current.projectId, compId: 1, layerId: 102 };
      const inspection = command('inspect', target);
      const promise = receiver.receive(encode(inspection, binding.secret));
      if (queue) pending.shift()();
      const baseline = decode(await promise, binding.secret).result;
      const plan = { target, baseline, text, effect: 'replace-source-text', pins };
      const payload = { policy: POLICY, proposalId: id('manual-proposal'), planId: id('manual-plan'), planDigest: hash(plan), taskId: id('manual-task'), stepId: 'replace-title', ...plan };
      const registered = command('mutate', payload);
      registry.set(registered.commandId, freeze({ command: clone(registered), origin: dispatchBinding(registered, store.identity) }));
      return clone(registered);
    },
    frame(candidate) { return encode(candidate, binding.secret); },
    async submit(candidate) {
      validateRegistered(candidate);
      try { return decode(await receiver.receive(encode(candidate, binding.secret)), binding.secret); }
      catch (error) { fenced = true; throw error; }
    },
    async receive(frame) { const candidate = decode(frame, binding.secret); return this.submit(candidate); },
    completion(commandId) { return decode(receiver.completion(commandId), binding.secret); },
    release() { if (!pending.length) fail('no_queued_script'); pending.shift()(); },
    get queued() { return pending.length; },
    waitForConfirm() { return confirmSignal; },
    waitForResult() { return resultSignal; },
    agree(value = true) { if (!confirmGate) fail('no_modal_gate'); Atomics.store(confirmGate, 0, value ? 1 : 2); Atomics.notify(confirmGate, 0); },
    async close() { for (const worker of workers) await worker.terminate(); store.close(); }
  };
}
module.exports = { createManualFixture, POLICY, pins, source, clone };

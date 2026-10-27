'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { createManualFixture, POLICY, source, pins, clone } = require('./fixtures/manual-current-target');
const { initialState, environment } = require('./fixtures/ae');
const { hash, canonical, dispatchBinding, sameDispatch } = require('../core/receiver-api');
const { openCompletionStore } = require('../integrations/cep/completion-store');

async function fixture(t, options = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'core4-manual-target-'));
  const ownedDirectory = fs.realpathSync(directory), tempRoot = fs.realpathSync(os.tmpdir());
  const f = createManualFixture({ ...options, directory });
  Object.defineProperty(f, 'directory', { value: ownedDirectory });
  t.after(async () => {
    await f.close();
    const resolved = fs.realpathSync(ownedDirectory);
    assert.equal(resolved, ownedDirectory);
    assert.equal(path.dirname(resolved), tempRoot);
    assert.ok(path.basename(resolved).startsWith('core4-manual-target-'));
    assert.equal(fs.lstatSync(ownedDirectory).isSymbolicLink(), false);
    fs.rmSync(ownedDirectory, { recursive: true, force: true });
  });
  return f;
}
const tagged = name => '[manual-current-target] ' + name;

test(tagged('queued same-path same-IDs replacement requires fresh local confirmation; A untouched'), async t => {
  const a = initialState(); const f = await fixture(t, { state: a, queue: true });
  const command = await f.propose('After'); const b = initialState();
  assert.equal(command.payload.policy, POLICY);
  const promise = f.submit(command);
  assert.equal(f.store.get(command.commandId).state, 'ongoing'); assert.equal(f.queued, 1);
  assert.equal(a.counts.titles, 0); assert.equal(f.confirmations.length, 0);
  f.replaceState(b); f.release();
  const response = await promise;
  assert.equal(response.result.outcome, 'applied'); assert.equal(a.counts.titles, 0); assert.equal(b.counts.titles, 1);
  assert.equal(b.text, 'After'); assert.deepEqual(b.style, a.style);
  assert.equal(f.confirmations.length, 1);
  for (const exact of ['Изменить текст в текущем проекте?', 'в том числе после повторного открытия проекта', JSON.stringify(a.projectId), 'compId: 1', 'layerId: 102', 'Старый текст: "Before"', 'Новый текст: "After"']) assert.ok(f.confirmations[0].includes(exact));
  assert.equal(response.commandId, command.commandId); assert.equal(response.executorHash, pins.executorHash); assert.equal(response.payloadHash, command.payloadHash);
  const completion = f.completion(command.commandId);
  assert.equal(completion.state, 'completed'); assert.ok(sameDispatch(completion.originalBinding, dispatchBinding(command, f.store.identity)));
  assert.equal(f.counts.native, 0);
});

test(tagged('cancel on replacement gives zero setter and original target untouched'), async t => {
  const a = initialState(), b = initialState(); const f = await fixture(t, { state: a, queue: true, confirm: () => false });
  const command = await f.propose(); const pending = f.submit(command); f.replaceState(b); f.release();
  assert.equal((await pending).result.code, 'local_cancelled');
  assert.equal(a.counts.titles + b.counts.titles, 0); assert.equal(f.confirmations.length, 1);
});

test(tagged('full same-path project replacement inside confirm freshly resolves B and locally verifies B'), async t => {
  const a = initialState(), b = initialState();
  const f = await fixture(t, { state: a, confirm: ({ context }) => {
    assert.equal(a.counts.titles + b.counts.titles, 0);
    const next = environment(b, () => {});
    // Replace the whole project at the modal boundary, including its matching
    // synthetic class identity: otherwise instanceof would reject a VM artifact.
    context.app.project = next.app.project;
    context.CompItem = next.CompItem;
    return true;
  } });
  const command = await f.propose('Changed in B');
  const response = await f.submit(command);
  assert.equal(response.result.outcome, 'applied');
  assert.equal(a.text, 'Before'); assert.equal(a.counts.titles, 0);
  assert.equal(b.text, 'Changed in B'); assert.equal(b.counts.titles, 1);
  assert.equal(f.confirmations.length, 1);
  // Fresh separate local read of B through the actual reviewed helper. This is
  // synthetic readback evidence, not independent Broker/incarnation verification.
  const titles = new vm.Script(fs.readFileSync(path.join(__dirname, '../modules/titles/executor.jsx'), 'utf8'))
    .runInContext(vm.createContext(environment(b, () => {})));
  const freshB = JSON.parse(JSON.stringify(titles.verify(command.payload.target)));
  assert.deepEqual(response.result.snapshot, freshB);
  assert.equal(freshB.text, 'Changed in B');
  const completion = f.completion(command.commandId);
  assert.equal(completion.state, 'completed');
  assert.deepEqual(completion.response, response);
  assert.ok(sameDispatch(completion.originalBinding, dispatchBinding(command, f.store.identity)));
  assert.equal(f.counts.evaluate, 2); assert.equal(f.counts.native, 0);
});

test(tagged('immutable registered proposal rejects every forged binding before confirm/evaluate'), async t => {
  const f = await fixture(t); const command = await f.propose(); const initialEvaluates = f.counts.evaluate;
  const patches = [
    c => c.payload.proposalId += '-forged', c => c.payload.planId += '-forged', c => c.payload.planDigest = hash('forged'),
    c => c.payload.taskId += '-forged', c => c.payload.stepId += '-forged', c => c.payload.effect = 'other',
    c => c.payload.target.layerId++, c => c.payload.baseline.text = 'forged', c => c.payload.baseline.protected = '{}',
    c => c.payload.baseline.revision = 'forged', c => c.payload.pins.titlesExecutorHash = hash('forged'),
    c => c.payload.pins.transactionSourceHash = hash('forged'), c => c.payload.pins.executorHash = hash('forged'),
    c => c.payload.text = 'forged', c => c.payload.policy = 'original-incarnation', c => c.payload.confirmed = true,
    c => c.controllerId += '-forged', c => c.channelEpoch += '-forged', c => c.commandId += '-forged',
    c => c.moduleId = 'titles', c => c.operationId = 'forged', c => c.executorHash = hash('forged'), c => c.phase = 'verify'
  ];
  for (const patch of patches) {
    const forged = clone(command); patch(forged); forged.payloadHash = hash(canonical(forged.payload));
    await assert.rejects(f.receive(f.frame(forged)), /manual_unregistered_proposal/);
  }
  command.payload.text = 'mutated-returned-copy'; command.payloadHash = hash(canonical(command.payload));
  await assert.rejects(f.submit(command), /manual_unregistered_proposal/);
  assert.equal(f.counts.evaluate, initialEvaluates); assert.equal(f.confirmations.length, 0); assert.equal(f.state.counts.titles, 0);
  assert.equal(f.store.has(command.commandId), false);
});

test(tagged('all protected fields drift during modal confirmation reject before setter'), async t => {
  const original = initialState();
  for (const field of Object.keys(original.style)) {
    const f = await fixture(t, { confirm: ({ state }) => {
      const value = state.style[field]; state.style[field] = Array.isArray(value) ? value.map(v => v + 0.25) : typeof value === 'boolean' ? !value : typeof value === 'number' ? value + 1 : value + '-changed';
      return true;
    } });
    const command = await f.propose();
    const response = await f.submit(command);
    assert.equal(response.result.outcome, 'rejected', field); assert.equal(f.state.counts.titles, 0, field); assert.equal(f.confirmations.length, 1, field);
  }
});

test(tagged('text path comp/layer/session lock and effect constraints re-resolve after confirm'), async t => {
  const drifts = [
    ({ state }) => { state.text = 'Manual edit'; },
    ({ context }) => { context.app.project.file.fsName = 'C:/other.aep'; },
    ({ context }) => { context.app.project.item(1).id = 2; },
    ({ context }) => { context.app.project.item(1).layer(2).id = 103; },
    ({ context }) => { context.AE_CORE_SESSION_ID = 'different-synthetic-compatibility'; },
    ({ context }) => { context.app.project.item(1).layer(2).locked = true; },
    ...['numKeys', 'isTimeVarying', 'expressionEnabled', 'expression'].map(field => ({ context }) => {
      context.app.project.item(1).layer(2).property('ADBE Text Properties').property('ADBE Text Document')[field] = field === 'expression' ? 'unsafe' : 1;
    }),
    ({ state }) => { state.flags.mixed = true; }, ({ state }) => { state.flags.noCharacterRange = true; }
  ];
  for (const drift of drifts) {
    const f = await fixture(t, { confirm: args => { drift(args); return true; } });
    const command = await f.propose(); assert.equal((await f.submit(command)).result.outcome, 'rejected');
    assert.equal(f.state.counts.titles, 0); assert.equal(f.confirmations.length, 1);
  }
});

test(tagged('preconfirm drift is refused without dialog; quoted text remains data'), async t => {
  const f = await fixture(t, { queue: true }); const command = await f.propose('quote " ; arbitrary() \\ \u2028');
  f.state.text = 'Manual edit'; const pending = f.submit(command); f.release();
  assert.equal((await pending).result.outcome, 'rejected'); assert.equal(f.confirmations.length, 0); assert.equal(f.state.counts.titles, 0);
  const g = await fixture(t); const safe = await g.propose('quote " ; arbitrary() \\ \u2028');
  assert.equal((await g.submit(safe)).result.outcome, 'applied'); assert.equal(g.state.text, safe.payload.text); assert.equal(g.state.counts.titles, 1);
});

test(tagged('setter throws after effect or damages protected field leaves durable UNKNOWN and no replay'), async t => {
  for (const flag of ['textSetterThrows', 'damageStyle']) {
    const f = await fixture(t); const command = await f.propose(); f.state.flags[flag] = true;
    await assert.rejects(f.submit(command), /manual_effect_unknown/);
    assert.equal(f.state.counts.titles, 1); assert.equal(f.completion(command.commandId).state, 'unknown');
    assert.equal(f.store.closed, true);
    await assert.rejects(f.submit(command), /manual_lane_fenced/); await assert.rejects(f.propose(), /manual_lane_fenced/);
    assert.equal(f.state.counts.titles, 1);
    const original = f.completion(command.commandId).originalBinding;
    await f.close(); const reopened = openCompletionStore({ directory: f.directory });
    assert.equal(reopened.closed, true); assert.deepEqual(reopened.get(command.commandId).originalBinding, original); reopened.close();
  }
});

test(tagged('timeout before execution then late confirmation may mutate; UNKNOWN survives reopen'), async t => {
  const f = await fixture(t, { queue: true, callbackTimeout: 30 }); const command = await f.propose();
  await assert.rejects(f.submit(command), /host_callback_timeout/);
  const original = f.completion(command.commandId).originalBinding;
  assert.equal(f.state.counts.titles, 0); assert.equal(f.confirmations.length, 0); assert.equal(f.completion(command.commandId).state, 'unknown');
  f.release(); assert.equal(f.state.counts.titles, 1); assert.equal(f.confirmations.length, 1);
  assert.equal(f.completion(command.commandId).state, 'unknown'); assert.equal(f.dispatcher.physicalPending, true);
  await assert.rejects(f.submit(command), /manual_lane_fenced/);
  await f.close(); const reopened = openCompletionStore({ directory: f.directory });
  assert.equal(reopened.closed, true); assert.equal(reopened.get(command.commandId).state, 'unknown');
  assert.deepEqual(reopened.get(command.commandId).originalBinding, original); reopened.close();
});

test(tagged('timer during blocked confirm then late agree keeps original UNKNOWN and no replay'), async t => {
  const f = await fixture(t, { blockConfirm: true, callbackTimeout: 1000 }); const command = await f.propose();
  const pending = f.submit(command); const rejected = assert.rejects(pending, /host_callback_timeout/);
  await f.waitForConfirm(); assert.equal(f.completion(command.commandId).state, 'ongoing'); await rejected;
  assert.equal(f.state.counts.titles, 0); assert.equal(f.confirmations.length, 1);
  const original = f.completion(command.commandId).originalBinding;
  const finished = f.waitForResult(); f.agree(); await finished;
  assert.equal(f.state.counts.titles, 1); assert.equal(f.completion(command.commandId).state, 'unknown');
  assert.deepEqual(f.completion(command.commandId).originalBinding, original);
  await assert.rejects(f.submit(command), /manual_lane_fenced/); await assert.rejects(f.propose(), /manual_lane_fenced/);
});

test(tagged('actual receiver duplicates never re-evaluate and completed proof survives reopen'), async t => {
  const f = await fixture(t); const command = await f.propose(); const frame = f.frame(command);
  await f.submit(command); const evaluations = f.counts.evaluate;
  await assert.rejects(f.receiver.receive(frame), /duplicate_command_no_replay/);
  assert.equal(f.counts.evaluate, evaluations); assert.equal(f.state.counts.titles, 1);
  const before = f.completion(command.commandId);
  await f.close(); const reopened = openCompletionStore({ directory: f.directory });
  assert.equal(reopened.closed, false); assert.equal(reopened.get(command.commandId).state, 'completed');
  assert.deepEqual(reopened.get(command.commandId).response, before.response);
  assert.deepEqual(reopened.get(command.commandId).originalBinding, before.originalBinding); reopened.close();
});

test(tagged('lost host callback after effect durably fences without retry'), async t => {
  const f = await fixture(t, { callbackTimeout: 30, missingCallback: true });
  const command = await f.propose();
  await assert.rejects(f.submit(command), /host_callback_timeout/);
  const completion = f.completion(command.commandId);
  assert.equal(completion.state, 'unknown'); assert.equal(f.state.counts.titles, 1);
  await f.close(); const reopened = openCompletionStore({ directory: f.directory });
  assert.equal(reopened.closed, true); assert.equal(reopened.get(command.commandId).state, 'unknown');
  assert.deepEqual(reopened.get(command.commandId).originalBinding, completion.originalBinding); reopened.close();
});

test(tagged('reviewed JSX rejects payload Boolean/callback; separate local verify and sole setter'), () => {
  const state = initialState(), context = vm.createContext(environment(state, () => {}));
  const titles = new vm.Script(fs.readFileSync(path.join(__dirname, '../modules/titles/executor.jsx'), 'utf8')).runInContext(context);
  const target = { sessionId: state.sessionId, projectId: state.projectId, compId: 1, layerId: 102 };
  const baseline = JSON.parse(JSON.stringify(titles.inspect(target)));
  const factory = new vm.Script(fs.readFileSync(path.join(__dirname, '../experiments/manual-current-target/transaction.jsx'), 'utf8')).runInContext(context);
  let calls = 0, verified = 0; context.confirm = () => { calls++; return true; };
  const executor = factory({ inspect: p => titles.inspect(p), mutate: p => titles.mutate(p), verify: p => { verified++; return titles.verify(p); } });
  const payload = { policy: POLICY, proposalId: 'p', planId: 'plan', planDigest: 'd', taskId: 't', stepId: 's', effect: 'replace-source-text', target, baseline, pins, text: 'After' };
  assert.equal(executor.mutate({ ...payload, confirmed: true }).outcome, 'rejected');
  assert.equal(executor.mutate({ ...payload, confirm: () => true }).outcome, 'rejected');
  assert.equal(calls, 0); assert.equal(state.counts.titles, 0);
  assert.equal(executor.mutate(payload).outcome, 'applied'); assert.equal(calls, 1); assert.equal(verified, 1); assert.equal(state.counts.titles, 1);
  assert.equal((source.match(/\.setValue\(/g) || []).length, 1);
  const failingVerify = factory({ inspect: p => titles.inspect(p), mutate: p => titles.mutate(p), verify: () => { throw new Error('local verify failed'); } });
  const currentBaseline = JSON.parse(JSON.stringify(titles.inspect(target)));
  assert.equal(failingVerify.mutate({ ...payload, baseline: currentBaseline, text: 'Again' }).outcome, 'unknown');
  assert.equal(state.counts.titles, 2);
});

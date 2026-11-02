'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { canonical, hash } = require('../protocol/json');
const { dispatchBinding } = require('../protocol/dispatch');
const { inspectStartOverHistory, assertStartOverHistoryContinuation } = require('../runtime/start-over-inspection');
const error = code => e => e.code === code;
const origin = { type: 'origin', identity: 'receiver-start-over-test' };
const command = (id = 'old-read') => ({ protocolVersion: 1, controllerId: 'controller-test', channelEpoch: 'epoch-test', commandId: id, moduleId: 'project-inspection', operationId: 'inspect', executorHash: 'a'.repeat(64), phase: 'inspect', payloadHash: hash({}), payload: {} });
function journal(bodies) {
  const events = [];
  for (const value of bodies) { const body = { ...value, seq: events.length + 1, previousHash: events.at(-1)?.recordHash || 'origin' }; events.push({ ...body, recordHash: hash(body) }); }
  return Buffer.from(events.map(canonical).join('\n') + (events.length ? '\n' : ''));
}
const begin = c => ({ type: 'begin', commandId: c.commandId, commandDigest: hash(c), command: c, originalBinding: dispatchBinding(c, origin.identity) });
const complete = (c, outcome = 'rejected') => ({ type: 'complete', commandId: c.commandId, response: { protocolVersion: 1, commandId: c.commandId, executorHash: c.executorHash, payloadHash: c.payloadHash, result: { outcome } } });
const intent = c => ({ type: 'intent', commandId: c.commandId, dispatchBinding: dispatchBinding(c, origin.identity) });
const terminal = (c, state) => ({ type: 'command', commandId: c.commandId, state });
const base = { installationId: 'installation-test', machineId: 'test-machine', descriptorPath: 'test-only-descriptor' };
const inspect = (receiverBytes = null, ledgerBytes = null) => inspectStartOverHistory({ ...base, receiverBytes, ledgerBytes });
const cont = (initial, current) => assertStartOverHistoryContinuation({ ...base, initial, current });
const constraint = alteration => ({ type: 'constraint', record: { constraintId: 'constraint-test', schemaVersion: 2, resource: { projectId: 'test.aep' }, origin: { machineId: 'test-machine', aePid: 12, aeProcessBirth: '2026-11-02T14:10:25.3597850Z' }, owner: base.installationId, checkpointRef: 'checkpoint-test', allowedEffects: ['text-replace'], reservationOwner: base.installationId, unresolvedOutcome: false, revision: null, provenance: 'test', ...alteration } });

test('start-over-inspection idle and queued pre-submit history needs no AE exit and issues no authority', () => {
  for (const value of [inspect(), inspect(journal([origin]), journal([{ type: 'task', taskId: 'queued-task' }]))]) {
    assert.equal(value.requiresAEExit, false); assert.equal(value.archiveEligibleHistory, true); assert.deepEqual(value.blockedConstraints, []);
    assert.equal(value.historyFilesObserved, false); assert.equal(value.aeAuthority, false); assert.equal(value.resetPermit, false);
    assert.equal(Object.hasOwn(value, 'processDead'), false); assert.equal(Object.hasOwn(value, 'resetComplete'), false);
  }
});
test('start-over-inspection receiver ongoing UNKNOWN and unknown physical completion retain exact historical states', () => {
  const c = command();
  for (const tail of [[], [{ type: 'unknown', commandId: c.commandId }], [complete(c, 'unknown')]]) {
    const bytes = journal([origin, begin(c), ...tail]), before = Buffer.from(bytes), result = inspect(bytes);
    assert.equal(result.requiresAEExit, true); assert.equal(result.archiveEligibleHistory, true); assert.deepEqual(result.receiver.unresolved, [c.commandId]);
    assert.deepEqual(bytes, before); assert.equal(Object.isFrozen(result.receiver.commands[0]), true);
  }
});
test('start-over-inspection settled read rejection and mutation completion do not require restart alone', () => {
  for (const phase of ['inspect', 'mutate']) for (const outcome of ['applied', 'rejected']) {
    const c = { ...command(), phase }, value = inspect(journal([origin, begin(c), complete(c, outcome)]));
    assert.equal(value.requiresAEExit, false); assert.equal(value.receiver.commands[0].state, 'completed');
  }
});
test('start-over-inspection intent before submit and acknowledged command remain conservative without fabricated delivery status', () => {
  const c = command();
  for (const entries of [[intent(c)], [intent(c), terminal(c, 'acknowledged')], [{ type: 'reservation', state: 'reserved', reservation: { ref: 'reservation-test', commandId: c.commandId } }]]) {
    const result = inspect(null, journal(entries)); assert.equal(result.requiresAEExit, true); assert.equal(result.archiveEligibleHistory, true);
  }
  assert.equal(inspect(null, journal([intent(c), terminal(c, 'rejected')])).requiresAEExit, false);
});
test('start-over-inspection rejects contradictory Broker success and missing receiver rather than resetting broken history', () => {
  const c = command();
  assert.throws(() => inspect(null, journal([intent(c), terminal(c, 'succeeded')])), error('start_over_history_contradiction'));
  for (const [outcome, state] of [['applied', 'rejected'], ['rejected', 'succeeded']]) assert.throws(() => inspect(journal([origin, begin(c), complete(c, outcome)]), journal([intent(c), terminal(c, state)])), error('start_over_history_contradiction'));
});
test('start-over-inspection cross-journal matching binds receiver identity epoch and original command', () => {
  const c = command();
  for (const field of ['receiverStoreIdentity', 'channelEpoch', 'payloadHash', 'executorHash', 'controllerId', 'receiptRef']) {
    const i = intent(c); i.dispatchBinding[field] = 'changed-test';
    assert.throws(() => inspect(journal([origin, begin(c)]), journal([i])), e => ['start_over_history_binding', 'recovery_ledger_command'].includes(e.code));
  }
  const good = inspect(journal([origin, begin(c), complete(c)]), journal([intent(c), terminal(c, 'rejected')])); assert.equal(good.requiresAEExit, false);
});
test('start-over-inspection foreign owner reservation and shared file output fences cannot be archived into permission', () => {
  for (const [change, reason] of [[{ owner: 'foreign-owner', reservationOwner: null }, 'foreign_resource_owner'], [{ reservationOwner: 'foreign-owner' }, 'foreign_resource_owner'], [{ resource: { projectId: 'test.aep', file: 'shared.mov' } }, 'external_resource_fence'], [{ resource: { projectId: 'test.aep', output: 'shared.mov' } }, 'external_resource_fence']]) {
    const result = inspect(null, journal([constraint(change)])); assert.equal(result.archiveEligibleHistory, false); assert.deepEqual(result.blockedConstraints, [{ constraintId: 'constraint-test', reason }]);
  }
});
test('start-over-inspection unresolved own AE-local fence can retire only behind AE exit and original bytes remain unknown', () => {
  const bytes = journal([constraint({ unresolvedOutcome: true })]), before = Buffer.from(bytes), result = inspect(null, bytes);
  assert.equal(result.requiresAEExit, true); assert.equal(result.archiveEligibleHistory, true); assert.equal(result.ledger.unresolved[0].kind, 'constraint'); assert.deepEqual(bytes, before);
  assert.deepEqual(result.requiredAE, [{ pid: 12, birthTicks: '639292254253597850' }]);
});
test('start-over-inspection another machine legacy origin and imprecise AE birth cannot retire behind local process death', () => {
  for (const origin of [{ ...constraint({}).record.origin, machineId: 'other-machine' }, { ...constraint({}).record.origin, aeProcessBirth: '2026-11-02T14:10:25.359Z' }, { ...constraint({}).record.origin, aeProcessBirth: '2026-02-30T14:10:25.3597850Z' }]) {
    const result = inspect(null, journal([constraint({ origin })])); assert.equal(result.archiveEligibleHistory, false); assert.equal(result.blockedConstraints[0].reason, 'uncovered_resource_origin');
  }
  const legacy = constraint({ schemaVersion: 1, resource: { sessionId: 'old-session', projectId: 'test.aep' } }); delete legacy.record.origin;
  assert.equal(inspect(null, journal([legacy])).blockedConstraints[0].reason, 'uncovered_resource_origin');
});
test('start-over-inspection malformed own resource schemas and unresolved unfamiliar fences remain blocking', () => {
  for (const unresolvedOutcome of [false, true]) for (const change of [{ schemaVersion: 99 }, { origin: null }, { resource: null }, { extra: true }, { owner: null }]) {
    const result = inspect(null, journal([constraint({ ...change, unresolvedOutcome })])); assert.equal(result.archiveEligibleHistory, false); assert.equal(result.blockedConstraints.length, 1);
  }
  for (const unresolvedOutcome of ['yes', null, 1]) assert.equal(inspect(null, journal([constraint({ unresolvedOutcome })])).archiveEligibleHistory, false);
});
test('start-over-inspection uses latest constraint record without silently discarding a current foreign fence', () => {
  assert.equal(inspect(null, journal([constraint({ owner: 'foreign' }), constraint({})])).archiveEligibleHistory, true);
  assert.equal(inspect(null, journal([constraint({}), constraint({ owner: 'foreign' })])).archiveEligibleHistory, false);
});
test('start-over-inspection permits original completion during drain while preserving prefix and original uncertainty', () => {
  const c = command(), initial = { receiverBytes: journal([origin, begin(c)]), ledgerBytes: journal([intent(c)]) };
  const current = { receiverBytes: journal([origin, begin(c), complete(c)]), ledgerBytes: journal([intent(c), terminal(c, 'rejected')]) };
  const result = cont(initial, current);
  assert.equal(result.initial.requiresAEExit, true); assert.equal(result.current.requiresAEExit, false); assert.equal(result.requiresAEExit, true);
  assert.equal(result.originalPrefix.receiver.byteHash, hash(initial.receiverBytes)); assert.equal(result.current.receiver.byteHash, hash(current.receiverBytes));
  assert.equal(result.archiveEligibleHistory, true); assert.equal(result.resetPermit, false);
});
test('start-over-inspection a new receiver begin after the fence is refused even if both journals are valid append-only chains', () => {
  const c = command(), initial = { receiverBytes: journal([origin]), ledgerBytes: journal([]) }, current = { receiverBytes: journal([origin, begin(c), complete(c)]), ledgerBytes: journal([intent(c), terminal(c, 'rejected')]) };
  assert.throws(() => cont(initial, current), error('start_over_new_physical_command'));
  assert.throws(() => cont({ receiverBytes: null, ledgerBytes: null }, current), error('start_over_new_physical_command'));
  // An accepted Broker invocation may record its original pre-send refusal;
  // that does not fabricate a receiver delivery or execute a new command.
  assert.equal(cont(initial, { ...current, receiverBytes: initial.receiverBytes }).requiresAEExit, false);
});
test('start-over-inspection unchanged UNKNOWN remains unknown and is not relabelled cancelled or successful', () => {
  const c = command(), initial = { receiverBytes: journal([origin, begin(c), { type: 'unknown', commandId: c.commandId }]), ledgerBytes: journal([intent(c)]) };
  const result = cont(initial, initial); assert.equal(result.current.receiver.commands[0].state, 'unknown'); assert.equal(result.current.ledger.commands[0].state, 'UNKNOWN'); assert.equal(result.requiresAEExit, true);
});
test('start-over-inspection rejects truncated deleted and validly rehashed replacements of the original history prefix', () => {
  const c = command(), initial = { receiverBytes: journal([origin, begin(c)]), ledgerBytes: journal([intent(c)]) };
  for (const current of [{ ...initial, receiverBytes: null }, { ...initial, receiverBytes: journal([origin]) }, { ...initial, receiverBytes: journal([{ ...origin, identity: 'replaced' }]) }, { ...initial, ledgerBytes: null }, { ...initial, ledgerBytes: journal([{ type: 'task', taskId: 'replacement' }]) }]) assert.throws(() => cont(initial, current), error('start_over_history_prefix_changed'));
});
test('start-over-inspection missing histories may materialize during drain but existing empty ledger cannot disappear', () => {
  const initial = { receiverBytes: null, ledgerBytes: null }, current = { receiverBytes: journal([origin]), ledgerBytes: journal([]) };
  assert.equal(cont(initial, current).requiresAEExit, false); assert.equal(cont(initial, current).originalPrefix.receiver.present, false);
  assert.throws(() => cont(current, initial), error('start_over_history_prefix_changed'));
});
test('start-over-inspection newly encountered foreign fence during drain blocks archival even with a valid old prefix', () => {
  const initial = { receiverBytes: null, ledgerBytes: journal([]) }, current = { receiverBytes: null, ledgerBytes: journal([constraint({ owner: 'foreign' })]) };
  const result = cont(initial, current); assert.equal(result.archiveEligibleHistory, false); assert.equal(result.blockedConstraints[0].reason, 'foreign_resource_owner');
});
test('start-over-inspection an initial foreign fence cannot disappear by a later local record with the same ID', () => {
  const initial = { receiverBytes: null, ledgerBytes: journal([constraint({ owner: 'foreign' })]) }, current = { receiverBytes: null, ledgerBytes: journal([constraint({ owner: 'foreign' }), constraint({})]) };
  const result = cont(initial, current); assert.equal(result.current.archiveEligibleHistory, true); assert.equal(result.archiveEligibleHistory, false); assert.equal(result.blockedConstraints[0].reason, 'foreign_resource_owner');
});
test('start-over-inspection schema UTF8 chain and history budgets remain strict', () => {
  for (const value of [undefined, {}, { ...base, receiverBytes: null, ledgerBytes: null, permit: true }, { ...base, installationId: '', receiverBytes: null, ledgerBytes: null }]) assert.throws(() => inspectStartOverHistory(value), error('start_over_history_options'));
  for (const bytes of [Buffer.from([255, 10]), Buffer.from('{bad}\n'), journal([origin]).subarray(0, 7)]) assert.throws(() => inspect(bytes), e => /^recovery_/.test(e.code));
  assert.throws(() => cont({ receiverBytes: null }, { receiverBytes: null, ledgerBytes: null }), error('start_over_history_options'));
});

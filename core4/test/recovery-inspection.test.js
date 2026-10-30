'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { hash, canonical } = require('../protocol/json');
const { dispatchBinding } = require('../protocol/dispatch');
const { inspectReceiverHistory, inspectLedgerHistory, HISTORY_LIMITS } = require('../runtime/recovery-inspection');
const command = commandId => ({ protocolVersion: 1, controllerId: 'controller-fixture', channelEpoch: 'epoch-fixture', commandId,
  moduleId: 'project-inspection', operationId: 'inspect', executorHash: 'a'.repeat(64), phase: 'inspect', payloadHash: hash({}), payload: {} });
function journal(bodies) {
  const events = [];
  for (const value of bodies) { const body = { ...value, seq: events.length + 1, previousHash: events.at(-1)?.recordHash || 'origin' }; events.push({ ...body, recordHash: hash(body) }); }
  return Buffer.from(events.map(canonical).join('\n') + (events.length ? '\n' : ''));
}
const origin = { type: 'origin', identity: 'receiver-fixture' };
const begin = c => ({ type: 'begin', commandId: c.commandId, commandDigest: hash(c), command: c, originalBinding: dispatchBinding(c, origin.identity) });
const complete = c => ({ type: 'complete', commandId: c.commandId, response: { protocolVersion: 1, commandId: c.commandId, executorHash: c.executorHash, payloadHash: c.payloadHash, result: { readFailureVersion: 1, outcome: 'rejected', code: 'fixture-known-rejection' } } });
const intent = c => ({ type: 'intent', commandId: c.commandId, dispatchBinding: dispatchBinding(c, origin.identity) });
const ledger = bodies => inspectLedgerHistory(journal(bodies), { installationId: 'installation-fixture' });
const error = code => e => e.code === code;

test('recovery-inspection explicit missing histories and empty ledger report coverage without authority or a ready runtime', () => {
  for (const result of [inspectReceiverHistory(null), inspectLedgerHistory(null, { installationId: 'installation-fixture' }), ledger([])]) {
    assert.equal(result.settled, true); assert.equal(result.authority, false); assert.equal(result.historyFilesObserved, false); assert.equal(result.coverage, 'supplied-history-bytes');
    assert.equal('ready' in result, false); assert.equal('processDead' in result, false);
  }
  assert.equal(inspectReceiverHistory(null).present, false); assert.equal(ledger([]).present, true);
  assert.throws(() => inspectReceiverHistory(), error('recovery_history_budget'));
  assert.throws(() => inspectReceiverHistory(Buffer.alloc(0)), error('recovery_history_budget'));
  assert.throws(() => inspectLedgerHistory(null), error('recovery_inspection_options'));
});

test('recovery-inspection receiver origin and bound original completion settle supplied bytes and freeze facts', () => {
  const c = command('read-one'), bytes = journal([origin, begin(c), complete(c)]), before = Buffer.from(bytes);
  const result = inspectReceiverHistory(bytes);
  assert.deepEqual(bytes, before); assert.equal(result.settled, true); assert.equal(result.identity, origin.identity); assert.equal(result.eventCount, 3); assert.equal(result.byteHash, hash(bytes));
  assert.deepEqual(result.commands, [{ commandId: c.commandId, state: 'completed', physicalUnknown: false, terminalDisposition: false }]);
  assert.ok(Object.isFrozen(result) && Object.isFrozen(result.commands) && Object.isFrozen(result.commands[0]));
  assert.throws(() => result.commands.push({}), TypeError);
});

test('recovery-inspection ongoing and UNKNOWN remain unsettled without converting or discarding original history', () => {
  const c = command('read-one');
  for (const tail of [[], [{ type: 'unknown', commandId: c.commandId }]]) {
    const bytes = journal([origin, begin(c), ...tail]), before = Buffer.from(bytes), result = inspectReceiverHistory(bytes);
    assert.equal(result.settled, false); assert.deepEqual(result.unresolved, [c.commandId]); assert.deepEqual(bytes, before); assert.equal(result.commands[0].terminalDisposition, false);
  }
});

test('recovery-inspection receiver checks dispatch, response, payload digest and terminal ordering rather than only checksum', () => {
  const c = command('read-one');
  const badBinding = begin(c); badBinding.originalBinding.commandId = 'another';
  const badCommand = begin(c); badCommand.command = { ...c, payloadHash: 'b'.repeat(64) }; badCommand.commandDigest = hash(badCommand.command);
  const badResponse = complete(c); badResponse.response.commandId = 'another';
  for (const bodies of [[origin, badBinding], [origin, badCommand], [origin, begin(c), badResponse], [origin, complete(c)], [origin, begin(c), complete(c), complete(c)], [origin, begin(c), begin(c)], [origin, { ...origin }]]) {
    assert.throws(() => inspectReceiverHistory(journal(bodies)), e => /^recovery_receiver_/.test(e.code));
  }
  const missingResponse = complete(c); delete missingResponse.response;
  assert.throws(() => inspectReceiverHistory(journal([origin, begin(c), missingResponse])), error('recovery_history_schema'));
});

test('recovery-inspection a self-hashed forged terminal disposition is never accepted as settlement', () => {
  const c = command('read-one'), bytes = journal([origin, begin(c), { type: 'unknown', commandId: c.commandId },
    { type: 'terminal-read-failure-disposition', dispositionVersion: 1, commandId: c.commandId, seal: {}, authorization: {}, controlMac: '0'.repeat(64) }]);
  assert.throws(() => inspectReceiverHistory(bytes), error('recovery_receiver_disposition'));
});

test('recovery-inspection durable transport completion with unknown physical effect retains reply and remains fenced', () => {
  const c = { ...command('mutate-one'), phase: 'mutate' }, completion = complete(c); completion.response.result = { outcome: 'unknown', code: 'executor-error-after-start' };
  const bytes = journal([origin, begin(c), completion]), before = Buffer.from(bytes), result = inspectReceiverHistory(bytes);
  assert.equal(result.settled, false); assert.deepEqual(result.unresolved, [c.commandId]);
  assert.deepEqual(result.commands, [{ commandId: c.commandId, state: 'completed', physicalUnknown: true, terminalDisposition: false }]); assert.deepEqual(bytes, before);
  for (const outcome of ['applied', 'rejected']) { const known = complete(c); known.response.result = { outcome }; assert.equal(inspectReceiverHistory(journal([origin, begin(c), known])).settled, true); }
  const future = { ...c, phase: 'future-phase' }; assert.throws(() => inspectReceiverHistory(journal([origin, begin(future)])), error('recovery_receiver_binding'));
});

test('recovery-inspection torn UTF8 checksum sequence and oversized line histories fail closed', () => {
  const good = journal([origin]), changed = Buffer.from(good); changed[changed.indexOf('receiver')] ^= 1;
  const invalidUtf8 = Buffer.concat([Buffer.from([255]), good]);
  for (const bytes of [good.subarray(0, good.length - 1), changed, invalidUtf8, Buffer.from('{invalid}\n')]) {
    assert.throws(() => inspectReceiverHistory(bytes), error('recovery_history_invalid'));
  }
  for (const bytes of [Buffer.from(' '.repeat(256 * 1024 + 1) + '\n'), Buffer.from('\n'.repeat(HISTORY_LIMITS.events + 1))]) assert.throws(() => inspectReceiverHistory(bytes), error('recovery_history_budget'));
  assert.throws(() => inspectReceiverHistory(journal([{ type: 'future-event' }])), error('recovery_receiver_event'));
});

test('recovery-inspection ledger acknowledged command remains unresolved and original terminal outcome settles it', () => {
  const c = command('write-one'), start = [intent(c), { type: 'command', commandId: c.commandId, state: 'acknowledged' }];
  assert.equal(ledger(start).settled, false); assert.deepEqual(ledger(start).unresolved, [{ kind: 'command', id: c.commandId }]);
  for (const state of ['succeeded', 'rejected']) { const result = ledger([...start, { type: 'command', commandId: c.commandId, state }]); assert.equal(result.settled, true); assert.equal(result.commands[0].state, state); }
  for (const bodies of [[{ type: 'command', commandId: c.commandId, state: 'succeeded' }], [intent(c), intent(c)], [intent(c), { type: 'command', commandId: c.commandId, state: 'succeeded' }, { type: 'command', commandId: c.commandId, state: 'rejected' }], [{ ...intent(c), commandId: 'mismatch' }]]) assert.throws(() => ledger(bodies), error('recovery_ledger_command'));
});

test('recovery-inspection open reservation blocks even a succeeded command and only its original terminal ref settles it', () => {
  const c = command('write-one'), reserved = { type: 'reservation', state: 'reserved', reservation: { ref: 'reservation-one', commandId: c.commandId } };
  const bodies = [reserved, intent(c), { type: 'command', commandId: c.commandId, state: 'succeeded' }];
  assert.deepEqual(ledger(bodies).unresolved, [{ kind: 'reservation', id: 'reservation-one' }]);
  assert.equal(ledger([...bodies, { type: 'reservation', reservationRef: 'reservation-one', state: 'succeeded' }]).settled, true);
  for (const extra of [{ type: 'reservation', reservationRef: 'another', state: 'succeeded' }, { type: 'reservation', reservationRef: 'reservation-one', state: 'unknown' }, reserved]) assert.throws(() => ledger([...bodies, extra]), error('recovery_ledger_reservation'));
  assert.throws(() => ledger([reserved, { type: 'reservation', reservationRef: 'reservation-one', state: 'succeeded' }]), error('recovery_ledger_reservation'));
  assert.throws(() => ledger([...bodies, { type: 'reservation', reservationRef: 'reservation-one', state: 'rejected' }]), error('recovery_ledger_reservation'));
});

test('recovery-inspection latest durable constraints preserve unresolved foreign and unfamiliar fences', () => {
  const record = { constraintId: 'constraint-one', schemaVersion: 2, resource: { projectId: 'fixture.aep' }, origin: { machineId: 'fixture', aePid: 12, aeProcessBirth: 'birth-fixture' },
    owner: 'installation-fixture', checkpointRef: 'checkpoint-one', allowedEffects: ['text-replace'], reservationOwner: 'installation-fixture', unresolvedOutcome: false, revision: null, provenance: 'fixture' };
  assert.equal(ledger([{ type: 'constraint', record }]).settled, true);
  for (const alteration of [{ unresolvedOutcome: true }, { reservationOwner: 'foreign-installation' }, { schemaVersion: 99 }, { origin: null }, { resource: null }, { owner: null }, { extra: true }]) {
    const result = ledger([{ type: 'constraint', record: { ...record, ...alteration } }]); assert.equal(result.settled, false); assert.deepEqual(result.constraintFences, [record.constraintId]);
  }
  assert.equal(ledger([{ type: 'constraint', record: { ...record, unresolvedOutcome: true } }, { type: 'constraint', record }]).settled, true);
  assert.throws(() => ledger([{ type: 'future-effect' }]), error('recovery_ledger_event'));
});

test('recovery-inspection does not construct execution stores create directories write files or probe processes', () => {
  const c = command('read-one'), writes = ['mkdirSync', 'writeFileSync', 'appendFileSync', 'renameSync', 'unlinkSync'], saved = {};
  for (const name of writes) { saved[name] = fs[name]; fs[name] = () => assert.fail('filesystem mutation: ' + name); }
  saved.openSync = fs.openSync; fs.openSync = (...args) => { if (/[wax+]/.test(String(args[1]))) assert.fail('write open'); return saved.openSync(...args); };
  const kill = process.kill; process.kill = () => assert.fail('process probe');
  try { assert.equal(inspectReceiverHistory(journal([origin, begin(c), complete(c)])).settled, true); assert.equal(ledger([intent(c), { type: 'command', commandId: c.commandId, state: 'rejected' }]).settled, true); }
  finally { for (const [name, value] of Object.entries(saved)) fs[name] = value; process.kill = kill; }
});

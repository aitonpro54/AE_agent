'use strict';
// B3 supplied-history semantics only. No file mutation, process observation,
// ownership permit, AE authority or reset completion is issued by this module.
const { canonical, hash, fail } = require('../protocol/json');
const { sameDispatch } = require('../protocol/dispatch');
const { inspectReceiverHistory, inspectLedgerHistory } = require('./recovery-inspection');
const { parseJournalBytes } = require('./native-read-disposition');
const equal = (a, b) => canonical(a) === canonical(b);
const text = value => typeof value === 'string' && value.length > 0 && Buffer.byteLength(value) <= 8192;
function exact(value, keys) {
  if (!value || Object.getPrototypeOf(value) !== Object.prototype || !equal(Object.keys(value).sort(), [...keys].sort())) fail('start_over_history_options');
}
function freeze(value) {
  if (value && typeof value === 'object') { for (const item of Object.values(value)) freeze(item); Object.freeze(value); }
  return value;
}
function input(value) {
  exact(value, ['installationId', 'machineId', 'descriptorPath', 'receiverBytes', 'ledgerBytes']);
  if (!text(value.installationId) || !text(value.machineId) || !text(value.descriptorPath)) fail('start_over_history_options');
  // The established parser performs byte/event/frame/UTF8/chain/schema checks.
  const receiver = inspectReceiverHistory(value.receiverBytes, { descriptorPath: value.descriptorPath });
  const ledger = inspectLedgerHistory(value.ledgerBytes, { installationId: value.installationId, receiver });
  const events = bytes => bytes?.length ? parseJournalBytes(bytes).events : [];
  return { receiver, ledger, receives: events(value.receiverBytes), entries: events(value.ledgerBytes) };
}
function crossCheck(receives, entries) {
  const begins = new Map(), replies = new Map(), intents = new Map(), terminals = new Map();
  for (const e of receives) {
    if (e.type === 'begin') begins.set(e.commandId, e);
    if (e.type === 'complete') replies.set(e.commandId, e.response.result);
  }
  for (const e of entries) {
    if (e.type === 'intent') intents.set(e.commandId, e);
    if (e.type === 'command') terminals.set(e.commandId, e.state);
  }
  for (const [id, e] of intents) {
    const begin = begins.get(id), state = terminals.get(id), reply = replies.get(id);
    if (begin && !sameDispatch(begin.originalBinding, e.dispatchBinding)) fail('start_over_history_binding');
    // A pre-submit rejection legitimately has no receiver begin. An unresolved
    // intent can predate submit; a succeeded command cannot lack its receiver.
    if (!begin && state === 'succeeded') fail('start_over_history_contradiction');
    if (reply?.outcome === 'applied' && state === 'rejected' || reply?.outcome === 'rejected' && state === 'succeeded') fail('start_over_history_contradiction');
  }
}
function aeScope(origin, machineId) {
  if (!origin || origin.machineId !== machineId || !Number.isSafeInteger(origin.aePid) || origin.aePid < 1 || origin.aePid > 0xffffffff || typeof origin.aeProcessBirth !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{7}Z$/.test(origin.aeProcessBirth)) return null;
  const birth = origin.aeProcessBirth, time = Date.parse(birth);
  if (!Number.isFinite(time) || new Date(time).toISOString() !== birth.slice(0, 23) + 'Z') return null;
  const ticks = BigInt(time) * 10000n + 621355968000000000n + BigInt(birth.slice(23, 27));
  if (ticks < 1n || ticks > 3155378975999999999n) return null;
  return { pid: origin.aePid, birthTicks: String(ticks) };
}
function constraints(entries, ledger, receives, installationId, machineId) {
  const latest = new Map(), invalid = new Set(ledger.constraintFences);
  for (const e of entries) if (e.type === 'constraint') latest.set(e.record.constraintId, e.record);
  const intents = new Map(entries.filter(e => e.type === 'intent').map(e => [e.checkpoint?.ref, e]));
  const terminals = new Map(entries.filter(e => e.type === 'command').map(e => [e.commandId, e]));
  const reservations = new Map(entries.filter(e => e.type === 'reservation' && e.reservationRef).map(e => [e.reservationRef, e]));
  const replies = new Map(receives.filter(e => e.type === 'complete').map(e => [e.commandId, e]));
  return [...latest].flatMap(([constraintId, record]) => {
    // AE process death can retire this installation's AE-local execution fence.
    // It cannot release a foreign writer, a file/output lease, or an unfamiliar
    // schema. The first reset implementation refuses these cases explicitly.
    const foreign = record.owner !== installationId || record.reservationOwner !== null && record.reservationOwner !== installationId;
    const intent = intents.get(record.checkpointRef), terminal = terminals.get(intent?.commandId), reply = replies.get(intent?.commandId);
    const reservation = reservations.get(intent?.grant?.reservationRef);
    // An imported input is read-only. Require every original success and
    // reservation binding before distinguishing it from an external fence.
    const settledInput = !foreign && !invalid.has(constraintId) && record.unresolvedOutcome === false &&
      record.resource?.file && !Object.hasOwn(record.resource, 'output') &&
      equal(record.allowedEffects, ['project-media-import']) && intent?.selected?.contract?.operationId === 'ingest-footage' &&
      intent.grant?.allowedEffect === 'project-media-import' && intent.grant.owner === installationId &&
      equal(intent.target, record.resource) && equal(intent.grant.executionScope?.origin, record.origin) &&
      reservation?.state === 'succeeded' && terminal?.state === 'succeeded' && reply?.response?.result?.outcome === 'applied';
    const external = !settledInput && record.resource && ['file', 'output'].some(k => Object.hasOwn(record.resource, k));
    const malformed = invalid.has(constraintId) && record.unresolvedOutcome !== true;
    // Validate an unresolved own record with that one field normalized for
    // schema inspection only. The original record/UNKNOWN bytes stay untouched.
    let invalidOwn = false;
    if (invalid.has(constraintId) && record.unresolvedOutcome === true && !foreign && !external) {
      const body = { type: 'constraint', record: { ...record, unresolvedOutcome: false }, seq: 1, previousHash: 'origin' };
      const bytes = Buffer.from(canonical({ ...body, recordHash: hash(body) }) + '\n');
      invalidOwn = inspectLedgerHistory(bytes, { installationId }).constraintFences.length > 0;
    }
    const localOrigin = record.schemaVersion === 2 && aeScope(record.origin, machineId);
    const reason = foreign ? 'foreign_resource_owner' : external ? 'external_resource_fence' : malformed || invalidOwn ? 'unsupported_resource_fence' : !localOrigin ? 'uncovered_resource_origin' : null;
    return reason ? [{ constraintId, reason }] : [];
  });
}
function inspectStartOverHistory(value) {
  const { receiver, ledger, receives, entries } = input(value);
  crossCheck(receives, entries);
  const blockedConstraints = constraints(entries, ledger, receives, value.installationId, value.machineId);
  const requiredAE = new Map();
  // Preserve exact known AE incarnations needed by unresolved own constraints;
  // death of just the currently adopted/new AE cannot retire an older scope.
  for (const e of entries) if (e.type === 'constraint' && e.record.owner === value.installationId && e.record.unresolvedOutcome === true) {
    const s = aeScope(e.record.origin, value.machineId); if (s) requiredAE.set(s.pid + ':' + s.birthTicks, s);
  }
  const unresolvedCommands = ledger.unresolved.filter(v => v.kind !== 'constraint');
  // Never infer that an accepted intent/receiver begin remained undelivered.
  // Queued work with no physical journal/intent is the only cheap idle path.
  const requiresAEExit = receiver.unresolved.length > 0 || unresolvedCommands.length > 0 || ledger.constraintFences.length > 0;
  return freeze({ coverage: 'supplied-history-bytes', historyFilesObserved: false, aeAuthority: false, resetPermit: false,
    receiver: { present: receiver.present, byteHash: receiver.byteHash, eventCount: receiver.eventCount, tailHash: receiver.tailHash, identity: receiver.identity, commands: receiver.commands, unresolved: receiver.unresolved },
    ledger: { present: ledger.present, byteHash: ledger.byteHash, eventCount: ledger.eventCount, tailHash: ledger.tailHash, commands: ledger.commands, reservations: ledger.reservations, unresolved: ledger.unresolved },
    requiresAEExit, requiredAE: [...requiredAE.values()], blockedConstraints, archiveEligibleHistory: blockedConstraints.length === 0 });
}
function prefixFact(bytes) {
  return { present: bytes !== null, byteLength: bytes?.length ?? 0, byteHash: bytes === null ? null : hash(bytes) };
}
function assertStartOverHistoryContinuation(value) {
  exact(value, ['installationId', 'machineId', 'descriptorPath', 'initial', 'current']);
  exact(value.initial, ['receiverBytes', 'ledgerBytes']); exact(value.current, ['receiverBytes', 'ledgerBytes']);
  const common = { installationId: value.installationId, machineId: value.machineId, descriptorPath: value.descriptorPath };
  const initial = inspectStartOverHistory({ ...common, ...value.initial }), current = inspectStartOverHistory({ ...common, ...value.current });
  for (const key of ['receiverBytes', 'ledgerBytes']) {
    const a = value.initial[key], b = value.current[key];
    // Missing → created is allowed during drain, not deletion or replacement of
    // an observed file. The filesystem adapter separately pins inode identity.
    if (a !== null && (b === null || b.length < a.length || !b.subarray(0, a.length).equals(a))) fail('start_over_history_prefix_changed');
  }
  // The reset fence precedes this prefix. Accepted callbacks may complete, but
  // a new receiver begin would prove that physical submission crossed it. Do
  // not normalize that into an ordinary drain merely because the chain is valid.
  const appended = value.current.receiverBytes === null ? [] : parseJournalBytes(value.current.receiverBytes).events.slice(initial.receiver.eventCount);
  if (appended.some(e => e.type === 'begin')) fail('start_over_new_physical_command');
  const blockedConstraints = [...new Map([...initial.blockedConstraints, ...current.blockedConstraints].map(c => [c.constraintId + ':' + c.reason, c])).values()];
  return freeze({ coverage: 'supplied-history-continuation', historyFilesObserved: false, aeAuthority: false, resetPermit: false,
    initial, current, originalPrefix: { receiver: prefixFact(value.initial.receiverBytes), ledger: prefixFact(value.initial.ledgerBytes) },
    // A completion during drain does not erase that old physical work existed.
    requiresAEExit: initial.requiresAEExit || current.requiresAEExit,
    requiredAE: [...new Map([...initial.requiredAE, ...current.requiredAE].map(s => [s.pid + ':' + s.birthTicks, s])).values()],
    blockedConstraints,
    archiveEligibleHistory: blockedConstraints.length === 0 });
}
module.exports = { inspectStartOverHistory, assertStartOverHistoryContinuation };

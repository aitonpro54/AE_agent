'use strict';
// Supplied-history semantic facts. No filesystem observation, store constructor,
// ownership recovery, authority issuance or command replay lives here. Signed
// legacy dispositions retain the existing read-only lineage/crypto validator.
const { hash, canonical, fail, MAX_FRAME } = require('../protocol/json');
const { dispatchBinding, sameDispatch } = require('../protocol/dispatch');
const { parseJournalBytes, validateDisposition } = require('./native-read-disposition');
const HISTORY_LIMITS = Object.freeze({ bytes: 64 * 1024 * 1024, events: 65536 });
const LEDGER_TYPES = new Set(['task', 'evidence', 'build', 'proposal', 'checkpoint', 'intent', 'command', 'engine', 'reservation', 'constraint']);
const text = value => typeof value === 'string' && value.length > 0 && Buffer.byteLength(value) <= 8192;
function exact(value, keys) {
  if (!value || Object.getPrototypeOf(value) !== Object.prototype || Object.keys(value).length !== keys.length || keys.some(k => !Object.hasOwn(value, k))) fail('recovery_history_schema');
}
function options(value, allowed) {
  if (!value || Object.getPrototypeOf(value) !== Object.prototype || Object.keys(value).some(k => !allowed.includes(k))) fail('recovery_inspection_options');
}
function freeze(value) {
  if (value && typeof value === 'object') { for (const child of Object.values(value)) freeze(child); Object.freeze(value); }
  return value;
}
function parsed(bytes, empty = false) {
  if (!Buffer.isBuffer(bytes) || bytes.length > HISTORY_LIMITS.bytes || !bytes.length && !empty) fail('recovery_history_budget');
  if (!bytes.length) return { events: [], lines: [] };
  let lines = 0, start = 0;
  for (let at = bytes.indexOf(10); at >= 0; at = bytes.indexOf(10, start)) {
    if (++lines > HISTORY_LIMITS.events || at - start > MAX_FRAME) fail('recovery_history_budget');
    start = at + 1;
  }
  if (bytes.length - start > MAX_FRAME) fail('recovery_history_budget');
  let result;
  try { result = parseJournalBytes(bytes); } catch { fail('recovery_history_invalid'); }
  if (result.events.length > HISTORY_LIMITS.events) fail('recovery_history_budget');
  return result;
}
function envelope(event, fields) { exact(event, [...fields, 'seq', 'previousHash', 'recordHash']); }
function facts(bytes, events, extra) {
  return freeze({ present: bytes !== null, byteHash: bytes === null ? null : hash(bytes), eventCount: events.length,
    tailHash: events.at(-1)?.recordHash || null, coverage: 'supplied-history-bytes', historyFilesObserved: false, authority: false, ...extra });
}
function inspectReceiverHistory(bytes, context = {}) {
  options(context, ['descriptorPath', 'cepDir']);
  if (bytes === null) return facts(null, [], { identity: null, commands: [], unresolved: [], settled: true });
  const { events, lines } = parsed(bytes), records = new Map(); let identity;
  for (const event of events) {
    if (event.type === 'origin') {
      envelope(event, ['type', 'identity']);
      if (event.seq !== 1 || !text(event.identity)) fail('recovery_receiver_order');
      identity = event.identity;
    } else if (event.type === 'begin') {
      envelope(event, ['type', 'commandId', 'commandDigest', 'command', 'originalBinding']);
      const command = event.command;
      exact(command, ['protocolVersion', 'controllerId', 'channelEpoch', 'commandId', 'moduleId', 'operationId', 'executorHash', 'phase', 'payloadHash', 'payload']);
      if (!identity || !text(event.commandId) || records.has(event.commandId) || command.protocolVersion !== 1 ||
          ['controllerId', 'channelEpoch', 'commandId', 'moduleId', 'operationId', 'executorHash', 'phase', 'payloadHash'].some(k => !text(command[k])) ||
          !['inspect', 'mutate', 'verify'].includes(command.phase) || command.commandId !== event.commandId || command.payloadHash !== hash(command.payload) || event.commandDigest !== hash(command)) fail('recovery_receiver_binding');
      try { if (!sameDispatch(event.originalBinding, dispatchBinding(command, identity))) fail('recovery_receiver_binding'); } catch { fail('recovery_receiver_binding'); }
      records.set(event.commandId, { command, state: 'ongoing', physicalUnknown: false, terminalDisposition: false });
    } else if (event.type === 'complete' || event.type === 'unknown') {
      envelope(event, event.type === 'complete' ? ['type', 'commandId', 'response'] : ['type', 'commandId']);
      const prior = records.get(event.commandId);
      if (!prior || prior.state !== 'ongoing') fail('recovery_receiver_order');
      if (event.type === 'complete') {
        exact(event.response, ['protocolVersion', 'commandId', 'executorHash', 'payloadHash', 'result']);
        if (event.response.protocolVersion !== 1 || ['commandId', 'executorHash', 'payloadHash'].some(k => event.response[k] !== prior.command[k]) ||
            !event.response.result || Object.getPrototypeOf(event.response.result) !== Object.prototype) fail('recovery_receiver_response');
        const outcome = event.response.result.outcome;
        if (Object.hasOwn(event.response.result, 'outcome') && !['applied', 'rejected', 'unknown'].includes(outcome) || prior.command.phase === 'mutate' && !['applied', 'rejected', 'unknown'].includes(outcome)) fail('recovery_receiver_response');
        // A durable transport reply can still describe an unknown physical
        // mutation. Preserve that reply; never turn it into settled ownership.
        prior.physicalUnknown = outcome === 'unknown';
      }
      prior.state = event.type === 'complete' ? 'completed' : 'unknown';
    } else if (event.type === 'terminal-read-failure-disposition') {
      const prior = records.get(event.commandId);
      if (!prior || prior.state !== 'unknown' || prior.terminalDisposition) fail('recovery_receiver_order');
      try {
        const checked = validateDisposition(event, { ...context, journalPrefixBytes: Buffer.from(lines.slice(0, 3).join('\n') + '\n') });
        if (canonical(checked.command) !== canonical(prior.command) || !sameDispatch(checked.binding, dispatchBinding(prior.command, identity))) fail('recovery_receiver_disposition');
      } catch { fail('recovery_receiver_disposition'); }
      prior.terminalDisposition = true;
    } else fail('recovery_receiver_event');
  }
  if (!identity) fail('recovery_receiver_origin');
  const commands = [...records.entries()].map(([commandId, record]) => ({ commandId, state: record.state, physicalUnknown: record.physicalUnknown, terminalDisposition: record.terminalDisposition }));
  const unresolved = commands.filter(c => (c.state !== 'completed' || c.physicalUnknown) && !c.terminalDisposition).map(c => c.commandId);
  return facts(bytes, events, { identity, commands, unresolved, settled: unresolved.length === 0 });
}
function inspectLedgerHistory(bytes, context = {}) {
  options(context, ['installationId']);
  if (!text(context.installationId)) fail('recovery_inspection_options');
  if (bytes === null) return facts(null, [], { commands: [], reservations: [], constraintFences: [], unresolved: [], settled: true });
  const { events } = parsed(bytes, true), commands = new Map(), reservations = new Map(), constraints = new Map();
  for (const event of events) {
    if (!LEDGER_TYPES.has(event.type)) fail('recovery_ledger_event');
    if (event.type === 'intent') {
      if (!text(event.commandId) || commands.has(event.commandId)) fail('recovery_ledger_command');
      try { if (!sameDispatch(event.dispatchBinding, event.dispatchBinding) || event.dispatchBinding.commandId !== event.commandId) fail('recovery_ledger_command'); } catch { fail('recovery_ledger_command'); }
      commands.set(event.commandId, 'UNKNOWN');
    } else if (event.type === 'command') {
      if (!commands.has(event.commandId) || !['acknowledged', 'succeeded', 'rejected'].includes(event.state) || ['succeeded', 'rejected'].includes(commands.get(event.commandId))) fail('recovery_ledger_command');
      commands.set(event.commandId, event.state);
    } else if (event.type === 'reservation') {
      if (event.state === 'reserved') {
        if (!text(event.reservation?.ref) || reservations.has(event.reservation.ref) || !text(event.reservation.commandId)) fail('recovery_ledger_reservation');
        reservations.set(event.reservation.ref, { ref: event.reservation.ref, commandId: event.reservation.commandId, state: 'reserved' });
      } else {
        const prior = reservations.get(event.reservationRef);
        if (!prior || prior.state !== 'reserved' || !commands.has(prior.commandId) || !['succeeded', 'rejected'].includes(event.state)) fail('recovery_ledger_reservation');
        prior.state = event.state;
      }
    } else if (event.type === 'constraint') {
      const record = event.record;
      if (!record || !text(record.constraintId)) fail('recovery_ledger_constraint');
      constraints.set(record.constraintId, record);
    }
  }
  const commandFacts = [...commands].map(([commandId, state]) => ({ commandId, state })), reservationFacts = [...reservations.values()];
  if (reservationFacts.some(r => r.state !== 'reserved' && ['succeeded', 'rejected'].includes(commands.get(r.commandId)) && r.state !== commands.get(r.commandId))) fail('recovery_ledger_reservation');
  const constraintFences = [...constraints.values()].filter(c => {
    const keys = ['constraintId', 'schemaVersion', 'resource', 'owner', 'checkpointRef', 'allowedEffects', 'reservationOwner', 'unresolvedOutcome', 'revision', 'provenance', ...(c.schemaVersion === 2 ? ['origin'] : [])];
    if (Object.keys(c).length !== keys.length || keys.some(k => !Object.hasOwn(c, k)) || ![1, 2].includes(c.schemaVersion) || !text(c.owner) || !text(c.checkpointRef) || !text(c.provenance) ||
        !Array.isArray(c.allowedEffects) || c.allowedEffects.some(e => !text(e)) || c.revision !== null && !text(c.revision) || typeof c.unresolvedOutcome !== 'boolean' || c.unresolvedOutcome ||
        c.reservationOwner !== null && (!text(c.reservationOwner) || c.reservationOwner !== context.installationId)) return true;
    const r = c.resource;
    if (!r || Object.getPrototypeOf(r) !== Object.prototype || !text(r.projectId) || c.schemaVersion === 1 && !text(r.sessionId) ||
        Object.keys(r).some(k => !['sessionId', 'projectId', 'compId', 'layerId', 'itemId', 'file', 'output'].includes(k)) ||
        ['sessionId', 'projectId', 'file', 'output'].some(k => Object.hasOwn(r, k) && !text(r[k])) ||
        ['compId', 'layerId', 'itemId'].some(k => Object.hasOwn(r, k) && (!Number.isSafeInteger(r[k]) || r[k] < 1))) return true;
    if (c.schemaVersion === 2) {
      const o = c.origin;
      if (!o || Object.keys(o).sort().join(',') !== 'aePid,aeProcessBirth,machineId' || !text(o.machineId) || !text(o.aeProcessBirth) || !Number.isSafeInteger(o.aePid) || o.aePid < 1) return true;
    }
    return false;
  }).map(c => c.constraintId);
  const unresolved = [...commandFacts.filter(c => !['succeeded', 'rejected'].includes(c.state)).map(c => ({ kind: 'command', id: c.commandId })),
    ...reservationFacts.filter(r => r.state === 'reserved').map(r => ({ kind: 'reservation', id: r.ref })), ...constraintFences.map(id => ({ kind: 'constraint', id }))];
  return facts(bytes, events, { commands: commandFacts, reservations: reservationFacts, constraintFences, unresolved, settled: unresolved.length === 0 });
}
module.exports = { inspectReceiverHistory, inspectLedgerHistory, HISTORY_LIMITS };

'use strict';
// Private installed embedding, reached only after full owner bootstrap checks.
// Seals describe local provenance; process/election/CAS/history facts remain
// independent admission requirements. Nothing here issues AE/project authority.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const crypto = require('node:crypto');
const { canonical, hash, fail } = require('../protocol/json');
const { inspectReceiverHistory, inspectLedgerHistory } = require('./recovery-inspection');
const { observeOwnerProcess, classifyOwnerProcess } = require('./windows-owner-process');
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const HEX = /^[a-f0-9]{64}$/;
const BINDINGS = ['version', 'kind', 'installationId', 'machineId', 'descriptorHash'];
const STATS = ['dev', 'ino', 'size', 'birthtimeNs', 'mtimeNs', 'ctimeNs'];
const MARKERS = ['owner', 'ownerNext', 'diagnostic', 'brokerOwner', 'brokerGate', 'receiverOwner'];
const PROTECTED = ['descriptor', 'origin', 'anchor', 'journal', 'ledger'];
const METADATA_LIMIT = 128 * 1024;
function exact(value, keys) {
  if (!value || Object.getPrototypeOf(value) !== Object.prototype || Object.keys(value).length !== keys.length || keys.some(k => !Object.hasOwn(value, k))) fail('owner_lifecycle_schema');
}
function scope(value) {
  exact(value, ['bootId', 'pid', 'birthTicks', 'brokerToken', 'receiverToken', 'startupToken']);
  if (!['bootId', 'brokerToken', 'receiverToken', 'startupToken'].every(k => UUID.test(value[k])) || !Number.isSafeInteger(value.pid) || value.pid < 1 || value.pid > 0xffffffff ||
      typeof value.birthTicks !== 'string' || !/^[1-9][0-9]{0,18}$/.test(value.birthTicks) || BigInt(value.birthTicks) > 3155378975999999999n) fail('owner_lifecycle_scope');
}
function plain(file, missing = false, directory = false) {
  if (!path.isAbsolute(file) || path.resolve(file) !== file) fail('owner_lifecycle_path');
  let cursor = path.parse(file).root;
  const parts = file.slice(cursor.length).split(path.sep).filter(Boolean);
  for (let n = 0; n < parts.length; n++) {
    cursor = path.join(cursor, parts[n]); let stat;
    try { stat = fs.lstatSync(cursor, { bigint: true }); } catch (error) { if (missing && error.code === 'ENOENT') return false; throw error; }
    if (stat.isSymbolicLink() || stat.reparsePoint || fs.realpathSync(cursor) !== cursor || (n < parts.length - 1 || directory ? !stat.isDirectory() : !stat.isFile())) fail('owner_lifecycle_path');
  }
  return true;
}
const stamp = stat => Object.fromEntries(STATS.map(k => [k, String(stat[k])]));
function sameStats(a, b, renamed = false) { return STATS.filter(k => !renamed || k !== 'ctimeNs').every(k => String(a[k]) === String(b[k])); }
async function lifecycleOperation({ installation, descriptorPath, reservedServer } = {}, stopped = null) {
  const d = installation;
  const address = reservedServer instanceof http.Server && reservedServer.listening && reservedServer.address();
  if (!address || address.address !== '127.0.0.1' || !Number.isInteger(address.port) || address.port < 1 || reservedServer.listenerCount('request')) fail('owner_lifecycle_endpoint');
  if (!d || descriptorPath !== path.join(d.installRoot, 'installation.json') || d.stateDir !== path.join(d.installRoot, 'state/production') ||
      d.machineId !== os.hostname() || !HEX.test(d.panelToken) || !HEX.test(d.controlToken) || d.panelToken === d.controlToken) fail('owner_lifecycle_installation');
  plain(d.installRoot, false, true); plain(d.stateDir, false, true); plain(path.join(d.installRoot, 'transactions'), false, true);
  const paths = { descriptor: descriptorPath, origin: path.join(d.installRoot, 'origin.json'), anchor: path.join(d.stateDir, 'origin.json'),
    owner: path.join(d.stateDir, 'runtime-owner.json'), ownerNext: path.join(d.stateDir, 'runtime-owner.next'), diagnostic: path.join(d.stateDir, 'runtime-diagnostic.json'), maintenance: path.join(d.stateDir, 'runtime-maintenance.json'),
    brokerOwner: path.join(d.stateDir, 'broker/broker-owner.lock'), brokerGate: path.join(d.stateDir, 'broker/broker-owner.gate'), receiverOwner: path.join(d.stateDir, 'receiver/owner'),
    journal: path.join(d.stateDir, 'receiver/completions.ndjson'), ledger: path.join(d.stateDir, 'broker/ledger.ndjson'), gate: path.join(d.installRoot, 'install.lock') };
  const held = new Set(); let gate, published, released = false, ready = false, shuttingDown = false, mode = 'active', reason = null, histories, mayReleaseGate = false;
  function view(file, limit = 16384) {
    if (!plain(file, true)) return { file, bytes: null, stat: null, fd: null };
    const named = fs.lstatSync(file, { bigint: true }), fd = fs.openSync(file, 'r'); held.add(fd);
    try {
      const stat = fs.fstatSync(fd, { bigint: true });
      if (!stat.isFile() || !sameStats(named, stat)) fail('owner_lifecycle_changed');
      if (stat.size < 0n || stat.size > BigInt(limit)) fail('owner_lifecycle_budget');
      const bytes = Buffer.alloc(Number(stat.size)); let offset = 0;
      while (offset < bytes.length) { const count = fs.readSync(fd, bytes, offset, bytes.length - offset, offset); if (!count) fail('owner_lifecycle_changed'); offset += count; }
      if (fs.readSync(fd, Buffer.alloc(1), 0, 1, offset) || !sameStats(stat, fs.fstatSync(fd, { bigint: true })) || !plain(file) || !sameStats(stat, fs.lstatSync(file, { bigint: true }))) fail('owner_lifecycle_changed');
      return { file, bytes, stat: stamp(stat), fd };
    } catch (error) { fs.closeSync(fd); held.delete(fd); throw error; }
  }
  function closeView(value) { if (value?.fd !== null && held.delete(value.fd)) { const fd = value.fd; value.fd = null; fs.closeSync(fd); } }
  function assertView(value, named = value.file) {
    if (value.bytes === null) { if (plain(named, true)) fail('owner_lifecycle_changed'); return; }
    if (value.fd === null) {
      const current = view(named, Math.max(16384, value.bytes.length));
      try { if (!current.bytes?.equals(value.bytes) || !sameStats(current.stat, value.stat)) fail('owner_lifecycle_changed'); }
      finally { closeView(current); }
      return;
    }
    const renamed = named !== value.file;
    // Windows can preserve a recently vacated destination's creation time.
    // During OUR rename the retained fd still pins the exact dev/ino/content;
    // compare both post-move names/handles in full, without requiring old birth.
    const expected = actual => (renamed ? ['dev', 'ino', 'size', 'mtimeNs'] : STATS).every(k => String(value.stat[k]) === String(actual[k]));
    if (!plain(named) || !expected(fs.lstatSync(named, { bigint: true })) || !expected(fs.fstatSync(value.fd, { bigint: true })) ||
        !sameStats(fs.lstatSync(named, { bigint: true }), fs.fstatSync(value.fd, { bigint: true }))) fail('owner_lifecycle_changed');
    const h = crypto.createHash('sha256'), buffer = Buffer.alloc(Math.min(65536, value.bytes.length + 1)); let offset = 0;
    while (offset < value.bytes.length) { const count = fs.readSync(value.fd, buffer, 0, Math.min(buffer.length, value.bytes.length - offset), offset); if (!count) fail('owner_lifecycle_changed'); h.update(buffer.subarray(0, count)); offset += count; }
    if (fs.readSync(value.fd, buffer, 0, 1, offset) || h.digest('hex') !== hash(value.bytes) || !expected(fs.fstatSync(value.fd, { bigint: true }))) fail('owner_lifecycle_changed');
  }
  let descriptor, initialOrigin, initialAnchor;
  try {
    descriptor = view(paths.descriptor); if (canonical(JSON.parse(descriptor.bytes)) !== canonical(d)) fail('owner_lifecycle_installation');
    initialOrigin = view(paths.origin); initialAnchor = view(paths.anchor);
    if (!initialOrigin.bytes || !initialAnchor.bytes || !initialOrigin.bytes.equals(initialAnchor.bytes)) fail('owner_lifecycle_origin');
    const origin = JSON.parse(initialOrigin.bytes);
    if (origin.installationId !== d.installationId || origin.machineId !== d.machineId) fail('owner_lifecycle_origin');
    // Before election these are snapshots, not long-lived installer-blocking FDs.
    closeView(descriptor); closeView(initialOrigin); closeView(initialAnchor);
  }
  catch (error) { for (const fd of held) fs.closeSync(fd); held.clear(); throw error; }
  const descriptorHash = hash(descriptor.bytes);
  const key = crypto.createHmac('sha256', Buffer.from(d.panelToken, 'hex')).update('ae-core4/lifecycle-key/v1\0').update(Buffer.from(d.controlToken, 'hex')).digest();
  function seal(kind, value) {
    const body = { version: 1, kind, installationId: d.installationId, machineId: d.machineId, descriptorHash, ...value };
    return Buffer.from(canonical({ body, mac: crypto.createHmac('sha256', key).update('ae-core4/lifecycle-record/v1\0' + canonical(body)).digest('hex') }));
  }
  function decode(value, kind, fields) {
    if (!value?.bytes?.length || !Buffer.from(value.bytes.toString('utf8')).equals(value.bytes)) fail('owner_lifecycle_record');
    let parsed; try { parsed = JSON.parse(value.bytes); } catch { fail('owner_lifecycle_record'); }
    exact(parsed, ['body', 'mac']); exact(parsed.body, [...BINDINGS, ...fields]);
    const b = parsed.body, mac = crypto.createHmac('sha256', key).update('ae-core4/lifecycle-record/v1\0' + canonical(b)).digest('hex');
    if (!HEX.test(parsed.mac) || !crypto.timingSafeEqual(Buffer.from(mac, 'hex'), Buffer.from(parsed.mac, 'hex')) || !Buffer.from(canonical(parsed)).equals(value.bytes) ||
        b.version !== 1 || b.kind !== kind || b.installationId !== d.installationId || b.machineId !== d.machineId || b.descriptorHash !== descriptorHash) fail('owner_lifecycle_record');
    return b;
  }
  function durable(file, bytes) {
    if (!boot || !UUID.test(boot.startupToken) || !Buffer.isBuffer(bytes) || bytes.length > METADATA_LIMIT) fail('owner_lifecycle_budget');
    plain(path.dirname(file), false, true); if (plain(file, true)) fail('owner_lifecycle_destination');
    const stage = file + '.stage-' + boot.startupToken; let fd;
    function check(named) {
      const stat = fs.fstatSync(fd, { bigint: true });
      if (!stat.isFile() || stat.size !== BigInt(bytes.length) || !plain(named) || !sameStats(stat, fs.lstatSync(named, { bigint: true }))) fail('owner_lifecycle_changed');
      const read = Buffer.alloc(bytes.length + 1); let offset = 0, count;
      while (offset < read.length && (count = fs.readSync(fd, read, offset, read.length - offset, offset))) offset += count;
      if (offset !== bytes.length || !read.subarray(0, offset).equals(bytes) || !sameStats(stat, fs.fstatSync(fd, { bigint: true })) || !sameStats(stat, fs.lstatSync(named, { bigint: true }))) fail('owner_lifecycle_changed');
      return stamp(stat);
    }
    try {
      fd = fs.openSync(stage, 'wx+');
      if (fs.writeSync(fd, bytes) !== bytes.length) fail('owner_lifecycle_short_write');
      fs.fsyncSync(fd); check(stage);
      fs.linkSync(stage, file); check(stage); check(file); fs.unlinkSync(stage);
      const beforeClose = check(file), closing = fd; fd = undefined; fs.closeSync(closing);
      const checked = view(file, Math.max(16384, bytes.length));
      // Windows may flush hardlink ctime on our write-FD close. Refresh only
      // that field after exact bytes and all remaining identity fields agree.
      if (!checked.bytes?.equals(bytes) || !sameStats(beforeClose, checked.stat, true)) fail('owner_lifecycle_changed');
      return checked;
    } finally { if (fd !== undefined) { const closing = fd; fd = undefined; fs.closeSync(closing); } }
  }
  function transaction(id, create = false) {
    if (!UUID.test(id)) fail('owner_lifecycle_transaction');
    const dir = path.join(d.installRoot, 'transactions', id + '-owner-lifecycle');
    if (create) fs.mkdirSync(dir); plain(dir, false, true); return dir;
  }
  function transactionTree(dir, allowed) {
    for (const name of fs.readdirSync(dir)) {
      if (allowed.includes(name)) continue;
      const base = ['intent.json', 'completion.json', 'new-gate'].find(item => allowed.includes(item) && name.startsWith(item + '.stage-') && UUID.test(name.slice(item.length + 7)));
      const file = path.join(dir, name);
      if (!base || !plain(file) || fs.lstatSync(file, { bigint: true }).size > BigInt(METADATA_LIMIT)) fail('owner_lifecycle_phase');
      // An unpublished stage is retained evidence only. Its bytes never drive
      // replay, completion, marker cleanup or any other ownership decision.
    }
  }
  async function dead(previous) {
    scope(previous); const observed = await observeOwnerProcess(previous.pid), state = classifyOwnerProcess({ pid: previous.pid, birthTicks: previous.birthTicks }, observed);
    if (!['absent', 'pid-reused'].includes(state)) fail(state === 'alive' ? 'owner_lifecycle_alive' : 'owner_lifecycle_process_unknown');
    return observed;
  }
  function reverify() {
    assertView(descriptor); assertView(initialOrigin); assertView(initialAnchor);
    if (canonical(require('./stdio-entry').verifyInstallation(descriptorPath)) !== canonical(d)) fail('owner_lifecycle_installation');
  }
  function pinSnapshot(value) {
    const current = view(value.file, Math.max(16384, value.bytes?.length || 0));
    if (value.bytes === null ? current.bytes !== null : !current.bytes?.equals(value.bytes) || !sameStats(current.stat, value.stat)) { closeView(current); fail('owner_lifecycle_changed'); }
    return current;
  }
  function pinInitial() {
    if (descriptor.fd !== null) return;
    const values = [];
    try { for (const value of [descriptor, initialOrigin, initialAnchor]) values.push(pinSnapshot(value)); }
    catch (error) { for (const value of values) closeView(value); throw error; }
    [descriptor, initialOrigin, initialAnchor] = values;
  }
  function serial(value, name, includeBytes = false) { return { name, hash: value.bytes === null ? null : hash(value.bytes), stat: value.stat, ...(includeBytes ? { bytes: value.bytes?.toString('base64') ?? null } : {}) }; }
  function validSerial(value, bytes) {
    exact(value, ['name', 'hash', 'stat', ...(bytes ? ['bytes'] : [])]);
    if (value.hash === null) { if (value.stat !== null || bytes && value.bytes !== null) fail('owner_lifecycle_transaction'); return; }
    if (!HEX.test(value.hash)) fail('owner_lifecycle_transaction'); exact(value.stat, STATS);
    if (STATS.some(k => typeof value.stat[k] !== 'string' || !/^(0|[1-9][0-9]*)$/.test(value.stat[k]))) fail('owner_lifecycle_transaction');
    if (bytes) { const data = Buffer.from(value.bytes, 'base64'); if (data.length > 16384 || data.toString('base64') !== value.bytes || hash(data) !== value.hash) fail('owner_lifecycle_transaction'); }
  }
  function matches(value, saved, archived = false) { validSerial(saved, Object.hasOwn(saved, 'bytes')); return value.bytes === null ? saved.hash === null : hash(value.bytes) === saved.hash && sameStats(value.stat, saved.stat, archived); }
  function rawHistories() {
    assertView(initialOrigin); assertView(initialAnchor);
    return Object.fromEntries(PROTECTED.map(name => [name, name === 'descriptor' ? descriptor : name === 'origin' ? initialOrigin : name === 'anchor' ? initialAnchor : view(paths[name], 64 * 1024 * 1024)]));
  }
  function historySnapshot() {
    const values = rawHistories();
    if (!values.origin.bytes || !values.anchor.bytes || !values.origin.bytes.equals(values.anchor.bytes)) fail('owner_lifecycle_origin');
    const receiver = inspectReceiverHistory(values.journal.bytes, { descriptorPath }), ledger = inspectLedgerHistory(values.ledger.bytes, { installationId: d.installationId, receiver });
    return { values, receiver, ledger };
  }
  function settled(value) {
    if (!value.receiver.settled || !value.ledger.settled) fail('owner_lifecycle_unresolved');
    // Broker commands must still have their exact receiver origin. Rejected
    // pre-send intents may legitimately have no receiver begin.
    if (value.ledger.commands.length && !value.receiver.present) fail('owner_lifecycle_history_missing');
    if (value.values.ledger.bytes?.length) {
      const { parseJournalBytes } = require('./native-read-disposition');
      const events = parseJournalBytes(value.values.ledger.bytes).events;
      const receiverEvents = value.values.journal.bytes ? parseJournalBytes(value.values.journal.bytes).events : [];
      const begins = new Map(receiverEvents.filter(e => e.type === 'begin').map(e => [e.commandId, e])), completions = new Map(receiverEvents.filter(e => e.type === 'complete').map(e => [e.commandId, e.response])), terminals = new Map(events.filter(e => e.type === 'command').map(e => [e.commandId, e]));
      for (const intent of events.filter(e => e.type === 'intent')) {
        const begin = begins.get(intent.commandId), terminal = terminals.get(intent.commandId), outcome = completions.get(intent.commandId)?.result?.outcome;
        if (begin ? canonical(begin.originalBinding) !== canonical(intent.dispatchBinding) : terminal?.state !== 'rejected') fail('owner_lifecycle_history_correlation');
        if (outcome === 'applied' && terminal?.state === 'rejected' || outcome === 'rejected' && terminal?.state === 'succeeded') fail('owner_lifecycle_history_correlation');
      }
    }
  }
  function assertHistory(value) { for (const item of Object.values(value.values)) assertView(item); }
  function completeGateTakeover(oldGate, body) {
    if (body.takeoverId === null) return;
    const dir = transaction(body.takeoverId), intentView = view(path.join(dir, 'intent.json')), intent = decode(intentView, 'gate-takeover-intent', ['id', 'oldGate', 'replacement']);
    transactionTree(dir, ['intent.json', 'original-gate', 'new-gate', 'completion.json']);
    if (intent.id !== body.takeoverId || typeof intent.replacement !== 'string' || !Buffer.from(intent.replacement, 'base64').equals(oldGate.bytes)) fail('owner_lifecycle_transaction');
    validSerial(intent.oldGate, true);
    const original = view(path.join(dir, 'original-gate')); if (original.bytes === null || !matches(original, intent.oldGate, true)) fail('owner_lifecycle_transaction');
    const done = view(path.join(dir, 'completion.json'));
    if (done.bytes) { const record = decode(done, 'gate-takeover-completed', ['id', 'intentHash']); if (record.id !== intent.id || record.intentHash !== hash(intentView.bytes)) fail('owner_lifecycle_transaction'); }
    else { assertView(oldGate); durable(path.join(dir, 'completion.json'), seal('gate-takeover-completed', { id: intent.id, intentHash: hash(intentView.bytes) })); }
  }
  function gateBody(value) {
    const body = decode(value, 'startup-gate', ['scope', 'recoveryId', 'readyId', 'takeoverId', 'phase']); scope(body.scope);
    if (!UUID.test(body.recoveryId) || body.readyId !== null && !UUID.test(body.readyId) || body.takeoverId !== null && !UUID.test(body.takeoverId) || !['startup', 'shutdown'].includes(body.phase)) fail('owner_lifecycle_schema'); return body;
  }
  function finishReady(id, inspectOnly = false, retiredId = null) {
    const dir = transaction(id), intentView = view(path.join(dir, 'intent.json'), 128 * 1024), intent = decode(intentView, 'owner-ready-intent', ['id', 'scope', 'original', 'replacement', 'protected']);
    transactionTree(dir, ['intent.json', 'starting-owner', 'completion.json']);
    if (intent.id !== id || !Array.isArray(intent.protected) || canonical(intent.protected.map(v => v.name).sort()) !== canonical([...PROTECTED].sort())) fail('owner_lifecycle_transaction');
    scope(intent.scope); validSerial(intent.original, true);
    const replacement = Buffer.from(intent.replacement, 'base64'); if (replacement.length > 16384 || replacement.toString('base64') !== intent.replacement) fail('owner_lifecycle_transaction');
    const nextBody = decode({ bytes: replacement }, 'runtime-owner', ['scope', 'phase', 'receiverIdentity']);
    if (canonical(nextBody.scope) !== canonical(intent.scope) || nextBody.phase !== 'active' || !nextBody.receiverIdentity) fail('owner_lifecycle_transaction');
    const done = view(path.join(dir, 'completion.json'));
    if (done.bytes) { const body = decode(done, 'owner-ready-completed', ['id', 'intentHash']); if (body.id !== id || body.intentHash !== hash(intentView.bytes)) fail('owner_lifecycle_transaction'); return; }
    for (const item of intent.protected) { validSerial(item, false); const now = view(paths[item.name], ['journal', 'ledger'].includes(item.name) ? 64 * 1024 * 1024 : 16384); if (!matches(now, item)) fail('owner_lifecycle_changed'); }
    function retiredMarker(name) { const live = view(paths[name]); return inspectOnly && retiredId && live.bytes === null ? view(path.join(transaction(retiredId), name)) : live; }
    const archive = path.join(dir, 'starting-owner'), original = view(archive), current = retiredMarker('owner'), staged = retiredMarker('ownerNext');
    if (inspectOnly) {
      if (original.bytes === null ? !matches(current, intent.original) || !staged.bytes?.equals(replacement) : !matches(original, intent.original, true)) fail('owner_lifecycle_phase');
      if (original.bytes !== null && (current.bytes === null ? !staged.bytes?.equals(replacement) : !current.bytes.equals(replacement) || staged.bytes !== null)) fail('owner_lifecycle_phase');
      return;
    }
    if (original.bytes === null) {
      if (!matches(current, intent.original) || !staged.bytes?.equals(replacement)) fail('owner_lifecycle_phase');
      assertView(current); fs.renameSync(paths.owner, archive); assertView(current, archive);
    } else if (!matches(original, intent.original, true)) fail('owner_lifecycle_phase');
    const target = view(paths.owner);
    if (target.bytes === null) {
      if (!staged.bytes?.equals(replacement)) fail('owner_lifecycle_phase'); assertView(staged); fs.renameSync(paths.ownerNext, paths.owner); assertView(staged, paths.owner);
    } else if (!target.bytes.equals(replacement) || staged.bytes !== null) fail('owner_lifecycle_phase');
    durable(path.join(dir, 'completion.json'), seal('owner-ready-completed', { id, intentHash: hash(intentView.bytes) }));
  }
  function finishRecovery(id, inspectOnly = false) {
    const dir = transaction(id), intentView = view(path.join(dir, 'intent.json'), 128 * 1024);
    const intent = decode(intentView, 'owner-recovery-intent', ['id', 'previousScope', 'originals', 'protected']);
    if (intent.id !== id || !Array.isArray(intent.originals) || !Array.isArray(intent.protected) || intent.originals.length > MARKERS.length || intent.protected.length !== PROTECTED.length) fail('owner_lifecycle_transaction');
    scope(intent.previousScope);
    if (new Set(intent.originals.map(v => v.name)).size !== intent.originals.length || intent.originals.some(v => !MARKERS.includes(v.name)) ||
        canonical(intent.protected.map(v => v.name).sort()) !== canonical([...PROTECTED].sort())) fail('owner_lifecycle_transaction');
    transactionTree(dir, ['intent.json', 'completion.json', ...intent.originals.map(v => v.name)]);
    for (const item of intent.originals) validSerial(item, true);
    for (const item of intent.protected) validSerial(item, false);
    const completed = view(path.join(dir, 'completion.json'));
    if (completed.bytes) { const done = decode(completed, 'owner-recovery-completed', ['id', 'intentHash']); if (done.id !== id || done.intentHash !== hash(intentView.bytes)) fail('owner_lifecycle_transaction'); if (!inspectOnly) return; }
    for (const item of intent.protected) { const current = view(paths[item.name], ['journal', 'ledger'].includes(item.name) ? 64 * 1024 * 1024 : 16384); if (!matches(current, item)) fail('owner_lifecycle_changed'); }
    for (const item of intent.originals) {
      validSerial(item, true); if (item.hash === null) fail('owner_lifecycle_transaction');
      const source = view(paths[item.name]), targetFile = path.join(dir, item.name), target = view(targetFile);
      if (source.bytes && target.bytes || !source.bytes && !target.bytes) fail('owner_lifecycle_phase');
      if (source.bytes) { if (completed.bytes || !matches(source, item)) fail('owner_lifecycle_changed'); assertView(source); if (!inspectOnly) { fs.renameSync(source.file, targetFile); assertView(source, targetFile); } }
      else if (!matches(target, item, true)) fail('owner_lifecycle_changed');
    }
    for (const item of intent.protected) { const current = view(paths[item.name], ['journal', 'ledger'].includes(item.name) ? 64 * 1024 * 1024 : 16384); if (!matches(current, item)) fail('owner_lifecycle_changed'); }
    if (!inspectOnly) durable(path.join(dir, 'completion.json'), seal('owner-recovery-completed', { id, intentHash: hash(intentView.bytes) }));
  }
  async function resumeReferenced(previous, previousView) {
    // Resolve old pointers before replacing their gate. A crash or refusal then
    // leaves the same durable entry point for every subsequent contender.
    assertView(previousView); reverify();
    if (previous.readyId !== null) {
      const dir = path.join(d.installRoot, 'transactions', previous.readyId + '-owner-lifecycle');
      if (plain(dir, true, true)) {
        const intent = view(path.join(dir, 'intent.json'), 128 * 1024);
        if (intent.bytes) { assertView(previousView); finishReady(previous.readyId); }
        else transactionTree(dir, ['intent.json']);
      }
    }
    const dir = path.join(d.installRoot, 'transactions', previous.recoveryId + '-owner-lifecycle');
    if (plain(dir, true, true)) {
      const intent = view(path.join(dir, 'intent.json'), 128 * 1024);
      if (intent.bytes) {
        const original = decode(intent, 'owner-recovery-intent', ['id', 'previousScope', 'originals', 'protected']);
        await dead(original.previousScope); assertView(previousView); reverify(); finishRecovery(previous.recoveryId);
      } else transactionTree(dir, ['intent.json']);
    }
    assertView(previousView); reverify();
  }
  let boot, recoveryId, readyId;
  if (stopped) {
    // This branch is reachable only with an in-memory certification brand. It
    // never elects/publishes an execution owner, starts stores or issues tokens.
    try {
      const request = require('./stopped-certification').stoppedLifecyclePermit(stopped.capability);
      const short = s => ({ bootId: s.bootId, pid: s.pid, birthTicks: s.birthTicks });
      let originalFullScope;
      const ownScope = s => { scope(s); if (canonical(short(s)) !== canonical(request.originalScope) || originalFullScope && canonical(originalFullScope) !== canonical(s)) fail('owner_lifecycle_foreign_stop'); originalFullScope ||= s; };
      reverify(); pinInitial(); request.check();
      boot = request.actor;
      const snap = historySnapshot(); settled(snap); assertHistory(snap);
      const initial = Object.fromEntries([...MARKERS, 'gate'].map(n => [n, view(paths[n])]));
      const referenced = [];
      let gateRecord, ownerRecord, diagnosticRecord;
      if (initial.gate.bytes) {
        gateRecord = gateBody(initial.gate); ownScope(gateRecord.scope);
        if (gateRecord.takeoverId !== null || gateRecord.phase === 'shutdown' && gateRecord.readyId !== null) fail('owner_lifecycle_phase');
      }
      if (initial.owner.bytes) {
        ownerRecord = decode(initial.owner, 'runtime-owner', ['scope', 'phase', 'receiverIdentity']); ownScope(ownerRecord.scope);
        if (!['starting', 'active'].includes(ownerRecord.phase) || ownerRecord.receiverIdentity !== null && typeof ownerRecord.receiverIdentity !== 'string' || ownerRecord.phase === 'active' && !ownerRecord.receiverIdentity) fail('owner_lifecycle_record');
        if (ownerRecord.receiverIdentity !== null && (!snap.receiver.present || ownerRecord.receiverIdentity !== snap.receiver.identity)) fail('owner_lifecycle_history_missing');
      }
      if (initial.diagnostic.bytes) { diagnosticRecord = decode(initial.diagnostic, 'diagnostic-owner', ['scope', 'reason']); ownScope(diagnosticRecord.scope); if (ownerRecord) fail('owner_lifecycle_foreign_stop'); }
      function referencedIntent(id, kind, fields) {
        const dir = path.join(d.installRoot, 'transactions', id + '-owner-lifecycle');
        if (!plain(dir, true, true)) return null;
        const intent = view(path.join(dir, 'intent.json'), METADATA_LIMIT);
        if (!intent.bytes) { transactionTree(dir, ['intent.json']); return null; }
        const body = decode(intent, kind, fields); if (body.id !== id) fail('owner_lifecycle_transaction');
        referenced.push({ id, kind, dir }); return body;
      }
      const prior = referencedIntent(request.id, 'owner-recovery-intent', ['id', 'previousScope', 'originals', 'protected']);
      if (prior) { ownScope(prior.previousScope); finishRecovery(prior.id, true); }
      if (gateRecord?.readyId) {
        const r = referencedIntent(gateRecord.readyId, 'owner-ready-intent', ['id', 'scope', 'original', 'replacement', 'protected']);
        if (r) { ownScope(r.scope); finishReady(r.id, true, prior ? request.id : null); if (view(path.join(transaction(r.id), 'completion.json')).bytes && (initial.ownerNext.bytes || ownerRecord?.phase === 'starting')) fail('owner_lifecycle_phase'); }
        else if (initial.ownerNext.bytes) fail('owner_lifecycle_phase');
      } else if (initial.ownerNext.bytes) fail('owner_lifecycle_phase');
      if (initial.ownerNext.bytes) { const n = decode(initial.ownerNext, 'runtime-owner', ['scope', 'phase', 'receiverIdentity']); ownScope(n.scope); if (n.phase !== 'active' || !snap.receiver.present || n.receiverIdentity !== snap.receiver.identity) fail('owner_lifecycle_record'); }
      if (gateRecord) {
        const r = referencedIntent(gateRecord.recoveryId, 'owner-recovery-intent', ['id', 'previousScope', 'originals', 'protected']);
        if (r) { ownScope(r.previousScope); finishRecovery(r.id, true); }
      }
      for (const item of request.references || []) {
        if (item.id === request.id || referenced.some(r => r.id === item.id)) continue;
        const fields = item.kind === 'owner-ready-intent' ? ['id', 'scope', 'original', 'replacement', 'protected'] : ['id', 'previousScope', 'originals', 'protected'];
        if (!['owner-ready-intent', 'owner-recovery-intent'].includes(item.kind)) fail('owner_lifecycle_transaction');
        const r = referencedIntent(item.id, item.kind, fields); if (!r) fail('owner_lifecycle_phase');
        ownScope(r.scope || r.previousScope); if (r.scope) finishReady(r.id, true, prior ? request.id : null); else finishRecovery(r.id, true);
      }
      const producer = ownerRecord?.scope || (gateRecord && !diagnosticRecord ? gateRecord.scope : null) || (!diagnosticRecord && prior?.previousScope);
      const expected = producer && { brokerOwner: JSON.stringify({ pid: producer.pid, token: producer.brokerToken }), brokerGate: producer.brokerToken, receiverOwner: canonical({ version: 1, pid: producer.pid, token: producer.receiverToken }) };
      for (const n of ['brokerOwner', 'brokerGate', 'receiverOwner']) if (initial[n].bytes && (!expected || !initial[n].bytes.equals(Buffer.from(expected[n])))) fail('owner_lifecycle_marker');
      if (!producer && !diagnosticRecord && MARKERS.some(n => initial[n].bytes)) fail('owner_lifecycle_legacy_marker');
      function facts() {
        const transactions = {};
        for (const item of referenced) {
          const s = fs.lstatSync(item.dir, { bigint: true }), names = fs.readdirSync(item.dir).sort();
          if (names.length > 32) fail('owner_lifecycle_budget');
          transactions[item.id] = { kind: item.kind, directory: { dev: String(s.dev), ino: String(s.ino), birthtimeNs: String(s.birthtimeNs) }, tree: Object.fromEntries(names.map(n => [n, serial(view(path.join(item.dir, n), METADATA_LIMIT), n)])) };
        }
        return { markers: Object.fromEntries([...MARKERS, 'gate'].map(n => [n, serial(view(paths[n]), n)])), transactions };
      }
      const before = facts();
      if (stopped.inspectOnly) return before;
      if (canonical(before) !== canonical(request.expected)) fail('owner_lifecycle_changed');
      request.check(); reverify(); assertHistory(snap); for (const v of Object.values(initial)) assertView(v);
      for (const item of referenced.filter(r => r.id !== request.id)) { if (item.kind === 'owner-ready-intent') finishReady(item.id, true, prior ? request.id : null); else finishRecovery(item.id); }
      const originals = Object.fromEntries(MARKERS.map(n => [n, view(paths[n])]));
      if (prior) finishRecovery(request.id);
      else if (Object.values(originals).some(v => v.bytes !== null)) {
        const dir = transaction(request.id, true);
        durable(path.join(dir, 'intent.json'), seal('owner-recovery-intent', { id: request.id, previousScope: producer || diagnosticRecord.scope,
          originals: Object.entries(originals).filter(([, v]) => v.bytes !== null).map(([n, v]) => serial(v, n, true)), protected: PROTECTED.map(n => serial(snap.values[n], n)) }));
        finishRecovery(request.id);
      }
      for (const n of MARKERS) if (view(paths[n]).bytes !== null) fail('owner_lifecycle_phase');
      if (initial.gate.bytes) {
        const target = path.join(request.directory, 'retired-install-gate');
        if (view(target).bytes !== null) fail('owner_lifecycle_phase');
        request.check(); assertView(initial.gate); fs.renameSync(paths.gate, target); assertView(initial.gate, target);
      }
      request.check(); assertHistory(snap); reverify(); return { retired: true, runtimeStarted: false, aeAuthority: false };
    } finally { for (const fd of held) { try { fs.closeSync(fd); } catch {} } held.clear(); }
  }
  try {
    reverify();
    if (view(paths.maintenance).bytes) fail('owner_lifecycle_maintenance');
    const self = await observeOwnerProcess(process.pid);
    if (self.status !== 'present' || self.pid !== process.pid || !self.executablePath || path.resolve(self.executablePath).toLowerCase() !== path.resolve(d.nodePath).toLowerCase()) fail('owner_lifecycle_process_unknown');
    boot = { bootId: crypto.randomUUID(), pid: process.pid, birthTicks: self.birthTicks, brokerToken: crypto.randomUUID(), receiverToken: crypto.randomUUID(), startupToken: crypto.randomUUID() };
    recoveryId = crypto.randomUUID(); readyId = crypto.randomUUID(); let oldGate = view(paths.gate), previousGate;
    if (oldGate.bytes) {
      previousGate = gateBody(oldGate); closeView(oldGate); await dead(previousGate.scope);
      pinInitial(); reverify(); oldGate = pinSnapshot(oldGate); completeGateTakeover(oldGate, previousGate);
      await resumeReferenced(previousGate, oldGate);
      const id = crypto.randomUUID(), dir = transaction(id, true), replacement = seal('startup-gate', { scope: boot, recoveryId, readyId, takeoverId: id, phase: 'startup' });
      durable(path.join(dir, 'intent.json'), seal('gate-takeover-intent', { id, oldGate: serial(oldGate, 'gate', true), replacement: replacement.toString('base64') }));
      // A hard link retains the original inode after its read handle closes.
      // Windows forbids replacing a target with our retained read handle open.
      // The link prevents inode reuse; install.lock never disappears.
      fs.linkSync(paths.gate, path.join(dir, 'original-gate')); assertView(oldGate, path.join(dir, 'original-gate'));
      const linkedStat = stamp(fs.fstatSync(oldGate.fd, { bigint: true }));
      const staged = durable(path.join(dir, 'new-gate'), replacement); reverify(); closeView(oldGate);
      if (!plain(paths.gate) || !sameStats(linkedStat, fs.lstatSync(paths.gate, { bigint: true }))) fail('owner_lifecycle_changed');
      fs.renameSync(staged.file, paths.gate); assertView(staged, paths.gate); gate = { ...staged, file: paths.gate, stat: stamp(fs.fstatSync(staged.fd, { bigint: true })) };
      durable(path.join(dir, 'completion.json'), seal('gate-takeover-completed', { id, intentHash: hash(view(path.join(dir, 'intent.json')).bytes) }));
    } else gate = durable(paths.gate, seal('startup-gate', { scope: boot, recoveryId, readyId, takeoverId: null, phase: 'startup' }));
    mayReleaseGate = true; pinInitial(); reverify(); assertView(gate);
    if (view(paths.maintenance).bytes) fail('owner_lifecycle_maintenance');
    const owner = view(paths.owner), ownerNext = view(paths.ownerNext), diagnostic = view(paths.diagnostic); let previous, oldDiagnostic;
    if (owner.bytes) { previous = decode(owner, 'runtime-owner', ['scope', 'phase', 'receiverIdentity']); scope(previous.scope); if (!['starting', 'active'].includes(previous.phase) || previous.receiverIdentity !== null && typeof previous.receiverIdentity !== 'string' || previous.phase === 'active' && !previous.receiverIdentity) fail('owner_lifecycle_record'); await dead(previous.scope); }
    if (diagnostic.bytes) { oldDiagnostic = decode(diagnostic, 'diagnostic-owner', ['scope', 'reason']); scope(oldDiagnostic.scope); await dead(oldDiagnostic.scope); }
    try {
      histories = historySnapshot(); settled(histories);
      if (previous && (previous.phase === 'active' || previous.receiverIdentity !== null) && (!histories.receiver.present || histories.receiver.identity !== previous.receiverIdentity)) fail('owner_lifecycle_history_missing');
      if (ownerNext.bytes) {
        const next = decode(ownerNext, 'runtime-owner', ['scope', 'phase', 'receiverIdentity']);
        if (!previous || canonical(next.scope) !== canonical(previous.scope) || next.phase !== 'active' || !histories.receiver.present || next.receiverIdentity !== histories.receiver.identity) fail('owner_lifecycle_record');
      }
      const markerViews = Object.fromEntries(['brokerOwner', 'brokerGate', 'receiverOwner'].map(name => [name, view(paths[name])]));
      if (!previous && Object.values(markerViews).some(v => v.bytes !== null)) fail('owner_lifecycle_legacy_marker');
      if (previous) {
        const expected = { brokerOwner: JSON.stringify({ pid: previous.scope.pid, token: previous.scope.brokerToken }), brokerGate: previous.scope.brokerToken,
          receiverOwner: canonical({ version: 1, pid: previous.scope.pid, token: previous.scope.receiverToken }) };
        for (const [name, value] of Object.entries(markerViews)) if (value.bytes && !value.bytes.equals(Buffer.from(expected[name]))) fail('owner_lifecycle_marker');
      }
      const originals = { owner, ownerNext, diagnostic, ...markerViews };
      if (Object.values(originals).some(v => v.bytes !== null)) {
        assertHistory(histories); for (const value of Object.values(originals)) assertView(value); assertView(gate);
        const dir = transaction(recoveryId, true);
        mayReleaseGate = false; durable(path.join(dir, 'intent.json'), seal('owner-recovery-intent', { id: recoveryId, previousScope: previous?.scope || oldDiagnostic.scope,
          originals: Object.entries(originals).filter(([, v]) => v.bytes !== null).map(([name, v]) => serial(v, name, true)), protected: PROTECTED.map(name => serial(histories.values[name], name)) }));
        finishRecovery(recoveryId); mayReleaseGate = true;
      }
    } catch (error) {
      if (fs.existsSync(path.join(d.installRoot, 'transactions', recoveryId + '-owner-lifecycle'))) throw error;
      mode = 'diagnostic'; reason = typeof error.code === 'string' && error.code.startsWith('owner_lifecycle_') ? error.code : 'owner_lifecycle_history_fault';
    }
    const target = mode === 'active' ? paths.owner : paths.diagnostic;
    // A previous diagnostic belongs to a dead process but cannot be silently
    // replaced while a history fence remains. Archive only this non-writer record.
    if (mode === 'diagnostic' && diagnostic.bytes) {
      const dir = transaction(recoveryId, true), values = rawHistories(); assertView(diagnostic); mayReleaseGate = false;
      durable(path.join(dir, 'intent.json'), seal('owner-recovery-intent', { id: recoveryId, previousScope: oldDiagnostic.scope, originals: [serial(diagnostic, 'diagnostic', true)], protected: PROTECTED.map(name => serial(values[name], name)) }));
      finishRecovery(recoveryId); mayReleaseGate = true;
    }
    reverify(); assertView(gate); mayReleaseGate = false;
    published = durable(target, seal(mode === 'active' ? 'runtime-owner' : 'diagnostic-owner', mode === 'active' ? { scope: boot, phase: 'starting', receiverIdentity: histories.receiver.identity } : { scope: boot, reason }));
    function releaseGate() { if (!gate) return; assertView(gate); closeView(gate); fs.unlinkSync(paths.gate); gate = null; }
    const publicState = () => ({ mode, reason, processBootId: boot.bootId, pid: boot.pid, birthTicks: boot.birthTicks, recoveryRequired: mode !== 'active', historyAtStartup: histories ? {
      receiver: { present: histories.receiver.present, eventCount: histories.receiver.eventCount, byteHash: histories.receiver.byteHash, settled: histories.receiver.settled, unresolvedCount: histories.receiver.unresolved.length },
      ledger: { present: histories.ledger.present, eventCount: histories.ledger.eventCount, byteHash: histories.ledger.byteHash, settled: histories.ledger.settled, unresolvedCount: histories.ledger.unresolved.length }
    } : null });
    return Object.freeze({
      mode, brokerToken: boot.brokerToken, receiverToken: boot.receiverToken, state: publicState,
      abortStartup() { if (released) fail('owner_lifecycle_released'); for (const fd of [...held]) { fs.closeSync(fd); held.delete(fd); } },
      markReady() {
        if (released || ready || mode !== 'active') fail('owner_lifecycle_ready');
        reverify(); assertView(gate); assertView(published); const snap = historySnapshot(); settled(snap); assertHistory(snap);
        if (!snap.receiver.present) fail('owner_lifecycle_history_missing');
        const expected = { brokerOwner: JSON.stringify({ pid: boot.pid, token: boot.brokerToken }), receiverOwner: canonical({ version: 1, pid: boot.pid, token: boot.receiverToken }) };
        for (const [name, bytes] of Object.entries(expected)) { const current = view(paths[name]); if (!current.bytes?.equals(Buffer.from(bytes))) fail('owner_lifecycle_marker'); }
        const replacement = seal('runtime-owner', { scope: boot, phase: 'active', receiverIdentity: snap.receiver.identity });
        durable(paths.ownerNext, replacement); const dir = transaction(readyId, true);
        durable(path.join(dir, 'intent.json'), seal('owner-ready-intent', { id: readyId, scope: boot, original: serial(published, 'owner', true), replacement: replacement.toString('base64'), protected: PROTECTED.map(name => serial(snap.values[name], name)) }));
        assertView(published); assertView(gate); finishReady(readyId); closeView(published); published = view(paths.owner); ready = true;
      },
      releaseStartup() { if (released || mode === 'active' && !ready) fail('owner_lifecycle_released'); assertView(published); releaseGate(); released = true; for (const fd of [...held]) if (![published.fd, descriptor.fd, initialOrigin.fd, initialAnchor.fd].includes(fd)) { fs.closeSync(fd); held.delete(fd); } },
      beginClose() {
        if (!released || shuttingDown) fail('owner_lifecycle_close');
        reverify(); if (view(paths.gate).bytes !== null) fail('owner_lifecycle_gate_busy');
        gate = durable(paths.gate, seal('startup-gate', { scope: boot, recoveryId: crypto.randomUUID(), readyId: null, takeoverId: null, phase: 'shutdown' })); shuttingDown = true;
      },
      finishClose() {
        if (!shuttingDown) fail('owner_lifecycle_close'); assertView(gate); assertView(published);
        let snap, clean = mode === 'diagnostic';
        try { snap = historySnapshot(); settled(snap); assertHistory(snap); clean ||= ['brokerOwner', 'brokerGate', 'receiverOwner'].every(name => view(paths[name]).bytes === null); } catch { /* Retain execution owner/fences if history cannot certify a clean stop. */ }
        if (clean) {
          if (!snap) snap = { values: rawHistories() };
          const id = gateBody(gate).recoveryId, dir = transaction(id, true), name = mode === 'active' ? 'owner' : 'diagnostic';
          durable(path.join(dir, 'intent.json'), seal('owner-recovery-intent', { id, previousScope: boot, originals: [serial(published, name, true)], protected: PROTECTED.map(n => serial(snap.values[n], n)) }));
          finishRecovery(id);
        }
        releaseGate(); for (const fd of [...held]) { fs.closeSync(fd); held.delete(fd); }
      }
    });
  } catch (error) {
    // Failed/ambiguous mutation retains its attributable gate for a future
    // verified dead-process recovery. Never guess that a partial archive finished.
    if (mayReleaseGate && gate) { try { assertView(gate); closeView(gate); fs.unlinkSync(paths.gate); } catch {} }
    for (const fd of held) { try { fs.closeSync(fd); } catch {} } held.clear(); throw error;
  }
}
function createOwnerLifecycle({ installation, descriptorPath, reservedServer } = {}) { return lifecycleOperation({ installation, descriptorPath, reservedServer }); }
function inspectStoppedLifecycle(capability) { return lifecycleOperation(require('./stopped-certification').stoppedLifecyclePermit(capability), { capability, inspectOnly: true }); }
function retireStoppedLifecycle(capability) { const p = require('./stopped-certification').stoppedLifecyclePermit(capability); if (p.inspectionOnly) fail('stopped_certification_brand'); return lifecycleOperation(p, { capability, inspectOnly: false }); }
module.exports = { createOwnerLifecycle, inspectStoppedLifecycle, retireStoppedLifecycle };

'use strict';
// Private full-installation operator protocol. No MCP tool, AE grant or launcher.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), http = require('node:http'), os = require('node:os');
const { canonical, hash, fail } = require('../protocol/json');
const { inspectReceiverHistory, inspectLedgerHistory } = require('./recovery-inspection');
const { observeOwnerProcess, classifyOwnerProcess } = require('./windows-owner-process');
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/, HEX = /^[a-f0-9]{64}$/;
const STATS = ['dev', 'ino', 'size', 'birthtimeNs', 'mtimeNs', 'ctimeNs'];
const PRIVATE_METHODS = Object.freeze(['maintenance_stop']);
const permits = new WeakMap();
const exact = (v, keys) => { if (!v || Object.getPrototypeOf(v) !== Object.prototype || canonical(Object.keys(v).sort()) !== canonical([...keys].sort())) fail('maintenance_schema'); };
const stamp = s => Object.fromEntries(STATS.map(k => [k, String(s[k])]));
const same = (a, b, closed = false) => STATS.filter(k => !closed || k !== 'ctimeNs').every(k => String(a[k]) === String(b[k]));
function plain(file, missing = false, directory = false) {
  if (!path.isAbsolute(file) || path.resolve(file) !== file) fail('maintenance_path');
  let cursor = path.parse(file).root; const parts = file.slice(cursor.length).split(path.sep).filter(Boolean);
  for (let n = 0; n < parts.length; n++) {
    cursor = path.join(cursor, parts[n]); let s;
    try { s = fs.lstatSync(cursor, { bigint: true }); } catch (e) { if (missing && e.code === 'ENOENT') return false; throw e; }
    if (s.isSymbolicLink() || s.reparsePoint || fs.realpathSync(cursor) !== cursor || (n < parts.length - 1 || directory ? !s.isDirectory() : !s.isFile())) fail('maintenance_path');
  }
  return true;
}
function read(file, limit = 16384) {
  if (!plain(file, true)) return { file, bytes: null, stat: null };
  const named = fs.lstatSync(file, { bigint: true }), fd = fs.openSync(file, 'r');
  try {
    const s = fs.fstatSync(fd, { bigint: true }); if (!s.isFile() || !same(s, named) || s.size > BigInt(limit)) fail('maintenance_changed');
    const bytes = Buffer.alloc(Number(s.size)); let at = 0;
    while (at < bytes.length) { const n = fs.readSync(fd, bytes, at, bytes.length - at, at); if (!n) fail('maintenance_changed'); at += n; }
    if (fs.readSync(fd, Buffer.alloc(1), 0, 1, at) || !same(s, fs.fstatSync(fd, { bigint: true })) || !plain(file) || !same(s, fs.lstatSync(file, { bigint: true }))) fail('maintenance_changed');
    return { file, bytes, stat: stamp(s) };
  } finally { fs.closeSync(fd); }
}
function atomic(file, bytes, nonce) {
  if (!UUID.test(nonce) || !Buffer.isBuffer(bytes) || bytes.length > 128 * 1024) fail('maintenance_budget');
  plain(path.dirname(file), false, true); if (plain(file, true)) fail('maintenance_destination');
  const stage = file + '.stage-' + nonce; let fd;
  function check(named) {
    const s = fs.fstatSync(fd, { bigint: true }); if (s.size !== BigInt(bytes.length) || !plain(named) || !same(s, fs.lstatSync(named, { bigint: true }))) fail('maintenance_changed');
    const b = Buffer.alloc(bytes.length + 1); let at = 0, n;
    while (at < b.length && (n = fs.readSync(fd, b, at, b.length - at, at))) at += n;
    if (at !== bytes.length || !b.subarray(0, at).equals(bytes) || !same(s, fs.fstatSync(fd, { bigint: true })) || !same(s, fs.lstatSync(named, { bigint: true }))) fail('maintenance_changed');
    return stamp(s);
  }
  try {
    fd = fs.openSync(stage, 'wx+'); if (fs.writeSync(fd, bytes) !== bytes.length) fail('maintenance_short_write'); fs.fsyncSync(fd); check(stage);
    fs.linkSync(stage, file); check(stage); check(file); fs.unlinkSync(stage); const before = check(file), closing = fd; fd = undefined; fs.closeSync(closing);
    const after = read(file, 128 * 1024); if (!after.bytes?.equals(bytes) || !same(before, after.stat, true)) fail('maintenance_changed'); return after;
  } finally { if (fd !== undefined) fs.closeSync(fd); }
}
function context(d, descriptorPath) {
  if (!d || d.machineId !== os.hostname()) fail('maintenance_machine');
  if (!d || descriptorPath !== path.join(d.installRoot, 'installation.json') || d.stateDir !== path.join(d.installRoot, 'state/production') || !HEX.test(d.panelToken) || !HEX.test(d.controlToken) || d.panelToken === d.controlToken) fail('maintenance_installation');
  const initial = read(descriptorPath); if (!initial.bytes || canonical(JSON.parse(initial.bytes)) !== canonical(d)) fail('maintenance_installation');
  const descriptorHash = hash(initial.bytes), key = crypto.createHmac('sha256', Buffer.from(d.panelToken, 'hex')).update('ae-core4/maintenance-key/v1\0').update(Buffer.from(d.controlToken, 'hex')).digest();
  const p = { descriptor: descriptorPath, origin: path.join(d.installRoot, 'origin.json'), anchor: path.join(d.stateDir, 'origin.json'), client: path.join(d.installRoot, 'core-client.json'), journal: path.join(d.stateDir, 'receiver/completions.ndjson'), ledger: path.join(d.stateDir, 'broker/ledger.ndjson'), barrier: path.join(d.stateDir, 'runtime-maintenance.json') };
  const markerPaths = ['runtime-owner.json', 'runtime-owner.next', 'runtime-diagnostic.json', 'broker/broker-owner.lock', 'broker/broker-owner.gate', 'receiver/owner'];
  const info = v => ({ hash: v.bytes === null ? null : hash(v.bytes), stat: v.stat });
  function snapshot(histories = false) {
    const names = ['descriptor', 'origin', 'anchor', 'client', ...(histories ? ['journal', 'ledger'] : [])], values = Object.fromEntries(names.map(k => [k, read(p[k], histories && ['journal', 'ledger'].includes(k) ? 64 * 1024 * 1024 : 16384)]));
    if (!values.descriptor.bytes?.equals(initial.bytes) || !same(values.descriptor.stat, initial.stat) || !values.origin.bytes || !values.anchor.bytes || !values.origin.bytes.equals(values.anchor.bytes) || !values.client.bytes) fail('maintenance_changed');
    const origin = JSON.parse(values.origin.bytes); if (origin.installationId !== d.installationId || origin.machineId !== d.machineId) fail('maintenance_changed');
    return { values, facts: Object.fromEntries(names.map(k => [k, info(values[k])])) };
  }
  function seal(kind, value) {
    const body = { version: 1, kind, installationId: d.installationId, machineId: d.machineId, descriptorHash, ...value };
    return Buffer.from(canonical({ body, mac: crypto.createHmac('sha256', key).update('ae-core4/maintenance-record/v1\0' + canonical(body)).digest('hex') }));
  }
  function decode(v, kind, fields) {
    if (!v.bytes?.length || !Buffer.from(v.bytes.toString('utf8')).equals(v.bytes)) fail('maintenance_record');
    let e; try { e = JSON.parse(v.bytes); } catch { fail('maintenance_record'); }
    exact(e, ['body', 'mac']); exact(e.body, ['version', 'kind', 'installationId', 'machineId', 'descriptorHash', ...fields]);
    const mac = crypto.createHmac('sha256', key).update('ae-core4/maintenance-record/v1\0' + canonical(e.body)).digest('hex');
    if (!HEX.test(e.mac) || !crypto.timingSafeEqual(Buffer.from(mac, 'hex'), Buffer.from(e.mac, 'hex')) || !Buffer.from(canonical(e)).equals(v.bytes) || e.body.version !== 1 || e.body.kind !== kind || e.body.installationId !== d.installationId || e.body.machineId !== d.machineId || e.body.descriptorHash !== descriptorHash) fail('maintenance_record'); return e.body;
  }
  function dir(id, create = false) { if (!UUID.test(id)) fail('maintenance_id'); const target = path.join(d.installRoot, 'transactions', id + '-owner-maintenance'); plain(path.dirname(target), false, true); if (create) fs.mkdirSync(target); plain(target, false, true); return target; }
  function reverify() { if (canonical(require('./stdio-entry').verifyInstallation(descriptorPath)) !== canonical(d)) fail('maintenance_installation'); }
  function markers() { return Object.fromEntries(markerPaths.map(k => [k, info(read(path.join(d.stateDir, k)))])); }
  function scope(s) { exact(s, ['bootId', 'pid', 'birthTicks']); if (!UUID.test(s.bootId) || !Number.isInteger(s.pid) || s.pid < 1 || s.pid > 0xffffffff || typeof s.birthTicks !== 'string' || !/^[1-9][0-9]{0,18}$/.test(s.birthTicks) || BigInt(s.birthTicks) > 3155378975999999999n) fail('maintenance_scope'); }
  function authorization(s, id = crypto.randomUUID()) { scope(s); const body = { version: 1, purpose: 'maintenance-stop-v1', id, ...s, descriptorHash }; if (!UUID.test(id)) fail('maintenance_id'); return { body, mac: crypto.createHmac('sha256', key).update('ae-core4/maintenance-request/v1\0' + canonical(body)).digest('hex') }; }
  function verifyAuthorization(value, s) {
    exact(value, ['body', 'mac']); exact(value.body, ['version', 'purpose', 'id', 'bootId', 'pid', 'birthTicks', 'descriptorHash']);
    const expected = authorization(s, value.body.id); if (!HEX.test(value.mac) || canonical(expected.body) !== canonical(value.body) || !crypto.timingSafeEqual(Buffer.from(expected.mac, 'hex'), Buffer.from(value.mac, 'hex'))) fail('maintenance_authorization'); return value.body.id;
  }
  function settled(snap) {
    const r = inspectReceiverHistory(snap.values.journal.bytes, { descriptorPath }), l = inspectLedgerHistory(snap.values.ledger.bytes, { installationId: d.installationId });
    if (!r.settled || !l.settled || l.commands.length && !r.present) fail('maintenance_unsettled');
    const parse = require('./native-read-disposition').parseJournalBytes;
    const receiver = snap.values.journal.bytes ? parse(snap.values.journal.bytes).events : [], ledger = snap.values.ledger.bytes?.length ? parse(snap.values.ledger.bytes).events : [];
    const begins = new Map(receiver.filter(e => e.type === 'begin').map(e => [e.commandId, e])), replies = new Map(receiver.filter(e => e.type === 'complete').map(e => [e.commandId, e.response.result?.outcome])), terminals = new Map(ledger.filter(e => e.type === 'command').map(e => [e.commandId, e.state]));
    for (const e of ledger.filter(e => e.type === 'intent')) { const b = begins.get(e.commandId), t = terminals.get(e.commandId), outcome = replies.get(e.commandId); if (b ? canonical(b.originalBinding) !== canonical(e.dispatchBinding) : t !== 'rejected') fail('maintenance_unsettled'); if (outcome === 'applied' && t === 'rejected' || outcome === 'rejected' && t === 'succeeded') fail('maintenance_unsettled'); }
  }
  return { d, descriptorPath, descriptorHash, p, info, snapshot, seal, decode, dir, markers, scope, authorization, verifyAuthorization, settled, reverify };
}
function createStopAuthorization({ installation, descriptorPath, scope, id }) { return context(installation, descriptorPath).authorization(scope, id); }
function createOwnerMaintenance({ installation, descriptorPath, lifecycle, freeze, activity, accepted, close, intervalMs = 50 }) {
  if (![freeze, activity, accepted, close].every(value => typeof value === 'function') || !Number.isSafeInteger(intervalMs) || intervalMs < 1 || intervalMs > 1000) fail('maintenance_options');
  const c = context(installation, descriptorPath), state = lifecycle.state(), scope = { bootId: state.processBootId, pid: state.pid, birthTicks: state.birthTicks };
  c.scope(scope); let stop, stopped, fault = null, timer, closing = false, resolveDone;
  const done = new Promise(resolve => { resolveDone = resolve; });
  function status() { return { requested: !!stop, id: stop?.id || null, phase: stopped ? 'stopped' : fault ? 'fenced' : closing ? 'closing' : stop ? 'draining' : 'running', fault }; }
  async function drain() {
    timer = undefined; if (!stop || fault || stopped || closing) return;
    try {
      const pending = activity().pending, count = accepted();
      if (typeof pending !== 'boolean' || !Number.isSafeInteger(count) || count < 0) fail('maintenance_activity');
      if (count || pending) { timer = setTimeout(drain, intervalMs); return; }
      closing = true; await close();
      const snap = c.snapshot(true), markers = c.markers(); let settled = true;
      try { c.settled(snap); } catch { settled = false; }
      stopped = atomic(path.join(c.dir(stop.id), 'stopped.json'), c.seal('maintenance-stopped', { id: stop.id, stopHash: stop.hash, scope, protected: snap.facts, markers, settled }), stop.nonce);
      resolveDone(status());
    } catch { fault = 'maintenance_stop_uncertain'; resolveDone(status()); }
  }
  function request(value) {
    const id = c.verifyAuthorization(value, scope);
    if (stop || fault) { if (stop?.id === id) return status(); fail('maintenance_in_progress'); }
    // Freeze is synchronous and is never undone after a persist failure.
    freeze();
    try {
      const baseline = c.snapshot().facts, nonce = crypto.randomUUID(); c.dir(id, true);
      const barrier = atomic(c.p.barrier, c.seal('maintenance-stop', { id, scope, protected: baseline, authorizationHash: hash(value), nonce }), nonce);
      stop = { id, hash: hash(barrier.bytes), nonce }; timer = setTimeout(drain, 10); return status();
    } catch { fault = 'maintenance_persist_failed'; fail(fault); }
  }
  return Object.freeze({ request, requestLocal: () => stop || fault ? status() : request(c.authorization(scope)), status, done, scope: Object.freeze(scope) });
}
async function gone(scope) { const o = await observeOwnerProcess(scope.pid); if (!['absent', 'pid-reused'].includes(classifyOwnerProcess({ pid: scope.pid, birthTicks: scope.birthTicks }, o))) fail('maintenance_process_not_dead'); }
function phaseSnapshot(c, directory) {
  const allowed = ['stopped.json', 'resume-intent.json', 'resume-lease.json', 'resume-completed.json', 'stop-barrier'];
  plain(directory, false, true); const s = fs.lstatSync(directory, { bigint: true }), names = fs.readdirSync(directory).sort(), tree = {};
  if (names.length > 32) fail('maintenance_budget');
  for (const name of names) {
    if (!allowed.includes(name) && !allowed.some(base => name.startsWith(base + '.stage-') && UUID.test(name.slice(base.length + 7)))) fail('maintenance_phase');
    tree[name] = c.info(read(path.join(directory, name), 128 * 1024));
    if (tree[name].hash === null) fail('maintenance_changed');
  }
  return { directory: { dev: String(s.dev), ino: String(s.ino), birthtimeNs: String(s.birthtimeNs) }, tree, barrier: c.info(read(c.p.barrier)) };
}
function assertPhase(c, directory, expected) { if (canonical(phaseSnapshot(c, directory)) !== canonical(expected)) fail('maintenance_changed'); }
async function inspected(c, id) {
  const barrier = read(c.p.barrier), directory = c.dir(id || (barrier.bytes && JSON.parse(barrier.bytes).body?.id));
  const archived = read(path.join(directory, 'stop-barrier')), original = barrier.bytes ? barrier : archived;
  const b = c.decode(original, 'maintenance-stop', ['id', 'scope', 'protected', 'authorizationHash', 'nonce']); c.scope(b.scope);
  if (b.id !== path.basename(directory).slice(0, 36) || !HEX.test(b.authorizationHash) || !UUID.test(b.nonce) || barrier.bytes && archived.bytes) fail('maintenance_phase');
  const phase = phaseSnapshot(c, directory);
  const receipt = read(path.join(directory, 'stopped.json'), 128 * 1024); if (receipt.bytes === null) fail('maintenance_not_stopped');
  const r = c.decode(receipt, 'maintenance-stopped', ['id', 'stopHash', 'scope', 'protected', 'markers', 'settled']);
  if (r.id !== b.id || r.stopHash !== hash(original.bytes) || canonical(r.scope) !== canonical(b.scope)) fail('maintenance_record');
  const snap = c.snapshot(true), markers = c.markers(), actualMarkers = canonical(markers);
  const intentView = read(path.join(directory, 'resume-intent.json'), 128 * 1024), completedView = read(path.join(directory, 'resume-completed.json')), leaseView = read(path.join(directory, 'resume-lease.json'));
  let intent, completed, lease;
  if (intentView.bytes) {
    intent = c.decode(intentView, 'maintenance-resume-intent', ['id', 'resumeId', 'stopHash', 'snapshot', 'operator', 'gates']); c.scope(intent.operator);
    if (intent.id !== b.id || !UUID.test(intent.resumeId) || intent.stopHash !== hash(original.bytes) || canonical(intent.snapshot) !== canonical(snap.facts) || !Array.isArray(intent.gates) || intent.gates.length !== 2) fail('maintenance_record');
    for (const [index, value] of intent.gates.entries()) {
      if (typeof value !== 'string' || Buffer.from(value, 'base64').toString('base64') !== value) fail('maintenance_record');
      const gate = c.decode({ bytes: Buffer.from(value, 'base64') }, 'maintenance-lease-gate', ['id', 'resumeId', 'operator', 'role', 'nonce']);
      if (gate.id !== b.id || gate.resumeId !== intent.resumeId || canonical(gate.operator) !== canonical(intent.operator) || gate.role !== ['install', 'broker'][index] || !UUID.test(gate.nonce)) fail('maintenance_record');
    }
    if (leaseView.bytes) {
      lease = c.decode(leaseView, 'maintenance-resume-lease', ['id', 'resumeId', 'facts']);
      if (lease.id !== b.id || lease.resumeId !== intent.resumeId || !Array.isArray(lease.facts) || lease.facts.length !== 2) fail('maintenance_record');
    }
    if (completedView.bytes) {
      completed = c.decode(completedView, 'maintenance-resume-completed', ['id', 'resumeId', 'intentHash']);
      if (completed.id !== b.id || completed.resumeId !== intent.resumeId || completed.intentHash !== hash(intentView.bytes)) fail('maintenance_record');
      if (!lease) fail('maintenance_phase');
    } else if (completedView.bytes !== null) fail('maintenance_record');
    if (archived.bytes && !completed) fail('maintenance_phase');
  } else if (completedView.bytes || leaseView.bytes || archived.bytes) fail('maintenance_phase');
  for (const [name, value] of [['stopped.json', receipt], ['resume-intent.json', intentView], ['resume-lease.json', leaseView], ['resume-completed.json', completedView], ['stop-barrier', archived]]) {
    if (canonical(phase.tree[name] || { hash: null, stat: null }) !== canonical(c.info(value))) fail('maintenance_changed');
  }
  if (canonical(phase.barrier) !== canonical(c.info(barrier))) fail('maintenance_changed');
  const gates = [path.join(c.d.installRoot, 'install.lock'), path.join(c.d.stateDir, 'broker/broker-owner.gate')].map(file => read(file));
  for (const [index, gate] of gates.entries()) if (gate.bytes !== null) {
    if (!intent || !gate.bytes.equals(Buffer.from(intent.gates[index], 'base64'))) fail('maintenance_gate_busy');
    if (completed && (!Array.isArray(lease.facts) || lease.facts.length !== 2 || lease.facts[index].file !== gate.file || lease.facts[index].hash !== hash(gate.bytes) || !same(lease.facts[index].stat, gate.stat))) fail('maintenance_changed');
    if (index === 1) markers['broker/broker-owner.gate'] = { hash: null, stat: null };
  }
  if (canonical(Object.fromEntries(['descriptor', 'origin', 'anchor', 'client'].map(k => [k, snap.facts[k]]))) !== canonical(b.protected) || canonical(snap.facts) !== canonical(r.protected) || canonical(markers) !== canonical(r.markers)) fail('maintenance_changed');
  await gone(b.scope);
  assertPhase(c, directory, phase);
  const after = c.snapshot(true); if (canonical(after.facts) !== canonical(snap.facts) || canonical(c.markers()) !== actualMarkers || gates.some(v => canonical(c.info(read(v.file))) !== canonical(c.info(v)))) fail('maintenance_changed');
  if (r.settled !== true || Object.values(markers).some(m => m.hash !== null)) fail('maintenance_unsettled'); c.settled(after);
  const proof = { id: b.id, stopHash: hash(original.bytes), receiptHash: hash(receipt.bytes), snapshot: after.facts, markers, gates: gates.map(c.info), phase, barrier: c.info(barrier), archived: c.info(archived), intentHash: intentView.bytes ? hash(intentView.bytes) : null, completedHash: completedView.bytes ? hash(completedView.bytes) : null };
  return { c, directory, b, barrier, archived, original, snap: after, intent, completed, lease, gates, phase, proofHash: hash(proof), proof };
}
async function inspectMaintenance({ installation, descriptorPath, id }) {
  try {
    const result = await inspected(context(installation, descriptorPath), id);
    return Object.freeze({ id: result.b.id, phase: result.completed && result.archived.bytes ? result.gates.some(v => v.bytes !== null) ? 'resume-release-fenced' : 'resumed' : result.intent ? 'resume-fenced' : 'stopped', proofHash: result.proofHash, inspectionOnly: true, aeAuthority: false });
  } catch (e) {
    if (!['maintenance_unsettled', 'maintenance_not_stopped'].includes(e.code)) throw e;
    return Object.freeze({ id: id || null, phase: e.code === 'maintenance_unsettled' ? 'stopped-fenced' : 'stop-in-progress', reason: e.code, proofHash: null, inspectionOnly: true, aeAuthority: false });
  }
}
function maintenanceLeasePermit(capability) { const item = capability && permits.get(capability); if (!item) fail('maintenance_lease_brand'); return item; }
async function resumeMaintenance({ installation, descriptorPath, id, expectedProofHash, reservedServer }) {
  const address = reservedServer instanceof http.Server && reservedServer.listening && reservedServer.address();
  if (!address || address.address !== '127.0.0.1' || reservedServer.listenerCount('request')) fail('maintenance_endpoint');
  if (!HEX.test(expectedProofHash)) fail('maintenance_expected_proof');
  const c = context(installation, descriptorPath), first = await inspected(c, id); if (first.proofHash !== expectedProofHash) fail('maintenance_proof_changed');
  const api = require('./install-lease'), scope = { installRoot: installation.installRoot, stateDir: installation.stateDir, descriptorPath };
  let lease, recovery = false;
  if (first.intent) {
    if (!first.completed || !first.archived.bytes || first.barrier.bytes) fail('maintenance_resume_in_progress');
    await gone(first.intent.operator); recovery = true;
  }
  const self = await observeOwnerProcess(process.pid); if (self.status !== 'present' || !self.executablePath || path.resolve(self.executablePath).toLowerCase() !== path.resolve(installation.nodePath).toLowerCase()) fail('maintenance_process_unknown');
  let expectedPhase = first.phase; assertPhase(c, first.directory, expectedPhase);
  function published(name, value) {
    if (Object.hasOwn(expectedPhase.tree, name)) fail('maintenance_phase');
    expectedPhase = { ...expectedPhase, tree: { ...expectedPhase.tree, [name]: c.info(value) } }; assertPhase(c, first.directory, expectedPhase);
  }
  const nonce = crypto.randomUUID(), resumeId = crypto.randomUUID(), operator = { bootId: crypto.randomUUID(), pid: process.pid, birthTicks: self.birthTicks };
  const gates = recovery ? first.intent.gates : ['install', 'broker'].map(role => c.seal('maintenance-lease-gate', { id: first.b.id, resumeId, operator, role, nonce: crypto.randomUUID() }).toString('base64'));
  if (!Array.isArray(gates) || gates.length !== 2 || gates.some(b => typeof b !== 'string' || Buffer.from(b, 'base64').toString('base64') !== b)) fail('maintenance_record');
  if (!recovery) published('resume-intent.json', atomic(path.join(first.directory, 'resume-intent.json'), c.seal('maintenance-resume-intent', { id: first.b.id, resumeId, stopHash: first.proof.stopHash, snapshot: first.snap.facts, operator, gates }), nonce));
  const capability = Object.freeze({}); permits.set(capability, { scope, gates: gates.map(b => Buffer.from(b, 'base64')), nonce, recovery, facts: first.lease?.facts || null });
  try {
    lease = api.acquireMaintenanceInstallLease(capability);
    c.reverify(); assertPhase(c, first.directory, expectedPhase);
    if (!recovery) {
      const stable = c.snapshot(true); if (canonical(stable.facts) !== canonical(first.snap.facts) || Object.entries(c.markers()).some(([k, m]) => m.hash !== null && k !== 'broker/broker-owner.gate')) fail('maintenance_changed'); c.settled(stable);
      const facts = api.maintenanceLeaseFacts(lease);
      published('resume-lease.json', atomic(path.join(first.directory, 'resume-lease.json'), c.seal('maintenance-resume-lease', { id: first.b.id, resumeId, facts }), nonce));
      const freshBarrier = read(c.p.barrier); if (!freshBarrier.bytes?.equals(first.barrier.bytes) || !same(freshBarrier.stat, first.barrier.stat)) fail('maintenance_changed');
      published('resume-completed.json', atomic(path.join(first.directory, 'resume-completed.json'), c.seal('maintenance-resume-completed', { id: first.b.id, resumeId, intentHash: hash(read(path.join(first.directory, 'resume-intent.json'), 128 * 1024).bytes) }), nonce));
      api.assertInstallLease(lease, scope); assertPhase(c, first.directory, expectedPhase);
      const fd = fs.openSync(c.p.barrier, 'r'), target = path.join(first.directory, 'stop-barrier'); let archiveBeforeClose;
      try {
        if (!same(first.barrier.stat, fs.fstatSync(fd, { bigint: true })) || !same(first.barrier.stat, fs.lstatSync(c.p.barrier, { bigint: true }))) fail('maintenance_changed');
        fs.linkSync(c.p.barrier, target);
        const source = read(c.p.barrier), archive = read(target), held = fs.fstatSync(fd, { bigint: true });
        if (!source.bytes?.equals(first.barrier.bytes) || !archive.bytes?.equals(first.barrier.bytes) || !same(source.stat, held) || !same(archive.stat, held) || !same(first.barrier.stat, held, true)) fail('maintenance_changed');
        expectedPhase = { ...expectedPhase, barrier: c.info(source), tree: { ...expectedPhase.tree, 'stop-barrier': c.info(archive) } }; assertPhase(c, first.directory, expectedPhase);
        fs.unlinkSync(c.p.barrier);
        const finalArchive = read(target); if (!finalArchive.bytes?.equals(first.barrier.bytes) || !same(archive.stat, finalArchive.stat, true)) fail('maintenance_changed');
        archiveBeforeClose = finalArchive.stat;
        expectedPhase = { ...expectedPhase, barrier: { hash: null, stat: null }, tree: { ...expectedPhase.tree, 'stop-barrier': c.info(finalArchive) } }; assertPhase(c, first.directory, expectedPhase);
      } finally { fs.closeSync(fd); }
      const archiveAfterClose = read(target);
      if (read(c.p.barrier).bytes !== null || !archiveAfterClose.bytes?.equals(first.barrier.bytes) || !same(archiveBeforeClose, archiveAfterClose.stat, true)) fail('maintenance_changed');
      // Our hardlink/unlink can flush ctime when even a read handle closes on
      // Windows. Refresh only this known inode after exact bounded reread.
      expectedPhase = { ...expectedPhase, tree: { ...expectedPhase.tree, 'stop-barrier': c.info(archiveAfterClose) } };
    }
    assertPhase(c, first.directory, expectedPhase); api.assertInstallLease(lease, scope);
    api.releaseInstallLease(lease); lease = null;
    return { resumed: true, id: first.b.id, sameDescriptor: true, runtimeStarted: false, aeAuthority: false, recoveredLeaseOnly: recovery };
  } catch (e) { if (lease) api.retainInstallLease(lease); throw e; }
  finally { permits.delete(capability); }
}
module.exports = { PRIVATE_METHODS, createStopAuthorization, createOwnerMaintenance, inspectMaintenance, resumeMaintenance, maintenanceLeasePermit };

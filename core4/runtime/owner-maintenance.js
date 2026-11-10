'use strict';
// Private full-installation operator protocol. No MCP tool, AE grant or launcher.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), http = require('node:http'), os = require('node:os');
const { canonical, hash, fail } = require('../protocol/json');
const { inspectRenderJobs } = require('./render-job-maintenance');
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
  const renderJobs = () => inspectRenderJobs(d.stateDir, { installationId: d.installationId });
  function snapshot(histories = false) {
    const names = ['descriptor', 'origin', 'anchor', 'client', ...(histories ? ['journal', 'ledger'] : [])], values = Object.fromEntries(names.map(k => [k, read(p[k], histories && ['journal', 'ledger'].includes(k) ? 64 * 1024 * 1024 : 16384)]));
    if (!values.descriptor.bytes?.equals(initial.bytes) || !same(values.descriptor.stat, initial.stat) || !values.origin.bytes || !values.anchor.bytes || !values.origin.bytes.equals(values.anchor.bytes) || !values.client.bytes) fail('maintenance_changed');
    const origin = JSON.parse(values.origin.bytes); if (origin.installationId !== d.installationId || origin.machineId !== d.machineId) fail('maintenance_changed');
    const render = histories ? renderJobs() : null;
    return { values, facts: { ...Object.fromEntries(names.map(k => [k, info(values[k])])), ...(render && { renderJobs: render }) } };
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
    const r = inspectReceiverHistory(snap.values.journal.bytes, { descriptorPath }), l = inspectLedgerHistory(snap.values.ledger.bytes, { installationId: d.installationId, receiver: r });
    if (!r.settled || !l.settled || l.commands.length && !r.present) fail('maintenance_unsettled');
    const parse = require('./native-read-disposition').parseJournalBytes;
    const receiver = snap.values.journal.bytes ? parse(snap.values.journal.bytes).events : [], ledger = snap.values.ledger.bytes?.length ? parse(snap.values.ledger.bytes).events : [];
    const begins = new Map(receiver.filter(e => e.type === 'begin').map(e => [e.commandId, e])), replies = new Map(receiver.filter(e => e.type === 'complete').map(e => [e.commandId, e.response.result?.outcome])), terminals = new Map(ledger.filter(e => e.type === 'command').map(e => [e.commandId, e.state]));
    for (const e of ledger.filter(e => e.type === 'intent')) { const b = begins.get(e.commandId), t = terminals.get(e.commandId), outcome = replies.get(e.commandId); if (b ? canonical(b.originalBinding) !== canonical(e.dispatchBinding) : t !== 'rejected') fail('maintenance_unsettled'); if (outcome === 'applied' && t === 'rejected' || outcome === 'rejected' && t === 'succeeded') fail('maintenance_unsettled'); }
  }
  return { d, renderJobs, descriptorPath, descriptorHash, p, info, snapshot, seal, decode, dir, markers, scope, authorization, verifyAuthorization, settled, reverify };
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
      if (canonical(c.renderJobs()) !== canonical(stop.render)) fail('render_job_maintenance_changed');
      closing = true; await close();
      const snap = c.snapshot(true), markers = c.markers(); let settled = true;
      if (canonical(snap.facts.renderJobs ?? null) !== canonical(stop.render)) fail('render_job_maintenance_changed');
      try { c.settled(snap); } catch { settled = false; }
      stopped = atomic(path.join(c.dir(stop.id), 'stopped.json'), c.seal('maintenance-stopped', { id: stop.id, stopHash: stop.hash, scope, protected: snap.facts, markers, settled }), stop.nonce);
      resolveDone(status());
    } catch { fault = 'maintenance_stop_uncertain'; resolveDone(status()); }
  }
  function request(value) {
    const id = c.verifyAuthorization(value, scope);
    if (stop || fault) { if (stop?.id === id) return status(); fail('maintenance_in_progress'); }
    // A refusal here leaves the Owner running so the operator can settle R1.
    // No asynchronous admission can interleave between this check and freeze.
    const render = c.renderJobs();
    // Freeze is synchronous and is never undone after a persist failure.
    freeze();
    try {
      const baseline = { ...c.snapshot().facts, renderJobs: render }, nonce = crypto.randomUUID(); c.dir(id, true);
      const barrier = atomic(c.p.barrier, c.seal('maintenance-stop', { id, scope, protected: baseline, authorizationHash: hash(value), nonce }), nonce);
      stop = { id, hash: hash(barrier.bytes), nonce, render }; timer = setTimeout(drain, 10); return status();
    } catch { fault = 'maintenance_persist_failed'; fail(fault); }
  }
  return Object.freeze({ request, requestLocal: () => stop || fault ? status() : request(c.authorization(scope)), status, done, scope: Object.freeze(scope) });
}
function stopProtected(facts, recorded) {
  return Object.fromEntries(['descriptor', 'origin', 'anchor', 'client', ...(Object.hasOwn(recorded, 'renderJobs') ? ['renderJobs'] : [])].map(k => [k, facts[k] ?? null]));
}
function receiptProtected(facts, recorded) {
  const { renderJobs, ...legacy } = facts;
  return Object.hasOwn(recorded, 'renderJobs') ? facts : legacy;
}
async function gone(scope) { const o = await observeOwnerProcess(scope.pid); if (!['absent', 'pid-reused'].includes(classifyOwnerProcess({ pid: scope.pid, birthTicks: scope.birthTicks }, o))) fail('maintenance_process_not_dead'); }
function phaseSnapshot(c, directory, finishing = false) {
  const allowed = ['stopped.json', 'resume-intent.json', 'resume-lease.json', 'resume-completed.json', 'stop-barrier'];
  plain(directory, false, true); const s = fs.lstatSync(directory, { bigint: true }), names = fs.readdirSync(directory).sort(), tree = {};
  if (names.length > (finishing ? 256 : 32)) fail('maintenance_budget');
  for (const name of names) {
    const base = name.replace(/\.stage-[a-f0-9-]{36}$/, '');
    const finishFile = finishing && (base === 'finish-commit.json' || /^finish-[a-f0-9-]{36}\.json$/.test(base) && UUID.test(base.slice(7, 43)) || /^finish-[a-f0-9-]{36}-(install|broker)-(old|new)$/.test(base) && UUID.test(base.slice(7, 43)));
    if ((!allowed.includes(base) && !finishFile) || base !== name && !UUID.test(name.slice(base.length + 7))) fail('maintenance_phase');
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
  if (canonical(stopProtected(snap.facts, b.protected)) !== canonical(b.protected) || canonical(receiptProtected(snap.facts, b.protected)) !== canonical(r.protected) || canonical(markers) !== canonical(r.markers)) fail('maintenance_changed');
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
// Forward-only continuation. These records describe filesystem mutex work,
// never an execution command. Every new actor leaves an immutable chain link
// before replacing a gate; original resume records remain unchanged.
const FINISH_LIMIT = 16;
const nullInfo = () => ({ hash: null, stat: null });
const inode = (a, b) => a && b && a.dev === b.dev && a.ino === b.ino;
const stable = (a, b) => a && b && STATS.filter(k => k !== 'ctimeNs').every(k => a[k] === b[k]);
const encoded = value => typeof value === 'string' && Buffer.from(value, 'base64').toString('base64') === value;
function gatePaths(c) { return [path.join(c.d.installRoot, 'install.lock'), path.join(c.d.stateDir, 'broker/broker-owner.gate')]; }
function finishFacts(c, directory) {
  return { phase: phaseSnapshot(c, directory, true), gates: gatePaths(c).map(file => c.info(read(file))), snapshot: c.snapshot(true).facts, markers: c.markers() };
}
function sameFact(a, b) { return a.hash === b.hash && (a.hash === null ? b.stat === null : stable(a.stat, b.stat)); }
function finishRecord(c, view, kind, fields, id, resumeId) {
  const body = c.decode(view, kind, fields);
  if (body.id !== id || body.resumeId !== resumeId) fail('maintenance_record'); return body;
}
function readFinish(c, id) {
  const directory = c.dir(id), facts = finishFacts(c, directory), get = name => read(path.join(directory, name), 128 * 1024);
  const barrier = read(c.p.barrier), archived = get('stop-barrier'), original = barrier.bytes ? barrier : archived;
  const b = c.decode(original, 'maintenance-stop', ['id', 'scope', 'protected', 'authorizationHash', 'nonce']); c.scope(b.scope);
  if (b.id !== id || !UUID.test(b.nonce) || !HEX.test(b.authorizationHash)) fail('maintenance_record');
  if (barrier.bytes && archived.bytes && (!barrier.bytes.equals(archived.bytes) || !same(barrier.stat, archived.stat))) fail('maintenance_phase');
  const receiptView = get('stopped.json'), r = c.decode(receiptView, 'maintenance-stopped', ['id', 'stopHash', 'scope', 'protected', 'markers', 'settled']);
  const intentView = get('resume-intent.json'), intent = c.decode(intentView, 'maintenance-resume-intent', ['id', 'resumeId', 'stopHash', 'snapshot', 'operator', 'gates']);
  c.scope(intent.operator);
  if (r.id !== id || r.stopHash !== hash(original.bytes) || canonical(r.scope) !== canonical(b.scope) || intent.id !== id || !UUID.test(intent.resumeId) || intent.stopHash !== r.stopHash || canonical(intent.snapshot) !== canonical(facts.snapshot) || canonical(r.protected) !== canonical(receiptProtected(facts.snapshot, b.protected)) || canonical(b.protected) !== canonical(stopProtected(facts.snapshot, b.protected)) || !Array.isArray(intent.gates) || intent.gates.length !== 2) fail('maintenance_changed');
  intent.gates.forEach((value, index) => {
    if (!encoded(value)) fail('maintenance_record');
    const g = finishRecord(c, { bytes: Buffer.from(value, 'base64') }, 'maintenance-lease-gate', ['id', 'resumeId', 'operator', 'role', 'nonce'], id, intent.resumeId);
    if (canonical(g.operator) !== canonical(intent.operator) || g.role !== ['install', 'broker'][index] || !UUID.test(g.nonce)) fail('maintenance_record');
  });
  const leaseView = get('resume-lease.json'), completionView = get('resume-completed.json'); let originalLease, completion;
  if (leaseView.bytes) {
    originalLease = finishRecord(c, leaseView, 'maintenance-resume-lease', ['id', 'resumeId', 'facts'], id, intent.resumeId);
    if (!Array.isArray(originalLease.facts) || originalLease.facts.length !== 2) fail('maintenance_record');
    originalLease.facts.forEach((f, i) => { exact(f, ['file', 'hash', 'stat']); if (f.file !== gatePaths(c)[i] || f.hash !== hash(Buffer.from(intent.gates[i], 'base64'))) fail('maintenance_record'); exact(f.stat, STATS); });
  }
  if (completionView.bytes) {
    completion = finishRecord(c, completionView, 'maintenance-resume-completed', ['id', 'resumeId', 'intentHash'], id, intent.resumeId);
    if (!originalLease || completion.intentHash !== hash(intentView.bytes)) fail('maintenance_phase');
  }
  const attempts = new Map(), children = new Map();
  for (const name of Object.keys(facts.phase.tree).filter(n => /^finish-[a-f0-9-]{36}\.json$/.test(n))) {
    const view = get(name), a = finishRecord(c, view, 'maintenance-finish-attempt', ['id', 'resumeId', 'attemptId', 'parentHash', 'intentHash', 'actor', 'mode', 'sources', 'targets', 'snapshotHash', 'priorPhase'], id, intent.resumeId);
    if (name !== 'finish-' + a.attemptId + '.json' || !UUID.test(a.attemptId) || a.parentHash !== null && !HEX.test(a.parentHash) || a.intentHash !== hash(intentView.bytes) || !['commit', 'release'].includes(a.mode) || a.snapshotHash !== hash(facts.snapshot) || !a.priorPhase || Object.getPrototypeOf(a.priorPhase) !== Object.prototype || !Array.isArray(a.sources) || a.sources.length !== 2 || !Array.isArray(a.targets) || a.targets.length !== 2) fail('maintenance_record');
    c.scope(a.actor); a.sources.forEach((s, i) => { exact(s, ['bytes', 'hash', 'stat']); if (s.bytes === null ? s.hash !== null || s.stat !== null : !encoded(s.bytes) || s.hash !== hash(Buffer.from(s.bytes, 'base64'))) fail('maintenance_record'); if (s.stat) exact(s.stat, STATS); if (a.mode === 'commit') { if (!encoded(a.targets[i])) fail('maintenance_record'); const g = finishRecord(c, { bytes: Buffer.from(a.targets[i], 'base64') }, 'maintenance-finish-gate', ['id', 'resumeId', 'attemptId', 'parentHash', 'actor', 'role', 'nonce'], id, intent.resumeId); if (g.attemptId !== a.attemptId || g.parentHash !== a.parentHash || canonical(g.actor) !== canonical(a.actor) || g.role !== ['install', 'broker'][i] || !UUID.test(g.nonce)) fail('maintenance_record'); } else if (a.targets[i] !== null) fail('maintenance_record'); });
    const digest = hash(view.bytes); if (attempts.has(digest) || children.has(a.parentHash)) fail('maintenance_phase'); attempts.set(digest, { ...a, hash: digest }); children.set(a.parentHash, digest);
  }
  if (attempts.size > FINISH_LIMIT) fail('maintenance_budget');
  const chain = []; let next = children.get(null);
  while (next) { if (chain.length >= attempts.size) fail('maintenance_phase'); const a = attempts.get(next); if (!a) fail('maintenance_phase'); chain.push(a); next = children.get(next); }
  if (chain.length !== attempts.size) fail('maintenance_phase');
  for (const [index, a] of chain.entries()) {
    exact(a.priorPhase, ['directory', 'tree', 'barrier']);
    if (canonical(a.priorPhase.directory) !== canonical(facts.phase.directory) || !a.priorPhase.tree || Object.getPrototypeOf(a.priorPhase.tree) !== Object.prototype || Object.keys(a.priorPhase.tree).length > 256 || Object.hasOwn(a.priorPhase.tree, 'finish-' + a.attemptId + '.json')) fail('maintenance_phase');
    for (const [name, prior] of Object.entries(a.priorPhase.tree)) {
      const actual = facts.phase.tree[name]; exact(prior, ['hash', 'stat']);
      // Only known gate/barrier aliases get ctime changes from our hardlinks.
      const linked = /-(install|broker)-(old|new)$/.test(name) || name === 'stop-barrier';
      if (!actual || (linked ? !sameFact(prior, actual) : canonical(prior) !== canonical(actual))) fail('maintenance_changed');
    }
    for (const previous of chain.slice(0, index)) if (!Object.hasOwn(a.priorPhase.tree, 'finish-' + previous.attemptId + '.json')) fail('maintenance_phase');
    for (const name of ['stopped.json', 'resume-intent.json']) if (canonical(a.priorPhase.tree[name]) !== canonical(facts.phase.tree[name])) fail('maintenance_changed');
  }
  const gateViews = gatePaths(c).map(file => read(file)), actual = gateViews.map(v => ({ ...c.info(v), bytes: v.bytes?.toString('base64') ?? null }));
  const firstSources = chain.length ? chain[0].sources : actual;
  firstSources.forEach((s, i) => { if (s.bytes !== null && s.bytes !== intent.gates[i]) fail('maintenance_gate_busy'); if (originalLease && s.bytes !== null && !sameFact(s, originalLease.facts[i])) fail('maintenance_changed'); });
  if (firstSources[1].bytes !== null && firstSources[0].bytes === null || originalLease && !completion && firstSources.some(s => s.bytes === null)) fail('maintenance_phase');
  const commitView = get('finish-commit.json'); let commit;
  if (commitView.bytes) {
    commit = finishRecord(c, commitView, 'maintenance-finish-commit', ['id', 'resumeId', 'intentHash', 'attemptHash', 'facts', 'snapshotHash'], id, intent.resumeId);
    const a = attempts.get(commit.attemptHash);
    if (completion || commit.intentHash !== hash(intentView.bytes) || !a || a.mode !== 'commit' || commit.snapshotHash !== hash(facts.snapshot) || !Array.isArray(commit.facts) || commit.facts.length !== 2) fail('maintenance_phase');
    commit.facts.forEach((f, i) => { exact(f, ['file', 'hash', 'stat']); exact(f.stat, STATS); if (f.file !== gatePaths(c)[i] || f.hash !== hash(Buffer.from(a.targets[i], 'base64'))) fail('maintenance_record'); });
  }
  const permission = completion || commit;
  if (!barrier.bytes && (!archived.bytes || !permission) || archived.bytes && !permission) fail('maintenance_phase');
  for (let n = 0; n < chain.length; n++) {
    const a = chain[n], end = n + 1 < chain.length ? chain[n + 1].sources : actual;
    const states = end.map((s, i) => {
      if (a.mode === 'release' && s.bytes === null) return 'T';
      if (s.bytes === a.sources[i].bytes && sameFact(s, a.sources[i])) return 'S';
      if (a.mode === 'release' ? s.bytes === null : s.bytes === a.targets[i]) return 'T';
      fail('maintenance_phase');
    }).join('');
    if (a.mode === 'commit' ? !['SS', 'TS', 'TT'].includes(states) : !permission || barrier.bytes || !['SS', 'ST', 'TT'].includes(states)) fail('maintenance_phase');
    if (n && chain[n - 1].mode === 'release' && a.mode !== 'release') fail('maintenance_phase');
    for (let i = 0; i < 2; i++) {
      const old = get('finish-' + a.attemptId + '-' + ['install', 'broker'][i] + '-old'), prepared = get('finish-' + a.attemptId + '-' + ['install', 'broker'][i] + '-new');
      if (a.mode === 'release' && (old.bytes || prepared.bytes)) fail('maintenance_phase');
      if (old.bytes && (a.sources[i].bytes === null || old.bytes.toString('base64') !== a.sources[i].bytes || !sameFact(c.info(old), a.sources[i]))) fail('maintenance_changed');
      if (a.mode === 'commit' && states[i] === 'T' && a.sources[i].bytes !== null && !old.bytes) fail('maintenance_phase');
      if (prepared.bytes && (prepared.bytes.toString('base64') !== a.targets[i] || states[i] === 'T' && !sameFact(c.info(prepared), end[i]))) fail('maintenance_changed');
    }
  }
  // No orphan published continuation artifact may be treated as a stage.
  for (const name of Object.keys(facts.phase.tree).filter(n => /^finish-.*-(old|new)$/.test(n))) if (!chain.some(a => name.startsWith('finish-' + a.attemptId + '-'))) fail('maintenance_phase');
  if (commit) {
    const at = chain.findIndex(a => a.hash === commit.attemptHash), end = at + 1 < chain.length ? chain[at + 1].sources : actual;
    end.forEach((s, i) => { if (s.bytes !== null && s.bytes === chain[at].targets[i] && !sameFact(s, commit.facts[i])) fail('maintenance_changed'); });
  }
  if (permission && barrier.bytes && actual.some(s => s.bytes === null)) fail('maintenance_phase');
  const normalized = structuredClone(facts.markers); normalized['broker/broker-owner.gate'] = nullInfo();
  if (r.settled !== true || Object.values(normalized).some(v => v.hash !== null) || canonical(normalized) !== canonical(r.markers)) fail('maintenance_unsettled');
  c.settled(c.snapshot(true));
  if (canonical(finishFacts(c, directory)) !== canonical(facts)) fail('maintenance_changed');
  return { c, id, directory, b, intent, intentView, chain, gateViews, facts, permission, barrier, archived, proofHash: hash({ version: 1, id, facts }) };
}
async function checkedFinish(c, id) {
  const first = readFinish(c, id); await gone(first.b.scope); await gone(first.intent.operator);
  for (const a of first.chain) await gone(a.actor);
  if (canonical(finishFacts(c, first.directory)) !== canonical(first.facts)) fail('maintenance_changed'); return first;
}
async function inspectMaintenanceFinish({ installation, descriptorPath, id }) {
  const f = await checkedFinish(context(installation, descriptorPath), id);
  return Object.freeze({ id, phase: f.barrier.bytes ? 'finish-pending' : f.gateViews.some(v => v.bytes !== null) ? 'finish-release-pending' : 'resumed', proofHash: f.proofHash, attempts: f.chain.length, inspectionOnly: true, aeAuthority: false });
}
async function finishMaintenance({ installation, descriptorPath, id, expectedProofHash, reservedServer }) {
  const address = reservedServer instanceof http.Server && reservedServer.listening && reservedServer.address();
  if (!address || address.address !== '127.0.0.1' || reservedServer.listenerCount('request')) fail('maintenance_endpoint');
  if (!HEX.test(expectedProofHash)) fail('maintenance_expected_proof');
  const c = context(installation, descriptorPath), f = await checkedFinish(c, id); if (f.proofHash !== expectedProofHash) fail('maintenance_proof_changed');
  const self = await observeOwnerProcess(process.pid);
  if (classifyOwnerProcess({ pid: process.pid, birthTicks: self.birthTicks }, self) !== 'alive' || !self.executablePath || path.resolve(self.executablePath).toLowerCase() !== path.resolve(installation.nodePath).toLowerCase()) fail('maintenance_process_unknown');
  let expected = f.facts;
  const check = () => { if (canonical(finishFacts(c, f.directory)) !== canonical(expected)) fail('maintenance_changed'); };
  check(); c.reverify(); check();
  if (!f.barrier.bytes && f.gateViews.every(v => v.bytes === null)) return { resumed: true, id, finished: true, runtimeStarted: false, aeAuthority: false };
  if (f.chain.length >= FINISH_LIMIT - (f.barrier.bytes ? 1 : 0)) fail('maintenance_budget');
  const attemptId = crypto.randomUUID(), actor = { bootId: crypto.randomUUID(), pid: process.pid, birthTicks: self.birthTicks }, parentHash = f.chain.at(-1)?.hash || null;
  const mode = f.barrier.bytes ? 'commit' : 'release', sources = f.gateViews.map(v => ({ bytes: v.bytes?.toString('base64') ?? null, ...c.info(v) }));
  const targets = mode === 'release' ? [null, null] : ['install', 'broker'].map(role => c.seal('maintenance-finish-gate', { id, resumeId: f.intent.resumeId, attemptId, parentHash, actor, role, nonce: crypto.randomUUID() }).toString('base64'));
  // Update only explicit own filesystem effects. A new foreign tree entry, body,
  // inode or mtime is never accepted as a fresh baseline after an await/write.
  function changed({ add = {}, remove = [], gates = {}, barrier, touched = [] } = {}) {
    const next = structuredClone(expected), actual = finishFacts(c, f.directory);
    for (const [name, view] of Object.entries(add)) next.phase.tree[name] = c.info(view);
    for (const name of remove) delete next.phase.tree[name];
    for (const [i, view] of Object.entries(gates)) next.gates[i] = c.info(view);
    if (barrier) next.phase.barrier = c.info(barrier);
    function refresh(wanted, got) { if (wanted.hash !== null && touched.some(s => inode(s, wanted.stat)) && wanted.hash === got.hash && stable(wanted.stat, got.stat)) return got; return wanted; }
    for (const name of Object.keys(next.phase.tree)) next.phase.tree[name] = refresh(next.phase.tree[name], actual.phase.tree[name] || nullInfo());
    next.phase.barrier = refresh(next.phase.barrier, actual.phase.barrier);
    next.gates = next.gates.map((g, i) => refresh(g, actual.gates[i]));
    next.markers['broker/broker-owner.gate'] = next.gates[1];
    if (canonical(next) !== canonical(actual)) fail('maintenance_changed'); expected = next;
  }
  function publish(name, bytes) { check(); const view = atomic(path.join(f.directory, name), bytes, attemptId); changed({ add: { [name]: view } }); return view; }
  const attemptView = publish('finish-' + attemptId + '.json', c.seal('maintenance-finish-attempt', { id, resumeId: f.intent.resumeId, attemptId, parentHash, intentHash: hash(f.intentView.bytes), actor, mode, sources, targets, snapshotHash: hash(expected.snapshot), priorPhase: expected.phase }));
  function takeover(i) {
    const file = gatePaths(c)[i], prefix = 'finish-' + attemptId + '-' + ['install', 'broker'][i], newName = prefix + '-new', oldName = prefix + '-old';
    const prepared = publish(newName, Buffer.from(targets[i], 'base64')), source = read(file); check();
    if (source.bytes) {
      let fd = fs.openSync(file, 'r');
      try { if (!same(source.stat, fs.fstatSync(fd, { bigint: true }))) fail('maintenance_changed'); fs.linkSync(file, path.join(f.directory, oldName)); }
      finally { fs.closeSync(fd); }
      const archive = read(path.join(f.directory, oldName)), now = read(file);
      if (!archive.bytes?.equals(source.bytes) || !now.bytes?.equals(source.bytes) || !same(archive.stat, now.stat) || !stable(source.stat, now.stat)) fail('maintenance_changed');
      changed({ add: { [oldName]: archive }, touched: [source.stat] }); check();
      fd = fs.openSync(prepared.file, 'r'); let held;
      try { if (!same(prepared.stat, fs.fstatSync(fd, { bigint: true }))) fail('maintenance_changed'); fs.renameSync(prepared.file, file); held = stamp(fs.fstatSync(fd, { bigint: true })); if (!['dev', 'ino', 'size', 'mtimeNs'].every(k => held[k] === prepared.stat[k]) || !same(held, fs.lstatSync(file, { bigint: true }))) fail('maintenance_changed'); }
      finally { fs.closeSync(fd); }
      const result = read(file); if (!result.bytes?.equals(prepared.bytes) || !stable(held, result.stat)) fail('maintenance_changed');
      changed({ remove: [newName], gates: { [i]: result }, touched: [source.stat] });
    } else {
      fs.linkSync(prepared.file, file); const result = read(file), alias = read(prepared.file);
      if (!result.bytes?.equals(prepared.bytes) || !same(result.stat, alias.stat) || !stable(prepared.stat, result.stat)) fail('maintenance_changed');
      changed({ gates: { [i]: result }, touched: [prepared.stat] }); check(); fs.unlinkSync(prepared.file);
      changed({ remove: [newName], touched: [prepared.stat] });
    }
  }
  if (mode === 'commit') { takeover(0); takeover(1); }
  check(); const api = require('./install-lease'), scope = { installRoot: installation.installRoot, stateDir: installation.stateDir, descriptorPath }, views = gatePaths(c).map(file => read(file));
  const capability = Object.freeze({}); permits.set(capability, { kind: 'finish', mode, scope, nonce: attemptId, recovery: true, gates: views.map((v, i) => v.bytes || Buffer.from(sources[i].bytes || f.intent.gates[i], 'base64')), facts: views.map((v, i) => ({ file: v.file, hash: v.bytes ? hash(v.bytes) : hash(Buffer.from(sources[i].bytes || f.intent.gates[i], 'base64')), stat: v.stat })) });
  let lease;
  try {
    lease = api.acquireMaintenanceFinishLease(capability); c.reverify(); check(); c.settled(c.snapshot(true));
    if (mode === 'commit') {
      if (!f.permission) publish('finish-commit.json', c.seal('maintenance-finish-commit', { id, resumeId: f.intent.resumeId, intentHash: hash(f.intentView.bytes), attemptHash: hash(attemptView.bytes), facts: api.maintenanceLeaseFacts(lease), snapshotHash: hash(expected.snapshot) }));
      check(); api.assertInstallLease(lease, scope);
      const original = read(c.p.barrier), target = path.join(f.directory, 'stop-barrier');
      if (!read(target).bytes) { fs.linkSync(c.p.barrier, target); const archive = read(target), source = read(c.p.barrier); if (!source.bytes?.equals(original.bytes) || !archive.bytes?.equals(original.bytes) || !same(source.stat, archive.stat) || !stable(original.stat, source.stat)) fail('maintenance_changed'); changed({ add: { 'stop-barrier': archive }, touched: [original.stat] }); }
      check(); fs.unlinkSync(c.p.barrier); changed({ barrier: read(c.p.barrier), touched: [original.stat] });
    }
    check(); api.assertInstallLease(lease, scope);
    if (mode === 'commit') {
      const releaseId = crypto.randomUUID(), releaseSources = gatePaths(c).map(file => { const v = read(file); return { bytes: v.bytes.toString('base64'), ...c.info(v) }; });
      // The deletion prefix is separately sealed before the first unlink. The
      // original commit attempt never ambiguously means both takeover/release.
      publish('finish-' + releaseId + '.json', c.seal('maintenance-finish-attempt', { id, resumeId: f.intent.resumeId, attemptId: releaseId, parentHash: hash(attemptView.bytes), intentHash: hash(f.intentView.bytes), actor, mode: 'release', sources: releaseSources, targets: [null, null], snapshotHash: hash(expected.snapshot), priorPhase: expected.phase }));
    }
    const touched = views.filter(v => v.bytes).map(v => v.stat);
    api.releaseInstallLease(lease); lease = null; changed({ gates: { 0: read(gatePaths(c)[0]), 1: read(gatePaths(c)[1]) }, touched });
    return { resumed: true, id, finished: true, sameDescriptor: true, runtimeStarted: false, aeAuthority: false };
  } catch (e) { if (lease) api.retainInstallLease(lease); throw e; }
  finally { permits.delete(capability); }
}
function stoppedCertificationContext(capability) {
  const p = require('./stopped-certification').stoppedContextPermit(capability);
  return { ...context(p.installation, p.descriptorPath), read, atomic, plain, same };
}
module.exports = { PRIVATE_METHODS, stopProtected, receiptProtected, createStopAuthorization, createOwnerMaintenance, inspectMaintenance, resumeMaintenance, maintenanceLeasePermit, inspectMaintenanceFinish, finishMaintenance, stoppedCertificationContext };

'use strict';
// Single private B3 finisher. Only a verified embedding may connect it to startup
// or the operator helper; no MCP/AE authority is issued by filesystem records.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const { canonical, hash, fail } = require('../protocol/json');
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/, HEX = /^[a-f0-9]{64}$/;
const FIELDS = ['dev', 'ino', 'size', 'birthtimeNs', 'mtimeNs', 'ctimeNs'];
const equal = (a, b) => canonical(a) === canonical(b);
const operations = new WeakMap(), contexts = new WeakMap();
function startOverFinisherRequest(capability) { const value = contexts.get(capability); if (!value) fail('start_over_finish_brand'); return value; }
function exact(v, keys) { if (!v || Object.getPrototypeOf(v) !== Object.prototype || !equal(Object.keys(v).sort(), [...keys].sort())) fail('start_over_finish_schema'); }
function actor(s) { exact(s, ['bootId', 'pid', 'birthTicks']); if (!UUID.test(s.bootId) || !Number.isSafeInteger(s.pid) || s.pid < 1 || s.pid > 0xffffffff || typeof s.birthTicks !== 'string' || !/^[1-9][0-9]{0,18}$/.test(s.birthTicks) || BigInt(s.birthTicks) > 3155378975999999999n) fail('start_over_finish_actor'); }
function fact(v) {
  exact(v, ['hash', 'stat']); if (!HEX.test(v.hash)) fail('start_over_finish_fact'); exact(v.stat, FIELDS);
  if (Object.values(v.stat).some(s => typeof s !== 'string' || !/^(0|[1-9][0-9]*)$/.test(s))) fail('start_over_finish_fact');
}
function same(v, saved, ignored = []) { return v.hash === saved.hash && FIELDS.filter(k => !ignored.includes(k)).every(k => v.stat?.[k] === saved.stat?.[k]); }
function leaseGate(c, a, value) {
  const b = c.decode(value, 'start-over-install-lease', ['id', 'intentHash', 'attemptId', 'operator']); actor(b.operator);
  if (b.id !== a.body.id || b.intentHash !== a.barrier.hash || !UUID.test(b.attemptId)) fail('start_over_finish_lease'); return b;
}
function inspectStartOverLeases(c, a) {
  const names = fs.readdirSync(a.dir), records = [];
  for (const name of names) {
    const match = name.match(/^attempt-([a-f0-9-]{36})\.json$/); if (!match) continue; if (!UUID.test(match[1])) fail('start_over_finish_phase');
    const v = c.read(path.join(a.dir, name)), b = c.decode(v, 'start-over-lease-attempt', ['id', 'intentHash', 'attemptId', 'parentHash', 'operator', 'candidate', 'prior']);
    actor(b.operator); fact(b.candidate); exact(b.prior, ['hash', 'stat', 'bytes']);
    if (b.id !== a.body.id || b.intentHash !== a.barrier.hash || b.attemptId !== match[1] || b.parentHash !== null && !HEX.test(b.parentHash)) fail('start_over_finish_attempt');
    if (b.prior.hash === null) { if (b.prior.stat !== null || b.prior.bytes !== null) fail('start_over_finish_attempt'); }
    else { fact({ hash: b.prior.hash, stat: b.prior.stat }); if (typeof b.prior.bytes !== 'string' || b.prior.bytes.length > 32768) fail('start_over_finish_attempt'); const bytes = Buffer.from(b.prior.bytes, 'base64'); if (bytes.toString('base64') !== b.prior.bytes || hash(bytes) !== b.prior.hash) fail('start_over_finish_attempt'); }
    const candidate = c.read(path.join(a.dir, 'lease-' + b.attemptId)), body = leaseGate(c, a, candidate);
    // The permanent candidate alias pins FileID/content. OUR canonical rename
    // can inherit the vacated destination's Windows creation time; it cannot
    // change dev/ino/size/mtime or signed bytes. This is not process birth.
    if (body.attemptId !== b.attemptId || !equal(body.operator, b.operator) || !same(candidate, b.candidate, ['ctimeNs', 'birthtimeNs'])) fail('start_over_finish_candidate');
    if (b.prior.hash !== null && !same(c.read(path.join(a.dir, 'prior-gate-' + b.attemptId)), b.prior, ['ctimeNs'])) fail('start_over_finish_prior');
    records.push({ view: v, body: b, candidate });
  }
  if (records.length > 12) fail('start_over_finish_attempt_budget');
  const byHash = new Map(records.map(r => [r.view.hash, r])), children = new Map(), ordered = [];
  for (const r of records) { const parent = r.body.parentHash; if (parent !== null && !byHash.has(parent) || children.has(parent)) fail('start_over_finish_fork'); children.set(parent, r); }
  for (let r = children.get(null); r; r = children.get(r.view.hash)) { if (ordered.includes(r)) fail('start_over_finish_fork'); ordered.push(r); }
  if (ordered.length !== records.length) fail('start_over_finish_fork');
  const gate = c.read(path.join(c.d.installRoot, 'install.lock')); let current = null;
  if (gate.bytes) {
    let kind; try { kind = JSON.parse(gate.bytes).body?.kind; } catch { /* caller validates any non-reset gate as the original shutdown gate */ }
    if (kind === 'start-over-install-lease') {
      const b = leaseGate(c, a, gate); current = records.find(r => r.body.attemptId === b.attemptId);
      if (!current || !same(gate, current.candidate)) fail('start_over_finish_candidate');
    }
  }
  // Every visible alias of a published candidate is local to this transaction
  // plus the canonical gate. Unknown extra hardlinks never become ownership.
  for (const r of records) {
    let count = 0n; const s = fs.lstatSync(r.candidate.file, { bigint: true });
    for (const name of names) { const p = path.join(a.dir, name), v = fs.lstatSync(p, { bigint: true }); if (v.isFile() && v.dev === s.dev && v.ino === s.ino) count++; }
    if (gate.stat && gate.stat.dev === String(s.dev) && gate.stat.ino === String(s.ino)) count++;
    if (s.nlink !== count) fail('start_over_finish_candidate_alias');
  }
  return { records: ordered, head: ordered.at(-1) || null, actors: ordered.map(r => r.body.operator), gate, current };
}
function startOverArchiveRequest(capability) { const value = operations.get(capability); if (!value || !value.lease) fail('start_over_finish_brand'); value.assert(); return value; }
function checkHeld(c, gate) {
  const held = fs.fstatSync(gate.fd, { bigint: true }), named = c.read(gate.file), alias = c.read(gate.alias);
  if (!named.bytes?.equals(gate.bytes) || !alias.bytes?.equals(gate.bytes) || !same(named, alias) || FIELDS.some(k => String(held[k]) !== named.stat[k]) || named.stat.dev !== gate.dev || named.stat.ino !== gate.ino) fail('start_over_finish_lease_changed');
  const bytes = Buffer.alloc(gate.bytes.length + 1); let at = 0, n;
  while (at < bytes.length && (n = fs.readSync(gate.fd, bytes, at, bytes.length - at, at))) at += n;
  if (at !== gate.bytes.length || !bytes.subarray(0, at).equals(gate.bytes) || FIELDS.some(k => String(fs.fstatSync(gate.fd, { bigint: true })[k]) !== named.stat[k])) fail('start_over_finish_lease_changed'); return named;
}
function claimLease(o) {
  const { c, a, operator } = o, before = inspectStartOverLeases(c, a); if (before.records.length >= 12) fail('start_over_finish_attempt_budget');
  o.assertEndpoints(); const attemptId = crypto.randomUUID(), candidateName = 'lease-' + attemptId, candidate = c.atomic(path.join(a.dir, candidateName), c.seal('start-over-install-lease', { id: a.body.id, intentHash: a.barrier.hash, attemptId, operator }));
  const file = path.join(c.d.installRoot, 'install.lock'), prior = c.read(file); if (!equal(c.info(prior), c.info(before.gate))) fail('start_over_finish_lease_changed');
  let priorFact = { hash: null, stat: null, bytes: null };
  if (prior.bytes !== null) {
    const fd = fs.openSync(file, 'r');
    try { if (FIELDS.some(k => String(fs.fstatSync(fd, { bigint: true })[k]) !== prior.stat[k])) fail('start_over_finish_lease_changed'); fs.linkSync(file, path.join(a.dir, 'prior-gate-' + attemptId)); }
    finally { fs.closeSync(fd); }
    const linked = c.read(file), alias = c.read(path.join(a.dir, 'prior-gate-' + attemptId));
    if (!same(linked, alias) || !same(linked, prior, ['ctimeNs'])) fail('start_over_finish_lease_changed'); priorFact = { ...c.info(linked), bytes: linked.bytes.toString('base64') };
  }
  c.atomic(path.join(a.dir, 'attempt-' + attemptId + '.json'), c.seal('start-over-lease-attempt', { id: a.body.id, intentHash: a.barrier.hash, attemptId, parentHash: before.head?.view.hash ?? null, operator, candidate: c.info(candidate), prior: priorFact }));
  o.assertEndpoints();
  const candidateFd = fs.openSync(candidate.file, 'r'); let actual, alias;
  try {
    const pinned = fs.fstatSync(candidateFd, { bigint: true }); if (FIELDS.some(k => String(pinned[k]) !== c.read(candidate.file).stat[k])) fail('start_over_finish_lease_changed');
    if (priorFact.hash === null) {
      if (c.read(file).bytes !== null) fail('start_over_finish_lease_changed'); fs.linkSync(candidate.file, file);
    } else {
      const pending = path.join(a.dir, 'claim-' + attemptId); fs.linkSync(candidate.file, pending);
      if (!same(c.read(file), priorFact) || !same(c.read(pending), c.read(candidate.file))) fail('start_over_finish_lease_changed'); fs.renameSync(pending, file);
    }
    actual = c.read(file); alias = c.read(candidate.file); const held = fs.fstatSync(candidateFd, { bigint: true });
    if (!same(actual, alias) || !same(actual, candidate, ['ctimeNs', 'birthtimeNs']) || ['dev', 'ino', 'size', 'mtimeNs'].some(k => String(held[k]) !== String(pinned[k])) || FIELDS.some(k => String(held[k]) !== actual.stat[k])) fail('start_over_finish_lease_changed');
  } finally { fs.closeSync(candidateFd); }
  const fd = fs.openSync(file, 'r'), gate = { file, alias: candidate.file, fd, bytes: actual.bytes, dev: actual.stat.dev, ino: actual.stat.ino, attemptId };
  try { checkHeld(c, gate); } catch (e) { fs.closeSync(fd); throw e; }
  o.lease = gate; return gate;
}
async function finishStartOver(options) {
  exact(options, ['installation', 'descriptorPath', 'id', 'expectedIntentHash']);
  const initialCapability = Object.freeze({}); contexts.set(initialCapability, options); let initial;
  try { initial = require('./start-over-state').startOverFinisherContext(initialCapability); } finally { contexts.delete(initialCapability); }
  const active = initial.active();
  if (!active || active.body.id !== options.id) {
    const a = initial.archivedIntent(options.id); if (a.barrier.hash !== options.expectedIntentHash) fail('start_over_intent_changed');
    const archive = require('./start-over-archive').readHistoricalArchive(initial, a);
    // Historical receipt never inspects/claims current stores, session, lease
    // or AE authority. An alias of OUR old mutex still canonical is incomplete.
    let named; try { named = fs.lstatSync(path.join(initial.d.installRoot, 'install.lock'), { bigint: true }); } catch (e) { if (e.code !== 'ENOENT') throw e; }
    if (named?.isFile() && !named.isSymbolicLink()) for (const name of fs.readdirSync(a.dir).filter(n => /^lease-[a-f0-9-]{36}$/.test(n))) {
      const candidate = fs.lstatSync(path.join(a.dir, name), { bigint: true }); if (candidate.dev === named.dev && candidate.ino === named.ino) fail('start_over_enable_incomplete');
    }
    return Object.freeze({ id: a.body.id, sessionId: a.body.newSessionId, resetComplete: true, historical: true, currentRuntimeObserved: false, historyPreserved: true, commandsReplayed: 0, aeAuthority: false, archiveManifestHash: archive.manifest.view.hash });
  }
  const barrierApi = require('./start-over-barrier'), barrier = await barrierApi.acquireStartOverBarrier(options);
  const capability = Object.freeze({}); let o, intentFd;
  try {
    const v = barrierApi.assertStartOverBarrier(barrier), { c, a } = v;
    intentFd = fs.openSync(a.barrier.file, 'r');
    if (FIELDS.some(k => String(fs.fstatSync(intentFd, { bigint: true })[k]) !== a.barrier.stat[k])) fail('start_over_intent_identity');
    const self = await require('./windows-owner-process').observeOwnerProcess(process.pid);
    if (self.status !== 'present' || self.pid !== process.pid || !self.executablePath || path.resolve(self.executablePath).toLowerCase() !== path.resolve(c.d.nodePath).toLowerCase()) fail('start_over_finish_actor');
    barrierApi.assertStartOverBarrier(barrier);
    const operator = { bootId: crypto.randomUUID(), pid: process.pid, birthTicks: self.birthTicks }; actor(operator);
    const archiveApi = require('./start-over-archive'), sessionKey = 'state/production/work-session.json';
    function endpoints() {
      barrierApi.assertStartOverEndpoints(barrier); const actual = c.read(a.barrier.file);
      if (actual.hash !== a.barrier.hash || FIELDS.some(k => String(fs.fstatSync(intentFd, { bigint: true })[k]) !== actual.stat[k])) fail('start_over_intent_identity');
    }
    function immutable() {
      const current = c.protectedFacts(), wanted = a.body.protected;
      for (const key of Object.keys(wanted)) if (key !== sessionKey && !equal(current[key], wanted[key])) fail('start_over_changed');
      const archived = archiveApi.readArchive(c, a);
      if (!archived) { if (!equal(current[sessionKey], wanted[sessionKey])) fail('start_over_changed'); }
      else {
        const r = archived.p.body.roles.find(r => r.role === 'session'), original = r.original.type === 'absent' ? { hash: null, stat: null } : { hash: r.original.hash, stat: r.original.stat };
        if (!equal(original, wanted[sessionKey])) fail('start_over_changed');
      }
    }
    o = { c, a, operator, lease: null, assertEndpoints: endpoints,
      assert() { endpoints(); immutable(); if (this.lease) { checkHeld(c, this.lease); const state = inspectStartOverLeases(c, a); if (!state.current || !equal(state.current.body.operator, operator) || state.current.body.attemptId !== this.lease.attemptId) fail('start_over_finish_lease_changed'); } },
      publish(name, bytes) {
        if (!/^(?:archive-plan|archive-completed|archive-0[0-7]-(?:intent|done)|session-candidate|session-publish-intent|session-published|reset-completed|enable-intent)\.json$/.test(name)) fail('start_over_finish_publication');
        this.assert(); const result = c.atomic(path.join(a.dir, name), bytes); this.assert(); return result;
      },
      renamed(index) { if (!Number.isSafeInteger(index) || index < 0 || index > 7) fail('start_over_archive_role'); this.assert(); }
    };
    operations.set(capability, o); claimLease(o); o.assert();
    let final = archiveApi.executeArchive(capability), manifest = final.manifest;
    if (!manifest) {
      o.publish('archive-completed.json', c.seal('start-over-archive-completed', { id: a.body.id, intentHash: a.barrier.hash, planHash: final.p.view.hash, history: final.p.body.history, rolesDigest: hash(final.roles.map(r => r.archive)) }));
      final = archiveApi.readArchive(c, a); manifest = final.manifest;
    }
    let candidate = c.read(path.join(a.dir, 'session-candidate.json'));
    if (!candidate.bytes) candidate = o.publish('session-candidate.json', c.seal('work-session', { resetId: a.body.id, sessionId: a.body.newSessionId, intentHash: a.barrier.hash, baselineRequired: true }));
    final = archiveApi.readArchive(c, a);
    if (!final.publication.intent) o.publish('session-publish-intent.json', c.seal('start-over-session-publish-intent', { id: a.body.id, intentHash: a.barrier.hash, archiveManifestHash: manifest.view.hash, candidate: c.info(candidate) }));
    o.assert(); final = archiveApi.readArchive(c, a);
    const sessionPath = path.join(c.d.stateDir, 'work-session.json');
    if (!final.publication.replacement) { if (c.read(sessionPath).bytes !== null) fail('start_over_session_alias'); fs.linkSync(candidate.file, sessionPath); o.assert(); }
    final = archiveApi.readArchive(c, a);
    if (!final.publication.receipt) {
      const publishIntent = c.read(path.join(a.dir, 'session-publish-intent.json'));
      o.publish('session-published.json', c.seal('start-over-session-published', { id: a.body.id, intentHash: a.barrier.hash, publishIntentHash: publishIntent.hash, session: c.info(c.read(sessionPath)) }));
    }
    final = archiveApi.readArchive(c, a);
    let completed = c.record(a, 'reset-completed.json', 'start-over-completed', ['archiveManifestHash', 'sessionHash', 'baselineRequired']);
    if (!completed) {
      o.publish('reset-completed.json', c.seal('start-over-completed', { id: a.body.id, intentHash: a.barrier.hash, archiveManifestHash: manifest.view.hash, sessionHash: final.publication.replacement.hash, baselineRequired: true }));
      completed = c.record(a, 'reset-completed.json', 'start-over-completed', ['archiveManifestHash', 'sessionHash', 'baselineRequired']);
    }
    if (completed.archiveManifestHash !== manifest.view.hash || completed.sessionHash !== final.publication.replacement.hash || completed.baselineRequired !== true) fail('start_over_finish_completion');
    let enable = c.record(a, 'enable-intent.json', 'start-over-enable-intent', ['completedHash']);
    const completedView = c.read(path.join(a.dir, 'reset-completed.json'));
    if (!enable) { o.publish('enable-intent.json', c.seal('start-over-enable-intent', { id: a.body.id, intentHash: a.barrier.hash, completedHash: completedView.hash })); enable = c.record(a, 'enable-intent.json', 'start-over-enable-intent', ['completedHash']); }
    if (enable.completedHash !== completedView.hash) fail('start_over_finish_completion');
    o.assert(); const lease = o.lease; checkHeld(c, lease);
    // Admission intent outlives the owned mutex. Both endpoints remain held
    // across these final synchronous removals, including the crash prefix.
    fs.unlinkSync(lease.file); fs.closeSync(lease.fd); lease.fd = null; o.lease = null;
    endpoints(); if (c.read(lease.file).bytes !== null) fail('start_over_finish_lease_changed');
    const current = c.active(); if (!current || !equal(c.info(current.barrier), c.info(a.barrier))) fail('start_over_intent_identity');
    fs.unlinkSync(a.barrier.file);
    return Object.freeze({ id: a.body.id, sessionId: a.body.newSessionId, resetComplete: true, baselineRequired: true, historyPreserved: true, commandsReplayed: 0, aeAuthority: false });
  } finally {
    if (o?.lease?.fd !== undefined && o?.lease?.fd !== null) { try { fs.closeSync(o.lease.fd); } catch {} }
    if (intentFd !== undefined) fs.closeSync(intentFd); operations.delete(capability); await barrierApi.releaseStartOverBarrier(barrier);
  }
}
module.exports = { inspectStartOverLeases, startOverArchiveRequest, startOverFinisherRequest, finishStartOver };

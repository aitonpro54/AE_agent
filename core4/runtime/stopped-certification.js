'use strict';
// Installer-private stopped proof. No RPC, execution owner, credential rotation,
// process termination or barrier removal. Durable records identify THIS actor.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), http = require('node:http');
const { canonical, hash, fail } = require('../protocol/json');
const { observeOwnerProcess, classifyOwnerProcess } = require('./windows-owner-process');
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/, HEX = /^[a-f0-9]{64}$/;
const contexts = new WeakMap(), certificates = new WeakMap();
const ATTEMPT_LIMIT = 16;
const NIL = () => ({ hash: null, stat: null });
function stoppedContextPermit(capability) { const p = contexts.get(capability); if (!p) fail('stopped_certification_brand'); return p; }
function stoppedLifecyclePermit(capability) { const p = stoppedContextPermit(capability); if (!p.originalScope || (p.inspectionOnly ? p.actor !== null : !p.actor) || typeof p.check !== 'function') fail('stopped_certification_brand'); return p; }
function endpoint(server) {
  const a = server instanceof http.Server && server.listening && server.address();
  if (!a || a.address !== '127.0.0.1' || !Number.isInteger(a.port) || a.port < 1 || server.listenerCount('request')) fail('stopped_certification_endpoint');
}
const equal = (a, b) => canonical(a) === canonical(b);
const short = s => ({ bootId: s.bootId, pid: s.pid, birthTicks: s.birthTicks });
const sameMoved = (a, b) => a && b && ['dev', 'ino', 'size', 'mtimeNs'].every(k => a[k] === b[k]);
async function dead(s) {
  const o = await observeOwnerProcess(s.pid);
  if (!['absent', 'pid-reused'].includes(classifyOwnerProcess({ pid: s.pid, birthTicks: s.birthTicks }, o))) fail('stopped_certification_process_not_dead');
}
function tree(c, directory) {
  c.plain(directory, false, true); const stat = fs.lstatSync(directory, { bigint: true }), names = fs.readdirSync(directory).sort();
  if (names.length > 64) fail('stopped_certification_budget');
  const allowed = ['stopped.json', 'stopped-certification-intent.json', 'stopped-certificate.json', 'retired-install-gate'];
  const entries = {};
  for (const name of names) {
    const base = name.replace(/\.stage-[a-f0-9-]{36}$/, '');
    if ((!allowed.includes(base) && !/^certify-[a-f0-9-]{36}\.json$/.test(base)) || (base.startsWith('certify-') && !UUID.test(base.slice(8, 44))) || (base !== name && (base === 'retired-install-gate' || !UUID.test(name.slice(base.length + 7))))) fail('stopped_certification_phase');
    const v = c.read(path.join(directory, name), 128 * 1024); if (!v.bytes) fail('stopped_certification_changed'); entries[name] = c.info(v);
  }
  return { directory: { dev: String(stat.dev), ino: String(stat.ino), birthtimeNs: String(stat.birthtimeNs) }, tree: entries };
}
function readBase(c, id, owned = new Map()) {
  if (!UUID.test(id)) fail('stopped_certification_id');
  const barrier = c.read(c.p.barrier), b = c.decode(barrier, 'maintenance-stop', ['id', 'scope', 'protected', 'authorizationHash', 'nonce']); c.scope(b.scope);
  if (b.id !== id || !HEX.test(b.authorizationHash) || !UUID.test(b.nonce)) fail('stopped_certification_record');
  const directory = c.dir(id), phase = tree(c, directory), snap = c.snapshot(true);
  const protectedFacts = Object.fromEntries(['descriptor', 'origin', 'anchor', 'client'].map(k => [k, snap.facts[k]]));
  if (!equal(b.protected, protectedFacts)) fail('stopped_certification_changed'); c.settled(snap);
  const receipt = c.read(path.join(directory, 'stopped.json'), 128 * 1024);
  if (receipt.bytes) {
    const r = c.decode(receipt, 'maintenance-stopped', ['id', 'stopHash', 'scope', 'protected', 'markers', 'settled']);
    if (r.id !== id || r.stopHash !== hash(barrier.bytes) || !equal(r.scope, b.scope) || !equal(r.protected, snap.facts) || r.settled !== true || !equal(Object.keys(r.markers || {}).sort(), Object.keys(c.markers()).sort()) || Object.values(r.markers).some(v => !equal(v, NIL()))) fail('stopped_certification_receipt');
    // This optional old-owner receipt is evidence only. The new certificate
    // never claims to have been produced by the stopped owner.
  }
  const intentView = c.read(path.join(directory, 'stopped-certification-intent.json'), 128 * 1024), certView = c.read(path.join(directory, 'stopped-certificate.json'), 128 * 1024);
  let intent, certificate; const attempts = [], byHash = new Map(), children = new Map();
  if (intentView.bytes) {
    intent = c.decode(intentView, 'maintenance-stopped-certification-intent', ['id', 'stopHash', 'originalScope', 'certifier', 'snapshot', 'lifecycle', 'priorPhase']); c.scope(intent.certifier);
    if (intent.id !== id || intent.stopHash !== hash(barrier.bytes) || !equal(intent.originalScope, b.scope) || !equal(intent.snapshot, snap.facts) || !intent.lifecycle || !intent.lifecycle.markers || !intent.lifecycle.transactions || !equal(intent.priorPhase.directory, phase.directory)) fail('stopped_certification_record');
    for (const [n, f] of Object.entries(intent.priorPhase.tree)) if (!equal(phase.tree[n], f) || !['stopped.json'].includes(n) && !/\.stage-[a-f0-9-]{36}$/.test(n)) fail('stopped_certification_changed');
    for (const n of Object.keys(phase.tree)) if (!Object.hasOwn(intent.priorPhase.tree, n) && !['stopped-certification-intent.json', 'stopped-certificate.json', 'retired-install-gate'].includes(n)) {
      const base = n.replace(/\.stage-[a-f0-9-]{36}$/, '');
      // A crash after exclusive publication can retain the stage hardlink.
      // Only an exact live alias is a known prefix; it is never replay input.
      const attempt = /^certify-[a-f0-9-]{36}\.json$/.test(base);
      if (attempt && n === base) continue;
      if ((!['stopped-certification-intent.json', 'stopped-certificate.json'].includes(base) && !attempt) || base === n || !phase.tree[base] || !equal(phase.tree[n], phase.tree[base])) fail('stopped_certification_phase');
    }
  } else if (certView.bytes || phase.tree['retired-install-gate'] || Object.keys(phase.tree).some(n => n.startsWith('certify-'))) fail('stopped_certification_phase');
  for (const name of Object.keys(phase.tree).filter(n => /^certify-[a-f0-9-]{36}\.json$/.test(n))) {
    const v = c.read(path.join(directory, name), 128 * 1024), a = c.decode(v, 'maintenance-stopped-certification-attempt', ['id', 'attemptId', 'parentHash', 'intentHash', 'certifier', 'priorLifecycle', 'priorPhase']); c.scope(a.certifier);
    if (!intent || a.id !== id || !UUID.test(a.attemptId) || name !== 'certify-' + a.attemptId + '.json' || a.parentHash !== null && !HEX.test(a.parentHash) || a.intentHash !== hash(intentView.bytes) || !equal(a.priorPhase.directory, phase.directory) || Object.hasOwn(a.priorPhase.tree, name)) fail('stopped_certification_record');
    for (const [n, f] of Object.entries(a.priorPhase.tree)) if (!equal(phase.tree[n], f)) fail('stopped_certification_changed');
    const digest = hash(v.bytes); if (byHash.has(digest) || children.has(a.parentHash)) fail('stopped_certification_phase'); byHash.set(digest, { ...a, digest }); children.set(a.parentHash, digest);
  }
  if (byHash.size >= ATTEMPT_LIMIT) fail('stopped_certification_budget');
  for (let next = children.get(null); next; next = children.get(next)) {
    if (attempts.length >= byHash.size || !byHash.has(next)) fail('stopped_certification_phase'); const a = byHash.get(next);
    for (const previous of attempts) if (!Object.hasOwn(a.priorPhase.tree, 'certify-' + previous.attemptId + '.json')) fail('stopped_certification_phase');
    attempts.push(a);
  }
  if (attempts.length !== byHash.size) fail('stopped_certification_phase');
  const retired = c.read(path.join(directory, 'retired-install-gate'));
  if (retired.bytes) {
    const saved = intent?.lifecycle.markers.gate;
    const gate = c.read(path.join(c.d.installRoot, 'install.lock'));
    if (!saved || saved.hash !== hash(retired.bytes) || !sameMoved(saved.stat, retired.stat) || gate.bytes && !gate.bytes.equals(owned.get(gate.file) || Buffer.alloc(0))) fail('stopped_certification_changed');
  }
  if (certView.bytes) {
    certificate = c.decode(certView, 'maintenance-stopped-certificate', ['id', 'stopHash', 'intentHash', 'attemptHash', 'originalScope', 'certifier', 'snapshot', 'lifecycle']); c.scope(certificate.certifier);
    if (certificate.id !== id || certificate.stopHash !== hash(barrier.bytes) || certificate.intentHash !== hash(intentView.bytes) || certificate.attemptHash !== (attempts.at(-1)?.digest || null) || !equal(certificate.originalScope, b.scope) || !equal(certificate.certifier, attempts.at(-1)?.certifier || intent.certifier) || !equal(certificate.snapshot, snap.facts)) fail('stopped_certification_record');
  }
  return { b, barrier, directory, phase, snap, intent, intentView, attempts, certificate, certView, retired };
}
function baseFacts(c, b) { return { stop: c.info(b.barrier), snapshot: b.snap.facts, phase: b.phase, markers: c.markers(), installGate: c.info(c.read(path.join(c.d.installRoot, 'install.lock'))) }; }
function lifecycleRequest(p, b, actor, check) {
  return { ...p, id: b.b.id, directory: b.directory, originalScope: b.b.scope, actor, inspectionOnly: actor === null, check,
    references: Object.entries(b.intent?.lifecycle.transactions || {}).map(([id, v]) => ({ id, kind: v.kind })) };
}
function continuation(initial, current, retired) {
  if (!initial?.markers || !initial.transactions) fail('stopped_certification_record');
  const archived = Object.values(current.transactions).flatMap(v => Object.values(v.tree));
  for (const [name, saved] of Object.entries(initial.markers)) {
    const now = current.markers[name]; if (!now) fail('stopped_certification_changed');
    if (equal(saved, now)) continue;
    const replacement = name === 'owner' && initial.markers.ownerNext;
    if (replacement?.hash && replacement.hash === now.hash && sameMoved(replacement.stat, now.stat) && archived.some(a => a.hash === saved.hash && sameMoved(a.stat, saved.stat))) continue;
    if (now.hash === null && saved.hash !== null && (name === 'gate' ? retired?.bytes && hash(retired.bytes) === saved.hash && sameMoved(retired.stat, saved.stat) : archived.some(a => a.hash === saved.hash && sameMoved(a.stat, saved.stat)))) continue;
    fail('stopped_certification_changed');
  }
  for (const [id, saved] of Object.entries(initial.transactions)) {
    const now = current.transactions[id];
    if (!now || saved.kind !== now.kind || !equal(saved.directory, now.directory)) fail('stopped_certification_changed');
    for (const [name, fact] of Object.entries(saved.tree)) if (!equal(fact, now.tree[name])) fail('stopped_certification_changed');
  }
}
function assertLifecycleTransactions(c, lifecycle) {
  for (const [transactionId, saved] of Object.entries(lifecycle.transactions)) {
    if (!UUID.test(transactionId)) fail('stopped_certification_record');
    const directory = path.join(c.d.installRoot, 'transactions', transactionId + '-owner-lifecycle'); c.plain(directory, false, true);
    const s = fs.lstatSync(directory, { bigint: true }), names = fs.readdirSync(directory).sort();
    if (!equal({ dev: String(s.dev), ino: String(s.ino), birthtimeNs: String(s.birthtimeNs) }, saved.directory) || !equal(names, Object.keys(saved.tree).sort())) fail('stopped_certification_changed');
    for (const name of names) if (!equal(c.info(c.read(path.join(directory, name), 128 * 1024)), { hash: saved.tree[name].hash, stat: saved.tree[name].stat })) fail('stopped_certification_changed');
  }
}
function assertRetiredNow(c, lifecycle) {
  assertLifecycleTransactions(c, lifecycle);
  if (Object.values(c.markers()).some(v => v.hash !== null) || c.read(path.join(c.d.installRoot, 'install.lock')).bytes !== null) fail('stopped_certification_changed');
}
async function inspected(options) {
  endpoint(options.reservedServer);
  const capability = Object.freeze({}), p = { installation: options.installation, descriptorPath: options.descriptorPath, reservedServer: options.reservedServer };
  contexts.set(capability, p);
  try {
    const c = require('./owner-maintenance').stoppedCertificationContext(capability); c.reverify();
    const b = readBase(c, options.id), base = baseFacts(c, b);
    const check = () => { endpoint(options.reservedServer); c.reverify(); if (!equal(baseFacts(c, readBase(c, options.id)), base)) fail('stopped_certification_changed'); };
    // Inspection has no producer actor at all. Only action can observe and bind
    // a real new certifier incarnation into its durable intent.
    contexts.set(capability, lifecycleRequest(p, b, null, check));
    const lifecycle = await require('./owner-lifecycle').inspectStoppedLifecycle(capability); check();
    if (b.intent) continuation(b.intent.lifecycle, lifecycle, b.retired);
    for (const [i, a] of b.attempts.entries()) continuation(a.priorLifecycle, b.attempts[i + 1]?.priorLifecycle || lifecycle, b.retired);
    await dead(b.b.scope); check();
    if (b.intent && !b.certificate) { await dead(b.intent.certifier); check(); for (const a of b.attempts) { await dead(a.certifier); check(); } }
    const again = await require('./owner-lifecycle').inspectStoppedLifecycle(capability); check();
    if (!equal(again, lifecycle)) fail('stopped_certification_changed');
    if (b.certificate && (!equal(b.certificate.lifecycle, lifecycle) || Object.values(lifecycle.markers).some(v => v.hash !== null))) fail('stopped_certification_changed');
    const proof = { id: b.b.id, ...base, lifecycle }, proofHash = hash(proof);
    return { c, b, base, lifecycle, proof, proofHash };
  } finally { contexts.delete(capability); }
}
async function inspectStoppedCertification(options) {
  const r = await inspected(options);
  return Object.freeze({ id: r.b.b.id, phase: r.b.certificate ? 'stopped-certified' : r.b.intent ? 'certification-pending' : 'stopped-certifiable', proofHash: r.proofHash, inspectionOnly: true, runtimeStarted: false, aeAuthority: false });
}
async function certifyStoppedInstallation(options) {
  if (!HEX.test(options.expectedProofHash)) fail('stopped_certification_expected_proof');
  const first = await inspected(options); if (first.proofHash !== options.expectedProofHash) fail('stopped_certification_proof_changed');
  const self = await observeOwnerProcess(process.pid);
  if (classifyOwnerProcess({ pid: process.pid, birthTicks: self.birthTicks }, self) !== 'alive' || !self.executablePath || path.resolve(self.executablePath).toLowerCase() !== path.resolve(options.installation.nodePath).toLowerCase()) fail('stopped_certification_process_unknown');
  const { c } = first; let b = readBase(c, options.id);
  if (!equal(baseFacts(c, b), first.base)) fail('stopped_certification_changed');
  const capability = Object.freeze({}), p = { installation: options.installation, descriptorPath: options.descriptorPath, reservedServer: options.reservedServer };
  let expectedPhase = b.phase;
  function check() {
    endpoint(options.reservedServer); c.reverify(); const now = readBase(c, options.id);
    const expected = structuredClone(expectedPhase);
    // Only our exact original gate may acquire this deterministic archive name.
    if (!expected.tree['retired-install-gate'] && now.retired.bytes) expected.tree['retired-install-gate'] = c.info(now.retired);
    if (!equal(now.phase, expected) || !equal(now.snap.facts, first.base.snapshot) || !equal(c.info(now.barrier), first.base.stop)) fail('stopped_certification_changed');
    expectedPhase = expected;
  }
  const actor = { bootId: crypto.randomUUID(), pid: process.pid, birthTicks: self.birthTicks, brokerToken: crypto.randomUUID(), receiverToken: crypto.randomUUID(), startupToken: crypto.randomUUID() };
  contexts.set(capability, lifecycleRequest(p, b, actor, check));
  try {
    let lifecycle = await require('./owner-lifecycle').inspectStoppedLifecycle(capability); check();
    if (!equal(lifecycle, first.lifecycle)) fail('stopped_certification_changed');
    function publish(name, bytes) { check(); const v = c.atomic(path.join(b.directory, name), bytes, actor.startupToken); expectedPhase = { ...expectedPhase, tree: { ...expectedPhase.tree, [name]: c.info(v) } }; check(); return v; }
    if (!b.intent) {
      publish('stopped-certification-intent.json', c.seal('maintenance-stopped-certification-intent', { id: options.id, stopHash: hash(b.barrier.bytes), originalScope: b.b.scope, certifier: short(actor), snapshot: b.snap.facts, lifecycle, priorPhase: b.phase }));
      b = readBase(c, options.id); contexts.set(capability, lifecycleRequest(p, b, actor, check));
    } else if (!b.certificate) {
      if (b.attempts.length >= ATTEMPT_LIMIT - 1) fail('stopped_certification_budget');
      const attemptId = crypto.randomUUID();
      publish('certify-' + attemptId + '.json', c.seal('maintenance-stopped-certification-attempt', { id: options.id, attemptId, parentHash: b.attempts.at(-1)?.digest || null, intentHash: hash(b.intentView.bytes), certifier: short(actor), priorLifecycle: lifecycle, priorPhase: expectedPhase }));
      b = readBase(c, options.id); contexts.set(capability, lifecycleRequest(p, b, actor, check));
    }
    if (!b.certificate) {
      contexts.get(capability).expected = lifecycle;
      const beforeRetirement = lifecycle;
      await require('./owner-lifecycle').retireStoppedLifecycle(capability); check();
      lifecycle = await require('./owner-lifecycle').inspectStoppedLifecycle(capability); check();
      continuation(beforeRetirement, lifecycle, c.read(path.join(b.directory, 'retired-install-gate')));
      if (Object.values(lifecycle.markers).some(v => v.hash !== null)) fail('stopped_certification_phase');
      assertRetiredNow(c, lifecycle);
      publish('stopped-certificate.json', c.seal('maintenance-stopped-certificate', { id: options.id, stopHash: hash(b.barrier.bytes), intentHash: hash(b.intentView.bytes), attemptHash: b.attempts.at(-1)?.digest || null, originalScope: b.b.scope, certifier: short(actor), snapshot: b.snap.facts, lifecycle }));
    }
    b = readBase(c, options.id); check();
    assertRetiredNow(c, b.certificate.lifecycle);
    const result = Object.freeze({}), facts = { id: options.id, stopHash: hash(b.barrier.bytes), stop: c.info(b.barrier), certificateHash: hash(b.certView.bytes), descriptorHash: c.descriptorHash, snapshot: b.snap.facts, phase: b.phase, lifecycle: b.certificate.lifecycle, markers: c.markers(), installGate: c.info(c.read(path.join(c.d.installRoot, 'install.lock'))) };
    certificates.set(result, { ...p, actor: short(actor), facts: structuredClone(facts), c });
    return result;
  } finally { contexts.delete(capability); }
}
function stoppedCertificateFacts(certificate) {
  const p = certificates.get(certificate); if (!p) fail('stopped_certification_brand');
  return Object.freeze(structuredClone(p.facts));
}
function assertStoppedCertificate(certificate, { installation, descriptorPath, id, lease } = {}) {
  const p = certificates.get(certificate); if (!p || p.actor.pid !== process.pid || p.installation !== installation || p.descriptorPath !== descriptorPath || p.facts.id !== id) fail('stopped_certification_brand');
  endpoint(p.reservedServer); p.c.reverify();
  // Under the branded install lease only its own exact held gates are excluded.
  // Generic/foreign bytes, replaced inodes and unrelated scope still fail.
  let owned = new Map();
  if (lease) { const api = require('./install-lease'); api.assertInstallLease(lease, { installRoot: installation.installRoot, stateDir: installation.stateDir, descriptorPath }); owned = api.ownedLeaseGates(lease); }
  const b = readBase(p.c, id, owned), markers = p.c.markers(), installGate = p.c.info(p.c.read(path.join(installation.installRoot, 'install.lock')));
  for (const file of [path.join(installation.installRoot, 'install.lock'), path.join(installation.stateDir, 'broker/broker-owner.gate')]) {
    const bytes = owned.get(file); if (!bytes) continue;
    const v = p.c.read(file); if (!v.bytes?.equals(bytes)) fail('stopped_certification_changed');
    if (file === path.join(installation.installRoot, 'install.lock')) Object.assign(installGate, NIL()); else markers['broker/broker-owner.gate'] = NIL();
  }
  if (Object.values(markers).some(v => v.hash !== null) || installGate.hash !== null) fail('stopped_certification_changed');
  assertLifecycleTransactions(p.c, p.facts.lifecycle);
  const facts = { id, stopHash: hash(b.barrier.bytes), stop: p.c.info(b.barrier), certificateHash: hash(b.certView.bytes), descriptorHash: p.c.descriptorHash, snapshot: b.snap.facts, phase: b.phase, lifecycle: b.certificate?.lifecycle, markers, installGate };
  if (!equal(facts, p.facts)) fail('stopped_certification_changed');
  return stoppedCertificateFacts(certificate);
}
function readStoppedUpdateCertificate(capability) {
  // This read-only port cannot mint a certificate or retire lifecycle state.
  // Only the update module can brand the exact, already attributed gate bytes.
  const p = require('../tools/stopped-update').ownerPreparedCertificatePermit(capability);
  contexts.set(capability, p);
  try {
    endpoint(p.reservedServer);
    const c = require('./owner-maintenance').stoppedCertificationContext(capability); c.reverify();
    const b = readBase(c, p.id, p.owned), markers = c.markers(), installGate = c.info(c.read(path.join(p.installation.installRoot, 'install.lock')));
    if (!b.certificate) fail('stopped_certification_phase');
    for (const file of [path.join(p.installation.installRoot, 'install.lock'), path.join(p.installation.stateDir, 'broker/broker-owner.gate')]) {
      const v = c.read(file), bytes = p.owned.get(file);
      if (v.bytes && !v.bytes.equals(bytes || Buffer.alloc(0))) fail('stopped_certification_changed');
      if (file === path.join(p.installation.installRoot, 'install.lock')) Object.assign(installGate, NIL()); else markers['broker/broker-owner.gate'] = NIL();
    }
    if (Object.values(markers).some(v => v.hash !== null)) fail('stopped_certification_changed');
    assertLifecycleTransactions(c, b.certificate.lifecycle);
    const facts = { id: p.id, stopHash: hash(b.barrier.bytes), stop: c.info(b.barrier), certificateHash: hash(b.certView.bytes), descriptorHash: c.descriptorHash, snapshot: b.snap.facts, phase: b.phase, lifecycle: b.certificate.lifecycle, markers, installGate };
    if (!equal(facts, p.expectedFacts)) fail('stopped_certification_changed');
    return { facts, actors: [b.b.scope, b.intent.certifier, ...b.attempts.map(a => a.certifier), b.certificate.certifier] };
  } finally { contexts.delete(capability); }
}
function readStoppedReadoptionCertificate(capability) {
  // Disk-backed evidence only, never a normal certificate brand. Slice1 accepts
  // only the untouched certified baseline: no claim/extension or owned gates.
  const p = require('../tools/stopped-host-readoption').stoppedReadoptionCertificateRequest(capability);
  if (p.mode !== 'baseline') fail('stopped_readoption_phase');
  contexts.set(capability, p);
  try {
    endpoint(p.reservedServer);
    const c = require('./owner-maintenance').stoppedCertificationContext(capability); c.reverify();
    const b = readBase(c, p.id), markers = c.markers(), installGate = c.info(c.read(path.join(p.installation.installRoot, 'install.lock')));
    if (!b.certificate) fail('stopped_certification_phase');
    if (Object.values(markers).some(v => v.hash !== null) || installGate.hash !== null) fail('stopped_certification_changed');
    assertLifecycleTransactions(c, b.certificate.lifecycle);
    if (!equal(b.certificate.lifecycle.markers, Object.fromEntries(['owner', 'ownerNext', 'diagnostic', 'brokerOwner', 'brokerGate', 'receiverOwner', 'gate'].map(name => [name, { name, ...NIL() }])))) fail('stopped_certification_changed');
    const facts = { id: p.id, stopHash: hash(b.barrier.bytes), stop: c.info(b.barrier), certificateHash: hash(b.certView.bytes), descriptorHash: c.descriptorHash, snapshot: b.snap.facts, phase: b.phase, lifecycle: b.certificate.lifecycle, markers, installGate };
    return { facts, actors: [b.b.scope, b.intent.certifier, ...b.attempts.map(a => a.certifier), b.certificate.certifier] };
  } finally { contexts.delete(capability); }
}
module.exports = { inspectStoppedCertification, certifyStoppedInstallation, assertStoppedCertificate, stoppedCertificateFacts, stoppedContextPermit, stoppedLifecyclePermit, readStoppedUpdateCertificate, readStoppedReadoptionCertificate };

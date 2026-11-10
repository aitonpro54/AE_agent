'use strict';
// Installer-private update. JSON is evidence, never a normal plan/lease brand.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), http = require('node:http'), os = require('node:os');
const { canonical, hash, fail } = require('../protocol/json');
const installer = require('./install-core4'), leases = require('../runtime/install-lease');
const { verifyPackage, runtimeBinding } = require('./package-installable');
const { observeOwnerProcess, classifyOwnerProcess } = require('../runtime/windows-owner-process');
const permits = new WeakMap(), leasePermits = new WeakMap(), recoveries = new WeakMap();
const preparedRecoveries = new WeakMap();
const ownerCertificatePermits = new WeakMap(), ownerPreparedSources = new WeakMap();
const HEX = /^[a-f0-9]{64}$/, UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const FIELDS = ['dev', 'ino', 'size', 'birthtimeNs', 'mtimeNs', 'ctimeNs'];
const stamp = s => Object.fromEntries(FIELDS.map(k => [k, String(s[k])]));
const equal = (a, b) => canonical(a) === canonical(b), nil = () => ({ hash: null, stat: null });
function endpoint(server) {
  const a = server instanceof http.Server && server.listening && server.address();
  if (!a || a.address !== '127.0.0.1' || !Number.isInteger(a.port) || server.listenerCount('request')) fail('stopped_update_endpoint');
}
function plain(file, directory = false, missing = false) {
  if (!path.isAbsolute(file) || path.resolve(file) !== file) fail('stopped_update_path');
  let cursor = path.parse(file).root; const parts = file.slice(cursor.length).split(path.sep).filter(Boolean);
  for (const [index, part] of parts.entries()) {
    cursor = path.join(cursor, part); let s;
    try { s = fs.lstatSync(cursor, { bigint: true }); } catch (e) { if (missing && e.code === 'ENOENT') return false; throw e; }
    if (s.isSymbolicLink() || s.reparsePoint || fs.realpathSync(cursor) !== cursor || (index < parts.length - 1 || directory ? !s.isDirectory() : !s.isFile())) fail('stopped_update_path');
  }
  return true;
}
function read(file, limit = 64 * 1024 * 1024) {
  if (!plain(file, false, true)) return { file, bytes: null, ...nil() };
  const named = fs.lstatSync(file, { bigint: true }), fd = fs.openSync(file, 'r');
  try {
    const before = fs.fstatSync(fd, { bigint: true });
    if (!equal(stamp(named), stamp(before)) || before.size > BigInt(limit)) fail('stopped_update_changed');
    const bytes = Buffer.alloc(Number(before.size) + 1); let at = 0, n;
    while (at < bytes.length && (n = fs.readSync(fd, bytes, at, bytes.length - at, at))) at += n;
    if (at !== Number(before.size) || !equal(stamp(before), stamp(fs.fstatSync(fd, { bigint: true }))) || !plain(file) || !equal(stamp(before), stamp(fs.lstatSync(file, { bigint: true })))) fail('stopped_update_changed');
    return { file, bytes: bytes.subarray(0, at), hash: hash(bytes.subarray(0, at)), stat: stamp(before) };
  } finally { fs.closeSync(fd); }
}
const info = v => ({ hash: v.hash, stat: v.stat });
function tree(directory) {
  if (!plain(directory, true, true)) return null;
  const result = {}; let count = 0;
  function visit(dir, rel) {
    plain(dir, true); result[rel] = { directory: true, stat: stamp(fs.lstatSync(dir, { bigint: true })) };
    for (const name of fs.readdirSync(dir).sort()) {
      if (++count > 1024) fail('stopped_update_budget');
      const file = path.join(dir, name), relative = rel ? rel + '/' + name : name, s = fs.lstatSync(file);
      if (s.isDirectory()) visit(file, relative); else result[relative] = info(read(file));
    }
  }
  visit(directory, ''); return result;
}
function sameFact(actual, expected, moved = false) {
  if (!actual || !expected || actual.hash !== expected.hash || !!actual.stat !== !!expected.stat) return false;
  return !actual.stat || FIELDS.filter(k => !moved || k !== 'ctimeNs').every(k => actual.stat[k] === expected.stat[k]);
}
function sameTree(actual, expected, moved = false) {
  if (actual === null || expected === null) return actual === expected;
  return equal(Object.keys(actual), Object.keys(expected)) && Object.keys(expected).every(k => {
    const a = actual[k], b = expected[k];
    return b.directory ? a.directory === true && FIELDS.filter(f => !(moved && k === '' && f === 'ctimeNs')).every(f => a.stat[f] === b.stat[f]) : sameFact(a, b);
  });
}
function atomic(file, bytes, exclusiveClaim = false) {
  plain(path.dirname(file), true); if (plain(file, false, true)) fail('stopped_update_destination');
  const stage = file + '.stage-' + crypto.randomUUID(); let fd = fs.openSync(stage, 'wx+');
  try {
    if (fs.writeSync(fd, bytes) !== bytes.length) fail('stopped_update_short_write'); fs.fsyncSync(fd);
    const before = read(stage); if (!before.bytes.equals(bytes) || !equal(stamp(fs.fstatSync(fd, { bigint: true })), before.stat)) fail('stopped_update_changed');
    try { fs.linkSync(stage, file); }
    catch (error) {
      if (exclusiveClaim && error.code === 'EEXIST') {
        // A losing claim may discard only its own still-unpublished stage.
        // No generic stage retirement and no removal of the winning record.
        const own = read(stage), held = fs.fstatSync(fd, { bigint: true }), winner = read(file);
        if (!sameFact(own, before) || !equal(own.stat, stamp(held)) || held.nlink !== 1n || !winner.bytes || winner.stat.dev === own.stat.dev && winner.stat.ino === own.stat.ino) fail('stopped_update_claim_changed');
        fs.unlinkSync(stage);
        if (fs.fstatSync(fd, { bigint: true }).nlink !== 0n) fail('stopped_update_claim_changed');
      }
      throw error;
    }
    const linked = read(file);
    if (!sameFact(linked, before, true)) fail('stopped_update_changed');
    fs.unlinkSync(stage); const closing = fd; fd = undefined; fs.closeSync(closing);
    const final = read(file); if (!sameFact(final, before, true)) fail('stopped_update_changed'); return final;
  } finally { if (fd !== undefined) fs.closeSync(fd); }
}
function fullKey(d) {
  if (!d || !HEX.test(d.panelToken) || !HEX.test(d.controlToken) || d.panelToken === d.controlToken) fail('stopped_update_roles');
  return crypto.createHmac('sha256', Buffer.from(d.panelToken, 'hex')).update('ae-core4/stopped-update/key/v1\0').update(Buffer.from(d.controlToken, 'hex')).digest();
}
function scope(d, descriptorPath) { return { installRoot: d.installRoot, stateDir: d.stateDir, descriptorPath }; }
function binding(old, next, id, oldBytes = Buffer.from(canonical(old))) { return { version: 1, installationId: old.installationId, machineId: old.machineId, oldDescriptorHash: hash(oldBytes), newDescriptorHash: hash(canonical(next)), transactionId: id }; }
function seal(c, kind, value) {
  const body = { ...c.binding, kind, ...value }, message = 'ae-core4/stopped-update/record/v1\0' + canonical(body);
  return Buffer.from(canonical({ body, oldMac: crypto.createHmac('sha256', fullKey(c.old)).update(message).digest('hex'), newMac: crypto.createHmac('sha256', fullKey(c.next)).update(message).digest('hex') }));
}
function decode(c, view, kind) {
  let value; try { value = JSON.parse(view.bytes); } catch { fail('stopped_update_record'); }
  if (!view.bytes || !equal(Object.keys(value).sort(), ['body', 'newMac', 'oldMac']) || !Buffer.from(canonical(value)).equals(view.bytes) || value.body.kind !== kind || Object.keys(c.binding).some(k => value.body[k] !== c.binding[k])) fail('stopped_update_record');
  if (!seal(c, kind, Object.fromEntries(Object.entries(value.body).filter(([k]) => !Object.hasOwn(c.binding, k) && k !== 'kind'))).equals(view.bytes)) fail('stopped_update_record');
  return value.body;
}
async function actor(d) {
  const o = await observeOwnerProcess(process.pid);
  if (classifyOwnerProcess({ pid: process.pid, birthTicks: o.birthTicks }, o) !== 'alive' || !o.executablePath || path.resolve(o.executablePath).toLowerCase() !== path.resolve(d.nodePath).toLowerCase()) fail('stopped_update_process_unknown');
  return { bootId: crypto.randomUUID(), pid: process.pid, birthTicks: o.birthTicks };
}
async function dead(value) {
  if (!value || !UUID.test(value.bootId) || !Number.isSafeInteger(value.pid) || typeof value.birthTicks !== 'string') fail('stopped_update_actor');
  const o = await observeOwnerProcess(value.pid);
  if (!['absent', 'pid-reused'].includes(classifyOwnerProcess({ pid: value.pid, birthTicks: value.birthTicks }, o))) fail('stopped_update_process_not_dead');
}
function checkRenderJobs(c) {
  const { inspectRenderJobs } = require('../runtime/render-job-maintenance');
  if (!equal(inspectRenderJobs(c.old.stateDir, { installationId: c.old.installationId }), c.facts.snapshot.renderJobs ?? null)) fail('stopped_update_render_jobs_changed');
}
function critical(c) {
  checkRenderJobs(c);
  const d = c.old, p = d.stateDir, original = c.facts;
  const names = { origin: path.join(d.installRoot, 'origin.json'), anchor: path.join(p, 'origin.json'), journal: path.join(p, 'receiver/completions.ndjson'), ledger: path.join(p, 'broker/ledger.ndjson') };
  for (const [name, file] of Object.entries(names)) if (!sameFact(read(file), original.snapshot[name])) fail('stopped_update_history_changed');
  const maintenance = path.join(d.installRoot, 'transactions', c.stopId + '-owner-maintenance');
  if (c.source === 'owner') {
    const actual = tree(maintenance), entries = Object.fromEntries(Object.entries(actual || {}).filter(([k]) => k).map(([k, v]) => [k, v]));
    if (!actual || !equal({ dev: actual[''].stat.dev, ino: actual[''].stat.ino, birthtimeNs: actual[''].stat.birthtimeNs }, original.phase.directory) || !equal(entries, original.phase.tree)) fail('stopped_update_certificate_changed');
  } else {
    const actual = tree(path.join(d.installRoot, 'transactions', c.stopId + '-legacy-migration'));
    if (!actual || !equal({ dev: actual[''].stat.dev, ino: actual[''].stat.ino, birthtimeNs: actual[''].stat.birthtimeNs }, original.phase.directory) || !equal(Object.fromEntries(Object.entries(actual).filter(([k]) => k)), original.phase.tree)) fail('stopped_update_certificate_changed');
  }
  for (const [id, transaction] of Object.entries(original.lifecycle.transactions || {})) {
    if (!UUID.test(id)) fail('stopped_update_certificate_changed');
    const actual = tree(path.join(d.installRoot, 'transactions', id + '-owner-lifecycle'));
    const entries = actual && Object.fromEntries(Object.entries(actual).filter(([k]) => k).map(([name, fact]) => [name, { name, ...fact }]));
    if (!actual || !equal({ dev: actual[''].stat.dev, ino: actual[''].stat.ino, birthtimeNs: actual[''].stat.birthtimeNs }, transaction.directory) || !equal(entries, transaction.tree)) fail('stopped_update_certificate_changed');
  }
  const owned = c.lease ? leases.ownedLeaseGates(c.lease) : c.gates || new Map();
  for (const name of ['runtime-owner.json', 'runtime-owner.next', 'runtime-diagnostic.json', 'broker/broker-owner.lock', 'broker/broker-owner.gate', 'receiver/owner']) {
    const file = path.join(p, name), value = read(file), bytes = owned.get(file);
    if (bytes ? !value.bytes?.equals(bytes) : value.bytes !== null) fail('stopped_update_marker');
  }
  return read(path.join(p, 'runtime-maintenance.json'));
}
function checkStop(c) {
  const v = critical(c), archive = read(path.join(c.directory, 'original-stop'));
  if (!sameFact(v, c.facts.stop) && !(sameFact(archive, c.facts.stop, true) && sameFact(v, c.facts.stop, true) && equal(v.stat, archive.stat))) fail('stopped_update_stop_changed');
}
function stoppedUpdateLeasePermit(capability) { const p = leasePermits.get(capability); if (!p) fail('stopped_update_lease_brand'); return p; }
function acquireStoppedReadoptionLease(capability) {
  // Helper-only adapter to the unchanged runtime lease consumer. The readoption
  // module must pull-validate its own private permit; slice1 mints none.
  const permit = require('./stopped-host-readoption').stoppedReadoptionLeasePermit(capability), local = Object.freeze({});
  leasePermits.set(local, permit);
  try { return leases.acquireStoppedUpdateLease(local); }
  finally { leasePermits.delete(local); }
}
function certificateCheck(c) {
  const value = c.source === 'owner' ? require('../runtime/stopped-certification').assertStoppedCertificate(c.certificate, { installation: c.old, descriptorPath: c.descriptorPath, id: c.stopId, lease: c.lease }) : require('./legacy-owner-migration').assertLegacyStoppedCapability(c.certificate, { plan: c.plan, lease: c.lease }).facts;
  if (!equal(value, c.facts)) fail('stopped_update_certificate_changed');
}
function assertStoppedUpdatePermit(permit, { plan, lease } = {}) {
  const c = permits.get(permit);
  if (!c || c.plan !== plan || c.lease !== lease || c.used || c.switched) fail('stopped_update_permit_brand');
  endpoint(c.server); leases.assertInstallLease(lease, scope(c.old, c.descriptorPath), { full: true });
  const fp = installer.assertDurablePreparedInstallPlan(plan, { lease });
  if (!equal(fp, c.fingerprint)) fail('stopped_update_plan_changed');
  certificateCheck(c); if (!sameFact(read(path.join(c.directory, 'intent.json')), c.intent)) fail('stopped_update_intent_changed');
  return true;
}
async function prepare(options, source) {
  const { plan, reservedServer } = options;
  const fingerprint = installer.assertPreparedInstallBaseline(plan);
  const legacy = source === 'legacy' && require('./legacy-owner-migration').assertLegacyStoppedCapability(options.stoppedCapability, { plan, lease: options.lease });
  const old = legacy ? legacy.installation : options.installation, descriptorPath = legacy ? legacy.descriptorPath : options.descriptorPath, stopId = legacy ? legacy.id : options.id;
  if (!old || old.machineId !== os.hostname() || descriptorPath !== path.join(old.installRoot, 'installation.json') || !plan.previousDescriptor || !plan.previousDescriptor.equals(read(descriptorPath).bytes) || !equal(JSON.parse(plan.previousDescriptor), old) || plan.descriptor.installationId !== old.installationId || plan.descriptor.stateDir !== old.stateDir || plan.descriptor.packageHash === old.packageHash || runtimeBinding(plan.pkg.release, f => Buffer.from(plan.pkg.files[f], 'base64')).runtimeModel !== 'owner') fail('stopped_update_scope');
  const c = { source, plan, old, next: plan.descriptor, descriptorPath, stopId, server: reservedServer || legacy?.reservedServer, certificate: legacy ? options.stoppedCapability : options.certificate, lease: options.lease || null, binding: binding(old, plan.descriptor, plan.transactionId, plan.previousDescriptor), directory: path.join(old.installRoot, 'transactions', plan.transactionId + '-stopped-update') };
  endpoint(c.server);
  c.facts = legacy ? legacy.facts : require('../runtime/stopped-certification').assertStoppedCertificate(c.certificate, { installation: old, descriptorPath, id: stopId });
  checkRenderJobs(c);
  if (!c.facts.stop || c.facts.stop.hash !== c.facts.stopHash || c.facts.descriptorHash !== hash(plan.previousDescriptor)) fail('stopped_update_certificate');
  const before = structuredClone(c.facts), a = await actor(old); endpoint(c.server); certificateCheck(c); installer.assertPreparedInstallBaseline(plan);
  if (!equal(before, c.facts)) fail('stopped_update_certificate_changed');
  c.actor = a;
  // This durable intent precedes both update-specific gates. Its original
  // actor and role bytes remain attributable after an operator crash.
  plain(path.dirname(c.directory), true); fs.mkdirSync(c.directory); plain(c.directory, true);
  const gates = c.lease ? [...leases.ownedLeaseGates(c.lease).values()] : ['install', 'broker'].map(role => seal(c, 'update-lease-gate', { actor: a, role, nonce: crypto.randomUUID() }));
  const intent = { source, stopId, actor: a, oldDescriptor: plan.previousDescriptor.toString('base64'), newDescriptor: Buffer.from(canonical(c.next)).toString('base64'), fingerprint, facts: c.facts, gates: gates.map(b => b.toString('base64')), externalLease: !!c.lease, payload: installer.preparedInstallPayload(plan) };
  c.intent = info(atomic(path.join(c.directory, 'intent.json'), seal(c, 'update-intent', intent)));
  const cap = Object.freeze({});
  try {
    if (!c.lease) { leasePermits.set(cap, { scope: scope(old, descriptorPath), nonce: a.bootId, gates }); c.lease = leases.acquireStoppedUpdateLease(cap); }
    leases.assertInstallLease(c.lease, scope(old, descriptorPath), { full: true }); certificateCheck(c);
    c.fingerprint = installer.prepareInstallPlan(plan, { lease: c.lease });
    // The plan digest is fixed before writing; durable preparation adds only its
    // evidence hash. The sealed ready record binds that hash before switching.
    if (c.fingerprint.preparedPlanHash !== fingerprint.preparedPlanHash) fail('stopped_update_plan_changed');
    c.leaseRecord = info(atomic(path.join(c.directory, 'lease.json'), seal(c, 'update-lease', { actor: a, intentHash: c.intent.hash, facts: leases.maintenanceLeaseFacts(c.lease), fingerprint: c.fingerprint })));
    const permit = Object.freeze({}); permits.set(permit, c); return Object.freeze({ permit, lease: c.lease, transactionId: plan.transactionId });
  } catch (e) { if (c.lease) leases.retainInstallLease(c.lease); e.leaseRetained = true; e.transactionId = plan.transactionId; throw e; }
  finally { leasePermits.delete(cap); }
}
function prepareStoppedUpdate(options) { return prepare(options, 'owner'); }
function prepareLegacyStoppedUpdate(options) { return prepare(options, 'legacy'); }
function switchViews(c, p) {
  return { cep: tree(p.cepDir), backup: tree(p.backupCep), cepStage: tree(p.cepStage), descriptor: info(read(p.descriptorPath)), descriptorStage: info(read(p.descriptorPath + '.next')), client: info(read(p.clientPath)), clientStage: info(read(p.clientPath + '.next')), config: info(read(p.configPath)), configStage: info(read(p.configPath + '.core4-next')) };
}
function stoppedUpdateSwitchReady(permit, { plan, lease, txnFile, cepStage, backupCep }) {
  assertStoppedUpdatePermit(permit, { plan, lease }); const c = permits.get(permit);
  const paths = { descriptorPath: plan.descriptorPath, clientPath: plan.clientBinding.clientDescriptorPath, configPath: plan.configPath, cepDir: plan.cepDir, cepStage, backupCep, txnFile };
  const views = switchViews(c, paths), prepared = path.join(plan.descriptor.installRoot, 'transactions', plan.transactionId + '-prepared');
  if (!views.cep || views.backup || !views.cepStage || !views.descriptorStage.stat || !views.clientStage.stat || !views.configStage.stat) fail('stopped_update_switch_staging');
  const ready = { actor: c.actor, intentHash: c.intent.hash, leaseHash: c.leaseRecord.hash, fingerprint: c.fingerprint, paths, views, transaction: info(read(txnFile)), prepared: tree(prepared) };
  checkStop(c); c.ready = info(atomic(path.join(c.directory, 'switch-ready.json'), seal(c, 'update-switch-ready', ready)));
  checkStop(c); c.switched = true;
}
function appliedViews(c, ready) {
  const p = ready.paths;
  if (!sameFact(read(p.txnFile), ready.transaction) || !sameTree(tree(path.join(c.old.installRoot, 'transactions', c.binding.transactionId + '-prepared')), ready.prepared)) fail('stopped_update_prepared_changed');
  const v = switchViews(c, p), s = ready.views, candidates = [];
  for (let phase = 0; phase <= 5; phase++) {
    const cep = phase === 0 ? sameTree(v.cep, s.cep) && v.backup === null && sameTree(v.cepStage, s.cepStage) : phase === 1 ? v.cep === null && sameTree(v.backup, s.cep, true) && sameTree(v.cepStage, s.cepStage) : sameTree(v.cep, s.cepStage, true) && sameTree(v.backup, s.cep, true) && v.cepStage === null;
    const file = (key, at) => phase < at ? sameFact(v[key], s[key]) && sameFact(v[key + 'Stage'], s[key + 'Stage']) : sameFact(v[key], s[key + 'Stage'], true) && v[key + 'Stage'].hash === null;
    if (cep && file('descriptor', 3) && file('client', 4) && file('config', 5)) candidates.push(phase);
  }
  if (candidates.length !== 1) fail('stopped_update_switch_prefix'); return candidates[0];
}
function fullVerified(c, ready) {
  if (appliedViews(c, ready) !== 5) fail('stopped_update_not_applied');
  const actual = require('../runtime/installation').verifyInstallation(c.descriptorPath);
  if (!equal(actual, c.next)) fail('stopped_update_installation_changed');
  critical(c);
  if (c.facts.snapshot.journal.hash !== null) require('../runtime/native-read-disposition').assertReceiverJournalSettled({ directory: path.join(c.old.stateDir, 'receiver'), descriptorPath: c.descriptorPath, cepDir: c.next.cepDir });
}
function finish(c, ready) {
  endpoint(c.server); leases.assertInstallLease(c.lease, scope(c.old, c.descriptorPath), { full: true }); fullVerified(c, ready);
  const verifiedPath = path.join(c.directory, 'verified.json'), existing = read(verifiedPath);
  let verified = existing;
  if (existing.bytes) { const b = decode(c, existing, 'update-verified'); if (b.readyHash !== c.ready.hash) fail('stopped_update_record'); }
  else { checkStop(c); verified = atomic(verifiedPath, seal(c, 'update-verified', { actor: c.actor, readyHash: c.ready.hash, history: c.facts.snapshot, archive: ready.views.cep })); }
  const barrier = path.join(c.old.stateDir, 'runtime-maintenance.json'), current = critical(c);
  const value = seal(c, 'update-stopped', { stopId: c.stopId, intentHash: c.intent.hash, readyHash: c.ready.hash, verifiedHash: verified.hash, certificateHash: c.facts.certificateHash, history: c.facts.snapshot });
  if (!current.bytes?.equals(value)) {
    checkStop(c); const target = path.join(c.directory, 'update-stopped.json');
    let stage = read(target); if (!stage.bytes) stage = atomic(target, value);
    if (!stage.bytes.equals(value)) fail('stopped_update_barrier_changed');
    // Old barrier is retained as exact bytes/inode evidence. The replacement is
    // atomic; runtime never sees an absent desired-stop barrier.
    const archive = path.join(c.directory, 'original-stop'); let saved = read(archive);
    if (!saved.bytes) { fs.linkSync(barrier, archive); saved = read(archive); }
    if (!sameFact(saved, c.facts.stop, true) || !sameFact(read(barrier), c.facts.stop, true)) fail('stopped_update_stop_changed');
    const fd = fs.openSync(target, 'r');
    try { if (!sameFact(info(read(target)), stage)) fail('stopped_update_changed'); fs.renameSync(target, barrier); if (!sameFact(read(barrier), stage, true) || !equal(stamp(fs.fstatSync(fd, { bigint: true })), read(barrier).stat)) fail('stopped_update_changed'); }
    finally { fs.closeSync(fd); }
  }
  fullVerified(c, ready);
  const completed = path.join(c.directory, 'completed.json'), end = read(completed);
  const completion = seal(c, 'update-completed', { readyHash: c.ready.hash, verifiedHash: verified.hash, barrier: info(read(barrier)), history: c.facts.snapshot });
  if (end.bytes ? !end.bytes.equals(completion) : !atomic(completed, completion).bytes.equals(completion)) fail('stopped_update_completion_changed');
  c.used = true;
  return { updated: true, phase: 'update-stopped', transactionId: c.binding.transactionId, descriptorPath: c.descriptorPath, packageHash: c.next.packageHash, runtimeStarted: false, aeAuthority: false };
}
function applyStoppedUpdate({ plan, lease, permit }) {
  assertStoppedUpdatePermit(permit, { plan, lease }); const c = permits.get(permit);
  try {
    installer.applyInstall(plan, { lease, stoppedPermit: permit });
    const ready = decode(c, read(path.join(c.directory, 'switch-ready.json')), 'update-switch-ready');
    const result = finish(c, ready); leases.releaseInstallLease(lease); c.lease = null; c.gates = new Map(); return result;
  } catch (e) { leases.retainInstallLease(lease); e.leaseRetained = true; e.transactionId = c.binding.transactionId; throw e; }
}
function updateDirectoryFacts(c) {
  const actual = tree(c.directory), allowed = ['intent.json', 'lease.json', 'switch-ready.json', 'verified.json', 'update-stopped.json', 'original-stop', 'completed.json', 'enable-intent.json', 'enable-ready.json', 'update-stop', 'enabled.json'];
  if (!actual) fail('stopped_update_phase');
  for (const name of Object.keys(actual).filter(Boolean)) {
    if (allowed.includes(name) || /^(?:(?:enable-)?recovery-[a-f0-9-]{36}|pre-ready-[a-f0-9-]{36}(?:-lease)?)\.json$/.test(name)) continue;
    const base = name.replace(/\.stage-[a-f0-9-]{36}$/, '');
    if (base === name || !allowed.includes(base) && !/^(?:(?:enable-)?recovery-[a-f0-9-]{36}|pre-ready-[a-f0-9-]{36}(?:-lease)?)\.json$/.test(base)) fail('stopped_update_phase');
    const target = base === 'update-stopped.json' && !actual[base] ? info(read(path.join(c.old.stateDir, 'runtime-maintenance.json'))) : actual[base];
    if (!target || !sameFact(actual[name], target) || !equal(actual[name].stat, target.stat)) fail('stopped_update_phase');
  }
  return actual;
}
function recoveryFacts(c, ready) {
  return { update: updateDirectoryFacts(c), visible: switchViews(c, ready.paths), prepared: tree(path.join(c.old.installRoot, 'transactions', c.binding.transactionId + '-prepared')), transaction: info(read(ready.paths.txnFile)), barrier: info(critical(c)), gates: [path.join(c.old.installRoot, 'install.lock'), path.join(c.old.stateDir, 'broker/broker-owner.gate')].map(f => info(read(f))) };
}
function validatePayload(c, ready) {
  const preparedFile = path.join(c.old.installRoot, 'transactions', c.binding.transactionId + '-prepared', 'prepared.json'), view = read(preparedFile), p = JSON.parse(view.bytes);
  if (view.hash !== ready.fingerprint.preparedStateHash || p.version !== 1 || p.transactionId !== c.binding.transactionId || p.preparedPlanHash !== ready.fingerprint.preparedPlanHash || p.descriptorPath !== c.descriptorPath || p.configPath !== ready.paths.configPath || p.cepDir !== ready.paths.cepDir || !Buffer.from(p.descriptorBytes, 'base64').equals(Buffer.from(canonical(c.next))) || !Buffer.from(p.previousDescriptor, 'base64').equals(c.oldBytes)) fail('stopped_update_prepared_changed');
  verifyPackage(p.package);
  const digest = payloadDigest(p);
  if (digest !== p.preparedPlanHash || p.package.packageHash !== c.next.packageHash || runtimeBinding(p.package.release, f => Buffer.from(p.package.files[f], 'base64')).runtimeModel !== 'owner' || ready.paths.clientPath !== path.join(c.old.installRoot, 'core-client.json') || ready.paths.cepStage !== path.join(c.old.installRoot, 'transactions', p.transactionId + '-cep-next') || ready.paths.backupCep !== path.join(c.old.installRoot, 'transactions', p.transactionId + '-cep') || ready.paths.txnFile !== path.join(c.old.installRoot, 'transactions', p.transactionId + '.json')) fail('stopped_update_prepared_changed');
  const txn = JSON.parse(read(ready.paths.txnFile).bytes);
  if (txn.preparedPlanHash !== p.preparedPlanHash || txn.preparedStateHash !== view.hash || txn.appliedDescriptorHash !== hash(Buffer.from(p.descriptorBytes, 'base64')) || txn.appliedConfigHash !== hash(Buffer.from(p.configBytes, 'base64')) || txn.appliedCepHash !== hash(p.cep) || txn.previousDescriptor !== p.previousDescriptor || txn.previousConfig !== p.previousConfig || txn.previousCepHash !== hash(p.previousCep) || !equal(txn.clientBinding, p.clientBinding)) fail('stopped_update_transaction_changed');
  return p;
}
function payloadDigest(p) {
  return hash({ transactionId: p.transactionId, package: p.package, origin: p.origin, originBytes: p.originBytes, clientBinding: p.clientBinding, nextClient: p.nextClient, descriptor: JSON.parse(Buffer.from(p.descriptorBytes, 'base64')), descriptorPath: p.descriptorPath, configPath: p.configPath, nextConfig: Buffer.from(p.configBytes, 'base64').toString('utf8'), cepDir: p.cepDir, cep: p.cep, previousDescriptor: p.previousDescriptor, previousConfig: p.previousConfig, previousCep: p.previousCep, baseline: p.baseline });
}
function factsExtend(before, after) {
  if (!equal(before.snapshot, after.snapshot) || !equal(before.stop, after.stop) || before.stopHash !== after.stopHash || before.descriptorHash !== after.descriptorHash || !equal(before.phase.directory, after.phase.directory) || !equal(before.lifecycle, after.lifecycle) || !equal(before.markers, after.markers)) fail('stopped_update_certificate_changed');
  for (const [name, fact] of Object.entries(before.phase.tree)) {
    const linkedGate = /^recover-[a-f0-9-]{36}-(install|broker)-(old|new)$/.test(name);
    if (!(linkedGate ? sameFact(after.phase.tree[name], fact, true) : equal(after.phase.tree[name], fact))) fail('stopped_update_certificate_changed');
  }
}
function preparedChain(c, intent) {
  const records = new Map(), children = new Map();
  for (const name of Object.keys(tree(c.directory) || {}).filter(n => /^pre-ready-[a-f0-9-]{36}\.json$/.test(n))) {
    const v = read(path.join(c.directory, name)), b = decode(c, v, 'update-pre-ready-recovery');
    if (!UUID.test(b.attemptId) || name !== 'pre-ready-' + b.attemptId + '.json' || b.parentHash !== null && !HEX.test(b.parentHash) || b.intentHash !== c.intent.hash || b.payloadHash !== hash(canonical(intent.payload)) || children.has(b.parentHash) || !Array.isArray(b.gates) || b.gates.length !== 2 || !Array.isArray(b.leaseFacts) || b.leaseFacts.length !== 2) fail('stopped_update_prepared_chain');
    records.set(v.hash, { ...b, hash: v.hash, stat: v.stat }); children.set(b.parentHash, v.hash);
  }
  if (records.size > 16) fail('stopped_update_budget');
  const chain = []; let next = children.get(null), facts = intent.facts;
  while (next) {
    if (chain.length >= records.size) fail('stopped_update_prepared_chain'); const b = records.get(next); if (!b) fail('stopped_update_prepared_chain');
    factsExtend(facts, b.facts); facts = b.facts; chain.push(b); next = children.get(next);
  }
  if (chain.length !== records.size) fail('stopped_update_prepared_chain'); return chain;
}
function readRecovery(options) {
  const { installation: old, descriptorPath, transactionId, expectedPreviousDescriptorHash, expectedPackageHash, reservedServer } = options;
  endpoint(reservedServer);
  if (!old || old.machineId !== os.hostname() || !UUID.test(transactionId) || !HEX.test(expectedPreviousDescriptorHash) || !HEX.test(expectedPackageHash) || descriptorPath !== path.join(old.installRoot, 'installation.json') || old.stateDir !== path.join(old.installRoot, 'state/production')) fail('stopped_update_recovery_scope');
  const directory = path.join(old.installRoot, 'transactions', transactionId + '-stopped-update'), intentView = read(path.join(directory, 'intent.json'));
  let raw; try { raw = JSON.parse(intentView.bytes).body; } catch { fail('stopped_update_record'); }
  const oldBytes = Buffer.from(raw.oldDescriptor || '', 'base64'), nextBytes = Buffer.from(raw.newDescriptor || '', 'base64');
  let next; try { next = JSON.parse(nextBytes); } catch { fail('stopped_update_record'); }
  if (hash(oldBytes) !== expectedPreviousDescriptorHash || !equal(JSON.parse(oldBytes), old) || !Buffer.from(canonical(next)).equals(nextBytes) || next.packageHash !== expectedPackageHash || next.installationId !== old.installationId || next.machineId !== old.machineId || next.installRoot !== old.installRoot || next.stateDir !== old.stateDir || next.predecessor?.transactionId !== transactionId || next.predecessor?.previousDescriptorHash !== expectedPreviousDescriptorHash || next.cepDir !== old.cepDir) fail('stopped_update_recovery_scope');
  const c = { old, oldBytes, next, descriptorPath, directory, server: reservedServer, binding: binding(old, next, transactionId, oldBytes) };
  const intent = decode(c, intentView, 'update-intent');
  if (!['owner', 'legacy'].includes(intent.source) || !UUID.test(intent.stopId) || !Array.isArray(intent.gates) || intent.gates.length !== 2) fail('stopped_update_record');
  Object.assign(c, { source: intent.source, stopId: intent.stopId, facts: intent.facts, intent: info(intentView), originalActor: intent.actor, actor: intent.actor, gates: new Map() });
  c.preAttempts = preparedChain(c, intent); const pre = c.preAttempts.at(-1);
  if (pre) c.facts = pre.facts;
  if (c.facts.descriptorHash !== expectedPreviousDescriptorHash || c.facts.stopHash !== c.facts.stop?.hash) fail('stopped_update_record');
  const ownerLease = pre && intent.source === 'owner' ? read(path.join(directory, 'pre-ready-' + pre.attemptId + '-lease.json')) : null;
  const leaseView = ownerLease || (pre ? { hash: pre.hash, stat: pre.stat } : read(path.join(directory, 'lease.json'))), leaseRecord = ownerLease ? decode(c, ownerLease, 'update-pre-ready-lease') : pre ? { intentHash: pre.intentHash, actor: pre.actor, facts: pre.leaseFacts, fingerprint: pre.fingerprint } : decode(c, leaseView, 'update-lease');
  if (ownerLease && leaseRecord.attemptHash !== pre.hash) fail('stopped_update_record');
  const effectiveActor = pre?.actor || intent.actor;
  if (leaseRecord.intentHash !== c.intent.hash || !equal(leaseRecord.actor, effectiveActor) || !Array.isArray(leaseRecord.facts) || leaseRecord.facts.length !== 2) fail('stopped_update_record');
  c.leaseRecord = info(leaseView); c.gateFacts = leaseRecord.facts; c.gateBytes = (pre?.gates || intent.gates).map(s => Buffer.from(s, 'base64'));
  const completedView = read(path.join(directory, 'completed.json')), enableView = read(path.join(directory, 'enable-intent.json')), enableReadyView = read(path.join(directory, 'enable-ready.json')), enabledView = read(path.join(directory, 'enabled.json'));
  let enable, enableReady;
  if (enableView.bytes) {
    enable = decode(c, enableView, 'update-enable-intent');
    if (!completedView.bytes || enable.completionHash !== completedView.hash || !Array.isArray(enable.gates) || enable.gates.length !== 2) fail('stopped_update_enable_record');
    c.gateBytes = enable.gates.map(s => Buffer.from(s, 'base64'));
    c.gateBytes.forEach((bytes, i) => { const b = decode(c, { bytes }, 'update-enable-gate'); if (b.role !== ['install', 'broker'][i] || !equal(b.actor, enable.actor) || !UUID.test(b.nonce)) fail('stopped_update_enable_record'); });
    if (enableReadyView.bytes) {
      enableReady = decode(c, enableReadyView, 'update-enable-ready');
      if (enableReady.intentHash !== enableView.hash || !Array.isArray(enableReady.gates) || enableReady.gates.length !== 2 || !equal(enableReady.history, c.facts.snapshot)) fail('stopped_update_enable_record');
      c.gateFacts = enableReady.gates;
    }
    c.enable = { intent: enable, intentView: enableView, ready: enableReady, readyView: enableReadyView, enabledView };
  } else if (enableReadyView.bytes || enabledView.bytes) fail('stopped_update_enable_record');
  const present = [];
  for (const [index, file] of [path.join(old.installRoot, 'install.lock'), path.join(old.stateDir, 'broker/broker-owner.gate')].entries()) {
    const actual = read(file), expected = c.gateFacts[index];
    if (enable && !enableReady) {
      if (actual.bytes && !actual.bytes.equals(c.gateBytes[index])) fail('stopped_update_lease_changed');
      c.gateFacts[index] = { file, hash: hash(c.gateBytes[index]), stat: actual.stat };
    } else if (expected.file !== file || expected.hash !== hash(c.gateBytes[index]) || (actual.bytes ? !sameFact(actual, expected) : enableReady ? !enabledView.bytes : !completedView.bytes)) fail('stopped_update_lease_changed');
    present.push(actual.bytes !== null); if (actual.bytes) c.gates.set(file, c.gateBytes[index]);
  }
  if (!present[0] && present[1]) fail('stopped_update_lease_changed');
  const readyView = read(path.join(directory, 'switch-ready.json')), ready = decode(c, readyView, 'update-switch-ready');
  if (ready.intentHash !== c.intent.hash || ready.leaseHash !== c.leaseRecord.hash || !equal(ready.actor, effectiveActor) || !equal(ready.fingerprint, leaseRecord.fingerprint) || ready.paths.descriptorPath !== descriptorPath) fail('stopped_update_record');
  c.ready = info(readyView); c.fingerprint = ready.fingerprint;
  const release = JSON.parse(read(path.join(old.releaseDir, 'release.json')).bytes);
  if (old.releaseDir !== path.join(old.installRoot, 'releases', old.packageHash) || hash(release) !== old.packageHash || hash(fs.readFileSync(old.nodePath)) !== old.nodeHash) fail('stopped_update_old_release');
  installer.checkRelease(old.releaseDir, release);
  const payload = validatePayload(c, ready), phase = appliedViews(c, ready), barrier = critical(c), completed = completedView;
  if (!equal(payload, intent.payload)) fail('stopped_update_prepared_changed');
  const verifiedView = read(path.join(directory, 'verified.json')); let verified;
  if (verifiedView.bytes) { verified = decode(c, verifiedView, 'update-verified'); if (phase !== 5 || verified.readyHash !== c.ready.hash || !equal(verified.history, c.facts.snapshot) || !sameTree(verified.archive, ready.views.cep)) fail('stopped_update_record'); }
  if (barrier.hash !== c.facts.stopHash) {
    if (!verified) fail('stopped_update_phase');
    const typedBarrier = barrier.bytes ? barrier : enableReady ? read(path.join(directory, 'update-stop')) : null;
    if (!typedBarrier?.bytes) fail('stopped_update_enable_record');
    const b = decode(c, typedBarrier, 'update-stopped');
    if (b.readyHash !== c.ready.hash || b.intentHash !== c.intent.hash || b.verifiedHash !== verifiedView.hash || b.certificateHash !== c.facts.certificateHash || !equal(b.history, c.facts.snapshot)) fail('stopped_update_record');
    if (!sameFact(read(path.join(directory, 'original-stop')), c.facts.stop, true)) fail('stopped_update_stop_changed');
  } else checkStop(c);
  if (completed.bytes) {
    const b = decode(c, completed, 'update-completed');
    const archived = read(path.join(directory, 'update-stop'));
    const barrierMatches = sameFact(barrier, b.barrier) || enableReady && sameFact(archived, b.barrier, true) && (!barrier.bytes || sameFact(barrier, archived));
    if (phase !== 5 || !verified || b.readyHash !== c.ready.hash || b.verifiedHash !== verifiedView.hash || !barrierMatches || !equal(b.history, c.facts.snapshot)) fail('stopped_update_record');
    if (enable && (!equal(enable.barrier, b.barrier) || enableReady && (enableReady.readyHash !== c.ready.hash || !equal(enableReady.barrier, b.barrier)))) fail('stopped_update_enable_record');
    if (enabledView.bytes) { const e = decode(c, enabledView, 'update-enabled'); if (barrier.bytes || !enableReady || e.intentHash !== enableView.hash || e.completionHash !== completed.hash || !equal(e.history, c.facts.snapshot)) fail('stopped_update_enable_record'); }
  }
  const attempts = new Map(), children = new Map();
  for (const name of Object.keys(updateDirectoryFacts(c)).filter(n => /^recovery-/.test(n))) {
    const view = read(path.join(directory, name)), a = decode(c, view, 'update-recovery-attempt');
    if (!UUID.test(a.attemptId) || name !== 'recovery-' + a.attemptId + '.json' || a.parentHash !== null && !HEX.test(a.parentHash) || a.readyHash !== c.ready.hash || !HEX.test(a.proofHash) || children.has(a.parentHash)) fail('stopped_update_recovery_chain');
    attempts.set(view.hash, { ...a, hash: view.hash }); children.set(a.parentHash, view.hash);
  }
  if (attempts.size > 16) fail('stopped_update_budget');
  c.attempts = []; let nextHash = children.get(null);
  while (nextHash) { if (c.attempts.length >= attempts.size) fail('stopped_update_recovery_chain'); const a = attempts.get(nextHash); if (!a) fail('stopped_update_recovery_chain'); c.attempts.push(a); nextHash = children.get(nextHash); }
  if (c.attempts.length !== attempts.size) fail('stopped_update_recovery_chain');
  c.present = present;
  c.enableAttempts = [];
  const enableAttempts = new Map(), enableChildren = new Map();
  for (const name of Object.keys(updateDirectoryFacts(c)).filter(n => /^enable-recovery-[a-f0-9-]{36}\.json$/.test(n))) {
    const v = read(path.join(directory, name)), b = decode(c, v, 'update-enable-recovery');
    if (!enable || !UUID.test(b.attemptId) || name !== 'enable-recovery-' + b.attemptId + '.json' || b.intentHash !== enableView.hash || b.parentHash !== null && !HEX.test(b.parentHash) || !HEX.test(b.proofHash) || enableChildren.has(b.parentHash)) fail('stopped_update_enable_record');
    enableAttempts.set(v.hash, { ...b, hash: v.hash }); enableChildren.set(b.parentHash, v.hash);
  }
  if (enableAttempts.size > 16) fail('stopped_update_budget');
  let enableNext = enableChildren.get(null);
  while (enableNext) { if (c.enableAttempts.length >= enableAttempts.size) fail('stopped_update_enable_record'); const a = enableAttempts.get(enableNext); if (!a) fail('stopped_update_enable_record'); c.enableAttempts.push(a); enableNext = enableChildren.get(enableNext); }
  if (c.enableAttempts.length !== enableAttempts.size) fail('stopped_update_enable_record');
  const facts = recoveryFacts(c, ready);
  return { c, ready, payload, facts, phase, proofHash: hash({ binding: c.binding, facts }) };
}
async function inspectedRecovery(options) {
  const first = readRecovery(options); await dead(first.c.originalActor);
  for (const a of first.c.attempts) await dead(a.actor);
  for (const a of first.c.preAttempts) await dead(a.actor);
  if (first.c.enable) await dead(first.c.enable.intent.actor);
  for (const a of first.c.enableAttempts) await dead(a.actor);
  const again = readRecovery(options); if (!equal(first.facts, again.facts)) fail('stopped_update_proof_changed'); return again;
}
async function inspectStoppedUpdate(options) {
  const r = await inspectedRecovery(options);
  return Object.freeze({ transactionId: r.c.binding.transactionId, phase: r.c.enable ? r.c.enable.enabledView.bytes ? 'enabled' : 'enable-pending' : r.phase === 5 && read(path.join(r.c.directory, 'completed.json')).bytes ? 'update-stopped' : 'switch-pending', switchIndex: r.phase, proofHash: r.proofHash, stopped: !r.c.enable?.enabledView.bytes, inspectionOnly: true, runtimeStarted: false, aeAuthority: false });
}
function recoveryPermit(capability) { const p = recoveries.get(capability); if (!p) fail('stopped_update_recovery_brand'); return p; }
function renameRecovery(capability, from, to, expected, directory = false) {
  const p = recoveryPermit(capability), c = p.c;
  if (!equal(recoveryFacts(c, p.ready), p.facts)) fail('stopped_update_proof_changed');
  checkStop(c); leases.assertInstallLease(c.lease, scope(c.old, c.descriptorPath), { full: true });
  if (directory) {
    if (!sameTree(tree(from), expected)) fail('stopped_update_staging_changed');
    const named = fs.lstatSync(from, { bigint: true }); fs.renameSync(from, to);
    if (!sameTree(tree(to), expected, true) || String(fs.lstatSync(to, { bigint: true }).ino) !== String(named.ino)) fail('stopped_update_staging_changed');
  } else {
    const fd = fs.openSync(from, 'r');
    try {
      if (!sameFact(read(from), expected) || !equal(stamp(fs.fstatSync(fd, { bigint: true })), expected.stat)) fail('stopped_update_staging_changed');
      fs.renameSync(from, to);
      if (!sameFact(read(to), expected, true) || !equal(stamp(fs.fstatSync(fd, { bigint: true })), read(to).stat)) fail('stopped_update_staging_changed');
    } finally { fs.closeSync(fd); }
  }
  // Only the one recognized next prefix is accepted, never a new baseline.
  if (appliedViews(c, p.ready) !== p.phase + 1) fail('stopped_update_switch_prefix');
  const next = recoveryFacts(c, p.ready), expectedNext = { ...p.facts, visible: next.visible };
  if (!equal(next, expectedNext)) fail('stopped_update_proof_changed');
  p.phase++; p.facts = expectedNext;
}
async function finishStoppedUpdate(options) {
  if (!HEX.test(options.expectedProofHash)) fail('stopped_update_expected_proof');
  const r = await inspectedRecovery(options); if (r.proofHash !== options.expectedProofHash) fail('stopped_update_proof_changed');
  if (r.c.enable) fail('stopped_update_enable_pending');
  const a = await actor(r.c.old), current = readRecovery(options);
  if (!equal(r.facts, current.facts)) fail('stopped_update_proof_changed');
  const { c, ready } = current, cap = Object.freeze({});
  if (c.attempts.length >= 16) fail('stopped_update_budget');
  const attemptId = crypto.randomUUID();
  atomic(path.join(c.directory, 'recovery-' + attemptId + '.json'), seal(c, 'update-recovery-attempt', { attemptId, parentHash: c.attempts.at(-1)?.hash || null, actor: a, readyHash: c.ready.hash, proofHash: current.proofHash }));
  if (!c.present.every(Boolean)) {
    // Completion was durable before release. Only the recorded broker-first
    // deletion prefix remains; absence cannot authorize another visible switch.
    if (!read(path.join(c.directory, 'completed.json')).bytes) fail('stopped_update_phase');
    leasePermits.set(cap, { scope: scope(c.old, c.descriptorPath), nonce: a.bootId, gates: c.gateBytes, recovery: true, releaseOnly: true, facts: c.gateFacts });
    try {
      c.lease = leases.acquireStoppedUpdateLease(cap); fullVerified(c, ready); leases.releaseInstallLease(c.lease);
      return { updated: true, recovered: true, phase: 'update-stopped', transactionId: c.binding.transactionId, packageHash: c.next.packageHash, runtimeStarted: false, aeAuthority: false };
    } catch (error) { if (c.lease) leases.retainInstallLease(c.lease); error.leaseRetained = true; throw error; }
    finally { leasePermits.delete(cap); }
  }
  leasePermits.set(cap, { scope: scope(c.old, c.descriptorPath), nonce: a.bootId, gates: c.gateBytes, recovery: true, facts: c.gateFacts });
  try {
    c.lease = leases.acquireStoppedUpdateLease(cap); c.actor = a;
    recoveries.set(cap, { ...current, c, facts: recoveryFacts(c, ready) });
    const p = recoveryPermit(cap), s = ready.views, paths = ready.paths;
    if (p.phase === 0) renameRecovery(cap, paths.cepDir, paths.backupCep, s.cep, true);
    if (p.phase === 1) renameRecovery(cap, paths.cepStage, paths.cepDir, s.cepStage, true);
    if (p.phase === 2) renameRecovery(cap, paths.descriptorPath + '.next', paths.descriptorPath, s.descriptorStage);
    if (p.phase === 3) renameRecovery(cap, paths.clientPath + '.next', paths.clientPath, s.clientStage);
    if (p.phase === 4) renameRecovery(cap, paths.configPath + '.core4-next', paths.configPath, s.configStage);
    const result = finish(c, ready); leases.releaseInstallLease(c.lease); return { ...result, recovered: true };
  } catch (error) { if (c.lease) leases.retainInstallLease(c.lease); error.leaseRetained = true; throw error; }
  finally { leasePermits.delete(cap); recoveries.delete(cap); }
}
async function enableStoppedUpdate(options) {
  let c, ready;
  if (options.permit) {
    c = permits.get(options.permit);
    if (!c || !c.used || c.enabled || c.lease) fail('stopped_update_enable_brand');
    ready = decode(c, read(path.join(c.directory, 'switch-ready.json')), 'update-switch-ready');
  } else {
    if (!HEX.test(options.expectedProofHash)) fail('stopped_update_expected_proof');
    const r = await inspectedRecovery(options);
    if (r.c.enable) fail('stopped_update_enable_pending');
    if (r.proofHash !== options.expectedProofHash || r.c.present.some(Boolean)) fail('stopped_update_enable_proof');
    c = r.c; ready = r.ready;
  }
  endpoint(c.server); fullVerified(c, ready);
  const completion = read(path.join(c.directory, 'completed.json')), completed = decode(c, completion, 'update-completed'), barrier = path.join(c.old.stateDir, 'runtime-maintenance.json');
  if (!sameFact(read(barrier), completed.barrier) || completed.readyHash !== c.ready.hash || read(path.join(c.directory, 'enable-intent.json')).bytes) fail('stopped_update_enable_pending');
  const before = recoveryFacts(c, ready), a = await actor(c.next);
  if (!equal(recoveryFacts(c, ready), before)) fail('stopped_update_proof_changed');
  const gates = ['install', 'broker'].map(role => seal(c, 'update-enable-gate', { actor: a, role, nonce: crypto.randomUUID() })), cap = Object.freeze({});
  const intent = atomic(path.join(c.directory, 'enable-intent.json'), seal(c, 'update-enable-intent', { actor: a, completionHash: completion.hash, barrier: completed.barrier, gates: gates.map(b => b.toString('base64')) }));
  leasePermits.set(cap, { scope: scope(c.old, c.descriptorPath), nonce: a.bootId, gates });
  try {
    c.lease = leases.acquireStoppedUpdateLease(cap);
    return completeEnable(c, ready, { actor: a, intent, completion, completed });
  } catch (error) { if (c.lease) leases.retainInstallLease(c.lease); error.leaseRetained = true; throw error; }
  finally { leasePermits.delete(cap); }
}
function completeEnable(c, ready, e) {
  fullVerified(c, ready);
  const barrier = path.join(c.old.stateDir, 'runtime-maintenance.json'), savedPath = path.join(c.directory, 'update-stop'), enabledPath = path.join(c.directory, 'enabled.json');
  const readyPath = path.join(c.directory, 'enable-ready.json'); let readyView = read(readyPath);
  if (!readyView.bytes) {
    if (!sameFact(read(barrier), e.completed.barrier)) fail('stopped_update_stop_changed');
    readyView = atomic(readyPath, seal(c, 'update-enable-ready', { actor: e.actor, intentHash: e.intent.hash, barrier: e.completed.barrier, gates: leases.maintenanceLeaseFacts(c.lease), readyHash: c.ready.hash, history: c.facts.snapshot }));
  } else {
    const b = decode(c, readyView, 'update-enable-ready');
    if (b.intentHash !== e.intent.hash || b.readyHash !== c.ready.hash || !equal(b.history, c.facts.snapshot) || !equal(b.barrier, e.completed.barrier)) fail('stopped_update_enable_record');
  }
  let current = read(barrier), saved = read(savedPath);
  if (current.bytes) {
    leases.assertInstallLease(c.lease, scope(c.old, c.descriptorPath), { full: true });
    if (!saved.bytes) { if (!sameFact(current, e.completed.barrier)) fail('stopped_update_stop_changed'); fs.linkSync(barrier, savedPath); saved = read(savedPath); current = read(barrier); }
    if (!sameFact(saved, e.completed.barrier, true) || !sameFact(current, e.completed.barrier, true) || !equal(saved.stat, current.stat)) fail('stopped_update_stop_changed');
    // Full verification and both private gates precede the sole explicit unlink.
    fullVerified(c, ready); leases.assertInstallLease(c.lease, scope(c.old, c.descriptorPath), { full: true }); fs.unlinkSync(barrier);
    if (read(barrier).bytes !== null) fail('stopped_update_stop_changed');
  } else if (!sameFact(saved, e.completed.barrier, true)) fail('stopped_update_stop_changed');
  const done = read(enabledPath);
  if (!done.bytes) atomic(enabledPath, seal(c, 'update-enabled', { actor: e.actor, intentHash: e.intent.hash, completionHash: e.completion.hash, history: c.facts.snapshot }));
  else { const b = decode(c, done, 'update-enabled'); if (b.intentHash !== e.intent.hash || b.completionHash !== e.completion.hash || !equal(b.history, c.facts.snapshot)) fail('stopped_update_enable_record'); }
  fullVerified(c, ready); leases.releaseInstallLease(c.lease); c.lease = null; c.enabled = true;
  return { enabled: true, sameDescriptor: true, transactionId: c.binding.transactionId, packageHash: c.next.packageHash, runtimeStarted: false, aeAuthority: false };
}
async function finishEnableStoppedUpdate(options) {
  if (!HEX.test(options.expectedProofHash)) fail('stopped_update_expected_proof');
  const r = await inspectedRecovery(options);
  if (!r.c.enable || r.proofHash !== options.expectedProofHash) fail('stopped_update_enable_proof');
  const a = await actor(r.c.next), now = readRecovery(options);
  if (!equal(now.facts, r.facts)) fail('stopped_update_proof_changed');
  const { c, ready } = now, e = c.enable;
  if (c.enableAttempts.length >= 16) fail('stopped_update_budget');
  const attemptId = crypto.randomUUID();
  atomic(path.join(c.directory, 'enable-recovery-' + attemptId + '.json'), seal(c, 'update-enable-recovery', { attemptId, parentHash: c.enableAttempts.at(-1)?.hash || null, actor: a, intentHash: e.intentView.hash, proofHash: now.proofHash }));
  const cap = Object.freeze({});
  leasePermits.set(cap, { scope: scope(c.old, c.descriptorPath), nonce: a.bootId, gates: c.gateBytes, recovery: true, recoverMissing: !e.ready, releaseOnly: !!e.enabledView.bytes, facts: c.gateFacts });
  try {
    c.lease = leases.acquireStoppedUpdateLease(cap);
    return { ...completeEnable(c, ready, { actor: a, intent: e.intentView, completion: read(path.join(c.directory, 'completed.json')), completed: decode(c, read(path.join(c.directory, 'completed.json')), 'update-completed') }), recovered: true };
  } catch (error) { if (c.lease) leases.retainInstallLease(c.lease); error.leaseRetained = true; throw error; }
  finally { leasePermits.delete(cap); }
}
function checkPreparedRecovery(c) {
  const p = c.source === 'owner' ? assertOwnerPreparedSource(c.sourceCapability) : require('./legacy-owner-migration').assertLegacyPreparedRecovery(c.sourceCapability);
  if (p.lease !== c.lease || p.installation !== c.old || p.descriptorPath !== c.descriptorPath || p.id !== c.stopId || !equal(p.facts, c.facts) || hash(canonical(p.payload)) !== c.payloadHash || p.reservedServer !== c.server) fail('stopped_update_prepared_brand');
  endpoint(c.server); leases.assertInstallLease(c.lease, scope(c.old, c.descriptorPath), { full: true }); checkStop(c);
  const pld = c.payload;
  if (!sameFact(read(c.descriptorPath), c.facts.snapshot.descriptor) || !sameFact(read(path.join(c.old.installRoot, 'core-client.json')), c.facts.snapshot.client) || read(pld.configPath).hash !== pld.baseline.config || hash(installer.snapshot(pld.cepDir)) !== pld.baseline.cep) fail('stopped_update_baseline_changed');
}
function preparedRecoveryContext(p, source, sourceCapability) {
  const payload = structuredClone(p.payload);
  verifyPackage(payload.package);
  const oldBytes = Buffer.from(payload.previousDescriptor || '', 'base64'), old = p.installation, next = JSON.parse(Buffer.from(payload.descriptorBytes, 'base64'));
  if (!Buffer.from(canonical(next)).equals(Buffer.from(payload.descriptorBytes, 'base64'))) fail('stopped_update_prepared_payload');
  if (!old || old.machineId !== os.hostname() || !UUID.test(payload.transactionId) || payload.version !== 1 || !equal(JSON.parse(oldBytes), old) || p.descriptorPath !== path.join(old.installRoot, 'installation.json') || payload.descriptorPath !== p.descriptorPath || next.installRoot !== old.installRoot || next.stateDir !== old.stateDir || next.installationId !== old.installationId || next.machineId !== old.machineId || next.releaseDir !== path.join(old.installRoot, 'releases', payload.package.packageHash) || next.packageHash !== payload.package.packageHash || next.cepDir !== payload.cepDir || next.cepDir !== old.cepDir || next.predecessor?.transactionId !== payload.transactionId || next.predecessor?.previousDescriptorHash !== hash(oldBytes) || payloadDigest(payload) !== payload.preparedPlanHash || runtimeBinding(payload.package.release, f => Buffer.from(payload.package.files[f], 'base64')).runtimeModel !== 'owner' || !payload.nextClient || payload.clientBinding.clientDescriptorPath !== path.join(old.installRoot, 'core-client.json') || p.facts.descriptorHash !== hash(oldBytes)) fail('stopped_update_prepared_payload');
  const c = { source, sourceCapability, old, oldBytes, next, descriptorPath: p.descriptorPath, stopId: p.id, facts: structuredClone(p.facts), server: p.reservedServer, lease: p.lease, payload, payloadHash: hash(canonical(payload)), binding: binding(old, next, payload.transactionId, oldBytes), directory: path.join(old.installRoot, 'transactions', payload.transactionId + '-stopped-update') };
  const runtime = runtimeBinding(payload.package.release, f => Buffer.from(payload.package.files[f], 'base64')), stdio = require('../runtime/stdio-entry');
  const expectedCep = Object.fromEntries(Object.entries(payload.package.files).filter(([file]) => file.startsWith('cep/')).map(([file, value]) => [file.slice(4), value]));
  expectedCep['installation.js'] = Buffer.from('window.Core4Installation=' + canonical(stdio.installationConfig(next, stdio.deriveComposition(payload.package.release, f => Buffer.from(payload.package.files[f], 'base64')))) + ';\n').toString('base64');
  const expectedClient = require('../runtime/client-entry').projectClientDescriptor(next, { originBytes: Buffer.from(payload.originBytes, 'base64') });
  if (!equal(payload.cep, expectedCep) || !Buffer.from(payload.nextClient, 'base64').equals(Buffer.from(canonical(expectedClient))) || !path.isAbsolute(payload.configPath) || path.resolve(payload.configPath) !== payload.configPath || !Buffer.from(payload.configBytes, 'base64').equals(Buffer.from(installer.configText(payload.previousConfig ? Buffer.from(payload.previousConfig, 'base64') : null, payload.clientBinding.clientDescriptorPath, next.nodePath, path.join(next.releaseDir, runtime.clientEntry), runtime.clientArgument))) || payload.baseline.descriptor !== hash(oldBytes) || payload.baseline.config !== (payload.previousConfig ? hash(Buffer.from(payload.previousConfig, 'base64')) : null) || payload.baseline.cep !== hash(payload.previousCep)) fail('stopped_update_prepared_payload');
  plain(old.installRoot, true); plain(path.dirname(next.cepDir), true);
  if (fs.lstatSync(old.installRoot, { bigint: true }).dev !== fs.lstatSync(path.dirname(next.cepDir), { bigint: true }).dev) fail('install_cross_volume_unsupported');
  return c;
}
async function createLegacyStoppedRecovery(sourceCapability) {
  const p = require('./legacy-owner-migration').assertLegacyPreparedRecovery(sourceCapability), c = preparedRecoveryContext(p, 'legacy', sourceCapability), { payload, old, oldBytes, next } = c;
  checkPreparedRecovery(c); let a = await actor(old); checkPreparedRecovery(c); c.actor = a;
  const fingerprint = { transactionId: payload.transactionId, packageHash: next.packageHash, appliedDescriptorHash: hash(Buffer.from(payload.descriptorBytes, 'base64')), previousDescriptorHash: hash(oldBytes), preparedPlanHash: payload.preparedPlanHash, preparedStateHash: c.payloadHash };
  c.fingerprint = fingerprint;
  try {
  if (!plain(c.directory, true, true)) fs.mkdirSync(c.directory);
  const gates = [...leases.ownedLeaseGates(c.lease).values()], existing = read(path.join(c.directory, 'intent.json'));
  if (!existing.bytes) {
    c.intent = info(atomic(path.join(c.directory, 'intent.json'), seal(c, 'update-intent', { source: 'legacy', stopId: c.stopId, actor: a, oldDescriptor: oldBytes.toString('base64'), newDescriptor: payload.descriptorBytes, fingerprint, facts: c.facts, gates: gates.map(b => b.toString('base64')), externalLease: true, payload })));
    c.leaseRecord = info(atomic(path.join(c.directory, 'lease.json'), seal(c, 'update-lease', { actor: a, intentHash: c.intent.hash, facts: leases.maintenanceLeaseFacts(c.lease), fingerprint })));
  } else {
    c.intent = info(existing); const intent = decode(c, existing, 'update-intent');
    if (intent.source !== 'legacy' || intent.stopId !== c.stopId || !equal(intent.payload, payload) || read(path.join(c.directory, 'switch-ready.json')).bytes) fail('stopped_update_prepared_phase');
    const chain = preparedChain(c, intent); factsExtend(chain.at(-1)?.facts || intent.facts, c.facts);
    if (chain.length >= 16) fail('stopped_update_budget');
    const previousTree = tree(c.directory);
    await dead(intent.actor); for (const previous of chain) await dead(previous.actor);
    a = await actor(old); c.actor = a; checkPreparedRecovery(c);
    if (!equal(tree(c.directory), previousTree)) fail('stopped_update_proof_changed');
    // Only the opaque legacy recovery port has admitted the old/new phase
    // extension and gate takeover. Retain every original record unchanged.
    const attemptId = crypto.randomUUID();
    c.leaseRecord = info(atomic(path.join(c.directory, 'pre-ready-' + attemptId + '.json'), seal(c, 'update-pre-ready-recovery', { attemptId, parentHash: chain.at(-1)?.hash || null, intentHash: c.intent.hash, actor: a, payloadHash: c.payloadHash, facts: c.facts, gates: gates.map(b => b.toString('base64')), leaseFacts: leases.maintenanceLeaseFacts(c.lease), fingerprint })));
  }
  updateDirectoryFacts(c);
  const capability = Object.freeze({}); preparedRecoveries.set(capability, c); return capability;
  } catch (error) { leases.retainInstallLease(c.lease); error.leaseRetained = true; throw error; }
}
function ownerPreparedCertificatePermit(capability) {
  const p = ownerCertificatePermits.get(capability); if (!p) fail('stopped_update_prepared_brand'); return p;
}
function ownerCertificate(c) {
  const cap = Object.freeze({});
  ownerCertificatePermits.set(cap, { installation: c.old, descriptorPath: c.descriptorPath, reservedServer: c.server, id: c.stopId, expectedFacts: c.facts, owned: c.gates });
  try { return require('../runtime/stopped-certification').readStoppedUpdateCertificate(cap); }
  finally { ownerCertificatePermits.delete(cap); }
}
function exactKeys(value, keys) {
  if (!value || !equal(Object.keys(value).sort(), [...keys].sort())) fail('stopped_update_record');
}
function ownerAttemptId(parentHash) {
  // One exclusive publication name per parent serializes competing actors.
  const h = hash('ae-core4/owner-pre-ready/claim/v1\0' + parentHash);
  return h.slice(0, 8) + '-' + h.slice(8, 12) + '-4' + h.slice(13, 16) + '-8' + h.slice(17, 20) + '-' + h.slice(20, 32);
}
function ownerPaths(c) {
  const p = c.payload, root = c.old.installRoot, id = p.transactionId;
  return { descriptorPath: c.descriptorPath, clientPath: p.clientBinding.clientDescriptorPath, configPath: p.configPath, cepDir: p.cepDir, cepStage: path.join(root, 'transactions', id + '-cep-next'), backupCep: path.join(root, 'transactions', id + '-cep'), txnFile: path.join(root, 'transactions', id + '.json') };
}
function preparedTransaction(c, paths) {
  const p = c.payload, d = c.next;
  return { version: 2, transactionId: p.transactionId, preparedPlanHash: p.preparedPlanHash, preparedStateHash: c.payloadHash, clientBinding: p.clientBinding, originBinding: { version: 1, rootOriginHash: hash(Buffer.from(p.originBytes, 'base64')), anchorOriginHash: hash(Buffer.from(p.originBytes, 'base64')) }, installRoot: d.installRoot, descriptorPath: c.descriptorPath, configPath: p.configPath, cepDir: p.cepDir, backupCep: paths.backupCep, previousDescriptor: p.previousDescriptor, previousConfig: p.previousConfig, previousCepHash: hash(p.previousCep), appliedDescriptorHash: hash(Buffer.from(p.descriptorBytes, 'base64')), appliedConfigHash: hash(Buffer.from(p.configBytes, 'base64')), appliedCepHash: hash(p.cep), stateDir: d.stateDir };
}
function ownerStaging(c) {
  const p = c.payload, paths = ownerPaths(c), prepared = path.join(c.old.installRoot, 'transactions', p.transactionId + '-prepared');
  if (plain(paths.backupCep, true, true)) fail('stopped_update_prepared_phase');
  const encoded = value => Buffer.from(value).toString('base64');
  const expectedPrepared = { 'prepared.json': encoded(canonical(p)), 'descriptor.json': p.descriptorBytes, 'client.json': p.nextClient };
  assertCepStageSubset(prepared, expectedPrepared); assertCepStageSubset(paths.cepStage, p.cep);
  assertCepStageSubset(c.next.releaseDir, { ...p.package.files, 'release.json': encoded(canonical(p.package.release)) });
  for (const [file, bytes] of [[c.descriptorPath + '.next', p.descriptorBytes], [paths.clientPath + '.next', p.nextClient], [p.configPath + '.core4-next', p.configBytes], [paths.txnFile, encoded(canonical(preparedTransaction(c, paths)))]]) {
    const v = read(file); if (v.bytes && !v.bytes.equals(Buffer.from(bytes, 'base64'))) fail('stopped_update_staging_changed');
  }
  if (!sameFact(read(c.descriptorPath), c.facts.snapshot.descriptor) || !sameFact(read(paths.clientPath), c.facts.snapshot.client) || read(p.configPath).hash !== p.baseline.config || hash(installer.snapshot(p.cepDir)) !== p.baseline.cep) fail('stopped_update_baseline_changed');
  return { visible: switchViews(c, paths), prepared: tree(prepared), transaction: info(read(paths.txnFile)), release: tree(c.next.releaseDir) };
}
function readOwnerPreReady(options) {
  const { installation: old, descriptorPath, transactionId, expectedPreviousDescriptorHash, expectedPackageHash, reservedServer } = options;
  endpoint(reservedServer);
  if (!old || old.machineId !== os.hostname() || !UUID.test(transactionId) || !HEX.test(expectedPreviousDescriptorHash) || !HEX.test(expectedPackageHash) || descriptorPath !== path.join(old.installRoot, 'installation.json') || old.stateDir !== path.join(old.installRoot, 'state/production')) fail('stopped_update_recovery_scope');
  const directory = path.join(old.installRoot, 'transactions', transactionId + '-stopped-update'), v = read(path.join(directory, 'intent.json'));
  let raw; try { raw = JSON.parse(v.bytes).body; } catch { fail('stopped_update_record'); }
  const c = preparedRecoveryContext({ installation: old, descriptorPath, id: raw.stopId, facts: raw.facts, reservedServer, payload: raw.payload, lease: null }, 'owner', null);
  if (c.directory !== directory || hash(c.oldBytes) !== expectedPreviousDescriptorHash || c.next.packageHash !== expectedPackageHash || c.next.packageHash === old.packageHash || raw.oldDescriptor !== c.payload.previousDescriptor || raw.newDescriptor !== c.payload.descriptorBytes) fail('stopped_update_recovery_scope');
  const intent = decode(c, v, 'update-intent');
  exactKeys(intent, [...Object.keys(c.binding), 'kind', 'source', 'stopId', 'actor', 'oldDescriptor', 'newDescriptor', 'fingerprint', 'facts', 'gates', 'externalLease', 'payload']);
  exactKeys(c.payload, ['version', 'transactionId', 'preparedPlanHash', 'package', 'origin', 'originBytes', 'clientBinding', 'nextClient', 'descriptorBytes', 'descriptorPath', 'configPath', 'configBytes', 'cepDir', 'cep', 'previousDescriptor', 'previousConfig', 'previousCep', 'baseline']);
  if (intent.source !== 'owner' || intent.externalLease !== false || !UUID.test(intent.stopId) || !Array.isArray(intent.gates) || intent.gates.length !== 2 || read(path.join(directory, 'switch-ready.json')).bytes) fail('stopped_update_prepared_phase');
  c.intent = info(v); c.originalActor = intent.actor;
  c.fingerprint = { transactionId, packageHash: c.next.packageHash, appliedDescriptorHash: hash(Buffer.from(c.payload.descriptorBytes, 'base64')), previousDescriptorHash: hash(c.oldBytes), preparedPlanHash: c.payload.preparedPlanHash, preparedStateHash: c.payloadHash };
  if (!equal(intent.fingerprint, { ...c.fingerprint, preparedStateHash: null })) fail('stopped_update_record');
  c.gateBytes = intent.gates.map(s => { const b = Buffer.from(s, 'base64'); if (b.toString('base64') !== s) fail('stopped_update_record'); return b; });
  c.gateBytes.forEach((bytes, index) => { const b = decode(c, { bytes }, 'update-lease-gate'); exactKeys(b, [...Object.keys(c.binding), 'kind', 'actor', 'role', 'nonce']); if (b.role !== ['install', 'broker'][index] || !equal(b.actor, intent.actor) || !UUID.test(b.nonce)) fail('stopped_update_record'); });
  c.preAttempts = preparedChain(c, intent);
  let expected = null;
  const lease = read(path.join(directory, 'lease.json'));
  if (lease.bytes) { const b = decode(c, lease, 'update-lease'); if (b.intentHash !== v.hash || !equal(b.actor, intent.actor) || !equal(b.fingerprint, c.fingerprint)) fail('stopped_update_record'); expected = b.facts; }
  const allowed = new Set(['', 'intent.json', ...(lease.bytes ? ['lease.json'] : [])]);
  for (const [index, a] of c.preAttempts.entries()) {
    exactKeys(a, [...Object.keys(c.binding), 'kind', 'attemptId', 'parentHash', 'intentHash', 'actor', 'payloadHash', 'facts', 'gates', 'leaseFacts', 'fingerprint', 'hash', 'stat']);
    if (a.attemptId !== ownerAttemptId(index ? c.preAttempts[index - 1].hash : v.hash) || !equal(a.facts, intent.facts) || !equal(a.gates, intent.gates) || !equal(a.fingerprint, c.fingerprint)) fail('stopped_update_prepared_chain');
    allowed.add('pre-ready-' + a.attemptId + '.json');
    if (expected) for (const [i, fact] of expected.entries()) if (fact.stat && !equal(fact, a.leaseFacts[i])) fail('stopped_update_lease_changed');
    expected = a.leaseFacts;
    const receiptName = 'pre-ready-' + a.attemptId + '-lease.json', receipt = read(path.join(directory, receiptName));
    if (receipt.bytes) {
      const b = decode(c, receipt, 'update-pre-ready-lease');
      exactKeys(b, [...Object.keys(c.binding), 'kind', 'intentHash', 'attemptHash', 'actor', 'facts', 'fingerprint']);
      if (b.intentHash !== v.hash || b.attemptHash !== a.hash || !equal(b.actor, a.actor) || !equal(b.fingerprint, c.fingerprint) || !Array.isArray(b.facts) || b.facts.length !== 2 || b.facts.some(f => !f.stat)) fail('stopped_update_record');
      for (const [i, fact] of expected.entries()) if (fact.stat && !equal(fact, b.facts[i])) fail('stopped_update_lease_changed');
      expected = b.facts; allowed.add(receiptName);
    }
  }
  const update = updateDirectoryFacts(c);
  for (const name of Object.keys(update)) { const base = name.replace(/\.stage-[a-f0-9-]{36}$/, ''); if (!allowed.has(base)) fail('stopped_update_prepared_phase'); }
  c.gates = new Map(); c.gateFacts = [];
  for (const [index, file] of [path.join(old.installRoot, 'install.lock'), path.join(old.stateDir, 'broker/broker-owner.gate')].entries()) {
    const actual = read(file), prior = expected?.[index];
    if (actual.bytes && !actual.bytes.equals(c.gateBytes[index]) || prior && (prior.file !== file || prior.hash !== hash(c.gateBytes[index]) || prior.stat && !sameFact(actual, prior))) fail('stopped_update_lease_changed');
    c.gateFacts.push({ file, hash: hash(c.gateBytes[index]), stat: actual.stat }); if (actual.bytes) c.gates.set(file, c.gateBytes[index]);
  }
  if (!c.gateFacts[0].stat && c.gateFacts[1].stat) fail('stopped_update_lease_changed');
  const certificate = ownerCertificate(c), staging = ownerStaging(c); checkStop(c);
  c.hostAdoption = info(read(path.join(old.stateDir, 'host-adoption.json')));
  const facts = { update, ...staging, hostAdoption: c.hostAdoption, gates: c.gateFacts, certificate: certificate.facts, barrier: info(read(path.join(old.stateDir, 'runtime-maintenance.json'))) };
  return { c, facts, certificateActors: certificate.actors, proofHash: hash({ binding: c.binding, facts }) };
}
async function inspectedOwnerPreReady(options) {
  const first = readOwnerPreReady(options);
  for (const a of [first.c.originalActor, ...first.c.preAttempts.map(a => a.actor), ...first.certificateActors]) {
    await dead(a); const current = readOwnerPreReady(options); if (!equal(current.facts, first.facts)) fail('stopped_update_proof_changed');
  }
  const final = readOwnerPreReady(options); if (!equal(final.facts, first.facts)) fail('stopped_update_proof_changed'); return final;
}
async function inspectOwnerPreReady(options) {
  const r = await inspectedOwnerPreReady(options);
  return Object.freeze({ transactionId: r.c.binding.transactionId, phase: 'owner-pre-ready', proofHash: r.proofHash, gatePrefix: r.c.gateFacts.filter(f => f.stat).length, inspectionOnly: true, runtimeStarted: false, aeAuthority: false });
}
function assertOwnerPreparedSource(capability) {
  const c = ownerPreparedSources.get(capability); if (!c || !c.lease) fail('stopped_update_prepared_brand');
  endpoint(c.server); leases.assertInstallLease(c.lease, scope(c.old, c.descriptorPath), { full: true }); ownerCertificate(c);
  if (!equal(tree(c.directory), c.ownerRecordFacts)) fail('stopped_update_proof_changed');
  if (!sameFact(read(path.join(c.old.stateDir, 'host-adoption.json')), c.hostAdoption)) fail('stopped_update_proof_changed');
  ownerStaging(c);
  return { lease: c.lease, installation: c.old, descriptorPath: c.descriptorPath, id: c.stopId, facts: c.facts, payload: c.payload, reservedServer: c.server };
}
async function finishOwnerPreReady(options) {
  if (!HEX.test(options.expectedProofHash)) fail('stopped_update_expected_proof');
  const r = await inspectedOwnerPreReady(options); if (r.proofHash !== options.expectedProofHash) fail('stopped_update_proof_changed');
  const a = await actor(r.c.old), now = readOwnerPreReady(options);
  if (!equal(now.facts, r.facts)) fail('stopped_update_proof_changed');
  const c = now.c, parentHash = c.preAttempts.at(-1)?.hash || null, attemptId = ownerAttemptId(parentHash || c.intent.hash), cap = Object.freeze({});
  if (c.preAttempts.length >= 16) fail('stopped_update_budget');
  c.actor = a;
  // Before filling even a missing gate, identify the new operator durably.
  // The original role bytes remain unchanged and continuously held once present.
  const attempt = atomic(path.join(c.directory, 'pre-ready-' + attemptId + '.json'), seal(c, 'update-pre-ready-recovery', { attemptId, parentHash, intentHash: c.intent.hash, actor: a, payloadHash: c.payloadHash, facts: c.facts, gates: c.gateBytes.map(b => b.toString('base64')), leaseFacts: c.gateFacts, fingerprint: c.fingerprint }), true);
  try {
    leasePermits.set(cap, { scope: scope(c.old, c.descriptorPath), nonce: a.bootId, gates: c.gateBytes, facts: c.gateFacts, recovery: true, recoverMissing: true });
    c.lease = leases.acquireStoppedUpdateLease(cap); leases.assertInstallLease(c.lease, scope(c.old, c.descriptorPath), { full: true });
    c.gates = leases.ownedLeaseGates(c.lease); ownerCertificate(c); ownerStaging(c); checkStop(c);
    c.leaseRecord = info(atomic(path.join(c.directory, 'pre-ready-' + attemptId + '-lease.json'), seal(c, 'update-pre-ready-lease', { intentHash: c.intent.hash, attemptHash: attempt.hash, actor: a, facts: leases.maintenanceLeaseFacts(c.lease), fingerprint: c.fingerprint })));
    const final = readOwnerPreReady(options);
    for (const key of ['visible', 'prepared', 'transaction', 'release', 'hostAdoption', 'certificate', 'barrier']) if (!equal(final.facts[key], r.facts[key])) fail('stopped_update_proof_changed');
    for (const [name, fact] of Object.entries(r.facts.update).filter(([name]) => name)) if (!equal(final.facts.update[name], fact)) fail('stopped_update_proof_changed');
    c.sourceCapability = cap; c.ownerRecordFacts = final.facts.update; ownerPreparedSources.set(cap, c); preparedRecoveries.set(cap, c);
    return stageStoppedRecovery(cap);
  } catch (error) { if (c.lease) leases.retainInstallLease(c.lease); error.leaseRetained = true; error.transactionId = c.binding.transactionId; throw error; }
  finally { leasePermits.delete(cap); ownerPreparedSources.delete(cap); }
}
function writeExact(file, expected) {
  const bytes = Buffer.isBuffer(expected) ? expected : Buffer.from(expected), current = read(file);
  if (current.bytes) { if (!current.bytes.equals(bytes)) fail('stopped_update_staging_changed'); return; }
  fs.mkdirSync(path.dirname(file), { recursive: true }); plain(path.dirname(file), true); atomic(file, bytes);
}
function assertCepStageSubset(directory, expected) {
  if (!plain(directory, true, true)) return false;
  const files = new Set(Object.keys(expected)), directories = new Set(['']);
  for (const file of files) for (let dir = path.posix.dirname(file); dir !== '.'; dir = path.posix.dirname(dir)) directories.add(dir);
  function visit(dir, relative) {
    plain(dir, true); if (!directories.has(relative)) fail('stopped_update_staging_changed');
    for (const name of fs.readdirSync(dir)) {
      const file = path.join(dir, name), rel = relative ? relative + '/' + name : name, s = fs.lstatSync(file);
      if (s.isSymbolicLink() || s.reparsePoint) fail('stopped_update_staging_changed');
      if (s.isDirectory()) visit(file, rel);
      else if (!s.isFile() || !files.has(rel) || !read(file).bytes?.equals(Buffer.from(expected[rel], 'base64'))) fail('stopped_update_staging_changed');
    }
  }
  visit(directory, ''); return true;
}
function stageStoppedRecovery(capability) {
  const c = preparedRecoveries.get(capability);
  if (!c || c.consumed) fail('stopped_update_prepared_brand'); checkPreparedRecovery(c); c.consumed = true;
  const p = c.payload, d = c.next, id = p.transactionId, prepared = path.join(d.installRoot, 'transactions', id + '-prepared');
  const paths = { descriptorPath: c.descriptorPath, clientPath: p.clientBinding.clientDescriptorPath, configPath: p.configPath, cepDir: p.cepDir, cepStage: path.join(d.installRoot, 'transactions', id + '-cep-next'), backupCep: path.join(d.installRoot, 'transactions', id + '-cep'), txnFile: path.join(d.installRoot, 'transactions', id + '.json') };
  try {
    if (plain(paths.backupCep, true, true)) fail('stopped_update_prepared_phase');
    // A previous operator may have published only a prefix of CEP stage files.
    // Validate the whole existing subset before any fill writes; foreign files,
    // empty directories and modified bytes remain untouched and fenced.
    assertCepStageSubset(paths.cepStage, p.cep);
    if (c.source === 'owner') {
      // Under the stopped gate, this exact target can retain a validated prefix
      // after a crash. No random release stage or new payload is introduced.
      assertCepStageSubset(d.releaseDir, { ...p.package.files, 'release.json': Buffer.from(canonical(p.package.release)).toString('base64') });
      for (const [file, bytes] of Object.entries(p.package.files)) writeExact(path.join(d.releaseDir, file), Buffer.from(bytes, 'base64'));
      writeExact(path.join(d.releaseDir, 'release.json'), canonical(p.package.release));
    } else if (!plain(d.releaseDir, true, true)) {
      const releaseStage = path.join(d.installRoot, 'releases', '.stage-' + crypto.randomUUID());
      for (const [file, bytes] of Object.entries(p.package.files)) writeExact(path.join(releaseStage, file), Buffer.from(bytes, 'base64'));
      writeExact(path.join(releaseStage, 'release.json'), canonical(p.package.release)); installer.checkRelease(releaseStage, p.package.release); fs.renameSync(releaseStage, d.releaseDir);
    }
    installer.checkRelease(d.releaseDir, p.package.release);
    fs.mkdirSync(prepared, { recursive: true }); plain(prepared, true);
    writeExact(path.join(prepared, 'prepared.json'), canonical(p)); writeExact(path.join(prepared, 'descriptor.json'), Buffer.from(p.descriptorBytes, 'base64')); writeExact(path.join(prepared, 'client.json'), Buffer.from(p.nextClient, 'base64'));
    if (!equal(fs.readdirSync(prepared).sort(), ['client.json', 'descriptor.json', 'prepared.json'])) fail('stopped_update_prepared_changed');
    if (!assertCepStageSubset(paths.cepStage, p.cep)) fs.mkdirSync(paths.cepStage);
    for (const [file, bytes] of Object.entries(p.cep)) writeExact(path.join(paths.cepStage, file), Buffer.from(bytes, 'base64'));
    assertCepStageSubset(paths.cepStage, p.cep);
    if (!equal(installer.snapshot(paths.cepStage), p.cep)) fail('stopped_update_staging_changed');
    writeExact(c.descriptorPath + '.next', Buffer.from(p.descriptorBytes, 'base64')); writeExact(paths.clientPath + '.next', Buffer.from(p.nextClient, 'base64')); writeExact(p.configPath + '.core4-next', Buffer.from(p.configBytes, 'base64'));
    const txn = { version: 2, transactionId: id, preparedPlanHash: p.preparedPlanHash, preparedStateHash: c.payloadHash, clientBinding: p.clientBinding, originBinding: { version: 1, rootOriginHash: hash(Buffer.from(p.originBytes, 'base64')), anchorOriginHash: hash(Buffer.from(p.originBytes, 'base64')) }, installRoot: d.installRoot, descriptorPath: c.descriptorPath, configPath: p.configPath, cepDir: p.cepDir, backupCep: paths.backupCep, previousDescriptor: p.previousDescriptor, previousConfig: p.previousConfig, previousCepHash: hash(p.previousCep), appliedDescriptorHash: hash(Buffer.from(p.descriptorBytes, 'base64')), appliedConfigHash: hash(Buffer.from(p.configBytes, 'base64')), appliedCepHash: hash(p.cep), stateDir: d.stateDir };
    writeExact(paths.txnFile, canonical(txn)); checkPreparedRecovery(c);
    const views = switchViews(c, paths), ready = { actor: c.actor, intentHash: c.intent.hash, leaseHash: c.leaseRecord.hash, fingerprint: c.fingerprint, paths, views, transaction: info(read(paths.txnFile)), prepared: tree(prepared) };
    c.ready = info(atomic(path.join(c.directory, 'switch-ready.json'), seal(c, 'update-switch-ready', ready)));
    validatePayload(c, ready); if (appliedViews(c, ready) !== 0) fail('stopped_update_switch_prefix');
    recoveries.set(capability, { c, ready, phase: 0, facts: recoveryFacts(c, ready) });
    renameRecovery(capability, paths.cepDir, paths.backupCep, views.cep, true); renameRecovery(capability, paths.cepStage, paths.cepDir, views.cepStage, true);
    renameRecovery(capability, c.descriptorPath + '.next', c.descriptorPath, views.descriptorStage); renameRecovery(capability, paths.clientPath + '.next', paths.clientPath, views.clientStage); renameRecovery(capability, p.configPath + '.core4-next', p.configPath, views.configStage);
    const result = finish(c, ready); leases.releaseInstallLease(c.lease); c.lease = null; return { ...result, recovered: true };
  } catch (error) { if (c.lease) leases.retainInstallLease(c.lease); error.leaseRetained = true; throw error; }
  finally { preparedRecoveries.delete(capability); recoveries.delete(capability); }
}
module.exports = { prepareStoppedUpdate, prepareLegacyStoppedUpdate, applyStoppedUpdate, inspectStoppedUpdate, finishStoppedUpdate,
  enableStoppedUpdate, finishEnableStoppedUpdate, createLegacyStoppedRecovery, stageStoppedRecovery,
  inspectOwnerPreReady, finishOwnerPreReady, ownerPreparedCertificatePermit,
  assertStoppedUpdatePermit, stoppedUpdateSwitchReady, stoppedUpdateLeasePermit, acquireStoppedReadoptionLease };

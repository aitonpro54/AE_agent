'use strict';
// Synthetic process births/verifier; real TEMP files, retained FDs and port0.
const nodeTest = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), http = require('node:http'), Module = require('node:module');
const { canonical, hash } = require('../protocol/json');
const { dispatchBinding } = require('../protocol/dispatch');
const { fixture } = require('./fixtures/owner-lifecycle-fixture');
const { classifyOwnerProcess } = require('../runtime/windows-owner-process');
const test = (name, fn, options = {}) => nodeTest('stopped-certification ' + name, { timeout: 15000, ...options }, fn);
const bytes = file => fs.existsSync(file) ? fs.readFileSync(file) : null;
const code = expected => e => e.code === expected;
const syntheticCrash = () => Object.assign(Error('synthetic phase crash'), { code: 'fixture_phase_crash' });
async function harness(t, phase = 'absent') {
  const f = await fixture(t); fs.writeFileSync(path.join(f.root, 'core-client.json'), canonical({ fixture: 'role-only-client' }));
  const owner = await f.create(), stores = f.stores(owner);
  if (phase === 'ready-archive') {
    const rename = f.io.renameSync; let fired = false;
    f.io.renameSync = (from, to) => { const value = rename(from, to); if (!fired && path.basename(to) === 'starting-owner') { fired = true; throw syntheticCrash(); } return value; };
    try { assert.throws(() => owner.markReady(), code('fixture_phase_crash')); } finally { f.io.renameSync = rename; }
    assert.equal(fired, true);
  } else { owner.markReady(); owner.releaseStartup(); }
  let birth = BigInt(owner.state().birthTicks), probeHook, unavailable = false, server;
  const modules = new Map();
  function load(name) {
    if (modules.has(name)) return modules.get(name).exports;
    const filename = path.resolve(__dirname, '../runtime/' + name + '.js'), mod = new Module(filename, module); modules.set(name, mod); mod.filename = filename; mod.paths = Module._nodeModulePaths(path.dirname(filename));
    mod.require = target => {
      if (target === 'node:fs') return f.io;
      if (['./owner-maintenance', './owner-lifecycle', './stopped-certification', './install-lease'].includes(target)) return load(target.slice(2));
      if (target === './stdio-entry') return { verifyInstallation(file) { assert.equal(file, f.descriptorPath); return JSON.parse(fs.readFileSync(file)); } };
      if (target === './windows-owner-process') return { classifyOwnerProcess, async observeOwnerProcess(pid) {
        if (probeHook) await probeHook(pid);
        if (unavailable) throw Object.assign(Error('owner_process_probe_unavailable'), { code: 'owner_process_probe_unavailable' });
        return { version: 1, pid, status: 'present', birthTicks: String(birth), executablePath: process.execPath, observedAt: new Date().toISOString() };
      } };
      return require(target.startsWith('.') ? path.resolve(path.dirname(filename), target) : target);
    };
    mod._compile(fs.readFileSync(filename, 'utf8'), filename); return mod.exports;
  }
  const api = load('stopped-certification'), maintenance = load('owner-maintenance'), id = crypto.randomUUID();
  const s = owner.state(), originalScope = { bootId: s.processBootId, pid: s.pid, birthTicks: s.birthTicks };
  const m = maintenance.createOwnerMaintenance({ installation: f.d, descriptorPath: f.descriptorPath, lifecycle: owner, freeze() {}, activity: () => ({ pending: false }), accepted: () => 0,
    async close() {
      if (phase === 'absent' || phase === 'receipt') f.close(owner, stores);
      else if (phase === 'shutdown') { owner.beginClose(); stores.store.close(); stores.lock.release(); }
      else if (phase === 'shutdown-archive') {
        owner.beginClose(); stores.store.close(); stores.lock.release();
        const rename = f.io.renameSync; let fired = false;
        f.io.renameSync = (from, to) => { const value = rename(from, to); if (!fired && path.basename(to) === 'owner') { fired = true; throw syntheticCrash(); } return value; };
        try { owner.finishClose(); } finally { f.io.renameSync = rename; }
      }
      if (phase !== 'receipt') throw syntheticCrash();
    }, intervalMs: 1 });
  m.request(maintenance.createStopAuthorization({ installation: f.d, descriptorPath: f.descriptorPath, scope: originalScope, id })); await m.done;
  async function reserved() { if (!server) { server = http.createServer(); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); t.after(() => new Promise(resolve => server.close(resolve))); } return server; }
  const options = async () => ({ installation: f.d, descriptorPath: f.descriptorPath, id, reservedServer: await reserved() });
  const h = { f, owner, stores, api, maintenance, load, id, originalScope, path: name => path.join(f.root, 'transactions', id + '-owner-maintenance', name),
    options, onProbe(fn) { probeHook = fn; }, unavailable(v) { unavailable = v; },
    async dead() { await f.crash(); birth += 10n; },
    inspect: async () => api.inspectStoppedCertification(await options()),
    certify: async expectedProofHash => api.certifyStoppedInstallation({ ...await options(), expectedProofHash }),
    assert: (cert, lease) => api.assertStoppedCertificate(cert, { installation: f.d, descriptorPath: f.descriptorPath, id, ...(lease ? { lease } : {}) }) };
  return h;
}
function inject(h, method, intercept) { const previous = h.f.io[method]; h.f.io[method] = (...args) => intercept(previous, ...args); return () => { h.f.io[method] = previous; }; }
function protectedBytes(h) { return Object.fromEntries([h.f.descriptorPath, path.join(h.f.root, 'origin.json'), h.f.path('origin.json'), path.join(h.f.root, 'core-client.json'), h.f.path('receiver/completions.ndjson'), h.f.path('broker/ledger.ndjson'), h.f.path('runtime-maintenance.json')].map(file => [file, bytes(file)])); }
function unchanged(saved) { for (const [file, value] of Object.entries(saved)) assert.deepEqual(bytes(file), value, file); }

test('absent markers certify a new actor without forging an old-owner stopped receipt', async t => {
  const h = await harness(t); assert.equal(bytes(h.path('stopped.json')), null);
  await assert.rejects(h.inspect(), code('stopped_certification_process_not_dead'));
  await h.dead(); const saved = protectedBytes(h), inspection = await h.inspect(), cert = await h.certify(inspection.proofHash), facts = h.assert(cert);
  assert.equal(inspection.phase, 'stopped-certifiable'); assert.equal(facts.certificateHash, hash(bytes(h.path('stopped-certificate.json'))));
  const body = JSON.parse(bytes(h.path('stopped-certificate.json'))).body;
  assert.equal(body.kind, 'maintenance-stopped-certificate'); assert.deepEqual(body.originalScope, h.originalScope); assert.notEqual(body.certifier.birthTicks, h.originalScope.birthTicks);
  assert.equal(bytes(h.path('stopped.json')), null); assert.equal(bytes(h.f.path('runtime-owner.json')), null); unchanged(saved);
  assert.throws(() => h.assert({ ...cert }), code('stopped_certification_brand'));
  assert.throws(() => h.api.assertStoppedCertificate(cert, { installation: { ...h.f.d }, descriptorPath: h.f.descriptorPath, id: h.id }), code('stopped_certification_brand'));
  const copy = h.api.stoppedCertificateFacts(cert); copy.snapshot.client.hash = 'f'.repeat(64); assert.notEqual(h.assert(cert).snapshot.client.hash, copy.snapshot.client.hash);
});

for (const name of ['runtime-owner.json', 'install.lock']) test('late foreign ' + name + ' after retirement snapshot refuses certificate issuance', async t => {
  const h = await harness(t); await h.dead(); const inspection = await h.inspect(), lifecycle = h.load('owner-lifecycle');
  const inspect = lifecycle.inspectStoppedLifecycle, retire = lifecycle.retireStoppedLifecycle; let retired = false, injected = false;
  lifecycle.retireStoppedLifecycle = async capability => { const result = await retire(capability); retired = true; return result; };
  lifecycle.inspectStoppedLifecycle = async capability => { const result = await inspect(capability); if (retired && !injected) { injected = true; fs.writeFileSync(name === 'install.lock' ? path.join(h.f.root, name) : h.f.path(name), '{}'); } return result; };
  try { await assert.rejects(h.certify(inspection.proofHash), code('stopped_certification_changed')); assert.equal(bytes(h.path('stopped-certificate.json')), null); }
  finally { lifecycle.inspectStoppedLifecycle = inspect; lifecycle.retireStoppedLifecycle = retire; }
});

test('post-retirement replacement of an existing lifecycle intent refuses certificate issuance', async t => {
  const h = await harness(t, 'shutdown-archive'); await h.dead(); const inspection = await h.inspect();
  const transactionRoot = path.join(h.f.root, 'transactions'), recoveryId = JSON.parse(bytes(path.join(h.f.root, 'install.lock'))).body.recoveryId;
  const prior = path.join(transactionRoot, recoveryId + '-owner-lifecycle', 'intent.json');
  assert.ok(prior); const lifecycle = h.load('owner-lifecycle'), retire = lifecycle.retireStoppedLifecycle;
  lifecycle.retireStoppedLifecycle = async capability => { const result = await retire(capability); const original = fs.readFileSync(prior); fs.renameSync(prior, path.join(h.f.root, 'retained-prior-intent')); fs.writeFileSync(prior, original); return result; };
  try { await assert.rejects(h.certify(inspection.proofHash), code('stopped_certification_changed')); assert.equal(bytes(h.path('stopped-certificate.json')), null); }
  finally { lifecycle.retireStoppedLifecycle = retire; }
});

for (const phase of ['owner', 'shutdown', 'receipt']) test('recognized ' + phase + ' retires exact markers and leaves stop/history unchanged', async t => {
  const h = await harness(t, phase), originalOwner = bytes(h.f.path('runtime-owner.json')); await h.dead(); const saved = protectedBytes(h), inspection = await h.inspect(), cert = await h.certify(inspection.proofHash);
  h.assert(cert); unchanged(saved);
  for (const name of ['runtime-owner.json', 'runtime-owner.next', 'runtime-diagnostic.json', 'broker/broker-owner.lock', 'broker/broker-owner.gate', 'receiver/owner']) assert.equal(bytes(h.f.path(name)), null, name);
  assert.equal(bytes(path.join(h.f.root, 'install.lock')), null);
  if (originalOwner) assert.deepEqual(bytes(path.join(h.f.root, 'transactions', h.id + '-owner-lifecycle', 'owner')), originalOwner);
  if (phase === 'shutdown') assert.ok(bytes(h.path('retired-install-gate')));
  assert.equal((await h.inspect()).phase, 'stopped-certified');
});

for (const phase of ['ready-archive', 'shutdown-archive']) test('existing interrupted ' + phase + ' uses original lifecycle guards without execution-owner startup', async t => {
  const h = await harness(t, phase); await h.dead(); const saved = protectedBytes(h), before = h.f.snapshot();
  const restores = ['renameSync', 'linkSync'].map(method => inject(h, method, (operation, from, to) => { assert.notEqual(to, h.f.path('runtime-owner.json'), 'retirement must never publish an execution owner'); return operation(from, to); }));
  let cert; try { cert = await h.certify((await h.inspect()).proofHash); } finally { restores.forEach(restore => restore()); } h.assert(cert); unchanged(saved);
  assert.equal(bytes(h.f.path('runtime-owner.json')), null); assert.equal(bytes(h.f.path('runtime-owner.next')), null);
  assert.ok(bytes(h.path('retired-install-gate')));
  // Only existing ready/recovery records and this stop's retirement may appear.
  const newOwners = Object.keys(h.f.snapshot()).filter(n => n.endsWith('runtime-owner.json') && !Object.hasOwn(before, n)); assert.deepEqual(newOwners, []);
});

test('branded installer lease excludes only its exact held gates', async t => {
  const h = await harness(t, 'shutdown'); await h.dead(); const cert = await h.certify((await h.inspect()).proofHash), leaseApi = h.load('install-lease');
  const scope = { installRoot: h.f.root, stateDir: h.f.state, descriptorPath: h.f.descriptorPath }, lease = leaseApi.acquireInstallLease(scope);
  assert.throws(() => h.assert(cert)); assert.equal(h.assert(cert, lease).id, h.id);
  fs.writeFileSync(h.f.path('broker/broker-owner.gate'), 'foreign'); assert.throws(() => h.assert(cert, lease), code('install_lease_changed'));
});

for (const name of ['runtime-owner.json', 'broker/broker-owner.lock', 'broker/broker-owner.gate', 'receiver/owner']) test('foreign ' + name + ' fences before mutations', async t => {
  const h = await harness(t, 'owner'); await h.dead(); fs.writeFileSync(h.f.path(name), 'foreign'); const saved = h.f.snapshot();
  await assert.rejects(h.inspect()); assert.deepEqual(h.f.snapshot(), saved);
});

test('full-role provenance, exact original scope and desired-stop are mandatory', async t => {
  for (const changed of ['missing-stop', 'corrupt-stop', 'owner-scope', 'one-role']) {
    const h = await harness(t, 'owner'); await h.dead();
    const file = changed.includes('stop') ? h.f.path('runtime-maintenance.json') : h.f.path('runtime-owner.json');
    if (changed === 'missing-stop') fs.unlinkSync(file);
    else if (changed === 'corrupt-stop') fs.writeFileSync(file, 'corrupt');
    else {
      const record = JSON.parse(fs.readFileSync(file)); record.body.scope.bootId = crypto.randomUUID();
      const key = changed === 'one-role' ? Buffer.from(h.f.d.controlToken, 'hex') : crypto.createHmac('sha256', Buffer.from(h.f.d.panelToken, 'hex')).update('ae-core4/lifecycle-key/v1\0').update(Buffer.from(h.f.d.controlToken, 'hex')).digest();
      record.mac = crypto.createHmac('sha256', key).update('ae-core4/lifecycle-record/v1\0' + canonical(record.body)).digest('hex'); fs.writeFileSync(file, canonical(record));
    }
    const saved = h.f.snapshot(); await assert.rejects(h.inspect()); assert.deepEqual(h.f.snapshot(), saved);
  }
});

test('UNKNOWN original receiver outcome preserves every marker and signed history', async t => {
  const h = await harness(t, 'owner'), command = { protocolVersion: 1, controllerId: 'certification-test', channelEpoch: 'fixture', commandId: 'unknown-certification', moduleId: 'project-inspection', operationId: 'inspect', executorHash: 'a'.repeat(64), phase: 'inspect', payloadHash: hash({}), payload: {} };
  h.stores.store.begin(command, dispatchBinding(command, h.stores.store.identity)); await h.dead(); const saved = h.f.snapshot();
  await assert.rejects(h.inspect(), code('maintenance_unsettled')); assert.deepEqual(h.f.snapshot(), saved);
});

test('settled individual histories with contradictory combined outcomes remain fenced', async t => {
  for (const [outcome, state] of [['applied', 'rejected'], ['rejected', 'succeeded']]) {
    const h = await harness(t, 'owner'), command = { protocolVersion: 1, controllerId: 'certification-test', channelEpoch: 'fixture', commandId: 'conflicting-certification', moduleId: 'titles-current-target', operationId: 'replace-text', executorHash: 'a'.repeat(64), phase: 'mutate', payloadHash: hash({}), payload: {} }, binding = dispatchBinding(command, h.stores.store.identity);
    h.stores.store.begin(command, binding); h.stores.store.complete(command.commandId, { protocolVersion: 1, commandId: command.commandId, executorHash: command.executorHash, payloadHash: command.payloadHash, result: { outcome } });
    const events = [];
    for (const value of [{ type: 'intent', commandId: command.commandId, dispatchBinding: binding }, { type: 'command', commandId: command.commandId, state }]) { const body = { ...value, seq: events.length + 1, previousHash: events.at(-1)?.recordHash || 'origin' }; events.push({ ...body, recordHash: hash(body) }); }
    fs.writeFileSync(h.f.path('broker/ledger.ndjson'), events.map(canonical).join('\n') + '\n');
    await h.dead(); const saved = h.f.snapshot(); await assert.rejects(h.inspect(), code('maintenance_unsettled')); assert.deepEqual(h.f.snapshot(), saved);
  }
});

test('unavailable death proof and filesystem drift across observation preserve the fence', async t => {
  const h = await harness(t, 'owner'); await h.dead(); const before = h.f.snapshot(); h.unavailable(true);
  await assert.rejects(h.inspect(), code('owner_process_probe_unavailable')); assert.deepEqual(h.f.snapshot(), before); h.unavailable(false);
  let changed = false; h.onProbe(() => { if (!changed) { changed = true; fs.writeFileSync(path.join(h.f.root, 'core-client.json'), 'drift'); } });
  await assert.rejects(h.inspect(), code('stopped_certification_changed')); assert.equal(bytes(h.path('stopped-certification-intent.json')), null);
});

test('stale proof and unexpected phase files refuse before certification intent', async t => {
  const h = await harness(t); await h.dead(); const before = h.f.snapshot();
  await assert.rejects(h.certify('f'.repeat(64)), code('stopped_certification_proof_changed')); assert.deepEqual(h.f.snapshot(), before);
  const impossibleStage = h.path('retired-install-gate.stage-' + crypto.randomUUID()); fs.writeFileSync(impossibleStage, '{}');
  await assert.rejects(h.inspect(), code('stopped_certification_phase')); fs.unlinkSync(impossibleStage);
  fs.writeFileSync(h.path('resume-intent.json'), '{}'); const saved = h.f.snapshot(); await assert.rejects(h.inspect(), code('stopped_certification_phase')); assert.deepEqual(h.f.snapshot(), saved);
});

for (const stage of ['intent', 'owner', 'brokerOwner', 'receiverOwner', 'retired-install-gate', 'certificate']) test('crash after ' + stage + ' retains provenance and resumes only after certifier death', async t => {
  const h = await harness(t, stage === 'retired-install-gate' ? 'shutdown' : 'owner'); await h.dead(); const saved = protectedBytes(h), proof = (await h.inspect()).proofHash; let fired = false;
  const method = ['owner', 'brokerOwner', 'receiverOwner', 'retired-install-gate'].includes(stage) ? 'renameSync' : 'linkSync';
  const restore = inject(h, method, (original, from, to) => {
    const result = original(from, to), name = path.basename(to);
    if (!fired && (stage === 'intent' ? name === 'stopped-certification-intent.json' : stage === 'certificate' ? name === 'stopped-certificate.json' : name === stage)) { fired = true; throw syntheticCrash(); }
    return result;
  });
  try { await assert.rejects(h.certify(proof), code('fixture_phase_crash')); } finally { restore(); }
  assert.equal(fired, true); unchanged(saved);
  // Publication can be complete even when its reply was lost. A subsequent
  // explicit inspection decides the phase; no blind repeat is performed.
  if (stage !== 'certificate') await assert.rejects(h.inspect(), code('stopped_certification_process_not_dead'));
  await h.dead(); const cert = await h.certify((await h.inspect()).proofHash); h.assert(cert); unchanged(saved);
});

test('certificate assertion detects archived lifecycle drift and replaced stop inode', async t => {
  for (const target of ['archive', 'stop']) {
    const h = await harness(t, 'owner'); await h.dead(); const cert = await h.certify((await h.inspect()).proofHash);
    const file = target === 'archive' ? path.join(h.f.root, 'transactions', h.id + '-owner-lifecycle', 'owner') : h.f.path('runtime-maintenance.json');
    const original = fs.readFileSync(file); fs.renameSync(file, file + '.saved'); fs.writeFileSync(file, original);
    assert.throws(() => h.assert(cert), code('stopped_certification_changed'));
  }
// Two durable fixture lifecycles can exceed 15s on a busy Windows volume.
}, { timeout: 90000 });

test('a second interrupted certifier is individually sealed and must die before the next continuation', async t => {
  const h = await harness(t, 'owner'); await h.dead();
  for (const target of ['stopped-certification-intent.json', 'owner']) {
    const proof = (await h.inspect()).proofHash, method = target === 'owner' ? 'renameSync' : 'linkSync'; let fired = false;
    const restore = inject(h, method, (original, from, to) => { const value = original(from, to); if (!fired && path.basename(to) === target) { fired = true; throw syntheticCrash(); } return value; });
    try { await assert.rejects(h.certify(proof), code('fixture_phase_crash')); } finally { restore(); }
    assert.equal(fired, true); await assert.rejects(h.inspect(), code('stopped_certification_process_not_dead')); await h.dead();
  }
  const cert = await h.certify((await h.inspect()).proofHash), body = JSON.parse(bytes(h.path('stopped-certificate.json'))).body, intent = JSON.parse(bytes(h.path('stopped-certification-intent.json'))).body;
  const attempts = fs.readdirSync(path.dirname(h.path('stopped.json'))).filter(n => /^certify-[a-f0-9-]{36}\.json$/.test(n));
  assert.equal(attempts.length, 2); assert.notEqual(body.certifier.birthTicks, intent.certifier.birthTicks); assert.notEqual(body.certifier.bootId, intent.certifier.bootId); assert.match(body.attemptHash, /^[a-f0-9]{64}$/); h.assert(cert);
});

for (const target of ['runtime-owner.json', 'install.lock']) test('missing original ' + target + ' after certification intent cannot become a fresh baseline', async t => {
  const h = await harness(t, target === 'install.lock' ? 'shutdown' : 'owner'); await h.dead(); let fired = false;
  const restore = inject(h, 'linkSync', (link, from, to) => { const value = link(from, to); if (!fired && path.basename(to) === 'stopped-certification-intent.json') { fired = true; throw syntheticCrash(); } return value; });
  try { await assert.rejects(h.certify((await h.inspect()).proofHash), code('fixture_phase_crash')); } finally { restore(); }
  await h.dead(); fs.unlinkSync(target === 'install.lock' ? path.join(h.f.root, target) : h.f.path(target)); const saved = h.f.snapshot();
  await assert.rejects(h.inspect(), e => ['stopped_certification_changed', 'owner_lifecycle_marker'].includes(e.code)); assert.deepEqual(h.f.snapshot(), saved);
});

test('private context and retirement seams cannot be reached using JSON lookalikes', async t => {
  const h = await harness(t); await h.dead(); const saved = h.f.snapshot();
  assert.throws(() => h.maintenance.stoppedCertificationContext({ installation: h.f.d }), code('stopped_certification_brand'));
  assert.throws(() => h.load('owner-lifecycle').retireStoppedLifecycle({}), code('stopped_certification_brand')); assert.deepEqual(h.f.snapshot(), saved);
});

'use strict';
// Real TEMP packages/installations and fs CAS; synthetic process observations.
const nodeTest = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), os = require('node:os'), crypto = require('node:crypto'), http = require('node:http'), Module = require('node:module');
const { buildPackage } = require('../tools/package-installable'), { canonical, hash } = require('../protocol/json');
const { classifyOwnerProcess } = require('../runtime/windows-owner-process');
const SOURCE = path.resolve(__dirname, '..'), packages = new Map();
const test = (name, fn) => nodeTest('stopped-update ' + name, { timeout: 90000 }, fn);
function pkg(composition) { if (!packages.has(composition)) packages.set(composition, buildPackage(SOURCE, composition, { runtimeModel: 'owner' })); return packages.get(composition); }
async function harness(t) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'core4-stopped-update-')), tracked = new Set(), names = new Map();
  const io = { ...fs, openSync(file, ...args) { const fd = fs.openSync(file, ...args); tracked.add(fd); names.set(fd, file); return fd; }, closeSync(fd) { tracked.delete(fd); names.delete(fd); return fs.closeSync(fd); } };
  let birth = 638000000000000000n, probeHook, unavailable = false, legacyPort;
  const modules = new Map();
  function load(file) {
    file = path.resolve(file); if (!path.extname(file)) file += '.js';
    if (modules.has(file)) return modules.get(file).exports;
    const mod = new Module(file, module); modules.set(file, mod); mod.filename = file; mod.paths = Module._nodeModulePaths(path.dirname(file));
    mod.require = target => {
      if (target === 'node:fs') return io;
      if (target.endsWith('legacy-owner-migration') && legacyPort) return legacyPort;
      if (target.endsWith('windows-owner-process')) return { classifyOwnerProcess, async observeOwnerProcess(pid) { if (probeHook) await probeHook(pid); if (unavailable) throw Object.assign(Error('probe unavailable'), { code: 'owner_process_probe_unavailable' }); return { version: 1, pid, status: pid === process.pid ? 'present' : 'absent', birthTicks: pid === process.pid ? String(birth) : null, executablePath: pid === process.pid ? process.execPath : null, observedAt: new Date().toISOString() }; } };
      if (target.startsWith('.')) { const resolved = path.resolve(path.dirname(file), target); if (resolved.startsWith(SOURCE + path.sep)) return load(resolved); }
      return require(target);
    };
    mod._compile(fs.readFileSync(file, 'utf8'), file); return mod.exports;
  }
  const installer = load(path.join(SOURCE, 'tools/install-core4')), api = load(path.join(SOURCE, 'tools/stopped-update'));
  const args = { installRoot: path.join(base, 'AEAgentCore4'), extensionsDir: path.join(base, 'extensions'), configPath: path.join(base, 'config.toml'), machineId: os.hostname(), nodePath: fs.realpathSync(process.execPath) };
  installer.applyInstall(installer.planInstall({ ...args, pkg: pkg('readonly') }));
  const descriptorPath = path.join(args.installRoot, 'installation.json'), d = JSON.parse(fs.readFileSync(descriptorPath)), maintenance = load(path.join(SOURCE, 'runtime/owner-maintenance'));
  const originalScope = { bootId: crypto.randomUUID(), pid: 2147483000, birthTicks: String(birth) }, id = crypto.randomUUID();
  const m = maintenance.createOwnerMaintenance({ installation: d, descriptorPath, lifecycle: { state: () => ({ processBootId: originalScope.bootId, ...originalScope }) }, freeze() {}, activity: () => ({ pending: false }), accepted: () => 0, close: async () => {}, intervalMs: 1 });
  m.request(maintenance.createStopAuthorization({ installation: d, descriptorPath, scope: originalScope, id })); assert.equal((await m.done).phase, 'stopped');
  const server = http.createServer(); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const certifier = load(path.join(SOURCE, 'runtime/stopped-certification')), certOptions = { installation: d, descriptorPath, id, reservedServer: server };
  const cert = await certifier.certifyStoppedInstallation({ ...certOptions, expectedProofHash: (await certifier.inspectStoppedCertification(certOptions)).proofHash });
  const plan = installer.planInstall({ ...args, pkg: pkg('manual') }), options = { plan, certificate: cert, ...certOptions };
  const oldHash = hash(fs.readFileSync(descriptorPath)), barrier = path.join(d.stateDir, 'runtime-maintenance.json');
  const recovery = () => ({ installation: d, descriptorPath, transactionId: plan.transactionId, expectedPreviousDescriptorHash: oldHash, expectedPackageHash: plan.pkg.packageHash, reservedServer: server });
  t.after(async () => { for (const fd of tracked) { try { fs.closeSync(fd); } catch {} } tracked.clear(); await new Promise(resolve => server.close(resolve)); assert.ok(base.startsWith(path.join(os.tmpdir(), 'core4-stopped-update-')) && path.resolve(base) === base); fs.rmSync(base, { recursive: true, force: true }); });
  return { base, args, d, descriptorPath, cert, plan, options, api, installer, io, names, barrier, recovery, load, server, certifier,
    legacyPort(port) { legacyPort = port; },
    dead() { for (const fd of [...tracked]) io.closeSync(fd); birth += 10n; }, reviveFixtureActor() { birth -= 10n; }, onProbe(fn) { probeHook = fn; }, unavailable(v) { unavailable = v; },
    async prepared() { return api.prepareStoppedUpdate(options); } };
}
const code = v => e => e.code === v;
function intercept(h, method, callback) { const original = h.io[method]; h.io[method] = (...args) => callback(original, ...args); return () => { h.io[method] = original; }; }
test('one branded plan/lease/certificate updates owner while preserving the stop barrier and history', async t => {
  const h = await harness(t), protectedFiles = ['origin.json', 'state/production/origin.json'].map(n => path.join(h.args.installRoot, n)), before = protectedFiles.map(f => fs.readFileSync(f));
  const prepared = await h.prepared();
  assert.throws(() => h.api.assertStoppedUpdatePermit({ ...prepared.permit }, { plan: h.plan, lease: prepared.lease }), code('stopped_update_permit_brand'));
  assert.throws(() => h.api.assertStoppedUpdatePermit(prepared.permit, { plan: { ...h.plan }, lease: prepared.lease }), code('stopped_update_permit_brand'));
  assert.throws(() => h.api.assertStoppedUpdatePermit(prepared.permit, { plan: h.plan, lease: { ...prepared.lease } }), code('stopped_update_permit_brand'));
  const result = h.api.applyStoppedUpdate({ plan: h.plan, ...prepared });
  assert.equal(result.phase, 'update-stopped'); assert.equal(result.runtimeStarted, false);
  assert.equal(JSON.parse(fs.readFileSync(h.barrier)).body.kind, 'update-stopped');
  assert.equal(fs.existsSync(path.join(h.args.installRoot, 'install.lock')), false);
  assert.equal(fs.existsSync(path.join(h.d.stateDir, 'runtime-owner.json')), false);
  protectedFiles.forEach((f, i) => assert.deepEqual(fs.readFileSync(f), before[i]));
  assert.throws(() => h.api.applyStoppedUpdate({ plan: h.plan, ...prepared }), code('stopped_update_permit_brand'));
});
async function legacyPrepared(t) {
  const h = await harness(t), l = h.load(path.join(SOURCE, 'runtime/install-lease')), sourceCapability = Object.freeze({}), gateCapability = Object.freeze({});
  const payload = JSON.parse(canonical(h.installer.preparedInstallPayload(h.plan))), scope = { installRoot: h.d.installRoot, stateDir: h.d.stateDir, descriptorPath: h.descriptorPath };
  const facts = structuredClone(h.certifier.stoppedCertificateFacts(h.cert)), directory = path.join(h.d.installRoot, 'transactions', h.options.id + '-legacy-migration');
  fs.mkdirSync(directory); fs.writeFileSync(path.join(directory, 'synthetic-root-proof.json'), 'synthetic adapter proof');
  const stat = fs.lstatSync(directory, { bigint: true }), fileStat = fs.lstatSync(path.join(directory, 'synthetic-root-proof.json'), { bigint: true });
  const fields = ['dev', 'ino', 'size', 'birthtimeNs', 'mtimeNs', 'ctimeNs'];
  facts.phase = { directory: Object.fromEntries(['dev', 'ino', 'birthtimeNs'].map(k => [k, String(stat[k])])), tree: { 'synthetic-root-proof.json': { hash: hash('synthetic adapter proof'), stat: Object.fromEntries(fields.map(k => [k, String(fileStat[k])])) } } };
  facts.certificateHash = hash('synthetic adapter proof'); facts.lifecycle = { markers: {}, transactions: {} };
  const gates = ['install', 'broker'].map(role => Buffer.from('synthetic-private-legacy-' + role + '-' + crypto.randomUUID()));
  let lease, installOnly = true, recoveryMode = false;
  h.legacyPort({ legacyMigrationLeasePermit(cap) { assert.equal(cap, gateCapability); return { scope, nonce: crypto.randomUUID(), gates, installOnly, recovery: recoveryMode, facts: [path.join(h.d.installRoot, 'install.lock'), path.join(h.d.stateDir, 'broker/broker-owner.gate')].map(file => { if (!fs.existsSync(file)) return { file, hash: null, stat: null }; const s = fs.lstatSync(file, { bigint: true }); return { file, hash: hash(fs.readFileSync(file)), stat: Object.fromEntries(fields.map(k => [k, String(s[k])])) }; }) }; }, assertLegacyPreparedRecovery(cap) { assert.equal(cap, sourceCapability); return { lease, installation: h.d, descriptorPath: h.descriptorPath, id: h.options.id, facts, reservedServer: h.server, payload, originalActor: { nativeTicks: 'not-a-CIM-actor' } }; } });
  lease = l.acquireLegacyMigrationInstallLease(gateCapability); installOnly = false; l.promoteLegacyMigrationInstallLease(lease, gateCapability);
  return { h, payload, sourceCapability, get lease() { return lease; }, reattach() { recoveryMode = true; lease = l.acquireLegacyMigrationRecoveryLease(gateCapability); } };
}
test('dedicated legacy prepared recovery stages the original payload without normal plan rehydration', async t => {
  const { h, payload, sourceCapability, lease } = await legacyPrepared(t);
  assert.throws(() => h.installer.applyInstall(payload, { lease }), code('prepared_install_plan_brand_or_changed'));
  const recovery = await h.api.createLegacyStoppedRecovery(sourceCapability);
  assert.throws(() => h.api.stageStoppedRecovery({ ...recovery }), code('stopped_update_prepared_brand'));
  const original = canonical(JSON.parse(Buffer.from(payload.descriptorBytes, 'base64')));
  const result = h.api.stageStoppedRecovery(recovery);
  assert.equal(result.recovered, true); assert.equal(result.runtimeStarted, false); assert.equal(canonical(JSON.parse(fs.readFileSync(h.descriptorPath))), original);
  assert.equal(JSON.parse(fs.readFileSync(h.barrier)).body.kind, 'update-stopped');
});
test('legacy prepared continuation keeps original intent immutable and fences a live pre-ready actor', async t => {
  const f = await legacyPrepared(t), { h, sourceCapability } = f;
  await h.api.createLegacyStoppedRecovery(sourceCapability);
  const intent = path.join(h.d.installRoot, 'transactions', h.plan.transactionId + '-stopped-update/intent.json'), before = fs.readFileSync(intent);
  await assert.rejects(h.api.createLegacyStoppedRecovery(sourceCapability), code('stopped_update_process_not_dead'));
  h.dead(); f.reattach();
  const cap = await h.api.createLegacyStoppedRecovery(sourceCapability), result = h.api.stageStoppedRecovery(cap);
  assert.equal(result.phase, 'update-stopped'); assert.deepEqual(fs.readFileSync(intent), before);
  h.dead(); assert.equal((await h.api.inspectStoppedUpdate(h.recovery())).phase, 'update-stopped');
});
for (const boundary of ['directory', 'first-file']) test('legacy partial CEP stage resumes after ' + boundary + ' crash with original payload and history', async t => {
  const f = await legacyPrepared(t), { h, payload, sourceCapability } = f, cap = await h.api.createLegacyStoppedRecovery(sourceCapability);
  const cepStage = path.join(h.d.installRoot, 'transactions', h.plan.transactionId + '-cep-next');
  const protectedFiles = [path.join(h.d.installRoot, 'origin.json'), path.join(h.d.stateDir, 'origin.json'), path.join(h.d.stateDir, 'receiver/completions.ndjson'), path.join(h.d.stateDir, 'broker/ledger.ndjson'), path.join(h.d.installRoot, 'transactions', h.options.id + '-legacy-migration/synthetic-root-proof.json')];
  const before = protectedFiles.map(file => fs.existsSync(file) ? fs.readFileSync(file) : null); let hit = false;
  const restore = boundary === 'directory' ? intercept(h, 'mkdirSync', (mkdir, directory, ...args) => { const result = mkdir(directory, ...args); if (directory === cepStage && !hit) { hit = true; throw Object.assign(Error('CEP directory crash'), { code: 'fixture_partial_cep' }); } return result; }) : intercept(h, 'unlinkSync', (unlink, name) => { const result = unlink(name); if (!hit && name.startsWith(cepStage + path.sep) && name.includes('.stage-')) { hit = true; throw Object.assign(Error('CEP file publication crash'), { code: 'fixture_partial_cep' }); } return result; });
  try { assert.throws(() => h.api.stageStoppedRecovery(cap), code('fixture_partial_cep')); } finally { restore(); }
  assert.equal(hit, true); assert.ok(fs.existsSync(cepStage));
  const existing = h.installer.snapshot(cepStage); assert.equal(Object.keys(existing).length, boundary === 'directory' ? 0 : 1);
  h.dead(); f.reattach();
  const next = await h.api.createLegacyStoppedRecovery(sourceCapability), result = h.api.stageStoppedRecovery(next);
  assert.equal(result.phase, 'update-stopped'); assert.equal(result.runtimeStarted, false);
  assert.deepEqual(fs.readFileSync(h.descriptorPath), Buffer.from(payload.descriptorBytes, 'base64'));
  assert.deepEqual(h.installer.snapshot(payload.cepDir), payload.cep);
  protectedFiles.forEach((file, i) => assert.deepEqual(fs.existsSync(file) ? fs.readFileSync(file) : null, before[i], file));
});
for (const foreign of ['empty-directory', 'modified-file']) test('legacy partial CEP stage refuses ' + foreign + ' before filling missing files', async t => {
  const f = await legacyPrepared(t), { h, payload, sourceCapability } = f;
  const cepStage = path.join(h.d.installRoot, 'transactions', h.plan.transactionId + '-cep-next'); fs.mkdirSync(cepStage);
  const first = Object.keys(payload.cep)[0], file = path.join(cepStage, first); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, Buffer.from(payload.cep[first], 'base64'));
  if (foreign === 'empty-directory') fs.mkdirSync(path.join(cepStage, 'foreign-empty')); else fs.appendFileSync(file, 'changed');
  const cap = await h.api.createLegacyStoppedRecovery(sourceCapability), before = h.installer.snapshot(h.base), original = h.io.openSync; let writes = 0;
  h.io.openSync = (name, flags, ...args) => { if (typeof flags === 'string' && /[wax+]/.test(flags)) writes++; return original(name, flags, ...args); };
  try { assert.throws(() => h.api.stageStoppedRecovery(cap), code('stopped_update_staging_changed')); } finally { h.io.openSync = original; }
  assert.equal(writes, 0); assert.deepEqual(h.installer.snapshot(h.base), before);
  if (foreign === 'empty-directory') assert.deepEqual(fs.readdirSync(path.join(cepStage, 'foreign-empty')), []);
});
test('ordinary installer cannot skip the exact certificate barrier and copied certificates cannot prepare', async t => {
  const h = await harness(t), before = h.installer.snapshot(h.base);
  assert.throws(() => h.installer.applyInstall(h.plan), code('runtime_lifecycle_owned_or_maintenance'));
  await assert.rejects(h.api.prepareStoppedUpdate({ ...h.options, certificate: { ...h.cert } }), code('stopped_certification_brand'));
  assert.deepEqual(h.installer.snapshot(h.base), before);
});
test('certificate and config drift after process await refuse before update gates', async t => {
  for (const drift of ['certificate', 'config']) {
    const h = await harness(t); let changed = false;
    h.onProbe(() => { if (changed) return; changed = true; if (drift === 'config') fs.appendFileSync(h.args.configPath, '\n# changed\n'); else fs.appendFileSync(path.join(h.args.installRoot, 'transactions', h.options.id + '-owner-maintenance/stopped-certificate.json'), ' '); });
    await assert.rejects(h.prepared()); assert.equal(fs.existsSync(path.join(h.args.installRoot, 'install.lock')), false);
  }
});
for (const crash of ['archive', 'cep', 'descriptor', 'client', 'config', 'barrier']) test('exact forward recovery after ' + crash + ' rename never rebrands JSON or rotates keys twice', async t => {
  const h = await harness(t), prepared = await h.prepared(), desired = canonical(h.plan.descriptor), transaction = h.plan.transactionId;
  const destination = { archive: path.join(h.args.installRoot, 'transactions', transaction + '-cep'), cep: h.plan.cepDir, descriptor: h.descriptorPath, client: path.join(h.args.installRoot, 'core-client.json'), config: h.args.configPath, barrier: h.barrier }[crash];
  let hit = false, gap = false;
  const restore = intercept(h, 'renameSync', (rename, from, to) => { const result = rename(from, to); if (!fs.existsSync(h.barrier)) gap = true; if (to === destination && !hit) { hit = true; throw Object.assign(Error('synthetic visible crash'), { code: 'fixture_crash' }); } return result; });
  try { assert.throws(() => h.api.applyStoppedUpdate({ plan: h.plan, ...prepared }), code('fixture_crash')); } finally { restore(); }
  assert.equal(hit, true); assert.equal(gap, false); assert.ok(fs.existsSync(h.barrier));
  h.dead(); const inspected = await h.api.inspectStoppedUpdate(h.recovery());
  const result = await h.api.finishStoppedUpdate({ ...h.recovery(), expectedProofHash: inspected.proofHash });
  assert.equal(result.recovered, true); assert.equal(canonical(JSON.parse(fs.readFileSync(h.descriptorPath))), desired);
  assert.equal(JSON.parse(fs.readFileSync(h.barrier)).body.kind, 'update-stopped');
  assert.equal(fs.existsSync(path.join(h.args.installRoot, 'install.lock')), false);
});
test('explicit enable verifies the completed new installation and removes only its typed barrier', async t => {
  const h = await harness(t), prepared = await h.prepared(); h.api.applyStoppedUpdate({ plan: h.plan, ...prepared });
  assert.ok(fs.existsSync(h.barrier));
  await assert.rejects(h.api.enableStoppedUpdate({ permit: { ...prepared.permit } }));
  const descriptor = fs.readFileSync(h.descriptorPath), result = await h.api.enableStoppedUpdate({ permit: prepared.permit });
  assert.equal(result.enabled, true); assert.equal(result.runtimeStarted, false); assert.equal(fs.existsSync(h.barrier), false);
  assert.equal(fs.existsSync(path.join(h.args.installRoot, 'install.lock')), false); assert.deepEqual(fs.readFileSync(h.descriptorPath), descriptor);
});
for (const phase of ['intent', 'install', 'broker', 'ready', 'archive', 'unlink', 'complete', 'releaseBroker', 'releaseInstall']) test('enable crash ' + phase + ' explicitly finishes the exact saved phase on a new boot', async t => {
  const h = await harness(t), prepared = await h.prepared(); h.api.applyStoppedUpdate({ plan: h.plan, ...prepared });
  const directory = path.join(h.args.installRoot, 'transactions', h.plan.transactionId + '-stopped-update');
  const target = { intent: path.join(directory, 'enable-intent.json'), install: path.join(h.args.installRoot, 'install.lock'), broker: path.join(h.d.stateDir, 'broker/broker-owner.gate'), ready: path.join(directory, 'enable-ready.json'), archive: path.join(directory, 'update-stop'), unlink: h.barrier, complete: path.join(directory, 'enabled.json'), releaseBroker: path.join(h.d.stateDir, 'broker/broker-owner.gate'), releaseInstall: path.join(h.args.installRoot, 'install.lock') }[phase];
  const operation = ['unlink', 'releaseBroker', 'releaseInstall'].includes(phase) ? 'unlinkSync' : 'linkSync'; let hit = false;
  const restore = intercept(h, operation, (original, ...args) => { const result = original(...args), destination = operation === 'linkSync' ? args[1] : args[0]; if (!hit && destination === target) { hit = true; throw Object.assign(Error('synthetic enable crash'), { code: 'fixture_enable_crash' }); } return result; });
  try { await assert.rejects(h.api.enableStoppedUpdate({ permit: prepared.permit }), code('fixture_enable_crash')); } finally { restore(); }
  assert.equal(hit, true); h.dead();
  const inspection = await h.api.inspectStoppedUpdate(h.recovery()); assert.ok(['enable-pending', 'enabled'].includes(inspection.phase));
  const result = await h.api.finishEnableStoppedUpdate({ ...h.recovery(), expectedProofHash: inspection.proofHash });
  assert.equal(result.enabled, true); assert.equal(result.recovered, true); assert.equal(result.runtimeStarted, false);
  assert.equal(fs.existsSync(h.barrier), false); assert.equal(fs.existsSync(path.join(h.args.installRoot, 'install.lock')), false);
});
test('stage inode replacement, wrong pins, live actors and foreign gate refuse recovery without writes', async t => {
  for (const drift of ['stage', 'pin', 'actor', 'gate']) {
    const h = await harness(t), prepared = await h.prepared();
    const backup = path.join(h.args.installRoot, 'transactions', h.plan.transactionId + '-cep');
    const restore = intercept(h, 'renameSync', (rename, from, to) => { const result = rename(from, to); if (to === backup) throw Error('synthetic crash'); return result; });
    try { assert.throws(() => h.api.applyStoppedUpdate({ plan: h.plan, ...prepared })); } finally { restore(); }
    if (drift !== 'actor') h.dead();
    if (drift === 'stage') { const file = h.descriptorPath + '.next', copy = file + '.replacement'; fs.writeFileSync(copy, fs.readFileSync(file)); fs.renameSync(copy, file); }
    if (drift === 'gate') fs.writeFileSync(path.join(h.args.installRoot, 'install.lock'), 'foreign');
    const options = h.recovery(); if (drift === 'pin') options.expectedPreviousDescriptorHash = 'f'.repeat(64);
    const before = h.installer.snapshot(h.base); await assert.rejects(h.api.inspectStoppedUpdate(options)); assert.deepEqual(h.installer.snapshot(h.base), before);
  }
});
test('a second crash retains the recovery actor fence until its own death and preserves the original new keys', async t => {
  const h = await harness(t), prepared = await h.prepared(), descriptor = canonical(h.plan.descriptor);
  const backup = path.join(h.d.installRoot, 'transactions', h.plan.transactionId + '-cep');
  let restore = intercept(h, 'renameSync', (rename, from, to) => { const result = rename(from, to); if (to === backup) throw Error('first crash'); return result; });
  try { assert.throws(() => h.api.applyStoppedUpdate({ plan: h.plan, ...prepared })); } finally { restore(); }
  h.dead(); const first = await h.api.inspectStoppedUpdate(h.recovery());
  restore = intercept(h, 'renameSync', (rename, from, to) => { const result = rename(from, to); if (to === h.descriptorPath) throw Error('second crash'); return result; });
  try { await assert.rejects(h.api.finishStoppedUpdate({ ...h.recovery(), expectedProofHash: first.proofHash })); } finally { restore(); }
  await assert.rejects(h.api.inspectStoppedUpdate(h.recovery()), code('stopped_update_process_not_dead'));
  h.dead(); const second = await h.api.inspectStoppedUpdate(h.recovery());
  await h.api.finishStoppedUpdate({ ...h.recovery(), expectedProofHash: second.proofHash });
  assert.equal(canonical(JSON.parse(fs.readFileSync(h.descriptorPath))), descriptor);
});
test('enable gate inode drift after inspection refuses before any continuation record or barrier unlink', async t => {
  const h = await harness(t), prepared = await h.prepared(); h.api.applyStoppedUpdate({ plan: h.plan, ...prepared });
  const gate = path.join(h.d.installRoot, 'install.lock'), restore = intercept(h, 'linkSync', (link, from, to) => { const result = link(from, to); if (to === gate) throw Error('enable interrupted'); return result; });
  try { await assert.rejects(h.api.enableStoppedUpdate({ permit: prepared.permit })); } finally { restore(); }
  h.dead(); const inspection = await h.api.inspectStoppedUpdate(h.recovery());
  const replacement = gate + '.replacement'; fs.writeFileSync(replacement, fs.readFileSync(gate)); fs.renameSync(replacement, gate);
  const before = h.installer.snapshot(h.base);
  await assert.rejects(h.api.finishEnableStoppedUpdate({ ...h.recovery(), expectedProofHash: inspection.proofHash }), code('stopped_update_enable_proof'));
  assert.deepEqual(h.installer.snapshot(h.base), before); assert.ok(fs.existsSync(h.barrier));
});

async function ownerInterrupted(t, phase = 'broker') {
  const h = await harness(t), directory = path.join(h.d.installRoot, 'transactions', h.plan.transactionId + '-stopped-update');
  const target = { intent: path.join(directory, 'intent.json'), install: path.join(h.d.installRoot, 'install.lock'), broker: path.join(h.d.stateDir, 'broker/broker-owner.gate'), lease: path.join(directory, 'lease.json') }[phase];
  let hit = false;
  const restore = intercept(h, 'linkSync', (link, from, to) => { const value = link(from, to); if (to === target && !hit) { hit = true; throw Object.assign(Error('owner pre-ready interrupted'), { code: 'fixture_owner_interrupted' }); } return value; });
  try { await assert.rejects(h.prepared(), code('fixture_owner_interrupted')); } finally { restore(); }
  assert.equal(hit, true); h.dead(); return { h, directory };
}
function protectedOwnerFiles(h) {
  return [path.join(h.d.installRoot, 'origin.json'), path.join(h.d.stateDir, 'origin.json'), path.join(h.d.stateDir, 'receiver/completions.ndjson'), path.join(h.d.stateDir, 'broker/ledger.ndjson'), h.barrier, path.join(h.d.installRoot, 'transactions', h.options.id + '-owner-maintenance/stopped-certificate.json')];
}
for (const phase of ['intent', 'install', 'broker', 'lease']) test('owner pre-ready continues original payload after ' + phase + ' prefix with no new credentials', async t => {
  const { h, directory } = await ownerInterrupted(t, phase), intent = fs.readFileSync(path.join(directory, 'intent.json'));
  const protectedFiles = protectedOwnerFiles(h), before = protectedFiles.map(file => fs.existsSync(file) ? fs.readFileSync(file) : null), expected = Buffer.from(h.installer.preparedInstallPayload(h.plan).descriptorBytes, 'base64');
  const inspected = await h.api.inspectOwnerPreReady(h.recovery());
  assert.equal(inspected.phase, 'owner-pre-ready'); assert.equal(inspected.gatePrefix, phase === 'intent' ? 0 : phase === 'install' ? 1 : 2);
  await assert.rejects(h.api.finishOwnerPreReady({ ...h.recovery(), expectedProofHash: 'f'.repeat(64) }), code('stopped_update_proof_changed'));
  const result = await h.api.finishOwnerPreReady({ ...h.recovery(), expectedProofHash: inspected.proofHash });
  assert.equal(result.phase, 'update-stopped'); assert.equal(result.runtimeStarted, false); assert.equal(result.aeAuthority, false);
  assert.deepEqual(fs.readFileSync(h.descriptorPath), expected); assert.deepEqual(fs.readFileSync(path.join(directory, 'intent.json')), intent);
  protectedFiles.forEach((file, i) => { if (file !== h.barrier) assert.deepEqual(fs.existsSync(file) ? fs.readFileSync(file) : null, before[i], file); });
  assert.deepEqual(fs.readFileSync(path.join(directory, 'original-stop')), before[4]);
  assert.equal(fs.existsSync(path.join(h.d.installRoot, 'install.lock')), false);
  await assert.rejects(h.api.inspectOwnerPreReady(h.recovery()), code('stopped_update_prepared_phase'));
  h.dead(); assert.equal((await h.api.inspectStoppedUpdate(h.recovery())).phase, 'update-stopped');
});
for (const crash of ['attempt', 'lease', 'release-file', 'prepared-file', 'cep-file', 'ready']) test('owner pre-ready crash at ' + crash + ' remains attributed and resumes only after actor death', async t => {
  const { h, directory } = await ownerInterrupted(t, 'intent'), inspection = await h.api.inspectOwnerPreReady(h.recovery());
  const release = h.plan.descriptor.releaseDir, prepared = path.join(h.d.installRoot, 'transactions', h.plan.transactionId + '-prepared'), cep = path.join(h.d.installRoot, 'transactions', h.plan.transactionId + '-cep-next');
  let hit = false;
  const fileCrash = ['release-file', 'prepared-file', 'cep-file'].includes(crash);
  const restore = intercept(h, fileCrash ? 'unlinkSync' : 'linkSync', (operation, ...args) => { const value = operation(...args), to = fileCrash ? args[0] : args[1], name = path.basename(to); const matches = crash === 'attempt' ? /^pre-ready-[a-f0-9-]{36}\.json$/.test(name) : crash === 'lease' ? /-lease\.json$/.test(name) : crash === 'release-file' ? to.startsWith(release + path.sep) : crash === 'prepared-file' ? to.startsWith(prepared + path.sep) : crash === 'cep-file' ? to.startsWith(cep + path.sep) : name === 'switch-ready.json'; if (matches && !hit) { hit = true; throw Object.assign(Error('owner recovery interrupted'), { code: 'fixture_owner_recovery_crash' }); } return value; });
  try { await assert.rejects(h.api.finishOwnerPreReady({ ...h.recovery(), expectedProofHash: inspection.proofHash }), code('fixture_owner_recovery_crash')); } finally { restore(); }
  assert.equal(hit, true);
  if (crash === 'ready') {
    await assert.rejects(h.api.inspectStoppedUpdate(h.recovery()), code('stopped_update_process_not_dead')); h.dead();
    const proof = await h.api.inspectStoppedUpdate(h.recovery()); await h.api.finishStoppedUpdate({ ...h.recovery(), expectedProofHash: proof.proofHash });
  } else {
    await assert.rejects(h.api.inspectOwnerPreReady(h.recovery()), code('stopped_update_process_not_dead')); h.dead();
    const proof = await h.api.inspectOwnerPreReady(h.recovery()); await h.api.finishOwnerPreReady({ ...h.recovery(), expectedProofHash: proof.proofHash });
  }
  assert.equal(JSON.parse(fs.readFileSync(h.barrier)).body.kind, 'update-stopped');
});
for (const drift of ['foreign-record', 'foreign-recovery-lease', 'foreign-prepared', 'foreign-cep-dir', 'foreign-release', 'gate-bytes', 'gate-inode', 'descriptor-inode', 'config-inode', 'certificate', 'intent-corrupt', 'host-adoption', 'actor-alive', 'broker-only', 'unavailable']) test('owner pre-ready refuses ' + drift + ' with zero writes', async t => {
  const { h, directory } = await ownerInterrupted(t), inspection = await h.api.inspectOwnerPreReady(h.recovery());
  const replace = file => { const tmp = file + '.replacement'; fs.writeFileSync(tmp, fs.readFileSync(file)); fs.renameSync(tmp, file); };
  const gate = path.join(h.d.installRoot, 'install.lock');
  if (drift === 'foreign-record') fs.writeFileSync(path.join(directory, 'foreign.json'), '{}');
  if (drift === 'foreign-recovery-lease') fs.writeFileSync(path.join(directory, 'recovery-' + crypto.randomUUID() + '-lease.json'), '{}');
  if (drift === 'foreign-prepared') { const dir = path.join(h.d.installRoot, 'transactions', h.plan.transactionId + '-prepared'); fs.mkdirSync(dir); fs.writeFileSync(path.join(dir, 'foreign'), 'x'); }
  if (drift === 'foreign-cep-dir') { const dir = path.join(h.d.installRoot, 'transactions', h.plan.transactionId + '-cep-next'); fs.mkdirSync(dir); fs.mkdirSync(path.join(dir, 'foreign-empty')); }
  if (drift === 'foreign-release') { fs.mkdirSync(h.plan.descriptor.releaseDir); fs.writeFileSync(path.join(h.plan.descriptor.releaseDir, 'foreign'), 'x'); }
  if (drift === 'gate-bytes') fs.writeFileSync(gate, 'foreign');
  if (drift === 'gate-inode') replace(gate);
  if (drift === 'descriptor-inode') replace(h.descriptorPath);
  if (drift === 'config-inode') replace(h.args.configPath);
  if (drift === 'certificate') fs.appendFileSync(protectedOwnerFiles(h).at(-1), ' ');
  if (drift === 'intent-corrupt') fs.appendFileSync(path.join(directory, 'intent.json'), ' ');
  if (drift === 'host-adoption') fs.writeFileSync(path.join(h.d.stateDir, 'host-adoption.json'), '{}');
  if (drift === 'actor-alive') h.reviveFixtureActor();
  if (drift === 'broker-only') fs.unlinkSync(gate);
  if (drift === 'unavailable') h.unavailable(true);
  const before = h.installer.snapshot(h.base), original = h.io.openSync; let writes = 0;
  h.io.openSync = (file, flags, ...args) => { if (typeof flags === 'string' && /[wax+]/.test(flags)) writes++; return original(file, flags, ...args); };
  try { await assert.rejects(h.api.finishOwnerPreReady({ ...h.recovery(), expectedProofHash: inspection.proofHash })); } finally { h.io.openSync = original; }
  assert.equal(writes, 0); assert.deepEqual(h.installer.snapshot(h.base), before);
});

test('owner pre-ready rechecks exact proof after each process await and copied proof ports are rejected', async t => {
  const { h } = await ownerInterrupted(t), inspection = await h.api.inspectOwnerPreReady(h.recovery());
  assert.throws(() => h.api.ownerPreparedCertificatePermit({}), code('stopped_update_prepared_brand'));
  assert.throws(() => h.certifier.readStoppedUpdateCertificate({}), code('stopped_update_prepared_brand'));
  let changed = false; h.onProbe(() => { if (!changed) { changed = true; fs.appendFileSync(h.args.configPath, '\n# race\n'); } });
  const original = h.io.openSync; let writes = 0; h.io.openSync = (file, flags, ...args) => { if (typeof flags === 'string' && /[wax+]/.test(flags)) writes++; return original(file, flags, ...args); };
  try { await assert.rejects(h.api.finishOwnerPreReady({ ...h.recovery(), expectedProofHash: inspection.proofHash })); } finally { h.io.openSync = original; }
  assert.equal(writes, 0);
});

test('owner pre-ready competing processes discard only their own unpublished losing claim stage', async t => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'core4-owner-claim-'));
  t.after(() => { assert.ok(base.startsWith(path.join(os.tmpdir(), 'core4-owner-claim-'))); fs.rmSync(base, { recursive: true, force: true }); });
  const file = path.join(base, 'claim.json'), child = path.join(__dirname, 'fixtures/owner-pre-ready-claim-child.js'), cp = require('node:child_process');
  const start = name => {
    const signal = path.join(base, name + '.ready'), go = path.join(base, name + '.go'), bytes = Buffer.from(name);
    const p = cp.spawn(process.execPath, [child, file, bytes.toString('base64'), signal, go], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true }); let output = '', stderr = '';
    p.stdout.on('data', b => { output += b; }); p.stderr.on('data', b => { stderr += b; });
    const done = new Promise((resolve, reject) => { p.once('error', reject); p.once('exit', code => code === 0 ? resolve(output) : reject(Error(stderr))); });
    return { signal, go, done };
  };
  const a = start('winner'), b = start('loser'), deadline = Date.now() + 10000;
  while (!fs.existsSync(a.signal) || !fs.existsSync(b.signal)) { if (Date.now() > deadline) throw Error('fixture claim readiness timeout'); await new Promise(resolve => setTimeout(resolve, 10)); }
  fs.writeFileSync(a.go, 'go'); assert.equal(await a.done, 'claimed');
  fs.writeFileSync(b.go, 'go'); assert.equal(await b.done, 'EEXIST');
  assert.equal(fs.readFileSync(file, 'utf8'), 'winner'); assert.equal(fs.readdirSync(base).some(name => name.includes('.stage-')), false);
});

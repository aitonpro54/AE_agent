'use strict';
// TEMP filesystem and real installer brands. Process/profile observations below
// are synthetic: no production endpoint, process termination or installed files.
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), os = require('node:os'), crypto = require('node:crypto'), Module = require('node:module'), http = require('node:http');
const { buildPackage } = require('../tools/package-installable'), installer = require('../tools/install-core4');
const { canonical, hash } = require('../protocol/json');
let oldPkg;
function fixture(t, { sharedInstaller = false } = {}) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'core4-legacy-owner-')); t.after(() => { assert.ok(base.startsWith(path.join(os.tmpdir(), 'core4-legacy-owner-'))); fs.rmSync(base, { recursive: true, force: true }); });
  oldPkg ||= buildPackage(undefined, 'manual');
  const args = { nodePath: fs.realpathSync(process.execPath), installRoot: path.join(base, 'AEAgentCore4'), extensionsDir: path.join(base, 'extensions'), configPath: path.join(base, 'config.toml'), machineId: os.hostname() };
  const modules = new Map(), opened = new Map(), io = { ...fs, openSync(...args) { const fd = fs.openSync(...args); opened.set(fd, String(args[0])); return fd; }, closeSync(fd) { opened.delete(fd); return fs.closeSync(fd); } };
  const fixtureInstaller = sharedInstaller ? load('tools/install-core4.js') : installer;
  const installed = fixtureInstaller.applyInstall(fixtureInstaller.planInstall({ ...args, pkg: oldPkg })), d = JSON.parse(fs.readFileSync(installed.descriptorPath)), state = d.stateDir;
  fs.mkdirSync(path.join(state, 'receiver')); fs.writeFileSync(path.join(state, 'receiver/owner'), '');
  fs.writeFileSync(path.join(state, 'broker/broker-owner.lock'), JSON.stringify({ pid: 77, token: crypto.randomUUID() }));
  const body = { type: 'origin', identity: 'fixture-receiver', seq: 1, previousHash: 'origin' }; fs.writeFileSync(path.join(state, 'receiver/completions.ndjson'), canonical({ ...body, recordHash: hash(body) }) + '\n');
  const plan = fixtureInstaller.planInstall({ ...args, pkg: buildPackage(undefined, 'manual', { runtimeModel: 'owner' }) });
  const rootStatus = { synthetic: false, pid: 77, installation: { installationId: d.installationId, packageHash: d.packageHash }, physical: { storeClosed: true, storeFault: false, pending: null }, worker: { pending: 0 }, ledgerFault: false, ownershipFault: null, unresolved: [] };
  const nativeBirth = String(BigInt(Date.now() + 1000) * 10000n + 621355968000000000n); let actorBirth = nativeBirth, stopCalls = 0, dead = false, hook, stepHook, probeHook, unknownProbe = false, server;
  const handle = Object.freeze({}), native = {
    async retainProcess(identity) { assert.equal(identity.pid, 77); if (stepHook) stepHook('retain'); return handle; },
    async inspectRetainedProcess(cap) { assert.equal(cap, handle); if (stepHook) stepHook('inspect'); return { state: dead ? 'exited' : 'alive' }; },
    async stopRetainedProcess(cap, permit) { assert.equal(cap, handle); load('tools/legacy-owner-migration.js').assertLegacyStopPermit(permit, cap); stopCalls++; if (hook) hook(); dead = true; return { state: 'stopped' }; },
    closeRetainedProcess(cap) { assert.equal(cap, handle); }
  };
  function load(relative) {
    if (modules.has(relative)) return modules.get(relative).exports;
    const filename = path.resolve(__dirname, '..', relative), mod = new Module(filename, module); modules.set(relative, mod); mod.filename = filename; mod.paths = Module._nodeModulePaths(path.dirname(filename));
    mod.require = name => {
      if (name === 'node:fs') return io;
      if (name === '../runtime/windows-owner-process') return { classifyOwnerProcess: require('../runtime/windows-owner-process').classifyOwnerProcess, async observeOwnerProcess(pid) { return { version: 1, pid, status: 'present', birthTicks: actorBirth, executablePath: d.nodePath, observedAt: new Date().toISOString() }; } };
      if (name === './windows-retained-process') return native;
      if (name === 'node:child_process') return { ...require('node:child_process'), execFile(file, argv, options, callback) {
        const pid = Number(options.env.AE_CORE4_LEGACY_PID);
        if (probeHook) probeHook(pid); if (unknownProbe) { callback(Error('synthetic probe unavailable')); return; }
        const absent = pid === 77 && dead && options.env.AE_CORE4_LEGACY_ALLOW_ABSENT === 'yes';
        const value = { pid, birthTicks: absent ? null : pid === 77 ? nativeBirth : actorBirth, executablePath: absent ? null : d.nodePath, commandLine: absent ? null : pid === 77 ? [d.nodePath, path.join(d.releaseDir, 'runtime/stdio-entry.js'), '--installation', installed.descriptorPath].map(v => '"' + v + '"').join(' ') : 'fixture-operator', listeners: pid === 77 && !dead ? [77] : [], observedAt: new Date().toISOString() };
        callback(null, Buffer.from(JSON.stringify(value)).toString('base64'));
      } };
      if (sharedInstaller && name.startsWith('.')) {
        let target = path.relative(path.resolve(__dirname, '..'), path.resolve(path.dirname(filename), name)).replace(/\\/g, '/'); if (!target.endsWith('.js')) target += '.js';
        if (['tools/install-core4.js', 'tools/disposition-install-preflight.js', 'tools/stopped-update.js', 'tools/legacy-owner-migration.js', 'runtime/install-lease.js', 'runtime/installation-lineage.js', 'runtime/native-read-disposition.js'].includes(target)) return load(target);
      }
      if (name === '../runtime/install-lease' || name === '../tools/legacy-owner-migration' || name === './legacy-owner-migration' || name === './stopped-update') return load(name.includes('install-lease') ? 'runtime/install-lease.js' : name.includes('legacy-owner') ? 'tools/legacy-owner-migration.js' : 'tools/stopped-update.js');
      return require(name.startsWith('.') ? path.resolve(path.dirname(filename), name) : name);
    };
    let source = fs.readFileSync(filename, 'utf8');
    if (relative === 'tools/legacy-owner-migration.js') {
      // An explicitly synthetic admitted source profile. Actual production pins
      // are separately checked by read-only installation preflight.
      source = source.replace('3f9293f76f5dbef30f8919151145e28ebceb8fe796ee4495b9747e18e0ff8c51', oldPkg.packageHash);
      for (const [file, digest] of Object.entries({ 'runtime/stdio-entry.js': 'b756c068a0be8f311d644f38b7b499a94df6fac9972a3f9fc5ccd3e88121ebbf', 'integrations/cep/completion-store.js': 'c5678e98b6eea7cb0ad7db605b4bd9a5a4f73080bb1e32f60c6a99420e904835', 'integrations/cep/http-peer.js': '678aa498eee23498d143017834be0be1f60df10d36de39aad6fec91ba7938757' })) source = source.replace(digest, oldPkg.release.hashes[file]);
    }
    mod._compile(source, filename); return mod.exports;
  }
  const api = load('tools/legacy-owner-migration.js');
  const options = () => ({ plan, rootStatus, observedAt: new Date().toISOString(), id: crypto.randomUUID() });
  t.after(() => { for (const fd of opened.keys()) try { fs.closeSync(fd); } catch {} });
  async function reserved() { if (!server) { server = http.createServer(); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); t.after(() => new Promise(resolve => server.close(resolve))); } return server; }
  return { base, d, plan, args, rootStatus, api, load, options, io, opened, installer: fixtureInstaller, stopCalls: () => stopCalls, hook(fn) { hook = fn; }, during(fn) { stepHook = fn; }, probe(fn) { probeHook = fn; }, unavailable(v) { unknownProbe = v; }, targetDead() { dead = true; },
    crashActor() { for (const fd of opened.keys()) try { fs.closeSync(fd); } catch {} opened.clear(); actorBirth = String(BigInt(actorBirth) + 1n); },
    async recoveryOptions(id) { return { descriptorPath: installed.descriptorPath, id, expectedPreviousDescriptorHash: hash(fs.readFileSync(installed.descriptorPath)), expectedPackageHash: plan.pkg.packageHash, reservedServer: await reserved() }; }, marker: n => path.join(state, n) };
}
test('legacy-owner-migration inspection is read-only and rejects stale/busy/foreign root evidence', async t => {
  const f = fixture(t), before = installer.snapshot(f.base), opts = f.options(), checked = await f.api.inspectLegacyMigration(opts);
  assert.match(checked.proofHash, /^[a-f0-9]{64}$/); assert.deepEqual(installer.snapshot(f.base), before); assert.equal(f.stopCalls(), 0);
  for (const changed of [{ ...opts, observedAt: '2020-01-01T00:00:00Z' }, { ...opts, rootStatus: { ...f.rootStatus, worker: { pending: 1 } } }, { ...opts, rootStatus: { ...f.rootStatus, unresolved: ['unknown'] } }, { ...opts, plan: structuredClone(f.plan) }]) await assert.rejects(f.api.inspectLegacyMigration(changed));
  fs.writeFileSync(f.marker('runtime-owner.json'), '{}'); await assert.rejects(f.api.inspectLegacyMigration(opts), /legacy_migration_marker/); assert.equal(f.stopCalls(), 0);
});
test('legacy-owner-migration one root stop promotes the SAME lease and archives only known markers', async t => {
  const f = fixture(t), opts = f.options(), checked = await f.api.inspectLegacyMigration(opts), journal = fs.readFileSync(f.marker('receiver/completions.ndjson'));
  const result = await f.api.stopLegacyForUpdate({ ...opts, expectedProofHash: checked.proofHash });
  assert.equal(f.stopCalls(), 1); assert.equal(result.nativeDispatch, 0);
  const api = f.load('runtime/install-lease.js'); api.assertInstallLease(result.lease, { installRoot: f.d.installRoot, stateDir: f.d.stateDir, descriptorPath: f.plan.descriptorPath }, { full: true });
  const cap = f.api.assertLegacyStoppedCapability(result.stoppedCapability, { plan: f.plan, lease: result.lease });
  assert.equal(cap.installation.packageHash, f.d.packageHash); assert.equal(cap.facts.markers['broker/broker-owner.gate'].hash, null);
  assert.equal(fs.existsSync(f.marker('broker/broker-owner.lock')), false); assert.equal(fs.existsSync(f.marker('receiver/owner')), false); assert.deepEqual(fs.readFileSync(f.marker('receiver/completions.ndjson')), journal);
  for (const clone of [{}, structuredClone(result.stoppedCapability)]) assert.throws(() => f.api.assertLegacyStoppedCapability(clone, { plan: f.plan, lease: result.lease }), /legacy_migration_stopped_brand/);
  fs.appendFileSync(f.args.configPath, '\n# drift\n'); assert.throws(() => f.api.assertLegacyStoppedCapability(result.stoppedCapability, { plan: f.plan, lease: result.lease }), /install_baseline_changed/);
});
test('legacy-owner-migration drift after the only stop leaves gates/barrier and refuses replay', async t => {
  const f = fixture(t), opts = f.options(), checked = await f.api.inspectLegacyMigration(opts);
  f.hook(() => fs.appendFileSync(f.marker('receiver/completions.ndjson'), '{}\n'));
  await assert.rejects(f.api.stopLegacyForUpdate({ ...opts, expectedProofHash: checked.proofHash })); assert.equal(f.stopCalls(), 1);
  assert.equal(fs.existsSync(path.join(f.d.installRoot, 'install.lock')), true); assert.equal(fs.existsSync(f.marker('runtime-maintenance.json')), true);
  await assert.rejects(f.api.stopLegacyForUpdate({ ...opts, id: crypto.randomUUID(), expectedProofHash: checked.proofHash })); assert.equal(f.stopCalls(), 1);
});
for (const boundary of ['retain', 'inspect']) test('legacy-owner-migration lost install gate after native ' + boundary + ' refuses before stop', async t => {
  const f = fixture(t), opts = f.options(), checked = await f.api.inspectLegacyMigration(opts);
  f.during(step => { if (step === boundary) fs.writeFileSync(path.join(f.d.installRoot, 'install.lock'), 'foreign-gate'); });
  await assert.rejects(f.api.stopLegacyForUpdate({ ...opts, expectedProofHash: checked.proofHash }), /install_lease_changed/); assert.equal(f.stopCalls(), 0);
  assert.equal(fs.readFileSync(path.join(f.d.installRoot, 'install.lock'), 'utf8'), 'foreign-gate');
});
for (const boundary of ['before-stop', 'after-stop', 'capability']) test('legacy-owner-migration barrier inode drift ' + boundary + ' refuses exact CAS', async t => {
  const f = fixture(t), opts = f.options(), checked = await f.api.inspectLegacyMigration(opts); let replaced = false;
  const replace = () => { if (replaced) return; replaced = true; const file = f.marker('runtime-maintenance.json'), bytes = fs.readFileSync(file); fs.renameSync(file, path.join(f.base, 'retained-original-barrier')); fs.writeFileSync(file, bytes); };
  if (boundary === 'before-stop') f.during(step => { if (step === 'retain') replace(); });
  if (boundary === 'after-stop') f.hook(replace);
  if (boundary === 'capability') {
    const result = await f.api.stopLegacyForUpdate({ ...opts, expectedProofHash: checked.proofHash }); replace();
    assert.throws(() => f.api.assertLegacyStoppedCapability(result.stoppedCapability, { plan: f.plan, lease: result.lease }), /legacy_migration_changed/);
  } else {
    await assert.rejects(f.api.stopLegacyForUpdate({ ...opts, expectedProofHash: checked.proofHash }), /legacy_migration_changed/);
    assert.equal(f.stopCalls(), boundary === 'before-stop' ? 0 : 1);
    assert.equal(fs.existsSync(f.marker('broker/broker-owner.lock')), true); assert.equal(fs.existsSync(f.marker('receiver/owner')), true);
  }
});
const crash = () => Object.assign(Error('synthetic legacy phase crash'), { code: 'fixture_legacy_crash' });
async function interrupted(t, boundary) {
  const f = fixture(t), opts = f.options(), proof = (await f.api.inspectLegacyMigration(opts)).proofHash; let fired = false;
  const method = ['broker-owner.lock', 'receiver-owner'].includes(boundary) ? 'renameSync' : 'fsyncSync', original = f.io[method];
  f.io[method] = (...args) => { const result = original(...args), file = method === 'renameSync' ? args[1] : f.opened.get(args[0]); if (!fired && file && path.basename(file) === boundary) { fired = true; throw crash(); } return result; };
  try { await assert.rejects(f.api.stopLegacyForUpdate({ ...opts, expectedProofHash: proof }), e => e.code === 'fixture_legacy_crash'); } finally { f.io[method] = original; }
  assert.equal(fired, true); return { f, id: opts.id, directory: path.join(f.d.installRoot, 'transactions', opts.id + '-legacy-migration') };
}
for (const boundary of ['intent.json', 'runtime-maintenance.json', 'stop-intent.json', 'stop-receipt.json', 'retirement-intent.json', 'broker-owner.lock', 'completion.json']) test('legacy-owner-migration recovery finishes original ' + boundary + ' prefix without stop replay or normal plan rebrand', async t => {
  const { f, id } = await interrupted(t, boundary), calls = f.stopCalls();
  f.crashActor(); f.targetDead(); const options = await f.recoveryOptions(id), history = fs.readFileSync(f.marker('receiver/completions.ndjson')), oldDescriptor = fs.readFileSync(options.descriptorPath);
  const inspection = await f.api.inspectLegacyPreparedRecovery(options), cap = await f.api.finishLegacyPreparedRecovery({ ...options, expectedProofHash: inspection.proofHash }), a = f.api.assertLegacyPreparedRecovery(cap), b = f.api.assertLegacyPreparedRecovery(cap);
  assert.equal(a.lease, b.lease); assert.equal(a.installation, b.installation); assert.equal(a.payload.preparedPlanHash, installer.assertPreparedInstallPlan(f.plan).preparedPlanHash); assert.equal(f.stopCalls(), calls);
  assert.equal(a.facts.markers['broker/broker-owner.gate'].hash, null); assert.equal(fs.existsSync(f.marker('broker/broker-owner.lock')), false); assert.equal(fs.existsSync(f.marker('receiver/owner')), false);
  assert.deepEqual(fs.readFileSync(f.marker('receiver/completions.ndjson')), history); assert.deepEqual(fs.readFileSync(options.descriptorPath), oldDescriptor);
  assert.throws(() => installer.applyInstall(a.payload), /prepared_install_plan_brand_or_changed/); assert.throws(() => f.api.assertLegacyPreparedRecovery({ ...cap }), /legacy_migration_recovery_brand/);
  f.load('runtime/install-lease.js').assertInstallLease(a.lease, { installRoot: f.d.installRoot, stateDir: f.d.stateDir, descriptorPath: options.descriptorPath }, { full: true }); f.crashActor();
});
test('legacy-owner-migration unknown stop with still-live exact target refuses and never sends another stop', async t => {
  const { f, id } = await interrupted(t, 'stop-intent.json'); f.crashActor(); const options = await f.recoveryOptions(id), before = installer.snapshot(f.base);
  await assert.rejects(f.api.inspectLegacyPreparedRecovery(options), /legacy_migration_process_not_dead/); assert.deepEqual(installer.snapshot(f.base), before); assert.equal(f.stopCalls(), 0);
  f.targetDead(); assert.match((await f.api.inspectLegacyPreparedRecovery(options)).proofHash, /^[a-f0-9]{64}$/); assert.equal(f.stopCalls(), 0);
});
test('legacy-owner-migration native actor ticks are exact; live actor and unavailable observations preserve fences', async t => {
  const { f, id } = await interrupted(t, 'stop-receipt.json'), options = await f.recoveryOptions(id); const before = installer.snapshot(f.base);
  await assert.rejects(f.api.inspectLegacyPreparedRecovery(options), /legacy_migration_process_not_dead/); f.crashActor(); f.unavailable(true);
  await assert.rejects(f.api.inspectLegacyPreparedRecovery(options), /legacy_process_probe_failed/); assert.deepEqual(installer.snapshot(f.base), before); f.unavailable(false);
});
for (const boundary of ['recover-record', 'gate-replace', 'archive', 'completion']) test('legacy-owner-migration interrupted recovery ' + boundary + ' retains continuous install gate and attributes the next actor', async t => {
  const { f, id, directory } = await interrupted(t, 'stop-receipt.json'); f.crashActor(); const options = await f.recoveryOptions(id), proof = (await f.api.inspectLegacyPreparedRecovery(options)).proofHash; let fired = false;
  const method = boundary === 'gate-replace' || boundary === 'archive' ? 'renameSync' : 'linkSync', original = f.io[method];
  f.io[method] = (...args) => {
    const to = String(args[1]); if (method === 'renameSync' && to === path.join(f.d.installRoot, 'install.lock')) assert.equal(fs.existsSync(to), true, 'original install gate must never disappear');
    const result = original(...args), matches = boundary === 'recover-record' ? /^recover-[a-f0-9-]{36}\.json$/.test(path.basename(to)) : boundary === 'gate-replace' ? to === path.join(f.d.installRoot, 'install.lock') : boundary === 'archive' ? path.basename(to) === 'broker-owner.lock' : /-completed\.json$/.test(to);
    if (!fired && matches) { fired = true; throw crash(); } return result;
  };
  try { await assert.rejects(f.api.finishLegacyPreparedRecovery({ ...options, expectedProofHash: proof }), e => e.code === 'fixture_legacy_crash'); } finally { f.io[method] = original; }
  assert.equal(fired, true); assert.equal(fs.existsSync(path.join(f.d.installRoot, 'install.lock')), true);
  await assert.rejects(f.api.inspectLegacyPreparedRecovery(options), /legacy_migration_process_not_dead/); f.crashActor();
  const nextProof = (await f.api.inspectLegacyPreparedRecovery(options)).proofHash, cap = await f.api.finishLegacyPreparedRecovery({ ...options, expectedProofHash: nextProof }); f.api.assertLegacyPreparedRecovery(cap);
  assert.equal(fs.readdirSync(directory).filter(n => /^recover-[a-f0-9-]{36}\.json$/.test(n)).length, 2); assert.equal(f.stopCalls(), 1); f.crashActor();
});
test('legacy-owner-migration prepared copy, foreign marker and observation drift refuse before recovery writes', async t => {
  for (const change of ['prepared', 'foreign', 'drift']) {
    const { f, id, directory } = await interrupted(t, 'stop-receipt.json'); f.crashActor(); const options = await f.recoveryOptions(id);
    if (change === 'prepared') { const file = path.join(directory, 'original-prepared.json'), bytes = fs.readFileSync(file); fs.renameSync(file, path.join(f.base, 'saved-prepared')); fs.writeFileSync(file, bytes); }
    if (change === 'foreign') fs.writeFileSync(f.marker('receiver/owner'), 'foreign');
    if (change === 'drift') f.probe(() => { fs.appendFileSync(f.args.configPath, '\n# foreign\n'); });
    await assert.rejects(f.api.inspectLegacyPreparedRecovery(options)); assert.equal(fs.readdirSync(directory).some(n => n.startsWith('recover-')), false); assert.equal(f.stopCalls(), 1);
  }
});
test('legacy-owner-migration recovered opaque preparation stages the ORIGINAL payload through dedicated update recovery', async t => {
  const { f, id } = await interrupted(t, 'stop-receipt.json'); f.crashActor(); const options = await f.recoveryOptions(id), originalKeys = { panel: f.plan.descriptor.panelToken, control: f.plan.descriptor.controlToken }, history = fs.readFileSync(f.marker('receiver/completions.ndjson'));
  const prepared = await f.api.finishLegacyPreparedRecovery({ ...options, expectedProofHash: (await f.api.inspectLegacyPreparedRecovery(options)).proofHash });
  const update = f.load('tools/stopped-update.js'), recovery = await update.createLegacyStoppedRecovery(prepared), result = update.stageStoppedRecovery(recovery);
  assert.equal(result.updated, true); assert.equal(result.phase, 'update-stopped'); const applied = JSON.parse(fs.readFileSync(options.descriptorPath));
  assert.equal(applied.packageHash, f.plan.pkg.packageHash); assert.equal(applied.panelToken, originalKeys.panel); assert.equal(applied.controlToken, originalKeys.control); assert.equal(f.stopCalls(), 1);
  assert.deepEqual(fs.readFileSync(f.marker('receiver/completions.ndjson')), history); assert.equal(JSON.parse(fs.readFileSync(f.marker('runtime-maintenance.json'))).body.kind, 'update-stopped'); f.crashActor();
});
test('legacy-owner-migration normal shared-brand stop prepare apply completes with the ORIGINAL keys and journal', async t => {
  const f = fixture(t, { sharedInstaller: true }), opts = f.options(), checked = await f.api.inspectLegacyMigration(opts), journal = fs.readFileSync(f.marker('receiver/completions.ndjson'));
  const stopped = await f.api.stopLegacyForUpdate({ ...opts, expectedProofHash: checked.proofHash }), update = f.load('tools/stopped-update.js');
  const prepared = await update.prepareLegacyStoppedUpdate({ plan: f.plan, lease: stopped.lease, stoppedCapability: stopped.stoppedCapability, reservedServer: (await f.recoveryOptions(opts.id)).reservedServer });
  const result = update.applyStoppedUpdate({ plan: f.plan, ...prepared }); assert.equal(result.phase, 'update-stopped');
  const applied = JSON.parse(fs.readFileSync(f.plan.descriptorPath)); assert.equal(applied.panelToken, f.plan.descriptor.panelToken); assert.equal(applied.controlToken, f.plan.descriptor.controlToken); assert.equal(applied.packageHash, f.plan.pkg.packageHash);
  assert.deepEqual(fs.readFileSync(f.marker('receiver/completions.ndjson')), journal); assert.equal(f.stopCalls(), 1); assert.equal(JSON.parse(fs.readFileSync(f.marker('runtime-maintenance.json'))).body.kind, 'update-stopped'); f.crashActor();
});
test('legacy-owner-migration normal shared-brand refuses unknown client staging before stop or gate publication', async t => {
  const f = fixture(t, { sharedInstaller: true }), stage = path.join(f.d.installRoot, 'core-client.json.next'); fs.writeFileSync(stage, 'foreign-client-stage'); const before = installer.snapshot(f.base);
  await assert.rejects(f.api.inspectLegacyMigration(f.options()), /client_binding_staging_exists/);
  await assert.rejects(f.api.stopLegacyForUpdate({ ...f.options(), expectedProofHash: 'f'.repeat(64) }), /client_binding_staging_exists/);
  assert.equal(f.stopCalls(), 0); assert.equal(fs.existsSync(path.join(f.d.installRoot, 'install.lock')), false); assert.equal(fs.existsSync(f.marker('runtime-maintenance.json')), false); assert.deepEqual(installer.snapshot(f.base), before); f.crashActor();
});
for (const drift of ['config', 'config-inode', 'history', 'marker']) test('legacy-owner-migration normal shared-brand staged certificate still refuses ' + drift + ' drift before visible switch', async t => {
  const f = fixture(t, { sharedInstaller: true }), opts = f.options(), checked = await f.api.inspectLegacyMigration(opts), descriptor = fs.readFileSync(f.plan.descriptorPath), cep = installer.snapshot(f.plan.cepDir);
  const stopped = await f.api.stopLegacyForUpdate({ ...opts, expectedProofHash: checked.proofHash }), update = f.load('tools/stopped-update.js');
  const prepared = await update.prepareLegacyStoppedUpdate({ plan: f.plan, lease: stopped.lease, stoppedCapability: stopped.stoppedCapability, reservedServer: (await f.recoveryOptions(opts.id)).reservedServer });
  const original = update.stoppedUpdateSwitchReady; let injected = false;
  update.stoppedUpdateSwitchReady = (...args) => {
    assert.equal(fs.existsSync(path.join(f.d.installRoot, 'core-client.json.next')), true, 'inject after the installer staged-aware baseline CAS'); injected = true;
    if (drift === 'config') fs.appendFileSync(f.args.configPath, '\n# foreign config revision\n');
    if (drift === 'config-inode') { const bytes = fs.readFileSync(f.args.configPath); fs.renameSync(f.args.configPath, path.join(f.base, 'retained-config')); fs.writeFileSync(f.args.configPath, bytes); }
    if (drift === 'history') fs.appendFileSync(f.marker('receiver/completions.ndjson'), '{}\n');
    if (drift === 'marker') fs.writeFileSync(f.marker('runtime-owner.json'), '{}');
    return original(...args);
  };
  try { assert.throws(() => update.applyStoppedUpdate({ plan: f.plan, ...prepared }), e => /^(install_baseline_changed|legacy_migration_|receiver_|recovery_)/.test(e.code || '') && e.leaseRetained === true); } finally { update.stoppedUpdateSwitchReady = original; }
  assert.equal(injected, true); assert.equal(f.stopCalls(), 1); assert.deepEqual(fs.readFileSync(f.plan.descriptorPath), descriptor); assert.deepEqual(installer.snapshot(f.plan.cepDir), cep);
  assert.equal(fs.existsSync(path.join(f.d.installRoot, 'install.lock')), true); assert.equal(fs.existsSync(f.marker('runtime-maintenance.json')), true); f.crashActor();
});

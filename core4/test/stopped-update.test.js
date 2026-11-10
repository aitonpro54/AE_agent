'use strict';
// Real TEMP packages/installations and fs CAS; synthetic process observations.
const nodeTest = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), os = require('node:os'), crypto = require('node:crypto'), http = require('node:http'), Module = require('node:module');
const { fork, spawn, spawnSync } = require('node:child_process');
const { once } = require('node:events');
const { buildPackage, verifyPackage } = require('../tools/package-installable'), { canonical, hash } = require('../protocol/json');
const { packageCapability, composeCapability } = require('../tools/package-capability');
const { verifyStandalone } = require('../tools/standalone-installer');
const { classifyOwnerProcess } = require('../runtime/windows-owner-process');
const SOURCE = path.resolve(__dirname, '..'), packages = new Map();
const test = (name, fn) => nodeTest('stopped-update ' + name, { timeout: 90000 }, fn);
function pkg(composition) { if (!packages.has(composition)) packages.set(composition, buildPackage(SOURCE, composition, { runtimeModel: 'owner' })); return packages.get(composition); }
async function harness(t, { current = pkg('readonly'), next = pkg('manual'), withHistory = false, beforeStop } = {}) {
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
  installer.applyInstall(installer.planInstall({ ...args, pkg: current }));
  const descriptorPath = path.join(args.installRoot, 'installation.json'), d = JSON.parse(fs.readFileSync(descriptorPath)), maintenance = load(path.join(SOURCE, 'runtime/owner-maintenance'));
  if (withHistory) {
    load(path.join(SOURCE, 'integrations/cep/completion-store')).openCompletionStore({ directory: path.join(d.stateDir, 'receiver'), installationContext: { descriptorPath } }).close();
    const { Ledger } = load(path.join(SOURCE, 'core/ledger'));
    new Ledger(path.join(d.stateDir, 'broker/ledger.ndjson')).append({ type: 'task', taskId: 'fixture-settled-task', epoch: 1, reset: true });
  }
  const originalScope = { bootId: crypto.randomUUID(), pid: 2147483000, birthTicks: String(birth) }, id = crypto.randomUUID();
  let frozen = false;
  const m = maintenance.createOwnerMaintenance({ installation: d, descriptorPath, lifecycle: { state: () => ({ processBootId: originalScope.bootId, ...originalScope }) }, freeze() { frozen = true; }, activity: () => ({ pending: false }), accepted: () => 0, close: async () => {}, intervalMs: 1 });
  const stop = () => m.request(maintenance.createStopAuthorization({ installation: d, descriptorPath, scope: originalScope, id }));
  const render = await beforeStop?.({ args, d, m, stop, frozen: () => frozen, load });
  stop(); assert.equal((await m.done).phase, 'stopped');
  const server = http.createServer(); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const certifier = load(path.join(SOURCE, 'runtime/stopped-certification')), certOptions = { installation: d, descriptorPath, id, reservedServer: server };
  const cert = await certifier.certifyStoppedInstallation({ ...certOptions, expectedProofHash: (await certifier.inspectStoppedCertification(certOptions)).proofHash });
  const plan = installer.planInstall({ ...args, pkg: next }), options = { plan, certificate: cert, ...certOptions };
  const oldHash = hash(fs.readFileSync(descriptorPath)), barrier = path.join(d.stateDir, 'runtime-maintenance.json');
  const recovery = () => ({ installation: d, descriptorPath, transactionId: plan.transactionId, expectedPreviousDescriptorHash: oldHash, expectedPackageHash: plan.pkg.packageHash, reservedServer: server });
  t.after(async () => { for (const fd of tracked) { try { fs.closeSync(fd); } catch {} } tracked.clear(); await new Promise(resolve => server.close(resolve)); assert.ok(base.startsWith(path.join(os.tmpdir(), 'core4-stopped-update-')) && path.resolve(base) === base); fs.rmSync(base, { recursive: true, force: true }); });
  return { base, args, d, descriptorPath, cert, plan, options, api, installer, io, names, barrier, recovery, load, server, certifier, render,
    legacyPort(port) { legacyPort = port; },
    dead() { for (const fd of [...tracked]) io.closeSync(fd); birth += 10n; }, reviveFixtureActor() { birth -= 10n; }, onProbe(fn) { probeHook = fn; }, unavailable(v) { unavailable = v; },
    async prepared() { return api.prepareStoppedUpdate(options); } };
}
const code = v => e => e.code === v;
async function settledRender({ args, d, m, stop, frozen, load }) {
  const { createJobs } = load(path.join(SOURCE, 'runtime/aerender-jobs'));
  const root = path.join(d.stateDir, 'render-jobs-v1');
  const writeInput = name => {
    const file = path.join(path.dirname(args.installRoot), name);
    fs.writeFileSync(file, name);
    return { path: file, sha256: hash(name) };
  };
  const staged = { project: writeInput('source.aep'), output: path.join(args.installRoot, '../out.mp4'),
    media: [], target: { compId: 1, compName: 'Fixture', queueIndex: 1, frames: 2, fps: '24/1', width: 64, height: 64, audio: false },
    queue: [{ index: 1, name: 'Fixture', status: 'Queued', compId: 1, frames: 2, format: 'H.264' }] };
  const tools = { engine: writeInput('aerender.exe'), ffmpeg: writeInput('ffmpeg.exe'), ffprobe: writeInput('ffprobe.exe') };
  const toolchain = path.join(d.stateDir, 'render-job-toolchain.json');
  fs.writeFileSync(toolchain, canonical(tools));
  const jobs = createJobs(root, pid => ({ pid, parent: 0, exe: process.execPath, commandLine: 'fixture', birth: new Date(0).toISOString() }));
  const authorize = () => {
    const commandId = 'command-' + crypto.randomUUID(), taskId = 'task-' + crypto.randomUUID();
    const hex = hash(['ae-core4/render-job/v1', d.installationId, commandId]);
    const id = [hex.slice(0,8), hex.slice(8,12), '8' + hex.slice(13,16),
      ((parseInt(hex[16], 16) & 3) | 8).toString(16) + hex.slice(17,20), hex.slice(20,32)].join('-');
    return { id, authorization: { installationId: d.installationId, commandId, taskId, stageHash: hash(staged) } };
  };
  const spec = { ...staged, ...tools }, interrupted = authorize();
  fs.mkdirSync(path.join(root, interrupted.id));
  fs.writeFileSync(path.join(root, interrupted.id, 'prepare-intent.json'), canonical(interrupted));
  assert.throws(stop, code('render_job_maintenance_unsettled'));
  assert.equal(frozen(), false);
  assert.equal(m.status().phase, 'running');
  fs.unlinkSync(path.join(root, interrupted.id, 'prepare-intent.json'));
  fs.rmdirSync(path.join(root, interrupted.id));
  const prepared = authorize();
  const { id } = jobs.prepare(spec, prepared);
  // Start is waiting for the R1 lock when the stop request inspects the
  // registry. Stop refuses without freezing or revoking the live controller.
  const start = jobs.start(id, () => { assert.equal(frozen(), false); throw Error('test_before_dispatch'); });
  assert.throws(stop, code('render_job_maintenance_unsettled'));
  await assert.rejects(start, /test_before_dispatch/);
  assert.equal(jobs.status(id).state, 'prepared');
  assert.equal((await jobs.cancel(id)).state, 'cancelled');
  const history = path.join(root, id, 'cancelled.json');
  return { id, history, historyHash: hash(fs.readFileSync(history)), toolchain,
    prepare: () => jobs.prepare(spec, authorize()), start: () => jobs.start(id) };
}
test('R1 refuses stop while prepare or start is unsettled, then updates and enables with exact settled history', async t => {
  const h = await harness(t, { current: pkg('operator-render-jobs'), beforeStop: settledRender });
  assert.throws(h.render.prepare, /render_job_maintenance/);
  const updated = h.api.applyStoppedUpdate({ plan: h.plan, ...await h.prepared() });
  assert.equal(updated.updated, true);
  h.dead(); // Separate update and enable invocations, with proven original actor exit.
  const view = await h.api.inspectStoppedUpdate(h.recovery());
  const enabled = await h.api.enableStoppedUpdate({ ...h.recovery(), expectedProofHash: view.proofHash });
  assert.equal(enabled.enabled, true);
  assert.equal(JSON.parse(fs.readFileSync(h.descriptorPath)).installationId, h.d.installationId);
  assert.equal(hash(fs.readFileSync(h.render.history)), h.render.historyHash);
  assert.equal(JSON.parse(fs.readFileSync(h.render.history)).id, h.render.id);
});
test('R1 toolchain drift after switching leaves enable fenced', async t => {
  const h = await harness(t, { current: pkg('operator-render-jobs'), beforeStop: settledRender });
  h.api.applyStoppedUpdate({ plan: h.plan, ...await h.prepared() });
  fs.appendFileSync(h.render.toolchain, '\n');
  await assert.rejects(h.api.inspectStoppedUpdate(h.recovery()), code('stopped_update_render_jobs_changed'));
  assert.ok(fs.existsSync(h.barrier));
  assert.equal(hash(fs.readFileSync(h.render.history)), h.render.historyHash);
});
function intercept(h, method, callback) { const original = h.io[method]; h.io[method] = (...args) => callback(original, ...args); return () => { h.io[method] = original; }; }
test('C1b packages, admits and updates one independent Titles capability through the stopped owner path', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'core4-capability-'));
  t.after(() => { assert.ok(root.startsWith(path.join(os.tmpdir(), 'core4-capability-')) && path.resolve(root) === root); fs.rmSync(root, { recursive: true, force: true }); });
  const slot = 'titles-current-target', source = path.join(root, slot), modulePath = 'modules/' + slot, admissionPath = 'config/admissions/' + slot + '.json';
  fs.mkdirSync(source);
  for (const file of ['artifact.json', 'contract.json', 'executor.jsx', 'implementation.js']) fs.copyFileSync(path.join(SOURCE, modulePath, file), path.join(source, file));
  const base = pkg('manual'), basePath = path.join(root, 'base.json'), originalAdmission = Buffer.from(base.files[admissionPath], 'base64');
  const initial = packageCapability(source);
  const pins = (bundle, admission, current = base) => ({ basePin: current.packageHash, capabilityPin: bundle.capabilityHash, admissionPin: hash(admission) });
  assert.deepEqual(packageCapability(source), initial);
  assert.equal(composeCapability(base, initial, originalAdmission, pins(initial, originalAdmission)), base);
  fs.writeFileSync(basePath, canonical(base));

  const artifactPath = path.join(source, 'artifact.json'), artifact = JSON.parse(fs.readFileSync(artifactPath));
  const executorPath = path.join(source, 'executor.jsx');
  fs.appendFileSync(executorPath, '\n/* C1b exact-byte update fixture */\n');
  artifact.version = '4.0.1';
  artifact.hashes['executor.jsx'] = hash(fs.readFileSync(executorPath));
  fs.writeFileSync(artifactPath, canonical(artifact));
  const reviewed = { ...JSON.parse(originalAdmission), artifactHash: hash(artifact), executorHash: artifact.hashes['executor.jsx'], trustApprovalId: 'test-c1b-independent-review' };
  const admission = Buffer.from(canonical(reviewed)), approvalPath = path.join(root, 'approval.json');
  fs.writeFileSync(approvalPath, admission);

  const capabilityPath = path.join(root, 'capability.json'), distribution = path.join(root, 'distribution');
  const cli = (...args) => spawnSync(process.execPath, [path.join(SOURCE, 'tools/package-capability.js'), ...args], { cwd: root, encoding: 'utf8', timeout: 20000, windowsHide: true });
  const packed = cli('pack', '--source', source, '--output', capabilityPath);
  assert.equal(packed.status, 0, packed.stderr);
  const bundle = JSON.parse(fs.readFileSync(capabilityPath));
  assert.equal(JSON.parse(packed.stdout).capabilityHash, bundle.capabilityHash);
  assert.deepEqual(bundle, packageCapability(source));
  assert.notEqual(bundle.capabilityHash, initial.capabilityHash);
  const composeArgs = ['compose', '--base', basePath, '--expected-base-hash', base.packageHash,
    '--capability', capabilityPath, '--expected-capability-hash', bundle.capabilityHash,
    '--admission', approvalPath, '--expected-admission-sha256', hash(admission), '--output', distribution];
  const bad = [...composeArgs]; bad[bad.indexOf('--expected-capability-hash') + 1] = initial.capabilityHash;
  const denied = cli(...bad);
  assert.equal(denied.status, 1, denied.stdout); assert.match(denied.stderr, /capability_pin/);
  assert.equal(fs.existsSync(distribution), false);
  const composed = cli(...composeArgs);
  assert.equal(composed.status, 0, composed.stderr);
  const checked = verifyStandalone(distribution, JSON.parse(composed.stdout).distributionHash);
  assert.equal(checked.capabilityBaseHash, base.packageHash);
  assert.deepEqual(checked.pkg, composeCapability(base, bundle, admission, pins(bundle, admission)));
  const changed = Object.keys(base.files).filter(file => base.files[file] !== checked.pkg.files[file]);
  assert.deepEqual(changed.sort(), [modulePath + '/artifact.json', modulePath + '/executor.jsx', admissionPath, 'config/catalog.json', 'cep/jsx/registry.jsx'].sort());
  assert.equal(checked.pkg.release.version, base.release.version);

  const tampered = structuredClone(bundle); tampered.files['executor.jsx'] = initial.files['executor.jsx'];
  assert.throws(() => composeCapability(base, tampered, admission, pins(bundle, admission)), code('capability_bytes'));
  assert.throws(() => composeCapability(base, bundle, admission, { ...pins(bundle, admission), admissionPin: hash(originalAdmission) }), code('capability_admission_pin'));
  assert.throws(() => composeCapability(base, bundle, originalAdmission, pins(bundle, originalAdmission)), code('composition_not_admitted'));
  const revoked = Buffer.from(canonical({ ...reviewed, revoked: true }));
  assert.throws(() => composeCapability(base, bundle, revoked, pins(bundle, revoked)), code('composition_not_admitted'));
  const codecMismatch = '(function(){ JSON.stringify({optional:void 0}); return ' + fs.readFileSync(executorPath, 'utf8') + '\n; }())';
  for (const [file, value, error] of [
    ['executor.jsx', 'null', 'capability_executor_interface'],
    ['implementation.js', 'module.exports = {};', 'capability_builder_interface'],
    ['executor.jsx', codecMismatch, 'capability_registry_initialization']
  ]) {
    const invalid = structuredClone(bundle), changed = structuredClone(artifact);
    const set = (name, text) => {
      invalid.files[name] = Buffer.from(text).toString('base64');
      invalid.manifest.hashes[name] = hash(text);
    };
    set(file, value);
    changed.hashes[file] = hash(value);
    set('artifact.json', canonical(changed));
    invalid.capabilityHash = hash(invalid.manifest);
    const exactApproval = Buffer.from(canonical({ ...reviewed, artifactHash: hash(changed), executorHash: changed.hashes['executor.jsx'] }));
    assert.throws(() => composeCapability(base, invalid, exactApproval, pins(invalid, exactApproval)), code(error));
  }
  const readonly = pkg('readonly');
  assert.throws(() => composeCapability(readonly, bundle, admission, pins(bundle, admission, readonly)), code('capability_base_composition'));
  const contractPath = path.join(source, 'contract.json'), incompatible = JSON.parse(fs.readFileSync(contractPath));
  incompatible.effectPolicy = { ...incompatible.effectPolicy, effect: 'layer.transform' };
  fs.writeFileSync(contractPath, canonical(incompatible));
  artifact.hashes['contract.json'] = hash(fs.readFileSync(contractPath));
  fs.writeFileSync(artifactPath, canonical(artifact));
  const changedContract = packageCapability(source);
  assert.throws(() => composeCapability(base, changedContract, admission, pins(changedContract, admission)), code('capability_contract_incompatible'));

  const otherBase = structuredClone(base), unrelatedPath = 'cep/index.html';
  const newerHtml = Buffer.concat([Buffer.from(base.files[unrelatedPath], 'base64'), Buffer.from('\n<!-- unrelated owner release -->')]);
  otherBase.files[unrelatedPath] = newerHtml.toString('base64');
  otherBase.release.hashes[unrelatedPath] = hash(newerHtml);
  otherBase.packageHash = hash(otherBase.release);
  verifyPackage(otherBase);
  const bootstrap = require(path.join(distribution, 'tools/standalone-installer.js'));
  const installRoot = path.join(root, 'must-not-write');
  const bindings = ['--expected-distribution-hash', checked.distributionHash, '--expected-package-hash', checked.packageHash];
  assert.throws(() => bootstrap.main(['apply', ...bindings, '--install-root', installRoot, '--extensions-dir', path.join(root, 'extensions'), '--config', path.join(root, 'config.toml')]), code('capability_stopped_update_required'));
  const updateArgs = ['owner-update', ...bindings, '--expected-previous-descriptor-hash', 'a'.repeat(64),
    '--installation', path.join(installRoot, 'installation.json'), '--operation', crypto.randomUUID(), '--config', path.join(root, 'config.toml')];
  assert.throws(() => bootstrap.main([...updateArgs, '--expected-current-package-hash', otherBase.packageHash]), code('capability_update_base'));
  assert.equal(fs.existsSync(installRoot), false);
  const operator = require(path.join(distribution, 'tools/operate-stopped-update.js')), operate = operator.operate;
  operator.operate = async cap => bootstrap.assertUpdateBootstrap(cap).expectedCurrentPackageHash;
  try { assert.equal(await bootstrap.main([...updateArgs, '--expected-current-package-hash', base.packageHash]), base.packageHash); }
  finally { operator.operate = operate; }

  const h = await harness(t, { current: base, next: checked.pkg, withHistory: true });
  const protectedFiles = ['origin.json', 'receiver/completions.ndjson', 'broker/ledger.ndjson'].map(file => path.join(h.d.stateDir, file));
  const before = protectedFiles.map(file => fs.readFileSync(file));
  assert.throws(() => h.installer.applyInstall(h.plan), code('runtime_lifecycle_owned_or_maintenance'));
  const prepared = await h.prepared();
  const applied = h.api.applyStoppedUpdate({ plan: h.plan, ...prepared });
  assert.equal(applied.phase, 'update-stopped');
  assert.equal(applied.runtimeStarted, false);
  assert.equal(fs.existsSync(h.barrier), true);
  const installed = h.load(path.join(SOURCE, 'runtime/stdio-entry')).verifyInstallation(h.descriptorPath);
  assert.equal(installed.packageHash, checked.packageHash);
  assert.equal(installed.installationId, h.d.installationId);
  assert.equal(installed.stateDir, h.d.stateDir);
  assert.equal(hash(fs.readFileSync(path.join(installed.releaseDir, modulePath, 'executor.jsx'))), reviewed.executorHash);
  const { Artifacts } = h.load(path.join(SOURCE, 'core/artifacts'));
  const store = new Artifacts({ root: installed.releaseDir, store: path.join(root, 'artifact-store') });
  assert.equal(store.select(slot).pin, reviewed.artifactHash);
  assert.equal((await h.api.enableStoppedUpdate({ permit: prepared.permit })).enabled, true);
  assert.equal(fs.existsSync(h.barrier), false);
  protectedFiles.forEach((file, index) => assert.deepEqual(fs.readFileSync(file), before[index]));
});
test('C1c replaces an already admitted declarative text-layer slot from a relocated capability', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'core4-операция с пробелом-'));
  t.after(() => {
    assert.equal(path.dirname(fs.realpathSync(root)), fs.realpathSync(os.tmpdir()));
    assert.match(path.basename(root), /^core4-операция с пробелом-/);
    fs.rmSync(root, { recursive: true, force: true });
  });
  const slot = 'text-layer', modulePath = 'modules/' + slot, admissionPath = 'config/admissions/' + slot + '.json';
  const source = path.join(root, 'поставка');
  fs.cpSync(path.join(SOURCE, modulePath), source, { recursive: true });
  const base = pkg('manual-titles-variants'), baseFile = path.join(root, 'base.json');
  const artifactFile = path.join(source, 'artifact.json'), executorFile = path.join(source, 'executor.jsx');
  const artifact = JSON.parse(fs.readFileSync(artifactFile));
  fs.appendFileSync(executorFile, '\n/* C1c relocated exact-byte fixture */\n');
  artifact.version = '4.1.2';
  artifact.hashes['executor.jsx'] = hash(fs.readFileSync(executorFile));
  fs.writeFileSync(artifactFile, canonical(artifact));
  const originalAdmission = Buffer.from(base.files[admissionPath], 'base64');
  const reviewed = { ...JSON.parse(originalAdmission), artifactHash: hash(artifact),
    executorHash: artifact.hashes['executor.jsx'], trustApprovalId: 'test-c1c-reviewed-source' };
  const admission = Buffer.from(canonical(reviewed)), admissionFile = path.join(root, 'approval.json');
  fs.writeFileSync(baseFile, canonical(base));
  fs.writeFileSync(admissionFile, admission);

  const capability = path.join(root, 'capability.json'), distribution = path.join(root, 'установщик');
  const cli = (...args) => spawnSync(process.execPath, [path.join(SOURCE, 'tools/package-capability.js'), ...args],
    { cwd: root, encoding: 'utf8', timeout: 20000, windowsHide: true });
  const packed = cli('pack', '--source', source, '--output', capability);
  assert.equal(packed.status, 0, packed.stderr);
  assert.equal(JSON.parse(packed.stdout).moduleId, slot);
  const bundle = JSON.parse(fs.readFileSync(capability));
  assert.deepEqual(bundle, packageCapability(source));
  const pins = { basePin: base.packageHash, capabilityPin: bundle.capabilityHash, admissionPin: hash(admission) };
  const composed = cli('compose', '--base', baseFile, '--expected-base-hash', pins.basePin,
    '--capability', capability, '--expected-capability-hash', pins.capabilityPin,
    '--admission', admissionFile, '--expected-admission-sha256', pins.admissionPin, '--output', distribution);
  assert.equal(composed.status, 0, composed.stderr);
  const checked = verifyStandalone(distribution, JSON.parse(composed.stdout).distributionHash);
  assert.equal(checked.capabilityBaseHash, base.packageHash);
  assert.deepEqual(checked.pkg, composeCapability(base, bundle, admission, pins));
  assert.deepEqual(Object.keys(checked.pkg.files).sort(), Object.keys(base.files).sort());
  assert.deepEqual(Object.keys(base.files).filter(file => base.files[file] !== checked.pkg.files[file]).sort(),
    [modulePath + '/artifact.json', modulePath + '/executor.jsx', admissionPath, 'config/catalog.json', 'cep/jsx/registry.jsx'].sort());
  const smaller = pkg('manual');
  assert.throws(() => composeCapability(smaller, bundle, admission, { ...pins, basePin: smaller.packageHash }), code('capability_base_slot'));
  assert.throws(() => composeCapability(base, bundle, originalAdmission, { ...pins, admissionPin: hash(originalAdmission) }), code('composition_not_admitted'));
  assert.equal(packageCapability(path.join(SOURCE, 'modules/comp-render')).manifest.version, 2);

  const h = await harness(t, { current: base, next: checked.pkg, withHistory: true });
  const journals = ['receiver/completions.ndjson', 'broker/ledger.ndjson'].map(file => path.join(h.d.stateDir, file));
  const baseline = journals.map(file => fs.readFileSync(file));
  const prepared = await h.prepared();
  assert.equal(h.api.applyStoppedUpdate({ plan: h.plan, ...prepared }).phase, 'update-stopped');
  const installed = h.load(path.join(SOURCE, 'runtime/stdio-entry')).verifyInstallation(h.descriptorPath);
  assert.equal(installed.packageHash, checked.packageHash);
  assert.equal(installed.installationId, h.d.installationId);
  assert.equal(installed.stateDir, h.d.stateDir);
  assert.equal(hash(fs.readFileSync(path.join(installed.releaseDir, modulePath, 'executor.jsx'))), reviewed.executorHash);
  assert.equal((await h.api.enableStoppedUpdate({ permit: prepared.permit })).enabled, true);
  journals.forEach((file, index) => assert.deepEqual(fs.readFileSync(file), baseline[index]));
});
test('comp-render supplies completion data in a pinned single-slot update', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'core4-capability-render-'));
  t.after(() => {
    assert.ok(root.startsWith(path.join(os.tmpdir(), 'core4-capability-render-')) && path.resolve(root) === root);
    fs.rmSync(root, { recursive: true, force: true });
  });
  const modulePath = 'modules/comp-render', admissionPath = 'config/admissions/comp-render.json';
  const source = path.join(root, 'comp-render');
  fs.cpSync(path.join(SOURCE, modulePath), source, { recursive: true });
  const artifactPath = path.join(source, 'artifact.json'), artifact = JSON.parse(fs.readFileSync(artifactPath));
  const put = (name, bytes) => {
    fs.writeFileSync(path.join(source, name), bytes);
    artifact.hashes[name] = hash(bytes);
    fs.writeFileSync(artifactPath, canonical(artifact));
  };
  artifact.version = '4.2.3';
  const completion = canonical({ directory: 'reviewed-render-output', format: 'H.264' });
  const contract = fs.readFileSync(path.join(source, 'contract.json'));
  put('executor.jsx', fs.readFileSync(path.join(source, 'executor.jsx'), 'utf8').replace('/titles-output', '/reviewed-render-output'));
  for (const invalid of ['{', canonical({ directory: '../escape', format: 'H.264' }),
    canonical({ directory: 'con', format: 'H.264' }), canonical({ directory: 'valid', format: 'ProRes' }),
    canonical({ directory: 'valid', format: 'H.264', extra: true })]) {
    put('completion.json', invalid);
    assert.throws(() => packageCapability(source), code('capability_completion_schema'));
  }
  put('completion.json', completion);
  fs.writeFileSync(path.join(source, 'extra.json'), '{}');
  assert.throws(() => packageCapability(source), code('capability_closure'));
  fs.unlinkSync(path.join(source, 'extra.json'));
  const base = pkg('operator-render-jobs'), originalAdmission = JSON.parse(Buffer.from(base.files[admissionPath], 'base64'));
  const bundle = packageCapability(source);
  const approval = Buffer.from(canonical({ ...originalAdmission, artifactHash: hash(artifact),
    executorHash: artifact.hashes['executor.jsx'], trustApprovalId: 'test-reviewed-comp-render' }));
  const pins = { basePin: base.packageHash, capabilityPin: bundle.capabilityHash, admissionPin: hash(approval) };
  assert.deepEqual(Object.keys(bundle.files).sort(), ['artifact.json', 'completion.json', 'contract.json', 'executor.jsx', 'implementation.js']);
  assert.throws(() => composeCapability(base, bundle, approval, { ...pins, basePin: '0'.repeat(64) }), code('capability_base_pin'));
  const wrongProfile = structuredClone(bundle);
  wrongProfile.manifest.moduleId = 'titles-current-target';
  wrongProfile.capabilityHash = hash(wrongProfile.manifest);
  assert.throws(() => composeCapability(base, wrongProfile, approval, { ...pins, capabilityPin: wrongProfile.capabilityHash }), code('capability_data_profile'));
  put('contract.json', Buffer.concat([contract, Buffer.from('\n')]));
  const changedContract = packageCapability(source);
  assert.throws(() => composeCapability(base, changedContract, approval, { ...pins, capabilityPin: changedContract.capabilityHash }), code('capability_contract_incompatible'));
  const originalBytes = Buffer.from(canonical(originalAdmission));
  assert.throws(() => composeCapability(base, bundle, originalBytes, { ...pins, admissionPin: hash(originalBytes) }), code('composition_not_admitted'));
  const composed = composeCapability(base, bundle, approval, pins);
  const changed = [modulePath + '/artifact.json', modulePath + '/executor.jsx', modulePath + '/completion.json',
    admissionPath, 'config/catalog.json', 'cep/jsx/registry.jsx'].sort();
  assert.deepEqual(Object.keys(composed.release.hashes), Object.keys(base.release.hashes));
  assert.deepEqual(Object.keys(base.files).filter(file => base.files[file] !== composed.files[file]).sort(), changed);
  const h = await harness(t, { current: base, next: composed });
  const prepared = await h.prepared();
  assert.equal(h.api.applyStoppedUpdate({ plan: h.plan, ...prepared }).phase, 'update-stopped');
  assert.equal((await h.api.enableStoppedUpdate({ permit: prepared.permit })).enabled, true);
  const next = JSON.parse(fs.readFileSync(h.descriptorPath));
  assert.equal(next.installationId, h.d.installationId);
  for (const [file, digest] of Object.entries(composed.release.hashes))
    assert.equal(hash(fs.readFileSync(path.join(next.releaseDir, file))), digest, file);
});
nodeTest('frame-export-slot keeps the R1 package and native operation bytes across a stopped update', { timeout:90000 }, async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'core4-frame-slot-'));
  t.after(() => {
    const actual = fs.realpathSync.native(dir);
    assert.equal(path.dirname(actual), fs.realpathSync.native(os.tmpdir()));
    fs.rmSync(actual, { recursive:true, force:true });
  });
  const moduleId = 'comp-frame-export', source = path.join(dir, moduleId), modulePath = 'modules/' + moduleId;
  const approvalPath = 'config/admissions/' + moduleId + '.json';
  fs.cpSync(path.join(SOURCE, modulePath), source, { recursive:true });
  const base = pkg('operator-render-jobs');
  const artifactFile = path.join(source, 'artifact.json'), artifact = JSON.parse(fs.readFileSync(artifactFile));
  const contractFile = path.join(source, 'contract.json'), contractBytes = fs.readFileSync(contractFile);
  artifact.version = '4.2.3';
  fs.writeFileSync(artifactFile, canonical(artifact));
  const approval = JSON.parse(Buffer.from(base.files[approvalPath], 'base64'));
  const admission = Buffer.from(canonical({ ...approval, artifactHash:hash(artifact), trustApprovalId:'test-independent-frame-export' }));
  const cap = packageCapability(source);
  const pins = { basePin:base.packageHash, capabilityPin:cap.capabilityHash, admissionPin:hash(admission) };
  const next = composeCapability(base, cap, admission, pins);
  assert.deepEqual(Object.keys(base.files).filter(f => base.files[f] !== next.files[f]).sort(),
    [approvalPath, 'config/catalog.json', modulePath + '/artifact.json'].sort());
  assert.throws(() => composeCapability(pkg('operator-frame-export'), cap, admission, pins), code('capability_base_pin'));
  const invalid = Buffer.from(canonical({ ...JSON.parse(admission), revoked:true }));
  assert.throws(() => composeCapability(base, cap, invalid, { ...pins, admissionPin:hash(invalid) }), code('composition_not_admitted'));
  const modified = JSON.parse(contractBytes);
  modified.buildSchema.properties.fileName.maxLength--;
  fs.writeFileSync(contractFile, canonical(modified));
  fs.writeFileSync(artifactFile, canonical({ ...artifact, hashes:{ ...artifact.hashes, 'contract.json':hash(canonical(modified)) } }));
  const foreign = packageCapability(source);
  assert.throws(() => composeCapability(base, foreign, admission, { ...pins, capabilityPin:foreign.capabilityHash }), code('capability_contract_incompatible'));
  fs.writeFileSync(path.join(source, 'unexpected.json'), '{}');
  assert.throws(() => packageCapability(source), code('capability_closure'));

  const h = await harness(t, { current:base, next, withHistory:true });
  const prepared = await h.prepared();
  assert.equal(h.api.applyStoppedUpdate({ plan:h.plan, ...prepared }).phase, 'update-stopped');
  assert.equal((await h.api.enableStoppedUpdate({ permit:prepared.permit })).enabled, true);
  const installed = JSON.parse(fs.readFileSync(h.descriptorPath));
  assert.equal(installed.installationId, h.d.installationId);
  assert.equal(installed.packageHash, next.packageHash);
  for (const [file, expected] of Object.entries(next.release.hashes)) {
    assert.equal(hash(fs.readFileSync(path.join(installed.releaseDir, file))), expected, file);
  }
  const preload = path.join(__dirname, 'fixtures/owner-runtime-child.js');
  const owner = fork(path.join(installed.releaseDir, 'runtime/owner-entry.js'), ['--installation', h.descriptorPath], {
    execArgv:['--require', preload], cwd:dir, windowsHide:true, stdio:['ignore','ignore','pipe','ipc']
  });
  let errors = '';
  owner.stderr.on('data', bytes => { errors += bytes; });
  const exited = once(owner, 'exit');
  try {
    const ready = new Promise(resolve => owner.on('message', value => { if (value.event === 'ipc') resolve(true); }));
    assert.equal(await Promise.race([ready, exited.then(() => false)]), true, errors);
    const config = fs.readFileSync(h.args.configPath, 'utf8');
    const option = name => JSON.parse(config.match(new RegExp('^' + name + ' = (.+)$', 'm'))[1]);
    const cmd = option('command'), args = option('args');
    assert.equal(cmd, installed.nodePath);
    assert.equal(args[0], path.join(installed.releaseDir, 'runtime/client-entry.js'));
    const response = await new Promise((resolve, reject) => {
      const child = spawn(cmd, ['--require', preload, ...args], { windowsHide:true, timeout:30000, cwd:dir, stdio:['pipe','pipe','pipe'] });
      let stdout = '', stderr = '';
      child.stdout.on('data', bytes => { stdout += bytes; if (stdout.includes('\n')) child.stdin.end(); });
      child.stderr.on('data', bytes => { stderr += bytes; });
      child.on('error', reject);
      child.on('close', (code, signal) => {
        if (code !== 0 || !stdout.trim()) { reject(Error('MCP ' + (code ?? signal) + ': ' + stderr)); return; }
        try { resolve(JSON.parse(stdout)); } catch (error) { reject(error); }
      });
      child.stdin.write(canonical({ jsonrpc:'2.0', id:1, method:'tools/call', params:{ name:'get_module_contract', arguments:{ payload:{ moduleId } } } }) + '\n');
    });
    assert.equal(Boolean(response.result?.isError), false, JSON.stringify(response));
    const found = JSON.parse(response.result.content[0].text);
    assert.equal(found.modulePin, hash(artifact));
    assert.equal(found.admissionPin, hash(JSON.parse(admission)));
    assert.equal(found.operationId, 'save-comp-frame-png');
    assert.deepEqual(found.contract, JSON.parse(contractBytes));
  } finally {
    if (owner.exitCode === null && owner.signalCode === null) {
      if (owner.connected) owner.send('signal');
      const fallback = setTimeout(() => { if (owner.exitCode === null && owner.signalCode === null) owner.kill(); }, 5000);
      try { await exited; } finally { clearTimeout(fallback); }
    }
  }
});
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

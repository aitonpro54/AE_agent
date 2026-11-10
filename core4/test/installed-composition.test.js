'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), vm = require('node:vm'), http = require('node:http');
const { fork, spawnSync } = require('node:child_process');
const { once } = require('node:events');
const { hash, canonical } = require('../protocol/json');
const { buildPackage, verifyPackage } = require('../tools/package-installable');
const { planInstall, applyInstall } = require('../tools/install-core4');
const { verifyInstallation, verifyRelease, verifyCep } = require('../runtime/installation');
const { deriveComposition } = require('../runtime/stdio-entry');
const { checkEntrySource } = require('../tools/check-boundaries');
const { mac } = require('../integrations/cep/peer-protocol');
const root = path.resolve(__dirname, '..');
const temp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'core4-composition-'));
// This fixture performs real package rotations/Windows IO; keep the test's
// observation budget separate from production transport deadlines.
test('installed-composition portable fixed-format1 transition to readonly preserves signed history and no replay', { timeout: 90000 }, async () => {
  const result = await require('./fixtures/installed-composition-transition').transition(); assert.equal(result.historicalFormat, 1); assert.equal(result.candidateFormat, 2);
});
function install(pkg) {
  const directory = temp(), args = { pkg, nodePath: fs.realpathSync(process.execPath), installRoot: path.join(directory, 'AEAgentCore4'), extensionsDir: path.join(directory, 'extensions'), configPath: path.join(directory, 'config.toml'), machineId: os.hostname() };
  const applied = applyInstall(planInstall(args)); return { directory, args, descriptor: applied.descriptorPath, d: verifyInstallation(applied.descriptorPath) };
}
function edit(pkg, file, transform) {
  const value = JSON.parse(Buffer.from(pkg.files[file], 'base64')); transform(value); const bytes = canonical(value);
  pkg.files[file] = Buffer.from(bytes).toString('base64'); pkg.release.hashes[file] = hash(bytes); pkg.packageHash = hash(pkg.release); return pkg;
}
function rpcChild(f) {
  const child = fork(path.join(f.d.releaseDir, 'runtime/stdio-entry.js'), ['--installation', f.descriptor], { execArgv: ['--require', path.join(__dirname, 'fixtures/installed-composition-child.js')], stdio: ['pipe', 'pipe', 'pipe', 'ipc'], windowsHide: true, cwd: os.tmpdir() });
  let buffer = '', stderr = '', next = 0; const pending = new Map();
  child.stdout.on('data', bytes => { buffer += bytes; while (buffer.includes('\n')) { const n = buffer.indexOf('\n'), value = JSON.parse(buffer.slice(0, n)); buffer = buffer.slice(n + 1); pending.get(value.id)?.(value); pending.delete(value.id); } });
  child.stderr.on('data', b => { stderr += b; });
  const rpc = (method, params = {}) => new Promise(resolve => { const id = ++next; pending.set(id, resolve); child.stdin.write(canonical({ jsonrpc: '2.0', id, method, params }) + '\n'); });
  const call = async (name, payload = {}) => { const response = await rpc('tools/call', { name, arguments: { payload } }); if (response.error) throw new Error(response.error.message); return JSON.parse(response.result.content[0].text); };
  const message = event => new Promise(resolve => { const handler = value => { if (value.event === event) { child.off('message', handler); resolve(value); } }; child.on('message', handler); });
  return { child, rpc, call, message, async close() { const exited = once(child, 'exit'); child.kill('SIGTERM'); await exited; assert.equal(stderr, ''); } };
}
function raw(port, route, value) { return new Promise((resolve, reject) => { const request = http.request('http://127.0.0.1:' + port + route, { method: 'POST', agent: false, headers: { Origin: 'null', 'Content-Type': 'application/json' } }, response => { let bytes = ''; response.on('data', b => { bytes += b; }); response.on('end', () => resolve({ status: response.statusCode, value: JSON.parse(bytes) })); }); request.on('error', reject); request.end(canonical(value)); }); }
async function panel(port, d) {
  const challenge = (await raw(port, '/challenge', { role: 'panel' })).value, peerId = 'composition-fixture';
  const linked = await raw(port, '/link', { challenge, peerId, proof: mac({ challenge, peerId }, d.panelToken) }); assert.equal(linked.status, 200); let sequence = 0;
  return async (route, payload) => { const body = { epoch: challenge.epoch, peerId, sequence: ++sequence, method: 'POST', path: route, payload }; const response = await raw(port, route, { body, mac: mac(body, d.panelToken) }); assert.equal(response.status, 200, JSON.stringify(response.value)); assert.equal(response.value.mac, mac(response.value.body, d.panelToken)); return response.value.body.payload; };
}
test('installed-composition deterministic packages, fixed ES3 registries, admission pins and physical closure', () => {
  for (const selector of ['manual', 'readonly']) {
    const pkg = buildPackage(root, selector); assert.equal(pkg.packageHash, buildPackage(root, selector).packageHash); assert.equal(verifyPackage(pkg), pkg); assert.equal(pkg.release.format, 2);
    const composition = JSON.parse(Buffer.from(pkg.files['runtime/composition.json'], 'base64'));
    assert.equal(composition.id, selector); assert.equal(composition.engine === null, selector === 'readonly');
    if (selector === 'readonly') assert.ok(Object.keys(pkg.files).every(file => !/^(plan-engine\/|modules\/(?!project-inspection\/)|config\/admissions\/|runtime\/(manual-policy|windows-reservation-provider)\.js$)/.test(file)));
    const source = Buffer.from(pkg.files['cep/jsx/registry.jsx'], 'base64').toString();
    const parser = "const fs=require('node:fs'),acorn=require('internal/deps/acorn/acorn/dist/acorn');acorn.parse(fs.readFileSync(0,'utf8'),{ecmaVersion:3,allowReserved:'never'});console.log('ES3 PASS');";
    const parsed = spawnSync(process.execPath, ['--expose-internals', '-e', parser], { input: source, encoding: 'utf8', windowsHide: true }); assert.equal(parsed.status, 0, parsed.stderr);
    const context = vm.createContext({ JSON: undefined, Object, Error }); vm.runInContext(source, context);
    for (const phase of ['constructor', 'toString', '__proto__']) assert.throws(() => vm.runInContext('AECore4Host.dispatch(' + JSON.stringify(canonical({ assetKey: composition.assets[0].assetKey, phase, pins: { executorHash: JSON.parse(Buffer.from(pkg.files['modules/project-inspection/artifact.json'], 'base64')).executorHash } })) + ')', context), /fixed_asset_binding/);
  }
  assert.equal(buildPackage().packageHash, buildPackage(root, 'manual').packageHash); assert.throws(() => buildPackage(root, 'other'), /composition_selector/);
});
test('installed-composition includes render and text variants only in their selected composition', () => {
  const old = buildPackage(root, 'manual-titles');
  const enabled = buildPackage(root, 'manual-titles-variants');
  for (const file of ['modules/text-variant/executor.jsx', 'modules/comp-render/executor.jsx', 'modules/comp-render/completion.json']) {
    assert.equal(old.files[file], undefined); assert.ok(enabled.files[file]);
  }
  assert.equal(enabled.files['modules/text-layer/executor.jsx'], old.files['modules/text-layer/executor.jsx']);
  const extra = 'modules/comp-render/completion.json';
  old.files[extra] = enabled.files[extra]; old.release.hashes[extra] = enabled.release.hashes[extra]; old.packageHash = hash(old.release);
  assert.throws(() => verifyPackage(old), /composition_optional_closure/);
  const arbitraryLoader = edit(structuredClone(enabled), 'runtime/composition-policy.json', p => { p.profiles['comp-render'].resultProfile = './other.js'; });
  assert.throws(() => verifyPackage(arbitraryLoader), /composition_not_admitted/);
  const altered = edit(structuredClone(enabled), extra, p => { p.directory = 'other-output'; });
  assert.throws(() => verifyPackage(altered), /composition_artifact/);
});
test('installed-composition R1 extends the operator montage closure only in owner mode', () => {
  const options = { runtimeModel: 'owner' };
  const parent = buildPackage(root, 'operator-workflows-montage', options);
  const r1 = buildPackage(root, 'operator-render-jobs', options);
  const extra = Object.keys(r1.files).filter(file => !Object.hasOwn(parent.files, file));
  assert.deepEqual(extra.sort(), ['runtime/aerender-jobs.js', 'runtime/aerender-profile.js', 'runtime/render-job-owner.js']);
  assert.equal(verifyPackage(r1), r1);
  assert.throws(() => buildPackage(root, 'operator-render-jobs'), /operator_confirmation_owner_required|render_job_owner_required/);
});
test('installed-composition selects R1 by versioned capability and serves the same tools from the installed MCP', { timeout: 60000 }, t => {
  const options = { runtimeModel: 'owner' }, r1 = buildPackage(root, 'operator-render-jobs', options);
  const directory = temp(), policyPath = 'runtime/composition-policy.json', compositionPath = 'runtime/composition.json';
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  for (const file of [...Object.keys(r1.files), 'runtime/source-package.json']) {
    const from = path.join(root, file), to = path.join(directory, file);
    if (fs.existsSync(from)) { fs.mkdirSync(path.dirname(to), { recursive: true }); fs.copyFileSync(from, to); }
  }
  fs.cpSync(path.join(root, 'config/compositions'), path.join(directory, 'config/compositions'), { recursive: true });
  fs.copyFileSync(path.join(directory, 'config/compositions/operator-render-jobs.json'),
    path.join(directory, 'config/compositions/fixture-r1.json'));
  const alternate = buildPackage(directory, 'fixture-r1', options);
  const read = pkg => file => Buffer.from(pkg.files[file], 'base64');
  assert.equal(deriveComposition(alternate.release, read(alternate)).renderJobs, true);
  const f = install(alternate);
  t.after(() => fs.rmSync(f.directory, { recursive: true, force: true }));
  const client = spawnSync(process.execPath, [path.join(f.d.releaseDir, 'runtime/client-entry.js'), '--client-descriptor',
    path.join(f.d.installRoot, 'core-client.json')], { input: '{"jsonrpc":"2.0","id":1,"method":"tools/list"}\n',
      encoding: 'utf8', windowsHide: true, timeout: 15000 });
  assert.equal(client.status, 0, client.stderr);
  assert.deepEqual(JSON.parse(client.stdout).result.tools.map(tool => tool.name).filter(name => name.startsWith('render_job_')).sort(),
    ['cancel', 'finalize', 'prepare', 'reconcile', 'start', 'status'].map(action => 'render_job_' + action));

  const reject = (transform, pattern) => assert.throws(() => verifyPackage(transform(structuredClone(alternate))), pattern);
  reject(pkg => edit(pkg, policyPath, policy => { delete policy.capabilities; }), /composition_schema/);
  reject(pkg => edit(pkg, policyPath, policy => { policy.capabilities['render-jobs'] = 2; }), /composition_capabilities/);
  reject(pkg => edit(pkg, policyPath, policy => { policy.capabilities = {}; }), /composition_optional_closure/);
  reject(pkg => {
    const missing = 'runtime/render-job-owner.js';
    delete pkg.files[missing]; delete pkg.release.hashes[missing];
    return edit(pkg, policyPath, policy => { policy.files = policy.files.filter(file => file !== missing); });
  }, /composition_unhashed_path/);
  reject(pkg => edit(pkg, policyPath, policy => { delete policy.version; delete policy.capabilities; }), /composition_policy_version/);
  const legacy = structuredClone(r1); legacy.release.version = '4.2.2';
  edit(legacy, policyPath, policy => { delete policy.version; delete policy.capabilities; });
  assert.equal(verifyPackage(legacy), legacy);
  assert.equal(deriveComposition(legacy.release, read(legacy)).renderJobs, true);
  edit(legacy, compositionPath, c => { c.id = 'fixture-r1'; });
  edit(legacy, policyPath, policy => { policy.id = 'fixture-r1'; });
  assert.throws(() => verifyPackage(legacy), /composition_optional_closure/);
});
test('installed-composition adds a second operator-confirmed module by declaration and keeps the shared path identical', () => {
  const options = { runtimeModel: 'owner' };
  const titles = buildPackage(root, 'operator-titles-pilot', options);
  const photo = buildPackage(root, 'operator-titles-photo-pilot', options);
  const readonly = buildPackage(root, 'readonly', options);
  const policy = pkg => JSON.parse(Buffer.from(pkg.files['runtime/composition-policy.json'], 'base64'));
  assert.equal(policy(titles).profiles['photo-placeholder'].operatorConfirmation, undefined);
  assert.equal(policy(photo).profiles['photo-placeholder'].operatorConfirmation, true);
  assert.equal(policy(photo).profiles['titles-current-target'].operatorConfirmation, true);
  assert.deepEqual(policy(readonly).profiles, {});
  assert.equal(readonly.files['runtime/operator-confirmation.js'], undefined);
  assert.equal(readonly.files['modules/photo-placeholder/executor.jsx'], undefined);
  for (const file of ['core/broker.js', 'runtime/operator-confirmation.js', 'runtime/manual-policy.js', 'runtime/stdio-entry.js', 'modules/titles-current-target/executor.jsx']) {
    assert.equal(photo.release.hashes[file], titles.release.hashes[file]);
  }
  assert.throws(() => buildPackage(root, 'operator-titles-photo-pilot'), /operator_confirmation_owner_required/);
  const save = edit(structuredClone(photo), 'runtime/composition-policy.json', p => { p.profiles['project-save'].operatorConfirmation = true; });
  assert.throws(() => verifyPackage(save), /composition_not_admitted/);
});
test('installed-composition operator workflows requires proof in the packaged registry for every added executor', () => {
  const pkg = buildPackage(root, 'operator-workflows', { runtimeModel: 'owner' });
  const read = file => Buffer.from(pkg.files[file], 'base64');
  const { assets } = deriveComposition(pkg.release, read);
  const guarded = assets.filter(asset => asset.registryOperatorConfirmation);
  assert.deepEqual(guarded.map(asset => asset.moduleId).sort(),
    ['comp-render', 'layer-insert', 'media-import', 'project-assembly', 'project-lifecycle', 'project-save', 'text-layer', 'text-variant', 'titles-point-layout']);
  const source = read('cep/jsx/registry.jsx').toString('utf8');
  const parser = "const fs=require('node:fs'),acorn=require('internal/deps/acorn/acorn/dist/acorn');acorn.parse(fs.readFileSync(0,'utf8'),{ecmaVersion:3,allowReserved:'never'});";
  const result = spawnSync(process.execPath, ['--expose-internals', '-e', parser], { input: source, encoding: 'utf8', windowsHide: true });
  assert.equal(result.status, 0, result.stderr);
  const context = vm.createContext({ confirm() { assert.fail('native confirmation opened'); } });
  vm.runInContext(source, context);
  for (const { assetKey, executorHash } of guarded) {
    const frame = { assetKey, phase: 'mutate', pins: { executorHash }, typedPayload: { operatorConfirmation: true } };
    assert.deepEqual(JSON.parse(context.AECore4Host.dispatch(canonical(frame))), { outcome: 'rejected', code: 'operator_confirmation_required' });
  }
});
test('installed-composition point-layout is opt-in and refuses a package without its proof', () => {
  for (const mode of ['readonly', 'manual']) {
    const pkg = buildPackage(root, mode);
    assert.ok(!Object.keys(pkg.files).some(name => /point-layout/.test(name)));
  }
  const pkg = buildPackage(root, 'manual-layout', { runtimeModel: 'owner' });
  assert.ok(Object.hasOwn(pkg.files, 'modules/titles-current-target/executor.jsx'));
  assert.equal(hash(canonical(pkg.release)), pkg.packageHash);
  const file = 'runtime/point-layout-proof.js';
  assert.ok(Object.hasOwn(pkg.files, file));
  delete pkg.files[file]; delete pkg.release.hashes[file];
  pkg.packageHash = hash(pkg.release);
  assert.throws(() => verifyPackage(pkg), /composition_optional_closure/);
});
test('installed-composition text-layer is opt-in and preserves earlier Titles artifacts', () => {
  const enabled = buildPackage(root, 'manual-titles', { runtimeModel: 'owner' });
  const old = buildPackage(root, 'manual-layout', { runtimeModel: 'owner' });
  for (const id of ['titles-current-target', 'titles-point-layout']) {
    for (const file of ['artifact.json', 'contract.json', 'executor.jsx']) {
      assert.equal(enabled.files[`modules/${id}/${file}`], old.files[`modules/${id}/${file}`]);
    }
  }
  assert.ok(enabled.files['modules/text-layer/executor.jsx']);
  assert.equal(old.files['modules/text-layer/executor.jsx'], undefined);
});
test('installed-composition admits media import and layer insertion only in their owner package', () => {
  const options = { runtimeModel: 'owner' };
  const original = buildPackage(root, 'operator-titles-photo-pilot', options);
  const candidate = buildPackage(root, 'manual-media-layers', options);
  const read = file => Buffer.from(candidate.files[file], 'base64');
  const selected = deriveComposition(candidate.release, read);
  assert.deepEqual(selected.assets.filter(asset => ['media-import', 'layer-insert'].includes(asset.moduleId))
    .map(asset => [asset.moduleId, asset.contract.operationId, asset.resultProfile]), [
    ['media-import', 'ingest-footage', 'media-import-v1'],
    ['layer-insert', 'insert-footage-layer', 'layer-insert-v1']
  ]);
  assert.equal(original.files['runtime/media-layer-proof.js'], undefined);
  assert.equal(original.files['modules/comp-render/executor.jsx'], candidate.files['modules/comp-render/executor.jsx']);
  const source = read('cep/jsx/registry.jsx');
  const parser = "const fs=require('node:fs'),acorn=require('internal/deps/acorn/acorn/dist/acorn');acorn.parse(fs.readFileSync(0,'utf8'),{ecmaVersion:3,allowReserved:'never'});";
  const result = spawnSync(process.execPath, ['--expose-internals', '-e', parser], { input: source, encoding: 'utf8', windowsHide: true });
  assert.equal(result.status, 0, result.stderr);
});
test('installed-composition isolates the montage mandate and admits only three montage effects', () => {
  const options = { runtimeModel: 'owner' };
  const montage = buildPackage(root, 'operator-photo-montage', options);
  const read = file => Buffer.from(montage.files[file], 'base64');
  const selected = deriveComposition(montage.release, read);
  assert.deepEqual(selected.composition.modules, ['media-import', 'layer-overlay', 'comp-frame-export']);
  assert.deepEqual(selected.assets.map(asset => asset.moduleId), ['project-inspection', ...selected.composition.modules]);
  assert.ok(selected.assets.slice(1).every(asset => asset.operatorConfirmation && asset.registryOperatorConfirmation));
  for (const file of ['runtime/montage-mandate.js', 'runtime/operator-confirmation.js', 'runtime/project-file.js']) {
    assert.ok(montage.files[file], file);
  }
  for (const file of ['runtime/project-save-proof.js', 'runtime/project-lifecycle-proof.js', 'runtime/layer-insert-proof.js']) {
    assert.equal(montage.files[file], undefined, file);
  }
  const titles = buildPackage(root, 'operator-titles-photo-pilot', options);
  assert.ok(titles.files['runtime/operator-confirmation.js']);
  assert.equal(titles.files['runtime/montage-mandate.js'], undefined);
});
test('installed-composition project assembly is discovered by the installed MCP entry', { timeout: 15000 }, async () => {
  const pkg = buildPackage(root, 'manual-project-assembly');
  const f = install(pkg), h = rpcChild(f);
  try {
    await h.message('listening');
    assert.equal((await h.call('core_status')).composition, 'manual-project-assembly');
    const contract = await h.call('get_module_contract', { moduleId: 'project-assembly' });
    assert.equal(contract.operationId, 'assemble-composition');
    assert.deepEqual(contract.contract.effectPolicy.targetFields, ['sessionId', 'projectId']);
  } finally { await h.close(); fs.rmSync(f.directory, { recursive: true, force: true }); }
});
test('installed-composition project save is discovered by the installed MCP entry', { timeout: 15000 }, async () => {
  const pkg = buildPackage(root, 'manual-project-save');
  const f = install(pkg), h = rpcChild(f);
  try {
    await h.message('listening');
    assert.equal((await h.call('core_status')).composition, 'manual-project-save');
    const contract = await h.call('get_module_contract', { moduleId: 'project-save' });
    assert.equal(contract.operationId, 'save-current-project');
    assert.equal(contract.contract.effectPolicy.checkpointKind, 'project-save-disk-preimage-v1');
  } finally { await h.close(); fs.rmSync(f.directory, { recursive: true, force: true }); }
});
test('installed-composition project lifecycle is discovered by the installed MCP entry', { timeout: 15000 }, async () => {
  const f = install(buildPackage(root, 'manual-project-lifecycle')), h = rpcChild(f);
  try {
    await h.message('listening');
    assert.equal((await h.call('core_status')).composition, 'manual-project-lifecycle');
    const contract = await h.call('get_module_contract', { moduleId: 'project-lifecycle' });
    assert.equal(contract.operationId, 'transition-project');
    assert.deepEqual(contract.contract.buildSchema.properties.action.enum, ['save-as', 'create', 'open']);
  } finally { await h.close(); fs.rmSync(f.directory, { recursive: true, force: true }); }
});
test('installed-composition admits a new render operation through declarations on a relocated source and installed tree', { timeout: 15000 }, async t => {
  const source = temp(), moduleId = 'fixture-render', operationId = 'fixture-render-variant', relative = 'modules/' + moduleId;
  t.after(() => fs.rmSync(source, { recursive: true, force: true }));
  for (const file of ['core', 'protocol', 'runtime', 'config', 'modules', 'plan-engine', 'cep', 'integrations', 'worker.js']) fs.cpSync(path.join(root, file), path.join(source, file), { recursive: true });
  fs.cpSync(path.join(source, 'modules/comp-render'), path.join(source, relative), { recursive: true });
  const read = file => fs.readFileSync(path.join(source, file)), json = file => JSON.parse(read(file));
  const put = (file, data) => fs.writeFileSync(path.join(source, file), typeof data === 'string' ? data : canonical(data));
  const contract = { ...json(relative + '/contract.json'), moduleId, operationId };
  put(relative + '/contract.json', contract);
  put(relative + '/implementation.js', read(relative + '/implementation.js').toString().replace('render-text-variant', operationId));
  const artifact = { ...json(relative + '/artifact.json'), id: moduleId };
  for (const file of Object.keys(artifact.hashes)) artifact.hashes[file] = hash(read(relative + '/' + file));
  put(relative + '/artifact.json', artifact);
  const admission = 'config/admissions/' + moduleId + '.json';
  put(admission, { ...json('config/admissions/comp-render.json'), moduleId, operationId, artifactHash: hash(artifact), trustApprovalId: 'isolated-test-fixture' });
  const parent = json('config/compositions/manual-titles-variants.json');
  put('config/compositions/fixture-composition.json', { parent: 'manual-titles-variants',
    bundle: { files: [admission], artifactClosures: [relative + '/artifact.json'] }, modules: [moduleId],
    assets: [{ ...parent.assets.find(a => a.moduleId === 'comp-render'), assetKey: moduleId + '-v1', moduleId, path: relative, admission }],
    profiles: { [moduleId]: { operationId, resultProfile: 'owned-comp-render-v1' } } });
  const pkg = buildPackage(source, 'fixture-composition');
  assert.equal(pkg.release.hashes['runtime/stdio-entry.js'], hash(fs.readFileSync(path.join(root, 'runtime/stdio-entry.js'))));
  assert.equal(pkg.packageHash, buildPackage(source, 'fixture-composition').packageHash);
  assert.ok(!buildPackage(source, 'manual-titles-variants').files[relative + '/executor.jsx']);
  const f = install(pkg), h = rpcChild(f);
  try {
    await h.message('listening');
    assert.equal((await h.call('core_status')).composition, 'fixture-composition');
    assert.equal((await h.call('get_module_contract', { moduleId })).operationId, operationId);
    assert.equal((await h.call('get_module_contract', { moduleId: 'comp-render' })).operationId, 'render-text-variant');
  } finally { await h.close(); fs.rmSync(f.directory, { recursive: true, force: true }); }
});
test('installed-composition direct legacy derivation requires each fixed admission hash and exact bytes', () => {
  const pkg = require('./fixtures/fixed-format1-package').fixedFormat1Package();
  const read = file => Buffer.from(pkg.files[file], 'base64');
  const selected = deriveComposition(pkg.release, read); assert.equal(selected.legacy, true); assert.deepEqual(selected.assets.map(a => a.assetKey), ['project-inspection-v1', 'titles-current-target-v1']);
  for (const file of ['modules/project-inspection/artifact.json', 'config/admissions/titles-current-target.json']) {
    const missing = structuredClone(pkg.release); delete missing.hashes[file]; assert.throws(() => deriveComposition(missing, read), /composition_unhashed_path/);
    assert.throws(() => deriveComposition(pkg.release, name => name === file ? Buffer.from('{}') : read(name)), /composition_bytes/);
  }
});
test('installed-composition entry source guard covers top-level/start/lease-prefix/tail and fails closed on layout changes', () => {
  const source = fs.readFileSync(path.join(root, 'runtime/stdio-entry.js'), 'utf8');
  assert.equal(checkEntrySource(source), true, 'current post-verification and lazy manual imports remain accepted');
  const initial = 'const installation = verifyInstallation(descriptor), root = installation.releaseDir;';
  const barrier = "if (canonical(verifyInstallation(descriptor)) !== canonical(installation)) fail('installation_changed_during_start');";
  const end = 'finally { if (startupGate !== undefined) { fs.closeSync(startupGate); fs.unlinkSync(installGate); } }';
  const untrusted = "require('../unverified-helper.js');\n";
  for (const modified of [untrusted + source, source.replace(initial, untrusted + initial), source.replace(barrier, untrusted + barrier), source + '\n' + untrusted]) assert.throws(() => checkEntrySource(modified), /unverified_entry_import/);
  for (const marker of ['async function start(', initial, barrier, end]) {
    assert.ok(source.includes(marker), 'negative guard fixture must mutate a current source anchor');
    assert.throws(() => checkEntrySource(source.replace(marker, '/* removed verification layout marker */')), /entry_verification_layout/);
    assert.throws(() => checkEntrySource(source + '\n/* ' + marker + ' */'), /entry_verification_layout/);
  }
});
test('installed-composition build CLI selects readonly/manual and rejects ambiguous options without output', () => {
  const directory = temp(), cli = path.join(root, 'tools/package-installable.js');
  for (const selector of ['readonly', 'manual', null]) {
    const file = path.join(directory, (selector || 'default') + '.json'), args = ['--output', file, ...(selector ? ['--composition', selector] : [])];
    const result = spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', windowsHide: true }); assert.equal(result.status, 0, result.stderr); assert.equal(JSON.parse(fs.readFileSync(file)).packageHash, buildPackage(root, selector || 'manual').packageHash);
  }
  let index = 0;
  for (const options of [['--composition', ''], ['--composition', 'other'], ['--composition', 'readonly', '--composition', 'manual'], ['--unknown', 'readonly'], ['--composition'], ['--output', 'relative.json']]) {
    const file = path.join(directory, 'denied-' + index++ + '.json'), result = spawnSync(process.execPath, [cli, '--output', file, ...options], { encoding: 'utf8', windowsHide: true }); assert.equal(result.status, 1); assert.equal(fs.existsSync(file), false);
  }
});
test('installed-composition unknown/missing/corrupt/duplicate/path/phase/catalog/admission/downgrade failures', () => {
  const make = () => structuredClone(buildPackage());
  const mutations = [
    p => { p.release.format = 99; p.packageHash = hash(p.release); },
    p => { delete p.files['runtime/composition.json']; delete p.release.hashes['runtime/composition.json']; p.packageHash = hash(p.release); },
    p => { p.files['runtime/composition.json'] = Buffer.from('{}').toString('base64'); },
    p => edit(p, 'runtime/composition.json', c => { c.version = 1; }),
    p => edit(p, 'runtime/composition.json', c => { c.extra = true; }),
    p => edit(p, 'runtime/composition.json', c => { c.assets.push(c.assets[0]); }),
    p => edit(p, 'runtime/composition.json', c => { c.modules.push(c.modules[0]); }),
    p => edit(p, 'runtime/composition.json', c => { c.assets[0].path = '../outside'; }),
    p => edit(p, 'runtime/composition.json', c => { c.assets[0].phases = ['mutate']; }),
    p => edit(p, 'runtime/composition.json', c => { c.assets[0].policy = 'other'; }),
    p => edit(p, 'config/catalog.json', c => { c.modules.pop(); }),
    p => edit(p, 'config/admissions/titles-current-target.json', c => { c.revoked = true; }),
    p => edit(p, 'config/admissions/titles-current-target.json', c => { c.executorHash = '0'.repeat(64); }),
    p => { p.release.format = 1; p.packageHash = hash(p.release); },
    p => { p.release.format = 1; delete p.files['runtime/composition.json']; delete p.release.hashes['runtime/composition.json']; p.packageHash = hash(p.release); }
  ];
  for (const mutate of mutations) { const pkg = make(); mutate(pkg); assert.throws(() => verifyPackage(pkg)); }
  const readonly = buildPackage(root, 'readonly'); edit(readonly, 'config/catalog.json', c => { c.engine = { path: 'plan-engine', artifactHash: '0'.repeat(64) }; }); assert.throws(() => verifyPackage(readonly), /composition_catalog/);
});
test('installed-composition installed readonly child initialize/status/discovery/contract and native fake VM inspection', { timeout: 15000 }, async () => {
  const pkg = buildPackage(root, 'readonly'), f = install(pkg), h = rpcChild(f); let nativeCalls = 0;
  try {
    const listening = await h.message('listening'); assert.notEqual(listening.port, 3457);
    assert.equal((await h.rpc('initialize')).result.serverInfo.name, 'ae-agent-core4');
    let status = await h.call('core_status'); assert.equal(status.composition, 'readonly'); assert.equal(status.manualPolicy, null); assert.equal(status.resourceProvider, null); assert.equal(status.mutationAvailable, false); assert.equal(status.physical.inspectionAvailable, false); assert.equal(status.automaticLifecycle, 'unavailable');
    const unavailable = await h.call('core_connect'); assert.equal(unavailable.available, false); assert.equal(unavailable.reason, 'physical_inspection_unavailable'); assert.deepEqual(unavailable.physical, status.physical);
    const unchanged = await h.call('core_disconnect'); assert.equal(unchanged.disconnected, false); assert.equal(unchanged.reason, 'physical_link_owned_by_stdio_lifetime'); assert.deepEqual(unchanged.physical, status.physical);
    assert.deepEqual((await h.call('list_modules')).modules.map(m => m.id), ['project-inspection']);
    const contract = await h.call('get_module_contract', { moduleId: 'project-inspection' }); assert.equal(contract.contract.buildSupported, false);
    await assert.rejects(h.call('get_module_contract', { moduleId: 'titles' }), /module_unavailable/);
    await assert.rejects(h.call('build_solution_plan', { contractId: contract.contractId }), /read_only_module_build_unsupported/);
    const call = await panel(listening.port, f.d);
    status = await h.call('core_status'); assert.equal(status.physical.inspectionAvailable, true); assert.equal(status.connection, 'unavailable');
    const connected = await h.call('core_connect'); assert.equal(connected.available, true); assert.equal(connected.mutationAvailable, false);
    assert.deepEqual(connected.physical, status.physical);
    const disconnected = await h.call('core_disconnect'); assert.equal(disconnected.disconnected, false); assert.equal(disconnected.reason, 'physical_link_owned_by_stdio_lifetime'); assert.deepEqual(disconnected.physical, status.physical);
    assert.deepEqual((await h.call('core_status')).physical, status.physical, 'stdio lifetime retains the physical link');
    function CompItem() { this.id = 7; this.name = 'Synthetic comp'; this.numLayers = 0; this.duration = 5; }
    const comp = new CompItem(), context = vm.createContext({ JSON: undefined, Math, Error, CompItem, app: { version: 'synthetic', project: { file: null, numItems: 1, item: () => comp } } });
    vm.runInContext(Buffer.from(pkg.files['cep/jsx/registry.jsx'], 'base64').toString(), context);
    const pending = h.call('inspect_module_target', { moduleId: 'project-inspection', contractId: contract.contractId, target: {} });
    const polled = await call('/poll', {}); assert.ok(polled.command); nativeCalls++;
    const result = JSON.parse(vm.runInContext('AECore4Host.dispatch(' + JSON.stringify(canonical(polled.command)) + ')', context)); assert.equal(result.readFailureVersion, undefined);
    await call('/complete', { commandId: polled.command.commandId, originalBinding: polled.command.originalBinding, pins: polled.command.pins, result });
    assert.equal((await pending).authority, false); assert.equal(nativeCalls, 1);
    const cacheReply = h.message('cache'); h.child.send('cache'); const loaded = (await cacheReply).modules;
    assert.ok(loaded.every(file => !/[\\/](manual-policy|windows-reservation-provider)\.js$|[\\/]plan-engine[\\/]|[\\/]modules[\\/](titles|photo-placeholder)/.test(file)));
  } finally { await h.close(); }
});
test('installed-composition actual manual installed child retains module discovery and manual gated policy', { timeout: 15000 }, async () => {
  const f = install(buildPackage()), h = rpcChild(f);
  try { await h.message('listening'); const status = await h.call('core_status'); assert.equal(status.composition, 'manual'); assert.equal(status.manualPolicy, 'current-matching-target-after-local-confirmation-v1'); assert.ok(status.resourceProvider); assert.equal(status.automaticLifecycle, 'unavailable'); assert.deepEqual((await h.call('list_modules')).modules.map(m => m.id), ['photo-placeholder', 'titles', 'titles-current-target', 'project-inspection']); assert.equal((await h.call('get_module_contract', { moduleId: 'titles-current-target' })).operationId, 'set-current-text'); }
  finally { await h.close(); }
});
test('installed-composition installed format2 corruption/missing composition rejects before imports and legacy format1 generic verification stays generic', () => {
  const f = install(buildPackage(root, 'readonly')), composition = path.join(f.d.releaseDir, 'runtime/composition.json'), bytes = fs.readFileSync(composition);
  const rejectedChild = pattern => { const result = spawnSync(process.execPath, [path.join(f.d.releaseDir, 'runtime/stdio-entry.js'), '--installation', f.descriptor], { input: '', encoding: 'utf8', timeout: 5000, windowsHide: true }); assert.equal(result.status, 1); assert.match(result.stderr, pattern); assert.equal(result.stdout, ''); };
  fs.writeFileSync(composition, '{}'); assert.throws(() => verifyInstallation(f.descriptor), /installed_release_bytes/); rejectedChild(/installed_release_bytes/); fs.writeFileSync(composition, bytes);
  fs.renameSync(composition, composition + '.missing'); assert.throws(() => verifyInstallation(f.descriptor), /release_tree_mismatch/); rejectedChild(/release_tree_mismatch/); fs.renameSync(composition + '.missing', composition);
  const dir = temp(), source = 'historical generic release'; fs.writeFileSync(path.join(dir, 'data'), source); const release = { version: '4.0.0', format: 1, hashes: { data: hash(source) } }; fs.writeFileSync(path.join(dir, 'release.json'), canonical(release)); assert.doesNotThrow(() => verifyRelease(dir, release));
  assert.throws(() => verifyCep(f.d, { ...JSON.parse(fs.readFileSync(path.join(f.d.releaseDir, 'release.json'))), format: 99 }, f.d.cepDir));
});

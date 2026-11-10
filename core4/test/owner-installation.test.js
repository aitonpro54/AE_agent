'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), http = require('node:http');
const { spawnSync } = require('node:child_process');
const { canonical, hash } = require('../protocol/json');
const { buildPackage, verifyPackage, runtimeBinding } = require('../tools/package-installable');
const { buildStandalone, writeStandalone } = require('../tools/package-standalone-installer');
const { HELPERS, verifyStandalone } = require('../tools/standalone-installer');
const { planInstall, applyInstall, rollback, snapshot, assertPreparedInstallPlan, prepareInstallPlan, assertDurablePreparedInstallPlan } = require('../tools/install-core4');
const { acquireInstallLease } = require('../runtime/install-lease');
const { verifyInstallation } = require('../runtime/installation');
const { projectClientDescriptor, verifyClientDescriptor } = require('../runtime/client-entry');
const SOURCE = path.resolve(__dirname, '..'), packages = new Map();
function pkg(composition = 'readonly', runtimeModel = 'owner') {
  const key = composition + '/' + runtimeModel;
  if (!packages.has(key)) packages.set(key, buildPackage(SOURCE, composition, { runtimeModel }));
  return packages.get(key);
}
function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'core4-owner-install-'));
  t.after(() => { assert.ok(path.resolve(directory) === directory && directory.startsWith(path.join(os.tmpdir(), 'core4-owner-install-'))); fs.rmSync(directory, { recursive: true, force: true }); });
  const args = { nodePath: fs.realpathSync(process.execPath), installRoot: path.join(directory, 'AEAgentCore4'), extensionsDir: path.join(directory, 'extensions'), configPath: path.join(directory, 'config.toml'), machineId: os.hostname() };
  const client = path.join(args.installRoot, 'core-client.json');
  return { directory, args, client, plan(runtime = 'owner', composition = 'readonly') { return planInstall({ ...args, pkg: pkg(composition, runtime) }); },
    apply(runtime = 'owner', composition = 'readonly') { return applyInstall(this.plan(runtime, composition)); } };
}
function edit(packageValue, file, value) {
  const result = structuredClone(packageValue), bytes = typeof value === 'string' ? value : canonical(value);
  result.files[file] = Buffer.from(bytes).toString('base64'); result.release.hashes[file] = hash(bytes); result.packageHash = hash(result.release); return result;
}
function configArgs(file) { return JSON.parse(/^args = (.+)$/m.exec(fs.readFileSync(file, 'utf8'))[1]); }

test('owner-installation runtime selector is independent of composition and owner contract is a closed admitted cluster', () => {
  for (const composition of ['readonly', 'manual']) for (const model of ['stdio', 'owner']) {
    const p = pkg(composition, model), binding = runtimeBinding(p.release, file => Buffer.from(p.files[file], 'base64'));
    assert.equal(binding.runtimeModel, model); assert.equal(verifyPackage(p), p);
    assert.equal(Object.hasOwn(p.files, 'runtime/client-entry.js'), model === 'owner');
    assert.ok(p.files['runtime/composition-policy.json']);
    assert.ok(p.files['runtime/ae-readiness.js']);
    assert.equal(Object.hasOwn(p.files, 'runtime/photo-source-proof.js'), composition === 'manual');
    assert.equal(Object.keys(p.files).length, (composition === 'readonly' ? 42 : 62) + (model === 'owner' ? 21 : 0));
  }
  assert.equal(buildPackage(SOURCE, 'readonly').packageHash, pkg('readonly', 'stdio').packageHash);
  const p = pkg(), contract = JSON.parse(Buffer.from(p.files['runtime/owner-contract.json'], 'base64'));
  for (const altered of [{ ...contract, runtimeModel: 'stdio' }, { ...contract, clientEntry: 'runtime/stdio-entry.js' }, { ...contract, extra: true }, { ...contract, requiredFiles: contract.requiredFiles.slice(1) }]) assert.throws(() => verifyPackage(edit(p, 'runtime/owner-contract.json', altered)), /owner_contract/);
  const partial = structuredClone(p); delete partial.files['runtime/client-ipc.js']; delete partial.release.hashes['runtime/client-ipc.js']; partial.packageHash = hash(partial.release); assert.throws(() => verifyPackage(partial), /owner_contract_schema/);
  const noContract = structuredClone(p); delete noContract.files['runtime/owner-contract.json']; delete noContract.release.hashes['runtime/owner-contract.json']; noContract.packageHash = hash(noContract.release); assert.throws(() => verifyPackage(noContract), /owner_contract_required/);
  assert.throws(() => buildPackage(SOURCE, 'readonly', { runtimeModel: 'auto' }), /runtime_selector/);
});

test('owner-installation fresh-root planning projects exact origin bytes without destination reads or writes', t => {
  const f = fixture(t), before = snapshot(f.directory), plan = f.plan();
  assert.deepEqual(snapshot(f.directory), before); assert.equal(fs.existsSync(f.args.installRoot), false);
  const client = JSON.parse(plan.nextClient); assert.equal(client.originHash, hash(plan.originBytes)); assert.equal(client.controlToken, plan.descriptor.controlToken);
  assert.equal(Object.hasOwn(client, 'panelToken'), false); assert.equal(Object.hasOwn(client, 'stateDir'), false); assert.equal(Object.hasOwn(client, 'cepDir'), false);
  assert.deepEqual(plan.clientBinding, { version: 1, runtimeModel: 'owner', clientDescriptorPath: f.client, previousClient: null, appliedClientHash: hash(plan.nextClient) });
  assert.throws(() => projectClientDescriptor(plan.descriptor, { originBytes: Buffer.from('{}') }), /client_origin/);
  assert.throws(() => projectClientDescriptor(plan.descriptor, { originBytes: Buffer.alloc(8193) }), /client_origin/);
  assert.throws(() => projectClientDescriptor(plan.descriptor, { originBytes: plan.originBytes, readRoot: true }), /client_projection_options/);
  assert.throws(() => planInstall({ ...f.args, pkg: pkg(), runtimeModel: 'stdio' }), /runtime_selector_mismatch/);
});

test('owner-installation TEMP readonly/manual apply stages exact role sidecar before publishing config last', t => {
  for (const composition of ['readonly', 'manual']) {
    const f = fixture(t), plan = f.plan('owner', composition), rename = fs.renameSync; let published = 0;
    fs.renameSync = function (from, to) {
      if (to === f.args.configPath) {
        published++; assert.deepEqual(fs.readFileSync(f.client), plan.nextClient);
        assert.equal(hash(fs.readFileSync(plan.descriptorPath)), hash(canonical(plan.descriptor)));
      }
      return rename.call(this, from, to);
    };
    let applied; try { applied = applyInstall(plan); } finally { fs.renameSync = rename; }
    assert.equal(published, 1); assert.equal(applied.liveProof, false);
    const d = verifyInstallation(applied.descriptorPath), client = verifyClientDescriptor(f.client);
    assert.equal(client.packageHash, d.packageHash); assert.equal(client.controlToken, d.controlToken);
    assert.ok(!fs.readFileSync(f.client, 'utf8').includes(d.panelToken));
    assert.deepEqual(configArgs(f.args.configPath), [path.join(d.releaseDir, 'runtime/client-entry.js'), '--client-descriptor', f.client]);
    const txn = JSON.parse(fs.readFileSync(applied.transactionFile)); assert.equal(txn.version, 2); assert.deepEqual(txn.clientBinding, plan.clientBinding);
    assert.deepEqual(fs.readFileSync(path.join(d.installRoot, 'transactions', txn.transactionId + '-prepared/client.json')), plan.nextClient);
    assert.equal(fs.existsSync(path.join(d.stateDir, 'receiver')), false);
  }
});

test('owner-installation legacy to owner to legacy and both rollbacks preserve exact sidecar bytes and stable origin', t => {
  const f = fixture(t), legacy = f.apply('stdio'), origin = fs.readFileSync(path.join(f.args.installRoot, 'origin.json'));
  const owner = f.apply(), ownerClient = fs.readFileSync(f.client), ownerDescriptor = fs.readFileSync(owner.descriptorPath), ownerConfig = fs.readFileSync(f.args.configPath);
  const back = f.apply('stdio'); assert.equal(fs.existsSync(f.client), false); assert.equal(configArgs(f.args.configPath)[1], '--installation');
  const binding = JSON.parse(fs.readFileSync(back.transactionFile)).clientBinding; assert.equal(binding.runtimeModel, 'stdio'); assert.equal(binding.appliedClientHash, null); assert.equal(binding.previousClient, ownerClient.toString('base64'));
  rollback(back.transactionFile); assert.deepEqual(fs.readFileSync(f.client), ownerClient); assert.deepEqual(fs.readFileSync(owner.descriptorPath), ownerDescriptor); assert.deepEqual(fs.readFileSync(f.args.configPath), ownerConfig);
  rollback(owner.transactionFile); assert.equal(fs.existsSync(f.client), false); assert.equal(configArgs(f.args.configPath)[1], '--installation');
  assert.deepEqual(fs.readFileSync(path.join(f.args.installRoot, 'origin.json')), origin); assert.deepEqual(fs.readFileSync(path.join(f.args.installRoot, 'state/production/origin.json')), origin);
  assert.equal(JSON.parse(fs.readFileSync(legacy.transactionFile)).clientBinding.previousClient, null);
});

test('owner-installation first owner rollback removes only its exact sidecar and retains stable state origin', t => {
  const f = fixture(t), applied = f.apply(), origin = fs.readFileSync(path.join(f.args.installRoot, 'origin.json'));
  rollback(applied.transactionFile); assert.equal(fs.existsSync(f.client), false); assert.equal(fs.existsSync(applied.descriptorPath), false); assert.equal(fs.existsSync(f.args.configPath), false);
  assert.deepEqual(fs.readFileSync(path.join(f.args.installRoot, 'origin.json')), origin);
});

test('owner-installation branded plans bind client bytes, origin bytes and binding metadata; durable prepared client tampering refuses', t => {
  for (const mutate of [p => { p.nextClient[0] ^= 1; }, p => { p.originBytes[0] ^= 1; }, p => { p.clientBinding.appliedClientHash = '0'.repeat(64); }]) {
    const f = fixture(t), plan = f.plan(); mutate(plan); assert.throws(() => applyInstall(plan), /prepared_install_plan_brand_or_changed/); assert.equal(fs.existsSync(f.args.installRoot), false);
  }
  const f = fixture(t), plan = f.plan(), lease = acquireInstallLease({ installRoot: plan.descriptor.installRoot, stateDir: plan.descriptor.stateDir, descriptorPath: plan.descriptorPath });
  fs.mkdirSync(path.join(f.args.installRoot, 'transactions')); prepareInstallPlan(plan, { lease }); assertPreparedInstallPlan(plan);
  const prepared = path.join(f.args.installRoot, 'transactions', plan.transactionId + '-prepared/client.json'); fs.appendFileSync(prepared, 'tampered');
  assert.throws(() => assertDurablePreparedInstallPlan(plan, { lease }), /prepared_install_state_changed/);
});

test('owner-installation client and origin CAS detect drift before writes, including drift while acquiring the install lease', t => {
  for (const drift of ['client', 'root', 'anchor', 'under-lease']) {
    const f = fixture(t); f.apply(); const plan = f.plan();
    const file = drift === 'root' ? path.join(f.args.installRoot, 'origin.json') : drift === 'anchor' ? path.join(f.args.installRoot, 'state/production/origin.json') : f.client;
    if (drift !== 'under-lease') fs.appendFileSync(file, ' ');
    const open = fs.openSync; let injected = false;
    if (drift === 'under-lease') fs.openSync = function (name, ...rest) {
      const fd = open.call(this, name, ...rest);
      if (!injected && name === path.join(f.args.installRoot, 'install.lock')) { injected = true; fs.appendFileSync(f.client, ' '); }
      return fd;
    };
    const descriptor = fs.readFileSync(plan.descriptorPath), config = fs.readFileSync(f.args.configPath);
    try { assert.throws(() => applyInstall(plan), /install_baseline_changed/); } finally { fs.openSync = open; }
    assert.deepEqual(fs.readFileSync(plan.descriptorPath), descriptor); assert.deepEqual(fs.readFileSync(f.args.configPath), config); assert.equal(fs.existsSync(path.join(f.args.installRoot, 'install.lock')), false);
  }
});

test('owner-installation noncanonical existing origin bytes are retained and pinned exactly', t => {
  const f = fixture(t); f.apply('stdio');
  const originFile = path.join(f.args.installRoot, 'origin.json'), raw = Buffer.from(fs.readFileSync(originFile, 'utf8') + '\n');
  fs.writeFileSync(originFile, raw); fs.writeFileSync(path.join(f.args.installRoot, 'state/production/origin.json'), raw);
  const applied = f.apply(); assert.equal(verifyClientDescriptor(f.client).originHash, hash(raw)); assert.deepEqual(fs.readFileSync(originFile), raw); rollback(applied.transactionFile);
});

test('owner-installation foreign or missing sidecar never permits replacement or owner to stdio deletion', t => {
  const f = fixture(t); f.apply('stdio'); fs.writeFileSync(f.client, '{"foreign":true}'); const before = snapshot(f.args.installRoot);
  assert.throws(() => f.plan(), /foreign_client_descriptor/); assert.deepEqual(snapshot(f.args.installRoot), before);
  const g = fixture(t); g.apply(); fs.appendFileSync(g.client, ' '); const protectedBytes = fs.readFileSync(g.client);
  assert.throws(() => g.plan('stdio'), /foreign_client_descriptor/); assert.deepEqual(fs.readFileSync(g.client), protectedBytes);
  fs.unlinkSync(g.client); assert.throws(() => g.plan('stdio'), /foreign_client_descriptor/);
});

test('owner-installation staging files and ancestor junctions refuse before reading or changing destinations', t => {
  for (const suffix of ['.next', '.rollback']) {
    const f = fixture(t); fs.mkdirSync(f.args.installRoot); fs.writeFileSync(f.client + suffix, 'retained-stage'); const before = snapshot(f.directory);
    assert.throws(() => f.plan(), /client_binding_staging_exists/); assert.deepEqual(snapshot(f.directory), before);
  }
  const f = fixture(t), target = path.join(f.directory, 'target'), alias = path.join(f.directory, 'alias'); fs.mkdirSync(target); fs.symlinkSync(target, alias, process.platform === 'win32' ? 'junction' : 'dir');
  try { assert.throws(() => planInstall({ ...f.args, pkg: pkg(), installRoot: path.join(alias, 'AEAgentCore4') }), /install_volume_path/); assert.deepEqual(snapshot(target), {}); }
  finally { fs.unlinkSync(alias); }
});

test('owner-installation rollback refuses sidecar/origin/prepared drift and missing owner transaction extension before writes', t => {
  for (const drift of ['client', 'origin', 'prepared', 'extension']) {
    const f = fixture(t), applied = f.apply();
    if (drift === 'client') fs.appendFileSync(f.client, ' ');
    if (drift === 'origin') fs.appendFileSync(path.join(f.args.installRoot, 'origin.json'), ' ');
    if (drift === 'prepared') fs.appendFileSync(path.join(f.args.installRoot, 'transactions', JSON.parse(fs.readFileSync(applied.transactionFile)).transactionId + '-prepared/client.json'), 'tamper');
    if (drift === 'extension') { const txn = JSON.parse(fs.readFileSync(applied.transactionFile)); delete txn.clientBinding; delete txn.originBinding; fs.writeFileSync(applied.transactionFile, canonical(txn)); }
    const before = snapshot(f.args.installRoot); assert.throws(() => rollback(applied.transactionFile), /rollback_client_/); assert.deepEqual(snapshot(f.args.installRoot), before);
  }
  const legacy = fixture(t), installed = legacy.apply('stdio'), txn = JSON.parse(fs.readFileSync(installed.transactionFile)); delete txn.clientBinding; delete txn.originBinding; fs.writeFileSync(installed.transactionFile, canonical(txn));
  assert.equal(rollback(installed.transactionFile).rolledBack, true);
});

test('owner-installation owner package cannot execute through the legacy stdio entry before listener or store open', async t => {
  const f = fixture(t), applied = f.apply(), d = verifyInstallation(applied.descriptorPath), before = snapshot(d.stateDir);
  const entry = require(path.join(d.releaseDir, 'runtime/stdio-entry.js')), create = http.createServer; let servers = 0;
  http.createServer = (...args) => { servers++; return create(...args); };
  try { await assert.rejects(entry.start({ descriptor: applied.descriptorPath, mode: 'stdio', port: 0 }), e => e.code === 'owner_entry_required'); } finally { http.createServer = create; }
  assert.equal(servers, 0); assert.deepEqual(snapshot(d.stateDir), before);
  const preload = path.join(f.directory, 'deny-listener.cjs'); fs.writeFileSync(preload, "require('node:net').Server.prototype.listen=function(){throw Error('unexpected_listener')};");
  const result = spawnSync(process.execPath, ['--require', preload, path.join(d.releaseDir, 'runtime/stdio-entry.js'), '--installation', applied.descriptorPath], { encoding: 'utf8', windowsHide: true, timeout: 10000 });
  assert.equal(result.status, 1); assert.equal(result.stderr, 'owner_entry_required\n'); assert.deepEqual(snapshot(d.stateDir), before);
});

test('owner-installation standalone stdio and owner closure apply without checkout code, launcher or listeners', t => {
  const f = fixture(t), preload = path.join(f.directory, 'offline-only.cjs');
  fs.writeFileSync(preload, "require('node:net').Server.prototype.listen=function(){throw Error('network_forbidden')};for(const key of ['spawn','spawnSync','exec','execSync','execFile','execFileSync','fork'])require('node:child_process')[key]=function(){throw Error('child_forbidden')};");
  const distributions = {};
  for (const model of ['stdio', 'owner']) {
    const bundle = buildStandalone(SOURCE, 'readonly', { runtimeModel: model }), directory = path.join(f.directory, model); writeStandalone(directory, bundle); verifyStandalone(directory, bundle.distributionHash);
    assert.deepEqual(Object.keys(bundle.files).filter(file => HELPERS.includes(file)).sort(), [...HELPERS]);
    assert.equal(Object.hasOwn(bundle.files, 'runtime/client-entry.js'), model === 'owner'); distributions[model] = { bundle, directory };
  }
  for (const model of ['stdio', 'owner', 'stdio']) {
    const { bundle, directory } = distributions[model];
    const run = spawnSync(process.execPath, ['--require', preload, path.join(directory, 'tools/standalone-installer.js'), 'apply', '--expected-distribution-hash', bundle.distributionHash, '--expected-package-hash', bundle.packageHash,
      '--install-root', f.args.installRoot, '--extensions-dir', f.args.extensionsDir, '--config', f.args.configPath], { encoding: 'utf8', windowsHide: true, timeout: 15000, cwd: f.directory });
    assert.equal(run.status, 0, run.stderr); assert.equal(JSON.parse(run.stdout).liveProof, false); assert.equal(fs.existsSync(f.client), model === 'owner');
  }
});

test('owner-installation fixed CLI runtime selector reaches package and standalone builders and rejects unknown models', t => {
  const f = fixture(t), output = path.join(f.directory, 'candidate.json'), distribution = path.join(f.directory, 'distribution');
  const built = spawnSync(process.execPath, [path.join(SOURCE, 'tools/package-installable.js'), '--output', output, '--composition', 'readonly', '--runtime', 'owner'], { encoding: 'utf8', windowsHide: true, timeout: 10000 });
  assert.equal(built.status, 0, built.stderr); assert.equal(JSON.parse(built.stdout).runtimeModel, 'owner'); verifyPackage(JSON.parse(fs.readFileSync(output)));
  const standalone = spawnSync(process.execPath, [path.join(SOURCE, 'tools/package-standalone-installer.js'), '--output', distribution, '--composition', 'readonly', '--runtime', 'owner'], { encoding: 'utf8', windowsHide: true, timeout: 10000 });
  assert.equal(standalone.status, 0, standalone.stderr); assert.equal(Object.hasOwn(verifyStandalone(distribution, JSON.parse(standalone.stdout).distributionHash).pkg.files, 'runtime/owner-contract.json'), true);
  const refused = path.join(f.directory, 'refused.json'), invalid = spawnSync(process.execPath, [path.join(SOURCE, 'tools/package-installable.js'), '--output', refused, '--runtime', 'auto'], { encoding: 'utf8', windowsHide: true, timeout: 10000 });
  assert.equal(invalid.status, 1); assert.equal(fs.existsSync(refused), false);
});

test('owner-installation corrupt staged sidecar refuses before client or config becomes visible', t => {
  const f = fixture(t); f.apply('stdio'); const plan = f.plan(), config = fs.readFileSync(f.args.configPath), rename = fs.renameSync;
  fs.renameSync = function (from, to) {
    const result = rename.call(this, from, to);
    if (to === plan.descriptorPath) fs.appendFileSync(f.client + '.next', 'tamper');
    return result;
  };
  try { assert.throws(() => applyInstall(plan), error => error.code === 'install_staging_changed' && error.leaseRetained === true); }
  finally { fs.renameSync = rename; }
  assert.deepEqual(fs.readFileSync(f.args.configPath), config);
  assert.equal(fs.existsSync(f.client), false);
});

function refusesGrowth(file, invoke, code) {
  const open = fs.openSync, read = fs.readSync, readFile = fs.readFileSync, close = fs.closeSync;
  const sampledSize = fs.statSync(file).size, descriptors = new Set(); let grown = false, injecting = false, writes = 0, requested = 0;
  fs.openSync = function (name, flags, ...rest) {
    if (!injecting && typeof flags === 'string' && /[wax+]/.test(flags)) writes++;
    const fd = open.call(this, name, flags, ...rest); if (name === file && flags === 'r') descriptors.add(fd); return fd;
  };
  fs.readSync = function (fd, buffer, offset, length, position) {
    if (descriptors.has(fd)) {
      requested += length; assert.ok(length <= sampledSize, 'each read fits the sampled allocation');
      if (!grown) { grown = true; injecting = true; try { fs.appendFileSync(file, Buffer.alloc(20000, 32)); } finally { injecting = false; } }
    }
    return read.call(this, fd, buffer, offset, length, position);
  };
  fs.readFileSync = function (name, ...args) { if (name === file) assert.fail('unbounded named-file read is forbidden'); return readFile.call(this, name, ...args); };
  fs.closeSync = function (fd) { descriptors.delete(fd); return close.call(this, fd); };
  try { assert.throws(invoke, error => error.code === code); }
  finally { fs.openSync = open; fs.readSync = read; fs.readFileSync = readFile; fs.closeSync = close; }
  assert.equal(grown, true); assert.ok(requested <= sampledSize + 1); assert.equal(descriptors.size, 0); assert.equal(writes, 0);
}

test('owner-installation bounded readers reject growth after fd sampling before installer writes and close their fd', t => {
  for (const mode of ['installer-client', 'client-descriptor', 'client-origin']) {
    const f = fixture(t), applied = f.apply(), plan = f.plan(), descriptor = verifyInstallation(applied.descriptorPath);
    if (mode === 'installer-client') refusesGrowth(f.client, () => applyInstall(plan), 'client_binding_changed');
    if (mode === 'client-descriptor') refusesGrowth(f.client, () => verifyClientDescriptor(f.client), 'client_file_changed');
    if (mode === 'client-origin') refusesGrowth(path.join(f.args.installRoot, 'origin.json'), () => projectClientDescriptor(descriptor), 'client_file_changed');
    assert.equal(fs.existsSync(path.join(f.args.installRoot, 'install.lock')), false);
    assert.deepEqual(fs.readFileSync(applied.descriptorPath), Buffer.from(canonical(plan.previousDescriptor ? JSON.parse(plan.previousDescriptor) : descriptor)));
  }
});

test('owner-installation byte-exact ownership rejects invalid UTF8 that decodes to the same client descriptor', t => {
  const f = fixture(t); f.args.installRoot = path.join(f.directory, 'replacement-\uFFFD', 'AEAgentCore4'); f.apply();
  const client = path.join(f.args.installRoot, 'core-client.json'), original = fs.readFileSync(client), at = original.indexOf(Buffer.from('\uFFFD'));
  assert.ok(at >= 0); const altered = Buffer.concat([original.subarray(0, at), Buffer.from([255]), original.subarray(at + 3)]);
  assert.equal(altered.toString('utf8'), original.toString('utf8')); fs.writeFileSync(client, altered);
  assert.throws(() => f.plan('stdio'), error => error.code === 'foreign_client_descriptor'); assert.deepEqual(fs.readFileSync(client), altered);
});

test('owner-installation all rollback restore inputs and stamped transaction paths are bound before any destination writes', t => {
  const f = fixture(t); f.apply('stdio'); const applied = f.apply();
  const originalTxn = fs.readFileSync(applied.transactionFile), transaction = JSON.parse(originalTxn), css = path.join(transaction.backupCep, 'panel.css'), originalCss = fs.readFileSync(css);
  const preparedFile = path.join(f.args.installRoot, 'transactions', transaction.transactionId + '-prepared/prepared.json'), originalPrepared = fs.readFileSync(preparedFile);
  for (const mode of ['previousConfig', 'previousDescriptor', 'previousCepHash', 'configPath', 'preparedTransaction', 'preparedPath']) {
    fs.writeFileSync(css, originalCss); fs.writeFileSync(preparedFile, originalPrepared); const txn = JSON.parse(originalTxn);
    if (mode === 'previousConfig') txn.previousConfig = Buffer.from('[mcp_servers.foreign]\ncommand = "foreign"\n').toString('base64');
    if (mode === 'previousDescriptor') { const previous = JSON.parse(Buffer.from(txn.previousDescriptor, 'base64')); previous.panelToken = 'f'.repeat(64); txn.previousDescriptor = Buffer.from(canonical(previous)).toString('base64'); }
    if (mode === 'previousCepHash') { fs.appendFileSync(css, '\n/* forged previous CEP */\n'); txn.previousCepHash = hash(snapshot(txn.backupCep)); }
    if (mode === 'configPath') { txn.configPath = path.join(f.directory, 'alias-config.toml'); fs.copyFileSync(f.args.configPath, txn.configPath); }
    if (mode === 'preparedTransaction' || mode === 'preparedPath') {
      const prepared = JSON.parse(originalPrepared);
      if (mode === 'preparedTransaction') prepared.transactionId = '00000000-0000-4000-8000-000000000001';
      else prepared.configPath = path.join(f.directory, 'wrong-prepared-config.toml');
      const changed = Buffer.from(canonical(prepared)); fs.writeFileSync(preparedFile, changed); txn.preparedStateHash = hash(changed);
    }
    fs.writeFileSync(applied.transactionFile, canonical(txn)); const before = snapshot(f.directory), originals = {}, mutations = [];
    for (const name of ['mkdirSync', 'renameSync', 'unlinkSync']) { originals[name] = fs[name]; fs[name] = function (...args) { mutations.push(name); return originals[name].apply(this, args); }; }
    originals.openSync = fs.openSync; fs.openSync = function (name, flags, ...args) { if (typeof flags === 'string' && /[wax+]/.test(flags)) mutations.push('open-write'); return originals.openSync.call(this, name, flags, ...args); };
    try { assert.throws(() => rollback(applied.transactionFile), error => error.code === 'rollback_client_prepared_changed', mode); }
    finally { for (const [name, original] of Object.entries(originals)) fs[name] = original; }
    assert.deepEqual(mutations, [], mode); assert.deepEqual(snapshot(f.directory), before, mode);
  }
});

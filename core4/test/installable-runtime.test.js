'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const http = require('node:http');
const { spawn, spawnSync } = require('node:child_process');
const { PassThrough } = require('node:stream');
const { once } = require('node:events');
const { hash, canonical } = require('../protocol/json');
const { mac } = require('../integrations/cep/peer-protocol');
const { createHttpPeer } = require('../integrations/cep/http-peer');
const { buildPackage, verifyPackage } = require('../tools/package-installable');
const { planInstall, applyInstall, rollback, configText } = require('../tools/install-core4');
const { verifyInstallation } = require('../runtime/installation');
const root = path.resolve(__dirname, '..');
function temp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'core4-installable-')); }
function install(directory, pkg = buildPackage()) {
  const configPath = path.join(directory, 'project/.codex/config.toml'); fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, '# preserve\n[mcp_servers.legacy]\ncommand = "unchanged"\n');
  const args = { pkg, nodePath: fs.realpathSync(process.execPath), installRoot: path.join(directory, 'AEAgentCore4'), extensionsDir: path.join(directory, 'extensions'), configPath, machineId: 'test-machine' };
  return { args, plan: planInstall(args) };
}
const installation = { packageHash: '1'.repeat(64), installationId: 'test-installation', panelToken: '2'.repeat(64), controlToken: '3'.repeat(64) };
const asset = { assetKey: 'project-inspection-v1', executorHash: hash(fs.readFileSync(path.join(root, 'modules/project-inspection/executor.jsx'))) };
async function client(port, config = installation) {
  let sequence = 0;
  const base = 'http://127.0.0.1:' + port;
  async function raw(route, body, extra = {}) { return new Promise((resolve, reject) => { const req = http.request(base + route, { method: 'POST', headers: { Origin: 'null', 'Content-Type': 'application/json', ...extra } }, res => { let data = ''; res.on('data', b => data += b); res.on('end', () => resolve({ status: res.statusCode, value: JSON.parse(data) })); }); req.on('error', reject); req.end(canonical(body)); }); }
  const challenge = (await raw('/challenge', { role: 'panel' })).value, peerId = 'test-peer';
  const link = await raw('/link', { challenge, peerId, proof: mac({ challenge, peerId }, config.panelToken) });
  assert.equal(link.status, 200); assert.equal(link.value.mac, mac(link.value.body, config.panelToken));
  return {
    raw, challenge, peerId, pins: link.value.body.pins,
    envelope(route, payload, seq = ++sequence) { const body = { epoch: challenge.epoch, peerId, sequence: seq, method: 'POST', path: route, payload: JSON.parse(JSON.stringify(payload)) }; return { body, mac: mac(body, config.panelToken) }; },
    async call(route, payload) { const response = await raw(route, this.envelope(route, payload)); assert.equal(response.status, 200, JSON.stringify(response.value)); assert.equal(response.value.mac, mac(response.value.body, config.panelToken)); return response.value.body.payload; }
  };
}
function fakeHost(pkg) {
  function CompItem() { this.id = 7; this.name = 'Test comp'; this.numLayers = 1; this.duration = 5; }
  CompItem.prototype.layer = () => ({ id: 11, name: 'Title', property: () => ({}) });
  const comp = new CompItem();
  const context = vm.createContext({ JSON, Object, Math, Error, CompItem, app: { version: '26.0-test', project: { file: { fsName: 'C:/test/project.aep', name: 'project.aep' }, numItems: 1, item: () => comp } } });
  vm.runInContext(Buffer.from(pkg.files['cep/jsx/registry.jsx'], 'base64').toString(), context);
  return { evalScript(script, cb) { cb(vm.runInContext(script, context)); } };
}
function dispatcher(pkg, options) {
  const context = vm.createContext({ JSON, Object, Array, Promise, Error, isFinite });
  vm.runInContext(Buffer.from(pkg.files['cep/js/poll-dispatcher.js'], 'base64').toString(), context);
  return context.Core4PollDispatcher.createDispatcher(options);
}
function memoryStorage() { const map = new Map(); return { getItem: k => map.get(k) || null, setItem: (k, v) => map.set(k, v), removeItem: k => map.delete(k) }; }
test('installable-runtime package deterministic closure, install CAS, exact rollback and stable origin', () => {
  const directory = temp(), pkg = buildPackage(); assert.equal(pkg.packageHash, buildPackage().packageHash);
  assert.ok(Object.keys(pkg.files).every(f => !/^(test|experiments|node_modules|tools)\//.test(f)));
  const tampered = structuredClone(pkg); tampered.files['runtime/stdio-entry.js'] = Buffer.from('tamper').toString('base64'); assert.throws(() => verifyPackage(tampered), /package_integrity/);
  const { args, plan } = install(directory, pkg); assert.equal(fs.existsSync(args.installRoot), false, 'dry-run has no writes');
  fs.appendFileSync(args.configPath, '# concurrent\n'); assert.throws(() => applyInstall(plan), /install_baseline_changed/);
  const first = applyInstall(planInstall(args)), d = verifyInstallation(first.descriptorPath);
  assert.match(fs.readFileSync(args.configPath, 'utf8'), /command = "unchanged"/);
  const beforeState = fs.readFileSync(path.join(d.stateDir, 'origin.json'));
  fs.writeFileSync(path.join(d.stateDir, 'protected-evidence'), 'do not reset');
  const second = applyInstall(planInstall(args)); assert.equal(second.installationId, first.installationId);
  assert.notEqual(JSON.parse(fs.readFileSync(first.descriptorPath)).panelToken, d.panelToken);
  rollback(second.transactionFile); assert.equal(fs.readFileSync(first.descriptorPath, 'utf8'), canonical(d));
  assert.equal(fs.readFileSync(path.join(d.stateDir, 'protected-evidence'), 'utf8'), 'do not reset');
  assert.ok(beforeState.equals(fs.readFileSync(path.join(d.stateDir, 'origin.json'))));
  fs.mkdirSync(path.join(d.stateDir, 'receiver'), { recursive: true }); fs.writeFileSync(path.join(d.stateDir, 'receiver/owner'), 'unknown');
  assert.throws(() => applyInstall(planInstall(args)), /runtime_state_owned_or_unknown/); fs.unlinkSync(path.join(d.stateDir, 'receiver/owner'));
  fs.unlinkSync(path.join(d.stateDir, 'origin.json')); assert.throws(() => planInstall(args), /stable_state_origin/);
});
test('installable-runtime exact release closure rejects extensionless shadow, empty directory and junction before package imports', () => {
  const directory = temp(), { args, plan } = install(directory), installed = applyInstall(plan), d = JSON.parse(fs.readFileSync(installed.descriptorPath));
  const sentinel = path.join(directory, 'UNTRUSTED-CODE-EXECUTED'), shadow = path.join(d.releaseDir, 'core/broker');
  const code = 'require("node:fs").writeFileSync(' + JSON.stringify(sentinel) + ',"executed");module.exports={};';
  fs.writeFileSync(shadow, code);
  function rejectedChild() { const result = spawnSync(process.execPath, [path.join(d.releaseDir, 'runtime/stdio-entry.js'), '--installation', installed.descriptorPath], { encoding: 'utf8', timeout: 5000, windowsHide: true }); assert.equal(result.status, 1); assert.match(result.stderr, /release_tree_mismatch|installed_release_bytes/); assert.equal(fs.existsSync(sentinel), false); }
  rejectedChild(); assert.throws(() => verifyInstallation(installed.descriptorPath), /release_tree_mismatch/);
  assert.throws(() => applyInstall(planInstall(args)), /immutable_release_mismatch/);
  fs.unlinkSync(shadow); const extra = path.join(d.releaseDir, 'unlisted-empty'); fs.mkdirSync(extra); rejectedChild(); fs.rmdirSync(extra);
  const core = path.join(d.releaseDir, 'core'), backup = path.join(directory, 'junction-target');
  assert.ok(path.resolve(core).startsWith(path.resolve(directory) + path.sep)); assert.ok(path.resolve(backup).startsWith(path.resolve(directory) + path.sep));
  fs.renameSync(core, backup); fs.writeFileSync(path.join(backup, 'broker.js'), code);
  fs.symlinkSync(backup, core, process.platform === 'win32' ? 'junction' : 'dir');
  rejectedChild(); assert.throws(() => applyInstall(planInstall(args)), /immutable_release_mismatch/);
});
test('installable-runtime stale release A entry cannot verify B descriptor then import unchecked A dependencies', () => {
  const directory = temp(), pkgA = buildPackage(), { args, plan } = install(directory, pkgA), installedA = applyInstall(plan), descriptorA = JSON.parse(fs.readFileSync(installedA.descriptorPath));
  const pkgB = structuredClone(pkgA), css = Buffer.from(pkgB.files['cep/panel.css'], 'base64').toString('utf8') + '\n/* independent test release B */\n';
  pkgB.files['cep/panel.css'] = Buffer.from(css).toString('base64'); pkgB.release.hashes['cep/panel.css'] = hash(css); pkgB.packageHash = hash(pkgB.release);
  const installedB = applyInstall(planInstall({ ...args, pkg: pkgB })); assert.notEqual(pkgB.packageHash, pkgA.packageHash);
  const sentinel = path.join(directory, 'STALE-RELEASE-A-EXECUTED');
  fs.appendFileSync(path.join(descriptorA.releaseDir, 'core/broker.js'), '\nrequire("node:fs").writeFileSync(' + JSON.stringify(sentinel) + ',"executed");\n');
  const result = spawnSync(process.execPath, [path.join(descriptorA.releaseDir, 'runtime/stdio-entry.js'), '--installation', installedB.descriptorPath], { encoding: 'utf8', timeout: 5000, windowsHide: true });
  assert.equal(result.status, 1); assert.match(result.stderr, /installation_entry_root_mismatch/); assert.equal(fs.existsSync(sentinel), false);
  assert.equal(verifyInstallation(installedB.descriptorPath).packageHash, pkgB.packageHash);
});
test('installable-runtime descriptor changed at startup gate is rejected before package imports', async () => {
  const directory = temp(), { plan } = install(directory), installed = applyInstall(plan), d = JSON.parse(fs.readFileSync(installed.descriptorPath));
  const entry = require(path.join(d.releaseDir, 'runtime/stdio-entry.js')), originalOpen = fs.openSync, gate = path.join(d.installRoot, 'install.lock'); let changed = false;
  fs.openSync = function (file, flags, ...rest) {
    const fd = originalOpen.call(fs, file, flags, ...rest);
    if (!changed && file === gate && flags === 'wx') { changed = true; fs.writeFileSync(installed.descriptorPath, canonical({ ...d, panelToken: 'a'.repeat(64) })); }
    return fd;
  };
  try { await assert.rejects(entry.start({ descriptor: installed.descriptorPath, port: 0 }), /installation_changed_during_start/); }
  finally { fs.openSync = originalOpen; }
  assert.equal(changed, true); assert.equal(fs.existsSync(path.join(d.stateDir, 'broker')), false); assert.equal(fs.existsSync(gate), false);
});
test('installable-runtime bounded TOML edit preserves indented neighboring servers and inline-commented Core4 header bytes', () => {
  const before = '# prefix\r\n [mcp_servers.before] # before comment\r\ncommand = "before"\r\n';
  const ownHeader = '  [mcp_servers.after-effects-core4] # retain this header\r\n';
  const after = '  [mcp_servers.after] # adjacent indented header\r\ncommand = "must stay"\r\nargs = ["a", "b"]\r\n# suffix\r\n';
  const result = configText(Buffer.from(before + ownHeader + 'command = "old"\r\n' + after), 'C:/descriptor.json', 'C:/node.exe', 'C:/entry.js');
  assert.ok(result.startsWith(before + ownHeader)); assert.ok(result.endsWith(after)); assert.equal((result.match(/\[mcp_servers.after-effects-core4\]/g) || []).length, 1);
  const directory = temp(), { args } = install(directory);
  const invalid = Buffer.from('[mcp_servers."after-effects-core4"] # unsupported quoted table\ncommand = "old"\n'); fs.writeFileSync(args.configPath, invalid);
  assert.throws(() => planInstall(args), /config_syntax_requires_review/); assert.ok(fs.readFileSync(args.configPath).equals(invalid)); assert.equal(fs.existsSync(args.installRoot), false);
});
test('installable-runtime CLI apply requires reviewed package hash and mismatches have zero installation writes', () => {
  const directory = temp(), pkg = buildPackage(), file = path.join(directory, 'package.json'), project = path.join(directory, 'project'); fs.mkdirSync(project); fs.writeFileSync(file, JSON.stringify(pkg));
  const installer = path.join(root, 'tools/install-core4.js'), args = ['apply', '--package', file, '--node', fs.realpathSync(process.execPath)];
  const env = { ...process.env, LOCALAPPDATA: path.join(directory, 'local'), APPDATA: path.join(directory, 'roaming') };
  for (const extra of [[], ['--expected-package-hash', '0'.repeat(64)]]) {
    const result = spawnSync(process.execPath, [installer, ...args, ...extra], { cwd: project, env, encoding: 'utf8', windowsHide: true });
    assert.equal(result.status, 1); assert.match(result.stderr, /usage_install_mode_package_node_expected_hash|reviewed_package_hash_mismatch/);
    assert.equal(fs.existsSync(env.LOCALAPPDATA), false); assert.equal(fs.existsSync(env.APPDATA), false); assert.equal(fs.existsSync(path.join(project, '.codex')), false);
  }
});
test('installable-runtime unknown Broker owner, ledger fault or unresolved intent permits diagnostics but no new physical read begin', async () => {
  for (const fault of ['orphan-gate', 'ledger-corrupt', 'unresolved']) {
    const directory = temp(), { plan } = install(directory), installed = applyInstall(plan), d = JSON.parse(fs.readFileSync(installed.descriptorPath)), brokerDir = path.join(d.stateDir, 'broker'); fs.mkdirSync(brokerDir, { recursive: true });
    if (fault === 'orphan-gate') fs.writeFileSync(path.join(brokerDir, 'broker-owner.gate'), 'preserved-unknown-owner');
    if (fault === 'ledger-corrupt') fs.writeFileSync(path.join(brokerDir, 'ledger.ndjson'), '{broken\n');
    if (fault === 'unresolved') new (require('../core/ledger').Ledger)(path.join(brokerDir, 'ledger.ndjson')).append({ type: 'intent', commandId: 'test-unresolved', taskId: 'test-task', target: { projectId: 'C:/test/project.aep' } });
    const input = new PassThrough(), output = new PassThrough(), pending = new Map(); let serial = 0, buffer = '';
    output.on('data', b => { buffer += b; let n; while ((n = buffer.indexOf('\n')) >= 0) { const r = JSON.parse(buffer.slice(0, n)); buffer = buffer.slice(n + 1); pending.get(r.id)?.(r); pending.delete(r.id); } });
    const runtime = await require(path.join(d.releaseDir, 'runtime/stdio-entry.js')).start({ descriptor: installed.descriptorPath, port: 0, input, output });
    async function call(name, payload = {}) { const id = ++serial, result = new Promise(resolve => pending.set(id, resolve)); input.write(JSON.stringify({ jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: { payload } } }) + '\n'); const r = await result; return r.error ? { error: r.error.message } : JSON.parse(r.result.content[0].text); }
    try {
      const status = await call('core_status'); await client(status.physical.port, d);
      const contract = await call('get_module_contract', { moduleId: 'project-inspection' });
      const result = await call('inspect_module_target', { moduleId: 'project-inspection', contractId: contract.contractId, target: {} });
      assert.equal(result.error, fault === 'orphan-gate' ? 'state_owner_gate_unavailable' : fault === 'ledger-corrupt' ? 'ledger_corrupt' : 'controller_unresolved');
      assert.equal((await call('core_status')).physical.pending, null);
      const events = fs.readFileSync(path.join(d.stateDir, 'receiver/completions.ndjson'), 'utf8').trim().split('\n').map(JSON.parse); assert.equal(events.filter(e => e.type === 'begin').length, 0);
    } finally { await runtime.close(); input.end(); }
    if (fault === 'orphan-gate') assert.equal(fs.readFileSync(path.join(brokerDir, 'broker-owner.gate'), 'utf8'), 'preserved-unknown-owner');
    if (fault === 'ledger-corrupt') assert.equal(fs.readFileSync(path.join(brokerDir, 'ledger.ndjson'), 'utf8'), '{broken\n');
  }
});
test('installable-runtime actual HTTP auth role, origin, challenge, epoch, replay, bounded input and duplicate peer', async t => {
  const peer = createHttpPeer({ installation, directory: temp(), asset, port: 0, pollTimeout: 5 }); await peer.listen(); t.after(() => peer.close());
  const c = await client(peer.status().port);
  const foreign = await c.raw('/challenge', { role: 'panel' }, { Origin: 'https://example.test' }); assert.equal(foreign.status, 403);
  const wrongHost = await c.raw('/challenge', { role: 'panel' }, { Host: 'localhost:' + peer.status().port }); assert.equal(wrongHost.status, 403);
  const control = (await c.raw('/challenge', { role: 'control' })).value;
  assert.equal((await c.raw('/link', { challenge: control, peerId: 'control', proof: mac({ challenge: control, peerId: 'control' }, installation.controlToken) })).status, 403);
  const another = (await c.raw('/challenge', { role: 'panel' })).value;
  assert.equal((await c.raw('/link', { challenge: another, peerId: 'duplicate', proof: mac({ challenge: another, peerId: 'duplicate' }, installation.panelToken) })).value.error, 'duplicate_peer');
  const poll = c.envelope('/poll', {}); assert.equal((await c.raw('/poll', poll)).status, 200); assert.equal((await c.raw('/poll', poll)).status, 403);
  const old = c.envelope('/poll', {}); old.body.epoch = 'old'; old.mac = mac(old.body, installation.panelToken); assert.equal((await c.raw('/poll', old)).status, 403);
  const big = await c.raw('/challenge', { role: 'panel', padding: 'x'.repeat(300000) }); assert.equal(big.status, 413);
  assert.ok(!canonical(peer.status()).includes(installation.panelToken)); assert.ok(!canonical(peer.status()).includes(installation.controlToken));
});
test('installable-runtime real HTTP and compiled registry VM: begin before evaluate, receipt before POST, durable ACK then latch clear', async t => {
  const directory = temp(), pkg = buildPackage(), peer = createHttpPeer({ installation, directory, asset, port: 0, pollTimeout: 5 }); await peer.listen(); t.after(() => peer.close());
  const c = await client(peer.status().port), storage = memoryStorage(); let physicalCalls = 0;
  const host = fakeHost(pkg);
  const dispatch = dispatcher(pkg, { installationId: installation.installationId, assetKey: asset.assetKey, pins: c.pins, storage,
    csInterface: { evalScript(script, cb) { physicalCalls++; assert.match(fs.readFileSync(path.join(directory, 'completions.ndjson'), 'utf8'), /"type":"begin"/); assert.ok(dispatch.pending()); host.evalScript(script, cb); } },
    complete: async receipt => { assert.ok(dispatch.pending().result); const result = await c.call('/complete', receipt); assert.match(fs.readFileSync(path.join(directory, 'completions.ndjson'), 'utf8'), /"type":"complete"/); return result; }
  });
  const inspection = peer.inspect({ compId: 7 }); const frame = (await c.call('/poll', {})).command;
  await dispatch.dispatch(frame); const result = await inspection;
  assert.equal(result.observation.target.compId, 7); assert.equal(result.observation.layers[0].layerId, 11); assert.equal(result.continuity, false); assert.equal(dispatch.pending(), null); assert.equal(physicalCalls, 1);
  assert.throws(() => dispatch.dispatch({ ...frame, source: 'raw JSX' }), /invalid_frame/);
  const missingAck = dispatcher(pkg, { installationId: 'wrong-ack', assetKey: asset.assetKey, pins: c.pins, storage: memoryStorage(), csInterface: host, complete: async () => ({ ack: { commandId: 'wrong' } }) });
  await assert.rejects(missingAck.dispatch(frame), /completion_ack_mismatch/); assert.ok(missingAck.pending().result);
});
test('installable-runtime callback loss fences durable store and persisted browser latch: no replay on reload or restart', async t => {
  const directory = temp(), pkg = buildPackage(), peer = createHttpPeer({ installation, directory, asset, port: 0, timeout: 40 }); await peer.listen();
  const c = await client(peer.status().port), storage = memoryStorage(); let physicalCalls = 0;
  const options = { installationId: installation.installationId, assetKey: asset.assetKey, pins: c.pins, storage, csInterface: { evalScript() { physicalCalls++; } }, complete: () => { throw new Error('unexpected'); } };
  const dispatch = dispatcher(pkg, options);
  const inspection = peer.inspect({}); const rejected = assert.rejects(inspection, /host_callback_timeout/);
  const frame = (await c.call('/poll', {})).command; dispatch.dispatch(frame); await rejected;
  assert.equal(physicalCalls, 1); await assert.rejects(dispatcher(pkg, options).recover(), /physical_outcome_unknown_no_replay/);
  assert.throws(() => dispatch.dispatch(frame), /physical_latch_present/);
  assert.equal(peer.status().unknown, true); await peer.close();
  const reopened = createHttpPeer({ installation, directory, asset, port: 0 }); await reopened.listen(); t.after(() => reopened.close());
  assert.equal(reopened.status().storeClosed, true); assert.throws(() => reopened.inspect({}), /receiver_lane_closed/);
});
test('installable-runtime host without native JSON returns known capability rejection after durable begin, no raw fallback', async t => {
  const directory = temp(), pkg = buildPackage(), peer = createHttpPeer({ installation, directory, asset, port: 0 }); await peer.listen(); t.after(() => peer.close());
  const c = await client(peer.status().port), context = vm.createContext({ JSON: undefined }); let physicalCalls = 0;
  const dispatch = dispatcher(pkg, { installationId: installation.installationId, assetKey: asset.assetKey, pins: c.pins, storage: memoryStorage(), csInterface: { evalScript(script, cb) { physicalCalls++; cb(vm.runInContext(script, context)); } }, complete: p => c.call('/complete', p) });
  const rejected = assert.rejects(peer.inspect({}), /host_json_unavailable/);
  await dispatch.dispatch((await c.call('/poll', {})).command); await rejected;
  assert.equal(physicalCalls, 1); assert.equal(peer.status().storeClosed, false); assert.equal(dispatch.pending(), null);
});
test('installable-runtime real stdio child advertises generic API, status without panel, then typed module inspect via HTTP + VM', async t => {
  const directory = temp(), pkg = buildPackage(), { plan } = install(directory, pkg), installed = applyInstall(plan), d = JSON.parse(fs.readFileSync(installed.descriptorPath));
  const child = spawn(process.execPath, ['-e', 'require(process.argv[1]).start({descriptor:process.argv[2],port:0}).catch(e=>{process.stderr.write(e.code||e.message);process.exitCode=1})', path.join(d.releaseDir, 'runtime/stdio-entry.js'), installed.descriptorPath], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
  t.after(() => { if (child.exitCode === null) child.kill(); });
  const waiting = new Map(); let output = '', errors = '', nextId = 0;
  child.stderr.on('data', b => errors += b);
  child.stdout.on('data', b => { output += b; let n; while ((n = output.indexOf('\n')) >= 0) { const value = JSON.parse(output.slice(0, n)); output = output.slice(n + 1); waiting.get(value.id)?.(value); waiting.delete(value.id); } });
  async function rpc(method, params) { const id = ++nextId; const promise = new Promise((resolve, reject) => { waiting.set(id, resolve); const timer = setTimeout(() => reject(new Error('stdio_timeout:' + errors)), 15000); timer.unref(); }); child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, ...(params ? { params } : {}) }) + '\n'); const response = await promise; assert.equal(response.error, undefined, JSON.stringify(response)); return response.result; }
  async function tool(name, payload = {}) { const result = await rpc('tools/call', { name, arguments: { payload } }); return JSON.parse(result.content[0].text); }
  const initialized = await rpc('initialize'); assert.equal(initialized.serverInfo.version, '4.0.0');
  const listed = await rpc('tools/list'); assert.ok(listed.tools.some(x => x.name === 'inspect_module_target')); assert.ok(!listed.tools.some(x => x.name === 'inspect_project'));
  const status = await tool('core_status'); assert.equal(status.physical.peer.connected, false); assert.equal(status.automaticLifecycle, 'unavailable');
  const modules = await tool('list_modules'); assert.ok(modules.modules.some(x => x.id === 'project-inspection'));
  const contract = await tool('get_module_contract', { moduleId: 'project-inspection' }); assert.equal(contract.contract.executionPolicy, 'read-only-current-observation-v1');
  await assert.rejects(tool('inspect_module_target', { moduleId: 'titles', contractId: contract.contractId, target: {} }), /contract_identity/);
  await assert.rejects(tool('inspect_module_target', { contractId: contract.contractId, target: {} }), /contract_identity/);
  assert.equal((await tool('core_status')).physical.pending, null);
  const c = await client(status.physical.port, d), host = fakeHost(pkg), dispatch = dispatcher(pkg, { installationId: d.installationId, assetKey: asset.assetKey, pins: c.pins, storage: memoryStorage(), csInterface: host, complete: p => c.call('/complete', p) });
  const inspection = tool('inspect_module_target', { moduleId: 'project-inspection', contractId: contract.contractId, target: { compId: 7 } });
  await dispatch.dispatch((await c.call('/poll', {})).command); assert.equal((await inspection).observation.compositions[0].compId, 7);
  child.stdin.end(); await once(child, 'exit'); assert.equal(errors, ''); assert.equal(child.exitCode, 0);
});
test('installable-runtime real stdio process crash after delivery preserves original ongoing record and blocks new reads after restart', async t => {
  const directory = temp(), { plan } = install(directory), installed = applyInstall(plan), d = JSON.parse(fs.readFileSync(installed.descriptorPath));
  function launch() {
    const child = spawn(process.execPath, ['-e', 'require(process.argv[1]).start({descriptor:process.argv[2],port:0}).catch(e=>{process.stderr.write(e.code||e.message);process.exitCode=1})', path.join(d.releaseDir, 'runtime/stdio-entry.js'), installed.descriptorPath], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    t.after(() => { if (child.exitCode === null && !child.killed) child.kill(); });
    const pending = new Map(); let buffer = '', serial = 0, errors = '';
    child.stderr.on('data', b => errors += b);
    child.stdout.on('data', b => { buffer += b; let newline; while ((newline = buffer.indexOf('\n')) >= 0) { const result = JSON.parse(buffer.slice(0, newline)); buffer = buffer.slice(newline + 1); pending.get(result.id)?.resolve(result); pending.delete(result.id); } });
    child.on('exit', () => { for (const p of pending.values()) p.reject(new Error('child_exited:' + errors)); pending.clear(); });
    return { child, async call(name, payload = {}) { const id = ++serial; const result = new Promise((resolve, reject) => { pending.set(id, { resolve, reject }); }); child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: { payload } } }) + '\n'); const response = await result; return response.error ? { error: response.error.message } : JSON.parse(response.result.content[0].text); } };
  }
  const first = launch(), status = await first.call('core_status'), c = await client(status.physical.port, d), contract = await first.call('get_module_contract', { moduleId: 'project-inspection' });
  const inspection = first.call('inspect_module_target', { moduleId: 'project-inspection', contractId: contract.contractId, target: {} }); const crashed = assert.rejects(inspection, /child_exited/);
  const frame = (await c.call('/poll', {})).command; assert.ok(frame.commandId);
  first.child.kill(); await once(first.child, 'exit'); await crashed;
  const records = fs.readFileSync(path.join(d.stateDir, 'receiver/completions.ndjson'), 'utf8').trim().split('\n').map(JSON.parse);
  assert.equal(records.at(-1).type, 'begin'); assert.equal(records.at(-1).commandId, frame.commandId);
  const second = launch(), reopened = await second.call('core_status'); assert.equal(reopened.physical.storeClosed, true); assert.equal(reopened.physical.unknown, true);
  const freshContract = await second.call('get_module_contract', { moduleId: 'project-inspection' });
  assert.equal((await second.call('inspect_module_target', { moduleId: 'project-inspection', contractId: freshContract.contractId, target: {} })).error, 'receiver_lane_closed');
  second.child.stdin.end(); await once(second.child, 'exit');
});

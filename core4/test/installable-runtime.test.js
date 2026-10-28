'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const http = require('node:http');
const { webcrypto } = require('node:crypto');
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
function rawRequest(port, route, body, { origin = 'null', headers = {}, method = 'POST', rawHeaders } = {}) {
  // Delete missing headers explicitly: Node rejects an undefined header value client-side.
  const values = { Origin: origin, 'Content-Type': 'application/json', ...headers };
  for (const key of Object.keys(values)) if (values[key] === undefined) delete values[key];
  return new Promise((resolve, reject) => {
    const req = http.request('http://127.0.0.1:' + port + route, { method, agent: false, headers: rawHeaders || values }, res => {
      let data = ''; res.on('data', b => data += b);
      res.on('end', () => { try { resolve({ status: res.statusCode, headers: res.headers, value: data ? JSON.parse(data) : null }); } catch (e) { reject(e); } });
    });
    req.on('error', reject); req.end(body === undefined ? undefined : canonical(body));
  });
}
async function client(port, config = installation, origin = 'null') {
  let sequence = 0;
  function raw(route, body, extra = {}, options = {}) { return rawRequest(port, route, body, { origin, headers: extra, ...options }); }
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
  const context = vm.createContext({ JSON: undefined, Math, Error, CompItem, app: { version: '26.0-test', project: { file: { fsName: 'C:/test/project.aep', name: 'project.aep' }, numItems: 1, item: () => comp } } });
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
  const enabled = '  enabled = false # keep managed client disabled\r\n';
  const result = configText(Buffer.from(before + ownHeader + enabled + 'command = "old"\r\n' + after), 'C:/descriptor.json', 'C:/node.exe', 'C:/entry.js');
  assert.ok(result.startsWith(before + ownHeader)); assert.ok(result.endsWith(after)); assert.equal((result.match(/\[mcp_servers.after-effects-core4\]/g) || []).length, 1);
  assert.ok(result.includes(enabled));
  const preservedTrue = configText(Buffer.from(ownHeader + "'enabled' = true # explicit user preference\n"), 'C:/descriptor.json', 'C:/node.exe', 'C:/entry.js'); assert.ok(preservedTrue.includes("'enabled' = true # explicit user preference\n"));
  assert.throws(() => configText(Buffer.from(ownHeader + 'enabled = false\n"enabled" = true\n'), 'C:/descriptor.json', 'C:/node.exe', 'C:/entry.js'), /config_duplicate_enabled_preference/);
  assert.throws(() => configText(Buffer.from(ownHeader + 'enabled = "false"\n'), 'C:/descriptor.json', 'C:/node.exe', 'C:/entry.js'), /config_enabled_preference_requires_review/);
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
function cors(response, origin) {
  assert.equal(response.headers['access-control-allow-origin'], origin);
  assert.equal(response.headers.vary, origin === undefined ? undefined : 'Origin');
  assert.equal(response.headers['access-control-allow-credentials'], undefined);
}
test('installable-runtime exact CEP Origin ingress and CORS success/error/OPTIONS matrix at Node HTTP boundary', async t => {
  const peer = createHttpPeer({ installation, directory: temp(), asset, port: 0, pollTimeout: 5 }); await peer.listen(); t.after(() => peer.close());
  const port = peer.status().port;
  for (const origin of ['null', 'file://']) {
    const challenge = await rawRequest(port, '/challenge', { role: 'panel' }, { origin });
    assert.equal(challenge.status, 200); assert.equal(challenge.value.origin, origin); cors(challenge, origin);
    const error = await rawRequest(port, '/challenge', { role: 'other' }, { origin });
    assert.equal(error.value.error, 'role_required'); cors(error, origin);
    const preflight = await rawRequest(port, '/challenge', undefined, { origin, method: 'OPTIONS' });
    assert.equal(preflight.status, 204); assert.equal(preflight.value, null); cors(preflight, origin);
    assert.equal(preflight.headers['access-control-allow-methods'], 'POST'); assert.equal(preflight.headers['access-control-allow-headers'], 'Content-Type');
    for (const host of ['localhost:' + port, '127.0.0.1:' + (port === 65535 ? port - 1 : port + 1), '[::1]:' + port]) {
      for (const method of ['POST', 'OPTIONS']) {
        const response = await rawRequest(port, '/challenge', { role: 'panel' }, { origin, method, headers: { Host: host } });
        assert.equal(response.value.error, 'loopback_host_required'); cors(response, undefined);
      }
    }
  }
  const invalid = [undefined, '', 'NULL', 'FILE://', 'File://', 'file:', 'file:/', 'file:///', 'file://localhost', 'file:///C:/panel.html', 'null, null', 'null, file://', 'null file://', 'n ull', 'file: //', 'http://127.0.0.1:' + port, 'http://localhost:' + port, 'https://example.test'];
  for (const origin of invalid) for (const method of ['POST', 'OPTIONS']) {
    const response = await rawRequest(port, '/challenge', { role: 'panel' }, { headers: { Origin: origin }, method });
    assert.equal(response.value.error, 'cep_origin_required', String(origin)); cors(response, undefined);
  }
  for (const values of [['null', 'null'], ['file://', 'file://'], ['null', 'file://'], ['file://', 'null']]) for (const method of ['POST', 'OPTIONS']) {
    const response = await rawRequest(port, '/challenge', { role: 'panel' }, { method, rawHeaders: ['Host', '127.0.0.1:' + port, 'Origin', values[0], 'oRiGiN', values[1], 'Content-Type', 'application/json'] });
    assert.equal(response.value.error, 'cep_origin_required'); cors(response, undefined);
  }
  // HTTP OWS is stripped by Node's parser before application validation. This is
  // a parser-layer observation, not a claim that original wire bytes are exact.
  for (const origin of ['null', 'file://']) {
    const response = await rawRequest(port, '/challenge', { role: 'panel' }, { origin: ' \t' + origin + '\t ' });
    assert.equal(response.status, 200); assert.equal(response.value.origin, origin); cors(response, origin);
  }
});
for (const origin of ['null', 'file://']) test('installable-runtime Origin-bound challenge and peer preserve auth/sequence/pending/ACK: ' + origin, async t => {
  const directory = temp(), peer = createHttpPeer({ installation, directory, asset, port: 0, pollTimeout: 5 }); await peer.listen(); t.after(() => peer.close());
  const port = peer.status().port, foreign = origin === 'null' ? 'file://' : 'null';
  const raw = (route, body, selected = origin) => rawRequest(port, route, body, { origin: selected });
  const challenge = async (role = 'panel') => (await raw('/challenge', { role })).value;
  const link = (value, selected = origin, secret = installation.panelToken, peerId = 'test-peer') => raw('/link', { challenge: value, peerId, proof: mac({ challenge: value, peerId }, secret) }, selected);
  const crossed = await challenge(); assert.equal((await link(crossed, foreign)).value.error, 'peer_auth');
  assert.equal((await link(crossed)).value.error, 'peer_auth', 'foreign link burns the one-time challenge');
  const tampered = await challenge(); tampered.origin = foreign;
  assert.equal((await link(tampered, foreign)).value.error, 'peer_auth', 'even a recomputed valid MAC cannot replace the stored challenge');
  const wrongPin = await challenge(); wrongPin.packageHash = 'a'.repeat(64);
  assert.equal((await link(wrongPin)).value.error, 'peer_auth', 'stored pins remain bound even with a valid MAC');
  assert.equal((await link(await challenge(), origin, installation.controlToken)).value.error, 'peer_auth');
  const control = await challenge('control');
  assert.equal((await link(control, foreign, installation.controlToken)).value.error, 'peer_auth', 'origin is checked before role');
  assert.equal((await link(await challenge('control'), origin, installation.controlToken)).value.error, 'panel_role_required');
  const expired = await challenge(), now = Date.now;
  try { Date.now = () => now() + 10001; assert.equal((await link(expired)).value.error, 'peer_auth'); } finally { Date.now = now; }
  const c = await client(port, installation, origin); assert.equal(c.challenge.origin, origin);
  const other = await challenge(); assert.equal((await link(other, foreign, installation.panelToken, 'other-peer')).value.error, 'peer_auth', 'origin is checked before duplicate peer');
  assert.equal(peer.status().peer.peerId, c.peerId);
  assert.equal((await link(await challenge(), origin, installation.panelToken, 'other-peer')).value.error, 'duplicate_peer');
  assert.equal((await link(c.challenge)).value.error, 'peer_auth', 'successful link is also one-time');
  const envelope = c.envelope('/poll', {});
  const rejected = await raw('/poll', envelope, foreign); assert.equal(rejected.value.error, 'peer_auth_or_replay'); cors(rejected, foreign);
  const accepted = await raw('/poll', envelope); assert.equal(accepted.status, 200); cors(accepted, origin); assert.equal(accepted.value.body.sequence, 1);
  assert.equal((await raw('/poll', envelope)).value.error, 'peer_auth_or_replay');
  for (const patch of [{ epoch: 'old' }, { peerId: 'other' }, { sequence: 100 }, { method: 'GET' }, { path: '/complete' }]) {
    const bad = c.envelope('/poll', {}, 2); Object.assign(bad.body, patch); bad.mac = mac(bad.body, installation.panelToken);
    assert.equal((await raw('/poll', bad)).value.error, 'peer_auth_or_replay');
  }
  const wrongMac = c.envelope('/poll', {}, 2); wrongMac.mac = mac(wrongMac.body, installation.controlToken);
  assert.equal((await raw('/poll', wrongMac)).value.error, 'peer_auth_or_replay');
  const extraOrigin = c.envelope('/poll', {}, 2); extraOrigin.body.origin = origin; extraOrigin.mac = mac(extraOrigin.body, installation.panelToken);
  assert.equal((await raw('/poll', extraOrigin)).value.error, 'unexpected_field', 'signed request schema is unchanged');
  const fresh = c.envelope('/poll', {}, 2);
  try {
    Date.now = () => now() + 45001;
    assert.equal((await raw('/poll', fresh, foreign)).value.error, 'peer_auth_or_replay');
    assert.equal(peer.status().peer.connected, false, 'foreign request did not refresh lastSeen');
    assert.equal((await raw('/poll', fresh)).status, 200); assert.equal(peer.status().peer.connected, true);
  } finally { Date.now = now; }
  let settled = false; const inspection = peer.inspect({}); inspection.then(() => { settled = true; }, () => { settled = true; });
  const nextPoll = c.envelope('/poll', {}, 3), beforeDelivery = fs.readFileSync(path.join(directory, 'completions.ndjson'));
  assert.equal(peer.status().pending.delivered, false);
  assert.equal((await raw('/poll', nextPoll, foreign)).value.error, 'peer_auth_or_replay');
  assert.equal(peer.status().pending.delivered, false); assert.ok(fs.readFileSync(path.join(directory, 'completions.ndjson')).equals(beforeDelivery));
  const frame = (await raw('/poll', nextPoll)).value.body.payload.command;
  const receipt = { commandId: frame.commandId, originalBinding: frame.originalBinding, pins: frame.pins, result: { observationVersion: 1, target: { projectId: null, compId: null }, project: { name: 'Untitled', numItems: 0, saved: false }, compositions: [], layers: [], truncated: false, aeVersion: '26.0-fixture' } };
  const completion = c.envelope('/complete', receipt, 4), before = fs.readFileSync(path.join(directory, 'completions.ndjson'));
  const status = peer.status(); const denied = await raw('/complete', completion, foreign);
  assert.equal(denied.value.error, 'peer_auth_or_replay'); assert.equal(denied.value.body, undefined); assert.equal(settled, false);
  assert.deepEqual(peer.status().pending, status.pending); assert.ok(fs.readFileSync(path.join(directory, 'completions.ndjson')).equals(before));
  const ack = await raw('/complete', completion); assert.equal(ack.status, 200); cors(ack, origin);
  assert.equal(ack.value.mac, mac(ack.value.body, installation.panelToken)); assert.equal(ack.value.body.payload.ack.commandId, frame.commandId);
  assert.equal((await inspection).observation.project.name, 'Untitled'); assert.equal(peer.status().pending, null);
  const completed = fs.readFileSync(path.join(directory, 'completions.ndjson'));
  assert.equal(completed.toString().trim().split('\n').map(JSON.parse).filter(e => e.type === 'complete').length, 1);
  assert.equal((await raw('/complete', completion)).value.error, 'peer_auth_or_replay');
  assert.ok(fs.readFileSync(path.join(directory, 'completions.ndjson')).equals(completed), 'same signed completion cannot ACK twice');
});
test('installable-runtime panel VM/WebCrypto shim validates challenge Origin before signing or link and signs full original challenge', async () => {
  const source = fs.readFileSync(path.join(root, 'cep/js/panel.js'), 'utf8');
  for (const origin of ['null', 'file://', undefined, '', 'NULL', 'FILE://', 'file:///', 'https://example.test']) {
    const accepted = origin === 'null' || origin === 'file://', calls = [], signed = [];
    const challenge = { epoch: 'shim-epoch', nonce: 'shim-nonce', role: 'panel', ...installation, executorHash: asset.executorHash, controllerId: 'shim-controller' };
    delete challenge.panelToken; delete challenge.controlToken; if (origin !== undefined) challenge.origin = origin;
    const cfg = { ...installation, executorHash: asset.executorHash, assetKey: asset.assetKey }, elements = { status: {}, detail: {} };
    let finish; const finished = new Promise(resolve => { finish = resolve; });
    elements.connect = { addEventListener() {}, set disabled(value) { if (!value) finish(); } };
    let recovered = 0;
    const cryptoShim = { getRandomValues: value => webcrypto.getRandomValues(value), subtle: { importKey: (...args) => webcrypto.subtle.importKey(...args), sign: (...args) => { signed.push(Buffer.from(args[2]).toString()); return webcrypto.subtle.sign(...args); } } };
    const context = vm.createContext({ crypto: cryptoShim, TextEncoder, Uint8Array, localStorage: memoryStorage(), document: { getElementById: id => elements[id] }, __adobe_cep__: { evalScript() { throw new Error('no native dispatch in shim'); } },
      Core4Installation: cfg,
      async fetch(url, options) {
        const route = new URL(url).pathname, value = JSON.parse(options.body); calls.push({ route, options, value });
        assert.deepEqual(Object.keys(options.headers), ['Content-Type']); assert.equal(options.credentials, 'omit'); assert.equal(options.cache, 'no-store');
        if (route === '/challenge') return { ok: true, json: async () => challenge };
        if (route === '/link') {
          assert.equal(canonical(value.challenge), canonical(challenge)); assert.equal(value.proof, mac({ challenge, peerId: value.peerId }, installation.panelToken));
          const body = { peerId: value.peerId, epoch: challenge.epoch, pins: {} }; return { ok: true, json: async () => ({ body, mac: mac(body, installation.panelToken) }) };
        }
        assert.equal(route, '/poll'); throw new Error('shim_stop_after_poll');
      }
    });
    vm.runInContext('window=this;', context);
    vm.runInContext(fs.readFileSync(path.join(root, 'cep/js/poll-dispatcher.js'), 'utf8'), context);
    context.Core4PollDispatcher.createDispatcher = () => ({ recover: async () => { recovered++; } });
    vm.runInContext(source, context); await finished;
    assert.deepEqual(calls.map(c => c.route), accepted ? ['/challenge', '/link', '/poll'] : ['/challenge'], elements.status.textContent);
    assert.equal(recovered, accepted ? 1 : 0);
    if (accepted) { assert.equal(signed[0], canonical({ challenge, peerId: calls[1].value.peerId })); assert.match(elements.status.textContent, /shim_stop_after_poll/); }
    else { assert.equal(signed.length, 0); assert.equal(elements.status.textContent, 'Остановлено: installation_binding'); }
  }
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
for (const origin of ['null', 'file://']) test('installable-runtime callback loss fences durable store and persisted browser latch: no replay on reload or cross-Origin restart: ' + origin, async t => {
  const directory = temp(), pkg = buildPackage(), peer = createHttpPeer({ installation, directory, asset, port: 0, timeout: 40 }); await peer.listen();
  const c = await client(peer.status().port, installation, origin), storage = memoryStorage(); let physicalCalls = 0;
  const options = { installationId: installation.installationId, assetKey: asset.assetKey, pins: c.pins, storage, csInterface: { evalScript() { physicalCalls++; } }, complete: () => { throw new Error('unexpected'); } };
  const dispatch = dispatcher(pkg, options);
  const inspection = peer.inspect({}); const rejected = assert.rejects(inspection, /host_callback_timeout/);
  const frame = (await c.call('/poll', {})).command; dispatch.dispatch(frame); await rejected;
  assert.equal(physicalCalls, 1); await assert.rejects(dispatcher(pkg, options).recover(), /physical_outcome_unknown_no_replay/);
  assert.throws(() => dispatch.dispatch(frame), /physical_latch_present/);
  assert.equal(peer.status().unknown, true); await peer.close();
  const reopened = createHttpPeer({ installation, directory, asset, port: 0 }); await reopened.listen(); t.after(() => reopened.close());
  assert.equal(reopened.status().storeClosed, true); assert.throws(() => reopened.inspect({}), /receiver_lane_closed/);
  const reconnected = await client(reopened.status().port, installation, origin === 'null' ? 'file://' : 'null');
  const before = fs.readFileSync(path.join(directory, 'completions.ndjson'));
  const receipt = { commandId: frame.commandId, originalBinding: frame.originalBinding, pins: frame.pins, result: { readFailureVersion: 1, outcome: 'rejected', code: 'inspection_failed' } };
  assert.equal((await reconnected.raw('/complete', reconnected.envelope('/complete', receipt))).value.error, 'unknown_no_promotion');
  assert.ok(fs.readFileSync(path.join(directory, 'completions.ndjson')).equals(before)); assert.equal(physicalCalls, 1);
  assert.throws(() => reopened.inspect({}), /receiver_lane_closed/);
});
test('installable-runtime missing fixed host registry returns known read rejection after durable begin, no raw fallback', async t => {
  const directory = temp(), pkg = buildPackage(), peer = createHttpPeer({ installation, directory, asset, port: 0 }); await peer.listen(); t.after(() => peer.close());
  const c = await client(peer.status().port), context = vm.createContext({ JSON: undefined }); let physicalCalls = 0;
  const dispatch = dispatcher(pkg, { installationId: installation.installationId, assetKey: asset.assetKey, pins: c.pins, storage: memoryStorage(), csInterface: { evalScript(script, cb) { physicalCalls++; cb(vm.runInContext(script, context)); } }, complete: p => c.call('/complete', p) });
  const rejected = assert.rejects(peer.inspect({}), /host_registry_unavailable/);
  await dispatch.dispatch((await c.call('/poll', {})).command); await rejected;
  assert.equal(physicalCalls, 1); assert.equal(peer.status().storeClosed, false); assert.equal(dispatch.pending(), null);
});
test('installable-runtime long Cyrillic display names and total inspection budget stay bounded at actual HTTP boundary; next read survives known budget refusal', async t => {
  const directory = temp(), pkg = buildPackage(), peer = createHttpPeer({ installation, directory, asset, port: 0 }); await peer.listen(); t.after(() => peer.close());
  const c = await client(peer.status().port), longName = 'ОченьДлинноеИмя'.repeat(2000);
  function CompItem(id) { this.id = id; this.name = longName; this.duration = 10; this.numLayers = 1000; this.layer = n => ({ id: 1000 + n, name: longName, property: () => ({}) }); }
  const project = { file: { fsName: 'C:/fixture/проект.aep', name: longName }, numItems: 500, item: n => new CompItem(n) };
  const context = vm.createContext({ JSON: undefined, Math, Error, CompItem, app: { version: '26.0-fixture', project } }); vm.runInContext('Object.keys=undefined;', context); vm.runInContext(Buffer.from(pkg.files['cep/jsx/registry.jsx'], 'base64').toString(), context);
  const dispatch = dispatcher(pkg, { installationId: installation.installationId, assetKey: asset.assetKey, pins: c.pins, storage: memoryStorage(), csInterface: { evalScript(script, cb) { cb(vm.runInContext(script, context)); } }, complete: p => c.call('/complete', p) });
  async function read() { const inspection = peer.inspect({ compId: 7 }); const observed = inspection.then(value => ({ value }), error => ({ error })); await dispatch.dispatch((await c.call('/poll', {})).command); return observed; }
  const first = (await read()).value.observation; assert.equal(first.target.projectId, project.file.fsName); assert.equal(first.target.compId, 7); assert.equal(first.truncated, true); assert.ok(JSON.stringify(first).length <= 40000); assert.ok(Buffer.byteLength(JSON.stringify(first)) < 200000); assert.ok([...first.layers, ...first.compositions].every(item => item.name.length <= 256));
  project.file.fsName = 'C:/' + 'я'.repeat(50000); const oversized = await read(); assert.equal(oversized.error.code, 'inspection_result_budget'); assert.equal(peer.status().storeClosed, false); assert.equal(dispatch.pending(), null);
  project.file.fsName = 'C:/fixture/проект.aep'; assert.equal((await read()).value.observation.target.compId, 7);
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
  const withMeta = await rpc('tools/call', { name: 'core_status', arguments: { payload: {} }, _meta: { progressToken: 'fixture-progress', traceparent: 'fixture-trace' } });
  assert.equal(JSON.parse(withMeta.content[0].text).product, 'AE Agent Core 4.0.0'); assert.ok(!withMeta.content[0].text.includes('fixture-progress'));
  await assert.rejects(rpc('tools/call', { name: 'core_status', arguments: { payload: {} }, _meta: { padding: 'x'.repeat(9000) } }), /invalid_protocol_metadata/);
  await assert.rejects(rpc('tools/call', { name: 'core_status', arguments: { payload: {}, _meta: { grant: true } } }), /unexpected_field/);
  const status = await tool('core_status'); assert.equal(status.physical.peer.connected, false); assert.equal(status.automaticLifecycle, 'unavailable');
  const modules = await tool('list_modules'); assert.ok(modules.modules.some(x => x.id === 'project-inspection'));
  const contract = await tool('get_module_contract', { moduleId: 'project-inspection' }); assert.equal(contract.contract.executionPolicy, 'read-only-current-observation-v1');
  await assert.rejects(tool('inspect_module_target', { moduleId: 'titles', contractId: contract.contractId, target: {} }), /contract_identity/);
  await assert.rejects(tool('inspect_module_target', { contractId: contract.contractId, target: {} }), /contract_identity/);
  assert.equal((await tool('core_status')).physical.pending, null);
  const c = await client(status.physical.port, d), host = fakeHost(pkg); let refuse = true;
  const dispatch = dispatcher(pkg, { installationId: d.installationId, assetKey: asset.assetKey, pins: c.pins, storage: memoryStorage(), csInterface: { evalScript(script, cb) { if (refuse) { refuse = false; cb(JSON.stringify({ readFailureVersion: 1, outcome: 'rejected', code: 'host_registry_unavailable' })); } else host.evalScript(script, cb); } }, complete: p => c.call('/complete', p) });
  const refused = assert.rejects(tool('inspect_module_target', { moduleId: 'project-inspection', contractId: contract.contractId, target: {} }), /host_registry_unavailable/);
  await dispatch.dispatch((await c.call('/poll', {})).command); await refused;
  const inspection = tool('inspect_module_target', { moduleId: 'project-inspection', contractId: contract.contractId, target: { compId: 7 } });
  await dispatch.dispatch((await c.call('/poll', {})).command); assert.equal((await inspection).observation.compositions[0].compId, 7);
  child.stdin.end(); await once(child, 'exit'); assert.equal(errors, ''); assert.equal(child.exitCode, 0);
});
test('installable-runtime private adoption bootstrap imports no mutable operator-relative provider before verified release preflight', () => {
  const directory = temp(), { plan } = install(directory), installed = applyInstall(plan), d = JSON.parse(fs.readFileSync(installed.descriptorPath));
  const operator = path.join(directory, 'operator/tools/adopt-host.js'), provider = path.join(directory, 'operator/runtime/windows-reservation-provider.js'), sentinel = path.join(directory, 'UNVERIFIED-ADOPTION-PROVIDER');
  fs.mkdirSync(path.dirname(operator), { recursive: true }); fs.mkdirSync(path.dirname(provider), { recursive: true }); fs.copyFileSync(path.join(root, 'tools/adopt-host.js'), operator);
  fs.writeFileSync(provider, 'require("node:fs").writeFileSync(' + JSON.stringify(sentinel) + ',"executed");');
  const witness = path.join(directory, 'witness.json'); fs.writeFileSync(witness, JSON.stringify({ installationId: 'wrong-witness', machineId: d.machineId }));
  const rejected = spawnSync(process.execPath, [operator, '--installation', installed.descriptorPath, '--witness', witness], { encoding: 'utf8', windowsHide: true, timeout: 5000 }); assert.equal(rejected.status, 1); assert.match(rejected.stderr, /adoption_witness_identity/); assert.equal(fs.existsSync(sentinel), false);
  fs.writeFileSync(path.join(d.releaseDir, 'runtime/windows-reservation-provider.js'), 'require("node:fs").writeFileSync(' + JSON.stringify(sentinel) + ',"executed");');
  const unverified = spawnSync(process.execPath, [operator, '--installation', installed.descriptorPath, '--witness', witness], { encoding: 'utf8', windowsHide: true, timeout: 5000 }); assert.equal(unverified.status, 1); assert.match(unverified.stderr, /installed_release_bytes/); assert.equal(fs.existsSync(sentinel), false);
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

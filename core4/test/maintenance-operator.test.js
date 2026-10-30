'use strict';
// Installed TEMP releases, IPC and HTTP port0 only. Operator resume CLI (3457)
// is deliberately not executed; component tests exercise its trusted port0 seam.
const nodeTest = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), os = require('node:os'), crypto = require('node:crypto');
const { PassThrough } = require('node:stream'), { execFile } = require('node:child_process');
const http = require('node:http');
const { canonical } = require('../protocol/json'), { buildPackage } = require('../tools/package-installable'), { planInstall, applyInstall } = require('../tools/install-core4');
const { verifyInstallation } = require('../runtime/stdio-entry'), { createIpcClient } = require('../runtime/client-ipc'), { ownerEndpoint } = require('../runtime/client-entry');
const { operate } = require('../tools/maintain-owner'), { checkMaintenanceOperatorSource } = require('../tools/check-boundaries');
const test = (name, fn) => nodeTest('maintenance-operator ' + name, { timeout: 20000 }, fn);
const SOURCE = path.resolve(__dirname, '..'); let pkg;
function fixture(t) {
  pkg ||= buildPackage(SOURCE, 'readonly', { runtimeModel: 'owner' });
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'core4-maintenance-operator-')), closers = [];
  const args = { pkg, installRoot: path.join(directory, 'AEAgentCore4'), extensionsDir: path.join(directory, 'extensions'), configPath: path.join(directory, 'config.toml'), nodePath: fs.realpathSync(process.execPath), machineId: os.hostname() };
  const descriptor = applyInstall(planInstall(args)).descriptorPath, d = verifyInstallation(descriptor);
  t.after(async () => { for (const close of closers.reverse()) await close(); assert.ok(directory.startsWith(path.join(os.tmpdir(), 'core4-maintenance-operator-'))); fs.rmSync(directory, { recursive: true, force: true }); });
  return { directory, descriptor, d, args, closers, async owner() { const r = await require(path.join(d.releaseDir, 'runtime/owner-entry.js')).startOwner({ descriptor, port: 0 }); closers.push(() => r.close()); return r; },
    async client() { const client = await createIpcClient({ endpoint: ownerEndpoint(d), identity: { installationId: d.installationId, machineId: d.machineId, packageHash: d.packageHash }, secret: d.controlToken }); closers.push(() => client.close()); return client; } };
}
function snapshot(directory) { const result = {}; for (const item of fs.readdirSync(directory, { withFileTypes: true })) { const file = path.join(directory, item.name); result[item.name] = item.isDirectory() ? snapshot(file) : fs.readFileSync(file).toString('base64'); } return result; }
async function until(predicate) { const deadline = Date.now() + 4000; while (!predicate()) { if (Date.now() > deadline) assert.fail('maintenance condition timeout'); await new Promise(resolve => setTimeout(resolve, 5)); } }

test('operator guard requires reviewed package pin and rejects imports before complete verification', () => {
  const source = fs.readFileSync(path.join(SOURCE, 'tools/maintain-owner.js'), 'utf8'); assert.equal(checkMaintenanceOperatorSource(source), true);
  assert.throws(() => checkMaintenanceOperatorSource("require('node:fs');require('unexpected');\n" + source), /unverified_maintenance_import/);
  assert.throws(() => checkMaintenanceOperatorSource(source.replace("if (d.packageHash !== expectedPackageHash) fail('maintenance_package_pin_changed');", '')), /maintenance_operator_verification_layout/);
});

test('wrong package pin and poisoned installed import bytes refuse before evaluating trusted imports', async t => {
  const f = fixture(t), id = crypto.randomUUID(), marker = path.join(f.directory, 'unexpected-import'), entry = path.join(f.d.releaseDir, 'runtime/stdio-entry.js');
  await assert.rejects(operate({ command: 'stop', descriptor: f.descriptor, id, expectedPackageHash: 'a'.repeat(64) }), e => e.code === 'maintenance_package_pin_changed');
  fs.writeFileSync(entry, "require('node:fs').writeFileSync(" + JSON.stringify(marker) + ",'unexpected');\n" + fs.readFileSync(entry, 'utf8'));
  await assert.rejects(operate({ command: 'stop', descriptor: f.descriptor, id, expectedPackageHash: f.d.packageHash }), e => e.code === 'installed_release_bytes'); assert.equal(fs.existsSync(marker), false);
});

test('real owner IPC rejects control-only maintenance proof and keeps private methods out of MCP', async t => {
  const f = fixture(t), runtime = await f.owner(), client = await f.client(), response = await client.call('core_status', {});
  assert.equal(response.ok, true); const s = response.value.lifecycle, maintenance = require(path.join(f.d.releaseDir, 'runtime/owner-maintenance.js'));
  const proof = maintenance.createStopAuthorization({ installation: f.d, descriptorPath: f.descriptor, scope: { bootId: s.processBootId, pid: s.pid, birthTicks: s.birthTicks } });
  const wrong = structuredClone(proof); wrong.mac = crypto.createHmac('sha256', f.d.controlToken).update(canonical(wrong.body)).digest('hex');
  assert.equal((await client.call('maintenance_stop', wrong)).code, 'maintenance_authorization'); assert.equal(runtime.status().attachmentOwner.frozen, false);
  const input = new PassThrough(), output = new PassThrough(); let text = '', forwarded = 0; output.on('data', b => { text += b; });
  const adapter = require(path.join(f.d.releaseDir, 'runtime/client-stdio.js')).serveAttachment({ client: { call() { forwarded++; }, close() {} }, input, output });
  input.write(canonical({ jsonrpc: '2.0', id: 1, method: 'tools/list' }) + '\n'); input.write(canonical({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'maintenance_stop', arguments: { payload: proof } } }) + '\n');
  await until(() => text.trim().split('\n').length === 2); const rows = text.trim().split('\n').map(JSON.parse);
  assert.equal(rows[0].result.tools.some(item => item.name === 'maintenance_stop'), false); assert.equal(rows[1].error.message, 'unknown_tool'); assert.equal(forwarded, 0); adapter.close();
  const ack = await client.call('maintenance_stop', proof); assert.equal(ack.ok, true); await until(() => runtime.status().maintenance.phase === 'stopped');
  const serialized = fs.readFileSync(path.join(f.d.stateDir, 'runtime-maintenance.json'), 'utf8'); assert.equal(serialized.includes(f.d.controlToken), false); assert.equal(serialized.includes(f.d.panelToken), false);
});

test('actual pinned operator stop uses private IPC once and prints no credentials or raw descriptor', async t => {
  const f = fixture(t), runtime = await f.owner(), id = crypto.randomUUID();
  const env = Object.create(null); for (const key of ['PATH', 'HOMEDRIVE', 'HOMEPATH', 'LOGONSERVER', 'SYSTEMDRIVE', 'USERDOMAIN', 'USERNAME', 'USERPROFILE', 'NODE_V8_COVERAGE']) env[key] = '';
  for (const key of ['SystemRoot', 'WINDIR', 'TEMP', 'TMP']) if (process.env[key]) env[key] = process.env[key];
  const result = await new Promise((resolve, reject) => execFile(process.execPath, [path.join(SOURCE, 'tools/maintain-owner.js'), 'stop', '--installation', f.descriptor, '--operation', id, '--expected-package-hash', f.d.packageHash], { shell: false, windowsHide: true, env, timeout: 10000, maxBuffer: 8192 }, (error, stdout, stderr) => error ? reject(Object.assign(error, { safeStderr: stderr })) : resolve({ stdout, stderr })));
  assert.equal(result.stderr, ''); const ack = JSON.parse(result.stdout); assert.equal(ack.accepted, true); assert.equal(ack.id, id); assert.equal(ack.aeAuthority, false); assert.equal(ack.automaticReplay, false);
  for (const secret of [f.d.controlToken, f.d.panelToken, 'panelToken', 'controlToken']) assert.equal(result.stdout.includes(secret), false); await until(() => runtime.status().maintenance.phase === 'stopped');
});

test('desired-stop refuses owner before listen and refuses installer before acquiring any lease', async t => {
  const f = fixture(t), file = path.join(f.d.stateDir, 'runtime-maintenance.json'); fs.writeFileSync(file, '{torn-but-observed');
  const before = snapshot(f.directory), owner = require(path.join(f.d.releaseDir, 'runtime/owner-entry.js'));
  await assert.rejects(owner.startOwner({ descriptor: f.descriptor, port: 0 }), e => e.code === 'owner_desired_stopped');
  const plan = planInstall(f.args); assert.throws(() => applyInstall(plan), e => e.code === 'runtime_lifecycle_owned_or_maintenance'); assert.deepEqual(snapshot(f.directory), before);
  assert.equal(fs.existsSync(path.join(f.d.installRoot, 'install.lock')), false); assert.equal(fs.existsSync(path.join(f.d.stateDir, 'broker/broker-owner.gate')), false);
});

test('private election cleanup closes an actual unhandled HTTP request and releases its ephemeral port', async t => {
  const f = fixture(t), maintenance = require(path.join(f.d.releaseDir, 'runtime/owner-maintenance.js')), resume = maintenance.resumeMaintenance, create = http.createServer;
  let server, request, requestClosed = false, port, timeout;
  // This fixture isolates the operator's finally block. It does not claim a
  // complete resume transaction or bind production port3457.
  http.createServer = function () {
    server = create.call(http); const listen = server.listen;
    server.listen = function (number, host, ...args) { assert.equal(number, 3457); assert.equal(host, '127.0.0.1'); return listen.call(this, 0, host, ...args); }; return server;
  };
  maintenance.resumeMaintenance = async ({ reservedServer }) => {
    port = reservedServer.address().port; assert.notEqual(port, 3457);
    const received = new Promise(resolve => reservedServer.once('request', resolve));
    request = http.get({ hostname: '127.0.0.1', port, path: '/challenge' }); request.on('error', () => {}); request.once('close', () => { requestClosed = true; });
    await received; assert.equal(requestClosed, false); return { fixtureOnly: 'election-finally', runtimeStarted: false };
  };
  try {
    const result = await Promise.race([operate({ command: 'resume', descriptor: f.descriptor, id: crypto.randomUUID(), expectedPackageHash: f.d.packageHash, expectedProofHash: 'a'.repeat(64) }), new Promise((_, reject) => { timeout = setTimeout(() => reject(Error('operator cleanup hung on an active request')), 5000); })]);
    assert.equal(result.fixtureOnly, 'election-finally'); assert.equal(server.listening, false); await until(() => requestClosed);
    const rebound = create.call(http); await new Promise(resolve => rebound.listen(port, '127.0.0.1', resolve)); await new Promise(resolve => rebound.close(resolve));
  } finally { clearTimeout(timeout); http.createServer = create; maintenance.resumeMaintenance = resume; if (request && !requestClosed) request.destroy(); if (server?.listening) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); } }
});

test('private election bind refusal cleans its server without touching the foreign listener or installation', async t => {
  const f = fixture(t), create = http.createServer, blocker = create.call(http); await new Promise(resolve => blocker.listen(0, '127.0.0.1', resolve));
  const port = blocker.address().port, before = snapshot(f.directory); let closes = 0;
  http.createServer = function () { const server = create.call(http), listen = server.listen, closeAll = server.closeAllConnections; server.listen = function (number, host, ...args) { assert.equal(number, 3457); return listen.call(this, port, host, ...args); }; server.closeAllConnections = function () { closes++; return closeAll.call(this); }; return server; };
  try { await assert.rejects(operate({ command: 'resume', descriptor: f.descriptor, id: crypto.randomUUID(), expectedPackageHash: f.d.packageHash, expectedProofHash: 'a'.repeat(64) }), e => e.code === 'EADDRINUSE'); assert.equal(closes, 1); assert.equal(blocker.listening, true); assert.deepEqual(snapshot(f.directory), before); }
  finally { http.createServer = create; await new Promise(resolve => blocker.close(resolve)); }
});

test('operator builtin verifier refuses matching foreign-machine origin before probes or trusted imports', async t => {
  const f = fixture(t), foreign = { ...f.d, machineId: 'foreign-machine-fixture' };
  fs.writeFileSync(f.descriptor, canonical(foreign)); const origin = canonical({ installationId: foreign.installationId, machineId: foreign.machineId }); fs.writeFileSync(path.join(f.d.installRoot, 'origin.json'), origin); fs.writeFileSync(path.join(f.d.stateDir, 'origin.json'), origin);
  const open = fs.openSync; let nodeReads = 0; const before = snapshot(f.directory);
  fs.openSync = function (file, ...args) { if (file === f.d.nodePath) nodeReads++; return open.call(fs, file, ...args); };
  try { await assert.rejects(operate({ command: 'stop', descriptor: f.descriptor, id: crypto.randomUUID(), expectedPackageHash: f.d.packageHash }), e => e.code === 'maintenance_machine'); } finally { fs.openSync = open; }
  assert.equal(nodeReads, 0); assert.deepEqual(snapshot(f.directory), before);
});

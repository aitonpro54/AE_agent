'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { spawnSync, spawn } = require('node:child_process');
const { once } = require('node:events');
const { projectClientDescriptor, verifyClientDescriptor, ownerEndpoint } = require('../runtime/client-entry');
const { checkClientEntrySource, checkOwnerEntrySource } = require('../tools/check-boundaries');
function canonical(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
  return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + canonical(v[k])).join(',') + '}';
}
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const nodeHash = hash(fs.readFileSync(process.execPath));
const source = fs.readFileSync(path.join(__dirname, '../runtime/client-entry.js'));
function fixture(extraFiles = {}) {
  const installRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'core4-client-entry-'));
  const installationId = 'fixture-' + crypto.randomUUID(), machineId = 'fixture-host';
  fs.writeFileSync(path.join(installRoot, 'origin.json'), canonical({ installationId, machineId }));
  const moduleFiles = {
    'runtime/client-entry.js': source,
    'runtime/stdio-entry.js': Buffer.from('/* No metadata import from runtime entry. */'),
    'runtime/composition-spec.js': Buffer.from('exports.deriveComposition=()=>({});'),
    // Explicit trusted fixture modules prove loader ordering only, not IPC/AE.
    'runtime/client-ipc.js': Buffer.from("exports.createIpcClient=async o=>{if('panelToken' in o||'stateDir' in o)throw Error('fixture_role_leak');return {call(){},close(){}}};"),
    'runtime/client-stdio.js': Buffer.from("exports.serveAttachment=({output})=>{output.write('fixture-thin-ready\\n');return {close(){}}};"),
    ...extraFiles
  };
  const manifest = { version: '4.2.2', format: 2, hashes: Object.fromEntries(Object.entries(moduleFiles).map(([f, v]) => [f, hash(v)])) };
  const packageHash = hash(canonical(manifest)), releaseDir = path.join(installRoot, 'releases', packageHash);
  for (const [file, bytes] of Object.entries(moduleFiles)) { fs.mkdirSync(path.dirname(path.join(releaseDir, file)), { recursive: true }); fs.writeFileSync(path.join(releaseDir, file), bytes); }
  fs.writeFileSync(path.join(releaseDir, 'release.json'), canonical(manifest));
  const installation = { installationId, machineId, installRoot, releaseDir, packageHash, nodePath: process.execPath, nodeHash, controlToken: 'a'.repeat(64), panelToken: 'b'.repeat(64), stateDir: path.join(installRoot, 'state/production') };
  const descriptor = projectClientDescriptor(installation), file = path.join(installRoot, 'core-client.json'); fs.writeFileSync(file, canonical(descriptor));
  return { file, descriptor, installation, releaseDir, installRoot, write(value) { fs.writeFileSync(file, canonical(value)); },
    run(entry = path.join(releaseDir, 'runtime/client-entry.js')) { return spawnSync(process.execPath, [entry, '--client-descriptor', file], { encoding: 'utf8', windowsHide: true }); } };
}
test('client-entry projects only the control role and verifies without reading full installation or state', () => {
  const f = fixture(), original = fs.openSync; const reads = [];
  fs.openSync = function (file, ...args) { reads.push(String(file)); return original.call(this, file, ...args); };
  try { assert.deepEqual(verifyClientDescriptor(f.file), f.descriptor); } finally { fs.openSync = original; }
  assert.equal('panelToken' in f.descriptor, false); assert.equal('stateDir' in f.descriptor, false); assert.equal('cepDir' in f.descriptor, false);
  for (const file of [f.file, path.join(f.installRoot, 'origin.json'), path.join(f.releaseDir, 'release.json')]) assert.ok(reads.includes(file), 'bounded reader opens the expected role descriptor/origin/release');
  assert.equal(reads.some(v => /installation\.json$|state[\\/]production/.test(v)), false);
});
test('client-entry endpoint is installation scoped and independent of package revision', () => {
  const a = { installationId: 'fixture-one', machineId: 'host' }, b = { ...a, packageHash: '2'.repeat(64) };
  assert.equal(ownerEndpoint(a), ownerEndpoint(b)); assert.notEqual(ownerEndpoint(a), ownerEndpoint({ ...a, installationId: 'fixture-two' }));
  assert.throws(() => ownerEndpoint({ ...a, machineId: '../path' }), /client_identity/);
});
test('client-entry exact descriptor shape rejects role leakage and foreign endpoint before any imports', () => {
  const f = fixture();
  for (const value of [{ ...f.descriptor, panelToken: 'b'.repeat(64) }, { ...f.descriptor, role: 'panel' }, { ...f.descriptor, ownerEndpoint: '\\\\.\\pipe\\foreign' }]) {
    f.write(value); assert.throws(() => verifyClientDescriptor(f.file), /client_descriptor/);
  }
});
test('client-entry wrong Node pin, origin and release traversal are rejected', () => {
  const f = fixture();
  f.write({ ...f.descriptor, nodeHash: '0'.repeat(64) }); assert.throws(() => verifyClientDescriptor(f.file), /client_node/);
  f.write({ ...f.descriptor, originHash: '0'.repeat(64) }); assert.throws(() => verifyClientDescriptor(f.file), /client_origin/);
  f.write({ ...f.descriptor, releaseDir: path.join(f.installRoot, 'elsewhere') }); assert.throws(() => verifyClientDescriptor(f.file), /client_descriptor_scope/);
});
test('client-entry poisoned import bytes fail release verification before evaluating module', () => {
  const f = fixture(), marker = path.join(f.installRoot, 'must-not-exist');
  fs.writeFileSync(path.join(f.releaseDir, 'runtime/client-ipc.js'), 'require("node:fs").writeFileSync(' + JSON.stringify(marker) + ',"bad");');
  const result = f.run(); assert.equal(result.status, 1); assert.match(result.stderr, /client_release_bytes/); assert.equal(fs.existsSync(marker), false);
});
test('client-entry missing or corrupt spec is rejected before helper execution or owner state', () => {
  for (const mode of ['missing', 'corrupt']) {
    const f = fixture(), helper = path.join(f.releaseDir, 'runtime/composition-spec.js'), marker = path.join(f.installRoot, 'spec-must-not-run');
    if (mode === 'missing') fs.unlinkSync(helper); else fs.writeFileSync(helper, 'require("node:fs").writeFileSync(' + JSON.stringify(marker) + ',"bad");');
    const result = f.run(); assert.equal(result.status, 1); assert.match(result.stderr, /client_release_bytes|client_release_tree/);
    assert.equal(fs.existsSync(marker), false); assert.equal(fs.existsSync(f.installation.stateDir), false);
  }
});
test('client-entry unexpected file or directory is rejected by exact release tree check', () => {
  const f = fixture(); fs.mkdirSync(path.join(f.releaseDir, 'unexpected'));
  assert.throws(() => verifyClientDescriptor(f.file), /client_release_tree/);
});
test('client-entry current descriptor cannot authorize a stale entry outside its release root', () => {
  const f = fixture({ 'runtime/composition-spec.js': Buffer.from('require("node:fs").writeFileSync(require("node:path").join(__dirname,"spec-executed"),"bad");') }), alternate = path.join(f.installRoot, 'stale/runtime'); fs.mkdirSync(alternate, { recursive: true });
  const entry = path.join(alternate, 'client-entry.js'); fs.writeFileSync(entry, source);
  const result = f.run(entry); assert.equal(result.status, 1); assert.match(result.stderr, /client_entry_root/); assert.equal(result.stdout, '');
  assert.equal(fs.existsSync(path.join(f.releaseDir, 'runtime/spec-executed')), false);
});
test('client-entry positive actual child uses verified fixture-only thin adapter', () => {
  const f = fixture(), result = f.run(); assert.equal(result.status, 0, result.stderr); assert.equal(result.stdout, 'fixture-thin-ready\n');
});
test('client-entry builtin-only verification does not follow a junction ancestor', { skip: process.platform !== 'win32' }, () => {
  const f = fixture(), parent = fs.mkdtempSync(path.join(os.tmpdir(), 'core4-client-link-')), alias = path.join(parent, 'alias');
  fs.symlinkSync(f.installRoot, alias, 'junction'); assert.throws(() => verifyClientDescriptor(path.join(alias, 'core-client.json')), /client_path/);
});
test('client-entry source guard rejects executable imports before verification or outside entry function', () => {
  assert.equal(checkClientEntrySource(source.toString()), true);
  assert.throws(() => checkClientEntrySource("require('./mutable-helper');\n" + source), /unverified_client_import/);
  assert.throws(() => checkClientEntrySource(source + "\nrequire('./mutable-helper');"), /unverified_client_import/);
  const ownerSource = fs.readFileSync(path.join(__dirname, '../runtime/owner-entry.js'), 'utf8');
  assert.equal(checkOwnerEntrySource(ownerSource), true);
  assert.throws(() => checkOwnerEntrySource("require('./mutable-helper');\n" + ownerSource), /unverified_owner_import/);
});
test('client-entry actual thin initialize/discovery survives absent owner without claiming an empty queue', { timeout: 10000 }, async t => {
  const files = Object.fromEntries(['client-ipc.js', 'client-stdio.js', 'attachment-owner.js', 'controller-lease.js'].map(name => ['runtime/' + name, fs.readFileSync(path.join(__dirname, '../runtime', name))]));
  const f = fixture(files), child = spawn(process.execPath, [path.join(f.releaseDir, 'runtime/client-entry.js'), '--client-descriptor', f.file], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
  t.after(() => { if (child.exitCode === null) child.kill(); });
  let buffer = '', stderr = '', timer; const rows = [];
  child.stderr.on('data', chunk => { stderr += chunk; });
  const done = new Promise((resolve, reject) => {
    timer = setTimeout(() => reject(new Error('fixture_client_timeout:' + stderr)), 5000);
    child.once('error', reject);
    child.stdout.on('data', chunk => { buffer += chunk; for (;;) { const at = buffer.indexOf('\n'); if (at < 0) break; rows.push(JSON.parse(buffer.slice(0, at))); buffer = buffer.slice(at + 1); if (rows.length === 3) resolve(); } });
  });
  for (const request of [{ id: 1, method: 'initialize' }, { id: 2, method: 'tools/list' }, { id: 3, method: 'tools/call', params: { name: 'owner_status', arguments: {} } }]) child.stdin.write(JSON.stringify({ jsonrpc: '2.0', ...request }) + '\n');
  try { await done; } finally { clearTimeout(timer); }
  assert.equal(rows.find(row => row.id === 1).result.serverInfo.name, 'ae-agent-core4');
  assert.ok(rows.find(row => row.id === 2).result.tools.some(tool => tool.name === 'controller_acquire'));
  const unavailable = JSON.parse(rows.find(row => row.id === 3).result.content[0].text);
  assert.deepEqual(unavailable, { available: false, reason: 'owner_connection_unavailable', coverage: 'unobserved' });
  assert.equal('pending' in unavailable, false); assert.equal('unresolved' in unavailable, false);
  const exit = once(child, 'exit'); child.stdin.end(); await exit; assert.equal(child.exitCode, 0, stderr);
});
test('client-entry local oversized request preserves the existing controller and an accepted call', { skip: process.platform !== 'win32', timeout: 10000 }, async t => {
  const { createIpcServer, IPC_LIMITS } = require('../runtime/client-ipc');
  const { createAttachmentOwner, OWNER_METHODS } = require('../runtime/attachment-owner');
  const files = Object.fromEntries(['client-ipc.js', 'client-stdio.js', 'attachment-owner.js', 'controller-lease.js'].map(name => ['runtime/' + name, fs.readFileSync(path.join(__dirname, '../runtime', name))]));
  const f = fixture(files); let complete, calls = 0;
  const accepted = new Promise(resolve => { complete = resolve; });
  const owner = createAttachmentOwner({ runtime: { status: () => ({ ready: true }), close() {} }, activity: () => ({ pending: false, unresolved: false, fault: false }),
    async invoke(method, _payload, context) { if (method === 'connect') { calls++; await accepted; context.assertCurrent(); return { available: true }; } return { ready: true }; } });
  const server = createIpcServer({ endpoint: f.descriptor.ownerEndpoint, identity: { installationId: f.descriptor.installationId, machineId: f.descriptor.machineId, packageHash: f.descriptor.packageHash }, secret: f.descriptor.controlToken, bootId: owner.bootId, methods: OWNER_METHODS, onAttach: owner.onAttach, onDetach: owner.onDetach, onRequest: owner.onRequest });
  await server.listen(); t.after(async () => { complete(); await server.close(); if (!owner.status().accepted) await owner.close(); });
  const child = spawn(process.execPath, [path.join(f.releaseDir, 'runtime/client-entry.js'), '--client-descriptor', f.file], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
  t.after(() => { if (child.exitCode === null) child.kill(); });
  let buffer = ''; const rows = [];
  child.stdout.on('data', chunk => { buffer += chunk; for (;;) { const at = buffer.indexOf('\n'); if (at < 0) break; rows.push(JSON.parse(buffer.slice(0, at))); buffer = buffer.slice(at + 1); } });
  const wait = async predicate => { for (let n = 0; n < 1000; n++) { if (predicate()) return; await new Promise(resolve => setTimeout(resolve, 2)); } assert.fail('fixture_wait'); };
  const send = (id, name, payload = {}) => child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: { payload } } }) + '\n');
  send(1, 'controller_acquire'); await wait(() => rows.some(row => row.id === 1));
  const holder = owner.status().holderClientId;
  send(2, 'core_connect'); await wait(() => owner.status().accepted === 1);
  send(3, 'core_status', { text: 'x'.repeat(IPC_LIMITS.frameBytes) }); await wait(() => rows.some(row => row.id === 3));
  assert.match(rows.find(row => row.id === 3).error?.message ?? '', /^ipc_(frame_size|json)$/);
  assert.equal(server.status().sessions, 1); assert.equal(owner.status().holderClientId, holder); assert.equal(owner.status().accepted, 1);
  send(4, 'core_status'); await wait(() => rows.some(row => row.id === 4)); assert.equal(rows.find(row => row.id === 4).error, undefined);
  complete(); await wait(() => rows.some(row => row.id === 2)); assert.equal(rows.find(row => row.id === 2).error, undefined); assert.equal(calls, 1);
  const exit = once(child, 'exit'); child.stdin.end(); await exit; assert.equal(child.exitCode, 0);
});

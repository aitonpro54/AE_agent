'use strict';
// Verified TEMP distributions and installed DATA. No production port or OS probe.
const nodeTest = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), os = require('node:os'), crypto = require('node:crypto'), http = require('node:http');
const { spawnSync } = require('node:child_process');
const { canonical, hash } = require('../protocol/json');
const { buildStandalone, writeStandalone } = require('../tools/package-standalone-installer');
const { buildPackage } = require('../tools/package-installable');
const { planInstall, applyInstall } = require('../tools/install-core4');
const { checkFinishOperatorSource, checkStandaloneSource } = require('../tools/check-boundaries');
const test = (name, fn) => nodeTest('maintenance-finish-operator ' + name, { timeout: 20000 }, fn);
const SOURCE = path.resolve(__dirname, '..'); let bundle, packageData;
function fixture(t, legacy = false) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'core4-finish-operator-'));
  t.after(() => { assert.ok(base.startsWith(path.join(os.tmpdir(), 'core4-finish-operator-'))); fs.rmSync(base, { recursive: true, force: true }); });
  bundle ||= buildStandalone(SOURCE, 'readonly', { runtimeModel: 'owner' });
  packageData ||= buildPackage(SOURCE, 'readonly', { runtimeModel: 'owner' });
  const distribution = path.join(base, 'distribution'); const shipped = legacy ? buildStandalone(SOURCE, 'readonly') : bundle; writeStandalone(distribution, shipped);
  // A valid old installation may contain code that the NEW operator must never
  // evaluate. Rebind package hashes as ordinary offline package data.
  const pkg = structuredClone(packageData), poison = "throw Error('OLD_INSTALLED_CODE_WAS_EXECUTED');\n";
  for (const file of ['runtime/owner-maintenance.js', 'runtime/stdio-entry.js']) { pkg.files[file] = Buffer.from(poison).toString('base64'); pkg.release.hashes[file] = hash(poison); }
  pkg.packageHash = hash(pkg.release);
  const descriptor = applyInstall(planInstall({ pkg, installRoot: path.join(base, 'AEAgentCore4'), extensionsDir: path.join(base, 'extensions'), configPath: path.join(base, 'config.toml'), nodePath: fs.realpathSync(process.execPath), machineId: os.hostname() })).descriptorPath;
  const d = JSON.parse(fs.readFileSync(descriptor)), trace = path.join(base, 'imports.json'), preload = path.join(base, 'guard.cjs');
  fs.writeFileSync(preload, `const fs=require('node:fs'),path=require('node:path'),M=require('node:module'),net=require('node:net'),cp=require('node:child_process');
const trace=${JSON.stringify(trace)},old=${JSON.stringify(d.releaseDir)},loads=[],resolve=M._resolveFilename;
M._resolveFilename=function(...args){const file=resolve.apply(this,args);if(!M.isBuiltin(file)&&file.startsWith(old+path.sep))throw Error('old_installed_import_forbidden');loads.push(file);return file;};
net.Server.prototype.listen=function(){throw Error('test_port_forbidden');};for(const name of ['spawn','exec','execFile','fork'])cp[name]=()=>{throw Error('test_probe_forbidden');};
process.on('exit',()=>fs.writeFileSync(trace,JSON.stringify(loads)));`);
  function run(options = {}) {
    const args = [path.join(distribution, 'tools/standalone-installer.js'), options.mode || 'maintenance-inspect', '--expected-distribution-hash', options.distributionHash || shipped.distributionHash, '--expected-current-package-hash', options.currentHash || d.packageHash, '--installation', descriptor, '--operation', crypto.randomUUID()];
    const r = spawnSync(process.execPath, ['--require', preload, ...args], { encoding: 'utf8', windowsHide: true, timeout: 15000 });
    assert.equal(r.error, undefined); return { ...r, imports: JSON.parse(fs.readFileSync(trace)), report: JSON.parse(r.status === 0 ? r.stdout : r.stderr) };
  }
  return { base, distribution, d, descriptor, shipped, run };
}
test('source guards pin bootstrap and constant NEW support imports', () => {
  const finish = fs.readFileSync(path.join(SOURCE, 'tools/finish-owner-maintenance.js'), 'utf8'), standalone = fs.readFileSync(path.join(SOURCE, 'tools/standalone-installer.js'), 'utf8');
  assert.equal(checkFinishOperatorSource(finish), true); assert.equal(checkStandaloneSource(standalone), true);
  assert.throws(() => checkFinishOperatorSource("require('foreign');\n" + finish), /unverified_finish_import/);
  assert.throws(() => checkFinishOperatorSource(finish + "\nrequire(path.join(d.releaseDir,'runtime/owner-maintenance'));"), /unverified_finish_import/);
  assert.throws(() => checkStandaloneSource("require('./finish-owner-maintenance.js');\n" + standalone), /unverified_standalone_import/);
});
test('JSON clones cannot issue the opaque bootstrap capability or cause installation reads', async () => {
  const { operate } = require('../tools/finish-owner-maintenance'), { assertMaintenanceBootstrap } = require('../tools/standalone-installer');
  for (const value of [{}, Object.freeze({}), { mode: 'maintenance-finish', descriptor: 'C:/fake', expectedPackageHash: 'a'.repeat(64), verified: true }]) {
    assert.throws(() => assertMaintenanceBootstrap(value), /maintenance_bootstrap_brand/); await assert.rejects(operate(value), /maintenance_bootstrap_brand/);
  }
});
test('NEW reviewed distribution verifies installed poisoned source as DATA and never imports it', t => {
  const f = fixture(t), r = f.run(); assert.equal(r.status, 1); assert.equal(r.report.error, 'standalone_failed');
  assert.ok(r.imports.includes(path.join(f.distribution, 'tools/finish-owner-maintenance.js')));
  assert.ok(r.imports.includes(path.join(f.distribution, 'runtime/stdio-entry.js')));
  assert.ok(r.imports.includes(path.join(f.distribution, 'runtime/owner-maintenance.js')));
  assert.equal(r.imports.some(file => file.startsWith(f.d.releaseDir + path.sep)), false);
  for (const secret of [f.d.panelToken, f.d.controlToken, 'panelToken', 'controlToken']) assert.equal(r.stdout.includes(secret) || r.stderr.includes(secret), false);
});
test('wrong distribution/current pins and absent owner support refuse before runtime import', t => {
  const f = fixture(t);
  for (const [options, code] of [[{ distributionHash: '0'.repeat(64) }, 'standalone_reviewed_hash'], [{ currentHash: '0'.repeat(64) }, 'maintenance_package_pin_changed']]) {
    const r = f.run(options); assert.equal(r.status, 1); assert.equal(r.report.error, code); assert.equal(r.imports.includes(path.join(f.distribution, 'runtime/owner-maintenance.js')), false);
  }
  const legacy = fixture(t, true), r = legacy.run(); assert.equal(r.status, 1); assert.equal(r.report.error, 'maintenance_distribution_unavailable'); assert.equal(r.imports.includes(path.join(legacy.distribution, 'tools/finish-owner-maintenance.js')), false);
});
test('tampered NEW support helper is rejected before any installed operator import', t => {
  const f = fixture(t); fs.appendFileSync(path.join(f.distribution, 'tools/finish-owner-maintenance.js'), "\nthrow Error('TAMPERED_SUPPORT_EXECUTED');");
  const r = f.run(); assert.equal(r.report.error, 'standalone_closure_bytes'); assert.equal(r.imports.includes(path.join(f.distribution, 'tools/finish-owner-maintenance.js')), false);
});
test('private election finally closes a real pending request on its TEMP port', async t => {
  const f = fixture(t), bootstrap = require(path.join(f.distribution, 'tools/standalone-installer.js')), maintenance = require(path.join(f.distribution, 'runtime/owner-maintenance.js'));
  const create = http.createServer, finish = maintenance.finishMaintenance; let server, request, closed = false, port, timer;
  http.createServer = () => { server = create.call(http); const listen = server.listen; server.listen = function (number, host, ...args) { assert.equal(number, 3457); return listen.call(this, 0, host, ...args); }; return server; };
  maintenance.finishMaintenance = async ({ reservedServer }) => {
    port = reservedServer.address().port; assert.notEqual(port, 3457); const received = new Promise(resolve => reservedServer.once('request', resolve));
    request = http.get({ hostname: '127.0.0.1', port, path: '/challenge' }); request.on('error', () => {}); request.on('close', () => { closed = true; }); await received; return { fixtureOnly: true };
  };
  try {
    const result = await Promise.race([bootstrap.main(['maintenance-finish', '--expected-distribution-hash', f.shipped.distributionHash, '--expected-current-package-hash', f.d.packageHash, '--installation', f.descriptor, '--operation', crypto.randomUUID(), '--expected-proof-hash', 'a'.repeat(64)]), new Promise((_, reject) => { timer = setTimeout(() => reject(Error('election cleanup hung')), 5000); })]);
    assert.equal(result.fixtureOnly, true); assert.equal(server.listening, false); const deadline = Date.now() + 1000;
    while (!closed && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 5)); assert.equal(closed, true);
    const rebound = create.call(http); await new Promise(resolve => rebound.listen(port, '127.0.0.1', resolve)); await new Promise(resolve => rebound.close(resolve));
  } finally { clearTimeout(timer); maintenance.finishMaintenance = finish; http.createServer = create; request?.destroy(); if (server?.listening) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); } }
});

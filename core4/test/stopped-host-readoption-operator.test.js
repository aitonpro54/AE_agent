'use strict';
// Verified TEMP distributions/installations as data; no AE or production port.
const nodeTest = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), os = require('node:os'), crypto = require('node:crypto'), http = require('node:http');
const { spawnSync } = require('node:child_process');
const { canonical, hash } = require('../protocol/json');
const { buildStandalone, writeStandalone } = require('../tools/package-standalone-installer');
const { planInstall, applyInstall } = require('../tools/install-core4');
const { checkReadoptionOperatorSource, checkStandaloneSource } = require('../tools/check-boundaries');
const test = (name, fn) => nodeTest('stopped-host-readoption-operator ' + name, { timeout: 45000 }, fn);
const SOURCE = path.resolve(__dirname, '..'), bundles = new Map(), code = value => error => error.code === value;
const modes = { 'readopt-inspect': 'inspectStoppedReadoption', 'readopt-apply': 'applyStoppedReadoption', 'readopt-finish': 'finishStoppedReadoption', 'readopt-enable': 'enableStoppedReadoption', 'readopt-enable-finish': 'finishEnableStoppedReadoption' };
function tree(directory) { const result = {}; function visit(dir) { for (const entry of fs.readdirSync(dir, { withFileTypes: true })) { const file = path.join(dir, entry.name); if (entry.isDirectory()) visit(file); else result[path.relative(directory, file)] = fs.readFileSync(file).toString('base64'); } } visit(directory); return result; }
function fixture(t, { composition = 'manual', runtimeModel = 'owner', poison = false, installed = true } = {}) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'core4-readoption-operator-'));
  t.after(() => { assert.ok(base.startsWith(path.join(os.tmpdir(), 'core4-readoption-operator-'))); fs.rmSync(base, { recursive: true, force: true }); });
  const key = composition + '/' + runtimeModel; if (!bundles.has(key)) bundles.set(key, buildStandalone(SOURCE, composition, { runtimeModel }));
  const shipped = structuredClone(bundles.get(key)), pkg = JSON.parse(Buffer.from(shipped.files['candidate.json'], 'base64'));
  if (poison) {
    // Same-package rule remains in force. Rebind a valid offline payload whose
    // owner entry must be verified as bytes and never evaluated by the operator.
    const bytes = Buffer.from("throw Error('INSTALLED_OWNER_EXECUTED');\n"); pkg.files['runtime/owner-entry.js'] = bytes.toString('base64'); pkg.release.hashes['runtime/owner-entry.js'] = hash(bytes); pkg.packageHash = hash(pkg.release);
    shipped.files['runtime/owner-entry.js'] = bytes.toString('base64'); shipped.files['candidate.json'] = Buffer.from(canonical(pkg)).toString('base64'); shipped.packageHash = pkg.packageHash; shipped.manifest.packageHash = pkg.packageHash;
    for (const file of ['runtime/owner-entry.js', 'candidate.json']) shipped.manifest.hashes[file] = hash(Buffer.from(shipped.files[file], 'base64')); shipped.distributionHash = hash(shipped.manifest);
  }
  const distribution = path.join(base, 'distribution'); writeStandalone(distribution, shipped);
  const descriptor = path.join(base, 'AEAgentCore4/installation.json'); let d;
  if (installed) { applyInstall(planInstall({ pkg, installRoot: path.dirname(descriptor), extensionsDir: path.join(base, 'extensions'), configPath: path.join(base, 'config.toml'), nodePath: fs.realpathSync(process.execPath), machineId: os.hostname() })); d = JSON.parse(fs.readFileSync(descriptor)); }
  const witnessPath = path.join(base, 'witness.json'), witness = Buffer.from(canonical({ fixture: 'pinned UTF8 witness' })); fs.writeFileSync(witnessPath, witness);
  const main = () => require(path.join(distribution, 'tools/standalone-installer.js')), api = () => require(path.join(distribution, 'tools/stopped-host-readoption.js')), id = crypto.randomUUID();
  function args(mode = 'readopt-inspect') { return [mode, '--expected-distribution-hash', shipped.distributionHash, '--expected-current-package-hash', pkg.packageHash, '--installation', descriptor, '--operation', id, ...(mode !== 'readopt-inspect' ? ['--expected-proof-hash', 'a'.repeat(64)] : []), ...(mode === 'readopt-apply' ? ['--witness', witnessPath, '--expected-witness-hash', hash(witness)] : [])]; }
  function run(argv = args()) {
    const trace = path.join(base, 'imports.json'), preload = path.join(base, 'preload.cjs');
    fs.writeFileSync(preload, `const fs=require('node:fs'),path=require('node:path'),M=require('node:module'),net=require('node:net'),cp=require('node:child_process');
const loads=[],installedAttempts=[],old=${JSON.stringify(d?.releaseDir || path.join(base, 'no-install'))},resolve=M._resolveFilename;
M._resolveFilename=function(...args){const file=resolve.apply(this,args);if(!M.isBuiltin(file)){loads.push(file);if(file.startsWith(old+path.sep)){installedAttempts.push(file);throw Error('installed_source_forbidden');}}return file;};
const listen=net.Server.prototype.listen;net.Server.prototype.listen=function(port,host,...args){if(port!==3457||host!=='127.0.0.1')throw Error('unexpected_listener');return listen.call(this,0,host,...args);};
for(const name of ['spawn','spawnSync','exec','execSync','execFile','execFileSync','fork'])cp[name]=()=>{throw Object.assign(Error('native_forbidden'),{code:'fixture_native_forbidden'});};
process.on('exit',()=>fs.writeFileSync(${JSON.stringify(trace)},JSON.stringify({loads,installedAttempts})));`);
    const result = spawnSync(process.execPath, ['--require', preload, path.join(distribution, 'tools/standalone-installer.js'), ...argv], { encoding: 'utf8', windowsHide: true, timeout: 20000 });
    assert.equal(result.error, undefined); return { ...result, ...JSON.parse(fs.readFileSync(trace)), report: JSON.parse(result.status === 0 ? result.stdout : result.stderr) };
  }
  return { base, distribution, descriptor, d, shipped, pkg, witnessPath, witness, main, api, id, args, run };
}
function election(t) {
  const create = http.createServer, servers = [];
  http.createServer = () => { const server = create.call(http), listen = server.listen; servers.push(server); server.listen = function (port, host, ...args) { assert.equal(port, 3457); assert.equal(host, '127.0.0.1'); return listen.call(this, 0, host, ...args); }; return server; };
  t.after(async () => { http.createServer = create; for (const server of servers) if (server.listening) await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }); });
  return servers;
}
test('source guards require private bootstrap before all nonbuiltins and constant reviewed imports', async () => {
  const source = fs.readFileSync(path.join(SOURCE, 'tools/operate-stopped-readoption.js'), 'utf8'), bootstrap = fs.readFileSync(path.join(SOURCE, 'tools/standalone-installer.js'), 'utf8');
  assert.equal(checkReadoptionOperatorSource(source), true); assert.equal(checkStandaloneSource(bootstrap), true);
  for (const poisoned of ["require('foreign');\n" + source, "require('./stopped-host-readoption');\n" + source, source + '\nrequire(target.releaseDir);']) assert.throws(() => checkReadoptionOperatorSource(poisoned), /unverified_readoption_import/);
  assert.throws(() => checkStandaloneSource("require('./operate-stopped-readoption.js');\n" + bootstrap), /unverified_standalone_import/);
  const main = require('../tools/standalone-installer'), operator = require('../tools/operate-stopped-readoption'), stat = fs.lstatSync; let reads = 0;
  fs.lstatSync = () => { reads++; throw Error('forged capability read filesystem'); };
  try { for (const capability of [{}, Object.freeze({}), { mode: 'readopt-inspect', descriptorPath: 'fake', verified: true }]) { assert.throws(() => main.assertReadoptionBootstrap(capability), /readoption_bootstrap_brand/); await assert.rejects(operator.operate(capability), /readoption_bootstrap_brand/); } assert.equal(reads, 0); } finally { fs.lstatSync = stat; }
});
test('all four helpers have one exact union entry; build/write/verifier retain unchanged runtime package', t => {
  const f = fixture(t, { installed: false }), main = f.main(), additions = ['tools/stopped-host-readoption.js', 'tools/stopped-host-readoption-store.js', 'tools/stopped-host-readoption-transaction.js', 'tools/operate-stopped-readoption.js'];
  for (const file of additions) { assert.equal(main.HELPERS.filter(name => name === file).length, 1); assert.ok(f.shipped.files[file]); const bad = structuredClone(f.shipped); delete bad.files[file]; delete bad.manifest.hashes[file]; bad.distributionHash = hash(bad.manifest); const output = path.join(f.base, 'missing-' + path.basename(file)); assert.throws(() => writeStandalone(output, bad), /standalone_bundle/); assert.equal(fs.existsSync(output), false); }
  assert.equal(main.HELPERS.includes('runtime/windows-reservation-provider.js'), false); assert.ok(f.pkg.files['runtime/windows-reservation-provider.js']);
  const expected = [...Object.keys(f.pkg.files), ...main.HELPERS, 'candidate.json', 'README.txt']; assert.equal(new Set(expected).size, expected.length); assert.deepEqual(Object.keys(f.shipped.files).sort(), expected.sort());
  assert.equal(f.pkg.packageHash, 'cc2f07132209317bed89a529109dc06036559e4328950e5c04ca1be273c7cfac'); assert.equal(Object.keys(f.pkg.files).length, 70); assert.equal(main.verifyStandalone(f.distribution, f.shipped.distributionHash).packageHash, f.pkg.packageHash);
});
test('bootstrap capability remains private through await, then revokes on resolve/reject/synchronous throw', async t => {
  const f = fixture(t, { installed: false }), main = f.main(), operator = require(path.join(f.distribution, 'tools/operate-stopped-readoption.js')), original = operator.operate;
  try { for (const kind of ['resolve', 'reject', 'sync']) { let saved; operator.operate = capability => { saved = capability; const options = main.assertReadoptionBootstrap(capability); assert.equal(Object.isFrozen(options), true); assert.throws(() => main.assertReadoptionBootstrap({ ...capability }), /readoption_bootstrap_brand/); if (kind === 'sync') throw Object.assign(Error('fixture_sync'), { code: 'fixture_sync' }); return (async () => { await new Promise(resolve => setTimeout(resolve, 5)); assert.equal(main.assertReadoptionBootstrap(capability), options); if (kind === 'reject') throw Object.assign(Error('fixture_reject'), { code: 'fixture_reject' }); return { fixtureOnly: true }; })(); };
    if (kind === 'resolve') assert.equal((await main.main(f.args())).fixtureOnly, true); else await assert.rejects(main.main(f.args()), code('fixture_' + (kind === 'sync' ? 'sync' : 'reject'))); assert.throws(() => main.assertReadoptionBootstrap(saved), /readoption_bootstrap_brand/);
  } } finally { operator.operate = original; }
});
test('readonly/stdio support and wrong distribution/current pin refuse before operator or native module import', t => {
  for (const options of [{ composition: 'readonly' }, { runtimeModel: 'stdio' }]) { const f = fixture(t, { ...options, installed: false }), result = f.run(); assert.equal(result.report.error, 'readoption_distribution_unavailable'); assert.equal(result.loads.some(file => /operate-stopped-readoption|windows-reservation-provider|windows-owner-process/.test(file)), false); }
  const f = fixture(t, { installed: false }); for (const [flag, expected] of [['--expected-distribution-hash', 'standalone_reviewed_hash'], ['--expected-current-package-hash', 'readoption_distribution_package_mismatch']]) { const args = f.args(); args[args.indexOf(flag) + 1] = '0'.repeat(64); const result = f.run(args); assert.equal(result.report.error, expected); assert.equal(result.loads.some(file => /operate-stopped-readoption/.test(file)), false); }
});
test('unknown flags duplicates invalid hashes UUID paths and cross-mode witness flags are zero-write early refusals', t => {
  const f = fixture(t), before = tree(f.d.installRoot), cases = [
    [...f.args(), '--installation', f.descriptor], [...f.args(), '--port', '0'], [...f.args(), '--config', path.join(f.base, 'config.toml')], [...f.args(), '--expected-package-hash', f.pkg.packageHash], [...f.args(), '--root-status', f.witnessPath], [...f.args(), '--probe', 'fixture'], [...f.args(), '--query', 'fixture'], [...f.args(), '--executable', process.execPath], [...f.args(), '--expected-proof-hash', 'a'.repeat(64)], [...f.args('readopt-finish'), '--witness', f.witnessPath], [...f.args('readopt-enable'), '--expected-witness-hash', hash(f.witness)]
  ];
  for (const [flag, value] of [['--operation', crypto.randomUUID().toUpperCase()], ['--expected-current-package-hash', 'NOT_A_HASH'], ['--installation', 'relative.json']]) { const args = f.args(); args[args.indexOf(flag) + 1] = value; cases.push(args); }
  cases.push(f.args('readopt-apply').slice(0, -2));
  for (const args of cases) { const result = f.run(args); assert.equal(result.status, 1); assert.match(result.report.error, /^standalone_(usage|absolute_exact_path)$/); assert.equal(result.loads.some(file => /operate-stopped-readoption/.test(file)), false); assert.deepEqual(tree(f.d.installRoot), before); }
});
for (const file of ['stopped-host-readoption.js', 'stopped-host-readoption-store.js', 'stopped-host-readoption-transaction.js', 'operate-stopped-readoption.js']) test('tampered distributed ' + file + ' refuses before operator import', t => {
  const f = fixture(t, { installed: false }); fs.appendFileSync(path.join(f.distribution, 'tools', file), '\nthrow Error("TAMPERED");'); const result = f.run(); assert.equal(result.report.error, 'standalone_closure_bytes'); assert.equal(result.loads.some(name => /operate-stopped-readoption/.test(name)), false);
});
test('a validly hashed extra closure file is refused before operator import', t => {
  const f = fixture(t, { installed: false }), bytes = Buffer.from('throw Error("EXTRA");'); fs.writeFileSync(path.join(f.distribution, 'tools/extra.js'), bytes); const manifest = structuredClone(f.shipped.manifest); manifest.hashes['tools/extra.js'] = hash(bytes); fs.writeFileSync(path.join(f.distribution, 'standalone.json'), canonical(manifest)); const args = f.args(); args[args.indexOf('--expected-distribution-hash') + 1] = hash(manifest); const result = f.run(args); assert.equal(result.report.error, 'standalone_helper_closure'); assert.equal(result.loads.some(name => /operate-stopped-readoption/.test(name)), false);
});
test('valid hashed poisoned installed owner source is only data; failures never output descriptor or credentials', t => {
  const f = fixture(t, { poison: true }), before = tree(f.d.installRoot), result = f.run(); assert.equal(result.status, 1); assert.equal(result.installedAttempts.length, 0); assert.ok(result.loads.includes(path.join(f.distribution, 'runtime/stdio-entry.js'))); assert.ok(result.loads.includes(path.join(f.distribution, 'tools/stopped-host-readoption.js'))); assert.deepEqual(tree(f.d.installRoot), before);
  for (const secret of [f.descriptor, f.d.panelToken, f.d.controlToken, 'panelToken', 'controlToken', 'INSTALLED_OWNER_EXECUTED']) assert.equal(result.stdout.includes(secret) || result.stderr.includes(secret), false);
});
for (const [name, bytes, expected] of [['hash', Buffer.from('{}'), 'readoption_witness_pin'], ['budget', Buffer.alloc(16385), 'readoption_witness_budget'], ['UTF8', Buffer.from([0xc0, 0xaf]), 'readoption_witness_utf8']]) test('apply witness ' + name + ' refuses before election/library import and preserves installed data', async t => {
  const f = fixture(t), main = f.main(), before = tree(f.d.installRoot), args = f.args('readopt-apply'); fs.writeFileSync(f.witnessPath, bytes); if (name !== 'hash') args[args.indexOf('--expected-witness-hash') + 1] = hash(bytes);
  const create = http.createServer; let elected = false; http.createServer = () => { elected = true; throw Error('early election'); };
  try { await assert.rejects(main.main(args), code(expected)); assert.equal(elected, false); assert.equal(require.cache[path.join(f.distribution, 'tools/stopped-host-readoption.js')], undefined); assert.deepEqual(tree(f.d.installRoot), before); } finally { http.createServer = create; }
});
test('pinned witness read detects in-place byte drift before any election', async t => {
  const f = fixture(t), main = f.main(), read = fs.readSync, create = http.createServer; let changed = false, elected = false;
  fs.readSync = (fd, buffer, ...args) => { const count = read(fd, buffer, ...args); if (!changed && buffer.length === f.witness.length && buffer.equals(f.witness)) { changed = true; fs.writeFileSync(f.witnessPath, Buffer.alloc(f.witness.length, 0x20)); } return count; };
  http.createServer = () => { elected = true; throw Error('early election'); };
  try { await assert.rejects(main.main(f.args('readopt-apply')), code('readoption_witness_changed')); assert.equal(changed, true); assert.equal(elected, false); } finally { fs.readSync = read; http.createServer = create; }
});
test('all five modes dispatch exact frozen options and an owned witness snapshot while election stays held', async t => {
  const f = fixture(t), main = f.main(), api = f.api(), servers = election(t), originals = {}; let calls = 0;
  try { for (const [mode, method] of Object.entries(modes)) { assert.equal(typeof api[method], 'function'); originals[method] = api[method]; api[method] = async options => { calls++; const server = servers.at(-1); assert.equal(server.listening, true); assert.equal(server.listenerCount('request'), 0); assert.equal(options.reservedServer, server); assert.equal(Object.isFrozen(options), true); assert.equal(Object.isFrozen(options.installation), true); assert.equal(options.id, f.id); assert.equal(options.descriptorPath, f.descriptor); assert.deepEqual(Object.keys(options).sort(), ['installation', 'descriptorPath', 'id', 'reservedServer', ...(mode !== 'readopt-inspect' ? ['expectedProofHash'] : []), ...(mode === 'readopt-apply' ? ['witness'] : [])].sort()); if (mode !== 'readopt-inspect') assert.equal(options.expectedProofHash, 'a'.repeat(64));
      if (mode === 'readopt-apply') { const snapshot = Buffer.from(options.witness); assert.deepEqual(snapshot, f.witness); fs.writeFileSync(f.witnessPath, 'changed after pinned read'); await new Promise(resolve => setTimeout(resolve, 5)); assert.deepEqual(options.witness, snapshot); }
      await new Promise(resolve => setTimeout(resolve, 5)); assert.equal(server.listening, true); return { fixtureOnly: true, mode }; };
    const result = await main.main(f.args(mode)); assert.equal(result.mode, mode); assert.equal(servers.at(-1).listening, false); api[method] = originals[method]; }
    assert.equal(calls, 5);
  } finally { for (const [name, value] of Object.entries(originals)) api[name] = value; }
});
test('continuous reservation closes pending HTTP and rebinds after awaited success or refusal', async t => {
  const f = fixture(t), api = f.api(), main = f.main(), servers = election(t), original = api.inspectStoppedReadoption; let request, timer;
  try { for (const refused of [false, true]) { let port, closed = false; api.inspectStoppedReadoption = async ({ reservedServer }) => { port = reservedServer.address().port; const received = new Promise(resolve => reservedServer.once('request', resolve)); request = http.get({ hostname: '127.0.0.1', port, path: '/pending' }); request.on('error', () => {}); request.on('close', () => { closed = true; }); await received;
      const competitor = http.createServer(), busy = new Promise(resolve => competitor.once('error', resolve)); await new Promise(resolve => setTimeout(resolve, 5)); const nativeListen = Object.getPrototypeOf(Object.getPrototypeOf(competitor)).listen; nativeListen.call(competitor, port, '127.0.0.1'); assert.equal((await busy).code, 'EADDRINUSE');
      assert.equal(reservedServer.listening, true); if (refused) throw Object.assign(Error('fixture_refusal'), { code: 'fixture_refusal' }); return { fixtureOnly: true }; };
      const action = main.main(f.args()), deadline = new Promise((_, reject) => { timer = setTimeout(() => reject(Error('election cleanup hung')), 5000); }); if (refused) await assert.rejects(Promise.race([action, deadline]), code('fixture_refusal')); else assert.equal((await Promise.race([action, deadline])).fixtureOnly, true); clearTimeout(timer);
      const server = servers.find(value => value.address()?.port === port) || servers[servers.length - 2]; assert.equal(server.listening, false); const until = Date.now() + 1000; while (!closed && Date.now() < until) await new Promise(resolve => setTimeout(resolve, 5)); assert.equal(closed, true);
      const rebound = http.createServer(), nativeListen = Object.getPrototypeOf(Object.getPrototypeOf(rebound)).listen; await new Promise(resolve => nativeListen.call(rebound, port, '127.0.0.1', resolve)); await new Promise(resolve => rebound.close(resolve));
    } } finally { clearTimeout(timer); request?.destroy(); api.inspectStoppedReadoption = original; }
});

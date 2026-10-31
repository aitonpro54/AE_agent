'use strict';
// Reviewed TEMP distribution only; native/legacy/update actions are not invoked.
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), os = require('node:os'), crypto = require('node:crypto'), http = require('node:http');
const { buildStandalone, writeStandalone } = require('../tools/package-standalone-installer');
const { planInstall, applyInstall } = require('../tools/install-core4');
const { canonical, hash } = require('../protocol/json');
const { checkUpdateOperatorSource, checkStandaloneSource } = require('../tools/check-boundaries');
function fixture(t) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'core4-update-operator-')); t.after(() => { assert.ok(base.startsWith(path.join(os.tmpdir(), 'core4-update-operator-'))); fs.rmSync(base, { recursive: true, force: true }); });
  const bundle = buildStandalone(undefined, 'readonly', { runtimeModel: 'owner' }), distribution = path.join(base, 'distribution'); writeStandalone(distribution, bundle);
  const main = require(path.join(distribution, 'tools/standalone-installer.js')), operator = require(path.join(distribution, 'tools/operate-stopped-update.js'));
  const descriptor = path.join(base, 'AEAgentCore4/installation.json'), id = crypto.randomUUID();
  const args = ['--expected-distribution-hash', bundle.distributionHash, '--expected-package-hash', bundle.packageHash, '--expected-current-package-hash', 'a'.repeat(64), '--expected-previous-descriptor-hash', 'b'.repeat(64), '--installation', descriptor, '--operation', id];
  return { base, bundle, distribution, main, operator, descriptor, id, args };
}
test('stopped-update-operator source pins private bootstrap before support imports', async () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../tools/operate-stopped-update.js'), 'utf8');
  assert.equal(checkUpdateOperatorSource(source), true); assert.throws(() => checkUpdateOperatorSource("require('./stopped-update');\n" + source), /unverified_update_import/);
  assert.throws(() => checkUpdateOperatorSource(source + "\nrequire(target.releaseDir);"), /unverified_update_import/);
  assert.equal(checkStandaloneSource(fs.readFileSync(path.resolve(__dirname, '../tools/standalone-installer.js'), 'utf8')), true);
  const { operate } = require('../tools/operate-stopped-update');
  for (const value of [{}, { verified: true, descriptorPath: 'fake', mode: 'migrate-legacy' }]) await assert.rejects(operate(value), /update_bootstrap_brand/);
});
test('stopped-update-operator bootstrap remains opaque and scoped until the awaited operation settles', async t => {
  const f = fixture(t), operate = f.operator.operate; let saved, entered = 0;
  f.operator.operate = async capability => { saved = capability; entered++; const opts = f.main.assertUpdateBootstrap(capability); assert.equal(opts.mode, 'update-inspect'); await new Promise(resolve => setTimeout(resolve, 5)); assert.equal(f.main.assertUpdateBootstrap(capability), opts); return { fixtureOnly: true }; };
  try {
    assert.equal((await f.main.main(['update-inspect', ...f.args])).fixtureOnly, true); assert.equal(entered, 1); assert.throws(() => f.main.assertUpdateBootstrap(saved), /update_bootstrap_brand/);
    await assert.rejects(Promise.resolve().then(() => f.main.main(['update-enable', ...f.args])), /standalone_usage/);
    const wrong = [...f.args]; wrong[wrong.indexOf('--expected-package-hash') + 1] = '0'.repeat(64); await assert.rejects(Promise.resolve().then(() => f.main.main(['update-inspect', ...wrong])), /update_distribution_unavailable/); assert.equal(entered, 1);
    fs.appendFileSync(path.join(f.distribution, 'tools/windows-retained-process.js'), '\n// changed closure\n');
    await assert.rejects(Promise.resolve().then(() => f.main.main(['update-inspect', ...f.args])), /standalone_closure_bytes/); assert.equal(entered, 1);
  } finally { f.operator.operate = operate; }
});
test('stopped-update-operator recovery awaits verification and closes its TEMP election including pending requests', async t => {
  const f = fixture(t), pkg = JSON.parse(Buffer.from(f.bundle.files['candidate.json'], 'base64'));
  const d = JSON.parse(fs.readFileSync(applyInstall(planInstall({ pkg, nodePath: fs.realpathSync(process.execPath), installRoot: path.dirname(f.descriptor), extensionsDir: path.join(f.base, 'extensions'), configPath: path.join(f.base, 'config.toml') })).descriptorPath));
  const directory = path.join(d.installRoot, 'transactions', f.id + '-stopped-update'); fs.mkdirSync(directory);
  const intentBytes = canonical({ body: { oldDescriptor: fs.readFileSync(f.descriptor).toString('base64'), payload: { package: pkg } } });
  assert.ok(Buffer.byteLength(intentBytes) > 128 * 1024, 'operator must accept the actual full package size of a recovery intent');
  fs.writeFileSync(path.join(directory, 'intent.json'), intentBytes);
  const args = [...f.args]; args[args.indexOf('--expected-current-package-hash') + 1] = d.packageHash; args[args.indexOf('--expected-previous-descriptor-hash') + 1] = hash(fs.readFileSync(f.descriptor));
  const update = require(path.join(f.distribution, 'tools/stopped-update.js')), inspect = update.inspectStoppedUpdate, create = http.createServer; let server, request, seen = false;
  http.createServer = () => { server = create.call(http); const listen = server.listen; server.listen = function (port, host, ...rest) { assert.equal(port, 3457); return listen.call(this, 0, host, ...rest); }; return server; };
  update.inspectStoppedUpdate = async options => {
    assert.equal(options.reservedServer, server); const received = new Promise(resolve => server.once('request', resolve)); request = http.get({ hostname: '127.0.0.1', port: server.address().port, path: '/pending' }); request.on('error', () => {}); await received;
    await new Promise(resolve => setTimeout(resolve, 5)); assert.equal(server.listening, true); seen = true; return { fixtureOnly: true };
  };
  try { assert.equal((await f.main.main(['update-inspect', ...args])).fixtureOnly, true); assert.equal(seen, true); assert.equal(server.listening, false); }
  finally { request?.destroy(); update.inspectStoppedUpdate = inspect; http.createServer = create; if (server?.listening) await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }); }
});

test('stopped-update-operator owner pre-ready modes require explicit inspection proof and verified bootstrap', async t => {
  const f = fixture(t), operate = f.operator.operate; let entered = 0;
  f.operator.operate = async capability => { const p = f.main.assertUpdateBootstrap(capability); entered++; assert.ok(['owner-pre-ready-inspect', 'owner-pre-ready-finish'].includes(p.mode)); return { mode: p.mode, proof: p.expectedProofHash }; };
  try {
    assert.equal((await f.main.main(['owner-pre-ready-inspect', ...f.args])).mode, 'owner-pre-ready-inspect');
    await assert.rejects(Promise.resolve().then(() => f.main.main(['owner-pre-ready-finish', ...f.args])), /standalone_usage/);
    const result = await f.main.main(['owner-pre-ready-finish', ...f.args, '--expected-proof-hash', 'c'.repeat(64)]);
    assert.equal(result.proof, 'c'.repeat(64)); assert.equal(entered, 2);
  } finally { f.operator.operate = operate; }
});

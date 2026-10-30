'use strict';
const nodeTest = require('node:test');
const test = (name, fn) => nodeTest('client-launcher ' + name, { timeout: 15000, skip: process.platform !== 'win32' }, fn);
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), net = require('node:net');
const cp = require('node:child_process');
const { PassThrough } = require('node:stream');
const { randomUUID, createHash } = require('node:crypto');
const { projectClientDescriptor } = require('../runtime/client-entry');
const { createIpcClient, createIpcServer } = require('../runtime/client-ipc');
const SOURCE = path.resolve(__dirname, '..'), spawn = cp.spawn;
const canonical = v => v && typeof v === 'object' ? Array.isArray(v) ? '[' + v.map(canonical).join(',') + ']' : '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + canonical(v[k])).join(',') + '}' : JSON.stringify(v);
const hash = bytes => createHash('sha256').update(bytes).digest('hex'), nodeHash = hash(fs.readFileSync(process.execPath));
const ownerSource = String.raw`'use strict';
// PINNED TEST FIXTURE ONLY. No real stdio-entry/Broker/HTTP/AE is imported.
const fs=require('node:fs'),path=require('node:path'),net=require('node:net');
require('node:http').createServer=()=>{throw Error('fixture_http_forbidden');};
const args=process.argv.slice(2);if(args.length!==2||args[0]!=='--installation')process.exit(2);
const file=args[1],root=path.dirname(file),c=JSON.parse(fs.readFileSync(file));
if(file!==path.join(root,'installation.json'))process.exit(2);
const envKeys=Object.keys(process.env),known=['SYSTEMROOT','WINDIR','TEMP','TMP','PATH','HOMEDRIVE','HOMEPATH','LOGONSERVER','SYSTEMDRIVE','USERDOMAIN','USERNAME','USERPROFILE','NODE_V8_COVERAGE'];
fs.appendFileSync(path.join(root,'owner-starts.ndjson'),JSON.stringify({pid:process.pid,mode:c.mode,args,envKeys,env:Object.fromEntries(known.map(k=>[k,process.env[k]])),cwd:process.cwd()})+'\n');
if(c.mode==='fail')process.exit(0);
// Synthetic TEMP fixture election only; this does not prove Core election.
let lock;try{lock=fs.openSync(path.join(root,'fixture-owner.lock'),'wx');}catch(e){if(e.code==='EEXIST')process.exit(0);throw e;}
if(fs.existsSync(path.join(root,'owner-stopped')))fs.unlinkSync(path.join(root,'owner-stopped'));
const listen=net.Server.prototype.listen;
net.Server.prototype.listen=function(endpoint,...rest){if(endpoint!==c.endpoint)throw Error('fixture_non_ipc_listener');return listen.call(this,endpoint,...rest);};
const {createIpcServer}=require('./client-ipc');
let finished=false;
function finish(){if(finished)return;finished=true;fs.closeSync(lock);fs.unlinkSync(path.join(root,'fixture-owner.lock'));fs.writeFileSync(path.join(root,'owner-stopped'),'settled');}
const identity=c.mode==='wrongPins'?{...c.identity,packageHash:'f'.repeat(64)}:c.identity;
const server=createIpcServer({endpoint:c.endpoint,identity,secret:c.secret,bootId:'fixture-'+process.pid,
methods:['core_status','owner_status','core_connect','fixture_shutdown'],async onRequest({method,requestId}){
 fs.appendFileSync(path.join(root,'owner-calls.ndjson'),JSON.stringify({method,requestId})+'\n');
 if(method==='fixture_shutdown'){setTimeout(async()=>{await server.close();finish();},10);return {ok:true,value:{stopped:true}};}
 if(method==='core_connect'&&c.mode==='drop'){setImmediate(()=>server.close());await new Promise(r=>setTimeout(r,100));finish();return {ok:true,value:{completed:true}};}
 return {ok:true,value:{pid:process.pid,bootId:'fixture-'+process.pid,method}};
}});
setTimeout(()=>server.listen().catch(()=>{finish();process.exitCode=1;}),c.delayMs||0);
`;
const cleanup = new WeakMap();
function resources(t) {
  if (!cleanup.has(t)) {
    const record = { closers: [], directories: [] }; cleanup.set(t, record);
    t.after(async () => {
      let failure;
      for (const close of record.closers.reverse()) try { await close(); } catch (e) { failure ||= e; }
      for (const directory of record.directories) {
        assert.ok(path.resolve(directory) === directory && directory.startsWith(path.join(os.tmpdir(), 'core4-launcher-')));
        fs.rmSync(directory, { recursive: true, force: true });
      }
      if (failure) throw failure;
    });
  }
  return cleanup.get(t);
}
async function until(fn, ms = 5000) { const end = performance.now() + ms; while (!await fn()) { if (performance.now() > end) assert.fail('launcher fixture wait'); await new Promise(r => setTimeout(r, 10)); } }
const lines = file => fs.existsSync(file) ? fs.readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse) : [];
async function stopOwner(f) {
  const starts = lines(f.starts); if (!starts.length || starts.at(-1).mode === 'fail') return;
  const end = performance.now() + 2500;
  while (performance.now() < end) {
    if (fs.existsSync(path.join(f.root, 'owner-stopped'))) return;
    let client;
    try {
      client = await createIpcClient({ endpoint: f.d.ownerEndpoint, identity: f.mode === 'wrongPins' ? { ...f.identity, packageHash: 'f'.repeat(64) } : f.identity, secret: f.d.controlToken, limits: { handshakeMs: 200 } });
      await client.call('fixture_shutdown', {}); client.close();
      await until(() => fs.existsSync(path.join(f.root, 'owner-stopped'))); return;
    } catch (e) { client?.close(); if (e.code !== 'ipc_endpoint_absent') throw e; await new Promise(r => setTimeout(r, 25)); }
  }
  assert.fail('fixture owner did not settle');
}
function fixture(t, options = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'core4-launcher-')); resources(t).directories.push(root);
  const origin = { installationId: 'fixture-' + randomUUID(), machineId: 'launcher-fixture' }; fs.writeFileSync(path.join(root, 'origin.json'), canonical(origin));
  const files = Object.fromEntries(['client-entry', 'client-ipc', 'client-stdio', 'attachment-owner', 'controller-lease'].map(name => ['runtime/' + name + '.js', fs.readFileSync(path.join(SOURCE, 'runtime/' + name + '.js'))]));
  files['runtime/owner-entry.js'] = Buffer.from(ownerSource); files['runtime/owner-contract.json'] = fs.readFileSync(path.join(SOURCE, 'runtime/owner-contract.json'));
  Object.assign(files, options.files);
  if (options.contract) files['runtime/owner-contract.json'] = Buffer.from(canonical(options.contract));
  const manifest = { version: '4.0.0', format: 2, hashes: Object.fromEntries(Object.entries(files).map(([name, bytes]) => [name, hash(bytes)])) };
  const packageHash = hash(canonical(manifest)), releaseDir = path.join(root, 'releases', packageHash);
  for (const [name, bytes] of Object.entries(files)) { fs.mkdirSync(path.dirname(path.join(releaseDir, name)), { recursive: true }); fs.writeFileSync(path.join(releaseDir, name), bytes); }
  fs.writeFileSync(path.join(releaseDir, 'release.json'), canonical(manifest));
  const installation = { ...origin, installRoot: root, releaseDir, packageHash, nodePath: fs.realpathSync(process.execPath), nodeHash, controlToken: 'a'.repeat(64) };
  const d = projectClientDescriptor(installation), descriptor = path.join(root, 'core-client.json'), mode = options.mode || 'normal'; fs.writeFileSync(descriptor, canonical(d));
  const identity = { installationId: d.installationId, machineId: d.machineId, packageHash };
  fs.writeFileSync(path.join(root, 'installation.json'), canonical({ identity, endpoint: d.ownerEndpoint, secret: d.controlToken, mode, delayMs: options.delayMs || 0 }));
  const f = { root, d, identity, descriptor, releaseDir, mode, starts: path.join(root, 'owner-starts.ndjson'), calls: path.join(root, 'owner-calls.ndjson') };
  resources(t).closers.push(() => stopOwner(f)); return f;
}
async function driver(t, f, spawnOverride) {
  const observed = [], original = cp.spawn;
  cp.spawn = (...args) => { observed.push(args); return spawnOverride ? spawnOverride(...args) : original(...args); };
  let runtime;
  const input = new PassThrough(), output = new PassThrough(), pending = new Map(); let next = 0, buffer = '';
  output.on('data', data => { buffer += data; while (buffer.includes('\n')) { const n = buffer.indexOf('\n'), value = JSON.parse(buffer.slice(0, n)); buffer = buffer.slice(n + 1); pending.get(value.id)?.(value); pending.delete(value.id); } });
  try { runtime = await require(path.join(f.releaseDir, 'runtime/client-entry.js')).startClient({ descriptor: f.descriptor, input, output }); }
  finally { cp.spawn = original; }
  resources(t).closers.push(() => { runtime.close(); input.end(); output.end(); });
  const rpc = (method, params = {}) => new Promise(resolve => { const id = ++next; pending.set(id, resolve); input.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n'); });
  return { input, output, runtime, observed, rpc, call: (name, payload = {}) => rpc('tools/call', { name, arguments: { payload } }) };
}
function thinChild(t, f) {
  const tag = randomUUID(), report = path.join(f.root, 'spawn-report-' + tag + '.ndjson'), preload = path.join(f.root, 'observe-spawn-' + tag + '.cjs');
  fs.writeFileSync(preload, "const cp=require('node:child_process'),fs=require('node:fs'),original=cp.spawn;const report=" + JSON.stringify(report) + ";function log(v){fs.appendFileSync(report,JSON.stringify(v)+'\\n')}cp.spawn=(...a)=>{log({event:'call',args:a});const c=original(...a),unref=c.unref;c.once('spawn',()=>log({event:'spawn'}));c.once('error',()=>log({event:'error'}));c.unref=function(){log({event:'unref'});return unref.call(this)};return c};");
  const child = spawn(process.execPath, ['--require', preload, path.join(f.releaseDir, 'runtime/client-entry.js'), '--client-descriptor', f.descriptor], {
    windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, NODE_OPTIONS: '--stack-trace-limit=20', NODE_PATH: f.root, NODE_V8_COVERAGE: path.join(f.root, 'parent-coverage'), PATH: 'fixture-forbidden-path', FIXTURE_CREDENTIAL: 'synthetic-do-not-inherit' } });
  let next = 0, buffer = '', stderr = ''; const pending = new Map(), exited = new Promise(resolve => child.once('exit', (code, signal) => resolve({ code, signal })));
  child.stderr.on('data', data => { stderr += data; });
  child.stdout.on('data', data => { buffer += data; while (buffer.includes('\n')) { const n = buffer.indexOf('\n'), row = JSON.parse(buffer.slice(0, n)); buffer = buffer.slice(n + 1); pending.get(row.id)?.(row); pending.delete(row.id); } });
  resources(t).closers.push(async () => { if (child.exitCode === null && child.signalCode === null) child.kill(); await exited; });
  const rpc = (method, params = {}) => new Promise(resolve => { const id = ++next; pending.set(id, resolve); child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n'); });
  return { child, rpc, exited, report, get stderr() { return stderr; }, call: (name, payload = {}) => rpc('tools/call', { name, arguments: { payload } }) };
}
function value(response) { assert.equal(response.error, undefined, JSON.stringify(response.error)); return JSON.parse(response.result.content[0].text); }
const absenceModule = code => Buffer.from("exports.createIpcClient=async()=>{throw Object.assign(Error('synthetic hidden failure'),{code:" + JSON.stringify(code) + ",phase:'preconnect',reason:'ENOENT'})};");

test('initialize/discovery and EOF cause no connect or spawn; EOF before queued bootstrap cancels it', async t => {
  const f = fixture(t), d = await driver(t, f);
  assert.equal((await d.rpc('initialize')).result.serverInfo.name, 'ae-agent-core4'); assert.ok((await d.rpc('tools/list')).result.tools.length > 0);
  d.input.end(); await until(() => d.runtime.status().closed); assert.equal(d.observed.length, 0); assert.equal(lines(f.starts).length, 0);
  const g = fixture(t, { files: { 'runtime/client-ipc.js': Buffer.from("exports.createIpcClient=()=>new Promise((_,reject)=>setTimeout(()=>reject(Object.assign(Error('absent'),{code:'ipc_endpoint_absent',phase:'preconnect',reason:'ENOENT'})),30));") } });
  const queued = await driver(t, g); void queued.call('core_status'); queued.input.end(); await until(() => queued.runtime.status().closed);
  await new Promise(r => setTimeout(r, 80)); assert.equal(queued.observed.length, 0); assert.equal(lines(g.starts).length, 0);
});

test('EOF or descriptor rotation queued during the full synchronous hash pass refuses spawn at the final checkpoint', async t => {
  for (const mode of ['EOF', 'rotation']) {
    const f = fixture(t, { files: { 'runtime/client-ipc.js': absenceModule('ipc_endpoint_absent') } }), d = await driver(t, f);
    const open = fs.openSync; let scheduled = false, completed = false;
    fs.openSync = function (name, ...args) {
      const fd = open.call(this, name, ...args);
      if (!scheduled && name === f.d.nodePath) {
        scheduled = true;
        setImmediate(() => {
          if (mode === 'EOF') d.input.end();
          else fs.writeFileSync(f.descriptor, canonical({ ...f.d, controlToken: 'b'.repeat(64) }));
          completed = true;
        });
      }
      return fd;
    };
    try {
      const result = d.call('core_status');
      if (mode === 'EOF') await until(() => completed && d.runtime.status().closed);
      else assert.equal((await result).error.message, 'owner_unavailable');
      await new Promise(resolve => setImmediate(resolve));
      assert.equal(scheduled, true); assert.equal(completed, true); assert.equal(d.observed.length, 0); assert.equal(lines(f.starts).length, 0);
    } finally { fs.openSync = open; }
  }
});

test('concurrent requests share one actual spawn; authenticated child receives only pinned args and minimal environment', async t => {
  const f = fixture(t), child = thinChild(t, f);
  const replies = await Promise.all(Array.from({ length: 6 }, () => child.call('core_status'))), statuses = replies.map(value);
  assert.equal(new Set(statuses.map(s => s.pid)).size, 1); assert.equal(lines(f.starts).length, 1);
  const report = lines(child.report), call = report.find(row => row.event === 'call'), [node, args, options] = call.args;
  assert.equal(report.filter(row => row.event === 'call').length, 1); assert.deepEqual(report.map(row => row.event), ['call', 'spawn', 'unref']);
  assert.equal(node, f.d.nodePath); assert.deepEqual(args, [path.join(f.releaseDir, 'runtime/owner-entry.js'), '--installation', path.join(f.root, 'installation.json')]);
  assert.equal(options.shell, false); assert.equal(options.windowsHide, true); assert.equal(options.detached, true); assert.equal(options.stdio, 'ignore'); assert.equal(options.cwd, f.releaseDir);
  const empty = ['PATH', 'HOMEDRIVE', 'HOMEPATH', 'LOGONSERVER', 'SYSTEMDRIVE', 'USERDOMAIN', 'USERNAME', 'USERPROFILE', 'NODE_V8_COVERAGE'];
  const allowed = ['SYSTEMROOT', 'WINDIR', 'TEMP', 'TMP', ...empty], keys = Object.keys(options.env).map(key => key.toUpperCase());
  assert.ok(keys.every(key => allowed.includes(key))); assert.equal(new Set(keys).size, keys.length);
  const actual = lines(f.starts)[0]; assert.ok(actual.envKeys.every(key => allowed.includes(key.toUpperCase())), JSON.stringify(actual.envKeys));
  assert.equal(new Set(actual.envKeys.map(key => key.toUpperCase())).size, actual.envKeys.length);
  for (const key of empty) { assert.equal(options.env[key], ''); assert.ok(actual.env[key] === '' || actual.env[key] === undefined, key + ' carries no inherited value'); }
  assert.equal(actual.cwd, f.releaseDir);
});

test('EOF after spawn exits the thin process while the IPC-only fixture owner survives', async t => {
  const f = fixture(t, { delayMs: 400 }), child = thinChild(t, f); void child.call('core_status');
  await until(() => lines(child.report).some(row => row.event === 'spawn')); child.child.stdin.end();
  assert.equal((await child.exited).code, 0); assert.equal(child.stderr, '');
  await until(() => lines(f.starts).length === 1);
  let status;
  await until(async () => {
    let connection;
    try { connection = await createIpcClient({ endpoint: f.d.ownerEndpoint, identity: f.identity, secret: f.d.controlToken }); status = await connection.call('owner_status', {}); return true; }
    catch (error) { if (error.code !== 'ipc_endpoint_absent') throw error; return false; } finally { connection?.close(); }
  });
  assert.equal(status.ok, true); assert.equal(status.value.pid, lines(f.starts)[0].pid);
});

test('failed actual start stays latched and later explicit requests never spawn a second process', async t => {
  const f = fixture(t, { mode: 'fail' }), d = await driver(t, f);
  assert.equal((await d.call('core_status')).error.message, 'owner_unavailable'); assert.equal(d.observed.length, 1); assert.equal(lines(f.starts).length, 1);
  assert.equal((await d.call('core_status')).error.message, 'owner_unavailable'); assert.equal(d.observed.length, 1);
  const winner = createIpcServer({ endpoint: f.d.ownerEndpoint, identity: f.identity, secret: f.d.controlToken, bootId: 'external-fixture-winner', methods: ['core_status'], onRequest: () => ({ ok: true, value: { external: true } }) });
  await winner.listen(); resources(t).closers.push(() => winner.close());
  assert.equal(value(await d.call('core_status')).external, true); assert.equal(d.observed.length, 1);
  await winner.close();
  const configuration = JSON.parse(fs.readFileSync(path.join(f.root, 'installation.json'))); configuration.mode = 'normal'; f.mode = 'normal'; fs.writeFileSync(path.join(f.root, 'installation.json'), canonical(configuration));
  const oldSocket = await d.call('core_status');
  if (oldSocket.error) assert.ok(['ipc_closed', 'ipc_outcome_uncertain'].includes(oldSocket.error.message));
  assert.equal(value(oldSocket.error ? await d.call('core_status') : oldSocket).method, 'core_status'); assert.equal(d.observed.length, 2);
});

test('descriptor rotation or wrong owner contract refuses before spawn and preserves the failed launch latch', async t => {
  const f = fixture(t, { files: { 'runtime/client-ipc.js': absenceModule('ipc_endpoint_absent') } }), d = await driver(t, f);
  fs.writeFileSync(f.descriptor, canonical({ ...f.d, controlToken: 'b'.repeat(64) }));
  assert.equal((await d.call('core_status')).error.message, 'owner_unavailable'); assert.equal(d.observed.length, 0);
  fs.writeFileSync(f.descriptor, canonical(f.d)); await d.call('core_status'); assert.equal(d.observed.length, 0);
  const bad = fixture(t, { files: { 'runtime/client-ipc.js': absenceModule('ipc_endpoint_absent') }, contract: { version: 1, runtimeModel: 'owner' } }), rejected = await driver(t, bad);
  assert.equal((await rejected.call('core_status')).error.message, 'owner_unavailable'); assert.equal(rejected.observed.length, 0);
});

test('permission, timeout, wrong MAC/pins and postconnect close never bootstrap or reveal internal errors', async t => {
  for (const code of ['ipc_authentication', 'EACCES', 'EPERM', 'ETIMEDOUT', 'ipc_connection_cancelled']) {
    const f = fixture(t, { files: { 'runtime/client-ipc.js': absenceModule(code) } }), d = await driver(t, f), response = await d.call('core_status');
    assert.equal(response.error.message, 'owner_unavailable'); assert.equal(JSON.stringify(response).includes('synthetic hidden failure'), false); assert.equal(d.observed.length, 0);
  }
  for (const variant of ['secret', 'pins', 'close']) {
    const f = fixture(t); let server;
    if (variant === 'close') { server = net.createServer(socket => socket.destroy()); await new Promise(resolve => server.listen(f.d.ownerEndpoint, resolve)); resources(t).closers.push(() => new Promise(resolve => server.close(resolve))); }
    else {
      server = createIpcServer({ endpoint: f.d.ownerEndpoint, identity: variant === 'pins' ? { ...f.identity, packageHash: 'b'.repeat(64) } : f.identity,
        secret: variant === 'secret' ? 'b'.repeat(64) : f.d.controlToken, bootId: 'foreign', methods: ['core_status'], onRequest: () => null });
      await server.listen(); resources(t).closers.push(() => server.close());
    }
    const d = await driver(t, f); assert.equal((await d.call('core_status')).error.message, 'owner_unavailable'); assert.equal(d.observed.length, 0);
  }
});

test('immediate spawn error is handled once, stays latched, and unref is never called before spawn', async t => {
  const f = fixture(t, { files: { 'runtime/client-ipc.js': absenceModule('ipc_endpoint_absent') } }); let unrefs = 0;
  const d = await driver(t, f, () => { const child = new (require('node:events').EventEmitter)(); child.unref = () => { unrefs++; }; process.nextTick(() => child.emit('error', new Error('synthetic hidden spawn failure'))); return child; });
  assert.equal((await d.call('core_status')).error.message, 'owner_unavailable'); await d.call('core_status'); assert.equal(d.observed.length, 1); assert.equal(unrefs, 0);
});

test('postspawn authentication failure stops absence-only waiting and never retries launch', async t => {
  const f = fixture(t, { mode: 'wrongPins' }), d = await driver(t, f), started = performance.now();
  assert.equal((await d.call('core_status')).error.message, 'owner_unavailable'); assert.ok(performance.now() - started < 2500);
  assert.equal(d.observed.length, 1); assert.equal((await d.call('core_status')).error.message, 'owner_unavailable'); assert.equal(d.observed.length, 1);
});

test('two actual clients attach the bounded fixture winner; fixture election is not Core election evidence', async t => {
  const f = fixture(t, { delayMs: 250 }), a = thinChild(t, f), b = thinChild(t, f);
  const [one, two] = (await Promise.all([a.call('core_status'), b.call('core_status')])).map(value);
  assert.equal(one.pid, two.pid); assert.equal(one.bootId, two.bootId); assert.ok(lines(f.starts).length >= 1 && lines(f.starts).length <= 2);
  assert.ok(lines(a.report).filter(row => row.event === 'call').length <= 1); assert.ok(lines(b.report).filter(row => row.event === 'call').length <= 1);
});

test('accepted-call connection loss returns uncertainty with its original request id and never resends', async t => {
  const f = fixture(t, { mode: 'drop' }), d = await driver(t, f), response = await d.call('core_connect');
  assert.equal(response.error.message, 'ipc_outcome_uncertain'); assert.equal(response.error.data.outcome, 'unknown');
  await until(() => fs.existsSync(path.join(f.root, 'owner-stopped')));
  const calls = lines(f.calls).filter(row => row.method === 'core_connect'); assert.equal(calls.length, 1); assert.equal(calls[0].requestId, response.error.data.requestId); assert.equal(d.observed.length, 1);
});

test('authenticated attachment permits a later distinct startup after the owner closes', async t => {
  const f = fixture(t), d = await driver(t, f); await d.call('core_status'); assert.equal(d.observed.length, 1);
  await stopOwner(f); const next = await d.call('core_status');
  // The existing closed socket may report ipc_closed once; that request is not replayed.
  if (next.error) assert.ok(['ipc_closed', 'ipc_outcome_uncertain'].includes(next.error.message));
  const connected = next.error ? await d.call('core_status') : next; assert.equal(value(connected).method, 'core_status'); assert.equal(d.observed.length, 2);
});

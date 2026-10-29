'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const net = require('node:net');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
const { spawn } = require('node:child_process');
const filename = path.resolve(__dirname, '../tools/check-core4-endpoint.js');
const source = fs.readFileSync(filename, 'utf8');
const preload = path.join(__dirname, 'fixtures/endpoint-observation-preload.js');
const plain = value => JSON.parse(JSON.stringify(value));

function simulated({ event, cli = false, args = [], constructorError, connectError, destroyError } = {}) {
  const audit = { constructions: 0, connects: [], destroys: 0, cleared: 0, stdout: '', stderr: '', timers: new Map() };
  let socket;
  class Socket extends EventEmitter {
    constructor() { super(); audit.constructions++; if (constructorError) throw constructorError; socket = this; }
    connect(options) { audit.connects.push(plain(options)); if (connectError) throw connectError; if (event) event(this); }
    destroy() { audit.destroys++; if (destroyError) throw destroyError; this.emit('close'); }
    write() { assert.fail('application payload must never be written'); }
    end() { assert.fail('observer must destroy without sending payload'); }
  }
  const module = { exports: {} };
  const requireOnlyNet = id => { assert.equal(id, 'node:net'); return { Socket }; };
  requireOnlyNet.main = cli ? module : {};
  const process = { argv: ['node', filename, ...args], stdout: { write: text => { audit.stdout += text; } }, stderr: { write: text => { audit.stderr += text; } } };
  vm.runInNewContext(source, {
    module, require: requireOnlyNet, process,
    setTimeout(callback, delay) { assert.equal(delay, 1000); const token = {}; audit.timers.set(token, callback); return token; },
    clearTimeout(token) { if (audit.timers.delete(token)) audit.cleared++; }
  }, { filename });
  return { api: module.exports, audit, process, socket: () => socket, deadline() { for (const fn of [...audit.timers.values()]) fn(); } };
}
function checkReport(report, state, reason, code = null) {
  assert.deepEqual(Object.keys(report).sort(), ['schemaVersion', 'scope', 'observedAt', 'endpoint', 'method', 'timeoutMs', 'state', 'reason', 'osErrorCode', 'bindability', 'aeCapabilities', 'cepCapabilities', 'environmentPreflight', 'authority', 'liveProof'].sort());
  assert.equal(report.schemaVersion, 1);
  assert.equal(report.scope, 'fixed-endpoint-observation');
  assert.equal(new Date(report.observedAt).toISOString(), report.observedAt);
  assert.deepEqual(plain(report.endpoint), { host: '127.0.0.1', port: 3457, family: 4 });
  assert.equal(report.method, 'tcp-connect-zero-payload'); assert.equal(report.timeoutMs, 1000);
  assert.equal(report.state, state); assert.equal(report.reason, reason); assert.equal(report.osErrorCode, code);
  assert.equal(report.bindability, 'unverified'); assert.equal(report.aeCapabilities, 'unobserved'); assert.equal(report.cepCapabilities, 'unobserved');
  assert.equal(report.environmentPreflight, 'incomplete'); assert.equal(report.authority, false); assert.equal(report.liveProof, false);
}
const error = code => Object.assign(new Error('untrusted message must not escape'), { code });

test('[endpoint-observation] terminal events produce one bounded report and clean socket/timer', async t => {
  const cases = [
    ['connected', s => s.emit('connect'), 'occupied', 'connected', null],
    ['refused', s => s.emit('error', error('ECONNREFUSED')), 'absent', 'connection-refused', 'ECONNREFUSED'],
    ['other error', s => s.emit('error', error('EACCES')), 'unknown', 'socket-error', 'EACCES'],
    ['OS timeout', s => s.emit('error', error('ETIMEDOUT')), 'unknown', 'socket-error', 'ETIMEDOUT'],
    ['premature close', s => s.emit('close'), 'unknown', 'premature-close', null],
    ['deadline', null, 'unknown', 'deadline-exceeded', null],
    ['oversize code', s => s.emit('error', error('X'.repeat(65))), 'unknown', 'socket-error', null],
    ['unsafe code', s => s.emit('error', error('EACCES\nsecret')), 'unknown', 'socket-error', null],
    ['hostile code accessor', s => s.emit('error', { get code() { throw new Error('no'); } }), 'unknown', 'socket-error', null]
  ];
  for (const [name, event, state, reason, code] of cases) await t.test(name, async () => {
    const fixture = simulated({ event }); const pending = fixture.api.readCore4Endpoint();
    if (!event) fixture.deadline();
    const report = await pending; checkReport(report, state, reason, code);
    assert.equal(fixture.audit.constructions, 1); assert.equal(fixture.audit.connects.length, 1);
    assert.deepEqual(fixture.audit.connects[0], { host: '127.0.0.1', port: 3457, family: 4 });
    assert.equal(fixture.audit.destroys, 1); assert.equal(fixture.audit.timers.size, 0); assert.equal(fixture.audit.cleared, 1);
    assert.equal(fixture.socket().listenerCount('connect'), 0); assert.equal(fixture.socket().listenerCount('close'), 0); assert.equal(fixture.socket().listenerCount('error'), 0);
    fixture.socket().emit('connect'); fixture.socket().emit('close'); fixture.deadline();
    assert.equal(fixture.audit.destroys, 1); assert.equal(await pending, report);
    assert.ok(!JSON.stringify(report).includes('untrusted message'));
  });
});

test('[endpoint-observation] constructor/connect/cleanup exceptions fail closed without retries', async () => {
  for (const options of [{ constructorError: error('EMFILE') }, { connectError: error('EINVAL') }, { event: s => s.emit('connect'), destroyError: error('EIO') }]) {
    const fixture = simulated(options); const report = await fixture.api.readCore4Endpoint();
    checkReport(report, 'unknown', options.destroyError ? 'cleanup-error' : 'probe-exception', (options.constructorError || options.connectError || options.destroyError).code);
    assert.equal(fixture.audit.constructions, 1); assert.ok(fixture.audit.connects.length <= 1); assert.equal(fixture.audit.timers.size, 0);
  }
});

test('[endpoint-observation] first terminal event wins while queued socket errors remain guarded until close', async () => {
  const fixture = simulated(); const pending = fixture.api.readCore4Endpoint(); const socket = fixture.socket();
  socket.destroy = () => { fixture.audit.destroys++; };
  socket.emit('connect'); socket.emit('error', error('ECONNREFUSED')); socket.emit('connect'); fixture.deadline();
  checkReport(await pending, 'occupied', 'connected'); assert.equal(fixture.audit.destroys, 1);
  socket.emit('close'); assert.equal(socket.listenerCount('error'), 0); assert.equal(fixture.audit.timers.size, 0);
});

test('[endpoint-observation] public API accepts no options and import has no effects', async () => {
  const fixture = simulated(); assert.deepEqual(Object.keys(fixture.api), ['readCore4Endpoint']);
  assert.equal(fixture.api.readCore4Endpoint.length, 0); assert.equal(fixture.audit.constructions, 0);
  for (const arg of [undefined, { host: 'example.invalid', port: 3456 }, { result: 'PASS', transport: {} }]) await assert.rejects(fixture.api.readCore4Endpoint(arg), /accepts no arguments/);
  assert.equal(fixture.audit.constructions, 0); assert.equal(fixture.audit.timers.size, 0);
});

test('[endpoint-observation] CLI maps all observation outcomes and rejects every argument before probing', async () => {
  for (const [event, code] of [[s => s.emit('connect'), 2], [s => s.emit('error', error('ECONNREFUSED')), 0], [s => s.emit('close'), 3], [null, 3]]) {
    const fixture = simulated({ cli: true, event }); if (!event) fixture.deadline();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(fixture.process.exitCode, code); assert.equal(fixture.audit.stderr, '');
    const reports = fixture.audit.stdout.trim().split('\n'); assert.equal(reports.length, 1); assert.equal(JSON.parse(reports[0]).liveProof, false);
  }
  for (const args of [['--help'], ['--host', '127.0.0.1'], ['--port=3457'], ['http://127.0.0.1:3457'], ['--result=PASS'], ['']]) {
    const fixture = simulated({ cli: true, args });
    assert.equal(fixture.process.exitCode, 64); assert.deepEqual(JSON.parse(fixture.audit.stderr), { schemaVersion: 1, error: 'unexpected-arguments' });
    assert.equal(fixture.audit.stdout, ''); assert.equal(fixture.audit.constructions, 0); assert.equal(fixture.audit.timers.size, 0);
  }
});

async function child(port, cwd, args = []) {
  return new Promise((resolve, reject) => {
    const process = spawn(global.process.execPath, ['--require', preload, filename, ...args], {
      cwd, windowsHide: true, env: { ...global.process.env, NODE_OPTIONS: '', CORE4_ENDPOINT_TEST_PORT: String(port), CORE4_PORT: '1', CORE4_HOST: 'example.invalid', AE_BRIDGE_PORT: '1' }, stdio: ['ignore', 'pipe', 'pipe']
    });
    let stdout = '', stderr = ''; const deadline = setTimeout(() => { process.kill(); reject(new Error('fixture subprocess exceeded 5s')); }, 5000);
    process.stdout.on('data', data => { stdout += data; }); process.stderr.on('data', data => { stderr += data; });
    process.on('error', reject); process.on('close', (code, signal) => { clearTimeout(deadline); resolve({ code, signal, stdout, stderr, audit: JSON.parse(stderr.trim().split('\n').at(-1)) }); });
  });
}

test('[endpoint-observation] actual CLI uses only mapped ephemeral loopback, sends zero bytes and writes no files', async t => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'core4-endpoint-observation-'));
  t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
  const before = fs.readdirSync(cwd); const sockets = new Set(); let connections = 0, bytes = 0;
  const server = net.createServer(socket => { connections++; sockets.add(socket); socket.on('data', data => { bytes += data.length; }); socket.on('close', () => sockets.delete(socket)); });
  t.after(async () => { for (const socket of sockets) socket.destroy(); if (server.listening) await new Promise(resolve => server.close(resolve)); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port; assert.notEqual(port, 3457);
  const result = await child(port, cwd); assert.equal(result.code, 2); assert.equal(result.signal, null);
  checkReport(JSON.parse(result.stdout), 'occupied', 'connected'); assert.equal(result.audit.connects, 1); assert.equal(result.audit.filesystemWrites, 0);
  assert.deepEqual(result.audit.targets, [{ host: '127.0.0.1', port: 3457, family: 4 }]);
  for (const socket of sockets) await new Promise(resolve => socket.once('close', resolve));
  assert.equal(connections, 1); assert.equal(bytes, 0); assert.equal(sockets.size, 0);
  const invalid = await child(port, cwd, ['--port=1']); assert.equal(invalid.code, 64); assert.equal(invalid.audit.connects, 0); assert.equal(invalid.audit.filesystemWrites, 0); assert.equal(connections, 1);
  await new Promise(resolve => server.close(resolve));
  const refused = await child(port, cwd); assert.equal(refused.code, 0); checkReport(JSON.parse(refused.stdout), 'absent', 'connection-refused', 'ECONNREFUSED');
  assert.equal(refused.audit.connects, 1); assert.equal(refused.audit.filesystemWrites, 0);
  assert.deepEqual(fs.readdirSync(cwd), before);
  t.diagnostic(JSON.stringify({ fixtureBefore: { files: before, connections: 0, sockets: 0 }, fixtureAfter: { files: fs.readdirSync(cwd), connections, sockets: sockets.size, bytes, listener: server.listening }, production3457Connections: 0 }));
});

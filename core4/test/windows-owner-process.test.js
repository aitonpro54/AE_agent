'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), cp = require('node:child_process');
const { observeOwnerProcess, classifyOwnerProcess } = require('../runtime/windows-owner-process');
const SOURCE = fs.readFileSync(path.join(__dirname, '../runtime/windows-owner-process.js'), 'utf8');
const PID = 123456789, BIRTH = '639289581234567891', stamp = () => new Date().toISOString();
const record = (patch = {}) => ({ version: 1, pid: PID, status: 'present', birthTicks: BIRTH, executablePath: 'C:\\Program Files\\nodejs\\node.exe', observedAt: stamp(), ...patch });
const wire = value => Buffer.from(JSON.stringify(value)).toString('base64') + '\r\n';
function fixture(execFile, platform = 'win32', env = {}, profile = () => ({ homedir: 'C:\\Native\\Profile' })) {
  const module = { exports: {} };
  const context = vm.createContext({ module, Buffer, process: { platform, env: { SystemRoot: 'C:\\Windows', WINDIR: 'C:\\Windows', TEMP: 'C:\\Temp', TMP: 'C:\\Temp', ...env } },
    require(name) { if (name === 'node:path') return path; if (name === 'node:os') return { userInfo: profile }; if (name === 'node:child_process') return { execFile }; throw new Error('unexpected probe import'); } });
  vm.runInContext(SOURCE, context); return module.exports;
}
const refuses = value => assert.rejects(value, error => error.code === 'owner_process_probe_unavailable' && error.message === 'owner_process_probe_unavailable');

test('windows-owner-process fixed command queries exact env PID, preserves tick precision and projects no commandline or credentials', async () => {
  const calls = [], helper = fixture((executable, args, options, callback) => { calls.push({ executable, args, options }); callback(null, wire(record({ pid: Number(options.env.AE_CORE4_OWNER_PROCESS_PID) })), ''); });
  const first = await helper.observeOwnerProcess(PID), next = await helper.observeOwnerProcess(PID + 1);
  assert.equal(Object.isFrozen(first), true); assert.equal(first.birthTicks, BIRTH); assert.equal(typeof first.birthTicks, 'string'); assert.equal(next.pid, PID + 1);
  assert.equal(calls.length, 2); assert.deepEqual(calls[0].args, calls[1].args); assert.equal(calls[0].executable, 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe');
  assert.deepEqual(Array.from(calls[0].args.slice(0, 4)), ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command']);
  const query = calls[0].args[4];
  assert.ok(query.includes('Get-CimInstance -ClassName Win32_Process -Property ProcessId,CreationDate,ExecutablePath'));
  assert.ok(query.includes("-Filter ('ProcessId = '+$target.ToString(")); assert.ok(query.includes('.ToUniversalTime().Ticks.ToString('));
  assert.ok(!query.includes(String(PID))); assert.ok(!/CommandLine|ExecutionPolicy|EncodedCommand|Invoke-Expression|Get-Content|Get-Process|Stop-Process|hostname/i.test(query));
  const options = calls[0].options; assert.equal(options.shell, false); assert.equal(options.windowsHide, true); assert.equal(options.timeout, 4000); assert.equal(options.maxBuffer, 4096);
  assert.equal(options.env.AE_CORE4_OWNER_PROCESS_PID, String(PID)); assert.equal(options.env.NODE_OPTIONS, undefined); assert.equal(options.env.NODE_PATH, undefined);
  for (const key of ['PATH', 'HOMEDRIVE', 'HOMEPATH', 'LOGONSERVER', 'SYSTEMDRIVE', 'USERDOMAIN', 'USERNAME', 'NODE_V8_COVERAGE']) assert.equal(options.env[key], '');
  assert.equal(options.env.USERPROFILE, 'C:\\Native\\Profile');
  assert.equal(new Set(Object.keys(options.env).map(key => key.toUpperCase())).size, Object.keys(options.env).length);
  assert.equal(observeOwnerProcess.length, 1); assert.equal(classifyOwnerProcess.length, 2);
});

test('windows-owner-process successful explicit empty result alone is absent and unavailable executable path stays nullable', async () => {
  let value = record({ status: 'absent', birthTicks: null, executablePath: null });
  const helper = fixture((_exe, _args, _options, callback) => callback(null, wire(value), ''));
  assert.equal((await helper.observeOwnerProcess(PID)).status, 'absent');
  value = record({ executablePath: null }); assert.equal((await helper.observeOwnerProcess(PID)).executablePath, null);
});

test('windows-owner-process missing birth, wrong schema/PID, malformed wire and stale timestamps never become absence', async () => {
  let stdout, calls = 0; const helper = fixture((_e, _a, _o, callback) => { calls++; callback(null, stdout, ''); });
  const invalid = ['', '  \r\n', 'not-base64', 'QQ', 'A'.repeat(4100), Buffer.from([255]).toString('base64'), wire(null), wire([]),
    ...[record({ pid: PID + 1 }), record({ extra: true }), record({ version: 2 }), record({ birthTicks: null }), record({ birthTicks: Number(BIRTH) }),
      record({ birthTicks: '0639289581234567891' }), record({ birthTicks: '3155378976000000000' }), record({ birthTicks: '0' }), record({ birthTicks: '-1' }),
      record({ executablePath: '' }), record({ executablePath: 'relative.exe' }), record({ executablePath: '\\root-relative\\node.exe' }), record({ executablePath: 'C:\\bad\nnode.exe' }),
      record({ status: 'absent', birthTicks: BIRTH }), record({ status: 'absent', birthTicks: null, executablePath: 'C:\\node.exe' }),
      record({ observedAt: new Date(Date.now() - 6000).toISOString() }), record({ observedAt: new Date(Date.now() + 6000).toISOString() }), record({ observedAt: stamp().replace('Z', '+00:00') }),
      record({ observedAt: '2026-02-30T00:00:00.000Z' })].map(wire)];
  const missing = record(); delete missing.birthTicks; invalid.push(wire(missing));
  for (const value of invalid) { stdout = value; await refuses(helper.observeOwnerProcess(PID)); }
  assert.equal(calls, invalid.length);
});

test('windows-owner-process permission, stderr, timeout, maxBuffer and synchronous failures are sanitized without retry', async () => {
  const secret = 'synthetic credential must never escape'; let mode, calls = 0;
  const helper = fixture((_e, _a, _o, callback) => {
    calls++;
    if (mode === 'throw') throw new Error(secret);
    if (mode === 'stderr') { callback(null, wire(record()), secret); return; }
    if (mode === 'wrong-stderr') { callback(null, wire(record()), undefined); return; }
    const error = Object.assign(new Error(secret), { code: mode, killed: mode === 'ETIMEDOUT' }); callback(error, wire(record({ status: 'absent', birthTicks: null, executablePath: null })), '');
  });
  for (const value of ['EACCES', 'EPERM', 'ETIMEDOUT', 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER', 'throw', 'stderr', 'wrong-stderr']) { mode = value; await refuses(helper.observeOwnerProcess(PID)); }
  assert.equal(calls, 7);
});

test('windows-owner-process invalid PID, unsupported platform and caller probe options never execute a command', async () => {
  let calls = 0; const helper = fixture(() => { calls++; });
  for (const pid of [0, -1, 1.5, 0x100000000, Number.MAX_SAFE_INTEGER + 1, NaN, Infinity, String(PID), null, undefined, { pid: PID }]) await refuses(helper.observeOwnerProcess(pid));
  await refuses(helper.observeOwnerProcess(PID, { command: 'untrusted' }));
  await refuses(fixture(() => { calls++; }, 'linux').observeOwnerProcess(PID));
  await refuses(fixture(() => { calls++; }, 'win32', { SystemRoot: undefined }).observeOwnerProcess(PID));
  await refuses(fixture(() => { calls++; }, 'win32', {}, () => { throw Error('native profile unavailable'); }).observeOwnerProcess(PID));
  await refuses(fixture(() => { calls++; }, 'win32', {}, () => ({ homedir: 'relative' })).observeOwnerProcess(PID));
  assert.equal(calls, 0);
});

test('windows-owner-process native profile is the sole additional OS directory; inherited PATH/profile/options/secrets are ignored', async () => {
  let options;
  const helper = fixture((_e, _a, value, callback) => { options = value; callback(null, wire(record()), ''); }, 'win32', {
    USERPROFILE: 'C:\\Untrusted\\Profile', PATH: 'untrusted-path', Path: 'case-alias-path', NODE_OPTIONS: '--require untrusted', NODE_PATH: 'untrusted', TOKEN: 'synthetic-secret', NODE_V8_COVERAGE: 'C:\\Untrusted\\Coverage'
  });
  await helper.observeOwnerProcess(PID);
  assert.equal(options.env.USERPROFILE, 'C:\\Native\\Profile'); assert.equal(options.env.PATH, ''); assert.equal(options.env.Path, undefined);
  assert.equal(options.env.NODE_OPTIONS, undefined); assert.equal(options.env.NODE_PATH, undefined); assert.equal(options.env.TOKEN, undefined); assert.equal(options.env.NODE_V8_COVERAGE, '');
});

test('windows-owner-process classification is exact, fresh and precision-safe data only, never reclaim authority', () => {
  const expected = { pid: PID, birthTicks: BIRTH };
  assert.equal(Number(BIRTH), Number('639289581234567892'), 'fixture values collide as unsafe JavaScript numbers');
  assert.equal(classifyOwnerProcess(expected, record()), 'alive');
  assert.equal(classifyOwnerProcess(expected, record({ birthTicks: '639289581234567892' })), 'pid-reused');
  assert.equal(classifyOwnerProcess(expected, record({ status: 'absent', birthTicks: null, executablePath: null })), 'absent');
  for (const value of [record({ pid: PID + 1 }), record({ birthTicks: null }), record({ observedAt: new Date(Date.now() - 6000).toISOString() }), record({ extra: 'authority' }), null]) assert.equal(classifyOwnerProcess(expected, value), 'unknown');
  for (const value of [{ pid: 0, birthTicks: BIRTH }, { pid: PID, birthTicks: Number(BIRTH) }, { pid: PID, birthTicks: '3155378976000000000' }, { ...expected, reclaim: true }, null]) assert.equal(classifyOwnerProcess(value, record()), 'unknown');
  const accessor = Object.defineProperty({ ...expected }, 'birthTicks', { enumerable: true, get() { assert.fail('must not execute caller getters'); } }); assert.equal(classifyOwnerProcess(accessor, record()), 'unknown');
});

test('windows-owner-process actual Windows CIM self-PID read returns a frozen exact birth observation', { skip: process.platform !== 'win32', timeout: 7000 }, async () => {
  const observed = await observeOwnerProcess(process.pid);
  assert.equal(Object.isFrozen(observed), true); assert.equal(observed.pid, process.pid); assert.equal(observed.status, 'present');
  assert.match(observed.birthTicks, /^[1-9][0-9]+$/); assert.equal(classifyOwnerProcess({ pid: process.pid, birthTicks: observed.birthTicks }, observed), 'alive');
  if (observed.executablePath !== null) assert.equal(path.win32.normalize(observed.executablePath).toLowerCase(), path.win32.normalize(process.execPath).toLowerCase());
});

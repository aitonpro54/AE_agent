'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { observeStartOverInventory, observeStartOverStop } = require('../runtime/start-over-process');
const SOURCE = fs.readFileSync(path.join(__dirname, '../runtime/start-over-process.js'), 'utf8');
const BIRTH = '639292254253597850', OTHER_BIRTH = '639292254253597851', PID = 123456789;
const row = (patch = {}) => ({ pid: PID, name: 'AfterFX.exe', birthTicks: BIRTH, executablePath: 'C:\\Program Files\\Adobe\\AfterFX.exe', ...patch });
const envelope = (rows = [], patch = {}) => ({ version: 1, observedAt: new Date().toISOString(), rows, ...patch });
const wire = value => Buffer.from(JSON.stringify(value)).toString('base64') + '\r\n';
const refuses = value => assert.rejects(value, e => e.code === 'start_over_process_probe_unavailable' && e.message === 'start_over_process_probe_unavailable');
function fixture(execFile, { platform = 'win32', env = {}, profile = () => ({ homedir: 'C:\\Native\\Profile' }) } = {}) {
  const module = { exports: {} }, context = vm.createContext({ module, Buffer, process: { platform, env: { SystemRoot: 'C:\\Windows', TEMP: 'C:\\Temp', ...env } },
    require(name) { if (name === 'node:path') return path; if (name === 'node:os') return { userInfo: profile, hostname: () => 'test-machine' }; if (name === 'node:child_process') return { execFile }; throw Error('unexpected import'); } });
  vm.runInContext(SOURCE, context);
  return { inventory: (...args) => module.exports.observeStartOverInventory(...args), stop(value) { context.input = JSON.stringify(value); return vm.runInContext('module.exports.observeStartOverStop(JSON.parse(input))', context); } };
}
const expected = (patch = {}) => ({ pid: PID, birthTicks: BIRTH, ...patch });
const request = (patch = {}) => ({ actors: [expected({ pid: PID + 1 })], ae: [expected()], ...patch });

test('start-over-process one fixed CIM query inventories all AE and exact actor PIDs without executable commands from caller', async () => {
  const calls = [], helper = fixture((exe, args, options, cb) => { calls.push({ exe, args, options }); cb(null, wire(envelope([row()])), ''); });
  const result = await helper.stop(request());
  assert.equal(result.actors[0].state, 'absent'); assert.equal(result.ae[0].state, 'alive'); assert.equal(result.allObservedIncarnationsGone, false);
  assert.equal(result.inventory.processes.length, 1); assert.equal(result.inventory.machineId, 'test-machine'); assert.equal(result.aeAuthority, false); assert.equal(result.resetPermit, false);
  assert.equal(calls.length, 1); const { exe, args, options } = calls[0];
  assert.equal(exe, 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe'); assert.equal(options.shell, false); assert.equal(options.windowsHide, true); assert.equal(options.timeout, 4000); assert.equal(options.maxBuffer, 65536);
  assert.equal(options.env.AE_CORE4_START_OVER_PIDS, PID + ',' + (PID + 1));
  const query = args[4]; assert.ok(query.includes("Name = 'AfterFX.exe'")); assert.ok(query.includes('Get-CimInstance -ClassName Win32_Process -Property ProcessId,Name,CreationDate,ExecutablePath'));
  assert.ok(!query.includes(String(PID))); assert.ok(!/CommandLine|EncodedCommand|ExecutionPolicy|Invoke-Expression|Get-Content|Stop-Process|Terminate/i.test(query));
  assert.equal(Object.isFrozen(result) && Object.isFrozen(result.inventory.processes[0]) && Object.isFrozen(result.actors[0]), true);
});
test('start-over-process explicit successful zero-row envelope means absent while empty or partial wire never does', async () => {
  let stdout = wire(envelope()); const helper = fixture((_e, _a, _o, cb) => cb(null, stdout, ''));
  assert.equal((await helper.inventory()).processes.length, 0); assert.equal((await helper.stop(request())).allObservedIncarnationsGone, true);
  for (const value of ['', '\r\n', 'QQ', 'not-base64', 'A'.repeat(65540), Buffer.from([255]).toString('base64'), wire({ version: 1, rows: [] }), wire(null), wire([])]) { stdout = value; await refuses(helper.inventory()); }
});
test('start-over-process missing nullable AE executable birth duplicate PID unexpected process and stale envelope fail closed', async () => {
  let stdout; const helper = fixture((_e, _a, _o, cb) => cb(null, stdout, ''));
  const invalid = [envelope([row({ executablePath: null })]), envelope([row({ executablePath: 'relative.exe' })]), envelope([row({ executablePath: 'C:\\node.exe' })]), envelope([row({ birthTicks: null })]), envelope([row({ birthTicks: Number(BIRTH) })]), envelope([row({ birthTicks: '0' })]), envelope([row({ birthTicks: '3155378976000000000' })]), envelope([row(), row()]), envelope([row({ name: 'node.exe' })]), envelope([row({ extra: true })]), envelope([row({ pid: 0 })]), envelope([row({ name: 'AfterFX.exe\n' })]), envelope([], { observedAt: new Date(Date.now() - 7000).toISOString() }), envelope([], { observedAt: new Date(Date.now() + 7000).toISOString() }), envelope([], { observedAt: '2026-02-30T00:00:00.000Z' }), envelope([], { version: 2 }), envelope([], { complete: true })];
  for (const value of invalid) { stdout = wire(value); await refuses(helper.inventory()); }
});
test('start-over-process PID reuse preserves ticks beyond Number precision and old native AE may differ from current inventory', async () => {
  assert.equal(Number(BIRTH), Number(OTHER_BIRTH));
  const helper = fixture((_e, _a, _o, cb) => cb(null, wire(envelope([row({ birthTicks: OTHER_BIRTH }), row({ pid: PID + 2 })])), ''));
  const result = await helper.stop(request({ ae: [expected(), expected({ birthTicks: OTHER_BIRTH }), expected({ pid: PID + 3 })] }));
  assert.deepEqual(Array.from(result.ae, p => p.state), ['pid-reused', 'alive', 'absent']); assert.equal(result.inventory.processes.length, 2);
  assert.equal(result.ae[0].observedBirthTicks, OTHER_BIRTH); assert.equal(result.allObservedIncarnationsGone, false);
});
test('start-over-process current diagnostic owner cannot prove previous active producer or old AE gone', async () => {
  const helper = fixture((_e, _a, _o, cb) => cb(null, wire(envelope([row({ pid: PID + 1, name: 'node.exe', executablePath: null }), row()])), ''));
  const result = await helper.stop(request({ actors: [expected({ pid: PID + 1 }), expected({ pid: PID + 2 })] }));
  assert.deepEqual(Array.from(result.actors, p => p.state), ['alive', 'absent']); assert.equal(result.ae[0].state, 'alive'); assert.equal(result.allObservedIncarnationsGone, false);
});
test('start-over-process native query stderr permissions timeout and synchronous errors are sanitized once without retry', async () => {
  let mode, calls = 0; const secret = 'synthetic-secret';
  const helper = fixture((_e, _a, _o, cb) => { calls++; if (mode === 'throw') throw Error(secret); if (mode === 'stderr') cb(null, wire(envelope()), secret); else if (mode === 'missing-stderr') cb(null, wire(envelope()), undefined); else cb(Object.assign(Error(secret), { code: mode }), wire(envelope()), ''); });
  for (const value of ['throw', 'stderr', 'missing-stderr', 'EPERM', 'EACCES', 'ETIMEDOUT', 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER']) { mode = value; await refuses(helper.inventory()); }
  assert.equal(calls, 7);
});
test('start-over-process invalid scopes public probe injection PID-only or machine overrides cannot launch a native command', async () => {
  let calls = 0; const helper = fixture(() => { calls++; });
  for (const value of [{ actors: [], ae: [] }, request({ probe: 'injected' }), request({ ae: [{ pid: PID }] }), request({ actors: [expected({ birthTicks: Number(BIRTH) })] }), request({ ae: [expected(), expected()] }), request({ actors: [expected({ pid: 0 })] }), request({ ae: Array.from({ length: 33 }, (_, i) => expected({ pid: i + 1 })) }), request({ machineId: 'foreign' })]) await refuses(helper.stop(value));
  await refuses(helper.inventory({ probe: 'injected' })); await refuses(fixture(() => { calls++; }, { platform: 'linux' }).inventory());
  await refuses(fixture(() => { calls++; }, { env: { SystemRoot: undefined } }).inventory()); await refuses(fixture(() => { calls++; }, { profile: () => ({ homedir: 'relative' }) }).inventory());
  const accessor = Object.defineProperty(request(), 'ae', { enumerable: true, get() { assert.fail('must not execute getters'); } }); await refuses(observeStartOverStop(accessor));
  await refuses(observeStartOverStop(request(), { probe: 'injected' })); assert.equal(calls, 0);
  assert.equal(observeStartOverInventory.length, 0); assert.equal(observeStartOverStop.length, 1);
});
test('start-over-process fixed probe ignores inherited node flags profile PATH and credentials and zero targets are explicit', async () => {
  let options; const helper = fixture((_e, _a, value, cb) => { options = value; cb(null, wire(envelope()), ''); }, { env: { NODE_OPTIONS: '--require synthetic', NODE_PATH: 'synthetic', TOKEN: 'synthetic-secret', PATH: 'synthetic', Path: 'synthetic-alias', USERPROFILE: 'C:\\Wrong\\Profile' } });
  await helper.inventory(); assert.equal(options.env.USERPROFILE, 'C:\\Native\\Profile'); assert.equal(options.env.PATH, ''); assert.equal(options.env.Path, undefined); assert.equal(options.env.NODE_OPTIONS, undefined); assert.equal(options.env.NODE_PATH, undefined); assert.equal(options.env.TOKEN, undefined); assert.equal(options.env.AE_CORE4_START_OVER_PIDS, '-');
});
test('start-over-process actual Windows inventory is read-only complete native data and never a reset permit', { skip: process.platform !== 'win32', timeout: 7000 }, async () => {
  const result = await observeStartOverInventory(); assert.equal(Object.isFrozen(result) && Object.isFrozen(result.processes), true); assert.equal(result.version, 1);
  assert.equal(typeof result.machineId, 'string'); assert.ok(Number.isFinite(Date.parse(result.observedAt)));
  for (const p of result.processes) { assert.ok(Number.isSafeInteger(p.pid) && p.pid > 0); assert.match(p.birthTicks, /^[1-9][0-9]+$/); assert.equal(path.win32.basename(p.executablePath).toLowerCase(), 'afterfx.exe'); }
  assert.equal(Object.hasOwn(result, 'resetPermit'), false);
});
test('start-over-process actual Windows target filter distinguishes live self from an earlier birth of the same PID', { skip: process.platform !== 'win32', timeout: 12000 }, async () => {
  const earlier = await observeStartOverStop({ actors: [{ pid: process.pid, birthTicks: '1' }], ae: [] });
  assert.equal(earlier.actors[0].state, 'pid-reused'); assert.equal(earlier.allObservedIncarnationsGone, true); assert.equal(earlier.resetPermit, false);
  const live = await observeStartOverStop({ actors: [{ pid: process.pid, birthTicks: earlier.actors[0].observedBirthTicks }], ae: [] });
  assert.equal(live.actors[0].state, 'alive'); assert.equal(live.allObservedIncarnationsGone, false);
});

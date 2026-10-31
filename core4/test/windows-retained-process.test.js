'use strict';
// Disposable child processes only. No Core/CEP/AE endpoint or user process.
const test = require('node:test'), assert = require('node:assert/strict'), cp = require('node:child_process'), path = require('node:path'), fs = require('node:fs'), Module = require('node:module');
const api = require('../tools/windows-retained-process');
const { observeOwnerProcess } = require('../runtime/windows-owner-process');
async function target(t) {
  const child = cp.spawn(process.execPath, ['-e', 'process.stdout.write("ready");setInterval(()=>{},1000)'], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  t.after(() => { if (child.exitCode === null && child.signalCode === null) child.kill(); });
  await new Promise((resolve, reject) => { child.once('error', reject); child.stdout.once('data', resolve); });
  const observed = await observeOwnerProcess(child.pid);
  // CIM serializes creation time at microsecond precision; retained native
  // identity deliberately requires the complete GetProcessTimes value.
  const birth = cp.spawnSync(path.join(process.env.SystemRoot, 'System32/WindowsPowerShell/v1.0/powershell.exe'), ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', '[Console]::Out.Write((Get-Process -Id ' + child.pid + ').StartTime.ToUniversalTime().Ticks.ToString())'], { encoding: 'utf8', windowsHide: true, timeout: 5000 });
  assert.equal(birth.status, 0); assert.match(birth.stdout, /^[1-9][0-9]{0,18}$/);
  return { child, identity: { pid: observed.pid, birthTicks: birth.stdout, executablePath: observed.executablePath } };
}
test('windows-retained-process forged capabilities refuse without process calls', async () => {
  for (const cap of [{}, Object.freeze({}), { pid: process.pid }]) {
    await assert.rejects(api.inspectRetainedProcess(cap), /retained_process_capability/);
    await assert.rejects(api.stopRetainedProcess(cap, {}), /retained_process_capability/);
  }
});
test('windows-retained-process real handle observes exact child; EOF releases without termination', { skip: process.platform !== 'win32', timeout: 30000 }, async t => {
  const f = await target(t), cap = await api.retainProcess(f.identity); t.after(() => api.closeRetainedProcess(cap));
  assert.deepEqual(await api.inspectRetainedProcess(cap), { version: 1, state: 'alive', ...f.identity });
  api.closeRetainedProcess(cap); assert.equal(f.child.exitCode, null); assert.equal(f.child.signalCode, null);
  await assert.rejects(api.inspectRetainedProcess(cap), /retained_process_capability/);
  await assert.rejects(api.retainProcess({ ...f.identity, birthTicks: String(BigInt(f.identity.birthTicks) + 1n) }), /retained_process_outcome_unknown/);
});
test('windows-retained-process exact retained handle stops only fixture target once after private admission', { skip: process.platform !== 'win32', timeout: 30000 }, async t => {
  const f = await target(t), filename = path.resolve(__dirname, '../tools/windows-retained-process.js'), privatePermit = Object.freeze({});
  const mod = new Module(filename, module); mod.filename = filename; mod.paths = Module._nodeModulePaths(path.dirname(filename));
  // Only the private admission is synthetic; handle identity, stop and wait are native.
  mod.require = name => name === './legacy-owner-migration' ? { assertLegacyStopPermit(permit) { assert.equal(permit, privatePermit); } } : require(name);
  mod._compile(fs.readFileSync(filename, 'utf8'), filename); const native = mod.exports;
  const cap = await native.retainProcess(f.identity); t.after(() => native.closeRetainedProcess(cap));
  await assert.rejects(native.stopRetainedProcess(cap, {}), assert.AssertionError);
  assert.equal((await native.inspectRetainedProcess(cap)).state, 'alive');
  assert.equal((await native.stopRetainedProcess(cap, privatePermit)).state, 'stopped');
  assert.equal((await native.inspectRetainedProcess(cap)).state, 'exited');
  await assert.rejects(native.stopRetainedProcess(cap, privatePermit), /retained_process_no_replay/);
  assert.equal((await observeOwnerProcess(f.identity.pid)).status, 'absent');
});

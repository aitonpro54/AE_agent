'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const net = require('node:net');
const childProcess = require('node:child_process');
const { EventEmitter } = require('node:events');
const { hash } = require('../protocol/json');
const { CIM_QUERY, decodeCimWire, nodeHostObservation, probeWindows, hostIdentity } = require('../runtime/windows-reservation-provider');
const { buildPackage } = require('../tools/package-installable');
function wire(value) { return Buffer.from(JSON.stringify(value), 'utf8').toString('base64') + '\r\n'; }
function fixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'core4-cim-data-')), file = path.join(directory, 'Эффекты-🔬', 'AfterFX.exe'), bytes = Buffer.from('explicit offline executable identity fixture');
  fs.mkdirSync(path.dirname(file)); fs.writeFileSync(file, bytes);
  return { directory, file, bytes, record: { pid: 123456, birth: '2026-10-27T09:35:15.6028207Z', executablePath: file } };
}
function mockEndpoints(t) {
  const calls = [];
  t.mock.method(net, 'connect', options => { calls.push(options); const socket = new EventEmitter(); socket.destroy = () => {}; socket.setTimeout = () => socket; queueMicrotask(() => socket.emit('error', Object.assign(new Error('offline fixture absent'), { code: 'ECONNREFUSED' }))); return socket; });
  return calls;
}
test('windows-cim-probe fixed plaintext query projects only PID/birth/path and base64-encodes JSON data', () => {
  assert.ok(CIM_QUERY.startsWith('Get-CimInstance -ClassName Win32_Process -Property ProcessId,CreationDate,ExecutablePath -Filter "Name = \'AfterFX.exe\'" -ErrorAction Stop |'));
  assert.deepEqual([...CIM_QUERY.matchAll(/\$_\.([A-Za-z]+)/g)].map(m => m[1]), ['ProcessId', 'CreationDate', 'ExecutablePath']);
  assert.ok(CIM_QUERY.includes('.ToUniversalTime().ToString("o")')); assert.ok(CIM_QUERY.includes('| ConvertTo-Json -Depth 3 -Compress -ErrorAction Stop | ForEach-Object'));
  assert.ok(CIM_QUERY.includes('[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($_))'));
  assert.ok(!/\.ps1|EncodedCommand|ExecutionPolicy|Invoke-Expression|ScriptBlock|Get-Content|ReadAllText|CommandLine|Get-FileHash|hostname/i.test(CIM_QUERY));
  assert.equal(probeWindows.length, 0, 'no source/path/query parameters');
  const pkg = buildPackage(); assert.equal(pkg.files['runtime/windows-host-probe.ps1'], undefined); assert.ok(pkg.files['runtime/windows-reservation-provider.js']);
});
test('windows-cim-probe actual wrapper uses one literal query, Node hostname/hash/stat and preserves Unicode path and seven-digit birth', async t => {
  const f = fixture(), calls = [], endpoints = mockEndpoints(t);
  t.mock.method(os, 'hostname', () => 'Явный-offline-host');
  t.mock.method(childProcess, 'execFile', (executable, args, options, callback) => { calls.push({ executable, args, options }); queueMicrotask(() => callback(null, wire(f.record), '')); });
  const result = await probeWindows({ releaseDir: 'caller-data-must-not-enter-query' });
  assert.equal(calls.length, 1); assert.ok(path.isAbsolute(calls[0].executable)); assert.deepEqual(calls[0].args, ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', CIM_QUERY]);
  assert.equal(calls[0].options.windowsHide, true); assert.equal(calls[0].options.timeout, 4000); assert.ok(!Object.keys(calls[0].options.env).some(key => /TOKEN|SECRET|PASSWORD/.test(key)));
  assert.equal(result.hostname, 'Явный-offline-host'); assert.equal(result.processes[0].executablePath, f.file); assert.equal(result.processes[0].birth, f.record.birth); assert.equal(result.processes[0].executableHash, hash(f.bytes)); assert.equal(result.processes[0].executableLength, f.bytes.length);
  assert.equal(hostIdentity(result).aeProcessBirth, '2026-10-27T09:35:15.6028207Z'); assert.ok(Number.isFinite(Date.parse(result.observedAt))); assert.ok(Number.isFinite(result.completedAt));
  assert.deepEqual(endpoints.map(call => call.port).sort(), [3456, 8787]); assert.ok(result.endpoints.every(value => value.state === 'observed-absent'));
});
test('windows-cim-probe bounded canonical data decode handles arrays/Unicode/date and rejects malformed wire or projection fields', () => {
  const f = fixture(); assert.deepEqual(decodeCimWire(wire(f.record)), [f.record]); assert.deepEqual(decodeCimWire(wire([f.record, { ...f.record, pid: 654321 }])).map(r => r.pid), [123456, 654321]); assert.deepEqual(decodeCimWire(' \r\n'), []); assert.deepEqual(decodeCimWire(wire([])), []);
  const malformed = ['not base64', 'QQ', 'QQ==', 'A'.repeat(65540), Buffer.from([0xc3, 0x28]).toString('base64'), wire(null), wire({ ...f.record, CommandLine: 'must never be accepted' }), wire({ ...f.record, pid: 0 }), wire({ ...f.record, pid: 1.5 }), wire({ ...f.record, pid: 0x100000000 }), wire({ ...f.record, birth: '2026-10-27T09:35:15.602Z' }), wire({ ...f.record, birth: '2026-02-30T09:35:15.6028207Z' }), wire({ ...f.record, birth: '2026-10-27T09:35:15.6028207+00:00' }), wire({ ...f.record, executablePath: 'relative/AfterFX.exe' }), wire({ ...f.record, executablePath: 'C:\\bad\u0000path.exe' }), wire({ ...f.record, executablePath: 'C:\\' + 'я'.repeat(8193) }), wire(Array.from({ length: 17 }, () => f.record))];
  malformed.push('\u2028', wire({ ...f.record, executablePath: '\\root-relative\\AfterFX.exe' }));
  for (const value of malformed) assert.throws(() => decodeCimWire(value), error => error.code === 'host_probe_failed');
  assert.throws(() => hostIdentity({ version: 1, hostname: 'fixture', processes: [] }), /ambiguous_ae_process/); assert.throws(() => hostIdentity({ version: 1, hostname: 'fixture', processes: [f.record, f.record] }), /ambiguous_ae_process/);
});
test('windows-cim-probe cmdlet, CLM, AppControl and invalid data failures are host_probe_failed with no fallback query', async t => {
  const endpoints = mockEndpoints(t), f = fixture(); let calls = 0, failure;
  t.mock.method(childProcess, 'execFile', (executable, args, options, callback) => { calls++; assert.equal(args.at(-1), CIM_QUERY); queueMicrotask(() => failure(callback)); });
  for (const variant of [cb => cb(Object.assign(new Error('restricted fixture'), { code: 'EACCES' }), '', ''), cb => cb(null, wire(f.record), 'ConstrainedLanguage fixture refusal'), cb => cb(null, 'invalid data fixture', '')]) { failure = variant; await assert.rejects(probeWindows(), error => error.code === 'host_probe_failed'); }
  assert.equal(calls, 3); assert.equal(endpoints.length, 0);
});
test('windows-cim-probe Node executable identity rejects unreadable/non-file/changed executable data', t => {
  const f = fixture(); assert.throws(() => nodeHostObservation([{ ...f.record, executablePath: f.directory }]), error => error.code === 'host_probe_failed'); assert.throws(() => nodeHostObservation([{ ...f.record, executablePath: path.join(f.directory, 'missing.exe') }]), error => error.code === 'host_probe_failed');
  const stat = fs.statSync; let count = 0; t.mock.method(fs, 'statSync', file => { const value = stat(file); return ++count === 2 ? Object.assign(Object.create(value), { mtimeMs: value.mtimeMs + 1 }) : value; });
  assert.throws(() => nodeHostObservation([f.record]), error => error.code === 'host_probe_failed');
});
test('windows-cim-probe synchronous process refusal is host_probe_failed and never retries', async t => {
  const endpoints = mockEndpoints(t); let calls = 0;
  t.mock.method(childProcess, 'execFile', () => { calls++; throw Object.assign(new Error('explicit offline process refusal'), { code: 'EACCES' }); });
  await assert.rejects(probeWindows(), error => error.code === 'host_probe_failed'); assert.equal(calls, 1); assert.equal(endpoints.length, 0);
});

'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { createWindowsReservationProvider, hostIdentity } = require('../runtime/windows-reservation-provider');
const { validateReadoptionObservation } = require('../tools/stopped-host-readoption-transaction');
test('readoption-probe H02 local freshness/endpoints validator matches runtime adoption boundaries', async t => {
  const now = Date.parse('2026-10-31T12:00:00.000Z'); t.mock.method(Date, 'now', () => now);
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'core4-readoption-parity-')); t.after(() => { assert.ok(path.resolve(base) === base && base.startsWith(path.join(os.tmpdir(), 'core4-readoption-parity-'))); fs.rmSync(base, { recursive: true, force: true }); });
  const original = { version: 1, hostname: os.hostname(), observedAt: new Date(now).toISOString(), completedAt: now, processes: [{ pid: 424242, birth: '2026-10-31T00:00:00.0000000Z', executablePath: path.join(base, 'AfterFX.exe'), executableHash: '5'.repeat(64) }], endpoints: [{ port: 3456, state: 'observed-absent' }, { port: 8787, state: 'observed-absent' }] }, expected = hostIdentity(original);
  const corpus = [
    ['fresh', x => x], ['at-5000', x => ({ ...x, observedAt: new Date(now - 5000).toISOString() })], ['past-5001', x => ({ ...x, observedAt: new Date(now - 5001).toISOString() })],
    ['future-1000', x => ({ ...x, observedAt: new Date(now + 1000).toISOString() })], ['future-1001', x => ({ ...x, observedAt: new Date(now + 1001).toISOString() })],
    ['complete-at-5000', x => ({ ...x, completedAt: now - 5000 })], ['complete-past-5001', x => ({ ...x, completedAt: now - 5001 })], ['future-completed-is-supported', x => ({ ...x, completedAt: now + 99999 })],
    ['missing-completed', x => { delete x.completedAt; return x; }], ['nan-completed', x => ({ ...x, completedAt: NaN })], ['invalid-date', x => ({ ...x, observedAt: 'not-a-date' })],
    ['reversed', x => ({ ...x, endpoints: [...x.endpoints].reverse() })], ['duplicate', x => ({ ...x, endpoints: [x.endpoints[0], x.endpoints[0]] })], ['missing-port', x => ({ ...x, endpoints: [x.endpoints[0]] })],
    ['active-port', x => ({ ...x, endpoints: [{ port: 3456, state: 'active' }, x.endpoints[1]] })], ['unknown-port', x => ({ ...x, endpoints: [x.endpoints[0], { port: 8787, state: 'unknown' }] })],
    ['ambiguous-AE', x => ({ ...x, processes: [...x.processes, x.processes[0]] })], ['changed-host', x => ({ ...x, hostname: 'other-offline-machine' })]
  ];
  for (const [index, [label, transform]] of corpus.entries()) {
    const actual = transform(structuredClone(original)), installation = { installationId: 'fixture-parity', machineId: original.hostname, stateDir: path.join(base, String(index)) };
    let local = 'accepted', runtime = 'accepted';
    try { validateReadoptionObservation(actual, expected, installation.machineId); } catch (e) { local = e.code; }
    try { await createWindowsReservationProvider({ installation, probe: async () => actual }).adopt({ expected, allowedProject: path.join(base, 'copy.aep'), rootObservationDigest: '6'.repeat(64) }); } catch (e) { runtime = e.code; }
    assert.equal(local, runtime, label);
  }
});

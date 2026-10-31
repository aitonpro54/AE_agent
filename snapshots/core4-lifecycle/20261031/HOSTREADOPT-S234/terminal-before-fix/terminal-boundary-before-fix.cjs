'use strict';
// Offline TEMP regression probe, outside all frozen Core dependency paths.
// PASS here proves the existing defect with expected refusals, not a fixed flow.
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const { harness } = require('C:/Users/Ant/Documents/Codex/AE_agent_core/core4/test/fixtures/stopped-host-readoption');
const dir = __dirname, report = { classification: 'offline-TEMP-existing-defect-probe', actualInstallation: false, endpoint3457: false, cases: [] };
const fields = ['dev', 'ino', 'mode', 'nlink', 'size', 'birthtimeNs', 'mtimeNs', 'ctimeNs'];
function fact(file) {
  const b = fs.readFileSync(file), s = fs.statSync(file, { bigint: true });
  return { hash: crypto.createHash('sha256').update(b).digest('hex'), stat: Object.fromEntries(fields.map(k => [k, String(s[k])])) };
}
test('terminal existing defect: settled live finisher, new startup gate and new ready owner stay untouched', async t => {
  const h = await harness(t, { hostAdoption: true }), pre = await h.inspect();
  await h.api.applyStoppedReadoption({ ...h.options, expectedProofHash: pre.proofHash, witness: h.witness });
  h.nextActor(); const applied = await h.inspect();
  assert.equal((await h.api.enableStoppedReadoption({ ...h.options, expectedProofHash: applied.proofHash })).phase, 'enabled');
  const enable = JSON.parse(fs.readFileSync(h.path('readopt-enable-intent.json'))).body;
  const gate = path.join(h.f.root, 'install.lock'), anchor = path.join(h.f.root, 'transactions', 'readopt-preparation-' + enable.preparation.id, 'install-gate');
  const anchorBefore = fact(anchor), adoption = fact(h.adoptionPath), intent = fact(h.path('readopt-enable-intent.json')), receipt = fact(h.path('readopt-enabled.json'));
  async function refuses(name) {
    const before = h.f.snapshot(), writes = h.writes(); let failure;
    try { await h.inspect(); } catch (error) { failure = error.code; }
    assert.ok(failure, 'frozen source must reproduce the known terminal reader defect');
    assert.deepEqual(h.f.snapshot(), before); assert.equal(h.writes(), writes);
    assert.deepEqual(fact(h.adoptionPath), adoption); assert.deepEqual(fact(h.path('readopt-enable-intent.json')), intent); assert.deepEqual(fact(h.path('readopt-enabled.json')), receipt);
    report.cases.push({ name, failure, zeroWrites: true });
  }
  await refuses('enabled receipt with live original finisher');
  const owner = await h.f.create(), startup = fact(gate);
  assert.ok(startup.stat.dev !== anchorBefore.stat.dev || startup.stat.ino !== anchorBefore.stat.ino);
  assert.deepEqual(fact(anchor), anchorBefore);
  await refuses('new startup install gate is a foreign inode, zero original canonical role aliases');
  assert.deepEqual(fact(gate), startup);
  const stores = h.f.stores(owner); owner.markReady(); owner.releaseStartup();
  assert.equal(fs.existsSync(gate), false); assert.ok(fs.existsSync(h.f.path('runtime-owner.json')));
  assert.ok(fs.existsSync(h.f.path('broker/broker-owner.lock'))); assert.ok(fs.existsSync(h.f.path('receiver/owner')));
  await refuses('new ready owner markers after last original gate removal');
  report.ownAnchor = anchorBefore; report.foreignStartupGate = startup;
  report.originalGateAliasesAtStartup = 0; report.canonicalGatesAtStartup = 1; report.privateReservedServerListening = h.server.listening;
  fs.writeFileSync(path.join(dir, 'terminal-boundary-before-fix.report.json'), JSON.stringify(report, null, 2));
  h.f.close(owner, stores);
});


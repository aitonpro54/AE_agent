'use strict';
// Parent verification of the original final01 source-only baseline run.
// A confirmed terminal-read finding remains open. This is NOT source acceptance.
// No test replay or live access.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../../../..'), core = path.join(root, 'core4');
const incoming = path.resolve(process.argv[2] || ''), destination = path.join(__dirname, 'final01');
assert.ok(process.argv[2] && path.isAbsolute(process.argv[2]));
assert.equal(fs.realpathSync(incoming), incoming);
const names = ['capture.before.json', 'selection.before.json', 'capture.after.json', 'selection.after.json', 'validate-diff.raw.log'];
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const artifacts = Object.fromEntries(names.map(name => {
  const file = path.join(incoming, name), before = fs.lstatSync(file, { bigint: true });
  assert.ok(before.isFile() && !before.isSymbolicLink() && before.size <= 32n * 1024n * 1024n);
  assert.equal(fs.realpathSync(file), file);
  const bytes = fs.readFileSync(file), after = fs.lstatSync(file, { bigint: true });
  for (const key of ['dev', 'ino', 'size', 'mtimeNs', 'ctimeNs']) assert.equal(before[key], after[key]);
  assert.equal(bytes.length, Number(before.size));
  return [name, { bytes, sha256: digest(bytes) }];
}));
const json = name => JSON.parse(artifacts[name].bytes);
const before = json('capture.before.json'), after = json('capture.after.json');
const selectionBefore = json('selection.before.json'), selectionAfter = json('selection.after.json');
assert.equal(artifacts['capture.before.json'].sha256, 'a46857519f4c6d1af5c4a7dfc4dec6d9b51ae0608c721901aefd0b0d78885e23');
assert.equal(artifacts['selection.before.json'].sha256, '2d6529d15d3f68e06800363ab9a701f6f13ceecbaeafdbadec487b50d02aaf38');
assert.equal(artifacts['capture.after.json'].sha256, '01e477b289f25089545d058e8bd7c4735b32c866078fd171f4cd7895c6ea604f');
assert.equal(artifacts['selection.after.json'].sha256, '2d6529d15d3f68e06800363ab9a701f6f13ceecbaeafdbadec487b50d02aaf38');
assert.equal(artifacts['validate-diff.raw.log'].sha256, '3e8906b5a88afe5fbf6971fd2e0823314a36fa5059450c0e93cc8237c07a4b30');
assert.equal(after.exitCode, 0);
assert.equal(before.sourceFrozen, true); assert.equal(after.sourceFrozen, true);
for (const key of ['sourceHashes', 'dependencyHashes', 'checks', 'packageHash']) assert.deepEqual(before[key], after[key], key);
assert.deepEqual(selectionBefore, selectionAfter);
assert.equal(Object.keys(before.sourceHashes).length, 11);
const reviewed = JSON.parse(fs.readFileSync(path.join(__dirname, 'matrix-freeze-hashes.json'), 'utf8'));
reviewed['core4/test/stopped-host-readoption-recovery.test.js'] = 'd5c78ed000fe079ea2bdda3d6f3970f0d3ce638f74276cd02c9ca4ae78578321';
assert.deepEqual(before.sourceHashes, reviewed);
for (const fact of JSON.parse(fs.readFileSync(path.join(__dirname, 'review-freeze-03.json'), 'utf8')).facts) {
  assert.equal(before.sourceHashes[fact.file], fact.sha256, 'reviewed production source differs');
}
function currentHashes(entries, base) {
  for (const [relative, expected] of Object.entries(entries)) {
    assert.match(expected, /^[a-f0-9]{64}$/);
    const file = path.resolve(base, relative); assert.ok(file.startsWith(base + path.sep));
    assert.equal(digest(fs.readFileSync(file)), expected, relative);
  }
}
currentHashes(before.sourceHashes, root); currentHashes(before.dependencyHashes, core);
const current = require(path.join(core, 'tools/validate-diff')).selectChecks(Object.keys(before.sourceHashes), core);
assert.equal(current.checks.length, 12); assert.equal(selectionBefore.checks.length, 12); assert.equal(before.checks.length, 12);
for (const now of current.checks) {
  for (const rows of [selectionBefore.checks, before.checks]) {
    const saved = rows.find(value => value.check === now.check); assert.ok(saved);
    assert.equal(now.evidenceKey, saved.evidenceKey, now.check);
    assert.deepEqual(now.command, saved.command, now.check);
    assert.deepEqual(now.dependencies, saved.dependencies, now.check);
  }
}
// Both Node spec and TAP summaries are accepted; every selected batch must end
// with a complete zero-failure framework summary. No partial-tail acceptance.
const rawText = artifacts['validate-diff.raw.log'].bytes.toString('utf8');
assert.ok(rawText.replace(/\r\n/g, '\n').startsWith(JSON.stringify(selectionBefore, null, 2)), 'executed selector differs');
const expectedCounts = { 'validation-routing': 5, 'readoption-core': 13, 'readoption-recovery': 34,
  'readoption-enable': 11, 'readoption-probe': 1, 'stopped-host-readoption': 25, 'stopped-certification': 30,
  'stopped-update': 55, 'maintenance-finish-operator': 7, 'standalone-installer': 7, 'maintenance-finish': 32, 'owner-maintenance': 22 };
const summaries = [];
for (const line of rawText.split(/\r?\n/)) {
  const match = /^(?:ℹ|#) (tests|pass|fail|cancelled|skipped|todo|duration_ms) ([0-9]+(?:\.[0-9]+)?)$/.exec(line);
  if (!match) continue;
  if (match[1] === 'tests') summaries.push({ tests: Number(match[2]) });
  else {
    assert.ok(summaries.length, 'orphan test summary');
    const value = summaries[summaries.length - 1]; assert.ok(!Object.hasOwn(value, match[1]));
    value[match[1]] = Number(match[2]);
  }
}
assert.equal(selectionBefore.executionBatches.length, 12); assert.equal(summaries.length, 12);
const matrix = summaries.map((value, index) => {
  const batch = selectionBefore.executionBatches[index]; assert.equal(batch.checks.length, 1);
  assert.equal(value.tests, expectedCounts[batch.checks[0]], 'unexpected case count');
  assert.ok(value.tests > 0 && value.tests === value.pass);
  for (const key of ['fail', 'cancelled', 'skipped', 'todo']) assert.equal(value[key], 0);
  assert.ok(Number.isFinite(value.duration_ms) && value.duration_ms >= 0);
  const check = current.checks.find(row => row.check === batch.checks[0]); assert.ok(check);
  return { check: check.check, evidenceKey: check.evidenceKey, ...value };
});
const pkg = require(path.join(core, 'tools/package-installable')).buildPackage(undefined, 'manual', { runtimeModel: 'owner' });
assert.equal(pkg.packageHash, 'cc2f07132209317bed89a529109dc06036559e4328950e5c04ca1be273c7cfac');
assert.equal(pkg.packageHash, before.packageHash); assert.equal(Object.keys(pkg.files).length, 70);
fs.mkdirSync(destination, { recursive: true });
for (const [name, value] of Object.entries(artifacts)) {
  const file = path.join(destination, name);
  if (fs.existsSync(file)) assert.equal(digest(fs.readFileSync(file)), value.sha256, 'existing evidence differs: ' + name);
  else fs.writeFileSync(file, value.bytes, { flag: 'wx' });
}
const tests = matrix.reduce((sum, value) => sum + value.tests, 0);
const report = {
  collectedAt: new Date().toISOString(), recordContext: { purpose: 'development', lifetime: 'product_change' },
  currentSourceHashesMatched: 11, currentDependencyHashesMatched: Object.keys(before.dependencyHashes).length,
  sourceHashes: before.sourceHashes, currentCheckBindingsMatched: 12, matrix,
  coverage: { tests, pass: tests, fail: 0, cancelled: 0, skipped: 0, todo: 0 },
  runRole: 'pre-terminal-fix baseline', functionalAcceptance: false,
  knownOpenFinding: 'terminal read reasserts stopped markers/history after enabled receipt and original gate release',
  fullSelectedImmutableRun: true, releaseCertified: false, selectorRecomputedWithoutRunningTests: true,
  testsRepeatedByParent: false, sourceReview: 'historical bounded ACCEPT freeze03/test-map/P3; terminal-read correction pending',
  packageHash: pkg.packageHash, runtimePayloadFiles: 70, liveCalls: 0, installedWrites: 0,
  artifacts: Object.entries(artifacts).map(([name, value]) => ({ name, bytes: value.bytes.length, sha256: value.sha256 }))
};
fs.writeFileSync(path.join(destination, 'baseline-run-verification.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ evidenceVerified: true, functionalAcceptance: false, tests, pass: tests, fail: 0, checks: 12, packageHash: pkg.packageHash, testsRepeatedByParent: false }));

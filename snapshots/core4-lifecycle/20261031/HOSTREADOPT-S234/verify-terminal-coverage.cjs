'use strict';
// Parent verification only: current-key composition, no test replay/live access.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../../../..'), core = path.join(root, 'core4');
assert.ok(process.argv[2] && path.isAbsolute(process.argv[2]));
const incoming = path.resolve(process.argv[2]), destination = path.join(__dirname, 'final02');
assert.equal(fs.realpathSync(incoming), incoming);
const names = ['capture.before.json', 'capture.after.json', 'selection.before.json', 'selection.after.json',
  'run-selection.before.json', 'run-selection.after.json', 'reuse.before.json', 'reuse.after.json',
  'validate-diff.raw.log', 'supplemental.json', 'validation-routing.raw.log', 'validation-routing.exit.txt',
  'maintenance-finish-operator.raw.log', 'maintenance-finish-operator.exit.txt', 'prechecks.raw.log',
  'protected-source-package.raw.log', 'whitespace.json', 'capture.cjs'];
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const artifacts = Object.fromEntries(names.map(name => {
  const file = path.join(incoming, name), before = fs.lstatSync(file, { bigint: true });
  assert.ok(before.isFile() && !before.isSymbolicLink() && before.size <= 32n * 1024n * 1024n);
  assert.equal(fs.realpathSync(file), file);
  const bytes = fs.readFileSync(file), after = fs.lstatSync(file, { bigint: true });
  for (const key of ['dev', 'ino', 'size', 'mtimeNs', 'ctimeNs']) assert.equal(before[key], after[key]);
  assert.equal(bytes.length, Number(before.size)); return [name, { bytes, sha256: hash(bytes) }];
}));
const json = name => JSON.parse(artifacts[name].bytes);
const known = { 'capture.before.json': 'ee3ec55256c2bb503f4eea97357c1d48dcf6ce46420a59487c96b328c39ec850',
  'selection.before.json': 'f23461d8eeadd6bdabf4ea15d596b3d12e38528d0235e4d96471e52cf78ff18e',
  'run-selection.before.json': 'e5344d3d860372b15cf8ef0d891b9d701c3861bbce649b3aed99d6f16968fb52',
  'supplemental.json': '43dd4addcdc65c6e7ab07cbc0070de6b462ad72f280c0452d5389d32f1b1cd2e' };
Object.assign(known, { 'capture.after.json': 'b8aa392ca4e055eb425cef39c7ace979c1aba760fc5f823218fcb3e9c15e7223',
  'selection.after.json': 'f23461d8eeadd6bdabf4ea15d596b3d12e38528d0235e4d96471e52cf78ff18e',
  'run-selection.after.json': 'e5344d3d860372b15cf8ef0d891b9d701c3861bbce649b3aed99d6f16968fb52',
  'reuse.after.json': '818b1717450fc271c161fc0bfed47db7515f7e8c0f554df5a8f52992fe948f38',
  'validate-diff.raw.log': 'dca17be1df143eef2e93319793765661a6fd49fd22816f99582e3c225847de8f' });
for (const [name, expected] of Object.entries(known)) assert.equal(artifacts[name].sha256, expected, name);
const before = json('capture.before.json'), after = json('capture.after.json');
const full = json('selection.before.json'), run = json('run-selection.before.json'), extra = json('supplemental.json');
assert.equal(after.exitCode, 0); assert.equal(before.sourceFrozen, true); assert.equal(after.sourceFrozen, true);
for (const key of ['sourceHashes', 'dependencyHashes', 'checks', 'runChecks', 'deltaPaths', 'packageHash']) assert.deepEqual(before[key], after[key], key);
assert.deepEqual(full, json('selection.after.json')); assert.deepEqual(run, json('run-selection.after.json'));
const baseline = JSON.parse(fs.readFileSync(path.join(__dirname, 'final01/baseline-run-verification.json'), 'utf8'));
assert.equal(baseline.coverage.tests, 242); assert.equal(baseline.fullSelectedImmutableRun, true);
const expectedSource = { ...baseline.sourceHashes,
  'core4/tools/stopped-host-readoption-store.js': 'ea36f48db1c3895277bf6d4238fa485f8fc2a6c3b16ba0ff7fbeb715ee4ce6dc',
  'core4/tools/stopped-host-readoption-transaction.js': '1dbf2360947088bff61d60a6173771241616d9820202eb8afae0b9db63a54edd',
  'core4/test/stopped-host-readoption-enable.test.js': 'e8f590203071f14cda0fd09aac3225a8a7f881c72edd221fabae06cf607aac02' };
assert.deepEqual(before.sourceHashes, expectedSource);
for (const fact of JSON.parse(fs.readFileSync(path.join(__dirname, 'review-freeze-05.json'), 'utf8')).facts) assert.equal(before.sourceHashes[fact.file], fact.sha256);
function verifyHashes(entries, base) {
  for (const [relative, expected] of Object.entries(entries)) {
    assert.match(expected, /^[a-f0-9]{64}$/); const file = path.resolve(base, relative);
    assert.ok(file.startsWith(base + path.sep)); assert.equal(hash(fs.readFileSync(file)), expected, relative);
  }
}
verifyHashes(before.sourceHashes, root); verifyHashes(before.dependencyHashes, core);
const select = require(path.join(core, 'tools/validate-diff')).selectChecks;
const current = select(Object.keys(before.sourceHashes), core), delta = select(before.deltaPaths, core);
assert.equal(current.checks.length, 12); assert.equal(delta.checks.length, 5);
function binding(a, b) {
  assert.ok(a && b); assert.equal(a.evidenceKey, b.evidenceKey, a.check);
  assert.deepEqual(a.command, b.command, a.check); assert.deepEqual(a.dependencies, b.dependencies, a.check);
}
for (const check of current.checks) { binding(check, full.checks.find(v => v.check === check.check)); binding(check, before.checks.find(v => v.check === check.check)); }
for (const check of delta.checks) { binding(check, run.checks.find(v => v.check === check.check)); binding(check, before.runChecks.find(v => v.check === check.check)); binding(check, current.checks.find(v => v.check === check.check)); }
const expectedCounts = { 'validation-routing': 5, 'readoption-core': 13, 'readoption-recovery': 34,
  'readoption-enable': 22, 'readoption-probe': 1, 'stopped-host-readoption': 25, 'stopped-certification': 30,
  'stopped-update': 55, 'maintenance-finish-operator': 7, 'standalone-installer': 7, 'maintenance-finish': 32, 'owner-maintenance': 22 };
function summaries(text) {
  const rows = [];
  for (const line of text.split(/\r?\n/)) {
    const match = /^(?:ℹ|#) (tests|pass|fail|cancelled|skipped|todo|duration_ms) ([0-9]+(?:\.[0-9]+)?)$/.exec(line);
    if (!match) continue;
    if (match[1] === 'tests') rows.push({ tests: Number(match[2]) });
    else { assert.ok(rows.length); const row = rows[rows.length - 1]; assert.ok(!Object.hasOwn(row, match[1])); row[match[1]] = Number(match[2]); }
  }
  return rows;
}
function passing(row, check) {
  assert.ok(row); assert.equal(row.tests, expectedCounts[check]); assert.equal(row.pass, row.tests);
  for (const key of ['fail', 'cancelled', 'skipped', 'todo']) assert.equal(row[key], 0);
  assert.ok(Number.isFinite(row.duration_ms) && row.duration_ms >= 0);
}
const fresh = new Map(), raw = artifacts['validate-diff.raw.log'].bytes.toString('utf8');
assert.ok(raw.replace(/\r\n/g, '\n').startsWith(JSON.stringify(run, null, 2)));
const groups = summaries(raw); assert.equal(groups.length, 5); assert.equal(run.executionBatches.length, 5);
run.executionBatches.forEach((batch, index) => { assert.equal(batch.checks.length, 1); const check = batch.checks[0]; passing(groups[index], check); assert.ok(!fresh.has(check)); fresh.set(check, { check, ...groups[index], mode: 'current-delta-run' }); });
assert.equal(extra.globalBeforeSha256, artifacts['capture.before.json'].sha256); assert.equal(extra.checks.length, 2);
for (const entry of extra.checks) {
  binding(entry, current.checks.find(v => v.check === entry.check)); assert.equal(path.resolve(entry.cwd), core); assert.equal(entry.exitCode, 0);
  assert.ok(['validation-routing', 'maintenance-finish-operator'].includes(entry.check));
  assert.equal(artifacts[entry.rawLog].sha256, entry.rawLogSha256); assert.equal(artifacts[entry.exitArtifact].sha256, entry.exitArtifactSha256);
  assert.equal(artifacts[entry.exitArtifact].bytes.toString('utf8').trim(), '0');
  const rows = summaries(artifacts[entry.rawLog].bytes.toString('utf8')); assert.equal(rows.length, 1); passing(rows[0], entry.check);
  assert.equal(rows[0].tests, entry.tests); assert.equal(rows[0].pass, entry.pass); assert.equal(rows[0].fail, entry.fail);
  assert.ok(!fresh.has(entry.check)); fresh.set(entry.check, { check: entry.check, ...rows[0], mode: 'current-supplemental-shared-envelope' });
}
assert.equal(fresh.size, 7);
const matrix = current.checks.map(check => {
  if (fresh.has(check.check)) return { ...fresh.get(check.check), evidenceKey: check.evidenceKey };
  const old = baseline.matrix.find(v => v.check === check.check), oldDefinition = JSON.parse(fs.readFileSync(path.join(__dirname, 'final01/capture.before.json'), 'utf8')).checks.find(v => v.check === check.check);
  binding(check, oldDefinition); assert.ok(old && old.evidenceKey === check.evidenceKey); passing(old, check.check);
  return { ...old, mode: 'reused-unchanged-effective-closure', baseline: '../final01/baseline-run-verification.json' };
});
const reused = matrix.filter(v => v.mode === 'reused-unchanged-effective-closure').map(v => v.check).sort();
assert.deepEqual(reused, ['stopped-certification', 'stopped-update', 'standalone-installer', 'maintenance-finish', 'owner-maintenance'].sort());
const pkg = require(path.join(core, 'tools/package-installable')).buildPackage(undefined, 'manual', { runtimeModel: 'owner' });
assert.equal(pkg.packageHash, before.packageHash); assert.equal(pkg.packageHash, baseline.packageHash); assert.equal(Object.keys(pkg.files).length, 70);
const tests = matrix.reduce((sum, row) => sum + row.tests, 0); assert.equal(tests, 253);
fs.mkdirSync(destination, { recursive: true });
for (const [name, value] of Object.entries(artifacts)) {
  const file = path.join(destination, name); if (fs.existsSync(file)) assert.equal(hash(fs.readFileSync(file)), value.sha256, name);
  else fs.writeFileSync(file, value.bytes, { flag: 'wx' });
}
const report = { collectedAt: new Date().toISOString(), recordContext: { purpose: 'development', lifetime: 'product_change' },
  currentSourceHashesMatched: 11, currentDependencyHashesMatched: Object.keys(before.dependencyHashes).length,
  sourceHashes: before.sourceHashes, currentCheckBindingsMatched: 12, matrix,
  coverage: { tests, pass: tests, fail: 0, skipped: 0, cancelled: 0, todo: 0 },
  coverageKind: 'composed-current-selected-coverage', freshChecks: 7, reusedChecks: 5,
  freshChecksSharedFrozenEnvelope: true, fullSelectedImmutableRunClaimed: false, releaseCertified: false,
  sourceReview: 'ACCEPT terminal freeze05 and 11 new test cases; previous unchanged reviews retained',
  terminalFindingClosedInSource: true, actualOperatorAcceptance: false, cliDistributionAcceptance: false,
  selectorRecomputedWithoutRunningTests: true, testsRepeatedByParent: false,
  packageHash: pkg.packageHash, runtimePayloadFiles: 70, liveCalls: 0, installedWrites: 0,
  artifacts: Object.entries(artifacts).map(([name, value]) => ({ name, bytes: value.bytes.length, sha256: value.sha256 })) };
fs.writeFileSync(path.join(destination, 'accepted-evidence.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ acceptedSourceEvidence: true, pass: tests, checks: 12, fresh: 7, reused: 5, terminalFindingClosed: true, actualAcceptance: false, testsRepeatedByParent: false }));

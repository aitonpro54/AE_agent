'use strict';
// Parent-only source acceptance: batches are counted once, never per-check twice.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../../../..'), core = path.join(root, 'core4');
assert.ok(process.argv[2] && path.isAbsolute(process.argv[2])); const incoming = path.resolve(process.argv[2]);
assert.equal(fs.realpathSync(incoming), incoming); const destination = path.join(__dirname, 'final02');
const names = ['capture.before.json', 'capture.after.json', 'selection.before.json', 'selection.after.json',
  'run-selection.before.json', 'run-selection.after.json', 'reuse.before.json', 'reuse.after.json',
  'validate-diff.raw.log', 'result-summary.json', 'capture.cjs'];
const hash = b => crypto.createHash('sha256').update(b).digest('hex');
const artifacts = Object.fromEntries(names.map(name => {
  const file = path.join(incoming, name), a = fs.lstatSync(file, { bigint: true });
  assert.ok(a.isFile() && !a.isSymbolicLink() && a.size <= 32n * 1024n * 1024n); assert.equal(fs.realpathSync(file), file);
  const bytes = fs.readFileSync(file), b = fs.lstatSync(file, { bigint: true });
  for (const k of ['dev', 'ino', 'size', 'mtimeNs', 'ctimeNs']) assert.equal(a[k], b[k]);
  assert.equal(bytes.length, Number(a.size)); return [name, { bytes, sha256: hash(bytes) }];
}));
const known = { 'capture.before.json': 'b9cc2506ae3e2763d41fa162f94a6b878457b1bf20a66128761d5704c738a944',
  'capture.after.json': '6bd411b0fbd44450eae0908b7758ccf5e2b0f2c0d0d0404d63088e256e4b19e1',
  'selection.before.json': 'c72edd66782dd2d5acbc5eb0ef4a012055627d4efee68401a0e06e8b2228663d',
  'selection.after.json': 'c72edd66782dd2d5acbc5eb0ef4a012055627d4efee68401a0e06e8b2228663d',
  'run-selection.before.json': '2fcbf3cbe6688c8a49015f20c2165f297c070a53b7a8278f88b501e01d7a8991',
  'run-selection.after.json': '2fcbf3cbe6688c8a49015f20c2165f297c070a53b7a8278f88b501e01d7a8991',
  'reuse.after.json': '64a9c22539ea8f56f0495b2b093ecd16c0088bd751d58d4e8a561b7b6327aaa6',
  'validate-diff.raw.log': '4722d3fd4175215a21c7622bb16bd0b9a3d644ca85174869b99cc63877c3018a',
  'result-summary.json': '37d8fb343d25be0ceb9adbfb7d169297838ca86a8302bde4de5e6e8a534a61f8' };
for (const [name, value] of Object.entries(known)) assert.equal(artifacts[name].sha256, value, name);
const json = name => JSON.parse(artifacts[name].bytes), before = json('capture.before.json'), after = json('capture.after.json');
const full = json('selection.before.json'), run = json('run-selection.before.json'), writer = json('result-summary.json');
assert.equal(after.exitCode, 0);
for (const key of ['sourceFiles', 'cliPaths', 'sourceHashes', 'dependencyHashes', 'checks', 'runChecks', 'packageHash', 'runtimePayloadFiles', 'distributionHash', 'distributionFiles']) assert.deepEqual(before[key], after[key], key);
assert.deepEqual(full, json('selection.after.json')); assert.deepEqual(run, json('run-selection.after.json'));
const baselineDir = path.join(__dirname, '../HOSTREADOPT-S234/final02');
const baseline = JSON.parse(fs.readFileSync(path.join(baselineDir, 'accepted-evidence.json'), 'utf8'));
const baselineDefinitions = JSON.parse(fs.readFileSync(path.join(baselineDir, 'capture.before.json'), 'utf8'));
const review = JSON.parse(fs.readFileSync(path.join(__dirname, 'review-freeze-02.json'), 'utf8'));
const expectedSource = { ...baseline.sourceHashes, ...Object.fromEntries(review.facts.map(v => [v.file, v.sha256])) };
assert.equal(Object.keys(expectedSource).length, 16); assert.deepEqual(before.sourceHashes, expectedSource);
assert.equal(new Set(before.sourceFiles).size, 16); assert.deepEqual([...before.sourceFiles].sort(), Object.keys(expectedSource).sort());
assert.deepEqual([...before.cliPaths].sort(), review.facts.map(v => v.file).sort());
function verifyHashes(entries, base) {
  for (const [relative, expected] of Object.entries(entries)) {
    assert.match(expected, /^[a-f0-9]{64}$/); const file = path.resolve(base, relative); assert.ok(file.startsWith(base + path.sep));
    assert.equal(hash(fs.readFileSync(file)), expected, relative);
  }
}
verifyHashes(before.sourceHashes, root); verifyHashes(before.dependencyHashes, core); assert.equal(Object.keys(before.dependencyHashes).length, 139);
const select = require(path.join(core, 'tools/validate-diff')).selectChecks;
const current = select(before.sourceFiles, core), delta = select(before.cliPaths, core);
assert.equal(current.checks.length, 19); assert.equal(delta.checks.length, 10);
function binding(a, b) { assert.ok(a && b); assert.equal(a.evidenceKey, b.evidenceKey, a.check); assert.deepEqual(a.command, b.command, a.check); assert.deepEqual(a.dependencies, b.dependencies, a.check); }
for (const c of current.checks) { binding(c, full.checks.find(v => v.check === c.check)); binding(c, before.checks.find(v => v.check === c.check)); }
for (const c of delta.checks) { binding(c, run.checks.find(v => v.check === c.check)); binding(c, before.runChecks.find(v => v.check === c.check)); binding(c, current.checks.find(v => v.check === c.check)); }
assert.deepEqual(delta.executionBatches, run.executionBatches);
const raw = artifacts['validate-diff.raw.log'].bytes.toString('utf8'); assert.ok(raw.replace(/\r\n/g, '\n').startsWith(JSON.stringify(run, null, 2)));
let pendingNames = []; const summaries = [];
for (const line of raw.split(/\r?\n/)) {
  const name = /^\s*✔ (.*?) \([0-9]+(?:\.[0-9]+)?ms\)$/.exec(line); if (name) pendingNames.push(name[1]);
  const m = /^(?:ℹ|#) (tests|pass|fail|cancelled|skipped|todo|duration_ms) ([0-9]+(?:\.[0-9]+)?)$/.exec(line);
  if (!m) continue;
  if (m[1] === 'tests') { summaries.push({ tests: Number(m[2]), testNames: pendingNames }); pendingNames = []; }
  else { assert.ok(summaries.length); const row = summaries[summaries.length - 1]; assert.ok(!Object.hasOwn(row, m[1])); row[m[1]] = Number(m[2]); }
}
assert.equal(summaries.length, 9); assert.equal(run.executionBatches.length, 9); assert.equal(pendingNames.length, 0);
const expectedCounts = [17, 9, 4, 7, 7, 18, 9, 12, 21], freshBindings = new Map();
const batches = summaries.map((row, index) => {
  const batch = run.executionBatches[index]; assert.equal(row.tests, expectedCounts[index]); assert.equal(row.pass, row.tests);
  for (const key of ['fail', 'cancelled', 'skipped', 'todo']) assert.equal(row[key], 0);
  assert.equal(row.testNames.length, row.tests); assert.equal(new Set(row.testNames).size, row.tests);
  assert.ok(Number.isFinite(row.duration_ms) && row.duration_ms >= 0);
  for (const id of batch.checks) { assert.ok(!freshBindings.has(id)); const c = current.checks.find(v => v.check === id); assert.ok(c); freshBindings.set(id, { check: id, evidenceKey: c.evidenceKey, executionBatch: index }); }
  return { executionBatch: index, ...batch, ...row };
});
assert.equal(freshBindings.size, 10);
const shared = batches.find(v => v.checks.length > 1); assert.ok(shared); assert.deepEqual(shared.checks, ['validation-routing', 'artifact-boundaries']);
const routing = shared.testNames.filter(v => /validation-routing/.test(v)), boundaries = shared.testNames.filter(v => /artifact-boundaries/.test(v));
const intersection = routing.filter(v => boundaries.includes(v)); assert.equal(routing.length, 5); assert.equal(boundaries.length, 5); assert.equal(intersection.length, 1); assert.equal(new Set([...routing, ...boundaries]).size, 9);
const reused = [];
for (const c of current.checks) {
  if (freshBindings.has(c.check)) continue;
  const old = baseline.matrix.find(v => v.check === c.check), definition = baselineDefinitions.checks.find(v => v.check === c.check);
  binding(c, definition); assert.ok(old && old.evidenceKey === c.evidenceKey); assert.equal(old.tests, old.pass);
  for (const key of ['fail', 'cancelled', 'skipped', 'todo']) assert.equal(old[key], 0);
  for (const file of definition.dependencies) if (Object.hasOwn(baselineDefinitions.dependencyHashes, file)) assert.equal(hash(fs.readFileSync(path.join(core, file))), baselineDefinitions.dependencyHashes[file], file);
  reused.push({ ...old, mode: 'reused-unchanged-effective-closure', baseline: '../HOSTREADOPT-S234/final02/accepted-evidence.json' });
}
assert.equal(reused.length, 9); assert.equal(reused.reduce((n, v) => n + v.tests, 0), 234);
// Global grouping must not hide a case shared across fresh and reused partitions.
for (const batch of current.executionBatches) assert.equal(new Set(batch.checks.map(id => freshBindings.has(id))).size, 1);
const freshTests = batches.reduce((n, v) => n + v.tests, 0); assert.equal(freshTests, 104);
const uniqueTests = freshTests + reused.reduce((n, v) => n + v.tests, 0); assert.equal(uniqueTests, 338);
const bundle = require(path.join(core, 'tools/package-standalone-installer')).buildStandalone(undefined, 'manual', { runtimeModel: 'owner' });
assert.equal(bundle.packageHash, baseline.packageHash); assert.equal(bundle.packageHash, before.packageHash); assert.equal(before.runtimePayloadFiles, 70);
assert.equal(bundle.distributionHash, before.distributionHash); assert.equal(bundle.distributionHash, 'c787e0134941086fdbf7b1b15ebb16ee6b0684fbaab85ecb586a0958a602e81d');
assert.equal(Object.keys(bundle.files).length, 87); assert.equal(before.distributionFiles, 87);
assert.equal(writer.totalUniqueTests, uniqueTests); assert.equal(writer.freshUniqueTests, freshTests); assert.equal(writer.pass, uniqueTests); assert.equal(writer.fail, 0); assert.deepEqual(writer.sourceHashes, before.sourceHashes);
fs.mkdirSync(destination, { recursive: true });
for (const [name, value] of Object.entries(artifacts)) { const file = path.join(destination, name); if (fs.existsSync(file)) assert.equal(hash(fs.readFileSync(file)), value.sha256, name); else fs.writeFileSync(file, value.bytes, { flag: 'wx' }); }
const report = { collectedAt: new Date().toISOString(), recordContext: { purpose: 'development', lifetime: 'product_change' },
  currentSourceHashesMatched: 16, currentDependencyHashesMatched: 139, sourceHashes: before.sourceHashes,
  currentCheckBindingsMatched: 19, freshCheckBindings: [...freshBindings.values()], freshExecutionBatches: batches,
  reusedChecks: reused, coverage: { uniqueTests, pass: uniqueTests, fail: 0, skipped: 0, cancelled: 0, todo: 0 },
  freshUniqueTests: freshTests, reusedUniqueTests: 234, perCheckPassAssignments: 339,
  sharedCaseCountedOnce: intersection[0], coverageKind: 'batch-aware-composed-current-selected-coverage',
  fullGlobalCommandPassClaimed: false, releaseCertified: false, sourceReview: 'ACCEPT CLI freeze01 plus lexical-order/docs delta',
  packageHash: bundle.packageHash, runtimePayloadFiles: 70, distributionHash: bundle.distributionHash, distributionFiles: 87,
  officialDistributionWritten: false, actualAcceptance: false, selectorRecomputedWithoutRunningTests: true, testsRepeatedByParent: false,
  liveCalls: 0, installedWrites: 0, nodeVersion: process.versions.node, platform: process.platform,
  artifacts: Object.entries(artifacts).map(([name, v]) => ({ name, bytes: v.bytes.length, sha256: v.sha256 })) };
fs.writeFileSync(path.join(destination, 'accepted-evidence.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ acceptedSourceEvidence: true, uniquePass: uniqueTests, checks: 19, freshBatches: 9, freshCheckBindings: 10, reusedChecks: 9, sharedCaseDeduplicated: true, actualAcceptance: false, testsRepeatedByParent: false }));

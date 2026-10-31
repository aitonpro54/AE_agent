'use strict';
// Read-only source acceptance plus exclusive copies of allowlisted test evidence.
// No installed state, execution tools, test replay, owner, CEP or AE access.
const fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process'), crypto = require('node:crypto');
const root = path.resolve(__dirname, '../../../..'), incoming = process.argv[2];
const check = (v, code) => { if (!v) throw Error(code); }, hash = b => crypto.createHash('sha256').update(b).digest('hex');
check(path.isAbsolute(incoming) && fs.realpathSync(incoming) === incoming, 'evidence_path');
const names = ['summary.json', 'selection.json', 'source-hashes.json', 'closure-comparison.json', 'selection-before-routing-fix.json', 'hashes-before-routing-fix.json', 'stdout-tail.txt', 'routing-fix.raw.log', 'maintenance-finish.raw.log', 'owner-maintenance.raw.log', 'maintenance-finish-operator-current.raw.log'];
const readJson = name => JSON.parse(fs.readFileSync(path.join(incoming, name)));
const summary = readJson('summary.json'), selection = readJson('selection.json'), before = readJson('selection-before-routing-fix.json'), hashes = readJson('source-hashes.json');
const review = JSON.parse(fs.readFileSync(path.join(__dirname, 'source-review-final.json')));
check(JSON.stringify(hashes) === JSON.stringify(review.currentSourceHashes), 'review_hash_manifest');
for (const [relative, expected] of Object.entries(hashes)) check(/^[a-f0-9]{64}$/.test(expected) && hash(fs.readFileSync(path.join(root, relative))) === expected, 'source_changed:' + relative);
const current = JSON.parse(cp.execFileSync(process.execPath, ['core4/tools/validate-diff.js', ...Object.keys(hashes)], { cwd: root, encoding: 'utf8', maxBuffer: 2 * 1024 * 1024 }));
check(current.checks.length === 9 && summary.checks === 9 && summary.tests === 212 && summary.pass === 212 && summary.fail === 0, 'selection_totals');
let total = 0;
for (const row of summary.matrix) {
  const now = current.checks.find(c => c.check === row.check), saved = selection.checks.find(c => c.check === row.check), prior = before.checks.find(c => c.check === row.check);
  check(now && saved && now.evidenceKey === saved.evidenceKey && row.evidenceKey === now.evidenceKey && JSON.stringify(now.dependencies) === JSON.stringify(saved.dependencies) && JSON.stringify(now.command) === JSON.stringify(saved.command), 'check_current_binding:' + row.check);
  check(row.tests === row.pass && row.fail === 0 && row.cancelled === 0 && row.skipped === 0, 'nonpassing_check'); total += row.tests;
  if (row.mode === 'reused-unchanged-effective-closure') check(prior && prior.evidenceKey === now.evidenceKey && JSON.stringify(prior.dependencies) === JSON.stringify(now.dependencies) && JSON.stringify(prior.command) === JSON.stringify(now.command), 'reuse_changed_closure');
}
check(total === 212 && summary.originalWholeCommand.exitCode === 1 && !summary.constraints.fullImmutableRunClaimed, 'coverage_kind');
const pkg = require(path.join(root, 'core4/tools/package-installable')).buildPackage(undefined, 'manual', { runtimeModel: 'owner' });
check(pkg.packageHash === summary.packageHash && pkg.packageHash === 'cc2f07132209317bed89a529109dc06036559e4328950e5c04ca1be273c7cfac' && Object.keys(pkg.files).length === 70, 'runtime_package_changed');
const copies = names.map(name => { const source = path.join(incoming, name), destination = path.join(__dirname, name), stat = fs.lstatSync(source); check(stat.isFile() && !stat.isSymbolicLink() && !fs.existsSync(destination), 'evidence_copy_scope'); const bytes = fs.readFileSync(source); return { name, destination, bytes, sha256: hash(bytes) }; });
for (const entry of copies) fs.writeFileSync(entry.destination, entry.bytes, { flag: 'wx' });
const report = { collectedAt: new Date().toISOString(), recordContext: { purpose: 'development', lifetime: 'product_change' }, sourceHashes: hashes, sourceReview: 'ACCEPT', selectionRecomputedWithoutRunningTests: true, currentCheckKeysAndDependenciesMatched: 9, eligibleReusedChecks: summary.reusedChecks, currentNewChecks: summary.newChecks, currentCoverage: { tests: total, pass: total, fail: 0 }, initialWholeCommandExitCode: 1, coverageKind: summary.coverageKind, fullImmutableRunClaimed: false, rawInitialOutput: 'PARTIAL: first four tool chunks not archived; see summary limitations', runtimePackageHash: pkg.packageHash, runtimePayloadFiles: Object.keys(pkg.files).length, copiedFiles: copies.map(({ name, bytes, sha256 }) => ({ name, bytes: bytes.length, sha256 })), testsRepeated: false, liveCalls: 0, installedWrites: 0 };
fs.writeFileSync(path.join(__dirname, 'accepted-evidence.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ accepted: true, sourceHashMatches: 6, checkBindings: 9, tests: total, pass: total, reused: summary.reusedChecks, new: summary.newChecks, runtimePackageHash: pkg.packageHash, repeatedTests: false, rawInitialOutput: 'PARTIAL' }));

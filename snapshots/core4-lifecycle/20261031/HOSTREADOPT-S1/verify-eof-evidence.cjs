'use strict';
// Source-only acceptance of the one-byte formatting follow-up; no test replay.
const fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process'), crypto = require('node:crypto');
const root = path.resolve(__dirname, '../../../..'), incoming = process.argv[2], destination = path.join(__dirname, 'eof-cleanup');
const check = (v, code) => { if (!v) throw Error(code); }, hash = b => crypto.createHash('sha256').update(b).digest('hex');
const read = name => JSON.parse(fs.readFileSync(path.join(incoming, name)));
const manifestBytes = fs.readFileSync(path.join(incoming, 'manifest.json')), manifest = JSON.parse(manifestBytes);
check(hash(manifestBytes) === '62ae92727f7fc060cac0893c30c3b7b0297b560310e4d25cef44d1c75750f715', 'eof_manifest');
const summary = read('summary.json'), saved = read('selection.json'), before = JSON.parse(fs.readFileSync(path.join(__dirname, 'selection.json'))), hashes = read('source-hashes.json');
const review = JSON.parse(fs.readFileSync(path.join(__dirname, 'source-review-final.json'))), proof = JSON.parse(fs.readFileSync(path.join(__dirname, 'eof-cleanup-proof.json')));
for (const [file, expected] of Object.entries(hashes)) {
  check(hash(fs.readFileSync(path.join(root, file))) === expected, 'current_source_changed');
  check(expected === (file === proof.file ? proof.afterSha256 : review.currentSourceHashes[file]), 'review_or_eof_binding');
}
check(summary.tests === 212 && summary.pass === 212 && summary.fail === 0 && summary.originalWholeCommand.exitCode === 1 && summary.targetedRun.exitCode === 0, 'current_coverage');
check(hash(fs.readFileSync(path.join(incoming, 'selection-pre-run.json'))) === hash(fs.readFileSync(path.join(incoming, 'selection.json'))) && hash(fs.readFileSync(path.join(incoming, 'source-hashes-pre-run.json'))) === hash(fs.readFileSync(path.join(incoming, 'source-hashes.json'))), 'eof_run_source_drift');
const current = JSON.parse(cp.execFileSync(process.execPath, ['core4/tools/validate-diff.js', ...Object.keys(hashes)], { cwd: root, encoding: 'utf8', maxBuffer: 2 * 1024 * 1024 }));
let unchanged = 0;
for (const row of summary.matrix) {
  const a = current.checks.find(c => c.check === row.check), b = saved.checks.find(c => c.check === row.check), prior = before.checks.find(c => c.check === row.check);
  check(a && b && a.evidenceKey === b.evidenceKey && a.evidenceKey === row.evidenceKey && JSON.stringify(a.dependencies) === JSON.stringify(b.dependencies) && JSON.stringify(a.command) === JSON.stringify(b.command), 'selection_binding');
  check(a && prior && JSON.stringify(a.dependencies) === JSON.stringify(prior.dependencies), 'dependency_drift');
  if (row.check !== 'stopped-host-readoption') { check(a.evidenceKey === prior.evidenceKey, 'reused_key_drift'); unchanged++; }
}
check(unchanged === 8, 'eof_reuse_count');
const pkg = require(path.join(root, 'core4/tools/package-installable')).buildPackage(undefined, 'manual', { runtimeModel: 'owner' }); check(pkg.packageHash === summary.packageHash && Object.keys(pkg.files).length === 70, 'runtime_payload_drift');
check(!fs.existsSync(destination), 'eof_evidence_already_saved');
const files = Object.entries(manifest.files).map(([name, expected]) => { check(/^[A-Za-z0-9_.-]+$/.test(name), 'evidence_name'); const file = path.join(incoming, name), stat = fs.lstatSync(file), bytes = fs.readFileSync(file); check(stat.isFile() && !stat.isSymbolicLink() && bytes.length === expected.bytes && hash(bytes) === expected.sha256, 'evidence_bytes'); return { name, bytes }; });
fs.mkdirSync(destination); for (const { name, bytes } of files) fs.writeFileSync(path.join(destination, name), bytes, { flag: 'wx' }); fs.writeFileSync(path.join(destination, 'manifest.json'), manifestBytes, { flag: 'wx' });
const accepted = { collectedAt: new Date().toISOString(), recordContext: { purpose: 'development', lifetime: 'product_change' }, sourceHashes: hashes, currentSelectionKeysMatched: 9, unchangedReusedCheckKeys: unchanged, foundationCurrentRun: { tests: 25, pass: 25, fail: 0, exitCode: 0 }, composedCoverage: { tests: 212, pass: 212, fail: 0 }, initialWholeCommandExitCode: 1, sourceReview: 'ACCEPT of prior executable bytes plus exact one-byte EOF-only parent proof', eofProof: '../eof-cleanup-proof.json', priorAcceptance: '../accepted-evidence.json', runtimePackageHash: pkg.packageHash, runtimeFiles: 70, rawInitialLogCoverage: 'PARTIAL', latestManifestSha256: hash(manifestBytes), repeatedTestsByParent: false, liveCalls: 0, installedWrites: 0 };
fs.writeFileSync(path.join(destination, 'accepted-evidence.json'), JSON.stringify(accepted, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ accepted: true, sourceHashesMatch: 6, currentKeysMatch: 9, reusedKeys: unchanged, pass: 212, packageHash: pkg.packageHash }));

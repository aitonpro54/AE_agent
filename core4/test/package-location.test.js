'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync, execFileSync } = require('node:child_process');
const checker = path.resolve(__dirname, '../tools/check-package-location.js');

function run(source, output, cwd) {
  const env = { ...process.env }; delete env.NODE_TEST_CONTEXT; delete env.NODE_OPTIONS; delete env.NODE_PATH;
  const child = spawnSync(process.execPath, [checker, ...(source ? ['--source', source] : []), '--output-dir', output], { cwd, env, encoding: 'utf8', windowsHide: true, timeout: 60000, maxBuffer: 2 * 1024 * 1024 });
  assert.ifError(child.error); assert.equal(child.stderr, '');
  return { status: child.status, report: JSON.parse(child.stdout) };
}
test('package-location checks real packages and preserves a reproducible path-dependence finding', { timeout: 60000 }, async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'core4-location-test-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const source = path.resolve(__dirname, '..'), output = path.join(directory, 'success');
  const result = run(undefined, output, directory), report = result.report;
  await t.test('twelve variants, source/foreign cwd, spaces/Unicode and both byte controls', () => {
    assert.equal(result.status, 0); assert.equal(report.ok, true); assert.deepEqual(report.findings, []);
    assert.match(report.source.commit, /^[a-f0-9]{40}$/); assert.equal(report.cases.length, 72);
    assert.equal(report.variants.length, 12);
    for (const composition of ['readonly', 'manual', 'manual-titles-variants', 'manual-project-assembly', 'manual-project-save', 'manual-project-lifecycle']) for (const runtimeModel of ['stdio', 'owner']) {
      const cases = report.cases.filter(row => row.composition === composition && row.runtimeModel === runtimeModel);
      assert.equal(cases.length, 6); assert.equal(new Set(cases.map(row => row.location)).size, 3);
      assert.deepEqual([...new Set(cases.map(row => row.cwd))].sort(), ['foreign', 'source']);
      assert.ok(cases.every(row => row.verifyPackage && row.identicalHashFilesAndBytes && row.localDataExcluded));
      const variant = report.variants.find(row => row.composition === composition && row.runtimeModel === runtimeModel);
      assert.equal(variant.negativeControls.verifyPackageRejection, 'package_integrity');
      assert.equal(variant.negativeControls.comparisonRejected, true); assert.equal(variant.negativeControls.changedSourceVerified, true);
      assert.notEqual(variant.negativeControls.changedSourcePackageHash, variant.packageHash);
      for (const file of Object.keys(variant.fileBytes)) assert.doesNotMatch(file, /^(?:tools|test|state|credentials|\.git)\//);
    }
    // The copies include canaries, but never copy the real local files or Git metadata.
    const plain = path.join(output, 'sources/plain'); assert.equal(fs.existsSync(path.join(plain, '.git')), false);
    assert.match(fs.readFileSync(path.join(plain, 'installation.json'), 'utf8'), /^SYNTHETIC-LOCAL-ONLY-/);
    for (const file of Object.keys(report.source.files)) {
      const expected = fs.readFileSync(path.join(source, file));
      for (const location of ['plain', 'with spaces', 'Юникод 日本語']) assert.ok(expected.equals(fs.readFileSync(path.join(output, 'sources', location, file))));
    }
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(output, 'report.json'))), report);
  });
  await t.test('a source-path leak fails with retained packages and finding', () => {
    // Isolated Git fixture; production source and repository config stay untouched.
    const fixture = path.join(directory, 'fixture'); fs.mkdirSync(fixture);
    for (const file of Object.keys(report.source.files)) {
      const target = path.join(fixture, file); fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(path.join(source, file), target);
    }
    const builder = path.join(fixture, 'tools/package-installable.js'), original = fs.readFileSync(builder, 'utf8');
    const needle = 'const bytes = fs.readFileSync(full);'; assert.equal(original.split(needle).length, 2);
    fs.writeFileSync(builder, original.replace(needle, "const bytes = relative === 'cep/panel.css' ? Buffer.from(root) : fs.readFileSync(full);"));
    const git = args => execFileSync('git', ['-C', fixture, ...args], { encoding: 'utf8', windowsHide: true });
    git(['init', '--quiet']); git(['add', '.']);
    git(['-c', 'user.name=Offline fixture', '-c', 'user.email=offline@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', 'Synthetic path-dependent builder']);
    const failedOutput = path.join(directory, 'failure'), failed = run(fixture, failedOutput, directory);
    assert.equal(failed.status, 1); assert.equal(failed.report.ok, false);
    assert.equal(failed.report.findings.length, 1);
    assert.match(failed.report.findings[0].message, /package bytes differ: cep\/panel.css/);
    assert.match(failed.report.findings[0].phase, /readonly-stdio \/ with spaces/);
    assert.equal(failed.report.evidenceDirectory, failedOutput);
    for (const file of ['report.json', 'source.json', 'packages/readonly-stdio-clean.json', 'packages/readonly-stdio-1-source.json', 'sources/with spaces/tools/package-installable.js']) assert.ok(fs.existsSync(path.join(failedOutput, file)));
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(failedOutput, 'report.json'))), failed.report);
  });
});

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { audit, textReport } = require('../audit.cjs');
const { inspect } = require('../source.cjs');
const { run } = require('../cli.cjs');

const own = path.resolve(__dirname, '..');
const root = path.join(own, 'fixtures');
const fixtureReport = () => audit({ root, mapFile: 'validation-map.json' });
const get = (report, id) => report.checks.find(item => item.check === id);
const cli = args => ({ ...run(args), stderr: '' });

test('переносимая fixture — только кандидат с явными файлами и эвристическим выводом', () => {
  const report = fixtureReport(), check = get(report, 'portable');
  assert.equal(check.category, 'cloud-candidate'); assert.equal(check.basis, 'heuristic');
  assert.deepEqual(check.reachableFiles, ['helper.cjs', 'portable.test.js']);
  assert.equal(check.command.executed, false); assert.equal(report.runtimeImported, false);
  assert.ok(check.evidence.some(e => e.file === 'portable.test.js'));
  assert.ok(report.sources.every(file => /^[a-f0-9]{64}$/.test(file.sha256)));
});

test('явный Windows argv и явный AE argv дают разные категории', () => {
  const report = fixtureReport(), windows = get(report, 'windows'), native = get(report, 'native-ae');
  assert.equal(windows.category, 'platform-dependency'); assert.equal(windows.basis, 'explicit');
  assert.equal(native.category, 'native-ae-evidence-required');
  assert.equal(native.nativeEvidence.status, 'separate-required');
  assert.ok(windows.dependencies[0].files.includes('probe.ps1'));
});

test('VM/mock и простое упоминание Windows/JSX не доказывают нужную среду', () => {
  const report = fixtureReport();
  for (const id of ['vm-mock', 'windows-mentioned']) {
    const check = get(report, id);
    assert.equal(check.category, 'insufficient-information');
    assert.equal(check.nativeEvidence.status, 'not-established');
    assert.ok(check.observations.every(item => item.basis === 'heuristic'));
  }
  assert.ok(get(report, 'vm-mock').observations.some(item => item.kind === 'simulation'));
});

test('неизвестный import, missing files и dynamic loading сохраняют неопределённость', () => {
  const report = fixtureReport();
  for (const id of ['unknown', 'missing-dependency', 'missing-entry', 'dynamic', 'unsupported-command']) assert.equal(get(report, id).category, 'insufficient-information');
  assert.ok(get(report, 'unknown').issues.some(item => item.code === 'external-import'));
  assert.ok(get(report, 'dynamic').observations.some(item => item.kind === 'dynamic-import'));
});

test('исходник с немедленным throw прочитан без импорта и исполнения', () => {
  const report = fixtureReport();
  assert.ok(report.sources.some(item => item.file === 'untrusted.test.js'));
  assert.equal(report.commandsExecuted, false);
  const result = cli(['--root', root, '--map', 'validation-map.json', '--format', 'json']);
  assert.equal(result.status, 0); assert.equal(result.stderr, '');
  assert.equal(JSON.parse(result.stdout).commandsExecuted, false);
});

test('JSON и краткий текст содержат все проверки, причины и основания без статуса тестов', () => {
  const report = fixtureReport(), output = textReport(report);
  for (const check of report.checks) { assert.ok(output.includes(check.check)); assert.ok(check.reason); assert.ok(check.evidence.length); }
  assert.ok(!/\bPASS\b/.test(output));
  assert.ok(output.includes('не сертификат')); assert.ok(output.includes('probe.ps1') || report.sources.some(s => s.file === 'probe.ps1'));
});

test('отсутствующий и некорректный input получают exit 2 и структурированную ошибку', () => {
  for (const name of ['missing.json', 'invalid.json']) {
    const result = cli(['--format', 'json', '--root', root, '--map', name]);
    assert.equal(result.status, 2);
    const error = JSON.parse(result.stdout); assert.ok(error.error.code); assert.equal(error.commandsExecuted, false);
  }
  const missingRoot = cli(['--format', 'json', '--root', path.join(root, 'absent')]);
  assert.equal(missingRoot.status, 2);
});

test('unknown check и опасные аргументы отвергаются', () => {
  for (const args of [['--run'], ['--format', 'xml'], ['--root'], ['--check', 'absent']]) {
    const result = cli(['--root', root, '--map', 'validation-map.json', ...args]);
    assert.equal(result.status, 2);
  }
  assert.throws(() => audit({ root, mapFile: '../audit.cjs' }), { code: 'unsafe-path' });
});

test('комментарии и строка с require не становятся import edges', () => {
  const source = inspect('// require("outside-a")\nconst text = "require(\'outside-b\')";\nrequire("./helper.cjs");');
  assert.deepEqual(source.imports.map(item => item.specifier), ['./helper.cjs']);
  assert.ok(inspect('require("node:" + name)').findings.some(item => item.kind === 'dynamic-import'));
  assert.deepEqual(inspect('const pattern = /require("absent")/;').imports, []);
  assert.ok(inspect("test('x', { skip: process.platform !== 'win32' }, () => {});").findings.some(item => item.kind === 'windows-skip-gate' && item.basis === 'explicit'));
});

// Все временные fixtures создаются внутри собственного каталога.
function temporary(t, map, files = {}) {
  const directory = fs.mkdtempSync(path.join(own, 'test-tmp-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  for (const [file, text] of Object.entries({ 'map.json': JSON.stringify(map), ...files })) {
    fs.mkdirSync(path.dirname(path.join(directory, file)), { recursive: true });
    fs.writeFileSync(path.join(directory, file), text);
  }
  return directory;
}
function simpleMap() {
  return { checkDependencies: { one: ['entry.cjs'] }, checkCommands: { one: ['node', '--test', '--test-name-pattern=one', 'entry.cjs'] }, checkPolicy: { one: { kind: 'component' } } };
}

test('malformed schema, policy, commands и projections отвергаются до анализа', t => {
  for (const map of [[], {}, { checkDependencies: {} }, { ...simpleMap(), checkCommands: { one: 'node test' } }, { ...simpleMap(), checkPolicy: {} }, { ...simpleMap(), checkProjections: { one: [{}] } }]) {
    const directory = temporary(t, map);
    assert.throws(() => audit({ root: directory, mapFile: 'map.json' }), { code: 'invalid-map' });
  }
});

test('циклы literal imports завершаются, directory dependencies и projections учитываются', t => {
  const map = simpleMap(); map.checkDependencies.one = ['data/', 'entry.cjs'];
  map.checkProjections = { one: [{ file: 'catalog.json', key: 'modules', id: 'one' }] };
  const directory = temporary(t, map, { 'entry.cjs': 'require("./other.cjs");', 'other.cjs': 'require("./entry.cjs");', 'data/a.json': '{}', 'catalog.json': '{"modules":[{"id":"one"}]}' });
  const report = audit({ root: directory, mapFile: 'map.json' }), check = report.checks[0];
  assert.equal(check.category, 'cloud-candidate'); assert.equal(check.importEdgeCount, 2);
  assert.deepEqual(check.dependencies[0].files, ['data/a.json']);
  assert.ok(report.sources.some(file => file.file === 'catalog.json'));
  fs.writeFileSync(path.join(directory, 'catalog.json'), '{"modules":[]}');
  assert.equal(audit({ root: directory, mapFile: 'map.json' }).checks[0].category, 'insufficient-information');
});

test('declared-only Windows source не превращается в выполненную Windows dependency', t => {
  const map = simpleMap(); map.checkDependencies.one.push('windows.cjs');
  const directory = temporary(t, map, { 'entry.cjs': 'const number = 1;', 'windows.cjs': 'require("node:child_process").execFile("powershell.exe");' });
  const check = audit({ root: directory, mapFile: 'map.json' }).checks[0];
  assert.equal(check.category, 'insufficient-information');
  assert.ok(check.observations.some(item => item.kind === 'windows-hint' && item.scope === 'declared-only'));
});

test('fallback команды сверяется текстом validator и остаётся только статической моделью', t => {
  const map = simpleMap(); delete map.checkCommands;
  const directory = temporary(t, map, { 'entry.cjs': '', 'test/core4.test.js': '', 'tools/validate-diff.js': "map.checkCommands?.[check] || ['node', '--test', '--test-name-pattern=' + check, 'test/core4.test.js']" });
  let report = audit({ root: directory, mapFile: 'map.json' });
  assert.equal(report.checks[0].command.source, 'validator-fallback');
  assert.equal(report.checks[0].category, 'cloud-candidate');
  fs.writeFileSync(path.join(directory, 'tools/validate-diff.js'), 'different fallback');
  report = audit({ root: directory, mapFile: 'map.json' });
  assert.ok(report.checks[0].issues.some(item => item.code === 'unverified-fallback'));
});

test('traversal и symlink не читаются как зависимости', t => {
  const map = simpleMap(); map.checkDependencies.one.push('../outside');
  const directory = temporary(t, map, { 'entry.cjs': 'require("./linked/audit.cjs");' });
  fs.symlinkSync(own, path.join(directory, 'linked'), process.platform === 'win32' ? 'junction' : 'dir');
  const report = audit({ root: directory, mapFile: 'map.json' });
  assert.ok(report.checks[0].issues.filter(item => item.code === 'unsafe-path').length >= 2);
  assert.ok(!report.sources.some(file => file.file.startsWith('linked/')));
});

test('повторный анализ детерминирован и не меняет bytes fixtures', () => {
  const before = fs.readFileSync(path.join(root, 'validation-map.json'));
  assert.deepEqual(fixtureReport(), fixtureReport());
  assert.deepEqual(fs.readFileSync(path.join(root, 'validation-map.json')), before);
});

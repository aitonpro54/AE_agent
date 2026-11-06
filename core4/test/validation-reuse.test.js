'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { selectChecks } = require('../tools/validate-diff');

const layout = 'core4/modules/titles-point-layout/executor.jsx';
const text = 'core4/modules/text-layer/executor.jsx';
const variant = 'core4/modules/text-variant/executor.jsx';
const unrelated = 'modules/comp-render/completion.json';

function fixture(t) {
  const source = path.resolve(__dirname, '..');
  const base = fs.realpathSync(os.tmpdir());
  const temp = fs.mkdtempSync(path.join(base, 'core4-validation-reuse-test-'));
  assert.equal(path.dirname(temp), base);
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const root = path.join(temp, 'core4');
  const checks = selectChecks([layout, text, variant], source).checks;
  const files = new Set(['config/validation-map.json', 'core/artifacts.js', 'tools/validate-diff.js',
    'tools/validation-reuse.js', 'tools/check-boundaries.js', unrelated, ...checks.flatMap(check => check.dependencies)]);
  for (const relative of files) {
    const dest = path.join(root, relative);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(path.join(source, relative), dest);
  }
  const cache = path.join(temp, '.codex-runtime', 'validation-reuse-v1');
  const env = { ...process.env };
  for (const key of ['NODE_OPTIONS', 'NODE_PATH', 'NODE_TEST_CONTEXT', 'CORE4_REUSE_FIXTURE']) delete env[key];
  function run(args, overrides = {}) {
    const result = spawnSync(process.execPath, [path.join(root, 'tools/validate-diff.js'), ...args],
      { cwd: temp, env: { ...env, ...overrides }, encoding: 'utf8', windowsHide: true });
    assert.ifError(result.error);
    return result;
  }
  return { root, cache, run };
}

function passed(result) { assert.equal(result.status, 0, result.stderr + result.stdout); return result.stdout; }

test('validation-reuse saves full local passes and invalidates only the affected evidence', t => {
  const f = fixture(t);
  const args = [layout, text, '--run', '--reuse'];
  const fresh = passed(f.run(args));
  assert.match(fresh, /validation-reuse point-layout: running/);
  assert.match(fresh, /validation-reuse text-layer: running/);
  assert.match(fresh, /"releaseCertified": false/);
  fs.appendFileSync(path.join(f.root, unrelated), '\n');
  const warm = passed(f.run(args));
  assert.match(warm, /validation-reuse point-layout: reused/);
  assert.match(warm, /validation-reuse text-layer: reused/);
  fs.appendFileSync(path.join(f.root, 'test/fixtures/text-layer-ae.js'), '\n');
  const changed = passed(f.run(args));
  assert.match(changed, /validation-reuse point-layout: reused/);
  assert.match(changed, /validation-reuse text-layer: running/);
  const environment = passed(f.run(args, { CORE4_REUSE_FIXTURE: 'changed' }));
  assert.doesNotMatch(environment, /: reused/);
  assert.match(environment, /validation-reuse text-layer: running/);
  assert.doesNotMatch(passed(f.run([layout, '--run'])), /validation-reuse point-layout:/);
  assert.doesNotMatch(passed(f.run([variant, '--run', '--reuse'])), /validation-reuse text-variant:/);
});

test('validation-reuse refuses altered receipts and never saves skipped or incomplete runs', t => {
  const f = fixture(t);
  const args = [layout, '--run', '--reuse'];
  assert.equal(f.run([layout, '--reuse']).status, 1);
  passed(f.run(args));
  const receipts = () => fs.readdirSync(f.cache).filter(name => name.endsWith('.json'));
  assert.equal(receipts().length, 1);
  const receipt = path.join(f.cache, receipts()[0]);
  const record = JSON.parse(fs.readFileSync(receipt));
  record.body.tests = 99;
  fs.writeFileSync(receipt, JSON.stringify(record));
  assert.match(passed(f.run(args)), /validation-reuse point-layout: running/);
  assert.match(passed(f.run(args)), /validation-reuse point-layout: reused \(1 passed\)/);
  const file = path.join(f.root, 'test/point-layout-local.test.js');
  fs.appendFileSync(file, "\ntest.skip('point-layout: unfinished scenario', () => {});\n");
  assert.match(passed(f.run(args)), /# skipped 1/);
  assert.equal(receipts().length, 1);
  fs.writeFileSync(path.join(f.root, 'test/undeclared-input.js'), "module.exports = true;\n");
  fs.appendFileSync(file, "\nrequire('./undeclared-input');\n");
  assert.match(passed(f.run([layout, '--run'])), /measured text fits/);
  const missing = f.run(args);
  assert.equal(missing.status, 1);
  assert.match(missing.stdout + missing.stderr, /Cannot find module '\.\/undeclared-input'/);
  assert.equal(receipts().length, 1);
});

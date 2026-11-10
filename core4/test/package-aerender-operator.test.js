'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');
const { canonical, hash } = require('../protocol/json');
const { verifyOperatorPackage, writeOperatorPackage } = require('../tools/package-aerender-operator');

const source = path.resolve(__dirname, '..');
const cli = path.join(source, 'tools', 'package-aerender-operator.js');
const entry = 'tools/aerender-jobs.js';
const payload = [
  'protocol/json.js', 'runtime/aerender-jobs.js', 'runtime/aerender-profile.js',
  'runtime/project-file.js', 'runtime/project-save-proof.js',
  entry, 'tools/aerender-profile.js'
];

function fixture(t) {
  const temp = fs.realpathSync.native(os.tmpdir());
  const root = fs.mkdtempSync(path.join(temp, 'core4-aerender-package-'));
  t.after(() => {
    const owned = fs.realpathSync.native(root);
    assert.equal(owned, root);
    assert.equal(path.dirname(owned), temp);
    fs.rmSync(owned, { recursive: true, force: true });
  });
  return root;
}

function node(cwd, args) {
  const result = spawnSync(process.execPath, args, { cwd, encoding: 'utf8', timeout: 15000, windowsHide: true });
  assert.ifError(result.error);
  return result;
}

function cliReceipt(cwd, args) {
  const result = node(cwd, [cli, ...args]);
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

test('builds a deterministic eight-file operator and loads its original entry from a foreign cwd', t => {
  const root = fixture(t);
  const first = path.join(root, 'first package');
  const second = path.join(root, 'second package');
  const build = cliReceipt(root, ['--output', first]);
  const repeat = cliReceipt(root, ['--output', second]);
  assert.equal(build.files, 8);
  assert.deepEqual(repeat, { ...build, output: second });
  assert.deepEqual(cliReceipt(root, ['--verify', second, '--expected-sha256', build.operatorHash]), repeat);

  const manifest = fs.readFileSync(path.join(first, 'operator.json'));
  assert.equal(build.operatorHash, hash(manifest));
  assert.deepEqual(manifest, fs.readFileSync(path.join(second, 'operator.json')));
  assert.deepEqual(Object.keys(JSON.parse(manifest).hashes), payload);
  for (const file of payload) {
    const sourceBytes = fs.readFileSync(path.join(source, file));
    assert.deepEqual(fs.readFileSync(path.join(first, file)), sourceBytes);
    assert.deepEqual(fs.readFileSync(path.join(second, file)), sourceBytes);
  }

  const load = node(root, ['-e', 'process.stdout.write(typeof require(process.argv[1]).createJobs)', path.join(second, entry)]);
  assert.equal(load.status, 0, load.stderr);
  assert.equal(load.stdout, 'function');
});

test('verification requires the reviewed hash and refuses edited payload or manifest bytes', t => {
  const root = fixture(t);
  const output = path.join(root, 'package');
  const { operatorHash } = writeOperatorPackage(output);
  const missingPin = node(root, [cli, '--verify', output]);
  assert.equal(missingPin.status, 1);
  assert.equal(missingPin.stdout, '');
  assert.match(missingPin.stderr, /aerender_operator_usage/);
  assert.throws(() => verifyOperatorPackage(output, '0'.repeat(64)), { code: 'aerender_operator_manifest_hash' });

  const operator = path.join(output, entry);
  const original = fs.readFileSync(operator);
  fs.appendFileSync(operator, '\n// changed after review');
  const tamper = node(root, [cli, '--verify', output, '--expected-sha256', operatorHash]);
  assert.equal(tamper.status, 1);
  assert.equal(tamper.stdout, '');
  assert.match(tamper.stderr, /aerender_operator_closure/);
  fs.writeFileSync(operator, original);

  const manifestFile = path.join(output, 'operator.json');
  const manifest = fs.readFileSync(manifestFile);
  const noncanonical = manifest.toString() + '\n';
  fs.writeFileSync(manifestFile, noncanonical);
  assert.throws(() => verifyOperatorPackage(output, operatorHash), { code: 'aerender_operator_manifest_hash' });
  assert.throws(() => verifyOperatorPackage(output, hash(noncanonical)), { code: 'aerender_operator_closure' });

  const wrongPurpose = canonical({ ...JSON.parse(manifest), purpose: 'other-purpose' });
  fs.writeFileSync(manifestFile, wrongPurpose);
  assert.throws(() => verifyOperatorPackage(output, hash(wrongPurpose)), { code: 'aerender_operator_closure' });
});

test('verification refuses extra or missing entries even with the original manifest', t => {
  const output = path.join(fixture(t), 'package');
  const { operatorHash } = writeOperatorPackage(output);
  const extraFile = path.join(output, 'tools', 'unexpected.js');
  fs.writeFileSync(extraFile, 'extra', { flag: 'wx' });
  assert.throws(() => verifyOperatorPackage(output, operatorHash), { code: 'aerender_operator_tree' });
  fs.unlinkSync(extraFile);
  const extraDir = path.join(output, 'unexpected');
  fs.mkdirSync(extraDir);
  assert.throws(() => verifyOperatorPackage(output, operatorHash), { code: 'aerender_operator_tree' });
  fs.rmdirSync(extraDir);
  fs.unlinkSync(path.join(output, 'protocol', 'json.js'));
  assert.throws(() => verifyOperatorPackage(output, operatorHash), { code: 'aerender_operator_tree' });
});

test('build and verification refuse noncanonical, existing and linked paths', t => {
  const root = fixture(t);
  const output = path.join(root, 'package');
  assert.throws(() => writeOperatorPackage('relative'), { code: 'aerender_operator_new_output' });
  assert.throws(() => writeOperatorPackage(path.join(root, 'missing', 'package')), { code: 'aerender_operator_output_parent' });
  const { operatorHash } = writeOperatorPackage(output);
  assert.throws(() => writeOperatorPackage(output), { code: 'aerender_operator_new_output' });
  assert.throws(() => verifyOperatorPackage('relative', operatorHash), { code: 'aerender_operator_verify_path' });

  const alias = path.join(root, 'alias');
  fs.symlinkSync(output, alias, process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => verifyOperatorPackage(alias, operatorHash), { code: 'aerender_operator_tree' });
  assert.throws(() => writeOperatorPackage(path.join(alias, 'nested')), { code: 'aerender_operator_output_parent' });
  const refused = path.join(root, 'refused');
  assert.throws(() => writeOperatorPackage(refused, alias), { code: 'aerender_operator_source' });
  assert.equal(fs.existsSync(refused), false);
  assert.equal(fs.existsSync(path.join(output, 'nested')), false);

  const held = path.join(root, 'held-profile.js');
  const profile = path.join(output, 'tools', 'aerender-profile.js');
  fs.renameSync(profile, held);
  fs.linkSync(held, profile);
  assert.throws(() => writeOperatorPackage(refused, output), { code: 'aerender_operator_source' });
  assert.throws(() => verifyOperatorPackage(output, operatorHash), { code: 'aerender_operator_payload' });
  assert.equal(fs.existsSync(refused), false);
});

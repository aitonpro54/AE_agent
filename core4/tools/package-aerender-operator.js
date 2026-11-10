'use strict';

// Offline source packaging. The verification command never loads the packaged code.
const fs = require('node:fs');
const path = require('node:path');
const { canonical, fail, hash } = require('../protocol/json');
const { plainPath } = require('../runtime/project-file');

const manifestName = 'operator.json';
const modules = {
  protocol: ['json.js'],
  runtime: ['aerender-jobs.js', 'aerender-profile.js', 'project-file.js', 'project-save-proof.js'],
  tools: ['aerender-jobs.js', 'aerender-profile.js']
};
const payload = Object.entries(modules).flatMap(([dir, files]) => files.map(file => dir + '/' + file));
const sha256 = /^[a-f0-9]{64}$/;

function requireAbsolute(directory, code) {
  if (typeof directory !== 'string' || !path.isAbsolute(directory) || path.resolve(directory) !== directory ||
      process.platform === 'win32' && (!/^[a-z]:\\/i.test(directory) || /[<>:"|?*\x00-\x1f]|[ .](?:\\|$)/.test(directory.slice(3)))) {
    fail(code);
  }
}

function checkedPath(file, directory, code) {
  try { return plainPath(file, directory); }
  catch (error) {
    if (['save_disk_proof_unavailable', 'ENOENT', 'ENOTDIR'].includes(error.code)) fail(code);
    throw error;
  }
}

function readPlain(file, code) {
  const { resolved, info } = checkedPath(file, false, code);
  if (info.size < 1n || info.size > 1024n * 1024n) fail(code);
  const unchanged = current => ['dev', 'ino', 'size', 'mtimeNs', 'ctimeNs', 'nlink'].every(key => current[key] === info[key]);
  const fd = fs.openSync(resolved, 'r');
  try {
    if (!unchanged(fs.fstatSync(fd, { bigint: true }))) fail(code);
    const bytes = Buffer.alloc(Number(info.size));
    if (fs.readSync(fd, bytes, 0, bytes.length, 0) !== bytes.length ||
        !unchanged(fs.fstatSync(fd, { bigint: true })) || !unchanged(checkedPath(file, false, code).info)) fail(code);
    return bytes;
  } finally {
    fs.closeSync(fd);
  }
}

function readPayload(root, code) {
  return Object.fromEntries(payload.map(file => [file, readPlain(path.join(root, file), code)]));
}

function manifestBytes(files) {
  const hashes = Object.fromEntries(payload.map(file => [file, hash(files[file])]));
  return Buffer.from(canonical({ version: 1, purpose: 'aerender-local-operator-v1', hashes }));
}

function expectEntries(directory, names) {
  checkedPath(directory, true, 'aerender_operator_tree');
  if (canonical(fs.readdirSync(directory).sort()) !== canonical([...names].sort())) fail('aerender_operator_tree');
}

function verifyOperatorPackage(output, expectedSha256) {
  requireAbsolute(output, 'aerender_operator_verify_path');
  if (typeof expectedSha256 !== 'string' || !sha256.test(expectedSha256)) fail('aerender_operator_expected_sha256');

  expectEntries(output, [manifestName, ...Object.keys(modules)]);
  for (const [dir, files] of Object.entries(modules)) expectEntries(path.join(output, dir), files);
  const manifest = readPlain(path.join(output, manifestName), 'aerender_operator_manifest');
  const operatorHash = hash(manifest);
  if (operatorHash !== expectedSha256) fail('aerender_operator_manifest_hash');
  const files = readPayload(output, 'aerender_operator_payload');
  if (!manifest.equals(manifestBytes(files))) fail('aerender_operator_closure');

  return { operatorHash, files: payload.length + 1, output };
}

function writeOperatorPackage(output, source = path.resolve(__dirname, '..')) {
  requireAbsolute(output, 'aerender_operator_new_output');
  checkedPath(path.dirname(output), true, 'aerender_operator_output_parent');
  if (fs.lstatSync(output, { throwIfNoEntry: false })) fail('aerender_operator_new_output');
  requireAbsolute(source, 'aerender_operator_source');
  checkedPath(source, true, 'aerender_operator_source');
  const files = readPayload(source, 'aerender_operator_source');
  const manifest = manifestBytes(files);

  checkedPath(path.dirname(output), true, 'aerender_operator_output_parent');
  fs.mkdirSync(output);
  checkedPath(output, true, 'aerender_operator_new_output');
  for (const [dir, names] of Object.entries(modules)) {
    const target = path.join(output, dir);
    fs.mkdirSync(target);
    checkedPath(target, true, 'aerender_operator_new_output');
    for (const name of names) fs.writeFileSync(path.join(target, name), files[dir + '/' + name], { flag: 'wx' });
  }
  checkedPath(output, true, 'aerender_operator_new_output');
  fs.writeFileSync(path.join(output, manifestName), manifest, { flag: 'wx' });
  return verifyOperatorPackage(output, hash(manifest));
}

if (require.main === module) {
  try {
    const args = process.argv.slice(2);
    let result;
    if (args.length === 2 && args[0] === '--output') result = writeOperatorPackage(args[1]);
    else if (args.length === 4 && args[0] === '--verify' && args[2] === '--expected-sha256') {
      result = verifyOperatorPackage(args[1], args[3]);
    } else fail('aerender_operator_usage');
    console.log(canonical(result));
  } catch (error) {
    console.error(error.code || 'aerender_operator_package_failed');
    process.exitCode = 1;
  }
}

module.exports = { verifyOperatorPackage, writeOperatorPackage };

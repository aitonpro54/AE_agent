'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { hash, canonical, fail } = require('../protocol/json');
const { plainPath } = require('../runtime/project-file');

const files = ['protocol/json.js', 'runtime/png-proof.js', 'tools/visual-review.js'];
const manifestName = 'visual-review-package.json';
const read = file => {
  const { resolved, info } = plainPath(file);
  if (info.size < 1n || info.size > 256n * 1024n) fail('visual_review_package_size');
  return fs.readFileSync(resolved);
};
const manifest = payload => Buffer.from(canonical({ version: 1, profile: 'offline-visual-review',
  hashes: Object.fromEntries(files.map(file => [file, hash(payload[file])])) }) + '\n');
const payload = root => Object.fromEntries(files.map(file => [file, read(path.join(root, file))]));
const directories = files.map(file => path.dirname(file));

function verify(output, sha256) {
  const entries = (dir, expected) => {
    plainPath(dir, true);
    if (canonical(fs.readdirSync(dir).sort()) !== canonical([...expected].sort())) fail('visual_review_package_closure');
  };
  entries(output, [manifestName, ...directories]);
  for (const file of files) entries(path.join(output, path.dirname(file)), [path.basename(file)]);
  const bytes = read(path.join(output, manifestName));
  if (hash(bytes) !== sha256 || !bytes.equals(manifest(payload(output)))) fail('visual_review_package_hash');
  return { sha256, files: files.length + 1, output };
}

function pack(output) {
  const source = payload(path.resolve(__dirname, '..'));
  plainPath(path.dirname(output), true);
  fs.mkdirSync(output);
  for (const dir of directories) fs.mkdirSync(path.join(output, dir));
  for (const file of files) fs.writeFileSync(path.join(output, file), source[file], { flag: 'wx' });
  const bytes = manifest(source);
  fs.writeFileSync(path.join(output, manifestName), bytes, { flag: 'wx' });
  return verify(output, hash(bytes));
}

if (require.main === module) {
  try {
    const [action, output, pin, ...extra] = process.argv.slice(2);
    if (!output || extra.length || !(action === 'pack' && !pin || action === 'verify' && /^[a-f0-9]{64}$/.test(pin))) {
      fail('usage: package-visual-review.js pack <new-dir> | verify <dir> <sha256>');
    }
    console.log(JSON.stringify(action === 'pack' ? pack(path.resolve(output)) : verify(path.resolve(output), pin)));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}

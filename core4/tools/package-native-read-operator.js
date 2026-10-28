'use strict';
// Explicit offline reviewed-code packaging; never startup/authority issuance.
const fs = require('node:fs');
const path = require('node:path');
const { buildPackage } = require('./package-installable');
const { hash, canonical, fail } = require('../protocol/json');
function buildOperatorPackage(root = path.resolve(__dirname, '..')) {
  const pkg = buildPackage(root), files = { ...pkg.files };
  for (const file of ['tools/dispose-native-read.js', 'tools/disposition-install-preflight.js', 'tools/install-core4.js', 'tools/package-installable.js', 'tools/capture-native-read.js', 'tools/package-native-read-operator.js']) {
    const full = path.join(root, file); if (fs.realpathSync(full) !== full) fail('operator_package_path'); files[file] = fs.readFileSync(full).toString('base64');
  }
  const manifest = { version: 1, purpose: 'native-read-disposition-and-install-v1', hashes: Object.fromEntries(Object.keys(files).sort().map(file => [file, hash(Buffer.from(files[file], 'base64'))])) };
  return { operatorHash: hash(canonical(manifest)), candidatePackageHash: pkg.packageHash, manifest, files };
}
function writeOperatorPackage(output, bundle = buildOperatorPackage()) {
  if (!path.isAbsolute(output) || path.resolve(output) !== output || fs.existsSync(output)) fail('new_absolute_operator_output_required');
  fs.mkdirSync(output);
  for (const [file, encoded] of Object.entries(bundle.files)) { const target = path.join(output, file); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, Buffer.from(encoded, 'base64'), { flag: 'wx' }); }
  fs.writeFileSync(path.join(output, 'operator.json'), canonical(bundle.manifest), { flag: 'wx' });
  return { operatorHash: bundle.operatorHash, files: Object.keys(bundle.files).length, output };
}
if (require.main === module) { try { if (process.argv.length !== 4 || process.argv[2] !== '--output') fail('operator_output_required'); console.log(canonical(writeOperatorPackage(process.argv[3]))); } catch (e) { console.error(e.code || 'operator_package_failed'); process.exitCode = 1; } }
module.exports = { buildOperatorPackage, writeOperatorPackage };

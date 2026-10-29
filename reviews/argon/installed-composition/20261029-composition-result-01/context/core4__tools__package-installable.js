'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { hash, canonical, fail } = require('../protocol/json');
const { deriveComposition, registrySource } = require('../runtime/stdio-entry.js');
function buildPackage(root = path.resolve(__dirname, '..'), selector = 'manual') {
  if (!['readonly', 'manual'].includes(selector)) fail('composition_selector');
  const spec = JSON.parse(fs.readFileSync(path.join(root, 'runtime/source-package.json'), 'utf8'));
  const optional = selector === 'manual' ? spec.optional.manual : { files: [], artifactClosures: [] };
  const paths = new Set([...spec.files, ...optional.files]);
  for (const relative of [...spec.artifactClosures, ...optional.artifactClosures]) {
    paths.add(relative);
    const artifact = JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8'));
    for (const file of Object.keys(artifact.hashes)) {
      const location = relative.startsWith('modules/') || relative.startsWith('plan-engine/') ? path.posix.join(path.posix.dirname(relative), file) : file;
      if (hash(fs.readFileSync(path.join(root, location))) !== artifact.hashes[file]) fail('package_artifact_mismatch');
      paths.add(location);
    }
  }
  const hashes = {}, files = {};
  for (const relative of [...paths].sort()) {
    if (/^(test|experiments|node_modules|\.git|logs|state|tools)\//.test(relative) || relative.includes('..') || relative.includes('\\') || path.isAbsolute(relative)) fail('package_closure_forbidden');
    const full = path.resolve(root, relative); if (fs.realpathSync(full) !== full) fail('package_symlink');
    const bytes = fs.readFileSync(full); hashes[relative] = hash(bytes); files[relative] = bytes.toString('base64');
  }
  const release = { version: '4.0.0', format: 2, hashes };
  const original = JSON.parse(fs.readFileSync(path.join(root, 'config/catalog.json'), 'utf8'));
  const { modules, assets } = spec.compositions[selector];
  if (modules.some(id => original.modules.filter(m => m.id === id).length !== 1)) fail('composition_catalog');
  const catalog = { catalogRevision: original.catalogRevision, modules: modules.map(id => original.modules.find(m => m.id === id)), engine: selector === 'manual' ? original.engine : null };
  const composition = { version: 1, id: selector, modules, engine: catalog.engine, assets };
  const add = (file, source) => { const bytes = typeof source === 'string' ? source : canonical(source); files[file] = Buffer.from(bytes).toString('base64'); hashes[file] = hash(bytes); };
  add('config/catalog.json', catalog); add('runtime/composition.json', composition);
  const selected = deriveComposition(release, file => Buffer.from(files[file], 'base64'));
  add('cep/jsx/registry.jsx', registrySource(selected.assets, Buffer.from(files['runtime/host/json-codec.jsx'], 'base64').toString('utf8')));
  return verifyPackage({ packageHash: hash(release), release, files });
}
function verifyPackage(pkg) {
  if (pkg.packageHash !== hash(pkg.release) || pkg.release.version !== '4.0.0' || canonical(Object.keys(pkg.files).sort()) !== canonical(Object.keys(pkg.release.hashes).sort())) fail('package_integrity');
  for (const [relative, data] of Object.entries(pkg.files)) {
    if (!/^[a-zA-Z0-9_./-]+$/.test(relative) || relative.split('/').includes('..') || path.isAbsolute(relative) || /^(test|experiments|node_modules|\.git|logs|state|tools)\//.test(relative) || hash(Buffer.from(data, 'base64')) !== pkg.release.hashes[relative]) fail('package_integrity');
  }
  const selected = deriveComposition(pkg.release, file => Buffer.from(pkg.files[file], 'base64'));
  if (!selected.legacy && Buffer.from(pkg.files['cep/jsx/registry.jsx'], 'base64').toString('utf8') !== registrySource(selected.assets, Buffer.from(pkg.files['runtime/host/json-codec.jsx'], 'base64').toString('utf8'))) fail('composition_registry');
  return pkg;
}
if (require.main === module) {
  try {
    const args = process.argv.slice(2), options = {};
    for (let n = 0; n < args.length; n += 2) { const key = args[n]; if (!['--output', '--composition'].includes(key) || Object.hasOwn(options, key) || typeof args[n + 1] !== 'string' || args[n + 1].startsWith('--')) fail('package_options'); options[key] = args[n + 1]; }
    if (!options['--output'] || !path.isAbsolute(options['--output'])) fail('absolute_output_required');
    const pkg = buildPackage(undefined, options['--composition'] ?? 'manual'); fs.writeFileSync(options['--output'], canonical(pkg), { flag: 'wx' }); console.log(JSON.stringify({ packageHash: pkg.packageHash, files: Object.keys(pkg.files).length, composition: options['--composition'] ?? 'manual', output: options['--output'] }));
  } catch (e) { console.error(e.code || e.message); process.exitCode = 1; }
}
module.exports = { buildPackage, verifyPackage };

'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { hash, canonical, fail } = require('../protocol/json');
const { deriveComposition, registrySource } = require('../runtime/stdio-entry.js');
const OWNER_V3_FILES = Object.freeze(['runtime/owner-entry.js', 'runtime/client-entry.js', 'runtime/client-ipc.js', 'runtime/client-stdio.js', 'runtime/controller-lease.js', 'runtime/attachment-owner.js', 'runtime/owner-lifecycle.js', 'runtime/recovery-inspection.js', 'runtime/windows-owner-process.js', 'runtime/owner-maintenance.js']);
const OWNER_FILES = Object.freeze([...OWNER_V3_FILES, 'runtime/start-over-inspection.js', 'runtime/start-over-process.js', 'runtime/start-over-state.js', 'runtime/start-over-barrier.js', 'runtime/start-over-archive.js', 'runtime/start-over-finisher.js', 'runtime/work-session.js', 'runtime/start-over-panel-control.js', 'runtime/start-over-driver.js', 'runtime/owner-launch.js']);
function runtimeBinding(release, read) {
  if (!Object.hasOwn(release.hashes, 'runtime/owner-contract.json')) {
    if (OWNER_FILES.some(file => Object.hasOwn(release.hashes, file))) fail('owner_contract_required');
    return Object.freeze({ runtimeModel: 'stdio', clientEntry: 'runtime/stdio-entry.js', clientArgument: '--installation', clientDescriptorFile: null });
  }
  const bytes = read('runtime/owner-contract.json');
  if (release.format !== 2 || hash(bytes) !== release.hashes['runtime/owner-contract.json']) fail('owner_contract_integrity');
  let contract; try { contract = JSON.parse(bytes); } catch { fail('owner_contract_schema'); }
  const files = contract.version === 3 ? OWNER_V3_FILES : OWNER_FILES;
  const expected = { version: contract.version === 3 ? 3 : 4, runtimeModel: 'owner', clientEntry: 'runtime/client-entry.js', clientArgument: '--client-descriptor',
    ownerEntry: 'runtime/owner-entry.js', ownerArgument: '--installation', clientDescriptorFile: 'core-client.json', requiredFiles: [...files] };
  if (canonical(contract) !== canonical(expected) || files.some(file => !Object.hasOwn(release.hashes, file)) || contract.version === 3 && OWNER_FILES.some(file => !OWNER_V3_FILES.includes(file) && Object.hasOwn(release.hashes, file))) fail('owner_contract_schema');
  return Object.freeze(contract);
}
function buildPackage(root = path.resolve(__dirname, '..'), selector = 'manual', options = {}) {
  if (!['readonly', 'manual'].includes(selector)) fail('composition_selector');
  if (!options || Object.getPrototypeOf(options) !== Object.prototype || Object.keys(options).some(key => key !== 'runtimeModel')) fail('runtime_selector');
  const runtimeModel = options.runtimeModel ?? 'stdio'; if (!['stdio', 'owner'].includes(runtimeModel)) fail('runtime_selector');
  const spec = JSON.parse(fs.readFileSync(path.join(root, 'runtime/source-package.json'), 'utf8'));
  const optional = selector === 'manual' ? spec.optional.manual : { files: [], artifactClosures: [] };
  const paths = new Set([...spec.files, ...optional.files, ...(runtimeModel === 'owner' ? spec.optional.owner.files : [])]);
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
  const release = { version: '4.1.0', format: 2, hashes };
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
  if (pkg.packageHash !== hash(pkg.release) || (pkg.release.version !== '4.0.0' && !(pkg.release.version === '4.1.0' && pkg.release.format === 2)) || canonical(Object.keys(pkg.files).sort()) !== canonical(Object.keys(pkg.release.hashes).sort())) fail('package_integrity');
  for (const [relative, data] of Object.entries(pkg.files)) {
    if (!/^[a-zA-Z0-9_./-]+$/.test(relative) || relative.split('/').includes('..') || path.isAbsolute(relative) || /^(test|experiments|node_modules|\.git|logs|state|tools)\//.test(relative) || hash(Buffer.from(data, 'base64')) !== pkg.release.hashes[relative]) fail('package_integrity');
  }
  runtimeBinding(pkg.release, file => Buffer.from(pkg.files[file], 'base64'));
  const selected = deriveComposition(pkg.release, file => Buffer.from(pkg.files[file], 'base64'));
  if (!selected.legacy && Buffer.from(pkg.files['cep/jsx/registry.jsx'], 'base64').toString('utf8') !== registrySource(selected.assets, Buffer.from(pkg.files['runtime/host/json-codec.jsx'], 'base64').toString('utf8'))) fail('composition_registry');
  return pkg;
}
if (require.main === module) {
  try {
    const args = process.argv.slice(2), options = {};
    for (let n = 0; n < args.length; n += 2) { const key = args[n]; if (!['--output', '--composition', '--runtime'].includes(key) || Object.hasOwn(options, key) || typeof args[n + 1] !== 'string' || args[n + 1].startsWith('--')) fail('package_options'); options[key] = args[n + 1]; }
    if (!options['--output'] || !path.isAbsolute(options['--output'])) fail('absolute_output_required');
    const pkg = buildPackage(undefined, options['--composition'] ?? 'manual', { runtimeModel: options['--runtime'] ?? 'stdio' }); fs.writeFileSync(options['--output'], canonical(pkg), { flag: 'wx' }); console.log(JSON.stringify({ packageHash: pkg.packageHash, files: Object.keys(pkg.files).length, composition: options['--composition'] ?? 'manual', runtimeModel: options['--runtime'] ?? 'stdio', output: options['--output'] }));
  } catch (e) { console.error(e.code || e.message); process.exitCode = 1; }
}
module.exports = { buildPackage, verifyPackage, runtimeBinding };

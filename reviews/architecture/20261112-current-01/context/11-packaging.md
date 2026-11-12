# 11-packaging

Выбранные точные исходники; вне обозначенных диапазонов контекст не включён.

## `core4/tools/package-installable.js:1–115`
Полный файл SHA256 (hex groups, concatenate) `c31d2830:d2b36cf8:79289ecc:5eb610d5:baf8d9d4:20f215d3:11d36fd7:5aff1804`; Git blob `9979feb1:62739c05:9515d10a:5c52febe:01f7ecb7`. Выдержка: строки 1–115, 10119 bytes.

```javascript
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { hash, canonical, fail } = require('../protocol/json');
const { deriveComposition, compositionPaths, builtinCapabilityFiles, registrySource } = require('../runtime/stdio-entry.js');
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
  if (!options || Object.getPrototypeOf(options) !== Object.prototype || Object.keys(options).some(key => key !== 'runtimeModel')) fail('runtime_selector');
  const runtimeModel = options.runtimeModel ?? 'stdio'; if (!['stdio', 'owner'].includes(runtimeModel)) fail('runtime_selector');
  const read = file => fs.readFileSync(path.join(root, file));
  const spec = JSON.parse(read('runtime/source-package.json'));
  if (spec.version !== 3) fail('composition_selector');
  function compositionPart(key) {
    if (typeof key !== 'string' || !/^[a-z][a-z0-9-]*$/.test(key)) fail('composition_selector');
    if (Object.hasOwn(spec.compositions, key)) return spec.compositions[key];
    const file = path.resolve(root, 'config/compositions', key + '.json');
    if (!fs.existsSync(file)) fail('composition_selector');
    if (fs.realpathSync(file) !== file) fail('package_symlink');
    const part = JSON.parse(fs.readFileSync(file));
    if (!part.bundle || Object.hasOwn(part, 'packagePart')) fail('composition_selector');
    return part;
  }
  const lineage = new Set();
  const parts = [];
  for (let key = selector; key !== null;) {
    if (lineage.has(key)) fail('composition_selector');
    const part = compositionPart(key);
    lineage.add(key); parts.unshift(part); key = part.parent;
  }
  const optional = parts.flatMap(part => part.packagePart === null ? [] : [part.bundle ?? spec.optional[part.packagePart]]);
  const capabilities = Object.assign({}, ...parts.map(part => {
    const declared = Object.hasOwn(part, 'capabilities') ? part.capabilities : {};
    builtinCapabilityFiles(declared);
    return declared;
  }));
  const filesInPolicy = [...spec.files, ...builtinCapabilityFiles(capabilities), ...optional.flatMap(part => part.files), ...(runtimeModel === 'owner' ? spec.optional.owner.files : [])];
  const closures = [...spec.artifactClosures, ...optional.flatMap(part => part.artifactClosures)];
  const artifacts = new Map();
  const paths = compositionPaths(filesInPolicy, closures, relative => {
    const artifact = JSON.parse(read(relative));
    artifacts.set(relative, artifact);
    return artifact;
  });
  for (const [relative, artifact] of artifacts) {
    for (const [file, pin] of Object.entries(artifact.hashes)) {
      const location = /^(modules|plan-engine)\//.test(relative) ? path.posix.join(path.posix.dirname(relative), file) : file;
      if (hash(read(location)) !== pin) fail('package_artifact_mismatch');
    }
  }
  const hashes = {}, files = {};
  for (const relative of [...paths].sort()) {
    if (/^(test|experiments|node_modules|\.git|logs|state|tools)\//.test(relative) || relative.includes('..') || relative.includes('\\') || path.isAbsolute(relative)) fail('package_closure_forbidden');
    const full = path.resolve(root, relative); if (fs.realpathSync(full) !== full) fail('package_symlink');
    const bytes = fs.readFileSync(full); hashes[relative] = hash(bytes); files[relative] = bytes.toString('base64');
  }
  const release = { version: '4.2.6', format: 2, hashes };
  const original = JSON.parse(fs.readFileSync(path.join(root, 'config/catalog.json'), 'utf8'));
  const modules = parts.flatMap(part => part.modules), assets = parts.flatMap(part => part.assets);
  const profiles = Object.assign({}, ...parts.map(part => part.profiles));
  for (const moduleId of modules.filter(id => !original.modules.some(entry => entry.id === id))) {
    const modulePath = 'modules/' + moduleId;
    const manifest = JSON.parse(Buffer.from(files[modulePath + '/artifact.json'], 'base64'));
    original.modules.push({ id: moduleId, version: manifest.version, path: modulePath, admission: 'config/admissions/' + moduleId + '.json' });
    original.catalogRevision = selector + '-' + hash(manifest);
  }
  if (modules.some(id => original.modules.filter(m => m.id === id).length !== 1)) fail('composition_catalog');
  const catalog = { catalogRevision: original.catalogRevision, modules: modules.map(id => original.modules.find(m => m.id === id)), engine: selector === 'readonly' ? null : original.engine };
  const composition = { version: 2, id: selector, modules, engine: catalog.engine, assets };
  const add = (file, source) => { const bytes = typeof source === 'string' ? source : canonical(source); files[file] = Buffer.from(bytes).toString('base64'); hashes[file] = hash(bytes); };
  add('config/catalog.json', catalog); add('runtime/composition.json', composition);
  add('runtime/composition-policy.json', { version: 2, id: selector, modules, assets, profiles, capabilities, files: filesInPolicy, closures });
  // Reserve the generated registry slot before checking the declared closure.
  add('cep/jsx/registry.jsx', '');
  const selected = deriveComposition(release, file => Buffer.from(files[file], 'base64'));
  add('cep/jsx/registry.jsx', registrySource(selected.assets, Buffer.from(files['runtime/host/json-codec.jsx'], 'base64').toString('utf8'), true));
  const panelIdentity = require('../integrations/cep/panel-identity');
  const loadedIdentity = panelIdentity.identity(file => Buffer.from(files[file], 'base64'));
  add('cep/js/panel.js', panelIdentity.stamp(Buffer.from(files['cep/js/panel.js'], 'base64').toString('utf8'), loadedIdentity));
  return verifyPackage({ packageHash: hash(release), release, files });
}
function verifyPackage(pkg) {
  if (pkg.packageHash !== hash(pkg.release) || (pkg.release.version !== '4.0.0' && !(['4.1.0', '4.1.1', '4.1.2', '4.2.1', '4.2.2', '4.2.3', '4.2.4', '4.2.5', '4.2.6'].includes(pkg.release.version) && pkg.release.format === 2)) || canonical(Object.keys(pkg.files).sort()) !== canonical(Object.keys(pkg.release.hashes).sort())) fail('package_integrity');
  for (const [relative, data] of Object.entries(pkg.files)) {
    if (!/^[a-zA-Z0-9_./-]+$/.test(relative) || relative.split('/').includes('..') || path.isAbsolute(relative) || /^(test|experiments|node_modules|\.git|logs|state|tools)\//.test(relative) || hash(Buffer.from(data, 'base64')) !== pkg.release.hashes[relative]) fail('package_integrity');
  }
  runtimeBinding(pkg.release, file => Buffer.from(pkg.files[file], 'base64'));
  if (pkg.release.version === '4.2.6') require('../integrations/cep/panel-identity').verify(file => Buffer.from(pkg.files[file], 'base64'));
  const selected = deriveComposition(pkg.release, file => Buffer.from(pkg.files[file], 'base64'));
  if (!selected.legacy && Buffer.from(pkg.files['cep/jsx/registry.jsx'], 'base64').toString('utf8') !== registrySource(selected.assets, Buffer.from(pkg.files['runtime/host/json-codec.jsx'], 'base64').toString('utf8'), pkg.release.version === '4.2.6')) fail('composition_registry');
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
```

## `core4/worker.js:1–39`
Полный файл SHA256 (hex groups, concatenate) `7f536cdc:fd03b397:1e129278:0ba5d32c:250a9c28:e8c50e19:d65df70a:3e5d1703`; Git blob `da9219d4:f7c21908:1b1a4e7f:8a11b5bc:bc9a27f3`. Выдержка: строки 1–39, 2244 bytes.

```javascript
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { bounded, parse, exact, hash, fail, MAX_FRAME } = require('./protocol/json');
const { reviewCode } = require('./core/artifacts');
let buffer = ''; const loaded = new Set(); let queue = Promise.resolve();
function component(pin) {
  exact(pin, ['pin', 'path', 'manifest']);
  if (hash(pin.manifest) !== pin.pin) fail('worker_artifact_pin');
  for (const [file, digest] of Object.entries(pin.manifest.hashes)) {
    const resolved = path.resolve(pin.path, file);
    if (!resolved.startsWith(path.resolve(pin.path) + path.sep)) fail('artifact_path');
    const bytes = fs.readFileSync(resolved, 'utf8'); if (hash(bytes) !== digest) fail('worker_artifact_pin');
    if (file.endsWith('.js')) reviewCode(bytes);
  }
  loaded.add(pin.manifest.id + '@' + pin.pin);
  return require(path.join(pin.path, pin.manifest.entry));
}
async function handle(message) {
  exact(message, ['protocolVersion', 'requestId', 'workerEpoch', 'taskId', 'taskEpoch', 'method', 'componentPins', 'payload']);
  if (message.protocolVersion !== 1 || !['build', 'engine'].includes(message.method)) fail('worker_method');
  const implementation = component(message.componentPins);
  if (message.method === 'build') return implementation.build(message.payload);
  return implementation.transition(message.payload);
}
process.stdin.setEncoding('utf8');
process.stdin.on('data', data => {
  buffer += data; if (Buffer.byteLength(buffer) > MAX_FRAME && !buffer.includes('\n')) process.exit(70);
  while (buffer.includes('\n')) {
    const index = buffer.indexOf('\n'); const line = buffer.slice(0, index); buffer = buffer.slice(index + 1);
    let message; try { message = parse(line); } catch { process.exit(70); }
    queue = queue.then(async () => {
      const reply = { protocolVersion: 1, requestId: message.requestId, workerEpoch: message.workerEpoch, taskId: message.taskId, taskEpoch: message.taskEpoch };
      try { reply.result = await handle(message); } catch (e) { reply.error = { code: e.code || 'worker_job_failed', message: e.message }; }
      reply.loaded = [...loaded];
      try { process.stdout.write(bounded(reply) + '\n'); } catch { process.exit(70); }
    });
  }
});
```

'use strict';
// Offline replacement of one reviewed slot in a pinned Owner release.
const fs = require('node:fs');
const path = require('node:path');
const { Script } = require('node:vm');
const { canonical, fail, hash, MAX_FRAME } = require('../protocol/json');
const { reviewCode } = require('../core/artifacts');
const { deriveComposition, registrySource } = require('../runtime/stdio-entry');
const { runtimeBinding, verifyPackage } = require('./package-installable');
const { bundleStandalone, writeStandalone } = require('./package-standalone-installer');

const DEFAULT_MODULE = 'titles-current-target';
const ARTIFACT_FILES = ['contract.json', 'executor.jsx', 'implementation.js'];
const MODULE_FILES = ['artifact.json', ...ARTIFACT_FILES];
const FILE_LIMIT = 64 * 1024;
const SHA256 = /^[a-f0-9]{64}$/;
const MODULE_ID = /^[a-z][a-z0-9-]{0,63}$/;

function exact(value, keys, code) {
  if (!value || Object.getPrototypeOf(value) !== Object.prototype ||
      Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key))) fail(code);
}

function plain(file, directory = false) {
  if (typeof file !== 'string' || !path.isAbsolute(file) || path.resolve(file) !== file) fail('capability_absolute_path');
  const stat = fs.lstatSync(file, { bigint: true });
  if (stat.isSymbolicLink() || stat.reparsePoint || fs.realpathSync(file) !== file ||
      (directory ? !stat.isDirectory() : !stat.isFile())) fail('capability_path');
  return stat;
}

function readBounded(file, limit) {
  const same = (a, b) => ['dev', 'ino', 'size', 'mtimeNs', 'ctimeNs'].every(key => a[key] === b[key]);
  const named = plain(file), fd = fs.openSync(file, 'r');
  try {
    const held = fs.fstatSync(fd, { bigint: true });
    if (!held.isFile() || !same(held, named)) fail('capability_file_changed');
    if (held.size === 0n || held.size > BigInt(limit)) fail('capability_budget');
    const bytes = Buffer.alloc(Number(held.size));
    for (let offset = 0; offset < bytes.length;) {
      const count = fs.readSync(fd, bytes, offset, bytes.length - offset, offset);
      if (!count) fail('capability_file_changed');
      offset += count;
    }
    if (!same(held, fs.fstatSync(fd, { bigint: true })) || !same(held, plain(file))) fail('capability_file_changed');
    return bytes;
  } finally { fs.closeSync(fd); }
}

function utf8(bytes) {
  const value = bytes.toString('utf8');
  if (!Buffer.from(value).equals(bytes)) fail('capability_utf8');
  return value;
}

function verifyCapability(bundle, expectedHash) {
  exact(bundle, ['capabilityHash', 'manifest', 'files'], 'capability_schema');
  const { manifest, files, capabilityHash } = bundle;
  exact(manifest, ['version', 'moduleId', 'hashes'], 'capability_schema');
  const moduleId = manifest.moduleId;
  exact(manifest.hashes, MODULE_FILES, 'capability_closure');
  exact(files, MODULE_FILES, 'capability_closure');
  if (MODULE_FILES.some(name => typeof manifest.hashes[name] !== 'string' || !SHA256.test(manifest.hashes[name]))) fail('capability_schema');
  if (manifest.version !== 1 || typeof moduleId !== 'string' || !MODULE_ID.test(moduleId) ||
      typeof expectedHash !== 'string' || !SHA256.test(expectedHash) ||
      capabilityHash !== expectedHash || hash(manifest) !== expectedHash) fail('capability_pin');
  const source = {};
  for (const name of MODULE_FILES) {
    const encoded = files[name];
    if (typeof encoded !== 'string' || encoded.length > Math.ceil(FILE_LIMIT / 3) * 4) fail('capability_budget');
    const bytes = Buffer.from(encoded, 'base64');
    if (!bytes.length || bytes.length > FILE_LIMIT || bytes.toString('base64') !== encoded || hash(bytes) !== manifest.hashes[name]) fail('capability_bytes');
    source[name] = utf8(bytes);
  }
  if (Buffer.byteLength(canonical(bundle)) > MAX_FRAME) fail('capability_budget');
  const artifact = JSON.parse(source['artifact.json']);
  exact(artifact, ['id', 'version', 'entry', 'hashes', 'publicDependencies'], 'capability_artifact');
  exact(artifact.publicDependencies, [], 'capability_dependencies');
  exact(artifact.hashes, ARTIFACT_FILES, 'capability_artifact');
  if (artifact.id !== moduleId || typeof artifact.version !== 'string' || !/^\d{1,8}\.\d{1,8}\.\d{1,8}$/.test(artifact.version) ||
      artifact.entry !== 'implementation.js' || ARTIFACT_FILES.some(name => artifact.hashes[name] !== manifest.hashes[name])) fail('capability_artifact');
  const contract = JSON.parse(source['contract.json']);
  if (contract?.moduleId !== moduleId || typeof contract.operationId !== 'string' || !MODULE_ID.test(contract.operationId)) fail('capability_contract_incompatible');
  reviewCode(source['implementation.js']);
  new Script(source['implementation.js'], { filename: 'implementation.js' });
  return { artifact, contract };
}

function packageCapability(directory = path.resolve(__dirname, '..', 'modules', DEFAULT_MODULE)) {
  plain(directory, true);
  if (canonical(fs.readdirSync(directory).sort()) !== canonical(MODULE_FILES)) fail('capability_closure');
  const files = {}, hashes = {};
  let moduleId;
  for (const name of MODULE_FILES) {
    const bytes = readBounded(path.join(directory, name), FILE_LIMIT);
    if (name === 'artifact.json') moduleId = JSON.parse(utf8(bytes))?.id;
    files[name] = bytes.toString('base64');
    hashes[name] = hash(bytes);
  }
  const manifest = { version: 1, moduleId, hashes };
  const bundle = { manifest, files, capabilityHash: hash(manifest) };
  verifyCapability(bundle, bundle.capabilityHash);
  return bundle;
}

function requireInitialization(source, code) {
  // Reviewed bytes only. This context has no AE or Node ports.
  const options = { timeout: 250, microtaskMode: 'afterEvaluate', contextCodeGeneration: { strings: false, wasm: false } };
  let initialized;
  try { initialized = new Script(source).runInNewContext(Object.create(null), options); }
  catch { fail(code); }
  if (initialized !== true) fail(code);
}

function composeCapability(base, bundle, admissionBytes, { basePin, capabilityPin, admissionPin }) {
  exact(base, ['packageHash', 'release', 'files'], 'capability_base');
  if (typeof basePin !== 'string' || !SHA256.test(basePin) || base.packageHash !== basePin) fail('capability_base_pin');
  verifyPackage(base);
  const readBase = file => Buffer.from(base.files[file], 'base64');
  const selected = deriveComposition(base.release, readBase);
  const composition = selected.composition;
  if (!['4.1.0', '4.1.1', '4.1.2', '4.2.1', '4.2.2', '4.2.3'].includes(base.release.version) || !composition || composition.id === 'readonly' ||
      (composition.version === 1 && composition.id !== 'manual') ||
      runtimeBinding(base.release, readBase).runtimeModel !== 'owner') fail('capability_base_composition');
  const { artifact, contract } = verifyCapability(bundle, capabilityPin);
  const moduleId = artifact.id;
  const existing = selected.assets.find(asset => asset.moduleId === moduleId && asset.resultProfile);
  const admissionPath = 'config/admissions/' + moduleId + '.json';
  if (!existing || (composition.version === 1 && moduleId !== DEFAULT_MODULE)) fail('capability_base_slot');
  exact(existing.manifest.hashes, ARTIFACT_FILES, 'capability_base_slot');
  exact(existing.manifest.publicDependencies, [], 'capability_base_slot');
  if (!Buffer.isBuffer(admissionBytes) || admissionBytes.length === 0 || admissionBytes.length > 16384 ||
      typeof admissionPin !== 'string' || !SHA256.test(admissionPin) || hash(admissionBytes) !== admissionPin) fail('capability_admission_pin');
  // Compatibility is anchored to the admitted slot, including its schemas and effect policy.
  if (canonical(existing.contract) !== canonical(contract)) fail('capability_contract_incompatible');
  utf8(admissionBytes);

  const release = { ...base.release, hashes: { ...base.release.hashes } };
  const files = { ...base.files };
  const read = file => Buffer.from(files[file], 'base64');
  const put = (file, bytes) => {
    files[file] = bytes.toString('base64');
    release.hashes[file] = hash(bytes);
  };
  for (const name of MODULE_FILES) put(existing.path + '/' + name, Buffer.from(bundle.files[name], 'base64'));
  put(admissionPath, admissionBytes);
  if (hash(release) === basePin) return base;

  const catalog = JSON.parse(read('config/catalog.json'));
  catalog.modules.find(entry => entry.id === moduleId).version = artifact.version;
  catalog.catalogRevision = 'capability-' + hash({ modules: catalog.modules, engine: catalog.engine, capabilityPin, admissionPin });
  put('config/catalog.json', Buffer.from(canonical(catalog)));
  const composed = deriveComposition(release, read);
  const updated = composed.assets.find(asset => asset.moduleId === moduleId);
  const phases = updated.phases.map(phase => 'typeof executor[' + JSON.stringify(phase) + '] === "function"');
  requireInitialization('var executor = ' + updated.executor + '\n; executor != null && ' + phases.join(' && '), 'capability_executor_interface');
  requireInitialization('var module = {exports:{}};\n(function(module,exports){\n' + utf8(read(existing.path + '/implementation.js')) +
    '\n})(module,module.exports);\nmodule.exports != null && typeof module.exports.build === "function";', 'capability_builder_interface');
  const registry = registrySource(composed.assets, utf8(read('runtime/host/json-codec.jsx')));
  requireInitialization(registry + '\n; typeof AECore4Host.dispatch === "function";', 'capability_registry_initialization');
  put('cep/jsx/registry.jsx', Buffer.from(registry));
  return verifyPackage({ packageHash: hash(release), release, files });
}

function main([mode, ...args]) {
  const required = mode === 'pack' ? ['--source', '--output'] : mode === 'compose' ? [
    '--base', '--expected-base-hash', '--capability', '--expected-capability-hash', '--admission', '--expected-admission-sha256', '--output'
  ] : [];
  const options = {};
  if (!required.length || args.length !== 2 * required.length) fail('capability_options');
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i], value = args[i + 1];
    if (!required.includes(key) || Object.hasOwn(options, key) || !value || value.startsWith('--')) fail('capability_options');
    options[key] = value;
  }
  const output = options['--output'];
  if (mode === 'pack') {
    const bundle = packageCapability(options['--source']);
    if (path.resolve(output) !== output || !path.isAbsolute(output)) fail('capability_absolute_path');
    plain(path.dirname(output), true);
    fs.writeFileSync(output, canonical(bundle), { flag: 'wx' });
    return { capabilityHash: bundle.capabilityHash, moduleId: bundle.manifest.moduleId, output };
  }
  const base = JSON.parse(utf8(readBounded(options['--base'], 16 * 1024 * 1024)));
  const bundle = JSON.parse(utf8(readBounded(options['--capability'], MAX_FRAME)));
  const admission = readBounded(options['--admission'], 16384);
  const pkg = composeCapability(base, bundle, admission, {
    basePin: options['--expected-base-hash'], capabilityPin: options['--expected-capability-hash'],
    admissionPin: options['--expected-admission-sha256']
  });
  return writeStandalone(output, bundleStandalone(pkg, { capabilityBaseHash: pkg.packageHash === base.packageHash ? undefined : base.packageHash }));
}

if (require.main === module) {
  try { console.log(canonical(main(process.argv.slice(2)))); }
  catch (error) { console.error(error.code || 'capability_package_failed'); process.exitCode = 1; }
}
module.exports = { packageCapability, composeCapability, main };

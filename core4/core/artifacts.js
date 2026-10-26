'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { hash, canonical, fail, parse, exact } = require('../protocol/json');
function local(root, relative) {
  if (typeof relative !== 'string' || path.isAbsolute(relative) || relative.split(/[\\/]/).includes('..')) fail('artifact_path');
  const file = path.resolve(root, relative);
  if (!file.startsWith(path.resolve(root) + path.sep)) fail('artifact_path');
  if (fs.existsSync(file) && fs.realpathSync(file) !== file) fail('artifact_symlink');
  return file;
}
class Artifacts {
  constructor({ root, store, trace = () => {} }) {
    this.root = root; this.store = store; this.trace = trace;
    this.catalog = { catalogRevision: 'absent', modules: [] }; this.refresh();
    const core = this.readJSON('core/artifact.json');
    this.coreIdentity = hash(core); const runtimeBytes = {};
    for (const [file, digest] of Object.entries(core.hashes)) {
      if (!/^(core\/|protocol\/|worker\.js$)/.test(file)) fail('core_closure_boundary');
      runtimeBytes[file] = this.read(file); if (hash(runtimeBytes[file]) !== digest) fail('core_integrity', file);
    }
    const runtimePath = path.join(this.store, 'core-' + this.coreIdentity); fs.mkdirSync(runtimePath, { recursive: true });
    for (const [file, bytes] of Object.entries(runtimeBytes)) {
      const dest = local(runtimePath, file); fs.mkdirSync(path.dirname(dest), { recursive: true });
      if (!fs.existsSync(dest)) {
        const fd = fs.openSync(dest, 'wx');
        try { if (fs.writeSync(fd, bytes) !== Buffer.byteLength(bytes)) fail('runtime_copy_short_write'); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
      }
      if (hash(fs.readFileSync(dest)) !== core.hashes[file]) fail('immutable_runtime_integrity');
    }
    this.runtime = { path: runtimePath, hashes: core.hashes };
    this.protocolPin = hash(this.readJSON('protocol/artifact.json'));
  }
  read(relative) { this.trace(relative); return fs.readFileSync(local(this.root, relative), 'utf8'); }
  readJSON(relative) { return parse(this.read(relative)); }
  refresh() {
    let next;
    try { next = this.readJSON('config/catalog.json'); }
    catch (e) { this.catalogError = e.code || 'invalid_catalog'; return this.catalog; }
    try {
    exact(next, ['catalogRevision', 'modules', 'engine']);
    if (!Array.isArray(next.modules) || next.modules.length > 128 || typeof next.catalogRevision !== 'string') fail('invalid_catalog');
    const ids = new Set();
    for (const m of next.modules) {
      exact(m, ['id', 'version', 'path', 'admission']);
      if (ids.has(m.id) || typeof m.id !== 'string') fail('invalid_catalog'); ids.add(m.id);
      local(this.root, m.path); local(this.root, m.admission);
    }
    this.catalog = JSON.parse(canonical(next)); this.catalogError = null; return this.catalog;
    } catch (e) { this.catalogError = e.code || 'invalid_catalog'; return this.catalog; }
  }
  select(moduleId) {
    const entry = this.catalog.modules.find(m => m.id === moduleId);
    if (!entry) fail('module_unavailable');
    let admission;
    try { admission = this.readJSON(entry.admission); } catch { fail('not_admitted'); }
    const selected = this.selectArtifact(entry.path, admission.artifactHash);
    if (selected.manifest.id !== moduleId || selected.manifest.version !== entry.version) fail('artifact_identity');
    const contract = parse(fs.readFileSync(path.join(selected.path, 'contract.json'), 'utf8'));
    const executor = fs.readFileSync(path.join(selected.path, 'executor.jsx'), 'utf8');
    this.checkAdmission(admission, selected.pin, contract, executor);
    return { ...selected, moduleId, contract, admission, admissionPath: entry.admission, executor };
  }
  checkAdmission(a, pin, contract, executor) {
    exact(a, ['moduleId', 'operationId', 'artifactHash', 'schemaHash', 'resultSchemaHash', 'effectPolicyHash', 'executorHash', 'protocolVersion', 'trustApprovalId', 'revoked']);
    if (a.revoked || !a.trustApprovalId || a.protocolVersion !== 1 || a.artifactHash !== pin || a.moduleId !== contract.moduleId || a.operationId !== contract.operationId || a.schemaHash !== hash(contract.inputSchema) || a.resultSchemaHash !== hash(contract.snapshotSchema) || a.effectPolicyHash !== hash(contract.effectPolicy) || a.executorHash !== hash(executor)) fail('not_admitted');
  }
  recheck(selected) {
    const current = this.readJSON(selected.admissionPath);
    this.checkAdmission(current, selected.pin, selected.contract, selected.executor);
    if (canonical(current) !== canonical(selected.admission)) fail('admission_changed');
    this.verifyCopy(selected); return true;
  }
  selectEngine() {
    if (!this.catalog.engine) fail('engine_unavailable');
    let selected;
    try { selected = this.selectArtifact(this.catalog.engine.path, this.catalog.engine.artifactHash); } catch (e) { if (e.code === 'ENOENT') fail('engine_unavailable'); throw e; }
    return selected;
  }
  verifyCopy(selected) {
    for (const [relative, digest] of Object.entries(selected.manifest.hashes)) {
      const file = local(selected.path, relative);
      if (hash(fs.readFileSync(file)) !== digest) fail('immutable_integrity');
    }
    if (hash(selected.manifest) !== selected.pin) fail('immutable_integrity');
  }
  selectArtifact(relative, admittedPin) {
    let manifest;
    try { manifest = this.readJSON(relative + '/artifact.json'); } catch (e) { if (e.code === 'ENOENT') fail('module_unavailable'); throw e; }
    exact(manifest, ['id', 'version', 'entry', 'hashes', 'publicDependencies']);
    const pin = hash(manifest);
    if (!admittedPin || admittedPin !== pin) fail('artifact_not_admitted');
    if (!manifest.hashes[manifest.entry] || Object.keys(manifest.hashes).length > 32) fail('invalid_manifest');
    const bytes = {};
    for (const [file, digest] of Object.entries(manifest.hashes)) {
      bytes[file] = this.read(relative + '/' + file);
      if (hash(bytes[file]) !== digest) fail('artifact_substitution');
      if (file.endsWith('.js')) reviewCode(bytes[file]);
    }
    for (const [file, digest] of Object.entries(manifest.publicDependencies || {})) if (hash(this.read(file)) !== digest) fail('dependency_pin');
    const target = path.join(this.store, pin); fs.mkdirSync(target, { recursive: true });
    for (const [file, data] of Object.entries(bytes)) {
      const dest = local(target, file); fs.mkdirSync(path.dirname(dest), { recursive: true });
      if (!fs.existsSync(dest)) {
        const fd = fs.openSync(dest, 'wx'); try { fs.writeSync(fd, data); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
      } else if (hash(fs.readFileSync(dest)) !== manifest.hashes[file]) fail('immutable_integrity');
    }
    return { pin, path: target, manifest, publicDependencies: manifest.publicDependencies };
  }
}
function reviewCode(source) {
  // Admission is reviewed local code, not an untrusted-code sandbox. This conservative
  // guard also rejects computed imports, Node/global ports and dynamic evaluation.
  if (/\b(require|import|eval|Function|process|global|globalThis|fetch|WebSocket|__dirname|__filename)\b/.test(source) || /constructor\s*[\[(.]|__proto__/.test(source)) fail('private_import_denied');
}
module.exports = { Artifacts, reviewCode };

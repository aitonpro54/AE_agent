'use strict';
// Explicit packaging action, never called by startup. Updating admissions still requires review.
const fs = require('node:fs');
const path = require('node:path');
const { hash, fail } = require('../protocol/json');
const root = path.resolve(__dirname, '..');
const reads = [];
function read(file) { reads.push(file); return fs.readFileSync(path.join(root, file), 'utf8'); }
function write(file, data) { fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true }); fs.writeFileSync(path.join(root, file), JSON.stringify(data, null, 2) + '\n'); }
function seal(directory, id, entry, files, deps = {}) {
  const manifest = { id, version: '4.0.0-m1', entry, hashes: Object.fromEntries(files.map(f => [f, hash(read(directory + '/' + f))])), publicDependencies: Object.fromEntries(Object.keys(deps).map(f => [f, hash(read(f))])) };
  write(directory + '/artifact.json', manifest); return { manifest, pin: hash(manifest) };
}
function main() {
  const args = process.argv.slice(2); const all = args.includes('--all');
  const moduleIndex = args.indexOf('--module'), componentIndex = args.indexOf('--component');
  const moduleId = moduleIndex >= 0 ? args[moduleIndex + 1] : null, component = componentIndex >= 0 ? args[componentIndex + 1] : null;
  if ([all, !!moduleId, !!component].filter(Boolean).length !== 1) fail('explicit_packaging_scope_required');
  if (moduleId && !['photo-placeholder', 'titles'].includes(moduleId)) fail('unknown_module');
  if (component && !['core', 'protocol', 'worker', 'engine'].includes(component)) fail('unknown_component');
  let catalog;
  if (all) catalog = { catalogRevision: 'M1-reviewed-local-1', modules: [] };
  else catalog = JSON.parse(read('config/catalog.json'));
  const entries = [];
  for (const id of all ? ['photo-placeholder', 'titles'] : moduleId ? [moduleId] : []) {
    const dir = 'modules/' + id;
    const { pin } = seal(dir, id, 'implementation.js', ['implementation.js', 'contract.json', 'executor.jsx'], { 'protocol/target-contract.json': true });
    const contract = JSON.parse(read(dir + '/contract.json'));
    const admission = { moduleId: id, operationId: contract.operationId, artifactHash: pin, schemaHash: hash(contract.inputSchema), resultSchemaHash: hash(contract.snapshotSchema), effectPolicyHash: hash(contract.effectPolicy), executorHash: hash(read(dir + '/executor.jsx')), protocolVersion: 1, trustApprovalId: 'M1-source-review-' + id + '-20261026', revoked: false };
    // Only --reviewed-source writes admission records: generated hashes are not runtime grants.
    if (args.includes('--reviewed-source')) write('config/admissions/' + id + '.json', admission);
    const entry = { id, version: '4.0.0-m1', path: dir, admission: 'config/admissions/' + id + '.json' };
    const index = catalog.modules.findIndex(m => m.id === id); if (index >= 0) catalog.modules[index] = entry; else catalog.modules.push(entry);
    if (!all) catalog.catalogRevision = 'update-' + id + '-' + pin;
    entries.push(id);
  }
  if (all || component === 'engine') {
    const engine = seal('plan-engine', 'plan-engine', 'index.js', ['index.js']); catalog.engine = { path: 'plan-engine', artifactHash: engine.pin };
    if (!all) catalog.catalogRevision = 'update-engine-' + engine.pin; entries.push('plan-engine');
  }
  if (all || ['core', 'protocol', 'worker'].includes(component)) {
    const protocolFiles = fs.readdirSync(path.join(root, 'protocol')).filter(f => f !== 'artifact.json').sort().map(f => 'protocol/' + f);
    write('protocol/artifact.json', { id: 'protocol', version: 1, hashes: Object.fromEntries(protocolFiles.map(f => [f, hash(read(f))])) });
    const coreFiles = fs.readdirSync(path.join(root, 'core')).filter(f => f !== 'artifact.json').sort().map(f => 'core/' + f).concat(['worker.js', ...protocolFiles, 'protocol/artifact.json']);
    write('core/artifact.json', { id: 'core', version: '4.0.0-m1', hashes: Object.fromEntries(coreFiles.map(f => [f, hash(read(f))])) }); entries.push('protocol', 'core');
  }
  if (all || moduleId || component === 'engine') write('config/catalog.json', catalog);
  console.log(JSON.stringify({ packaged: entries, admissionsWritten: args.includes('--reviewed-source'), ...(args.includes('--trace') ? { reads } : {}), liveCalls: 0 }));
}
if (require.main === module) { try { main(); } catch (e) { console.error(e.code || e.message); process.exitCode = 1; } }
module.exports = { main };

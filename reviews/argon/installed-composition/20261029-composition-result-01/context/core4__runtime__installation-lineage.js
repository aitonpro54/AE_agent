'use strict';
// Historical descriptors/releases are DATA. Never run a historical Node or entry.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { verifyInstallation, verifyRelease, verifyCep } = require('./installation');
const { assertInstallLease } = require('./install-lease');
function fail(code) { throw Object.assign(new Error(code), { code }); }
function canonical(v) { if (v === null || typeof v === 'boolean' || typeof v === 'string' || typeof v === 'number' && Number.isFinite(v)) return JSON.stringify(v); if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']'; if (!v || Object.getPrototypeOf(v) !== Object.prototype) fail('lineage_json'); return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + canonical(v[k])).join(',') + '}'; }
function hash(v) { return crypto.createHash('sha256').update(Buffer.isBuffer(v) || typeof v === 'string' ? v : canonical(v)).digest('hex'); }
function read(file) { if (!path.isAbsolute(file) || path.resolve(file) !== file) fail('lineage_path'); const s = fs.lstatSync(file); if (!s.isFile() || s.isSymbolicLink() || s.reparsePoint || fs.realpathSync(file) !== file) fail('lineage_path'); const b = fs.readFileSync(file); if (b.length > 8 * 1024 * 1024 || !Buffer.from(b.toString('utf8')).equals(b)) fail('lineage_bytes'); return b; }
function historicalDescriptor(bytes, anchor) {
  const d = JSON.parse(bytes.toString('utf8'));
  const keys = ['version', 'installRoot', 'installationId', 'machineId', 'packageHash', 'releaseDir', 'stateDir', 'nodePath', 'nodeHash', 'nodeVersion', 'panelToken', 'controlToken', ...(d.version === 2 ? ['cepDir', 'receiverFormatVersion', 'predecessor'] : [])];
  if (Object.keys(d).length !== keys.length || keys.some(k => !Object.hasOwn(d, k))) fail('lineage_descriptor_schema');
  if (![1, 2].includes(d.version) || d.installRoot !== anchor.installRoot || d.installationId !== anchor.installationId || d.machineId !== anchor.machineId || d.stateDir !== anchor.stateDir || !/^[a-f0-9]{64}$/.test(d.packageHash) || d.releaseDir !== path.join(anchor.installRoot, 'releases', d.packageHash) || !path.isAbsolute(d.nodePath) || !/^[a-f0-9]{64}$/.test(d.nodeHash) || !/^v(2\d|[3-9]\d)\./.test(d.nodeVersion) || !/^[a-f0-9]{64}$/.test(d.panelToken) || !/^[a-f0-9]{64}$/.test(d.controlToken) || d.panelToken === d.controlToken) fail('lineage_descriptor_binding');
  if (d.version === 1 && Object.hasOwn(d, 'predecessor')) fail('lineage_legacy_predecessor');
  if (d.version === 2 && (d.receiverFormatVersion !== 2 || !path.isAbsolute(d.cepDir) || !Object.hasOwn(d, 'predecessor'))) fail('lineage_descriptor_v2');
  if (d.version === 2 && d.predecessor !== null && (!d.predecessor || Object.keys(d.predecessor).sort().join(',') !== 'previousDescriptorHash,transactionId' || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(d.predecessor.transactionId) || !/^[a-f0-9]{64}$/.test(d.predecessor.previousDescriptorHash))) fail('lineage_predecessor');
  const release = JSON.parse(read(path.join(d.releaseDir, 'release.json')));
  if (hash(release) !== d.packageHash) fail('lineage_package_binding'); verifyRelease(d.releaseDir, release);
  return { descriptor: Object.freeze(d), descriptorHash: hash(bytes), release };
}
function resolve({ descriptorPath, descriptorHash, cepDir }, preparedCurrent) {
  if (!/^[a-f0-9]{64}$/.test(descriptorHash)) fail('lineage_target_required');
  const current = preparedCurrent || verifyInstallation(descriptorPath, { ...(cepDir ? { cepDir } : {}) }), anchor = current;
  let bytes = read(descriptorPath), childEdge = null, transactionNames;
  const hashes = new Set(), transactionIds = new Set(), edges = [];
  while (true) {
    const node = historicalDescriptor(bytes, anchor), d = node.descriptor;
    if (hashes.has(node.descriptorHash)) fail('lineage_cycle'); hashes.add(node.descriptorHash);
    if (node.descriptorHash === descriptorHash) return Object.freeze({ current, historical: node, edgeFromHistorical: childEdge, edges: Object.freeze(edges) });
    if (d.version !== 2 || d.predecessor === null) fail('lineage_target_unreachable');
    const p = d.predecessor;
    if (!p || Object.keys(p).sort().join(',') !== 'previousDescriptorHash,transactionId' || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(p.transactionId) || !/^[a-f0-9]{64}$/.test(p.previousDescriptorHash) || transactionIds.has(p.transactionId)) fail('lineage_predecessor');
    if (!transactionNames) {
      const directory = path.join(anchor.installRoot, 'transactions'), stat = fs.lstatSync(directory);
      if (!stat.isDirectory() || stat.isSymbolicLink() || stat.reparsePoint || fs.realpathSync(directory) !== directory) fail('lineage_path');
      // A private, single-call snapshot bounds the traversal by existing history,
      // not by the lifetime number of updates. Each edge consumes one unique ID;
      // later files cannot extend the walk. Membership is not trust: read/hash/
      // schema checks below still verify every referenced transaction and release.
      transactionNames = new Set(fs.readdirSync(directory).filter(name => /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}\.json$/.test(name)));
    }
    if (!transactionNames.has(p.transactionId + '.json')) fail('lineage_transaction_not_in_snapshot');
    transactionIds.add(p.transactionId);
    const file = path.join(anchor.installRoot, 'transactions', p.transactionId + '.json'), t = JSON.parse(read(file));
    if (t.version !== 2 || t.transactionId !== p.transactionId || t.installRoot !== anchor.installRoot || t.stateDir !== anchor.stateDir || t.descriptorPath !== descriptorPath || t.appliedDescriptorHash !== node.descriptorHash || typeof t.previousDescriptor !== 'string') fail('lineage_transaction_binding');
    const previous = Buffer.from(t.previousDescriptor, 'base64');
    if (previous.toString('base64') !== t.previousDescriptor || hash(previous) !== p.previousDescriptorHash) fail('lineage_previous_bytes');
    if (!/^[a-f0-9]{64}$/.test(t.preparedPlanHash) || !/^[a-f0-9]{64}$/.test(t.preparedStateHash)) fail('lineage_prepared_plan');
    childEdge = Object.freeze({ transactionId: t.transactionId, childDescriptorHash: node.descriptorHash, childPackageHash: d.packageHash, parentDescriptorHash: p.previousDescriptorHash, preparedPlanHash: t.preparedPlanHash, preparedStateHash: t.preparedStateHash, childNodePath: d.nodePath, childNodeHash: d.nodeHash, childNodeVersion: d.nodeVersion, childCepDir: d.cepDir }); edges.push(childEdge); bytes = previous;
  }
}
function resolveHistoricalInstallation(options) {
  if (Object.keys(options).some(k => !['descriptorPath', 'descriptorHash', 'cepDir'].includes(k))) fail('lineage_runtime_options');
  return resolve(options);
}
function resolveHistoricalForInstall({ descriptorPath, descriptorHash, cepDir, lease, plan }) {
  const d = JSON.parse(read(descriptorPath)); assertInstallLease(lease, { installRoot: d.installRoot, stateDir: d.stateDir, descriptorPath });
  // Same private plan, held lease and already-running candidate Node are all
  // mandatory. No Boolean selects weaker runtime verification.
  const fingerprint = require('../tools/install-core4').assertPreparedInstallPlan(plan), c = plan.descriptor;
  if (descriptorPath !== path.join(d.installRoot, 'installation.json') || plan.descriptorPath !== descriptorPath || c.nodePath !== process.execPath || c.nodeHash !== hash(fs.readFileSync(process.execPath)) || c.nodeVersion !== process.version || fingerprint.previousDescriptorHash !== hash(read(descriptorPath))) fail('lineage_install_candidate');
  const node = historicalDescriptor(read(descriptorPath), d), origin = JSON.parse(read(path.join(d.installRoot, 'origin.json'))), anchor = JSON.parse(read(path.join(d.stateDir, 'origin.json')));
  if (canonical(origin) !== canonical(anchor) || origin.installationId !== d.installationId || origin.machineId !== d.machineId || d.stateDir !== path.join(d.installRoot, 'state/production')) fail('lineage_origin');
  verifyCep(d, node.release, d.version === 2 ? d.cepDir : cepDir);
  return resolve({ descriptorPath, descriptorHash, cepDir }, node.descriptor);
}
module.exports = { resolveHistoricalInstallation, resolveHistoricalForInstall };

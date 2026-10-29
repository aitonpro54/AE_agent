# core4/runtime/installation-lineage.js

Commit: e6cde7c1f061763b6d0008162580039d2717aeb7
Full source SHA-256: 5575ccf7651e83a1545916fc88edb268ab3a72b08d57703b6d5df564a45d894a
Classification: INTERNAL; source code/documentation only.

## Source lines 1-70

```text
1: 'use strict';
2: // Historical descriptors/releases are DATA. Never run a historical Node or entry.
3: const fs = require('node:fs');
4: const path = require('node:path');
5: const crypto = require('node:crypto');
6: const { verifyInstallation, verifyRelease, verifyCep } = require('./installation');
7: const { assertInstallLease } = require('./install-lease');
8: function fail(code) { throw Object.assign(new Error(code), { code }); }
9: function canonical(v) { if (v === null || typeof v === 'boolean' || typeof v === 'string' || typeof v === 'number' && Number.isFinite(v)) return JSON.stringify(v); if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']'; if (!v || Object.getPrototypeOf(v) !== Object.prototype) fail('lineage_json'); return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + canonical(v[k])).join(',') + '}'; }
10: function hash(v) { return crypto.createHash('sha256').update(Buffer.isBuffer(v) || typeof v === 'string' ? v : canonical(v)).digest('hex'); }
11: function read(file) { if (!path.isAbsolute(file) || path.resolve(file) !== file) fail('lineage_path'); const s = fs.lstatSync(file); if (!s.isFile() || s.isSymbolicLink() || s.reparsePoint || fs.realpathSync(file) !== file) fail('lineage_path'); const b = fs.readFileSync(file); if (b.length > 8 * 1024 * 1024 || !Buffer.from(b.toString('utf8')).equals(b)) fail('lineage_bytes'); return b; }
12: function historicalDescriptor(bytes, anchor) {
13:   const d = JSON.parse(bytes.toString('utf8'));
14:   const keys = ['version', 'installRoot', 'installationId', 'machineId', 'packageHash', 'releaseDir', 'stateDir', 'nodePath', 'nodeHash', 'nodeVersion', 'panelToken', 'controlToken', ...(d.version === 2 ? ['cepDir', 'receiverFormatVersion', 'predecessor'] : [])];
15:   if (Object.keys(d).length !== keys.length || keys.some(k => !Object.hasOwn(d, k))) fail('lineage_descriptor_schema');
16:   if (![1, 2].includes(d.version) || d.installRoot !== anchor.installRoot || d.installationId !== anchor.installationId || d.machineId !== anchor.machineId || d.stateDir !== anchor.stateDir || !/^[a-f0-9]{64}$/.test(d.packageHash) || d.releaseDir !== path.join(anchor.installRoot, 'releases', d.packageHash) || !path.isAbsolute(d.nodePath) || !/^[a-f0-9]{64}$/.test(d.nodeHash) || !/^v(2\d|[3-9]\d)\./.test(d.nodeVersion) || !/^[a-f0-9]{64}$/.test(d.panelToken) || !/^[a-f0-9]{64}$/.test(d.controlToken) || d.panelToken === d.controlToken) fail('lineage_descriptor_binding');
17:   if (d.version === 1 && Object.hasOwn(d, 'predecessor')) fail('lineage_legacy_predecessor');
18:   if (d.version === 2 && (d.receiverFormatVersion !== 2 || !path.isAbsolute(d.cepDir) || !Object.hasOwn(d, 'predecessor'))) fail('lineage_descriptor_v2');
19:   if (d.version === 2 && d.predecessor !== null && (!d.predecessor || Object.keys(d.predecessor).sort().join(',') !== 'previousDescriptorHash,transactionId' || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(d.predecessor.transactionId) || !/^[a-f0-9]{64}$/.test(d.predecessor.previousDescriptorHash))) fail('lineage_predecessor');
20:   const release = JSON.parse(read(path.join(d.releaseDir, 'release.json')));
21:   if (hash(release) !== d.packageHash) fail('lineage_package_binding'); verifyRelease(d.releaseDir, release);
22:   return { descriptor: Object.freeze(d), descriptorHash: hash(bytes), release };
23: }
24: function resolve({ descriptorPath, descriptorHash, cepDir }, preparedCurrent) {
25:   if (!/^[a-f0-9]{64}$/.test(descriptorHash)) fail('lineage_target_required');
26:   const current = preparedCurrent || verifyInstallation(descriptorPath, { ...(cepDir ? { cepDir } : {}) }), anchor = current;
27:   let bytes = read(descriptorPath), childEdge = null, transactionNames;
28:   const hashes = new Set(), transactionIds = new Set(), edges = [];
29:   while (true) {
30:     const node = historicalDescriptor(bytes, anchor), d = node.descriptor;
31:     if (hashes.has(node.descriptorHash)) fail('lineage_cycle'); hashes.add(node.descriptorHash);
32:     if (node.descriptorHash === descriptorHash) return Object.freeze({ current, historical: node, edgeFromHistorical: childEdge, edges: Object.freeze(edges) });
33:     if (d.version !== 2 || d.predecessor === null) fail('lineage_target_unreachable');
34:     const p = d.predecessor;
35:     if (!p || Object.keys(p).sort().join(',') !== 'previousDescriptorHash,transactionId' || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(p.transactionId) || !/^[a-f0-9]{64}$/.test(p.previousDescriptorHash) || transactionIds.has(p.transactionId)) fail('lineage_predecessor');
36:     if (!transactionNames) {
37:       const directory = path.join(anchor.installRoot, 'transactions'), stat = fs.lstatSync(directory);
38:       if (!stat.isDirectory() || stat.isSymbolicLink() || stat.reparsePoint || fs.realpathSync(directory) !== directory) fail('lineage_path');
39:       // A private, single-call snapshot bounds the traversal by existing history,
40:       // not by the lifetime number of updates. Each edge consumes one unique ID;
41:       // later files cannot extend the walk. Membership is not trust: read/hash/
42:       // schema checks below still verify every referenced transaction and release.
43:       transactionNames = new Set(fs.readdirSync(directory).filter(name => /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}\.json$/.test(name)));
44:     }
45:     if (!transactionNames.has(p.transactionId + '.json')) fail('lineage_transaction_not_in_snapshot');
46:     transactionIds.add(p.transactionId);
47:     const file = path.join(anchor.installRoot, 'transactions', p.transactionId + '.json'), t = JSON.parse(read(file));
48:     if (t.version !== 2 || t.transactionId !== p.transactionId || t.installRoot !== anchor.installRoot || t.stateDir !== anchor.stateDir || t.descriptorPath !== descriptorPath || t.appliedDescriptorHash !== node.descriptorHash || typeof t.previousDescriptor !== 'string') fail('lineage_transaction_binding');
49:     const previous = Buffer.from(t.previousDescriptor, 'base64');
50:     if (previous.toString('base64') !== t.previousDescriptor || hash(previous) !== p.previousDescriptorHash) fail('lineage_previous_bytes');
51:     if (!/^[a-f0-9]{64}$/.test(t.preparedPlanHash) || !/^[a-f0-9]{64}$/.test(t.preparedStateHash)) fail('lineage_prepared_plan');
52:     childEdge = Object.freeze({ transactionId: t.transactionId, childDescriptorHash: node.descriptorHash, childPackageHash: d.packageHash, parentDescriptorHash: p.previousDescriptorHash, preparedPlanHash: t.preparedPlanHash, preparedStateHash: t.preparedStateHash, childNodePath: d.nodePath, childNodeHash: d.nodeHash, childNodeVersion: d.nodeVersion, childCepDir: d.cepDir }); edges.push(childEdge); bytes = previous;
53:   }
54: }
55: function resolveHistoricalInstallation(options) {
56:   if (Object.keys(options).some(k => !['descriptorPath', 'descriptorHash', 'cepDir'].includes(k))) fail('lineage_runtime_options');
57:   return resolve(options);
58: }
59: function resolveHistoricalForInstall({ descriptorPath, descriptorHash, cepDir, lease, plan }) {
60:   const d = JSON.parse(read(descriptorPath)); assertInstallLease(lease, { installRoot: d.installRoot, stateDir: d.stateDir, descriptorPath });
61:   // Same private plan, held lease and already-running candidate Node are all
62:   // mandatory. No Boolean selects weaker runtime verification.
63:   const fingerprint = require('../tools/install-core4').assertPreparedInstallPlan(plan), c = plan.descriptor;
64:   if (descriptorPath !== path.join(d.installRoot, 'installation.json') || plan.descriptorPath !== descriptorPath || c.nodePath !== process.execPath || c.nodeHash !== hash(fs.readFileSync(process.execPath)) || c.nodeVersion !== process.version || fingerprint.previousDescriptorHash !== hash(read(descriptorPath))) fail('lineage_install_candidate');
65:   const node = historicalDescriptor(read(descriptorPath), d), origin = JSON.parse(read(path.join(d.installRoot, 'origin.json'))), anchor = JSON.parse(read(path.join(d.stateDir, 'origin.json')));
66:   if (canonical(origin) !== canonical(anchor) || origin.installationId !== d.installationId || origin.machineId !== d.machineId || d.stateDir !== path.join(d.installRoot, 'state/production')) fail('lineage_origin');
67:   verifyCep(d, node.release, d.version === 2 ? d.cepDir : cepDir);
68:   return resolve({ descriptorPath, descriptorHash, cepDir }, node.descriptor);
69: }
70: module.exports = { resolveHistoricalInstallation, resolveHistoricalForInstall };
```


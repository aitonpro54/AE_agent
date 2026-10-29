# core4/tools/install-core4.js

Commit: e6cde7c1f061763b6d0008162580039d2717aeb7
Full source SHA-256: 5bb6471e03687205f040966ccd245ae520b6e6a5f1e7659dfdc4922c8873262c
Classification: INTERNAL; source code/documentation only.

## Source lines 88-138

```text
88: function planInstall({ pkg, nodePath, installRoot, extensionsDir, configPath, machineId }) {
89:   verifyPackage(pkg);
90:   const receiverContract = pkg.files['runtime/receiver-contract.json'] && JSON.parse(Buffer.from(pkg.files['runtime/receiver-contract.json'], 'base64'));
91:   if (!receiverContract || receiverContract.version !== 1 || receiverContract.descriptorVersion !== 2 || receiverContract.journalFormat !== 2 || receiverContract.terminalReadFailureDispositionVersion !== 1) fail('candidate_receiver_contract_unsupported');
92:   for (const value of [nodePath, installRoot, extensionsDir, configPath]) if (!path.isAbsolute(value)) fail('absolute_install_paths_required');
93:   if (path.basename(installRoot).toLowerCase() !== 'aeagentcore4' || path.basename(path.join(extensionsDir, BUNDLE)) !== BUNDLE) fail('install_scope');
94:   nodePath = path.resolve(nodePath);
95:   const resolvedNode = fs.realpathSync(nodePath); if (resolvedNode !== nodePath) fail('node_path_not_exact');
96:   if (path.resolve(process.execPath).toLowerCase() !== nodePath.toLowerCase()) fail('installer_candidate_node_must_be_current_process');
97:   const version = process.version;
98:   if (!/^v(2\d|[3-9]\d)\./.test(version)) fail('node_20_required');
99:   const releaseDir = path.join(installRoot, 'releases', pkg.packageHash), descriptor = path.join(installRoot, 'installation.json'), stateDir = path.join(installRoot, 'state', 'production'), cepDir = path.join(extensionsDir, BUNDLE);
100:   const originBytes = bytes(path.join(installRoot, 'origin.json')), anchorBytes = bytes(path.join(stateDir, 'origin.json'));
101:   if (!!originBytes !== !!anchorBytes || (originBytes && !originBytes.equals(anchorBytes))) fail('stable_state_origin_missing_or_mismatch');
102:   if (!originBytes && (fs.existsSync(descriptor) || fs.existsSync(cepDir) || fs.existsSync(stateDir))) fail('existing_installation_without_origin');
103:   const origin = originBytes ? JSON.parse(originBytes) : { version: 1, installationId: 'installation-' + crypto.randomUUID(), machineId: machineId || os.hostname(), createdAt: new Date().toISOString() };
104:   if (origin.machineId !== (machineId || os.hostname())) fail('machine_origin_mismatch');
105:   const previousDescriptor = bytes(descriptor), previousConfig = bytes(configPath), previousCep = snapshot(cepDir);
106:   if (previousDescriptor) {
107:     const old = JSON.parse(previousDescriptor); if (old.installationId !== origin.installationId || old.installRoot !== installRoot || old.stateDir !== stateDir) fail('installation_identity_mismatch');
108:     if (old.version === 2 && old.cepDir !== cepDir) fail('installation_cep_binding_change_unsupported');
109:   }
110:   const transactionId = crypto.randomUUID();
111:   const d = { version: 2, installRoot, installationId: origin.installationId, machineId: origin.machineId, packageHash: pkg.packageHash, releaseDir, stateDir, nodePath, nodeHash: hash(fs.readFileSync(nodePath)), nodeVersion: version, panelToken: crypto.randomBytes(32).toString('hex'), controlToken: crypto.randomBytes(32).toString('hex'), cepDir, receiverFormatVersion: 2, predecessor: previousDescriptor ? { transactionId, previousDescriptorHash: hash(previousDescriptor) } : null };
112:   const inspection = JSON.parse(Buffer.from(pkg.files['modules/project-inspection/artifact.json'], 'base64'));
113:   const manualAdmission = JSON.parse(Buffer.from(pkg.files['config/admissions/titles-current-target.json'], 'base64'));
114:   const cep = Object.fromEntries(Object.entries(pkg.files).filter(([f]) => f.startsWith('cep/')).map(([f, data]) => [f.slice(4), data]));
115:   cep['installation.js'] = Buffer.from('window.Core4Installation=' + canonical({ installationId: d.installationId, packageHash: d.packageHash, panelToken: d.panelToken, executorHash: inspection.executorHash, assetKey: 'project-inspection-v1', assets: [{ assetKey: 'project-inspection-v1', executorHash: inspection.executorHash, phases: ['inspect'] }, { assetKey: 'titles-current-target-v1', executorHash: manualAdmission.executorHash, phases: ['inspect', 'mutate', 'verify'] }] }) + ';\n').toString('base64');
116:   const nextConfig = configText(previousConfig, descriptor, nodePath, path.join(releaseDir, 'runtime/stdio-entry.js'));
117:   const plan = { pkg, origin, transactionId, descriptor: d, descriptorPath: descriptor, configPath, nextConfig, cepDir, cep, previousDescriptor, previousConfig, previousCep, baseline: { config: previousConfig ? hash(previousConfig) : null, descriptor: previousDescriptor ? hash(previousDescriptor) : null, cep: treeHash(previousCep) } };
118:   preparedPlans.set(plan, { digest: planDigest(plan), prepared: null }); return plan;
119: }
120: function assertBaseline(plan) { if ((bytes(plan.configPath) ? hash(bytes(plan.configPath)) : null) !== plan.baseline.config || (bytes(plan.descriptorPath) ? hash(bytes(plan.descriptorPath)) : null) !== plan.baseline.descriptor || treeHash(snapshot(plan.cepDir)) !== plan.baseline.cep) fail('install_baseline_changed'); }
121: function entryExists(file) { try { fs.lstatSync(file); return true; } catch (e) { if (e.code === 'ENOENT') return false; throw e; } }
122: function assertRuntimeStopped(stateDir, { lease, descriptorPath, cepDir, plan } = {}) {
123:   const scope = { installRoot: path.resolve(stateDir, '../..'), stateDir, descriptorPath };
124:   const owned = lease ? (assertInstallLease(lease, scope), ownedLeaseGates(lease)) : new Map();
125:   for (const relative of ['broker/broker-owner.lock', 'broker/broker-owner.gate', 'receiver/owner']) {
126:     const file = path.join(stateDir, relative);
127:     if (entryExists(file) && !(relative === 'broker/broker-owner.gate' && owned.has(file) && fs.readFileSync(file).equals(owned.get(file)))) fail('runtime_state_owned_or_unknown');
128:   }
129:   const ledger = path.join(stateDir, 'broker/ledger.ndjson');
130:   if (entryExists(ledger)) {
131:     const stat = fs.lstatSync(ledger); if (stat.isSymbolicLink() || fs.realpathSync(ledger) !== ledger) fail('runtime_ledger_unknown');
132:     const { Ledger } = require('../core/ledger'); const value = new Ledger(ledger); if (value.corrupt || value.unresolved().length) fail('runtime_ledger_unresolved');
133:   }
134:   if (entryExists(path.join(stateDir, 'receiver/completions.ndjson'))) {
135:     const options = { directory: path.join(stateDir, 'receiver'), descriptorPath, cepDir };
136:     if (plan) require('./disposition-install-preflight').assertPreparedReceiverJournalSettled({ ...options, plan, lease });
137:     else require('../runtime/native-read-disposition').assertReceiverJournalSettled(options);
138:   }
```

## Source lines 158-204

```text
158: function applyInstall(plan, { lease: borrowed } = {}) {
159:   let fingerprint = assertPreparedInstallPlan(plan);
160:   assertBaseline(plan);
161:   const d = plan.descriptor; fs.mkdirSync(d.installRoot, { recursive: true });
162:   const scope = { installRoot: d.installRoot, stateDir: d.stateDir, descriptorPath: plan.descriptorPath };
163:   const lease = borrowed || acquireInstallLease(scope); assertInstallLease(lease, scope);
164:   let txnFile, txn, writes = false;
165:   try {
166:     assertBaseline(plan);
167:     if (d.version !== 2 || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(plan.transactionId) || (plan.previousDescriptor ? canonical(d.predecessor) !== canonical({ transactionId: plan.transactionId, previousDescriptorHash: hash(plan.previousDescriptor) }) : d.predecessor !== null)) fail('install_lineage_plan');
168:     assertRuntimeStopped(d.stateDir, { lease, descriptorPath: plan.descriptorPath, cepDir: plan.cepDir, plan });
169:     writes = true;
170:     fs.mkdirSync(path.join(d.installRoot, 'transactions'), { recursive: true });
171:     fingerprint = prepareInstallPlan(plan, { lease });
172:     checkpointInstallLease(lease, 'installing');
173:     // State is stable across reinstall and rollback; no cleanup/reclaim is performed.
174:     if (!fs.existsSync(path.join(d.installRoot, 'origin.json'))) {
175:       writes = true;
176:       durable(path.join(d.installRoot, 'origin.json'), canonical(plan.origin));
177:       durable(path.join(d.stateDir, 'origin.json'), canonical(plan.origin));
178:     }
179:     if (!fs.existsSync(d.releaseDir)) {
180:       writes = true;
181:       const stage = path.join(d.installRoot, 'releases', '.stage-' + crypto.randomUUID());
182:       for (const [relative, b64] of Object.entries(plan.pkg.files)) durable(path.join(stage, relative), Buffer.from(b64, 'base64'));
183:       durable(path.join(stage, 'release.json'), canonical(plan.pkg.release)); checkRelease(stage, plan.pkg.release); fs.renameSync(stage, d.releaseDir);
184:     }
185:     checkRelease(d.releaseDir, plan.pkg.release);
186:     const transactionId = plan.transactionId; txnFile = path.join(d.installRoot, 'transactions', transactionId + '.json');
187:     const backupCep = path.join(d.installRoot, 'transactions', transactionId + '-cep');
188:     txn = { version: 2, transactionId, preparedPlanHash: fingerprint.preparedPlanHash, preparedStateHash: fingerprint.preparedStateHash, installRoot: d.installRoot, descriptorPath: plan.descriptorPath, configPath: plan.configPath, cepDir: plan.cepDir, backupCep, previousDescriptor: plan.previousDescriptor?.toString('base64') || null, previousConfig: plan.previousConfig?.toString('base64') || null, previousCepHash: treeHash(plan.previousCep), appliedDescriptorHash: hash(canonical(d)), appliedConfigHash: hash(plan.nextConfig), appliedCepHash: treeHash(plan.cep), stateDir: d.stateDir };
189:     writes = true;
190:     durable(txnFile, canonical(txn));
191:     // Last CAS before any visible switch. Unknown filesystem outcomes are not retried.
192:     assertBaseline(plan);
193:     if (fs.existsSync(plan.cepDir)) fs.renameSync(plan.cepDir, backupCep);
194:     restoreTree(plan.cepDir, plan.cep);
195:     durable(plan.descriptorPath + '.next', canonical(d));
196:     durable(plan.configPath + '.core4-next', plan.nextConfig);
197:     fs.renameSync(plan.descriptorPath + '.next', plan.descriptorPath);
198:     fs.renameSync(plan.configPath + '.core4-next', plan.configPath);
199:     if (hash(bytes(plan.descriptorPath)) !== txn.appliedDescriptorHash || hash(bytes(plan.configPath)) !== txn.appliedConfigHash || treeHash(snapshot(plan.cepDir)) !== txn.appliedCepHash) fail('install_readback_mismatch');
200:     require('../runtime/installation').verifyInstallation(plan.descriptorPath); checkpointInstallLease(lease, 'installed');
201:     return { installed: true, packageHash: d.packageHash, installationId: d.installationId, descriptorPath: plan.descriptorPath, transactionFile: txnFile, stateDir: d.stateDir, requiresPanelOpen: true, requiresMcpReconnect: true, liveProof: false };
202:   } catch (e) { if (writes) { retainInstallLease(lease); e.leaseRetained = true; if (txnFile) e.transactionFile = txnFile; } throw e; }
203:   finally { if (!borrowed) { const state = assertInstallLease(lease, scope); if (!state.retained) releaseInstallLease(lease); } }
204: }
```


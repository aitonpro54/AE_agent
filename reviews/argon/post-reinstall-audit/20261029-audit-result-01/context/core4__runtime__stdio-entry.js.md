# core4/runtime/stdio-entry.js

Commit: e6cde7c1f061763b6d0008162580039d2717aeb7
Full source SHA-256: 213e711c6c8f7324c8de788d4bbb015a6400b56a440fd4b86020a5b2571c3909
Classification: INTERNAL; source code/documentation only.

## Source lines 40-51

```text
40: function verifyCep(d, manifest, cepDir) {
41:   assertPlainPath(cepDir, true); if (path.basename(cepDir) !== 'com.codex.aeagentcore4') fail('installation_cep_scope');
42:   const inspection = JSON.parse(fs.readFileSync(path.join(d.releaseDir, 'modules/project-inspection/artifact.json'), 'utf8'));
43:   const manual = JSON.parse(fs.readFileSync(path.join(d.releaseDir, 'config/admissions/titles-current-target.json'), 'utf8'));
44:   const expected = Object.fromEntries(Object.entries(manifest.hashes).filter(([file]) => file.startsWith('cep/')).map(([file, digest]) => [file.slice(4), digest]));
45:   if (Object.keys(expected).length !== 6) fail('installation_cep_closure');
46:   const cfg = { installationId: d.installationId, packageHash: d.packageHash, panelToken: d.panelToken, executorHash: inspection.executorHash, assetKey: 'project-inspection-v1', assets: [{ assetKey: 'project-inspection-v1', executorHash: inspection.executorHash, phases: ['inspect'] }, { assetKey: 'titles-current-target-v1', executorHash: manual.executorHash, phases: ['inspect', 'mutate', 'verify'] }] };
47:   expected['installation.js'] = hash('window.Core4Installation=' + canonical(cfg) + ';\n');
48:   const files = new Set(Object.keys(expected)), dirs = new Set(['']); for (const file of files) for (let dir = path.posix.dirname(file); dir !== '.'; dir = path.posix.dirname(dir)) dirs.add(dir);
49:   function visit(directory, relative) { assertPlainPath(directory, true); if (!dirs.delete(relative)) fail('installation_cep_tree'); for (const name of fs.readdirSync(directory)) { const file = path.join(directory, name), rel = relative ? relative + '/' + name : name, stat = fs.lstatSync(file); assertPlainPath(file, stat.isDirectory()); if (stat.isDirectory()) visit(file, rel); else if (!files.delete(rel) || hash(fs.readFileSync(file)) !== expected[rel]) fail('installation_cep_bytes'); } }
50:   visit(cepDir, ''); if (files.size || dirs.size) fail('installation_cep_tree');
51: }
```

## Source lines 88-133

```text
88:   const { createWindowsReservationProvider } = require('./windows-reservation-provider.js');
89:   const { createManualPolicy } = require('./manual-policy.js');
90:   const profile = JSON.parse(fs.readFileSync(path.join(root, 'runtime/profiles.json'), 'utf8')).profiles.find(p => p.id === 'project-inspection');
91:   if (!profile || profile.path !== 'modules/project-inspection' || profile.executionPolicy !== 'read-only-current-observation-v1') fail('inspection_profile_not_admitted');
92:   const contract = JSON.parse(fs.readFileSync(path.join(root, profile.path, 'contract.json'), 'utf8'));
93:   const admission = JSON.parse(fs.readFileSync(path.join(root, profile.path, 'artifact.json'), 'utf8'));
94:   const source = fs.readFileSync(path.join(root, profile.path, 'executor.jsx'), 'utf8');
95:   if (admission.executorHash !== hash(source) || admission.contractHash !== hash(contract) || admission.executionPolicy !== profile.executionPolicy) fail('inspection_admission');
96:   const asset = { assetKey: 'project-inspection-v1', executorHash: admission.executorHash };
97:   const manualPath = path.join(root, 'modules/titles-current-target');
98:   const manualContract = JSON.parse(fs.readFileSync(path.join(manualPath, 'contract.json'), 'utf8'));
99:   const manualManifest = JSON.parse(fs.readFileSync(path.join(manualPath, 'artifact.json'), 'utf8'));
100:   const manualAdmission = JSON.parse(fs.readFileSync(path.join(root, 'config/admissions/titles-current-target.json'), 'utf8'));
101:   const selectedManual = { pin: hash(manualManifest), contract: manualContract, admission: manualAdmission };
102:   const provider = createWindowsReservationProvider({ installation, getBroker: () => broker, getPeer: () => peer });
103:   const manual = createManualPolicy({ selected: selectedManual, provider, installation, getPeer: () => peer });
104:   const transport = { identity: hash({ packageHash: installation.packageHash, manualAdmission }), connect: value => peer.transport.connect(value), send: value => peer.transport.send(value), completion: value => peer.transport.completion(value), disconnect: () => peer.transport.disconnect() };
105:   broker = new Broker({ root, stateDir: path.join(installation.stateDir, 'broker'), transportTimeout: PRODUCTION_TIMING.callerTimeoutMs, privateEmbedding: { authority: manual.authority, executionPolicy: manual.port, transport } });
106:   const admissionGuard = command => {
107:     if (broker.closed) fail('broker_closed');
108:     if (broker.stateLock.error) fail(broker.stateLock.error);
109:     if (broker.ledger.corrupt) fail('ledger_corrupt');
110:     if (broker.ledger.unresolved().some(c => c.commandId !== command?.commandId)) fail('controller_unresolved');
111:   };
112:   peer = createHttpPeer({ installation, directory: path.join(installation.stateDir, 'receiver'), asset, additionalAssets: [{ assetKey: 'titles-current-target-v1', moduleId: 'titles-current-target', operationId: manualContract.operationId, executorHash: manualAdmission.executorHash, resultProfile: 'manual-text-v1' }], timeout: PRODUCTION_TIMING.callbackTimeoutMs, port, admissionGuard, installationContext: { descriptorPath: descriptor } });
113:   const contractId = hash({ packageHash: installation.packageHash, admission, contract }); let closed = false;
114:   const facade = Object.create(broker);
115:   facade.status = () => ({ ...broker.status(), product: 'AE Agent Core 4.0.0', installation: { installationId: installation.installationId, packageHash: installation.packageHash, nodeVersion: process.versions.node, nodeVerified: true, machineId: installation.machineId }, physical: peer.status(), automaticLifecycle: 'unavailable', inspectionPolicy: profile.executionPolicy, manualPolicy: manual.policyId, resourceProvider: provider.status(), externalLegacyCoverage: 'unobserved' });
116:   facade.diagnostics = () => ({ ...broker.diagnostics(), ...facade.status() });
117:   facade.connect = async () => ({ ...await broker.connect(), automaticLifecycle: 'unavailable', physical: peer.status() });
118:   facade.disconnect = async () => ({ disconnected: false, reason: 'physical_link_owned_by_stdio_lifetime', physical: peer.status() });
119:   facade.listModules = value => { const result = broker.listModules(value); return { ...result, modules: [...result.modules, { id: profile.id, version: '4.0.0', executionPolicy: profile.executionPolicy }] }; };
120:   facade.getContract = value => { if (value.moduleId !== profile.id) return broker.getContract(value); exact(value, ['moduleId']); return { contractId, moduleId: profile.id, operationId: contract.operationId, modulePin: hash(admission), contract: JSON.parse(canonical(contract)) }; };
121:   facade.inspect = async value => {
122:     if (value.contractId !== contractId) return broker.inspect(value);
123:     exact(value, ['moduleId', 'contractId', 'target']);
124:     if (value.moduleId !== profile.id) fail('contract_identity');
125:     const result = await peer.inspect(value.target || {});
126:     if (result.observation?.readFailureVersion === 1) fail(result.observation.code || 'inspection_failed');
127:     return { evidenceRef: id('observation'), moduleId: profile.id, contractId, ...result, authority: false };
128:   };
129:   facade.build = value => { if (value.contractId === contractId || value.steps?.some(s => s.contractId === contractId)) fail('read_only_module_build_unsupported'); return broker.build(value); };
130:   facade.close = async () => { if (closed) return; closed = true; await peer.close(); await broker.close(); };
131:   try { await peer.listen(); } catch (e) { await facade.close(); throw e; }
132:   serve(facade, input, output, { serverInfo: { name: 'ae-agent-core4', version: '4.0.0' } });
133:   return { close: facade.close, status: facade.status };
```


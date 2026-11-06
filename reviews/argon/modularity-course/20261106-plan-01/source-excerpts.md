## core4/runtime/stdio-entry.js lines 19-85 full-file SHA256 a923e0d9b7f2d37aa7225cbdc7ee5aee82308c1b2ccfe1a93352d9b95d764837
19: function deriveComposition(release, read) {
20:   if (release.format !== 1 && release.format !== 2) fail('release_format');
21:   const checked = file => { if (!Object.hasOwn(release.hashes, file)) fail('composition_unhashed_path'); const bytes = read(file); if (hash(bytes) !== release.hashes[file]) fail('composition_bytes'); return bytes; };
22:   const json = file => JSON.parse(checked(file));
23:   if (release.format === 1) {
24:     if (Object.hasOwn(release.hashes, 'runtime/composition.json')) fail('composition_downgrade');
25:     if (!Object.hasOwn(release.hashes, 'runtime/profiles.json') || !Object.hasOwn(release.hashes, 'runtime/source-package.json')) fail('composition_downgrade');
26:     const inspection = json('modules/project-inspection/artifact.json');
27:     const manual = json('config/admissions/titles-current-target.json');
28:     return { legacy: true, assets: [{ assetKey: 'project-inspection-v1', executorHash: inspection.executorHash, phases: ['inspect'] }, { assetKey: 'titles-current-target-v1', executorHash: manual.executorHash, phases: ['inspect', 'mutate', 'verify'] }] };
29:   }
30:   if (!Object.hasOwn(release.hashes, 'runtime/composition.json')) fail('composition_required');
31:   const composition = json('runtime/composition.json'); exactKeys(composition, ['version', 'id', 'modules', 'engine', 'assets']);
32:   if (composition.version !== 1 || !['readonly', 'manual', 'manual-layout', 'manual-titles', 'manual-titles-variants'].includes(composition.id) || !Array.isArray(composition.modules) || !Array.isArray(composition.assets)) fail('composition_schema');
33:   const catalog = json('config/catalog.json'); exactKeys(catalog, ['catalogRevision', 'modules', 'engine']);
34:   const expectedIds = composition.id === 'readonly' ? [] : ['photo-placeholder', 'titles', 'titles-current-target'];
35:   const withVariants = composition.id === 'manual-titles-variants';
36:   const withText = withVariants || composition.id === 'manual-titles', withLayout = withText || composition.id === 'manual-layout';
37:   if (withLayout) expectedIds.push('titles-point-layout');
38:   if (withText) expectedIds.push('text-layer');
39:   if (withVariants) expectedIds.push('text-variant', 'comp-render');
40:   if (canonical(composition.modules) !== canonical(expectedIds) || !Array.isArray(catalog.modules) || canonical(catalog.modules.map(m => m.id)) !== canonical(expectedIds) || canonical(catalog.engine) !== canonical(composition.engine) || (composition.id === 'readonly' ? composition.engine !== null : !composition.engine || composition.engine.path !== 'plan-engine')) fail('composition_catalog');
41:   function admitted(entry) {
42:     exactKeys(entry, ['id', 'version', 'path', 'admission']);
43:     if (entry.path !== 'modules/' + entry.id || entry.admission !== 'config/admissions/' + entry.id + '.json') fail('composition_catalog');
44:     const manifest = json(entry.path + '/artifact.json'), contract = json(entry.path + '/contract.json'), admission = json(entry.admission), executor = checked(entry.path + '/executor.jsx');
45:     exactKeys(admission, ['moduleId', 'operationId', 'artifactHash', 'schemaHash', 'resultSchemaHash', 'effectPolicyHash', 'executorHash', 'protocolVersion', 'trustApprovalId', 'revoked']);
46:     if (manifest.id !== entry.id || manifest.version !== entry.version || admission.revoked !== false || typeof admission.trustApprovalId !== 'string' || !admission.trustApprovalId || admission.protocolVersion !== 1 || admission.moduleId !== entry.id || contract.moduleId !== entry.id || admission.operationId !== contract.operationId || admission.artifactHash !== hash(manifest) || admission.schemaHash !== hash(contract.inputSchema) || admission.resultSchemaHash !== hash(contract.snapshotSchema) || admission.effectPolicyHash !== hash(contract.effectPolicy) || admission.executorHash !== hash(executor)) fail('composition_not_admitted');
47:     for (const [file, pin] of Object.entries(manifest.hashes)) if (!/^[A-Za-z0-9_-]+\.(js|json|jsx)$/.test(file) || hash(checked(entry.path + '/' + file)) !== pin) fail('composition_artifact');
48:     return { manifest, contract, admission, executor };
49:   }
50:   const selected = new Map(catalog.modules.map(entry => [entry.id, admitted(entry)]));
51:   if (composition.engine) { exactKeys(composition.engine, ['path', 'artifactHash']); const manifest = json('plan-engine/artifact.json'); if (hash(manifest) !== composition.engine.artifactHash) fail('composition_engine'); for (const [file, pin] of Object.entries(manifest.hashes)) if (!/^[A-Za-z0-9_-]+\.(js|json)$/.test(file) || hash(checked('plan-engine/' + file)) !== pin) fail('composition_engine'); }
52:   const expectedAssets = [{ assetKey: 'project-inspection-v1', moduleId: 'project-inspection', path: 'modules/project-inspection', admission: 'modules/project-inspection/artifact.json', policy: 'read-only-current-observation-v1', phases: ['inspect'] }];
53:   if (composition.id !== 'readonly') expectedAssets.push({ assetKey: 'titles-current-target-v1', moduleId: 'titles-current-target', path: 'modules/titles-current-target', admission: 'config/admissions/titles-current-target.json', policy: 'current-matching-target-after-local-confirmation-v1', phases: ['inspect', 'mutate', 'verify'] });
54:   if (withLayout) {
55:     expectedAssets.push({ assetKey: 'titles-point-layout-v1', moduleId: 'titles-point-layout', path: 'modules/titles-point-layout', admission: 'config/admissions/titles-point-layout.json', policy: 'current-matching-target-after-local-confirmation-v1', phases: ['inspect', 'mutate', 'verify'] });
56:     checked('runtime/point-layout-proof.js');
57:   } else if (Object.keys(release.hashes).some(file => /^(?:runtime\/point-layout-proof\.js$|modules\/titles-point-layout\/|config\/admissions\/titles-point-layout\.json$)/.test(file))) fail('composition_optional_closure');
58:   if (withText) {
59:     expectedAssets.push({ assetKey: 'text-layer-v1', moduleId: 'text-layer', path: 'modules/text-layer', admission: 'config/admissions/text-layer.json', policy: 'current-matching-target-after-local-confirmation-v1', phases: ['inspect', 'mutate', 'verify'] });
60:     checked('runtime/text-layer-proof.js');
61:   } else if (Object.keys(release.hashes).some(file => /^(?:runtime\/text-layer-proof\.js$|modules\/text-layer\/|config\/admissions\/text-layer\.json$)/.test(file))) fail('composition_optional_closure');
62:   if (withVariants) {
63:     expectedAssets.push({ assetKey: 'text-variant-v1', moduleId: 'text-variant', path: 'modules/text-variant', admission: 'config/admissions/text-variant.json', policy: 'current-matching-target-after-local-confirmation-v1', phases: ['inspect', 'mutate', 'verify'] });
64:     expectedAssets.push({ assetKey: 'comp-render-v1', moduleId: 'comp-render', path: 'modules/comp-render', admission: 'config/admissions/comp-render.json', policy: 'current-matching-target-after-local-confirmation-v1', phases: ['inspect', 'mutate', 'verify'] });
65:     checked('runtime/text-variant-proof.js');
66:     checked('runtime/comp-render-proof.js');
67:   } else if (Object.keys(release.hashes).some(file => /^(?:runtime\/(?:text-variant|comp-render)-proof\.js$|modules\/(?:text-variant|comp-render)\/|config\/admissions\/(?:text-variant|comp-render)\.json$)/.test(file))) fail('composition_optional_closure');
68:   if (canonical(composition.assets) !== canonical(expectedAssets)) fail('composition_assets');
69:   const assets = composition.assets.map(asset => {
70:     let value = selected.get(asset.moduleId);
71:     if (asset.policy === 'read-only-current-observation-v1') {
72:       const contract = json(asset.path + '/contract.json'), admission = json(asset.admission), executor = checked(asset.path + '/executor.jsx');
73:       exactKeys(admission, ['moduleId', 'executionPolicy', 'executorHash', 'contractHash']);
74:       if (admission.moduleId !== asset.moduleId || admission.executionPolicy !== asset.policy || admission.executorHash !== hash(executor) || admission.contractHash !== hash(contract)) fail('composition_not_admitted');
75:       value = { contract, admission, executor };
76:     }
77:     if (!value || asset.moduleId === 'titles-point-layout' && (value.contract.operationId !== 'measure-or-apply-point-layout' || value.contract.executionPolicy !== asset.policy)) fail('composition_not_admitted');
78:     if (asset.moduleId === 'text-layer' && (value.contract.operationId !== 'write-point-text' || value.contract.executionPolicy !== asset.policy)) fail('composition_not_admitted');
79:     if (asset.moduleId === 'text-variant' && (value.contract.operationId !== 'stage-text-variant' || value.contract.executionPolicy !== asset.policy)) fail('composition_not_admitted');
80:     if (asset.moduleId === 'comp-render' && (value.contract.operationId !== 'render-text-variant' || value.contract.executionPolicy !== asset.policy)) fail('composition_not_admitted');
81:     return { ...asset, ...value, executorHash: value.admission.executorHash };
82:   });
83:   // No optional runtime code is shipped in the standalone inspection composition.
84:   if (composition.id === 'readonly' && Object.keys(release.hashes).some(file => /^(plan-engine\/|modules\/(?!project-inspection\/)|config\/admissions\/|runtime\/(manual-policy|windows-reservation-provider)\.js$)/.test(file))) fail('composition_optional_closure');
85:   const startOverSupported = Object.hasOwn(release.hashes, 'runtime/owner-contract.json') && json('runtime/owner-contract.json').version === 4;
## core4/runtime/stdio-entry.js lines 304-347 full-file SHA256 a923e0d9b7f2d37aa7225cbdc7ee5aee82308c1b2ccfe1a93352d9b95d764837
304:   const manualAsset = selected.assets.find(a => a.assetKey === 'titles-current-target-v1');
305:   const layoutAsset = selected.assets.find(a => a.assetKey === 'titles-point-layout-v1');
306:   const textAsset = selected.assets.find(a => a.assetKey === 'text-layer-v1');
307:   const variantAsset = selected.assets.find(a => a.assetKey === 'text-variant-v1');
308:   const renderAsset = selected.assets.find(a => a.assetKey === 'comp-render-v1');
309:   let provider, manual, privateEmbedding;
310:   if (manualAsset) {
311:     const { createWindowsReservationProvider } = require('./windows-reservation-provider.js');
312:     const { createManualPolicy } = require('./manual-policy.js');
313:     provider = createWindowsReservationProvider({ installation, getBroker: () => broker, getPeer: () => peer });
314:     let layout;
315:     if (layoutAsset) {
316:       const { createPointLayoutProof } = require('./point-layout-proof.js');
317:       layout = { pin: hash(layoutAsset.manifest), contract: layoutAsset.contract, admission: layoutAsset.admission,
318:         proof: createPointLayoutProof({ getBroker: () => broker, getPeer: () => peer }) };
319:     }
320:     const additional = [];
321:     if (textAsset) {
322:       const { validateTextLayerCompletion } = require('./text-layer-proof.js');
323:       additional.push({ pin: hash(textAsset.manifest), contract: textAsset.contract, admission: textAsset.admission, validateResult: validateTextLayerCompletion });
324:     }
325:     if (variantAsset) {
326:       const { validateTextVariantCompletion } = require('./text-variant-proof.js');
327:       additional.push({ pin: hash(variantAsset.manifest), contract: variantAsset.contract, admission: variantAsset.admission, validateResult: validateTextVariantCompletion });
328:     }
329:     if (renderAsset) {
330:       const { compRenderProof, validateCompRenderCompletion } = require('./comp-render-proof.js');
331:       additional.push({ pin: hash(renderAsset.manifest), contract: renderAsset.contract, admission: renderAsset.admission,
332:         proof: compRenderProof, validateResult: validateCompRenderCompletion });
333:     }
334:     manual = createManualPolicy({ selected: { pin: hash(manualAsset.manifest), contract: manualAsset.contract, admission: manualAsset.admission }, layout, additional, provider, installation, getPeer: () => peer });
335:     const transport = { identity: hash({ packageHash: installation.packageHash, manualAdmission: manualAsset.admission, ...(layoutAsset ? { layoutAdmission: layoutAsset.admission } : {}), ...(textAsset ? { textAdmission: textAsset.admission } : {}), ...(variantAsset ? { variantAdmission: variantAsset.admission } : {}), ...(renderAsset ? { renderAdmission: renderAsset.admission } : {}) }), connect: value => peer.transport.connect(value), send: value => peer.transport.send(value), completion: value => peer.transport.completion(value), disconnect: () => peer.transport.disconnect() };
336:     privateEmbedding = { authority: manual.authority, executionPolicy: manual.port, transport };
337:   }
338:   broker = new Broker({ root, stateDir: path.join(installation.stateDir, 'broker'), transportTimeout: PRODUCTION_TIMING.callerTimeoutMs, ...(ownerLifecycle ? { stateLockToken: ownerLifecycle.brokerToken } : {}), ...(privateEmbedding ? { privateEmbedding } : {}) });
339:   const admissionGuard = command => {
340:     if (broker.closed) fail('broker_closed');
341:     if (broker.stateLock.error) fail(broker.stateLock.error);
342:     if (broker.ledger.corrupt) fail('ledger_corrupt');
343:     if (broker.ledger.unresolved().some(c => c.commandId !== command?.commandId)) fail('controller_unresolved');
344:   };
345:   const resultProfiles = { 'text-variant-v1': 'owned-text-variant-v1', 'text-layer-v1': 'owned-text-layer-v1',
346:     'titles-point-layout-v1': 'manual-point-layout-v1', 'titles-current-target-v1': 'manual-text-v1', 'comp-render-v1': 'owned-comp-render-v1' };
347:   const additionalAssets = [manualAsset, layoutAsset, textAsset, variantAsset, renderAsset].filter(Boolean).map(item => ({ assetKey: item.assetKey, moduleId: item.moduleId,
## core4/tools/package-installable.js lines 22-67 full-file SHA256 08f93e8e7f339eb08c5b55236b912551c4d41b27527ce8116f666083acb8743f
22: function buildPackage(root = path.resolve(__dirname, '..'), selector = 'manual', options = {}) {
23:   if (!['readonly', 'manual', 'manual-layout', 'manual-titles', 'manual-titles-variants'].includes(selector)) fail('composition_selector');
24:   if (!options || Object.getPrototypeOf(options) !== Object.prototype || Object.keys(options).some(key => key !== 'runtimeModel')) fail('runtime_selector');
25:   const runtimeModel = options.runtimeModel ?? 'stdio'; if (!['stdio', 'owner'].includes(runtimeModel)) fail('runtime_selector');
26:   const spec = JSON.parse(fs.readFileSync(path.join(root, 'runtime/source-package.json'), 'utf8'));
27:   const optional = selector === 'readonly' ? [] : [spec.optional.manual];
28:   const withVariants = selector === 'manual-titles-variants';
29:   const withText = withVariants || selector === 'manual-titles';
30:   const withLayout = withText || selector === 'manual-layout';
31:   if (withLayout) optional.push(spec.optional.layout);
32:   if (withText) optional.push(spec.optional.text);
33:   if (withVariants) optional.push(spec.optional.variants);
34:   const paths = new Set([...spec.files, ...optional.flatMap(part => part.files), ...(runtimeModel === 'owner' ? spec.optional.owner.files : [])]);
35:   for (const relative of [...spec.artifactClosures, ...optional.flatMap(part => part.artifactClosures)]) {
36:     paths.add(relative);
37:     const artifact = JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8'));
38:     for (const file of Object.keys(artifact.hashes)) {
39:       const location = relative.startsWith('modules/') || relative.startsWith('plan-engine/') ? path.posix.join(path.posix.dirname(relative), file) : file;
40:       if (hash(fs.readFileSync(path.join(root, location))) !== artifact.hashes[file]) fail('package_artifact_mismatch');
41:       paths.add(location);
42:     }
43:   }
44:   const hashes = {}, files = {};
45:   for (const relative of [...paths].sort()) {
46:     if (/^(test|experiments|node_modules|\.git|logs|state|tools)\//.test(relative) || relative.includes('..') || relative.includes('\\') || path.isAbsolute(relative)) fail('package_closure_forbidden');
47:     const full = path.resolve(root, relative); if (fs.realpathSync(full) !== full) fail('package_symlink');
48:     const bytes = fs.readFileSync(full); hashes[relative] = hash(bytes); files[relative] = bytes.toString('base64');
49:   }
50:   const release = { version: '4.1.1', format: 2, hashes };
51:   const original = JSON.parse(fs.readFileSync(path.join(root, 'config/catalog.json'), 'utf8'));
52:   const parts = withLayout ? [spec.compositions.manual, spec.compositions['manual-layout']] : [spec.compositions[selector]];
53:   if (withText) parts.push(spec.compositions['manual-titles']);
54:   if (withVariants) parts.push(spec.compositions[selector]);
55:   const modules = parts.flatMap(part => part.modules), assets = parts.flatMap(part => part.assets);
56:   for (const moduleId of modules.filter(id => ['titles-point-layout', 'text-layer', 'text-variant', 'comp-render'].includes(id))) {
57:     const modulePath = 'modules/' + moduleId;
58:     const manifest = JSON.parse(Buffer.from(files[modulePath + '/artifact.json'], 'base64'));
59:     original.modules.push({ id: moduleId, version: manifest.version, path: modulePath, admission: 'config/admissions/' + moduleId + '.json' });
60:     original.catalogRevision = selector + '-' + hash(manifest);
61:   }
62:   if (modules.some(id => original.modules.filter(m => m.id === id).length !== 1)) fail('composition_catalog');
63:   const catalog = { catalogRevision: original.catalogRevision, modules: modules.map(id => original.modules.find(m => m.id === id)), engine: selector === 'readonly' ? null : original.engine };
64:   const composition = { version: 1, id: selector, modules, engine: catalog.engine, assets };
65:   const add = (file, source) => { const bytes = typeof source === 'string' ? source : canonical(source); files[file] = Buffer.from(bytes).toString('base64'); hashes[file] = hash(bytes); };
66:   add('config/catalog.json', catalog); add('runtime/composition.json', composition);
67:   const selected = deriveComposition(release, file => Buffer.from(files[file], 'base64'));
## core4/tools/package-capability.js lines 113-150 full-file SHA256 fc48afced37942db9d9fd3cb2eeec95bad38f5e085eed5810072335735ef6001
113: function composeCapability(base, bundle, admissionBytes, { basePin, capabilityPin, admissionPin }) {
114:   exact(base, ['packageHash', 'release', 'files'], 'capability_base');
115:   if (typeof basePin !== 'string' || !SHA256.test(basePin) || base.packageHash !== basePin) fail('capability_base_pin');
116:   verifyPackage(base);
117:   const readBase = file => Buffer.from(base.files[file], 'base64');
118:   const selected = deriveComposition(base.release, readBase);
119:   if (!['4.1.0', '4.1.1'].includes(base.release.version) || selected.composition?.id !== 'manual' ||
120:       runtimeBinding(base.release, readBase).runtimeModel !== 'owner') fail('capability_base_composition');
121:   const { artifact, contract } = verifyCapability(bundle, capabilityPin);
122:   if (!Buffer.isBuffer(admissionBytes) || admissionBytes.length === 0 || admissionBytes.length > 16384 ||
123:       typeof admissionPin !== 'string' || !SHA256.test(admissionPin) || hash(admissionBytes) !== admissionPin) fail('capability_admission_pin');
124:   // Compatibility is anchored to the admitted slot, including its schemas and effect policy.
125:   const existing = selected.assets.find(asset => asset.moduleId === MODULE);
126:   if (canonical(existing.contract) !== canonical(contract)) fail('capability_contract_incompatible');
127:   utf8(admissionBytes);
128: 
129:   const release = { ...base.release, hashes: { ...base.release.hashes } };
130:   const files = { ...base.files };
131:   const read = file => Buffer.from(files[file], 'base64');
132:   const put = (file, bytes) => {
133:     files[file] = bytes.toString('base64');
134:     release.hashes[file] = hash(bytes);
135:   };
136:   for (const name of MODULE_FILES) put(MODULE_PATH + '/' + name, Buffer.from(bundle.files[name], 'base64'));
137:   put(ADMISSION_PATH, admissionBytes);
138:   if (hash(release) === basePin) return base;
139: 
140:   const catalog = JSON.parse(read('config/catalog.json'));
141:   catalog.modules.find(entry => entry.id === MODULE).version = artifact.version;
142:   catalog.catalogRevision = 'capability-' + hash({ modules: catalog.modules, engine: catalog.engine, capabilityPin, admissionPin });
143:   put('config/catalog.json', Buffer.from(canonical(catalog)));
144:   const composed = deriveComposition(release, read);
145:   const updated = composed.assets.find(asset => asset.moduleId === MODULE);
146:   const phases = updated.phases.map(phase => 'typeof executor[' + JSON.stringify(phase) + '] === "function"');
147:   requireInitialization('var executor = ' + updated.executor + '\n; executor != null && ' + phases.join(' && '), 'capability_executor_interface');
148:   requireInitialization('var module = {exports:{}};\n(function(module,exports){\n' + utf8(read(MODULE_PATH + '/implementation.js')) +
149:     '\n})(module,module.exports);\nmodule.exports != null && typeof module.exports.build === "function";', 'capability_builder_interface');
150:   const registry = registrySource(composed.assets, utf8(read('runtime/host/json-codec.jsx')));
## core4/runtime/text-layer-proof.js lines 1-52 full-file SHA256 ebf65bd949c18b75e0c88099eacd114ce6825d53cd8904170d7ec654769e8313
1: 'use strict';
2: const { canonical, fail } = require('../protocol/json');
3: 
4: const near = (a, b, epsilon = 0.002) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= epsilon;
5: const equal = (a, b) => canonical(a ?? null) === canonical(b ?? null);
6: const color = (a, b) => (!a && !b) || (a && b && a.length === b.length && a.every((value, index) => near(value, b[index])));
7: 
8: function validateTextLayerCompletion({ input, before }, after) {
9:   const { slot, layerId, name, text, leading, justification, ranges, placement } = input;
10:   const previous = before.layers.find(layer => layer.slot === slot);
11:   const result = after.layers.find(layer => layer.slot === slot);
12:   const otherLayers = snapshot => snapshot.layers.filter(layer => layer.slot !== slot);
13:   if (!result || result.issue || result.name !== name || result.text !== text || !near(result.leading, leading) ||
14:       result.justification !== justification || result.enabled !== (previous?.enabled ?? true) ||
15:       layerId !== undefined && result.layerId !== layerId ||
16:       before.layers.some(layer => layer.slot !== slot && layer.layerId === result.layerId) ||
17:       !equal(otherLayers(before), otherLayers(after)) || !equal(before.guides, after.guides) || !equal(before.size, after.size)) {
18:     fail('text_layer_readback');
19:   }
20:   let actual = 0;
21:   for (const desired of ranges) {
22:     for (let index = desired.start; index < desired.end; index++) {
23:       if (text[index] === '\n') continue;
24:       while (actual < result.ranges.length && index >= result.ranges[actual].end) actual++;
25:       const observed = result.ranges[actual];
26:       if (!observed || observed.start > index || observed.substitute !== false ||
27:           observed.font !== desired.font && observed.font !== desired.fallbackFont ||
28:           !near(observed.fontSize, desired.fontSize) || !near(observed.tracking, desired.tracking) ||
29:           !color(observed.fill, desired.fill) || Boolean(observed.stroke) !== Boolean(desired.stroke) ||
30:           observed.stroke && (!near(observed.stroke.width, desired.stroke.width) || !color(observed.stroke.color, desired.stroke.color))) {
31:         fail('text_layer_style_readback');
32:       }
33:     }
34:   }
35:   if (previous && !equal(result.anchor, previous.anchor)) fail('text_layer_anchor_readback');
36:   if (!placement) {
37:     if (previous && (!equal(result.position, previous.position) || !near(result.scale, previous.scale))) fail('text_layer_transform_readback');
38:     return;
39:   }
40:   const { frame, minimumScale } = placement;
41:   const { bounds, anchor, position, scale } = result;
42:   const stroke = Math.max(0, ...result.ranges.map(range => range.stroke?.width ?? 0));
43:   if (scale < minimumScale - 0.0001 || scale > 1.0001 ||
44:       (bounds.width + 2 * stroke) * scale > frame.width + 0.05 ||
45:       (bounds.height + 2 * stroke) * scale > frame.height + 0.05 ||
46:       !near(position[0] + (bounds.left + bounds.width / 2 - anchor[0]) * scale, frame.left + frame.width / 2, 0.05) ||
47:       !near(position[1] + (bounds.top + bounds.height / 2 - anchor[1]) * scale, frame.top + frame.height / 2, 0.05)) {
48:     fail('text_layer_placement_readback');
49:   }
50: }
51: 
52: module.exports = { validateTextLayerCompletion };
## core4/runtime/comp-render-proof.js lines 1-57 full-file SHA256 a5dbb1036b91e3173cfa227c460584e3a788376494cf6b9d2495f33fe724219b
1: 'use strict';
2: const fs = require('node:fs');
3: const path = require('node:path');
4: const { canonical, fail } = require('../protocol/json');
5: 
6: function output(input) {
7:   return path.join(path.dirname(input.projectId), 'titles-output', input.fileName);
8: }
9: 
10: function plainOutputDirectory(file) {
11:   const dir = path.dirname(file);
12:   const stat = fs.lstatSync(dir, { throwIfNoEntry: false });
13:   if (!stat?.isDirectory() || stat.isSymbolicLink() || fs.realpathSync(dir) !== dir) fail('comp_render_output_directory');
14: }
15: 
16: const compRenderProof = {
17:   beforeReservation({ input, before }) {
18:     const file = output(input);
19:     plainOutputDirectory(file);
20:     if (input.mode === 'stage' && fs.lstatSync(file, { throwIfNoEntry: false })) fail('comp_render_output_exists');
21:     if (input.mode === 'finalize') plainMedia(file, before.job.bytes);
22:   },
23: };
24: 
25: function plainMedia(file, bytes) {
26:   const stat = fs.lstatSync(file, { throwIfNoEntry: false });
27:   if (!stat?.isFile() || stat.isSymbolicLink() || fs.realpathSync(file) !== file ||
28:       stat.size < 1 || stat.size !== bytes) fail('comp_render_output_readback');
29: }
30: 
31: function validateCompRenderCompletion({ input, before }, after) {
32:   const { render, job, revision, queueIdle, ...snapshot } = after;
33:   const { job: previous, revision: beforeRevision, queueIdle: beforeIdle, ...preimage } = before;
34:   if (canonical(snapshot) !== canonical(preimage)) fail('comp_render_result');
35:   const file = output(input);
36:   plainOutputDirectory(file);
37:   const parameters = ['renderTemplate', 'outputTemplate', 'startFrame', 'frameCount'];
38:   if (input.mode === 'stage') {
39:     if (!beforeIdle || queueIdle || previous || render || !job || job.jobCompId === input.compId || job.file !== file ||
40:         job.status !== 'QUEUED' || job.rendering || job.bytes !== 0 ||
41:         [...parameters, 'activeLayerId', 'controlledLayerIds', 'fileName'].some(field => canonical(job[field]) !== canonical(input[field])) ||
42:         fs.lstatSync(file, { throwIfNoEntry: false })) fail('comp_render_stage_result');
43:     return;
44:   }
45:   if (job || !previous || previous.jobCompId !== input.jobCompId || previous.file !== file || previous.rendering) fail('comp_render_result');
46:   if (input.mode === 'discard') {
47:     if (render || previous.status === 'DONE') fail('comp_render_result');
48:     return;
49:   }
50:   if (!render || previous.status !== 'DONE' || render.jobCompId !== input.jobCompId || render.file !== file ||
51:       render.bytes !== previous.bytes || render.status !== 'DONE' || render.format !== 'H.264' ||
52:       parameters.some(field => render[field] !== input[field] || render[field] !== previous[field])) fail('comp_render_result');
53:   plainMedia(file, render.bytes);
54: }
55: 
56: module.exports = { compRenderProof, validateCompRenderCompletion };
## core4/tools/validate-diff.js lines 18-98 full-file SHA256 9966334a99aa4bdbab7a883b6f9c2e3b2face0edfc590695105036e66986706c
18: function selectChecks(changed, root = path.resolve(__dirname, '..'), { contractImpacts = [] } = {}) {
19:   const map = JSON.parse(fs.readFileSync(path.join(root, 'config/validation-map.json'), 'utf8'));
20:   const selected = new Map(); const deferredCoverage = [];
21:   const changedFiles = [...new Set(changed.map(file => file.replace(/\\/g, '/')))];
22:   if (!Array.isArray(contractImpacts) || contractImpacts.length > 32 || contractImpacts.some(id => typeof id !== 'string')) fail('invalid_contract_impacts');
23:   for (const check of Object.keys(map.checkDependencies)) if (!['component', 'integration'].includes(map.checkPolicy?.[check]?.kind)) fail('check_policy_required', check);
24:   function include(check, reason, dependencyPath) {
25:     if (!map.checkDependencies[check]) fail('unknown_check', check);
26:     if (!selected.has(check)) selected.set(check, { check, reasons: [], dependencyPaths: [], command: map.checkCommands?.[check] || ['node', '--test', '--test-name-pattern=' + check, 'test/core4.test.js'] });
27:     if (!selected.get(check).reasons.includes(reason)) { selected.get(check).reasons.push(reason); selected.get(check).dependencyPaths.push(dependencyPath); }
28:   }
29:   for (const file of changedFiles) {
30:     const matches = map.owners.filter(o => file.startsWith(o.prefix));
31:     const longest = Math.max(...matches.map(o => o.prefix.length)); const owners = matches.filter(o => o.prefix.length === longest);
32:     if (owners.length !== 1) fail('unknown_or_ambiguous_owner', file);
33:     const owner = owners[0];
34:     for (const check of owner.checks) include(check, 'changed owner ' + owner.owner + ': ' + file, [file, owner.owner, check]);
35:     for (const contract of map.contracts.filter(c => file.startsWith(c.prefix))) for (const check of contract.consumers) include(check, 'changed public contract ' + contract.id + ': ' + file, [file, contract.id, check]);
36:     for (const edge of (map.sharedRuntimeEdges || []).filter(edge => file.startsWith(edge.prefix))) for (const check of edge.consumers) include(check, 'changed shared runtime ' + edge.id + ': ' + file, [file, edge.id, check]);
37:   }
38:   for (const id of new Set(contractImpacts)) {
39:     const contracts = map.contracts.filter(contract => contract.id === id); if (!contracts.length) fail('unknown_contract_impact', id);
40:     for (const contract of contracts) for (const check of contract.consumers) include(check, 'declared semantic contract impact ' + id, ['declared contractImpacts', id, check]);
41:   }
42:   for (const [check, dependencies] of Object.entries(map.checkDependencies)) {
43:     const affected = [];
44:     for (const file of changedFiles) {
45:       const relative = file.startsWith('core4/') ? file.slice('core4/'.length) : null;
46:       if (!relative) continue;
47:       for (const dep of dependencies) if (dep.endsWith('/') ? relative.startsWith(dep) : relative === dep) affected.push({ file, dependency: dep });
48:       for (const projection of map.checkProjections?.[check] || []) if (relative === projection.file) affected.push({ file, dependency: projection.file + '#' + projection.key + '[id=' + projection.id + ']' });
49:     }
50:     if (affected.length && map.checkPolicy[check].kind === 'component') {
51:       for (const hit of affected) include(check, 'changed component dependency ' + hit.dependency + ': ' + hit.file, [hit.file, hit.dependency, check]);
52:     } else if (affected.length && !selected.has(check)) {
53:       deferredCoverage.push({ check, status: 'current-closure-unverified', changedDependencies: affected, reason: 'Integration bytes changed outside this scoped owner/public/shared contract route; no current-closure PASS or release certification is claimed.', dependencyPath: affected.map(hit => [hit.file, hit.dependency, check]) });
54:     }
55:   }
56:   for (const value of selected.values()) {
57:     const dependencySet = new Set();
58:     for (const dep of map.checkDependencies[value.check]) {
59:       const target = path.resolve(root, dep);
60:       if (!target.startsWith(path.resolve(root) + path.sep) || !fs.existsSync(target)) fail('check_dependency_unavailable', dep);
61:       for (const file of fs.statSync(target).isDirectory() ? files(target) : [target]) dependencySet.add(file);
62:     }
63:     const dependencies = [...dependencySet].sort();
64:     const projections = (map.checkProjections?.[value.check] || []).map(p => {
65:       const data = JSON.parse(fs.readFileSync(path.join(root, p.file), 'utf8'));
66:       const entry = data[p.key].find(item => item.id === p.id); if (!entry) fail('dependency_projection_missing');
67:       return { dependency: p.file + '#' + p.key + '[id=' + p.id + ']', digest: hash(entry) };
68:     });
69:     value.evidenceKey = hash({ check: value.check, command: value.command, dependencies: dependencies.map(f => [path.relative(root, f).replace(/\\/g, '/'), hash(fs.readFileSync(f))]), projections });
70:     value.reason = value.reasons.join('; '); value.dependencyPath = value.dependencyPaths;
71:     value.dependencies = dependencies.map(f => path.relative(root, f).replace(/\\/g, '/')).concat(projections.map(p => p.dependency));
72:   }
73:   return { mode: 'scoped', certification: 'selected-artifacts-only', releaseCertified: false, contractImpacts: [...new Set(contractImpacts)], checks: [...selected.values()], executionBatches: executionBatches([...selected.values()]), deferredCoverage };
74: }
75: function main() {
76:   const root = path.resolve(__dirname, '..'); const run = process.argv.includes('--run');
77:   const args = process.argv.slice(2); let changed = [], contractImpacts = [];
78:   for (let index = 0; index < args.length; index++) {
79:     if (args[index] === '--run') continue;
80:     if (args[index] === '--contract-impacts') { try { contractImpacts = JSON.parse(args[++index]); } catch { fail('invalid_contract_impacts'); } }
81:     else if (args[index].startsWith('--')) fail('unknown_option', args[index]);
82:     else changed.push(args[index]);
83:   }
84:   if (!changed.length) {
85:     const cwd = path.resolve(root, '..');
86:     changed = [...new Set([...execFileSync('git', ['diff', '--name-only', 'HEAD', '--', 'core4'], { cwd, encoding: 'utf8' }).trim().split('\n'), ...execFileSync('git', ['ls-files', '--others', '--exclude-standard', '--', 'core4'], { cwd, encoding: 'utf8' }).trim().split('\n')].filter(Boolean))];
87:   }
88:   const result = selectChecks(changed, root, { contractImpacts }); console.log(JSON.stringify(result, null, 2));
89:   const childEnv = { ...process.env }; delete childEnv.NODE_TEST_CONTEXT;
90:   if (run) for (const batch of result.executionBatches) {
91:     const output = spawnSync(process.execPath, batch.command.slice(1), { cwd: root, stdio: 'inherit', env: childEnv, windowsHide: true });
92:     if (output.status !== 0) process.exit(output.status || 1);
93:   }
94: }
95: if (require.main === module) { try { main(); } catch (e) { console.error((e.code || 'failed') + ': ' + e.message); process.exitCode = 1; } }
96: module.exports = { selectChecks };
## core4/config/validation-map.json lines 1300-1335 full-file SHA256 2a8828427dbfca142c00a732a751e8f664a94b37cd29a999d7e352e59921519e
1300:     ],
1301:     "point-layout": [
1302:       "core/", "protocol/", "worker.js", "runtime/", "cep/", "modules/", "plan-engine/",
1303:       "config/catalog.json", "config/admissions/", "integrations/cep/", "tools/package-installable.js",
1304:       "test/point-layout.test.js", "test/fixtures/point-layout-ae.js", "test/fixtures/manual-http-runtime.js",
1305:       "test/fixtures/ae.js"
1306:     ],
1307:     "text-layer": [
1308:       "core/", "protocol/", "worker.js", "runtime/", "cep/", "modules/", "plan-engine/",
1309:       "config/catalog.json", "config/admissions/", "integrations/cep/", "tools/package-installable.js",
1310:       "test/text-layer.test.js", "test/fixtures/text-layer-ae.js", "test/fixtures/manual-http-runtime.js",
1311:       "test/fixtures/ae.js"
1312:     ],
1313:     "text-variant": [
1314:       "modules/text-variant/", "runtime/text-variant-proof.js", "protocol/", "tools/package-installable.js",
1315:       "runtime/stdio-entry.js", "runtime/source-package.json", "config/admissions/text-variant.json", "test/text-variant.test.js"
1316:     ],
1317:     "comp-render": [
1318:       "modules/comp-render/", "runtime/comp-render-proof.js", "protocol/", "runtime/stdio-entry.js",
1319:       "runtime/manual-policy.js", "integrations/cep/http-peer.js", "test/comp-render.test.js"
1320:     ],
1321:     "installable-runtime": [
1322:       "runtime/",
1323:       "cep/",
1324:       "modules/project-inspection/",
1325:       "test/installable-runtime.test.js",
1326:       "tools/package-installable.js",
1327:       "tools/install-core4.js",
1328:       "tools/adopt-host.js",
1329:       "integrations/cep/http-peer.js",
1330:       "integrations/cep/peer-protocol.js",
1331:       "integrations/cep/completion-store.js",
1332:       "core/",
1333:       "protocol/",
1334:       "worker.js",
1335:       "modules/titles/",
## products/titles/src/compiler.js lines 1-12 full-file SHA256 5ef667d2d6c00795388de12f8213804e2a352430132ac5328f676849722823de
1: 'use strict';
2: const crypto = require('node:crypto');
3: const jobSchema = require('../job.schema.json');
4: const publicContract = require('../compat/titles-current-target.contract.json');
5: const MAX_BYTES = 64 * 1024;
6: const MODULE = 'titles-current-target';
7: const OPERATION = 'set-current-text';
8: const POLICY = 'current-matching-target-after-local-confirmation-v1';
9: // Public module artifact identity, not installer/package/machine identity.
10: const MODULE_PIN = '189c58bf5335a8ce7c889159808b7791a39dc0ad3f0641cd522342bcdb8c6e79';
11: const CONTRACT_HASH = '6226f911063f94f471bff23e9ebb60f1ee49323c2f25d54e6a4bdabf95bbe55b';
12: function fail(code) { throw Object.assign(new Error(code), { code }); }

'use strict';
// Pure composition metadata. Keep parity with the builtin-only bootstrap verifier.
const path = require('node:path');
const crypto = require('node:crypto');
function fail(code) { throw Object.assign(new Error(code), { code }); }
function canonical(value) {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (!value || Object.getPrototypeOf(value) !== Object.prototype) fail('invalid_installation_json');
  return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
}
function hash(value) { return crypto.createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : canonical(value)).digest('hex'); }
function exactKeys(value, keys) { if (!value || Object.getPrototypeOf(value) !== Object.prototype || Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key))) fail('composition_schema'); }
// Release feature policy is duplicated in the builtin bootstrap and pure spec.
// Keep their observed compatibility in parity tests; never import before trust.
const RELEASE_FEATURES = Object.freeze(Object.fromEntries([
  ['4.0.0', [1, 2], false, false],
  ['4.1.0', [2], false, false],
  ['4.1.1', [2], false, false],
  ['4.1.2', [2], false, false],
  ['4.2.1', [2], false, false],
  ['4.2.2', [2], false, false],
  ['4.2.3', [2], true, false],
  ['4.2.4', [2], true, false],
  ['4.2.5', [2], true, false],
  ['4.2.6', [2], true, true]
].map(([version, formats, versionedComposition, registryIdentity]) => [version,
  Object.freeze({ formats: Object.freeze(formats), versionedComposition, registryIdentity })])));
function releaseFeatures(release) {
  if (!release || typeof release.version !== 'string' || !Object.hasOwn(RELEASE_FEATURES, release.version)) fail('unsupported_release');
  const features = RELEASE_FEATURES[release.version];
  if (!features.formats.includes(release.format)) fail('release_format');
  return features;
}
const POLICY_FILE = 'runtime/composition-policy.json';
const BUILTIN_CAPABILITIES = Object.freeze({ 'render-jobs': Object.freeze({ version: 1,
  files: Object.freeze(['runtime/render-job-owner.js', 'runtime/aerender-jobs.js', 'runtime/aerender-profile.js']) }) });
function builtinCapabilityFiles(capabilities) {
  if (!capabilities || Object.getPrototypeOf(capabilities) !== Object.prototype) fail('composition_capabilities');
  return Object.entries(capabilities).flatMap(([id, version]) => {
    if (!Object.hasOwn(BUILTIN_CAPABILITIES, id) || version !== BUILTIN_CAPABILITIES[id].version) fail('composition_capabilities');
    return BUILTIN_CAPABILITIES[id].files;
  });
}
function validateCompRenderCompletion(value) {
  exactKeys(value, ['directory', 'format']);
  if (typeof value.directory !== 'string' || !/^[a-z][a-z0-9-]{0,63}$/.test(value.directory) ||
      /^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/.test(value.directory) || value.format !== 'H.264') fail('composition_not_admitted');
  return value;
}
const RESULT_PROFILES = Object.freeze({
  'manual-text-v1': null,
  'photo-source-v1': 'runtime/photo-source-proof.js',
  'owned-project-assembly-v1': 'runtime/project-assembly-proof.js',
  'media-import-v1': 'runtime/media-layer-proof.js',
  'layer-insert-v1': 'runtime/layer-insert-proof.js',
  'layer-overlay-v1': 'runtime/layer-overlay-proof.js',
  'current-project-save-v1': 'runtime/project-save-proof.js',
  'project-lifecycle-v1': 'runtime/project-lifecycle-proof.js',
  'manual-point-layout-v1': 'runtime/point-layout-proof.js',
  'owned-text-layer-v1': 'runtime/text-layer-proof.js',
  'owned-text-variant-v1': 'runtime/text-variant-proof.js',
  'owned-comp-render-v1': 'runtime/comp-render-proof.js',
  'comp-frame-export-v1': 'runtime/comp-frame-export-proof.js',
});
const OPERATOR_EFFECTS = Object.freeze({
  'titles-current-target': 'layer.text',
  'photo-placeholder': 'layer.source',
  'titles-point-layout': 'layer.text-layout',
  'text-layer': 'point-text-document-write',
  'text-variant': 'text-variant-stage',
  'comp-render': 'owned-native-render',
  'comp-frame-export': 'composition-frame-png-export',
  'project-assembly': 'project-composition-assembly',
  'project-save': 'project-save-in-place',
  'project-lifecycle': 'project-lifecycle-transition',
  'media-import': 'project-media-import',
  'layer-insert': 'composition-layer-insert',
  'layer-overlay': 'composition-layer-overlay',
});
const INSPECTION_ASSET = { assetKey: 'project-inspection-v1', moduleId: 'project-inspection', path: 'modules/project-inspection', admission: 'modules/project-inspection/artifact.json', policy: 'read-only-current-observation-v1', phases: ['inspect'] };
function compositionPaths(files, closures, readArtifact) {
  const safe = file => typeof file === 'string' && file !== 'release.json' && /^[A-Za-z0-9_-]+(?:[./][A-Za-z0-9_-]+)*$/.test(file) && !/^(test|experiments|node_modules|logs|state|tools)\//.test(file);
  if (!Array.isArray(files) || !files.every(safe) || !Array.isArray(closures) || !closures.every(safe)) fail('composition_paths');
  const paths = new Set(files);
  for (const relative of closures) {
    paths.add(relative);
    const artifact = readArtifact(relative);
    const local = /^(modules|plan-engine)\//.test(relative);
    for (const file of Object.keys(artifact.hashes)) {
      if (!safe(file) || local && !/^[A-Za-z0-9_-]+\.(js|json|jsx)$/.test(file)) fail('composition_paths');
      paths.add(local ? path.posix.join(path.posix.dirname(relative), file) : file);
    }
  }
  return paths;
}
function declarativeProfiles(composition, release, json, checked) {
  const policy = json(POLICY_FILE);
  const declared = Object.hasOwn(policy, 'version');
  const versionedPolicy = releaseFeatures(release).versionedComposition;
  exactKeys(policy, ['id', 'modules', 'assets', 'profiles', 'files', 'closures', ...(declared ? ['version', 'capabilities'] : [])]);
  if (declared ? policy.version !== 2 || !versionedPolicy : versionedPolicy) fail('composition_policy_version');
  const capabilities = declared ? policy.capabilities : release.version === '4.2.2' && composition.id === 'operator-render-jobs' ? { 'render-jobs': 1 } : {};
  builtinCapabilityFiles(capabilities);
  if (policy.id !== composition.id || canonical(policy.modules) !== canonical(composition.modules) || canonical(policy.assets) !== canonical(composition.assets)) fail('composition_assets');
  const paths = compositionPaths(policy.files, policy.closures, json);
  for (const file of ['config/catalog.json', 'runtime/composition.json', POLICY_FILE, 'cep/jsx/registry.jsx']) paths.add(file);
  if (canonical([...paths].sort()) !== canonical(Object.keys(release.hashes).sort())) fail('composition_optional_closure');
  if (canonical(composition.assets[0]) !== canonical(INSPECTION_ASSET) || new Set(composition.modules).size !== composition.modules.length ||
      !composition.modules.every(id => typeof id === 'string' && /^[a-z][a-z0-9-]*$/.test(id))) fail('composition_assets');
  const mutations = composition.assets.slice(1);
  if (composition.id === 'readonly' ? mutations.length || composition.modules.length : !mutations.length) fail('composition_assets');
  if (mutations.length) {
    checked('runtime/manual-policy.js');
    checked('runtime/windows-reservation-provider.js');
  }
  if (new Set(mutations.map(a => a.moduleId)).size !== mutations.length || new Set(composition.assets.map(a => a.assetKey)).size !== composition.assets.length) fail('composition_assets');
  exactKeys(policy.profiles, mutations.map(a => a.moduleId));
  const proofPaths = new Set();
  for (const asset of mutations) {
    exactKeys(asset, ['assetKey', 'moduleId', 'path', 'admission', 'policy', 'phases']);
    const id = asset.moduleId, profile = policy.profiles[id];
    exactKeys(profile, ['operationId', 'resultProfile', ...(Object.hasOwn(profile, 'operatorConfirmation') ? ['operatorConfirmation'] : [])]);
    if (!composition.modules.includes(id) || asset.assetKey !== id + '-v1' || asset.path !== 'modules/' + id || asset.admission !== 'config/admissions/' + id + '.json' ||
        asset.policy !== 'current-matching-target-after-local-confirmation-v1' || canonical(asset.phases) !== '["inspect","mutate","verify"]' ||
        typeof profile.resultProfile !== 'string' || !Object.hasOwn(RESULT_PROFILES, profile.resultProfile) ||
        (profile.resultProfile === 'manual-text-v1') !== (id === 'titles-current-target') ||
        profile.resultProfile === 'photo-source-v1' && (id !== 'photo-placeholder' || profile.operationId !== 'replace-source') ||
        (profile.resultProfile === 'owned-project-assembly-v1') !== (id === 'project-assembly') ||
        id === 'project-assembly' && profile.operationId !== 'assemble-composition' ||
        (profile.resultProfile === 'media-import-v1') !== (id === 'media-import') ||
        id === 'media-import' && profile.operationId !== 'ingest-footage' ||
        (profile.resultProfile === 'layer-insert-v1') !== (id === 'layer-insert') ||
        id === 'layer-insert' && profile.operationId !== 'insert-footage-layer' ||
        (profile.resultProfile === 'layer-overlay-v1') !== (id === 'layer-overlay') ||
        id === 'layer-overlay' && (profile.operationId !== 'duplicate-and-replace-still' ||
          profile.operatorConfirmation !== 'registry-v1' || !release.hashes['runtime/media-layer-proof.js']) ||
        (profile.resultProfile === 'current-project-save-v1') !== (id === 'project-save') ||
        id === 'project-save' && profile.operationId !== 'save-current-project' ||
        (profile.resultProfile === 'project-lifecycle-v1') !== (id === 'project-lifecycle') ||
        id === 'project-lifecycle' && profile.operationId !== 'transition-project' ||
        (profile.resultProfile === 'comp-frame-export-v1') !== (id === 'comp-frame-export') ||
        id === 'comp-frame-export' && (profile.operationId !== 'save-comp-frame-png' || profile.operatorConfirmation !== 'registry-v1' ||
          !release.hashes['runtime/png-proof.js'] ||
          !(release.hashes['runtime/project-file.js'] || release.hashes['runtime/project-save-proof.js'])) ||
        Object.hasOwn(profile, 'operatorConfirmation') &&
          (![true, 'registry-v1'].includes(profile.operatorConfirmation) || !release.hashes['runtime/operator-confirmation.js'])) fail('composition_not_admitted');
    // Earlier packages kept both media proofs in the same pinned file.
    const proof = profile.resultProfile === 'layer-insert-v1' && !release.hashes['runtime/layer-insert-proof.js']
      ? 'runtime/media-layer-proof.js' : RESULT_PROFILES[profile.resultProfile];
    if (proof) { checked(proof); proofPaths.add(proof); }
  }
  if (release.hashes['runtime/project-file.js']) checked('runtime/project-file.js');
  if (composition.id === 'operator-photo-montage') {
    checked('runtime/montage-mandate.js');
    if (!release.hashes['runtime/project-save-proof.js']) checked('runtime/project-file.js');
  }
  const modules = new Set(['project-inspection', ...composition.modules]);
  for (const file of paths) {
    if (file.startsWith('modules/') && !modules.has(file.split('/')[1]) ||
        file.startsWith('config/admissions/') && !composition.modules.some(id => file === 'config/admissions/' + id + '.json') ||
        Object.values(RESULT_PROFILES).includes(file) && !proofPaths.has(file)) fail('composition_optional_closure');
  }
  if (composition.id === 'readonly' && [...paths].some(file => /^(plan-engine\/|runtime\/(manual-policy|windows-reservation-provider)\.js$)/.test(file))) fail('composition_optional_closure');
  return { profiles: policy.profiles, capabilities };
}
// Compatibility table for previously issued composition-v1 packages.
const LEGACY_PROFILES = Object.freeze({
  'titles-current-target': { operationId: 'set-current-text', resultProfile: 'manual-text-v1' },
  'titles-point-layout': { operationId: 'measure-or-apply-point-layout', resultProfile: 'manual-point-layout-v1' },
  'text-layer': { operationId: 'write-point-text', resultProfile: 'owned-text-layer-v1' },
  'text-variant': { operationId: 'stage-text-variant', resultProfile: 'owned-text-variant-v1' },
  'comp-render': { operationId: 'render-text-variant', resultProfile: 'owned-comp-render-v1' },
});
// Builtin-only release interpretation. Callers verify the COMPLETE tree first.
// These two reviewed adapters are closed policies, never names of executable imports.
function deriveComposition(release, read) {
  const features = releaseFeatures(release);
  const checked = file => { if (!Object.hasOwn(release.hashes, file)) fail('composition_unhashed_path'); const bytes = read(file); if (hash(bytes) !== release.hashes[file]) fail('composition_bytes'); return bytes; };
  const json = file => JSON.parse(checked(file));
  if (release.format === 1) {
    if (Object.hasOwn(release.hashes, 'runtime/composition.json') || Object.hasOwn(release.hashes, POLICY_FILE) ||
        builtinCapabilityFiles({ 'render-jobs': 1 }).some(file => Object.hasOwn(release.hashes, file))) fail('composition_downgrade');
    if (!Object.hasOwn(release.hashes, 'runtime/profiles.json') || !Object.hasOwn(release.hashes, 'runtime/source-package.json')) fail('composition_downgrade');
    const inspection = json('modules/project-inspection/artifact.json');
    const manual = json('config/admissions/titles-current-target.json');
    return { legacy: true, assets: [{ assetKey: 'project-inspection-v1', executorHash: inspection.executorHash, phases: ['inspect'] }, { assetKey: 'titles-current-target-v1', executorHash: manual.executorHash, phases: ['inspect', 'mutate', 'verify'] }] };
  }
  if (!Object.hasOwn(release.hashes, 'runtime/composition.json')) fail('composition_required');
  const composition = json('runtime/composition.json'); exactKeys(composition, ['version', 'id', 'modules', 'engine', 'assets']);
  if (![1, 2].includes(composition.version) || (composition.version === 2) !== Object.hasOwn(release.hashes, POLICY_FILE) ||
      typeof composition.id !== 'string' || !/^[a-z][a-z0-9-]*$/.test(composition.id) || !Array.isArray(composition.modules) || !Array.isArray(composition.assets)) fail('composition_schema');
  const catalog = json('config/catalog.json'); exactKeys(catalog, ['catalogRevision', 'modules', 'engine']);
  if (releaseFeatures(release).versionedComposition && composition.version !== 2) fail('composition_policy_version');
  const { profiles, capabilities } = composition.version === 2 ? declarativeProfiles(composition, release, json, checked) : { profiles: LEGACY_PROFILES, capabilities: {} };
  if (composition.version === 1) validateLegacyComposition(composition, release, checked);
  if (!Array.isArray(catalog.modules) || canonical(catalog.modules.map(m => m.id)) !== canonical(composition.modules) || canonical(catalog.engine) !== canonical(composition.engine) || (composition.id === 'readonly' ? composition.engine !== null : !composition.engine || composition.engine.path !== 'plan-engine')) fail('composition_catalog');
  function admitted(entry) {
    exactKeys(entry, ['id', 'version', 'path', 'admission']);
    if (entry.path !== 'modules/' + entry.id || entry.admission !== 'config/admissions/' + entry.id + '.json') fail('composition_catalog');
    const manifest = json(entry.path + '/artifact.json'), contract = json(entry.path + '/contract.json'), admission = json(entry.admission), executor = checked(entry.path + '/executor.jsx');
    exactKeys(admission, ['moduleId', 'operationId', 'artifactHash', 'schemaHash', 'resultSchemaHash', 'effectPolicyHash', 'executorHash', 'protocolVersion', 'trustApprovalId', 'revoked']);
    if (manifest.id !== entry.id || manifest.version !== entry.version || admission.revoked !== false || typeof admission.trustApprovalId !== 'string' || !admission.trustApprovalId || admission.protocolVersion !== 1 || admission.moduleId !== entry.id || contract.moduleId !== entry.id || admission.operationId !== contract.operationId || admission.artifactHash !== hash(manifest) || admission.schemaHash !== hash(contract.inputSchema) || admission.resultSchemaHash !== hash(contract.snapshotSchema) || admission.effectPolicyHash !== hash(contract.effectPolicy) || admission.executorHash !== hash(executor)) fail('composition_not_admitted');
    for (const [file, pin] of Object.entries(manifest.hashes)) if (!/^[A-Za-z0-9_-]+\.(js|json|jsx)$/.test(file) || hash(checked(entry.path + '/' + file)) !== pin) fail('composition_artifact');
    return { manifest, contract, admission, executor };
  }
  const selected = new Map(catalog.modules.map(entry => [entry.id, admitted(entry)]));
  if (composition.engine) { exactKeys(composition.engine, ['path', 'artifactHash']); const manifest = json('plan-engine/artifact.json'); if (hash(manifest) !== composition.engine.artifactHash) fail('composition_engine'); for (const [file, pin] of Object.entries(manifest.hashes)) if (!/^[A-Za-z0-9_-]+\.(js|json)$/.test(file) || hash(checked('plan-engine/' + file)) !== pin) fail('composition_engine'); }
  const assets = composition.assets.map(asset => {
    let value = selected.get(asset.moduleId);
    if (asset.policy === 'read-only-current-observation-v1') {
      const contract = json(asset.path + '/contract.json'), admission = json(asset.admission), executor = checked(asset.path + '/executor.jsx');
      exactKeys(admission, ['moduleId', 'executionPolicy', 'executorHash', 'contractHash']);
      if (admission.moduleId !== asset.moduleId || admission.executionPolicy !== asset.policy || admission.executorHash !== hash(executor) || admission.contractHash !== hash(contract)) fail('composition_not_admitted');
      value = { contract, admission, executor };
    }
    if (!value) fail('composition_not_admitted');
    const binding = Object.hasOwn(profiles, asset.moduleId) ? profiles[asset.moduleId] : null;
    if (binding && (value.contract.operationId !== binding.operationId || value.contract.executionPolicy !== asset.policy)) fail('composition_not_admitted');
    const pilotConfirmation = ['manual-text-v1', 'photo-source-v1'].includes(binding?.resultProfile);
    if (binding?.operatorConfirmation && (
      !Object.hasOwn(OPERATOR_EFFECTS, asset.moduleId) || OPERATOR_EFFECTS[asset.moduleId] !== value.contract.effectPolicy.effect ||
      binding.operatorConfirmation !== (pilotConfirmation ? true : 'registry-v1')
    )) fail('composition_not_admitted');
    let proofConfig;
    if (composition.version === 2 && binding?.resultProfile === 'owned-comp-render-v1') {
      if (!Object.hasOwn(value.manifest.hashes, 'completion.json')) fail('composition_artifact');
      proofConfig = validateCompRenderCompletion(json(asset.path + '/completion.json'));
    }
    return { ...asset, ...value, executorHash: value.admission.executorHash, ...(binding ? { resultProfile: binding.resultProfile } : {}),
      ...(binding?.operatorConfirmation ? { operatorConfirmation: true } : {}),
      ...(binding?.operatorConfirmation === 'registry-v1' ? { registryOperatorConfirmation: true } : {}),
      ...(proofConfig ? { proofConfig } : {}) };
  });
  const startOverSupported = Object.hasOwn(release.hashes, 'runtime/owner-contract.json') && json('runtime/owner-contract.json').version === 4;
  if (assets.some(item => item.operatorConfirmation) && !startOverSupported) fail('operator_confirmation_owner_required');
  const renderJobs = Object.hasOwn(capabilities, 'render-jobs');
  for (const [id, capability] of Object.entries(BUILTIN_CAPABILITIES)) {
    if (Object.hasOwn(capabilities, id)) for (const file of capability.files) checked(file);
    else if (capability.files.some(file => Object.hasOwn(release.hashes, file))) fail('composition_optional_closure');
  }
  if (renderJobs) {
    if (!startOverSupported || !assets.some(item => item.resultProfile === 'project-lifecycle-v1' && item.registryOperatorConfirmation) ||
        !assets.some(item => item.resultProfile === 'current-project-save-v1')) fail('render_job_owner_required');
    if (releaseFeatures(release).versionedComposition) for (const file of ['runtime/project-file.js', 'runtime/render-job-history.js', 'runtime/render-job-maintenance.js']) checked(file);
  }
  return { composition, assets, ...(features.registryIdentity ? { registryVerification: true } : {}), ...(startOverSupported ? { startOverSupported: true } : {}), ...(renderJobs ? { renderJobs: true } : {}) };
}
function validateLegacyComposition(composition, release, checked) {
  if (!['readonly', 'manual', 'manual-layout', 'manual-titles', 'manual-titles-variants'].includes(composition.id)) fail('composition_schema');
  const expectedIds = composition.id === 'readonly' ? [] : ['photo-placeholder', 'titles', 'titles-current-target'];
  const withVariants = composition.id === 'manual-titles-variants';
  const withText = withVariants || composition.id === 'manual-titles', withLayout = withText || composition.id === 'manual-layout';
  if (withLayout) expectedIds.push('titles-point-layout');
  if (withText) expectedIds.push('text-layer');
  if (withVariants) expectedIds.push('text-variant', 'comp-render');
  if (canonical(composition.modules) !== canonical(expectedIds)) fail('composition_catalog');
  const expectedAssets = [{ assetKey: 'project-inspection-v1', moduleId: 'project-inspection', path: 'modules/project-inspection', admission: 'modules/project-inspection/artifact.json', policy: 'read-only-current-observation-v1', phases: ['inspect'] }];
  if (composition.id !== 'readonly') expectedAssets.push({ assetKey: 'titles-current-target-v1', moduleId: 'titles-current-target', path: 'modules/titles-current-target', admission: 'config/admissions/titles-current-target.json', policy: 'current-matching-target-after-local-confirmation-v1', phases: ['inspect', 'mutate', 'verify'] });
  if (withLayout) {
    expectedAssets.push({ assetKey: 'titles-point-layout-v1', moduleId: 'titles-point-layout', path: 'modules/titles-point-layout', admission: 'config/admissions/titles-point-layout.json', policy: 'current-matching-target-after-local-confirmation-v1', phases: ['inspect', 'mutate', 'verify'] });
    checked('runtime/point-layout-proof.js');
  } else if (Object.keys(release.hashes).some(file => /^(?:runtime\/point-layout-proof\.js$|modules\/titles-point-layout\/|config\/admissions\/titles-point-layout\.json$)/.test(file))) fail('composition_optional_closure');
  if (withText) {
    expectedAssets.push({ assetKey: 'text-layer-v1', moduleId: 'text-layer', path: 'modules/text-layer', admission: 'config/admissions/text-layer.json', policy: 'current-matching-target-after-local-confirmation-v1', phases: ['inspect', 'mutate', 'verify'] });
    checked('runtime/text-layer-proof.js');
  } else if (Object.keys(release.hashes).some(file => /^(?:runtime\/text-layer-proof\.js$|modules\/text-layer\/|config\/admissions\/text-layer\.json$)/.test(file))) fail('composition_optional_closure');
  if (withVariants) {
    expectedAssets.push({ assetKey: 'text-variant-v1', moduleId: 'text-variant', path: 'modules/text-variant', admission: 'config/admissions/text-variant.json', policy: 'current-matching-target-after-local-confirmation-v1', phases: ['inspect', 'mutate', 'verify'] });
    expectedAssets.push({ assetKey: 'comp-render-v1', moduleId: 'comp-render', path: 'modules/comp-render', admission: 'config/admissions/comp-render.json', policy: 'current-matching-target-after-local-confirmation-v1', phases: ['inspect', 'mutate', 'verify'] });
    checked('runtime/text-variant-proof.js');
    checked('runtime/comp-render-proof.js');
  } else if (Object.keys(release.hashes).some(file => /^(?:runtime\/(?:text-variant|comp-render)-proof\.js$|modules\/(?:text-variant|comp-render)\/|config\/admissions\/(?:text-variant|comp-render)\.json$)/.test(file))) fail('composition_optional_closure');
  if (canonical(composition.assets) !== canonical(expectedAssets)) fail('composition_assets');
  // No optional runtime code is shipped in the standalone inspection composition.
  if (composition.id === 'readonly' && Object.keys(release.hashes).some(file => /^(plan-engine\/|modules\/(?!project-inspection\/)|config\/admissions\/|runtime\/(manual-policy|windows-reservation-provider)\.js$)/.test(file))) fail('composition_optional_closure');
}
function registrySource(assets, codecSource, identityEnabled = false) {
  const declarations = [], entries = assets.map((asset, index) => {
    const name = 'executor' + index; declarations.push('var ' + name + '=' + asset.executor + ';');
    const calls = asset.phases.map(phase => {
      const method = asset.resultProfile === 'photo-source-v1' ? phase + 'Current' : phase;
      const call = name + '[' + JSON.stringify(method) + ']';
      const guarded = phase === 'mutate' && asset.registryOperatorConfirmation;
      const target = guarded ? 'function(p){return applyOperatorApproval(' + call + ',p);}' : call;
      return JSON.stringify(phase) + ':' + target;
    });
    return JSON.stringify(asset.assetKey) + ':{"hash":' + JSON.stringify(asset.executorHash) + ',"calls":{' + calls.join(',') + '}}';
  });
  const approval = assets.some(asset => asset.registryOperatorConfirmation) ? [
    'function applyOperatorApproval(call,p){',
    'var proof=p&&p._execution&&p._execution.operatorConfirmation;',
    'if(!proof)return {"outcome":"rejected","code":"operator_confirmation_required"};',
    'if(typeof proof.digest!=="string"||!/^[a-f0-9]{64}$/.test(proof.digest)||',
    'typeof proof.expiresAt!=="number"||!isFinite(proof.expiresAt)||proof.expiresAt<=new Date().getTime())',
    'return {"outcome":"rejected","code":"operator_confirmation_expired"};',
    'return call(p,function(){if(proof.expiresAt<=new Date().getTime()){',
    'var e=new Error("operator_confirmation_expired");e.coreCode="operator_confirmation_expired";throw e;}return true;});}',
  ].join('') : '';
  let source = '/* Fixed package-owned registry. Runtime frames contain data only. */\nvar AECore4Host=(function(){var JSON=' + codecSource + ';' + declarations.join('') + approval + 'var assets={' + entries.join(',') + '};return {"dispatch":function(serialized){var frame=JSON.parse(serialized),own=Object.prototype.hasOwnProperty,a=frame&&own.call(assets,frame.assetKey)&&assets[frame.assetKey],call=a&&own.call(a.calls,frame.phase)&&a.calls[frame.phase];if(!call||frame.pins.executorHash!==a.hash)throw new Error("fixed_asset_binding");if(frame.phase==="mutate")return JSON.stringify(call(frame.typedPayload));try{return JSON.stringify(call(frame.typedPayload));}catch(e){return JSON.stringify({"readFailureVersion":1,"outcome":"rejected","code":"inspection_failed"});}}};}());\n';
  if (identityEnabled) {
    source = source.replace('var AECore4Host=(function(){', 'var AECore4Host=(function(){var registryBuildId="' + '0'.repeat(64) + '";/*CORE4_REGISTRY_ID*/')
      .replace('return {"dispatch":', 'return {"identity":function(){return {"protocolVersion":1,"registryBuildId":registryBuildId};},"dispatch":');
    source = source.replace('0'.repeat(64) + '";/*CORE4_REGISTRY_ID*/', hash(source) + '";/*CORE4_REGISTRY_ID*/');
  }
  return source;
}
function installationConfig(d, selected) { const assets = selected.assets.map(a => ({ assetKey: a.assetKey, executorHash: a.executorHash, phases: a.phases })); return { installationId: d.installationId, packageHash: d.packageHash, panelToken: d.panelToken, executorHash: assets[0].executorHash, assetKey: assets[0].assetKey, assets, ...(selected.startOverSupported ? { startOverSupported: true } : {}), ...(selected.registryVerification ? { registryVerification: 1 } : {}) }; }
function installationMarker(d, selected) { return { version: 1, installationId: d.installationId, packageHash: d.packageHash, panelConfigHash: hash(installationConfig(d, selected)) }; }
module.exports = { releaseFeatures, builtinCapabilityFiles, compositionPaths, deriveComposition, validateCompRenderCompletion, registrySource, installationConfig, installationMarker };

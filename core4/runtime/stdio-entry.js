'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { performance } = require('node:perf_hooks');
const PRODUCTION_TIMING = Object.freeze({ callerTimeoutMs: 100000, callbackTimeoutMs: 90000, mcpToolTimeoutSec: 120 });
// A large project with a native load warning returned its authenticated result after 103 s.
const PROJECT_OPEN_TIMING = Object.freeze({ callerTimeoutMs: 115000, callbackTimeoutMs: 110000 });
const DIRECT_READ_DRAIN_MS = 10000;
// ONLY builtins are loaded until the entire installed release is verified.
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
  const versionedPolicy = ['4.2.3', '4.2.4'].includes(release.version);
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
  if (release.format !== 1 && release.format !== 2) fail('release_format');
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
  if (['4.2.3', '4.2.4'].includes(release.version) && composition.version !== 2) fail('composition_policy_version');
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
    if (['4.2.3', '4.2.4'].includes(release.version)) for (const file of ['runtime/project-file.js', 'runtime/render-job-history.js', 'runtime/render-job-maintenance.js']) checked(file);
  }
  return { composition, assets, ...(startOverSupported ? { startOverSupported: true } : {}), ...(renderJobs ? { renderJobs: true } : {}) };
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
function registrySource(assets, codecSource) {
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
  return '/* Fixed package-owned registry. Runtime frames contain data only. */\nvar AECore4Host=(function(){var JSON=' + codecSource + ';' + declarations.join('') + approval + 'var assets={' + entries.join(',') + '};return {"dispatch":function(serialized){var frame=JSON.parse(serialized),own=Object.prototype.hasOwnProperty,a=frame&&own.call(assets,frame.assetKey)&&assets[frame.assetKey],call=a&&own.call(a.calls,frame.phase)&&a.calls[frame.phase];if(!call||frame.pins.executorHash!==a.hash)throw new Error("fixed_asset_binding");if(frame.phase==="mutate")return JSON.stringify(call(frame.typedPayload));try{return JSON.stringify(call(frame.typedPayload));}catch(e){return JSON.stringify({"readFailureVersion":1,"outcome":"rejected","code":"inspection_failed"});}}};}());\n';
}
function installationConfig(d, selected) { const assets = selected.assets.map(a => ({ assetKey: a.assetKey, executorHash: a.executorHash, phases: a.phases })); return { installationId: d.installationId, packageHash: d.packageHash, panelToken: d.panelToken, executorHash: assets[0].executorHash, assetKey: assets[0].assetKey, assets, ...(selected.startOverSupported ? { startOverSupported: true } : {}) }; }
function verifyRelease(directory, release) {
  exactKeys(release, ['version', 'format', 'hashes']); if ((release.version !== '4.0.0' && !(['4.1.0', '4.1.1', '4.1.2', '4.2.1', '4.2.2', '4.2.3', '4.2.4'].includes(release.version) && release.format === 2)) || !release.hashes || Object.getPrototypeOf(release.hashes) !== Object.prototype) fail('release_schema');
  const root = path.resolve(directory), expectedFiles = new Set(['release.json']), expectedDirs = new Set(['']);
  for (const relative of Object.keys(release.hashes || {})) {
    if (!/^[A-Za-z0-9_./-]+$/.test(relative) || relative.includes('\\') || relative.split('/').some(p => !p || p === '.' || p === '..') || path.isAbsolute(relative) || relative === 'release.json') fail('release_path');
    expectedFiles.add(relative);
    for (let dir = path.posix.dirname(relative); dir !== '.'; dir = path.posix.dirname(dir)) expectedDirs.add(dir);
  }
  function visit(directory, relative) {
    const stat = fs.lstatSync(directory);
    if (stat.isSymbolicLink() || !stat.isDirectory() || fs.realpathSync(directory) !== directory || !expectedDirs.delete(relative)) fail('release_tree_mismatch');
    for (const item of fs.readdirSync(directory)) {
      const file = path.join(directory, item), rel = relative ? relative + '/' + item : item, child = fs.lstatSync(file);
      if (child.isSymbolicLink() || fs.realpathSync(file) !== file) fail('release_tree_mismatch');
      if (child.isDirectory()) visit(file, rel);
      else if (!child.isFile() || !expectedFiles.delete(rel)) fail('release_tree_mismatch');
      else if (rel === 'release.json' ? fs.readFileSync(file, 'utf8') !== canonical(release) : hash(fs.readFileSync(file)) !== release.hashes[rel]) fail('installed_release_bytes');
    }
  }
  visit(root, ''); if (expectedFiles.size || expectedDirs.size) fail('release_tree_mismatch');
  if (release.format !== 1 && release.format !== 2) fail('release_format');
  if (release.format === 1) {
    if (Object.hasOwn(release.hashes, 'runtime/composition.json') || Object.hasOwn(release.hashes, POLICY_FILE) ||
        builtinCapabilityFiles({ 'render-jobs': 1 }).some(file => Object.hasOwn(release.hashes, file))) fail('composition_downgrade');
    return;
  }
  const selected = deriveComposition(release, file => fs.readFileSync(path.join(root, file)));
  if (fs.readFileSync(path.join(root, 'cep/jsx/registry.jsx'), 'utf8') !== registrySource(selected.assets, fs.readFileSync(path.join(root, 'runtime/host/json-codec.jsx'), 'utf8'))) fail('composition_registry');
}
function assertPlainPath(file, directory = false) {
  if (!path.isAbsolute(file) || path.resolve(file) !== file) fail('installation_path');
  const stat = fs.lstatSync(file); if (stat.isSymbolicLink() || stat.reparsePoint || fs.realpathSync(file) !== file || (directory ? !stat.isDirectory() : !stat.isFile())) fail('installation_path');
}
function verifyCep(d, manifest, cepDir) {
  verifyRelease(d.releaseDir, manifest);
  assertPlainPath(cepDir, true); if (path.basename(cepDir) !== 'com.codex.aeagentcore4') fail('installation_cep_scope');
  const selected = deriveComposition(manifest, file => fs.readFileSync(path.join(d.releaseDir, file)));
  const expected = Object.fromEntries(Object.entries(manifest.hashes).filter(([file]) => file.startsWith('cep/')).map(([file, digest]) => [file.slice(4), digest]));
  if (Object.keys(expected).length !== 6) fail('installation_cep_closure');
  const cfg = installationConfig(d, selected);
  expected['installation.js'] = hash('window.Core4Installation=' + canonical(cfg) + ';\n');
  const files = new Set(Object.keys(expected)), dirs = new Set(['']); for (const file of files) for (let dir = path.posix.dirname(file); dir !== '.'; dir = path.posix.dirname(dir)) dirs.add(dir);
  function visit(directory, relative) { assertPlainPath(directory, true); if (!dirs.delete(relative)) fail('installation_cep_tree'); for (const name of fs.readdirSync(directory)) { const file = path.join(directory, name), rel = relative ? relative + '/' + name : name, stat = fs.lstatSync(file); assertPlainPath(file, stat.isDirectory()); if (stat.isDirectory()) visit(file, rel); else if (!files.delete(rel) || hash(fs.readFileSync(file)) !== expected[rel]) fail('installation_cep_bytes'); } }
  visit(cepDir, ''); if (files.size || dirs.size) fail('installation_cep_tree');
}
function verifyInstallation(file, options = {}) {
  if (Object.keys(options).some(key => key !== 'cepDir')) fail('installation_verifier_options');
  const { cepDir } = options;
  if (!path.isAbsolute(file)) fail('absolute_descriptor_required');
  assertPlainPath(file);
  const d = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (![1, 2].includes(d.version) || !path.isAbsolute(d.installRoot) || file !== path.join(d.installRoot, 'installation.json') || d.releaseDir !== path.join(d.installRoot, 'releases', d.packageHash) || d.stateDir !== path.join(d.installRoot, 'state/production') || !path.isAbsolute(d.nodePath) || !/^[a-f0-9]{64}$/.test(d.nodeHash) || !d.installationId || d.panelToken === d.controlToken || !/^[a-f0-9]{64}$/.test(d.panelToken) || !/^[a-f0-9]{64}$/.test(d.controlToken)) fail('installation_descriptor');
  if (d.version === 2) {
    const keys = ['version', 'installRoot', 'installationId', 'machineId', 'packageHash', 'releaseDir', 'stateDir', 'nodePath', 'nodeHash', 'nodeVersion', 'panelToken', 'controlToken', 'cepDir', 'receiverFormatVersion', 'predecessor'];
    if (Object.keys(d).length !== keys.length || keys.some(key => !Object.hasOwn(d, key)) || !path.isAbsolute(d.cepDir) || d.receiverFormatVersion !== 2) fail('installation_descriptor_v2');
    if (d.predecessor !== null && (!d.predecessor || Object.keys(d.predecessor).sort().join(',') !== 'previousDescriptorHash,transactionId' || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(d.predecessor.transactionId) || !/^[a-f0-9]{64}$/.test(d.predecessor.previousDescriptorHash))) fail('installation_predecessor');
  }
  assertPlainPath(path.join(d.installRoot, 'origin.json')); assertPlainPath(path.join(d.stateDir, 'origin.json'));
  const origin = JSON.parse(fs.readFileSync(path.join(d.installRoot, 'origin.json'), 'utf8'));
  const anchor = JSON.parse(fs.readFileSync(path.join(d.stateDir, 'origin.json'), 'utf8'));
  if (canonical(origin) !== canonical(anchor) || origin.installationId !== d.installationId || origin.machineId !== d.machineId) fail('installation_origin_mismatch');
  if ((path.resolve(process.execPath).toLowerCase() !== path.resolve(d.nodePath).toLowerCase() || hash(fs.readFileSync(d.nodePath)) !== d.nodeHash || Number(process.versions.node.split('.')[0]) < 20)) fail('external_node_mismatch');
  const manifest = JSON.parse(fs.readFileSync(path.join(d.releaseDir, 'release.json'), 'utf8'));
  if (hash(manifest) !== d.packageHash) fail('installation_package_hash');
  verifyRelease(d.releaseDir, manifest);
  if (d.version === 2) { const receiver = JSON.parse(fs.readFileSync(path.join(d.releaseDir, 'runtime/receiver-contract.json'), 'utf8')); if (receiver.version !== 1 || receiver.descriptorVersion !== 2 || receiver.journalFormat !== d.receiverFormatVersion || receiver.terminalReadFailureDispositionVersion !== 1) fail('installation_receiver_contract'); verifyCep(d, manifest, d.cepDir); }
  else if (cepDir) verifyCep(d, manifest, cepDir);
  return Object.freeze(d);
}
async function start({ descriptor, port = 3457, input = process.stdin, output = process.stdout, mode = 'stdio' } = {}) {
  const installation = verifyInstallation(descriptor), root = installation.releaseDir;
  if (fs.realpathSync(path.resolve(__dirname, '..')) !== fs.realpathSync(root)) fail('installation_entry_root_mismatch');
  const installGate = path.join(installation.installRoot, 'install.lock');
  let startupGate, broker, peer, attachmentOwner, ipc, reservedServer, ownerLifecycle, workSession, startOverOwner, startOverControl, ownerMaintenance, startOverRestartArmed = false;
  try {
  if (!['stdio', 'owner'].includes(mode)) fail('runtime_mode');
  if (mode === 'stdio') startupGate = fs.openSync(installGate, 'wx');
  if (canonical(verifyInstallation(descriptor)) !== canonical(installation)) fail('installation_changed_during_start');
  const release = JSON.parse(fs.readFileSync(path.join(root, 'release.json'), 'utf8'));
  const selected = deriveComposition(release, file => fs.readFileSync(path.join(root, file)));
  if (selected.composition?.version !== 2) fail('runtime_composition_required');
  const ownerFiles = ['runtime/owner-entry.js', 'runtime/client-entry.js', 'runtime/client-ipc.js', 'runtime/client-stdio.js', 'runtime/controller-lease.js', 'runtime/attachment-owner.js', 'runtime/owner-lifecycle.js', 'runtime/recovery-inspection.js', 'runtime/windows-owner-process.js', 'runtime/owner-maintenance.js', 'runtime/start-over-inspection.js', 'runtime/start-over-process.js', 'runtime/start-over-state.js', 'runtime/start-over-barrier.js', 'runtime/start-over-archive.js', 'runtime/start-over-finisher.js', 'runtime/work-session.js', 'runtime/start-over-panel-control.js', 'runtime/start-over-driver.js', 'runtime/owner-launch.js'];
  const ownerRuntime = Object.hasOwn(release.hashes, 'runtime/owner-contract.json');
  if (ownerRuntime) {
    const bytes = fs.readFileSync(path.join(root, 'runtime/owner-contract.json'));
    const expected = { version: 4, runtimeModel: 'owner', clientEntry: 'runtime/client-entry.js', clientArgument: '--client-descriptor',
      ownerEntry: 'runtime/owner-entry.js', ownerArgument: '--installation', clientDescriptorFile: 'core-client.json', requiredFiles: ownerFiles };
    if (release.format !== 2 || hash(bytes) !== release.hashes['runtime/owner-contract.json'] || canonical(JSON.parse(bytes)) !== canonical(expected) || ownerFiles.some(file => !Object.hasOwn(release.hashes, file))) fail('owner_contract_schema');
    if (mode !== 'owner') fail('owner_entry_required');
  } else {
    if (mode === 'owner') fail('owner_composition_unavailable');
    if (ownerFiles.some(file => Object.hasOwn(release.hashes, file))) fail('owner_contract_required');
  }
  if (mode === 'owner') {
    const { continueStartOverStartup } = require('./start-over-driver.js');
    await continueStartOverStartup({ installation, descriptorPath: descriptor, port });
    workSession = require('./work-session.js').createWorkSession({ installation, descriptorPath: descriptor });
    // Presence is a fail-closed barrier, including malformed/unreadable records.
    const maintenance = path.join(installation.stateDir, 'runtime-maintenance.json');
    try { fs.lstatSync(maintenance); fail('owner_desired_stopped'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
    // HTTP elects the starter before acquiring/recovering a process-bound gate.
    // No execution store opens until lifecycle has verified death/CAS/history.
    reservedServer = require('node:http').createServer();
    await new Promise((resolve, reject) => {
      reservedServer.once('error', reject);
      reservedServer.listen(port, '127.0.0.1', () => { reservedServer.removeListener('error', reject); resolve(); });
    });
    const { createOwnerLifecycle } = require('./owner-lifecycle.js');
    ownerLifecycle = await createOwnerLifecycle({ installation, descriptorPath: descriptor, reservedServer });
  } else {
    for (const name of ['runtime-start-over.json', 'work-session.json']) {
      try { fs.lstatSync(path.join(installation.stateDir, name)); fail('owner_work_session_requires_owner_runtime'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
    }
  }
  const aeReadiness = require('./ae-readiness').createAeReadiness();
  function startOverView() {
    const { startOverEligibility } = require('./start-over-panel-control.js');
    const ownerBootId = ownerLifecycle.state().processBootId;
    const status = (value, facts) => ({ ...value, ownerBootId, eligibility: startOverEligibility({ phase: value.phase, fault: value.fault, ...facts }), aeAuthority: false });
    const faultCode = e => typeof e.code === 'string' && /^[a-z][a-z0-9_]{0,99}$/.test(e.code) ? e.code : 'start_over_state_unavailable';
    const requested = startOverOwner?.status();
    const maintenance = ownerMaintenance?.status();
    if (requested?.requested) {
      let observed;
      try { observed = startOverOwner.inspect(); }
      catch (e) { return status({ id: requested.id, sessionId: null, phase: 'blocked', requiresAEExit: true, resetComplete: false, baselineRequired: true, fault: faultCode(e) }); }
      const fault = requested.fault || maintenance?.fault || null;
      const canContinue = !!(requested.fault && observed.id && observed.id === requested.id && maintenance?.requested === false);
      const phase = maintenance?.fault || requested.fault && !maintenance?.requested ? 'blocked' : 'stopping';
      return status({ id: observed.id || requested.id, sessionId: observed.newSessionId || null, phase, requiresAEExit: observed.requiresAEExit !== false, resetComplete: false, baselineRequired: true, fault }, { canContinue });
    }
    try {
      const value = workSession.status(), owner = attachmentOwner?.status();
      return status({ id: value.resetId, sessionId: value.sessionId, phase: value.resetPending ? 'blocked' : value.baselineRequired ? 'baseline-required' : 'ready', requiresAEExit: owner?.activity.unresolved === true, resetComplete: value.mode === 'work-session' && !value.resetPending, baselineRequired: value.baselineRequired, fault: value.resetPending ? 'start_over_in_progress' : null }, { ownerMode: ownerLifecycle.mode, owner, maintenance });
    } catch (e) {
      return status({ id: null, sessionId: null, phase: 'blocked', requiresAEExit: false, resetComplete: false, baselineRequired: true, fault: faultCode(e) });
    }
  }
  async function requestStartOver() {
    if (!startOverOwner || !ownerMaintenance) fail('start_over_owner_not_ready');
    require('./render-job-maintenance').inspectRenderJobs(installation.stateDir, { installationId: installation.installationId });
    try { await startOverOwner.request(); }
    catch (error) {
      // An inventory failure must not strand a published reset in a live
      // frozen producer. Stop this exact owner; the same finisher can capture
      // continuation inventory once after its real process death.
      const current = startOverOwner.inspect(), requested = startOverOwner.status();
      if (!current.id || current.id !== requested.id) throw error;
      if (!ownerMaintenance.status().requested) {
        const { createStopAuthorization } = require('./owner-maintenance.js');
        startOverRestartArmed = true;
        ownerMaintenance.request(createStopAuthorization({ installation, descriptorPath: descriptor, scope: ownerMaintenance.scope, id: current.id }));
      }
    }
    return startOverView();
  }
  if (mode === 'owner') startOverControl = require('./start-over-panel-control.js').createStartOverPanelControl({ installation, status: startOverView, request: requestStartOver });
  async function exposeOwner(facade, activity, invoke, options = {}) {
    const { createAttachmentOwner, ownerMethods } = require('./attachment-owner.js');
    const { createIpcServer } = require('./client-ipc.js');
    const { ownerEndpoint } = require('./client-entry.js');
    const { PRIVATE_METHODS, createOwnerMaintenance, createStopAuthorization } = require('./owner-maintenance.js');
    attachmentOwner = createAttachmentOwner({ runtime: facade, activity, invoke, ...options, workSession: workSession.status });
    const endpoint = ownerEndpoint(installation);
    let closed = false, closing, maintenance;
    async function closeRuntime() {
      if (closed) return; if (closing) return closing;
      if (attachmentOwner.status().accepted || activity().pending) fail('owner_draining');
      ownerLifecycle.beginClose();
      closing = (async () => { await attachmentOwner.close(); await ipc.close(); ownerLifecycle.finishClose(); closed = true; })(); return closing;
    }
    maintenance = createOwnerMaintenance({ installation, descriptorPath: descriptor, lifecycle: ownerLifecycle, activity,
      freeze: attachmentOwner.freeze, accepted: () => attachmentOwner.status().accepted, close: closeRuntime });
    ownerMaintenance = maintenance;
    startOverOwner = require('./start-over-state.js').createOwnerStartOver({ installation, descriptorPath: descriptor, lifecycle: ownerLifecycle, freeze: attachmentOwner.freeze,
      fencePhysical() { if (peer) peer.fenceForStartOver(); else if (ownerLifecycle.mode !== 'diagnostic') fail('start_over_physical_unavailable'); },
      stop(id) { startOverRestartArmed = true; return maintenance.request(createStopAuthorization({ installation, descriptorPath: descriptor, scope: maintenance.scope, id })); } });
    void maintenance.done.then(async value => {
      if (!startOverRestartArmed || value.phase !== 'stopped' && !closed) return;
      try { await require('./owner-launch.js').launchInstalledOwner({ installation, descriptorPath: descriptor }); } catch { /* intent remains; a fresh thin client can launch the same normal entry */ }
    });
    const currentStatus = facade.status, currentDiagnostics = facade.diagnostics;
    facade.status = () => ({ ...currentStatus(), maintenance: maintenance.status(), workSession: workSession.status(), startOver: startOverView() });
    facade.diagnostics = async () => ({ ...await currentDiagnostics(), maintenance: maintenance.status(), workSession: workSession.status(), startOver: startOverView() });
    ipc = createIpcServer({ endpoint, identity: { installationId: installation.installationId, machineId: installation.machineId, packageHash: installation.packageHash },
      secret: installation.controlToken, bootId: attachmentOwner.bootId, methods: [...ownerMethods(options.renderJobs), ...PRIVATE_METHODS],
      onAttach: attachmentOwner.onAttach, onDetach: attachmentOwner.onDetach, onRequest: request => {
        if (!PRIVATE_METHODS.includes(request.method)) return attachmentOwner.onRequest(request);
        try { return { ok: true, value: maintenance.request(request.payload) }; }
        catch (e) { return { ok: false, code: ['maintenance_authorization', 'maintenance_in_progress', 'maintenance_persist_failed', 'maintenance_schema', 'maintenance_id', 'render_job_maintenance_unsettled', 'render_job_maintenance_unverifiable', 'render_job_maintenance_toolchain_changed'].includes(e.code) ? e.code : 'maintenance_refused' }; }
      } });
    if (ownerLifecycle.mode === 'active') ownerLifecycle.markReady();
    await ipc.listen(); ownerLifecycle.releaseStartup();
    return { endpoint, bootId: attachmentOwner.bootId,
      async close() {
        if (closed) return;
        const value = maintenance.requestLocal(); if (value.fault) fail(value.fault);
        if (attachmentOwner.status().accepted || activity().pending) fail('owner_draining');
        const result = await maintenance.done; if (result.phase !== 'stopped') fail('maintenance_stop_uncertain');
      },
      status: () => ({ ...facade.status(), attachmentOwner: attachmentOwner.status(), ipc: ipc.status(), maintenance: maintenance.status() }) };
  }
  if (ownerLifecycle?.mode === 'diagnostic') {
    // A fenced boot exposes authenticated observations without constructing a
    // Broker or opening an execution store. Only authenticated panel reset
    // control is available; the physical command channel remains refused.
    require('./start-over-panel-control.js').attachStartOverHttp({ server: reservedServer, control: startOverControl, reason: 'owner_recovery_required' });
    const status = () => ({ ready: false, closed: false, pid: process.pid, product: 'AE Agent Core 4.2.4',
      installation: { installationId: installation.installationId, machineId: installation.machineId, packageHash: installation.packageHash, nodeVerified: true },
      lifecycle: ownerLifecycle.state(), ownershipFault: 'owner_recovery_required', physical: { listening: reservedServer.listening, port: reservedServer.address()?.port || null, inspectionAvailable: false, storeClosed: true, unknown: true, coverage: 'diagnostic-only; execution queue not reopened', readiness: aeReadiness.status({ peer: { connected: false }, storeClosed: true }, true) }, externalLegacyCoverage: 'unobserved' });
    const unavailable = () => ({ available: false, reason: 'owner_recovery_required' });
    const facade = { status, diagnostics: async () => { await aeReadiness.refresh(); return status(); }, listModules: unavailable, getContract: unavailable, getTask: unavailable,
      close: () => new Promise(resolve => { reservedServer.close(resolve); reservedServer.closeAllConnections(); }) };
    return await exposeOwner(facade, () => ({ pending: false, unresolved: true, fault: true }), (method, payload) => facade[method](payload));
  }
  const { Broker } = require('../core/broker.js');
  const { serve } = require('../core/stdio.js');
  const { exact, id } = require('../protocol/json.js');
  const { createHttpPeer } = require('../integrations/cep/http-peer.js');
  const invocationContext = mode === 'owner' ? new (require('node:async_hooks').AsyncLocalStorage)() : null;
  const completedReadErrors = new WeakMap();
  const inspection = selected.assets.find(a => a.policy === 'read-only-current-observation-v1');
  const { contract, admission } = inspection;
  const profile = { id: inspection.moduleId, executionPolicy: inspection.policy };
  const asset = { assetKey: inspection.assetKey, executorHash: inspection.executorHash };
  const mutationAssets = selected.assets.filter(a => a.resultProfile);
  const montage = release.hashes['runtime/montage-mandate.js'] ? require('./montage-mandate.js') : null;
  let provider, manual, privateEmbedding, projectSave, projectLifecycle, operatorConfirmation, latestProjectRead;
  const observedMontageProject = () => {
    const physical = peer.status(), session = workSession?.status();
    return latestProjectRead && physical.peer.connected && !physical.startOverFrozen && !session?.baselineRequired &&
      !session?.resetPending && peer.linkIdentity() === latestProjectRead.link &&
      performance.now() - latestProjectRead.at <= 120000 ? latestProjectRead.projectId : null;
  };
  function canResumeMontageTask({ taskId, steps, oneStep }) {
    if (!montage || !operatorConfirmation || oneStep !== true || !Array.isArray(steps) || steps.length !== 1 ||
        !broker.ledger.events.some(event => event.type === 'task' && event.taskId === taskId)) return false;
    const task = broker.ledger.task(taskId), projectId = observedMontageProject();
    if (task.reset || !projectId) return false;
    try {
      const mandate = montage.observeMontageMandate(installation, taskId, workSession.status().sessionId ?? installation.installationId);
      return !!mandate && mandate.body.taskEpoch === task.epoch && mandate.body.projectId === projectId &&
        mandate.body.actions.some(action => action.moduleId === steps[0]?.moduleId);
    } catch { return false; }
  }
  if (mutationAssets.length) {
    const { createWindowsReservationProvider } = require('./windows-reservation-provider.js');
    const { createManualPolicy } = require('./manual-policy.js');
    provider = createWindowsReservationProvider({ installation, getBroker: () => broker, getPeer: () => peer });
    operatorConfirmation = mutationAssets.some(item => item.operatorConfirmation)
      ? require('./operator-confirmation.js').createOperatorConfirmation(installation,
        () => workSession?.status().sessionId, observedMontageProject, () => workSession?.status().sessionId ?? installation.installationId,
        (mandate, input) => montage.importedMontageItem(broker.ledger.commands(mandate.body.taskId), mandate, input), montage)
      : undefined;
    if (operatorConfirmation && !workSession) fail('operator_confirmation_owner_required');
    const profileFor = item => {
      const binding = { pin: hash(item.manifest), contract: item.contract, admission: item.admission, operatorConfirmation: item.operatorConfirmation };
      switch (item.resultProfile) {
        case 'manual-text-v1': return binding;
        case 'photo-source-v1': return { ...binding, ...require('./photo-source-proof.js').createPhotoSourceProof(() => workSession?.status().sessionId ?? installation.installationId) };
        case 'owned-project-assembly-v1': return { ...binding, ...require('./project-assembly-proof.js').createProjectAssemblyProof(() => workSession?.status().sessionId ?? installation.installationId) };
        case 'media-import-v1': return { ...binding, ...require('./media-layer-proof.js').createMediaImportProof(() => workSession?.status().sessionId ?? installation.installationId) };
        case 'layer-insert-v1': return { ...binding, ...require('./layer-insert-proof.js').createLayerInsertProof(() => workSession?.status().sessionId ?? installation.installationId) };
        case 'layer-overlay-v1': return { ...binding, ...require('./layer-overlay-proof.js').createLayerOverlayProof(() => workSession.status().sessionId ?? installation.installationId) };
        case 'current-project-save-v1':
          projectSave = require('./project-save-proof.js').createProjectSaveProof({ stateDir: installation.stateDir,
            currentSessionId: () => workSession?.status().sessionId ?? installation.installationId });
          return { ...binding, ...projectSave };
        case 'project-lifecycle-v1':
          projectLifecycle = require('./project-lifecycle-proof.js').createProjectLifecycleProof({ stateDir: installation.stateDir, allowRenderCopy: selected.renderJobs === true,
            currentSessionId: () => workSession?.status().sessionId ?? installation.installationId });
          return { ...binding, ...projectLifecycle };
        case 'manual-point-layout-v1': return { ...binding, proof: require('./point-layout-proof.js').createPointLayoutProof({ getBroker: () => broker, getPeer: () => peer }) };
        case 'owned-text-layer-v1': return { ...binding, validateResult: require('./text-layer-proof.js').validateTextLayerCompletion };
        case 'owned-text-variant-v1': return { ...binding, validateResult: require('./text-variant-proof.js').validateTextVariantCompletion };
        case 'owned-comp-render-v1': return { ...binding, ...require('./comp-render-proof.js').createRenderProof(item.proofConfig) };
        case 'comp-frame-export-v1': return { ...binding, ...require('./comp-frame-export-proof.js') };
        default: fail('composition_not_admitted');
      }
    };
    manual = createManualPolicy({ additional: mutationAssets.map(profileFor),
      provider, installation, getPeer: () => peer, pinAdoption: !!projectLifecycle || !!montage, operatorConfirmation });
    const admissions = Object.fromEntries(mutationAssets.map(a => [a.moduleId, a.admission]));
    const transport = { identity: hash({ packageHash: installation.packageHash, admissions }), connect: value => peer.transport.connect(value), send: (value, offer) => peer.transport.send(value, offer), completion: value => peer.transport.completion(value), disconnect: () => peer.transport.disconnect() };
    privateEmbedding = { authority: manual.authority, executionPolicy: manual.port, transport };
  }
  broker = new Broker({ root, stateDir: path.join(installation.stateDir, 'broker'), transportTimeout: PRODUCTION_TIMING.callerTimeoutMs,
    ...(projectLifecycle ? { projectOpenTransportTimeout: PROJECT_OPEN_TIMING.callerTimeoutMs } : {}),
    ...(ownerLifecycle ? { stateLockToken: ownerLifecycle.brokerToken } : {}), ...(privateEmbedding ? { privateEmbedding } : {}) });
  const admissionGuard = command => {
    if (broker.closed) fail('broker_closed');
    if (broker.stateLock.error) fail(broker.stateLock.error);
    if (broker.ledger.corrupt) fail('ledger_corrupt');
    if (broker.ledger.unresolved().some(c => c.commandId !== command?.commandId)) fail('controller_unresolved');
  };
  const additionalAssets = mutationAssets.map(item => ({ assetKey: item.assetKey, moduleId: item.moduleId,
    operationId: item.contract.operationId, executorHash: item.executorHash, resultProfile: item.resultProfile, effect: item.contract.effectPolicy.effect }));
  peer = createHttpPeer({ installation, directory: path.join(installation.stateDir, 'receiver'), asset, additionalAssets,
    observeProjectSave: projectSave?.observe, observeProjectLifecycle: projectLifecycle?.observe,
    assertMediaSourceLock: manual?.assertSourceLock, requireMutationGuard: mode === 'owner',
    timeout: PRODUCTION_TIMING.callbackTimeoutMs, ...(projectLifecycle ? { projectOpenTimeout: PROJECT_OPEN_TIMING.callbackTimeoutMs } : {}),
    directReadDrainMs: DIRECT_READ_DRAIN_MS, port, admissionGuard, ...(workSession ? { workSessionId: workSession.status().sessionId, startOverControl } : {}), ...(reservedServer ? { preboundServer: reservedServer } : {}), ...(invocationContext ? { captureDeliveryGuard(command) {
    const context = invocationContext.getStore();
    if (!context) fail('owner_controller_required');
    // Retain this exact operation's grant beyond ALS lifetime, including /poll.
    return () => { context.assertCurrent(); operatorConfirmation?.assertDelivery(command); };
  } } : {}), installationContext: { descriptorPath: descriptor }, ...(ownerLifecycle ? { ownerToken: ownerLifecycle.receiverToken } : {}) });
  const contractId = hash({ packageHash: installation.packageHash, admission, contract }); let closed = false;
  const facade = Object.create(broker);
  const physical = () => {
    const value = peer.status();
    const readiness = aeReadiness.status(value, workSession?.status().baselineRequired ?? null);
    return { ...value, readiness, inspectionAvailable: !broker.closed && !broker.stateLock.error && !broker.ledger.corrupt && !broker.ledger.unresolved().length && value.peer.connected && !value.startOverFrozen && !value.storeClosed && !value.storeFault && !value.pending && !aeReadiness.blocker() };
  };
  facade.status = () => ({ ...broker.status(), product: 'AE Agent Core 4.2.4', composition: selected.composition.id, installation: { installationId: installation.installationId, packageHash: installation.packageHash, nodeVersion: process.versions.node, nodeVerified: true, machineId: installation.machineId }, physical: physical(), ...(ownerLifecycle ? { lifecycle: ownerLifecycle.state() } : {}), automaticLifecycle: 'unavailable', inspectionPolicy: profile.executionPolicy, manualPolicy: manual?.policyId || null, resourceProvider: provider ? provider.status() : null, ...(manual ? {} : { mutationAvailable: false }), externalLegacyCoverage: 'unobserved' });
  facade.diagnostics = async () => {
    await aeReadiness.refresh();
    return { ...broker.diagnostics(), ...facade.status() };
  };
  facade.connect = async () => {
    const result = manual ? await broker.connect() : null;
    const snapshot = physical();
    return { ...(manual ? result : { available: snapshot.inspectionAvailable, reason: snapshot.inspectionAvailable ? null : 'physical_inspection_unavailable', mutationAvailable: false }), automaticLifecycle: 'unavailable', physical: snapshot };
  };
  facade.disconnect = async () => ({ disconnected: false, reason: mode === 'owner' ? 'physical_link_owned_by_installation_owner' : 'physical_link_owned_by_stdio_lifetime', physical: physical() });
  facade.listModules = value => { const result = broker.listModules(value); return { ...result, modules: [...result.modules, { id: profile.id, version: '4.0.0', executionPolicy: profile.executionPolicy }] }; };
  facade.getContract = value => {
    if (value.moduleId === profile.id) {
      exact(value, ['moduleId']);
      return { contractId, moduleId: profile.id, operationId: contract.operationId, modulePin: hash(admission), contract: JSON.parse(canonical(contract)) };
    }
    const result = broker.getContract(value);
    return mutationAssets.some(item => item.moduleId === result.moduleId && item.operatorConfirmation)
      ? { ...result, operatorConfirmation: 'local-operator-exact-confirmation-v1' }
      : result;
  };
  facade.inspect = async value => {
    if (value.contractId !== contractId) {
      try { return await broker.inspect(value); }
      catch (error) {
        const rejection = peer.consumeReadRejection(error), context = invocationContext?.getStore();
        const selected = mutationAssets.find(item => item.moduleId === value.moduleId && item.executorHash === rejection?.executorHash);
        if (selected && context && !context.observer && rejection.physical.stage === 'terminal' &&
            rejection.payloadHash === hash(canonical(value.target))) {
          completedReadErrors.set(error, { context, moduleId: value.moduleId, contractId: value.contractId,
            targetHash: rejection.payloadHash, code: rejection.code, physical: rejection.physical });
        }
        throw error;
      }
    }
    exact(value, ['moduleId', 'contractId', 'target']);
    if (value.moduleId !== profile.id) fail('contract_identity');
    const target = value.target || {};
    const context = invocationContext?.getStore();
    // A new project baseline may follow an AE open or a newly visible modal.
    await aeReadiness.refresh({ force: Object.keys(target).length === 0 });
    context?.assertCurrent();
    const blocker = aeReadiness.blocker();
    if (blocker) {
      const error = Object.assign(new Error(blocker), { code: blocker });
      if (context && !context.observer) completedReadErrors.set(error, { context, moduleId: value.moduleId, contractId, targetHash: hash(canonical(target)), code: blocker, phase: 'pre-dispatch' });
      throw error;
    }
    const originalPeerId = peer.status().peer.peerId, originalLink = peer.linkIdentity();
    let result;
    try { result = await peer.inspect(target); }
    catch (error) {
      const rejection = peer.consumeReadRejection(error);
      if (rejection && context && !context.observer && rejection.executorHash === asset.executorHash && rejection.payloadHash === hash(canonical(target))) {
        completedReadErrors.set(error, { context, moduleId: value.moduleId, contractId, targetHash: rejection.payloadHash, code: rejection.code, physical: rejection.physical });
      }
      throw error;
    }
    if (result.observation?.readFailureVersion === 1) fail(result.observation.code || 'inspection_failed');
    aeReadiness.recordRead(originalPeerId);
    const coverage = result.observation?.coverage;
    if (workSession && originalLink === peer.linkIdentity() && !peer.status().startOverFrozen && value.target?.cursor === undefined &&
        (!coverage || coverage.inventory.status !== 'scan_incomplete' && ['not_requested', 'found'].includes(coverage.lookup.status))) {
      workSession.recordProjectBaseline(peer, result);
      latestProjectRead = { link: originalLink, projectId: result.observation.target.projectId, at: performance.now() };
    }
    return { evidenceRef: id('observation'), moduleId: profile.id, contractId, ...result, authority: false };
  };
  facade.build = value => { if (value.contractId === contractId || value.steps?.some(s => s.contractId === contractId)) fail('read_only_module_build_unsupported'); return broker.build(value); };
  if (selected.renderJobs && mode === 'owner') {
    const { createRenderJobOwner } = require('./render-job-owner.js');
    const render = createRenderJobOwner({ stateDir: installation.stateDir, installationId: installation.installationId,
      getCommand(taskId, commandId) {
        if (broker.ledger.corrupt) return undefined;
        const record = broker.ledger.commands(taskId).find(command => command.commandId === commandId);
        if (record?.target?.sessionId !== (invocationContext.getStore()?.sessionId ?? installation.installationId)) return undefined;
        return record;
      } });
    const current = () => {
      const context = invocationContext.getStore();
      if (!context || context.observer) fail('owner_controller_required');
      context.assertCurrent();
    };
    const admitting = () => {
      current();
      if (attachmentOwner.status().frozen) fail('render_job_maintenance');
    };
    facade.renderJobPrepare = value => render.prepare(value, admitting);
    facade.renderJobStart = value => render.start(value, admitting);
    facade.renderJobStatus = value => render.status(value);
    facade.renderJobReconcile = value => render.reconcile(value, current);
    facade.renderJobFinalize = value => render.finalize(value, current);
    facade.renderJobCancel = value => render.cancel(value, current);
  }
  facade.close = async () => { if (closed) return; closed = true; await peer.close(); await broker.close(); };
  try { await peer.listen(); } catch (e) { await facade.close(); throw e; }
  if (mode === 'owner') {
    const activity = () => {
      const physicalState = peer.status();
      return { pending: !!(broker.running || broker.reconciling || broker.controllerBusy || broker.controlPending || broker.worker.status().pending || physicalState.pending),
        unresolved: !!(broker.ledger.unresolved().length || physicalState.storeClosed || physicalState.unknown),
        fault: !!(broker.closed || broker.stateLock.error || broker.ledger.corrupt || physicalState.storeFault) };
    };
    return await exposeOwner(facade, activity, (method, payload, context) => {
      const receiver = Object.hasOwn(facade, method) ? facade : broker;
      return invocationContext.run(context, () => { if (!context.observer) context.assertCurrent(); return receiver[method](payload); });
    }, {
      consumeReadRejection(error, request) {
        const record = completedReadErrors.get(error); completedReadErrors.delete(error);
        if (!record || request.context !== record.context || request.method !== 'inspect_module_target' || request.payload.moduleId !== record.moduleId || request.payload.contractId !== record.contractId || hash(canonical(request.payload.target || {})) !== record.targetHash) return null;
        return { code: record.code, ...(record.phase ? { phase: record.phase } : {}), ...(record.physical ? { physical: record.physical } : {}) };
      },
      isFreshDryrunRefusal: Broker.isFreshDryrunRefusal,
      consumeMediaDuplicateBuildRefusal: Broker.consumeMediaDuplicateBuildRefusal,
      canResumeTask: canResumeMontageTask,
      renderJobs: selected.renderJobs === true
    });
  }
  serve(facade, input, output, { serverInfo: { name: 'ae-agent-core4', version: '4.2.4' } });
  return { close: facade.close, status: facade.status };
  } catch (e) {
    if (ipc) await ipc.close();
    if (peer) await peer.close();
    else if (reservedServer?.listening) await new Promise(resolve => { reservedServer.close(resolve); reservedServer.closeAllConnections(); });
    if (broker) await broker.close(); if (ownerLifecycle) { try { ownerLifecycle.abortStartup(); } catch {} } throw e;
  }
  finally { if (startupGate !== undefined) { fs.closeSync(startupGate); fs.unlinkSync(installGate); } }
}
// Direct-main start imports the historical reader synchronously. Publish these
// builtin verifiers first so its installation.js import sees initialized exports.
module.exports = { start, verifyInstallation, verifyRelease, verifyCep, deriveComposition, compositionPaths, builtinCapabilityFiles, validateCompRenderCompletion, registrySource, installationConfig, PRODUCTION_TIMING };
if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== '--installation') { process.stderr.write('Explicit --installation ABSOLUTE_DESCRIPTOR required.\n'); process.exitCode = 2; }
  else start({ descriptor: args[1] }).then(runtime => {
    for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => runtime.close().then(() => process.exit(0)));
  }).catch(e => { process.stderr.write((e.code || 'runtime_start_failed') + '\n'); process.exitCode = 1; });
}

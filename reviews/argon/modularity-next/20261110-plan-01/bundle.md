# Архитектура модулей после R1. Предложение для проверки

База 8e3b718db3c695190a45607064ac04e11d4d5558, Core 4.2.2. Пользователь просит проверить архитектуру, получить одну консультацию Argon и уточнить план для нового чата. Реализация будет отдельным этапом на MSI. Десктоп позднее получает принятый пакет штатным переносом.

## Факты и пределы

R1 принят нативно на MSI через configured MCP. Core готовит очередь в копии AEP, выполняет фоновой рендер, отмену, reconcile и finalize по постоянному ID. Существуют нативные proof полного мастера 720 кадров, диапазона с ненулевым стартом, фото → save → MP4, отмены, потери worker после handoff, отказов занятого/повреждённого выхода и missing media. Эти receipts в пакет не включены. Это контекст владельца, а не evidence для независимой переаттестации Argon.

Декларации уже задают состав и профили typed AE-операций. C1b/C1c поддерживает обновление существующего слота с точным прежним публичным контрактом и четырьмя файлами, без publicDependencies. Слоты с completion.json не проходят этот формат. Новый модуль с существующим профилем уже добавлялся декларативно в пилоте.

R1 — привилегированный сервис долговечных заданий, связанный с project-lifecycle, проверенными файлами, процессами и журналом. Он не является обычным JSX-модулем. Его доступность определяется composition.id в deriveComposition, наличием файла у thin client и отдельным перечнем методов. Состав наследует полный operator-workflows-montage, включая Titles, overlay и PNG. Наличие этих возможностей у совмещённого рабочего состава может быть намеренным. Предлагается дополнительный минимальный состав после доказательства зависимости каждой части.

## Проект последовательности

M0. Зафиксировать карту фактических runtime/module/product границ и прямых/транзитивных зависимостей R1, операции project-lifecycle и package-capability. Сравнить manifest действующего совмещённого состава с минимально необходимым. Проверить ABI, admissions, source evidence и active job update gates. Точное назначение каждого состава записать.

M1. Декларативная доступность уже известного trusted R1-сервиса. Предпочтителен закрытый идентификатор возможности и фиксированная проверенная реализация. Проверка одной принятой декларации должна согласовать package verification, owner, client discovery и stage-render-copy. Новые произвольные пути импорта и обработчики из данных не предлагаются. Сохраняем old composition-v1/v2 и ранее выданные release как отдельный совместимый путь.

M2. Минимальный состав для рендера существующего сохранённого AEP и сохранение совмещённого montage+render состава. Определить точную зависимость project-lifecycle от save/checkpoint/inspection/admission/confirmation. Проверить отсутствие лишних продуктов в minimal manifest, наличие нужных proofs и запрет выпуска задач при исключённом R1. Новый selector с существующим capability должен собираться без branch по имени selector.

M3. Расширить отдельную поставку типизированных AE-операций на data-only дополнительные файлы в пределах существующего доверенного профиля. Первый пример comp-render/completion.json. Сохранить base pin, exact contract compatibility, admission, bounded bytes/path checks и остановленное обновление. Отдельное обновление privileged R1 runtime требует собственного доказанного контракта совместимости. Не обещать его в формате нынешнего четырёхфайлового capability.

M4. Приёмка реального обновления на MSI. Независимые операции/runtime должны иметь прежние hashes при обновлении ordinary module. Сохранить identities/config/history/credentials и исходные UNKNOWN. Для R1 объяснить судьбу активного задания, потерянного worker, verified partial, publish-intent и terminal history при обновлении. Предпочесть отказ до update при незавершённом incompatible job, а не неявную миграцию или повтор. Нативный сценарий только после source/TEMP приёмки и fresh MCP preflight, на копии AEP.

Каждый milestone отдельный commit, Progress/Decision Log/Validation и scoped tests. Переиспользовать точные незатронутые результаты. Не выполнять full suite для каждого module edit. Разделять JS/VM, isolated install и native MSI evidence. Визуальная приёмка видео остаётся соседним продуктовым блоком.

## Вопросы

1. Правильна ли граница ordinary operation / trusted R1 service / product workflow? Какие конкретные source связи мы упустили?
2. Что минимально нужно менять для независимых составов и последующего обновления? Нужно ли сначала M3 comp-render, а затем M1–M2 R1? Обоснуйте порядок риском и проверяемым выигрышем.
3. Где текущие проверки допуска, bootstrap и old release compatibility нельзя заменить данными? Достаточен ли один закрытый capability descriptor?
4. Какие состояния долговечного задания блокируют update/rollback/удаление capability? Свяжите каждый риск с конкретной функцией и состоянием.
5. Какие точные acceptance checks доказывают модульность и ограниченность регрессий? Отделите blockers от необязательных улучшений.


# Исходники закреплённой базы

## core4/runtime/stdio-entry.js

SHA-256 87b84144f3579b55bd28a41d629fe5ddd010851a5a880c101b8125f62b2cb1f7

```javascript
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
const RENDER_JOB_FILES = ['runtime/render-job-owner.js', 'runtime/aerender-jobs.js', 'runtime/aerender-profile.js'];
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
  exactKeys(policy, ['id', 'modules', 'assets', 'profiles', 'files', 'closures']);
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
  return policy.profiles;
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
    if (Object.hasOwn(release.hashes, 'runtime/composition.json') || Object.hasOwn(release.hashes, POLICY_FILE)) fail('composition_downgrade');
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
  const profiles = composition.version === 2 ? declarativeProfiles(composition, release, json, checked) : LEGACY_PROFILES;
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
      proofConfig = json(asset.path + '/completion.json');
      exactKeys(proofConfig, ['directory', 'format']);
      if (typeof proofConfig.directory !== 'string' || !/^[a-z][a-z0-9-]{0,63}$/.test(proofConfig.directory) || proofConfig.format !== 'H.264') fail('composition_not_admitted');
    }
    return { ...asset, ...value, executorHash: value.admission.executorHash, ...(binding ? { resultProfile: binding.resultProfile } : {}),
      ...(binding?.operatorConfirmation ? { operatorConfirmation: true } : {}),
      ...(binding?.operatorConfirmation === 'registry-v1' ? { registryOperatorConfirmation: true } : {}),
      ...(proofConfig ? { proofConfig } : {}) };
  });
  const startOverSupported = Object.hasOwn(release.hashes, 'runtime/owner-contract.json') && json('runtime/owner-contract.json').version === 4;
  if (assets.some(item => item.operatorConfirmation) && !startOverSupported) fail('operator_confirmation_owner_required');
  const renderJobs = composition.id === 'operator-render-jobs';
  if (renderJobs) {
    if (!startOverSupported || composition.version !== 2 || !assets.some(item => item.resultProfile === 'project-lifecycle-v1' && item.registryOperatorConfirmation)) fail('render_job_owner_required');
    for (const file of RENDER_JOB_FILES) checked(file);
  } else if (RENDER_JOB_FILES.some(file => Object.hasOwn(release.hashes, file))) fail('composition_optional_closure');
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
  exactKeys(release, ['version', 'format', 'hashes']); if ((release.version !== '4.0.0' && !(['4.1.0', '4.1.1', '4.1.2', '4.2.1', '4.2.2'].includes(release.version) && release.format === 2)) || !release.hashes || Object.getPrototypeOf(release.hashes) !== Object.prototype) fail('release_schema');
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
  if (release.format === 1) { if (Object.hasOwn(release.hashes, 'runtime/composition.json') || Object.hasOwn(release.hashes, POLICY_FILE)) fail('composition_downgrade'); return; }
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
        catch (e) { return { ok: false, code: ['maintenance_authorization', 'maintenance_in_progress', 'maintenance_persist_failed', 'maintenance_schema', 'maintenance_id'].includes(e.code) ? e.code : 'maintenance_refused' }; }
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
    const status = () => ({ ready: false, closed: false, pid: process.pid, product: 'AE Agent Core 4.2.2',
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
  facade.status = () => ({ ...broker.status(), product: 'AE Agent Core 4.2.2', composition: selected.composition.id, installation: { installationId: installation.installationId, packageHash: installation.packageHash, nodeVersion: process.versions.node, nodeVerified: true, machineId: installation.machineId }, physical: physical(), ...(ownerLifecycle ? { lifecycle: ownerLifecycle.state() } : {}), automaticLifecycle: 'unavailable', inspectionPolicy: profile.executionPolicy, manualPolicy: manual?.policyId || null, resourceProvider: provider ? provider.status() : null, ...(manual ? {} : { mutationAvailable: false }), externalLegacyCoverage: 'unobserved' });
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
    facade.renderJobPrepare = value => render.prepare(value, current);
    facade.renderJobStart = value => render.start(value, current);
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
  serve(facade, input, output, { serverInfo: { name: 'ae-agent-core4', version: '4.2.2' } });
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
module.exports = { start, verifyInstallation, verifyRelease, verifyCep, deriveComposition, compositionPaths, registrySource, installationConfig, PRODUCTION_TIMING };
if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== '--installation') { process.stderr.write('Explicit --installation ABSOLUTE_DESCRIPTOR required.\n'); process.exitCode = 2; }
  else start({ descriptor: args[1] }).then(runtime => {
    for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => runtime.close().then(() => process.exit(0)));
  }).catch(e => { process.stderr.write((e.code || 'runtime_start_failed') + '\n'); process.exitCode = 1; });
}

```

## core4/runtime/client-entry.js

SHA-256 a233f6915cfffc3a8a8987e47e8e98e9ea8393b633172bc41bba3b5165bc5618

```javascript
'use strict';
// Bootstrap is builtin-only until the entire installed client release is read
// back. The thin client never reads installation.json, panelToken or AE state.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const KEYS = ['version', 'role', 'installationId', 'machineId', 'installRoot', 'releaseDir', 'packageHash', 'nodePath', 'nodeHash', 'controlToken', 'originHash', 'ownerEndpoint'];
function fail(code) { throw Object.assign(new Error(code), { code }); }
function canonical(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (!value || Object.getPrototypeOf(value) !== Object.prototype) fail('client_json');
  return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
}
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const hex = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const id = value => typeof value === 'string' && /^[A-Za-z0-9._:-]{1,128}$/.test(value);
function plain(file, directory = false) {
  if (!path.isAbsolute(file) || path.resolve(file) !== file) fail('client_path');
  let cursor = path.parse(file).root;
  const parts = file.slice(cursor.length).split(path.sep).filter(Boolean);
  for (let n = 0; n < parts.length; n++) {
    cursor = path.join(cursor, parts[n]); const stat = fs.lstatSync(cursor);
    if (stat.isSymbolicLink() || stat.reparsePoint || fs.realpathSync(cursor) !== cursor || (n < parts.length - 1 || directory ? !stat.isDirectory() : !stat.isFile())) fail('client_path');
  }
}
function read(file, limit) {
  plain(file); const named = fs.lstatSync(file), fd = fs.openSync(file, 'r');
  try {
    const stat = fs.fstatSync(fd);
    if (!named.isFile() || !stat.isFile() || named.dev !== stat.dev || named.ino !== stat.ino) fail('client_path');
    if (!Number.isSafeInteger(stat.size) || stat.size < 1 || stat.size > limit) fail('client_file_budget');
    const bytes = Buffer.alloc(stat.size); let offset = 0;
    while (offset < bytes.length) { const count = fs.readSync(fd, bytes, offset, bytes.length - offset, offset); if (!count) fail('client_file_changed'); offset += count; }
    const extra = fs.readSync(fd, Buffer.alloc(1), 0, 1, offset), after = fs.fstatSync(fd);
    if (extra || ['dev', 'ino', 'size', 'mtimeMs', 'ctimeMs'].some(key => after[key] !== stat[key])) fail('client_file_changed');
    let final;
    try { plain(file); final = fs.lstatSync(file); } catch { fail('client_file_changed'); }
    if (!final.isFile() || ['dev', 'ino', 'size', 'mtimeMs', 'ctimeMs'].some(key => final[key] !== after[key])) fail('client_file_changed');
    return bytes;
  } finally { fs.closeSync(fd); }
}
function ownerEndpoint({ installationId, machineId }) {
  if (!id(installationId) || !id(machineId)) fail('client_identity');
  return '\\\\.\\pipe\\ae-core4-owner-' + hash(JSON.stringify({ installationId, machineId })).slice(0, 32);
}
function projectClientDescriptor(installation, options = {}) {
  // Role projection for a verified installer/owner embedding. It does not
  // issue credentials, create files or make a caller-supplied installation safe.
  const { installationId, machineId, installRoot, releaseDir, packageHash, nodePath, nodeHash, controlToken } = installation;
  if (!id(installationId) || !id(machineId) || !hex(packageHash) || !hex(nodeHash) || !hex(controlToken) || !path.isAbsolute(installRoot) || path.resolve(installRoot) !== installRoot || releaseDir !== path.join(installRoot, 'releases', packageHash) || !path.isAbsolute(nodePath) || path.resolve(nodePath) !== nodePath) fail('client_descriptor');
  if (!options || Object.getPrototypeOf(options) !== Object.prototype || Object.keys(options).some(key => key !== 'originBytes')) fail('client_projection_options');
  const originBytes = Object.hasOwn(options, 'originBytes') ? options.originBytes : read(path.join(installRoot, 'origin.json'), 8192);
  if (!Buffer.isBuffer(originBytes) || originBytes.length < 1 || originBytes.length > 8192 || !Buffer.from(originBytes.toString('utf8')).equals(originBytes)) fail('client_origin');
  let origin; try { origin = JSON.parse(originBytes.toString('utf8')); } catch { fail('client_origin'); }
  if (origin?.installationId !== installationId || origin?.machineId !== machineId) fail('client_origin');
  const descriptor = { version: 1, role: 'core4-control-client', installationId, machineId, installRoot, releaseDir, packageHash, nodePath, nodeHash, controlToken,
    originHash: hash(originBytes), ownerEndpoint: ownerEndpoint({ installationId, machineId }) };
  if (Buffer.byteLength(canonical(descriptor)) > 16384) fail('client_file_budget');
  return Object.freeze(descriptor);
}
function verifyClientDescriptor(file) {
  const bytes = read(file, 16384); let descriptor;
  try { descriptor = JSON.parse(bytes.toString('utf8')); } catch { fail('client_descriptor'); }
  const d = descriptor;
  if (!d || Object.getPrototypeOf(d) !== Object.prototype || Object.keys(d).length !== KEYS.length || KEYS.some(k => !Object.hasOwn(d, k)) || canonical(d) !== bytes.toString('utf8') || d.version !== 1 || d.role !== 'core4-control-client' || !id(d.installationId) || !id(d.machineId) || !hex(d.packageHash) || !hex(d.nodeHash) || !hex(d.controlToken) || !hex(d.originHash)) fail('client_descriptor');
  if (!path.isAbsolute(d.installRoot) || file !== path.join(d.installRoot, 'core-client.json') || d.releaseDir !== path.join(d.installRoot, 'releases', d.packageHash) || !path.isAbsolute(d.nodePath) || d.ownerEndpoint !== ownerEndpoint(d)) fail('client_descriptor_scope');
  plain(d.installRoot, true); plain(d.releaseDir, true);
  const originBytes = read(path.join(d.installRoot, 'origin.json'), 8192), origin = JSON.parse(originBytes.toString('utf8'));
  if (hash(originBytes) !== d.originHash || origin.installationId !== d.installationId || origin.machineId !== d.machineId) fail('client_origin');
  if (path.resolve(process.execPath).toLowerCase() !== path.resolve(d.nodePath).toLowerCase() || Number(process.versions.node.split('.')[0]) < 20 || hash(read(d.nodePath, 512 * 1024 * 1024)) !== d.nodeHash) fail('client_node');
  const manifestBytes = read(path.join(d.releaseDir, 'release.json'), 1024 * 1024), manifest = JSON.parse(manifestBytes.toString('utf8'));
  if (hash(manifestBytes) !== d.packageHash || canonical(manifest) !== manifestBytes.toString('utf8') || Object.keys(manifest).sort().join(',') !== 'format,hashes,version' || manifest.version !== '4.2.2' || manifest.format !== 2 || !manifest.hashes || Object.getPrototypeOf(manifest.hashes) !== Object.prototype) fail('client_release');
  const files = new Set(['release.json']), dirs = new Set(['']); let total = 0;
  const entries = Object.entries(manifest.hashes);
  if (entries.length < 1 || entries.length > 1024 || !Object.hasOwn(manifest.hashes, 'runtime/client-entry.js')) fail('client_release');
  for (const [relative, digest] of entries) {
    if (!/^[A-Za-z0-9_./-]+$/.test(relative) || relative.split('/').some(v => !v || v === '.' || v === '..') || path.isAbsolute(relative) || relative === 'release.json' || !hex(digest)) fail('client_release_path');
    files.add(relative); for (let parent = path.posix.dirname(relative); parent !== '.'; parent = path.posix.dirname(parent)) dirs.add(parent);
  }
  function visit(directory, relative) {
    plain(directory, true); if (!dirs.delete(relative)) fail('client_release_tree');
    for (const name of fs.readdirSync(directory)) {
      const full = path.join(directory, name), rel = relative ? relative + '/' + name : name, stat = fs.lstatSync(full);
      if (stat.isDirectory()) visit(full, rel);
      else {
        if (!files.delete(rel)) fail('client_release_tree');
        const value = read(full, 4 * 1024 * 1024); total += value.length;
        if (total > 32 * 1024 * 1024 || (rel === 'release.json' ? !value.equals(manifestBytes) : hash(value) !== manifest.hashes[rel])) fail('client_release_bytes');
      }
    }
  }
  visit(d.releaseDir, ''); if (files.size || dirs.size) fail('client_release_tree');
  return Object.freeze(d);
}
async function startClient({ descriptor, input = process.stdin, output = process.stdout } = {}) {
  const d = verifyClientDescriptor(descriptor);
  if (fs.realpathSync(path.resolve(__dirname, '..')) !== fs.realpathSync(d.releaseDir)) fail('client_entry_root');
  // All non-builtin imports are below full release and exact-entry verification.
  const { createIpcClient, isPreSendClosed } = require('./client-ipc');
  const { serveAttachment } = require('./client-stdio');
  const { spawn } = require('node:child_process');
  const lifetime = new AbortController();
  let linked = null, connecting = null, closed = false, launchAttempted = false;
  const preSpawnStops = new WeakSet();
  const absent = error => error?.code === 'ipc_endpoint_absent' && error.phase === 'preconnect' && ['ENOENT', 'ECONNREFUSED'].includes(error.reason);
  const unavailable = () => fail('owner_unavailable');
  function stopped() {
    // This role cannot verify the full-role maintenance seal. Observed presence
    // only denies launch; it never asserts a valid stop/death/maintenance grant.
    for (const dir of [path.join(d.installRoot, 'state'), path.join(d.installRoot, 'state/production')]) {
      try { plain(dir, true); } catch (e) { if (e.code === 'ENOENT') return false; throw e; }
    }
    // In the admitted v4 cluster this only routes bootstrap to the verified
    // read-only reset driver. Presence cannot authorize stores or a new session;
    // the full-role entry validates even malformed/partial reset state first.
    try { fs.lstatSync(path.join(d.installRoot, 'state/production/runtime-start-over.json')); return false; }
    catch (e) { if (e.code !== 'ENOENT') throw e; }
    try { fs.lstatSync(path.join(d.installRoot, 'state/production/runtime-maintenance.json')); return true; }
    catch (e) { if (e.code === 'ENOENT') return false; throw e; }
  }
  function refuseStopped() { const error = Object.assign(new Error('owner_desired_stopped'), { code: 'owner_desired_stopped' }); preSpawnStops.add(error); throw error; }
  function attach(handshakeMs) {
    if (closed) unavailable();
    return createIpcClient({ endpoint: d.ownerEndpoint, identity: { installationId: d.installationId, machineId: d.machineId, packageHash: d.packageHash },
      secret: d.controlToken, timeoutMs: 120000, signal: lifetime.signal, ...(handshakeMs ? { limits: { handshakeMs } } : {}) });
  }
  async function launch() {
    // Let an already queued stdio EOF revoke bootstrap before verification/spawn.
    await new Promise(resolve => setImmediate(resolve));
    if (closed) unavailable();
    if (stopped()) refuseStopped();
    const fresh = verifyClientDescriptor(descriptor);
    if (canonical(fresh) !== canonical(d)) fail('client_descriptor_changed');
    if (fs.realpathSync(path.resolve(__dirname, '..')) !== fs.realpathSync(fresh.releaseDir)) fail('client_entry_root_changed');
    const manifestBytes = read(path.join(d.releaseDir, 'release.json'), 1024 * 1024), manifest = JSON.parse(manifestBytes);
    const ownerFiles = ['runtime/owner-entry.js', 'runtime/client-entry.js', 'runtime/client-ipc.js', 'runtime/client-stdio.js', 'runtime/controller-lease.js', 'runtime/attachment-owner.js', 'runtime/owner-lifecycle.js', 'runtime/recovery-inspection.js', 'runtime/windows-owner-process.js', 'runtime/owner-maintenance.js', 'runtime/start-over-inspection.js', 'runtime/start-over-process.js', 'runtime/start-over-state.js', 'runtime/start-over-barrier.js', 'runtime/start-over-archive.js', 'runtime/start-over-finisher.js', 'runtime/work-session.js', 'runtime/start-over-panel-control.js', 'runtime/start-over-driver.js', 'runtime/owner-launch.js'];
    const contractBytes = read(path.join(d.releaseDir, 'runtime/owner-contract.json'), 8192);
    const expected = { version: 4, runtimeModel: 'owner', clientEntry: 'runtime/client-entry.js', clientArgument: '--client-descriptor',
      ownerEntry: 'runtime/owner-entry.js', ownerArgument: '--installation', clientDescriptorFile: 'core-client.json', requiredFiles: ownerFiles };
    if (hash(manifestBytes) !== d.packageHash || hash(contractBytes) !== manifest.hashes['runtime/owner-contract.json'] ||
        canonical(JSON.parse(contractBytes)) !== canonical(expected) || ownerFiles.some(file => !hex(manifest.hashes[file]))) fail('client_owner_contract');
    const entry = path.join(d.releaseDir, 'runtime/owner-entry.js'), installation = path.join(d.installRoot, 'installation.json');
    plain(entry); plain(installation);
    const env = Object.create(null);
    // Windows process creation may restore omitted OS/user variables; Node also
    // propagates NODE_V8_COVERAGE. Explicit empties prevent value inheritance.
    for (const key of ['PATH', 'HOMEDRIVE', 'HOMEPATH', 'LOGONSERVER', 'SYSTEMDRIVE', 'USERDOMAIN', 'USERNAME', 'USERPROFILE', 'NODE_V8_COVERAGE']) env[key] = '';
    for (const key of ['SystemRoot', 'WINDIR', 'TEMP', 'TMP']) {
      const value = process.env[key]; if (typeof value === 'string' && path.isAbsolute(value) && !value.includes('\0')) env[key] = value;
    }
    // EOF/config rotation queued during the synchronous hash pass must run
    // before spawn. Finish with a bounded descriptor CAS, not another hash pass.
    await new Promise(resolve => setImmediate(resolve));
    if (closed) unavailable();
    if (!read(descriptor, 16384).equals(Buffer.from(canonical(d)))) fail('client_descriptor_changed');
    plain(d.releaseDir, true);
    if (stopped()) refuseStopped();
    if (closed) unavailable();
    await new Promise((resolve, reject) => {
      let child;
      try { child = spawn(d.nodePath, [entry, '--installation', installation], { shell: false, windowsHide: true, detached: true, stdio: 'ignore', cwd: d.releaseDir, env }); }
      catch { reject(Object.assign(new Error('owner_launch_failed'), { code: 'owner_launch_failed' })); return; }
      child.once('error', () => reject(Object.assign(new Error('owner_launch_failed'), { code: 'owner_launch_failed' })));
      child.once('spawn', () => { try { child.unref(); resolve(); } catch { reject(Object.assign(new Error('owner_launch_failed'), { code: 'owner_launch_failed' })); } });
    });
  }
  function pause(ms) {
    return new Promise(resolve => {
      const done = () => { clearTimeout(timer); lifetime.signal.removeEventListener('abort', done); resolve(); };
      const timer = setTimeout(done, ms);
      lifetime.signal.addEventListener('abort', done, { once: true }); if (closed) done();
    });
  }
  async function connect() {
    try { return await attach(); }
    catch (error) {
      if (!absent(error) || closed || launchAttempted) throw error;
      if (stopped()) refuseStopped();
      launchAttempted = true;
      try { await launch(); }
      catch (failure) { if (preSpawnStops.has(failure)) launchAttempted = false; throw failure; }
      // Cold owner verification/recovery may exceed five seconds. This is one
      // bounded, absence-only boot wait following the one guarded launch.
      const deadline = performance.now() + 15000;
      while (!closed) {
        const remaining = Math.ceil(deadline - performance.now()); if (remaining < 1) unavailable();
        try { return await attach(Math.min(3000, remaining)); }
        catch (next) { if (!absent(next)) throw next; }
        await pause(Math.min(100, Math.max(1, deadline - performance.now())));
      }
      unavailable();
    }
  }
  const client = {
    async call(method, payload) {
      // A fresh attachment may serve this same request only with private proof
      // that the old call never reached send. It never transfers lease state.
      for (let attachment = 0; attachment < 2; attachment++) {
        if (closed) fail('owner_unavailable');
        if (!linked) {
          if (!connecting) connecting = connect();
          const attempt = connecting;
          try { linked = await attempt; launchAttempted = false; }
          catch { return method === 'owner_status' ? { ok: true, value: { available: false, reason: 'owner_connection_unavailable', coverage: 'unobserved' } } : { ok: false, code: 'owner_unavailable' }; }
          finally { if (connecting === attempt) connecting = null; }
        }
        if (closed) { linked.close(); linked = null; fail('owner_unavailable'); }
        const connection = linked;
        try { return await connection.call(method, payload); }
        catch (error) {
          if (error?.code === 'ipc_outcome_uncertain' || error?.code === 'ipc_closed') {
            connection.close(); if (linked === connection) linked = null;
          }
          if (attachment === 0 && !closed && typeof isPreSendClosed === 'function' && isPreSendClosed(error)) continue;
          throw error;
        }
      }
    },
    close() { closed = true; lifetime.abort(); if (linked) linked.close(); linked = null; }
  };
  // Initialize/tools-list remain available without an owner. A failed accepted
  // call is never resent. Only a privately proven pre-send idle closure permits
  // one fresh attachment within a request; other losses need explicit requests.
  try {
    const release = read(path.join(d.releaseDir, 'release.json'), 1024 * 1024);
    if (hash(release) !== d.packageHash) fail('client_release');
    const renderJobs = Object.hasOwn(JSON.parse(release).hashes, 'runtime/render-job-owner.js');
    return serveAttachment({ client, input, output, ...(renderJobs ? { renderJobs: true } : {}) });
  } catch (error) { client.close(); throw error; }
}
module.exports = { ownerEndpoint, projectClientDescriptor, verifyClientDescriptor, startClient };
if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== '--client-descriptor') { process.stderr.write('Explicit --client-descriptor ABSOLUTE_PATH required.\n'); process.exitCode = 2; }
  else startClient({ descriptor: args[1] }).catch(error => { process.stderr.write((error.code || 'client_start_failed') + '\n'); process.exitCode = 1; });
}

```

## core4/runtime/client-stdio.js

SHA-256 3dc4e7e582cb44e2d25e82bbc6e0c77e1aa1ebeb5d09acb5c10df0e16192abb2

```javascript
'use strict';
const { createInterface } = require('node:readline');
const { ownerMethods, OWNER_ERRORS, READ_REJECTION_CODES, PRE_DISPATCH_READ_CODES, classifyPhysicalRead } = require('./attachment-owner');

// Thin private fixture/embedding adapter, not the configured production entry.
// EOF closes this authenticated attachment only. No Broker/HTTP/store/bootstrap.
function serveAttachment({ client, input, output, renderJobs = false } = {}) {
  if (!client || typeof client.call !== 'function' || typeof client.close !== 'function' || !input || !output) throw new Error('stdio_attachment_options');
  const MAX = 256 * 1024;
  const methods = ownerMethods(renderJobs);
  let pending = 0, bytes = 0, ended = false;
  const ownErrors = new WeakSet();
  function fail(code, requestId, physical) { const error = new Error(code); ownErrors.add(error); error.requestId = requestId; error.physical = physical; throw error; }
  function reply(value) {
    if (ended || output.destroyed || output.writableEnded) return;
    const id = Number.isSafeInteger(value.id) || typeof value.id === 'string' && Buffer.byteLength(value.id) <= 256 ? value.id : null;
    let data = JSON.stringify({ ...value, id });
    if (Buffer.byteLength(data) > MAX) data = JSON.stringify({ jsonrpc: '2.0', id, error: { code: -32000, message: 'frame_too_large' } });
    if (output.writableLength + Buffer.byteLength(data) + 1 > MAX * 4) { finish(); return; }
    output.write(data + '\n');
  }
  function exact(value, keys) { if (!value || Object.getPrototypeOf(value) !== Object.prototype || Object.keys(value).some(k => !keys.includes(k))) fail('invalid_request'); }
  function description(name) {
    if (name === 'controller_acquire' || name === 'controller_transfer') return 'Явное получение управления. Сначала прочитайте core_status; для нового сеанса передайте его workSession.sessionId в payload.sessionId. Это не допуск к изменению AE.';
    if (name === 'core_status') return 'Статус Core, текущего сеанса и сброса. baselineRequired снимается свежей project-inspection; старое управление автоматически не восстанавливается.';
    if (name === 'core_diagnostics') return 'Статус очереди, привязки CEP, окна Windows и подтверждённого нативного ответа.';
    if (name === 'inspect_module_target') return 'Прочитайте get_module_contract и передайте его moduleId и обязательный contractId в payload вместе с target по контракту. Требуется действующий controller lease; чтение не выдаёт допуск к изменению AE.';
    if (name === 'controller_release' || name === 'controller_renew') return 'Передайте в payload.leaseToken точный токен, полученный от controller_acquire/controller_transfer текущим клиентом.';
    if (name === 'render_job_prepare') return 'Подготовить долговечное задание R1 по квитанции stage-render-copy. Передайте taskId и commandId. Требуется controller lease.';
    if (name === 'render_job_status') return 'Прочитать статус R1 по ID задания. Lease не требуется.';
    if (name.startsWith('render_job_')) return 'Операция R1 по ID задания. Требуется controller lease.';
    return 'Подключение к owner Core4; управление требует явного controller_acquire.';
  }
  function inputSchema(name) {
    const schema = { type: 'object', properties: { payload: { type: 'object', additionalProperties: true } }, additionalProperties: false };
    if (name === 'inspect_module_target') {
      schema.required = ['payload'];
      schema.properties.payload.properties = { contractId: { type: 'string', pattern: '^[a-f0-9]{64}$' } };
      schema.properties.payload.required = ['contractId'];
    }
    if (name.startsWith('render_job_')) {
      const keys = name === 'render_job_prepare' ? ['taskId', 'commandId'] : ['id'];
      schema.required = ['payload'];
      schema.properties.payload = { type: 'object', properties: Object.fromEntries(keys.map(key => [key, { type: 'string', minLength: 1, maxLength: 64 }])), required: keys, additionalProperties: false };
    }
    return schema;
  }
  function ingest(chunk) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    for (const byte of buffer) { if (byte === 10) bytes = 0; else if (++bytes > MAX) { input.destroy(); finish(); break; } }
  }
  function finish() { if (ended) return; ended = true; input.removeListener('data', ingest); client.close(); }
  input.on('data', ingest);
  const lines = createInterface({ input, crlfDelay: Infinity });
  lines.on('close', finish); input.on('error', finish); output.on('error', finish);
  lines.on('line', async line => {
    let request, counted = false;
    try {
      if (ended) return;
      if (Buffer.byteLength(line) > MAX) fail('frame_too_large');
      request = JSON.parse(line); exact(request, ['jsonrpc', 'id', 'method', 'params']);
      if (request.jsonrpc !== '2.0' || typeof request.method !== 'string' || request.id !== undefined && typeof request.id !== 'string' && !Number.isSafeInteger(request.id) || typeof request.id === 'string' && Buffer.byteLength(request.id) > 256) fail('invalid_request');
      if (request.id === undefined) return;
      if (pending >= 32) fail('rpc_backpressure'); pending++; counted = true;
      let result;
      if (request.method === 'initialize') result = { protocolVersion: '2024-11-05', capabilities: { tools: { listChanged: false } }, serverInfo: { name: 'ae-agent-core4', version: '4.2.2' } };
      else if (request.method === 'ping') result = {};
      else if (request.method === 'tools/list') result = { tools: methods.map(name => ({ name, description: description(name), inputSchema: inputSchema(name) })) };
      else if (request.method === 'tools/call') {
        exact(request.params, ['name', 'arguments', '_meta']);
        if (!methods.includes(request.params.name)) fail('unknown_tool');
        if (request.params._meta !== undefined) {
          if (!request.params._meta || Object.getPrototypeOf(request.params._meta) !== Object.prototype || Buffer.byteLength(JSON.stringify(request.params._meta)) > 8192) fail('invalid_protocol_metadata');
        }
        const args = request.params.arguments || {}; exact(args, ['payload']);
        const payload = args.payload === undefined ? {} : args.payload;
        if (!payload || Object.getPrototypeOf(payload) !== Object.prototype) fail('invalid_payload');
        const response = await client.call(request.params.name, payload);
        const physical = request.params.name === 'inspect_module_target' && response?.ok === false && classifyPhysicalRead(response.physical);
        if (request.params.name === 'run_plan' && response?.ok === false && response.code === 'fresh_dryrun_required') {
          result = { content: [{ type: 'text', text: JSON.stringify({ outcome: 'rejected', code: response.code, nextAction: 'dry_run_plan' }) }], isError: true };
        } else if (physical && ['outcome', 'code', 'nextAction'].every(key => response[key] === physical[key]) &&
            Object.keys(response).every(key => ['ok', 'outcome', 'code', 'nextAction', 'physical', ...(physical.outcome === 'unknown' ? ['requestId'] : [])].includes(key))) {
          if (physical.outcome === 'unknown') fail(physical.code, response.requestId, { nextAction: physical.nextAction, physical: response.physical });
          result = { content: [{ type: 'text', text: JSON.stringify({ ...physical, physical: response.physical }) }], isError: true };
        } else if (request.params.name === 'inspect_module_target' && response?.ok === false && response.outcome === 'rejected' && [...READ_REJECTION_CODES, ...PRE_DISPATCH_READ_CODES].includes(response.code) && response.nextAction === 'core_diagnostics' && Object.keys(response).every(key => ['ok', 'outcome', 'code', 'nextAction'].includes(key))) {
          result = { content: [{ type: 'text', text: JSON.stringify({ outcome: 'rejected', code: response.code, nextAction: response.nextAction }) }], isError: true };
        } else {
          if (!response || response.ok !== true) fail(OWNER_ERRORS.includes(response?.code) ? response.code : 'owner_request_failed', response?.requestId);
          result = { content: [{ type: 'text', text: JSON.stringify(response.value) }], isError: false };
        }
      } else fail('method_not_found');
      reply({ jsonrpc: '2.0', id: request.id, result });
    } catch (error) {
      const ipcErrors = ['ipc_outcome_uncertain', 'ipc_closed', 'ipc_capacity', 'ipc_payload', 'ipc_frame_size', 'ipc_json'];
      const message = ipcErrors.includes(error?.code) ? error.code : ownErrors.has(error) ? error.message : 'request_failed';
      const uncertain = message === 'ipc_outcome_uncertain' || message === 'owner_outcome_uncertain';
      reply({ jsonrpc: '2.0', id: request?.id ?? null, error: { code: -32000, message,
        ...(uncertain ? { data: { outcome: 'unknown', requestId: typeof error.requestId === 'string' && /^[a-f0-9]{64}$/.test(error.requestId) ? error.requestId : null, ...(ownErrors.has(error) ? error.physical : undefined) } } : message === 'owner_inspection_contract_required' ? { data: { nextAction: 'get_module_contract' } } : {}) } });
    } finally { if (counted) pending--; }
  });
  return Object.freeze({ close() { finish(); lines.close(); }, status() { return { closed: ended, pending }; } });
}
module.exports = { serveAttachment };

```

## core4/runtime/attachment-owner.js

SHA-256 7a7ea7ef59242bf44fe140a7e0aaf5be69733db55203fa17b2861f922a59b4a5

```javascript
'use strict';
const { randomBytes } = require('node:crypto');
const { createControllerLease } = require('./controller-lease');
const { fitsIpcResult } = require('./client-ipc');

// Private composition seam. No listener, credentials, Broker or state IO here.
// Production embedding must restore durable state before exposing this owner,
// enforce assertCurrent at physical submit/deliver, and report real activity.
const TOOL_METHODS = Object.freeze({ core_status: 'status', core_connect: 'connect', core_disconnect: 'disconnect', core_diagnostics: 'diagnostics', list_modules: 'listModules', get_module_contract: 'getContract', inspect_module_target: 'inspect', build_solution_plan: 'build', propose_plan: 'propose', dry_run_plan: 'dryrun', run_plan: 'run', get_task: 'getTask', reset_task: 'reset', reconcile_task: 'reconcile' });
const CONTROL_METHODS = Object.freeze(['owner_status', 'controller_acquire', 'controller_renew', 'controller_release', 'controller_transfer']);
const OWNER_METHODS = Object.freeze([...Object.keys(TOOL_METHODS), ...CONTROL_METHODS]);
const RENDER_JOB_METHODS = Object.freeze({ render_job_prepare: 'renderJobPrepare', render_job_start: 'renderJobStart', render_job_status: 'renderJobStatus', render_job_reconcile: 'renderJobReconcile', render_job_finalize: 'renderJobFinalize', render_job_cancel: 'renderJobCancel' });
const ownerMethods = renderJobs => renderJobs ? [...OWNER_METHODS, ...Object.keys(RENDER_JOB_METHODS)] : OWNER_METHODS;
const LEASE_ERRORS = Object.freeze(['controller_busy', 'controller_fenced', 'controller_lease_identity', 'controller_lease_expired', 'controller_draining', 'controller_client_detached', 'controller_clock_fault', 'controller_operation_pending', 'controller_expected', 'controller_transfer_changed', 'controller_not_expired']);
const OWNER_ERRORS = Object.freeze([...LEASE_ERRORS, 'owner_payload', 'owner_inspection_contract_required', 'owner_recovery_required', 'owner_draining', 'owner_attachment_required', 'owner_lease_token', 'owner_reference_generation', 'owner_attachment_refused', 'owner_closed', 'owner_method', 'owner_controller_required', 'owner_reference_budget', 'owner_observer_physical_access', 'owner_outcome_uncertain', 'owner_unavailable', 'runtime_request_failed', 'owner_work_session_required', 'owner_work_session_changed', 'owner_work_session_unavailable', 'owner_baseline_required', 'fresh_dryrun_required', 'media_already_imported']);
const OBSERVERS = new Set(['core_status', 'core_diagnostics', 'list_modules', 'get_module_contract', 'get_task']);
const READ_REJECTION_CODES = Object.freeze(['inspection_failed', 'inspection_result_budget', 'host_json_unavailable', 'host_registry_unavailable',
  'layer_overlay_layer_profile', 'layer_overlay_expression_scope', 'layer_overlay_existing_or_partial']);
const PRE_DISPATCH_READ_CODES = Object.freeze(['ae_modal_observed', 'ae_unresponsive']);
const TASK_RESULT_METHODS = new Set(['get_task', 'reset_task', 'reconcile_task']);

function taskReplyWithinBudget(task, wrap) {
  const commands = task.commands.map(({ after, ...command }) => after === undefined ? command : { ...command, afterOmitted: true });
  const view = { ...task, commands };
  if (fitsIpcResult(wrap(view))) return wrap(view);
  const offset = task.commandPage?.offset ?? 0, total = task.commandPage?.total ?? commands.length;
  const page = count => wrap({ ...view, commands: commands.slice(0, count), commandPage: { offset, total, nextOffset: offset + count } });
  let low = 0, high = commands.length;
  while (high - low > 1) {
    const middle = Math.floor((high + low) / 2);
    if (fitsIpcResult(page(middle))) low = middle;
    else high = middle;
  }
  return page(low);
}

function fitTaskResult(method, value) {
  if (method === 'run_plan' && !fitsIpcResult(value)) {
    if (value.state === 'stopped') return taskReplyWithinBudget(value.task, task => ({ ...value, task }));
    if (value.state === 'succeeded') return { ...value, outputs: {}, outputsOmitted: true };
  }
  if (TASK_RESULT_METHODS.has(method) && !fitsIpcResult(value)) return taskReplyWithinBudget(value, task => task);
  return value;
}

function classifyPhysicalRead(value) {
  const { stage, code, terminalReceipt, handoff, nativeStart, queue } = value || {};
  if (!value || value.moduleId !== 'project-inspection' || value.phase !== 'inspect' || value.effect !== 'none' || value.intentRecorded !== true ||
      !/^inspect-[a-f0-9-]{36}$/.test(value.commandId) || !['none', 'offered'].includes(handoff) ||
      (handoff === 'none' ? nativeStart !== 'not_started' : nativeStart !== 'unknown')) return null;
  const receipt = terminalReceipt && /^[a-f0-9]{64}$/.test(terminalReceipt.receiptRef) && /^[a-f0-9]{64}$/.test(terminalReceipt.recordHash);
  if (stage === 'not_dispatched' && code === 'inspection_not_dispatched' && handoff === 'none' && queue === 'idle' && receipt && terminalReceipt.source === 'receiver') return { outcome: 'rejected', code, nextAction: 'core_status' };
  if (stage === 'terminal' && READ_REJECTION_CODES.includes(code) && handoff === 'offered' && queue === 'idle' && receipt && ['host', 'registry'].includes(terminalReceipt.source)) return { outcome: 'rejected', code, nextAction: 'core_diagnostics' };
  if (stage === 'draining' && code === 'inspection_callback_pending' && handoff === 'offered' && queue === 'busy' && terminalReceipt === null && Number.isSafeInteger(value.drainDeadlineAt)) return { outcome: 'pending', code, nextAction: 'core_status' };
  if (stage === 'unknown' && queue === 'fenced' && terminalReceipt === null) return { outcome: 'unknown', code: 'owner_outcome_uncertain', nextAction: 'core_diagnostics' };
  return null;
}

function createAttachmentOwner({ runtime, activity, invoke, consumeReadRejection = () => null, isFreshDryrunRefusal = () => false,
  consumeMediaDuplicateBuildRefusal = () => false, canResumeTask = () => false, renderJobs = false, workSession = () => ({ sessionId: null, baselineRequired: false, resetPending: false }), clock, ttlMs, drainIntervalMs = 100 } = {}) {
  if (!runtime || typeof runtime.status !== 'function' || typeof activity !== 'function' || typeof invoke !== 'function' || typeof workSession !== 'function' || !Number.isSafeInteger(drainIntervalMs) || drainIntervalMs < 1 || drainIntervalMs > 1000) throw new Error('owner_options');
  const lease = createControllerLease({ clock, ttlMs }), sessions = new Map(), accepted = new Set(), timers = new Set(), ownErrors = new WeakSet();
  const rejectedReads = new WeakSet();
  const physicalReadErrors = new WeakMap();
  const methods = ownerMethods(renderJobs), toolMethods = renderJobs ? { ...TOOL_METHODS, ...RENDER_JOB_METHODS } : TOOL_METHODS;
  const refs = { evidence: new Map(), build: new Map(), proposal: new Map(), dryrun: new Map(), task: new Map() };
  let closed = false, frozen = false;
  function fail(code) { const e = new Error(code); ownErrors.add(e); e.code = code; throw e; }
  function object(value, keys) {
    if (!value || Object.getPrototypeOf(value) !== Object.prototype || Object.keys(value).some(k => !keys.includes(k))) fail('owner_payload');
  }
  function facts() {
    try {
      const value = activity();
      if (!value || ['pending', 'unresolved', 'fault'].some(k => typeof value[k] !== 'boolean')) throw new Error('unobserved');
      return { pending: value.pending, unresolved: value.unresolved, fault: value.fault };
    } catch { return { pending: true, unresolved: true, fault: true }; }
  }
  function workFacts() {
    let value; try { value = workSession(); } catch { fail('owner_work_session_unavailable'); }
    if (!value || value.sessionId !== null && (typeof value.sessionId !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value.sessionId)) || typeof value.baselineRequired !== 'boolean' || typeof value.resetPending !== 'boolean' || value.sessionId === null && value.baselineRequired && !value.resetPending) fail('owner_work_session_unavailable');
    return { sessionId: value.sessionId, baselineRequired: value.baselineRequired, resetPending: value.resetPending };
  }
  function admitted() { if (frozen || workFacts().resetPending) fail('owner_draining'); const value = facts(); if (value.fault || value.unresolved) fail('owner_recovery_required'); if (value.pending) fail('owner_draining'); }
  function status() { return { ...lease.status(), closed, frozen, activity: facts(), accepted: accepted.size, attachments: sessions.size, workSession: workFacts() }; }
  function acknowledge(payload) {
    const value = workFacts();
    if (value.sessionId !== null && payload.sessionId === undefined) fail('owner_work_session_required');
    if ((payload.sessionId ?? null) !== value.sessionId) fail('owner_work_session_changed'); return value.sessionId;
  }
  function currentWork(record) {
    const value = workFacts(); if (value.resetPending) fail('owner_draining'); if (record.sessionId !== value.sessionId) fail('owner_work_session_changed'); return value;
  }
  function sessionRecord(session) { const record = sessions.get(session); if (!record) fail('owner_attachment_required'); return record; }
  function token(record, payload) {
    object(payload, ['leaseToken']);
    if (typeof payload.leaseToken !== 'string' || payload.leaseToken !== record.token || !record.grant) fail('owner_lease_token');
  }
  function reference(kind, value, grant) { if (typeof value !== 'string' || refs[kind].get(value) !== grant) fail('owner_reference_generation'); }
  function inputs(method, payload, grant) {
    if (method === 'build_solution_plan') {
      if (payload.taskId !== undefined && refs.task.get(payload.taskId) !== grant && !canResumeTask(payload)) fail('owner_reference_generation');
      if (!Array.isArray(payload.steps)) fail('owner_payload');
      for (const step of payload.steps) reference('evidence', step?.evidenceRef, grant);
    }
    if (method === 'propose_plan') reference('build', payload.buildId, grant);
    if (method === 'dry_run_plan' || method === 'run_plan') reference('proposal', payload.proposalId, grant);
    if (method === 'run_plan') reference('dryrun', payload.dryrunRef, grant);
    if (method === 'reset_task' || method === 'reconcile_task') reference('task', payload.taskId, grant);
  }
  function outputs(method, result, grant) {
    const bind = (kind, value) => { if (typeof value === 'string') refs[kind].set(value, grant); };
    if (method === 'inspect_module_target') bind('evidence', result?.evidenceRef);
    if (method === 'build_solution_plan') { bind('build', result?.buildId); bind('task', result?.taskId); }
    if (method === 'propose_plan') bind('proposal', result?.proposalId);
    if (method === 'dry_run_plan') bind('dryrun', result?.dryrunRef);
  }
  function finalize(operation) {
    const value = facts();
    if (value.pending) {
      const timer = setTimeout(() => { timers.delete(timer); finalize(operation); }, drainIntervalMs);
      timers.add(timer); return;
    }
    lease.complete(operation, value.unresolved || value.fault ? 'unknown' : 'settled'); accepted.delete(operation);
  }
  function onAttach(session) {
    if (closed || sessions.size >= 32 || !session || typeof session !== 'object' || sessions.has(session)) fail('owner_attachment_refused');
    sessions.set(session, { attachment: lease.attach(), grant: null, token: null, sessionId: undefined });
  }
  function onDetach(session) {
    const record = sessions.get(session); if (!record) return;
    lease.detach(record.attachment); sessions.delete(session);
  }
  async function dispatch({ session, method, payload }) {
    if (closed) fail('owner_closed');
    const record = sessionRecord(session);
    if (!methods.includes(method)) fail('owner_method');
    if (!payload || Object.getPrototypeOf(payload) !== Object.prototype) fail('owner_payload');
    if (method === 'owner_status') { object(payload, []); return status(); }
    if (method === 'controller_acquire') {
      object(payload, ['sessionId']); admitted(); const sessionId = acknowledge(payload); record.grant = lease.acquire(record.attachment); record.token = randomBytes(32).toString('hex'); record.sessionId = sessionId;
      for (const values of Object.values(refs)) values.clear();
      return { leaseToken: record.token, bootId: record.grant.bootId, generation: record.grant.generation, ...(sessionId === null ? {} : { sessionId }) };
    }
    if (method === 'controller_transfer') {
      object(payload, ['expected', 'sessionId']); admitted(); const sessionId = acknowledge(payload);
      record.grant = lease.transferExpired(record.attachment, payload.expected); record.token = randomBytes(32).toString('hex'); record.sessionId = sessionId;
      for (const values of Object.values(refs)) values.clear();
      return { leaseToken: record.token, bootId: record.grant.bootId, generation: record.grant.generation, ...(sessionId === null ? {} : { sessionId }) };
    }
    if (method === 'controller_renew') { if (frozen) fail('owner_draining'); token(record, payload); currentWork(record); lease.renew(record.grant); return { renewed: true }; }
    if (method === 'controller_release') {
      token(record, payload); admitted(); currentWork(record); lease.release(record.grant); record.grant = null; record.token = null; record.sessionId = undefined; return { released: true };
    }
    const stateful = !OBSERVERS.has(method) && method !== 'render_job_status' || method === 'list_modules' && payload.refresh !== undefined && payload.refresh !== false;
    if (!stateful) {
      const value = await invoke(toolMethods[method], payload, { observer: true, assertCurrent() { fail('owner_observer_physical_access'); } });
      return method === 'core_status' || method === 'core_diagnostics' ? { ...value, attachmentOwner: status() } : value;
    }
    admitted();
    if (!record.grant) fail('owner_controller_required');
    const work = currentWork(record);
    if (work.baselineRequired && !['core_connect', 'core_disconnect'].includes(method) && !(method === 'inspect_module_target' && payload.moduleId === 'project-inspection')) fail('owner_baseline_required');
    if (Object.values(refs).some(values => values.size >= 4096)) fail('owner_reference_budget');
    lease.assertCurrent(record.grant);
    // This argument check precedes acceptance/invoke. It says nothing about a
    // runtime exception or the outcome of any command that was already sent.
    if (method === 'inspect_module_target' && (typeof payload.contractId !== 'string' || !/^[a-f0-9]{64}$/.test(payload.contractId))) fail('owner_inspection_contract_required');
    inputs(method, payload, record.grant);
    const grant = record.grant, operation = lease.begin(grant); accepted.add(operation);
    const context = { observer: false, generation: grant.generation, sessionId: work.sessionId, assertCurrent() { if (closed) fail('owner_closed'); currentWork(record); lease.assertCurrent(grant); } };
    try {
      let result;
      try { result = await invoke(toolMethods[method], payload, context); }
      catch (error) {
        if (method === 'run_plan' && isFreshDryrunRefusal(error)) fail('fresh_dryrun_required');
        const duplicateBuild = method === 'build_solution_plan' && consumeMediaDuplicateBuildRefusal(error);
        // Consume even if facts/context prevent classification. Clean facts alone
        // never prove completion, and the original grant need not still be live.
        let rejection;
        try { rejection = consumeReadRejection(error, { method, payload, context }); } catch {}
        const value = facts();
        if (duplicateBuild && !value.pending && !value.unresolved && !value.fault) fail('media_already_imported');
        const physical = method === 'inspect_module_target' && classifyPhysicalRead(rejection?.physical);
        if (physical && (physical.outcome !== 'rejected' || !value.pending && !value.unresolved && !value.fault)) {
          const rejected = new Error(physical.code);
          physicalReadErrors.set(rejected, { ...physical, physical: rejection.physical });
          throw rejected;
        }
        const supportedRejection = rejection?.phase === 'pre-dispatch' ? PRE_DISPATCH_READ_CODES.includes(rejection.code) : READ_REJECTION_CODES.includes(rejection?.code);
        if (method === 'inspect_module_target' && supportedRejection && !value.pending && !value.unresolved && !value.fault) {
          const rejected = new Error(rejection.code); rejected.code = rejection.code; rejectedReads.add(rejected); throw rejected;
        }
        fail('owner_outcome_uncertain');
      }
      const value = facts();
      if (value.pending || value.unresolved || value.fault) fail('owner_outcome_uncertain');
      outputs(method, result, grant); return result;
    }
    finally { finalize(operation); }
  }
  async function onRequest(request) {
    try { return { ok: true, value: fitTaskResult(request.method, await dispatch(request)) }; }
    catch (error) {
      const physical = physicalReadErrors.get(error);
      if (physical) return { ok: false, ...physical, ...(physical.outcome === 'unknown' ? { requestId: request.requestId || null } : {}) };
      if (rejectedReads.has(error)) return { ok: false, outcome: 'rejected', code: error.code, nextAction: 'core_diagnostics' };
      // Only our own errors and the fixed private lease vocabulary cross IPC.
      const code = ownErrors.has(error) || LEASE_ERRORS.includes(error?.code) ? error.code : 'runtime_request_failed';
      return code === 'owner_outcome_uncertain' ? { ok: false, code, outcome: 'unknown', requestId: request.requestId || null } : { ok: false, code };
    }
  }
  async function close() {
    if (closed) return;
    if (accepted.size || facts().pending) fail('owner_draining');
    closed = true; for (const session of sessions.keys()) onDetach(session);
    for (const timer of timers) clearTimeout(timer);
    await runtime.close();
  }
  return Object.freeze({ onAttach, onDetach, onRequest, status, close, freeze() { frozen = true; }, bootId: lease.status().bootId });
}
module.exports = { createAttachmentOwner, TOOL_METHODS, OWNER_METHODS, RENDER_JOB_METHODS, ownerMethods, OWNER_ERRORS, READ_REJECTION_CODES, PRE_DISPATCH_READ_CODES, classifyPhysicalRead };

```

## core4/runtime/render-job-owner.js

SHA-256 75b7a600e3b1d6335c3bfb1247c919f82e0efc9d0a1203c3b5eac766ddc6b082

```javascript
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { canonical, fail, hash } = require('../protocol/json');
const { plainPath, samePath } = require('./project-file');
const { createJobs } = require('./aerender-jobs');

const uuid = '[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}';
const jobId = new RegExp('^' + uuid + '$');
const taskIdPattern = new RegExp('^task-' + uuid + '$');
const commandIdPattern = new RegExp('^command-' + uuid + '$');
const sha256 = /^[0-9a-f]{64}$/;
const policy = 'current-matching-target-after-local-confirmation-v1';
const toolNames = ['engine', 'ffmpeg', 'ffprobe'];
const noGuard = () => {};

const matches = (value, pattern) => typeof value === 'string' && pattern.test(value);
const exact = (value, keys) => value && Object.getPrototypeOf(value) === Object.prototype &&
  Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const absolute = file => typeof file === 'string' && path.isAbsolute(file) &&
  samePath(path.normalize(file), path.resolve(file)) && !/[\x00-\x1f"<>|?*]/.test(file) &&
  (process.platform !== 'win32' || /^[a-z]:[\\/]/i.test(file) &&
    !file.slice(3).split(/[\\/]/).some(part => part.includes(':') || /[. ]$/.test(part) ||
      /^(?:con|prn|aux|nul|com[0-9¹²³]|lpt[0-9¹²³])(?:\.|$)/i.test(part)));
const equalPath = (a, b) => absolute(a) && absolute(b) && samePath(path.normalize(a), path.normalize(b));

function inDirectory(directory, file) {
  const relative = path.relative(directory, file);
  return relative === '' || !path.isAbsolute(relative) && relative !== '..' && !relative.startsWith('..' + path.sep);
}

function stableId(installationId, commandId) {
  const hex = hash(['ae-core4/render-job/v1', installationId, commandId]);
  const variant = ((parseInt(hex[16], 16) & 3) | 8).toString(16);
  return [hex.slice(0,8), hex.slice(8,12), '8' + hex.slice(13,16),
    variant + hex.slice(17,20), hex.slice(20,32)].join('-');
}

function readToolchain(directory) {
  const file = path.join(directory, 'render-job-toolchain.json');
  let value;
  try {
    const { info, resolved } = plainPath(file);
    if (info.size < 1n || info.size > 16384n) fail('render_job_toolchain');
    const unchanged = current => ['dev', 'ino', 'size', 'mtimeNs', 'ctimeNs', 'nlink'].every(key => info[key] === current[key]);
    const fd = fs.openSync(resolved, 'r');
    try {
      if (!unchanged(fs.fstatSync(fd, { bigint: true }))) fail('render_job_toolchain');
      const bytes = Buffer.alloc(Number(info.size));
      if (fs.readSync(fd, bytes, 0, bytes.length, 0) !== bytes.length || !unchanged(fs.fstatSync(fd, { bigint: true })) ||
          !unchanged(plainPath(file).info)) fail('render_job_toolchain');
      value = JSON.parse(bytes.toString('utf8'));
    } finally { fs.closeSync(fd); }
  } catch { fail('render_job_toolchain'); }
  if (!exact(value, toolNames) || !toolNames.every(key =>
    exact(value[key], ['path', 'sha256']) && absolute(value[key].path) && matches(value[key].sha256, sha256))) {
    fail('render_job_toolchain');
  }
  return Object.fromEntries(toolNames.map(key => [key, { path:path.normalize(value[key].path), sha256:value[key].sha256 }]));
}

function stageSpec(command, taskId, commandId, protectedDirectories) {
  const { input, after, selected, executionPolicy } = command || {};
  if (command?.taskId !== taskId || command.commandId !== commandId || command.state !== 'succeeded' ||
      command.verificationKind !== 'local-transaction-receipt' || selected?.moduleId !== 'project-lifecycle' ||
      selected.contract?.operationId !== 'transition-project' || executionPolicy?.policyId !== policy ||
      input?.action !== 'stage-render-copy' || after?.dirty !== false || !matches(after.savedFileSha256, sha256)) {
    fail('render_job_stage_receipt');
  }
  const render = input.render, witness = after.renderJob, target = witness?.target;
  if (!render || !target?.timeline || target.compId !== render.compId || target.fps !== render.fps || target.audio !== render.audio ||
      !equalPath(after.currentProject, input.destination) || equalPath(after.currentProject, input.projectId) ||
      !equalPath(witness.output, render.output) || !absolute(witness.scratchOutput) || equalPath(witness.output, witness.scratchOutput) ||
      !equalPath(path.join(path.dirname(after.currentProject), 'core4-r1-scratch.mp4'), witness.scratchOutput) ||
      equalPath(path.dirname(after.currentProject), path.dirname(witness.output))) {
    fail('render_job_stage_binding');
  }
  const { startFrame, endFrameExclusive } = render;
  if (startFrame === undefined && endFrameExclusive === undefined ? target.range !== undefined :
    !Number.isSafeInteger(startFrame) || !Number.isSafeInteger(endFrameExclusive) ||
    target.range?.startFrame !== target.timeline.startFrame + startFrame ||
    target.range?.endFrameExclusive !== target.timeline.startFrame + endFrameExclusive) {
    fail('render_job_stage_binding');
  }
  const output = path.normalize(witness.output), projectPath = path.normalize(after.currentProject);
  if (protectedDirectories.some(directory => inDirectory(directory, output) || inDirectory(directory, projectPath))) {
    fail('render_job_protected_path');
  }
  if (!Array.isArray(witness.queue) || !Array.isArray(witness.media) ||
      !witness.media.every(item => absolute(item?.path) && matches(item.sha256, sha256))) fail('render_job_stage_binding');
  return { project:{path:projectPath,sha256:after.savedFileSha256}, output, target, queue:witness.queue,
    media:witness.media.map(item => ({path:path.normalize(item.path),sha256:item.sha256})) };
}

function safeFailure(error) {
  const code = error?.code || error?.message;
  if (matches(code, /^[a-z][a-z0-9_]{1,99}$/)) {
    return { state:'rejected', code };
  }
  return { state:'rejected', code:'render_job_local_failure' };
}

function publicResult(result) {
  const { id, state, media, output } = result;
  if (state === 'published') return { id, state, path:result.path, sha256:result.sha256, bytes:result.bytes, media };
  if (state === 'verified') return { id, state, output:{sha256:output.sha256,bytes:output.bytes}, media };
  if (matches(result.error, /^aerender_[a-z_]+$/)) return { id, state, code:result.error };
  return { id, state };
}

function createRenderJobOwner({ stateDir, installationId, getCommand }) {
  function locations() {
    if (!absolute(stateDir)) fail('render_job_state');
    const logical = fs.lstatSync(stateDir, { bigint:true });
    const { resolved, info } = plainPath(fs.realpathSync.native(stateDir), true);
    if (!logical.isDirectory() || logical.isSymbolicLink() || logical.dev !== info.dev || logical.ino !== info.ino ||
        !samePath(fs.realpathSync(stateDir), stateDir)) fail('render_job_state');
    const stateParent = path.dirname(resolved);
    const installRoot = samePath(path.basename(stateParent), 'state') && samePath(path.basename(resolved), 'production')
      ? path.dirname(stateParent) : resolved;
    return { directory:resolved, root:path.join(resolved, 'render-jobs-v1'),
      protectedDirectories:[installRoot, path.resolve(__dirname, '..')] };
  }

  function authorizationFor(taskId, commandId, spec) {
    return { installationId, taskId, commandId, stageHash:hash(spec) };
  }

  function readPreparation(jobs, id, preparation = jobs.preparation(id)) {
    const authorization = preparation?.intent?.authorization;
    if (!authorization || authorization.installationId !== installationId ||
        !matches(authorization.taskId, taskIdPattern) || !matches(authorization.commandId, commandIdPattern) ||
        !matches(authorization.stageHash, sha256) || stableId(installationId, authorization.commandId) !== id ||
        preparation.intent.id !== id) fail('render_job_missing');
    const job = preparation.job;
    if (job) {
      const { engine, ffmpeg, ffprobe, ...staged } = job.spec;
      if (job.id !== id || canonical(job.authorization) !== canonical(authorization) ||
          hash(staged) !== authorization.stageHash ||
          job.working !== path.join(path.dirname(staged.project.path), 'core4-render-' + id + '.aep') ||
          job.partial !== path.join(path.dirname(staged.output), 'core4-render-' + id + '.partial.mp4')) fail('render_job_binding');
    }
    return { job, authorization };
  }

  const exists = file => Boolean(fs.lstatSync(file, { throwIfNoEntry:false }));
  const readStatus = (jobs, id, job) => job ? publicResult(jobs.status(id)) : { id, state:'unknown' };
  return {
    prepare(args, assertCurrent = noGuard) {
      try {
        if (!exact(args, ['taskId', 'commandId']) || !matches(args.taskId, taskIdPattern) ||
            !matches(args.commandId, commandIdPattern)) fail('render_job_arguments');
        const { taskId, commandId } = args, { directory, root, protectedDirectories } = locations();
        const spec = stageSpec(getCommand(taskId, commandId), taskId, commandId, protectedDirectories);
        const id = stableId(installationId, commandId), authorization = authorizationFor(taskId, commandId, spec);
        if (exists(root)) {
          const jobs = createJobs(root), previous = jobs.preparation(id);
          if (previous) {
            if (!previous.intent && !previous.job) return { id, state:'unknown' };
            const saved = readPreparation(jobs, id, previous);
            if (canonical(saved.authorization) !== canonical(authorization)) fail('render_job_binding');
            return readStatus(jobs, id, saved.job);
          }
        }
        const toolchain = readToolchain(directory);
        assertCurrent();
        const jobs = createJobs(root);
        try { return jobs.prepare({ ...spec, ...toolchain }, { id, authorization, assertCurrent }); }
        catch (error) {
          const previous = jobs.preparation(id);
          if (!previous) throw error;
          if (!previous.intent && !previous.job) return { id, state:'unknown' };
          const saved = readPreparation(jobs, id, previous);
          if (canonical(saved.authorization) !== canonical(authorization)) fail('render_job_binding');
          return readStatus(jobs, id, saved.job);
        }
      } catch (error) { return safeFailure(error); }
    },
    ...Object.fromEntries(['start', 'status', 'reconcile', 'finalize', 'cancel'].map(action =>
      [action, async (args, assertCurrent = noGuard) => {
        try {
          if (!exact(args, ['id']) || !matches(args.id, jobId)) fail('render_job_arguments');
          const { id } = args, { root, directory, protectedDirectories } = locations();
          if (!exists(root)) fail('render_job_missing');
          const jobs = createJobs(root), { job, authorization } = readPreparation(jobs, id);
          if (!job || action === 'status') return readStatus(jobs, id, job);
          if (action === 'start') {
            const state = readStatus(jobs, id, job);
            if (state.state !== 'prepared') return state;
            const { taskId, commandId } = authorization;
            const spec = stageSpec(getCommand(taskId, commandId), taskId, commandId, protectedDirectories);
            if (hash(spec) !== authorization.stageHash) fail('render_job_binding');
          }
          const invokesToolchain = action === 'start' || action === 'reconcile';
          const assertToolchain = () => {
            const activeToolchain = readToolchain(directory);
            if (toolNames.some(key => canonical(activeToolchain[key]) !== canonical(job.spec[key]))) fail('render_job_toolchain_changed');
          };
          if (invokesToolchain) assertToolchain();
          try {
            return publicResult(await jobs[action](id, () => {
              if (invokesToolchain) assertToolchain();
              assertCurrent();
            }));
          }
          catch (error) {
            const state = readStatus(jobs, id, job);
            if (state.state === 'unknown' || action === 'start' && error.message === 'aerender_active_or_already_dispatched' &&
                state.state !== 'prepared') return state;
            throw error;
          }
        } catch (error) { return safeFailure(error); }
      }]))
  };
}

module.exports = { createRenderJobOwner };

```

## core4/runtime/aerender-jobs.js

SHA-256 e75bfe06a7075b63028caec2854d9253119d8ffc03523a83ded9523c98023c7e

```javascript
'use strict';

// Local operator for already-prepared AE render queues. The queue witness is
// supplied by the operator after inspecting the saved AEP.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { createHash, randomUUID } = require('node:crypto');
const { spawn, execFileSync } = require('node:child_process');
const { createServer } = require('node:net');
const { plainPath, readAep, samePath } = require('./project-save-proof');
const { validateTimeline, frameArgs, verifyMediaFacts } = require('./aerender-profile');

const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
const sha = /^[0-9a-f]{64}$/;
const aepBudget = 96n * 1024n * 1024n; // Matches project-save-proof.

function requireFact(condition, code) {
  if (!condition) throw Error(code);
}

function present(file) {
  return fs.lstatSync(file, { throwIfNoEntry: false });
}

function writeOnce(file, data) {
  const stage = file + '.' + randomUUID() + '.tmp';
  const fd = fs.openSync(stage, 'wx');
  try {
    try { fs.writeFileSync(fd, JSON.stringify(data) + '\n'); fs.fsyncSync(fd); }
    finally { fs.closeSync(fd); }
    fs.linkSync(stage, file);
  } finally { fs.unlinkSync(stage); }
}

function record(file) {
  if (!present(file)) return null;
  const { resolved, info } = plainPath(file);
  requireFact(info.size <= 1024n * 1024n, 'aerender_record_budget');
  return JSON.parse(fs.readFileSync(resolved, 'utf8'));
}

function fingerprint(file, allowLink = false) {
  const info = fs.lstatSync(file, { bigint: true });
  requireFact(info.isFile() && !info.isSymbolicLink() &&
    (allowLink || info.nlink === 1n) && samePath(fs.realpathSync.native(file), file), 'aerender_plain_file');
  const fd = fs.openSync(file, 'r');
  const compare = current => {
    requireFact(['dev', 'ino', 'size', 'mtimeNs', 'ctimeNs', 'nlink'].every(key => current[key] === info[key]), 'aerender_file_changed');
  };
  try {
    compare(fs.fstatSync(fd, { bigint: true }));
    const hash = createHash('sha256'), buf = Buffer.allocUnsafe(1024 * 1024);
    for (let count; (count = fs.readSync(fd, buf, 0, buf.length, null)) !== 0;) hash.update(buf.subarray(0, count));
    compare(fs.fstatSync(fd, { bigint: true }));
    compare(fs.lstatSync(file, { bigint: true }));
    return { sha256: hash.digest('hex'), bytes: Number(info.size), dev: String(info.dev), ino: String(info.ino) };
  } finally { fs.closeSync(fd); }
}

function projectDigest(file, copyFd) {
  try { return readAep(file, undefined, copyFd).digest; }
  catch (error) {
    if (error.code === 'save_disk_proof_unavailable' || error.code === 'ENOENT') throw Error('aerender_input_changed');
    throw error;
  }
}

function verifyInput(input, filename, project = false) {
  requireFact(input && sha.test(input.sha256) && typeof input.path === 'string' &&
    path.isAbsolute(input.path) && samePath(path.resolve(input.path), input.path), 'aerender_input');
  if (filename) requireFact(filename.test(path.basename(input.path)), 'aerender_input_kind');
  const { info } = plainPath(input.path);
  requireFact(info.size > 0n && (!project || info.size <= aepBudget), 'aerender_input_budget');
  const digest = project ? projectDigest(input.path) : fingerprint(input.path).sha256;
  requireFact(digest === input.sha256, 'aerender_input_changed');
}

function validateSpec(spec) {
  requireFact(spec && typeof spec === 'object', 'aerender_spec');
  const t = spec.target;
  requireFact(t && typeof t.compName === 'string' && t.compName.length > 0 &&
    t.compName.length <= 128 && !/[\x00-\x1f]/.test(t.compName) &&
    [t.compId, t.queueIndex, t.frames, t.width, t.height].every(n => Number.isSafeInteger(n) && n > 0) &&
    typeof t.fps === 'string' && /^[1-9]\d{0,6}\/[1-9]\d{0,6}$/.test(t.fps) &&
    typeof t.audio === 'boolean', 'aerender_target');
  requireFact(Array.isArray(spec.queue) && spec.queue.length > 0 && spec.queue.length <= 64 &&
    spec.queue.every((row, index) => row.index === index + 1 && typeof row.name === 'string' && typeof row.status === 'string'), 'aerender_queue_witness');
  const ready = spec.queue.filter(row => row.status === 'Queued');
  requireFact(ready.length === 1 && ready[0].index === t.queueIndex &&
    ready[0].name === t.compName && ready[0].compId === t.compId &&
    ready[0].format === 'H.264', 'aerender_queue_witness');
  validateTimeline(t, ready[0]);
  requireFact(Array.isArray(spec.media) && spec.media.length <= 512, 'aerender_media_witness');
  requireFact(typeof spec.output === 'string' && path.isAbsolute(spec.output) &&
    samePath(path.resolve(spec.output), spec.output) && /^[\w.-]+\.mp4$/i.test(path.basename(spec.output)) &&
    !/^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])\./i.test(path.basename(spec.output)), 'aerender_output_path');
  plainPath(path.dirname(spec.output), true);
}

function checkInputs(spec, working) {
  verifyInput(spec.project, /\.aep$/i, true);
  if (working) verifyInput({ path: working, sha256: spec.project.sha256 }, /\.aep$/i, true);
  for (const item of spec.media) verifyInput(item);
  verifyInput(spec.engine, /^aerender\.exe$/i);
  verifyInput(spec.ffprobe, /^ffprobe\.exe$/i);
  verifyInput(spec.ffmpeg, /^ffmpeg\.exe$/i);
}

function windowsProbe(command, failure) {
  const windows = process.env.SystemRoot || 'C:\\Windows';
  const ps = path.join(windows, 'System32/WindowsPowerShell/v1.0/powershell.exe');
  const env = Object.fromEntries(['SystemRoot', 'WINDIR', 'TEMP', 'TMP'].filter(key => path.isAbsolute(process.env[key] || '')).map(key => [key, process.env[key]]));
  // The installed owner clears inherited user fields. Windows PowerShell still
  // needs the current token's native home directory, even with -NoProfile.
  env.USERPROFILE = os.userInfo().homedir;
  env.SYSTEMDRIVE = path.parse(windows).root.slice(0, 2);
  env.HOMEDRIVE = path.parse(env.USERPROFILE).root.slice(0, 2);
  env.HOMEPATH = env.USERPROFILE.slice(2);
  try {
    return execFileSync(ps, ['-NoProfile', '-NonInteractive', '-Command',
      '[Console]::OutputEncoding=[Text.Encoding]::UTF8; ' + command], { encoding: 'utf8', windowsHide: true, timeout: 6000, maxBuffer: 32768, env }).trim();
  } catch { throw Error(failure); }
}

function processRows(filter) {
  const command = `$p=Get-CimInstance Win32_Process -Filter "${filter}" -ErrorAction Stop; if($p){$p | Select-Object ProcessId,ParentProcessId,ExecutablePath,CommandLine,@{N='Birth';E={$_.CreationDate.ToUniversalTime().ToString('o')}} | ConvertTo-Json -Compress}`;
  const bytes = windowsProbe(command, 'aerender_process_probe_unavailable');
  if (!bytes) return [];
  return [JSON.parse(bytes)].flat().map(row => ({
    pid: row.ProcessId, parent: row.ParentProcessId, exe: row.ExecutablePath, commandLine: row.CommandLine, birth: row.Birth
  }));
}

function adobeEnvironment(executable) {
  const failure = 'aerender_native_environment';
  const folders = {SystemRoot:'Windows',APPDATA:'ApplicationData',LOCALAPPDATA:'LocalApplicationData',
    ProgramData:'CommonApplicationData',ProgramFiles:'ProgramFiles',CommonProgramFiles:'CommonProgramFiles',
    'ProgramFiles(x86)':'ProgramFilesX86','CommonProgramFiles(x86)':'CommonProgramFilesX86'};
  const properties = Object.entries(folders).map(([key,folder]) => `'${key}'=[Environment]::GetFolderPath('${folder}')`);
  const known = JSON.parse(windowsProbe('@{' + properties.join(';') + '} | ConvertTo-Json -Compress', failure));
  const user = os.userInfo(), homeRoot = path.parse(user.homedir).root;
  const windows = known.SystemRoot, system = path.join(windows, 'System32');
  requireFact([windows, known.APPDATA, known.LOCALAPPDATA, known.ProgramData, user.homedir].every(value =>
    typeof value === 'string' && path.isAbsolute(value) && !/[;\0]/.test(value)), failure);
  const env = Object.fromEntries(Object.keys(folders).filter(key => known[key] && path.isAbsolute(known[key])).map(key => [key, known[key]]));
  const temp = path.isAbsolute(process.env.TEMP || '') ? process.env.TEMP : path.join(known.LOCALAPPDATA, 'Temp');
  // Adobe starts its own AfterFX child. Give it the native shell and user folders
  // without passing the controller's PATH, credentials or developer variables.
  return {...env, WINDIR:windows, SYSTEMDRIVE:path.parse(windows).root.slice(0,2), ComSpec:path.join(system,'cmd.exe'),
    PATH:[path.dirname(executable),system,windows].join(path.delimiter), PATHEXT:'.COM;.EXE;.BAT;.CMD',
    USERPROFILE:user.homedir, USERNAME:user.username, HOMEDRIVE:homeRoot.slice(0,2), HOMEPATH:user.homedir.slice(2),
    TEMP:temp, TMP:temp, NODE_V8_COVERAGE:''};
}

function processIdentity(pid) {
  requireFact(Number.isSafeInteger(pid) && pid > 0, 'aerender_process_id');
  const rows = processRows('ProcessId=' + pid);
  requireFact(rows.length <= 1, 'aerender_process_identity');
  const [row] = rows;
  if (!row) return null;
  requireFact(row.pid === pid && validProcess(row), 'aerender_process_identity');
  return row;
}

function validProcess(row) {
  return row && Number.isSafeInteger(row.pid) && row.pid > 0 &&
    Number.isSafeInteger(row.parent) && row.parent >= 0 &&
    typeof row.exe === 'string' && path.isAbsolute(row.exe) &&
    typeof row.commandLine === 'string' && row.commandLine.length > 0 &&
    typeof row.birth === 'string' && Number.isFinite(Date.parse(row.birth));
}

function sameProcess(a, b) {
  return a.pid === b.pid && a.parent === b.parent && samePath(a.exe, b.exe) &&
    a.birth === b.birth && a.commandLine === b.commandLine;
}

function matchesProcess(expected, identity) {
  if (!expected) return false;
  const actual = identity(expected.pid);
  if (actual == null) return false;
  requireFact(validProcess(actual) && actual.pid === expected.pid, 'aerender_process_identity');
  if (actual.birth !== expected.birth) return false; // The original incarnation is gone.
  requireFact(sameProcess(actual, expected), 'aerender_process_identity');
  return true;
}

// These spawned argv values contain no literal quotes or trailing quoted backslashes.
function commandArgs(row) {
  return (row.commandLine.match(/"[^"]*"|[^\s"]+/g) || []).slice(1).map(arg => arg.replace(/^"|"$/g, ''));
}

function argsMatch(actual, expected) {
  return Array.isArray(actual) && actual.length === expected.length && actual.every((arg, index) => arg === expected[index]);
}

function childOf(child, parent) {
  return validProcess(child) && child.parent === parent.pid && child.pid !== parent.pid &&
    Date.parse(child.birth) >= Date.parse(parent.birth);
}

function adobeArgs(command) {
  const prefix = "d -noui -m -s if (typeof gAECommandLineRenderer == 'undefined' ) { app.exitCode = 13;} else { gAECommandLineRenderer.Render(";
  const suffix = '); }';
  if (!command.startsWith(prefix) || !command.endsWith(suffix)) return null;
  const wrapped = JSON.parse('[' + command.slice(prefix.length,-suffix.length) + ']');
  if (!wrapped.every(value => typeof value === 'string' && value.length >= 2 && value.startsWith("'") && value.endsWith("'"))) return null;
  const [flag,port,...args] = wrapped.map(value => value.slice(1,-1));
  return flag === '-port' && /^(?:\[::1\]|127\.0\.0\.1):[1-9]\d{0,4}$/.test(port) ? args : null;
}

function rendererFor(row, job, engine, exit) {
  if (!childOf(row, engine) || Date.parse(row.birth) > Date.parse(exit.observedAt) ||
      !/^AfterFX\.(com|exe)$/i.test(path.basename(row.exe)) ||
      !samePath(path.dirname(row.exe), path.dirname(job.spec.engine.path))) return false;
  return argsMatch(adobeArgs(row.commandLine),commandArgs(engine));
}

function rendererRows() {
  return processRows("Name='AfterFX.com' OR Name='AfterFX.exe'");
}

function nativeRenderers(job, engine, exit, list) {
  const matched = list().filter(row => {
    if (row.parent === engine.pid) return true;
    if (typeof row.commandLine !== 'string') return false;
    const command = row.commandLine.toLowerCase();
    return [job.working, job.partial].some(file =>
      command.includes(file.toLowerCase()) || command.includes(file.toLowerCase().replace(/\\/g, '\\\\')));
  });
  requireFact(matched.length <= 1 && matched.every(row => rendererFor(row, job, engine, exit)), 'aerender_native_identity');
  return matched;
}

function renderArgs(job, log) {
  return ['-project',job.working,'-rqindex',String(job.spec.target.queueIndex),'-output',job.partial,
    ...frameArgs(job.spec.target),'-close','DO_NOT_SAVE_CHANGES','-v','ERRORS_AND_PROGRESS','-log',log];
}

async function withLock(root, action) {
  const token = createHash('sha256').update(root.toLowerCase()).digest('hex').slice(0, 24);
  const server = createServer(socket => socket.destroy());
  const endpoint = '\\\\.\\pipe\\ae-core4-aerender-' + token;
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(endpoint, resolve);
  });
  try { return await action(); }
  finally { await new Promise(resolve => server.close(resolve)); }
}

function verifyMedia(job) {
  const target = job.spec.target;
  const media = JSON.parse(execFileSync(job.spec.ffprobe.path, ['-v','error','-count_frames','-show_streams','-show_format','-of','json',job.partial],
    { encoding:'utf8', windowsHide:true, maxBuffer:1024 * 1024 }));
  const facts = verifyMediaFacts(target,media);
  execFileSync(job.spec.ffmpeg.path, ['-nostdin','-v','error','-xerror','-i',job.partial,'-map','0:v','-map','0:a?','-f','null','-'],
    { windowsHide:true, maxBuffer:1024 * 1024 });
  return facts;
}

function verifyLog(job, log) {
  const fd = fs.openSync(log, 'r');
  try {
    const size = fs.fstatSync(fd).size;
    const head = Buffer.alloc(Math.min(32768, size)), tail = Buffer.alloc(head.length);
    fs.readSync(fd, head, 0, head.length, 0);
    fs.readSync(fd, tail, 0, tail.length, size - tail.length);
    const header = head.toString(), name = job.spec.target.compName;
    const destination = header.match(/^PROGRESS:\s+Output To: (.+)$/m)?.[1].trim();
    requireFact(destination && samePath(path.normalize(destination), job.partial) &&
      header.includes('Starting composition “' + name + '”') &&
      tail.toString().includes('Finished composition “' + name + '”') &&
      header.split('Starting composition').length === 2, 'aerender_completion_log');
  } finally { fs.closeSync(fd); }
}

function verifyCompleted(job, log) {
  verifyLog(job,log);
  checkInputs(job.spec,job.working);
  const before = fingerprint(job.partial);
  const media = verifyMedia(job);
  const after = fingerprint(job.partial);
  requireFact(before.sha256 === after.sha256 && before.ino === after.ino && before.dev === after.dev, 'aerender_media_changed');
  checkInputs(job.spec,job.working);
  return { id:job.id, state:'verified', output:after, media };
}

function createJobs(root, identity = processIdentity, listRenderers = rendererRows, workerEntry = __filename) {
  requireFact(path.isAbsolute(root) && samePath(path.resolve(root),root), 'aerender_root');
  plainPath(path.dirname(root),true);
  try { fs.mkdirSync(root); }
  catch (error) { if (error.code !== 'EEXIST') throw error; }
  plainPath(root, true);
  const active = path.join(root, 'active.json');
  const requestStage = 'cancel-request.json', cancelledStage = 'cancelled.json', publishStage = 'publish-intent.json';
  const file = (id, name) => {
    requireFact(uuid.test(id), 'aerender_job_id');
    return path.join(root, id, name);
  };
  const get = id => {
    const filename = file(id, 'prepared.json');
    if (present(path.dirname(filename))) plainPath(path.dirname(filename), true);
    const job = record(filename);
    requireFact(job?.id === id, 'aerender_job_missing');
    return job;
  };
  const bound = (job, stage) => {
    const filename = file(job.id, stage);
    const entry = record(filename);
    if (entry !== null || present(filename)) requireFact(entry?.id === job.id && entry.jobHash === jobHash(job), 'aerender_job_binding');
    return entry;
  };
  const scoped = (job, dispatch, stage, data) => ({
    ...data, id:job.id, jobHash:dispatch.jobHash, dispatchHash:jobHash(dispatch), stage
  });
  const observed = (job, dispatch, stage) => {
    const entry = bound(job,stage);
    if (entry) requireFact(entry.dispatchHash === jobHash(dispatch) && entry.stage === stage, 'aerender_dispatch_binding');
    return entry;
  };
  const verifyDispatch = dispatch => {
    requireFact(dispatch?.observationVersion === 1 && validProcess(dispatch.starter) &&
      (dispatch.workerEntry === undefined || typeof dispatch.workerEntry === 'string' &&
        path.isAbsolute(dispatch.workerEntry) && path.basename(dispatch.workerEntry) === 'aerender-jobs.js') &&
      Number.isFinite(Date.parse(dispatch.createdAt)) && Date.parse(dispatch.createdAt) >= Date.parse(dispatch.starter.birth),
    'aerender_dispatch_binding');
  };
  const ownsActive = (job, dispatch) => {
    const held = record(active);
    return held?.id === job.id && (dispatch.observationVersion === undefined ||
      held.jobHash === dispatch.jobHash && held.dispatchHash === jobHash(dispatch));
  };
  const workerArgs = (id, entry = workerEntry) => [entry,'worker',root,id];
  const workerFor = (row, job, dispatch) => childOf(row, dispatch.starter) &&
    samePath(row.exe, dispatch.starter.exe) && argsMatch(commandArgs(row), workerArgs(job.id, dispatch.workerEntry)) &&
    Date.parse(row.birth) >= Date.parse(dispatch.createdAt);
  const logFor = job => file(job.id,'aerender.log');
  const engineFor = (row, job, worker, intent) => childOf(row, worker) && samePath(row.exe, job.spec.engine.path) &&
    argsMatch(commandArgs(row), intent.args) && Date.parse(row.birth) >= Date.parse(intent.createdAt);
  const readProcess = (job, dispatch, stage, validate) => {
    const entry = observed(job,dispatch,stage);
    if (entry) requireFact(validate(entry.process,entry), 'aerender_process_identity');
    return entry?.process;
  };
  const observe = (job, dispatch) => {
    verifyDispatch(dispatch);
    requireFact(ownsActive(job,dispatch), 'aerender_dispatch_binding');
    const worker = readProcess(job,dispatch,'worker.json', row => workerFor(row,job,dispatch));
    const launcher = readProcess(job,dispatch,'launcher.json', row => workerFor(row,job,dispatch));
    requireFact(!worker || !launcher || sameProcess(worker,launcher), 'aerender_worker_identity');
    const intent = observed(job,dispatch,'start-intent.json');
    if (intent) requireFact(worker && intent.workerHash === jobHash(worker) && intent.executable === job.spec.engine.path &&
      argsMatch(intent.args,renderArgs(job,logFor(job))) && Date.parse(intent.createdAt) >= Date.parse(worker.birth),
    'aerender_dispatch_binding');
    const engine = readProcess(job,dispatch,'engine.json', row => worker && intent && engineFor(row,job,worker,intent));
    const exit = observed(job,dispatch,'engine-exit.json');
    if (exit) requireFact(engine && exit.engineHash === jobHash(engine) &&
      Date.parse(exit.observedAt) >= Date.parse(engine.birth) &&
      (Number.isInteger(exit.code) && (exit.signal === null || typeof exit.signal === 'string') ||
        exit.code === null && typeof exit.signal === 'string' || typeof exit.error === 'string'), 'aerender_dispatch_binding');
    const renderer = readProcess(job,dispatch,'renderer.json', (row,entry) =>
      engine && exit?.code === 0 && entry.engineHash === jobHash(engine) && rendererFor(row,job,engine,exit));
    return { engine, exit, workerAlive:matchesProcess(worker || launcher,identity),
      renderAlive: [engine,renderer].map(row => matchesProcess(row,identity)).some(Boolean) };
  };
  const settled = (job, terminal) => {
    if (terminal) requireFact(['verified','failed','unknown'].includes(terminal.state), 'aerender_job_binding');
    if (['verified','failed'].includes(terminal?.state)) return terminal;
    const reconciled = bound(job,'reconciled.json');
    if (reconciled) requireFact(reconciled.state === 'verified', 'aerender_job_binding');
    return reconciled;
  };
  const assertQuiescent = (job, dispatch, code, requireSuccess = true) => {
    let state;
    try {
      state = observe(job,dispatch);
      requireFact(state.exit && (requireSuccess ? state.exit.code === 0 && state.exit.signal === null :
        Number.isInteger(state.exit.code) || typeof state.exit.signal === 'string') && !state.workerAlive && !state.renderAlive &&
        nativeRenderers(job,state.engine,state.exit,listRenderers).length === 0, code);
    } catch { throw Error(code); }
  };
  const cancelProof = job => {
    const terminal = bound(job,'terminal.json');
    return settled(job,terminal) || terminal;
  };
  const cancellation = (job, dispatch) => {
    const receipt = bound(job,cancelledStage), request = bound(job,requestStage);
    if (!request && !receipt) return {};
    const original = dispatch === undefined ? bound(job,'dispatch.json') : dispatch;
    const dispatchHash = original ? jobHash(original) : null;
    if (request) requireFact(original && request.dispatchHash === dispatchHash && request.stage === requestStage &&
      request.state === 'cancel_pending' && typeof request.createdAt === 'string' && Number.isFinite(Date.parse(request.createdAt)),
    'aerender_cancel_binding');
    if (receipt) {
      const proof = original && cancelProof(job);
      requireFact(receipt.state === 'cancelled' && typeof receipt.createdAt === 'string' &&
        Number.isFinite(Date.parse(receipt.createdAt)) && Boolean(original) === Boolean(request) &&
        (!original || proof) && receipt.dispatchHash === dispatchHash &&
        receipt.requestHash === (request ? jobHash(request) : null) &&
        receipt.proofHash === (proof ? jobHash(proof) : null) &&
        (receipt.slotHash === null || !original && typeof receipt.slotHash === 'string' && sha.test(receipt.slotHash)),
      'aerender_cancel_binding');
    }
    return { request, receipt };
  };
  const noSlotFor = (id, held) => held ? uuid.test(held.id) && held.id !== id : !present(active);
  const strandedSlot = job => {
    const held = record(active);
    if (noSlotFor(job.id,held)) return null;
    // start writes this slot before it can dispatch a worker.
    requireFact(held?.id === job.id && held.jobHash === jobHash(job) &&
      typeof held.dispatchHash === 'string' && sha.test(held.dispatchHash) &&
      !present(job.partial) && !['launcher.json','worker.json','start-intent.json','engine.json',
        'engine-exit.json','renderer.json','terminal.json','reconciled.json'].some(stage => present(file(job.id,stage))),
    'aerender_cancel_unsettled');
    return jobHash(held);
  };
  const drainProof = (job, dispatch) => {
    try {
      if (!ownsActive(job,dispatch)) return null;
      const proof = cancelProof(job);
      if (!proof) return null;
      if (proof.state === 'failed') {
        if (present(file(job.id,'start-intent.json'))) return null;
        if (dispatch.observationVersion !== undefined) {
          const state = observe(job,dispatch);
          if (state.workerAlive || state.renderAlive) return null;
        }
      } else {
        // An unknown media verdict can coexist with proof that execution has ended.
        assertQuiescent(job,dispatch,'aerender_cancel_unsettled',false);
      }
      return proof;
    } catch { return null; }
  };
  const releaseCancelled = (job, dispatch, receipt) => {
    if (dispatch) {
      if (ownsActive(job,dispatch)) fs.unlinkSync(active);
    } else if (receipt.slotHash) {
      const held = record(active);
      if (held?.id === job.id && jobHash(held) === receipt.slotHash) fs.unlinkSync(active);
    }
  };
  const release = id => {
    const held = record(active);
    if (held?.id === id) fs.unlinkSync(active);
  };
  return {
    preparation(id) {
      const prepared = file(id, 'prepared.json'), directory = path.dirname(prepared);
      if (!present(directory)) return null;
      plainPath(directory, true);
      return { job:record(prepared), intent:record(file(id, 'prepare-intent.json')) };
    },
    prepare(spec, { id = randomUUID(), authorization, assertCurrent = () => {} } = {}) {
      validateSpec(spec);
      checkInputs(spec);
      requireFact(!present(spec.output), 'aerender_output_exists');
      const prepared = file(id, 'prepared.json');
      const working = path.join(path.dirname(spec.project.path), 'core4-render-' + id + '.aep');
      const partial = path.join(path.dirname(spec.output), 'core4-render-' + id + '.partial.mp4');
      requireFact(!samePath(spec.project.path, working) && !samePath(spec.output, partial), 'aerender_path_collision');
      assertCurrent();
      if (authorization) {
        fs.mkdirSync(path.dirname(prepared));
        writeOnce(file(id,'prepare-intent.json'),{id,authorization});
      }
      // Keep the exclusive destination handle here so failure cleanup can prove ownership.
      const fd = fs.openSync(working, 'wx', 0o600);
      let owned;
      try {
        try {
          owned = fs.fstatSync(fd, { bigint: true });
          requireFact(projectDigest(spec.project.path, fd) === spec.project.sha256, 'aerender_input_changed');
          fs.fsyncSync(fd);
        } finally { fs.closeSync(fd); }
        verifyInput({ path: working, sha256: spec.project.sha256 }, /\.aep$/i, true);
        if (!authorization) fs.mkdirSync(path.dirname(prepared));
        const job = { id, spec, working, partial, createdAt: new Date().toISOString(), ...(authorization && {authorization}) };
        writeOnce(prepared, job);
        return { id, state:'prepared' };
      } catch (error) {
        if (owned) {
          try {
            const { info } = plainPath(working);
            // Receipt publication may already have linked the file before stage cleanup failed.
            if (info.dev === owned.dev && info.ino === owned.ino &&
                info.birthtimeNs === owned.birthtimeNs && !present(prepared)) fs.unlinkSync(working);
          } catch { /* Preserve the failure and leave unproven paths alone. */ }
        }
        throw error;
      }
    },
    start(id, assertCurrent = () => {}) {
      return withLock(root, async () => {
        const job = get(id), dispatchPath = file(id, 'dispatch.json');
        requireFact(!present(file(id,requestStage)) && !present(file(id,cancelledStage)), 'aerender_cancelled');
        requireFact(!present(dispatchPath) && !present(active), 'aerender_active_or_already_dispatched');
        requireFact(!present(job.partial) && !present(job.spec.output), 'aerender_output_exists');
        checkInputs(job.spec, job.working);
        const starter = identity(process.pid);
        requireFact(validProcess(starter) && starter.pid === process.pid && samePath(starter.exe,process.execPath), 'aerender_worker_identity');
        const dispatch = { id, jobHash:jobHash(job), createdAt:new Date().toISOString(), observationVersion:1, starter,
          ...(job.authorization && {workerEntry}) };
        verifyDispatch(dispatch);
        assertCurrent();
        writeOnce(active, { id, jobHash:dispatch.jobHash, dispatchHash:jobHash(dispatch) });
        writeOnce(dispatchPath, dispatch);
        const child = spawn(process.execPath, workerArgs(id), { cwd:path.dirname(dispatchPath), detached:true, windowsHide:true, stdio:'ignore' });
        await new Promise((resolve, reject) => { child.once('spawn',resolve); child.once('error',reject); });
        try {
          const launched = identity(child.pid);
          if (workerFor(launched,job,dispatch)) writeOnce(file(id,'launcher.json'),scoped(job,dispatch,'launcher.json',{process:launched}));
        } catch { /* Worker records its own identity before touching AE. */ }
        child.unref();
        return { id, state:'submitted' };
      });
    },
    async worker(id) {
      const job = get(id);
      const dispatch = bound(job,'dispatch.json');
      verifyDispatch(dispatch);
      requireFact(ownsActive(job,dispatch), 'aerender_dispatch_binding');
      const self = identity(process.pid);
      requireFact(workerFor(self,job,dispatch) && self.pid === process.pid && samePath(self.exe,process.execPath), 'aerender_worker_identity');
      const readLauncher = () => readProcess(job,dispatch,'launcher.json', row => workerFor(row,job,dispatch));
      let launched = readLauncher();
      const starterAlive = !launched && matchesProcess(dispatch.starter,identity);
      if (!launched && !starterAlive) launched = readLauncher(); // start may have pinned this child just before exiting.
      requireFact(launched ? sameProcess(launched,self) : starterAlive, 'aerender_worker_identity');
      const write = (stage,data) => writeOnce(file(id,stage),scoped(job,dispatch,stage,data));
      write('worker.json', {process:self});
      let terminal;
      try {
        checkInputs(job.spec, job.working);
        plainPath(path.dirname(job.partial),true);
        requireFact(!present(job.partial) && !present(job.spec.output), 'aerender_output_exists');
        const log = logFor(job), args = renderArgs(job,log);
        const env = adobeEnvironment(job.spec.engine.path);
        const intent = { executable:job.spec.engine.path, args, createdAt:new Date().toISOString(), workerHash:jobHash(self) };
        write('start-intent.json', intent);
        const fd = fs.openSync(file(id,'console.log'),'wx');
        let result, engine;
        try {
          const child = spawn(job.spec.engine.path,args,{cwd:path.dirname(log),windowsHide:true,stdio:['pipe',fd,fd],env});
          result = new Promise(resolve => {
            child.once('close',(code,signal)=>resolve({code,signal}));
            child.once('error',error=>resolve({error:error.code||'spawn_error'}));
          });
          if (child.pid) {
            try {
              const candidate = identity(child.pid);
              requireFact(engineFor(candidate,job,self,intent) && candidate.pid === child.pid, 'aerender_engine_identity');
              write('engine.json', {process:candidate});
              engine = candidate;
            } catch (error) {
              write('engine-observation-error.json', {code:error.message});
            }
          }
        } finally { fs.closeSync(fd); }
        const outcome = await result;
        requireFact(engine, 'aerender_engine_identity');
        const exit = { ...outcome, engineHash:jobHash(engine), observedAt:new Date().toISOString() };
        write('engine-exit.json', exit);
        requireFact(exit.code === 0 && exit.signal === null, 'aerender_engine_failed');
        requireFact(!matchesProcess(engine,identity), 'aerender_engine_identity');
        const [renderer] = nativeRenderers(job,engine,exit,listRenderers);
        if (renderer) {
          write('renderer.json', {process:renderer,engineHash:jobHash(engine)});
          while (matchesProcess(renderer,identity)) await new Promise(resolve => setTimeout(resolve,3000));
        }
        requireFact(nativeRenderers(job,engine,exit,listRenderers).length === 0, 'aerender_native_identity');
        terminal = verifyCompleted(job,log);
        requireFact(nativeRenderers(job,engine,exit,listRenderers).length === 0, 'aerender_native_identity');
      } catch (error) {
        // AfterFX can outlive the CLI wrapper. An incomplete observation after
        // a spawn intent keeps the slot even when the wrapper returned zero.
        terminal = { id, state:present(file(id,'start-intent.json')) ? 'unknown' : 'failed',
          error: String(error.message).slice(0, 240) };
      }
      writeOnce(file(id,'terminal.json'),{ ...terminal, jobHash:jobHash(job) });
    },
    status(id) {
      const job = get(id);
      try {
        const published = bound(job,'published.json');
        const { request, receipt } = cancellation(job);
        if (request || receipt) {
          requireFact(!published && !present(file(id,publishStage)), 'aerender_cancel_binding');
          return { id, state:receipt ? 'cancelled' : 'cancel_pending' };
        }
        if (published) return published;
        if (job.authorization && present(file(id,publishStage))) return { id, state:'unknown' };
        const terminal = bound(job,'terminal.json');
        const end = settled(job,terminal);
        if (end) return end;
        const dispatch = bound(job,'dispatch.json');
        if (!dispatch && noSlotFor(id,record(active))) return { id, state:'prepared' };
        if (dispatch?.observationVersion === 1) {
          const state = observe(job,dispatch);
          if (state.renderAlive) return { id, state:'rendering' };
          if (state.workerAlive && !terminal) return { id, state:state.exit ? 'verifying' : 'starting' };
        }
        if (terminal?.state === 'unknown') return terminal;
      } catch { return { id, state:'unknown' }; }
      return { id, state:'unknown' };
    },
    reconcile(id, assertCurrent = () => {}) {
      return withLock(root, () => {
        const job = get(id), { request, receipt } = cancellation(job);
        if (request || receipt) requireFact(!present(file(id,'published.json')) && !present(file(id,publishStage)), 'aerender_cancel_binding');
        if (receipt) return { id, state:'cancelled' };
        const old = bound(job,'published.json') || settled(job,bound(job,'terminal.json'));
        if (old) return old;
        const dispatch = bound(job,'dispatch.json');
        assertQuiescent(job,dispatch,'aerender_reconcile_unsettled');
        assertCurrent();
        const result = { ...verifyCompleted(job,logFor(job)), jobHash:jobHash(job) };
        assertQuiescent(job,dispatch,'aerender_reconcile_unsettled');
        assertCurrent();
        writeOnce(file(id,'reconciled.json'),result);
        return result;
      });
    },
    cancel(id, assertCurrent = () => {}) {
      return withLock(root, () => {
        const job = get(id), dispatch = bound(job,'dispatch.json');
        const { request, receipt:previous } = cancellation(job,dispatch);
        let receipt = previous;
        requireFact(!present(file(id,'published.json')) && !present(file(id,publishStage)), 'aerender_cancel_publication_started');
        assertCurrent();
        const assertOutputVacant = () => requireFact(!present(job.spec.output), 'aerender_cancel_publication_started');
        if (!receipt) {
          assertOutputVacant();
          let intent = request, proof, slotHash = null;
          if (dispatch) {
            if (!intent) {
              intent = scoped(job,dispatch,requestStage,{state:'cancel_pending',createdAt:new Date().toISOString()});
              writeOnce(file(id,requestStage),intent);
            }
            proof = drainProof(job,dispatch);
            if (!proof) return { id, state:'cancel_pending' };
          } else {
            slotHash = strandedSlot(job);
          }
          assertOutputVacant();
          receipt = {
            id, jobHash:jobHash(job), state:'cancelled', createdAt:new Date().toISOString(),
            dispatchHash:dispatch ? jobHash(dispatch) : null, requestHash:intent ? jobHash(intent) : null,
            proofHash:proof ? jobHash(proof) : null, slotHash
          };
          writeOnce(file(id,cancelledStage),receipt);
        }
        releaseCancelled(job,dispatch,receipt);
        return { id, state:'cancelled' };
      });
    },
    finalize(id, assertCurrent = () => {}) {
      return withLock(root, () => {
        const job = get(id), publishedPath = file(id,'published.json');
        const { request, receipt } = cancellation(job);
        requireFact(!request && !receipt, 'aerender_cancelled');
        assertCurrent();
        const published = bound(job,'published.json');
        if (published) {
          const output = fingerprint(job.spec.output,true);
          requireFact(output.sha256 === published.sha256, 'aerender_published_changed');
          removePublishedAlias(job,output);
          release(id);
          return published;
        }
        const end = settled(job,bound(job,'terminal.json')), dispatch = bound(job,'dispatch.json');
        requireFact(dispatch && ownsActive(job,dispatch) &&
          end && end.id === id && ['verified','failed'].includes(end.state), 'aerender_unsettled');
        if (end.state === 'failed') {
          requireFact(!present(file(id,'start-intent.json')) && !present(file(id,publishStage)), 'aerender_unsettled');
          release(id); return end;
        }
        if (dispatch.observationVersion !== undefined) assertQuiescent(job,dispatch,'aerender_unsettled');
        checkInputs(job.spec,job.working);
        plainPath(path.dirname(job.spec.output),true);
        const partial = fingerprint(job.partial,true);
        requireFact(sameFingerprint(partial,end.output), 'aerender_partial_changed');
        const readAlias = () => {
          const output = fingerprint(job.spec.output,true);
          requireFact(sameFingerprint(output,partial), 'aerender_publication_conflict');
          return output;
        };
        const intent = observed(job,dispatch,publishStage);
        if (intent) requireFact(intent.path === job.spec.output && intent.proofHash === jobHash(end) &&
          sameFingerprint(partial,intent.output), 'aerender_publication_conflict');
        else {
          if (present(job.spec.output)) readAlias();
          writeOnce(file(id,publishStage),scoped(job,dispatch,publishStage,{
            path:job.spec.output, proofHash:jobHash(end), output:partial
          }));
        }
        try { fs.linkSync(job.partial,job.spec.output); }
        catch (error) { if (error.code !== 'EEXIST') throw error; }
        const output = readAlias();
        const result = { id, jobHash:jobHash(job), state:'published', path:job.spec.output, sha256:output.sha256, bytes:output.bytes, media:end.media };
        writeOnce(publishedPath,result);
        removePublishedAlias(job,output);
        release(id);
        return result;
      });
    }
  };
}

function sameFingerprint(actual, expected) {
  return expected && actual.sha256 === expected.sha256 && actual.bytes === expected.bytes &&
    actual.dev === expected.dev && actual.ino === expected.ino;
}

function jobHash(job) {
  return createHash('sha256').update(JSON.stringify(job)).digest('hex');
}

function removePublishedAlias(job, output) {
  if (!present(job.partial)) return;
  const current = fingerprint(job.partial,true);
  requireFact(current.ino === output.ino && current.dev === output.dev && current.sha256 === output.sha256, 'aerender_partial_changed');
  fs.unlinkSync(job.partial);
}

async function main(workerEntry = __filename) {
  requireFact(process.platform === 'win32', 'aerender_windows_required');
  const args = process.argv.slice(2);
  let root;
  if (args[0] === '--state-dir') {
    requireFact(args.length >= 4 && path.isAbsolute(args[1]), 'aerender_root');
    root = path.resolve(args[1]);
    args.splice(0,2);
  }
  const [command, arg, workerId, ...rest] = args;
  if (command === 'worker') {
    requireFact(!root && arg && workerId && !rest.length, 'aerender_usage');
    await createJobs(arg, undefined, undefined, workerEntry).worker(workerId);
    return;
  }
  requireFact(['prepare','start','status','reconcile','finalize','cancel'].includes(command) && arg && !workerId, 'aerender_usage');
  if (!root) {
    requireFact(process.env.LOCALAPPDATA, 'aerender_windows_required');
    const installation = fs.realpathSync.native(path.join(process.env.LOCALAPPDATA,'AEAgentCore4'));
    root = path.join(installation,'aerender-jobs-v1');
  }
  const jobs = createJobs(root, undefined, undefined, workerEntry);
  const value = command === 'prepare' ? jobs.prepare(record(path.resolve(arg))) : await jobs[command](arg);
  console.log(JSON.stringify(value));
}
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { createJobs, main };

```

## core4/runtime/aerender-profile.js

SHA-256 e6e8b5238ba9c4cab969920bebb0fa5f7a33b5b41b44e2d7da35f11182a43eb2

```javascript
'use strict';

// The caller has already checked the target shape and queue item identity.
function validateTimeline(target, row) {
  const { timeline, range, frames } = target;
  if (timeline === undefined && range === undefined) {
    if (row.frames !== frames) throw Error('aerender_queue_witness');
    return;
  }

  const { startFrame, frameCount } = timeline || {};
  if (!Number.isSafeInteger(startFrame) || startFrame < 0 ||
      !Number.isSafeInteger(frameCount) || frameCount < 1) throw Error('aerender_target');
  const endFrameExclusive = startFrame + frameCount;
  if (!Number.isSafeInteger(endFrameExclusive) || endFrameExclusive - 1 > 2147483647) throw Error('aerender_target');

  if (range !== undefined) {
    if (!Number.isSafeInteger(range?.startFrame) || !Number.isSafeInteger(range?.endFrameExclusive) ||
        range.startFrame < startFrame || range.endFrameExclusive > endFrameExclusive ||
        range.startFrame >= range.endFrameExclusive ||
        range.endFrameExclusive - range.startFrame !== frames) throw Error('aerender_target');
  } else if (frameCount !== frames) {
    throw Error('aerender_target');
  }

  if (row.frames !== frameCount || row.startFrame !== startFrame) throw Error('aerender_queue_witness');
}

// The target has passed validateTimeline. aerender's last frame is inclusive.
function frameArgs(target) {
  if (target.timeline === undefined) return [];
  const startFrame = target.range?.startFrame ?? target.timeline.startFrame;
  const endFrameExclusive = target.range?.endFrameExclusive ?? target.timeline.startFrame + target.timeline.frameCount;
  return ['-s', String(startFrame), '-e', String(endFrameExclusive - 1)];
}

function positiveInteger(value) {
  if (typeof value === 'string' && /^[1-9]\d*$/.test(value)) value = Number(value);
  return Number.isSafeInteger(value) && value > 0 ? value : NaN;
}

// Probe data is from ffprobe -count_frames -show_streams -show_format -of json.
function verifyMediaFacts(target, probe) {
  const format = probe?.format;
  const majorBrand = format?.tags?.major_brand;
  // FFprobe uses the same demuxer for MP4 and QuickTime, so also require an MP4/ISO brand.
  if (typeof format?.format_name !== 'string' || !format.format_name.split(',').includes('mp4') ||
      typeof majorBrand !== 'string' || !/^(isom|iso[2-9]|mp4[12]|avc1)$/.test(majorBrand) ||
      !Array.isArray(probe.streams)) throw Error('aerender_media_profile');

  const video = probe.streams.filter(stream => stream?.codec_type === 'video');
  const audio = probe.streams.filter(stream => stream?.codec_type === 'audio');
  const picture = video[0];
  const rate = typeof picture?.avg_frame_rate === 'string' && /^([1-9]\d{0,9})\/([1-9]\d{0,9})$/.exec(picture.avg_frame_rate);
  const [num, den] = target.fps.split('/').map(BigInt);
  if (video.length !== 1 || picture.codec_name !== 'h264' ||
      picture.width !== target.width || picture.height !== target.height ||
      positiveInteger(picture.nb_read_frames) !== target.frames ||
      !rate || BigInt(rate[1]) * den !== num * BigInt(rate[2]) ||
      audio.length !== Number(target.audio)) throw Error('aerender_media_profile');

  if (target.audio && (audio[0].codec_name !== 'aac' ||
      !positiveInteger(audio[0].sample_rate) || !positiveInteger(audio[0].channels))) {
    throw Error('aerender_media_profile');
  }

  const reportedDuration = format.duration;
  const durationParts = (typeof reportedDuration === 'string' || typeof reportedDuration === 'number') &&
    /^(\d{1,24})(?:\.(\d{1,9}))?$/.exec(reportedDuration);
  if (!durationParts) throw Error('aerender_media_profile');

  // Compare the decimal duration to the rational one-frame tolerance without floating-point rounding.
  const [, seconds, fraction = ''] = durationParts;
  const scaledDuration = BigInt(seconds + fraction) * num;
  const scaledFrame = 10n ** BigInt(fraction.length) * den;
  const frames = BigInt(target.frames);
  if (scaledDuration <= 0n || scaledDuration < (frames - 1n) * scaledFrame || scaledDuration > (frames + 1n) * scaledFrame) {
    throw Error('aerender_media_profile');
  }

  return { frames: target.frames, fps: target.fps, duration: Number(reportedDuration), width: target.width, height: target.height, audio: target.audio };
}

module.exports = { validateTimeline, frameArgs, verifyMediaFacts };

```

## core4/runtime/project-lifecycle-proof.js

SHA-256 7afaf78e5d5e3a5f39fc62b832bb63b1f04c098f969429efbef8f7686f193ff5

```javascript
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { canonical, exact, fail } = require('../protocol/json');
const { createProjectSaveProof, plainPath, readAep, copyAep, samePath } = require('./project-save-proof');

const fileKey = file => path.normalize(file);
const sha = /^[a-f0-9]{64}$/;
const renderAction = 'stage-render-copy';
const supportedActions = ['save-as', 'create', 'open', renderAction];
const scratchName = 'core4-r1-scratch.mp4';
const mediaBudget = 1024 ** 3;
const boundedInteger = (value, min, max = 2147483647) => Number.isSafeInteger(value) && value >= min && value <= max;
const mediaName = /\.(?:png|jpe?g|tiff?|bmp|mp4|mov|wav|aiff?|mp3|m4a)$/i;
const invalidPathChar = /[\x00-\x1f:*?"<>|]/;
const reserved = /^(?:con|prn|aux|nul|com[0-9¹²³]|lpt[0-9¹²³])(?:\.|$)/i;

function validateRenderInput({ action, render }, allowRenderCopy) {
  if (action !== renderAction) {
    if (render !== undefined) fail('lifecycle_render_policy');
    return;
  }
  if (allowRenderCopy !== true) fail('lifecycle_render_policy');
  exact(render, ['compId', 'fps', 'audio', 'output', 'startFrame', 'endFrameExclusive']);
  if (!boundedInteger(render.compId, 1) || typeof render.fps !== 'string' || !/^[1-9]\d{0,6}\/[1-9]\d{0,6}$/.test(render.fps) ||
      typeof render.audio !== 'boolean' || (render.startFrame === undefined) !== (render.endFrameExclusive === undefined) ||
      render.startFrame !== undefined && (!boundedInteger(render.startFrame, 0) || !boundedInteger(render.endFrameExclusive, render.startFrame + 1)))
    fail('lifecycle_render_target');
}

function assertNewOutput(output) {
  if (typeof output !== 'string' || !path.isAbsolute(output) || !samePath(fileKey(output), output) ||
      invalidPathChar.test(output.replace(/^[a-z]:/i, '')) || !/^[\w.-]+\.mp4$/i.test(path.basename(output)) ||
      reserved.test(path.basename(output)) || fs.lstatSync(output, { throwIfNoEntry: false })) fail('lifecycle_render_output');
  plainPath(path.dirname(output), true);
}

function renderWitness(job, input, pinned) {
  exact(job, ['target', 'queue', 'media', 'output', 'scratchOutput']);
  const { target, queue, media } = job, { render, destination } = input;
  exact(target, ['compId', 'compName', 'queueIndex', 'frames', 'width', 'height', 'fps', 'audio', 'timeline', 'range']);
  exact(target.timeline, ['startFrame', 'frameCount']);
  const { startFrame, frameCount } = target.timeline;
  if (target.compId !== render.compId || target.fps !== render.fps || target.audio !== render.audio ||
      !boundedInteger(target.width, 1, 30000) || !boundedInteger(target.height, 1, 30000) ||
      !boundedInteger(startFrame, 0) || !boundedInteger(frameCount, 1) || startFrame + frameCount - 1 > 2147483647 ||
      typeof target.compName !== 'string' || !target.compName.length || target.compName.length > 128 || /[\x00-\x1f]/.test(target.compName) ||
      job.output !== render.output || typeof job.scratchOutput !== 'string' ||
      !samePath(job.scratchOutput, path.join(path.dirname(fileKey(destination)), scratchName)) ||
      !Array.isArray(queue) || !queue.length || queue.length > 64 || target.queueIndex !== queue.length ||
      !Array.isArray(media) || media.length > 128) fail('lifecycle_render_readback');
  if (render.startFrame === undefined) {
    if (target.range !== undefined || target.frames !== frameCount) fail('lifecycle_render_readback');
  } else if (render.endFrameExclusive > frameCount || target.frames !== render.endFrameExclusive - render.startFrame ||
      canonical(target.range) !== canonical({ startFrame: startFrame + render.startFrame, endFrameExclusive: startFrame + render.endFrameExclusive })) {
    fail('lifecycle_render_readback');
  }
  for (const [offset, row] of queue.entries()) {
    if (offset === queue.length - 1) {
      if (canonical(row) !== canonical({ index: target.queueIndex, name: target.compName, status: 'Queued',
        compId: target.compId, format: 'H.264', frames: frameCount, startFrame })) fail('lifecycle_render_readback');
    } else {
      exact(row, ['index', 'name', 'status']);
      if (row.index !== offset + 1 || typeof row.name !== 'string' || !row.name.length || row.name.length > 128 ||
          !['Unqueued', 'Needs Output', 'User Stopped', 'Error Stopped', 'Done'].includes(row.status)) fail('lifecycle_render_readback');
    }
  }
  const seen = new Set();
  let bytes = 0;
  for (const item of media) {
    exact(item, ['path', 'bytes', 'modifiedMs', ...(pinned ? ['sha256'] : [])]);
    if (typeof item.path !== 'string' || !path.isAbsolute(item.path) || !samePath(fileKey(item.path), item.path) ||
        item.path.length > 4096 || invalidPathChar.test(item.path.replace(/^[a-z]:/i, '')) || !mediaName.test(item.path) ||
        !boundedInteger(item.bytes, 1, mediaBudget) || !boundedInteger(item.modifiedMs, 0, Number.MAX_SAFE_INTEGER) ||
        (bytes += item.bytes) > mediaBudget || pinned && !sha.test(item.sha256)) fail('lifecycle_render_media');
    const key = process.platform === 'win32' ? item.path.toLowerCase() : item.path;
    if (seen.has(key)) fail('lifecycle_render_media');
    seen.add(key);
  }
}

function pinMedia(item) {
  const { resolved, info } = plainPath(item.path);
  const modified = Number(info.mtimeNs / 1000000n);
  const matchesTime = item.modifiedMs % 1000 === 0
    ? Math.floor(modified / 1000) * 1000 === item.modifiedMs : Math.abs(modified - item.modifiedMs) <= 1;
  if (info.size !== BigInt(item.bytes) || !matchesTime) fail('lifecycle_render_media_changed');
  const fd = fs.openSync(resolved, 'r');
  const assertSame = current => {
    if (['dev', 'ino', 'size', 'mtimeNs', 'ctimeNs', 'nlink'].some(field => current[field] !== info[field]))
      fail('lifecycle_render_media_changed');
  };
  try {
    assertSame(fs.fstatSync(fd, { bigint: true }));
    const hash = createHash('sha256'), buffer = Buffer.allocUnsafe(Math.min(item.bytes, 1024 * 1024));
    for (let offset = 0; offset < item.bytes;) {
      const read = fs.readSync(fd, buffer, 0, Math.min(buffer.length, item.bytes - offset), offset);
      if (!read) fail('lifecycle_render_media_changed');
      hash.update(buffer.subarray(0, read));
      offset += read;
    }
    assertSame(fs.fstatSync(fd, { bigint: true }));
    assertSame(plainPath(resolved).info);
    return { ...item, sha256: hash.digest('hex') };
  } finally { fs.closeSync(fd); }
}
function allowsDirtyDestination({ action, allowDirtyDestination }) {
  if (allowDirtyDestination !== undefined && (action !== 'open' || typeof allowDirtyDestination !== 'boolean')) fail('lifecycle_dirty_destination_policy');
  return action === 'open' && allowDirtyDestination === true;
}

function writeExclusive(file, bytes) {
  const fd = fs.openSync(file, 'wx', 0o600);
  try { fs.writeFileSync(fd, bytes); fs.fsyncSync(fd); }
  finally { fs.closeSync(fd); }
}

function createProjectLifecycleProof(options) {
  const save = createProjectSaveProof(options);
  const checkpointFile = (payload, ref) => save.checkpointPath(payload.checkpointRoot, ref);
  const dirIdentity = directory => {
    const { resolved, info } = plainPath(directory, true);
    return { path: resolved, device: String(info.dev), inode: String(info.ino) };
  };
  function reserveDestination(destination, marker) {
    const parent = path.dirname(fileKey(destination));
    plainPath(path.dirname(parent), true);
    try { fs.mkdirSync(parent, { mode: 0o700 }); }
    catch (error) { if (error.code === 'EEXIST') fail('lifecycle_new_directory_required'); throw error; }
    const record = { destination, directory: dirIdentity(parent) };
    writeExclusive(marker, canonical(record));
  }
  function assertDestination(destination, marker) {
    const file = plainPath(marker).resolved;
    if (fs.statSync(file).size > 16384) fail('lifecycle_destination_reservation');
    const record = { destination, directory: dirIdentity(path.dirname(fileKey(destination))) };
    if (canonical(record) !== fs.readFileSync(file, 'utf8')) fail('lifecycle_destination_reservation');
  }
  return {
    assertTarget: save.assertTarget,
    prepareCheckpoint(ctx) {
      const { action, destination, projectId, expectedDestinationSha256 } = ctx.input;
      if (!supportedActions.includes(action) || !destination || samePath(fileKey(destination), fileKey(projectId))) fail('lifecycle_destination_path');
      if (action !== 'save-as' && ctx.before.dirty) fail('lifecycle_clean_source_required');
      allowsDirtyDestination(ctx.input);
      validateRenderInput(ctx.input, options.allowRenderCopy);
      if (action === renderAction) assertNewOutput(ctx.input.render.output);
      const target = action === 'open' ? readAep(destination) : null;
      if (target && target.digest !== expectedDestinationSha256) fail('lifecycle_destination_hash');
      save.prepareCheckpoint(ctx);
      const file = checkpointFile(ctx.input, ctx.checkpoint.ref);
      if (target) {
        const copy = file.replace(/\.aep$/, '.open.aep');
        copyAep(destination, copy, target);
        save.checkpointFacts(copy, target.digest, target.bytes);
      } else reserveDestination(destination, file + '.destination.json');
    },
    observe(command, snapshot) {
      const { sessionId, projectId, destination, action, _execution } = command.payload;
      const changed = command.phase === 'mutate';
      const staged = changed && action === renderAction;
      exact(snapshot, ['target', 'revision', 'protected', 'currentProject', 'dirty', 'fileStamp', 'inventory', ...(staged ? ['renderJob'] : [])]);
      if (canonical(snapshot.target) !== canonical({ projectId, sessionId }) || snapshot.protected !== projectId ||
          typeof snapshot.currentProject !== 'string' || !samePath(fileKey(snapshot.currentProject), fileKey(changed ? destination : projectId)) ||
          typeof snapshot.dirty !== 'boolean' || typeof snapshot.inventory !== 'string') fail('lifecycle_native_readback');
      const current = readAep(snapshot.currentProject, snapshot.fileStamp);
      const checkpointRoot = save.checkpointDirectory();
      const observed = { ...snapshot, savedFileSha256: current.digest, checkpointRoot };
      if (!changed) return observed;
      const { expectedSavedSha256, expectedFileStamp } = command.payload;
      const dirtyAllowed = allowsDirtyDestination(command.payload);
      validateRenderInput(command.payload, options.allowRenderCopy);
      if (snapshot.dirty && !dirtyAllowed) fail('lifecycle_native_readback');
      if (!supportedActions.includes(action) || readAep(projectId, expectedFileStamp).digest !== expectedSavedSha256 ||
          checkpointRoot !== command.payload.checkpointRoot) fail('lifecycle_source_changed');
      const file = checkpointFile(command.payload, _execution.checkpointRef);
      if (action === 'open') {
        if (current.digest !== command.payload.expectedDestinationSha256) fail('lifecycle_destination_hash');
        save.checkpointFacts(file.replace(/\.aep$/, '.open.aep'), current.digest, current.bytes);
      } else assertDestination(destination, file + '.destination.json');
      const checkpoint = save.checkpointFacts(file, expectedSavedSha256, expectedFileStamp.bytes);
      if (staged) {
        renderWitness(snapshot.renderJob, command.payload, false);
        const { renderJob } = snapshot;
        assertNewOutput(renderJob.output);
        assertNewOutput(renderJob.scratchOutput);
        observed.renderJob = { ...renderJob, media: renderJob.media.map(pinMedia) };
        if (readAep(snapshot.currentProject, snapshot.fileStamp).digest !== current.digest) fail('lifecycle_disk_readback');
      }
      return { ...observed, transition: { action, sourceSha256: expectedSavedSha256, checkpoint } };
    },
    validateResult({ input, before, checkpoint }, after) {
      const file = checkpointFile(input, checkpoint.ref);
      const expected = { action: input.action, sourceSha256: input.expectedSavedSha256,
        checkpoint: { path: file, sha256: input.expectedSavedSha256, bytes: before.fileStamp.bytes, scope: 'on-disk-before-save' } };
      const dirtyAllowed = allowsDirtyDestination(input);
      validateRenderInput(input, options.allowRenderCopy);
      if (input.action === renderAction) renderWitness(after.renderJob, input, true);
      if (typeof after.dirty !== 'boolean' || after.dirty && !dirtyAllowed || !sha.test(after.savedFileSha256) || !samePath(fileKey(after.currentProject), fileKey(input.destination)) ||
          (input.action === 'open' ? after.savedFileSha256 !== input.expectedDestinationSha256 :
            after.inventory !== (input.action === 'create' ? '[]' : before.inventory)) || canonical(after.transition) !== canonical(expected)) fail('lifecycle_disk_readback');
    }
  };
}

module.exports = { createProjectLifecycleProof };

```

## core4/tools/package-installable.js

SHA-256 e040ed1970009a56fcf263e4aea84d248928afb4588cc9a0858eca6a7522b817

```javascript
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { hash, canonical, fail } = require('../protocol/json');
const { deriveComposition, compositionPaths, registrySource } = require('../runtime/stdio-entry.js');
const OWNER_V3_FILES = Object.freeze(['runtime/owner-entry.js', 'runtime/client-entry.js', 'runtime/client-ipc.js', 'runtime/client-stdio.js', 'runtime/controller-lease.js', 'runtime/attachment-owner.js', 'runtime/owner-lifecycle.js', 'runtime/recovery-inspection.js', 'runtime/windows-owner-process.js', 'runtime/owner-maintenance.js']);
const OWNER_FILES = Object.freeze([...OWNER_V3_FILES, 'runtime/start-over-inspection.js', 'runtime/start-over-process.js', 'runtime/start-over-state.js', 'runtime/start-over-barrier.js', 'runtime/start-over-archive.js', 'runtime/start-over-finisher.js', 'runtime/work-session.js', 'runtime/start-over-panel-control.js', 'runtime/start-over-driver.js', 'runtime/owner-launch.js']);
function runtimeBinding(release, read) {
  if (!Object.hasOwn(release.hashes, 'runtime/owner-contract.json')) {
    if (OWNER_FILES.some(file => Object.hasOwn(release.hashes, file))) fail('owner_contract_required');
    return Object.freeze({ runtimeModel: 'stdio', clientEntry: 'runtime/stdio-entry.js', clientArgument: '--installation', clientDescriptorFile: null });
  }
  const bytes = read('runtime/owner-contract.json');
  if (release.format !== 2 || hash(bytes) !== release.hashes['runtime/owner-contract.json']) fail('owner_contract_integrity');
  let contract; try { contract = JSON.parse(bytes); } catch { fail('owner_contract_schema'); }
  const files = contract.version === 3 ? OWNER_V3_FILES : OWNER_FILES;
  const expected = { version: contract.version === 3 ? 3 : 4, runtimeModel: 'owner', clientEntry: 'runtime/client-entry.js', clientArgument: '--client-descriptor',
    ownerEntry: 'runtime/owner-entry.js', ownerArgument: '--installation', clientDescriptorFile: 'core-client.json', requiredFiles: [...files] };
  if (canonical(contract) !== canonical(expected) || files.some(file => !Object.hasOwn(release.hashes, file)) || contract.version === 3 && OWNER_FILES.some(file => !OWNER_V3_FILES.includes(file) && Object.hasOwn(release.hashes, file))) fail('owner_contract_schema');
  return Object.freeze(contract);
}
function buildPackage(root = path.resolve(__dirname, '..'), selector = 'manual', options = {}) {
  if (!options || Object.getPrototypeOf(options) !== Object.prototype || Object.keys(options).some(key => key !== 'runtimeModel')) fail('runtime_selector');
  const runtimeModel = options.runtimeModel ?? 'stdio'; if (!['stdio', 'owner'].includes(runtimeModel)) fail('runtime_selector');
  const read = file => fs.readFileSync(path.join(root, file));
  const spec = JSON.parse(read('runtime/source-package.json'));
  if (spec.version !== 3) fail('composition_selector');
  function compositionPart(key) {
    if (typeof key !== 'string' || !/^[a-z][a-z0-9-]*$/.test(key)) fail('composition_selector');
    if (Object.hasOwn(spec.compositions, key)) return spec.compositions[key];
    const file = path.resolve(root, 'config/compositions', key + '.json');
    if (!fs.existsSync(file)) fail('composition_selector');
    if (fs.realpathSync(file) !== file) fail('package_symlink');
    const part = JSON.parse(fs.readFileSync(file));
    if (!part.bundle || Object.hasOwn(part, 'packagePart')) fail('composition_selector');
    return part;
  }
  const lineage = new Set();
  const parts = [];
  for (let key = selector; key !== null;) {
    if (lineage.has(key)) fail('composition_selector');
    const part = compositionPart(key);
    lineage.add(key); parts.unshift(part); key = part.parent;
  }
  const optional = parts.flatMap(part => part.packagePart === null ? [] : [part.bundle ?? spec.optional[part.packagePart]]);
  const filesInPolicy = [...spec.files, ...optional.flatMap(part => part.files), ...(runtimeModel === 'owner' ? spec.optional.owner.files : [])];
  const closures = [...spec.artifactClosures, ...optional.flatMap(part => part.artifactClosures)];
  const artifacts = new Map();
  const paths = compositionPaths(filesInPolicy, closures, relative => {
    const artifact = JSON.parse(read(relative));
    artifacts.set(relative, artifact);
    return artifact;
  });
  for (const [relative, artifact] of artifacts) {
    for (const [file, pin] of Object.entries(artifact.hashes)) {
      const location = /^(modules|plan-engine)\//.test(relative) ? path.posix.join(path.posix.dirname(relative), file) : file;
      if (hash(read(location)) !== pin) fail('package_artifact_mismatch');
    }
  }
  const hashes = {}, files = {};
  for (const relative of [...paths].sort()) {
    if (/^(test|experiments|node_modules|\.git|logs|state|tools)\//.test(relative) || relative.includes('..') || relative.includes('\\') || path.isAbsolute(relative)) fail('package_closure_forbidden');
    const full = path.resolve(root, relative); if (fs.realpathSync(full) !== full) fail('package_symlink');
    const bytes = fs.readFileSync(full); hashes[relative] = hash(bytes); files[relative] = bytes.toString('base64');
  }
  const release = { version: '4.2.2', format: 2, hashes };
  const original = JSON.parse(fs.readFileSync(path.join(root, 'config/catalog.json'), 'utf8'));
  const modules = parts.flatMap(part => part.modules), assets = parts.flatMap(part => part.assets);
  const profiles = Object.assign({}, ...parts.map(part => part.profiles));
  for (const moduleId of modules.filter(id => !original.modules.some(entry => entry.id === id))) {
    const modulePath = 'modules/' + moduleId;
    const manifest = JSON.parse(Buffer.from(files[modulePath + '/artifact.json'], 'base64'));
    original.modules.push({ id: moduleId, version: manifest.version, path: modulePath, admission: 'config/admissions/' + moduleId + '.json' });
    original.catalogRevision = selector + '-' + hash(manifest);
  }
  if (modules.some(id => original.modules.filter(m => m.id === id).length !== 1)) fail('composition_catalog');
  const catalog = { catalogRevision: original.catalogRevision, modules: modules.map(id => original.modules.find(m => m.id === id)), engine: selector === 'readonly' ? null : original.engine };
  const composition = { version: 2, id: selector, modules, engine: catalog.engine, assets };
  const add = (file, source) => { const bytes = typeof source === 'string' ? source : canonical(source); files[file] = Buffer.from(bytes).toString('base64'); hashes[file] = hash(bytes); };
  add('config/catalog.json', catalog); add('runtime/composition.json', composition);
  add('runtime/composition-policy.json', { id: selector, modules, assets, profiles, files: filesInPolicy, closures });
  // Reserve the generated registry slot before checking the declared closure.
  add('cep/jsx/registry.jsx', '');
  const selected = deriveComposition(release, file => Buffer.from(files[file], 'base64'));
  add('cep/jsx/registry.jsx', registrySource(selected.assets, Buffer.from(files['runtime/host/json-codec.jsx'], 'base64').toString('utf8')));
  return verifyPackage({ packageHash: hash(release), release, files });
}
function verifyPackage(pkg) {
  if (pkg.packageHash !== hash(pkg.release) || (pkg.release.version !== '4.0.0' && !(['4.1.0', '4.1.1', '4.1.2', '4.2.1', '4.2.2'].includes(pkg.release.version) && pkg.release.format === 2)) || canonical(Object.keys(pkg.files).sort()) !== canonical(Object.keys(pkg.release.hashes).sort())) fail('package_integrity');
  for (const [relative, data] of Object.entries(pkg.files)) {
    if (!/^[a-zA-Z0-9_./-]+$/.test(relative) || relative.split('/').includes('..') || path.isAbsolute(relative) || /^(test|experiments|node_modules|\.git|logs|state|tools)\//.test(relative) || hash(Buffer.from(data, 'base64')) !== pkg.release.hashes[relative]) fail('package_integrity');
  }
  runtimeBinding(pkg.release, file => Buffer.from(pkg.files[file], 'base64'));
  const selected = deriveComposition(pkg.release, file => Buffer.from(pkg.files[file], 'base64'));
  if (!selected.legacy && Buffer.from(pkg.files['cep/jsx/registry.jsx'], 'base64').toString('utf8') !== registrySource(selected.assets, Buffer.from(pkg.files['runtime/host/json-codec.jsx'], 'base64').toString('utf8'))) fail('composition_registry');
  return pkg;
}
if (require.main === module) {
  try {
    const args = process.argv.slice(2), options = {};
    for (let n = 0; n < args.length; n += 2) { const key = args[n]; if (!['--output', '--composition', '--runtime'].includes(key) || Object.hasOwn(options, key) || typeof args[n + 1] !== 'string' || args[n + 1].startsWith('--')) fail('package_options'); options[key] = args[n + 1]; }
    if (!options['--output'] || !path.isAbsolute(options['--output'])) fail('absolute_output_required');
    const pkg = buildPackage(undefined, options['--composition'] ?? 'manual', { runtimeModel: options['--runtime'] ?? 'stdio' }); fs.writeFileSync(options['--output'], canonical(pkg), { flag: 'wx' }); console.log(JSON.stringify({ packageHash: pkg.packageHash, files: Object.keys(pkg.files).length, composition: options['--composition'] ?? 'manual', runtimeModel: options['--runtime'] ?? 'stdio', output: options['--output'] }));
  } catch (e) { console.error(e.code || e.message); process.exitCode = 1; }
}
module.exports = { buildPackage, verifyPackage, runtimeBinding };

```

## core4/tools/package-capability.js

SHA-256 f3ccd56028e1e05887eba8db692aaec73807c37df8b219d0183b32d5673ab3af

```javascript
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
  if (!['4.1.0', '4.1.1', '4.1.2', '4.2.1', '4.2.2'].includes(base.release.version) || !composition || composition.id === 'readonly' ||
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

```

## core4/tools/stopped-update.js

SHA-256 ae2390aa8c8f0f23aad45fffa9d9db1a197b2dba45646c7351032efab4b58ae0

```javascript
'use strict';
// Installer-private update. JSON is evidence, never a normal plan/lease brand.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), http = require('node:http'), os = require('node:os');
const { canonical, hash, fail } = require('../protocol/json');
const installer = require('./install-core4'), leases = require('../runtime/install-lease');
const { verifyPackage, runtimeBinding } = require('./package-installable');
const { observeOwnerProcess, classifyOwnerProcess } = require('../runtime/windows-owner-process');
const permits = new WeakMap(), leasePermits = new WeakMap(), recoveries = new WeakMap();
const preparedRecoveries = new WeakMap();
const ownerCertificatePermits = new WeakMap(), ownerPreparedSources = new WeakMap();
const HEX = /^[a-f0-9]{64}$/, UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const FIELDS = ['dev', 'ino', 'size', 'birthtimeNs', 'mtimeNs', 'ctimeNs'];
const stamp = s => Object.fromEntries(FIELDS.map(k => [k, String(s[k])]));
const equal = (a, b) => canonical(a) === canonical(b), nil = () => ({ hash: null, stat: null });
function endpoint(server) {
  const a = server instanceof http.Server && server.listening && server.address();
  if (!a || a.address !== '127.0.0.1' || !Number.isInteger(a.port) || server.listenerCount('request')) fail('stopped_update_endpoint');
}
function plain(file, directory = false, missing = false) {
  if (!path.isAbsolute(file) || path.resolve(file) !== file) fail('stopped_update_path');
  let cursor = path.parse(file).root; const parts = file.slice(cursor.length).split(path.sep).filter(Boolean);
  for (const [index, part] of parts.entries()) {
    cursor = path.join(cursor, part); let s;
    try { s = fs.lstatSync(cursor, { bigint: true }); } catch (e) { if (missing && e.code === 'ENOENT') return false; throw e; }
    if (s.isSymbolicLink() || s.reparsePoint || fs.realpathSync(cursor) !== cursor || (index < parts.length - 1 || directory ? !s.isDirectory() : !s.isFile())) fail('stopped_update_path');
  }
  return true;
}
function read(file, limit = 64 * 1024 * 1024) {
  if (!plain(file, false, true)) return { file, bytes: null, ...nil() };
  const named = fs.lstatSync(file, { bigint: true }), fd = fs.openSync(file, 'r');
  try {
    const before = fs.fstatSync(fd, { bigint: true });
    if (!equal(stamp(named), stamp(before)) || before.size > BigInt(limit)) fail('stopped_update_changed');
    const bytes = Buffer.alloc(Number(before.size) + 1); let at = 0, n;
    while (at < bytes.length && (n = fs.readSync(fd, bytes, at, bytes.length - at, at))) at += n;
    if (at !== Number(before.size) || !equal(stamp(before), stamp(fs.fstatSync(fd, { bigint: true }))) || !plain(file) || !equal(stamp(before), stamp(fs.lstatSync(file, { bigint: true })))) fail('stopped_update_changed');
    return { file, bytes: bytes.subarray(0, at), hash: hash(bytes.subarray(0, at)), stat: stamp(before) };
  } finally { fs.closeSync(fd); }
}
const info = v => ({ hash: v.hash, stat: v.stat });
function tree(directory) {
  if (!plain(directory, true, true)) return null;
  const result = {}; let count = 0;
  function visit(dir, rel) {
    plain(dir, true); result[rel] = { directory: true, stat: stamp(fs.lstatSync(dir, { bigint: true })) };
    for (const name of fs.readdirSync(dir).sort()) {
      if (++count > 1024) fail('stopped_update_budget');
      const file = path.join(dir, name), relative = rel ? rel + '/' + name : name, s = fs.lstatSync(file);
      if (s.isDirectory()) visit(file, relative); else result[relative] = info(read(file));
    }
  }
  visit(directory, ''); return result;
}
function sameFact(actual, expected, moved = false) {
  if (!actual || !expected || actual.hash !== expected.hash || !!actual.stat !== !!expected.stat) return false;
  return !actual.stat || FIELDS.filter(k => !moved || k !== 'ctimeNs').every(k => actual.stat[k] === expected.stat[k]);
}
function sameTree(actual, expected, moved = false) {
  if (actual === null || expected === null) return actual === expected;
  return equal(Object.keys(actual), Object.keys(expected)) && Object.keys(expected).every(k => {
    const a = actual[k], b = expected[k];
    return b.directory ? a.directory === true && FIELDS.filter(f => !(moved && k === '' && f === 'ctimeNs')).every(f => a.stat[f] === b.stat[f]) : sameFact(a, b);
  });
}
function atomic(file, bytes, exclusiveClaim = false) {
  plain(path.dirname(file), true); if (plain(file, false, true)) fail('stopped_update_destination');
  const stage = file + '.stage-' + crypto.randomUUID(); let fd = fs.openSync(stage, 'wx+');
  try {
    if (fs.writeSync(fd, bytes) !== bytes.length) fail('stopped_update_short_write'); fs.fsyncSync(fd);
    const before = read(stage); if (!before.bytes.equals(bytes) || !equal(stamp(fs.fstatSync(fd, { bigint: true })), before.stat)) fail('stopped_update_changed');
    try { fs.linkSync(stage, file); }
    catch (error) {
      if (exclusiveClaim && error.code === 'EEXIST') {
        // A losing claim may discard only its own still-unpublished stage.
        // No generic stage retirement and no removal of the winning record.
        const own = read(stage), held = fs.fstatSync(fd, { bigint: true }), winner = read(file);
        if (!sameFact(own, before) || !equal(own.stat, stamp(held)) || held.nlink !== 1n || !winner.bytes || winner.stat.dev === own.stat.dev && winner.stat.ino === own.stat.ino) fail('stopped_update_claim_changed');
        fs.unlinkSync(stage);
        if (fs.fstatSync(fd, { bigint: true }).nlink !== 0n) fail('stopped_update_claim_changed');
      }
      throw error;
    }
    const linked = read(file);
    if (!sameFact(linked, before, true)) fail('stopped_update_changed');
    fs.unlinkSync(stage); const closing = fd; fd = undefined; fs.closeSync(closing);
    const final = read(file); if (!sameFact(final, before, true)) fail('stopped_update_changed'); return final;
  } finally { if (fd !== undefined) fs.closeSync(fd); }
}
function fullKey(d) {
  if (!d || !HEX.test(d.panelToken) || !HEX.test(d.controlToken) || d.panelToken === d.controlToken) fail('stopped_update_roles');
  return crypto.createHmac('sha256', Buffer.from(d.panelToken, 'hex')).update('ae-core4/stopped-update/key/v1\0').update(Buffer.from(d.controlToken, 'hex')).digest();
}
function scope(d, descriptorPath) { return { installRoot: d.installRoot, stateDir: d.stateDir, descriptorPath }; }
function binding(old, next, id, oldBytes = Buffer.from(canonical(old))) { return { version: 1, installationId: old.installationId, machineId: old.machineId, oldDescriptorHash: hash(oldBytes), newDescriptorHash: hash(canonical(next)), transactionId: id }; }
function seal(c, kind, value) {
  const body = { ...c.binding, kind, ...value }, message = 'ae-core4/stopped-update/record/v1\0' + canonical(body);
  return Buffer.from(canonical({ body, oldMac: crypto.createHmac('sha256', fullKey(c.old)).update(message).digest('hex'), newMac: crypto.createHmac('sha256', fullKey(c.next)).update(message).digest('hex') }));
}
function decode(c, view, kind) {
  let value; try { value = JSON.parse(view.bytes); } catch { fail('stopped_update_record'); }
  if (!view.bytes || !equal(Object.keys(value).sort(), ['body', 'newMac', 'oldMac']) || !Buffer.from(canonical(value)).equals(view.bytes) || value.body.kind !== kind || Object.keys(c.binding).some(k => value.body[k] !== c.binding[k])) fail('stopped_update_record');
  if (!seal(c, kind, Object.fromEntries(Object.entries(value.body).filter(([k]) => !Object.hasOwn(c.binding, k) && k !== 'kind'))).equals(view.bytes)) fail('stopped_update_record');
  return value.body;
}
async function actor(d) {
  const o = await observeOwnerProcess(process.pid);
  if (classifyOwnerProcess({ pid: process.pid, birthTicks: o.birthTicks }, o) !== 'alive' || !o.executablePath || path.resolve(o.executablePath).toLowerCase() !== path.resolve(d.nodePath).toLowerCase()) fail('stopped_update_process_unknown');
  return { bootId: crypto.randomUUID(), pid: process.pid, birthTicks: o.birthTicks };
}
async function dead(value) {
  if (!value || !UUID.test(value.bootId) || !Number.isSafeInteger(value.pid) || typeof value.birthTicks !== 'string') fail('stopped_update_actor');
  const o = await observeOwnerProcess(value.pid);
  if (!['absent', 'pid-reused'].includes(classifyOwnerProcess({ pid: value.pid, birthTicks: value.birthTicks }, o))) fail('stopped_update_process_not_dead');
}
function critical(c) {
  const d = c.old, p = d.stateDir, original = c.facts;
  const names = { origin: path.join(d.installRoot, 'origin.json'), anchor: path.join(p, 'origin.json'), journal: path.join(p, 'receiver/completions.ndjson'), ledger: path.join(p, 'broker/ledger.ndjson') };
  for (const [name, file] of Object.entries(names)) if (!sameFact(read(file), original.snapshot[name])) fail('stopped_update_history_changed');
  const maintenance = path.join(d.installRoot, 'transactions', c.stopId + '-owner-maintenance');
  if (c.source === 'owner') {
    const actual = tree(maintenance), entries = Object.fromEntries(Object.entries(actual || {}).filter(([k]) => k).map(([k, v]) => [k, v]));
    if (!actual || !equal({ dev: actual[''].stat.dev, ino: actual[''].stat.ino, birthtimeNs: actual[''].stat.birthtimeNs }, original.phase.directory) || !equal(entries, original.phase.tree)) fail('stopped_update_certificate_changed');
  } else {
    const actual = tree(path.join(d.installRoot, 'transactions', c.stopId + '-legacy-migration'));
    if (!actual || !equal({ dev: actual[''].stat.dev, ino: actual[''].stat.ino, birthtimeNs: actual[''].stat.birthtimeNs }, original.phase.directory) || !equal(Object.fromEntries(Object.entries(actual).filter(([k]) => k)), original.phase.tree)) fail('stopped_update_certificate_changed');
  }
  for (const [id, transaction] of Object.entries(original.lifecycle.transactions || {})) {
    if (!UUID.test(id)) fail('stopped_update_certificate_changed');
    const actual = tree(path.join(d.installRoot, 'transactions', id + '-owner-lifecycle'));
    const entries = actual && Object.fromEntries(Object.entries(actual).filter(([k]) => k).map(([name, fact]) => [name, { name, ...fact }]));
    if (!actual || !equal({ dev: actual[''].stat.dev, ino: actual[''].stat.ino, birthtimeNs: actual[''].stat.birthtimeNs }, transaction.directory) || !equal(entries, transaction.tree)) fail('stopped_update_certificate_changed');
  }
  const owned = c.lease ? leases.ownedLeaseGates(c.lease) : c.gates || new Map();
  for (const name of ['runtime-owner.json', 'runtime-owner.next', 'runtime-diagnostic.json', 'broker/broker-owner.lock', 'broker/broker-owner.gate', 'receiver/owner']) {
    const file = path.join(p, name), value = read(file), bytes = owned.get(file);
    if (bytes ? !value.bytes?.equals(bytes) : value.bytes !== null) fail('stopped_update_marker');
  }
  return read(path.join(p, 'runtime-maintenance.json'));
}
function checkStop(c) {
  const v = critical(c), archive = read(path.join(c.directory, 'original-stop'));
  if (!sameFact(v, c.facts.stop) && !(sameFact(archive, c.facts.stop, true) && sameFact(v, c.facts.stop, true) && equal(v.stat, archive.stat))) fail('stopped_update_stop_changed');
}
function stoppedUpdateLeasePermit(capability) { const p = leasePermits.get(capability); if (!p) fail('stopped_update_lease_brand'); return p; }
function acquireStoppedReadoptionLease(capability) {
  // Helper-only adapter to the unchanged runtime lease consumer. The readoption
  // module must pull-validate its own private permit; slice1 mints none.
  const permit = require('./stopped-host-readoption').stoppedReadoptionLeasePermit(capability), local = Object.freeze({});
  leasePermits.set(local, permit);
  try { return leases.acquireStoppedUpdateLease(local); }
  finally { leasePermits.delete(local); }
}
function certificateCheck(c) {
  const value = c.source === 'owner' ? require('../runtime/stopped-certification').assertStoppedCertificate(c.certificate, { installation: c.old, descriptorPath: c.descriptorPath, id: c.stopId, lease: c.lease }) : require('./legacy-owner-migration').assertLegacyStoppedCapability(c.certificate, { plan: c.plan, lease: c.lease }).facts;
  if (!equal(value, c.facts)) fail('stopped_update_certificate_changed');
}
function assertStoppedUpdatePermit(permit, { plan, lease } = {}) {
  const c = permits.get(permit);
  if (!c || c.plan !== plan || c.lease !== lease || c.used || c.switched) fail('stopped_update_permit_brand');
  endpoint(c.server); leases.assertInstallLease(lease, scope(c.old, c.descriptorPath), { full: true });
  const fp = installer.assertDurablePreparedInstallPlan(plan, { lease });
  if (!equal(fp, c.fingerprint)) fail('stopped_update_plan_changed');
  certificateCheck(c); if (!sameFact(read(path.join(c.directory, 'intent.json')), c.intent)) fail('stopped_update_intent_changed');
  return true;
}
async function prepare(options, source) {
  const { plan, reservedServer } = options;
  const fingerprint = installer.assertPreparedInstallBaseline(plan);
  const legacy = source === 'legacy' && require('./legacy-owner-migration').assertLegacyStoppedCapability(options.stoppedCapability, { plan, lease: options.lease });
  const old = legacy ? legacy.installation : options.installation, descriptorPath = legacy ? legacy.descriptorPath : options.descriptorPath, stopId = legacy ? legacy.id : options.id;
  if (!old || old.machineId !== os.hostname() || descriptorPath !== path.join(old.installRoot, 'installation.json') || !plan.previousDescriptor || !plan.previousDescriptor.equals(read(descriptorPath).bytes) || !equal(JSON.parse(plan.previousDescriptor), old) || plan.descriptor.installationId !== old.installationId || plan.descriptor.stateDir !== old.stateDir || plan.descriptor.packageHash === old.packageHash || runtimeBinding(plan.pkg.release, f => Buffer.from(plan.pkg.files[f], 'base64')).runtimeModel !== 'owner') fail('stopped_update_scope');
  const c = { source, plan, old, next: plan.descriptor, descriptorPath, stopId, server: reservedServer || legacy?.reservedServer, certificate: legacy ? options.stoppedCapability : options.certificate, lease: options.lease || null, binding: binding(old, plan.descriptor, plan.transactionId, plan.previousDescriptor), directory: path.join(old.installRoot, 'transactions', plan.transactionId + '-stopped-update') };
  endpoint(c.server);
  c.facts = legacy ? legacy.facts : require('../runtime/stopped-certification').assertStoppedCertificate(c.certificate, { installation: old, descriptorPath, id: stopId });
  if (!c.facts.stop || c.facts.stop.hash !== c.facts.stopHash || c.facts.descriptorHash !== hash(plan.previousDescriptor)) fail('stopped_update_certificate');
  const before = structuredClone(c.facts), a = await actor(old); endpoint(c.server); certificateCheck(c); installer.assertPreparedInstallBaseline(plan);
  if (!equal(before, c.facts)) fail('stopped_update_certificate_changed');
  c.actor = a;
  // This durable intent precedes both update-specific gates. Its original
  // actor and role bytes remain attributable after an operator crash.
  plain(path.dirname(c.directory), true); fs.mkdirSync(c.directory); plain(c.directory, true);
  const gates = c.lease ? [...leases.ownedLeaseGates(c.lease).values()] : ['install', 'broker'].map(role => seal(c, 'update-lease-gate', { actor: a, role, nonce: crypto.randomUUID() }));
  const intent = { source, stopId, actor: a, oldDescriptor: plan.previousDescriptor.toString('base64'), newDescriptor: Buffer.from(canonical(c.next)).toString('base64'), fingerprint, facts: c.facts, gates: gates.map(b => b.toString('base64')), externalLease: !!c.lease, payload: installer.preparedInstallPayload(plan) };
  c.intent = info(atomic(path.join(c.directory, 'intent.json'), seal(c, 'update-intent', intent)));
  const cap = Object.freeze({});
  try {
    if (!c.lease) { leasePermits.set(cap, { scope: scope(old, descriptorPath), nonce: a.bootId, gates }); c.lease = leases.acquireStoppedUpdateLease(cap); }
    leases.assertInstallLease(c.lease, scope(old, descriptorPath), { full: true }); certificateCheck(c);
    c.fingerprint = installer.prepareInstallPlan(plan, { lease: c.lease });
    // The plan digest is fixed before writing; durable preparation adds only its
    // evidence hash. The sealed ready record binds that hash before switching.
    if (c.fingerprint.preparedPlanHash !== fingerprint.preparedPlanHash) fail('stopped_update_plan_changed');
    c.leaseRecord = info(atomic(path.join(c.directory, 'lease.json'), seal(c, 'update-lease', { actor: a, intentHash: c.intent.hash, facts: leases.maintenanceLeaseFacts(c.lease), fingerprint: c.fingerprint })));
    const permit = Object.freeze({}); permits.set(permit, c); return Object.freeze({ permit, lease: c.lease, transactionId: plan.transactionId });
  } catch (e) { if (c.lease) leases.retainInstallLease(c.lease); e.leaseRetained = true; e.transactionId = plan.transactionId; throw e; }
  finally { leasePermits.delete(cap); }
}
function prepareStoppedUpdate(options) { return prepare(options, 'owner'); }
function prepareLegacyStoppedUpdate(options) { return prepare(options, 'legacy'); }
function switchViews(c, p) {
  return { cep: tree(p.cepDir), backup: tree(p.backupCep), cepStage: tree(p.cepStage), descriptor: info(read(p.descriptorPath)), descriptorStage: info(read(p.descriptorPath + '.next')), client: info(read(p.clientPath)), clientStage: info(read(p.clientPath + '.next')), config: info(read(p.configPath)), configStage: info(read(p.configPath + '.core4-next')) };
}
function stoppedUpdateSwitchReady(permit, { plan, lease, txnFile, cepStage, backupCep }) {
  assertStoppedUpdatePermit(permit, { plan, lease }); const c = permits.get(permit);
  const paths = { descriptorPath: plan.descriptorPath, clientPath: plan.clientBinding.clientDescriptorPath, configPath: plan.configPath, cepDir: plan.cepDir, cepStage, backupCep, txnFile };
  const views = switchViews(c, paths), prepared = path.join(plan.descriptor.installRoot, 'transactions', plan.transactionId + '-prepared');
  if (!views.cep || views.backup || !views.cepStage || !views.descriptorStage.stat || !views.clientStage.stat || !views.configStage.stat) fail('stopped_update_switch_staging');
  const ready = { actor: c.actor, intentHash: c.intent.hash, leaseHash: c.leaseRecord.hash, fingerprint: c.fingerprint, paths, views, transaction: info(read(txnFile)), prepared: tree(prepared) };
  checkStop(c); c.ready = info(atomic(path.join(c.directory, 'switch-ready.json'), seal(c, 'update-switch-ready', ready)));
  checkStop(c); c.switched = true;
}
function appliedViews(c, ready) {
  const p = ready.paths;
  if (!sameFact(read(p.txnFile), ready.transaction) || !sameTree(tree(path.join(c.old.installRoot, 'transactions', c.binding.transactionId + '-prepared')), ready.prepared)) fail('stopped_update_prepared_changed');
  const v = switchViews(c, p), s = ready.views, candidates = [];
  for (let phase = 0; phase <= 5; phase++) {
    const cep = phase === 0 ? sameTree(v.cep, s.cep) && v.backup === null && sameTree(v.cepStage, s.cepStage) : phase === 1 ? v.cep === null && sameTree(v.backup, s.cep, true) && sameTree(v.cepStage, s.cepStage) : sameTree(v.cep, s.cepStage, true) && sameTree(v.backup, s.cep, true) && v.cepStage === null;
    const file = (key, at) => phase < at ? sameFact(v[key], s[key]) && sameFact(v[key + 'Stage'], s[key + 'Stage']) : sameFact(v[key], s[key + 'Stage'], true) && v[key + 'Stage'].hash === null;
    if (cep && file('descriptor', 3) && file('client', 4) && file('config', 5)) candidates.push(phase);
  }
  if (candidates.length !== 1) fail('stopped_update_switch_prefix'); return candidates[0];
}
function fullVerified(c, ready) {
  if (appliedViews(c, ready) !== 5) fail('stopped_update_not_applied');
  const actual = require('../runtime/installation').verifyInstallation(c.descriptorPath);
  if (!equal(actual, c.next)) fail('stopped_update_installation_changed');
  critical(c);
  if (c.facts.snapshot.journal.hash !== null) require('../runtime/native-read-disposition').assertReceiverJournalSettled({ directory: path.join(c.old.stateDir, 'receiver'), descriptorPath: c.descriptorPath, cepDir: c.next.cepDir });
}
function finish(c, ready) {
  endpoint(c.server); leases.assertInstallLease(c.lease, scope(c.old, c.descriptorPath), { full: true }); fullVerified(c, ready);
  const verifiedPath = path.join(c.directory, 'verified.json'), existing = read(verifiedPath);
  let verified = existing;
  if (existing.bytes) { const b = decode(c, existing, 'update-verified'); if (b.readyHash !== c.ready.hash) fail('stopped_update_record'); }
  else { checkStop(c); verified = atomic(verifiedPath, seal(c, 'update-verified', { actor: c.actor, readyHash: c.ready.hash, history: c.facts.snapshot, archive: ready.views.cep })); }
  const barrier = path.join(c.old.stateDir, 'runtime-maintenance.json'), current = critical(c);
  const value = seal(c, 'update-stopped', { stopId: c.stopId, intentHash: c.intent.hash, readyHash: c.ready.hash, verifiedHash: verified.hash, certificateHash: c.facts.certificateHash, history: c.facts.snapshot });
  if (!current.bytes?.equals(value)) {
    checkStop(c); const target = path.join(c.directory, 'update-stopped.json');
    let stage = read(target); if (!stage.bytes) stage = atomic(target, value);
    if (!stage.bytes.equals(value)) fail('stopped_update_barrier_changed');
    // Old barrier is retained as exact bytes/inode evidence. The replacement is
    // atomic; runtime never sees an absent desired-stop barrier.
    const archive = path.join(c.directory, 'original-stop'); let saved = read(archive);
    if (!saved.bytes) { fs.linkSync(barrier, archive); saved = read(archive); }
    if (!sameFact(saved, c.facts.stop, true) || !sameFact(read(barrier), c.facts.stop, true)) fail('stopped_update_stop_changed');
    const fd = fs.openSync(target, 'r');
    try { if (!sameFact(info(read(target)), stage)) fail('stopped_update_changed'); fs.renameSync(target, barrier); if (!sameFact(read(barrier), stage, true) || !equal(stamp(fs.fstatSync(fd, { bigint: true })), read(barrier).stat)) fail('stopped_update_changed'); }
    finally { fs.closeSync(fd); }
  }
  fullVerified(c, ready);
  const completed = path.join(c.directory, 'completed.json'), end = read(completed);
  const completion = seal(c, 'update-completed', { readyHash: c.ready.hash, verifiedHash: verified.hash, barrier: info(read(barrier)), history: c.facts.snapshot });
  if (end.bytes ? !end.bytes.equals(completion) : !atomic(completed, completion).bytes.equals(completion)) fail('stopped_update_completion_changed');
  c.used = true;
  return { updated: true, phase: 'update-stopped', transactionId: c.binding.transactionId, descriptorPath: c.descriptorPath, packageHash: c.next.packageHash, runtimeStarted: false, aeAuthority: false };
}
function applyStoppedUpdate({ plan, lease, permit }) {
  assertStoppedUpdatePermit(permit, { plan, lease }); const c = permits.get(permit);
  try {
    installer.applyInstall(plan, { lease, stoppedPermit: permit });
    const ready = decode(c, read(path.join(c.directory, 'switch-ready.json')), 'update-switch-ready');
    const result = finish(c, ready); leases.releaseInstallLease(lease); c.lease = null; c.gates = new Map(); return result;
  } catch (e) { leases.retainInstallLease(lease); e.leaseRetained = true; e.transactionId = c.binding.transactionId; throw e; }
}
function updateDirectoryFacts(c) {
  const actual = tree(c.directory), allowed = ['intent.json', 'lease.json', 'switch-ready.json', 'verified.json', 'update-stopped.json', 'original-stop', 'completed.json', 'enable-intent.json', 'enable-ready.json', 'update-stop', 'enabled.json'];
  if (!actual) fail('stopped_update_phase');
  for (const name of Object.keys(actual).filter(Boolean)) {
    if (allowed.includes(name) || /^(?:(?:enable-)?recovery-[a-f0-9-]{36}|pre-ready-[a-f0-9-]{36}(?:-lease)?)\.json$/.test(name)) continue;
    const base = name.replace(/\.stage-[a-f0-9-]{36}$/, '');
    if (base === name || !allowed.includes(base) && !/^(?:(?:enable-)?recovery-[a-f0-9-]{36}|pre-ready-[a-f0-9-]{36}(?:-lease)?)\.json$/.test(base)) fail('stopped_update_phase');
    const target = base === 'update-stopped.json' && !actual[base] ? info(read(path.join(c.old.stateDir, 'runtime-maintenance.json'))) : actual[base];
    if (!target || !sameFact(actual[name], target) || !equal(actual[name].stat, target.stat)) fail('stopped_update_phase');
  }
  return actual;
}
function recoveryFacts(c, ready) {
  return { update: updateDirectoryFacts(c), visible: switchViews(c, ready.paths), prepared: tree(path.join(c.old.installRoot, 'transactions', c.binding.transactionId + '-prepared')), transaction: info(read(ready.paths.txnFile)), barrier: info(critical(c)), gates: [path.join(c.old.installRoot, 'install.lock'), path.join(c.old.stateDir, 'broker/broker-owner.gate')].map(f => info(read(f))) };
}
function validatePayload(c, ready) {
  const preparedFile = path.join(c.old.installRoot, 'transactions', c.binding.transactionId + '-prepared', 'prepared.json'), view = read(preparedFile), p = JSON.parse(view.bytes);
  if (view.hash !== ready.fingerprint.preparedStateHash || p.version !== 1 || p.transactionId !== c.binding.transactionId || p.preparedPlanHash !== ready.fingerprint.preparedPlanHash || p.descriptorPath !== c.descriptorPath || p.configPath !== ready.paths.configPath || p.cepDir !== ready.paths.cepDir || !Buffer.from(p.descriptorBytes, 'base64').equals(Buffer.from(canonical(c.next))) || !Buffer.from(p.previousDescriptor, 'base64').equals(c.oldBytes)) fail('stopped_update_prepared_changed');
  verifyPackage(p.package);
  const digest = payloadDigest(p);
  if (digest !== p.preparedPlanHash || p.package.packageHash !== c.next.packageHash || runtimeBinding(p.package.release, f => Buffer.from(p.package.files[f], 'base64')).runtimeModel !== 'owner' || ready.paths.clientPath !== path.join(c.old.installRoot, 'core-client.json') || ready.paths.cepStage !== path.join(c.old.installRoot, 'transactions', p.transactionId + '-cep-next') || ready.paths.backupCep !== path.join(c.old.installRoot, 'transactions', p.transactionId + '-cep') || ready.paths.txnFile !== path.join(c.old.installRoot, 'transactions', p.transactionId + '.json')) fail('stopped_update_prepared_changed');
  const txn = JSON.parse(read(ready.paths.txnFile).bytes);
  if (txn.preparedPlanHash !== p.preparedPlanHash || txn.preparedStateHash !== view.hash || txn.appliedDescriptorHash !== hash(Buffer.from(p.descriptorBytes, 'base64')) || txn.appliedConfigHash !== hash(Buffer.from(p.configBytes, 'base64')) || txn.appliedCepHash !== hash(p.cep) || txn.previousDescriptor !== p.previousDescriptor || txn.previousConfig !== p.previousConfig || txn.previousCepHash !== hash(p.previousCep) || !equal(txn.clientBinding, p.clientBinding)) fail('stopped_update_transaction_changed');
  return p;
}
function payloadDigest(p) {
  return hash({ transactionId: p.transactionId, package: p.package, origin: p.origin, originBytes: p.originBytes, clientBinding: p.clientBinding, nextClient: p.nextClient, descriptor: JSON.parse(Buffer.from(p.descriptorBytes, 'base64')), descriptorPath: p.descriptorPath, configPath: p.configPath, nextConfig: Buffer.from(p.configBytes, 'base64').toString('utf8'), cepDir: p.cepDir, cep: p.cep, previousDescriptor: p.previousDescriptor, previousConfig: p.previousConfig, previousCep: p.previousCep, baseline: p.baseline });
}
function factsExtend(before, after) {
  if (!equal(before.snapshot, after.snapshot) || !equal(before.stop, after.stop) || before.stopHash !== after.stopHash || before.descriptorHash !== after.descriptorHash || !equal(before.phase.directory, after.phase.directory) || !equal(before.lifecycle, after.lifecycle) || !equal(before.markers, after.markers)) fail('stopped_update_certificate_changed');
  for (const [name, fact] of Object.entries(before.phase.tree)) {
    const linkedGate = /^recover-[a-f0-9-]{36}-(install|broker)-(old|new)$/.test(name);
    if (!(linkedGate ? sameFact(after.phase.tree[name], fact, true) : equal(after.phase.tree[name], fact))) fail('stopped_update_certificate_changed');
  }
}
function preparedChain(c, intent) {
  const records = new Map(), children = new Map();
  for (const name of Object.keys(tree(c.directory) || {}).filter(n => /^pre-ready-[a-f0-9-]{36}\.json$/.test(n))) {
    const v = read(path.join(c.directory, name)), b = decode(c, v, 'update-pre-ready-recovery');
    if (!UUID.test(b.attemptId) || name !== 'pre-ready-' + b.attemptId + '.json' || b.parentHash !== null && !HEX.test(b.parentHash) || b.intentHash !== c.intent.hash || b.payloadHash !== hash(canonical(intent.payload)) || children.has(b.parentHash) || !Array.isArray(b.gates) || b.gates.length !== 2 || !Array.isArray(b.leaseFacts) || b.leaseFacts.length !== 2) fail('stopped_update_prepared_chain');
    records.set(v.hash, { ...b, hash: v.hash, stat: v.stat }); children.set(b.parentHash, v.hash);
  }
  if (records.size > 16) fail('stopped_update_budget');
  const chain = []; let next = children.get(null), facts = intent.facts;
  while (next) {
    if (chain.length >= records.size) fail('stopped_update_prepared_chain'); const b = records.get(next); if (!b) fail('stopped_update_prepared_chain');
    factsExtend(facts, b.facts); facts = b.facts; chain.push(b); next = children.get(next);
  }
  if (chain.length !== records.size) fail('stopped_update_prepared_chain'); return chain;
}
function readRecovery(options) {
  const { installation: old, descriptorPath, transactionId, expectedPreviousDescriptorHash, expectedPackageHash, reservedServer } = options;
  endpoint(reservedServer);
  if (!old || old.machineId !== os.hostname() || !UUID.test(transactionId) || !HEX.test(expectedPreviousDescriptorHash) || !HEX.test(expectedPackageHash) || descriptorPath !== path.join(old.installRoot, 'installation.json') || old.stateDir !== path.join(old.installRoot, 'state/production')) fail('stopped_update_recovery_scope');
  const directory = path.join(old.installRoot, 'transactions', transactionId + '-stopped-update'), intentView = read(path.join(directory, 'intent.json'));
  let raw; try { raw = JSON.parse(intentView.bytes).body; } catch { fail('stopped_update_record'); }
  const oldBytes = Buffer.from(raw.oldDescriptor || '', 'base64'), nextBytes = Buffer.from(raw.newDescriptor || '', 'base64');
  let next; try { next = JSON.parse(nextBytes); } catch { fail('stopped_update_record'); }
  if (hash(oldBytes) !== expectedPreviousDescriptorHash || !equal(JSON.parse(oldBytes), old) || !Buffer.from(canonical(next)).equals(nextBytes) || next.packageHash !== expectedPackageHash || next.installationId !== old.installationId || next.machineId !== old.machineId || next.installRoot !== old.installRoot || next.stateDir !== old.stateDir || next.predecessor?.transactionId !== transactionId || next.predecessor?.previousDescriptorHash !== expectedPreviousDescriptorHash || next.cepDir !== old.cepDir) fail('stopped_update_recovery_scope');
  const c = { old, oldBytes, next, descriptorPath, directory, server: reservedServer, binding: binding(old, next, transactionId, oldBytes) };
  const intent = decode(c, intentView, 'update-intent');
  if (!['owner', 'legacy'].includes(intent.source) || !UUID.test(intent.stopId) || !Array.isArray(intent.gates) || intent.gates.length !== 2) fail('stopped_update_record');
  Object.assign(c, { source: intent.source, stopId: intent.stopId, facts: intent.facts, intent: info(intentView), originalActor: intent.actor, actor: intent.actor, gates: new Map() });
  c.preAttempts = preparedChain(c, intent); const pre = c.preAttempts.at(-1);
  if (pre) c.facts = pre.facts;
  if (c.facts.descriptorHash !== expectedPreviousDescriptorHash || c.facts.stopHash !== c.facts.stop?.hash) fail('stopped_update_record');
  const ownerLease = pre && intent.source === 'owner' ? read(path.join(directory, 'pre-ready-' + pre.attemptId + '-lease.json')) : null;
  const leaseView = ownerLease || (pre ? { hash: pre.hash, stat: pre.stat } : read(path.join(directory, 'lease.json'))), leaseRecord = ownerLease ? decode(c, ownerLease, 'update-pre-ready-lease') : pre ? { intentHash: pre.intentHash, actor: pre.actor, facts: pre.leaseFacts, fingerprint: pre.fingerprint } : decode(c, leaseView, 'update-lease');
  if (ownerLease && leaseRecord.attemptHash !== pre.hash) fail('stopped_update_record');
  const effectiveActor = pre?.actor || intent.actor;
  if (leaseRecord.intentHash !== c.intent.hash || !equal(leaseRecord.actor, effectiveActor) || !Array.isArray(leaseRecord.facts) || leaseRecord.facts.length !== 2) fail('stopped_update_record');
  c.leaseRecord = info(leaseView); c.gateFacts = leaseRecord.facts; c.gateBytes = (pre?.gates || intent.gates).map(s => Buffer.from(s, 'base64'));
  const completedView = read(path.join(directory, 'completed.json')), enableView = read(path.join(directory, 'enable-intent.json')), enableReadyView = read(path.join(directory, 'enable-ready.json')), enabledView = read(path.join(directory, 'enabled.json'));
  let enable, enableReady;
  if (enableView.bytes) {
    enable = decode(c, enableView, 'update-enable-intent');
    if (!completedView.bytes || enable.completionHash !== completedView.hash || !Array.isArray(enable.gates) || enable.gates.length !== 2) fail('stopped_update_enable_record');
    c.gateBytes = enable.gates.map(s => Buffer.from(s, 'base64'));
    c.gateBytes.forEach((bytes, i) => { const b = decode(c, { bytes }, 'update-enable-gate'); if (b.role !== ['install', 'broker'][i] || !equal(b.actor, enable.actor) || !UUID.test(b.nonce)) fail('stopped_update_enable_record'); });
    if (enableReadyView.bytes) {
      enableReady = decode(c, enableReadyView, 'update-enable-ready');
      if (enableReady.intentHash !== enableView.hash || !Array.isArray(enableReady.gates) || enableReady.gates.length !== 2 || !equal(enableReady.history, c.facts.snapshot)) fail('stopped_update_enable_record');
      c.gateFacts = enableReady.gates;
    }
    c.enable = { intent: enable, intentView: enableView, ready: enableReady, readyView: enableReadyView, enabledView };
  } else if (enableReadyView.bytes || enabledView.bytes) fail('stopped_update_enable_record');
  const present = [];
  for (const [index, file] of [path.join(old.installRoot, 'install.lock'), path.join(old.stateDir, 'broker/broker-owner.gate')].entries()) {
    const actual = read(file), expected = c.gateFacts[index];
    if (enable && !enableReady) {
      if (actual.bytes && !actual.bytes.equals(c.gateBytes[index])) fail('stopped_update_lease_changed');
      c.gateFacts[index] = { file, hash: hash(c.gateBytes[index]), stat: actual.stat };
    } else if (expected.file !== file || expected.hash !== hash(c.gateBytes[index]) || (actual.bytes ? !sameFact(actual, expected) : enableReady ? !enabledView.bytes : !completedView.bytes)) fail('stopped_update_lease_changed');
    present.push(actual.bytes !== null); if (actual.bytes) c.gates.set(file, c.gateBytes[index]);
  }
  if (!present[0] && present[1]) fail('stopped_update_lease_changed');
  const readyView = read(path.join(directory, 'switch-ready.json')), ready = decode(c, readyView, 'update-switch-ready');
  if (ready.intentHash !== c.intent.hash || ready.leaseHash !== c.leaseRecord.hash || !equal(ready.actor, effectiveActor) || !equal(ready.fingerprint, leaseRecord.fingerprint) || ready.paths.descriptorPath !== descriptorPath) fail('stopped_update_record');
  c.ready = info(readyView); c.fingerprint = ready.fingerprint;
  const release = JSON.parse(read(path.join(old.releaseDir, 'release.json')).bytes);
  if (old.releaseDir !== path.join(old.installRoot, 'releases', old.packageHash) || hash(release) !== old.packageHash || hash(fs.readFileSync(old.nodePath)) !== old.nodeHash) fail('stopped_update_old_release');
  installer.checkRelease(old.releaseDir, release);
  const payload = validatePayload(c, ready), phase = appliedViews(c, ready), barrier = critical(c), completed = completedView;
  if (!equal(payload, intent.payload)) fail('stopped_update_prepared_changed');
  const verifiedView = read(path.join(directory, 'verified.json')); let verified;
  if (verifiedView.bytes) { verified = decode(c, verifiedView, 'update-verified'); if (phase !== 5 || verified.readyHash !== c.ready.hash || !equal(verified.history, c.facts.snapshot) || !sameTree(verified.archive, ready.views.cep)) fail('stopped_update_record'); }
  if (barrier.hash !== c.facts.stopHash) {
    if (!verified) fail('stopped_update_phase');
    const typedBarrier = barrier.bytes ? barrier : enableReady ? read(path.join(directory, 'update-stop')) : null;
    if (!typedBarrier?.bytes) fail('stopped_update_enable_record');
    const b = decode(c, typedBarrier, 'update-stopped');
    if (b.readyHash !== c.ready.hash || b.intentHash !== c.intent.hash || b.verifiedHash !== verifiedView.hash || b.certificateHash !== c.facts.certificateHash || !equal(b.history, c.facts.snapshot)) fail('stopped_update_record');
    if (!sameFact(read(path.join(directory, 'original-stop')), c.facts.stop, true)) fail('stopped_update_stop_changed');
  } else checkStop(c);
  if (completed.bytes) {
    const b = decode(c, completed, 'update-completed');
    const archived = read(path.join(directory, 'update-stop'));
    const barrierMatches = sameFact(barrier, b.barrier) || enableReady && sameFact(archived, b.barrier, true) && (!barrier.bytes || sameFact(barrier, archived));
    if (phase !== 5 || !verified || b.readyHash !== c.ready.hash || b.verifiedHash !== verifiedView.hash || !barrierMatches || !equal(b.history, c.facts.snapshot)) fail('stopped_update_record');
    if (enable && (!equal(enable.barrier, b.barrier) || enableReady && (enableReady.readyHash !== c.ready.hash || !equal(enableReady.barrier, b.barrier)))) fail('stopped_update_enable_record');
    if (enabledView.bytes) { const e = decode(c, enabledView, 'update-enabled'); if (barrier.bytes || !enableReady || e.intentHash !== enableView.hash || e.completionHash !== completed.hash || !equal(e.history, c.facts.snapshot)) fail('stopped_update_enable_record'); }
  }
  const attempts = new Map(), children = new Map();
  for (const name of Object.keys(updateDirectoryFacts(c)).filter(n => /^recovery-/.test(n))) {
    const view = read(path.join(directory, name)), a = decode(c, view, 'update-recovery-attempt');
    if (!UUID.test(a.attemptId) || name !== 'recovery-' + a.attemptId + '.json' || a.parentHash !== null && !HEX.test(a.parentHash) || a.readyHash !== c.ready.hash || !HEX.test(a.proofHash) || children.has(a.parentHash)) fail('stopped_update_recovery_chain');
    attempts.set(view.hash, { ...a, hash: view.hash }); children.set(a.parentHash, view.hash);
  }
  if (attempts.size > 16) fail('stopped_update_budget');
  c.attempts = []; let nextHash = children.get(null);
  while (nextHash) { if (c.attempts.length >= attempts.size) fail('stopped_update_recovery_chain'); const a = attempts.get(nextHash); if (!a) fail('stopped_update_recovery_chain'); c.attempts.push(a); nextHash = children.get(nextHash); }
  if (c.attempts.length !== attempts.size) fail('stopped_update_recovery_chain');
  c.present = present;
  c.enableAttempts = [];
  const enableAttempts = new Map(), enableChildren = new Map();
  for (const name of Object.keys(updateDirectoryFacts(c)).filter(n => /^enable-recovery-[a-f0-9-]{36}\.json$/.test(n))) {
    const v = read(path.join(directory, name)), b = decode(c, v, 'update-enable-recovery');
    if (!enable || !UUID.test(b.attemptId) || name !== 'enable-recovery-' + b.attemptId + '.json' || b.intentHash !== enableView.hash || b.parentHash !== null && !HEX.test(b.parentHash) || !HEX.test(b.proofHash) || enableChildren.has(b.parentHash)) fail('stopped_update_enable_record');
    enableAttempts.set(v.hash, { ...b, hash: v.hash }); enableChildren.set(b.parentHash, v.hash);
  }
  if (enableAttempts.size > 16) fail('stopped_update_budget');
  let enableNext = enableChildren.get(null);
  while (enableNext) { if (c.enableAttempts.length >= enableAttempts.size) fail('stopped_update_enable_record'); const a = enableAttempts.get(enableNext); if (!a) fail('stopped_update_enable_record'); c.enableAttempts.push(a); enableNext = enableChildren.get(enableNext); }
  if (c.enableAttempts.length !== enableAttempts.size) fail('stopped_update_enable_record');
  const facts = recoveryFacts(c, ready);
  return { c, ready, payload, facts, phase, proofHash: hash({ binding: c.binding, facts }) };
}
async function inspectedRecovery(options) {
  const first = readRecovery(options); await dead(first.c.originalActor);
  for (const a of first.c.attempts) await dead(a.actor);
  for (const a of first.c.preAttempts) await dead(a.actor);
  if (first.c.enable) await dead(first.c.enable.intent.actor);
  for (const a of first.c.enableAttempts) await dead(a.actor);
  const again = readRecovery(options); if (!equal(first.facts, again.facts)) fail('stopped_update_proof_changed'); return again;
}
async function inspectStoppedUpdate(options) {
  const r = await inspectedRecovery(options);
  return Object.freeze({ transactionId: r.c.binding.transactionId, phase: r.c.enable ? r.c.enable.enabledView.bytes ? 'enabled' : 'enable-pending' : r.phase === 5 && read(path.join(r.c.directory, 'completed.json')).bytes ? 'update-stopped' : 'switch-pending', switchIndex: r.phase, proofHash: r.proofHash, stopped: !r.c.enable?.enabledView.bytes, inspectionOnly: true, runtimeStarted: false, aeAuthority: false });
}
function recoveryPermit(capability) { const p = recoveries.get(capability); if (!p) fail('stopped_update_recovery_brand'); return p; }
function renameRecovery(capability, from, to, expected, directory = false) {
  const p = recoveryPermit(capability), c = p.c;
  if (!equal(recoveryFacts(c, p.ready), p.facts)) fail('stopped_update_proof_changed');
  checkStop(c); leases.assertInstallLease(c.lease, scope(c.old, c.descriptorPath), { full: true });
  if (directory) {
    if (!sameTree(tree(from), expected)) fail('stopped_update_staging_changed');
    const named = fs.lstatSync(from, { bigint: true }); fs.renameSync(from, to);
    if (!sameTree(tree(to), expected, true) || String(fs.lstatSync(to, { bigint: true }).ino) !== String(named.ino)) fail('stopped_update_staging_changed');
  } else {
    const fd = fs.openSync(from, 'r');
    try {
      if (!sameFact(read(from), expected) || !equal(stamp(fs.fstatSync(fd, { bigint: true })), expected.stat)) fail('stopped_update_staging_changed');
      fs.renameSync(from, to);
      if (!sameFact(read(to), expected, true) || !equal(stamp(fs.fstatSync(fd, { bigint: true })), read(to).stat)) fail('stopped_update_staging_changed');
    } finally { fs.closeSync(fd); }
  }
  // Only the one recognized next prefix is accepted, never a new baseline.
  if (appliedViews(c, p.ready) !== p.phase + 1) fail('stopped_update_switch_prefix');
  const next = recoveryFacts(c, p.ready), expectedNext = { ...p.facts, visible: next.visible };
  if (!equal(next, expectedNext)) fail('stopped_update_proof_changed');
  p.phase++; p.facts = expectedNext;
}
async function finishStoppedUpdate(options) {
  if (!HEX.test(options.expectedProofHash)) fail('stopped_update_expected_proof');
  const r = await inspectedRecovery(options); if (r.proofHash !== options.expectedProofHash) fail('stopped_update_proof_changed');
  if (r.c.enable) fail('stopped_update_enable_pending');
  const a = await actor(r.c.old), current = readRecovery(options);
  if (!equal(r.facts, current.facts)) fail('stopped_update_proof_changed');
  const { c, ready } = current, cap = Object.freeze({});
  if (c.attempts.length >= 16) fail('stopped_update_budget');
  const attemptId = crypto.randomUUID();
  atomic(path.join(c.directory, 'recovery-' + attemptId + '.json'), seal(c, 'update-recovery-attempt', { attemptId, parentHash: c.attempts.at(-1)?.hash || null, actor: a, readyHash: c.ready.hash, proofHash: current.proofHash }));
  if (!c.present.every(Boolean)) {
    // Completion was durable before release. Only the recorded broker-first
    // deletion prefix remains; absence cannot authorize another visible switch.
    if (!read(path.join(c.directory, 'completed.json')).bytes) fail('stopped_update_phase');
    leasePermits.set(cap, { scope: scope(c.old, c.descriptorPath), nonce: a.bootId, gates: c.gateBytes, recovery: true, releaseOnly: true, facts: c.gateFacts });
    try {
      c.lease = leases.acquireStoppedUpdateLease(cap); fullVerified(c, ready); leases.releaseInstallLease(c.lease);
      return { updated: true, recovered: true, phase: 'update-stopped', transactionId: c.binding.transactionId, packageHash: c.next.packageHash, runtimeStarted: false, aeAuthority: false };
    } catch (error) { if (c.lease) leases.retainInstallLease(c.lease); error.leaseRetained = true; throw error; }
    finally { leasePermits.delete(cap); }
  }
  leasePermits.set(cap, { scope: scope(c.old, c.descriptorPath), nonce: a.bootId, gates: c.gateBytes, recovery: true, facts: c.gateFacts });
  try {
    c.lease = leases.acquireStoppedUpdateLease(cap); c.actor = a;
    recoveries.set(cap, { ...current, c, facts: recoveryFacts(c, ready) });
    const p = recoveryPermit(cap), s = ready.views, paths = ready.paths;
    if (p.phase === 0) renameRecovery(cap, paths.cepDir, paths.backupCep, s.cep, true);
    if (p.phase === 1) renameRecovery(cap, paths.cepStage, paths.cepDir, s.cepStage, true);
    if (p.phase === 2) renameRecovery(cap, paths.descriptorPath + '.next', paths.descriptorPath, s.descriptorStage);
    if (p.phase === 3) renameRecovery(cap, paths.clientPath + '.next', paths.clientPath, s.clientStage);
    if (p.phase === 4) renameRecovery(cap, paths.configPath + '.core4-next', paths.configPath, s.configStage);
    const result = finish(c, ready); leases.releaseInstallLease(c.lease); return { ...result, recovered: true };
  } catch (error) { if (c.lease) leases.retainInstallLease(c.lease); error.leaseRetained = true; throw error; }
  finally { leasePermits.delete(cap); recoveries.delete(cap); }
}
async function enableStoppedUpdate(options) {
  let c, ready;
  if (options.permit) {
    c = permits.get(options.permit);
    if (!c || !c.used || c.enabled || c.lease) fail('stopped_update_enable_brand');
    ready = decode(c, read(path.join(c.directory, 'switch-ready.json')), 'update-switch-ready');
  } else {
    if (!HEX.test(options.expectedProofHash)) fail('stopped_update_expected_proof');
    const r = await inspectedRecovery(options);
    if (r.c.enable) fail('stopped_update_enable_pending');
    if (r.proofHash !== options.expectedProofHash || r.c.present.some(Boolean)) fail('stopped_update_enable_proof');
    c = r.c; ready = r.ready;
  }
  endpoint(c.server); fullVerified(c, ready);
  const completion = read(path.join(c.directory, 'completed.json')), completed = decode(c, completion, 'update-completed'), barrier = path.join(c.old.stateDir, 'runtime-maintenance.json');
  if (!sameFact(read(barrier), completed.barrier) || completed.readyHash !== c.ready.hash || read(path.join(c.directory, 'enable-intent.json')).bytes) fail('stopped_update_enable_pending');
  const before = recoveryFacts(c, ready), a = await actor(c.next);
  if (!equal(recoveryFacts(c, ready), before)) fail('stopped_update_proof_changed');
  const gates = ['install', 'broker'].map(role => seal(c, 'update-enable-gate', { actor: a, role, nonce: crypto.randomUUID() })), cap = Object.freeze({});
  const intent = atomic(path.join(c.directory, 'enable-intent.json'), seal(c, 'update-enable-intent', { actor: a, completionHash: completion.hash, barrier: completed.barrier, gates: gates.map(b => b.toString('base64')) }));
  leasePermits.set(cap, { scope: scope(c.old, c.descriptorPath), nonce: a.bootId, gates });
  try {
    c.lease = leases.acquireStoppedUpdateLease(cap);
    return completeEnable(c, ready, { actor: a, intent, completion, completed });
  } catch (error) { if (c.lease) leases.retainInstallLease(c.lease); error.leaseRetained = true; throw error; }
  finally { leasePermits.delete(cap); }
}
function completeEnable(c, ready, e) {
  fullVerified(c, ready);
  const barrier = path.join(c.old.stateDir, 'runtime-maintenance.json'), savedPath = path.join(c.directory, 'update-stop'), enabledPath = path.join(c.directory, 'enabled.json');
  const readyPath = path.join(c.directory, 'enable-ready.json'); let readyView = read(readyPath);
  if (!readyView.bytes) {
    if (!sameFact(read(barrier), e.completed.barrier)) fail('stopped_update_stop_changed');
    readyView = atomic(readyPath, seal(c, 'update-enable-ready', { actor: e.actor, intentHash: e.intent.hash, barrier: e.completed.barrier, gates: leases.maintenanceLeaseFacts(c.lease), readyHash: c.ready.hash, history: c.facts.snapshot }));
  } else {
    const b = decode(c, readyView, 'update-enable-ready');
    if (b.intentHash !== e.intent.hash || b.readyHash !== c.ready.hash || !equal(b.history, c.facts.snapshot) || !equal(b.barrier, e.completed.barrier)) fail('stopped_update_enable_record');
  }
  let current = read(barrier), saved = read(savedPath);
  if (current.bytes) {
    leases.assertInstallLease(c.lease, scope(c.old, c.descriptorPath), { full: true });
    if (!saved.bytes) { if (!sameFact(current, e.completed.barrier)) fail('stopped_update_stop_changed'); fs.linkSync(barrier, savedPath); saved = read(savedPath); current = read(barrier); }
    if (!sameFact(saved, e.completed.barrier, true) || !sameFact(current, e.completed.barrier, true) || !equal(saved.stat, current.stat)) fail('stopped_update_stop_changed');
    // Full verification and both private gates precede the sole explicit unlink.
    fullVerified(c, ready); leases.assertInstallLease(c.lease, scope(c.old, c.descriptorPath), { full: true }); fs.unlinkSync(barrier);
    if (read(barrier).bytes !== null) fail('stopped_update_stop_changed');
  } else if (!sameFact(saved, e.completed.barrier, true)) fail('stopped_update_stop_changed');
  const done = read(enabledPath);
  if (!done.bytes) atomic(enabledPath, seal(c, 'update-enabled', { actor: e.actor, intentHash: e.intent.hash, completionHash: e.completion.hash, history: c.facts.snapshot }));
  else { const b = decode(c, done, 'update-enabled'); if (b.intentHash !== e.intent.hash || b.completionHash !== e.completion.hash || !equal(b.history, c.facts.snapshot)) fail('stopped_update_enable_record'); }
  fullVerified(c, ready); leases.releaseInstallLease(c.lease); c.lease = null; c.enabled = true;
  return { enabled: true, sameDescriptor: true, transactionId: c.binding.transactionId, packageHash: c.next.packageHash, runtimeStarted: false, aeAuthority: false };
}
async function finishEnableStoppedUpdate(options) {
  if (!HEX.test(options.expectedProofHash)) fail('stopped_update_expected_proof');
  const r = await inspectedRecovery(options);
  if (!r.c.enable || r.proofHash !== options.expectedProofHash) fail('stopped_update_enable_proof');
  const a = await actor(r.c.next), now = readRecovery(options);
  if (!equal(now.facts, r.facts)) fail('stopped_update_proof_changed');
  const { c, ready } = now, e = c.enable;
  if (c.enableAttempts.length >= 16) fail('stopped_update_budget');
  const attemptId = crypto.randomUUID();
  atomic(path.join(c.directory, 'enable-recovery-' + attemptId + '.json'), seal(c, 'update-enable-recovery', { attemptId, parentHash: c.enableAttempts.at(-1)?.hash || null, actor: a, intentHash: e.intentView.hash, proofHash: now.proofHash }));
  const cap = Object.freeze({});
  leasePermits.set(cap, { scope: scope(c.old, c.descriptorPath), nonce: a.bootId, gates: c.gateBytes, recovery: true, recoverMissing: !e.ready, releaseOnly: !!e.enabledView.bytes, facts: c.gateFacts });
  try {
    c.lease = leases.acquireStoppedUpdateLease(cap);
    return { ...completeEnable(c, ready, { actor: a, intent: e.intentView, completion: read(path.join(c.directory, 'completed.json')), completed: decode(c, read(path.join(c.directory, 'completed.json')), 'update-completed') }), recovered: true };
  } catch (error) { if (c.lease) leases.retainInstallLease(c.lease); error.leaseRetained = true; throw error; }
  finally { leasePermits.delete(cap); }
}
function checkPreparedRecovery(c) {
  const p = c.source === 'owner' ? assertOwnerPreparedSource(c.sourceCapability) : require('./legacy-owner-migration').assertLegacyPreparedRecovery(c.sourceCapability);
  if (p.lease !== c.lease || p.installation !== c.old || p.descriptorPath !== c.descriptorPath || p.id !== c.stopId || !equal(p.facts, c.facts) || hash(canonical(p.payload)) !== c.payloadHash || p.reservedServer !== c.server) fail('stopped_update_prepared_brand');
  endpoint(c.server); leases.assertInstallLease(c.lease, scope(c.old, c.descriptorPath), { full: true }); checkStop(c);
  const pld = c.payload;
  if (!sameFact(read(c.descriptorPath), c.facts.snapshot.descriptor) || !sameFact(read(path.join(c.old.installRoot, 'core-client.json')), c.facts.snapshot.client) || read(pld.configPath).hash !== pld.baseline.config || hash(installer.snapshot(pld.cepDir)) !== pld.baseline.cep) fail('stopped_update_baseline_changed');
}
function preparedRecoveryContext(p, source, sourceCapability) {
  const payload = structuredClone(p.payload);
  verifyPackage(payload.package);
  const oldBytes = Buffer.from(payload.previousDescriptor || '', 'base64'), old = p.installation, next = JSON.parse(Buffer.from(payload.descriptorBytes, 'base64'));
  if (!Buffer.from(canonical(next)).equals(Buffer.from(payload.descriptorBytes, 'base64'))) fail('stopped_update_prepared_payload');
  if (!old || old.machineId !== os.hostname() || !UUID.test(payload.transactionId) || payload.version !== 1 || !equal(JSON.parse(oldBytes), old) || p.descriptorPath !== path.join(old.installRoot, 'installation.json') || payload.descriptorPath !== p.descriptorPath || next.installRoot !== old.installRoot || next.stateDir !== old.stateDir || next.installationId !== old.installationId || next.machineId !== old.machineId || next.releaseDir !== path.join(old.installRoot, 'releases', payload.package.packageHash) || next.packageHash !== payload.package.packageHash || next.cepDir !== payload.cepDir || next.cepDir !== old.cepDir || next.predecessor?.transactionId !== payload.transactionId || next.predecessor?.previousDescriptorHash !== hash(oldBytes) || payloadDigest(payload) !== payload.preparedPlanHash || runtimeBinding(payload.package.release, f => Buffer.from(payload.package.files[f], 'base64')).runtimeModel !== 'owner' || !payload.nextClient || payload.clientBinding.clientDescriptorPath !== path.join(old.installRoot, 'core-client.json') || p.facts.descriptorHash !== hash(oldBytes)) fail('stopped_update_prepared_payload');
  const c = { source, sourceCapability, old, oldBytes, next, descriptorPath: p.descriptorPath, stopId: p.id, facts: structuredClone(p.facts), server: p.reservedServer, lease: p.lease, payload, payloadHash: hash(canonical(payload)), binding: binding(old, next, payload.transactionId, oldBytes), directory: path.join(old.installRoot, 'transactions', payload.transactionId + '-stopped-update') };
  const runtime = runtimeBinding(payload.package.release, f => Buffer.from(payload.package.files[f], 'base64')), stdio = require('../runtime/stdio-entry');
  const expectedCep = Object.fromEntries(Object.entries(payload.package.files).filter(([file]) => file.startsWith('cep/')).map(([file, value]) => [file.slice(4), value]));
  expectedCep['installation.js'] = Buffer.from('window.Core4Installation=' + canonical(stdio.installationConfig(next, stdio.deriveComposition(payload.package.release, f => Buffer.from(payload.package.files[f], 'base64')))) + ';\n').toString('base64');
  const expectedClient = require('../runtime/client-entry').projectClientDescriptor(next, { originBytes: Buffer.from(payload.originBytes, 'base64') });
  if (!equal(payload.cep, expectedCep) || !Buffer.from(payload.nextClient, 'base64').equals(Buffer.from(canonical(expectedClient))) || !path.isAbsolute(payload.configPath) || path.resolve(payload.configPath) !== payload.configPath || !Buffer.from(payload.configBytes, 'base64').equals(Buffer.from(installer.configText(payload.previousConfig ? Buffer.from(payload.previousConfig, 'base64') : null, payload.clientBinding.clientDescriptorPath, next.nodePath, path.join(next.releaseDir, runtime.clientEntry), runtime.clientArgument))) || payload.baseline.descriptor !== hash(oldBytes) || payload.baseline.config !== (payload.previousConfig ? hash(Buffer.from(payload.previousConfig, 'base64')) : null) || payload.baseline.cep !== hash(payload.previousCep)) fail('stopped_update_prepared_payload');
  plain(old.installRoot, true); plain(path.dirname(next.cepDir), true);
  if (fs.lstatSync(old.installRoot, { bigint: true }).dev !== fs.lstatSync(path.dirname(next.cepDir), { bigint: true }).dev) fail('install_cross_volume_unsupported');
  return c;
}
async function createLegacyStoppedRecovery(sourceCapability) {
  const p = require('./legacy-owner-migration').assertLegacyPreparedRecovery(sourceCapability), c = preparedRecoveryContext(p, 'legacy', sourceCapability), { payload, old, oldBytes, next } = c;
  checkPreparedRecovery(c); let a = await actor(old); checkPreparedRecovery(c); c.actor = a;
  const fingerprint = { transactionId: payload.transactionId, packageHash: next.packageHash, appliedDescriptorHash: hash(Buffer.from(payload.descriptorBytes, 'base64')), previousDescriptorHash: hash(oldBytes), preparedPlanHash: payload.preparedPlanHash, preparedStateHash: c.payloadHash };
  c.fingerprint = fingerprint;
  try {
  if (!plain(c.directory, true, true)) fs.mkdirSync(c.directory);
  const gates = [...leases.ownedLeaseGates(c.lease).values()], existing = read(path.join(c.directory, 'intent.json'));
  if (!existing.bytes) {
    c.intent = info(atomic(path.join(c.directory, 'intent.json'), seal(c, 'update-intent', { source: 'legacy', stopId: c.stopId, actor: a, oldDescriptor: oldBytes.toString('base64'), newDescriptor: payload.descriptorBytes, fingerprint, facts: c.facts, gates: gates.map(b => b.toString('base64')), externalLease: true, payload })));
    c.leaseRecord = info(atomic(path.join(c.directory, 'lease.json'), seal(c, 'update-lease', { actor: a, intentHash: c.intent.hash, facts: leases.maintenanceLeaseFacts(c.lease), fingerprint })));
  } else {
    c.intent = info(existing); const intent = decode(c, existing, 'update-intent');
    if (intent.source !== 'legacy' || intent.stopId !== c.stopId || !equal(intent.payload, payload) || read(path.join(c.directory, 'switch-ready.json')).bytes) fail('stopped_update_prepared_phase');
    const chain = preparedChain(c, intent); factsExtend(chain.at(-1)?.facts || intent.facts, c.facts);
    if (chain.length >= 16) fail('stopped_update_budget');
    const previousTree = tree(c.directory);
    await dead(intent.actor); for (const previous of chain) await dead(previous.actor);
    a = await actor(old); c.actor = a; checkPreparedRecovery(c);
    if (!equal(tree(c.directory), previousTree)) fail('stopped_update_proof_changed');
    // Only the opaque legacy recovery port has admitted the old/new phase
    // extension and gate takeover. Retain every original record unchanged.
    const attemptId = crypto.randomUUID();
    c.leaseRecord = info(atomic(path.join(c.directory, 'pre-ready-' + attemptId + '.json'), seal(c, 'update-pre-ready-recovery', { attemptId, parentHash: chain.at(-1)?.hash || null, intentHash: c.intent.hash, actor: a, payloadHash: c.payloadHash, facts: c.facts, gates: gates.map(b => b.toString('base64')), leaseFacts: leases.maintenanceLeaseFacts(c.lease), fingerprint })));
  }
  updateDirectoryFacts(c);
  const capability = Object.freeze({}); preparedRecoveries.set(capability, c); return capability;
  } catch (error) { leases.retainInstallLease(c.lease); error.leaseRetained = true; throw error; }
}
function ownerPreparedCertificatePermit(capability) {
  const p = ownerCertificatePermits.get(capability); if (!p) fail('stopped_update_prepared_brand'); return p;
}
function ownerCertificate(c) {
  const cap = Object.freeze({});
  ownerCertificatePermits.set(cap, { installation: c.old, descriptorPath: c.descriptorPath, reservedServer: c.server, id: c.stopId, expectedFacts: c.facts, owned: c.gates });
  try { return require('../runtime/stopped-certification').readStoppedUpdateCertificate(cap); }
  finally { ownerCertificatePermits.delete(cap); }
}
function exactKeys(value, keys) {
  if (!value || !equal(Object.keys(value).sort(), [...keys].sort())) fail('stopped_update_record');
}
function ownerAttemptId(parentHash) {
  // One exclusive publication name per parent serializes competing actors.
  const h = hash('ae-core4/owner-pre-ready/claim/v1\0' + parentHash);
  return h.slice(0, 8) + '-' + h.slice(8, 12) + '-4' + h.slice(13, 16) + '-8' + h.slice(17, 20) + '-' + h.slice(20, 32);
}
function ownerPaths(c) {
  const p = c.payload, root = c.old.installRoot, id = p.transactionId;
  return { descriptorPath: c.descriptorPath, clientPath: p.clientBinding.clientDescriptorPath, configPath: p.configPath, cepDir: p.cepDir, cepStage: path.join(root, 'transactions', id + '-cep-next'), backupCep: path.join(root, 'transactions', id + '-cep'), txnFile: path.join(root, 'transactions', id + '.json') };
}
function preparedTransaction(c, paths) {
  const p = c.payload, d = c.next;
  return { version: 2, transactionId: p.transactionId, preparedPlanHash: p.preparedPlanHash, preparedStateHash: c.payloadHash, clientBinding: p.clientBinding, originBinding: { version: 1, rootOriginHash: hash(Buffer.from(p.originBytes, 'base64')), anchorOriginHash: hash(Buffer.from(p.originBytes, 'base64')) }, installRoot: d.installRoot, descriptorPath: c.descriptorPath, configPath: p.configPath, cepDir: p.cepDir, backupCep: paths.backupCep, previousDescriptor: p.previousDescriptor, previousConfig: p.previousConfig, previousCepHash: hash(p.previousCep), appliedDescriptorHash: hash(Buffer.from(p.descriptorBytes, 'base64')), appliedConfigHash: hash(Buffer.from(p.configBytes, 'base64')), appliedCepHash: hash(p.cep), stateDir: d.stateDir };
}
function ownerStaging(c) {
  const p = c.payload, paths = ownerPaths(c), prepared = path.join(c.old.installRoot, 'transactions', p.transactionId + '-prepared');
  if (plain(paths.backupCep, true, true)) fail('stopped_update_prepared_phase');
  const encoded = value => Buffer.from(value).toString('base64');
  const expectedPrepared = { 'prepared.json': encoded(canonical(p)), 'descriptor.json': p.descriptorBytes, 'client.json': p.nextClient };
  assertCepStageSubset(prepared, expectedPrepared); assertCepStageSubset(paths.cepStage, p.cep);
  assertCepStageSubset(c.next.releaseDir, { ...p.package.files, 'release.json': encoded(canonical(p.package.release)) });
  for (const [file, bytes] of [[c.descriptorPath + '.next', p.descriptorBytes], [paths.clientPath + '.next', p.nextClient], [p.configPath + '.core4-next', p.configBytes], [paths.txnFile, encoded(canonical(preparedTransaction(c, paths)))]]) {
    const v = read(file); if (v.bytes && !v.bytes.equals(Buffer.from(bytes, 'base64'))) fail('stopped_update_staging_changed');
  }
  if (!sameFact(read(c.descriptorPath), c.facts.snapshot.descriptor) || !sameFact(read(paths.clientPath), c.facts.snapshot.client) || read(p.configPath).hash !== p.baseline.config || hash(installer.snapshot(p.cepDir)) !== p.baseline.cep) fail('stopped_update_baseline_changed');
  return { visible: switchViews(c, paths), prepared: tree(prepared), transaction: info(read(paths.txnFile)), release: tree(c.next.releaseDir) };
}
function readOwnerPreReady(options) {
  const { installation: old, descriptorPath, transactionId, expectedPreviousDescriptorHash, expectedPackageHash, reservedServer } = options;
  endpoint(reservedServer);
  if (!old || old.machineId !== os.hostname() || !UUID.test(transactionId) || !HEX.test(expectedPreviousDescriptorHash) || !HEX.test(expectedPackageHash) || descriptorPath !== path.join(old.installRoot, 'installation.json') || old.stateDir !== path.join(old.installRoot, 'state/production')) fail('stopped_update_recovery_scope');
  const directory = path.join(old.installRoot, 'transactions', transactionId + '-stopped-update'), v = read(path.join(directory, 'intent.json'));
  let raw; try { raw = JSON.parse(v.bytes).body; } catch { fail('stopped_update_record'); }
  const c = preparedRecoveryContext({ installation: old, descriptorPath, id: raw.stopId, facts: raw.facts, reservedServer, payload: raw.payload, lease: null }, 'owner', null);
  if (c.directory !== directory || hash(c.oldBytes) !== expectedPreviousDescriptorHash || c.next.packageHash !== expectedPackageHash || c.next.packageHash === old.packageHash || raw.oldDescriptor !== c.payload.previousDescriptor || raw.newDescriptor !== c.payload.descriptorBytes) fail('stopped_update_recovery_scope');
  const intent = decode(c, v, 'update-intent');
  exactKeys(intent, [...Object.keys(c.binding), 'kind', 'source', 'stopId', 'actor', 'oldDescriptor', 'newDescriptor', 'fingerprint', 'facts', 'gates', 'externalLease', 'payload']);
  exactKeys(c.payload, ['version', 'transactionId', 'preparedPlanHash', 'package', 'origin', 'originBytes', 'clientBinding', 'nextClient', 'descriptorBytes', 'descriptorPath', 'configPath', 'configBytes', 'cepDir', 'cep', 'previousDescriptor', 'previousConfig', 'previousCep', 'baseline']);
  if (intent.source !== 'owner' || intent.externalLease !== false || !UUID.test(intent.stopId) || !Array.isArray(intent.gates) || intent.gates.length !== 2 || read(path.join(directory, 'switch-ready.json')).bytes) fail('stopped_update_prepared_phase');
  c.intent = info(v); c.originalActor = intent.actor;
  c.fingerprint = { transactionId, packageHash: c.next.packageHash, appliedDescriptorHash: hash(Buffer.from(c.payload.descriptorBytes, 'base64')), previousDescriptorHash: hash(c.oldBytes), preparedPlanHash: c.payload.preparedPlanHash, preparedStateHash: c.payloadHash };
  if (!equal(intent.fingerprint, { ...c.fingerprint, preparedStateHash: null })) fail('stopped_update_record');
  c.gateBytes = intent.gates.map(s => { const b = Buffer.from(s, 'base64'); if (b.toString('base64') !== s) fail('stopped_update_record'); return b; });
  c.gateBytes.forEach((bytes, index) => { const b = decode(c, { bytes }, 'update-lease-gate'); exactKeys(b, [...Object.keys(c.binding), 'kind', 'actor', 'role', 'nonce']); if (b.role !== ['install', 'broker'][index] || !equal(b.actor, intent.actor) || !UUID.test(b.nonce)) fail('stopped_update_record'); });
  c.preAttempts = preparedChain(c, intent);
  let expected = null;
  const lease = read(path.join(directory, 'lease.json'));
  if (lease.bytes) { const b = decode(c, lease, 'update-lease'); if (b.intentHash !== v.hash || !equal(b.actor, intent.actor) || !equal(b.fingerprint, c.fingerprint)) fail('stopped_update_record'); expected = b.facts; }
  const allowed = new Set(['', 'intent.json', ...(lease.bytes ? ['lease.json'] : [])]);
  for (const [index, a] of c.preAttempts.entries()) {
    exactKeys(a, [...Object.keys(c.binding), 'kind', 'attemptId', 'parentHash', 'intentHash', 'actor', 'payloadHash', 'facts', 'gates', 'leaseFacts', 'fingerprint', 'hash', 'stat']);
    if (a.attemptId !== ownerAttemptId(index ? c.preAttempts[index - 1].hash : v.hash) || !equal(a.facts, intent.facts) || !equal(a.gates, intent.gates) || !equal(a.fingerprint, c.fingerprint)) fail('stopped_update_prepared_chain');
    allowed.add('pre-ready-' + a.attemptId + '.json');
    if (expected) for (const [i, fact] of expected.entries()) if (fact.stat && !equal(fact, a.leaseFacts[i])) fail('stopped_update_lease_changed');
    expected = a.leaseFacts;
    const receiptName = 'pre-ready-' + a.attemptId + '-lease.json', receipt = read(path.join(directory, receiptName));
    if (receipt.bytes) {
      const b = decode(c, receipt, 'update-pre-ready-lease');
      exactKeys(b, [...Object.keys(c.binding), 'kind', 'intentHash', 'attemptHash', 'actor', 'facts', 'fingerprint']);
      if (b.intentHash !== v.hash || b.attemptHash !== a.hash || !equal(b.actor, a.actor) || !equal(b.fingerprint, c.fingerprint) || !Array.isArray(b.facts) || b.facts.length !== 2 || b.facts.some(f => !f.stat)) fail('stopped_update_record');
      for (const [i, fact] of expected.entries()) if (fact.stat && !equal(fact, b.facts[i])) fail('stopped_update_lease_changed');
      expected = b.facts; allowed.add(receiptName);
    }
  }
  const update = updateDirectoryFacts(c);
  for (const name of Object.keys(update)) { const base = name.replace(/\.stage-[a-f0-9-]{36}$/, ''); if (!allowed.has(base)) fail('stopped_update_prepared_phase'); }
  c.gates = new Map(); c.gateFacts = [];
  for (const [index, file] of [path.join(old.installRoot, 'install.lock'), path.join(old.stateDir, 'broker/broker-owner.gate')].entries()) {
    const actual = read(file), prior = expected?.[index];
    if (actual.bytes && !actual.bytes.equals(c.gateBytes[index]) || prior && (prior.file !== file || prior.hash !== hash(c.gateBytes[index]) || prior.stat && !sameFact(actual, prior))) fail('stopped_update_lease_changed');
    c.gateFacts.push({ file, hash: hash(c.gateBytes[index]), stat: actual.stat }); if (actual.bytes) c.gates.set(file, c.gateBytes[index]);
  }
  if (!c.gateFacts[0].stat && c.gateFacts[1].stat) fail('stopped_update_lease_changed');
  const certificate = ownerCertificate(c), staging = ownerStaging(c); checkStop(c);
  c.hostAdoption = info(read(path.join(old.stateDir, 'host-adoption.json')));
  const facts = { update, ...staging, hostAdoption: c.hostAdoption, gates: c.gateFacts, certificate: certificate.facts, barrier: info(read(path.join(old.stateDir, 'runtime-maintenance.json'))) };
  return { c, facts, certificateActors: certificate.actors, proofHash: hash({ binding: c.binding, facts }) };
}
async function inspectedOwnerPreReady(options) {
  const first = readOwnerPreReady(options);
  for (const a of [first.c.originalActor, ...first.c.preAttempts.map(a => a.actor), ...first.certificateActors]) {
    await dead(a); const current = readOwnerPreReady(options); if (!equal(current.facts, first.facts)) fail('stopped_update_proof_changed');
  }
  const final = readOwnerPreReady(options); if (!equal(final.facts, first.facts)) fail('stopped_update_proof_changed'); return final;
}
async function inspectOwnerPreReady(options) {
  const r = await inspectedOwnerPreReady(options);
  return Object.freeze({ transactionId: r.c.binding.transactionId, phase: 'owner-pre-ready', proofHash: r.proofHash, gatePrefix: r.c.gateFacts.filter(f => f.stat).length, inspectionOnly: true, runtimeStarted: false, aeAuthority: false });
}
function assertOwnerPreparedSource(capability) {
  const c = ownerPreparedSources.get(capability); if (!c || !c.lease) fail('stopped_update_prepared_brand');
  endpoint(c.server); leases.assertInstallLease(c.lease, scope(c.old, c.descriptorPath), { full: true }); ownerCertificate(c);
  if (!equal(tree(c.directory), c.ownerRecordFacts)) fail('stopped_update_proof_changed');
  if (!sameFact(read(path.join(c.old.stateDir, 'host-adoption.json')), c.hostAdoption)) fail('stopped_update_proof_changed');
  ownerStaging(c);
  return { lease: c.lease, installation: c.old, descriptorPath: c.descriptorPath, id: c.stopId, facts: c.facts, payload: c.payload, reservedServer: c.server };
}
async function finishOwnerPreReady(options) {
  if (!HEX.test(options.expectedProofHash)) fail('stopped_update_expected_proof');
  const r = await inspectedOwnerPreReady(options); if (r.proofHash !== options.expectedProofHash) fail('stopped_update_proof_changed');
  const a = await actor(r.c.old), now = readOwnerPreReady(options);
  if (!equal(now.facts, r.facts)) fail('stopped_update_proof_changed');
  const c = now.c, parentHash = c.preAttempts.at(-1)?.hash || null, attemptId = ownerAttemptId(parentHash || c.intent.hash), cap = Object.freeze({});
  if (c.preAttempts.length >= 16) fail('stopped_update_budget');
  c.actor = a;
  // Before filling even a missing gate, identify the new operator durably.
  // The original role bytes remain unchanged and continuously held once present.
  const attempt = atomic(path.join(c.directory, 'pre-ready-' + attemptId + '.json'), seal(c, 'update-pre-ready-recovery', { attemptId, parentHash, intentHash: c.intent.hash, actor: a, payloadHash: c.payloadHash, facts: c.facts, gates: c.gateBytes.map(b => b.toString('base64')), leaseFacts: c.gateFacts, fingerprint: c.fingerprint }), true);
  try {
    leasePermits.set(cap, { scope: scope(c.old, c.descriptorPath), nonce: a.bootId, gates: c.gateBytes, facts: c.gateFacts, recovery: true, recoverMissing: true });
    c.lease = leases.acquireStoppedUpdateLease(cap); leases.assertInstallLease(c.lease, scope(c.old, c.descriptorPath), { full: true });
    c.gates = leases.ownedLeaseGates(c.lease); ownerCertificate(c); ownerStaging(c); checkStop(c);
    c.leaseRecord = info(atomic(path.join(c.directory, 'pre-ready-' + attemptId + '-lease.json'), seal(c, 'update-pre-ready-lease', { intentHash: c.intent.hash, attemptHash: attempt.hash, actor: a, facts: leases.maintenanceLeaseFacts(c.lease), fingerprint: c.fingerprint })));
    const final = readOwnerPreReady(options);
    for (const key of ['visible', 'prepared', 'transaction', 'release', 'hostAdoption', 'certificate', 'barrier']) if (!equal(final.facts[key], r.facts[key])) fail('stopped_update_proof_changed');
    for (const [name, fact] of Object.entries(r.facts.update).filter(([name]) => name)) if (!equal(final.facts.update[name], fact)) fail('stopped_update_proof_changed');
    c.sourceCapability = cap; c.ownerRecordFacts = final.facts.update; ownerPreparedSources.set(cap, c); preparedRecoveries.set(cap, c);
    return stageStoppedRecovery(cap);
  } catch (error) { if (c.lease) leases.retainInstallLease(c.lease); error.leaseRetained = true; error.transactionId = c.binding.transactionId; throw error; }
  finally { leasePermits.delete(cap); ownerPreparedSources.delete(cap); }
}
function writeExact(file, expected) {
  const bytes = Buffer.isBuffer(expected) ? expected : Buffer.from(expected), current = read(file);
  if (current.bytes) { if (!current.bytes.equals(bytes)) fail('stopped_update_staging_changed'); return; }
  fs.mkdirSync(path.dirname(file), { recursive: true }); plain(path.dirname(file), true); atomic(file, bytes);
}
function assertCepStageSubset(directory, expected) {
  if (!plain(directory, true, true)) return false;
  const files = new Set(Object.keys(expected)), directories = new Set(['']);
  for (const file of files) for (let dir = path.posix.dirname(file); dir !== '.'; dir = path.posix.dirname(dir)) directories.add(dir);
  function visit(dir, relative) {
    plain(dir, true); if (!directories.has(relative)) fail('stopped_update_staging_changed');
    for (const name of fs.readdirSync(dir)) {
      const file = path.join(dir, name), rel = relative ? relative + '/' + name : name, s = fs.lstatSync(file);
      if (s.isSymbolicLink() || s.reparsePoint) fail('stopped_update_staging_changed');
      if (s.isDirectory()) visit(file, rel);
      else if (!s.isFile() || !files.has(rel) || !read(file).bytes?.equals(Buffer.from(expected[rel], 'base64'))) fail('stopped_update_staging_changed');
    }
  }
  visit(directory, ''); return true;
}
function stageStoppedRecovery(capability) {
  const c = preparedRecoveries.get(capability);
  if (!c || c.consumed) fail('stopped_update_prepared_brand'); checkPreparedRecovery(c); c.consumed = true;
  const p = c.payload, d = c.next, id = p.transactionId, prepared = path.join(d.installRoot, 'transactions', id + '-prepared');
  const paths = { descriptorPath: c.descriptorPath, clientPath: p.clientBinding.clientDescriptorPath, configPath: p.configPath, cepDir: p.cepDir, cepStage: path.join(d.installRoot, 'transactions', id + '-cep-next'), backupCep: path.join(d.installRoot, 'transactions', id + '-cep'), txnFile: path.join(d.installRoot, 'transactions', id + '.json') };
  try {
    if (plain(paths.backupCep, true, true)) fail('stopped_update_prepared_phase');
    // A previous operator may have published only a prefix of CEP stage files.
    // Validate the whole existing subset before any fill writes; foreign files,
    // empty directories and modified bytes remain untouched and fenced.
    assertCepStageSubset(paths.cepStage, p.cep);
    if (c.source === 'owner') {
      // Under the stopped gate, this exact target can retain a validated prefix
      // after a crash. No random release stage or new payload is introduced.
      assertCepStageSubset(d.releaseDir, { ...p.package.files, 'release.json': Buffer.from(canonical(p.package.release)).toString('base64') });
      for (const [file, bytes] of Object.entries(p.package.files)) writeExact(path.join(d.releaseDir, file), Buffer.from(bytes, 'base64'));
      writeExact(path.join(d.releaseDir, 'release.json'), canonical(p.package.release));
    } else if (!plain(d.releaseDir, true, true)) {
      const releaseStage = path.join(d.installRoot, 'releases', '.stage-' + crypto.randomUUID());
      for (const [file, bytes] of Object.entries(p.package.files)) writeExact(path.join(releaseStage, file), Buffer.from(bytes, 'base64'));
      writeExact(path.join(releaseStage, 'release.json'), canonical(p.package.release)); installer.checkRelease(releaseStage, p.package.release); fs.renameSync(releaseStage, d.releaseDir);
    }
    installer.checkRelease(d.releaseDir, p.package.release);
    fs.mkdirSync(prepared, { recursive: true }); plain(prepared, true);
    writeExact(path.join(prepared, 'prepared.json'), canonical(p)); writeExact(path.join(prepared, 'descriptor.json'), Buffer.from(p.descriptorBytes, 'base64')); writeExact(path.join(prepared, 'client.json'), Buffer.from(p.nextClient, 'base64'));
    if (!equal(fs.readdirSync(prepared).sort(), ['client.json', 'descriptor.json', 'prepared.json'])) fail('stopped_update_prepared_changed');
    if (!assertCepStageSubset(paths.cepStage, p.cep)) fs.mkdirSync(paths.cepStage);
    for (const [file, bytes] of Object.entries(p.cep)) writeExact(path.join(paths.cepStage, file), Buffer.from(bytes, 'base64'));
    assertCepStageSubset(paths.cepStage, p.cep);
    if (!equal(installer.snapshot(paths.cepStage), p.cep)) fail('stopped_update_staging_changed');
    writeExact(c.descriptorPath + '.next', Buffer.from(p.descriptorBytes, 'base64')); writeExact(paths.clientPath + '.next', Buffer.from(p.nextClient, 'base64')); writeExact(p.configPath + '.core4-next', Buffer.from(p.configBytes, 'base64'));
    const txn = { version: 2, transactionId: id, preparedPlanHash: p.preparedPlanHash, preparedStateHash: c.payloadHash, clientBinding: p.clientBinding, originBinding: { version: 1, rootOriginHash: hash(Buffer.from(p.originBytes, 'base64')), anchorOriginHash: hash(Buffer.from(p.originBytes, 'base64')) }, installRoot: d.installRoot, descriptorPath: c.descriptorPath, configPath: p.configPath, cepDir: p.cepDir, backupCep: paths.backupCep, previousDescriptor: p.previousDescriptor, previousConfig: p.previousConfig, previousCepHash: hash(p.previousCep), appliedDescriptorHash: hash(Buffer.from(p.descriptorBytes, 'base64')), appliedConfigHash: hash(Buffer.from(p.configBytes, 'base64')), appliedCepHash: hash(p.cep), stateDir: d.stateDir };
    writeExact(paths.txnFile, canonical(txn)); checkPreparedRecovery(c);
    const views = switchViews(c, paths), ready = { actor: c.actor, intentHash: c.intent.hash, leaseHash: c.leaseRecord.hash, fingerprint: c.fingerprint, paths, views, transaction: info(read(paths.txnFile)), prepared: tree(prepared) };
    c.ready = info(atomic(path.join(c.directory, 'switch-ready.json'), seal(c, 'update-switch-ready', ready)));
    validatePayload(c, ready); if (appliedViews(c, ready) !== 0) fail('stopped_update_switch_prefix');
    recoveries.set(capability, { c, ready, phase: 0, facts: recoveryFacts(c, ready) });
    renameRecovery(capability, paths.cepDir, paths.backupCep, views.cep, true); renameRecovery(capability, paths.cepStage, paths.cepDir, views.cepStage, true);
    renameRecovery(capability, c.descriptorPath + '.next', c.descriptorPath, views.descriptorStage); renameRecovery(capability, paths.clientPath + '.next', paths.clientPath, views.clientStage); renameRecovery(capability, p.configPath + '.core4-next', p.configPath, views.configStage);
    const result = finish(c, ready); leases.releaseInstallLease(c.lease); c.lease = null; return { ...result, recovered: true };
  } catch (error) { if (c.lease) leases.retainInstallLease(c.lease); error.leaseRetained = true; throw error; }
  finally { preparedRecoveries.delete(capability); recoveries.delete(capability); }
}
module.exports = { prepareStoppedUpdate, prepareLegacyStoppedUpdate, applyStoppedUpdate, inspectStoppedUpdate, finishStoppedUpdate,
  enableStoppedUpdate, finishEnableStoppedUpdate, createLegacyStoppedRecovery, stageStoppedRecovery,
  inspectOwnerPreReady, finishOwnerPreReady, ownerPreparedCertificatePermit,
  assertStoppedUpdatePermit, stoppedUpdateSwitchReady, stoppedUpdateLeasePermit, acquireStoppedReadoptionLease };

```

## core4/modules/comp-render/completion.json

SHA-256 cd2968619199062027a0b3ba8856152aab6b93e644c6ae9fb7b7fe224c1cdc80

```json
{
  "directory": "titles-output",
  "format": "H.264"
}

```

## core4/modules/comp-render/artifact.json

SHA-256 50b32ad22bdfa529840c58c0a5a577170c753809121d187b38a7b4341d4ab749

```json
{
  "id": "comp-render",
  "version": "4.1.2",
  "entry": "implementation.js",
  "hashes": {
    "implementation.js": "0342db38f45543748ef588643167e51c53cff2d9d6e5bd4b3c30b920a9b01fa9",
    "contract.json": "84ba65644ec246903b12311de72f74bfbdd2c81a6cd22412f1f2a84a69482971",
    "executor.jsx": "f313bcb55dd168aafccbe7c68853fd442e79c8b625e5bfc845ef287a3b134064",
    "completion.json": "cd2968619199062027a0b3ba8856152aab6b93e644c6ae9fb7b7fe224c1cdc80"
  },
  "publicDependencies": {}
}

```

## core4/test/render-job-owner.test.js

SHA-256 e3ee9ac792d3ae213b247a75803613503136bf536ed7368d0dd74e4424e4c215

```javascript
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { hash } = require('../protocol/json');
const { createRenderJobOwner } = require('../runtime/render-job-owner');

function fixture(t) {
  const temp = fs.realpathSync.native(os.tmpdir());
  const root = fs.mkdtempSync(path.join(temp, 'core4-render-job-owner-'));
  t.after(() => {
    const resolved = fs.realpathSync.native(root);
    assert.equal(path.dirname(resolved), temp);
    fs.rmSync(resolved, { recursive:true, force:true });
  });
  const installRoot = path.join(root, 'install');
  const stateDir = path.join(installRoot, 'state', 'production');
  const projectDir = path.join(root, 'staged'), outputDir = path.join(root, 'output');
  for (const dir of [stateDir, projectDir, outputDir]) fs.mkdirSync(dir, { recursive:true });
  const pin = (directory, name) => {
    const file = path.join(directory, name);
    fs.writeFileSync(file, name, { flag:'wx' });
    return { path:file, sha256:hash(name) };
  };
  const project = pin(projectDir, 'saved.aep'), media = pin(projectDir, 'footage.png');
  const toolchain = {
    engine:pin(root, 'aerender.exe'), ffmpeg:pin(root, 'ffmpeg.exe'), ffprobe:pin(root, 'ffprobe.exe')
  };
  const config = path.join(stateDir, 'render-job-toolchain.json');
  fs.writeFileSync(config, JSON.stringify(toolchain), { flag:'wx' });
  const taskId = 'task-11111111-2222-4333-8444-555555555555';
  const commandId = 'command-aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
  const ids = { taskId, commandId }, output = path.join(outputDir, 'final.mp4');
  const command = {
    ...ids, state:'succeeded', verificationKind:'local-transaction-receipt',
    selected:{ moduleId:'project-lifecycle', contract:{operationId:'transition-project'} },
    executionPolicy:{policyId:'current-matching-target-after-local-confirmation-v1'},
    input:{ action:'stage-render-copy', projectId:path.join(root,'source.aep'), destination:project.path,
      render:{ compId:7, fps:'30/1', audio:false, startFrame:1, endFrameExclusive:3, output } },
    after:{ currentProject:project.path, savedFileSha256:project.sha256, dirty:false, renderJob:{
      target:{compId:7, compName:'Master', queueIndex:1, frames:2, width:320, height:180, fps:'30/1', audio:false,
        timeline:{startFrame:10,frameCount:4}, range:{startFrame:11,endFrameExclusive:13}},
      queue:[{index:1,name:'Master',status:'Queued',compId:7,frames:4,startFrame:10,format:'H.264'}],
      media:[{ ...media, bytes:11, modifiedMs:0 }], output,
      scratchOutput:path.join(projectDir, 'core4-r1-scratch.mp4')
    } }
  };
  const owner = (installationId = 'installation-aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee') =>
    createRenderJobOwner({ stateDir, installationId,
      getCommand:(task, id) => task === taskId && id === commandId ? command : undefined });
  const jobsDir = path.join(stateDir, 'render-jobs-v1');
  const jobDir = id => path.join(jobsDir, id);
  return { owner, ids, command, config, toolchain, root, installRoot, projectDir, jobsDir, jobDir, project, media };
}

test('R1 prepares once from exact staged ledger evidence and reopens without an executable payload', async t => {
  const f = fixture(t), owner = f.owner();
  assert.deepEqual(owner.prepare({ ...f.ids, engine:f.toolchain.engine }), { state:'rejected', code:'render_job_arguments' });
  assert.equal(fs.existsSync(f.jobsDir), false);
  const prepared = owner.prepare(f.ids);
  assert.equal(prepared.state, 'prepared', JSON.stringify(prepared));
  const { id } = prepared;
  const file = path.join(f.jobDir(id), 'prepared.json');
  const saved = fs.readFileSync(file, 'utf8'), job = JSON.parse(saved);
  assert.deepEqual(job.spec.engine, f.toolchain.engine);
  assert.deepEqual(job.spec.project, f.project);
  assert.deepEqual(job.spec.media, [f.media]);
  assert.equal(job.spec.output, f.command.input.render.output);
  assert.equal(hash(fs.readFileSync(job.working)), f.project.sha256);

  fs.unlinkSync(f.config);
  assert.deepEqual(f.owner().prepare(f.ids), prepared);
  assert.deepEqual(await f.owner().status({ id }), prepared);
  assert.deepEqual(await f.owner().start({ id, argv:['-reuse'] }), { state:'rejected', code:'render_job_arguments' });
  assert.deepEqual(await f.owner().start({ id }), { state:'rejected', code:'render_job_toolchain' });
  assert.deepEqual(await f.owner('other-installation').status({ id }), { state:'rejected', code:'render_job_missing' });
  assert.equal(fs.readFileSync(file, 'utf8'), saved);
  assert.equal(fs.readdirSync(f.projectDir).filter(name => /^core4-render-/.test(name)).length, 1);
});

test('R1 refuses foreign or unsettled receipts, output drift and protected paths before preparation', t => {
  const f = fixture(t), owner = f.owner();
  f.command.state = 'UNKNOWN';
  assert.deepEqual(owner.prepare(f.ids), { state:'rejected', code:'render_job_stage_receipt' });
  f.command.state = 'succeeded';
  f.command.selected.moduleId = 'comp-render';
  assert.deepEqual(owner.prepare(f.ids), { state:'rejected', code:'render_job_stage_receipt' });
  f.command.selected.moduleId = 'project-lifecycle';
  f.command.after.renderJob.output = path.join(f.root, 'drift.mp4');
  assert.deepEqual(owner.prepare(f.ids), { state:'rejected', code:'render_job_stage_binding' });
  f.command.input.render.output = f.command.after.renderJob.output = path.join(f.installRoot, 'protected.mp4');
  assert.deepEqual(owner.prepare(f.ids), { state:'rejected', code:'render_job_protected_path' });
  assert.equal(fs.existsSync(f.jobsDir), false);
});

test('R1 requires its exact plain local toolchain file and verifies the prepared pins', async t => {
  const f = fixture(t), owner = f.owner(), alias = path.join(f.root, 'toolchain-alias');
  fs.linkSync(f.config, alias);
  assert.deepEqual(owner.prepare(f.ids), { state:'rejected', code:'render_job_toolchain' });
  fs.unlinkSync(alias);
  fs.writeFileSync(f.config, JSON.stringify({ ...f.toolchain, extra:true }));
  assert.deepEqual(owner.prepare(f.ids), { state:'rejected', code:'render_job_toolchain' });
  fs.writeFileSync(f.config, JSON.stringify({ ...f.toolchain, engine:{ ...f.toolchain.engine, sha256:'0'.repeat(64) } }));
  assert.deepEqual(owner.prepare(f.ids), { state:'rejected', code:'aerender_input_changed' });
  fs.writeFileSync(f.config, JSON.stringify(f.toolchain));
  const { id, state } = owner.prepare(f.ids);
  assert.equal(state, 'prepared');
  fs.writeFileSync(f.config, JSON.stringify({ ...f.toolchain, engine:{ ...f.toolchain.engine, sha256:'0'.repeat(64) } }));
  assert.deepEqual(await owner.start({ id }), { state:'rejected', code:'render_job_toolchain_changed' });
  assert.equal(fs.existsSync(path.join(f.jobDir(id), 'dispatch.json')), false);
});

test('R1 retains an interrupted preparation and refuses a second mutation after restart', async t => {
  const f = fixture(t), owner = f.owner();
  const open = fs.openSync;
  const fault = t.mock.method(fs, 'openSync', (file, ...args) => {
    if (path.dirname(file) === f.projectDir && /^core4-render-/.test(path.basename(file))) {
      throw Error('simulated loss with a private host path');
    }
    return open(file, ...args);
  });
  const pending = owner.prepare(f.ids);
  fault.mock.restore();
  assert.equal(pending.state, 'unknown', JSON.stringify(pending));
  assert.deepEqual(f.owner().prepare(f.ids), pending);
  assert.deepEqual(await f.owner().status({ id:pending.id }), pending);
  assert.deepEqual(await f.owner().start({ id:pending.id }), pending);
  assert.deepEqual(await f.owner().cancel({ id:pending.id }), pending);
  assert.deepEqual(fs.readdirSync(f.jobDir(pending.id)), ['prepare-intent.json']);
  assert.deepEqual(fs.readdirSync(f.projectDir).sort(), ['footage.png','saved.aep']);
});

test('R1 reads back a lost prepare reply and enforces the live guard within cancel', {skip:process.platform !== 'win32'}, async t => {
  const f = fixture(t), owner = f.owner(), link = fs.linkSync;
  const fault = t.mock.method(fs, 'linkSync', (source, destination) => {
    link(source, destination);
    if (path.basename(destination) === 'prepared.json') throw Error('simulated reply loss');
  });
  const prepared = owner.prepare(f.ids);
  fault.mock.restore();
  assert.equal(prepared.state, 'prepared', JSON.stringify(prepared));
  const args = { id:prepared.id };
  const revoke = () => { throw Error('render_job_invocation_revoked'); };
  assert.deepEqual(await owner.cancel(args, revoke), { state:'rejected', code:'render_job_invocation_revoked' });
  assert.deepEqual(await owner.status(args), prepared);
  assert.deepEqual(await owner.cancel(args), { ...args, state:'cancelled' });
  assert.deepEqual(await f.owner().status(args), { ...args, state:'cancelled' });
});

test('R1 requires current stage authority for a fresh start and preserves post-reset cancellation', {skip:process.platform !== 'win32'}, async t => {
  const f = fixture(t), owner = f.owner();
  const prepared = owner.prepare(f.ids), args = { id:prepared.id };
  assert.equal(prepared.state, 'prepared');
  // The production getter stops returning commands from an earlier work session.
  f.command.taskId = 'task-22222222-3333-4444-8555-666666666666';
  assert.deepEqual(await owner.start(args), { state:'rejected', code:'render_job_stage_receipt' });
  assert.deepEqual(await owner.status(args), prepared);
  assert.deepEqual(await owner.cancel(args), { ...args, state:'cancelled' });
  assert.deepEqual(await owner.start(args), { ...args, state:'cancelled' });
});

```

## core4/test/installed-composition.test.js

SHA-256 990b468da0ba747026245a08670afb0e43c6a3e3e30b8c04fdf4aed1a58ab9f4

```javascript
'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), vm = require('node:vm'), http = require('node:http');
const { fork, spawnSync } = require('node:child_process');
const { once } = require('node:events');
const { hash, canonical } = require('../protocol/json');
const { buildPackage, verifyPackage } = require('../tools/package-installable');
const { planInstall, applyInstall } = require('../tools/install-core4');
const { verifyInstallation, verifyRelease, verifyCep } = require('../runtime/installation');
const { deriveComposition } = require('../runtime/stdio-entry');
const { checkEntrySource } = require('../tools/check-boundaries');
const { mac } = require('../integrations/cep/peer-protocol');
const root = path.resolve(__dirname, '..');
const temp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'core4-composition-'));
// This fixture performs real package rotations/Windows IO; keep the test's
// observation budget separate from production transport deadlines.
test('installed-composition portable fixed-format1 transition to readonly preserves signed history and no replay', { timeout: 90000 }, async () => {
  const result = await require('./fixtures/installed-composition-transition').transition(); assert.equal(result.historicalFormat, 1); assert.equal(result.candidateFormat, 2);
});
function install(pkg) {
  const directory = temp(), args = { pkg, nodePath: fs.realpathSync(process.execPath), installRoot: path.join(directory, 'AEAgentCore4'), extensionsDir: path.join(directory, 'extensions'), configPath: path.join(directory, 'config.toml'), machineId: os.hostname() };
  const applied = applyInstall(planInstall(args)); return { directory, args, descriptor: applied.descriptorPath, d: verifyInstallation(applied.descriptorPath) };
}
function edit(pkg, file, transform) {
  const value = JSON.parse(Buffer.from(pkg.files[file], 'base64')); transform(value); const bytes = canonical(value);
  pkg.files[file] = Buffer.from(bytes).toString('base64'); pkg.release.hashes[file] = hash(bytes); pkg.packageHash = hash(pkg.release); return pkg;
}
function rpcChild(f) {
  const child = fork(path.join(f.d.releaseDir, 'runtime/stdio-entry.js'), ['--installation', f.descriptor], { execArgv: ['--require', path.join(__dirname, 'fixtures/installed-composition-child.js')], stdio: ['pipe', 'pipe', 'pipe', 'ipc'], windowsHide: true, cwd: os.tmpdir() });
  let buffer = '', stderr = '', next = 0; const pending = new Map();
  child.stdout.on('data', bytes => { buffer += bytes; while (buffer.includes('\n')) { const n = buffer.indexOf('\n'), value = JSON.parse(buffer.slice(0, n)); buffer = buffer.slice(n + 1); pending.get(value.id)?.(value); pending.delete(value.id); } });
  child.stderr.on('data', b => { stderr += b; });
  const rpc = (method, params = {}) => new Promise(resolve => { const id = ++next; pending.set(id, resolve); child.stdin.write(canonical({ jsonrpc: '2.0', id, method, params }) + '\n'); });
  const call = async (name, payload = {}) => { const response = await rpc('tools/call', { name, arguments: { payload } }); if (response.error) throw new Error(response.error.message); return JSON.parse(response.result.content[0].text); };
  const message = event => new Promise(resolve => { const handler = value => { if (value.event === event) { child.off('message', handler); resolve(value); } }; child.on('message', handler); });
  return { child, rpc, call, message, async close() { const exited = once(child, 'exit'); child.kill('SIGTERM'); await exited; assert.equal(stderr, ''); } };
}
function raw(port, route, value) { return new Promise((resolve, reject) => { const request = http.request('http://127.0.0.1:' + port + route, { method: 'POST', agent: false, headers: { Origin: 'null', 'Content-Type': 'application/json' } }, response => { let bytes = ''; response.on('data', b => { bytes += b; }); response.on('end', () => resolve({ status: response.statusCode, value: JSON.parse(bytes) })); }); request.on('error', reject); request.end(canonical(value)); }); }
async function panel(port, d) {
  const challenge = (await raw(port, '/challenge', { role: 'panel' })).value, peerId = 'composition-fixture';
  const linked = await raw(port, '/link', { challenge, peerId, proof: mac({ challenge, peerId }, d.panelToken) }); assert.equal(linked.status, 200); let sequence = 0;
  return async (route, payload) => { const body = { epoch: challenge.epoch, peerId, sequence: ++sequence, method: 'POST', path: route, payload }; const response = await raw(port, route, { body, mac: mac(body, d.panelToken) }); assert.equal(response.status, 200, JSON.stringify(response.value)); assert.equal(response.value.mac, mac(response.value.body, d.panelToken)); return response.value.body.payload; };
}
test('installed-composition deterministic packages, fixed ES3 registries, admission pins and physical closure', () => {
  for (const selector of ['manual', 'readonly']) {
    const pkg = buildPackage(root, selector); assert.equal(pkg.packageHash, buildPackage(root, selector).packageHash); assert.equal(verifyPackage(pkg), pkg); assert.equal(pkg.release.format, 2);
    const composition = JSON.parse(Buffer.from(pkg.files['runtime/composition.json'], 'base64'));
    assert.equal(composition.id, selector); assert.equal(composition.engine === null, selector === 'readonly');
    if (selector === 'readonly') assert.ok(Object.keys(pkg.files).every(file => !/^(plan-engine\/|modules\/(?!project-inspection\/)|config\/admissions\/|runtime\/(manual-policy|windows-reservation-provider)\.js$)/.test(file)));
    const source = Buffer.from(pkg.files['cep/jsx/registry.jsx'], 'base64').toString();
    const parser = "const fs=require('node:fs'),acorn=require('internal/deps/acorn/acorn/dist/acorn');acorn.parse(fs.readFileSync(0,'utf8'),{ecmaVersion:3,allowReserved:'never'});console.log('ES3 PASS');";
    const parsed = spawnSync(process.execPath, ['--expose-internals', '-e', parser], { input: source, encoding: 'utf8', windowsHide: true }); assert.equal(parsed.status, 0, parsed.stderr);
    const context = vm.createContext({ JSON: undefined, Object, Error }); vm.runInContext(source, context);
    for (const phase of ['constructor', 'toString', '__proto__']) assert.throws(() => vm.runInContext('AECore4Host.dispatch(' + JSON.stringify(canonical({ assetKey: composition.assets[0].assetKey, phase, pins: { executorHash: JSON.parse(Buffer.from(pkg.files['modules/project-inspection/artifact.json'], 'base64')).executorHash } })) + ')', context), /fixed_asset_binding/);
  }
  assert.equal(buildPackage().packageHash, buildPackage(root, 'manual').packageHash); assert.throws(() => buildPackage(root, 'other'), /composition_selector/);
});
test('installed-composition includes render and text variants only in their selected composition', () => {
  const old = buildPackage(root, 'manual-titles');
  const enabled = buildPackage(root, 'manual-titles-variants');
  for (const file of ['modules/text-variant/executor.jsx', 'modules/comp-render/executor.jsx', 'modules/comp-render/completion.json']) {
    assert.equal(old.files[file], undefined); assert.ok(enabled.files[file]);
  }
  assert.equal(enabled.files['modules/text-layer/executor.jsx'], old.files['modules/text-layer/executor.jsx']);
  const extra = 'modules/comp-render/completion.json';
  old.files[extra] = enabled.files[extra]; old.release.hashes[extra] = enabled.release.hashes[extra]; old.packageHash = hash(old.release);
  assert.throws(() => verifyPackage(old), /composition_optional_closure/);
  const arbitraryLoader = edit(structuredClone(enabled), 'runtime/composition-policy.json', p => { p.profiles['comp-render'].resultProfile = './other.js'; });
  assert.throws(() => verifyPackage(arbitraryLoader), /composition_not_admitted/);
  const altered = edit(structuredClone(enabled), extra, p => { p.directory = 'other-output'; });
  assert.throws(() => verifyPackage(altered), /composition_artifact/);
});
test('installed-composition R1 extends the operator montage closure only in owner mode', () => {
  const options = { runtimeModel: 'owner' };
  const parent = buildPackage(root, 'operator-workflows-montage', options);
  const r1 = buildPackage(root, 'operator-render-jobs', options);
  const extra = Object.keys(r1.files).filter(file => !Object.hasOwn(parent.files, file));
  assert.deepEqual(extra.sort(), ['runtime/aerender-jobs.js', 'runtime/aerender-profile.js', 'runtime/render-job-owner.js']);
  assert.equal(verifyPackage(r1), r1);
  assert.throws(() => buildPackage(root, 'operator-render-jobs'), /operator_confirmation_owner_required|render_job_owner_required/);
});
test('installed-composition adds a second operator-confirmed module by declaration and keeps the shared path identical', () => {
  const options = { runtimeModel: 'owner' };
  const titles = buildPackage(root, 'operator-titles-pilot', options);
  const photo = buildPackage(root, 'operator-titles-photo-pilot', options);
  const readonly = buildPackage(root, 'readonly', options);
  const policy = pkg => JSON.parse(Buffer.from(pkg.files['runtime/composition-policy.json'], 'base64'));
  assert.equal(policy(titles).profiles['photo-placeholder'].operatorConfirmation, undefined);
  assert.equal(policy(photo).profiles['photo-placeholder'].operatorConfirmation, true);
  assert.equal(policy(photo).profiles['titles-current-target'].operatorConfirmation, true);
  assert.deepEqual(policy(readonly).profiles, {});
  assert.equal(readonly.files['runtime/operator-confirmation.js'], undefined);
  assert.equal(readonly.files['modules/photo-placeholder/executor.jsx'], undefined);
  for (const file of ['core/broker.js', 'runtime/operator-confirmation.js', 'runtime/manual-policy.js', 'runtime/stdio-entry.js', 'modules/titles-current-target/executor.jsx']) {
    assert.equal(photo.release.hashes[file], titles.release.hashes[file]);
  }
  assert.throws(() => buildPackage(root, 'operator-titles-photo-pilot'), /operator_confirmation_owner_required/);
  const save = edit(structuredClone(photo), 'runtime/composition-policy.json', p => { p.profiles['project-save'].operatorConfirmation = true; });
  assert.throws(() => verifyPackage(save), /composition_not_admitted/);
});
test('installed-composition operator workflows requires proof in the packaged registry for every added executor', () => {
  const pkg = buildPackage(root, 'operator-workflows', { runtimeModel: 'owner' });
  const read = file => Buffer.from(pkg.files[file], 'base64');
  const { assets } = deriveComposition(pkg.release, read);
  const guarded = assets.filter(asset => asset.registryOperatorConfirmation);
  assert.deepEqual(guarded.map(asset => asset.moduleId).sort(),
    ['comp-render', 'layer-insert', 'media-import', 'project-assembly', 'project-lifecycle', 'project-save', 'text-layer', 'text-variant', 'titles-point-layout']);
  const source = read('cep/jsx/registry.jsx').toString('utf8');
  const parser = "const fs=require('node:fs'),acorn=require('internal/deps/acorn/acorn/dist/acorn');acorn.parse(fs.readFileSync(0,'utf8'),{ecmaVersion:3,allowReserved:'never'});";
  const result = spawnSync(process.execPath, ['--expose-internals', '-e', parser], { input: source, encoding: 'utf8', windowsHide: true });
  assert.equal(result.status, 0, result.stderr);
  const context = vm.createContext({ confirm() { assert.fail('native confirmation opened'); } });
  vm.runInContext(source, context);
  for (const { assetKey, executorHash } of guarded) {
    const frame = { assetKey, phase: 'mutate', pins: { executorHash }, typedPayload: { operatorConfirmation: true } };
    assert.deepEqual(JSON.parse(context.AECore4Host.dispatch(canonical(frame))), { outcome: 'rejected', code: 'operator_confirmation_required' });
  }
});
test('installed-composition point-layout is opt-in and refuses a package without its proof', () => {
  for (const mode of ['readonly', 'manual']) {
    const pkg = buildPackage(root, mode);
    assert.ok(!Object.keys(pkg.files).some(name => /point-layout/.test(name)));
  }
  const pkg = buildPackage(root, 'manual-layout', { runtimeModel: 'owner' });
  assert.ok(Object.hasOwn(pkg.files, 'modules/titles-current-target/executor.jsx'));
  assert.equal(hash(canonical(pkg.release)), pkg.packageHash);
  const file = 'runtime/point-layout-proof.js';
  assert.ok(Object.hasOwn(pkg.files, file));
  delete pkg.files[file]; delete pkg.release.hashes[file];
  pkg.packageHash = hash(pkg.release);
  assert.throws(() => verifyPackage(pkg), /composition_optional_closure/);
});
test('installed-composition text-layer is opt-in and preserves earlier Titles artifacts', () => {
  const enabled = buildPackage(root, 'manual-titles', { runtimeModel: 'owner' });
  const old = buildPackage(root, 'manual-layout', { runtimeModel: 'owner' });
  for (const id of ['titles-current-target', 'titles-point-layout']) {
    for (const file of ['artifact.json', 'contract.json', 'executor.jsx']) {
      assert.equal(enabled.files[`modules/${id}/${file}`], old.files[`modules/${id}/${file}`]);
    }
  }
  assert.ok(enabled.files['modules/text-layer/executor.jsx']);
  assert.equal(old.files['modules/text-layer/executor.jsx'], undefined);
});
test('installed-composition admits media import and layer insertion only in their owner package', () => {
  const options = { runtimeModel: 'owner' };
  const original = buildPackage(root, 'operator-titles-photo-pilot', options);
  const candidate = buildPackage(root, 'manual-media-layers', options);
  const read = file => Buffer.from(candidate.files[file], 'base64');
  const selected = deriveComposition(candidate.release, read);
  assert.deepEqual(selected.assets.filter(asset => ['media-import', 'layer-insert'].includes(asset.moduleId))
    .map(asset => [asset.moduleId, asset.contract.operationId, asset.resultProfile]), [
    ['media-import', 'ingest-footage', 'media-import-v1'],
    ['layer-insert', 'insert-footage-layer', 'layer-insert-v1']
  ]);
  assert.equal(original.files['runtime/media-layer-proof.js'], undefined);
  assert.equal(original.files['modules/comp-render/executor.jsx'], candidate.files['modules/comp-render/executor.jsx']);
  const source = read('cep/jsx/registry.jsx');
  const parser = "const fs=require('node:fs'),acorn=require('internal/deps/acorn/acorn/dist/acorn');acorn.parse(fs.readFileSync(0,'utf8'),{ecmaVersion:3,allowReserved:'never'});";
  const result = spawnSync(process.execPath, ['--expose-internals', '-e', parser], { input: source, encoding: 'utf8', windowsHide: true });
  assert.equal(result.status, 0, result.stderr);
});
test('installed-composition isolates the montage mandate and admits only three montage effects', () => {
  const options = { runtimeModel: 'owner' };
  const montage = buildPackage(root, 'operator-photo-montage', options);
  const read = file => Buffer.from(montage.files[file], 'base64');
  const selected = deriveComposition(montage.release, read);
  assert.deepEqual(selected.composition.modules, ['media-import', 'layer-overlay', 'comp-frame-export']);
  assert.deepEqual(selected.assets.map(asset => asset.moduleId), ['project-inspection', ...selected.composition.modules]);
  assert.ok(selected.assets.slice(1).every(asset => asset.operatorConfirmation && asset.registryOperatorConfirmation));
  for (const file of ['runtime/montage-mandate.js', 'runtime/operator-confirmation.js', 'runtime/project-file.js']) {
    assert.ok(montage.files[file], file);
  }
  for (const file of ['runtime/project-save-proof.js', 'runtime/project-lifecycle-proof.js', 'runtime/layer-insert-proof.js']) {
    assert.equal(montage.files[file], undefined, file);
  }
  const titles = buildPackage(root, 'operator-titles-photo-pilot', options);
  assert.ok(titles.files['runtime/operator-confirmation.js']);
  assert.equal(titles.files['runtime/montage-mandate.js'], undefined);
});
test('installed-composition project assembly is discovered by the installed MCP entry', { timeout: 15000 }, async () => {
  const pkg = buildPackage(root, 'manual-project-assembly');
  const f = install(pkg), h = rpcChild(f);
  try {
    await h.message('listening');
    assert.equal((await h.call('core_status')).composition, 'manual-project-assembly');
    const contract = await h.call('get_module_contract', { moduleId: 'project-assembly' });
    assert.equal(contract.operationId, 'assemble-composition');
    assert.deepEqual(contract.contract.effectPolicy.targetFields, ['sessionId', 'projectId']);
  } finally { await h.close(); fs.rmSync(f.directory, { recursive: true, force: true }); }
});
test('installed-composition project save is discovered by the installed MCP entry', { timeout: 15000 }, async () => {
  const pkg = buildPackage(root, 'manual-project-save');
  const f = install(pkg), h = rpcChild(f);
  try {
    await h.message('listening');
    assert.equal((await h.call('core_status')).composition, 'manual-project-save');
    const contract = await h.call('get_module_contract', { moduleId: 'project-save' });
    assert.equal(contract.operationId, 'save-current-project');
    assert.equal(contract.contract.effectPolicy.checkpointKind, 'project-save-disk-preimage-v1');
  } finally { await h.close(); fs.rmSync(f.directory, { recursive: true, force: true }); }
});
test('installed-composition project lifecycle is discovered by the installed MCP entry', { timeout: 15000 }, async () => {
  const f = install(buildPackage(root, 'manual-project-lifecycle')), h = rpcChild(f);
  try {
    await h.message('listening');
    assert.equal((await h.call('core_status')).composition, 'manual-project-lifecycle');
    const contract = await h.call('get_module_contract', { moduleId: 'project-lifecycle' });
    assert.equal(contract.operationId, 'transition-project');
    assert.deepEqual(contract.contract.buildSchema.properties.action.enum, ['save-as', 'create', 'open']);
  } finally { await h.close(); fs.rmSync(f.directory, { recursive: true, force: true }); }
});
test('installed-composition admits a new render operation through declarations on a relocated source and installed tree', { timeout: 15000 }, async t => {
  const source = temp(), moduleId = 'fixture-render', operationId = 'fixture-render-variant', relative = 'modules/' + moduleId;
  t.after(() => fs.rmSync(source, { recursive: true, force: true }));
  for (const file of ['core', 'protocol', 'runtime', 'config', 'modules', 'plan-engine', 'cep', 'integrations', 'worker.js']) fs.cpSync(path.join(root, file), path.join(source, file), { recursive: true });
  fs.cpSync(path.join(source, 'modules/comp-render'), path.join(source, relative), { recursive: true });
  const read = file => fs.readFileSync(path.join(source, file)), json = file => JSON.parse(read(file));
  const put = (file, data) => fs.writeFileSync(path.join(source, file), typeof data === 'string' ? data : canonical(data));
  const contract = { ...json(relative + '/contract.json'), moduleId, operationId };
  put(relative + '/contract.json', contract);
  put(relative + '/implementation.js', read(relative + '/implementation.js').toString().replace('render-text-variant', operationId));
  const artifact = { ...json(relative + '/artifact.json'), id: moduleId };
  for (const file of Object.keys(artifact.hashes)) artifact.hashes[file] = hash(read(relative + '/' + file));
  put(relative + '/artifact.json', artifact);
  const admission = 'config/admissions/' + moduleId + '.json';
  put(admission, { ...json('config/admissions/comp-render.json'), moduleId, operationId, artifactHash: hash(artifact), trustApprovalId: 'isolated-test-fixture' });
  const parent = json('config/compositions/manual-titles-variants.json');
  put('config/compositions/fixture-composition.json', { parent: 'manual-titles-variants',
    bundle: { files: [admission], artifactClosures: [relative + '/artifact.json'] }, modules: [moduleId],
    assets: [{ ...parent.assets.find(a => a.moduleId === 'comp-render'), assetKey: moduleId + '-v1', moduleId, path: relative, admission }],
    profiles: { [moduleId]: { operationId, resultProfile: 'owned-comp-render-v1' } } });
  const pkg = buildPackage(source, 'fixture-composition');
  assert.equal(pkg.release.hashes['runtime/stdio-entry.js'], hash(fs.readFileSync(path.join(root, 'runtime/stdio-entry.js'))));
  assert.equal(pkg.packageHash, buildPackage(source, 'fixture-composition').packageHash);
  assert.ok(!buildPackage(source, 'manual-titles-variants').files[relative + '/executor.jsx']);
  const f = install(pkg), h = rpcChild(f);
  try {
    await h.message('listening');
    assert.equal((await h.call('core_status')).composition, 'fixture-composition');
    assert.equal((await h.call('get_module_contract', { moduleId })).operationId, operationId);
    assert.equal((await h.call('get_module_contract', { moduleId: 'comp-render' })).operationId, 'render-text-variant');
  } finally { await h.close(); fs.rmSync(f.directory, { recursive: true, force: true }); }
});
test('installed-composition direct legacy derivation requires each fixed admission hash and exact bytes', () => {
  const pkg = require('./fixtures/fixed-format1-package').fixedFormat1Package();
  const read = file => Buffer.from(pkg.files[file], 'base64');
  const selected = deriveComposition(pkg.release, read); assert.equal(selected.legacy, true); assert.deepEqual(selected.assets.map(a => a.assetKey), ['project-inspection-v1', 'titles-current-target-v1']);
  for (const file of ['modules/project-inspection/artifact.json', 'config/admissions/titles-current-target.json']) {
    const missing = structuredClone(pkg.release); delete missing.hashes[file]; assert.throws(() => deriveComposition(missing, read), /composition_unhashed_path/);
    assert.throws(() => deriveComposition(pkg.release, name => name === file ? Buffer.from('{}') : read(name)), /composition_bytes/);
  }
});
test('installed-composition entry source guard covers top-level/start/lease-prefix/tail and fails closed on layout changes', () => {
  const source = fs.readFileSync(path.join(root, 'runtime/stdio-entry.js'), 'utf8');
  assert.equal(checkEntrySource(source), true, 'current post-verification and lazy manual imports remain accepted');
  const initial = 'const installation = verifyInstallation(descriptor), root = installation.releaseDir;';
  const barrier = "if (canonical(verifyInstallation(descriptor)) !== canonical(installation)) fail('installation_changed_during_start');";
  const end = 'finally { if (startupGate !== undefined) { fs.closeSync(startupGate); fs.unlinkSync(installGate); } }';
  const untrusted = "require('../unverified-helper.js');\n";
  for (const modified of [untrusted + source, source.replace(initial, untrusted + initial), source.replace(barrier, untrusted + barrier), source + '\n' + untrusted]) assert.throws(() => checkEntrySource(modified), /unverified_entry_import/);
  for (const marker of ['async function start(', initial, barrier, end]) {
    assert.ok(source.includes(marker), 'negative guard fixture must mutate a current source anchor');
    assert.throws(() => checkEntrySource(source.replace(marker, '/* removed verification layout marker */')), /entry_verification_layout/);
    assert.throws(() => checkEntrySource(source + '\n/* ' + marker + ' */'), /entry_verification_layout/);
  }
});
test('installed-composition build CLI selects readonly/manual and rejects ambiguous options without output', () => {
  const directory = temp(), cli = path.join(root, 'tools/package-installable.js');
  for (const selector of ['readonly', 'manual', null]) {
    const file = path.join(directory, (selector || 'default') + '.json'), args = ['--output', file, ...(selector ? ['--composition', selector] : [])];
    const result = spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', windowsHide: true }); assert.equal(result.status, 0, result.stderr); assert.equal(JSON.parse(fs.readFileSync(file)).packageHash, buildPackage(root, selector || 'manual').packageHash);
  }
  let index = 0;
  for (const options of [['--composition', ''], ['--composition', 'other'], ['--composition', 'readonly', '--composition', 'manual'], ['--unknown', 'readonly'], ['--composition'], ['--output', 'relative.json']]) {
    const file = path.join(directory, 'denied-' + index++ + '.json'), result = spawnSync(process.execPath, [cli, '--output', file, ...options], { encoding: 'utf8', windowsHide: true }); assert.equal(result.status, 1); assert.equal(fs.existsSync(file), false);
  }
});
test('installed-composition unknown/missing/corrupt/duplicate/path/phase/catalog/admission/downgrade failures', () => {
  const make = () => structuredClone(buildPackage());
  const mutations = [
    p => { p.release.format = 99; p.packageHash = hash(p.release); },
    p => { delete p.files['runtime/composition.json']; delete p.release.hashes['runtime/composition.json']; p.packageHash = hash(p.release); },
    p => { p.files['runtime/composition.json'] = Buffer.from('{}').toString('base64'); },
    p => edit(p, 'runtime/composition.json', c => { c.version = 1; }),
    p => edit(p, 'runtime/composition.json', c => { c.extra = true; }),
    p => edit(p, 'runtime/composition.json', c => { c.assets.push(c.assets[0]); }),
    p => edit(p, 'runtime/composition.json', c => { c.modules.push(c.modules[0]); }),
    p => edit(p, 'runtime/composition.json', c => { c.assets[0].path = '../outside'; }),
    p => edit(p, 'runtime/composition.json', c => { c.assets[0].phases = ['mutate']; }),
    p => edit(p, 'runtime/composition.json', c => { c.assets[0].policy = 'other'; }),
    p => edit(p, 'config/catalog.json', c => { c.modules.pop(); }),
    p => edit(p, 'config/admissions/titles-current-target.json', c => { c.revoked = true; }),
    p => edit(p, 'config/admissions/titles-current-target.json', c => { c.executorHash = '0'.repeat(64); }),
    p => { p.release.format = 1; p.packageHash = hash(p.release); },
    p => { p.release.format = 1; delete p.files['runtime/composition.json']; delete p.release.hashes['runtime/composition.json']; p.packageHash = hash(p.release); }
  ];
  for (const mutate of mutations) { const pkg = make(); mutate(pkg); assert.throws(() => verifyPackage(pkg)); }
  const readonly = buildPackage(root, 'readonly'); edit(readonly, 'config/catalog.json', c => { c.engine = { path: 'plan-engine', artifactHash: '0'.repeat(64) }; }); assert.throws(() => verifyPackage(readonly), /composition_catalog/);
});
test('installed-composition installed readonly child initialize/status/discovery/contract and native fake VM inspection', { timeout: 15000 }, async () => {
  const pkg = buildPackage(root, 'readonly'), f = install(pkg), h = rpcChild(f); let nativeCalls = 0;
  try {
    const listening = await h.message('listening'); assert.notEqual(listening.port, 3457);
    assert.equal((await h.rpc('initialize')).result.serverInfo.name, 'ae-agent-core4');
    let status = await h.call('core_status'); assert.equal(status.composition, 'readonly'); assert.equal(status.manualPolicy, null); assert.equal(status.resourceProvider, null); assert.equal(status.mutationAvailable, false); assert.equal(status.physical.inspectionAvailable, false); assert.equal(status.automaticLifecycle, 'unavailable');
    const unavailable = await h.call('core_connect'); assert.equal(unavailable.available, false); assert.equal(unavailable.reason, 'physical_inspection_unavailable'); assert.deepEqual(unavailable.physical, status.physical);
    const unchanged = await h.call('core_disconnect'); assert.equal(unchanged.disconnected, false); assert.equal(unchanged.reason, 'physical_link_owned_by_stdio_lifetime'); assert.deepEqual(unchanged.physical, status.physical);
    assert.deepEqual((await h.call('list_modules')).modules.map(m => m.id), ['project-inspection']);
    const contract = await h.call('get_module_contract', { moduleId: 'project-inspection' }); assert.equal(contract.contract.buildSupported, false);
    await assert.rejects(h.call('get_module_contract', { moduleId: 'titles' }), /module_unavailable/);
    await assert.rejects(h.call('build_solution_plan', { contractId: contract.contractId }), /read_only_module_build_unsupported/);
    const call = await panel(listening.port, f.d);
    status = await h.call('core_status'); assert.equal(status.physical.inspectionAvailable, true); assert.equal(status.connection, 'unavailable');
    const connected = await h.call('core_connect'); assert.equal(connected.available, true); assert.equal(connected.mutationAvailable, false);
    assert.deepEqual(connected.physical, status.physical);
    const disconnected = await h.call('core_disconnect'); assert.equal(disconnected.disconnected, false); assert.equal(disconnected.reason, 'physical_link_owned_by_stdio_lifetime'); assert.deepEqual(disconnected.physical, status.physical);
    assert.deepEqual((await h.call('core_status')).physical, status.physical, 'stdio lifetime retains the physical link');
    function CompItem() { this.id = 7; this.name = 'Synthetic comp'; this.numLayers = 0; this.duration = 5; }
    const comp = new CompItem(), context = vm.createContext({ JSON: undefined, Math, Error, CompItem, app: { version: 'synthetic', project: { file: null, numItems: 1, item: () => comp } } });
    vm.runInContext(Buffer.from(pkg.files['cep/jsx/registry.jsx'], 'base64').toString(), context);
    const pending = h.call('inspect_module_target', { moduleId: 'project-inspection', contractId: contract.contractId, target: {} });
    const polled = await call('/poll', {}); assert.ok(polled.command); nativeCalls++;
    const result = JSON.parse(vm.runInContext('AECore4Host.dispatch(' + JSON.stringify(canonical(polled.command)) + ')', context)); assert.equal(result.readFailureVersion, undefined);
    await call('/complete', { commandId: polled.command.commandId, originalBinding: polled.command.originalBinding, pins: polled.command.pins, result });
    assert.equal((await pending).authority, false); assert.equal(nativeCalls, 1);
    const cacheReply = h.message('cache'); h.child.send('cache'); const loaded = (await cacheReply).modules;
    assert.ok(loaded.every(file => !/[\\/](manual-policy|windows-reservation-provider)\.js$|[\\/]plan-engine[\\/]|[\\/]modules[\\/](titles|photo-placeholder)/.test(file)));
  } finally { await h.close(); }
});
test('installed-composition actual manual installed child retains module discovery and manual gated policy', { timeout: 15000 }, async () => {
  const f = install(buildPackage()), h = rpcChild(f);
  try { await h.message('listening'); const status = await h.call('core_status'); assert.equal(status.composition, 'manual'); assert.equal(status.manualPolicy, 'current-matching-target-after-local-confirmation-v1'); assert.ok(status.resourceProvider); assert.equal(status.automaticLifecycle, 'unavailable'); assert.deepEqual((await h.call('list_modules')).modules.map(m => m.id), ['photo-placeholder', 'titles', 'titles-current-target', 'project-inspection']); assert.equal((await h.call('get_module_contract', { moduleId: 'titles-current-target' })).operationId, 'set-current-text'); }
  finally { await h.close(); }
});
test('installed-composition installed format2 corruption/missing composition rejects before imports and legacy format1 generic verification stays generic', () => {
  const f = install(buildPackage(root, 'readonly')), composition = path.join(f.d.releaseDir, 'runtime/composition.json'), bytes = fs.readFileSync(composition);
  const rejectedChild = pattern => { const result = spawnSync(process.execPath, [path.join(f.d.releaseDir, 'runtime/stdio-entry.js'), '--installation', f.descriptor], { input: '', encoding: 'utf8', timeout: 5000, windowsHide: true }); assert.equal(result.status, 1); assert.match(result.stderr, pattern); assert.equal(result.stdout, ''); };
  fs.writeFileSync(composition, '{}'); assert.throws(() => verifyInstallation(f.descriptor), /installed_release_bytes/); rejectedChild(/installed_release_bytes/); fs.writeFileSync(composition, bytes);
  fs.renameSync(composition, composition + '.missing'); assert.throws(() => verifyInstallation(f.descriptor), /release_tree_mismatch/); rejectedChild(/release_tree_mismatch/); fs.renameSync(composition + '.missing', composition);
  const dir = temp(), source = 'historical generic release'; fs.writeFileSync(path.join(dir, 'data'), source); const release = { version: '4.0.0', format: 1, hashes: { data: hash(source) } }; fs.writeFileSync(path.join(dir, 'release.json'), canonical(release)); assert.doesNotThrow(() => verifyRelease(dir, release));
  assert.throws(() => verifyCep(f.d, { ...JSON.parse(fs.readFileSync(path.join(f.d.releaseDir, 'release.json'))), format: 99 }, f.d.cepDir));
});

```

## core4/config/compositions/manual-layer-overlay.json

SHA-256 3de1de3f484c8c4e7785bf5a96071eb8b45ccea2055fe3e329be150506a15fcd

```json
{
  "parent": "manual-media-layers",
  "modules": ["layer-overlay"],
  "assets": [
    {
      "assetKey": "layer-overlay-v1",
      "moduleId": "layer-overlay",
      "path": "modules/layer-overlay",
      "admission": "config/admissions/layer-overlay.json",
      "policy": "current-matching-target-after-local-confirmation-v1",
      "phases": ["inspect", "mutate", "verify"]
    }
  ],
  "profiles": {
    "media-import": { "operationId": "ingest-footage", "resultProfile": "media-import-v1", "operatorConfirmation": "registry-v1" },
    "layer-overlay": { "operationId": "duplicate-and-replace-still", "resultProfile": "layer-overlay-v1", "operatorConfirmation": "registry-v1" }
  },
  "bundle": {
    "files": ["runtime/layer-overlay-proof.js", "config/admissions/layer-overlay.json"],
    "artifactClosures": ["modules/layer-overlay/artifact.json"]
  }
}

```

## core4/config/compositions/manual-media-layers.json

SHA-256 49f9c5261365923eb576597054533d9f5574c650e2a286f2efafbc5efe3a6041

```json
{
  "parent": "operator-titles-photo-pilot",
  "modules": ["media-import", "layer-insert"],
  "assets": [
    {
      "assetKey": "media-import-v1",
      "moduleId": "media-import",
      "path": "modules/media-import",
      "admission": "config/admissions/media-import.json",
      "policy": "current-matching-target-after-local-confirmation-v1",
      "phases": ["inspect", "mutate", "verify"]
    },
    {
      "assetKey": "layer-insert-v1",
      "moduleId": "layer-insert",
      "path": "modules/layer-insert",
      "admission": "config/admissions/layer-insert.json",
      "policy": "current-matching-target-after-local-confirmation-v1",
      "phases": ["inspect", "mutate", "verify"]
    }
  ],
  "profiles": {
    "media-import": { "operationId": "ingest-footage", "resultProfile": "media-import-v1" },
    "layer-insert": { "operationId": "insert-footage-layer", "resultProfile": "layer-insert-v1" }
  },
  "bundle": {
    "files": ["runtime/media-layer-proof.js", "runtime/layer-insert-proof.js", "config/admissions/media-import.json", "config/admissions/layer-insert.json"],
    "artifactClosures": ["modules/media-import/artifact.json", "modules/layer-insert/artifact.json"]
  }
}

```

## core4/config/compositions/manual-project-assembly.json

SHA-256 3daaebbb72834039e8ae1fe4a7a72ec3696ea35984f6b523896c235af8a4ad67

```json
{
  "parent": "manual-titles-variants",
  "modules": ["project-assembly"],
  "assets": [
    {
      "assetKey": "project-assembly-v1",
      "moduleId": "project-assembly",
      "path": "modules/project-assembly",
      "admission": "config/admissions/project-assembly.json",
      "policy": "current-matching-target-after-local-confirmation-v1",
      "phases": ["inspect", "mutate", "verify"]
    }
  ],
  "profiles": {
    "project-assembly": {
      "operationId": "assemble-composition",
      "resultProfile": "owned-project-assembly-v1"
    }
  },
  "bundle": {
    "files": ["runtime/project-assembly-proof.js", "config/admissions/project-assembly.json"],
    "artifactClosures": ["modules/project-assembly/artifact.json"]
  }
}

```

## core4/config/compositions/manual-project-lifecycle.json

SHA-256 6b575fb3fd433108315cd3dc4c0ea3ecd5cdafdb26626569962dd1521685b9c4

```json
{
  "parent": "manual-project-save",
  "modules": ["project-lifecycle"],
  "assets": [
    {
      "assetKey": "project-lifecycle-v1",
      "moduleId": "project-lifecycle",
      "path": "modules/project-lifecycle",
      "admission": "config/admissions/project-lifecycle.json",
      "policy": "current-matching-target-after-local-confirmation-v1",
      "phases": ["inspect", "mutate", "verify"]
    }
  ],
  "profiles": {
    "project-lifecycle": {
      "operationId": "transition-project",
      "resultProfile": "project-lifecycle-v1"
    }
  },
  "bundle": {
    "files": ["runtime/project-lifecycle-proof.js", "config/admissions/project-lifecycle.json"],
    "artifactClosures": ["modules/project-lifecycle/artifact.json"]
  }
}

```

## core4/config/compositions/manual-project-save.json

SHA-256 71e948f4b26ec098056f06748733f1f8cc81db98c85322fa32558a30e44980d7

```json
{
  "parent": "manual-project-assembly",
  "modules": ["project-save"],
  "assets": [
    {
      "assetKey": "project-save-v1",
      "moduleId": "project-save",
      "path": "modules/project-save",
      "admission": "config/admissions/project-save.json",
      "policy": "current-matching-target-after-local-confirmation-v1",
      "phases": ["inspect", "mutate", "verify"]
    }
  ],
  "profiles": {
    "project-save": {
      "operationId": "save-current-project",
      "resultProfile": "current-project-save-v1"
    }
  },
  "bundle": {
    "files": ["runtime/project-file.js", "runtime/project-save-proof.js", "config/admissions/project-save.json"],
    "artifactClosures": ["modules/project-save/artifact.json"]
  }
}

```

## core4/config/compositions/manual-titles-variants.json

SHA-256 d753f1281f329d11af6201cc26ad495af00eb7780801a5c3b3b6c3d868cddd43

```json
{
  "parent": "manual-titles",
  "modules": [
    "text-variant",
    "comp-render"
  ],
  "assets": [
    {
      "assetKey": "text-variant-v1",
      "moduleId": "text-variant",
      "path": "modules/text-variant",
      "admission": "config/admissions/text-variant.json",
      "policy": "current-matching-target-after-local-confirmation-v1",
      "phases": [
        "inspect",
        "mutate",
        "verify"
      ]
    },
    {
      "assetKey": "comp-render-v1",
      "moduleId": "comp-render",
      "path": "modules/comp-render",
      "admission": "config/admissions/comp-render.json",
      "policy": "current-matching-target-after-local-confirmation-v1",
      "phases": [
        "inspect",
        "mutate",
        "verify"
      ]
    }
  ],
  "profiles": {
    "text-variant": {
      "operationId": "stage-text-variant",
      "resultProfile": "owned-text-variant-v1"
    },
    "comp-render": {
      "operationId": "render-text-variant",
      "resultProfile": "owned-comp-render-v1"
    }
  },
  "bundle": {
    "files": [
      "runtime/text-variant-proof.js",
      "config/admissions/text-variant.json",
      "runtime/comp-render-proof.js",
      "config/admissions/comp-render.json"
    ],
    "artifactClosures": [
      "modules/text-variant/artifact.json",
      "modules/comp-render/artifact.json"
    ]
  }
}

```

## core4/config/compositions/operator-frame-export.json

SHA-256 5f7a62df765d07330a30e4e8250ebdf06c06f34e6472fb5445964132954faa39

```json
{
  "parent": "operator-workflows",
  "modules": ["comp-frame-export"],
  "assets": [
    {
      "assetKey": "comp-frame-export-v1",
      "moduleId": "comp-frame-export",
      "path": "modules/comp-frame-export",
      "admission": "config/admissions/comp-frame-export.json",
      "policy": "current-matching-target-after-local-confirmation-v1",
      "phases": ["inspect", "mutate", "verify"]
    }
  ],
  "profiles": {
    "comp-frame-export": {
      "operationId": "save-comp-frame-png",
      "resultProfile": "comp-frame-export-v1",
      "operatorConfirmation": "registry-v1"
    }
  },
  "bundle": {
    "files": ["runtime/comp-frame-export-proof.js", "runtime/png-proof.js", "config/admissions/comp-frame-export.json"],
    "artifactClosures": ["modules/comp-frame-export/artifact.json"]
  }
}

```

## core4/config/compositions/operator-photo-montage.json

SHA-256 f8b9322e6e5b0fe2f9517b72a635f287c74bce50b75b0e0a8efc8fffc14738d4

```json
{
  "parent": "readonly",
  "modules": ["media-import", "layer-overlay", "comp-frame-export"],
  "assets": [
    {
      "assetKey": "media-import-v1",
      "moduleId": "media-import",
      "path": "modules/media-import",
      "admission": "config/admissions/media-import.json",
      "policy": "current-matching-target-after-local-confirmation-v1",
      "phases": ["inspect", "mutate", "verify"]
    },
    {
      "assetKey": "layer-overlay-v1",
      "moduleId": "layer-overlay",
      "path": "modules/layer-overlay",
      "admission": "config/admissions/layer-overlay.json",
      "policy": "current-matching-target-after-local-confirmation-v1",
      "phases": ["inspect", "mutate", "verify"]
    },
    {
      "assetKey": "comp-frame-export-v1",
      "moduleId": "comp-frame-export",
      "path": "modules/comp-frame-export",
      "admission": "config/admissions/comp-frame-export.json",
      "policy": "current-matching-target-after-local-confirmation-v1",
      "phases": ["inspect", "mutate", "verify"]
    }
  ],
  "profiles": {
    "media-import": {
      "operationId": "ingest-footage",
      "resultProfile": "media-import-v1",
      "operatorConfirmation": "registry-v1"
    },
    "layer-overlay": {
      "operationId": "duplicate-and-replace-still",
      "resultProfile": "layer-overlay-v1",
      "operatorConfirmation": "registry-v1"
    },
    "comp-frame-export": {
      "operationId": "save-comp-frame-png",
      "resultProfile": "comp-frame-export-v1",
      "operatorConfirmation": "registry-v1"
    }
  },
  "bundle": {
    "files": [
      "runtime/manual-policy.js",
      "runtime/windows-reservation-provider.js",
      "runtime/operator-confirmation.js",
      "runtime/montage-mandate.js",
      "runtime/project-file.js",
      "runtime/media-layer-proof.js",
      "runtime/layer-overlay-proof.js",
      "runtime/comp-frame-export-proof.js",
      "runtime/png-proof.js",
      "config/admissions/media-import.json",
      "config/admissions/layer-overlay.json",
      "config/admissions/comp-frame-export.json"
    ],
    "artifactClosures": [
      "plan-engine/artifact.json",
      "modules/media-import/artifact.json",
      "modules/layer-overlay/artifact.json",
      "modules/comp-frame-export/artifact.json"
    ]
  }
}

```

## core4/config/compositions/operator-render-jobs.json

SHA-256 058d0a3a8f46721cf9868f6bd90e6afa6879630ed5b69b9cc2d967cf69189a99

```json
{
  "parent": "operator-workflows-montage",
  "modules": [],
  "assets": [],
  "profiles": {},
  "bundle": {
    "files": [
      "runtime/render-job-owner.js",
      "runtime/aerender-jobs.js",
      "runtime/aerender-profile.js"
    ],
    "artifactClosures": []
  }
}

```

## core4/config/compositions/operator-titles-photo-pilot.json

SHA-256 b7735443e35d5ac7408c5fd571ce7e4b47dab400ef0f967c874b7ceb0e456c53

```json
{
  "parent": "operator-titles-pilot",
  "modules": [],
  "assets": [],
  "profiles": {
    "photo-placeholder": {
      "operationId": "replace-source",
      "resultProfile": "photo-source-v1",
      "operatorConfirmation": true
    }
  },
  "bundle": {
    "files": [],
    "artifactClosures": []
  }
}

```

## core4/config/compositions/operator-titles-pilot.json

SHA-256 54b2659a4e642e07c896a14ec14e8b1ca7ebffd03fd425dd6ed28f02cdd96930

```json
{
  "parent": "manual-project-lifecycle",
  "modules": [],
  "assets": [],
  "profiles": {
    "titles-current-target": {
      "operationId": "set-current-text",
      "resultProfile": "manual-text-v1",
      "operatorConfirmation": true
    }
  },
  "bundle": {
    "files": ["runtime/operator-confirmation.js"],
    "artifactClosures": []
  }
}

```

## core4/config/compositions/operator-workflows-montage.json

SHA-256 2d42eed066411df9de75527fbd96a5c33641b3e02f424f10c0e5b57a0b10fd1f

```json
{
  "parent": "operator-frame-export",
  "modules": ["layer-overlay"],
  "assets": [
    {
      "assetKey": "layer-overlay-v1",
      "moduleId": "layer-overlay",
      "path": "modules/layer-overlay",
      "admission": "config/admissions/layer-overlay.json",
      "policy": "current-matching-target-after-local-confirmation-v1",
      "phases": ["inspect", "mutate", "verify"]
    }
  ],
  "profiles": {
    "layer-overlay": {
      "operationId": "duplicate-and-replace-still",
      "resultProfile": "layer-overlay-v1",
      "operatorConfirmation": "registry-v1"
    }
  },
  "bundle": {
    "files": ["runtime/montage-mandate.js", "runtime/layer-overlay-proof.js", "config/admissions/layer-overlay.json"],
    "artifactClosures": ["modules/layer-overlay/artifact.json"]
  }
}

```

## core4/config/compositions/operator-workflows.json

SHA-256 894daf8f8073a337a6f136a60582d2205b37d147fb88a780faddf40890330b90

```json
{
  "parent": "manual-media-layers",
  "modules": [],
  "assets": [],
  "profiles": {
    "titles-point-layout": { "operationId": "measure-or-apply-point-layout", "resultProfile": "manual-point-layout-v1", "operatorConfirmation": "registry-v1" },
    "text-layer": { "operationId": "write-point-text", "resultProfile": "owned-text-layer-v1", "operatorConfirmation": "registry-v1" },
    "text-variant": { "operationId": "stage-text-variant", "resultProfile": "owned-text-variant-v1", "operatorConfirmation": "registry-v1" },
    "comp-render": { "operationId": "render-text-variant", "resultProfile": "owned-comp-render-v1", "operatorConfirmation": "registry-v1" },
    "project-assembly": { "operationId": "assemble-composition", "resultProfile": "owned-project-assembly-v1", "operatorConfirmation": "registry-v1" },
    "project-save": { "operationId": "save-current-project", "resultProfile": "current-project-save-v1", "operatorConfirmation": "registry-v1" },
    "project-lifecycle": { "operationId": "transition-project", "resultProfile": "project-lifecycle-v1", "operatorConfirmation": "registry-v1" },
    "media-import": { "operationId": "ingest-footage", "resultProfile": "media-import-v1", "operatorConfirmation": "registry-v1" },
    "layer-insert": { "operationId": "insert-footage-layer", "resultProfile": "layer-insert-v1", "operatorConfirmation": "registry-v1" }
  },
  "bundle": { "files": [], "artifactClosures": [] }
}

```

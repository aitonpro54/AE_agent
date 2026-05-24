# M205 Duplicate Layers Planner/Repair Design

Дата: 2026-05-24

## Цель

Сделать уже реализованный runtime tool `duplicate_layers` видимым для Agent planner и bounded plan repair, не расширяя runtime-поведение и не добавляя live AE/CEP мутации.

## Изменения

- `duplicate_layers` добавлен в planner-visible `PLANNING_TOOL_NAMES`, поэтому `planningToolCatalog()` теперь показывает его как mutating typed MCP tool с required `layerIndices`.
- Planner guidance явно разделяет:
  - `duplicate_layer` для одного явного слоя;
  - `duplicate_layers` для явного bulk duplicate по concrete `layerIndices`;
  - selected-layer duplicate только после read-only `get_selected_layers` evidence с binding `{{selectedLayerIndices}}`;
  - `deep_duplicate_precomp_sources` для selected precomp/source workflows.
- Plan repair получил только plural/selected aliases:
  - `duplicateLayers`, `copyLayers`, `cloneLayers`;
  - `bulkDuplicateLayers`, `bulkCopyLayers`;
  - `duplicateSelectedLayers`, `copySelectedLayers`, `cloneSelectedLayers`.
- Arg aliases добавлены для duplicate-many формы:
  - `layerIndexes` / `selectedLayerIndexes` уже канонизируются в `layerIndices`;
  - `layerNames` / `sourceLayerNames` канонизируются в `sourceNames`;
  - `suffix` / `copySuffix` / `duplicateSuffix` / `nameSuffix` канонизируются в `nameSuffix`.

## Fail-Closed Boundaries

M205 не маршрутизирует в `duplicate_layers`:

- layer deletion или destructive cleanup;
- source/precomp relinking или deep source duplication;
- mask/path editing;
- audio workflows;
- selection-only duplicate без prior read-only selected-layer evidence.

Если plan repair видит `duplicateSelectedLayers` без предыдущего `get_selected_layers` / `get_active_comp` selected-layer evidence, он может исправить имя tool на `duplicate_layers`, но не придумывает `layerIndices` и оставляет validation failed. Это сохраняет запрет на selected-layer execution без доказательства выбранных слоёв.

## Validation Scope

Локальное покрытие:

- `plan-repair-smoke` проверяет:
  - explicit bulk alias repair to `duplicate_layers`;
  - `layerNames` -> `sourceNames`;
  - `suffix` -> `nameSuffix`;
  - selected-layer duplicate with prior `get_selected_layers` evidence receives `resultBindings.layerIndices = "{{selectedLayerIndices}}"`;
  - selected-layer duplicate without prior evidence stays invalid and does not invent `layerIndices`;
  - selected precomp pseudo workflow remains repaired to `deep_duplicate_precomp_sources`.
- `chatgpt-connector-smoke` keeps `duplicate_layers` banned from the read-only ChatGPT connector tool surface.
- `agent-scenario-fixtures` classifies `duplicate_layers` as mutating for generated planner-corpus expectations.

## Out Of Scope

Semantic verification, solution-library guidance, generated-only live lane, CEP panel UI, dependency changes, package manifests, push, PR, and live AE/CEP validation remain later queue items or explicitly forbidden for this item.

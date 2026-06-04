# Rename Selected Layers With Text Typed Plan

## Goal

Переименовать выбранные слои в один явный user-provided text через существующие typed bridge tools.

## Applies When

- Пользователь просит переименовать выбранные слои в конкретный текст.
- Активная композиция и выбранные слои должны быть подтверждены перед мутацией.
- Target text должен быть явно предоставлен пользователем; пустой target text недопустим.
- Все затронутые выбранные слои должны получить same exact text, без автоматической нумерации.
- Для нескольких выбранных слоев план должен сохранять exact text semantics и не полагаться на multi-layer exact auto-numbering.
- Задача не требует prefix/suffix rename, numbered or lettered sequence rename, find/replace, project item rename, source relinking, layer timing changes, marker edits, layer reordering, expressions, render queue changes or raw script execution.

## Plan Pattern

1. Run `get_active_comp` to confirm the active comp and capture the target composition identity.
2. Run `get_selected_layers` and bind concrete selected `layerIndex` values only from that read-only evidence.
3. Choose one explicit non-empty user-provided `targetName`.
4. Run one `rename_layers` step per concrete selected layer with the inspected comp target, `layerIndices:[layerIndex]`, `mode:"exact"`, and the same explicit `name` value for that layer.
5. Include `verifyAfter:true` and a stable `idempotencyKeyTemplate` on each mutating exact rename step.
6. Run `get_comp_details` for the same comp and report layer-name read-back evidence for every affected selected layer.

## Safety Gates

- Mutating selected-layer workflow.
- Requires validated Agent plan, dry-run, explicit confirmation, `allowMutations:true`, idempotency and post-mutation read-back.
- Use checkpoint or edit-session protection for confirmed live runs.
- Do not infer selected layers without `get_selected_layers` evidence.
- Do not use a single multi-layer exact `rename_layers` call unless the user explicitly wants the typed tool's `{index}`/`{n}` templating or automatic unpadded numbering behavior.
- Do not use this recipe for prefix/suffix rename, numbered or lettered sequence rename, find/replace rename, project item rename, source relinking, layer timing, marker edits, render queue changes or broad cleanup.

## Verification

- Each selected layer is renamed to the exact requested target text on its concrete selected-layer index.
- Each `rename_layers` result reports `changedCount:1` and includes before/after rename evidence for the targeted layer.
- The post-run `get_comp_details` read-back shows the same exact requested text on every affected selected layer.
- The plan contains only active-comp inspection, selection inspection, one typed exact rename mutation per selected layer and comp read-back.

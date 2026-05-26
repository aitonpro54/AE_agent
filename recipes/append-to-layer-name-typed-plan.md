# Append To Layer Name Typed Plan

## Goal

Добавить явный пользовательский prefix к именам выбранных слоев через существующие typed bridge tools.

## Applies When

- Пользователь просит добавить текст в начало имен выбранных слоев.
- Активная композиция и выбранные слои должны быть подтверждены перед мутацией.
- Prefix должен быть явно предоставлен пользователем или явно выбран планом перед подтверждением; пустой prefix недопустим.
- Задача не требует переименования project items, изменения порядка слоев, тайминга, маркеров, источников, выражений или raw script execution.

## Plan Pattern

1. Run `get_active_comp` to confirm the active comp and capture the target composition identity.
2. Run `get_selected_layers` and bind concrete selected `layerIndex` values only from that read-only evidence.
3. Choose one explicit non-empty user-provided `prefix` for the batch.
4. Run `rename_layers` once with the inspected comp target, concrete `layerIndices`, `mode:"prefix"`, and the explicit `prefix`.
5. Include `verifyAfter:true` and a stable `idempotencyKeyTemplate` on the mutating rename step.
6. Run `get_comp_details` for the same comp and report layer-name read-back evidence for every affected selected layer.

## Safety Gates

- Mutating selected-layer workflow.
- Requires validated Agent plan, dry-run, explicit confirmation, `allowMutations:true`, idempotency and post-mutation read-back.
- Use checkpoint or edit-session protection for confirmed live runs.
- Do not infer selected layers without `get_selected_layers` evidence.
- Do not use this recipe for suffix, find/replace, exact rename, project item rename, source relinking, layer timing, marker edits, render queue changes or broad cleanup.

## Verification

- Each affected selected layer name starts with the requested `prefix`.
- The `rename_layers` result reports `changedCount` matching the selected-layer count and includes before/after rename evidence.
- The post-run `get_comp_details` read-back shows the expected prefixed names on the same layer indices.
- The plan contains only active-comp inspection, selection inspection, one typed prefix rename mutation and comp read-back.

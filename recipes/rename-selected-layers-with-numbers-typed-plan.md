# Rename Selected Layers With Numbers Typed Plan

## Goal

Переименовать выбранные слои в явный base name с zero-padded sequence numbers через существующие typed bridge tools.

## Applies When

- Пользователь просит переименовать выбранные слои с порядковыми номерами.
- Активная композиция и выбранные слои должны быть подтверждены перед мутацией.
- Base name должен быть явно предоставлен пользователем; пустой base name недопустим.
- Sequence width должен быть явным: пользовательский zero-padding width или минимальная ширина, достаточная для выбранного количества слоев.
- Задача не требует project item rename, source relinking, layer timing changes, marker edits, layer reordering, expressions, render queue changes or raw script execution.

## Plan Pattern

1. Run `get_active_comp` to confirm the active comp and capture the target composition identity.
2. Run `get_selected_layers` and bind concrete selected `layerIndex` values only from that read-only evidence.
3. Choose one explicit non-empty user-provided base name and one explicit zero-padding width.
4. Compute every target name before mutation, for example `Shot 001`, `Shot 002` and `Shot 003`.
5. Run one `rename_layers` step per concrete selected layer with the inspected comp target, `layerIndices:[layerIndex]`, `mode:"exact"`, and the precomputed `name` for that layer.
6. Include `verifyAfter:true` and a stable `idempotencyKeyTemplate` on each mutating exact rename step.
7. Run `get_comp_details` for the same comp and report layer-name read-back evidence for every affected selected layer.

## Safety Gates

- Mutating selected-layer workflow.
- Requires validated Agent plan, dry-run, explicit confirmation, `allowMutations:true`, idempotency and post-mutation read-back.
- Use checkpoint or edit-session protection for confirmed live runs.
- Do not infer selected layers without `get_selected_layers` evidence.
- Do not use multi-layer exact `rename_layers` for zero-padded names because the typed tool appends unpadded numbers when one exact name targets multiple layers.
- Do not use this recipe for prefix/suffix rename, find/replace rename, project item rename, source relinking, layer timing, marker edits, render queue changes or broad cleanup.

## Verification

- Each selected layer is renamed to the precomputed base-plus-zero-padded-number target for its concrete selected-layer order.
- Each `rename_layers` result reports `changedCount:1` and includes before/after rename evidence for the targeted layer.
- The post-run `get_comp_details` read-back shows the expected exact names on the same layer indices.
- The plan contains only active-comp inspection, selection inspection, one typed exact rename mutation per selected layer and comp read-back.

# Rename Selected Layers With Letters Typed Plan

## Goal

Переименовать выбранные слои в явный base name with letter suffixes через существующие typed bridge tools.

## Applies When

- Пользователь просит переименовать выбранные слои с буквенными suffixes, например `Shot A`, `Shot B` and `Shot C`.
- Активная композиция и выбранные слои должны быть подтверждены перед мутацией.
- Base name должен быть явно предоставлен пользователем; пустой base name недопустим.
- Letter suffixes должны быть однозначными для количества выбранных слоев.
- Если количество выбранных слоев делает suffixes неоднозначными или дублирующимися, план должен попросить explicit user-provided target names вместо попытки угадать.
- Задача не требует project item rename, source relinking, layer timing changes, marker edits, layer reordering, expressions, render queue changes or raw script execution.

## Plan Pattern

1. Run `get_active_comp` to confirm the active comp and capture the target composition identity.
2. Run `get_selected_layers` and bind concrete selected `layerIndex` values only from that read-only evidence.
3. Choose one explicit non-empty user-provided base name.
4. Use only an unambiguous ordered suffix list for the inspected selected-layer count, such as `A`, `B` and `C` for three selected layers.
5. If the selected-layer count exceeds the available explicit suffix list, would require wrapping back to `A`, or would require inferred double-letter suffixes such as `AA`, ask for explicit user-provided target names instead of guessing.
6. Compute every target name before mutation, for example `Shot A`, `Shot B` and `Shot C`.
7. Run one `rename_layers` step per concrete selected layer with the inspected comp target, `layerIndices:[layerIndex]`, `mode:"exact"`, and the precomputed `name` for that layer.
8. Include `verifyAfter:true` and a stable `idempotencyKeyTemplate` on each mutating exact rename step.
9. Run `get_comp_details` for the same comp and report layer-name read-back evidence for every affected selected layer.

## Safety Gates

- Mutating selected-layer workflow.
- Requires validated Agent plan, dry-run, explicit confirmation, `allowMutations:true`, idempotency and post-mutation read-back.
- Use checkpoint or edit-session protection for confirmed live runs.
- Do not infer selected layers without `get_selected_layers` evidence.
- Do not use multi-layer exact `rename_layers` for lettered names because each target name must be computed and verified independently.
- Do not invent `AA`, `AB`, wrapping or repeated suffixes when the selected-layer count is ambiguous; ask for explicit user-provided target names.
- Do not use this recipe for prefix/suffix rename, find/replace rename, project item rename, source relinking, layer timing, marker edits, render queue changes or broad cleanup.

## Verification

- Each selected layer is renamed to the precomputed base-plus-letter-suffix target for its concrete selected-layer order.
- Each `rename_layers` result reports `changedCount:1` and includes before/after rename evidence for the targeted layer.
- The post-run `get_comp_details` read-back shows the expected exact letter-suffix names on the same layer indices.
- The plan contains only active-comp inspection, selection inspection, one typed exact rename mutation per selected layer and comp read-back.

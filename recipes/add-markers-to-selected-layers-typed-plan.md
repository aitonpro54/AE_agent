# Add Markers To Selected Layers Typed Plan

## Goal

Добавить явный layer marker на каждый выбранный слой через существующие typed bridge tools, с пользовательским комментарием или безопасным non-empty default comment.

## Applies When

- Пользователь просит добавить marker к выбранным слоям.
- Активная композиция и выбранные слои должны быть подтверждены перед мутацией.
- Комментарий marker может быть указан пользователем; если он не указан, план должен явно выбрать короткий default comment перед подтверждением.
- Задача не требует audio analysis, beat detection, marker generation from audio, update/delete marker lifecycle, raw script execution or timeline-wide cleanup.

## Plan Pattern

1. Run `get_active_comp` to confirm the active comp and capture the current time if the user did not provide a marker time.
2. Run `get_selected_layers` and bind concrete selected `layerIndex` values only from that read-only evidence.
3. Choose a single explicit marker time for the batch: the user-provided time or the active comp current time from `get_active_comp`.
4. For each selected layer, run one `add_layer_marker` step with the inspected comp target, concrete `layerIndex`, explicit `time`, and non-empty `comment`.
5. Include `verifyAfter:true` and a stable `idempotencyKeyTemplate` on each mutating marker step.
6. Run `get_layer_details` for each affected layer and report marker read-back evidence.

## Safety Gates

- Mutating selected-layer workflow.
- Requires validated Agent plan, dry-run, explicit confirmation, `allowMutations:true`, idempotency and post-mutation read-back.
- Use checkpoint or edit-session protection for confirmed live runs.
- Do not infer selected layers without `get_selected_layers` evidence.
- Do not use this recipe for audio-derived markers, deleting or updating markers, changing layer timing, render queue changes or broad timeline cleanup.

## Verification

- Each selected layer has one matching marker read back by `get_layer_details`.
- The marker read-back reports the expected `comment`, `time` and optional `duration`.
- The plan contains only selection inspection, one typed marker-add mutation per selected layer, and marker read-back.

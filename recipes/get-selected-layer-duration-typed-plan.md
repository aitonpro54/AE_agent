# Get Selected Layer Duration Typed Plan

## Goal

Сообщить visible duration выбранного слоя через read-only typed bridge tools.

## Applies When

- Пользователь просит duration выбранного слоя в секундах.
- Активная композиция и selected layer evidence должны быть прочитаны перед ответом.
- Duration вычисляется из read-only layer timing fields как `outPoint - inPoint`.
- Если выбранных слоев несколько и пользователь просит один "current" layer, план должен попросить уточнить слой или явно report duration for each selected layer instead of guessing a primary selection.
- Задача не требует изменения layer timing, markers, names, sources, effects, expressions, render queue or raw script execution.

## Plan Pattern

1. Run `get_active_comp` to confirm the active comp and capture the target composition identity.
2. Run `get_selected_layers` and bind concrete selected `layerIndex` values only from that read-only evidence.
3. If no selected layers are returned, fail closed with a clear "select a layer first" message.
4. If exactly one layer is selected, compute `durationSeconds = outPoint - inPoint` from the selected layer evidence.
5. If multiple layers are selected, either compute and report `durationSeconds` for each selected layer or ask which layer to inspect when the user requested a single layer.
6. Run `get_layer_details` for each reported layer when a more detailed read-back is needed, then compute the same `outPoint - inPoint` from `layer.inPoint` and `layer.outPoint`.
7. Report layer name, layer index, `inPoint`, `outPoint`, and duration in seconds. Round only for display; keep the raw read-back values available in evidence.

## Safety Gates

- Read-only selected-layer workflow.
- Requires normal Agent plan validation, but no mutation permission, confirmation, checkpoint, edit session, idempotency key, or post-mutation verification.
- Do not infer selected layers without `get_selected_layers` evidence.
- Do not guess a primary selection when multiple layers are selected.
- Do not mutate timing with `set_layer_time_range`, `stagger_layers`, `split_layers_at_time`, or any other project-changing tool.
- Do not use this recipe for changing duration, trimming layers, aligning layers, marker edits, name changes, source relinking, effects, render queue changes or broad timeline cleanup.

## Verification

- The response cites selected-layer evidence from `get_selected_layers`.
- Each reported duration equals `outPoint - inPoint` for the same layer index and name.
- Optional `get_layer_details` read-back matches the selected layer and provides the same `inPoint`/`outPoint` timing evidence.
- The plan contains only active-comp inspection, selected-layer inspection, optional layer-detail read-back and arithmetic/reporting.

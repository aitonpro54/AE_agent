# Calculate Distance Between Layers Typed Plan

## Goal

Сообщить расстояние между двумя слоями через read-only typed bridge tools.

## Applies When

- Пользователь просит calculate/measure distance between two layers.
- Активная композиция и выбранные или явно указанные layers должны быть прочитаны перед расчетом.
- Расстояние вычисляется из typed read-back position evidence как Euclidean distance между двумя layer position values.
- Если выбрано не ровно два слоя и пользователь не указал конкретную пару, план должен попросить выбрать или назвать два слоя instead of guessing a pair.
- Задача не требует изменения positions, transforms, timing, names, sources, effects, expressions, render queue, or raw script execution.

## Plan Pattern

1. Run `get_active_comp` to confirm the active comp and capture the target composition identity plus current comp time when available.
2. Run `get_selected_layers` when the user refers to selected layers, and bind concrete selected `layerIndex` and `name` values only from that evidence.
3. If the request names explicit layers, use prior comp/layer evidence or run `get_layer_details` for the explicit `layerIndex` values instead of inferring from display text alone.
4. If no concrete two-layer pair can be established, fail closed with a clear request to select or identify exactly two layers.
5. Run `get_layer_details` for both target layers and read their transform position evidence at the active comp time or the typed-tool default sample time.
6. If either layer lacks usable position evidence, report the typed-tool gap and do not use raw script execution as a workaround.
7. Compute `distance = sqrt((x2 - x1)^2 + (y2 - y1)^2)` for 2D position evidence. Include `(z2 - z1)^2` only when both read-back positions include a numeric z component.
8. Report both layer names, layer indices, sampled position values, coordinate dimensionality, sample time when available, and distance in comp pixels. Round only for display; keep raw values in evidence.

## Safety Gates

- Read-only layer measurement workflow.
- Requires normal Agent plan validation, but no mutation permission, confirmation, checkpoint, edit session, idempotency key, or post-mutation verification.
- Do not infer a layer pair without `get_selected_layers`, `get_layer_details`, or equivalent typed read-back evidence.
- Do not guess a primary or nearest layer when more than two layers are selected.
- Do not mutate transforms with `set_layer_transform`, `set_property_keyframes`, alignment tools, expressions, timing tools, rename tools, duplicate tools, or any other project-changing tool.
- Do not use this recipe for changing distance, aligning layers, moving layers, parenting, camera/null setup, 3D orientation, collision tests, masks, expressions, render queue changes, or broad timeline cleanup.

## Verification

- The response cites `get_active_comp` and concrete two-layer evidence before distance is reported.
- Selected-layer workflows include `get_selected_layers` evidence before layer indices are bound.
- `get_layer_details` read-back for both layers includes usable position values from the same comp and sample-time context.
- The reported distance equals the Euclidean distance computed from the cited position values, with z included only when both positions are 3D.
- The plan contains only active-comp inspection, selected-layer inspection when needed, layer-detail read-back, arithmetic, and reporting.

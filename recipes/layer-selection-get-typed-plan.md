# Layer Selection Get Typed Plan

## Goal

Сообщить текущий selected layer selection snapshot активной композиции через read-only typed bridge tools.

## Applies When

- Пользователь просит get/read/show/list the selected layers or current layer selection.
- Активная композиция должна быть прочитана перед ответом.
- Selection state берется только из typed read-back evidence, primarily `get_selected_layers`.
- Если selected layers отсутствуют, план сообщает empty selection and asks the user to select layers when the task requires a selection.
- Задача не требует changing selection, selecting by type/label/randomness, layer mutations, timing/name/source/effect changes, render queue work, or raw script execution.

## Plan Pattern

1. Run `get_active_comp` to confirm the active comp and capture the target composition identity.
2. Run `get_selected_layers` and treat its returned layer list as the authoritative selection snapshot.
3. If no selected layers are returned, report selected layer count `0` and do not infer a selection from visible layer names or previous chat context.
4. For each selected layer, report the available `layerIndex`, name, layer type, timing fields and any other fields returned by `get_selected_layers`.
5. Run `get_layer_details` only when the user needs more detail for a concrete selected layer index returned by `get_selected_layers`.
6. Report selected layer count, selected layer indices, names, and optional detail read-back. Keep ordering exactly as returned by the typed tools.

## Safety Gates

- Read-only layer selection inspection workflow.
- Requires normal Agent plan validation, but no mutation permission, confirmation, checkpoint, edit session, idempotency key, or post-mutation verification.
- Do not infer selected layers without `get_selected_layers` evidence.
- Do not change selection state or call any selection-setting workaround.
- Do not use this recipe for selecting layers, deselecting layers, random/type/label selection, layer duplication, renaming, timing edits, marker edits, effect edits, source relinking, render queue changes or broad timeline cleanup.

## Verification

- The response cites `get_active_comp` and `get_selected_layers` evidence before selected layer information is reported.
- The selected layer count equals the number of layer entries returned by `get_selected_layers`.
- Each reported selected `layerIndex` and name comes from the same selected layer evidence or optional `get_layer_details` read-back for that exact index.
- Empty selection is reported as an empty selection, not as an error that triggers raw script execution.
- The plan contains only active-comp inspection, selected-layer inspection, optional layer-detail read-back and reporting.

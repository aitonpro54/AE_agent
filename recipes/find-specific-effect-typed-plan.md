# Find Specific Effect Typed Plan

## Goal

Найти слои активной или явно указанной композиции, на которых уже есть конкретный эффект, используя read-only typed bridge tools.

## Applies When

- Пользователь просит find/search/list layers that have a specific effect.
- Пользователь указывает effect matchName, например `ADBE Fill`, или exact effect instance/display name.
- Нужно сообщить matching layer indices, layer names, effect indices, effect names and optional effect properties without changing the project.
- Задача не требует adding, removing, disabling, reordering or editing effects.

## Plan Pattern

1. Run `get_active_comp` to confirm the active comp, or target an explicit comp when the request names one.
2. If the request is selected-layer scoped, run `get_selected_layers` and use only the returned concrete `layerIndex` values.
3. If the request is active-comp scoped, run `list_layers` or equivalent comp layer inspection to enumerate concrete layer indices in that comp before effect inspection.
4. For each concrete target layer, run `list_effects` with `includeProperties:false` unless the user explicitly needs property summaries.
5. Match by exact `effectMatchName` when available. If only a display/effect instance name is provided, compare exact returned names and report ambiguity instead of guessing between similarly named effects.
6. For each matched effect, run `get_effect_details` with the returned `layerIndex` and `effectIndex`, `effectName`, or `effectMatchName`; use `includeProperties:true` only when the user asks for property evidence.
7. Optionally run `get_layer_details` for matched layers when the response needs broader layer identity evidence. Report zero matches as a read-only result, not as an error.

## Safety Gates

- Read-only effect search workflow.
- Requires normal Agent plan validation, but no mutation permission, explicit confirmation, checkpoint, edit session, idempotency key, or post-mutation verification.
- Do not change selection state, add effects, remove effects, disable effects, edit effect properties, reorder effects, relink sources, rename layers, or run cleanup.
- Do not infer layer targets from prior chat context. Use `get_selected_layers`, `list_layers`, `list_effects`, `get_effect_details`, or `get_layer_details` evidence from the current comp.
- Do not use this recipe for project-wide all-comp scans unless each target comp is explicitly enumerated and inspected through typed read tools.

## Verification

- The response cites `get_active_comp` or explicit comp evidence before reporting matches.
- Selected-layer searches include `get_selected_layers` evidence before layer indices are bound.
- Active-comp searches enumerate concrete layer indices before calling `list_effects`.
- Each reported match includes layer identity, effect index/name and exact `effectMatchName` or exact returned effect name evidence from `list_effects` or `get_effect_details`.
- Optional property details come only from `get_effect_details`, and missing or ambiguous effect evidence is reported as no match or a typed-tool gap.
- The plan contains only comp/layer/effect read tools and reporting.

# Zero Position Typed Plan

## Goal

Выставить transform Position выбранных или явно указанных слоев в zero position через existing typed bridge tools.

## Applies When

- Пользователь просит set selected layers to zero position, reset selected layer positions to zero, move layer Position values to the origin, or zero out the transform Position field.
- Допустима safe adaptation: read each concrete target layer, compute a dimensionality-matched zero position, then set only the typed transform `position` field.
- Target layers are selected or explicitly identified before mutation; the plan must not guess layer targets from names or prior chat context.
- At least one concrete target layer is required.
- Position values must be numeric arrays from `get_layer_details`; use `[0, 0]` for 2D layers and `[0, 0, 0]` only when the pre-read position has a numeric z component.
- If the user needs anchor-point reset, scale/rotation/orientation reset, bounds centering, comp-space origin placement for parented layers, separated-dimension semantics, selection changes, or exact source JSX behavior, fail closed and request a separate typed-tool contract.
- Задача не требует raw script execution, deleting existing layers, source relinking, render queue changes, expressions, layer timing edits, or broad template batch updates.

## Plan Pattern

1. Run `get_active_comp` to establish the active comp identity and, when available, current time.
2. Run `get_selected_layers` when the request targets the current selection, or bind explicit layer indices only from current comp evidence.
3. Require at least one concrete target layer index before mutation.
4. Run `get_layer_details` for each concrete target layer before mutation to capture layer identity, current transform position, dimensionality, 3D state and parenting evidence.
5. Fail closed if any target lacks a numeric position array, or if the request expects comp-space/world-space zeroing that current typed evidence cannot prove.
6. Compute each layer's `zeroPosition` from its read-back dimensionality: `[0, 0]` for 2D position arrays and `[0, 0, 0]` for 3D position arrays.
7. Run one `set_layer_transform` step per verified target layer with `position:zeroPosition`; keep all other transform fields unchanged unless the user explicitly requested them and they are supported by typed evidence.
8. Include `verifyAfter:true` and a stable `idempotencyKeyTemplate` on each mutating transform step.
9. Run `get_layer_details` after mutation for every affected layer and `get_comp_details` for the target comp to confirm positions and unchanged layer membership.
10. Fail closed instead of using raw script execution when exact source JSX semantics, anchor reset, bounds centering, comp-space placement for parented layers, separated dimensions or arbitrary layer inference is required.

## Safety Gates

- Mutating layer-transform workflow.
- Requires validated Agent plan, dry-run, explicit confirmation, `allowMutations:true`, idempotency and post-mutation read-back.
- Use checkpoint or edit-session protection for confirmed live runs.
- Require selected-layer or explicit-layer evidence before binding target layer indices.
- Preserve layer names, sources, timing, effects, masks, parenting, expressions, layer order and other transform fields unless a separate typed plan explicitly covers those changes.
- Do not promise anchor-point reset, scale/rotation/orientation reset, bounds centering, selection changes, comp-space origin placement for parented layers, separated-dimension behavior, or exact source JSX semantics.
- Do not use this recipe for render queue changes, template batch changes, source relinking, expression edits, layer cleanup, effect edits, marker edits or raw ExtendScript.

## Verification

- The plan reads one target comp and every concrete target layer before any mutation.
- Selected-layer workflows include `get_selected_layers` evidence before any `set_layer_transform` step binds layer indices.
- Pre-run `get_layer_details` read-back for every target layer includes numeric position values and dimensionality.
- Each computed zero position matches the target layer dimensionality: `[0, 0]` for 2D position arrays and `[0, 0, 0]` for 3D position arrays.
- Post-run `get_layer_details` shows every affected target layer position equals its computed zero position.
- Post-run `get_comp_details` shows no unexpected user-layer deletion, rename, relink, timing change or layer-count change.
- Exact source JSX semantics for anchor reset, bounds centering, parent/world-space conversion, separated dimensions, selection changes or full transform reset are reported as typed-tool gaps.

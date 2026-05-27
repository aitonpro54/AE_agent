# Set To Average Position Typed Plan

## Goal

Выставить выбранные или явно указанные слои в их общую average position через existing typed bridge tools.

## Applies When

- Пользователь просит set selected layers to average position, average out layer positions, move selected layers to their shared average point, or align multiple layers to the average of their current transform positions.
- Допустима safe adaptation: compute the component-wise arithmetic mean from typed `get_layer_details` transform position evidence, then set each target layer's `position` to that computed average.
- Target layers are selected or explicitly identified before mutation; the plan must not guess layer targets from names or prior chat context.
- At least two concrete target layers are required.
- Position values must be numeric and share the same coordinate dimensionality from the same comp and sample-time context.
- If the user needs anchor-point averaging, layer bounds/center averaging, parent/world-space conversion, separated-dimension semantics, selection changes, path/mask/shape point averaging, or exact source JSX behavior, fail closed and request a separate typed-tool contract.
- Задача не требует raw script execution, deleting existing layers, source relinking, render queue changes, expressions, layer timing edits, or broad template batch updates.

## Plan Pattern

1. Run `get_active_comp` to establish the active comp identity and, when available, current time.
2. Run `get_selected_layers` when the request targets the current selection, or bind explicit layer indices only from current comp evidence.
3. Require at least two concrete target layer indices before mutation.
4. Run `get_layer_details` for each concrete target layer before mutation to capture layer identity, current transform position, dimensionality, 3D state and parenting evidence.
5. Fail closed if any target lacks a numeric position array, if target positions have mixed dimensionality, or if parenting/same-coordinate-space evidence is insufficient for a component-wise arithmetic mean.
6. Compute `averagePosition` by taking the component-wise arithmetic mean of all target layer position values. Include z only when every target position has a numeric z component.
7. Run one `set_layer_transform` step per verified target layer with `position:averagePosition`; keep all other transform fields unchanged unless the user explicitly requested them and they are supported by typed evidence.
8. Include `verifyAfter:true` and a stable `idempotencyKeyTemplate` on each mutating transform step.
9. Run `get_layer_details` after mutation for every affected layer and `get_comp_details` for the target comp to confirm positions and unchanged layer membership.
10. Fail closed instead of using raw script execution when exact source JSX semantics, anchor/bounds center averaging, parent/world-space conversion, separated dimensions or arbitrary layer inference is required.

## Safety Gates

- Mutating layer-transform workflow.
- Requires validated Agent plan, dry-run, explicit confirmation, `allowMutations:true`, idempotency and post-mutation read-back.
- Use checkpoint or edit-session protection for confirmed live runs.
- Require selected-layer or explicit-layer evidence before binding target layer indices.
- Preserve layer names, sources, timing, effects, masks, parenting, expressions, layer order and other transform fields unless a separate typed plan explicitly covers those changes.
- Do not promise anchor-point averaging, bounds/center averaging, selection changes, parent/world-space conversion, separated-dimension behavior, path/mask/shape point averaging, or exact source JSX semantics.
- Do not use this recipe for render queue changes, template batch changes, source relinking, expression edits, layer cleanup, effect edits, marker edits or raw ExtendScript.

## Verification

- The plan reads one target comp and at least two concrete target layers before any mutation.
- Selected-layer workflows include `get_selected_layers` evidence before any `set_layer_transform` step binds layer indices.
- Pre-run `get_layer_details` read-back for every target layer includes numeric position values with the same coordinate dimensionality.
- The computed average position equals the component-wise arithmetic mean of the cited pre-run position values.
- Post-run `get_layer_details` shows every affected target layer position equals the computed average position.
- Post-run `get_comp_details` shows no unexpected user-layer deletion, rename, relink, timing change or layer-count change.
- Exact source JSX semantics for anchor/bounds center averaging, parent/world-space conversion, separated dimensions, selection changes or path/mask/shape point averaging are reported as typed-tool gaps.

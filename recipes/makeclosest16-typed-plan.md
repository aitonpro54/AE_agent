# Make Closest 16 Typed Plan

## Goal

Snap selected or explicitly identified layer transform positions to the nearest 16-pixel grid using current typed bridge evidence, without copying source JSX or relying on hidden AE traversal.

## Applies When

- The user asks to make selected layers closest to 16, snap layer positions to a 16-pixel grid, or round layer transform positions to the nearest multiple of 16.
- Target layers are selected or explicitly identified before mutation; the plan must not guess targets from names or prior chat context.
- The accepted adaptation is limited to transform `position` values returned by typed read-back tools.
- Position values are numeric arrays from the same composition and sample-time context.
- If the user needs anchor-point snapping, layer-bounds center snapping, source-exact rounding behavior, parent or world-space conversion, separated-dimension internals, path/mask/shape point snapping, comp-size rounding, expression/keyframe edits, selection side effects, or raw JSX semantics, fail closed and require a separate typed-tool contract.

## Plan Pattern

1. Run `get_active_comp` to establish the active comp identity and current comp context.
2. Run `get_selected_layers` when the request targets the current selection, or bind explicit layer indices only from current comp/layer evidence.
3. Require at least one concrete target layer before mutation.
4. Run `get_layer_details` for every concrete target layer before mutation to capture layer identity, transform position, dimensionality, 3D state, parenting evidence, and sample-time context when available.
5. Fail closed if any target lacks a numeric position array, if positions include unsupported separated-dimension evidence, or if parent/world-space evidence is insufficient for local transform-position snapping.
6. Compute `snappedPosition` for each target by rounding each numeric position component to the nearest multiple of 16. Include z only when the target position has a numeric z component.
7. Run one `set_layer_transform` step per verified target layer with `position:snappedPosition`; keep all other transform fields unchanged unless the user explicitly requested another supported typed transform change.
8. Include `verifyAfter:true` and a stable `idempotencyKeyTemplate` on each mutating transform step.
9. Run `get_layer_details` after mutation for every affected layer and `get_comp_details` for the target comp to confirm positions and unchanged layer membership.
10. Fail closed instead of using raw script execution when exact source JSX semantics or unsupported coordinate-space behavior is required.

## Safety Gates

- Mutating layer-transform workflow.
- Requires validated Agent plan, dry-run, explicit confirmation, `allowMutations:true`, idempotency, checkpoint or edit-session protection, and post-mutation read-back.
- Require selected-layer or explicit-layer evidence before binding target layer indices.
- Preserve layer names, sources, timing, effects, masks, parenting, expressions, layer order, keyframes, selection state, render queue items, project items, and unrelated transform fields.
- Do not promise anchor-point snapping, bounds-center snapping, source-exact rounding, parent/world-space conversion, separated-dimension behavior, shape/path/mask point snapping, comp-size rounding, expression edits, keyframe edits, or exact source JSX semantics.
- Do not use this recipe for broad project scans, source relinking, template batch changes, layer cleanup, effect edits, marker edits, selection mutation, or raw ExtendScript.

## Verification

- The plan reads one target comp and concrete target layers before any mutation.
- Selected-layer workflows include `get_selected_layers` evidence before any `set_layer_transform` step binds layer indices.
- Pre-run `get_layer_details` read-back for every target layer includes numeric position values.
- Every computed `snappedPosition` component is the nearest multiple of 16 for the cited pre-run position component.
- Post-run `get_layer_details` shows every affected target layer position equals its computed `snappedPosition`.
- Post-run `get_comp_details` shows no unexpected user-layer deletion, rename, relink, timing change, selection mutation, or layer-count change.
- Exact source JSX semantics for anchor/bounds snapping, coordinate conversion, separated dimensions, path/mask/shape point snapping, comp-size rounding, expression/keyframe edits, or selection changes are reported as typed-tool gaps.

# Center Composition Typed Plan

## Goal

Центрировать selected or explicit composition/precomp layer inside a target composition через existing typed bridge tools.

## Applies When

- Пользователь просит center a composition, center a precomp layer, place the selected comp layer at the comp center, or re-center generated composition artwork inside the active comp.
- Допустима safe adaptation: set the target layer transform `position` to the target composition center point computed from typed comp dimensions.
- Target comp is the active comp or an explicit comp target that is read back before mutation.
- The target layer is selected or explicitly identified before mutation; the plan must not guess which layer to center.
- If the user needs viewer zoom/pan centering, native `Center Composition` UI command behavior, anchor-point or source-bounds recentering, comp resize/crop, nested precomp source edits, parenting/world-space conversion, or exact source JSX behavior, fail closed and request a separate typed-tool contract.
- Задача не требует raw script execution, deleting existing layers, source relinking, render queue changes, or broad template batch updates.

## Plan Pattern

1. Run `get_active_comp` to establish the active comp identity and, when needed, current time.
2. Run `get_comp_details` for the target comp and read width and height before computing the composition center point as `[width / 2, height / 2]`.
3. Run `get_selected_layers` when the request targets selected layers; require exactly one selected layer unless the user explicitly asks to center multiple concrete layers.
4. Run `get_layer_details` for each concrete target layer before mutation to capture layer identity, current transform position and any parenting/3D evidence.
5. Run `set_layer_transform` for each verified target layer with `position:[width / 2, height / 2]`; keep all other transform fields unchanged unless the user explicitly requested them and they are supported by typed evidence.
6. Include `verifyAfter:true` and a stable `idempotencyKeyTemplate` on each mutating transform step.
7. Run `get_layer_details` after mutation for each target layer and `get_comp_details` for the target comp to confirm the centered position and unchanged layer membership.
8. Fail closed instead of using raw script execution when exact viewer-centering, anchor/source-bounds recentering, comp resize/crop, nested source mutation, parent-space conversion, or arbitrary layer inference is required.

## Safety Gates

- Mutating layer-transform workflow.
- Requires validated Agent plan, dry-run, explicit confirmation, `allowMutations:true`, idempotency and post-mutation read-back.
- Use checkpoint or edit-session protection for confirmed live runs.
- Require selected-layer or explicit-layer evidence before binding target layer indices.
- Preserve layer names, sources, timing, effects, masks, parenting, expressions and layer order unless a separate typed plan explicitly covers those changes.
- Do not promise viewer zoom/pan centering, native `Center Composition` UI command behavior, anchor-point/source-bounds recentering, comp resize/crop, nested precomp source edits, parenting/world-space conversion, or exact source JSX semantics.
- Do not use this recipe for render queue changes, template batch changes, source relinking, expression edits, layer cleanup or raw ExtendScript.

## Verification

- The plan reads one target comp and computes the center point from typed width and height evidence.
- Selected-layer workflows include `get_selected_layers` evidence before any `set_layer_transform` step binds layer indices.
- `get_layer_details` read-back before mutation identifies the concrete target layer or layers.
- Post-run `get_layer_details` shows each target layer position equals the computed composition center point.
- Post-run `get_comp_details` shows no unexpected user-layer deletion, rename, relink, timing change or layer-count change.
- Exact source JSX semantics for viewer centering, anchor/source-bounds recentering, comp resize/crop, nested precomp mutation or parent/world-space conversion are reported as typed-tool gaps.

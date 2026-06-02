# Select Non Null Layers Typed Plan

## Goal

Select all non-null layers in the active composition by deriving explicit one-based `layerIndices` from current typed layer inventory, applying `set_layer_selection`, and reading the selected layers back.

## Applies When

- The user asks to select non-null layers, all layers except null layers, or layers currently reporting `nullLayer:false`.
- An active composition exists and current `get_comp_details` layer inventory exposes enough layer state to identify non-null layers without guessing.
- The accepted non-null set is converted into concrete one-based `layerIndices` before mutation.
- The task does not require creating, deleting, renaming, or converting null layers, selecting by layer name, fuzzy type matching, cross-comp selection, project-panel selection, layer edits, or raw JSX execution.

## Plan Pattern

1. Run `get_active_comp` to confirm the active composition and capture the target comp identity.
2. Run `get_comp_details` with `includeLayers:true` and a sufficient `layerLimit` for the active comp layer stack.
3. Identify non-null candidates only from typed layer state, such as `nullLayer:false`, `isNull:false`, or an equivalent non-null layer field returned by the layer inventory.
4. Bind `nonNullLayerIndices` and optional expected names from the same current evidence.
5. Fail closed when layer inventory is truncated, null/non-null state is absent, no non-null layers are found, or the request depends on hidden native UI state that typed tools did not expose.
6. Run one `set_layer_selection` step with the computed `nonNullLayerIndices`, optional expected names, replacement selection semantics, `verifyAfter:true`, and a stable `idempotencyKeyTemplate`.
7. Run `get_selected_layers` after mutation and report selected non-null count, selected layer indices, names, and the null-state evidence used to choose them.

## Safety Gates

- Mutating selection state workflow.
- Requires validated Agent plan, dry-run, explicit confirmation, `allowMutations:true`, idempotency, checkpoint or edit-session protection, and post-mutation read-back.
- Do not infer non-null layers from layer names, source names, screenshots, previous chat context, source type strings, label color, shy/solo/lock state, or approximate UI assumptions.
- Do not create, delete, convert, rename, or otherwise mutate null layers; this recipe changes only active-comp selection state.
- Do not use this recipe for selecting null layers, solids, text, shapes, cameras, lights, guide layers, disabled layers, parent groups, random layers, project items, or cross-comp targets unless a separate typed-tool contract proves those semantics.
- Require a separate typed-tool contract for source-exact native null-layer semantics, null-layer creation/conversion, cross-comp selection, Project panel selection, or exact native UI side effects.

## Verification

- The plan includes active comp evidence and full enough layer inventory before computing non-null targets.
- Dry-run evidence lists each accepted non-null layer index, optional expected name, and the typed null-state field that justified selection.
- The `set_layer_selection` step reports the computed non-null layer indices, replacement selection semantics, `verifyAfter:true`, and no non-selection mutation.
- The post-run `get_selected_layers` read-back shows exactly the expected non-null layer count, selected layer indices, and expected names.
- Empty, truncated, unsupported, or ambiguous non-null discovery is reported as a typed-tool gap or no-op decision instead of approximate selection.
- Post-run evidence shows no null-layer creation/conversion/deletion, layer order change, layer rename, timing/source/effect/keyframe/mask/project item/render queue mutation, or cross-comp selection.

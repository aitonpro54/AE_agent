# Select Shape Layers Typed Plan

## Goal

Select all shape layers in the active composition by deriving explicit one-based `layerIndices` from current typed layer inventory, applying `set_layer_selection`, and reading the selected layers back.

## Applies When

- The user asks to select shape layers in the active composition.
- An active composition exists and current `get_comp_details` layer inventory exposes enough layer state to identify shape layers without guessing.
- The accepted shape-layer set is converted into concrete one-based `shapeLayerIndices` before mutation.
- The task does not require creating shape layers, editing shape contents, selecting shape groups/properties, fuzzy name matching, cross-comp selection, project-panel selection, layer edits, or raw JSX execution.

## Plan Pattern

1. Run `get_active_comp` to confirm the active composition and capture the target comp identity.
2. Run `get_comp_details` with `includeLayers:true` and a sufficient `layerLimit` for the active comp layer stack.
3. Identify shape-layer candidates only from typed layer state, such as `shapeLayer:true`, `layerKind:"shape"`, `type:"shape"`, or an equivalent shape-layer field returned by the layer inventory.
4. Bind `shapeLayerIndices` and optional expected names from the same current evidence.
5. Fail closed when layer inventory is truncated, shape-layer state is absent, no shape layers are found, or the request depends on shape contents or hidden native UI state that typed tools did not expose.
6. Run one `set_layer_selection` step with the computed `shapeLayerIndices`, optional expected names, replacement selection semantics, `verifyAfter:true`, and a stable `idempotencyKeyTemplate`.
7. Run `get_selected_layers` after mutation and report selected shape-layer count, selected layer indices, names, and the shape-layer evidence used to choose them.

## Safety Gates

- Mutating selection state workflow.
- Requires validated Agent plan, dry-run, explicit confirmation, `allowMutations:true`, idempotency, checkpoint or edit-session protection, and post-mutation read-back.
- Do not infer shape layers from layer names, source names, screenshots, previous chat context, label color, shy/solo/lock state, or approximate UI assumptions.
- Do not create shape layers, edit vector contents, convert layer types, select shape groups/properties, or change any other layer property; this recipe changes only active-comp selection state.
- Do not use this recipe for selecting text, solids, nulls, cameras, lights, guide layers, disabled layers, random layers, shape properties, project items, or cross-comp targets unless a separate typed-tool contract proves those semantics.
- Require a separate typed-tool contract for source-exact native shape-layer semantics, shape content inspection, shape layer creation/conversion, cross-comp selection, Project panel selection, or exact native UI side effects.

## Verification

- The plan includes active comp evidence and full enough layer inventory before computing shape-layer targets.
- Dry-run evidence lists each accepted shape layer index, optional expected name, and the typed shape-layer field that justified selection.
- The `set_layer_selection` step reports the computed shape layer indices, replacement selection semantics, `verifyAfter:true`, and no non-selection mutation.
- The post-run `get_selected_layers` read-back shows exactly the expected shape-layer count, selected layer indices, and expected names.
- Empty, truncated, unsupported, or ambiguous shape-layer discovery is reported as a typed-tool gap or no-op decision instead of approximate selection.
- Post-run evidence shows no shape-layer creation/conversion, shape content edit, layer order change, layer rename, timing/source/effect/keyframe/mask/project item/render queue mutation, or cross-comp selection.

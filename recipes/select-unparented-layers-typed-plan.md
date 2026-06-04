# Select Unparented Layers Typed Plan

## Goal

Select all unparented layers in the active composition by deriving explicit one-based `layerIndices` from current typed layer inventory, applying `set_layer_selection`, and reading the selected layers back.

## Applies When

- The user asks to select unparented layers, layers without a parent, root layers, or layers whose current parent evidence is empty.
- An active composition exists and current `get_comp_details` layer inventory exposes enough parent-link state to identify unparented layers without guessing.
- The accepted unparented set is converted into concrete one-based `unparentedLayerIndices` before mutation.
- The task does not require assigning parents, clearing parents, selecting child layers, selecting recursive ancestors, fuzzy name matching, cross-comp selection, project-panel selection, layer edits, or raw JSX execution.

## Plan Pattern

1. Run `get_active_comp` to confirm the active composition and capture the target comp identity.
2. Run `get_comp_details` with `includeLayers:true` and a sufficient `layerLimit` for the active comp layer stack.
3. Identify unparented candidates only from typed layer state, such as `parentLayerIndex:null`, `parentLayerIndex:0`, `parentIndex:null`, `parentIndex:0`, an empty `parentName`, or an equivalent current parent-link field returned by the layer inventory.
4. Bind `unparentedLayerIndices` and optional expected names from the same current evidence.
5. Fail closed when layer inventory is truncated, parent-link state is absent, no unparented layers are found, or the request depends on hidden native UI state that typed tools did not expose.
6. Run one `set_layer_selection` step with the computed `unparentedLayerIndices`, optional expected names, replacement selection semantics, `verifyAfter:true`, and a stable `idempotencyKeyTemplate`.
7. Run `get_selected_layers` after mutation and report selected unparented layer count, selected layer indices, names, and the parent-link evidence used to choose them.

## Safety Gates

- Mutating selection state workflow.
- Requires validated Agent plan, dry-run, explicit confirmation, `allowMutations:true`, idempotency, checkpoint or edit-session protection, and post-mutation read-back.
- Do not infer unparented layers from layer names, source names, screenshots, previous chat context, visual hierarchy, label color, shy/solo/lock state, or approximate UI assumptions.
- Do not assign, clear, change, or repair parent links; this recipe changes only active-comp selection state.
- Do not use this recipe for selecting parent layers, child layers, recursive ancestors, recursive descendants, nulls, solids, text, shapes, cameras, lights, guide layers, disabled layers, random layers, project items, or cross-comp targets unless a separate typed-tool contract proves those semantics.
- Require a separate typed-tool contract for source-exact native unparented-layer semantics, parent-link mutation, recursive hierarchy traversal, cross-comp selection, Project panel selection, or exact native UI side effects.

## Verification

- The plan includes active comp evidence and full enough layer inventory before computing unparented targets.
- Dry-run evidence lists each accepted unparented layer index, optional expected name, and the typed parent-link field that justified selection.
- The `set_layer_selection` step reports the computed unparented layer indices, replacement selection semantics, `verifyAfter:true`, and no non-selection mutation.
- The post-run `get_selected_layers` read-back shows exactly the expected unparented-layer count, selected layer indices, and expected names.
- Empty, truncated, unsupported, or ambiguous parent-link discovery is reported as a typed-tool gap or no-op decision instead of approximate selection.
- Post-run evidence shows no parent-link assignment/clearing/change, layer order change, layer rename, timing/source/effect/keyframe/mask/project item/render queue mutation, child selection, recursive hierarchy traversal, or cross-comp selection.

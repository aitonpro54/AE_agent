# Select Text Layers Typed Plan

## Goal

Select all text layers in the active composition by deriving explicit one-based `layerIndices` from current typed layer inventory, applying `set_layer_selection`, and reading the selected layers back.

## Applies When

- The user asks to select text layers in the active composition.
- An active composition exists and current `get_comp_details` layer inventory exposes enough layer state to identify text layers without guessing.
- The accepted text-layer set is converted into concrete one-based `textLayerIndices` before mutation.
- The task does not require creating text layers, editing source text, selecting text properties, fuzzy name matching, cross-comp selection, project-panel selection, layer edits, or raw JSX execution.

## Plan Pattern

1. Run `get_active_comp` to confirm the active composition and capture the target comp identity.
2. Run `get_comp_details` with `includeLayers:true` and a sufficient `layerLimit` for the active comp layer stack.
3. Identify text-layer candidates only from typed layer state, such as `textLayer:true`, `layerKind:"text"`, `type:"text"`, a `sourceText` capability marker, or an equivalent text-layer field returned by the layer inventory.
4. Bind `textLayerIndices` and optional expected names from the same current evidence.
5. Fail closed when layer inventory is truncated, text-layer state is absent, no text layers are found, or the request depends on source text contents or hidden native UI state that typed tools did not expose.
6. Run one `set_layer_selection` step with the computed `textLayerIndices`, optional expected names, replacement selection semantics, `verifyAfter:true`, and a stable `idempotencyKeyTemplate`.
7. Run `get_selected_layers` after mutation and report selected text-layer count, selected layer indices, names, and the text-layer evidence used to choose them.

## Safety Gates

- Mutating selection state workflow.
- Requires validated Agent plan, dry-run, explicit confirmation, `allowMutations:true`, idempotency, checkpoint or edit-session protection, and post-mutation read-back.
- Do not infer text layers from layer names, source names, screenshots, previous chat context, label color, shy/solo/lock state, or approximate UI assumptions.
- Do not create text layers, edit text contents, convert layer types, select text animators/properties, or change any other layer property; this recipe changes only active-comp selection state.
- Do not use this recipe for selecting shape layers, solids, nulls, cameras, lights, guide layers, disabled layers, random layers, text properties, project items, or cross-comp targets unless a separate typed-tool contract proves those semantics.
- Require a separate typed-tool contract for source-exact native text-layer semantics, source text inspection, text layer creation/conversion, cross-comp selection, Project panel selection, or exact native UI side effects.

## Verification

- The plan includes active comp evidence and full enough layer inventory before computing text-layer targets.
- Dry-run evidence lists each accepted text layer index, optional expected name, and the typed text-layer field that justified selection.
- The `set_layer_selection` step reports the computed text layer indices, replacement selection semantics, `verifyAfter:true`, and no non-selection mutation.
- The post-run `get_selected_layers` read-back shows exactly the expected text-layer count, selected layer indices, and expected names.
- Empty, truncated, unsupported, or ambiguous text-layer discovery is reported as a typed-tool gap or no-op decision instead of approximate selection.
- Post-run evidence shows no text-layer creation/conversion, source text edit, layer order change, layer rename, timing/source/effect/keyframe/mask/project item/render queue mutation, or cross-comp selection.

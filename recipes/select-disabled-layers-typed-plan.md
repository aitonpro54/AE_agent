# Select Disabled Layers Typed Plan

## Goal

Select all disabled layers in the active composition by deriving explicit one-based `layerIndices` from current typed layer inventory, applying `set_layer_selection`, and reading the selected layers back.

## Applies When

- The user asks to select disabled layers, layers with the Video/eye switch off, or layers currently reporting `enabled:false`.
- An active composition exists and current `get_comp_details` layer inventory exposes enough layer state to identify disabled layers without guessing.
- The accepted disabled set is converted into concrete one-based `layerIndices` before mutation.
- The task does not require toggling layer enabled state, selecting shy/solo/locked/hidden layers by unrelated switches, fuzzy name matching, cross-comp selection, project-panel selection, layer edits, or raw JSX execution.

## Plan Pattern

1. Run `get_active_comp` to confirm the active composition and capture the target comp identity.
2. Run `get_comp_details` with `includeLayers:true` and a sufficient `layerLimit` for the active comp layer stack.
3. Identify disabled candidates only from typed layer state, such as `enabled:false` or an equivalent disabled/video-switch field returned by the layer inventory.
4. Bind `disabledLayerIndices` and optional expected names from the same current evidence.
5. Fail closed when layer inventory is truncated, disabled/enabled state is absent, no disabled layers are found, or the request depends on hidden native UI state that typed tools did not expose.
6. Run one `set_layer_selection` step with the computed `disabledLayerIndices`, optional expected names, replacement selection semantics, `verifyAfter:true`, and a stable `idempotencyKeyTemplate`.
7. Run `get_selected_layers` after mutation and report selected disabled count, selected layer indices, names, and the disabled-state evidence used to choose them.

## Safety Gates

- Mutating selection state workflow.
- Requires validated Agent plan, dry-run, explicit confirmation, `allowMutations:true`, idempotency, checkpoint or edit-session protection, and post-mutation read-back.
- Do not infer disabled layers from layer names, visibility in a screenshot, previous chat context, source type, label color, shy/solo/lock state, or approximate UI assumptions.
- Do not toggle the Video/eye switch or any other layer property; this recipe changes only active-comp selection state.
- Do not use this recipe for selecting enabled layers, all hidden/shy/locked/solo layers, layers by type/label/randomness, project items, or cross-comp targets unless a separate typed-tool contract proves those semantics.
- Do not use this recipe for layer duplication/deletion/renaming, timing edits, marker edits, effect edits, source relinking, keyframe edits, render queue changes, project item changes, or broad timeline cleanup.

## Verification

- The plan includes active comp evidence and full enough layer inventory before computing disabled targets.
- Dry-run evidence lists each accepted disabled layer index, optional expected name, and the typed disabled-state field that justified selection.
- The `set_layer_selection` step reports the computed disabled layer indices, replacement selection semantics, `verifyAfter:true`, and no non-selection mutation.
- The post-run `get_selected_layers` read-back shows exactly the expected disabled layer count, selected layer indices, and expected names.
- Empty, truncated, unsupported, or ambiguous disabled-layer discovery is reported as a typed-tool gap or no-op decision instead of approximate selection.
- Post-run evidence shows no enabled-state toggle, layer order change, layer rename, timing/source/effect/keyframe/mask/project item/render queue mutation, or cross-comp selection.

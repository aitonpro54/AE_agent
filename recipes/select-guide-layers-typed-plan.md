# Select Guide Layers Typed Plan

## Goal

Select all guide layers in the active composition by deriving explicit one-based `layerIndices` from current typed layer inventory, applying `set_layer_selection`, and reading the selected layers back.

## Applies When

- The user asks to select guide layers or layers currently reporting `guideLayer:true`.
- An active composition exists and current `get_comp_details` layer inventory exposes enough layer state to identify guide layers without guessing.
- The accepted guide-layer set is converted into concrete one-based `layerIndices` before mutation.
- The task does not require creating guide overlays, changing native guide-layer flags, selecting composition guide records, fuzzy name matching, cross-comp selection, project-panel selection, layer edits, or raw JSX execution.

## Plan Pattern

1. Run `get_active_comp` to confirm the active composition and capture the target comp identity.
2. Run `get_comp_details` with `includeLayers:true` and a sufficient `layerLimit` for the active comp layer stack.
3. Identify guide-layer candidates only from typed layer state, such as `guideLayer:true` or an equivalent guide-layer field returned by the layer inventory.
4. Bind `guideLayerIndices` and optional expected names from the same current evidence.
5. Fail closed when layer inventory is truncated, guide-layer state is absent, no guide layers are found, or the request depends on native guide records or hidden UI state that typed tools did not expose.
6. Run one `set_layer_selection` step with the computed `guideLayerIndices`, optional expected names, replacement selection semantics, `verifyAfter:true`, and a stable `idempotencyKeyTemplate`.
7. Run `get_selected_layers` after mutation and report selected guide-layer count, selected layer indices, names, and the guide-layer evidence used to choose them.

## Safety Gates

- Mutating selection state workflow.
- Requires validated Agent plan, dry-run, explicit confirmation, `allowMutations:true`, idempotency, checkpoint or edit-session protection, and post-mutation read-back.
- Do not infer guide layers from layer names, generated guide overlay naming, screenshots, previous chat context, source type, label color, locked state, shy state, or approximate UI assumptions.
- Do not set or clear `guideLayer`, create visual guide overlays, mutate native composition guide records, or change any other layer property; this recipe changes only active-comp selection state.
- Do not use this recipe for selecting generated guide overlays by name, native comp guide records, guide creation/removal, layer duplication/deletion/renaming, timing edits, marker edits, effect edits, source relinking, keyframe edits, render queue changes, project item selection, or broad timeline cleanup.
- Require a separate typed-tool contract for native `guideLayer=true` mutation, ruler guide records, guide overlay generation, cross-comp selection, Project panel selection, or exact source/native UI side effects.

## Verification

- The plan includes active comp evidence and full enough layer inventory before computing guide-layer targets.
- Dry-run evidence lists each accepted guide layer index, optional expected name, and the typed guide-layer field that justified selection.
- The `set_layer_selection` step reports the computed guide layer indices, replacement selection semantics, `verifyAfter:true`, and no non-selection mutation.
- The post-run `get_selected_layers` read-back shows exactly the expected guide-layer count, selected layer indices, and expected names.
- Empty, truncated, unsupported, or ambiguous guide-layer discovery is reported as a typed-tool gap or no-op decision instead of approximate selection.
- Post-run evidence shows no guide-layer flag mutation, guide overlay creation, native guide record mutation, layer order change, layer rename, timing/source/effect/keyframe/mask/project item/render queue mutation, or cross-comp selection.

# Select Layers Below Label Typed Plan

## Goal

Select active-comp layers below a reviewed label anchor by deriving explicit one-based `layerIndices` from current typed layer inventory, applying `set_layer_selection`, and reading the selected layers back.

## Applies When

- The user asks to select layers below a label, label marker, or reviewed label-anchor layer in the active composition.
- An active composition exists and current `get_comp_details` layer inventory exposes enough layer order plus label evidence to identify the anchor layer without guessing.
- The accepted below-anchor set is converted into concrete one-based `layerIndices` before mutation.
- The task does not require changing layer label colors, discovering label colors from unavailable UI-only state, selecting layers above the anchor, cross-comp selection, Project panel selection, layer edits, or source-exact native UI behavior.

## Plan Pattern

1. Run `get_active_comp` to confirm the active composition and capture the target comp identity.
2. Run `get_comp_details` with `includeLayers:true` and a sufficient `layerLimit` for the active comp layer stack.
3. Identify the label anchor only from current typed evidence, such as an explicit `anchorLayerIndex` supplied by the user or a layer inventory field like `label`, `labelIndex`, `labelColor`, or an equivalent label marker exposed by the bridge.
4. Bind `belowLabelLayerIndices` from the same current layer inventory using AE one-based layer order below the reviewed anchor layer.
5. Fail closed when layer inventory is truncated, label evidence is absent, the anchor is ambiguous, no layers are below the anchor, or the request depends on hidden native UI state that typed tools did not expose.
6. Run one `set_layer_selection` step with the computed `belowLabelLayerIndices`, optional expected names, replacement selection semantics, `verifyAfter:true`, and a stable `idempotencyKeyTemplate`.
7. Run `get_selected_layers` after mutation and report selected below-label count, selected layer indices, names, the anchor layer index/name, and the label evidence used to choose the anchor.

## Safety Gates

- Mutating selection state workflow.
- Requires validated Agent plan, dry-run, explicit confirmation, `allowMutations:true`, idempotency, checkpoint or edit-session protection, and post-mutation read-back.
- Do not infer the label anchor from screenshots, previous chat context, fuzzy names, source type, layer comments, guide/disabled/shy/solo/lock state, or approximate UI assumptions.
- Do not set or clear layer labels and do not change any layer property; this recipe changes only active-comp selection state.
- Do not use this recipe for selecting layers by color label alone when typed label evidence is unavailable, selecting layers above the anchor, selecting guide/disabled/type/random/parent groups, layer duplication/deletion/renaming, timing edits, marker edits, effect edits, source relinking, keyframe edits, render queue changes, project item selection, or broad timeline cleanup.
- Require a separate typed-tool contract for source-exact label-color scanning, native UI selection side effects, cross-comp selection, Project panel selection, or label mutation.

## Verification

- The plan includes active comp evidence and full enough layer inventory before computing the anchor and below-label targets.
- Dry-run evidence lists the reviewed `anchorLayerIndex`, optional anchor name, typed label evidence, computed `belowLabelLayerIndices`, and optional expected selected names.
- The `set_layer_selection` step reports the computed below-label layer indices, replacement selection semantics, `verifyAfter:true`, and no non-selection mutation.
- The post-run `get_selected_layers` read-back shows exactly the expected below-label layer count, selected layer indices, and expected names.
- Empty, truncated, unsupported, or ambiguous label-anchor discovery is reported as a typed-tool gap or no-op decision instead of approximate selection.
- Post-run evidence shows no label-color mutation, layer order change, layer rename, timing/source/effect/keyframe/mask/project item/render queue mutation, or cross-comp selection.

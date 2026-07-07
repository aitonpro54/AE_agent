# AR Select Odd Layers Typed Plan

## Intent

Select a reviewed odd-indexed subset of active-comp layers by deriving concrete
one-based `layerIndices` from current typed layer inventory, applying
`set_layer_selection`, and reading the selected layers back.

## Applies When

- The user asks to run `AR_SelectOddLayers.jsx`, select odd layers, or select
  every odd-indexed layer in the active composition.
- Current typed evidence identifies the target composition and complete enough
  layer order to compute the odd layer set.
- The accepted odd set is represented as concrete one-based `oddLayerIndices`
  and optional expected names before selection mutation.
- Source-exact native UI behavior, hidden selection ordering, cross-comp
  selection, Project panel selection, layer edits, or raw JSX execution are not
  required.

## Plan Pattern

1. Run `get_active_comp` to bind the target composition.
2. Run `get_comp_details includeLayers:true` with a sufficient `layerLimit` to
   bind the active comp layer inventory and one-based layer order.
3. Bind and show an `oddSelectionPolicy`. The supported default policy is
   one-based AE layer index where `layer.index % 2 === 1`; any alternate policy
   such as zero-based ordinal or selected-layer ordinal must be explicitly
   reviewed before mutation.
4. Compute `oddLayerIndices` and optional expected names only from current typed
   layer inventory.
5. Fail closed if the active comp is missing, layer inventory is truncated or
   ambiguous, no odd-indexed layers exist, the user requires source-exact native
   side effects, or the odd-selection policy is ambiguous.
6. Run one `set_layer_selection` step with computed `oddLayerIndices`, optional
   expected names, replacement selection semantics, `verifyAfter:true`, and a
   stable idempotency key.
7. Run `get_selected_layers` after mutation and report selected odd-layer count,
   selected layer indices, names, and the reviewed policy used.

## Safety Gates

- Mutating selection state workflow.
- Requires normal Agent plan validation, dry-run, explicit confirmation,
  `allowMutations:true`, idempotency, checkpoint or edit-session protection,
  and post-mutation read-back.
- Do not infer target layers from screenshots, previous chat context, layer
  names, labels, source type, shy/solo/lock state, or approximate UI
  assumptions.
- Do not create, delete, duplicate, rename, reorder, retime, relink, parent,
  unparent, toggle switches, edit effects/expressions/keyframes/masks, mutate
  project items, render queue, files, or user assets; this recipe changes only
  active-comp layer selection state.
- Require a separate typed-tool contract for source-exact selection ordering,
  native UI side effects, cross-comp or Project panel selection, or alternate
  odd-selection semantics.

## Verification

- Pre-run evidence identifies the target comp, complete enough layer inventory,
  reviewed `oddSelectionPolicy`, and every accepted odd layer index/name.
- Dry-run evidence lists `oddLayerIndices`, optional expected names, skipped
  even layers, and the one-based layer-order evidence used.
- The `set_layer_selection` result reports the computed odd layer indices,
  replacement selection semantics, `verifyAfter:true`, and no non-selection
  mutation.
- Post-run `get_selected_layers` shows exactly the expected odd-layer count,
  selected layer indices, and expected names.
- Empty, truncated, unsupported, ambiguous, or source-exact odd-layer selection
  is reported as a typed-tool gap or no-op decision instead of an approximate
  selection.
- Post-run evidence shows no layer order change, layer rename, timing/source/
  effect/keyframe/mask/project item/render queue mutation, or cross-comp
  selection.

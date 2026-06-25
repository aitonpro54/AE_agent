# Parent Selected Layers To Layers Below Typed Plan

## Intent

Parent explicit generated selected child layers to the layers directly below
them by deriving concrete same-comp child -> parent pairs from current typed
layer-order evidence, then reading each parent relationship back.

## Applies When

- The user asks to run `Parent_Selected_Layers_To_Layers_Below` or parent
  selected layers to the layer below each one.
- Current typed evidence identifies the target composition, selected child
  layer indices, selected child names, complete enough layer order, and each
  reviewed below-parent layer.
- The accepted targets are generated or explicitly reviewed same-comp layers.
- Broad user timeline parenting, hidden source selection side effects, or exact
  native UI state are not required.

## Plan Pattern

1. Run `get_active_comp` to bind the target composition.
2. Run `get_selected_layers` only when selection is the user-facing input, then
   convert the selected set into concrete one-based `selectedChildLayerIndices`
   and expected child names.
3. Run `get_comp_details includeLayers:true` or `get_layer_details` to bind the
   complete same-comp layer order needed for every child -> below-parent pair.
4. Fail closed if any selected child is bottommost, the below layer is missing,
   layer inventory is truncated, any pair would create a cycle, or identity is
   ambiguous.
5. For each reviewed pair, run `set_layer_parent` with explicit `layerIndex`,
   `parentLayerIndex`, `expectedLayerName`, and `expectedParentName`.
6. Run `get_layer_details` after mutation for every child layer and confirm the
   parent index/name matches the reviewed below-parent layer.

## Safety Gates

- Require normal Agent plan validation, explicit confirmation,
  `allowMutations:true`, idempotency, checkpoint or edit-session protection, and
  post-mutation read-back before any parent-link mutation.

## Safety Limits

- Mutate only the explicit child layer parent links in the reviewed pairs.
- Do not create, delete, duplicate, rename, reorder, retime, relink, select
  extra layers, change track mattes, edit effects/expressions/properties,
  change labels, change layer switches, mutate project items, render queue, or
  files.
- Do not infer below-parent targets from screenshots, visual indentation, layer
  names alone, stale selection context, or previous chat context.
- Do not run broad selected-layer parenting on non-generated user assets without
  a separate reviewed contract and checkpoint/rollback scope.
- Do not use raw ExtendScript or source-checkout execution as a substitute for
  `set_layer_parent` plus typed read-back.

## Verification

- Pre-run evidence identifies the target comp, selected child layer indices and
  names, full enough layer order, and each concrete below-parent index/name.
- Each `set_layer_parent` result reports the exact child/parent indices,
  expected-name guards, and `postVerification.parentMatches:true`.
- Post-run `get_layer_details` proves every child layer's `parent.index` and
  `parent.name` match the reviewed below-parent layer.
- Semantic verification passes for every parent-link write and read-back.
- Unsupported bottom-layer selections, cycles, truncated layer inventory,
  ambiguous identities, layer reordering, track matte changes, non-generated
  user-layer mutation, source-exact native UI side effects, or raw script
  execution are reported as typed-tool gaps.

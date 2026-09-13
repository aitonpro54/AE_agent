# AR Parent Above Typed Plan

## Intent

Parent explicit generated or reviewed selected child layers to the layers
directly above them by deriving concrete same-comp child -> above-parent pairs
from current typed layer-order evidence, then reading each parent relationship
back.

## Applies When

- The user asks to run `AR_ParentAbove.jsx`, parent selected layers above, or
  parent selected layers to the layer directly above each selected child.
- Current typed evidence identifies the target composition, selected child
  layer indices, selected child names, complete enough layer order, and every
  reviewed above-parent layer.
- Every accepted `parentAboveSpec` pair is represented as concrete same-comp
  layer indices and expected layer names before mutation.
- Broad user timeline parenting, hidden source selection side effects, or exact
  native UI state are not required.

## Plan Pattern

1. Run `get_active_comp` to bind the target composition.
2. Run `get_selected_layers` only when selection is the user-facing input, then
   reduce the selected set to concrete one-based `selectedChildLayerIndices`
   and expected child names.
3. Run `get_comp_details includeLayers:true` or `get_layer_details` to bind the
   complete same-comp layer order needed for every child -> above-parent pair.
4. Build and show a reviewed `parentAboveSpec` containing comp identity,
   selected child layer indices/names, above-parent indices/names, skipped
   targets, cycle checks, and idempotency expectations.
5. Fail closed if any selected child is topmost, the above layer is missing, the
   layer inventory is truncated, identities are ambiguous, any pair would
   create a cycle, or non-generated user-asset mutation is not explicitly
   reviewed.
6. For each reviewed pair, run `set_layer_parent` with explicit `layerIndex`,
   `parentLayerIndex`, `expectedLayerName`, and `expectedParentName`.
7. Run `get_layer_details` after mutation for every child layer and confirm the
   parent index/name matches the reviewed above-parent layer.

## Safety Gates

- Require normal Agent plan validation, explicit confirmation,
  `allowMutations:true`, idempotency, checkpoint or edit-session protection, and
  post-mutation read-back before any parent-link mutation.
- The source JSX was not available in this detached child-run, so this recipe is
  not source-exact. Treat source-specific selection ordering, UI side effects,
  undo behavior, and any native script semantics as out of scope.

## Safety Limits

- Mutate only the explicit child layer parent links in the reviewed
  `parentAboveSpec` pairs.
- Do not create, delete, duplicate, rename, reorder, retime, relink, select
  extra layers, change track mattes, edit effects/expressions/properties,
  change labels, change layer switches, mutate project items, render queue, or
  files.
- Do not infer above-parent targets from screenshots, visual indentation, layer
  names alone, stale selection context, prior chat context, or source-script
  assumptions.
- Do not run broad selected-layer parenting on non-generated user assets without
  a separate reviewed contract and checkpoint/rollback scope.
- Do not use raw ExtendScript or source-checkout execution as a substitute for
  `set_layer_parent` plus typed read-back.

## Verification

- Pre-run evidence identifies the target comp, selected child layer indices and
  names, full enough layer order, and every child -> above-parent pair.
- Dry-run evidence shows `parentAboveSpec`, skipped targets, cycle checks, and
  the exact child/parent indices and expected names to write.
- Each `set_layer_parent` result reports the exact child/parent indices,
  expected-name guards, and `postVerification.parentMatches:true`.
- Post-run `get_layer_details` proves every child layer's `parent.index` and
  `parent.name` match the reviewed above-parent layer.
- Unsupported top-layer selections, cycles, truncated layer inventory, ambiguous
  identities, layer reordering, track matte changes, non-generated assets,
  source-exact native UI side effects, or raw script execution are reported as
  typed-tool gaps.

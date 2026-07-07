# AR Parent Above Odd Typed Plan

## Intent

Parent explicit generated or reviewed odd-scope selected child layers to the
layers directly above them by deriving concrete same-comp child -> above-parent
pairs from current typed layer-order evidence, then reading every parent
relationship back.

## Applies When

- The user asks to run `AR_ParentAboveOdd.jsx`, parent odd selected layers
  above, or parent only the reviewed odd subset of selected layers to the layer
  directly above each child.
- Current typed evidence identifies the target composition, selected layer
  indices, selected layer names, complete enough layer order, the reviewed odd
  subset policy, and every reviewed above-parent layer.
- Every accepted `parentAboveOddSpec` pair is represented as concrete same-comp
  layer indices and expected layer names before mutation.
- Broad user timeline parenting, source-exact odd-selection semantics, hidden
  source selection side effects, or exact native UI state are not required.

## Plan Pattern

1. Run `get_active_comp` to bind the target composition.
2. Run `get_selected_layers` only when selection is the user-facing input, then
   reduce the selected set to concrete one-based indices and expected names.
3. Run `get_comp_details includeLayers:true` or `get_layer_details` to bind the
   complete same-comp layer order needed for every child -> above-parent pair.
4. Build and show a reviewed `parentAboveOddSpec` containing comp identity,
   `oddSelectionPolicy`, selected layer evidence, accepted odd child layer
   indices/names, skipped even or unsupported targets, above-parent
   indices/names, cycle checks, and idempotency expectations.
5. Fail closed if the request does not explicitly define whether odd means odd
   selected ordinal or odd layer index, if any accepted odd child is topmost, if
   an above layer is missing, if the layer inventory is truncated, if identities
   are ambiguous, if any pair would create a cycle, or if non-generated
   user-asset mutation is not explicitly reviewed.
6. For each reviewed odd child pair, run `set_layer_parent` with explicit
   `layerIndex`, `parentLayerIndex`, `expectedLayerName`, and
   `expectedParentName`.
7. Run `get_layer_details` after mutation for every accepted child layer and
   confirm the parent index/name matches the reviewed above-parent layer. Also
   report skipped even or unsupported selected layers as unchanged.

## Safety Gates

- Require normal Agent plan validation, explicit confirmation,
  `allowMutations:true`, idempotency, checkpoint or edit-session protection, and
  post-mutation read-back before any parent-link mutation.
- The source JSX was not available in this detached child-run, so this recipe is
  not source-exact. Treat source-specific odd-selection rules, selection
  ordering, UI side effects, undo behavior, and any native script semantics as
  out of scope.

## Safety Limits

- Mutate only the explicit odd child layer parent links in the reviewed
  `parentAboveOddSpec` pairs.
- Do not create, delete, duplicate, rename, reorder, retime, relink, select
  extra layers, change track mattes, edit effects/expressions/properties,
  change labels, change layer switches, mutate project items, render queue, or
  files.
- Do not infer odd-selection policy or above-parent targets from screenshots,
  visual indentation, layer names alone, stale selection context, prior chat
  context, or source-script assumptions.
- Do not run broad selected-layer parenting on non-generated user assets without
  a separate reviewed contract and checkpoint/rollback scope.
- Do not use raw ExtendScript or source-checkout execution as a substitute for
  `set_layer_parent` plus typed read-back.

## Verification

- Pre-run evidence identifies the target comp, selected layer indices and names,
  reviewed odd-selection policy, accepted odd child layer indices, full enough
  layer order, and every odd child -> above-parent pair.
- Dry-run evidence shows `parentAboveOddSpec`, skipped even or unsupported
  targets, cycle checks, and the exact child/parent indices and expected names
  to write.
- Each `set_layer_parent` result reports the exact child/parent indices,
  expected-name guards, and `postVerification.parentMatches:true`.
- Post-run `get_layer_details` proves every accepted odd child layer's
  `parent.index` and `parent.name` match the reviewed above-parent layer.
- Unsupported odd-policy ambiguity, top-layer selections, cycles, truncated
  layer inventory, ambiguous identities, layer reordering, track matte changes,
  non-generated assets, source-exact native UI side effects, or raw script
  execution are reported as typed-tool gaps.

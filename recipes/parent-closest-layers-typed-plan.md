# Parent Closest Layers Typed Plan

## Intent

Parent explicit generated selected child layers to their nearest same-comp
layers by deriving concrete child -> parent pairs from current typed layer
position evidence, then reading each parent relationship back.

## Applies When

- The user asks to run `Parent_Closest_Layers` or parent selected layers to the
  closest layer in the composition.
- Current typed evidence identifies the target composition, selected child layer
  indices and names, complete enough same-comp layer inventory, and every
  candidate layer's 2D Transform Position.
- Each accepted nearest parent is generated or explicitly reviewed, same-comp,
  not the child itself, and unambiguous under the deterministic nearest-distance
  policy.
- Broad user timeline parenting, hidden source selection side effects, or exact
  native UI state are not required.

## Plan Pattern

1. Run `get_active_comp` to bind the target composition.
2. Run `get_selected_layers` only when selection is the user-facing input, then
   convert the selected set into concrete `selectedChildLayerIndices` and
   expected child names.
3. Run `get_comp_details includeLayers:true` and `get_layer_details
   includeProperties:true includeValues:true` as needed to bind every generated
   child and parent candidate with current 2D Transform Position evidence.
4. Derive `nearestParentPairs` by comparing squared 2D distances from each
   selected child to every other eligible same-comp layer. Reject missing
   position evidence, equal-distance ties, self-parenting, parent cycles,
   truncated inventory, cross-comp targets, and ambiguous identity.
5. For each reviewed pair, run `set_layer_parent` with explicit `layerIndex`,
   `parentLayerIndex`, `expectedLayerName`, and `expectedParentName`.
6. Run `get_layer_details` after mutation for every child layer and confirm the
   parent index/name matches the reviewed nearest-parent layer.

## Safety Gates

- Require normal Agent plan validation, explicit confirmation,
  `allowMutations:true`, idempotency, checkpoint or edit-session protection, and
  post-mutation read-back before any parent-link mutation.

## Safety Limits

- Mutate only the explicit child layer parent links in the reviewed nearest
  pairs.
- Do not create, delete, duplicate, rename, reorder, retime, relink, select
  extra layers, change track mattes, edit effects/expressions/properties, change
  labels, change layer switches, mutate project items, render queue, or files.
- Do not infer nearest parents from screenshots, visual layer order, layer names
  alone, stale selection context, or previous chat context.
- Do not resolve equal-distance ties by guesswork. Require a deterministic
  reviewed tie policy before supporting tied candidates.
- Do not run broad selected-layer parenting on non-generated user assets without
  a separate reviewed contract and checkpoint/rollback scope.
- Do not use raw ExtendScript or source-checkout execution as a substitute for
  `set_layer_parent` plus typed read-back.

## Verification

- Pre-run evidence identifies the target comp, selected child indices and names,
  eligible same-comp parent candidates, and every 2D position used to compute
  nearest-parent distance.
- The reviewed `nearestParentPairs` list records child index/name, parent
  index/name, and the compared distance.
- Each `set_layer_parent` result reports the exact child/parent indices,
  expected-name guards, and `postVerification.parentMatches:true`.
- Post-run `get_layer_details` proves every child layer's `parent.index` and
  `parent.name` match the reviewed nearest-parent layer.
- Semantic verification passes for every parent-link write and read-back.
- Unsupported equal-distance ties, missing transform evidence, cycles, truncated
  layer inventory, ambiguous identities, layer reordering, track matte changes,
  non-generated user-layer mutation, source-exact native UI side effects, or raw
  script execution are reported as typed-tool gaps.

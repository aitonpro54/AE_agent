# AR Trim Layers To Matte Typed Plan

## Goal

Trim reviewed selected active-composition layers to the timing bounds of their
verified track matte layers by reading current layer and matte relationship
evidence, building a reviewed `trimLayersToMatteSpec`, applying only layer
`inPoint` and `outPoint` changes with `set_layer_time_range`, and reading the
same layers back.

## Applies When

- The user asks to run `AR_TrimLayersToMatte.jsx`, trim layers to matte, or
  make selected fill layer timing match a verified track matte layer.
- Current typed evidence identifies the active composition, selected layer
  targets, each target's `hasTrackMatte` state, the concrete matte layer
  identity, and both fill/matte layer timing before mutation.
- The workflow can be narrowed to generated layers or layers the user has
  explicitly approved for timing mutation.
- A typed adaptation is acceptable: compute reviewed layer trim bounds from
  explicit matte-layer `inPoint` and `outPoint` evidence, change only the fill
  layer timing with `set_layer_time_range`, then read the same layers back.
- The workflow does not require creating, deleting, reordering, or assigning
  track matte relationships, source-exact native UI selection behavior, layer
  source trimming, startTime or stretch changes, raw JSX, or broad timeline
  mutation.

## Plan Pattern

1. Run `get_active_comp` to bind active comp identity, frame rate, selected-layer
   count, current time, and whether the request targets the current selection or
   explicit layer indices.
2. Run `get_selected_layers` when the target layers are implied by current
   selection. Fail closed if no selected layers are present, target evidence is
   stale, or the selected set is ambiguous.
3. Run `get_layer_details` or `get_comp_details includeLayers:true` to bind each
   accepted fill layer, its current `inPoint`, `outPoint`, `startTime`,
   lock/shy state when available, and typed matte relationship fields such as
   `hasTrackMatte`, `trackMatteTypeName`, and `trackMatteLayer`.
4. Run `get_layer_details` for every verified matte layer to capture concrete
   matte layer index/name and timing fields. Fail closed if the matte layer is
   missing, in another comp, ambiguous, hidden by truncated layer inventory, or
   identified only by name, screenshots, layer order assumptions, or prior chat
   context.
5. Build a reviewed `trimLayersToMatteSpec` before mutation. It must include
   target comp identity, fill layer indices/names, verified matte layer
   indices/names, existing matte type, matte timing source, computed
   `targetTrimTiming`, `verifiedMatteLayerTiming`, accepted layers, skipped
   layers, and skipped-target reasons.
6. Compute each accepted fill layer target from reviewed matte timing only:
   target `inPoint` equals the verified matte layer `inPoint` and target
   `outPoint` equals the verified matte layer `outPoint`, rounded to frame
   boundaries when the frame rate is available.
7. Fail closed when a target lacks `hasTrackMatte:true`, matte identity or
   timing evidence is missing, target `outPoint` is not greater than target
   `inPoint`, the target is locked or unsafe to retime, or the request requires
   changing the track matte relationship instead of trimming timing.
8. Run `set_layer_time_range` only for accepted explicit fill layer targets,
   passing the computed `inPoint` and `outPoint` values while leaving
   `startTime`, stretch, sources, effects, expressions, keyframes, labels,
   names, parenting, track matte assignments, layer order, selection state,
   comp work area/duration, project items, files, render queue state, matte
   layers, and non-target layers unchanged.
9. Run `get_layer_details` after mutation for every accepted fill layer and its
   matte layer to confirm the fill layer has the expected trim bounds and the
   matte relationship still points to the same verified matte layer.

## Safety Gates

- Mutating selected-layer timing workflow.
- Requires validated Agent plan, dry-run, explicit confirmation,
  `allowMutations:true`, idempotency, checkpoint or edit-session protection, and
  post-mutation read-back.
- Mutate only explicit reviewed generated layers or layers the user has approved
  for timing mutation from current typed evidence.
- Require current typed matte relationship and timing evidence; do not infer
  matte targets from layer names, screenshots, visual indentation, source-script
  assumptions, prior chat context, or stack position alone.
- Do not change `startTime`, stretch, source footage timing, keyframe times or
  values, interpolation, effects, expressions, markers, labels, names,
  parenting, track matte assignments, matte layers, layer order, selection
  state, comp work area/duration, project items, files, render queue items, or
  non-target layers.
- Do not execute source JSX, use raw ExtendScript, assign or remove track
  mattes, reorder layers to satisfy matte constraints, trim source footage,
  emulate native undo groups, scan unrelated comps, or promise exact source
  semantics without a separate typed-tool contract.

## Verification

- Pre-run evidence identifies the active comp, selected or explicit fill layer
  targets, verified matte layer identity for every accepted target, matte type,
  frame rate when available, and current fill/matte `inPoint`, `outPoint`, and
  `startTime` values.
- Dry-run evidence shows `trimLayersToMatteSpec`, accepted and skipped layers,
  skipped-target reasons, matte timing source, `verifiedMatteLayerTiming`, and
  computed `targetTrimTiming` for every accepted fill layer.
- Every `set_layer_time_range` step targets one explicit reviewed fill layer and
  sets only the computed `inPoint` and `outPoint` values for that layer.
- Post-run `get_layer_details` read-back shows each accepted fill layer starts
  at the verified matte layer `inPoint` and ends at the verified matte layer
  `outPoint`.
- Post-run evidence shows unchanged `startTime`, source timing, keyframes,
  effects, expressions, names, labels, parenting, layer order, selection state,
  comp duration/work area, project items, files, render queue items, matte layer
  timing, matte assignments, and non-target layer timing.
- Unsupported track matte creation/removal, layer reordering, source-exact
  native UI side effects, hidden selection ordering, source footage trimming,
  broad comp traversal, raw ExtendScript, or exact source JSX semantics are
  reported as typed-tool gaps.

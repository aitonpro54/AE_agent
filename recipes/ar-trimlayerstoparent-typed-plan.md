# AR Trim Layers To Parent Typed Plan

## Goal

Trim reviewed selected active-composition child layers to the timing bounds of
their verified parent layers by reading current layer and parent relationship
evidence, building a reviewed `trimLayersToParentSpec`, applying only layer
`inPoint` and `outPoint` changes with `set_layer_time_range`, and reading the
same layers back.

## Applies When

- The user asks to run `AR_TrimLayersToParent.jsx`, trim layers to parent, or
  make selected child layer timing match a verified parent layer.
- Current typed evidence identifies the active composition, selected child layer
  targets, each target's parent relationship, and both child/parent layer timing
  before mutation.
- The workflow can be narrowed to generated layers or layers the user has
  explicitly approved for timing mutation.
- A typed adaptation is acceptable: compute reviewed layer trim bounds from
  explicit parent-layer `inPoint` and `outPoint` evidence, change only the child
  layer timing with `set_layer_time_range`, then read the same layers back.
- The workflow does not require creating, deleting, reassigning, or clearing
  parent relationships, source-exact native UI selection behavior, layer source
  trimming, startTime or stretch changes, raw JSX, or broad timeline mutation.

## Plan Pattern

1. Run `get_active_comp` to bind active comp identity, frame rate,
   selected-layer count, current time, and whether the request targets the
   current selection or explicit layer indices.
2. Run `get_selected_layers` when the child targets are implied by current
   selection. Fail closed if no selected layers are present, target evidence is
   stale, or the selected set is ambiguous.
3. Run `get_layer_details` or `get_comp_details includeLayers:true` to bind each
   accepted child layer, its current `inPoint`, `outPoint`, `startTime`,
   lock/shy state when available, and typed parent relationship fields such as
   `parentLayerIndex`, parent layer name, or equivalent parent identity.
4. Run `get_layer_details` for every verified parent layer to capture concrete
   parent layer index/name and timing fields. Fail closed if the parent layer is
   missing, in another comp, ambiguous, hidden by truncated layer inventory, or
   identified only by name, screenshots, layer order assumptions, or prior chat
   context.
5. Build a reviewed `trimLayersToParentSpec` before mutation. It must include
   target comp identity, child layer indices/names, verified parent layer
   indices/names, parent timing source, computed `targetTrimTiming`,
   `verifiedParentLayerTiming`, accepted layers, skipped layers, and
   skipped-target reasons.
6. Compute each accepted child layer target from reviewed parent timing only:
   target `inPoint` equals the verified parent layer `inPoint` and target
   `outPoint` equals the verified parent layer `outPoint`, rounded to frame
   boundaries when the frame rate is available.
7. Fail closed when a target lacks a verified parent relationship, parent
   identity or timing evidence is missing, target `outPoint` is not greater than
   target `inPoint`, the target is locked or unsafe to retime, or the request
   requires changing the parent relationship instead of trimming timing.
8. Run `set_layer_time_range` only for accepted explicit child layer targets,
   passing the computed `inPoint` and `outPoint` values while leaving
   `startTime`, stretch, sources, effects, expressions, keyframes, labels,
   names, parenting, track mattes, layer order, selection state, comp work
   area/duration, project items, files, render queue state, parent layers, and
   non-target layers unchanged.
9. Run `get_layer_details` after mutation for every accepted child layer and its
   parent layer to confirm the child layer has the expected trim bounds and the
   parent relationship still points to the same verified parent layer.

## Safety Gates

- Mutating selected-layer timing workflow.
- Requires validated Agent plan, dry-run, explicit confirmation,
  `allowMutations:true`, idempotency, checkpoint or edit-session protection, and
  post-mutation read-back.
- Mutate only explicit reviewed generated layers or layers the user has approved
  for timing mutation from current typed evidence.
- Require current typed parent relationship and timing evidence; do not infer
  parent targets from layer names, screenshots, visual indentation, source-script
  assumptions, prior chat context, or stack position alone.
- Do not change `startTime`, stretch, source footage timing, keyframe times or
  values, interpolation, effects, expressions, markers, labels, names,
  parenting, track matte assignments, parent layers, layer order, selection
  state, comp work area/duration, project items, files, render queue items, or
  non-target layers.
- Do not execute source JSX, use raw ExtendScript, assign or clear parent links,
  reorder layers to satisfy parent constraints, trim source footage, emulate
  native undo groups, scan unrelated comps, or promise exact source semantics
  without a separate typed-tool contract.

## Verification

- Pre-run evidence identifies the active comp, selected or explicit child layer
  targets, verified parent layer identity for every accepted target, frame rate
  when available, and current child/parent `inPoint`, `outPoint`, and
  `startTime` values.
- Dry-run evidence shows `trimLayersToParentSpec`, accepted and skipped layers,
  skipped-target reasons, parent timing source, `verifiedParentLayerTiming`, and
  computed `targetTrimTiming` for every accepted child layer.
- Every `set_layer_time_range` step targets one explicit reviewed child layer
  and sets only the computed `inPoint` and `outPoint` values for that layer.
- Post-run `get_layer_details` read-back shows each accepted child layer starts
  at the verified parent layer `inPoint` and ends at the verified parent layer
  `outPoint`.
- Post-run evidence shows unchanged `startTime`, source timing, keyframes,
  effects, expressions, names, labels, parenting, layer order, selection state,
  comp duration/work area, project items, files, render queue items, parent
  layer timing, parent assignments, track matte assignments, and non-target
  layer timing.
- Unsupported parent assignment/removal, layer reordering, source-exact native
  UI side effects, hidden selection ordering, source footage trimming, broad
  comp traversal, raw ExtendScript, or exact source JSX semantics are reported
  as typed-tool gaps.

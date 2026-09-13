# AR Trim Layers To Keyframes Typed Plan

## Goal

Trim reviewed selected layers in the active composition to explicit keyframe
time bounds by reading current layer and selected-property evidence, building a
reviewed `trimLayersToKeyframesSpec`, applying only layer `inPoint` and
`outPoint` changes with `set_layer_time_range`, and reading the same layers
back.

## Applies When

- The user asks to run `AR_TrimLayersToKeyframes.jsx`, trim layers to
  keyframes, or make selected layer timing match reviewed keyframe time bounds.
- The active composition, selected layers, selected properties, keyframe times,
  frame rate, and current layer timing can be bound from current typed evidence
  before mutation.
- The workflow can be narrowed to generated layers or layers the user has
  explicitly approved for timing mutation.
- A typed adaptation is acceptable: compute reviewed layer trim bounds from
  explicit keyframe evidence, change only `inPoint` and `outPoint` with
  `set_layer_time_range`, then read the same layers back.
- The workflow does not require source-exact selected-key discovery, hidden
  selection ordering, keyframe movement, keyframe creation or deletion,
  time-remap edits, startTime or stretch changes, source footage trimming,
  native undo semantics, selection mutation, or raw JSX.

## Plan Pattern

1. Run `get_active_comp` to bind active comp identity, frame rate, frame
   duration, selected-layer count, selected-property context, and current time.
2. Run `get_selected_layers` to bind concrete selected layer targets. Fail
   closed if no selected layers are present or selected-layer evidence is stale
   or ambiguous.
3. Run `get_selected_properties` to capture explicit selected property and
   keyframe evidence. Require reviewed `selectedKeyframeBounds` for every
   accepted layer: layer index/name, property path, selected keyframe indices
   when available, and finite keyframe times.
4. Run `get_layer_details` for every accepted layer to capture current
   `inPoint`, `outPoint`, `startTime`, duration, lock/shy state when available,
   property keyframe read-back context, and whether the layer is generated or
   explicitly approved.
5. Build a reviewed `trimLayersToKeyframesSpec` before mutation. It must include
   target comp identity, frame rate, trim mode, selected layer indices/names,
   selected property paths, `selectedKeyframeBounds`, computed rounded
   `targetTrimTiming`, accepted layers, skipped layers, and skipped-target
   reasons.
6. Compute each accepted layer target from reviewed keyframe times only. The
   supported trim mode is `firstToLastSelectedKeyframe`: target `inPoint` is
   the earliest reviewed selected keyframe time for that layer and target
   `outPoint` is the latest reviewed selected keyframe time, optionally extended
   by one frame only when the reviewed spec explicitly requests an
   `includeLastKeyframeFrame` policy. Round timing values to frame boundaries
   with `Math.round(seconds * frameRate) / frameRate`.
7. Fail closed when selected keyframe evidence is missing, selected keyframes
   cross multiple layers without per-layer bounds, target `outPoint` is not
   greater than target `inPoint`, frame rate is missing or non-finite, a target
   is locked or unsafe to retime, expressions or unsupported property states
   make keyframe evidence ambiguous, or the request needs exact source JSX
   behavior.
8. Run `set_layer_time_range` only for accepted explicit layer targets, passing
   the computed rounded `inPoint` and `outPoint` values while leaving
   `startTime`, stretch, source timing, keyframe times and values, markers,
   effects, expressions, names, labels, parenting, track mattes, layer order,
   selection state, comp duration, comp work area, project items, files, and
   render queue state unchanged.
9. Run `get_layer_details` and, when useful, `get_selected_layers` or
   `get_selected_properties` after mutation to confirm every accepted layer has
   the expected trim bounds and every skipped or non-target layer/property
   stayed unchanged.

## Safety Gates

- Mutating selected-layer timing workflow.
- Requires validated Agent plan, dry-run, explicit confirmation,
  `allowMutations:true`, idempotency, checkpoint or edit-session protection, and
  post-mutation read-back.
- Mutate only explicit reviewed generated layers or layers the user has approved
  for timing mutation from current typed evidence.
- Require explicit reviewed `selectedKeyframeBounds`; do not infer keyframe
  times or selected-key status from screenshots, prior chat context, layer
  names, labels, property names alone, or source-script assumptions.
- Do not change `startTime`, stretch, source footage timing, keyframe times,
  keyframe values, interpolation, spatial tangents, expressions, markers,
  effects, labels, names, parenting, track mattes, layer order, selection state,
  comp work area/duration, project items, files, render queue items, or
  non-target layers.
- Do not execute source JSX, use raw ExtendScript, discover selected keys
  through native UI side effects, move or create keyframes, delete keyframes,
  alter time remap, slice source footage, emulate native undo groups, scan
  unrelated comps, or promise exact source semantics without a separate
  typed-tool contract.

## Verification

- Pre-run evidence identifies the active comp, frame rate, selected layers,
  selected property targets, reviewed `selectedKeyframeBounds`, and every
  accepted target layer index/name with current `inPoint`, `outPoint`, and
  `startTime` values.
- Dry-run evidence shows `trimLayersToKeyframesSpec`, trim mode,
  `includeLastKeyframeFrame` policy when used, rounded `targetTrimTiming`,
  accepted and skipped layers, skipped-target reasons, and the exact keyframe
  bounds used for each layer.
- Every `set_layer_time_range` step targets one explicit reviewed selected layer
  and sets only the computed rounded `inPoint` and `outPoint` values for that
  layer.
- Post-run `get_layer_details` read-back shows each accepted layer starts at the
  reviewed first selected keyframe boundary and ends at the reviewed last
  selected keyframe boundary or approved one-frame-inclusive boundary.
- Post-run evidence shows unchanged `startTime`, source timing, keyframe times
  and values, interpolation, effects, expressions, names, labels, parenting,
  layer order, selection state, comp duration/work area, project items, files,
  render queue items, selected-property targets, and non-target layer timing.
- Unsupported source-exact selected-key discovery, hidden selection ordering,
  native UI side effects, keyframe movement, keyframe creation or deletion,
  time-remap edits, source footage trimming, broad comp traversal, raw
  ExtendScript, or exact source JSX semantics are reported as typed-tool gaps.

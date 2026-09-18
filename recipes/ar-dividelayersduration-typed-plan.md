# AR Divide Layers Duration Typed Plan

## Goal

Divide the visible duration of reviewed selected layers into a sequential set of
equal sections based on the first selected layer's current duration, using typed
layer timing mutation and read-back instead of raw ExtendScript.

## Applies When

- The user asks to divide selected layers duration, sequence selected layers
  inside the first selected layer's duration, or references
  `AR_DivideLayersDuration.jsx`.
- The active composition and selected layers can be bound from current typed
  evidence before mutation.
- The selected-layer order is explicit from `get_selected_layers` evidence or is
  separately reviewed before the timing change.
- The workflow can be narrowed to reviewed generated layers or layers the user
  explicitly approves for timing mutation.
- A typed adaptation is acceptable: change only reviewed layer `inPoint` and
  `outPoint` values with `set_layer_time_range`, then read the same layers back.
- The workflow does not require source-exact AE selection internals, native undo
  behavior, layer splitting, ripple edits, keyframe shifts, startTime changes,
  stretch changes, source timing changes, selection mutation, or raw JSX.

## Plan Pattern

1. Run `get_active_comp` to bind the active comp identity, frame rate, frame
   duration, selected-layer count, and current time context.
2. Run `get_selected_layers` to capture the selected layers in the order that
   will be used for division. Fail closed if order is missing or ambiguous
   unless the user reviews an explicit ordered target list.
3. Run `get_layer_details` for every selected target and record layer index,
   name, inPoint, outPoint, startTime, source/timing state, lock/shy state when
   available, and whether the layer is generated or explicitly approved.
4. Build a reviewed `divideLayersDurationSpec` before mutation. It must include
   the ordered selected layer indices/names, `firstLayerDuration = outPoint -
   inPoint`, `selectedLayerCount`, `sectionDuration =
   firstLayerDuration / selectedLayerCount`, comp `frameRate`, and rounded target
   timing for every accepted layer.
5. Compute the first target out point as `firstLayer.inPoint + sectionDuration`,
   rounded to the nearest frame with `Math.round(outPoint * frameRate) /
   frameRate`. For every following selected layer, set `inPoint` to the previous
   rounded out point, then set `outPoint` to `inPoint + sectionDuration`, rounded
   to the nearest frame.
6. Fail closed when selected-layer evidence is empty, the first selected layer
   duration is missing or non-positive, frame rate is missing or non-finite,
   target timing would exceed approved bounds, any target is locked or otherwise
   unsafe to retime, selected order is unreviewed, or the request needs source
   exact AE selection side effects.
7. Run `set_layer_time_range` only for the explicit reviewed layer targets,
   passing the computed `inPoint` and `outPoint` values and leaving startTime,
   stretch, keyframes, sources, effects, expressions, names, labels, parenting,
   layer order, selection state, comp duration, and render queue state unchanged.
8. Run `get_layer_details` and, when useful, `get_selected_layers` after
   mutation to confirm every accepted layer has the expected rounded timing and
   every skipped or non-target layer stayed unchanged.

## Safety Gates

- Mutating selected-layer timing workflow.
- Requires validated Agent plan, dry-run, explicit confirmation,
  `allowMutations:true`, idempotency, checkpoint or edit-session protection, and
  post-mutation read-back.
- Mutate only explicit reviewed generated layers or layers the user has approved
  for timing mutation from current typed evidence.
- Do not infer selected-layer order, first-layer duration, frame rate, or target
  timing from screenshots, prior chat context, layer names, or source-script
  assumptions.
- Do not change `startTime`, stretch, source footage timing, keyframes, markers,
  effects, expressions, labels, names, parenting, track mattes, layer order,
  selection state, comp work area/duration, project items, files, render queue
  items, or non-target layers.
- Do not execute source JSX, use raw ExtendScript, emulate native undo groups,
  split layers, ripple downstream timing, scan unrelated comps, or promise exact
  source selection-order semantics without a separate typed-tool contract.

## Verification

- Pre-run evidence identifies the active comp, frame rate, selected-layer order,
  first selected layer duration, and every accepted target layer index/name with
  current inPoint and outPoint values.
- Dry-run evidence shows the reviewed `divideLayersDurationSpec`, including
  `sectionDuration`, rounded target `inPoint` and `outPoint` values, accepted and
  skipped layers, skipped-target reasons, and the exact selected order used.
- Every `set_layer_time_range` step targets one explicit reviewed selected layer
  and sets only the computed `inPoint` and `outPoint` values for that layer.
- Post-run `get_layer_details` read-back shows the first selected layer keeps
  its original inPoint, each following accepted layer starts at the previous
  rounded out point, and every accepted outPoint equals the expected rounded
  section boundary.
- Post-run evidence shows unchanged startTime, source timing, keyframes, effects,
  expressions, names, labels, parenting, layer order, selection state, comp
  duration/work area, project items, files, render queue items, and non-target
  layer timing.
- Unsupported source-exact selection ordering, native undo behavior, layer
  splitting, ripple edits, keyframe shifting, stretch/source timing changes,
  broad comp traversal, raw ExtendScript, or exact source JSX semantics are
  reported as typed-tool gaps.

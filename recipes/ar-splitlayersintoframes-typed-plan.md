# AR Split Layers Into Frames Typed Plan

## Goal

Retiming reviewed selected layers in the active composition into explicit
one-frame spans, using current typed layer evidence, a reviewed
`splitLayersIntoFramesSpec`, computed `targetFrameTiming`,
`set_layer_time_range`, and post-mutation read-back.

## Applies When

- The user asks to run `AR_SplitLayersIntoFrames.jsx`, split selected layers
  into frames, or arrange selected layers as one-frame slices.
- The active composition, frame rate, frame duration, and selected layers can
  be bound from current typed evidence before mutation.
- The selected-layer order, first target frame, one-frame duration policy, and
  target timing for every accepted layer are explicitly reviewed before
  mutation.
- The workflow can be narrowed to generated layers or layers the user has
  explicitly approved for timing mutation.
- A typed adaptation is acceptable: change only reviewed layer `inPoint` and
  `outPoint` values with `set_layer_time_range`, then read the same layers
  back.
- The workflow does not require source-exact layer splitting, layer
  duplication, source footage slicing, native undo behavior, hidden selection
  ordering, keyframe shifts, startTime changes, stretch changes, selection
  mutation, or raw JSX.

## Plan Pattern

1. Run `get_active_comp` to bind active comp identity, frame rate, frame
   duration, selected-layer count, and current time context.
2. Run `get_selected_layers` to capture the selected layers in the order that
   will receive one-frame timing. Fail closed if order is missing or ambiguous
   unless the user reviews an explicit ordered target list.
3. Run `get_layer_details` for every selected target and record layer index,
   name, inPoint, outPoint, startTime, duration, lock/shy state when available,
   source timing state, and whether the layer is generated or explicitly
   approved.
4. Build a reviewed `splitLayersIntoFramesSpec` before mutation. It must include
   ordered selected layer indices/names, `firstFrameTime`, comp `frameRate`,
   `frameDuration`, `oneFrameDurationPolicy`, rounded `targetFrameTiming`
   entries with `inPoint` and `outPoint` values for every accepted layer, and
   skipped-target reasons.
5. Compute the first accepted layer `inPoint` from `firstFrameTime`. For each
   following accepted layer, advance by exactly one frame duration. Set each
   accepted layer `outPoint` to `inPoint + frameDuration`, rounded to frame
   boundaries with `Math.round(seconds * frameRate) / frameRate`.
6. Fail closed when selected-layer evidence is empty, selected order is
   unreviewed, frame rate is missing or non-finite, target timing would exceed
   approved bounds, any target is locked or unsafe to retime, or the request
   needs actual layer splitting, layer duplication, source slicing, or
   source-exact JSX behavior.
7. Run `set_layer_time_range` only for explicit reviewed layer targets, passing
   the computed one-frame `inPoint` and `outPoint` values while leaving
   startTime, stretch, keyframes, sources, effects, expressions, names, labels,
   parenting, layer order, selection state, comp duration, comp work area, and
   render queue state unchanged.
8. Run `get_layer_details` and, when useful, `get_selected_layers` after
   mutation to confirm every accepted layer has the expected one-frame timing
   and every skipped or non-target layer stayed unchanged.

## Safety Gates

- Mutating selected-layer timing workflow.
- Requires validated Agent plan, dry-run, explicit confirmation,
  `allowMutations:true`, idempotency, checkpoint or edit-session protection, and
  post-mutation read-back.
- Mutate only explicit reviewed generated layers or layers the user has approved
  for timing mutation from current typed evidence.
- Do not infer selected-layer order, first frame, frame rate, frame duration,
  one-frame timing, or target timing from screenshots, prior chat context, layer
  names, labels, or source-script assumptions.
- Do not change `startTime`, stretch, source footage timing, keyframes, markers,
  effects, expressions, labels, names, parenting, track mattes, layer order,
  selection state, comp work area/duration, project items, files, render queue
  items, or non-target layers.
- Do not execute source JSX, use raw ExtendScript, split layers, duplicate
  layers, slice source footage, emulate native undo groups, scan unrelated
  comps, or promise exact source semantics without a separate typed-tool
  contract.

## Verification

- Pre-run evidence identifies the active comp, frame rate, frame duration,
  selected-layer order, reviewed `splitLayersIntoFramesSpec`, and every accepted
  target layer index/name with current inPoint and outPoint values.
- Dry-run evidence shows ordered targets, `firstFrameTime`,
  `oneFrameDurationPolicy`, rounded `targetFrameTiming`, accepted and skipped
  layers, skipped-target reasons, and the exact selected order used.
- Every `set_layer_time_range` step targets one explicit reviewed selected layer
  and sets only the computed one-frame `inPoint` and `outPoint` values for that
  layer.
- Post-run `get_layer_details` read-back shows each accepted layer starts at the
  reviewed rounded frame boundary and ends exactly one frame duration later.
- Post-run evidence shows unchanged startTime, source timing, keyframes,
  effects, expressions, names, labels, parenting, layer order, selection state,
  comp duration/work area, project items, files, render queue items, and
  non-target layer timing.
- Unsupported source-exact split-layers-into-frames behavior, actual layer
  splitting, duplication, source slicing, hidden selection ordering, native undo
  behavior, keyframe shifting, stretch/source timing changes, broad comp
  traversal, raw ExtendScript, or exact source JSX semantics are reported as
  typed-tool gaps.

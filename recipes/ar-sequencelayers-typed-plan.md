# AR Sequence Layers Typed Plan

## Goal

Sequence reviewed selected layers in the active composition by computing an
explicit `sequenceLayersSpec`, applying only layer `inPoint` and `outPoint`
changes with `set_layer_time_range`, and reading the same layers back.

## Applies When

- The user asks to run `AR_SequenceLayers.jsx`, sequence selected layers, or
  place selected layers one after another in time.
- The active composition and selected layers can be bound from current typed
  evidence before mutation.
- The selected-layer order, sequence start time, per-layer duration source, and
  optional overlap or gap are explicitly reviewed before mutation.
- The workflow can be narrowed to generated layers or layers the user has
  explicitly approved for timing mutation.
- A typed adaptation is acceptable: change only reviewed layer `inPoint` and
  `outPoint` values with `set_layer_time_range`, then read the same layers back.
- The workflow does not require source-exact AE Keyframe Assistant behavior,
  hidden selection ordering, native undo behavior, layer splitting, ripple
  edits, keyframe shifts, startTime changes, stretch changes, source timing
  changes, selection mutation, or raw JSX.

## Plan Pattern

1. Run `get_active_comp` to bind active comp identity, frame rate, frame
   duration, selected-layer count, and current time context.
2. Run `get_selected_layers` to capture the selected layers in the order that
   will be sequenced. Fail closed if order is missing or ambiguous unless the
   user reviews an explicit ordered target list.
3. Run `get_layer_details` for every selected target and record layer index,
   name, inPoint, outPoint, startTime, duration, lock/shy state when available,
   source timing state, and whether the layer is generated or explicitly
   approved.
4. Build a reviewed `sequenceLayersSpec` before mutation. It must include the
   ordered selected layer indices/names, `sequenceStartTime`, `durationPolicy`,
   optional `overlapOrGapSeconds`, comp `frameRate`, rounded target in/out
   points for every accepted layer, and skipped-target reasons.
5. Compute the first accepted layer `inPoint` from `sequenceStartTime`. For each
   following accepted layer, compute `inPoint` from the previous accepted
   layer's rounded `outPoint` plus the reviewed gap or minus the reviewed
   overlap. Compute each target `outPoint` from the reviewed duration policy,
   then round timing values to the nearest frame with
   `Math.round(seconds * frameRate) / frameRate`.
6. Fail closed when selected-layer evidence is empty, selected order is
   unreviewed, frame rate is missing or non-finite, duration policy is
   ambiguous, target timing would exceed approved bounds, any target is locked
   or unsafe to retime, overlap or gap semantics are ambiguous, or the request
   needs source-exact AE sequence-layers side effects.
7. Run `set_layer_time_range` only for explicit reviewed layer targets, passing
   the computed `inPoint` and `outPoint` values while leaving startTime, stretch,
   keyframes, sources, effects, expressions, names, labels, parenting, layer
   order, selection state, comp duration, comp work area, and render queue state
   unchanged.
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
- Do not infer selected-layer order, sequence start time, duration policy,
  overlap/gap policy, frame rate, or target timing from screenshots, prior chat
  context, layer names, or source-script assumptions.
- Do not change `startTime`, stretch, source footage timing, keyframes, markers,
  effects, expressions, labels, names, parenting, track mattes, layer order,
  selection state, comp work area/duration, project items, files, render queue
  items, or non-target layers.
- Do not execute source JSX, use raw ExtendScript, emulate AE Keyframe Assistant
  dialogs, emulate native undo groups, split layers, ripple downstream timing,
  scan unrelated comps, or promise exact source selection-order semantics
  without a separate typed-tool contract.

## Verification

- Pre-run evidence identifies the active comp, frame rate, selected-layer order,
  reviewed `sequenceLayersSpec`, and every accepted target layer index/name with
  current inPoint and outPoint values.
- Dry-run evidence shows ordered targets, `sequenceStartTime`, `durationPolicy`,
  optional `overlapOrGapSeconds`, rounded target `inPoint` and `outPoint` values,
  accepted and skipped layers, skipped-target reasons, and the exact selected
  order used.
- Every `set_layer_time_range` step targets one explicit reviewed selected layer
  and sets only the computed `inPoint` and `outPoint` values for that layer.
- Post-run `get_layer_details` read-back shows each accepted layer starts at the
  reviewed rounded sequence boundary and ends at the expected rounded duration
  boundary.
- Post-run evidence shows unchanged startTime, source timing, keyframes, effects,
  expressions, names, labels, parenting, layer order, selection state, comp
  duration/work area, project items, files, render queue items, and non-target
  layer timing.
- Unsupported source-exact AE sequence-layers behavior, hidden selection
  ordering, overlap/dissolve UI behavior, native undo behavior, layer splitting,
  ripple edits, keyframe shifting, stretch/source timing changes, broad comp
  traversal, raw ExtendScript, or exact source JSX semantics are reported as
  typed-tool gaps.

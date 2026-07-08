# AR Distribute Keyframes By Step Typed Plan

## Goal

Distribute explicit reviewed selected keyframes on current selected properties by
a reviewed time step, rewriting the complete property keyframe sequence with
`set_property_keyframes clearExisting:true`, then reading the same properties
back.

## Applies When

- The user asks to run `AR_DistributeKeyframesByStep.jsx`, distribute selected
  keyframes by step, or space selected keyframes at a fixed timeline interval.
- The active composition, selected properties, complete property keyframes,
  selected keyframe identities, frame rate, distribution anchor, and step value
  can be bound from current typed evidence before mutation.
- A typed adaptation is acceptable: the plan computes reviewed
  `distributedKeyframes` from explicit `selectedKeyframesToDistribute`,
  preserves every unselected keyframe, rewrites only accepted property keyframe
  sequences through `set_property_keyframes`, and reads the same layer/property
  paths back.
- The workflow does not require source-exact native selected-key discovery,
  hidden UI selection ordering, native dialog/default step behavior,
  interpolation or tangent preservation beyond explicit reviewed keyframe
  payloads, selection mutation, native undo semantics, or raw JSX.

## Plan Pattern

1. Run `get_active_comp` to bind active comp identity, frame rate, frame
   duration, selected-property context, current time, and target comp timing
   boundaries.
2. Run `get_selected_properties` with keyframe/value detail to bind concrete
   layer indices, property paths, value shapes, expression state, selected
   keyframe identities when available, and current keyframe evidence.
3. Run `get_layer_details` for every affected layer to capture complete
   property keyframe read-back for the accepted property paths. Do not rewrite a
   property unless the complete pre-run keyframe sequence is available.
4. Build a reviewed `distributeKeyframesByStepSpec` before mutation. It must
   include the target comp identity, frame rate, distribution mode,
   `distributionAnchorTime`, `distributionStep`, accepted property targets,
   complete keyframe sequences, `selectedKeyframesToDistribute`,
   `preservedUnselectedKeyframes`, `distributedKeyframes`, skipped targets, and
   skipped-target reasons.
5. The supported distribution mode is `selectedKeyframesFromAnchorByStep`:
   explicitly reviewed selected keyframes on an accepted property are ordered by
   their reviewed selected-keyframe order, then assigned times
   `distributionAnchorTime + index * distributionStepSeconds`, rounded to the
   nearest frame with `Math.round(seconds * frameRate) / frameRate`. Values are
   preserved from the selected keyframes unless a separate reviewed value
   payload is supplied.
6. Accept `distributionStepSeconds` only when it is finite, positive, and
   in-bounds after rounding. If the user supplies frames instead, convert
   reviewed `distributionStepFrames` to seconds with the current frame rate and
   record both representations in the spec.
7. Fail closed when selected-property evidence is empty, a target has enabled
   expressions, value shapes are unsupported, complete keyframe read-back is
   missing, selected keyframes are ambiguous, selected-key order is ambiguous,
   the anchor or step is missing, non-finite, zero, negative, outside reviewed
   comp/layer bounds, or distribution would create unresolved same-property time
   collisions.
8. Run `set_property_keyframes` once per accepted property target with
   `clearExisting:true` only after the full replacement sequence is reviewed
   and includes all preserved unselected keyframes plus the computed distributed
   selected keyframes.
9. Run `get_layer_details` after mutation and compare the affected
   layer/property keyframes with `distributedKeyframes` and
   `preservedUnselectedKeyframes`.

## Safety Gates

- Mutating selected-property keyframe timing workflow.
- Requires validated Agent plan, dry-run, explicit confirmation,
  `allowMutations:true`, idempotency, checkpoint or edit-session protection, and
  post-mutation read-back.
- Mutate only explicit reviewed generated properties or properties the user has
  approved for keyframe timing mutation from current typed evidence.
- Require explicit reviewed `distributeKeyframesByStepSpec`,
  `selectedKeyframesToDistribute`, complete pre-run keyframe sequences,
  `distributionAnchorTime`, `distributionStep`, and `distributedKeyframes`; do
  not infer selected keys, selected-key order, anchor, step, frame rate, value
  shape, or collision policy from screenshots, prior chat context, layer names,
  property names alone, or source-script assumptions.
- Preserve unselected keyframes, keyframe values, layer timing, source timing,
  expressions, effects, markers, names, labels, parenting, track mattes, layer
  order, selection state, comp duration/work area, project items, files, render
  queue items, and non-target properties unless a separate reviewed typed
  contract covers them.
- Do not execute source JSX, use raw ExtendScript, discover selected keys
  through native UI side effects, infer native dialog/default step behavior,
  mutate selection order, delete keyframes without a full replacement sequence,
  change interpolation/ease or spatial tangents without explicit reviewed
  payloads, resolve unresolved same-time key collisions without an explicit
  reviewed collision policy, scan unrelated comps, or promise exact source
  semantics without a separate typed-tool contract.

## Verification

- Pre-run evidence identifies the active comp, frame rate, selected property
  targets, complete property keyframes, reviewed
  `selectedKeyframesToDistribute`, reviewed
  `distributeKeyframesByStepSpec`, and every accepted target layer/property
  path.
- Dry-run evidence shows distribution mode, `distributionAnchorTime`,
  `distributionStep`, rounded `distributedKeyframes`,
  `preservedUnselectedKeyframes`, accepted and skipped targets,
  skipped-target reasons, and the exact keyframe sequence that will be written
  for each accepted property.
- Every `set_property_keyframes` step targets one explicit reviewed property
  path and uses `clearExisting:true` only with a complete replacement sequence.
- Post-run `get_layer_details` read-back shows the accepted selected keyframes
  spaced by the reviewed step from the reviewed anchor and all preserved
  unselected keyframes still present on the same property paths.
- Post-run evidence shows unchanged keyframe values unless explicitly reviewed,
  unchanged layer timing, source timing, expressions, effects, names, labels,
  parenting, layer order, selection state, comp duration/work area, project
  items, files, render queue items, and non-target properties.
- Unsupported source-exact selected-key discovery, hidden UI ordering, native
  dialog/default step behavior, native side effects, interpolation/ease or
  tangent preservation gaps, unresolved time collisions, raw ExtendScript, or
  exact source JSX semantics are reported as typed-tool gaps.

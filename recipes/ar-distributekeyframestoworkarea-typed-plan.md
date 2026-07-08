# AR Distribute Keyframes To Work Area Typed Plan

## Goal

Distribute explicit reviewed selected keyframes on current selected properties
evenly across the active composition work area, rewriting the complete property
keyframe sequence with `set_property_keyframes clearExisting:true`, then
reading the same properties back.

## Applies When

- The user asks to run `AR_DistributeKeyframesToWorkArea.jsx`, distribute
  selected keyframes to the work area, or space selected keyframes uniformly
  across the active comp work area.
- The active composition, work area start and end times, selected properties,
  complete property keyframes, selected keyframe identities, frame rate, and
  selected-key order can be bound from current typed evidence before mutation.
- A typed adaptation is acceptable: the plan computes reviewed
  `workAreaDistributedKeyframes` from explicit
  `selectedKeyframesToDistribute`, preserves every unselected keyframe,
  rewrites only accepted property keyframe sequences through
  `set_property_keyframes`, and reads the same layer/property paths back.
- The workflow does not require source-exact native selected-key discovery,
  hidden UI selection ordering, native work-area UI side effects,
  interpolation or tangent preservation beyond explicit reviewed keyframe
  payloads, selection mutation, native undo semantics, or raw JSX.

## Plan Pattern

1. Run `get_active_comp` to bind active comp identity, frame rate, frame
   duration, selected-property context, current time, and work area timing
   boundaries.
2. Run `get_selected_properties` with keyframe/value detail to bind concrete
   layer indices, property paths, value shapes, expression state, selected
   keyframe identities when available, and current keyframe evidence.
3. Run `get_layer_details` for every affected layer to capture complete
   property keyframe read-back for the accepted property paths. Do not rewrite a
   property unless the complete pre-run keyframe sequence is available.
4. Build a reviewed `distributeKeyframesToWorkAreaSpec` before mutation. It
   must include the target comp identity, frame rate, distribution mode,
   `workAreaStartTime`, `workAreaEndTime`, accepted property targets, complete
   keyframe sequences, `selectedKeyframesToDistribute`,
   `preservedUnselectedKeyframes`, `workAreaDistributedKeyframes`, skipped
   targets, and skipped-target reasons.
5. The supported distribution mode is `selectedKeyframesEvenlyAcrossWorkArea`:
   explicitly reviewed selected keyframes on an accepted property are ordered by
   reviewed selected-keyframe order, then assigned times between
   `workAreaStartTime` and `workAreaEndTime`. For more than one selected
   keyframe, compute the interval as
   `(workAreaEndTime - workAreaStartTime) / (selectedCount - 1)`. For a single
   selected keyframe, use the reviewed `workAreaStartTime`. Round computed
   times to the nearest frame with
   `Math.round(seconds * frameRate) / frameRate`. Values are preserved from the
   selected keyframes unless a separate reviewed value payload is supplied.
6. Accept work area boundaries only when they are finite, ordered, inside the
   reviewed comp duration after rounding, and sufficient for the selected
   keyframe count. Reject missing or zero-length work areas unless the user
   explicitly reviews a narrower policy before mutation.
7. Fail closed when selected-property evidence is empty, a target has enabled
   expressions, value shapes are unsupported, complete keyframe read-back is
   missing, selected keyframes are ambiguous, selected-key order is ambiguous,
   work area boundaries are missing or out of bounds, the computed interval is
   non-finite or negative, or distribution would create unresolved same-property
   time collisions.
8. Run `set_property_keyframes` once per accepted property target with
   `clearExisting:true` only after the full replacement sequence is reviewed
   and includes all preserved unselected keyframes plus the computed work-area
   distributed selected keyframes.
9. Run `get_layer_details` after mutation and compare the affected
   layer/property keyframes with `workAreaDistributedKeyframes` and
   `preservedUnselectedKeyframes`.

## Safety Gates

- Mutating selected-property keyframe timing workflow.
- Requires validated Agent plan, dry-run, explicit confirmation,
  `allowMutations:true`, idempotency, checkpoint or edit-session protection, and
  post-mutation read-back.
- Mutate only explicit reviewed generated properties or properties the user has
  approved for keyframe timing mutation from current typed evidence.
- Require explicit reviewed `distributeKeyframesToWorkAreaSpec`,
  `selectedKeyframesToDistribute`, complete pre-run keyframe sequences,
  `workAreaStartTime`, `workAreaEndTime`,
  `preservedUnselectedKeyframes`, and `workAreaDistributedKeyframes`; do not
  infer selected keys, selected-key order, work area boundaries, frame rate,
  value shape, or collision policy from screenshots, prior chat context, layer
  names, property names alone, or source-script assumptions.
- Preserve unselected keyframes, keyframe values, layer timing, source timing,
  expressions, effects, markers, names, labels, parenting, track mattes, layer
  order, selection state, comp duration/work area, project items, files, render
  queue items, and non-target properties unless a separate reviewed typed
  contract covers them.
- Do not execute source JSX, use raw ExtendScript, discover selected keys
  through native UI side effects, infer source-exact work-area behavior, mutate
  selection order, delete keyframes without a full replacement sequence, change
  interpolation/ease or spatial tangents without explicit reviewed payloads,
  resolve unresolved same-time key collisions without an explicit reviewed
  collision policy, scan unrelated comps, or promise exact source semantics
  without a separate typed-tool contract.

## Verification

- Pre-run evidence identifies the active comp, frame rate, work area start and
  end times, selected property targets, complete property keyframes, reviewed
  `selectedKeyframesToDistribute`, reviewed
  `distributeKeyframesToWorkAreaSpec`, and every accepted target layer/property
  path.
- Dry-run evidence shows distribution mode, `workAreaStartTime`,
  `workAreaEndTime`, computed interval, rounded
  `workAreaDistributedKeyframes`, `preservedUnselectedKeyframes`, accepted and
  skipped targets, skipped-target reasons, and the exact keyframe sequence that
  will be written for each accepted property.
- Every `set_property_keyframes` step targets one explicit reviewed property
  path and uses `clearExisting:true` only with a complete replacement sequence.
- Post-run `get_layer_details` read-back shows the accepted selected keyframes
  evenly spaced across the reviewed work area and all preserved unselected
  keyframes still present on the same property paths.
- Post-run evidence shows unchanged keyframe values unless explicitly reviewed,
  unchanged layer timing, source timing, expressions, effects, names, labels,
  parenting, layer order, selection state, comp duration/work area, project
  items, files, render queue items, and non-target properties.
- Unsupported source-exact selected-key discovery, hidden UI ordering, native
  work-area side effects, interpolation/ease or tangent preservation gaps,
  unresolved time collisions, raw ExtendScript, or exact source JSX semantics
  are reported as typed-tool gaps.

# AR Distribute Keyframes To Layer Typed Plan

## Goal

Distribute explicit reviewed selected keyframes on current selected properties
evenly across reviewed layer timing bounds, rewriting the complete property
keyframe sequence with `set_property_keyframes clearExisting:true`, then
reading the same properties back.

## Applies When

- The user asks to run `AR_DistributeKeyframesToLayer.jsx`, distribute selected
  keyframes to layer, or space selected keyframes uniformly across a reviewed
  layer in/out range.
- The active composition, selected layer or owning layer timing bounds,
  selected properties, complete property keyframes, selected keyframe
  identities, frame rate, and selected-key order can be bound from current typed
  evidence before mutation.
- A typed adaptation is acceptable: the plan computes reviewed
  `layerDistributedKeyframes` from explicit `selectedKeyframesToDistribute`,
  preserves every unselected keyframe, rewrites only accepted property keyframe
  sequences through `set_property_keyframes`, and reads the same layer/property
  paths back.
- The workflow does not require source-exact native selected-key discovery,
  hidden UI selection ordering, native layer UI side effects, interpolation or
  tangent preservation beyond explicit reviewed keyframe payloads, selection
  mutation, native undo semantics, or raw JSX.

## Plan Pattern

1. Run `get_active_comp` to bind active comp identity, frame rate, frame
   duration, selected-property context, current time, duration, and selected
   layer context.
2. Run `get_selected_layers` when layer timing bounds must come from the current
   selected layer set. Bind concrete layer indices, names, inPoint, outPoint,
   startTime, and duration evidence when available.
3. Run `get_selected_properties` with keyframe/value detail to bind concrete
   layer indices, property paths, value shapes, expression state, selected
   keyframe identities when available, and current keyframe evidence.
4. Run `get_layer_details` for every affected layer to capture complete
   property keyframe read-back and the reviewed layer timing range for accepted
   property paths. Do not rewrite a property unless the complete pre-run
   keyframe sequence and layer timing bounds are available.
5. Build a reviewed `distributeKeyframesToLayerSpec` before mutation. It must
   include the target comp identity, frame rate, distribution mode,
   `layerDistributionStartTime`, `layerDistributionEndTime`, accepted property
   targets, layer timing source, complete keyframe sequences,
   `selectedKeyframesToDistribute`, `preservedUnselectedKeyframes`,
   `layerDistributedKeyframes`, skipped targets, and skipped-target reasons.
6. The supported distribution mode is `selectedKeyframesEvenlyAcrossLayerRange`:
   explicitly reviewed selected keyframes on an accepted property are ordered by
   reviewed selected-keyframe order, then assigned times between
   `layerDistributionStartTime` and `layerDistributionEndTime`. For more than
   one selected keyframe, compute the interval as
   `(layerDistributionEndTime - layerDistributionStartTime) / (selectedCount - 1)`.
   For a single selected keyframe, use the reviewed
   `layerDistributionStartTime`. Round computed times to the nearest frame with
   `Math.round(seconds * frameRate) / frameRate`. Values are preserved from the
   selected keyframes unless a separate reviewed value payload is supplied.
7. Accept layer timing bounds only when they are finite, ordered, inside the
   reviewed comp duration after rounding, and sufficient for the selected
   keyframe count. Reject ambiguous multi-layer bounds unless every affected
   property has an explicit reviewed layer timing source.
8. Fail closed when selected-property evidence is empty, selected-layer/layer
   timing evidence is ambiguous, a target has enabled expressions, value shapes
   are unsupported, complete keyframe read-back is missing, selected keyframes
   are ambiguous, selected-key order is ambiguous, layer timing bounds are
   missing or out of bounds, the computed interval is non-finite or negative, or
   distribution would create unresolved same-property time collisions.
9. Run `set_property_keyframes` once per accepted property target with
   `clearExisting:true` only after the full replacement sequence is reviewed
   and includes all preserved unselected keyframes plus the computed
   layer-distributed selected keyframes.
10. Run `get_layer_details` after mutation and compare the affected
    layer/property keyframes with `layerDistributedKeyframes` and
    `preservedUnselectedKeyframes`.

## Safety Gates

- Mutating selected-property keyframe timing workflow.
- Requires validated Agent plan, dry-run, explicit confirmation,
  `allowMutations:true`, idempotency, checkpoint or edit-session protection, and
  post-mutation read-back.
- Mutate only explicit reviewed generated properties or properties the user has
  approved for keyframe timing mutation from current typed evidence.
- Require explicit reviewed `distributeKeyframesToLayerSpec`,
  `selectedKeyframesToDistribute`, complete pre-run keyframe sequences,
  `layerDistributionStartTime`, `layerDistributionEndTime`,
  `preservedUnselectedKeyframes`, and `layerDistributedKeyframes`; do not infer
  selected keys, selected-key order, layer boundaries, frame rate, value shape,
  property targets, or collision policy from screenshots, prior chat context,
  layer names, property names alone, or source-script assumptions.
- Preserve unselected keyframes, keyframe values, layer timing, source timing,
  expressions, effects, markers, names, labels, parenting, track mattes, layer
  order, selection state, comp duration/work area, project items, files, render
  queue items, and non-target properties unless a separate reviewed typed
  contract covers them.
- Do not execute source JSX, use raw ExtendScript, discover selected keys
  through native UI side effects, infer source-exact layer-boundary behavior,
  mutate selection order, delete keyframes without a full replacement sequence,
  change interpolation/ease or spatial tangents without explicit reviewed
  payloads, resolve unresolved same-time key collisions without an explicit
  reviewed collision policy, scan unrelated comps, or promise exact source
  semantics without a separate typed-tool contract.

## Verification

- Pre-run evidence identifies the active comp, frame rate, layer distribution
  start and end times, selected layer or owning layer timing source, selected
  property targets, complete property keyframes, reviewed
  `selectedKeyframesToDistribute`, reviewed
  `distributeKeyframesToLayerSpec`, and every accepted target layer/property
  path.
- Dry-run evidence shows distribution mode, `layerDistributionStartTime`,
  `layerDistributionEndTime`, computed interval, rounded
  `layerDistributedKeyframes`, `preservedUnselectedKeyframes`, accepted and
  skipped targets, skipped-target reasons, and the exact keyframe sequence that
  will be written for each accepted property.
- Every `set_property_keyframes` step targets one explicit reviewed property
  path and uses `clearExisting:true` only with a complete replacement sequence.
- Post-run `get_layer_details` read-back shows the accepted selected keyframes
  evenly spaced across the reviewed layer timing bounds and all preserved
  unselected keyframes still present on the same property paths.
- Post-run evidence shows unchanged keyframe values unless explicitly reviewed,
  unchanged layer timing, source timing, expressions, effects, names, labels,
  parenting, layer order, selection state, comp duration/work area, project
  items, files, render queue items, and non-target properties.
- Unsupported source-exact selected-key discovery, hidden UI ordering, native
  layer UI side effects, interpolation/ease or tangent preservation gaps,
  unresolved time collisions, raw ExtendScript, or exact source JSX semantics
  are reported as typed-tool gaps.

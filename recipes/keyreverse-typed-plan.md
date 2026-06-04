# Keyreverse Typed Plan

## Goal

Reverse an explicit selected-keyframe value sequence on currently selected AE
properties through existing typed keyframe tools, without copying source JSX,
changing keyframe times, or claiming source-exact playhead-copy behavior.

## Applies When

- The user asks to run `keyReverse`, reverse selected keys, reverse selected
  keyframes, reverse a selected animation segment, or reverse the selected
  keyframe values on currently selected properties.
- Current `get_selected_properties` evidence includes concrete `layerIndex`,
  exact `propertyPath`, value shape, expression state, and keyframe/animated
  state for each target.
- The plan has explicit reviewed `selectedKeyframes` for each accepted target,
  including keyframe indices, times, values, and the intended
  `keyReverseMode`.
- The supported mode is `reverseValueOrderAtSameTimes`: preserve the selected
  keyframe times and assign values from the selected-keyframe sequence in
  reverse order.
- If the user needs native selected-key discovery, changing keyframe times,
  adding reversed key copies at the current comp time, deleting keys, mirroring
  keys across a time span, exact interpolation or spatial tangent preservation,
  expression-derived sampling, source-exact behavior, or raw JSX execution,
  fail closed and require a separate typed-tool contract.

## Plan Pattern

1. Run `get_active_comp` to bind the active composition.
2. Run `get_selected_properties` with value, expression, and keyframe evidence.
3. Bind concrete selected property targets only from current typed evidence:
   comp identity, `layerIndex`, layer name when available, exact
   `propertyPath`, value shape, expression state, and animated/keyframe state.
4. Require explicit reviewed `selectedKeyframes` for every accepted target. Do
   not infer selected keys from prior chat context, property selection alone, or
   native AE selected-key side effects.
5. Fail closed when selected-property evidence is empty, lacks exact
   layer/property targets, lacks selected keyframe times and values, has enabled
   expressions, has unsupported value shapes, requires changing key times,
   requires adding reversed key copies at the playhead, requires deleting keys,
   or requires source-exact selected-key discovery.
6. Compute and disclose `reversedKeyframes` before confirmation. For
   `reverseValueOrderAtSameTimes`, keep the selected keyframe times fixed and
   assign values from the reviewed selected-keyframe sequence in reverse order.
7. Run one `set_property_keyframes` step per accepted property target with the
   inspected comp target, evidence-backed `layerIndex`, exact `propertyPath`,
   computed `reversedKeyframes`, and `clearExisting:false`.
8. Use `apply_keyframe_ease` only when the plan has explicit reviewed
   `keyIndices` and requested interpolation/ease settings after the keyframe
   values are set.
9. Run `get_layer_details` for every affected layer with enough property detail
   to read back the keyframed property.
10. Report skipped selected properties with explicit typed-tool gap reasons.

## Safety Gates

- Mutating selected-property keyframe workflow.
- Requires validated Agent plan, explicit user confirmation,
  `allowMutations:true`, idempotency, checkpoint/edit-session protection, and
  post-mutation read-back.
- Use only current typed selected-property evidence plus explicit reviewed
  `selectedKeyframes`; do not infer targets from previous chat context.
- Do not use raw ExtendScript, script runners, or native selected-key side
  effects.
- Do not clear, delete, add playhead-copy keys, or move existing keys in this
  recipe; use `clearExisting:false`.
- Do not change expressions, non-keyframed static values, layer names, layer
  timing, effects, sources, masks, render queue items, project items, selection
  state, unselected keys, or unselected properties.

## Verification

- Pre-run `get_selected_properties` identifies every concrete selected property
  target, owning layer, exact property path, current value shape, expression
  state, and keyframe/animated state when available.
- Dry-run evidence shows previous `selectedKeyframes`, `keyReverseMode`, and
  computed `reversedKeyframes` for every accepted target.
- Each `set_property_keyframes` result reports the expected property path,
  `clearExisting:false`, and the expected number of `reversedKeyframes`.
- Any `apply_keyframe_ease` step uses explicit reviewed `keyIndices` and
  reports those key indices after easing.
- Post-run `get_layer_details` shows the selected keyframe times now carry the
  computed reversed values on the expected layer/property path.
- Skipped targets are reported with explicit reasons such as missing selected
  keyframe evidence, expression-driven property, unsupported value shape,
  selected-key discovery gap, key-time mutation gap, key deletion gap,
  interpolation preservation gap, playhead-copy insertion gap, missing
  read-back, or unsupported exact source semantics.
- Post-run evidence shows no expression, timing, effect, source, render queue,
  layer name, selection state, project item, key removal, key-time mutation, or
  unselected property mutation.

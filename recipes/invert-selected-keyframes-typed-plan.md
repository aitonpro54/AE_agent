# Invert Selected Keyframes Typed Plan

## Goal

Invert an explicit selected-keyframe value sequence on currently selected AE properties through existing typed keyframe tools, without copying source JSX or changing selection state.

## Applies When

- Пользователь просит invert selected keyframes, reverse selected keyframes, flip selected keyframe values, or invert a reviewed keyframe value sequence on currently selected properties.
- Current `get_selected_properties` evidence includes concrete `layerIndex`, exact `propertyPath`, value shape, and keyframe/animated state for each target.
- The plan has explicit reviewed `selectedKeyframes` for each accepted target, including keyframe indices, times, values, and the intended `inversionMode`.
- The default supported mode is `reverseValueOrderAtSameTimes`: keep the selected keyframe times fixed and assign the selected keyframe values in reverse order.
- If the user needs selected-key discovery without explicit reviewed keyframes, spatial tangent editing, exact interpolation/ease preservation, expression-derived sampling, destructive key removal, broad property scans, or source-exact selection side effects, fail closed and require a separate typed-tool contract.

## Plan Pattern

1. Run `get_active_comp` to bind the active composition.
2. Run `get_selected_properties` with `includeValues:true` and `includeExpressions:true`.
3. Bind concrete selected property targets only from that evidence: comp identity, `layerIndex`, layer name when available, exact `propertyPath`, current value shape, expression state, and keyframe/animated state when available.
4. Require explicit reviewed `selectedKeyframes` for every accepted target. Do not infer selected keyframes from prior chat context, property selection alone, or raw AE selection side effects.
5. Fail closed when selected-property evidence is empty, lacks layer/property path targets, lacks exact selected keyframe times and values, has expression text or enabled expressions, has unsupported value shapes, requires removing keys, or requires source-exact selected-key discovery.
6. Compute and disclose `invertedKeyframes` before confirmation. For `reverseValueOrderAtSameTimes`, preserve each selected keyframe time and assign values from the selected-keyframe sequence in reverse order.
7. Run one `set_property_keyframes` step per accepted property target with the inspected comp target, evidence-backed `layerIndex`, exact `propertyPath`, computed `invertedKeyframes`, and `clearExisting:false`.
8. Use `apply_keyframe_ease` only when the plan has explicit reviewed `keyIndices` plus requested ease/interpolation settings after keyframe values are set.
9. Run `get_layer_details` for every affected layer with enough property detail to read back the keyframed property.
10. Report skipped selected properties with the typed-tool gap reason instead of silently changing them.

## Safety Gates

- Mutating selected-property keyframe workflow.
- Requires validated Agent plan, explicit user confirmation, `allowMutations:true`, idempotency, checkpoint/edit-session protection, and post-mutation read-back.
- Do not infer selected properties or selected keyframes from prior chat context; use only current typed evidence plus explicit reviewed `selectedKeyframes`.
- Do not use default selected-key behavior in `apply_keyframe_ease`; pass explicit reviewed `keyIndices`.
- Do not clear or remove existing keys in this recipe; use `clearExisting:false`.
- Do not change expressions, non-keyframed static values, layer transforms outside the explicit property keyframes, layer names, effects, sources, masks, render queue items, project items, selection state, or unselected properties.

## Verification

- Pre-run `get_selected_properties` identifies every concrete selected property target, its owning layer, exact property path, current value shape, expression state, and keyframe/animated state when available.
- The dry-run plan shows previous `selectedKeyframes`, `inversionMode`, and computed `invertedKeyframes` for every accepted target.
- Each `set_property_keyframes` result reports the expected property path, `clearExisting:false`, and the expected number of `invertedKeyframes`.
- Any `apply_keyframe_ease` step uses explicit reviewed `keyIndices` and reports those key indices after easing.
- Post-run `get_layer_details` shows the affected property has the expected keyframe count and the selected times now carry the computed inverted values.
- Skipped targets are reported with explicit reasons such as missing selected keyframe evidence, expression-driven property, unsupported value shape, missing read-back, requested key removal, selected-key discovery gap, spatial tangent gap, or unsupported exact source semantics.
- Post-run evidence shows no expression, timing, effect, source, render queue, layer name, selection state, project item, key removal, or unselected property mutation.

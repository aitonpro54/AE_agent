# Multiply Selected Keyframes Typed Plan

## Goal

Multiply explicit reviewed selected-keyframe values on currently selected AE properties through existing typed keyframe tools, without copying source JSX or changing selection state.

## Applies When

- Пользователь просит multiply selected keyframes, scale selected keyframe values, multiply keyframe values by a reviewed factor, or apply a numeric multiplier to currently selected property keyframes.
- Current `get_selected_properties` evidence includes concrete `layerIndex`, exact `propertyPath`, value shape, expression state, and keyframe/animated state for each target.
- The plan has explicit reviewed `selectedKeyframes` for each accepted target, including keyframe indices, times, values, and a concrete numeric `keyframeValueMultiplier`.
- The supported behavior is `multiplyValuesAtSameTimes`: keep selected keyframe times fixed and multiply each numeric scalar value, or each component of a numeric-array value, by `keyframeValueMultiplier`.
- If the user needs selected-key discovery without explicit reviewed keyframes, additive offsets, per-axis custom math, color/text/path mutation, exact interpolation/ease preservation, expression-derived sampling, destructive key removal, broad property scans, or source-exact selection side effects, fail closed and require a separate typed-tool contract.

## Plan Pattern

1. Run `get_active_comp` to bind the active composition.
2. Run `get_selected_properties` with `includeValues:true` and `includeExpressions:true`.
3. Bind concrete selected property targets only from that evidence: comp identity, `layerIndex`, layer name when available, exact `propertyPath`, current value shape, expression state, and keyframe/animated state when available.
4. Require explicit reviewed `selectedKeyframes` and numeric `keyframeValueMultiplier` for every accepted target. Do not infer selected keyframes from prior chat context, property selection alone, or raw AE selection side effects.
5. Fail closed when selected-property evidence is empty, lacks layer/property path targets, lacks exact selected keyframe times and numeric values, has expression text or enabled expressions, has unsupported value shapes, requires removing keys, or requires source-exact selected-key discovery.
6. Compute and disclose `multipliedKeyframes` before confirmation. Preserve each selected keyframe time and multiply only the explicit numeric scalar or numeric-array value components by `keyframeValueMultiplier`.
7. Run one `set_property_keyframes` step per accepted property target with the inspected comp target, evidence-backed `layerIndex`, exact `propertyPath`, computed `multipliedKeyframes`, and `clearExisting:false`.
8. Use `apply_keyframe_ease` only when the plan has explicit reviewed `keyIndices` plus requested ease/interpolation settings after keyframe values are set.
9. Run `get_layer_details` for every affected layer with enough property detail to read back the keyframed property.
10. Report skipped selected properties with the typed-tool gap reason instead of silently changing them.

## Safety Gates

- Mutating selected-property keyframe workflow.
- Requires validated Agent plan, explicit user confirmation, `allowMutations:true`, idempotency, checkpoint/edit-session protection, and post-mutation read-back.
- Do not infer selected properties or selected keyframes from prior chat context; use only current typed evidence plus explicit reviewed `selectedKeyframes`.
- Do not use default selected-key behavior in `apply_keyframe_ease`; pass explicit reviewed `keyIndices`.
- Do not clear or remove existing keys in this recipe; use `clearExisting:false`.
- Do not change expressions, non-keyframed static values, keyframe times, nonnumeric values, layer transforms outside the explicit property keyframes, layer names, effects, sources, masks, render queue items, project items, selection state, or unselected properties.

## Verification

- Pre-run `get_selected_properties` identifies every concrete selected property target, its owning layer, exact property path, current value shape, expression state, and keyframe/animated state when available.
- The dry-run plan shows previous `selectedKeyframes`, `keyframeValueMultiplier`, and computed `multipliedKeyframes` for every accepted target.
- Each `set_property_keyframes` result reports the expected property path, `clearExisting:false`, and the expected number of `multipliedKeyframes`.
- Any `apply_keyframe_ease` step uses explicit reviewed `keyIndices` and reports those key indices after easing.
- Post-run `get_layer_details` shows the affected property has the expected keyframe count and the selected times now carry the computed multiplied values.
- Skipped targets are reported with explicit reasons such as missing selected keyframe evidence, missing multiplier, expression-driven property, unsupported nonnumeric value shape, missing read-back, requested key removal, selected-key discovery gap, spatial tangent gap, or unsupported exact source semantics.
- Post-run evidence shows no expression, timing, effect, source, render queue, layer name, selection state, project item, key removal, key time, unselected keyframe, or unselected property mutation.

# Round Selected Keyframe Values Typed Plan

## Goal

Round explicit reviewed selected-keyframe values on currently selected AE properties through existing typed keyframe tools, without copying source JSX or relying on AE selection side effects.

## Applies When

- Пользователь просит round selected keyframe values, round selected keyframes, snap selected keyframe values to integers, or clean numeric selected-keyframe values on currently selected properties.
- Current `get_selected_properties` evidence includes concrete `layerIndex`, exact `propertyPath`, value shape, expression state, and keyframe/animated state for each target.
- The plan has explicit reviewed `selectedKeyframes` for every accepted target, including keyframe indices, times, numeric scalar or numeric-array values, and the reviewed `roundingMode`.
- The supported safe mode is `roundValuesAtSameTimes`: keep selected keyframe times fixed and round each numeric scalar value, or each component of a numeric-array value, with the reviewed nearest-integer rounding mode.
- If the user needs selected-key discovery without explicit reviewed keyframes, decimal precision/increment rounding, color/text/path mutation, expression-derived sampling, exact interpolation/ease preservation, spatial tangent preservation, destructive key removal, broad property scans, source-exact UI behavior, or raw JSX semantics, fail closed and require a separate typed-tool contract.

## Plan Pattern

1. Run `get_active_comp` to bind the active composition.
2. Run `get_selected_properties` with `includeValues:true` and `includeExpressions:true`.
3. Bind concrete selected property targets only from that evidence: comp identity, `layerIndex`, layer name when available, exact `propertyPath`, current value shape, expression state, and keyframe/animated state when available.
4. Require explicit reviewed `selectedKeyframes` and `roundingMode:"nearestInteger"` for every accepted target. Do not infer selected keyframes from prior chat context, property selection alone, or raw AE selection side effects.
5. Fail closed when selected-property evidence is empty, lacks layer/property path targets, lacks exact selected keyframe times and numeric values, has expression text or enabled expressions, has unsupported value shapes, requires selected-key discovery, or requests non-integer precision/increment semantics.
6. Compute and disclose `roundedKeyframes` before confirmation. Preserve each selected keyframe time and round only the explicit numeric scalar or numeric-array value components.
7. Run one `set_property_keyframes` step per accepted property target with the inspected comp target, evidence-backed `layerIndex`, exact `propertyPath`, computed `roundedKeyframes`, and `clearExisting:false`.
8. Use `apply_keyframe_ease` only when the plan has explicit reviewed `keyIndices` plus requested ease/interpolation settings after keyframe values are set.
9. Run `get_layer_details` for every affected layer with enough property detail to read back the keyframed property.
10. Report skipped selected properties with the typed-tool gap reason instead of silently changing them.

## Safety Gates

- Mutating selected-property keyframe value workflow.
- Requires validated Agent plan, explicit user confirmation, `allowMutations:true`, idempotency, checkpoint/edit-session protection, and post-mutation read-back.
- Do not infer selected properties or selected keyframes from prior chat context; use only current typed evidence plus explicit reviewed `selectedKeyframes`.
- Do not use default selected-key behavior in `apply_keyframe_ease`; pass explicit reviewed `keyIndices`.
- Do not clear, move, or remove existing keys in this recipe; use `clearExisting:false`.
- Do not change expressions, non-keyframed static values, keyframe times, interpolation/ease unless explicitly reviewed, unsupported value shapes, layer transforms outside the explicit property keyframes, layer names, effects, sources, masks, render queue items, project items, selection state, or unselected properties.

## Verification

- Pre-run `get_selected_properties` identifies every concrete selected property target, its owning layer, exact property path, current value shape, expression state, and keyframe/animated state when available.
- The dry-run plan shows previous `selectedKeyframes`, `roundingMode:"nearestInteger"`, and computed `roundedKeyframes` for every accepted target.
- Each `set_property_keyframes` result reports the expected property path, `clearExisting:false`, and the expected number of `roundedKeyframes`.
- Any `apply_keyframe_ease` step uses explicit reviewed `keyIndices` and reports those key indices after easing.
- Post-run `get_layer_details` shows the affected property has the expected keyframe count and the selected times now carry the computed rounded values.
- Skipped targets are reported with explicit reasons such as missing selected keyframe evidence, missing roundingMode, expression-driven property, unsupported nonnumeric value shape, missing read-back, requested key removal, selected-key discovery gap, decimal precision/increment gap, interpolation/ease preservation gap, spatial tangent gap, or unsupported exact source semantics.
- Post-run evidence shows no expression, timing, effect, source, render queue, layer name, selection state, project item, key removal, key time, unselected keyframe, or unselected property mutation.

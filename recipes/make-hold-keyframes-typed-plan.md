# Make Hold Keyframes Typed Plan

## Goal

Convert explicit reviewed selected keyframes on currently selected AE properties to hold interpolation through existing typed keyframe tools, without copying source JSX or changing selection state.

## Applies When

- Пользователь просит make selected keyframes hold, convert selected keyframes to hold keyframes, set selected keyframe interpolation to hold, or freeze selected keyframe values on currently selected properties.
- Current `get_selected_properties` evidence includes concrete `layerIndex`, exact `propertyPath`, value shape, expression state, and keyframe/animated state for each target.
- The plan has explicit reviewed `selectedKeyframes` for each accepted target, including keyframe indices, times, and enough current value evidence to confirm the keyframes already exist.
- The supported behavior is `holdInterpolation`: keep keyframe times and values unchanged while applying `interpolation:"hold"` through `apply_keyframe_ease` to explicit reviewed `keyIndices`.
- If the user needs selected-key discovery without explicit reviewed keyframes, spatial tangent editing, exact source selection side effects, value generation, destructive key removal, broad property scans, or interpolation preservation beyond hold conversion, fail closed and require a separate typed-tool contract.

## Plan Pattern

1. Run `get_active_comp` to bind the active composition.
2. Run `get_selected_properties` with `includeValues:true` and `includeExpressions:true`.
3. Bind concrete selected property targets only from that evidence: comp identity, `layerIndex`, layer name when available, exact `propertyPath`, current value shape, expression state, and keyframe/animated state when available.
4. Require explicit reviewed `selectedKeyframes` for every accepted target. Do not infer selected keyframes from prior chat context, property selection alone, or raw AE selection side effects.
5. Fail closed when selected-property evidence is empty, lacks layer/property path targets, lacks exact selected keyframe indices and times, has expression text or enabled expressions, is not keyframed/animated, requires creating/removing keys, or requires source-exact selected-key discovery.
6. Compute and disclose `holdKeyframes` before confirmation. The list must preserve the same keyframe indices, times, and values while setting the reviewed `interpolationMode` to `holdInterpolation`.
7. Run one `apply_keyframe_ease` step per accepted selected property target with the inspected comp target, evidence-backed `layerIndex`, exact `propertyPath`, explicit reviewed `keyIndices`, and `interpolation:"hold"`.
8. Do not call `set_property_keyframes` unless a separate reviewed plan explicitly needs keyframe value repair; this recipe is interpolation-only.
9. Run `get_layer_details` for every affected layer with enough property detail to read back the keyframed property and hold interpolation evidence when available.
10. Report skipped selected properties with the typed-tool gap reason instead of silently changing them.

## Safety Gates

- Mutating selected-property keyframe interpolation workflow.
- Requires validated Agent plan, explicit user confirmation, `allowMutations:true`, idempotency, checkpoint/edit-session protection, and post-mutation read-back.
- Do not infer selected properties or selected keyframes from prior chat context; use only current typed evidence plus explicit reviewed `selectedKeyframes`.
- Do not use default selected-key behavior in `apply_keyframe_ease`; pass explicit reviewed `keyIndices`.
- Do not create, clear, move, remove, or rewrite keyframes in this recipe; keep key times and values unchanged.
- Do not change expressions, non-keyframed static values, layer transforms outside the explicit property keyframes, layer names, effects, sources, masks, render queue items, project items, selection state, or unselected properties.

## Verification

- Pre-run `get_selected_properties` identifies every concrete selected property target, its owning layer, exact property path, current value shape, expression state, and keyframe/animated state when available.
- The dry-run plan shows previous `selectedKeyframes`, `interpolationMode:"holdInterpolation"`, and computed `holdKeyframes` for every accepted target.
- Each `apply_keyframe_ease` result reports the expected property path, `interpolation:"hold"`, and only the explicit reviewed `keyIndices`.
- Post-run `get_layer_details` shows the affected property still has the expected keyframe count and selected keyframe times/values, with hold interpolation evidence when the bridge read-back exposes it.
- Skipped targets are reported with explicit reasons such as missing selected keyframe evidence, expression-driven property, unanimated property, unsupported value shape, missing read-back, requested key creation/removal, selected-key discovery gap, spatial tangent gap, or unsupported exact source semantics.
- Post-run evidence shows no expression, timing, effect, source, render queue, layer name, selection state, project item, key creation/removal, key value, unselected keyframe, or unselected property mutation.

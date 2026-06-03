# Random Interpolation Typed Plan

## Goal

Apply a reviewed deterministic distribution of supported interpolation modes to explicit selected keyframes on current selected properties, without copying source JSX or relying on hidden AE selection side effects.

## Applies When

- The user asks to randomize keyframe interpolation, apply random hold/linear/ease choices, or vary interpolation across selected keyframes.
- Current `get_selected_properties` evidence identifies concrete selected property targets with `layerIndex`, exact `propertyPath`, current value shape, expression state, and keyframe/animated state when available.
- The plan has explicit reviewed `selectedKeyframes` for every accepted property target, including keyframe indices, times, and enough current value evidence to confirm those keyframes already exist.
- The supported behavior is deterministic randomization: compute and disclose a `randomInterpolationPolicy` and concrete `interpolationAssignments` before confirmation, then apply only bridge-supported interpolation modes to explicit reviewed `keyIndices`.
- If the request requires native source-exact random behavior, selected-key discovery without explicit reviewed keyframes, arbitrary Bezier/ease parameters, spatial tangent editing, value generation, keyframe creation/removal, broad property scans, raw ExtendScript, or selection side effects, fail closed and require a separate typed-tool contract.

## Plan Pattern

1. Run `get_active_comp` to bind the active composition identity.
2. Run `get_selected_properties` with `includeValues:true` and `includeExpressions:true`.
3. Bind concrete selected property targets only from that evidence: comp identity, `layerIndex`, layer name when available, exact `propertyPath`, current value shape, expression state, and keyframe/animated state when available.
4. Require explicit reviewed `selectedKeyframes` for every accepted target. Do not infer selected keyframes from prior chat context, property selection alone, or raw AE selection side effects.
5. Require a reviewed `randomInterpolationPolicy` before mutation, including candidate interpolation modes, stable seed or deterministic assignment rule, target keyframe count, and unsupported mode handling.
6. Fail closed when selected-property evidence is empty, lacks layer/property path targets, lacks exact selected keyframe indices and times, has expression text or enabled expressions, is not keyframed/animated, needs unsupported interpolation modes, or requires source-exact selected-key discovery.
7. Compute and disclose `interpolationAssignments` before confirmation. Each assignment must preserve the keyframe index, time, and value while naming the exact supported interpolation mode to apply.
8. Group assignments by property and interpolation mode, then run `apply_keyframe_ease` with explicit reviewed `keyIndices` for each group.
9. Do not call `set_property_keyframes` unless a separate reviewed plan explicitly needs keyframe value repair; this recipe is interpolation-only.
10. Run `get_layer_details` for every affected layer with enough property detail to read back the keyframed property and interpolation evidence when available.
11. Report skipped selected properties or keyframes with typed-tool gap reasons instead of silently changing them.

## Safety Gates

- Mutating selected-property keyframe interpolation workflow.
- Requires validated Agent plan, explicit user confirmation, `allowMutations:true`, idempotency, checkpoint/edit-session protection, and post-mutation read-back.
- Do not infer selected properties or selected keyframes from prior chat context; use only current typed evidence plus explicit reviewed `selectedKeyframes`.
- Do not use default selected-key behavior in `apply_keyframe_ease`; pass explicit reviewed `keyIndices`.
- Do not perform mutation-time randomness. The random policy and every resulting assignment must be visible before confirmation.
- Do not create, clear, move, remove, or rewrite keyframes in this recipe; keep key times and values unchanged.
- Do not change expressions, non-keyframed static values, layer transforms outside the explicit property keyframes, layer names, effects, sources, masks, render queue items, project items, selection state, or unselected properties.

## Verification

- Pre-run `get_selected_properties` identifies every concrete selected property target, its owning layer, exact property path, current value shape, expression state, and keyframe/animated state when available.
- The dry-run plan shows previous `selectedKeyframes`, reviewed `randomInterpolationPolicy`, and concrete `interpolationAssignments` for every accepted target.
- Each `apply_keyframe_ease` result reports the expected property path, interpolation mode, and only the explicit reviewed `keyIndices`.
- Post-run `get_layer_details` shows the selected keyframe times and values are preserved on the expected layer/property paths, with interpolation evidence when exposed by read-back.
- Skipped targets are reported with explicit reasons such as missing selected keyframe evidence, expression-driven property, unanimated property, unsupported value shape, unsupported interpolation mode, selected-key discovery gap, mutation-time randomness request, missing read-back, or unsupported exact source semantics.
- Post-run evidence shows no expression, timing, effect, source, render queue, layer name, selection state, project item, key creation/removal, key value, unselected keyframe, or unselected property mutation.

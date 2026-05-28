# Round Selected Property Values Typed Plan

## Goal

Round current numeric values on explicitly selected AE properties through existing typed tools, without copying source JSX or changing selection state.

## Applies When

- Пользователь просит round, округлить, snap to integer, or clean up numeric values on currently selected properties.
- Current `get_selected_properties` evidence includes concrete `layerIndex`, exact `propertyPath`, `value`, and expression/keyframe state for each target.
- The selected property value is a static numeric scalar or numeric array where component-wise rounding to the nearest integer is the requested behavior.
- If the user needs color rounding, TextDocument changes, shape/path data changes, expression mutation, keyframe rounding, separated-dimension rewiring, or source-exact selection side effects, fail closed and require a separate typed-tool contract.

## Plan Pattern

1. Run `get_active_comp` to bind the active composition.
2. Run `get_selected_properties` with `includeValues:true` and `includeExpressions:true`.
3. Bind concrete selected property targets only from that evidence: comp identity, `layerIndex`, layer name when available, exact `propertyPath`, current `value`, expression state, and keyframe/animated state when available.
4. Fail closed when selected-property evidence is empty, lacks layer/property path targets, has expression text or enabled expressions, appears animated/keyframed, is nonnumeric, is color-like, is text/document/path data, or cannot be rounded deterministically.
5. Compute `roundedValue` for every accepted target with nearest-integer component-wise rounding. Preserve scalar vs array shape and disclose previous value plus rounded value before confirmation.
6. Run one `set_property_value` step per concrete selected property target with the inspected comp target, the evidence-backed `layerIndex`, exact `propertyPath`, computed `roundedValue`, and `setAtTime:false`.
7. Run `get_layer_details` for every affected layer with enough property detail to read back the changed property value.
8. Report skipped selected properties with the typed-tool gap reason instead of silently changing them.

## Safety Gates

- Mutating selected-property workflow.
- Requires validated Agent plan, explicit user confirmation, `allowMutations:true`, idempotency, checkpoint/edit-session protection, and post-mutation read-back.
- Do not infer selected properties from prior chat context; use only current `get_selected_properties` evidence.
- Do not round expression-driven, animated/keyframed, text, path, color, or unsupported complex values in this recipe.
- Do not add keyframes; use `setAtTime:false`.
- Do not change layer transforms other than the explicitly selected property value, layer names, effects, sources, masks, render queue items, project items, selection state, or unselected properties.

## Verification

- Pre-run `get_selected_properties` identifies every concrete selected numeric property target, its owning layer, exact property path, current value, expression state, and keyframe/animated state when available.
- The dry-run plan shows previous value and computed `roundedValue` for each accepted target.
- Each `set_property_value` result reports the expected property path, `setAtTime:false`, and the exact rounded value shape.
- Post-run `get_layer_details` shows each affected property value equals the computed `roundedValue`.
- Skipped targets are reported with explicit reasons such as expression-driven, animated/keyframed, nonnumeric, color-like, path/text data, missing read-back, or unsupported exact source semantics.
- Post-run evidence shows no keyframe, expression, timing, effect, source, render queue, layer name, selection state, project item, or unselected property mutation.

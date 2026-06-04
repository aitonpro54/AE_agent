# Set New Color Typed Plan

## Goal

Set explicitly selected AE color property values to a reviewed `newColor` through existing typed tools, without copying source JSX or changing selection state.

## Applies When

- Пользователь просит set new color, recolor, change selected color properties, or apply an explicit color to currently selected properties.
- Current `get_selected_properties` evidence includes concrete `layerIndex`, exact `propertyPath`, `value`, and expression/keyframe state for each target.
- The selected property value is a static color-like numeric array with three or four finite components, and the requested `newColor` can be normalized to the same AE-compatible value shape.
- If the user needs color picker UI behavior, broad fill/stroke discovery, layer label color changes, effect creation, expression mutation, keyframe color changes, TextDocument/path data changes, separated-dimension rewiring, or source-exact selection side effects, fail closed and require a separate typed-tool contract.

## Plan Pattern

1. Run `get_active_comp` to bind the active composition.
2. Run `get_selected_properties` with `includeValues:true` and `includeExpressions:true`.
3. Bind concrete selected property targets only from that evidence: comp identity, `layerIndex`, layer name when available, exact `propertyPath`, current `value`, expression state, and keyframe/animated state when available.
4. Normalize the explicit requested `newColor` to an AE-compatible RGB or RGBA numeric array. Preserve the current value shape unless the user explicitly confirms an alpha change.
5. Fail closed when selected-property evidence is empty, lacks layer/property path targets, has expression text or enabled expressions, appears animated/keyframed, is not color-like, has incompatible component count, is text/document/path data, or lacks an explicit reviewed `newColor`.
6. Show the previous color value and normalized `newColor` for every accepted target before confirmation.
7. Run one `set_property_value` step per concrete selected property target with the inspected comp target, the evidence-backed `layerIndex`, exact `propertyPath`, normalized `newColor`, and `setAtTime:false`.
8. Run `get_layer_details` for every affected layer with enough property detail to read back the changed color property value.
9. Report skipped selected properties with the typed-tool gap reason instead of silently changing them.

## Safety Gates

- Mutating selected-property workflow.
- Requires validated Agent plan, explicit user confirmation, `allowMutations:true`, idempotency, checkpoint/edit-session protection, and post-mutation read-back.
- Do not infer selected properties from prior chat context; use only current `get_selected_properties` evidence.
- Do not set new colors on expression-driven, animated/keyframed, non-color, text, path, or unsupported complex values in this recipe.
- Do not add keyframes; use `setAtTime:false`.
- Do not create Fill effects, discover unselected fill/stroke properties, change layer label colors, change layer names, sources, timing, effects, masks, render queue items, project items, selection state, or unselected properties.

## Verification

- Pre-run `get_selected_properties` identifies every concrete selected color property target, its owning layer, exact property path, current value, expression state, and keyframe/animated state when available.
- The dry-run plan shows previous color value and normalized `newColor` for each accepted target.
- Each `set_property_value` result reports the expected property path, `setAtTime:false`, and exact `newColor` array shape.
- Post-run `get_layer_details` shows each affected property value equals the normalized `newColor` on the expected layer/property path.
- Skipped targets are reported with explicit reasons such as expression-driven, animated/keyframed, non-color, incompatible color shape, path/text data, missing read-back, or unsupported exact source semantics.
- Post-run evidence shows no keyframe, expression, timing, effect, source, render queue, layer name, label color, selection state, project item, or unselected property mutation.

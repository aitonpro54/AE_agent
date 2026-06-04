# Swap Selected Property Dimensions Typed Plan

## Goal

Swap reviewed dimensional components on explicitly selected AE property values through existing typed tools, without copying source JSX or changing selection state.

## Applies When

- Пользователь просит swap selected property dimensions, swap X/Y, flip horizontal/vertical components, or exchange dimensional components on currently selected properties.
- Current `get_selected_properties` evidence includes concrete `layerIndex`, exact `propertyPath`, `value`, and expression/keyframe state for each target.
- The selected property value is a static numeric array with at least two finite dimensional components, and the requested `dimensionSwap` is explicit or safely defaults to swapping component `0` and component `1`.
- If the user needs value swapping across different properties, color channel swapping, TextDocument changes, shape/path data changes, expression mutation, keyframe mutation, separated-dimension rewiring, arbitrary axis permutation, or source-exact selection side effects, fail closed and require a separate typed-tool contract.

## Plan Pattern

1. Run `get_active_comp` to bind the active composition.
2. Run `get_selected_properties` with `includeValues:true` and `includeExpressions:true`.
3. Bind concrete selected property targets only from that evidence: comp identity, `layerIndex`, layer name when available, exact `propertyPath`, current `value`, expression state, and keyframe/animated state when available.
4. Resolve the reviewed `dimensionSwap`. Default only to X/Y component swap `[0, 1]` when the user request is unambiguous and every accepted target has at least two numeric components.
5. Fail closed when selected-property evidence is empty, lacks layer/property path targets, has expression text or enabled expressions, appears animated/keyframed, is scalar, is color-like, is text/document/path data, has too few numeric components, or requires separated-dimension rewiring.
6. Compute `swappedValue` for every accepted target by exchanging only the reviewed component indexes and preserving the original value shape plus all non-swapped components.
7. Show the previous value, `dimensionSwap`, and `swappedValue` for every accepted target before confirmation.
8. Run one `set_property_value` step per concrete selected property target with the inspected comp target, the evidence-backed `layerIndex`, exact `propertyPath`, computed `swappedValue`, and `setAtTime:false`.
9. Run `get_layer_details` for every affected layer with enough property detail to read back the changed property value.
10. Report skipped selected properties with the typed-tool gap reason instead of silently changing them.

## Safety Gates

- Mutating selected-property workflow.
- Requires validated Agent plan, explicit user confirmation, `allowMutations:true`, idempotency, checkpoint/edit-session protection, and post-mutation read-back.
- Do not infer selected properties from prior chat context; use only current `get_selected_properties` evidence.
- Do not swap expression-driven, animated/keyframed, scalar, color-like, text, path, separated-dimension, or unsupported complex values in this recipe.
- Do not swap values across different properties; mutate each accepted selected property independently.
- Do not add keyframes; use `setAtTime:false`.
- Do not change layer transforms other than the explicitly selected property value, layer names, effects, sources, masks, render queue items, project items, selection state, or unselected properties.

## Verification

- Pre-run `get_selected_properties` identifies every concrete selected dimensional property target, its owning layer, exact property path, current value, expression state, and keyframe/animated state when available.
- The dry-run plan shows previous value, reviewed `dimensionSwap`, and computed `swappedValue` for each accepted target.
- Each `set_property_value` result reports the expected property path, `setAtTime:false`, and exact `swappedValue` array shape.
- Post-run `get_layer_details` shows each affected property value equals the computed `swappedValue` on the expected layer/property path.
- Skipped targets are reported with explicit reasons such as expression-driven, animated/keyframed, scalar, color-like, path/text data, separated-dimension rewiring, unsupported axis permutation, missing read-back, or unsupported exact source semantics.
- Post-run evidence shows no keyframe, expression, timing, effect, source, render queue, layer name, selection state, project item, cross-property value swap, or unselected property mutation.

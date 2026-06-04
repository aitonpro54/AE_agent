# Separate Size Dimensions Typed Plan

## Goal

Separate an explicit generated shape rectangle or ellipse Size property into reviewed X/Y slider controls through `separate_shape_size_dimensions`, without copying source JSX or traversing arbitrary properties.

## Applies When

- Пользователь просит separate size dimensions, split X/Y size controls, or make shape size dimensions independently adjustable on a rectangle or ellipse Size property.
- Current typed evidence identifies one concrete shape layer and one exact rectangle or ellipse Size `propertyPath`.
- The target property is `ADBE Vector Rect Size` or `ADBE Vector Ellipse Size`, has a two-dimensional static size value, and can safely receive a generated expression.
- The requested slider names are reviewed or safely default to `X Size` and `Y Size`.
- If the user needs arbitrary property traversal, non-shape Size properties, selected-property guessing, existing expression preservation, expression merging, slider reuse, keyframed size preservation, text/path/mask size edits, selection side effects, or exact source JSX semantics, fail closed and require a separate typed-tool contract.

## Plan Pattern

1. Run `get_active_comp` to bind the active composition.
2. Run `get_selected_properties` with `includeValues:true` and `includeExpressions:true` when the target comes from the current UI selection, or otherwise require equivalent explicit `layerIndex` and exact `propertyPath` evidence from current typed context.
3. Bind exactly one accepted target: comp identity, shape `layerIndex`, layer name when available, exact rectangle or ellipse Size `propertyPath`, current two-component size value, expression state, and keyframe/animated state when available.
4. Fail closed when selected-property evidence is empty or ambiguous, the target is not a rectangle or ellipse Size property, the value is not a two-dimensional numeric size array, the layer is locked, the property already has expression text or keyframes, or the request requires preserving existing animation/expression semantics.
5. Resolve `xSliderName` and `ySliderName`. Default only to `X Size` and `Y Size` when those names are acceptable for new generated slider controls; otherwise require reviewed names.
6. Show the previous size value, exact `propertyPath`, `xSliderName`, `ySliderName`, and the expression-generation behavior before confirmation.
7. Run one `separate_shape_size_dimensions` step with the inspected comp target, evidence-backed `layerIndex`, exact `propertyPath`, and reviewed slider names.
8. Run `get_layer_details` for the affected layer with enough property and effect detail to read back the Size expression and generated slider controls.
9. Run `get_effect_details` when needed to verify the X/Y slider effects and their values.
10. Report skipped or unsupported targets with typed-tool gap reasons instead of silently using raw script execution.

## Safety Gates

- Mutating shape-property expression/effect workflow.
- Requires validated Agent plan, explicit user confirmation, `allowMutations:true`, idempotency, checkpoint/edit-session protection, and post-mutation read-back.
- Do not infer targets from prior chat context; use only current selected-property or explicit typed evidence.
- Do not use this recipe for arbitrary selected properties, layer transform Scale, masks, paths, TextDocument values, effects that merely expose size-like names, or non-rectangle/non-ellipse shape properties.
- Do not overwrite existing Size expressions or keyframed Size animation in this recipe.
- Do not reuse or relink pre-existing slider controls unless a separate typed-tool contract proves that behavior.
- Do not change shape paths, layer transforms, layer names, sources, timing, masks, render queue items, project items, selection state, or unrelated effects/properties.

## Verification

- Pre-run evidence identifies the exact active comp, shape layer, rectangle or ellipse Size `propertyPath`, current two-component size value, expression state, and keyframe/animated state when available.
- The dry-run plan shows the previous size value, reviewed slider names, and the fact that `separate_shape_size_dimensions` will add slider controls and drive Size with an expression.
- The `separate_shape_size_dimensions` result reports the expected property path, generated expression, and at least two slider entries with the reviewed X/Y slider names.
- Post-run `get_layer_details` shows the Size property expression references both slider names and remains on the expected layer/property path.
- `get_effect_details` or layer effect read-back shows the generated slider controls exist and their initial values match the original X and Y size components.
- Skipped targets are reported with explicit reasons such as ambiguous selection, unsupported property matchName, existing expression, keyframed size, non-two-dimensional value, locked layer, missing read-back, or unsupported exact source semantics.
- Post-run evidence shows no unrelated keyframe, transform, shape path, effect, source, render queue, layer name, selection state, project item, or unselected property mutation.

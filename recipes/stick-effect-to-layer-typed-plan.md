# Stick Effect To Layer Typed Plan

## Goal

Применить reviewed expression `toComp(anchorPoint + value);` к явно
подтвержденным 2D spatial properties эффекта через existing typed bridge tools,
чтобы эффект-позиции оставались привязаны к слою.

## Applies When

- Пользователь просит stick/pin выбранные effect position properties to the
  owning layer.
- Цель подтверждена текущим typed evidence: активная композиция, layerIndex,
  effect identity, exact propertyPath, `canSetExpression:true`, и
  `propertyValueType` для 2D spatial property.
- Safe adaptation мутирует только expression text/enabled state на explicit
  reviewed property targets. Она не сканирует все selectedProperties молча.
- Если требуется source-exact traversal через `comp.selectedProperties`,
  автоматическое определение всех эффектов, overwrite existing expressions
  without review, non-2D-spatial targets, controller setup, keyframe edits,
  selection side effects или raw ExtendScript, fail closed.

## Plan Pattern

1. Run `get_active_comp` to confirm the active composition.
2. Run `get_selected_properties` with `includeValues:true` and
   `includeExpressions:true`, or run `get_effect_details` for an explicit
   generated/reviewed effect target when selection setup is not part of the
   typed lane.
3. Bind each target only from current evidence: comp identity, layerIndex,
   layer/effect name, exact propertyPath, `canSetExpression:true`,
   `propertyValueType`, current expression text, and current enabled state.
4. Fail closed unless every target is a 2D spatial effect/property target and
   the final expression is exactly `toComp(anchorPoint + value);`.
5. Report previous expression state and exact target propertyPath before
   confirmation. Existing non-empty expressions require explicit replacement
   acknowledgement in the plan.
6. Run one `set_expression` step per explicit target with `enabled:true`,
   `verifyAfter:true`, and a stable idempotency key.
7. Run `get_layer_details` and, for effect targets, `get_effect_details` after
   mutation to read back the exact expression text, enabled state, and
   `expressionError`.

## Safety Gates

- Mutating expression workflow.
- Requires validated Agent plan, dry-run, explicit confirmation,
  `allowMutations:true`, idempotency, checkpoint/edit-session protection, and
  post-mutation read-back.
- Do not infer effect properties from names alone, prior chat context,
  screenshots, broad effect scans, or raw JSX source behavior.
- Do not apply this expression to transform Scale, Opacity, Rotation, color
  controls, text animators, non-spatial properties, masks, shape paths, or
  unselected/unreviewed properties.
- Do not modify property values, keyframes, effect order, layer transforms,
  layer names, layer sources, layer timing, masks, render queue items, project
  items, or selection state.

## Verification

- Pre-run typed evidence identifies every concrete target with layerIndex,
  effect identity when relevant, exact propertyPath, `canSetExpression:true`,
  and 2D spatial property evidence.
- Every mutating step uses `set_expression` with the exact expression
  `toComp(anchorPoint + value);` on one explicit property target.
- `set_expression` result and post-run read-back show the exact expression,
  `expressionEnabled:true`, and no `expressionError`.
- Post-run evidence shows no keyframe, value, effect-order, layer transform,
  source, timing, mask, render queue, project item, selection, unreviewed
  property, or unrelated expression mutation.
- Unsupported source-exact selectedProperties traversal, automatic effect
  discovery, non-2D-spatial targets, existing-expression overwrite without
  review, controller setup, and raw ExtendScript are reported as typed-tool
  gaps.

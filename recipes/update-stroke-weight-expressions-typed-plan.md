# Update Stroke Weight Expressions Typed Plan

## Goal

Обновить existing stroke weight/stroke width expressions на явно выбранных shape stroke width properties через existing typed bridge tools, заменяя expression text только на explicit reviewed stroke-weight expression update.

## Applies When

- Пользователь просит update/replace/revise stroke weight expressions, stroke width expressions, or maintain-stroke expression text on currently selected shape stroke width properties.
- Активная композиция и выбранные properties должны быть прочитаны перед мутацией.
- Workflow targets only properties returned by current `get_selected_properties` evidence with concrete `layerIndex`, `propertyPath`, expression-capable status, stroke width/stroke weight identity evidence, current expression text, and current expression enabled state.
- `updatedStrokeWeightExpressionText` must be explicit, non-empty, and shown in the dry-run plan together with the previous expression before confirmation.
- The safe adaptation updates only expression text/enabled state on evidence-backed selected stroke width properties. It does not infer hidden targets, scan all shape layers, initialize missing expressions, or rewrite expression syntax without a reviewed final expression.
- If the user needs broad stroke discovery, expression creation from scratch, automatic syntax repair, nonuniform-scale compensation, nested shape transform traversal, controller rigs, selection side effects, or source-exact raw script behavior, fail closed or require a separate typed-tool contract.
- Задача не требует keyframe edits, effect edits, layer timing changes, layer transform mutation, source relinking, render queue changes, selection mutation, or raw script execution.

## Plan Pattern

1. Run `get_active_comp` to confirm the active comp and capture the target composition identity.
2. Run `get_selected_properties` with `includeValues:true` and `includeExpressions:true`.
3. Bind concrete selected property targets only from that evidence: comp identity, `layerIndex`, layer name when available, exact `propertyPath`, expression-capable status, stroke width/stroke weight identity, current expression text, and current `expressionEnabled` state.
4. Fail closed if no selected properties are returned, if any target lacks a concrete owning layer or property path, if a target is not expression-capable, if a target is not clearly a stroke width property, or if current expression text is unavailable.
5. Require one explicit `updatedStrokeWeightExpressionText` value per distinct final expression, or an explicit per-target mapping when different selected stroke width properties need different final expressions.
6. Report the previous expression and exact `updatedStrokeWeightExpressionText` for every target in the dry-run plan before confirmation.
7. Run one `set_expression` step per concrete selected stroke width property target with the inspected comp target, the evidence-backed `layerIndex`, the exact `propertyPath`, the explicit final expression, and `enabled:true` unless preserving a disabled state is explicitly requested and supported by the plan evidence.
8. Include `verifyAfter:true` and a stable `idempotencyKeyTemplate` on every mutating expression step.
9. Run `get_layer_details` for every affected layer with expression/property detail enabled, and report read-back evidence for each updated stroke weight expression.

## Safety Gates

- Mutating selected-property workflow.
- Requires validated Agent plan, dry-run, explicit confirmation, `allowMutations:true`, idempotency and post-mutation read-back.
- Use checkpoint or edit-session protection for confirmed live runs.
- Do not infer selected stroke width properties from prior chat context. Use current `get_selected_properties` evidence before every mutation.
- Do not apply this recipe to scale, position, opacity, path, color, effect, mask, text, transform group, or non-stroke-width properties.
- Do not silently update expression syntax. The dry-run plan must show the exact current expression and the exact `updatedStrokeWeightExpressionText`.
- Do not initialize empty expressions or treat this update workflow as expression creation unless a separate reviewed typed-tool contract supports that behavior.
- Do not promise broad source-exact behavior for all stroke weights in a layer, nested shape groups, nonuniform layer scale, collapsed/precomp transforms, camera perspective, or renderer-specific stroke behavior; those need a separate typed-tool contract or explicit user review.
- Do not use this recipe for broad stroke discovery, expression generation from scratch, expression clearing, expression deletion, syntax repair, expression controller rigs, keyframe generation, render queue changes, source relinking, layer cleanup, layer transform edits, or exact source JSX behavior.

## Verification

- The plan includes `get_selected_properties` evidence before any `set_expression` target is bound.
- Every mutating step uses `set_expression` with one concrete selected `layerIndex`, one exact stroke width `propertyPath`, a cited previous expression, the exact final `updatedStrokeWeightExpressionText`, and the intended enabled state.
- `set_expression` returns the exact final stroke weight expression text, expected `expressionEnabled` state, and no `expressionError`.
- Post-run `get_layer_details` read-back shows each affected stroke width property has the exact updated stroke weight expression on the expected layer/property path.
- The plan reports unsupported requests for broad stroke discovery, expression creation, syntax repair, expression controllers, keyframe creation, nonuniform-scale compensation, nested shape transform traversal, selection side effects, or exact source JSX behavior as typed-tool gaps.

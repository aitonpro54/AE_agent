# Update Expressions Typed Plan

## Goal

Обновить existing expressions на явно выбранных expression-capable properties через existing typed bridge tools, заменяя expression text только на explicit reviewed updated expression.

## Applies When

- Пользователь просит update/replace/revise existing expressions on currently selected properties.
- Активная композиция и выбранные properties должны быть прочитаны перед мутацией.
- Workflow targets only properties returned by current `get_selected_properties` evidence with concrete `layerIndex`, `propertyPath`, expression-capable status, current expression text, and current expression enabled state.
- `updatedExpressionText` must be explicit, non-empty, and shown in the dry-run plan together with the previous expression before confirmation.
- The safe adaptation updates only the expression text/enabled state on evidence-backed selected properties. It does not infer hidden targets, scan all properties, or rewrite expression syntax without a reviewed final expression.
- If the user needs expression creation from scratch, syntax repair, controller rigs, broad all-layer/property scans, selection side effects, or source-exact raw script behavior, fail closed or require a separate typed-tool contract.
- Задача не требует keyframe edits, effect edits, layer timing changes, source relinking, render queue changes, selection mutation, or raw script execution.

## Plan Pattern

1. Run `get_active_comp` to confirm the active comp and capture the target composition identity.
2. Run `get_selected_properties` with `includeValues:true` and `includeExpressions:true`.
3. Bind concrete selected property targets only from that evidence: comp identity, `layerIndex`, layer name when available, exact `propertyPath`, expression-capable status, current expression text, and current `expressionEnabled` state.
4. Fail closed if no selected properties are returned, if any target lacks a concrete owning layer or property path, if a target is not expression-capable, or if current expression text is unavailable.
5. Require one explicit `updatedExpressionText` value per distinct final expression, or an explicit per-target mapping when different selected properties need different final expressions.
6. Report the previous expression and exact `updatedExpressionText` for every target in the dry-run plan before confirmation.
7. Run one `set_expression` step per concrete selected property target with the inspected comp target, the evidence-backed `layerIndex`, the exact `propertyPath`, the explicit final expression, and `enabled:true` unless preserving a disabled state is explicitly requested and supported by the plan evidence.
8. Include `verifyAfter:true` and a stable `idempotencyKeyTemplate` on every mutating expression step.
9. Run `get_layer_details` for every affected layer with expression/property detail enabled, and report read-back evidence for each updated expression.

## Safety Gates

- Mutating selected-property workflow.
- Requires validated Agent plan, dry-run, explicit confirmation, `allowMutations:true`, idempotency and post-mutation read-back.
- Use checkpoint or edit-session protection for confirmed live runs.
- Do not infer selected properties from prior chat context. Use current `get_selected_properties` evidence before every mutation.
- Do not silently update expression syntax. The dry-run plan must show the exact current expression and the exact `updatedExpressionText`.
- Do not initialize empty expressions or treat this update workflow as expression creation unless a separate reviewed typed-tool contract supports that behavior.
- Do not use this recipe for expression generation from scratch, expression clearing, expression deletion, syntax repair, expression controller rigs, time-remap setup, keyframe generation, broad property scans, render queue changes, source relinking, layer cleanup, or exact source JSX behavior.

## Verification

- The plan includes `get_selected_properties` evidence before any `set_expression` target is bound.
- Every mutating step uses `set_expression` with one concrete selected `layerIndex`, one exact `propertyPath`, a cited previous expression, the exact final `updatedExpressionText`, and the intended enabled state.
- `set_expression` returns the exact final expression text, expected `expressionEnabled` state, and no `expressionError`.
- Post-run `get_layer_details` read-back shows each affected property has the exact updated expression on the expected layer/property path.
- The plan reports unsupported requests for expression creation, syntax repair, expression controllers, keyframe creation, broad selection inference, selection side effects, or exact source JSX behavior as typed-tool gaps.

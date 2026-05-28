# Fix Fresh Pickwhip Expression Typed Plan

## Goal

Исправить current fresh pickwhip expression на явно выбранных expression-capable properties через existing typed bridge tools, заменяя expression text только на explicit reviewed fixed expression.

## Applies When

- Пользователь просит fix/clean up/normalize a fresh pickwhip expression on the currently selected properties.
- Активная композиция и выбранные properties должны быть прочитаны перед мутацией.
- Workflow targets only properties returned by current `get_selected_properties` evidence with concrete `layerIndex`, `propertyPath`, expression-capable status, current expression text, and current expression enabled state.
- `fixedExpressionText` must be explicit, non-empty, and shown in the dry-run plan together with the previous expression before confirmation.
- A deterministic rewrite is acceptable only when the plan shows the exact previous expression, the exact final expression, and why the rewrite is bounded to the inspected selected property.
- If the user needs automatic pick-whip source target discovery, AST-level expression repair, controller rigs, broad all-layer/property scans, selection side effects, or source-exact raw JSX behavior, fail closed or require a separate typed-tool contract.
- Задача не требует keyframe edits, effect edits, layer timing changes, source relinking, render queue changes, selection mutation, or raw script execution.

## Plan Pattern

1. Run `get_active_comp` to confirm the active comp and capture the target composition identity.
2. Run `get_selected_properties` with `includeValues:true` and `includeExpressions:true`.
3. Bind concrete selected property targets only from that evidence: comp identity, `layerIndex`, layer name when available, exact `propertyPath`, expression-capable status, current expression text, and current `expressionEnabled` state.
4. Fail closed if no selected properties are returned, if any target lacks a concrete owning layer or property path, if a target is not expression-capable, if current expression text is unavailable, or if the target cannot be tied to a fresh pickwhip expression the user intends to fix.
5. Require one explicit `fixedExpressionText` value per distinct final expression, or compute a deterministic final expression from the cited current expression using a bounded rule described in the plan.
6. Report the previous expression and exact final expression for every target in the dry-run plan before confirmation.
7. Run one `set_expression` step per concrete selected property target with the inspected comp target, the evidence-backed `layerIndex`, the exact `propertyPath`, the explicit final expression, and `enabled:true` unless preserving a disabled state is explicitly requested and supported by the plan evidence.
8. Include `verifyAfter:true` and a stable `idempotencyKeyTemplate` on every mutating expression step.
9. Run `get_layer_details` for every affected layer with expression/property detail enabled, and report read-back evidence for each repaired expression.

## Safety Gates

- Mutating selected-property workflow.
- Requires validated Agent plan, dry-run, explicit confirmation, `allowMutations:true`, idempotency and post-mutation read-back.
- Use checkpoint or edit-session protection for confirmed live runs.
- Do not infer selected properties or pick-whip source targets from prior chat context. Use current `get_selected_properties` evidence before every mutation.
- Do not silently rewrite expression syntax. The dry-run plan must show the exact current expression and the exact `fixedExpressionText` or deterministic final expression.
- Do not claim source-exact pick-whip repair when current typed tools cannot prove the source property, destination property, expression AST, or selection side effects.
- Do not use this recipe for expression generation from scratch, expression clearing, expression deletion, syntax repair beyond a disclosed bounded replacement, controller rigs, time-remap setup, keyframe generation, broad property scans, render queue changes, source relinking, layer cleanup, or exact source JSX behavior.

## Verification

- The plan includes `get_selected_properties` evidence before any `set_expression` target is bound.
- Every mutating step uses `set_expression` with one concrete selected `layerIndex`, one exact `propertyPath`, a cited previous expression, the exact final `fixedExpressionText`, and the intended enabled state.
- `set_expression` returns the exact final expression text, expected `expressionEnabled` state, and no `expressionError`.
- Post-run `get_layer_details` read-back shows each affected property has the exact final expression on the expected layer/property path.
- The plan reports unsupported requests for automatic pick-whip source discovery, source-target inference, AST-level repair, expression controllers, keyframe creation, broad selection inference, selection side effects, or exact source JSX behavior as typed-tool gaps.

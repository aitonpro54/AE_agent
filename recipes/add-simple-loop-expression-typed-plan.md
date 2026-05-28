# Add Simple Loop Expression Typed Plan

## Goal

Добавить простое `loopOut()` expression к выбранным expression-capable properties через existing typed bridge tools.

## Applies When

- Пользователь просит add a simple loop expression, loop selected animated properties, or apply `loopOut()` to the currently selected properties.
- Активная композиция и выбранные properties должны быть прочитаны перед мутацией.
- Workflow targets only properties returned by current `get_selected_properties` evidence with concrete `layerIndex` and `propertyPath` values.
- The safe adaptation sets the exact expression text `loopOut()` unless the user explicitly asks for a different loop expression that is still a bounded expression string.
- If the user needs `loopIn`, `loopOut("pingpong")`, offset/continue loop types, loop arguments, keyframe generation, time remapping setup, expression controllers, broad all-layer/property scanning, or source-exact selection side effects, fail closed or require a separate typed-tool contract.
- Задача не требует keyframe edits, effect edits, layer timing changes, source relinking, render queue changes, selection mutation, or raw script execution.

## Plan Pattern

1. Run `get_active_comp` to confirm the active comp and capture the target composition identity.
2. Run `get_selected_properties` with `includeValues:true` and `includeExpressions:true`.
3. Bind concrete selected property targets only from that evidence: comp identity, `layerIndex`, layer name when available, and exact `propertyPath`.
4. Fail closed if no selected properties are returned, if any target lacks a concrete owning layer or property path, or if a target is not expression-capable.
5. Prefer the exact expression text `loopOut()` for simple loop requests. Do not invent loop type arguments, keyframe creation, expression controls, or property search scope that the user did not request.
6. Run one `set_expression` step per concrete selected property target with the inspected comp target, the evidence-backed `layerIndex`, the exact `propertyPath`, expression `loopOut()`, and `enabled:true`.
7. Include `verifyAfter:true` and a stable `idempotencyKeyTemplate` on every mutating expression step.
8. Run `get_layer_details` for every affected layer with expression/property detail enabled, and report read-back evidence for each property expression.

## Safety Gates

- Mutating selected-property workflow.
- Requires validated Agent plan, dry-run, explicit confirmation, `allowMutations:true`, idempotency and post-mutation read-back.
- Use checkpoint or edit-session protection for confirmed live runs.
- Do not infer selected properties from prior chat context. Use current `get_selected_properties` evidence before every mutation.
- Do not overwrite existing property expressions unless the plan explicitly reports the previous expression evidence and the user confirms replacement.
- Do not claim to create keyframes or make unanimated properties visibly loop; `loopOut()` only loops existing animated property values according to After Effects expression semantics.
- Do not use this recipe for broad property scans, expression controller rigs, time-remap setup, keyframe generation, expression clearing, render queue changes, source relinking, layer cleanup, or exact source JSX behavior.

## Verification

- The plan includes `get_selected_properties` evidence before any `set_expression` target is bound.
- Every mutating step uses `set_expression` with one concrete selected `layerIndex`, one exact `propertyPath`, expression `loopOut()`, and `enabled:true`.
- `set_expression` returns matching `expression:"loopOut()"`, `expressionEnabled:true`, and no `expressionError`.
- Post-run `get_layer_details` read-back shows each affected property has expression `loopOut()` enabled on the expected layer/property path.
- The plan reports unsupported requests for loop type variants, expression controllers, keyframe creation, broad selection inference, expression clearing, or exact source JSX behavior as typed-tool gaps.

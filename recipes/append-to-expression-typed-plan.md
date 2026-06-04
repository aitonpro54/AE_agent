# Append To Expression Typed Plan

## Goal

Добавить явный пользовательский expression snippet к существующим expressions выбранных properties через existing typed bridge tools.

## Applies When

- Пользователь просит append/add text to the existing expression on currently selected properties.
- Активная композиция и выбранные properties должны быть прочитаны перед мутацией.
- Workflow targets only properties returned by current `get_selected_properties` evidence with concrete `layerIndex`, `propertyPath`, and current expression values.
- `appendText` must be an explicit non-empty user-provided expression snippet, and the plan must show the exact final expression before confirmation.
- The safe adaptation appends to the current expression text with an explicit separator such as a newline. It does not infer hidden expression state or rewrite expression syntax.
- If the user needs syntax repair, expression generation from scratch, controller rigs, broad all-layer/property scans, keyframe edits, expression clearing, or source-exact prompt/selection behavior, fail closed or require a separate typed-tool contract.
- Задача не требует keyframe edits, effect edits, layer timing changes, source relinking, render queue changes, selection mutation, or raw script execution.

## Plan Pattern

1. Run `get_active_comp` to confirm the active comp and capture the target composition identity.
2. Run `get_selected_properties` with `includeValues:true` and `includeExpressions:true`.
3. Bind concrete selected property targets only from that evidence: comp identity, `layerIndex`, layer name when available, exact `propertyPath`, expression-capable status, and current expression text.
4. Fail closed if no selected properties are returned, if any target lacks a concrete owning layer or property path, if a target is not expression-capable, or if current expression text is unavailable.
5. Choose one explicit non-empty `appendText` and one explicit separator, then compute each final expression as the read current expression plus the separator plus `appendText`.
6. Report the previous expression and exact final expression for every target in the dry-run plan before confirmation.
7. Run one `set_expression` step per concrete selected property target with the inspected comp target, the evidence-backed `layerIndex`, the exact `propertyPath`, computed final expression, and `enabled:true`.
8. Include `verifyAfter:true` and a stable `idempotencyKeyTemplate` on every mutating expression step.
9. Run `get_layer_details` for every affected layer with expression/property detail enabled, and report read-back evidence for each property expression.

## Safety Gates

- Mutating selected-property workflow.
- Requires validated Agent plan, dry-run, explicit confirmation, `allowMutations:true`, idempotency and post-mutation read-back.
- Use checkpoint or edit-session protection for confirmed live runs.
- Do not infer selected properties from prior chat context. Use current `get_selected_properties` evidence before every mutation.
- Do not append to expressions without current expression evidence, and do not replace the whole expression except with the explicitly computed previous-expression-plus-append result.
- Do not silently initialize empty expressions unless the user explicitly changes the request from append to set/create expression.
- Do not use this recipe for syntax repair, expression controller rigs, time-remap setup, keyframe generation, expression clearing, broad property scans, render queue changes, source relinking, layer cleanup, or exact source JSX behavior.

## Verification

- The plan includes `get_selected_properties` evidence before any `set_expression` target is bound.
- Every mutating step uses `set_expression` with one concrete selected `layerIndex`, one exact `propertyPath`, a final expression derived from the cited current expression plus `appendText`, and `enabled:true`.
- `set_expression` returns the exact appended final expression, `expressionEnabled:true`, and no `expressionError`.
- Post-run `get_layer_details` read-back shows each affected property has the expected appended final expression enabled on the expected layer/property path.
- The plan reports unsupported requests for source-exact prompt behavior, syntax repair, expression controllers, keyframe creation, broad selection inference, expression clearing, or exact source JSX behavior as typed-tool gaps.

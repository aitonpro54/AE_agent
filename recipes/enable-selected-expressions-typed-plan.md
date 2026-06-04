# Enable Selected Expressions Typed Plan

## Goal

Включить existing expressions на явно выбранных expression-capable properties через existing typed bridge tools, сохранив expression text.

## Applies When

- Пользователь просит enable/turn on/re-enable selected expressions, enable expressions on selected properties, or restore disabled expressions without rewriting them.
- Активная композиция и выбранные properties должны быть прочитаны перед мутацией.
- Workflow targets only properties returned by current `get_selected_properties` evidence with concrete `layerIndex`, `propertyPath`, expression-capable status, current expression text, and current expression enabled state.
- The safe adaptation preserves the existing expression text and sets `enabled:true` through `set_expression`; it does not generate, clear, rewrite, repair, or normalize expression source.
- If the user needs expression creation, expression text replacement, syntax repair, controller rigs, broad all-layer/property scans, selection side effects, or source-exact raw JSX behavior, fail closed or require a separate typed-tool contract.
- Задача не требует keyframe edits, effect edits, layer timing changes, source relinking, render queue changes, selection mutation, or raw script execution.

## Plan Pattern

1. Run `get_active_comp` to confirm the active comp and capture the target composition identity.
2. Run `get_selected_properties` with `includeValues:true` and `includeExpressions:true`.
3. Bind concrete selected property targets only from that evidence: comp identity, `layerIndex`, layer name when available, exact `propertyPath`, expression-capable status, current expression text, and current `expressionEnabled` state.
4. Fail closed if no selected properties are returned, if any target lacks a concrete owning layer or property path, if a target is not expression-capable, or if current expression text is unavailable.
5. Treat properties with no existing expression text as out of scope for this recipe; report them as skipped instead of creating a new expression.
6. Report already-enabled expressions as no-op targets unless the user explicitly asks for a fresh read-back-only confirmation.
7. Run one `set_expression` step per concrete selected property target that has an existing disabled expression, using the inspected comp target, the evidence-backed `layerIndex`, the exact `propertyPath`, the same current expression text, and `enabled:true`.
8. Include `verifyAfter:true` and a stable `idempotencyKeyTemplate` on every mutating expression step.
9. Run `get_layer_details` for every affected layer with expression/property detail enabled, and report read-back evidence for each expression.

## Safety Gates

- Mutating selected-property workflow.
- Requires validated Agent plan, dry-run, explicit confirmation, `allowMutations:true`, idempotency and post-mutation read-back.
- Use checkpoint or edit-session protection for confirmed live runs.
- Do not infer selected properties from prior chat context. Use current `get_selected_properties` evidence before every mutation.
- Do not use this recipe to create or replace expression source. Enabling selected expressions must preserve the current expression text and set only the enabled state to true.
- Do not initialize empty expressions, rewrite syntax, normalize expression text, or silently replace expressions with generated code.
- Do not use this recipe for expression generation, expression clearing, expression deletion, syntax repair, expression controller rigs, time-remap setup, keyframe generation, broad property scans, render queue changes, source relinking, layer cleanup, or exact source JSX behavior.

## Verification

- The plan includes `get_selected_properties` evidence before any `set_expression` target is bound.
- Every mutating step uses `set_expression` with one concrete selected `layerIndex`, one exact `propertyPath`, the same current expression text from evidence, and `enabled:true`.
- `set_expression` returns the unchanged expression text, `expressionEnabled:true`, and no `expressionError`.
- Post-run `get_layer_details` read-back shows each affected property still has the same expression text but expression enabled state is true on the expected layer/property path.
- The plan reports unsupported requests for creating expressions, replacing expression text, syntax repair, expression controllers, keyframe creation, broad selection inference, selection side effects, or exact source JSX behavior as typed-tool gaps.

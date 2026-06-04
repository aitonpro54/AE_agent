# Find All Expressions Typed Plan

## Goal

Найти и перечислить existing expressions в активной или явно указанной композиции через read-only typed bridge tools.

## Applies When

- Пользователь просит find/list/report all expressions, find properties with expressions, or audit expressions in the active composition.
- Нужно сообщить layer identity, property path, expression text, enabled state, expression errors, and optional property values without changing the project.
- Active-comp scope is the default. Explicit composition scope is acceptable when the comp is identified through typed comp/project evidence.
- Selected-property scope may use current `get_selected_properties` evidence when the user explicitly asks for selected properties only.
- If the user needs project-wide recursive all-comp scans, selection side effects, expression edits, expression enable/disable/clear operations, syntax repair, controller rigs, or source-exact raw JSX behavior, fail closed or require a separate typed-tool contract.
- Задача не требует keyframe edits, effect edits, layer timing changes, source relinking, render queue changes, selection mutation, or raw script execution.

## Plan Pattern

1. Run `get_active_comp` to confirm the active comp, or bind an explicit comp target from typed project/comp evidence when the user names one.
2. If the request is selected-property scoped, run `get_selected_properties` with `includeValues:true` and `includeExpressions:true`, then report only those current selected properties.
3. If the request is active-comp scoped, run `list_layers` or `get_comp_details` to enumerate concrete layer indices before expression inspection.
4. For each concrete layer target, run `get_layer_details` with expression/property detail enabled.
5. Treat a property as a match only when typed evidence reports current expression text, expression enabled state, expression error state, or an explicit expression-capable property with non-empty expression data.
6. Report zero matches as a read-only result. Do not initialize, enable, disable, clear, rewrite, or repair expressions.
7. Include layer index/name, exact property path, expression text, `expressionEnabled`, and `expressionError` evidence for each match when available.
8. Fail closed if current typed tools cannot expose nested property expression details for the requested scope; report the typed-tool gap instead of falling back to raw script execution.

## Safety Gates

- Read-only expression inventory workflow.
- Requires normal Agent plan validation, but no mutation permission, explicit confirmation, checkpoint, edit session, idempotency key, or post-mutation verification.
- Do not change selection state, layer state, expression text, expression enabled state, effects, keyframes, sources, render queue items, or project structure.
- Do not infer expression-bearing properties from prior chat context. Use current `get_selected_properties`, `list_layers`, `get_comp_details`, or `get_layer_details` evidence.
- Do not use this recipe for expression enable/disable, expression clearing, expression generation, expression replacement, syntax repair, controller rigs, keyframe generation, broad project-wide scans, selection side effects, or exact source JSX behavior.

## Verification

- The plan cites `get_active_comp` or explicit comp evidence before reporting expression matches.
- Active-comp searches enumerate concrete layer indices through `list_layers` or `get_comp_details` before calling `get_layer_details`.
- Selected-property searches cite current `get_selected_properties` evidence with `includeExpressions:true`.
- Every reported expression includes typed evidence for layer identity, exact `propertyPath`, expression text, enabled state, and expression error state when available.
- Zero matches, missing nested expression detail, unsupported project-wide scans, and source-exact raw JSX semantics are reported as read-only results or typed-tool gaps.
- The plan contains only comp/layer/property read tools and reporting.

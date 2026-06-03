# Debug Helper Typed Plan

## Goal

Collect read-only debugging context about the active composition, selected layers, and selected properties through typed bridge tools, without copying source JSX or relying on unreviewed AE UI side effects.

## Applies When

- The user asks for a debug helper, selected-layer/property diagnostics, property paths, match names, current values, expression state, or compact context for a later plan.
- Current evidence can be gathered with `get_active_comp`, `get_selected_layers`, `get_selected_properties`, and optional `get_layer_details`.
- The requested workflow is inspection-only and does not require changing layers, properties, expressions, keyframes, selection state, render queue items, or project items.
- If the request requires source-exact `debughelper.jsx` UI output, raw ExtendScript, broad hidden-property traversal, persistent debug layers, writing markers/text, console logging side effects, or mutating project state, fail closed and require a separate typed-tool contract.

## Plan Pattern

1. Run `get_active_comp` to bind active comp identity, current time, duration, frame rate, selected-layer count, and basic layer context.
2. Run `get_selected_layers` when selected layer identity, layer indices, names, types, timing, parent/source hints, or selection ordering are relevant.
3. Run `get_selected_properties` with `includeValues:true` and `includeExpressions:true` when the user needs selected property paths, values, keyframe/animated state, expression text, or expression-enabled state.
4. Run `get_layer_details` only for concrete layers identified by the prior typed evidence and only when deeper property, marker, effect, source, or expression read-back is needed.
5. Summarize returned metadata with explicit unavailable/unsupported fields instead of inferring hidden AE state.
6. Keep the output diagnostic: list comp identity, selected layers, selected properties, property paths, match-name/name evidence when exposed, value shapes, keyframe/expression state, and typed-tool gaps.
7. Do not call mutating tools, do not execute raw JSX, and do not create persistent project artifacts for debugging.

## Safety Gates

- Read-only workflow.
- Requires Agent plan validation when used in planning context.
- Does not require explicit confirmation, `allowMutations:true`, idempotency, checkpoint/edit-session protection, or post-mutation verification because no mutation is allowed.
- Do not infer selected layers or properties from prior chat context; use current typed read evidence.
- Do not use this recipe for expression edits, property value edits, keyframe edits, layer selection changes, marker/text debug writes, source relinking, render queue changes, project-item mutation, raw ExtendScript, or exact source JSX behavior.

## Verification

- Pre-run evidence comes only from typed read tools.
- The diagnostic report cites the active comp, selected layer indices/names, selected property paths, values, keyframe state, and expression state only when returned by typed tools.
- `get_layer_details` is limited to concrete layers identified by current typed evidence.
- No project-changing tool appears in the plan.
- Unsupported source-exact debug UI output, hidden traversal, console-only behavior, raw JSX, and mutation requests are reported as typed-tool gaps.

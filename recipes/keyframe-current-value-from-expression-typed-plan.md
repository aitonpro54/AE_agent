# Keyframe Current Value From Expression Typed Plan

## Goal

Write one keyframe from the current post-expression value of a reviewed AE property through the existing `keyframe_current_value_from_expression` typed bridge tool, without copying source JSX or relying on AE UI selection side effects.

## Applies When

- The user asks to keyframe the current value from an expression, commit the evaluated expression value at the CTI, or capture an expression result as a property keyframe.
- Current typed evidence identifies exactly one target composition, layer, and property path through `get_active_comp` plus `get_selected_properties`, or through equivalent explicit generated layer/property evidence.
- The target property can vary over time and has a non-empty expression when `requireExpression:true`.
- The requested `time` is finite and reviewed. If omitted, the plan must disclose that the active comp current time will be used.
- If the request needs broad selected-property traversal, expression baking over a range, expression text edits, interpolation/ease preservation, spatial tangent preservation, unsupported value shapes, or exact source JSX UI behavior, fail closed and require a separate typed-tool contract.

## Plan Pattern

1. Run `get_active_comp` to bind the active composition identity, current time, frame rate, duration, and work area when relevant.
2. Run `get_selected_properties` with `includeValues:true` and `includeExpressions:true`, or use equivalent explicit current layer/property evidence for generated-only workflows.
3. Bind exactly one concrete property target from current evidence: comp identity, `layerIndex`, layer name when available, exact `propertyPath`, value shape, expression-capable state, expression text/state, and existing keyframe state when available.
4. Require reviewed keyframe settings before mutation: target `time` or active comp CTI default, `requireExpression`, and the expected post-expression current-value mode.
5. Fail closed when selected-property evidence is empty, more than one target is requested without a separate batch contract, the property lacks a stable layer/property path, cannot vary over time, lacks an expression while `requireExpression:true`, has unsupported value shape, or the time is ambiguous/outside the reviewed comp duration.
6. Disclose previous expression state, existing keyframe state when available, target time, `requireExpression`, and the expected `valueAtTime(time,false)` keyframe behavior before confirmation.
7. Run one `keyframe_current_value_from_expression` step with the evidence-backed comp target, `layerIndex`, exact `propertyPath`, reviewed `time` when provided, and reviewed `requireExpression`.
8. Run `get_layer_details` after mutation for the affected layer with property values, keyframes, and expressions included.
9. Report skipped targets with explicit typed-tool gap reasons instead of silently changing them.

## Safety Gates

- Mutating selected-property keyframe/expression workflow.
- Requires validated Agent plan, explicit user confirmation, `allowMutations:true`, idempotency, checkpoint/edit-session protection, and post-mutation read-back.
- Do not infer selected properties from prior chat context; use only current typed evidence or explicit current layer/property evidence.
- Mutate only the reviewed property by adding or replacing a keyframe at the reviewed time. Do not change expression text, expression enabled state, unrelated keyframes, layer transforms outside the reviewed property, layer names, effects, sources, masks, render queue items, project items, selection state, comp settings, or unselected properties.
- Use `requireExpression:false` only when the user explicitly accepts keyframing the evaluated current value even if no expression is present.
- Treat range baking, redundant sample pruning, expression clearing, interpolation/ease/tangent preservation, multi-property batching, source-exact UI prompts, and exact source semantics as typed-tool gaps unless a separate contract proves safe behavior.

## Verification

- Pre-run evidence identifies exactly one concrete property target, its owning layer, exact property path, value shape, expression state, existing keyframe state when available, comp current time, and reviewed target time.
- Dry-run evidence lists previous expression state, existing keyframe state when available, target `time`, `requireExpression`, and expected `valueAtTime(time,false)` behavior.
- The `keyframe_current_value_from_expression` result reports the expected property path, keyframe time, captured value, and preserved expression text.
- Post-run `get_layer_details` shows a keyframe at the reviewed time on the expected layer/property path with the captured current post-expression value.
- When `requireExpression:true`, read-back evidence shows the property had expression text before the keyframe step and the expression text was not cleared by this recipe.
- Skipped targets are reported with explicit reasons such as missing selected-property evidence, unsupported value shape, missing expression, non-keyframeable property, ambiguous time, missing read-back, batch request, range baking request, interpolation/ease preservation gap, spatial tangent gap, or unsupported exact source semantics.
- Post-run evidence shows no unrelated expression, effect, source, render queue, layer name, selection state, project item, comp setting, unselected property, or unrelated keyframe mutation.

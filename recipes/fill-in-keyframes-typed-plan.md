# Fill In Keyframes Typed Plan

## Goal

Bake one reviewed AE property expression or evaluated value range into linear keyframes through the existing `fill_in_keyframes` typed bridge tool, without copying source JSX or relying on AE selection side effects.

## Applies When

- The user asks to fill in keyframes, bake an expression to keyframes, sample a property over time, or convert a generated expression/value range into keyframes.
- Current typed evidence identifies exactly one target composition, layer, and property path through `get_active_comp` plus `get_selected_properties`, or through equivalent explicit layer/property evidence.
- The plan has reviewed `startTime`, `endTime`, positive `sampleEveryFrames`, `removeRedundant`, and `clearExpression` settings before confirmation.
- The supported safe mode is `sampleEvaluatedPropertyRange`: sample the reviewed property over a bounded time range, write linear keyframes, optionally prune redundant identical interior samples, and optionally clear the source expression.
- If the request needs automatic broad expression conversion, source-exact selected-key behavior, unbounded property scans, interpolation/ease preservation, spatial tangent preservation, arbitrary expression edits, unsupported value shapes, or multi-property batch baking, fail closed and require a separate typed-tool contract.

## Plan Pattern

1. Run `get_active_comp` to bind the active composition identity, frame rate, duration, and work area when relevant.
2. Run `get_selected_properties` with `includeValues:true` and `includeExpressions:true`.
3. Bind exactly one concrete property target from current evidence: comp identity, `layerIndex`, layer name when available, exact `propertyPath`, value shape, expression state, existing keyframe state, and any existing expression text.
4. Require reviewed `fillRange` values before mutation: `startTime`, `endTime`, `sampleEveryFrames`, `removeRedundant`, and `clearExpression`. The range must be finite, inside the target comp duration unless the bridge reports a narrower work-area default, and ordered with `startTime <= endTime`.
5. Fail closed when selected-property evidence is empty, more than one property target is requested without a separate batch contract, the property lacks a stable layer/property path, the value shape is unsupported, the requested range is ambiguous, or the user expects exact source JSX UI behavior.
6. Disclose the previous expression state, existing keyframe state when available, reviewed `fillRange`, expected sample cadence, `clearExpression` choice, and redundant-sample pruning choice before confirmation.
7. Run one `fill_in_keyframes` step with the evidence-backed comp target, `layerIndex`, exact `propertyPath`, reviewed `startTime`, `endTime`, `sampleEveryFrames`, `removeRedundant`, and `clearExpression`.
8. Run `get_layer_details` after mutation for the affected layer with property values, keyframes, and expressions included.
9. Report skipped targets with explicit typed-tool gap reasons instead of silently changing them.

## Safety Gates

- Mutating selected-property keyframe/expression workflow.
- Requires validated Agent plan, explicit user confirmation, `allowMutations:true`, idempotency, checkpoint/edit-session protection, and post-mutation read-back.
- Do not infer selected properties from prior chat context; use only current typed evidence or explicit current layer/property evidence.
- Mutate only the reviewed property. Do not change unrelated expressions, layer transforms outside the reviewed property, layer names, effects, sources, masks, render queue items, project items, selection state, comp settings, or unselected properties.
- Use `clearExpression:true` only when the user has reviewed that the expression will be cleared after baking. Preserve the expression with `clearExpression:false` when clearing is not requested.
- Treat interpolation/ease preservation, spatial tangent preservation, broad expression conversion, multi-property batch baking, source-exact UI prompts, and exact source semantics as typed-tool gaps unless a separate contract proves safe behavior.

## Verification

- Pre-run evidence identifies exactly one concrete property target, its owning layer, exact property path, value shape, expression state, existing keyframe state when available, comp duration, and reviewed fill range.
- Dry-run evidence lists previous expression state, existing keyframe state when available, `startTime`, `endTime`, `sampleEveryFrames`, `removeRedundant`, `clearExpression`, and expected sampling mode.
- The `fill_in_keyframes` result reports the expected property path, sampled count, final keyframe count, and linear keyframe write evidence.
- Post-run `get_layer_details` shows at least the expected sampled keyframes on the reviewed property and linear interpolation evidence when available.
- When `clearExpression:true`, post-run read-back shows the expression has been cleared; when `clearExpression:false`, read-back shows the expression choice was preserved according to the bridge result.
- If `removeRedundant:true`, dry-run/run evidence documents that only redundant identical interior samples may be pruned.
- Skipped targets are reported with explicit reasons such as missing selected-property evidence, unsupported value shape, ambiguous time range, missing read-back, batch conversion request, interpolation/ease preservation gap, spatial tangent gap, or unsupported exact source semantics.
- Post-run evidence shows no unrelated expression, effect, source, render queue, layer name, selection state, project item, comp setting, unselected property, or unrelated keyframe mutation.

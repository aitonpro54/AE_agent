# Add Markers At Selected Keyframes Typed Plan

## Goal

Add explicit layer markers at reviewed selected-keyframe times on currently selected AE properties through existing typed bridge tools, without copying source JSX or relying on raw AE selection side effects.

## Applies When

- Пользователь просит add markers at selected keyframes, add blank markers at selected keyframe times, or mark selected property keyframes with layer markers.
- Current `get_selected_properties` evidence includes concrete `layerIndex`, exact `propertyPath`, value shape, expression state, and keyframe/animated state for each target.
- The plan has explicit reviewed `selectedKeyframes` for every accepted target, including keyframe indices and times.
- The supported behavior is `markerTargetsFromSelectedKeyframeTimes`: compute reviewed `markerTargets` from the owning layer and selected keyframe times, then add layer markers at those exact times.
- The `comment` field must be present on every `add_layer_marker` call. The reviewed comment may be an explicit empty string for source-compatible blank markers, or a user-provided marker comment.
- If the user needs selected-key discovery without explicit reviewed keyframes, composition markers, audio-derived markers, marker update/delete, layer timing changes, property/keyframe value edits, broad property scans, selection side effects, source-exact UI behavior, or raw JSX semantics, fail closed and require a separate typed-tool contract.

## Plan Pattern

1. Run `get_active_comp` to bind the active composition.
2. Run `get_selected_properties` with `includeValues:true` and `includeExpressions:true`.
3. Bind concrete selected property targets only from that evidence: comp identity, `layerIndex`, layer name when available, exact `propertyPath`, current value shape, expression state, and keyframe/animated state when available.
4. Require explicit reviewed `selectedKeyframes` for every accepted target. Do not infer selected keyframes from prior chat context, property selection alone, or raw AE selection side effects.
5. Compute and disclose `markerTargets` before confirmation. Deduplicate only exact same-layer, same-time marker targets when multiple selected properties on the same layer share a selected keyframe time.
6. Choose a reviewed `markerComment` before confirmation. Use an explicit empty string only when blank marker semantics are intended; never omit the `comment` field.
7. Run one `add_layer_marker` step per reviewed marker target with the inspected comp target, evidence-backed `layerIndex`, exact selected keyframe `time`, reviewed `comment`, `verifyAfter:true`, and a stable `idempotencyKeyTemplate`.
8. Run `get_layer_details` for every affected layer and report marker read-back evidence.
9. Report skipped selected properties or keyframes with the typed-tool gap reason instead of silently changing them.

## Safety Gates

- Mutating selected-property keyframe-to-layer-marker workflow.
- Requires validated Agent plan, explicit user confirmation, `allowMutations:true`, idempotency, checkpoint/edit-session protection, and post-mutation read-back.
- Do not infer selected properties or selected keyframes from prior chat context; use only current typed evidence plus explicit reviewed `selectedKeyframes`.
- Do not omit the marker `comment` field. Explicit empty string is allowed only as a reviewed value.
- Do not change property values, keyframe times, expressions, interpolation/ease, layer timing, layer names, effects, sources, masks, render queue items, project items, selection state, composition markers, existing markers, or unselected properties.
- Do not use this recipe for audio analysis, beat detection, marker generation from audio, marker update/delete, broad timeline cleanup, or source-exact raw JSX behavior.

## Verification

- Pre-run `get_selected_properties` identifies every concrete selected property target, its owning layer, exact property path, expression state, and keyframe/animated state when available.
- The dry-run plan shows previous `selectedKeyframes`, reviewed `markerTargets`, and the exact `markerComment` value, including `comment:""` when blank markers are intended.
- Each `add_layer_marker` result reports the expected layer target, selected keyframe `time`, and reviewed `comment`.
- Post-run `get_layer_details` shows the expected layer marker at each reviewed selected keyframe time on the affected layer.
- Marker read-back reports the expected `comment`, `time`, and optional `duration`.
- Skipped targets are reported with explicit reasons such as missing selected-keyframe evidence, missing layer/property target, missing read-back, unsupported source-exact selected-key discovery, composition-marker request, audio-derived marker request, marker update/delete request, or raw JSX semantics.
- Post-run evidence shows no expression, property value, keyframe value, keyframe time, interpolation/ease, layer timing, effect, source, render queue, layer name, selection state, project item, existing marker, composition marker, unselected keyframe, or unselected property mutation.

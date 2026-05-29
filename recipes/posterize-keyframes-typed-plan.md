# Posterize Keyframes Typed Plan

## Goal

Posterize explicit reviewed selected keyframes on currently selected AE properties through existing typed keyframe tools, without copying source JSX or relying on AE selection side effects.

## Applies When

- Пользователь просит posterize selected keyframes, quantize selected keyframes to a frame grid, snap selected keyframes to a reviewed frame interval, or create stepped keyframe timing on currently selected properties.
- Current `get_selected_properties` evidence includes concrete `layerIndex`, exact `propertyPath`, value shape, expression state, and keyframe/animated state for each target.
- The plan has explicit reviewed `selectedKeyframes`, complete `completePropertyKeyframes` read-back for every accepted property, and a reviewed `posterizeFrameGrid` such as a frame step, target fps, or quantization interval.
- The supported safe mode is `rewriteReviewedKeyframesToFrameGrid`: compute `posterizedKeyframes` by preserving reviewed keyframe values while moving only accepted selected keyframes onto the reviewed frame grid, and preserving all unselected keyframes in the complete rewritten property sequence.
- If selected-key discovery, destructive key removal, unresolved time collisions, interpolation/ease preservation, spatial tangent preservation, expression-derived sampling, broad property scans, source-exact UI behavior, or raw JSX semantics are required, fail closed and require a separate typed-tool contract.

## Plan Pattern

1. Run `get_active_comp` to bind the active composition and frame-rate context.
2. Run `get_selected_properties` with `includeValues:true` and `includeExpressions:true`.
3. Bind concrete selected property targets only from that evidence: comp identity, `layerIndex`, layer name when available, exact `propertyPath`, current value shape, expression state, and keyframe/animated state when available.
4. Run `get_layer_details` before mutation for every affected layer with enough detail to capture complete keyframe read-back for each accepted property.
5. Require explicit reviewed `selectedKeyframes`, complete `completePropertyKeyframes`, and a reviewed `posterizeFrameGrid` for every accepted target. Do not infer selected keyframes from prior chat context, property selection alone, or raw AE selection side effects.
6. Fail closed when selected-property evidence is empty, lacks layer/property path targets, lacks exact selected keyframe indices/times/values, lacks complete property keyframe read-back, has expression text or enabled expressions, has unsupported value shapes, has unresolved posterized-time collisions, or requires source-exact selected-key discovery.
7. Compute and disclose `posterizedKeyframes`, `preservedUnselectedKeyframes`, collision handling, and the full rewritten keyframe sequence before confirmation.
8. Run one `set_property_keyframes` step per accepted property target only when the full rewritten keyframe sequence is reviewed. Use `clearExisting:true` only together with complete `completePropertyKeyframes`, explicit `posterizedKeyframes`, and preserved unselected-key evidence.
9. Use `apply_keyframe_ease` only when the plan has explicit reviewed key indices after the rewrite plus requested ease/interpolation settings; otherwise report interpolation/ease preservation as a typed-tool gap.
10. Run `get_layer_details` after mutation for every affected layer with enough property detail to read back the rewritten keyframed property.
11. Report skipped selected properties with the typed-tool gap reason instead of silently changing them.

## Safety Gates

- Mutating selected-property keyframe timing workflow.
- Requires validated Agent plan, explicit user confirmation, `allowMutations:true`, idempotency, checkpoint/edit-session protection, and post-mutation read-back.
- Do not infer selected properties or selected keyframes from prior chat context; use only current typed evidence plus explicit reviewed `selectedKeyframes`.
- Do not use `clearExisting:true` unless the plan has complete `completePropertyKeyframes` and a full rewritten sequence that preserves unselected keys.
- Do not change expressions, non-keyframed static values, unsupported value shapes, layer transforms outside the explicit property keyframes, layer names, effects, sources, masks, render queue items, project items, selection state, or unselected properties.
- Do not promise source-exact Posterize_Keyframes.jsx behavior; source-exact selected-key discovery, UI prompts, key deletion, interpolation preservation, spatial tangent preservation, and arbitrary collision policies need a separate typed-tool contract.

## Verification

- Pre-run `get_selected_properties` identifies every concrete selected property target, its owning layer, exact property path, current value shape, expression state, and keyframe/animated state when available.
- Pre-run `get_layer_details` captures `completePropertyKeyframes` for every accepted property before mutation.
- The dry-run plan shows previous `selectedKeyframes`, reviewed `posterizeFrameGrid`, computed `posterizedKeyframes`, `preservedUnselectedKeyframes`, collision policy, and the full rewritten keyframe sequence for every accepted target.
- Each `set_property_keyframes` result reports the expected property path, `clearExisting:true`, and the expected full rewritten keyframe count only after complete-property evidence was reviewed.
- Any `apply_keyframe_ease` step uses explicit reviewed post-rewrite key indices and reports those key indices after easing.
- Post-run `get_layer_details` shows the affected property has the expected keyframe count, selected keyframes at the computed posterized times, and preserved unselected keyframes.
- Skipped targets are reported with explicit reasons such as missing selected keyframe evidence, missing completePropertyKeyframes, expression-driven property, unsupported value shape, unresolved posterized-time collision, missing read-back, selected-key discovery gap, interpolation/ease preservation gap, spatial tangent gap, destructive key deletion request, or unsupported exact source semantics.
- Post-run evidence shows no expression, effect, source, render queue, layer name, selection state, project item, unselected keyframe value, unselected keyframe time, or unselected property mutation.

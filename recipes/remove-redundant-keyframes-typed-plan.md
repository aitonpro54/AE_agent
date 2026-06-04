# Remove Redundant Keyframes Typed Plan

## Goal

Remove explicitly reviewed redundant keyframes on currently selected AE properties through existing typed keyframe tools, without copying source JSX or relying on AE selection side effects.

## Applies When

- Пользователь просит remove redundant keyframes, delete duplicate-value keyframes, clean up unnecessary keyframes, or prune repeated selected-property keyframes while preserving the visible animation.
- Current `get_selected_properties` evidence includes concrete `layerIndex`, exact `propertyPath`, value shape, expression state, and keyframe/animated state for each target.
- The plan has complete `completePropertyKeyframes` read-back for every accepted property and explicit reviewed `redundantKeyframes` to remove, including keyframe indices, times, values, and the redundancy rule used to classify each keyframe.
- The supported safe mode is `rewriteWithoutReviewedRedundantKeyframes`: build a full reviewed `prunedKeyframes` sequence that preserves all nonredundant keyframes and removes only the explicit reviewed redundant keyframes.
- If selected-key discovery, automatic fuzzy duplicate detection, unresolved hold/ease/tangent preservation, expression-derived sampling, interpolation-sensitive cleanup, destructive broad cleanup, source-exact UI behavior, or raw JSX semantics are required, fail closed and require a separate typed-tool contract.

## Plan Pattern

1. Run `get_active_comp` to bind the active composition and frame-rate context.
2. Run `get_selected_properties` with `includeValues:true` and `includeExpressions:true`.
3. Bind concrete selected property targets only from that evidence: comp identity, `layerIndex`, layer name when available, exact `propertyPath`, current value shape, expression state, and keyframe/animated state when available.
4. Run `get_layer_details` before mutation for every affected layer with enough detail to capture complete keyframe read-back for each accepted property.
5. Require complete `completePropertyKeyframes`, explicit reviewed `redundantKeyframes`, and a reviewed `redundancyRule` for every accepted target. Do not infer redundant keys from prior chat context, property selection alone, or raw AE selection side effects.
6. Fail closed when selected-property evidence is empty, lacks layer/property path targets, lacks complete keyframe read-back, has expression text or enabled expressions, has unsupported value shapes, lacks an explicit redundancy rule, would remove all keys, would remove endpoint keys without explicit approval, or requires source-exact selected-key discovery.
7. Compute and disclose `removedRedundantKeyframes`, `preservedKeyframes`, and the full `prunedKeyframes` sequence before confirmation.
8. Run one `set_property_keyframes` step per accepted selected property target only when the full `prunedKeyframes` sequence is reviewed. Use `clearExisting:true` only together with complete `completePropertyKeyframes`, explicit `removedRedundantKeyframes`, and preserved-key evidence.
9. Use `apply_keyframe_ease` only when the plan has explicit reviewed post-rewrite `keyIndices` plus requested ease/interpolation settings; otherwise report interpolation/ease preservation as a typed-tool gap.
10. Run `get_layer_details` after mutation for every affected layer with enough property detail to read back the rewritten keyframed property.
11. Report skipped selected properties with the typed-tool gap reason instead of silently changing them.

## Safety Gates

- Mutating selected-property keyframe removal workflow.
- Requires validated Agent plan, explicit user confirmation, `allowMutations:true`, idempotency, checkpoint/edit-session protection, and post-mutation read-back.
- Do not infer selected properties, selected keyframes, or redundant keyframes from prior chat context; use only current typed evidence plus explicit reviewed `completePropertyKeyframes`, `redundantKeyframes`, and `redundancyRule`.
- Do not use `clearExisting:true` unless the plan has complete `completePropertyKeyframes` and a full reviewed `prunedKeyframes` sequence that preserves every nonredundant keyframe.
- Do not change expressions, unsupported value shapes, preserved keyframe values/times, layer transforms outside the explicit property keyframes, layer names, effects, sources, masks, render queue items, project items, selection state, or unselected properties.
- Do not promise source-exact Remove_Redundant_Keyframes.jsx behavior; source-exact selected-key discovery, UI prompts, interpolation/ease/tangent preservation, broad cleanup heuristics, and arbitrary duplicate-value policies need a separate typed-tool contract.

## Verification

- Pre-run `get_selected_properties` identifies every concrete selected property target, its owning layer, exact property path, current value shape, expression state, and keyframe/animated state when available.
- Pre-run `get_layer_details` captures `completePropertyKeyframes` for every accepted property before mutation.
- The dry-run plan shows previous `completePropertyKeyframes`, reviewed `redundancyRule`, explicit `removedRedundantKeyframes`, `preservedKeyframes`, and the full `prunedKeyframes` sequence for every accepted target.
- Each `set_property_keyframes` result reports the expected property path, `clearExisting:true`, and the expected pruned keyframe count only after complete-property evidence was reviewed.
- Any `apply_keyframe_ease` step uses explicit reviewed post-rewrite key indices and reports those key indices after easing.
- Post-run `get_layer_details` shows the affected property has the expected pruned keyframe count, every `preservedKeyframe` remains at the expected time/value, and every reviewed redundant keyframe was removed.
- Skipped targets are reported with explicit reasons such as missing completePropertyKeyframes, missing redundancyRule, expression-driven property, unsupported value shape, endpoint-removal risk, all-keys-removal risk, missing read-back, selected-key discovery gap, interpolation/ease preservation gap, spatial tangent gap, or unsupported exact source semantics.
- Post-run evidence shows no expression, effect, source, render queue, layer name, selection state, project item, preserved keyframe value/time, unselected property, or unrelated keyframe mutation.

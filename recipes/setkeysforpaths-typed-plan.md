# Set Keys For Paths Typed Plan

## Goal

Set reviewed keyframes on explicit AE property paths through `set_property_keyframes`, without copying source JSX, walking hidden property trees, or relying on unreviewed selection side effects.

## Applies When

- The user asks to set keys for property paths, add keyframes to selected properties, or write a reviewed keyframe sequence to explicit layer/property targets.
- Current typed evidence from `get_active_comp` plus `get_selected_properties`, or equivalent explicit `get_layer_details` evidence, identifies every target `layerIndex` and exact `propertyPath`.
- The plan has a reviewed keyframe payload for each accepted property target, including finite times, values compatible with the current property value shape, and the intended `clearExisting` behavior.
- The supported safe mode is `writeReviewedKeyframesToEvidenceBackedPropertyPaths`: write only the disclosed keyframe sequence to the disclosed property path.
- If the request needs source-exact selected-path traversal, shape or mask path geometry edits, hidden AE property walking, automatic path discovery, interpolation/ease preservation, spatial tangent preservation, expression-derived sampling, or broad batch mutation, fail closed and require a separate typed-tool contract.

## Plan Pattern

1. Run `get_active_comp` to bind the active composition identity, frame rate, current time, duration, selected-layer count, and offline state when applicable.
2. Run `get_selected_properties` with `includeValues:true` and `includeExpressions:true` when the request targets selected properties.
3. Run `get_layer_details` only for concrete layers identified by current typed evidence when deeper property-path, value-shape, expression, or keyframe read-back is required.
4. Bind each accepted target from current evidence: comp identity, `layerIndex`, layer name when available, exact `propertyPath`, current value shape, expression state, existing keyframe state, and whether the property appears safe for typed keyframe writes.
5. Require reviewed `keyframesForPaths` for every accepted target. Each entry must include the exact property path, finite keyframe times, explicit values, and a reviewed `clearExisting` choice.
6. Fail closed when typed evidence is empty, the target property path is ambiguous, values do not match the observed shape, an enabled expression must be preserved in an unsupported way, shape/mask path vertex data must be generated, or the request expects exact source JSX behavior.
7. Disclose previous keyframe/expression state, target property paths, `clearExisting`, and complete keyframe values before confirmation.
8. Run one `set_property_keyframes` step per accepted property target with the evidence-backed `layerIndex`, exact `propertyPath`, reviewed keyframes, and reviewed `clearExisting`.
9. Use `apply_keyframe_ease` only when the plan has explicit reviewed `keyIndices` and easing settings after the keyframe write; otherwise leave ease/interpolation out of scope.
10. Run `get_layer_details` after mutation for every affected layer with enough property detail to verify the written keyframes and expression state.
11. Report skipped targets with explicit typed-tool gap reasons instead of silently changing them.

## Safety Gates

- Mutating property-keyframe workflow.
- Requires validated Agent plan, explicit user confirmation, `allowMutations:true`, idempotency, checkpoint/edit-session protection, and post-mutation read-back.
- Do not infer selected properties, property paths, keyframe times, or values from prior chat context; use only current typed evidence plus reviewed payloads.
- Mutate only the reviewed property paths. Do not change expressions except through separately reviewed typed behavior, layer names, transforms outside the target properties, effects, masks, sources, render queue items, project items, selection state, comp settings, or unrelated properties.
- Use `clearExisting:true` only when the user reviewed a full replacement sequence for that exact property path. Use `clearExisting:false` for additive or preservation-oriented writes.
- Treat path geometry authoring, source-exact path traversal, automatic selected-path discovery, broad all-selected-property keyframing, interpolation/ease preservation, spatial tangent preservation, expression-derived sampling, and raw ExtendScript as typed-tool gaps unless a separate contract proves safe behavior.

## Verification

- Pre-run evidence identifies every accepted target's active or explicit comp, owning layer, exact property path, current value shape, expression state, and existing keyframe state when available.
- Dry-run evidence lists each reviewed target property path, `clearExisting` choice, and full keyframe sequence.
- Each `set_property_keyframes` result reports the expected layer index, property path, clear-existing behavior, and keyframe count.
- Any `apply_keyframe_ease` step uses explicit reviewed key indices and reports those indices after easing.
- Post-run `get_layer_details` shows the affected property has the expected keyframe count and values on the reviewed path, with expression state preserved or changed only as explicitly reviewed by the typed tool result.
- Skipped targets are reported with explicit reasons such as missing selected-property evidence, ambiguous property path, unsupported value shape, expression-preservation gap, shape/mask path geometry gap, selected-path discovery gap, interpolation/ease gap, spatial tangent gap, broad batch request, missing read-back, or unsupported exact source semantics.
- Post-run evidence shows no unrelated expression, effect, source, render queue, layer name, selection state, project item, comp setting, key removal, or unselected property mutation.

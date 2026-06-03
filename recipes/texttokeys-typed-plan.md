# Text To Keys Typed Plan

## Goal

Create explicit Source Text keyframes on reviewed text layers through `set_property_keyframes`, without copying source JSX or relying on unreviewed AE selection side effects.

## Applies When

- The user asks to turn text into progressive Source Text keyframes, type-on text states, or explicit text reveal keyframes.
- Current evidence from `get_active_comp`, `get_selected_layers`, and `get_layer_details` identifies one or more concrete TextLayer targets.
- The target text, timing, frame cadence, and generated keyframe text values are reviewed before mutation.
- If the request needs source-exact typo behavior, automatic selected-layer traversal without text-layer evidence, text animator ranges, expression-driven text generation, or raw ExtendScript, fail closed and require a separate typed-tool contract.

## Plan Pattern

1. Run `get_active_comp` to bind comp identity, frame rate, current time, duration, and selected-layer count.
2. Run `get_selected_layers`, then `get_layer_details` for every accepted target with properties/values included.
3. Bind only concrete TextLayer targets with the exact `ADBE Text Properties.ADBE Text Document` property path.
4. Compute explicit reviewed Source Text keyframes from the accepted text string, start time, frame step, and reveal mode.
5. Disclose the target layers, source text, keyframe times, and resulting text values before confirmation.
6. Run `set_property_keyframes` for each reviewed text layer with `clearExisting:true` only when replacement was explicitly accepted.
7. Run `get_layer_details` after mutation with `includeProperties:true`, `includeValues:true`, and `includeExpressions:true`.
8. Report skipped targets with explicit reasons such as non-text layer, missing property path, ambiguous text, unsupported animator-range request, or exact source JSX behavior.

## Safety Gates

- Mutating Source Text keyframe workflow.
- Requires validated Agent plan, explicit confirmation, `allowMutations:true`, idempotency, checkpoint/edit-session protection, and post-mutation read-back.
- Do not infer selected layers or text values from prior chat context.
- Mutate only the reviewed Source Text property. Do not change layer names, transforms, effects, masks, sources, render queue items, project items, expressions, selection state, comp settings, or unrelated properties.
- Treat source-exact `textToKeys.jsx` behavior, typo/no-call repair, broad selected-layer traversal, text animators, and range selectors as unsupported until separately proven.

## Verification

- Pre-run evidence identifies the active comp, every accepted text layer, the current text value, and the Source Text property path.
- Dry-run evidence lists the exact keyframe times and text values that will be written.
- `set_property_keyframes` reports the expected layer index, property path, and keyframe count.
- Post-run `get_layer_details` shows the expected Source Text keyframe count and text values on the reviewed layer.
- Skipped targets are reported with explicit typed-tool gap reasons.
- Post-run evidence shows no unrelated layer, expression, effect, source, render queue, project item, selection, comp setting, or unrelated property mutation.

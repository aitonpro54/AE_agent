# Change Nested Composition Duration With Timecode Typed Plan

## Goal

Change the `duration` of an explicitly selected nested source composition from a reviewed timecode duration using existing typed bridge tools.

## Applies When

- The user asks to change nested composition duration with timecode, set a selected precomp source duration to a timecode value, or apply a duration like `HH:MM:SS:FF` to a nested/source comp.
- A safe adaptation is acceptable: parse the reviewed timecode against the verified nested source comp frame rate, convert it to positive finite `durationSeconds`, update only the source composition `duration` with `set_comp_properties`, then read it back.
- Target nested composition is identified from current selected precomp layer evidence, or from an explicit comp item/name that is read before mutation.
- The requested timecode is an explicit duration timecode, not a current-time indicator, layer in/out point, work-area range, marker span, or media duration inference.
- The timecode can be normalized without drop-frame ambiguity, off-frame timing, negative values, or frame numbers outside the nested comp frame-rate base.
- The user understands that changing a source composition can affect every layer that reuses that same source comp; ambiguous shared-source requests fail closed until explicit confirmation names the source comp.
- If the request needs layer in/out retiming, stretch changes, keyframe/expression shifts, drop-frame timecode semantics, recursive all-nested-comp changes, footage/source relinking, work-area changes, or exact source JSX behavior, fail closed and request a separate typed-tool contract.

## Plan Pattern

1. Run `get_active_comp` to establish the parent comp identity.
2. Run `get_selected_layers` for selected-layer workflows and require exactly one selected precomp layer unless the user explicitly provides one concrete layer target.
3. Run `get_layer_details` for the parent layer and require `layer.source` evidence that identifies a composition source item. Fail closed if the selected layer has no comp source.
4. Run `get_comp_details` for the nested source composition by `compItemIndex` or exact `compName`, and record the current `duration`, `frameRate`, width, height, background color, layer count, work area, and source comp identity before mutation.
5. Parse only an explicit reviewed `durationTimecode` such as `HH:MM:SS:FF` or `MM:SS:FF` against the nested comp `frameRate`. Fail closed for missing timecode, drop-frame punctuation, negative components, fractional frames, frame numbers outside the frame-rate base, unknown frame rate, or ambiguous user intent.
6. Compute `durationSeconds` as whole seconds plus `frames / frameRate`, require it to be positive and finite, and display the source `durationTimecode`, frame rate, frame count component, and computed seconds before confirmation.
7. Run `set_comp_properties` against only the verified nested source composition, passing only `duration`, `verifyAfter:true`, and a stable `idempotencyKeyTemplate`.
8. Run `get_comp_details` again for the same nested source composition and compare `duration` plus unchanged width, height, `frameRate`, background color, layer count, work area, and source comp identity.
9. Run `get_layer_details` for the parent layer again when the parent layer was selected, confirming it still references the same source comp and its own in/out points, stretch, start time, source, order, effects, masks, expressions, and keyframes were not mutated.
10. Fail closed instead of using raw script execution when the request needs layer timing retargeting, recursive nested traversal, source duplication before mutation, content/keyframe shifts, work-area edits, drop-frame behavior, or exact source JSX semantics.

## Safety Gates

- Mutating composition-property workflow.
- Requires validated Agent plan, dry-run, explicit confirmation, `allowMutations:true`, idempotency and post-mutation read-back.
- Use checkpoint or edit-session protection for confirmed live runs.
- Require current selected-layer or explicit comp evidence before binding the nested source composition.
- Require current nested comp `frameRate` evidence before converting the timecode duration to seconds.
- Mutate only the verified nested source composition `duration`; do not change width, height, frame rate, `bgColor`, work area, layer order, layer timing, layer sources, effects, masks, expressions, keyframes, render queue items, or parent comp state.
- Treat shared source comps as high-risk unless the user explicitly confirms that editing the shared nested comp is intended.
- Do not use this recipe for layer retiming to match the new source duration, stretching nested layers, drop-frame timecode math, recursive all-nested-comp updates, source relinking, keyframe/expression shifts, template batch changes, or raw script execution.

## Verification

- The plan reads the parent comp and selected or explicit parent layer before choosing the nested source comp.
- `get_layer_details` evidence identifies the target layer source comp itemIndex/name before any mutation.
- Pre-run `get_comp_details` records the nested source composition current `duration`, `frameRate`, and unchanged structural fields.
- Dry-run evidence shows the reviewed `durationTimecode`, `frameRate`, computed `durationSeconds`, and why the value is positive, finite, and frame-aligned.
- The mutating step uses exactly one `set_comp_properties` call with only `duration` for the verified nested source composition.
- Post-run `get_comp_details` shows the requested duration from the timecode conversion on the same source comp and unchanged width, height, frame rate, background color, layer count, work area, and source comp identity.
- Post-run parent `get_layer_details` shows the parent layer still references the same nested source comp and its layer timing/keyframes/expressions were not changed when the target came from selection.
- Shared-source risk, layer retiming/stretch needs, recursive traversal, source duplication, source relinking, work-area changes, drop-frame timecode semantics, and exact source JSX semantics are reported as typed-tool gaps.

# Change Nested Composition Start Frame Typed Plan

## Goal

Change the displayed start frame of an explicitly selected nested source composition through existing typed bridge tools.

## Applies When

- The user asks to change nested composition start frame, nested comp display start frame, precomp source start frame, or selected nested/precomp source start frame.
- A safe adaptation is acceptable: compute the source composition `displayStartTime` from a reviewed integer `startFrame` and the verified nested comp `frameRate`, update only `displayStartTime` with `set_comp_properties`, then read it back.
- Target nested composition is identified from current selected precomp layer evidence, or from an explicit comp item/name that is read before mutation.
- The requested `startFrame` is explicit, finite, integer, and can be converted to seconds with the nested source comp frame rate without inferring timing from unrelated layers, markers, work area, media duration, or parent layer timing.
- The user understands that changing a source composition can affect every layer that reuses that same source comp; ambiguous shared-source requests fail closed until explicit confirmation names the source comp.
- If the user needs layer in/out retiming, parent layer `startTime` changes, stretch changes, keyframe/expression shifts, duration/work-area conversion, recursive all-nested-comp changes, source duplication/relinking, exact native `displayStartFrame` semantics, or exact source JSX behavior, fail closed and request a separate typed-tool contract.
- The task does not require raw script execution, layer creation/deletion, source relinking, render queue changes, expression edits, keyframe edits, footage interpretation edits, or broad template batch updates.

## Plan Pattern

1. Run `get_active_comp` to establish the parent comp identity.
2. Run `get_selected_layers` for selected-layer workflows and require exactly one selected precomp layer unless the user explicitly provides one concrete layer target.
3. Run `get_layer_details` for the parent layer and require `layer.source` evidence that identifies a composition source item. Fail closed if the selected layer has no comp source.
4. Run `get_comp_details` for the nested source composition by `compItemIndex` or exact `compName`, and record the current `displayStartTime`, `frameRate`, duration, width, height, background color, layer count, work area, and source comp identity before mutation.
5. Normalize the requested `startFrame` to a finite integer frame number. Fail closed when the start frame is missing, ambiguous, fractional, depends on selected-layer span inference, or the nested source comp `frameRate` is missing or non-positive.
6. Compute `displayStartTime = startFrame / frameRate` from the reviewed start frame and the verified nested source comp frame rate. Disclose the computed seconds value before confirmation and fail closed when the value cannot round-trip to the requested frame within the current typed-tool precision.
7. Run `set_comp_properties` against only the verified nested source composition, passing only `displayStartTime`, `verifyAfter:true`, and a stable `idempotencyKeyTemplate`.
8. Run `get_comp_details` again for the same nested source composition and compare `displayStartTime`, derived start frame, and unchanged frame rate, duration, width, height, background color, layer count, work area, and source comp identity.
9. Run `get_layer_details` for the parent layer again when the parent layer was selected, confirming it still references the same source comp and its own in/out points, stretch, start time, source, order, effects, masks, expressions, and keyframes were not mutated.
10. Fail closed instead of using raw script execution when the request needs parent layer retiming, recursive nested traversal, source duplication before mutation, content/keyframe shifts, work-area/duration conversion, native integer `displayStartFrame` mutation, or exact source JSX semantics.

## Safety Gates

- Mutating composition-property workflow.
- Requires validated Agent plan, dry-run, explicit confirmation, `allowMutations:true`, idempotency and post-mutation read-back.
- Use checkpoint or edit-session protection for confirmed live runs.
- Require current selected-layer or explicit comp evidence before binding the nested source composition.
- Mutate only the verified nested source composition `displayStartTime`; do not change width, height, duration, frame rate, `bgColor`, work area, layer order, layer timing, layer sources, effects, masks, expressions, keyframes, render queue items, footage interpretation, or parent comp state.
- Treat shared source comps as high-risk unless the user explicitly confirms that editing the shared nested comp is intended.
- Do not use this recipe for retiming layers to match the new start frame, changing parent layer `startTime`, stretching nested layers, shifting keyframes, recursive all-nested-comp updates, source relinking, footage interpretation changes, duration/work-area conversion, exact native `displayStartFrame` mutation, template batch changes, or raw script execution.

## Verification

- The plan reads the parent comp and selected or explicit parent layer before choosing the nested source comp.
- `get_layer_details` evidence identifies the target layer source comp itemIndex/name before any mutation.
- Pre-run `get_comp_details` records the nested source composition current `displayStartTime`, `frameRate`, and unchanged structural fields.
- Dry-run evidence shows the requested `startFrame`, existing `displayStartTime`, verified `frameRate`, computed `displayStartTime`, and why no layer retiming, parent `startTime` change, duration conversion, work-area conversion, keyframe shift, or footage interpretation change is being performed.
- The mutating step uses exactly one `set_comp_properties` call with only `displayStartTime` for the verified nested source composition.
- Post-run `get_comp_details` shows the requested start frame derived from `displayStartTime * frameRate` on the same source comp and unchanged width, height, duration, frame rate, background color, layer count, work area, and source comp identity.
- Post-run parent `get_layer_details` shows the parent layer still references the same nested source comp and its layer timing/keyframes/expressions were not changed when the target came from selection.
- Shared-source risk, parent layer retiming/start-time needs, recursive traversal, source duplication, source relinking, duration/work-area conversion, footage interpretation changes, keyframe/expression shifts, exact native `displayStartFrame` mutation, and exact source JSX semantics are reported as typed-tool gaps.

# Change Nested Composition Frame Rate Typed Plan

## Goal

Change the `frameRate` of an explicitly selected nested source composition through existing typed bridge tools.

## Applies When

- The user asks to change nested composition frame rate, nested comp fps, precomp source frame rate, or selected nested/precomp source FPS.
- A safe adaptation is acceptable: update only the target nested source composition `frameRate` field with `set_comp_properties`, then read it back.
- Target nested composition is identified from current selected precomp layer evidence, or from an explicit comp item/name that is read before mutation.
- The requested `frameRate` is explicit, positive, finite, and inside the frame-rate range supported by the current comp-property typed tool contract.
- The user understands that changing a source composition can affect every layer that reuses that same source comp; ambiguous shared-source requests fail closed until explicit confirmation names the source comp.
- If the user needs layer in/out retiming, stretch changes, keyframe/expression shifts, duration or work-area conversion to preserve frame counts, recursive all-nested-comp changes, source duplication/relinking, footage interpretation changes, or exact source JSX behavior, fail closed and request a separate typed-tool contract.
- The task does not require raw script execution, layer creation/deletion, source relinking, render queue changes, expression edits, keyframe edits, footage interpretation edits, or broad template batch updates.

## Plan Pattern

1. Run `get_active_comp` to establish the parent comp identity.
2. Run `get_selected_layers` for selected-layer workflows and require exactly one selected precomp layer unless the user explicitly provides one concrete layer target.
3. Run `get_layer_details` for the parent layer and require `layer.source` evidence that identifies a composition source item. Fail closed if the selected layer has no comp source.
4. Run `get_comp_details` for the nested source composition by `compItemIndex` or exact `compName`, and record the current `frameRate`, duration, width, height, background color, layer count, work area, and source comp identity before mutation.
5. Normalize the requested `frameRate` to a positive finite number. Fail closed when the frame rate is missing, ambiguous, non-positive, out of supported range, depends on footage interpretation, or requires timing conversion that would retime layers/keyframes or preserve a frame-count duration.
6. Run `set_comp_properties` against only the verified nested source composition, passing only `frameRate`, `verifyAfter:true`, and a stable `idempotencyKeyTemplate`.
7. Run `get_comp_details` again for the same nested source composition and compare `frameRate` plus unchanged width, height, duration, background color, layer count, work area, and source comp identity.
8. Run `get_layer_details` for the parent layer again when the parent layer was selected, confirming it still references the same source comp and its own in/out points, stretch, start time, source, order, effects, masks, expressions, and keyframes were not mutated.
9. Fail closed instead of using raw script execution when the request needs layer timing retargeting, recursive nested traversal, source duplication before mutation, content/keyframe shifts, work-area/duration conversion, footage interpretation changes, or exact source JSX semantics.

## Safety Gates

- Mutating composition-property workflow.
- Requires validated Agent plan, dry-run, explicit confirmation, `allowMutations:true`, idempotency and post-mutation read-back.
- Use checkpoint or edit-session protection for confirmed live runs.
- Require current selected-layer or explicit comp evidence before binding the nested source composition.
- Mutate only the verified nested source composition `frameRate`; do not change width, height, duration, `bgColor`, work area, layer order, layer timing, layer sources, effects, masks, expressions, keyframes, render queue items, footage interpretation, or parent comp state.
- Treat shared source comps as high-risk unless the user explicitly confirms that editing the shared nested comp is intended.
- Do not use this recipe for retiming layers to match the new frame rate, preserving source frame-count duration, stretching nested layers, recursive all-nested-comp updates, source relinking, footage interpretation changes, keyframe/expression shifts, template batch changes, or raw script execution.

## Verification

- The plan reads the parent comp and selected or explicit parent layer before choosing the nested source comp.
- `get_layer_details` evidence identifies the target layer source comp itemIndex/name before any mutation.
- Pre-run `get_comp_details` records the nested source composition current `frameRate` and unchanged structural fields.
- Dry-run evidence shows the requested `frameRate`, existing `frameRate`, and why no layer retiming, duration conversion, work-area conversion, keyframe shift, or footage interpretation change is being performed.
- The mutating step uses exactly one `set_comp_properties` call with only `frameRate` for the verified nested source composition.
- Post-run `get_comp_details` shows the requested frameRate on the same source comp and unchanged width, height, duration, background color, layer count, work area, and source comp identity.
- Post-run parent `get_layer_details` shows the parent layer still references the same nested source comp and its layer timing/keyframes/expressions were not changed when the target came from selection.
- Shared-source risk, layer retiming/stretch needs, recursive traversal, source duplication, source relinking, duration/work-area conversion, footage interpretation changes, keyframe/expression shifts, and exact source JSX semantics are reported as typed-tool gaps.

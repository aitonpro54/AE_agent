# Change Nested Composition Work Area Typed Plan

## Goal

Change the `workAreaStart` and `workAreaDuration` of an explicitly selected nested source composition through existing typed bridge tools.

## Applies When

- The user asks to change nested composition work area, nested comp work area range, precomp source work area, or selected nested/precomp source work-area start and duration.
- A safe adaptation is acceptable: update only the target nested source composition work area with `set_comp_work_area`, then read it back.
- Target nested composition is identified from current selected precomp layer evidence, or from an explicit comp item/name that is read before mutation.
- The requested `workAreaStart` and `workAreaDuration` are explicit, finite, frame-aligned for the nested source comp frame rate when frame precision matters, and do not require inferring timing from unrelated layers, markers, parent layer timing, media duration, or current-time selection.
- The user understands that changing a source composition can affect every layer that reuses that same source comp; ambiguous shared-source requests fail closed until explicit confirmation names the source comp.
- If the user needs layer in/out retiming, parent layer `startTime` changes, stretch changes, keyframe/expression shifts, duration changes, recursive all-nested-comp changes, source duplication/relinking, exact native viewer behavior, or exact source JSX behavior, fail closed and request a separate typed-tool contract.
- The task does not require raw script execution, layer creation/deletion, source relinking, render queue changes, expression edits, keyframe edits, footage interpretation edits, or broad template batch updates.

## Plan Pattern

1. Run `get_active_comp` to establish the parent comp identity.
2. Run `get_selected_layers` for selected-layer workflows and require exactly one selected precomp layer unless the user explicitly provides one concrete layer target.
3. Run `get_layer_details` for the parent layer and require `layer.source` evidence that identifies a composition source item. Fail closed if the selected layer has no comp source.
4. Run `get_comp_details` for the nested source composition by `compItemIndex` or exact `compName`, and record the current `workAreaStart`, `workAreaDuration`, `duration`, `frameRate`, width, height, background color, layer count, and source comp identity before mutation.
5. Normalize the requested `workAreaStart` and `workAreaDuration` to finite seconds values. Fail closed when either value is missing, ambiguous, non-finite, negative where unsupported, non-positive for duration, outside the nested source comp duration, depends on selected-layer span inference, or would require off-frame timing.
6. Run `set_comp_work_area` against only the verified nested source composition, passing only the reviewed `start`, reviewed `duration`, `verifyAfter:true`, and a stable `idempotencyKeyTemplate`.
7. Run `get_comp_details` again for the same nested source composition and compare `workAreaStart`, `workAreaDuration`, plus unchanged duration, frame rate, width, height, background color, layer count, and source comp identity.
8. Run `get_layer_details` for the parent layer again when the parent layer was selected, confirming it still references the same source comp and its own in/out points, stretch, start time, source, order, effects, masks, expressions, and keyframes were not mutated.
9. Fail closed instead of using raw script execution when the request needs parent layer retiming, recursive nested traversal, source duplication before mutation, content/keyframe shifts, duration changes, current-time based inference, or exact source JSX semantics.

## Safety Gates

- Mutating composition work-area workflow.
- Requires validated Agent plan, dry-run, explicit confirmation, `allowMutations:true`, idempotency and post-mutation read-back.
- Use checkpoint or edit-session protection for confirmed live runs.
- Require current selected-layer or explicit comp evidence before binding the nested source composition.
- Mutate only the verified nested source composition `workAreaStart` and `workAreaDuration`; do not change width, height, duration, frame rate, `bgColor`, layer order, layer timing, layer sources, effects, masks, expressions, keyframes, render queue items, footage interpretation, or parent comp state.
- Treat shared source comps as high-risk unless the user explicitly confirms that editing the shared nested comp is intended.
- Do not use this recipe for retiming layers to match the new work area, changing parent layer `startTime`, stretching nested layers, shifting keyframes, recursive all-nested-comp updates, source relinking, footage interpretation changes, duration conversion, template batch changes, or raw script execution.

## Verification

- The plan reads the parent comp and selected or explicit parent layer before choosing the nested source comp.
- `get_layer_details` evidence identifies the target layer source comp itemIndex/name before any mutation.
- Pre-run `get_comp_details` records the nested source composition current `workAreaStart`, `workAreaDuration`, `duration`, `frameRate`, and unchanged structural fields.
- Dry-run evidence shows the requested `workAreaStart`, requested `workAreaDuration`, existing work area, nested source comp duration/frame rate, and why no layer retiming, parent `startTime` change, duration conversion, keyframe shift, or footage interpretation change is being performed.
- The mutating step uses exactly one `set_comp_work_area` call for the verified nested source composition with only the reviewed start and duration.
- Post-run `get_comp_details` shows the requested `workAreaStart` and `workAreaDuration` on the same source comp and unchanged width, height, duration, frame rate, background color, layer count, and source comp identity.
- Post-run parent `get_layer_details` shows the parent layer still references the same nested source comp and its layer timing/keyframes/expressions were not changed when the target came from selection.
- Shared-source risk, parent layer retiming/start-time needs, recursive traversal, source duplication, source relinking, duration changes, footage interpretation changes, keyframe/expression shifts, exact native viewer behavior, and exact source JSX semantics are reported as typed-tool gaps.

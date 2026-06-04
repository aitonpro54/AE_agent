# Change Nested Composition Duration Typed Plan

## Goal

Изменить `duration` явно выбранной nested source composition через existing typed bridge tools.

## Applies When

- Пользователь просит change nested composition duration, nested comp duration, precomp source duration, or set the duration of a selected nested/precomp source.
- Допустима safe adaptation: update only the target nested source composition `duration` field with `set_comp_properties`, then read it back.
- Target nested composition is identified from current selected precomp layer evidence, or from an explicit comp item/name that is read before mutation.
- The requested duration is explicit, positive, finite, and can be represented in seconds without inferring timing from unrelated layers, markers, work area, or media duration.
- The user understands that changing a source composition can affect every layer that reuses that same source comp; ambiguous shared-source requests fail closed until explicit confirmation names the source comp.
- If the user needs layer in/out retiming, stretch changes, keyframe/expression shifts, recursive all-nested-comp changes, footage/source relinking, work-area changes, or exact source JSX behavior, fail closed and request a separate typed-tool contract.
- Задача не требует raw script execution, layer creation/deletion, source relinking, render queue changes, expression edits, keyframe edits, or broad template batch updates.

## Plan Pattern

1. Run `get_active_comp` to establish the parent comp identity.
2. Run `get_selected_layers` for selected-layer workflows and require exactly one selected precomp layer unless the user explicitly provides one concrete layer target.
3. Run `get_layer_details` for the parent layer and require `layer.source` evidence that identifies a composition source item. Fail closed if the selected layer has no comp source.
4. Run `get_comp_details` for the nested source composition by `compItemIndex` or exact `compName`, and record the current `duration`, width, height, frame rate, background color, layer count, work area, and source comp identity before mutation.
5. Normalize the requested `durationSeconds` to a positive finite number. Fail closed when the duration is missing, ambiguous, non-positive, depends on selected-layer span inference, or requires frame-rate conversion that would create off-frame timing.
6. Run `set_comp_properties` against only the verified nested source composition, passing only `duration`, `verifyAfter:true`, and a stable `idempotencyKeyTemplate`.
7. Run `get_comp_details` again for the same nested source composition and compare `duration` plus unchanged width, height, frame rate, background color, layer count, and source comp identity.
8. Run `get_layer_details` for the parent layer again when the parent layer was selected, confirming it still references the same source comp and its own in/out points, stretch, start time, source, order, effects, masks, expressions, and keyframes were not mutated.
9. Fail closed instead of using raw script execution when the request needs layer timing retargeting, recursive nested traversal, source duplication before mutation, content/keyframe shifts, work-area edits, or exact source JSX semantics.

## Safety Gates

- Mutating composition-property workflow.
- Requires validated Agent plan, dry-run, explicit confirmation, `allowMutations:true`, idempotency and post-mutation read-back.
- Use checkpoint or edit-session protection for confirmed live runs.
- Require current selected-layer or explicit comp evidence before binding the nested source composition.
- Mutate only the verified nested source composition `duration`; do not change width, height, frame rate, bgColor, work area, layer order, layer timing, layer sources, effects, masks, expressions, keyframes, render queue items, or parent comp state.
- Treat shared source comps as high-risk unless the user explicitly confirms that editing the shared nested comp is intended.
- Do not use this recipe for retiming layers to match the new source duration, stretching nested layers, recursive all-nested-comp updates, source relinking, keyframe/expression shifts, template batch changes, or raw script execution.

## Verification

- The plan reads the parent comp and selected or explicit parent layer before choosing the nested source comp.
- `get_layer_details` evidence identifies the target layer source comp itemIndex/name before any mutation.
- Pre-run `get_comp_details` records the nested source composition current `duration` and unchanged structural fields.
- The mutating step uses exactly one `set_comp_properties` call with only `duration` for the verified nested source composition.
- Post-run `get_comp_details` shows the requested duration on the same source comp and unchanged width, height, frame rate, background color, layer count, work area, and source comp identity.
- Post-run parent `get_layer_details` shows the parent layer still references the same nested source comp and its layer timing/keyframes/expressions were not changed when the target came from selection.
- Shared-source risk, layer retiming/stretch needs, recursive traversal, source duplication, source relinking, content/keyframe shifts, work-area changes, and exact source JSX semantics are reported as typed-tool gaps.

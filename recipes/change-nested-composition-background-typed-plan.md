# Change Nested Composition Background Typed Plan

## Goal

Изменить `bgColor` явно выбранной nested source composition через existing typed bridge tools.

## Applies When

- Пользователь просит change nested composition background, nested comp background color, precomp background, or source composition background color.
- Допустима safe adaptation: update only the target nested source composition `bgColor` field with `set_comp_properties`, then read it back.
- Target nested composition is identified from current selected precomp layer evidence, or from an explicit comp item/name that is read before mutation.
- The user understands that changing a source composition can affect every layer that reuses that same source comp; ambiguous shared-source requests fail closed until explicit confirmation names the source comp.
- If the user needs a visible rendered full-frame background layer, generated solid/shape background, source relinking, deep duplication before mutation, recursive all-nested-comp changes, or exact source JSX behavior, fail closed and request a separate typed-tool contract.
- Задача не требует raw script execution, layer creation/deletion, source relinking, render queue changes, expression edits, or broad template batch updates.

## Plan Pattern

1. Run `get_active_comp` to establish the parent comp identity.
2. Run `get_selected_layers` for selected-layer workflows and require exactly one selected precomp layer unless the user explicitly provides one concrete layer target.
3. Run `get_layer_details` for the parent layer and require `layer.source` evidence that identifies a composition source item. Fail closed if the selected layer has no comp source.
4. Run `get_comp_details` for the nested source composition by `compItemIndex` or exact `compName`, and record the current `bgColor`, dimensions, duration, frame rate, and layer count before mutation.
5. Normalize the requested `backgroundColor` to `bgColor:[r,g,b]` values between 0 and 1. Fail closed when the color is missing, ambiguous, out of range, or depends on sampling existing artwork.
6. Run `set_comp_properties` against only the verified nested source composition, passing only `bgColor`, `verifyAfter:true`, and a stable `idempotencyKeyTemplate`.
7. Run `get_comp_details` again for the same nested source composition and compare `bgColor` plus unchanged width, height, duration, frame rate, and layer count.
8. Run `get_layer_details` for the parent layer again when the parent layer was selected, confirming it still references the same source comp and was not renamed, relinked, reordered, or otherwise mutated.
9. Fail closed instead of using raw script execution when the request needs recursive nested traversal, source duplication before color change, a rendered background layer, native viewer display behavior, or exact source JSX semantics.

## Safety Gates

- Mutating composition-property workflow.
- Requires validated Agent plan, dry-run, explicit confirmation, `allowMutations:true`, idempotency and post-mutation read-back.
- Use checkpoint or edit-session protection for confirmed live runs.
- Require current selected-layer or explicit comp evidence before binding the nested source composition.
- Mutate only the verified nested source composition `bgColor`; do not change width, height, duration, frame rate, layer order, layer sources, effects, masks, expressions, render queue items, or parent comp state.
- Treat shared source comps as high-risk unless the user explicitly confirms that editing the shared nested comp is intended.
- Do not use this recipe for generated visible background layers, deep precomp duplication, recursive all-nested-comp updates, source relinking, layer cleanup, template batch changes, or raw script execution.

## Verification

- The plan reads the parent comp and selected or explicit parent layer before choosing the nested source comp.
- `get_layer_details` evidence identifies the target layer source comp itemIndex/name before any mutation.
- Pre-run `get_comp_details` records the nested source composition current `bgColor` and unchanged structural fields.
- The mutating step uses exactly one `set_comp_properties` call with only `bgColor` for the verified nested source composition.
- Post-run `get_comp_details` shows the requested `bgColor` on the same source comp and unchanged width, height, duration, frame rate, and layer count.
- Post-run parent `get_layer_details` shows the parent layer still references the same nested source comp when the target came from selection.
- Shared-source risk, visible full-frame rendered background needs, recursive traversal, source duplication, source relinking, and exact source JSX semantics are reported as typed-tool gaps.

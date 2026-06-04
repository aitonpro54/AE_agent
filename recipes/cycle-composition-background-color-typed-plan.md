# Cycle Composition Background Color Typed Plan

## Goal

Изменить active composition `bgColor` на следующий reviewed color step через existing typed bridge tools.

## Applies When

- Пользователь просит cycle composition background color, cycle active comp background, rotate comp background color, or advance the comp background through a grayscale cycle.
- Допустима safe adaptation: read the active comp, compute or choose a reviewed `nextBgColor`, update only the active composition `bgColor` field with `set_comp_properties`, then read it back.
- The target is the current active composition or one explicit comp target that is read before mutation.
- The plan can use a simple reviewed palette or grayscale cycle only when the current `bgColor`, cycle order and computed `nextBgColor` are shown before confirmation.
- If the user needs a visible rendered background layer, generated solid/shape background, source-exact hidden palette behavior, project-wide comp traversal, template batch updates, or exact source JSX behavior, fail closed and request a separate typed-tool contract.
- Задача не требует raw script execution, layer creation/deletion, source relinking, render queue changes, expression edits, or broad project mutation.

## Plan Pattern

1. Run `get_active_comp` to establish the active composition identity and current comp context.
2. Run `get_comp_details` for the same active composition and record current `bgColor`, width, height, duration, frame rate, layer count and work area before mutation.
3. Resolve the cycle mode from user intent or a narrow reviewed default, such as `reviewedPaletteStep` or `grayscaleCycleStep`.
4. Compute and display `currentBgColor`, `cycleMode`, `cyclePalette` when used, and `nextBgColor`. Fail closed when the current color is missing, the next color is ambiguous, values are out of the 0 to 1 range, or exact source palette semantics are required.
5. Run one `set_comp_properties` call against only the verified active composition, passing only `bgColor:nextBgColor`, `verifyAfter:true`, and a stable `idempotencyKeyTemplate`.
6. Run `get_comp_details` again for the same composition and compare `bgColor` plus unchanged width, height, duration, frame rate, layer count and work area.
7. Fail closed instead of using raw script execution when the request needs rendered background layers, source-exact grayscale cycling, all-composition traversal, template batch changes, native viewer display behavior, or exact source JSX semantics.

## Safety Gates

- Mutating composition-property workflow.
- Requires validated Agent plan, dry-run, explicit confirmation, `allowMutations:true`, idempotency and post-mutation read-back.
- Use checkpoint or edit-session protection for confirmed live runs.
- Require current active-comp evidence before binding the target composition.
- Mutate only the verified active composition `bgColor`; do not change width, height, duration, frame rate, work area, layer order, layer timing, layer sources, effects, masks, expressions, render queue items, or project item names.
- Treat palette/cycle inference as unsafe unless the computed `nextBgColor` is shown before confirmation.
- Do not use this recipe for generated visible background layers, project-wide comp updates, nested source comp updates, template batch changes, layer cleanup, or raw script execution.

## Verification

- The plan reads the active composition before choosing the target comp.
- Pre-run `get_comp_details` records the active composition current `bgColor` and unchanged structural fields.
- Dry-run evidence lists `currentBgColor`, `cycleMode` and requested `nextBgColor`.
- The mutating step uses exactly one `set_comp_properties` call with only `bgColor` for the verified active composition.
- Post-run `get_comp_details` shows the requested next `bgColor` on the same active comp and unchanged width, height, duration, frame rate, layer count and work area.
- The plan reports visible rendered background layer needs, source-exact grayscale cycling, project-wide traversal, nested source-comp updates, template batch changes and exact source JSX semantics as typed-tool gaps.

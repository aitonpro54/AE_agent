# tool-utilities-milliseconds-to-frames Intake Note

## Source

- Repository: `https://github.com/kyletmartinez/after-effects-scripts`
- Source path: `Utilities/Milliseconds_To_Frames.jsx`
- License: review required by the parent importer before any source-derived promotion.

## Adaptation

This intake adapts only the milliseconds-to-frames calculation intent into `recipes/milliseconds-to-frames-typed-plan.md`. No raw JSX is copied into the product.

The safe supported path is a read-only utility recipe: bind a finite millisecond value and a finite frame rate, optionally read the active composition frame rate through `get_active_comp`, compute `frames = milliseconds * frameRate / 1000`, and disclose the reviewed rounding policy before reporting the result.

## Fail-Closed Scope

- Exact source `Milliseconds_To_Frames.jsx` UI behavior is not reproduced.
- Drop-frame timecode, feet+frames, frame numbering offsets, comp start-frame offsets, display-start-time offsets, keyframe edits, layer timing edits, comp frame-rate mutation, render queue changes, raw ExtendScript, and exact source semantics require separate typed-tool contracts.
- The detached child worktree did not contain the source JSX, so this recipe keeps the imported behavior limited to the candidate name, wrapper scope, existing read-only comp evidence, and fail-closed milliseconds-to-frames arithmetic.

## Validation

- Not run in this child batch by design.
- Parent importer owns registry validation, solution-library validation, semantic verification, and any future live acceptance lane.

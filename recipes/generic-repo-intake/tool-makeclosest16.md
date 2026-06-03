# tool-makeclosest16 Intake Note

## Source

- Repository: `https://github.com/ae-scripting/scripting-snippets`
- Source path: `makeClosest16.jsx`
- License: CC-BY-3.0 attribution required, recorded by the auto-intake ledger.

## Adaptation

This intake adapts only the nearest-16 position-snapping idea into `recipes/makeclosest16-typed-plan.md`. No raw JSX is copied into the product.

The safe supported path is a typed transform adaptation: inspect selected or explicit layer positions, compute the nearest 16-pixel grid coordinate for each numeric position component, move only those verified layers with `set_layer_transform`, and read the affected layers back.

## Fail-Closed Scope

- Exact source `makeClosest16.jsx` behavior is not reproduced.
- Anchor-point snapping, bounds-center snapping, source-exact rounding rules, parent/world-space conversion, separated-dimension traversal, shape/path/mask point edits, comp resizing, expression edits, keyframe edits, selection changes, raw ExtendScript, and broad project scans require separate typed-tool contracts.
- The detached child worktree did not contain the source JSX, so this recipe keeps the imported behavior limited to the candidate name, wrapper scope, existing typed transform tools, and fail-closed nearest-16 position semantics.

## Validation

- Not run in this child batch by design.
- Parent importer owns registry validation, solution-library validation, and any live acceptance lane.

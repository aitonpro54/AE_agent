# tool-newtrimmednull Intake Note

## Source

- Repository: `https://github.com/ae-scripting/scripting-snippets`
- Source path: `newTrimmedNull.jsx`
- License: CC-BY-SA attribution required, recorded by the auto-intake ledger.

## Adaptation

This intake adapts only the high-level `newTrimmedNull` request shape into
`recipes/newtrimmednull-typed-plan.md`. No raw JSX is copied into the product.
Parent review confirmed the source creates one null, places it before the top
selected layer, copies that layer's `startTime`, `inPoint`, `outPoint`, and
label, then parents the selected layers to the new null.

The current safe path is advisory and fail-closed. The detached child worktree
does not contain `newTrimmedNull.jsx`, and the current solution registry does
not expose an accepted typed tool for creating a real null layer or setting a
new layer's exact trimmed timing range. Existing typed evidence can inspect the
active comp and selected layer timing with `get_active_comp`,
`get_selected_layers`, and optional `get_layer_details`.

## Fail-Closed Scope

- Source JSX is not copied or executed.
- Null-layer creation, new layer naming, in/out trimming, start-time setting,
  label assignment, parent/selection side effects, layer ordering,
  source-exact native UI behavior, raw ExtendScript, and native undo behavior
  are not reproduced.
- A real `newTrimmedNull` operation requires a separate reviewed typed-tool
  contract for generated null-layer creation, top-layer timing/label
  assignment, layer ordering, and selected-layer parenting, with pre-run
  selected-layer evidence, explicit generated-layer naming, idempotency,
  checkpoint or edit-session protection, and post-mutation read-back.
- The detached child worktree did not contain `newTrimmedNull.jsx`, so this
  recipe keeps the imported behavior limited to the candidate name, wrapper
  scope, existing read-only selected-layer timing evidence tools, and
  fail-closed null-layer/timing semantics.

## Validation

- Not run in this child batch by design.
- Parent importer owns registry validation, solution-library validation,
  semantic verification, and any future live acceptance lane.

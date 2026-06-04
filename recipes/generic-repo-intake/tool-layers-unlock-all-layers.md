# tool-layers-unlock-all-layers Intake Note

## Source

- Repository: `https://github.com/ae-scripting/scripting-snippets`
- Source path: `Layers/Unlock_All_Layers.jsx`
- License: CC-BY-SA attribution required, recorded by the auto-intake ledger.

## Adaptation

This intake adapts only the active-composition intent to unlock all layers into
`recipes/unlock-all-layers-typed-plan.md`. No raw JSX is copied into the
product.

The current safe path is read-only and fail-closed. Existing typed bridge tools
can inspect the active comp and layer evidence, but the accepted tool catalog in
this child batch does not expose a narrow writer for setting the `Layer.locked`
field on every layer with read-back.

## Fail-Closed Scope

- Source JSX is not copied or executed.
- Actual layer unlock mutation, native undo behavior, selection side effects,
  hidden layer-order behavior, shy/guide/solo switches, label changes, timing
  edits, expressions, properties, and exact source semantics are not
  reproduced.
- A real mutating unlock-all-layers workflow requires a separate reviewed typed
  tool contract for setting and reading back `Layer.locked`, with active-comp
  layer evidence, explicit target count, idempotency, checkpoint or edit-session
  protection, dry-run/confirmation gates, and post-mutation read-back.
- The detached child worktree did not contain `Layers/Unlock_All_Layers.jsx`,
  so this recipe keeps the imported behavior limited to the child-run wrapper,
  candidate name, existing active-comp layer evidence tools, and fail-closed
  layer-lock semantics.

## Validation

- Not run in this child batch by design.
- Parent importer owns registry validation, solution-library validation,
  semantic verification, and any future live acceptance lane.

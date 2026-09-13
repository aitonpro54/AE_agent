# tool-layers-add-comment-to-selected-layers Intake Note

## Source

- Repository: `https://github.com/ae-scripting/scripting-snippets`
- Source path: `Layers/Add_Comment_To_Selected_Layers.jsx`
- License: CC-BY-SA attribution required, recorded by the auto-intake ledger.

## Adaptation

This intake adapts only the selected-layer `Layer.comment` request shape into
`recipes/add-comment-to-selected-layers-typed-plan.md`. No raw JSX is copied
into the product.

The current safe path is read-only and fail-closed. Existing typed bridge tools
can inspect the active comp, selected layers, and available layer details, but
the accepted tool catalog in this child batch does not expose a narrow writer
for setting the `Layer.comment` field on selected layers.

## Fail-Closed Scope

- Source JSX is not copied or executed.
- Actual layer comment writing, prompt-dialog behavior, native undo behavior,
  selection side effects, hidden selection-order behavior, marker comments,
  layer renaming, label changes, expressions, and exact source semantics are
  not reproduced.
- A real mutating layer-comment workflow requires a separate reviewed typed
  tool contract for setting and reading back `Layer.comment`, with current
  selected-layer evidence, explicit reviewed comment text, idempotency,
  checkpoint or edit-session protection, dry-run/confirmation gates, and
  post-mutation read-back.
- The detached child worktree did not contain
  `Layers/Add_Comment_To_Selected_Layers.jsx`, so this recipe keeps the
  imported behavior limited to the child-run wrapper, candidate name, existing
  selected-layer typed evidence tools, and fail-closed layer-comment semantics.

## Validation

- Not run in this child batch by design.
- Parent importer owns registry validation, solution-library validation,
  semantic verification, and any future live acceptance lane.

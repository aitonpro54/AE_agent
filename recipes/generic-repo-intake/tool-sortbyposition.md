# tool-sortbyposition Intake Note

## Source

- Repository: `https://github.com/ae-scripting/scripting-snippets`
- Source path: `sortByPosition.jsx`
- License: CC-BY-3.0 attribution required, recorded by the auto-intake ledger.

## Adaptation

This intake adapts only the selected-layer position sorting idea into
`recipes/sortbyposition-typed-plan.md`. No raw JSX is copied into the product.

The current safe path is advisory and fail-closed. Existing typed evidence can
inspect the active comp, selected layers, and layer transform Position values
with `get_active_comp`, `get_selected_layers`, and optional
`get_layer_details`, but this detached child-run worktree does not expose an
accepted mutating typed tool for changing layer stack order.

## Fail-Closed Scope

- Source JSX is not copied or executed.
- Source-exact sort comparator, selection order side effects, layer stack
  reordering, parent/child ordering repair, locked or shy layer handling,
  native UI state changes, raw ExtendScript, and native undo behavior are not
  reproduced.
- A real sort operation requires a separate typed-tool contract, such as a
  reviewed `reorder_layers`-style tool with pre-run layer identity and position
  evidence, explicit comparator policy, idempotency, and post-mutation
  read-back.
- The detached child worktree did not contain `sortByPosition.jsx`, so this
  recipe keeps the imported behavior limited to the candidate name, wrapper
  scope, existing read-only layer position evidence tools, and fail-closed
  layer-order semantics.

## Validation

- Not run in this child batch by design.
- Parent importer owns registry validation, solution-library validation,
  semantic verification, and any future live acceptance lane.

# tool-trimfirsttosecond Intake Note

## Source

- Repository: `https://github.com/ae-scripting/scripting-snippets`
- Source path: `trimFirstToSecond.jsx`
- License: CC-BY-3.0 attribution required, recorded by the auto-intake ledger.

## Adaptation

This intake adapts only the timing-intent idea into
`recipes/trimfirsttosecond-typed-plan.md`. No raw JSX is copied into the
product.

The current safe path is advisory and fail-closed. Existing typed evidence can
inspect the active comp and selected layer timing with `get_active_comp`,
`get_selected_layers`, and optional `get_layer_details`, but this detached
child-run worktree does not expose an accepted mutating typed tool for changing
layer `inPoint`, `outPoint`, or `startTime`.

## Fail-Closed Scope

- Source JSX is not copied or executed.
- Source-exact selection order, first/second layer interpretation, UI side
  effects, layer timing mutation, splitting, ripple edits, keyframe shifts,
  time-remapping, stretch changes, source changes, raw ExtendScript, and native
  undo behavior are not reproduced.
- A real trim operation requires a separate typed-tool contract, such as a
  reviewed `set_layer_time_range`-style tool with pre-run layer timing
  evidence, explicit target boundary, idempotency, and post-mutation read-back.
- The detached child worktree did not contain `trimFirstToSecond.jsx`, so this
  recipe keeps the imported behavior limited to the candidate name, wrapper
  scope, existing read-only layer timing evidence tools, and fail-closed trim
  semantics.

## Validation

- Not run in this child batch by design.
- Parent importer owns registry validation, solution-library validation,
  semantic verification, and any future live acceptance lane.

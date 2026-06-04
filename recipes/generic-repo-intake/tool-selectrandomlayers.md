# tool-selectrandomlayers Intake Note

## Source

- Repository: `https://github.com/ae-scripting/scripting-snippets`
- Source path: `selectRandomLayers.jsx`
- License: CC-BY-3.0 attribution required, recorded by the auto-intake ledger.

## Adaptation

This intake adapts only the random layer-selection idea into `recipes/selectrandomlayers-typed-plan.md`. No raw JSX is copied into the product.

The safe supported path is a typed selection-state mutation. It reads the active composition and complete enough layer inventory, binds a reviewed `randomSelectionPolicy`, computes concrete one-based `randomLayerIndices` before mutation, calls `set_layer_selection` with replacement semantics, and verifies the result with `get_selected_layers`.

This recipe intentionally mirrors the already accepted safe random-selection pattern while recording the ae-scripting `selectRandomLayers.jsx` candidate as its own importer-scoped advisory recipe.

## Fail-Closed Scope

- Source-exact `selectRandomLayers.jsx` behavior, native UI randomness, persistent random seeds, hidden layer state, Project panel selection, cross-comp selection, and exact native side effects are not reproduced.
- Randomness must not run inside the mutating tool step; all target layer indices must be concrete and reviewable before `set_layer_selection`.
- Layer creation, deletion, duplication, renaming, reordering, timing/source/effect/keyframe/mask changes, render queue edits, and project item mutation are outside this recipe.
- The detached child worktree did not contain the source JSX, so this recipe keeps the imported behavior limited to the candidate name, wrapper scope, existing typed selection tools, and fail-closed random-selection semantics.

## Validation

- Not run in this child batch by design.
- Parent importer owns registry validation, solution-library validation, and any live acceptance lane.

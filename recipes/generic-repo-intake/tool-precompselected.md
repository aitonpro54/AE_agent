# tool-precompselected Intake Note

## Source

- Repository: `https://github.com/ae-scripting/scripting-snippets`
- Source path: `precompSelected.jsx`
- License: CC-BY-3.0 attribution required, recorded by the auto-intake ledger.

## Adaptation

This intake adapts only the selected-layer precompose workflow idea into
`recipes/precompselected-typed-plan.md`. No raw JSX is copied into the product.
Parent review confirmed the source batch-precomposes selected layers into
separate comps, using one selected layer per precompose operation.

The safe supported path uses existing typed bridge tools to inspect the active
composition and selected layers, require reviewed per-layer precomp names, run
one `precompose_layers` call per concrete selected layer, and read back the
parent composition plus created precomp evidence.

## Fail-Closed Scope

- Exact source `precompSelected.jsx` behavior is not reproduced.
- Native Pre-compose dialog behavior, automatic naming, source-exact attribute
  transfer, Project panel parent-folder movement, project-panel selected-item
  discovery, recursive nested-precomp operations, source relinking, layer
  cleanup, render queue changes, raw ExtendScript, and unrelated layer/property
  mutation require separate typed-tool contracts.
- The detached child worktree did not contain the source JSX, so this recipe
  keeps the imported behavior limited to the candidate name, wrapper scope,
  existing `precompose_layers` typed-tool coverage, and fail-closed
  selected-layer precompose semantics.

## Validation

- Not run in this child batch by design.
- Parent importer owns registry validation, solution-library validation,
  semantic verification, and any live acceptance lane.

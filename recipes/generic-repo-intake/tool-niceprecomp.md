# tool-niceprecomp Intake Note

## Source

- Repository: `https://github.com/ae-scripting/scripting-snippets`
- Source path: `nicePrecomp.jsx`
- License: CC-BY-3.0 attribution required, recorded by the auto-intake ledger.

## Adaptation

This intake adapts only the selected-layer precompose workflow idea into `recipes/niceprecomp-typed-plan.md`. No raw JSX is copied into the product.

The safe supported path uses existing typed bridge tools to inspect the active comp and current selected layers, require a reviewed new precomp name, run `precompose_layers` on concrete layer indices, and read back the parent comp and created precomp evidence.

## Fail-Closed Scope

- Exact source `nicePrecomp.jsx` behavior is not reproduced.
- Native Pre-compose dialog behavior, automatic naming heuristics, source-exact attribute-transfer semantics, project-panel selection discovery, recursive nested-precomp edits, source relinking, layer cleanup, render queue changes, raw ExtendScript, and unrelated layer/property mutation require separate typed-tool contracts.
- The detached child worktree did not contain the source JSX, so this recipe keeps the imported behavior limited to the candidate name, wrapper scope, existing `precompose_layers` typed-tool coverage, and fail-closed selected-layer precompose semantics.

## Validation

- Not run in this child batch by design.
- Parent importer owns registry validation, solution-library validation, and any live acceptance lane.

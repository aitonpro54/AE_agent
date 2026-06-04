# tool-utilities-alert-selected-layer-index Intake Note

## Source

- Repository: `https://github.com/kyletmartinez/after-effects-scripts`
- Source path: `Utilities/Alert_Selected_Layer_Index.jsx`
- Candidate id: `tool-utilities-alert-selected-layer-index`
- License: review required by the parent importer before any source-derived
  promotion.

## Adaptation

This intake adapts only the selected-layer-index reporting intent into
`recipes/alert-selected-layer-index-typed-plan.md`. No raw JSX is copied into
the product.

The safe supported path is a read-only utility recipe: inspect the active comp,
read the current selected layer snapshot with `get_selected_layers`, report the
first selected `layerIndex` plus selected layer count and name, and optionally
read `get_layer_details` for that exact index when more detail is needed.

## Fail-Closed Scope

- Exact source UI `alert()` behavior is not reproduced.
- Silent native try/catch behavior, modal alert timing, ScriptUI behavior, raw
  ExtendScript execution, guessed fallback layer selection, changing selection,
  layer mutation, timing edits, render queue changes, source relinking, and
  project-file changes require separate reviewed contracts.
- Empty selection is reported as empty selection rather than triggering raw
  script fallback or inferred layer choice.

## Validation

- Parent-owned recovery added the recipe, registry entry, and solution-library
  smoke assertions after the importer child run completed with no file changes
  because its sandbox could not launch commands in the detached worktree.
- Parent validation owns registry validation, solution-library validation,
  semantic verification where relevant, and the final reviewable commit.

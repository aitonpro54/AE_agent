# tool-debughelper Intake Note

## Source

- Repository: `https://github.com/ae-scripting/scripting-snippets`
- Source path: `debughelper.jsx`
- License: CC-BY-3.0 attribution required, recorded by the auto-intake ledger.

## Adaptation

This intake adapts only the diagnostic workflow idea into `recipes/debughelper-typed-plan.md`. No raw JSX is copied into the product.

The safe supported path is read-only. It uses `get_active_comp`, `get_selected_layers`, `get_selected_properties`, and optional `get_layer_details` to report current active-comp, selected-layer, selected-property, property-path, value, keyframe, and expression evidence returned by typed bridge tools.

## Fail-Closed Scope

- Source-exact `debughelper.jsx` UI output is not reproduced.
- Hidden property traversal, broad project scans, console logging side effects, persistent debug layers/text/markers, raw ExtendScript, and mutation of layers/properties/expressions/keyframes require separate typed-tool contracts.
- The detached child worktree did not contain the source JSX, so this recipe keeps the imported behavior limited to the candidate name, wrapper scope, existing read-only typed tools, and fail-closed generic diagnostic semantics.

## Validation

- Not run in this child batch by design.
- Parent importer owns registry validation, solution-library validation, and any live acceptance lane.

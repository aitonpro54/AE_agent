# tool-getpropertyparent Intake Note

## Source

- Repository: `https://github.com/ae-scripting/scripting-snippets`
- Source path: `getPropertyParent.jsx`
- License: CC-BY-3.0 attribution required, recorded by the auto-intake ledger.

## Adaptation

This intake adapts only the selected-property parent inspection idea into `recipes/getpropertyparent-typed-plan.md`. No raw JSX is copied into the product.

The safe supported path is read-only. It uses `get_active_comp`, `get_selected_layers`, `get_selected_properties`, and optional `get_layer_details` to report selected property path evidence and the immediate parent property group only when that parent can be derived from typed-tool evidence already returned by the bridge.

## Fail-Closed Scope

- Exact source `getPropertyParent.jsx` `parentProperty` object traversal is not reproduced.
- Hidden property traversal, source-exact parent object fields, broad project scans, raw ExtendScript, selection changes, property edits, expression edits, keyframe edits, and any layer/property mutation require separate typed-tool contracts.
- The detached child worktree did not contain the source JSX, so this recipe keeps the imported behavior limited to the candidate name, wrapper scope, existing typed read tools, and fail-closed selected-property inspection semantics.

## Validation

- Not run in this child batch by design.
- Parent importer owns registry validation, solution-library validation, and any live acceptance lane.

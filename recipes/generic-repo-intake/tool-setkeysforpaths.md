# tool-setkeysforpaths Intake Note

## Source

- Repository: `https://github.com/ae-scripting/scripting-snippets`
- Source path: `setKeysForPaths.jsx`
- License: CC-BY-3.0 attribution required, recorded by the auto-intake ledger.

## Adaptation

This intake adapts only the property-path keyframe setting idea into `recipes/setkeysforpaths-typed-plan.md`. No raw JSX is copied into the product.

The safe supported path is mutating but narrow. It uses `get_active_comp`, `get_selected_properties`, optional `get_layer_details`, and `set_property_keyframes` to write reviewed keyframe payloads only to explicit evidence-backed property paths. The plan must disclose the target comp, layer index, exact property path, previous keyframe/expression state, `clearExisting` choice, and the complete keyframe values before confirmation.

## Fail-Closed Scope

- Source-exact `setKeysForPaths.jsx` traversal, automatic selected-path discovery, hidden property walking, path geometry construction, mask/shape path vertex edits, broad selected-property batch mutation, raw ExtendScript, and selection side effects are not reproduced.
- Unsupported value shapes, expression-driven sampling, interpolation/ease preservation, spatial tangent preservation, destructive key removal beyond a reviewed full rewrite, and property targets without current typed evidence require separate typed-tool contracts.
- The detached child worktree did not contain the source JSX, so this recipe keeps the imported behavior limited to the candidate name, wrapper scope, existing `set_property_keyframes` typed tool, and fail-closed property-path keyframe semantics.

## Validation

- Not run in this child batch by design.
- Parent importer owns registry validation, solution-library validation, semantic verification, and any live acceptance lane.

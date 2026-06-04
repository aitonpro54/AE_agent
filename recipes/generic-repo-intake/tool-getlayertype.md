# tool-getlayertype Intake Note

## Source

- Repository: `https://github.com/ae-scripting/scripting-snippets`
- Source path: `getLayerType.jsx`
- License: CC-BY-3.0 attribution required, recorded by the auto-intake ledger.

## Adaptation

This intake adapts only the layer-type inspection idea into `recipes/getlayertype-typed-plan.md`. No raw JSX is copied into the product.

The safe supported path is read-only. It uses `get_active_comp`, `get_selected_layers`, `get_comp_details`, and optional `get_layer_details` to report layer type evidence already exposed by typed bridge tools, such as text, shape, camera, light, null, adjustment, guide, source/precomp, and available layer-kind fields.

## Fail-Closed Scope

- Exact source `getLayerType.jsx` class-test behavior is not reproduced.
- Hidden AE class traversal, source-exact type strings, broad project scans, raw ExtendScript, layer conversion, selection changes, and any layer/property mutation require separate typed-tool contracts.
- The detached child worktree did not contain the source JSX, so this recipe keeps the imported behavior limited to the candidate name, wrapper scope, existing typed read tools, and fail-closed layer-inspection semantics.

## Validation

- Not run in this child batch by design.
- Parent importer owns registry validation, solution-library validation, and any live acceptance lane.

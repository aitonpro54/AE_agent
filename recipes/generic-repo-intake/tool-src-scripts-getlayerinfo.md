# Generic Repo Intake: tool-src-scripts-getlayerinfo

- Candidate: `tool-src-scripts-getlayerinfo`
- Source: `src/scripts/getLayerInfo.jsx`
- Safe recipe: `recipes/getlayerinfo-typed-plan.md`

This intake adapts only the layer-information inspection idea into a read-only typed-plan recipe. No raw JSX is copied into the product.

The safe supported path uses `get_active_comp`, `get_selected_layers`, `get_comp_details`, and `get_layer_details` to report layer details already exposed by typed bridge tools: layer identity, type, timing, source context, switches, markers, effects, masks, transform/property summaries, expressions, and explicit unavailable fields.

## Fail-Closed Scope

- Exact source `getLayerInfo.jsx` formatting and hidden AE layer object traversal are not reproduced.
- Broad project scans, raw script execution, selection changes, layer/property/effect/keyframe/expression mutation, source relinking, render queue changes, and user-asset mutation require separate typed-tool contracts.
- The detached child worktree did not contain the source JSX, so this recipe keeps the imported behavior limited to the candidate name, wrapper scope, existing typed read tools, and fail-closed layer-inspection semantics.

## Validation

- Not run in this child batch by design.
- Parent importer owns registry validation, solution-library validation, and any live acceptance lane.

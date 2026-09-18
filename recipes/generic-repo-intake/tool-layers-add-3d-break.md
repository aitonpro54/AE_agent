# tool-layers-add-3d-break Intake Note

## Source

- Repository: `https://github.com/reviewed external AE script collection`
- Source path: `Layers/Add_3D_Break.jsx`
- Source SHA-256: `2dbffa553ae21ac458bf7b0cc845e9a65ed088a87a701c00117e22992988806c`

## Adaptation

This intake adapts only the safe generated adjustment-layer placement intent into `recipes/add-3d-break-typed-plan.md`. No raw JSX is copied into the product.

The supported path creates one generated adjustment layer through `create_adjustment_layer` with `insertBeforeLayerIndex` and `expectedBeforeLayerName`, then reads back the generated adjustment layer and guarded layer to prove immediate stack placement.

## Fail-Closed Scope

- Source-exact broad selected-layer traversal remains out of scope.
- Generic layer stack reordering remains out of scope; only the newly created generated adjustment layer may be placed before the guarded layer.
- Existing layer reorder, rename, relink, timing, parent, track matte, selection, effect/property, expression, keyframe, mask, source, render queue, project item, file, preference, UI state, and non-generated user-asset mutations remain fail-closed.
- Raw ExtendScript and source-checkout execution remain forbidden.

## Validation

- Parent-owned non-live validation covers the bridge contract, semantic verification, scenario fixture/report smoke, solution registry/retrieval, and Full Intaker retry.
- Generated-only live proof uses `node scripts/cep-panel-cdp-smoke.js full-ui-agent-adjustment-layer-placement-openai-cli-smoke` after read-only CEP readiness.

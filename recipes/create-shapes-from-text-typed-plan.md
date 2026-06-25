# Create Shapes From Text Typed Plan

## Intent

Convert one explicit generated text layer into AE native shape outlines using
`create_shapes_from_text`, then verify the generated shape layer with
`get_layer_details`.

## Required Evidence

- Current `get_layer_details` or `get_comp_details` evidence identifies one
  generated text layer with `textLayer:true`, `layerKind:"text"`, or equivalent
  Source Text read-back.
- The planner binds concrete `compName` or `compItemIndex`, `layerIndex`,
  `expectedLayerName`, and `expectedSourceText` before mutation.
- The requested generated outline name is provided as `shapeLayerName`.

## Typed Steps

1. Inspect the target generated text layer with `get_layer_details`, including
   Source Text read-back when available.
2. Run `create_shapes_from_text` once with the explicit layer index,
   `expectedLayerName`, `expectedSourceText`, and generated `shapeLayerName`.
3. Read the generated outline layer with `get_layer_details` and verify
   `shapeLayer:true` or `matchName:"ADBE Vector Layer"` plus vector outline
   group evidence.

## Safety Gates

- Mutating execution requires normal Agent plan validation, explicit
  confirmation, checkpoint/edit-session protection, idempotency defaults, and
  post-mutation read-back.
- The typed tool uses AE's native `Create Shapes from Text` command and fails
  closed when that localized menu command is unavailable.
- Keep source-exact broad selected-layer traversal, arbitrary user text-layer
  conversion, font-outline fidelity beyond AE native output, selection
  persistence, non-generated user assets, file I/O, render queue work, and raw
  JSX fail-closed.

## Verification

Expected evidence after a successful generated-only proof:

- `create_shapes_from_text.postVerification.ok:true`;
- generated outline layer reports `shapeLayer:true`, `layerKind:"shape"`, or
  `matchName:"ADBE Vector Layer"`;
- outline `vectorGroupCount > 0`;
- source text/name guards matched before conversion;
- final `get_layer_details` read-back matches the generated outline layer.

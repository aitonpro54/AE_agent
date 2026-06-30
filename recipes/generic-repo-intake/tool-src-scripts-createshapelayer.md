# Generic Repo Intake: tool-src-scripts-createshapelayer

- Candidate: `tool-src-scripts-createshapelayer`
- Source: `src/scripts/createShapeLayer.jsx`
- Safe typed tool: `create_shape_layer`

This intake records the safe rectangle and ellipse slice of the source behavior
as already covered by the existing `create_shape_layer` bridge contract. No raw
JSX is copied into the product, and no new bridge contract is added.

The safe supported path maps source `shapeType:"rectangle"` and
`shapeType:"ellipse"` to typed `shape:"rectangle"` and `shape:"ellipse"`, with
explicit `name`, `size`, `position`, `fillColor`, optional `strokeColor`,
optional `strokeWidth`, `startTime`, and `duration` arguments. Plans must read
the generated layer back with `get_layer_details` or `get_comp_details` before
claiming success.

Use explicit arguments when source-like defaults matter. The source defaults a
200x200 red shape at `[960, 540]` for five seconds, while the typed tool uses
current composition dimensions and bridge defaults unless the plan supplies the
values directly.

## Fail-Closed Scope

- `shapeType:"polygon"` and `shapeType:"star"` are not supported by current
  `create_shape_layer`. Their `points`, Star Type, Outer Radius, and Inner
  Radius semantics require a separate typed-tool contract, generated-only
  fixture, read-back, cleanup/checkpoint policy, and semantic verification.
- The source temp args file wrapper, raw ExtendScript execution path, filesystem
  temp behavior, and JSON output formatting are not reproduced.
- Source-exact hidden native shape defaults, direct shape property traversal,
  arbitrary vector path creation, shape group mutation, and broad project scans
  require separate typed-tool contracts.
- The supported path requires normal Agent plan validation, mutation
  confirmation, idempotency, checkpoint or edit-session protection, and
  post-mutation read-back before any live run.

## Validation

- Existing bridge contract: `create_shape_layer`.
- Existing solution-library smoke already validates `create_shape_layer`
  retrieval through generated shape-layer guide/background recipes.
- Parent closeout owns repo rule checks and Full Intake ledger validation.

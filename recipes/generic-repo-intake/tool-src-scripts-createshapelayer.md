# Generic Repo Intake: tool-src-scripts-createshapelayer

- Candidate: `tool-src-scripts-createshapelayer`
- Source: `src/scripts/createShapeLayer.jsx`
- Safe typed tool: `create_shape_layer`

This intake records the safe generated shape-layer slice of the source behavior
as covered by the `create_shape_layer` bridge contract. No raw JSX is copied
into the product.

The safe supported path maps source `shapeType:"rectangle"` and
`shapeType:"ellipse"` to typed `shape:"rectangle"` and `shape:"ellipse"`, with
explicit `name`, `size`, `position`, `fillColor`, optional `strokeColor`,
optional `strokeWidth`, `startTime`, and `duration` arguments. Plans must read
the generated layer back with `get_layer_details` or `get_comp_details` before
claiming success.

The bounded polygon/star path maps source `shapeType:"polygon"` and
`shapeType:"star"` to typed `shape:"polygon"` and `shape:"star"`, with explicit
integer `points` from 3 to 64, positive `outerRadius`, and, for stars, positive
`innerRadius` lower than `outerRadius`. Plans must read the generated layer back
and verify `shapeContents.type`, `shapeContents.starType`,
`shapeContents.points`, `shapeContents.outerRadius`, and
`shapeContents.innerRadius` when applicable.

Use explicit arguments when source-like defaults matter. The source defaults a
200x200 red shape at `[960, 540]` for five seconds, while the typed tool uses
current composition dimensions and bridge defaults unless the plan supplies the
values directly.

## Fail-Closed Scope

- Rectangle/ellipse `size` is not accepted for polygon/star; use explicit
  polygon/star radii instead.
- Polygon does not accept `innerRadius`; star requires `innerRadius` lower than
  `outerRadius`.
- The source temp args file wrapper, raw ExtendScript execution path, filesystem
  temp behavior, and JSON output formatting are not reproduced.
- Source-exact hidden native shape defaults, direct shape property traversal,
  arbitrary vector path creation, roundness, trim paths, repeaters, expressions,
  shape group mutation, and broad project scans require separate typed-tool
  contracts.
- The supported path requires normal Agent plan validation, mutation
  confirmation, idempotency, checkpoint or edit-session protection, and
  post-mutation read-back before any live run.

## Validation

- Bridge contract: `create_shape_layer`, including bounded polygon/star
  `points`, `outerRadius`, `innerRadius`, and compact `shapeContents`
  read-back.
- Semantic verification covers polygon/star type, points, radii, and mismatch
  fail-closed behavior.
- Solution recipe: `recipes/shape-layer-polystar-typed-plan.md`.
- Parent closeout owns repo rule checks and Full Intake ledger validation.

# Generic Repo Intake: tool-src-scripts-createsolidlayer

- Candidate: `tool-src-scripts-createsolidlayer`
- Source: `src/scripts/createSolidLayer.jsx`
- Safe typed tools: `create_solid_layer`, `create_adjustment_layer`,
  `set_layer_transform`

This intake records the safe solid-layer and adjustment-layer creation slice as
already covered by existing bridge tools. No raw JSX is copied into the product,
and no new bridge contract is added.

The safe supported path maps source solid creation to `create_solid_layer` with
an explicit target composition, generated layer/source name, RGB color, width,
height, pixel aspect, start time, and duration. When source-style positioning is
required, the plan must read the generated layer identity and then use
`set_layer_transform` with an explicit `position`, followed by
`get_layer_details` or `get_comp_details` read-back.

The source adjustment branch is covered by `create_adjustment_layer`, including
generated name, color, dimensions, pixel aspect, start time, duration, and
read-back proving `adjustmentLayer:true`. Use `add-3d-break-typed-plan` only
when the request needs guarded insertion immediately above a reviewed layer.

Use explicit arguments when source-like defaults matter. The source defaults to
a white solid, a five-second duration, pixel aspect `1`, and position
`[960, 540]`; the typed tools use bridge defaults unless the plan supplies those
values directly.

## Fail-Closed Scope

- The source temp args file wrapper, filesystem temp behavior, raw ExtendScript
  execution path, and JSON output formatting are not reproduced.
- The source's single `isAdjustment` switch is represented by two reviewed typed
  tools: `create_solid_layer` for normal solids and `create_adjustment_layer`
  for adjustment layers.
- Hidden source default semantics, unverified active-comp assumptions, broad
  project scans, source-exact native stack placement, selection side effects,
  source relinking, render queue changes, and arbitrary layer/property mutation
  require separate typed-tool contracts.
- The supported path requires normal Agent plan validation, mutation
  confirmation, idempotency, checkpoint or edit-session protection, and
  post-mutation read-back before any live run.

## Validation

- Existing bridge contracts: `create_solid_layer`, `create_adjustment_layer`,
  and `set_layer_transform`.
- Existing semantic verification checks `create_solid_layer` name/timing and
  `create_adjustment_layer` identity/placement evidence when guarded placement
  is requested.
- Parent closeout owns repo rule checks, solution smoke, and Full Intake ledger
  validation.

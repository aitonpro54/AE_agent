# Generic Repo Intake: tool-src-scripts-setlayerproperties

- Candidate: `tool-src-scripts-setlayerproperties`
- Source: `src/scripts/setLayerProperties.jsx`
- Safe typed tools: `set_layer_transform`, `set_layer_time_range`,
  `get_layer_details`, `get_comp_details`

This intake records the safe single-layer transform and timing slice as covered
by existing bridge tools. No raw JSX is copied into the product, and no new
bridge contract is added.

The safe supported transform path maps source `position`, `scale`, Z
`rotation`, and `opacity` updates to `set_layer_transform` against one reviewed
layer index. Plans must first bind the target composition and layer from current
typed evidence, then read the layer back with `get_layer_details` or
`get_comp_details` before claiming success.

The safe supported timing path maps source `startTime` and visible-duration
intent to `set_layer_time_range`. When preserving source-style duration
semantics matters, compute the target `outPoint` explicitly from the reviewed
start time plus duration and pass that explicit `outPoint`; do not rely on an
ambiguous duration shortcut without current timing evidence.

Layer-name targeting is covered only as a planning adaptation: resolve the
requested name to a concrete layer index from current `get_comp_details` or
`get_layer_details` evidence, then mutate by index. Keep the target layer name,
index, timing, and transform values in the plan evidence and post-run read-back.

## Fail-Closed Scope

- The source temp args file wrapper, filesystem temp behavior, raw ExtendScript
  execution path, and JSON output formatting are not reproduced.
- Source-exact active-comp fallback, broad project composition scans, hidden
  layer-name search side effects, and unguarded mutation of non-generated user
  assets require a separate reviewed contract or explicit user approval.
- Current `set_layer_transform` covers Z rotation only. 3D orientation,
  separate X/Y/Z rotation properties, separated dimensions, world-space or
  parent-space conversion, anchor point inference, expression/keyframe
  preservation semantics, and arbitrary transform/property mutation remain
  fail-closed unless another typed plan explicitly covers them.
- Timing changes beyond reviewed `startTime`, `inPoint`, `outPoint`, or
  explicitly computed duration require separate evidence. Do not change source
  timing, time remap, stretch, keyframe timing, layer order, sources, effects,
  masks, parenting, markers, render queue items, or selection state through this
  candidate note.
- The supported path requires normal Agent plan validation, mutation
  confirmation, idempotency, checkpoint or edit-session protection, and
  post-mutation read-back before any live run.

## Validation

- Existing bridge contracts: `set_layer_transform`, `set_layer_time_range`,
  `get_layer_details`, and `get_comp_details`.
- Existing recipe coverage includes `selected-layers-animation-typed-plan`,
  `zero-position-typed-plan`, `set-to-average-position-typed-plan`, and
  layer-timing recipes using `set_layer_time_range` plus read-back.
- Parent closeout owns repo rule checks, solution smoke, and Full Intake ledger
  validation.

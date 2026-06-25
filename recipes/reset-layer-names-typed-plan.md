# Reset Layer Names Typed Plan

## Goal

Reset reviewed generated layer names to empty strings through existing typed
bridge tools.

## Applies When

- The request is specifically to reset layer names, including source-style
  behavior that sets layer names to `""`.
- Target layers are generated or otherwise explicitly reviewed before mutation.
- Current layer indices and source names come from `get_comp_details` or
  `get_layer_details` evidence.
- The workflow does not require Project item rename, source relinking, layer
  timing changes, layer order changes, effect/property edits, render queue work,
  file I/O, or raw script execution.

## Plan Pattern

1. Run `get_active_comp` or target one explicit generated composition.
2. Run `get_comp_details` with `includeLayers:true` and bind concrete
   `layerIndices` plus `expectedLayerNames` from the same evidence.
3. Fail closed if the target scope includes unreviewed user layers or if the
   request requires broad all-project traversal.
4. Run one `rename_layers` step per concrete target layer with
   `mode:"exact"`, `name:""`, `allowEmptyName:true`, a single `layerIndices`
   entry, matching `expectedLayerNames`, `verifyAfter:true`, and a stable
   `idempotencyKeyTemplate`.
5. Run `get_comp_details` for the same comp and confirm every target layer now
   has `name:""` at the same reviewed layer index.

## Safety Gates

- Mutating layer-name workflow.
- Requires validated Agent plan, dry-run, explicit confirmation,
  `allowMutations:true`, idempotency, checkpoint or edit-session protection,
  and post-mutation read-back.
- Empty-name reset must use one layer per `rename_layers` call. Do not call
  multi-layer exact rename with `name:""` because exact rename numbering would
  change the requested semantics.
- Use `expectedLayerNames` for every empty-name reset step so stale layer order
  fails closed.
- Do not run source-checkout JSX, raw ExtendScript fallback, broad selected
  layer traversal, all-project traversal, or non-generated user-asset mutation
  without a separate checkpoint/rollback contract.

## Verification

- Each `rename_layers` result reports `changedCount:1`, `allowEmptyName:true`,
  before-name evidence, and `after:""` for the reviewed layer.
- The post-run `get_comp_details` read-back shows every reviewed layer index has
  `name:""`.
- Existing layer timing, sources, labels, switches, effects, masks, parenting,
  expressions, render queue items, project items, and selection state are
  preserved.

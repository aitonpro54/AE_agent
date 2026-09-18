# Replace Grid Rig Control Typed Plan

## Goal

Replace one explicit generated or reviewed Grid Rig Control null layer with one
generated shape control layer while preserving reviewed layer metadata and
adding the two required Slider Control effects.

## Applies When

- The target composition and old control layer are bound from current
  `get_layer_details`, `get_comp_details`, or `get_selected_layers` evidence.
- The old layer name is explicitly expected to be the Grid Rig Control target.
- The workflow can run on generated/test assets or on an explicitly reviewed
  asset with checkpoint/edit-session protection and rollback.
- The replacement can be represented as one generated shape layer with the same
  reviewed name, label, `enabled`, and `guideLayer` state.

## Typed Steps

1. Inspect the target comp and old layer. Bind `compName` or `compItemIndex`,
   old `layerIndex`, `expectedLayerName`, `label`, `enabled`, and `guideLayer`.
2. Create one generated replacement shape layer with `create_shape_layer` using
   the reviewed replacement name.
3. Apply preserved metadata to the replacement through `set_layer_metadata`
   with explicit `layerIndices`, `expectedLayerNames`, `label`, `enabled`, and
   `guideLayer`.
4. Add two effects to the replacement with `add_effect`:
   `ADBE Slider Control` named `Gutter`, and `ADBE Slider Control` named
   `Matte Roundness`.
5. Delete exactly the inspected old layer with `delete_layer`, using the old
   index and `expectedLayerName`.
6. Read back the comp stack, replacement layer, and both effects with
   `get_comp_details`, `get_layer_details`, and `get_effect_details`.

## Safety Gates

- Requires normal Agent plan validation, dry-run, explicit confirmation,
  `allowMutations:true`, idempotency defaults, checkpoint/edit-session
  protection, and post-mutation read-back.
- The old layer deletion must target exactly one explicit inspected layer.
- The replacement keeps source-exact selection traversal, non-generated
  destructive replacement, third-party Flex assumptions beyond the reviewed
  generated layer, expression/property copying, parenting, track mattes, layer
  reordering beyond the new top layer, file I/O, render queue work, and raw JSX
  fail-closed.

## Verification

- `set_layer_metadata` proves the replacement `label`, `enabled`, and
  `guideLayer` values through read-back.
- `add_effect` plus `get_effect_details` proves both generated Slider Control
  effects by name and matchName.
- `delete_layer` proves the old layer id/name instance is absent and layer count
  decremented.
- Final `get_comp_details` shows exactly one expected replacement layer name.
- Final `get_layer_details` shows the replacement is a shape layer and has the
  preserved metadata.

# Set Track Matte To Above Typed Plan

## Intent

Set one explicit generated fill layer to use the immediately above layer as a
`luma_inverted` track matte, then read the matte relationship back through typed
layer details.

## Applies When

- The user asks to run `Set_Track_Matte_To_Above` or make the selected layer use
  the layer above as its track matte.
- Current typed evidence identifies one fill layer and one matte layer in the
  same composition.
- The matte layer is the reviewed layer above the fill layer, represented by
  concrete one-based `layerIndex` and `matteLayerIndex` values.
- Generated-only or explicitly reviewed targets are acceptable; broad user
  timeline mutation is not.

## Plan Pattern

1. Run `get_active_comp` to bind the target composition.
2. Run `get_selected_layers` only when the fill layer is implied by current
   selection; require exactly one selected generated fill layer.
3. Run `get_comp_details includeLayers:true` or `get_layer_details` to bind the
   fill layer, the layer directly above it, layer names, and any existing
   `hasTrackMatte` / `trackMatteTypeName` state.
4. Fail closed if the fill layer is topmost, the matte layer is missing, layer
   inventory is truncated, layer identity is ambiguous, or current evidence does
   not prove the same-comp fill/matte pair.
5. Run `set_layer_track_matte` with explicit `layerIndex`,
   `matteLayerIndex`, `trackMatteType:"luma_inverted"`,
   `expectedLayerName`, and `expectedMatteLayerName`.
6. Run `get_layer_details` after mutation for the fill layer and confirm
   `hasTrackMatte:true`, `trackMatteTypeName:"luma_inverted"`, and
   `trackMatteLayer.index` / `trackMatteLayer.name` matching the matte layer.

## Safety Gates

- Require normal Agent plan validation, explicit confirmation,
  `allowMutations:true`, idempotency, checkpoint or edit-session protection, and
  post-mutation read-back before any track matte mutation.

## Safety Limits

- Mutate only the explicit fill layer's track matte relationship.
- Do not reorder layers, create layers, delete layers, parent layers, rename
  layers, change labels, change blending modes, edit effects or expressions,
  alter timing/source/project items, or touch render queue state.
- Do not infer targets from screenshots, layer names alone, visual indentation,
  stale selection context, or previous chat context.
- Do not use parent links, legacy layer-order tricks, broad timeline scans, or
  raw ExtendScript as substitutes for `set_layer_track_matte` and typed
  read-back.
- If the host AE version lacks selectable matte support and the reviewed matte
  is not immediately above the fill layer, fail closed with no layer reordering.

## Verification

- Pre-run evidence identifies the target comp, fill layer, matte layer above,
  and current matte state.
- The `set_layer_track_matte` result reports the exact fill/matte indices,
  requested `luma_inverted` type, and postVerification success.
- Post-run `get_layer_details` proves `hasTrackMatte:true`,
  `trackMatteTypeName:"luma_inverted"`, and matching `trackMatteLayer` identity.
- Unsupported selection ambiguity, layer reordering, non-generated user-layer
  mutation, source-exact native UI side effects, or raw script execution are
  reported as typed-tool gaps.

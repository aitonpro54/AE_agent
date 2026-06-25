# Set All Track Matte Labels Typed Plan

## Intent

Set `Layer.label` to `16` only on generated-only active-composition layers that
current typed read-back proves are track matte layers.

## Applies When

- The user asks to run `Set_All_Track_Matte_Labels` or set all track matte layer
  labels in one generated-only composition.
- `get_comp_details includeLayers:true` or `get_layer_details` exposes
  `isTrackMatte:true` for every accepted target layer.
- The accepted target list is converted into explicit one-based `layerIndices`
  before mutation.

## Plan Pattern

1. Run `get_active_comp` to bind the target composition.
2. Run `get_comp_details` with `includeLayers:true` for the same composition.
3. Derive `trackMatteLayerIndices` only from layers with typed
   `isTrackMatte:true` evidence.
4. Fail closed if layer inventory is missing, truncated, lacks `isTrackMatte`,
   or finds no verified track matte layers.
5. Run `set_layer_metadata` with explicit `layerIndices`,
   optional `expectedLayerNames`, and `label:16`.
6. Run `get_layer_details` or `get_comp_details includeLayers:true` after
   mutation and confirm every accepted matte layer still has `isTrackMatte:true`
   and now has `label:16`.

## Safety Gates

- Require normal Agent plan validation, explicit confirmation,
  `allowMutations:true`, idempotency, checkpoint or edit-session protection, and
  post-mutation read-back before any label write.

## Safety Limits

- Mutate only `Layer.label` on verified track matte layers.
- Do not set labels on all layers, selected layers, hidden layers, guessed matte
  layers, fill layers with `hasTrackMatte:true`, or layers inferred from names,
  screenshots, visual order, or previous chat context.
- Do not create, remove, reorder, parent, duplicate, rename, hide, reveal, lock,
  unlock, or otherwise change layers.
- Do not change track matte relationships, blending modes, effects,
  expressions, timing, sources, project items, render queue items, files, or
  non-generated user assets.
- Do not use raw ExtendScript as a substitute for typed `isTrackMatte` evidence
  and `set_layer_metadata` read-back.

## Verification

- Pre-run evidence identifies the target comp, complete layer inventory, and the
  exact `isTrackMatte:true` layers to label.
- The `set_layer_metadata` result reports only `label:16` updates for concrete
  layer indices and expected-name guards when available.
- Post-run read-back shows every accepted target with `isTrackMatte:true` and
  `label:16`.
- Unsupported broad scans, missing matte-role fields, source-exact UI behavior,
  user-layer mutation, or raw script execution are reported as typed-tool gaps.

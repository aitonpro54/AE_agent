# Add 3D Break Typed Plan

## Goal

Create one generated adjustment layer immediately above one reviewed generated or explicit layer by using the typed `create_adjustment_layer` placement contract, without copying source JSX or exposing broad layer reordering.

## Applies When

- The user asks to add a 3D break, adjustment break, or blank adjustment layer directly above a specific layer.
- The target composition and guarded layer are read through `get_active_comp`, `get_selected_layers`, `get_comp_details`, or `get_layer_details` before mutation.
- The break can be represented as one generated adjustment layer with reviewed name, timing, dimensions, and `insertBeforeLayerIndex`.
- If source-exact broad selected-layer traversal, arbitrary stack reordering, non-generated user-layer mutation, preference/UI behavior, raw ExtendScript, or effect/property copying is required, fail closed.

## Inputs

- `targetComp` (`comp`, required): active or explicit composition target verified before mutation.
- `guardedLayer` (`layer`, required): explicit layer index and expected name for the layer that the generated adjustment layer must be inserted immediately above.
- `adjustmentLayerSpec` (`object`, optional): reviewed generated name, color, width, height, start time, and duration.

## Plan Pattern

1. Run `get_active_comp` or `get_comp_details` to bind the target composition identity, dimensions, duration, and current layer count.
2. If the request is selection-driven, run `get_selected_layers` and reduce it to one reviewed `guardedLayer` index/name before mutation.
3. Run `get_layer_details` or `get_comp_details includeLayers:true` to verify the guarded layer index, name, and stack position.
4. Disclose the generated adjustment layer name, timing, dimensions, guarded layer, and fail-closed limits before confirmation.
5. Run `create_adjustment_layer` with the reviewed generated name and `insertBeforeLayerIndex` plus `expectedBeforeLayerName`.
6. Read back `get_layer_details` for the generated adjustment layer and the guarded layer after mutation.
7. Verify the generated layer has `adjustmentLayer:true` and its final index is immediately before the guarded layer's final index.

## Safety Gates

- Mutating composition workflow.
- Requires validated Agent plan, dry-run, explicit confirmation, `allowMutations:true`, idempotency, checkpoint/edit-session protection, and post-mutation read-back.
- Only the newly created generated adjustment layer may move. Existing user layers must not be reordered relative to each other.
- Do not delete, rename, relink, retime, parent, track-matte, select, lock, hide, or otherwise mutate existing layers.
- Do not edit effects, properties, masks, expressions, keyframes, sources, comp settings, project items, render queue items, files, preferences, or UI state.
- Do not use a generic layer stack reorder tool or raw ExtendScript as a substitute for the guarded `create_adjustment_layer` placement contract.

## Verification

- Pre-run evidence identifies the target comp, guarded layer index/name, and current stack order.
- `create_adjustment_layer` returns `adjustmentLayer:true`, placement evidence, and `immediatelyBefore:true`.
- Post-run `get_layer_details` confirms the generated adjustment layer name and `adjustmentLayer:true`.
- Post-run read-back confirms `generatedAdjustmentLayer.index + 1 === guardedLayer.index`.
- Semantic verification passes for adjustment-layer creation and placement.
- Post-run evidence shows no unexpected deletion, rename, relink, retime, effect/property/mask/expression/keyframe edits, track matte edits, selection mutation, render queue mutation, project-item mutation, file I/O, or non-generated user-asset mutation.

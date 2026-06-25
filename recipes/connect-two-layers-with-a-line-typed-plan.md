# Connect Two Layers With A Line Typed Plan

## Goal

Create one generated locked shape-layer connector between two explicit inspected layers by using the typed `create_layer_connection_line` contract, without copying source JSX or substituting a static rectangle.

## Applies When

- The user asks to connect two layers with a stroked line.
- The target composition and both endpoint layers are read through `get_active_comp`, `get_selected_layers`, `get_comp_details`, or `get_layer_details` before mutation.
- The request can be represented as one generated connector layer with a reviewed name, stroke style, timing, and a dynamic two-point open path expression bound to the two endpoint layer names.
- If source-exact broad selected-layer traversal, more than two endpoints, arbitrary shape path authoring, non-generated user-layer mutation, layer reordering, selection persistence, raw ExtendScript, or custom expression text is required, fail closed.

## Inputs

- `targetComp` (`comp`, required): active or explicit composition target verified before mutation.
- `fromLayer` (`layer`, required): explicit one-based source layer index and expected name for the first endpoint.
- `toLayer` (`layer`, required): explicit one-based source layer index and expected name for the second endpoint.
- `connectorSpec` (`object`, optional): reviewed generated connector name, stroke color, stroke width, start time, duration, and lock behavior.

## Plan Pattern

1. Run `get_active_comp`, `get_selected_layers`, or `get_comp_details` to bind the target comp and reduce selection-driven requests to exactly two endpoint layer indices.
2. Run `get_layer_details` for both endpoint layers to verify names, indices, and that the targets are the intended generated or explicitly reviewed layers.
3. Disclose the generated connector layer name, stroke style, endpoint indices/names, lock behavior, and fail-closed limits before confirmation.
4. Run `create_layer_connection_line` with `fromLayerIndex`, `toLayerIndex`, `expectedFromLayerName`, `expectedToLayerName`, reviewed stroke fields, and `lockLayer:true`.
5. Read back the generated connector with `get_layer_details includeProperties:true includeExpressions:true`.
6. Verify the connector is locked, the path property is an open two-point shape path, the path expression is enabled and error-free, and no unrelated layers were mutated.

## Safety Gates

- Mutating composition workflow.
- Requires validated Agent plan, dry-run, explicit confirmation, `allowMutations:true`, idempotency, checkpoint/edit-session protection, and post-mutation read-back.
- Only the newly created generated connector layer may be added and locked.
- Do not edit, delete, rename, retime, parent, track-matte, relink, select, or reorder existing layers.
- Do not mutate endpoint layer properties, effects, masks, keyframes, sources, comp settings, project items, render queue items, files, preferences, or UI state.
- Do not substitute a thin rectangle, static guide, generic open-path editor, arbitrary expression writer, or raw JSX for the reviewed connector contract.

## Verification

- Pre-run evidence identifies the target comp plus exactly two endpoint layer indices and names.
- `create_layer_connection_line` returns the generated connector layer, target layer read-back, stroke metadata, path geometry, expression state, and `postVerification.ok:true`.
- Post-run `get_layer_details` confirms the generated connector name and `locked:true`.
- Post-run property read-back confirms an `ADBE Vector Shape` path with `expressionEnabled:true`, no `expressionError`, `closed:false`, and `vertexCount:2`.
- Semantic verification passes for connector layer creation, open path, expression, and lock state.
- Post-run evidence shows no unexpected deletion, rename, relink, retime, parent, track matte, effect/property/mask/keyframe/source edits, selection mutation, render queue mutation, project-item mutation, file I/O, or non-generated user-asset mutation.

# Copy Composition Markers To Layer Typed Plan

## Intent

Copy reviewed composition marker evidence to one explicit layer as layer markers using typed tools only.

Use this recipe when the task asks to copy composition markers onto a layer and a safe typed adaptation is acceptable instead of source-exact active-comp or selected-layer traversal.

## Plan Pattern

1. Bind the target composition with `get_active_comp` only when the active composition is the intended target; otherwise require explicit `compName` or `compItemIndex` evidence.
2. Run `get_comp_details` with `includeLayers:true`, `includeMarkers:true`, and a bounded `markerLimit`.
3. Select one explicit generated or approved target `layerIndex` from current layer evidence and record `expectedLayerName` when available.
4. Build a reviewed `markerCopyPlan` from `markers.items`: each copied marker must disclose source `keyIndex`, `time`, `comment`, optional `duration`, and destination layer.
5. For each reviewed composition marker, run `add_layer_marker` with the verified comp target, target `layerIndex`, marker `time`, present `comment`, optional `duration`, `verifyAfter:true`, and a stable idempotency key.
6. Run `get_layer_details` for the target layer and compare marker read-back against the reviewed `markerCopyPlan`.

## Safety Gates

- Mutating layer-marker workflow.
- Requires validated Agent plan, dry-run, explicit confirmation, `allowMutations:true`, idempotency, and post-mutation read-back.
- Use checkpoint or edit-session protection for confirmed live runs.
- Mutate only layer markers on the reviewed target layer.
- Do not infer destination layers from selection without current selected-layer evidence.
- Do not update or delete existing markers, analyze audio, change composition markers, change layer timing, touch render queue items, write files, or run raw ExtendScript.

## Verification

- Pre-run `get_comp_details includeMarkers:true` returns the source composition markers with `orderedBy: comp.markerProperty.keyTime`.
- Dry-run evidence lists `markerCopyPlan` with every source marker key/time/comment/duration and the reviewed destination layer.
- Each `add_layer_marker` result reports the copied layer marker on the expected layer.
- Post-run `get_layer_details` shows every copied marker comment, time, and duration on the reviewed layer.
- The plan reports selected-layer ambiguity, marker update/delete, audio-derived markers, composition marker mutation, file I/O, render queue work, source-exact UI traversal, and raw JSX as unsupported.

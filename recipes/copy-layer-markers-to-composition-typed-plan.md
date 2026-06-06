# Copy Layer Markers To Composition Typed Plan

## Intent

Copy reviewed layer marker evidence from one explicit layer to composition markers using typed tools only.

Use this recipe when the task asks to copy layer markers onto the composition timeline and a safe typed adaptation is acceptable instead of source-exact active-comp or selected-layer traversal.

## Plan Pattern

1. Bind the target composition with `get_active_comp` only when the active composition is the intended target; otherwise require explicit `compName` or `compItemIndex` evidence.
2. Run `get_layer_details` for one explicit generated or approved source layer and require marker read-back evidence.
3. Run `get_comp_details` with `includeMarkers:true` to capture existing composition marker count and ordering before mutation.
4. Build a reviewed `markerCopyPlan` from the layer `markers.items`: each copied marker must disclose source `keyIndex`, `time`, `comment`, optional `duration`, and destination composition.
5. For each reviewed layer marker, run `add_comp_marker` with the verified comp target, marker `time`, present `comment`, optional `duration`, and `expectedMarkerCountBefore` when the count is known.
6. Run `get_comp_details` again with `includeMarkers:true` and compare composition marker read-back against the reviewed `markerCopyPlan`.

## Safety Gates

- Mutating composition-marker workflow.
- Requires validated Agent plan, dry-run, explicit confirmation, `allowMutations:true`, idempotency, and post-mutation read-back.
- Use checkpoint or edit-session protection for confirmed live runs.
- Mutate only composition markers on the reviewed composition.
- Do not infer source layers from selection without current selected-layer evidence.
- Do not update or delete existing markers, analyze audio, change layer markers, change work area or layer timing, touch render queue items, write files, or run raw ExtendScript.

## Verification

- Pre-run `get_layer_details` returns source layer marker evidence for one reviewed layer.
- Pre-run `get_comp_details includeMarkers:true` records current composition marker count and `orderedBy: comp.markerProperty.keyTime`.
- Dry-run evidence lists `markerCopyPlan` with every source marker key/time/comment/duration and the reviewed destination composition.
- Each `add_comp_marker` result reports marker-count increment evidence and the created composition marker.
- Post-run `get_comp_details includeMarkers:true` shows every copied marker comment, time, and duration on the reviewed composition.
- The plan reports selected-layer ambiguity, marker update/delete, audio-derived markers, layer marker mutation, work-area mutation, file I/O, render queue work, source-exact UI traversal, and raw JSX as unsupported.

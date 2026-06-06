# Add Composition Markers At Out Points Typed Plan

## Intent

Add composition markers at reviewed layer out-point times using typed composition marker tools only.

Use this recipe when the task asks to add composition markers at every layer out point and a safe typed adaptation is acceptable instead of source-exact active-comp traversal.

## Plan Pattern

1. Bind the target composition with `get_active_comp` only when the active composition is the intended target; otherwise require explicit `compName` or `compItemIndex` evidence.
2. Run `get_comp_details` with `includeLayers:true`, `includeMarkers:true`, and a bounded `markerLimit`.
3. Build a reviewed `markerTargets` list from explicit layer evidence. Each accepted marker target must include `layerIndex`, layer name when available, finite `outPoint` time, reviewed marker `comment`, and optional `duration`.
4. Fail closed when layer out-point evidence is missing, outside composition duration, ambiguous, duplicated without review, derived from hidden selection state, layer-marker-only, audio-derived, or current-time-derived.
5. Run `add_comp_marker` once per reviewed marker target with the verified comp target, marker `time`, present `comment`, optional non-negative `duration`, `expectedMarkerCountBefore` when known, and normal idempotency evidence.
6. Run `get_comp_details` again with `includeMarkers:true` and compare composition marker read-back against the reviewed `markerTargets`.

## Safety Gates

- Mutating composition-marker workflow.
- Requires validated Agent plan, dry-run, explicit confirmation, `allowMutations:true`, idempotency, and post-mutation read-back.
- Use checkpoint or edit-session protection for confirmed live runs.
- Mutate only composition markers on the reviewed composition.
- Do not update or delete existing markers, add layer markers, infer targets from selected layers without current evidence, analyze audio, change work area or layer timing, touch render queue items, write files, or run raw ExtendScript.

## Verification

- Pre-run `get_comp_details includeLayers:true includeMarkers:true` returns explicit layer out-point evidence and current composition marker count/order.
- Dry-run evidence lists `markerTargets` with every source layer, reviewed out-point time, comment, duration, and destination composition.
- Each `add_comp_marker` result reports marker-count increment evidence and the created composition marker.
- Post-run `get_comp_details includeMarkers:true` shows every requested marker comment, time, and duration on the reviewed composition.
- Composition identity, duration, frame rate, work area, layer count, and layer timing remain bounded after marker creation.
- Unsupported source-exact UI traversal, selected-layer ambiguity, marker update/delete, layer marker substitution, audio-derived markers, file I/O, render queue work, and raw JSX are reported as typed-tool gaps.

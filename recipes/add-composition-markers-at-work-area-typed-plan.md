# Add Composition Markers At Work Area Typed Plan

## Intent

Add composition markers at the reviewed work-area start and end times using typed composition marker tools only.

Use this recipe when the task asks to add markers at the beginning and end of the composition work area and a safe typed adaptation is acceptable instead of source-exact UI traversal.

## Plan Pattern

1. Bind the target composition with `get_active_comp` only when the active composition is the intended target; otherwise require explicit `compName` or `compItemIndex` evidence.
2. Run `get_comp_details` with `includeLayers:false`, `includeMarkers:true`, and a bounded `markerLimit` to capture current `workAreaStart`, `workAreaDuration`, duration, frame rate, and marker count.
3. Derive reviewed marker targets from the explicit work-area fields: start marker at `workAreaStart` and end marker at `workAreaStart + workAreaDuration`.
4. Require finite non-negative work-area start, finite positive work-area duration, and an end marker time inside the composition duration.
5. Run `add_comp_marker` for the start and end marker targets with present reviewed comments, optional non-negative durations, `expectedMarkerCountBefore` guards when known, and normal idempotency evidence.
6. Run `get_comp_details` again with `includeMarkers:true` and compare marker read-back against the reviewed work-area marker targets.

## Safety Gates

- Mutating composition-marker workflow.
- Requires validated Agent plan, dry-run, explicit confirmation, `allowMutations:true`, idempotency, and post-mutation read-back.
- Use checkpoint or edit-session protection for confirmed live runs.
- Mutate only composition markers on the reviewed composition.
- Do not change `workAreaStart` or `workAreaDuration`, update or delete existing markers, add layer markers, infer timing from current time or selected layers, analyze audio, touch render queue items, write files, or run raw ExtendScript.

## Verification

- Pre-run `get_comp_details includeMarkers:true` returns current work-area fields, duration, and marker count/order for the target composition.
- Dry-run evidence lists `markerTargets` for the reviewed work-area start and end times, comments, optional durations, and destination composition.
- Each `add_comp_marker` result reports marker-count increment evidence and the created composition marker.
- Post-run `get_comp_details includeMarkers:true` shows both requested marker comments and times on the reviewed composition.
- Composition identity, duration, frame rate, work-area fields, layer count, and existing marker evidence remain bounded after marker creation.
- Unsupported source-exact UI traversal, marker update/delete, layer marker substitution, audio-derived markers, current-time inference, file I/O, render queue work, and raw JSX are reported as typed-tool gaps.

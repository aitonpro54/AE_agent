# Set Work Area To Markers Typed Plan

## Intent

Set a composition work area from explicit composition marker evidence using typed tools only.

Use this recipe when the task asks to set a composition work area to the first two composition markers, or to a reviewed marker span, and a safe adaptation is acceptable instead of source-exact UI traversal.

## Plan Pattern

1. Bind the target composition with `get_active_comp` only when the active composition is the intended target; otherwise require explicit `compName` or `compItemIndex` evidence.
2. For generated-only proof setup, create only generated composition markers with `add_comp_marker`, using explicit marker `time`, present `comment`, optional non-negative `duration`, and `expectedMarkerCountBefore` guards.
3. Run `get_comp_details` with `includeLayers:false`, `includeMarkers:true`, and a bounded `markerLimit`.
4. Require at least two returned composition markers ordered by `comp.markerProperty.keyTime`.
5. Derive the reviewed work area from two explicit marker times: `start` is the earlier marker time and `duration` is the later marker time minus the earlier marker time.
6. Fail closed when markers are missing, truncated, duplicated at the same time, unordered, outside composition duration, layer-marker-only, audio-derived, current-time-derived, selection-derived, or ambiguous.
7. Run `set_comp_work_area` once against the verified composition with the derived `start`, derived `duration`, `verifyAfter:true`, and normal idempotency evidence.
8. Run `get_comp_details` again with `includeMarkers:true` and compare `workAreaStart`, `workAreaDuration`, marker evidence, composition identity, duration, frame rate, width, height, background color, and layer count.

## Safety Gates

- Mutating composition work-area workflow.
- Requires validated Agent plan, dry-run, explicit confirmation, `allowMutations:true`, idempotency, and post-mutation read-back.
- Use checkpoint or edit-session protection for confirmed live runs.
- Mutate only `workAreaStart` and `workAreaDuration` on the verified composition.
- Do not create or mutate user markers except in explicit generated-only proof setup with `add_comp_marker`.
- Do not substitute `add_layer_marker`, layer marker comments, layer names, current time, selected layers, audio analysis, persistent settings, keyboard-state branching, render queue operations, file I/O, or raw ExtendScript.

## Verification

- Pre-run `get_comp_details includeMarkers:true` returns at least two composition markers with `orderedBy: comp.markerProperty.keyTime`.
- Generated-only proof setup reports `add_comp_marker` results for the reviewed marker times and final composition marker read-back.
- Dry-run evidence lists marker-derived workAreaStart, marker-derived workAreaDuration, target composition duration, and bounds review.
- The mutating step uses exactly one `set_comp_work_area` call for the verified composition.
- Post-run `get_comp_details` shows `workAreaStart` equal to the reviewed earlier marker time and `workAreaDuration` equal to the reviewed marker span.
- Composition identity, duration, frame rate, width, height, background color, layer count, and marker evidence remain bounded after the work-area mutation.
- Unsupported layer-marker substitution, marker creation on user assets, marker update/delete, audio-derived markers, source-exact selected comp traversal, native undo semantics, and raw JSX semantics are reported as typed-tool gaps.

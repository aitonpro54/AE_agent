# Read Composition Markers Typed Plan

## Intent

Read composition-level timeline markers from an explicit or active composition without changing the project.

Use this recipe when the task needs `comp.markerProperty` evidence such as marker key times, comments, or durations. Do not use layer marker tools as a substitute for composition markers.

## Plan Pattern

1. Inspect the active composition with `get_active_comp` when the target is not already explicit.
2. Run `get_comp_details` for the verified target with `includeLayers:false`, `includeMarkers:true`, and a bounded `markerLimit`.
3. Treat `markers.items` as ordered by `comp.markerProperty.keyTime`, preserving each marker `keyIndex`, `time`, `comment`, and `duration`.
4. Report empty marker lists honestly instead of inferring marker-derived timing.
5. If a later workflow needs work-area mutation from marker evidence, make that a separate reviewed plan using `set_comp_work_area` after marker bounds are explicit.

## Safety Gates

- Uses typed read tools only.
- Does not require mutation permission, checkpoint/edit session, idempotency, or explicit mutation confirmation.
- Fails closed for marker creation, marker update/delete, audio-derived marker generation, layer marker substitution, raw script execution, and source-exact UI side effects.

## Verification

- The returned `markers` object includes `count`, `returned`, `truncated`, `orderedBy`, and `items`.
- `orderedBy` is `comp.markerProperty.keyTime`.
- Every returned item preserves `keyIndex`, `time`, `comment`, and `duration` when available.
- No layer, comp, project item, render queue, file, proxy, effect, expression, keyframe, or selection mutation is planned.

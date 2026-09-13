# AR Work Area To Selected Layer Typed Plan

## Goal

Set the active composition work area to reviewed selected-layer timing bounds
by reading active-comp, selected-layer, layer-detail, and comp-detail evidence,
building a reviewed `workAreaToSelectedLayerSpec`, applying only
`workAreaStart` and `workAreaDuration` with `set_comp_work_area`, and reading
the same composition back.

## Applies When

- The user asks to run `AR_WorkAreaToSelectedLayer.jsx`, set the work area to a
  selected layer, or make the active composition work area match selected-layer
  timing.
- Current typed evidence identifies one active composition, selected layer
  targets, frame rate, composition duration, and the exact layer timing bounds
  accepted for work-area mutation.
- The workflow can be narrowed to a single selected layer, or to an explicit
  reviewed multi-layer aggregation policy such as earliest accepted `inPoint`
  to latest accepted `outPoint`.
- A typed adaptation is acceptable: compute reviewed `targetWorkAreaTiming`
  from selected-layer `inPoint` and `outPoint` evidence, change only
  composition `workAreaStart` and `workAreaDuration` with `set_comp_work_area`,
  then read the same comp back.
- The workflow does not require source-exact native UI selection ordering,
  layer retiming, source footage trimming, current-time inference, raw JSX, or
  broad timeline mutation.

## Plan Pattern

1. Run `get_active_comp` to bind active comp identity, frame rate,
   selected-layer count, current time, and any current work area fields exposed
   by the active-comp read.
2. Run `get_selected_layers` to bind the current selected-layer set. Fail
   closed if selection evidence is empty, stale, or ambiguous.
3. Run `get_layer_details` for every accepted selected layer to capture current
   `inPoint`, `outPoint`, `startTime`, duration, lock/shy state when available,
   and whether the layer target is generated or explicitly reviewed.
4. Run `get_comp_details` for the active comp before mutation to capture
   current `workAreaStart`, `workAreaDuration`, duration, frame rate, width,
   height, background color, layer count, marker count when available, and comp
   identity.
5. Build a reviewed `workAreaToSelectedLayerSpec` before mutation. It must
   include target comp identity, selected layer indices/names, the selected
   timing source, `verifiedSelectedLayerTiming`, accepted layers, skipped
   layers, skipped-target reasons, and computed `targetWorkAreaTiming`.
6. For the single-layer case, compute `targetWorkAreaTiming.workAreaStart` from
   the reviewed layer `inPoint` and `targetWorkAreaTiming.workAreaDuration`
   from reviewed `outPoint - inPoint`. For an explicitly approved multi-layer
   aggregate, compute start from the earliest accepted `inPoint` and duration
   from latest accepted `outPoint - earliest accepted inPoint`.
7. Fail closed when selected-layer timing is missing, non-finite, outside the
   comp duration, target duration is not positive, frame alignment is ambiguous
   where frame precision matters, the selected set requires hidden AE selection
   ordering, or the request requires changing layer timing instead of the comp
   work area.
8. Run `set_comp_work_area` once against the verified active comp, passing only
   reviewed `start`, reviewed `duration`, `verifyAfter:true`, and stable
   idempotency evidence.
9. Run `get_comp_details` after mutation and compare `workAreaStart`,
   `workAreaDuration`, duration, frame rate, width, height, background color,
   layer count, marker count when available, and comp identity.
10. Run `get_layer_details` after mutation for accepted selected layers when
    needed to confirm layer timing was not changed.

## Safety Gates

- Mutating composition work-area workflow.
- Requires validated Agent plan, dry-run, explicit confirmation,
  `allowMutations:true`, idempotency, checkpoint or edit-session protection, and
  post-mutation read-back.
- Mutate only the active comp `workAreaStart` and `workAreaDuration`; do not
  change comp duration, frame rate, background color, layer timing, layer
  sources, keyframes, expressions, markers, labels, names, parenting, track
  mattes, layer order, selection state, project items, files, render queue
  items, or non-target comps.
- Require current typed selected-layer timing evidence; do not infer selected
  layer bounds from screenshots, prior chat context, layer names, labels,
  visual timeline state, current time, comp duration alone, or source-script
  assumptions.
- Do not execute source JSX, use raw ExtendScript, retime layers to satisfy a
  work-area request, emulate native undo groups, scan unrelated comps, or
  promise exact source semantics without a separate typed-tool contract.

## Verification

- Pre-run evidence identifies the active comp, selected or explicit layer
  targets, reviewed `verifiedSelectedLayerTiming`, previous comp work area, and
  comp duration bounds.
- Dry-run evidence shows `workAreaToSelectedLayerSpec`, accepted and skipped
  layers, skipped-target reasons, selected timing source, and computed
  `targetWorkAreaTiming` with reviewed work-area start and duration.
- The mutating step uses exactly one `set_comp_work_area` call for the verified
  active composition with only reviewed `workAreaStart` and
  `workAreaDuration` values derived from selected-layer timing.
- Post-run `get_comp_details` shows the active comp work area starts at the
  selected layer inPoint and has duration equal to the selected layer timing
  span, or the explicitly reviewed multi-layer aggregate span.
- Post-run evidence shows unchanged comp duration, frame rate, width, height,
  background color, layer count, marker state when available, selected layer
  `inPoint`, `outPoint`, `startTime`, source timing, keyframes, effects,
  expressions, names, labels, parenting, layer order, selection state, project
  items, files, render queue items, and non-target comps.
- Unsupported source-exact native UI side effects, hidden selection ordering,
  layer retiming, source footage trimming, broad comp traversal, current-time
  inference, raw ExtendScript, or exact source JSX semantics are reported as
  typed-tool gaps.

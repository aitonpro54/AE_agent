# AR Trim Layers To Work Area Typed Plan

## Goal

Trim reviewed selected layers in the active composition to the current work area
bounds by reading active-comp and selected-layer timing evidence, building a
reviewed `trimLayersToWorkAreaSpec`, applying only layer `inPoint` and
`outPoint` changes with `set_layer_time_range`, and reading the same layers
back.

## Applies When

- The user asks to run `AR_TrimLayersToWorkArea.jsx`, trim layers to work area,
  or make selected layer timing match the active composition work area.
- Current typed evidence identifies the active composition, work area start and
  duration or end, selected layer targets, frame rate, and every layer accepted
  for timing mutation.
- The workflow can be narrowed to generated layers or layers the user has
  explicitly approved for timing mutation.
- A typed adaptation is acceptable: compute reviewed layer trim bounds from the
  active comp work area, change only `inPoint` and `outPoint` with
  `set_layer_time_range`, then read the same layers back.
- The workflow does not require source-exact native UI selection behavior,
  comp work area mutation, source footage trimming, startTime or stretch
  changes, raw JSX, or broad timeline mutation.

## Plan Pattern

1. Run `get_active_comp` to bind active comp identity, frame rate, selected-layer
   count, current time, and current work area fields when exposed.
2. Run `get_comp_details` when needed to capture concrete work area evidence,
   including `workAreaStart`, `workAreaDuration`, and computed work area end.
   Fail closed if the active comp identity does not match the target comp or
   work area timing is missing, stale, non-finite, or ambiguous.
3. Run `get_selected_layers` when the target layers are implied by current
   selection. Fail closed if no selected layers are present, target evidence is
   stale, or the selected set is ambiguous.
4. Run `get_layer_details` for every accepted selected layer to capture current
   `inPoint`, `outPoint`, `startTime`, duration, lock/shy state when available,
   and whether the layer is generated or explicitly approved for timing
   mutation.
5. Build a reviewed `trimLayersToWorkAreaSpec` before mutation. It must include
   target comp identity, selected layer indices/names, frame rate, work area
   timing source, `verifiedWorkAreaTiming`, computed `targetTrimTiming`,
   accepted layers, skipped layers, and skipped-target reasons.
6. Compute each accepted target from reviewed work area timing only: target
   `inPoint` equals work area start and target `outPoint` equals work area start
   plus work area duration, rounded to frame boundaries when the frame rate is
   available.
7. Fail closed when work area timing is missing, work area duration is not
   positive, target `outPoint` is not greater than target `inPoint`, a target is
   locked or unsafe to retime, or the request requires changing the comp work
   area instead of trimming layer timing.
8. Run `set_layer_time_range` only for accepted explicit selected layer targets,
   passing the computed `inPoint` and `outPoint` values while leaving
   `startTime`, stretch, sources, effects, expressions, keyframes, markers,
   labels, names, parenting, track mattes, layer order, selection state, comp
   work area/duration, project items, files, render queue state, and non-target
   layers unchanged.
9. Run `get_layer_details` after mutation for every accepted layer to confirm
   the layer has the expected trim bounds.

## Safety Gates

- Mutating selected-layer timing workflow.
- Requires validated Agent plan, dry-run, explicit confirmation,
  `allowMutations:true`, idempotency, checkpoint or edit-session protection, and
  post-mutation read-back.
- Mutate only explicit reviewed generated layers or layers the user has approved
  for timing mutation from current typed evidence.
- Require current typed work area and selected-layer timing evidence; do not
  infer work area bounds from screenshots, source-script assumptions, prior chat
  context, layer names, labels, or comp duration alone.
- Do not change `startTime`, stretch, source footage timing, keyframe times or
  values, interpolation, effects, expressions, markers, labels, names,
  parenting, track matte assignments, layer order, selection state, comp work
  area/duration, project items, files, render queue items, or non-target layers.
- Do not execute source JSX, use raw ExtendScript, mutate the comp work area to
  satisfy the trim request, trim source footage, emulate native undo groups,
  scan unrelated comps, or promise exact source semantics without a separate
  typed-tool contract.

## Verification

- Pre-run evidence identifies the active comp, selected or explicit layer
  targets, frame rate when available, reviewed work area start/duration/end, and
  current selected-layer `inPoint`, `outPoint`, and `startTime` values.
- Dry-run evidence shows `trimLayersToWorkAreaSpec`, accepted and skipped
  layers, skipped-target reasons, work area timing source,
  `verifiedWorkAreaTiming`, and computed `targetTrimTiming` for every accepted
  selected layer.
- Every `set_layer_time_range` step targets one explicit reviewed selected
  layer and sets only the computed `inPoint` and `outPoint` values for that
  layer.
- Post-run `get_layer_details` read-back shows each accepted selected layer
  starts at the verified work area start and ends at the verified work area end.
- Post-run evidence shows unchanged `startTime`, source timing, keyframes,
  effects, expressions, names, labels, parenting, layer order, selection state,
  comp duration/work area, project items, files, render queue items, and
  non-target layer timing.
- Unsupported comp work area mutation, source-exact native UI side effects,
  hidden selection ordering, source footage trimming, broad comp traversal, raw
  ExtendScript, or exact source JSX semantics are reported as typed-tool gaps.

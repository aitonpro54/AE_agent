# Prepare Layer Out Points For Lottie Typed Plan

## Goal

Extend reviewed generated layer out points one frame past a generated
composition end for Lottie export compatibility, using typed timing tools and
read-back instead of raw ExtendScript.

## Applies When

- The user asks to prepare generated composition layers for Lottie export by
  extending layers that end exactly at the composition duration.
- The target composition and layer indexes are explicit or can be bound from
  current `get_comp_details` evidence before mutation.
- The target layers are generated/test assets or otherwise explicitly approved
  for mutation.
- A safe adaptation is acceptable: mutate only reviewed layer `outPoint` values
  with `set_layer_time_range`.
- If the task requires scanning every project composition, mutating user comps,
  relying on exporter-specific hidden state, or exact source JSX behavior, fail
  closed and request a separate generated-prefix traversal contract.

## Plan Pattern

1. Run `get_active_comp` only when the active comp is the explicit generated
   target; otherwise bind a concrete `compName` or `compItemIndex` from current
   project evidence.
2. Run `get_comp_details` for the target composition with layer timing included.
   Record comp `duration`, `frameRate`, and each candidate layer `inPoint` and
   `outPoint`.
3. Compute `frameDuration = 1 / frameRate` from the read-back evidence. Fail
   closed when `duration`, `frameRate`, or layer timing values are missing,
   non-finite, or off-frame beyond normal floating point tolerance.
4. Build a reviewed explicit `layerIndices` list only for layers whose current
   `outPoint` equals the composition `duration` within tolerance.
5. Run `set_layer_time_range` once or in bounded explicit calls for those layer
   indexes with `outPoint = duration + frameDuration`.
6. Run `get_comp_details` and, when useful, `get_layer_details` after mutation.
   Confirm only the reviewed layers changed and each target out point equals
   `duration + frameDuration`.
7. Report any layers that were already shorter or longer than the comp duration
   as skipped rather than changing them.

## Safety Gates

- Mutating generated layer timing workflow.
- Requires validated Agent plan, dry-run, explicit confirmation,
  `allowMutations:true`, idempotency, and post-mutation read-back.
- Use checkpoint or edit-session protection for confirmed live runs.
- Mutate only explicit generated composition/layer targets from current typed
  evidence.
- Do not scan all project items, mutate user compositions, change comp duration,
  move layer start/in points, edit markers, effects, expressions, keyframes,
  sources, render queue items, project folders, proxies, files, or raw JSX.
- Do not promise source-exact all-project Lottie preparation semantics without
  a separate generated-prefix/all-generated-comps traversal contract.

## Verification

- Pre-run `get_comp_details` evidence identifies the target comp duration,
  frame rate, frame duration, layer indexes, layer names, and current layer
  `outPoint` values.
- The mutating step uses `set_layer_time_range` only for explicit reviewed layer
  indexes whose pre-run `outPoint` equals comp `duration`.
- Post-run `get_comp_details` or `get_layer_details` shows each changed target
  layer `outPoint` equals `duration + frameDuration`.
- Post-run evidence shows unchanged comp duration/frame rate and unchanged
  timing for non-target layers.
- The plan reports all-project traversal, user-comp mutation, exporter hidden
  state, and exact source JSX semantics as unsupported by this recipe.

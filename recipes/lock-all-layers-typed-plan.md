# Lock All Layers Typed Plan

## Goal

Lock every layer in one inspected active composition using the existing
`set_layer_metadata` typed tool with `locked:true`, then read back the layer
metadata. This recipe does not execute raw JSX and does not use layer selection
as an implicit target list.

## Applies When

- The user asks to run `Lock_All_Layers`, lock all layers, or protect all layers
  in the active comp from editing.
- The target is exactly one active composition.
- The current complete layer list can be read before mutation.
- The request is a final locked state, not a toggle or mixed lock/unlock edit.
- The task does not require project-wide locking, selection mutation, shy/solo
  changes, visibility changes, label/comment edits, layer timing, parenting,
  source relinking, render queue changes, or exact raw JSX behavior.

## Plan Pattern

1. Run `get_active_comp` to bind the active composition identity, item index,
   current time, duration, frame rate, and layer count.
2. Run `get_comp_details` for the same comp to capture the complete ordered
   layer inventory, including concrete one-based layer indices, names, and
   current `locked` state when available.
3. Build a reviewed `allLayerLockTargets` list from that read-only evidence.
   Include every concrete layer index in the inspected comp and pair
   `expectedLayerNames` with the same order when names are available.
4. Fail closed if the layer list is empty, incomplete, ambiguous, stale, or not
   tied to the same comp identity read in step 1.
5. Run one `set_layer_metadata` step for the inspected comp with
   `layerIndices:allLayerLockTargets`, optional `expectedLayerNames`,
   `locked:true`, `verifyAfter:true`, and a stable idempotency key.
6. Run `get_layer_details` for affected layers, or `get_comp_details` when that
   is the available complete read-back, and report locked-state evidence for
   every targeted layer.

## Safety Gates

- Mutating active-comp metadata workflow.
- Requires validated Agent plan, dry-run, explicit confirmation,
  `allowMutations:true`, idempotency, checkpoint or edit-session protection, and
  post-mutation read-back.
- Do not infer all layers from screenshots, previous chat context, visible UI
  stack, layer names, selection state, or source-script assumptions.
- Do not call `set_layer_metadata` without explicit layer indices from current
  typed inventory.
- Do not use raw ExtendScript, script runners, selection changes, label/comment
  metadata, layer renames, property writes, effects, source relinks, timing
  edits, parenting edits, project-item edits, or render queue changes as part of
  this recipe.
- If the user asks to unlock layers, toggle lock state, skip locked layers,
  target selected layers only, or lock layers across multiple comps, use a
  separate reviewed workflow.

## Verification

- Pre-run evidence identifies the active comp and a complete layer inventory
  with concrete layer indices and names when available.
- The reviewed `allLayerLockTargets` list contains every layer index from the
  inspected comp and no inferred or cross-comp targets.
- The `set_layer_metadata` result uses only `locked:true` for those explicit
  layer indices and includes expected-name guards when available.
- Post-run read-back shows every targeted layer reports `locked:true`.
- Unsupported source-exact native undo behavior, UI selection side effects,
  toggling semantics, multi-comp scope, and raw JSX semantics are reported as
  out of scope instead of being approximated silently.

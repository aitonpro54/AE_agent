# Precomp Selected Typed Plan

## Goal

Precompose verified selected layers through existing typed bridge tools, using
one reviewed precompose step per selected layer when matching the source batch
workflow, without copying source JSX or promising exact native Pre-compose
dialog or Project panel behavior.

## Applies When

- The user asks to run `precompSelected`, precompose selected layers into
  separate comps, wrap one reviewed selected layer in a new precomp, or create
  reviewed precomps from the current selection.
- A safe typed-tool adaptation is acceptable: inspect the active composition and
  selected layers, require concrete per-layer precomp names, call
  `precompose_layers` once per accepted layer, and read back the parent
  composition plus created precomp evidence.
- The target is the active composition, and layer targets come from current
  `get_selected_layers` evidence or explicit layer indices that are read before
  mutation.
- Each requested new precomp name is explicit, reviewed, non-empty, collision
  checked, and not inferred solely from unavailable source-script naming
  behavior.
- If the request requires exact source JSX behavior, native dialog UI semantics,
  automatic naming, project-panel selected-item discovery, recursive nested
  precomp traversal, source relinking, template cleanup, render queue changes,
  or selection side effects, fail closed and require a separate typed-tool
  contract.

## Plan Pattern

1. Run `get_active_comp` to establish the active composition identity, current
   time, dimensions, duration, frame rate, and layer count.
2. Run `get_selected_layers` and require at least one concrete selected layer
   with stable `layerIndex` evidence.
3. Run `get_comp_details` for the active composition before mutation to capture
   parent comp identity and current layer membership.
4. Build and disclose reviewed `perLayerPrecomposeSpecs`: one concrete
   `layerIndex`, reviewed generated name, collision policy, intended
   `moveAllAttributes` value, and `openInViewer:false` for each accepted layer.
5. Force fail-closed review when layer type evidence is insufficient for
   source-like Shape/Text `moveAllAttributes:true` handling.
6. Run one `precompose_layers` step per accepted selected layer with the
   inspected comp target, a single evidence-backed `layerIndex`, reviewed
   `newCompName`, explicit `moveAllAttributes`, `openInViewer:false`,
   `verifyAfter:true`, and a stable per-layer `idempotencyKeyTemplate`.
7. Run `get_comp_details` after each mutation for the parent composition and
   the created precomp when its item/name evidence is returned.
8. Fail closed instead of using raw script execution when selected-layer
   evidence is missing, layer targets are ambiguous, the precomp name is
   missing, or exact source/native UI semantics are required.

## Safety Gates

- Mutating composition workflow.
- Requires validated Agent plan, dry-run, explicit confirmation,
  `allowMutations:true`, idempotency, checkpoint/edit-session protection, and
  post-mutation read-back.
- Mutate only the explicitly accepted selected layers through per-layer
  `precompose_layers` calls.
- Preserve unrelated layers, source items, effects, masks, expressions,
  keyframes, render queue items, project folders, and selection state unless a
  separate typed plan explicitly covers them.
- Do not infer target layers from layer names, visual order, prior chat
  context, project panel state, precomp membership, or unavailable source JSX
  behavior.
- Do not use this recipe for deep precomp/source duplication, source relinking,
  nested source-comp property edits, layer deletion, cleanup routines, template
  batch updates, render queue changes, or raw ExtendScript.

## Verification

- Pre-run evidence identifies the active composition, selected layer indices,
  selected layer names and layer types when available, and current parent comp
  layer count.
- Dry-run evidence shows each reviewed per-layer `newCompName`, concrete single
  `layerIndex`, `moveAllAttributes` choice, collision handling, and skipped
  target reasons if any.
- Each `precompose_layers` result reports the created composition identity or
  enough evidence to read it back by name/item index.
- Post-run parent `get_comp_details` shows the selected layers were replaced by
  the expected precomp layer without unrelated layer deletion, rename, relink,
  timing, effect, mask, expression, keyframe, render queue, or project-item
  mutation.
- Post-run created-precomp read-back confirms each new composition exists and
  contains the expected precomposed layer content as far as typed evidence
  exposes it.
- Unsupported native dialog behavior, automatic naming, Project panel parent
  folder movement, recursive nested precomp operations, project-panel selection
  discovery, selection side effects, and exact source JSX semantics are reported
  as typed-tool gaps instead of being approximated silently.

# Nice Precomp Typed Plan

## Goal

Precompose explicitly selected layers into a reviewed new composition through existing typed bridge tools, without copying source JSX or promising native dialog semantics.

## Applies When

- The user asks to precompose selected layers, make a nice precomp, wrap selected layers in a new comp, or create a precomp from selected active-comp layers.
- A safe typed-tool adaptation is acceptable: inspect the active comp and selected layers, require a concrete `newCompName`, call `precompose_layers`, and read back the parent comp plus created precomp.
- The target is the active composition, and layer targets come from current `get_selected_layers` evidence or explicit layer indices that are read before mutation.
- The requested new precomp name is explicit, reviewed, non-empty, and not inferred solely from source script naming heuristics.
- If the request requires exact native Pre-compose dialog behavior, automatic source-specific naming, Project panel selected-item discovery, recursive nested-precomp traversal, source relinking, template cleanup, render queue changes, or exact source JSX behavior, fail closed and require a separate typed-tool contract.

## Plan Pattern

1. Run `get_active_comp` to establish the active comp identity, current time, dimensions, duration, frame rate, and layer count.
2. Run `get_selected_layers` for selected-layer workflows and require at least one concrete selected layer with stable `layerIndex` evidence.
3. Run `get_comp_details` for the active comp before mutation to capture parent comp identity and current layer membership.
4. Normalize and disclose the reviewed `newCompName`, concrete `layerIndices`, intended `moveAllAttributes` value, and `openInViewer:false` before confirmation.
5. Run one `precompose_layers` step with the inspected comp target, evidence-backed `layerIndices`, reviewed `newCompName`, explicit `moveAllAttributes`, `openInViewer:false`, `verifyAfter:true`, and a stable `idempotencyKeyTemplate`.
6. Run `get_comp_details` after mutation for the parent comp and the created precomp when its item/name evidence is returned.
7. Fail closed instead of using raw script execution when selected-layer evidence is missing, layer targets are ambiguous, the precomp name is missing, or exact source/native UI semantics are required.

## Safety Gates

- Mutating composition workflow.
- Requires validated Agent plan, dry-run, explicit confirmation, `allowMutations:true`, idempotency, checkpoint/edit-session protection, and post-mutation read-back.
- Mutate only the explicitly accepted selected layers through `precompose_layers`.
- Preserve unrelated layers, source items, effects, masks, expressions, keyframes, render queue items, project folders, and selection state unless a separate typed plan explicitly covers them.
- Do not infer target layers from layer names, visual order, prior chat context, Project panel state, precomp membership, or unavailable source JSX behavior.
- Do not use this recipe for deep precomp/source duplication, source relinking, nested source-comp property edits, layer deletion, cleanup routines, template batch updates, render queue changes, or raw ExtendScript.

## Verification

- Pre-run evidence identifies the active comp, selected layer indices, selected layer names when available, and current parent comp layer count.
- Dry-run evidence shows the reviewed `newCompName`, concrete `layerIndices`, `moveAllAttributes` choice, and skipped target reasons if any.
- The `precompose_layers` result reports the created composition identity or enough evidence to read it back by name/item index.
- Post-run parent `get_comp_details` shows the selected layers were replaced by the expected precomp layer without unrelated layer deletion, rename, relink, timing, effect, mask, expression, keyframe, render queue, or project-item mutation.
- Post-run created-precomp read-back confirms the new composition exists and contains the expected precomposed layer content as far as typed evidence exposes it.
- Unsupported native dialog behavior, automatic naming heuristics, recursive nested-precomp operations, Project panel selection discovery, and exact source JSX semantics are reported as typed-tool gaps instead of being approximated silently.

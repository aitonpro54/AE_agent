# Select Random Layers Typed Plan

## Goal

Select a reviewed random subset of active-comp layers by deriving explicit one-based `layerIndices` from current typed layer inventory, applying `set_layer_selection`, and reading the selected layers back.

## Applies When

- The user asks to select random layers in the active composition.
- An active composition exists and current `get_comp_details` layer inventory is complete enough to define the eligible layer pool.
- The random subset has been converted into concrete one-based `randomLayerIndices` before mutation using a reviewed count, seed, or explicit reviewed sample policy.
- The task does not require native nondeterministic UI behavior, hidden timeline state, persistent randomness, cross-comp selection, project-panel selection, layer edits, or raw JSX execution.

## Plan Pattern

1. Run `get_active_comp` to confirm the active composition and capture the target comp identity.
2. Run `get_comp_details` with `includeLayers:true` and a sufficient `layerLimit` for the active comp layer stack.
3. Define the eligible layer pool only from current typed layer inventory and any reviewed user constraints.
4. Bind a reviewed `randomSelectionPolicy`, such as explicit `randomLayerIndices`, a reviewed finite `selectionCount`, or a deterministic seed plus documented sampling rule.
5. Compute `randomLayerIndices` before mutation, preserve the eligible pool evidence, and fail closed when the pool is empty, truncated, ambiguous, or when the user requires source-exact nondeterministic randomness.
6. Run one `set_layer_selection` step with the computed `randomLayerIndices`, optional expected names, replacement selection semantics, `verifyAfter:true`, and a stable `idempotencyKeyTemplate`.
7. Run `get_selected_layers` after mutation and report selected random-layer count, selected layer indices, names, eligible pool size, and the reviewed random selection policy used to choose them.

## Safety Gates

- Mutating selection state workflow.
- Requires validated Agent plan, dry-run, explicit confirmation, `allowMutations:true`, idempotency, checkpoint or edit-session protection, and post-mutation read-back.
- Do not run nondeterministic randomness inside the mutation step; selection targets must be concrete layer indices before `set_layer_selection`.
- Do not infer eligible layers from screenshots, previous chat context, layer names, source type strings, label color, shy/solo/lock state, or approximate UI assumptions unless those fields are explicitly returned by typed layer inventory and reviewed.
- Do not create, delete, duplicate, rename, reorder, hide, reveal, enable, disable, parent, unparent, or otherwise mutate layers; this recipe changes only active-comp selection state.
- Require a separate typed-tool contract for source-exact native random selection semantics, random seed persistence, weighted/random-by-type selection, cross-comp selection, Project panel selection, or exact native UI side effects.

## Verification

- The plan includes active comp evidence and full enough layer inventory before computing the random target set.
- Dry-run evidence lists the eligible layer pool, reviewed `randomSelectionPolicy`, computed `randomLayerIndices`, optional expected names, and the reason the sample is deterministic/reviewable.
- The `set_layer_selection` step reports the computed random layer indices, replacement selection semantics, `verifyAfter:true`, and no non-selection mutation.
- The post-run `get_selected_layers` read-back shows exactly the expected random-layer count, selected layer indices, and expected names.
- Empty, truncated, unsupported, unreviewed, or nondeterministic random selection is reported as a typed-tool gap or no-op decision instead of approximate selection.
- Post-run evidence shows no layer order change, layer rename, timing/source/effect/keyframe/mask/project item/render queue mutation, randomness persistence, or cross-comp selection.

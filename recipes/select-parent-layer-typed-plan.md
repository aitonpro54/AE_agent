# Select Parent Layer Typed Plan

## Goal

Select the direct parent layers of currently selected active-comp layers by deriving explicit one-based `layerIndices` from current typed parent evidence, applying `set_layer_selection`, and reading the selected parent layers back.

## Applies When

- The user asks to select parent layers, select the parents of selected layers, or replace the current selection with each selected layer's direct parent.
- An active composition exists and current selected-layer plus layer-inventory evidence exposes enough parent state to identify direct parents without guessing.
- The accepted parent set is converted into concrete one-based `layerIndices` before mutation.
- The task does not require assigning, clearing, changing, or creating parent links, selecting recursive ancestors, selecting children, fuzzy name matching, cross-comp selection, project-panel selection, layer edits, or raw JSX execution.

## Plan Pattern

1. Run `get_active_comp` to confirm the active composition and capture the target comp identity.
2. Run `get_selected_layers` to capture the current child selection, including selected layer indices and names.
3. Run `get_comp_details` with `includeLayers:true` and a sufficient `layerLimit` for the active comp layer stack.
4. Identify each selected child layer's direct parent only from typed parent evidence, such as `parentLayerIndex`, `parentIndex`, `parentName` paired with a unique same-comp layer, or equivalent bridge inventory state.
5. Bind deduplicated `parentLayerIndices`, optional expected parent names, and the child-to-parent evidence from the same current active-comp inventory.
6. Fail closed when the selected-layer set is empty, layer inventory is truncated, parent evidence is absent or ambiguous, no selected layers have parents, a parent cannot be resolved in the same active comp, or the request depends on recursive ancestors or unsupported UI-only state.
7. Run one `set_layer_selection` step with the computed `parentLayerIndices`, optional expected parent names, replacement selection semantics, `verifyAfter:true`, and a stable `idempotencyKeyTemplate`.
8. Run `get_selected_layers` after mutation and report selected parent count, selected layer indices, names, and the child-to-parent evidence used to choose them.

## Safety Gates

- Mutating selection state workflow.
- Requires validated Agent plan, dry-run, explicit confirmation, `allowMutations:true`, idempotency, checkpoint or edit-session protection, and post-mutation read-back.
- Do not infer parent layers from layer names, visual hierarchy indentation, screenshots, previous chat context, source type, label color, locked state, shy state, or approximate UI assumptions.
- Do not assign, clear, change, create, delete, duplicate, rename, reorder, or otherwise mutate parent links or layers; this recipe changes only active-comp selection state.
- Do not select recursive ancestors, children, descendants, siblings, unparented layers, random layers, label groups, guide layers, disabled layers, type-based layers, Project panel items, or layers in another comp.
- Require a separate typed-tool contract for parent-link mutation, recursive ancestor selection, cross-comp selection, Project panel selection, or exact source/native UI side effects.

## Verification

- The plan includes active comp evidence, current selected-layer evidence, and full enough layer inventory before computing parent targets.
- Dry-run evidence lists each selected child layer index/name, its typed parent evidence, each deduplicated parent layer index, and optional expected parent name.
- The `set_layer_selection` step reports the computed parent layer indices, replacement selection semantics, `verifyAfter:true`, and no non-selection mutation.
- The post-run `get_selected_layers` read-back shows exactly the expected parent-layer count, selected layer indices, and expected names.
- Empty, unparented, truncated, unsupported, or ambiguous parent discovery is reported as a typed-tool gap or no-op decision instead of approximate selection.
- Post-run evidence shows no parent-link mutation, recursive ancestor selection, child/descendant selection, layer order change, layer rename, timing/source/effect/keyframe/mask/project item/render queue mutation, or cross-comp selection.

# Select All Children Typed Plan

## Goal

Select all direct child layers of one reviewed parent layer in the active composition by deriving explicit child `layerIndices` from current typed layer inventory, applying `set_layer_selection`, and reading the selection back.

## Applies When

- The user asks to select all child layers, children of a selected layer, or children of an explicitly named/indexed parent layer.
- The target parent layer is identified from current active-comp evidence, either as the single selected layer or as one explicit layer from `get_comp_details`.
- Direct child layers can be derived from current `get_comp_details` layer inventory where each candidate child reports `parent.index` and parent identity.
- The accepted child set is converted into concrete one-based `layerIndices` before mutation.
- The task does not require recursive descendant traversal, parent reassignment, timeline edits, layer duplication, layer deletion, fuzzy parent matching, cross-comp selection, project-panel selection, or raw JSX execution.

## Plan Pattern

1. Run `get_active_comp` to confirm the active composition and capture the target comp identity.
2. Run `get_selected_layers` when the parent is implied by current selection. Accept the selected parent only when exactly one selected layer is returned, or fail closed and ask for an explicit parent.
3. Run `get_comp_details` with `includeLayers:true` and enough `layerLimit` for the active comp layer stack.
4. Bind the reviewed parent layer by explicit `parentLayerIndex` and optional `expectedParentName` from current evidence.
5. Compute `childLayerIndices` only from layers whose `parent.index` equals the reviewed `parentLayerIndex` and whose parent name/id evidence is consistent when available.
6. Fail closed when parent evidence is missing, the layer inventory is truncated, the parent has no direct children, child-parent evidence is absent, or the user expects recursive descendants or source-exact native side effects.
7. Run `set_layer_selection` once with the computed `childLayerIndices`, optional expected child names, replacement selection semantics, `verifyAfter:true`, and a stable `idempotencyKeyTemplate`.
8. Run `get_selected_layers` after mutation and report selected child count, selected layer indices, names, and the reviewed parent identity.

## Safety Gates

- Mutating selection state workflow.
- Requires validated Agent plan, dry-run, explicit confirmation, `allowMutations:true`, idempotency, checkpoint or edit-session protection, and post-mutation read-back.
- Do not infer parent-child relationships from layer names, visual nesting, previous chat context, source order, precomp membership, or timeline indentation unless the typed layer inventory reports parent evidence.
- Recursive descendants are unsupported by this advisory recipe; do not silently switch direct child selection into recursive descendant selection.
- Do not use raw ExtendScript to inspect or mutate selection state.
- Do not use this recipe for parenting changes, layer duplication/deletion/renaming, timing edits, keyframe edits, marker edits, effect edits, source relinking, render queue changes, project item selection, or broad timeline cleanup.

## Verification

- The plan includes active comp evidence, parent-layer evidence, and full enough layer inventory before computing child targets.
- Dry-run evidence lists `parentLayerIndex`, optional parent name/id evidence, computed `childLayerIndices`, and expected child names before confirmation.
- The `set_layer_selection` step reports the computed child layer indices, replacement selection semantics, `verifyAfter:true`, and no non-selection mutation.
- The post-run `get_selected_layers` read-back shows exactly the expected child count, selected child indices, and expected names.
- Empty or ambiguous child discovery is reported as a typed-tool gap or no-op decision instead of selecting approximate layers.
- Post-run evidence shows no parent reassignment, layer order change, layer rename, timing/source/effect/keyframe/mask/project item/render queue mutation, or recursive descendant selection.

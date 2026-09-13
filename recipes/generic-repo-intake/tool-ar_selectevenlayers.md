# tool-ar-selectevenlayers Intake Note

## Candidate

- Candidate id: `tool-ar-selectevenlayers`
- Queue alias: `tool-ar_selectevenlayers`
- Source path: `AR_SelectEvenLayers.jsx`
- Typed plan: `recipes/ar-selectevenlayers-typed-plan.md`

## Safe Adaptation

The candidate name indicates selected active-composition layer selection for an
even-indexed subset. In this detached child-run, the source JSX was not present
in the worktree, so the safe adaptation is limited to a reviewed typed-plan
pattern using existing layer inventory and selection tools.

The recipe gathers `get_active_comp` and `get_comp_details includeLayers:true`
evidence, binds an explicit `evenSelectionPolicy`, computes concrete one-based
`evenLayerIndices`, applies selection only through `set_layer_selection`, and
then reads the result back with `get_selected_layers`.

## Out Of Scope

Source-exact raw JSX execution, native UI side effects, hidden source selection
ordering, zero-based or selected-ordinal even semantics without explicit review,
cross-comp selection, Project panel selection, layer creation/deletion/
duplication/renaming/reordering/timing/source/effect/expression/keyframe/mask
changes, render queue work, filesystem writes, dependency changes, live
validation in the child-run, and non-generated user-asset mutation remain
fail-closed unless a separate reviewed typed-tool contract exists.

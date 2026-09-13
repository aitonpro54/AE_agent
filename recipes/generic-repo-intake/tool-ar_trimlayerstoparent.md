# tool-ar-trimlayerstoparent Intake Note

## Candidate

- Candidate id: `tool-ar-trimlayerstoparent`
- Queue alias: `tool-ar_trimlayerstoparent`
- Source path: `AR_TrimLayersToParent.jsx`
- Typed plan: `recipes/ar-trimlayerstoparent-typed-plan.md`

## Safe Adaptation

The candidate name indicates selected active-composition layer timing work that
trims child layers to the timing bounds of verified parent layers. In this
detached child-run, the source JSX was not present in the worktree, so the safe
adaptation is limited to a reviewed typed-plan pattern using existing
selected-layer, layer-detail, parent relationship read-back, and layer timing
tools.

The recipe gathers `get_active_comp`, `get_selected_layers`, `get_comp_details`
or `get_layer_details` evidence, binds an explicit
`trimLayersToParentSpec`, computes reviewed `targetTrimTiming` from each
verified parent layer's `inPoint` and `outPoint`, applies timing only through
`set_layer_time_range`, and then reads the result back with
`get_layer_details`.

## Out Of Scope

Source-exact raw JSX execution, hidden source selection ordering, native UI side
effects, parent assignment/removal, layer reordering, source footage trimming,
native undo semantics, startTime or stretch changes, parent layer mutation,
selection mutation, broad comp traversal, package/dependency changes, live
validation in the child-run, and non-generated user-asset mutation remain
fail-closed unless a separate reviewed typed-tool contract exists.

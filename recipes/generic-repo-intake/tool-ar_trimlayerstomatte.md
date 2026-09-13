# tool-ar-trimlayerstomatte Intake Note

## Candidate

- Candidate id: `tool-ar-trimlayerstomatte`
- Queue alias: `tool-ar_trimlayerstomatte`
- Source path: `AR_TrimLayersToMatte.jsx`
- Typed plan: `recipes/ar-trimlayerstomatte-typed-plan.md`

## Safe Adaptation

The candidate name indicates selected active-composition layer timing work that
trims fill layers to the timing bounds of verified track matte layers. In this
detached child-run, the source JSX was not present in the worktree, so the safe
adaptation is limited to a reviewed typed-plan pattern using existing
selected-layer, layer-detail, track-matte read-back, and layer timing tools.

The recipe gathers `get_active_comp`, `get_selected_layers`, `get_comp_details`
or `get_layer_details` evidence, binds an explicit
`trimLayersToMatteSpec`, computes reviewed `targetTrimTiming` from each
verified matte layer's `inPoint` and `outPoint`, applies timing only through
`set_layer_time_range`, and then reads the result back with
`get_layer_details`.

## Out Of Scope

Source-exact raw JSX execution, hidden source selection ordering, native UI side
effects, track matte creation/removal, layer reordering, source footage
trimming, native undo semantics, startTime or stretch changes, matte layer
mutation, selection mutation, broad comp traversal, package/dependency changes,
live validation in the child-run, and non-generated user-asset mutation remain
fail-closed unless a separate reviewed typed-tool contract exists.

# tool-ar-trimlayerstoworkarea Intake Note

## Candidate

- Candidate id: `tool-ar-trimlayerstoworkarea`
- Queue alias: `tool-ar_trimlayerstoworkarea`
- Source path: `AR_TrimLayersToWorkArea.jsx`
- Typed plan: `recipes/ar-trimlayerstoworkarea-typed-plan.md`

## Safe Adaptation

The candidate name indicates selected active-composition layer timing work that
trims selected layers to the active composition work area bounds. In this
detached child-run, the source JSX was not present in the worktree, so the safe
adaptation is limited to a reviewed typed-plan pattern using existing active
composition, selected-layer, comp-detail, layer-detail, and layer timing tools.

The recipe gathers `get_active_comp`, `get_selected_layers`,
`get_comp_details`, and `get_layer_details` evidence, binds an explicit
`trimLayersToWorkAreaSpec`, computes reviewed `targetTrimTiming` from the
verified work area start and end, applies timing only through
`set_layer_time_range`, and then reads the result back with
`get_layer_details`.

## Out Of Scope

Source-exact raw JSX execution, hidden source selection ordering, native UI side
effects, comp work area mutation, source footage trimming, native undo
semantics, startTime or stretch changes, selection mutation, broad comp
traversal, package/dependency changes, live validation in the child-run, and
non-generated user-asset mutation remain fail-closed unless a separate reviewed
typed-tool contract exists.

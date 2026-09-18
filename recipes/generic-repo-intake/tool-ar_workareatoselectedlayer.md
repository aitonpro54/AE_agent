# tool-ar-workareatoselectedlayer Intake Note

## Candidate

- Candidate id: `tool-ar-workareatoselectedlayer`
- Queue alias: `tool-ar_workareatoselectedlayer`
- Source path: `AR_WorkAreaToSelectedLayer.jsx`
- Typed plan: `recipes/ar-workareatoselectedlayer-typed-plan.md`

## Safe Adaptation

The candidate name indicates active-composition work-area mutation derived from
selected-layer timing. In this detached child-run, the source JSX was not
present in the worktree, so the safe adaptation is limited to a reviewed
typed-plan pattern using existing active composition, selected-layer,
layer-detail, comp-detail, and work-area mutation tools.

The recipe gathers `get_active_comp`, `get_selected_layers`,
`get_layer_details`, and `get_comp_details` evidence, binds an explicit
`workAreaToSelectedLayerSpec`, computes reviewed `targetWorkAreaTiming` from
selected-layer `inPoint` and `outPoint` evidence, applies the work area only
through `set_comp_work_area`, and then reads the result back with
`get_comp_details`.

## Out Of Scope

Source-exact raw JSX execution, hidden source selection ordering, native UI side
effects, layer retiming, source footage trimming, native undo semantics,
current-time inference, selection mutation, broad comp traversal,
package/dependency changes, live validation in the child-run, and non-generated
user-asset mutation remain fail-closed unless a separate reviewed typed-tool
contract exists.

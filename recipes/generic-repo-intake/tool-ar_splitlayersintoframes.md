# tool-ar-splitlayersintoframes Intake Note

## Candidate

- Candidate id: `tool-ar-splitlayersintoframes`
- Queue alias: `tool-ar_splitlayersintoframes`
- Source path: `AR_SplitLayersIntoFrames.jsx`
- Typed plan: `recipes/ar-splitlayersintoframes-typed-plan.md`

## Safe Adaptation

The candidate name indicates selected active-composition layer timing work that
places layers into frame-sized spans. In this detached child-run, the source JSX
was not present in the worktree, so the safe adaptation is limited to a reviewed
typed-plan pattern using existing selected-layer timing tools.

The recipe gathers `get_active_comp`, `get_selected_layers`, and
`get_layer_details` evidence, binds an explicit
`splitLayersIntoFramesSpec`, computes reviewed rounded one-frame `inPoint` and
`outPoint` values for each accepted layer, applies timing only through
`set_layer_time_range`, and then reads the result back with `get_layer_details`.

## Out Of Scope

Source-exact raw JSX execution, actual layer splitting, layer duplication,
source footage slicing, native undo semantics, hidden source selection ordering,
keyframe shifts, startTime or stretch changes, source timing changes, selection
mutation, broad comp traversal, package/dependency changes, live validation in
the child-run, and non-generated user-asset mutation remain fail-closed unless a
separate reviewed typed-tool contract exists.

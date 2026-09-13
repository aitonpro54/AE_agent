# tool-ar-trimlayerstokeyframes Intake Note

## Candidate

- Candidate id: `tool-ar-trimlayerstokeyframes`
- Queue alias: `tool-ar_trimlayerstokeyframes`
- Source path: `AR_TrimLayersToKeyframes.jsx`
- Typed plan: `recipes/ar-trimlayerstokeyframes-typed-plan.md`

## Safe Adaptation

The candidate name indicates selected active-composition layer timing work that
trims layers to keyframe-derived bounds. In this detached child-run, the source
JSX was not present in the worktree, so the safe adaptation is limited to a
reviewed typed-plan pattern using existing selected-layer, selected-property,
and layer timing tools.

The recipe gathers `get_active_comp`, `get_selected_layers`,
`get_selected_properties`, and `get_layer_details` evidence, binds an explicit
`trimLayersToKeyframesSpec`, computes reviewed rounded `inPoint` and `outPoint`
values from per-layer `selectedKeyframeBounds`, applies timing only through
`set_layer_time_range`, and then reads the result back with
`get_layer_details`.

## Out Of Scope

Source-exact raw JSX execution, native selected-key discovery, hidden source
selection ordering, keyframe movement, keyframe creation or deletion, time-remap
edits, source footage trimming, native undo semantics, startTime or stretch
changes, selection mutation, broad comp traversal, package/dependency changes,
live validation in the child-run, and non-generated user-asset mutation remain
fail-closed unless a separate reviewed typed-tool contract exists.

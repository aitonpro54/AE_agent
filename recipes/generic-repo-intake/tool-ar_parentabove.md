# tool-ar-parentabove Intake Note

## Candidate

- Candidate id: `tool-ar-parentabove`
- Queue alias: `tool-ar_parentabove`
- Source path: `AR_ParentAbove.jsx`
- Typed plan: `recipes/ar-parentabove-typed-plan.md`

## Safe Adaptation

The candidate name indicates a workflow that parents selected child layers to
the layer directly above each selected layer. In this detached child-run, the
source JSX was not present in the worktree, so the safe adaptation is limited
to a generated or explicitly reviewed typed-plan pattern using existing
`set_layer_parent` coverage.

The recipe gathers `get_active_comp`, `get_selected_layers`,
`get_comp_details`, and `get_layer_details` evidence, then builds a reviewed
`parentAboveSpec` with concrete same-comp child -> above-parent pairs. Mutation
is allowed only through `set_layer_parent` after normal confirmation,
checkpoint/edit-session, idempotency, and post-mutation read-back gates.

## Out Of Scope

Source-exact raw JSX execution, hidden selection ordering, native UI side
effects, layer reordering, automatic parent inference, broad non-generated
user-layer parenting, cycle-prone parent writes, track matte changes, expression
or effect edits, project-wide scans, package/dependency changes, live validation
in the child-run, and non-generated user-asset mutation remain fail-closed
unless a separate reviewed typed-tool contract exists.

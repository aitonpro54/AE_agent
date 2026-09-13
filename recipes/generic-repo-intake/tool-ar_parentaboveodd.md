# tool-ar-parentaboveodd Intake Note

## Candidate

- Candidate id: `tool-ar-parentaboveodd`
- Queue alias: `tool-ar_parentaboveodd`
- Source path: `AR_ParentAboveOdd.jsx`
- Typed plan: `recipes/ar-parentaboveodd-typed-plan.md`

## Safe Adaptation

The candidate name indicates a workflow related to parenting an odd subset of
selected child layers to the layer directly above each accepted child. In this
detached child-run, the source JSX was not present in the worktree, so the safe
adaptation is limited to a generated or explicitly reviewed typed-plan pattern
using existing `set_layer_parent` coverage.

The recipe gathers `get_active_comp`, `get_selected_layers`,
`get_comp_details`, and `get_layer_details` evidence, then builds a reviewed
`parentAboveOddSpec` with an explicit `oddSelectionPolicy`, concrete same-comp
odd child -> above-parent pairs, skipped even or unsupported targets, cycle
checks, and expected-name guards. Mutation is allowed only through
`set_layer_parent` after normal confirmation, checkpoint/edit-session,
idempotency, and post-mutation read-back gates.

## Out Of Scope

Source-exact raw JSX execution, source-specific odd-selection semantics, hidden
selection ordering, native UI side effects, layer reordering, automatic parent
inference, broad non-generated user-layer parenting, cycle-prone parent writes,
track matte changes, expression or effect edits, project-wide scans,
package/dependency changes, live validation in the child-run, and
non-generated user-asset mutation remain fail-closed unless a separate reviewed
typed-tool contract exists.

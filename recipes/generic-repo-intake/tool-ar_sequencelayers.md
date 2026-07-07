# tool-ar-sequencelayers Intake Note

## Candidate

- Candidate id: `tool-ar-sequencelayers`
- Queue alias: `tool-ar_sequencelayers`
- Source path: `AR_SequenceLayers.jsx`
- Typed plan: `recipes/ar-sequencelayers-typed-plan.md`

## Safe Adaptation

The candidate name indicates selected active-composition layer timing
sequencing. In this detached child-run, the source JSX was not present in the
worktree, so the safe adaptation is limited to a reviewed typed-plan pattern
using existing selected-layer timing tools.

The recipe gathers `get_active_comp`, `get_selected_layers`, and
`get_layer_details` evidence, binds an explicit `sequenceLayersSpec`, computes
reviewed rounded target `inPoint` and `outPoint` values for each accepted layer,
applies timing only through `set_layer_time_range`, and then reads the result
back with `get_layer_details`.

## Out Of Scope

Source-exact raw JSX execution, AE Keyframe Assistant dialog behavior, native
undo semantics, hidden source selection ordering, ambiguous overlap or dissolve
semantics, layer splitting, ripple edits, keyframe shifts, startTime or stretch
changes, source timing changes, selection mutation, broad comp traversal,
package/dependency changes, live validation in the child-run, and non-generated
user-asset mutation remain fail-closed unless a separate reviewed typed-tool
contract exists.

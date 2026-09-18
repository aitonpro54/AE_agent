# tool-ar_distributekeyframesbystep Intake Note

## Candidate

- Candidate id: `tool-ar-distributekeyframesbystep`
- Queue alias: `tool-ar_distributekeyframesbystep`
- Source path: `AR_DistributeKeyframesByStep.jsx`
- Typed plan: `recipes/ar-distributekeyframesbystep-typed-plan.md`

## Safe Adaptation

The candidate name indicates selected-keyframe timing distribution by a fixed
step. In this detached child-run, the source JSX was not present in the
worktree, so the safe adaptation is limited to a reviewed typed-plan pattern
using existing active composition, selected-property, layer-detail, and property
keyframe mutation tools.

The recipe gathers `get_active_comp`, `get_selected_properties`, and
`get_layer_details` evidence, binds an explicit
`distributeKeyframesByStepSpec`, computes reviewed `distributedKeyframes` from
explicit `selectedKeyframesToDistribute`, preserves unselected keyframes in a
full replacement sequence, applies keyframe timing only through
`set_property_keyframes clearExisting:true`, and then reads the result back with
`get_layer_details`.

## Out Of Scope

Source-exact raw JSX execution, native selected-key discovery, hidden UI
selection ordering, native dialog/default step behavior, unresolved same-time
key collisions, interpolation/ease or spatial tangent preservation without
explicit reviewed payloads, selection mutation, broad comp traversal,
package/dependency changes, live validation in the child-run, and non-generated
user-asset mutation remain fail-closed unless a separate reviewed typed-tool
contract exists.

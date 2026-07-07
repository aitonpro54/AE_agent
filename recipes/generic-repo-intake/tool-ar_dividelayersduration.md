# tool-ar-dividelayersduration Intake Note

## Candidate

- Candidate id: `tool-ar-dividelayersduration`
- Queue alias: `tool-ar_dividelayersduration`
- Source path: `AR_DivideLayersDuration.jsx`
- Typed plan: `recipes/ar-dividelayersduration-typed-plan.md`

## Safe Adaptation

The source intent divides selected layers into a sequence whose total length is
the first selected layer's current visible duration. The safe adaptation uses
`get_active_comp`, `get_selected_layers`, `get_layer_details`, and
`set_layer_time_range`.

Before mutation, the plan must bind selected-layer order, first selected layer
duration, comp frame rate, and every target layer's current timing. It then
builds a reviewed `divideLayersDurationSpec`, computes equal section durations,
rounds out points to frame boundaries, and changes only explicit reviewed target
layer `inPoint` and `outPoint` values.

## Out Of Scope

Source-exact raw JSX execution, native undo semantics, unreviewed AE selection
ordering, layer splitting, ripple edits, keyframe shifts, startTime or stretch
changes, source timing changes, selection mutation, broad comp traversal,
package/dependency changes, live validation in the child-run, and non-generated
user-asset mutation remain fail-closed.

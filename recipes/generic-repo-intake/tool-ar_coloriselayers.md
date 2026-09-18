# tool-ar-coloriselayers Intake Note

## Candidate

- Candidate id: `tool-ar-coloriselayers`
- Queue alias: `tool-ar_coloriselayers`
- Source path: `AR_ColoriseLayers.jsx`
- Typed plan: `recipes/ar-coloriselayers-typed-plan.md`

## Safe Adaptation

The candidate intent is treated as selected active-composition layer label
coloring. The supported adaptation uses `get_active_comp`,
`get_selected_layers`, `get_layer_details` or `get_comp_details includeLayers:true`,
and `set_layer_metadata`.

Every target layer must come from current selected-layer evidence, and the color
must be reviewed as one explicit AE `labelIndex` from `0` through `16` before
mutation. The recipe changes only `Layer.label` on accepted selected layer
indices and requires post-mutation read-back.

## Out Of Scope

Source-exact raw JSX execution, native palette UI behavior, automatic color
cycling, random label assignment, implicit color-name mapping, cross-comp
changes, Project item labels, property color values, selection mutation, layer
renames, timing/source/effect/expression/keyframe changes, render queue work,
project save/saveAs, and non-target user-asset mutation remain fail-closed.

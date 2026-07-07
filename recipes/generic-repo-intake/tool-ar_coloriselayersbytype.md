# tool-ar-coloriselayersbytype Intake Note

## Candidate

- Candidate id: `tool-ar-coloriselayersbytype`
- Queue alias: `tool-ar_coloriselayersbytype`
- Source path: `AR_ColoriseLayersByType.jsx`
- Typed plan: `recipes/ar-coloriselayersbytype-typed-plan.md`

## Safe Adaptation

The candidate intent is treated as active-composition layer label coloring based
on typed layer-kind evidence. The supported adaptation uses `get_active_comp`,
`get_selected_layers`, `get_comp_details`, `get_layer_details`, and
`set_layer_metadata`.

Every target layer must come from current typed active-comp evidence. Layer type
classification must use returned fields such as `type`, `layerType`,
`matchName`, `textLayer`, `shapeLayer`, `cameraLayer`, `lightLayer`,
`nullLayer`, `adjustmentLayer`, `guideLayer`, source/precomp evidence, or
equivalent available fields. The plan must disclose a reviewed
`typeToLabelMap` with AE label indices from `0` through `16` before mutation.

The recipe changes only `Layer.label` on accepted layer indices and requires
post-mutation read-back.

## Out Of Scope

Source-exact raw JSX execution, source-exact AR type classifier behavior, hidden
AE class checks, native palette UI behavior, automatic label selection,
implicit color-name mapping, cross-comp changes, Project item labels, property
color values, selection mutation, layer renames, timing/source/effect/
expression/keyframe changes, render queue work, project save/saveAs, broad
project scans, and non-target user-asset mutation remain fail-closed.

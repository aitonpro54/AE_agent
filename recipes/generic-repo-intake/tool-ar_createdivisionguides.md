# tool-ar-createdivisionguides Intake Note

## Candidate

- Candidate id: `tool-ar-createdivisionguides`
- Queue alias: `tool-ar_createdivisionguides`
- Source path: `AR_CreateDivisionGuides.jsx`
- Typed plan: `recipes/ar-createdivisionguides-typed-plan.md`

## Safe Adaptation

The candidate intent is treated as generated visual division guide overlays for
one explicit composition. The supported adaptation uses `create_comp` when a new
generated comp is requested, `get_comp_details` for comp dimensions and layer
inventory, `create_shape_layer` for generated guide overlays, optional
`add_effect`/`get_effect_details` for `ADBE Fill` styling, and
`get_layer_details` for guide overlay read-back.

The plan must review a `divisionGuideSpec` before mutation. Columns and rows are
converted into internal vertical and horizontal overlay lines from typed comp
width and height, then read back as generated layers.

## Out Of Scope

Source-exact raw JSX execution, ScriptUI prompt behavior, native
`CompItem.addGuide`, ruler guides, snapping, guide-index semantics, existing
guide deletion, hidden UI state, broad project scans, layer cleanup, user-layer
reordering, project save/saveAs, render queue work, package/dependency changes,
live validation in the child-run, and non-target user-asset mutation remain
fail-closed.

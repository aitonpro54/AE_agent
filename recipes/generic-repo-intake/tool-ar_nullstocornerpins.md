# tool-ar-nullstocornerpins Intake Note

## Candidate

- Candidate id: `tool-ar-nullstocornerpins`
- Queue alias: `tool-ar_nullstocornerpins`
- Source path: `AR_NullsToCornerPins.jsx`
- Typed plan: `recipes/ar-nullstocornerpins-typed-plan.md`

## Safe Adaptation

The candidate name indicates a workflow that connects null controllers to
Corner Pin effect points. In this detached child-run, the source JSX was not
present in the worktree, so the safe adaptation is limited to read-only typed
evidence and typed-tool-gap reporting.

The recipe may gather `get_active_comp`, `get_selected_layers`,
`get_selected_properties`, `get_layer_details`, `list_effects`, and
`get_effect_details` evidence, then report a reviewed
`nullsToCornerPinsSpec` describing the target layer, Corner Pin-like effect,
four reviewed null controllers, proposed point-property paths,
coordinate-space assumptions, expression/link assumptions, and skipped targets.

## Out Of Scope

Source-exact raw JSX execution, selected-layer ordering, automatic null layer
creation, Corner Pin effect creation, effect point mutation, expression/link
writes, parenting, coordinate conversion, cleanup, project-wide scans,
package/dependency changes, live validation in the child-run, and
non-generated user-asset mutation remain fail-closed until a separate reviewed
typed-tool contract exists.

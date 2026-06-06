# tool-properties-move-parametric-anchor-point

## Intake Decision

This candidate is accepted only as advisory typed-plan coverage through
`recipes/move-parametric-anchor-point-typed-plan.md`.

The source script opens a 3x3 ScriptUI chooser, reads
`app.project.activeItem.selectedProperties`, and writes a fixed expression to
selected properties whose matchName is `ADBE Vector Rect Position` or
`ADBE Vector Ellipse Position`. The safe imported behavior is narrower: bind
explicit rectangle or ellipse shape Position properties from current typed
evidence, choose a reviewed `anchorPositionKey`, call `set_expression`, and read
the result back with `get_layer_details`.

## Supported Typed Path

- `get_active_comp`
- `get_selected_properties` for current selected-property evidence, or
  `get_layer_details` for explicit generated shape-property evidence
- `set_expression`
- `get_layer_details`

## Fail-Closed Scope

- Modal ScriptUI chooser behavior
- Silent source no-op behavior for unsupported selected properties
- Broad `comp.selectedProperties` batch traversal without typed target evidence
- Layer Transform Anchor Point or Transform Position mutation
- Shape path geometry edits
- Existing expression overwrite without explicit review
- Keyframed/animated parametric Position preservation
- Selection state mutation or persistence
- Raw ExtendScript/JSX execution

## Validation Ownership

Parent Full Intaker validation owns registry checks, solution-library retrieval,
generated-only scenario proof, scoped live-lane retry, and final ledger/handoff
updates. Detached proposal workers must not write central ledger, plan, handoff,
or source checkout files.

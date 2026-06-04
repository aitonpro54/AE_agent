# Generic Repo Intake: tool-setcolor

## Candidate

- id: `tool-setcolor`
- kind: `tool`
- source path: `setColor.jsx`
- risk: `review_required`
- imported recipe: `recipes/setcolor-typed-plan.md`
- registry id: `setcolor-typed-plan`

## Review Summary

This candidate is accepted only as advisory typed-plan coverage for setting
explicit color properties that are already identified by current typed-tool
evidence. The detached child worktree did not include `setColor.jsx`, so this
recipe does not claim source-exact behavior and does not copy source JSX.

The safe adaptation uses existing AE Agent typed tools:

- `get_active_comp`
- `get_selected_properties`
- `set_property_value`
- `get_layer_details`

## Accepted Scope

- Read the active comp and current selected-property evidence.
- Bind only concrete selected color property targets with layer index, property
  path, current value, expression state, and keyframe/animation state when
  available.
- Normalize an explicit requested color to the current RGB or RGBA value shape.
- Set only static selected color-like properties through `set_property_value`.
- Read back affected layer details after mutation.
- Report skipped selected properties with explicit fail-closed reasons.

## Fail-Closed Scope

- Source-exact `setColor.jsx` behavior.
- Raw ExtendScript execution.
- Color picker UI behavior or implicit palette state.
- Broad fill/stroke/property discovery outside selected-property evidence.
- Animated, keyframed, expression-driven, text/document, path, or non-color
  properties.
- Layer label colors, layer names, effects, masks, sources, timing, render queue
  items, project items, selection changes, or unselected properties.

## Safety Notes

This is a mutating selected-property workflow. It requires normal Agent plan
validation, explicit confirmation, `allowMutations:true`, idempotency,
checkpoint or edit-session protection, and post-mutation read-back before any
live AE project change.

Parent importer owns validation, live acceptance, ledger updates, documentation,
handoff, commits, source merges, push, and PR work.

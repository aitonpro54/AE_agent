# tool-ar-linkpuppetpinstonulls Intake Note

## Candidate

- Candidate id: `tool-ar-linkpuppetpinstonulls`
- Queue alias: `tool-ar_linkpuppetpinstonulls`
- Source path: `AR_LinkPuppetPinsToNulls.jsx`
- Typed plan: `recipes/ar-linkpuppetpinstonulls-typed-plan.md`

## Safe Adaptation

The candidate name indicates a workflow that links Puppet pins to generated null
controllers. In this detached child-run, the source JSX was not present in the
worktree, so the safe adaptation is limited to read-only typed evidence and
typed-tool-gap reporting.

The recipe may gather `get_active_comp`, `get_selected_layers`,
`get_selected_properties`, `get_layer_details`, and `get_effect_details`
evidence, then report a reviewed `linkPuppetPinsToNullsSpec` describing the
Puppet effect, pin atom/property paths, proposed generated null controllers,
link expression assumptions, and skipped targets.

## Out Of Scope

Source-exact raw JSX execution, selected Puppet pin traversal, automatic null
layer creation, controller placement, expression/link writes, Puppet pin atom
mutation, parenting, cleanup, user Puppet/DuIK effect mutation, project-wide
scans, Alt-key behavior, package/dependency changes, live validation in the
child-run, and non-generated user-asset mutation remain fail-closed until a
separate reviewed typed-tool contract exists.

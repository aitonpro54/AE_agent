# tool-layers-stick-effect-to-layer Intake Note

## Parent Reducer Decision

- Candidate id: `tool-layers-stick-effect-to-layer`
- Source path: `Layers/Stick_Effect_To_Layer.jsx`
- Status: accepted only as a scoped typed-plan/proof-lane adaptation.

## Safe Adaptation

The source idea is represented by
`recipes/stick-effect-to-layer-typed-plan.md`. No raw source JSX is copied. The
adaptation uses current typed evidence for explicit property targets and applies
only the reviewed expression `toComp(anchorPoint + value);` through
`set_expression`.

The generated-only proof lane uses a generated comp/layer/effect target,
`add_effect`, `get_effect_details`, `set_expression`, and post-mutation
read-back. Source-exact traversal through `comp.selectedProperties`, automatic
effect discovery, overwrite of existing expressions without review,
non-2D-spatial properties, selection persistence, and raw ExtendScript remain
fail-closed.

## Validation Owner

Parent reducer owns registry validation, solution-library smoke coverage, the
generated-only live lane entry, scoped Full Intaker retry evidence, plan/handoff
updates, and the reviewable milestone commit.

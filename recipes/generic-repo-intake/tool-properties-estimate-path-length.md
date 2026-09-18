# tool-properties-estimate-path-length Intake Note

## Parent Reducer Decision

- Candidate id: `tool-properties-estimate-path-length`
- Source path: `Properties/Estimate_Path_Length.jsx`
- Status: accepted only as a scoped generated-only typed-plan/proof-lane
  adaptation.

## Safe Adaptation

The source idea is represented by
`recipes/estimate-path-length-typed-plan.md`. No raw source JSX is copied. The
adaptation uses existing typed tools on an explicit generated shape layer:
`add_effect`, `set_effect_property`, `set_expression`, `get_effect_details`,
and `get_layer_details`.

The generated-only proof lane creates a generated comp and parametric rectangle
shape layer, adds generated `Path Samples` and `Path Length` Slider Control
effects, sets `Path Samples` to `100`, applies a reviewed rectangle-perimeter
sampling expression to the Path Length slider value, and reads both effects,
the sampled value, and expression state back.

Source-exact traversal through `comp.selectedProperties`, arbitrary selected
path references, arbitrary Bezier `pointOnPath` geometry, mask paths, Bezier
geometry reads/writes, keyframed paths, existing slider reuse, selection
persistence, file output, and raw ExtendScript remain fail-closed.

## Validation Owner

Parent reducer owns registry validation, solution-library smoke coverage, the
generated-only live lane entry, scoped Full Intaker retry evidence, plan/handoff
updates, and the reviewable milestone commit.

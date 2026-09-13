# tool-properties-flip-path Intake Note

## Parent Reducer Decision

- Candidate id: `tool-properties-flip-path`
- Source path: `Properties/Flip_Path.jsx`
- Status: accepted only as a scoped generated-only typed-plan/proof-lane
  adaptation.

## Safe Adaptation

The source idea is represented by `recipes/flip-path-typed-plan.md`. No raw
source JSX is copied. The adaptation uses the parent-approved path geometry
typed tools on one explicit generated or reviewed target:
`get_path_geometry` and `set_path_geometry`.

The generated-only proof lane creates a generated comp, generated layer, and
generated mask path; writes known keyframed geometry; reads the full path
geometry; computes reviewed horizontal or vertical flipped vertices plus
in/out tangents around the bounding-box center; writes the flipped keyframed
geometry with `set_path_geometry`; and reads it back with `get_path_geometry`.

Source-exact ScriptUI direction dialogs, broad `comp.selectedProperties`
traversal, arbitrary user-selected paths, expression-driven path mutation,
multi-target path batches, shape/mask deletion, file output, Essential
Graphics, Puppet pins, third-party effects, and raw ExtendScript remain
fail-closed.

## Validation Owner

Parent reducer owns registry validation, solution-library smoke coverage, the
generated-only live lane entry, scoped Full Intaker retry evidence, plan/handoff
updates, and the reviewable milestone commit.

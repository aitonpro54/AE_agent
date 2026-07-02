# tool-markers-add-markers-at-out-points Intake Note

## Source

- Repository: `https://github.com/reviewed external AE script collection`
- Source path: `Markers/Add_Markers_At_Out_Points.jsx`
- Candidate id: `tool-markers-add-markers-at-out-points`
- License: source repository license is missing in the importer ledger; parent
  review is required before any source-derived promotion.

## Adaptation

This intake adapts only the composition-marker-at-layer-out-points intent into
`recipes/add-composition-markers-at-out-points-typed-plan.md`. No raw JSX is
copied into the product.

The safe supported path is generated-only or explicitly approved: read one
explicit composition and its layers with `get_comp_details`, build reviewed
composition-marker targets from finite layer out-point evidence, add those
markers with `add_comp_marker`, and verify through
`get_comp_details includeMarkers:true`.

## Fail-Closed Scope

- Source-exact active-comp traversal, native undo grouping, hidden layer
  traversal, marker update/delete, layer-marker substitution, audio-derived
  markers, current-time inference, work-area mutation, layer timing changes,
  render queue work, file I/O, and raw ExtendScript require separate reviewed
  contracts.
- User-composition marker mutation requires normal Agent mutation gates and
  explicit target review; generated-only proof must use generated
  compositions/layers.

## Validation

- Parent reducer accepts this candidate only as a non-live generated-only
  contract/lane adaptation over `get_comp_details`, `add_comp_marker`, and
  composition marker read-back.
- Parent validation owns registry validation, solution-library validation,
  semantic verification, generated-only scenario/report wiring, scoped Full
  Intaker proof path, and the final reviewable commit.

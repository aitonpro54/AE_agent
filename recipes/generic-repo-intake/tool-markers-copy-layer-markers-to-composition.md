# tool-markers-copy-layer-markers-to-composition Intake Note

## Source

- Repository: `https://github.com/reviewed external AE script collection`
- Source path: `Markers/Copy_Layer_Markers_To_Composition.jsx`
- Candidate id: `tool-markers-copy-layer-markers-to-composition`
- License: source repository license is missing in the importer ledger; parent
  review is required before any source-derived promotion.

## Adaptation

This intake adapts only the marker-copy intent into
`recipes/copy-layer-markers-to-composition-typed-plan.md`. No raw JSX is copied
into the product.

The safe supported path is generated-only or explicitly approved: read one
explicit source layer through `get_layer_details`, bind reviewed layer marker
evidence, add corresponding composition markers with `add_comp_marker`, and
verify with `get_comp_details includeMarkers:true`.

## Fail-Closed Scope

- Source-exact active-comp traversal, selected-layer traversal, native undo
  grouping, marker update/delete, audio-derived markers, layer marker mutation,
  work-area mutation, layer timing changes, render queue work, file I/O, and raw
  ExtendScript require separate reviewed contracts.
- User-composition mutation requires normal Agent mutation gates and explicit
  target review; generated-only proof must use generated compositions.

## Validation

- Parent reducer accepts this candidate only as a non-live generated-only
  contract/lane adaptation over `get_layer_details`, `add_comp_marker`, and
  `get_comp_details`.
- Parent validation owns registry validation, solution-library validation,
  semantic verification, generated-only scenario/report wiring, scoped Full
  Intaker proof path, and the final reviewable commit.

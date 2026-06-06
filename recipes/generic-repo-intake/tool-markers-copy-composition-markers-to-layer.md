# tool-markers-copy-composition-markers-to-layer Intake Note

## Source

- Repository: `https://github.com/kyletmartinez/after-effects-scripts`
- Source path: `Markers/Copy_Composition_Markers_To_Layer.jsx`
- Candidate id: `tool-markers-copy-composition-markers-to-layer`
- License: source repository license is missing in the importer ledger; parent
  review is required before any source-derived promotion.

## Adaptation

This intake adapts only the marker-copy intent into
`recipes/copy-composition-markers-to-layer-typed-plan.md`. No raw JSX is copied
into the product.

The safe supported path is generated-only or explicitly approved: read
composition markers through `get_comp_details` with `includeMarkers:true`, bind
one explicit target layer from current typed evidence, add corresponding layer
markers with `add_layer_marker`, and verify with `get_layer_details`.

## Fail-Closed Scope

- Source-exact active-comp traversal, selected-layer traversal, native undo
  grouping, marker update/delete, audio-derived markers, composition marker
  mutation, layer timing changes, render queue work, file I/O, and raw
  ExtendScript require separate reviewed contracts.
- User-layer mutation requires normal Agent mutation gates and explicit target
  review; generated-only proof must use generated layers.

## Validation

- Parent reducer accepts this candidate only as a non-live generated-only
  contract/lane adaptation over `get_comp_details`, `add_layer_marker`, and
  `get_layer_details`.
- Parent validation owns registry validation, solution-library validation,
  semantic verification, generated-only scenario/report wiring, scoped Full
  Intaker proof path, and the final reviewable commit.

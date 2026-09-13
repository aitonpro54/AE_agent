# tool-lottie-prepare-layer-out-points-for-lottie Intake Note

## Source

- Repository: `https://github.com/reviewed external AE script collection`
- Source path: `Lottie/Prepare_Layer_Out_Points_For_Lottie.jsx`
- Candidate id: `tool-lottie-prepare-layer-out-points-for-lottie`
- Source SHA256:
  `f4ae518ab34cc68a0895b197d587e5a233385acc4fb4fd1329da9cd33a0c1d82`
- License: source repository license is missing in the importer ledger; parent
  review is required before any source-derived promotion.

## Adaptation

This intake adapts only the Lottie timing intent into
`recipes/prepare-layer-out-points-for-lottie-typed-plan.md`. No raw JSX is
copied into the product.

The safe supported path is generated-only and explicit: inspect a generated
composition with `get_comp_details`, compute one frame from `frameRate`, set
reviewed layer `outPoint` values through `set_layer_time_range`, and read the
target layers back with `get_comp_details` or `get_layer_details`.

## Fail-Closed Scope

- Source-exact all-project `CompItem` traversal is not reproduced.
- User composition mutation, implicit project-wide scans, Lottie exporter hidden
  state, native undo grouping, raw ExtendScript execution, file I/O, render
  queue work, project item changes, marker edits, expression/keyframe edits,
  layer source relinking, and broad cleanup require separate reviewed
  contracts.
- Layers that do not currently end exactly at the reviewed composition duration
  are skipped unless the user provides a separate explicit timing request.

## Validation

- Parent reducer owns registry validation, solution-library validation,
  generated-only timing lane proof, scoped Full Intaker retry evidence, and the
  final reviewable commit.

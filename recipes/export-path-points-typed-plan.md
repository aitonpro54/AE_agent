# Export Path Points Typed Plan

## Scope

Use this recipe only to export path vertices from one generated or explicitly
reviewed Shape or Mask path target after current `get_path_geometry` evidence
has identified the exact target.

This adapts only the safe idea behind source path-point export: round vertices
to two decimal places, rotate the first point to the end, and write
`var points = ...;` to a generated local text artifact. It does not implement
Desktop writes, broad `comp.selectedProperties` traversal, arbitrary user file
paths, raw ExtendScript, or selected-path discovery.

## Required Evidence

- Current `get_path_geometry` evidence for the explicit comp, layer, target
  kind, mask index/name or shape `propertyPath`, vertices, `inTangents`,
  `outTangents`, `closed`, expression state, and keyframe truncation state.
- Do not infer selected paths from prior chat context; read the exact target in
  the current plan before exporting.
- The target is generated or explicitly reviewed, and the geometry is not
  truncated.
- The requested export file is a simple generated `.txt` filename, not a path.

## Plan Pattern

1. Run `get_active_comp` or create a generated comp before export to capture
   target context.
2. Run `get_path_geometry` for exactly one Shape or Mask path target.
3. Fail closed if the target is ambiguous, expression-driven, geometry is
   missing or truncated, or the request requires Desktop/user-path output.
4. Prepare `vertices` directly from the current `get_path_geometry` geometry.
5. Run `export_path_points` with the reviewed vertices, `decimalPlaces:2`,
   `rotateFirstPointToEnd:true`, and a simple generated `outputFileName`.
6. Run `get_path_geometry` again for the same target to prove the export did
   not mutate path geometry.

## Safety Gates

- Plan validation must accept only `get_path_geometry` plus
  `export_path_points` for the export step.
- Keep the normal mutating gates: explicit confirmation, mutation permission,
  idempotency, checkpoint/edit-session policy, and post-export read-back.
- File output is limited to the bridge generated export folder
  `logs/generated-exports/` or `AE_AGENT_GENERATED_EXPORT_DIR`.
- `outputFileName` must be a simple `.txt` filename. Absolute paths, relative
  paths, Desktop writes, project folders, user-selected files, and overwrite of
  arbitrary files are rejected.
- Use `deleteAfterReadBack:true` for generated proof cleanup when the exported
  artifact itself is not the user-requested deliverable.
- Source-exact selected property traversal and raw JSX remain fail-closed.

## Verification

- `export_path_points` returns the generated `outputPath`, `byteLength`,
  `sha256`, `contentPreview`, exported `points`, and cleanup state.
- The exported content must match `var points = <rounded-rotated-points>;`.
- A post-export `get_path_geometry` read-back must show the same target
  geometry as the pre-export evidence.
- Unsupported Desktop/user path export, broad selected path traversal,
  expression-driven paths, missing read-back, or raw ExtendScript must be
  reported as typed-tool gaps.

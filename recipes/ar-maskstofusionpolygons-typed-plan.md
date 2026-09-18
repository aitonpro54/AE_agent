# AR Masks To Fusion Polygons Typed Plan

## Goal

Export one reviewed AE Mask path as generated Fusion Polygon text by reading
typed path geometry, building an explicit `fusionPolygonExportSpec`, writing a
generated local text artifact, and reading the same path geometry back.

## Applies When

- The user asks to convert AE masks to Fusion polygons, export mask paths as
  Fusion Polygon nodes, or references `AR_MasksToFusionPolygons.jsx`.
- Current `get_path_geometry` evidence can bind exactly one generated or
  explicitly reviewed Mask path target before export.
- A generated `.txt` export through `export_text_to_file` is acceptable instead
  of clipboard writes, Desktop/user paths, native dialogs, raw Fusion settings
  files, raw ExtendScript, or exact source JSX behavior.
- The request can be narrowed to current vertices, tangents, closed state, comp
  dimensions, and a reviewed coordinate mapping policy.
- If source-exact selected mask traversal, multi-mask batch conversion,
  animated mask conversion, roto/mask feather fidelity, clipboard behavior,
  arbitrary output paths, or raw JSX is required, fail closed and require a
  separate typed-tool contract.

## Plan Pattern

1. Run `get_active_comp` to bind active comp identity, dimensions, frame rate,
   and current selected context.
2. Run `get_path_geometry` for exactly one explicit Mask path target. Require
   target kind, comp identity, layer index/name, mask index/name, vertices,
   inTangents, outTangents, closed state, expression state, keyframe/truncation
   state, and coordinate-space assumptions.
3. Fail closed when target identity is ambiguous, geometry is missing or
   truncated, expression state is enabled, animated mask handling is required
   without a reviewed policy, comp dimensions are missing for normalized Fusion
   coordinates, or the target is not generated or explicitly reviewed.
4. Build a reviewed `fusionPolygonExportSpec` before export. It must include
   comp identity, layer and mask identity, source vertex/tangent counts,
   closed-state handling, coordinate normalization policy, Fusion Polygon node
   name, output file name, accepted target, and skipped-target reasons.
5. Generate Fusion Polygon text only from the reviewed path geometry and
   `fusionPolygonExportSpec`; do not claim source-exact Fusion serialization
   unless a separate contract proves the exact format.
6. Run `export_text_to_file` with the reviewed generated text and a simple
   generated `.txt` output file name under the generated export root.
7. Run `get_path_geometry` again for the same target and compare vertices,
   tangents, closed state, and target identity with the pre-export evidence.

## Safety Gates

- File-output workflow: requires validated Agent plan, dry-run, explicit
  confirmation, `allowMutations:true`, idempotency, checkpoint/edit-session
  protection, and post-export read-back.
- File output is limited to `logs/generated-exports/` or
  `AE_AGENT_GENERATED_EXPORT_DIR`; absolute paths, relative paths, Desktop
  writes, native prompts, clipboard writes, and overwrite of arbitrary files
  are rejected.
- Do not infer masks from screenshots, prior chat context, layer names, hidden
  selection state, broad `selectedProperties` traversal, or source-script
  assumptions.
- Do not create, delete, rename, reorder, retime, parent, or relink layers; do
  not edit mask/path geometry, effects, expressions, keyframes, sources,
  Project items, render queue items, selection state, or user files.
- Do not execute source JSX, use raw ExtendScript, write raw Fusion settings,
  launch external editors, mutate the clipboard, or promise exact Fusion
  Polygon fidelity without a reviewed typed contract.

## Verification

- Pre-export evidence identifies the active comp, exact layer and Mask path
  target, vertices, inTangents, outTangents, closed state, expression-disabled
  state, non-truncated geometry, comp dimensions, and reviewed coordinate
  mapping assumptions.
- Dry-run evidence shows the reviewed `fusionPolygonExportSpec`, accepted
  target, skipped-target reasons, generated Fusion Polygon node name, output
  file name, and a bounded text preview.
- `export_text_to_file` reports generated output path, output file name,
  byteLength, sha256, contentPreview, exportedText, and cleanup state when
  cleanup is requested.
- The generated text contains one reviewed Fusion Polygon-style node payload for
  the accepted mask and preserves the reviewed point count, closed-state policy,
  and coordinate mapping disclosure.
- Post-export `get_path_geometry` shows unchanged vertices, inTangents,
  outTangents, closed state, target identity, layer stack, source, timing,
  effects, expressions, keyframes, Project items, render queue items, and
  selection state.
- Unsupported source-exact selected mask traversal, multi-mask batch conversion,
  animated mask conversion, roto/feather fidelity, clipboard behavior,
  arbitrary output paths, raw Fusion settings, raw ExtendScript, and exact
  source JSX semantics are reported as typed-tool gaps.

# Export Text To File Typed Plan

## Scope

Use this recipe only when selected-layer text export can be narrowed to current
typed evidence and a generated local `.txt` artifact.

This adapts only the safe payload shape from the source script: for each
selected layer, write its ordinal header line, then the layer Source Text, or
`[Not a text layer]` for non-text selected layers, followed by a blank line. It does not implement
Desktop writes, arbitrary user file paths, `~/Desktop/export.txt`,
source-exact UI selection side effects, raw ExtendScript, or Project panel file
operations.

## Required Evidence

- Current `get_selected_layers` evidence identifies the active composition,
  selected layer count, layer indices, names, and text-layer/non-text state.
- Current `get_layer_details` evidence is present for every selected text
  layer and includes `text.text` Source Text.
- Non-text selected layers are explicitly represented in the exported evidence
  and produce the `[Not a text layer]` fallback line.
- The requested export file is a simple generated `.txt` filename, not a path.
- The output stays under the bridge generated export root:
  `logs/generated-exports/` or `AE_AGENT_GENERATED_EXPORT_DIR`.

## Plan Pattern

1. Run `get_active_comp` or `get_selected_layers` to bind the active
   composition and selected layer order.
2. Run `get_layer_details` for each selected text layer that will contribute
   Source Text to the export.
3. Fail closed if selected-layer evidence is empty, text layers lack
   `Source Text` read-back, layer evidence is truncated, order is ambiguous, or
   the request requires Desktop/user-path output.
4. Run `export_text_to_file` with the reviewed selected-layer evidence,
   `expectedLayerCount`, and a simple generated `.txt` `outputFileName`.
5. Run `get_selected_layers` or equivalent current layer read-back after export
   to prove the operation did not mutate the AE project layer selection/stack.

## Safety Gates

- Plan validation must accept only typed selected-layer read tools,
  `get_layer_details`, and `export_text_to_file` for the file-output step.
- Keep the normal mutating gates for file output: explicit confirmation,
  mutation permission, idempotency, checkpoint/edit-session policy, and
  post-export read-back.
- File output is limited to the bridge generated export folder
  `logs/generated-exports/` or `AE_AGENT_GENERATED_EXPORT_DIR`.
- `outputFileName` must be a simple `.txt` filename. Absolute paths, relative
  paths, Desktop writes, project folders, user-selected files, and overwrite of
  arbitrary files are rejected.
- Use `deleteAfterReadBack:true` for generated proof cleanup when the exported
  artifact itself is not the user-requested deliverable.
- Source-exact `~/Desktop/export.txt`, native file dialogs, broad file system
  writes, source checkout execution, and raw JSX remain fail-closed.

## Verification

- `export_text_to_file` returns the generated `outputPath`, `outputFileName`,
  `byteLength`, `sha256`, `contentPreview`, `exportedText`, per-layer evidence
  summary, and cleanup state.
- The exported content must match an ordinal header line, Source Text, and a
  blank line for text layers; non-text layers use the same block shape with
  `[Not a text layer]` in the reviewed order.
- A post-export selected-layer or layer-details read-back must show the same
  selected/generated layer evidence; no layer stack, Source Text, Project item,
  render queue, or user asset is mutated by the export.
- Unsupported Desktop/user path export, missing Source Text read-back,
  arbitrary output paths, selected-layer ambiguity, missing hash/read-back, or
  raw ExtendScript must be reported as typed-tool gaps.

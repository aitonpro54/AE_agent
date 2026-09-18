# AR Create Fusion Loaders Typed Plan

## Goal

Export reviewed Blackmagic Fusion Loader node text for selected AVLayers from
current typed layer/source evidence, writing only a generated `.txt` artifact.

## Applies When

- The user asks to create Fusion loaders, Fusion Loader nodes, or references
  `AR_CreateFusionLoaders.jsx`.
- The request can be narrowed to selected active-comp AVLayers whose footage
  source path, frame rate, source duration, in point, out point, and start time
  are available through typed read-back.
- A generated text export is acceptable instead of source-exact temp-folder
  output, native file opening, clipboard behavior, or raw ExtendScript.
- The workflow uses a reviewed `fusionLoaderExportSpec` with explicit selected
  layer order, allowed file formats, output filename, and any image-sequence
  start-frame evidence.
- The workflow does not require exporting raw Fusion settings, arbitrary user
  file paths, unsupported footage formats, Project panel selection, render queue
  work, or exact source JSX behavior.

## Plan Pattern

1. Run `get_active_comp` and `get_selected_layers` to bind the active
   composition, selected-layer count, and selected layer order.
2. Run `get_layer_details` for every selected layer that may contribute a
   Fusion Loader, and require current AVLayer footage evidence: source file
   path, source frame rate, source duration/frame count, layer in point, out
   point, and start time.
3. Build a reviewed `fusionLoaderExportSpec` before file output. It must include
   the selected layer indices/names in export order, one simple generated `.txt`
   `outputFileName`, allowed format mapping, computed trim frames, and
   image-sequence start frames when needed.
4. Map only reviewed file extensions to Fusion format ids: `jpg` to
   `JpegFormat`, `png` to `PNGFormat`, `tif` to `TiffFormat`, `dpx` to
   `DPXFormat`, `exr` to `OpenEXRFormat`, `mov` and `mp4` to
   `QuickTimeMovies`, and `R3D` to `R3DFormat`.
5. Fail closed when selected-layer evidence is empty, layer order is ambiguous,
   any target is not an AVLayer with file-backed footage, timing/source evidence
   is missing, an image-sequence start frame cannot be proven or reviewed, an
   extension is unsupported, or the task requires raw Fusion settings.
6. Generate the Fusion Loader text from reviewed evidence only. Include
   `Tools=ordered(){`, one `LoaderN = Loader` block per accepted layer, escaped
   file paths, `TrimIn`, `TrimOut`, `GlobalEnd`, and the reviewed format fields.
7. Run `export_text_to_file` with the reviewed loader text and simple generated
   `.txt` filename under `logs/generated-exports/` or
   `AE_AGENT_GENERATED_EXPORT_DIR`.
8. Run `get_selected_layers` or `get_layer_details` again after export to prove
   AE project state, selected layers, and source/timing evidence were not
   mutated by the file-output step.

## Safety Gates

- File-output workflow with normal mutating gates: validated Agent plan,
  dry-run, explicit confirmation, `allowMutations:true`, idempotency,
  checkpoint or edit-session policy, and post-export read-back.
- File output is limited to the bridge generated export root:
  `logs/generated-exports/` or `AE_AGENT_GENERATED_EXPORT_DIR`.
- `outputFileName` must be a simple `.txt` filename. Absolute paths, relative
  paths, temp-folder writes, Desktop writes, project folders, user-selected
  files, native file dialogs, editor launch, and arbitrary overwrite are
  rejected.
- Use only typed selected-layer and layer-detail evidence. Do not infer footage
  paths, start frames, timing, selected layer order, or supported formats from
  screenshots, prior chat context, source filenames alone, or unavailable source
  script state.
- Preserve existing layers, sources, masks, effects, expressions, keyframes,
  selection state, comp timing, project items, render queue items, source files,
  and all non-generated user assets.
- Do not execute source JSX, call `File.execute`, write to `Folder.temp`, access
  the clipboard, export raw Fusion settings, open external editors, or mutate
  After Effects project state as part of this recipe.

## Verification

- Pre-export evidence identifies the active comp, selected layer order, each
  accepted AVLayer name/index, source file path, frame rate, source duration or
  frame count, in point, out point, start time, computed `TrimIn`, computed
  `TrimOut`, computed `GlobalEnd`, and reviewed file format id.
- Dry-run evidence shows the reviewed `fusionLoaderExportSpec`, output filename,
  accepted/skipped layers, skipped-target reasons, computed loader count, and
  generated Fusion text preview without raw settings.
- `export_text_to_file` returns generated `outputPath`, `outputFileName`,
  `byteLength`, `sha256`, `contentPreview`, exported text evidence, and cleanup
  state.
- The exported text contains `Tools=ordered(){` and exactly one `LoaderN =
  Loader` block per accepted layer, with reviewed `Filename`, `FormatID`,
  `TrimIn`, `TrimOut`, and `GlobalEnd` values.
- Post-export selected-layer or layer-details read-back shows no layer stack,
  source, timing, expression, effect, Project item, render queue, temp-folder,
  Desktop/user path, raw JSX, or non-generated user-asset mutation.
- Unsupported raw Fusion settings export, missing source/timing evidence,
  unsupported formats, temp-folder/editor behavior, arbitrary output paths,
  selected-layer ambiguity, missing hash/read-back, or exact source JSX behavior
  are reported as typed-tool gaps.

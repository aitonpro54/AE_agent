# tool-ar-createfusionloaders Intake Note

## Candidate

- Candidate id: `tool-ar-createfusionloaders`
- Queue alias: `tool-ar_createfusionloaders`
- Source path: `AR_CreateFusionLoaders.jsx`
- Typed plan: `recipes/ar-createfusionloaders-typed-plan.md`

## Safe Adaptation

The candidate intent is treated as a generated text export workflow for
Blackmagic Fusion Loader nodes from selected active-comp AVLayers. The supported
adaptation uses `get_active_comp`, `get_selected_layers`, `get_layer_details`,
and `export_text_to_file`.

Every accepted layer must have current typed evidence for AVLayer/file-backed
source identity, source path, source timing, layer in/out/start timing, reviewed
file format mapping, and any image-sequence start-frame value. The generated
Fusion Loader text is written only as a simple `.txt` artifact under the bridge
generated export root.

## Out Of Scope

Source-exact raw JSX execution, temp-folder writes, `File.execute`, external
editor launch, clipboard behavior, arbitrary user paths, Desktop writes, native
file dialogs, raw Fusion settings export, unsupported footage formats, inferred
start frames, Project panel selection, render queue work, package/dependency
changes, live validation in the child-run, and non-generated user-asset mutation
remain fail-closed.

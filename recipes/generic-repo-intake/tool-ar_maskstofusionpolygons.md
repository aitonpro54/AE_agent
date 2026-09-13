# tool-ar-maskstofusionpolygons Intake Note

## Candidate

- Candidate id: `tool-ar-maskstofusionpolygons`
- Queue alias: `tool-ar_maskstofusionpolygons`
- Source path: `AR_MasksToFusionPolygons.jsx`
- Typed plan: `recipes/ar-maskstofusionpolygons-typed-plan.md`

## Safe Adaptation

The candidate name indicates a workflow that converts AE Mask paths into Fusion
Polygon node text. In this detached child-run, the source JSX was not present in
the worktree, so the safe adaptation is limited to one explicit generated or
reviewed Mask path target and generated text export.

The recipe may gather `get_active_comp` and `get_path_geometry` evidence, build a
reviewed `fusionPolygonExportSpec`, write generated Fusion Polygon-style text
through `export_text_to_file`, and read the same path geometry back. It does not
claim source-exact Fusion serialization or clipboard behavior.

## Out Of Scope

Source-exact raw JSX execution, broad selected mask traversal, multi-mask batch
conversion, animated mask conversion, roto or feather fidelity, clipboard
mutation, native dialogs, Desktop/user-path writes, arbitrary Fusion settings
export, path mutation, layer mutation, package/dependency changes, live
validation in the child-run, and non-generated user-asset mutation remain
fail-closed until separate reviewed typed-tool contracts exist.

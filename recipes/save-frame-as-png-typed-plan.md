# Save Frame As PNG Typed Plan

## Scope

Use this recipe only when the task can be narrowed to saving one reviewed frame
from one explicit generated composition to a sandboxed generated PNG artifact.

This adapts only the safe frame-output intent: a current generated composition
is inspected, one time in seconds is reviewed, `save_comp_frame_png` writes a
simple `.png` file under `logs/generated-exports/` or
`AE_AGENT_GENERATED_EXPORT_DIR`, and the bridge returns byte length, `sha256`,
PNG identity, and `resolutionFactor` restoration evidence. It does not
implement Desktop writes, `Folder.selectDialog`, user-selected output folders,
source-exact `app.settings/app.preferences` persistence, Shift-key branching,
render queue rendering, project save/saveAs, or raw ExtendScript.

## Required Evidence

- Current `get_active_comp` or `get_comp_details` evidence identifies exactly
  one generated composition target, including name, item index, duration,
  frame rate, dimensions, current time, and layer count.
- The requested frame time is explicit, finite, and inside the composition
  duration. If current time is used, it must come from current typed evidence.
- The output is a simple generated `.png` filename, not a path.
- The output stays under the bridge generated export root:
  `logs/generated-exports/` or `AE_AGENT_GENERATED_EXPORT_DIR`.
- The plan discloses any requested `resolutionFactor`; default proof uses
  `[1, 1]` and requires restoration read-back.

## Plan Pattern

1. Run `get_active_comp` or `get_comp_details` for the generated target
   composition.
2. Fail closed if the target is ambiguous, non-generated, outside the current
   project evidence, or needs Project panel selection semantics.
3. Choose one explicit frame time and one simple `.png` `outputFileName`.
4. Run `save_comp_frame_png` with `compName` or `compItemIndex`,
   `expectedCompName`, `time`, `outputFileName`, and a reviewed
   `resolutionFactor`.
5. Run `get_comp_details` again for the same composition to prove comp identity,
   layer count, timing, and dimensions remain bounded after file output.

## Safety Gates

- Plan validation must accept only typed composition read tools plus
  `save_comp_frame_png` for the file-output step.
- Keep the normal mutating gates: explicit confirmation, mutation permission,
  idempotency, checkpoint/edit-session policy, and post-export read-back.
- File output is limited to the bridge generated export folder
  `logs/generated-exports/` or `AE_AGENT_GENERATED_EXPORT_DIR`.
- `outputFileName` must be a simple `.png` filename. Absolute paths, relative
  paths, Desktop writes, project folders, user-selected files, and overwrite of
  arbitrary files are rejected.
- Use `deleteAfterReadBack:true` for generated proof cleanup when the PNG is
  only validation evidence; user-deliverable generated exports may remain in the
  generated export root.
- Source-exact settings persistence, keyboard-state semantics, selected-folder
  output, render queue start, and raw JSX remain fail-closed.

## Verification

- `save_comp_frame_png` returns `outputFileName`, generated `outputPath`,
  `byteLength`, `sha256`, `mimeType:"image/png"`, frame time evidence, and
  cleanup state.
- `save_comp_frame_png.resolutionFactor.restored:true` proves the original
  composition `resolutionFactor` was restored.
- A post-export `get_comp_details` read-back shows the same composition
  identity, dimensions, duration, frame rate, layer count, and reviewed target.
- Unsupported Desktop/user path export, source-exact settings behavior,
  missing hash/read-back, render start, user-asset mutation, or raw ExtendScript
  must be reported as typed-tool gaps.

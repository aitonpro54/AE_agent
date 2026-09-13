# Project File Render Proxy Safety Policy

## Scope

Use this policy recipe for project/file/render/proxy/user-file requests from the
reopened Full Intaker backlog when the request cannot be narrowed to an existing
generated-only typed plan.

Covered examples include render execution, render queue cleanup, save-frame or
PNG-sequence export, text or SRT file import/export, project-file reveal,
proxy removal or proxy relinking from folders, generated/user folder cleanup,
and third-party project folder cleanup such as Overlord. This policy records a
fail-closed review path only; it does not approve any file, render, proxy, or
cleanup mutation by itself.

Existing narrow exceptions stay separate:

- `add-folder-to-render-queue-typed-plan` may add explicit generated
  compositions to the render queue without starting a render. Any optional
  render output path must be a generated output filename under
  `logs/generated-renders/` or `AE_AGENT_GENERATED_RENDER_OUTPUT_DIR`; it must
  not be an arbitrary project, Desktop, or user folder path.
- `export-path-points-typed-plan` may write reviewed path vertices only to the
  bridge generated export root with hash read-back.
- `set-project-item-labels-to-none-typed-plan` may update explicit generated
  Project item labels with read-back.

## Plan Pattern

1. Classify the request before planning mutation. Record whether it needs
   render start, render queue deletion/reordering, project save/saveAs, user
   file read/write, OS reveal/open, proxy relinking, proxy removal, imported
   folder cleanup, or third-party folder assumptions.
2. Run only read-only typed context tools when classification needs evidence:
   `get_project_info`, `get_project_snapshot`, `find_project_items`,
   `list_project_folder_items`, and `get_render_queue_status`.
3. Prefer an existing narrow generated-only recipe when the request exactly
   matches one. Do not widen that recipe to cover user files, render execution,
   cleanup, proxies, project save, or arbitrary output paths.
4. If no narrow recipe exists, return a typed-tool gap with the required future
   contract, generated fixture, checkpoint/edit-session policy, cleanup/rollback
   path, and read-back evidence.
5. Do not synthesize raw ExtendScript, shell commands, BridgeTalk,
   OS file-browser actions, direct filesystem cleanup, or render starts as a
   workaround.

## Safety Gates

- This policy recipe is a high-risk mutation gate. Classification may gather
  read-only typed evidence, but matched requests must not perform mutation unless
  a separate narrow contract and the full mutation gate set exist.
- Future approval-gated contracts must be scoped to generated/temp assets first,
  have explicit user approval for the risk class, and include checkpoint or
  edit-session protection plus rollback notes.
- File-output contracts must write only under an approved generated artifact
  root, return byte length and `sha256`, and reject Desktop, arbitrary project
  paths, user-selected files, and overwrite of unrelated files.
- File-input contracts must bind a user-approved file or generated fixture,
  validate extension/content limits, and reject broad folder traversal.
- Render contracts must separate render queue setup from render start. Optional
  render queue output setup must stay under `logs/generated-renders/` or
  `AE_AGENT_GENERATED_RENDER_OUTPUT_DIR`. Render start, output module writes
  outside the generated render root, output folder writes, and rendered
  artifact cleanup need explicit approval and read-back.
- Proxy contracts must prove every target item from current project evidence,
  distinguish generated from user assets, and include reversible proxy state
  read-back before and after mutation.
- Cleanup contracts must enumerate every deletion target before mutation,
  require generated-prefix or explicit user approval, and provide rollback or
  backup evidence.

## Verification

- Planner output includes a risk classification and either names a matching
  narrow generated-only recipe or reports a typed-tool gap.
- Read-only preflight evidence, when used, comes only from project/render queue
  inspection tools and does not mutate Project items, render queue items,
  proxies, files, folders, comps, layers, sources, or selection state.
- Unsupported requests explicitly mention the missing contract and the future
  unblock condition: generated fixture, explicit approval, checkpoint/rollback,
  file/render/proxy cleanup policy, and typed read-back.
- The plan never starts a render, deletes render queue items, removes Project
  items, relinks proxies, reveals project files in the OS, imports user files,
  writes arbitrary output paths, cleans folders, saves the project, or executes
  raw script code under this policy.

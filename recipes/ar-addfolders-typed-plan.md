# AR Add Folders Typed Plan

## Goal

Create reviewed generated Project folders through existing typed bridge tools,
without raw JSX or Project panel selection assumptions.

## Applies When

- The user asks to add one or more Project folders, including requests that
  reference `AR_AddFolders.jsx`.
- A safe adaptation is acceptable: every folder name is reviewed before
  mutation and created as a generated Project folder.
- Current typed project evidence can be read before mutation with
  `get_project_info` and `get_project_snapshot`.
- The workflow does not require Project panel selection discovery, folder
  deletion, item movement, source relinking, render queue work, filesystem
  traversal, project save/saveAs, or exact source JSX behavior.

## Plan Pattern

1. Run `get_project_info` and `get_project_snapshot` to capture the current
   project context and existing Project folder inventory.
2. Bind a reviewed list of generated destination folder names from the user
   request or dry-run plan. Do not infer names from prior chat context,
   screenshots, or source script UI defaults.
3. For each reviewed folder name, check current evidence for an existing folder
   with the same intended name. Use `allowExisting:false` unless the user has
   explicitly approved reusing an existing generated folder.
4. Run `create_project_folder` once per reviewed generated folder name with a
   stable idempotency key.
5. Run `find_project_items` or `list_project_folder_items` after creation to
   read back every generated folder identity.
6. Report created folders, skipped existing folders, and any unsupported source
   behavior in the final evidence.
7. Fail closed if the task requires Project panel selection of folders/items, broad
   project organization, folder deletion, moving project items, importing files,
   filesystem folder traversal, render queue changes, project save/saveAs, or
   raw script execution.

## Safety Gates

- Mutating Project folder creation workflow.
- Requires validated Agent plan, dry-run, explicit confirmation,
  `allowMutations:true`, idempotency, and post-mutation read-back.
- Use checkpoint or edit-session protection for confirmed live runs.
- Folder names must be reviewed in the dry-run plan before mutation.
- Preserve existing item names, item sources, item types, parent folders, comp
  contents, layer source references, render queue items, project files, and all
  unlisted Project items.
- Do not use this recipe to move Project items into folders; use a separate
  explicit-item movement recipe when that is requested and proven safe.

## Verification

- Pre-run typed evidence identifies the project and current folder inventory.
- The dry-run plan lists every reviewed generated folder name and whether
  existing folders with those names were found.
- Each `create_project_folder` result reports the expected generated folder
  name and folder identity.
- Post-run `find_project_items` or `list_project_folder_items` read-back shows
  every created generated folder.
- Post-run `get_project_snapshot` shows no unexpected project item deletion,
  rename, source replacement, layer relink, import, render queue mutation,
  project file write, filesystem access, or folder cleanup.
- Unsupported Project panel selection, selected-folder semantics, folder
  deletion, item movement, filesystem traversal, save/saveAs, and exact source
  JSX behavior are reported as typed-tool gaps.

# Add Selection To New Folder Typed Plan

## Goal

Create one new generated Project folder and move explicitly identified generated
Project items into it through existing typed bridge tools.

## Applies When

- The user asks to add selected Project items to a new folder.
- A safe adaptation is acceptable: each target Project item is bound to concrete
  `itemIndices` from current typed project evidence before mutation.
- The new destination folder has a reviewed generated name and is created with
  `create_project_folder`.
- If the task depends only on current Project panel selection, fail closed:
  current typed tools do not expose selected Project items.

## Plan Pattern

1. Run `get_project_info` to establish the current project context.
2. Run `get_project_snapshot`, `find_project_items`, or
   `list_project_folder_items` to enumerate the generated target items.
3. Bind a concrete `itemIndices` list only from current typed evidence. Do not
   infer selected Project panel items from screenshots, chat history, or source
   script semantics.
4. Create one new generated Project folder with `create_project_folder`,
   `allowExisting:false`, and a reviewed folder name.
5. Run one `move_project_items_to_folder` step with only the explicit
   `itemIndices` and the newly created folder target.
6. Run `list_project_folder_items` and `get_project_snapshot` after mutation to
   verify that every accepted item is under the new folder and no unlisted item
   moved.
7. Fail closed if exact source JSX semantics, Project panel selection reads,
   empty-selection UI alerts, folder deletion, item rename, source relinking,
   import/export, render queue work, filesystem access, or broad project
   mutation is required.

## Safety Gates

- Mutating project-item organization workflow.
- Requires validated Agent plan, dry-run, explicit confirmation,
  `allowMutations:true`, idempotency, and post-mutation read-back.
- Use checkpoint or edit-session protection for confirmed live runs.
- Require current typed evidence for every moved Project item before binding
  `itemIndices`.
- Preserve item names, item sources, item types, comp contents, layer source
  references, render queue items, existing folders, project files, and all
  unlisted Project items.

## Verification

- Pre-run typed evidence identifies every concrete `itemIndices` entry and its
  expected item name/type.
- `create_project_folder` returns the new generated folder identity.
- `move_project_items_to_folder` reports only the accepted target count.
- Post-run `list_project_folder_items` shows every accepted item under the new
  folder.
- Post-run `get_project_snapshot` shows no unexpected item deletion, rename,
  source replacement, layer relink, import, render queue mutation, project file
  write, filesystem access, or folder cleanup.

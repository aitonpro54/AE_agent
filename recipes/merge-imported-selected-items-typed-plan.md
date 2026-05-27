# Merge Imported Selected Items Typed Plan

## Goal

Переместить явно определенные imported project items из импортированной папки или найденного набора в project root или явно выбранную project folder через existing typed bridge tools.

## Applies When

- Пользователь просит merge imported selected items, merge imported AEP items into the current project, move imported selected project items out of an import folder, or flatten imported project folder contents into a destination folder/root.
- Допустима safe adaptation: enumerate imported project items with typed project inspection, bind explicit `itemIndices`, then move those items with `move_project_items_to_folder`.
- The target imported items are identified by current `get_project_snapshot`, `find_project_items`, or `list_project_folder_items` evidence before mutation.
- The destination is the project root with `targetRoot:true` or one explicit destination folder identified by current typed evidence.
- If the user needs project-panel selection reads, automatic duplicate-name merging, imported wrapper folder deletion, dependency graph cleanup, layer source relinking, footage consolidation, item deletion, or exact source JSX behavior, fail closed and request a separate typed-tool contract.
- Задача не требует raw script execution, deleting project items, deleting folders, importing files, replacing layer sources, renaming project items, render queue edits, or broad template cleanup.

## Plan Pattern

1. Run `get_project_info` to establish the current project and active item context.
2. Run `get_project_snapshot` with bounded item limits when the request depends on current project inventory or imported folder names.
3. Run `find_project_items` for an explicitly named import folder/item set, or `list_project_folder_items` for an explicitly identified imported folder.
4. Fail closed if the task depends only on current project-panel selection; current typed tools do not expose selected project items.
5. Bind a concrete `itemIndices` list only from current typed evidence. Exclude destination folder indices unless the user explicitly wants folder movement and `includeFolders:true` is safe.
6. Bind the destination as either `targetRoot:true` or one current typed folder reference by `targetFolderItemIndex` or exact `targetFolderName`.
7. Run one `move_project_items_to_folder` step with the explicit `itemIndices` and destination. Do not delete imported wrapper folders or rename items as part of this recipe.
8. Include `verifyAfter:true` and a stable `idempotencyKeyTemplate` on the mutating project-item move step.
9. Run `get_project_snapshot` and, when a folder is involved, `list_project_folder_items` after mutation to confirm the moved items and unchanged project item inventory.
10. Fail closed instead of using raw script execution when exact source JSX semantics, automatic project-panel selection, duplicate-name merge behavior, source relinking, dependency cleanup, folder deletion, or broad project mutation is required.

## Safety Gates

- Mutating project-item organization workflow.
- Requires validated Agent plan, dry-run, explicit confirmation, `allowMutations:true`, idempotency and post-mutation read-back.
- Use checkpoint or edit-session protection for confirmed live runs.
- Require current typed evidence for every moved project item and the destination before binding `itemIndices`.
- Preserve item names, item sources, layer references, footage files, comp contents, folder contents not listed in `itemIndices`, render queue items and active comp layer stacks unless a separate typed plan explicitly covers those changes.
- Do not promise project-panel selection reads, automatic duplicate-name merging, imported wrapper folder deletion, dependency cleanup, footage consolidation, source relinking, item deletion, folder deletion or exact source JSX semantics.
- Do not use this recipe for import file operations, project item rename, layer source replacement, deep precomp/source duplication, render queue changes, user-asset cleanup, or broad project mutation.

## Verification

- The plan reads current project inventory before any mutation with `get_project_info` plus `get_project_snapshot`, `find_project_items`, or `list_project_folder_items`.
- Imported item candidates are listed from one explicit folder or query and converted into a concrete `itemIndices` list before `move_project_items_to_folder`.
- The destination is explicitly proven as project root with `targetRoot:true` or a single typed destination folder reference.
- Post-run `get_project_snapshot` shows the same project item identities still exist, with no unexpected deletion, rename, relink, import, or source replacement.
- Post-run `list_project_folder_items` shows every moved imported item now belongs to the target root/folder and no unlisted project items were moved.
- Exact source JSX semantics for project-panel selection, duplicate-name merge behavior, folder deletion, dependency cleanup, source relinking, or imported wrapper cleanup are reported as typed-tool gaps.

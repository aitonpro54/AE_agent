# tool-ar-addfolders Intake Note

## Candidate

- Candidate id: `tool-ar-addfolders`
- Queue alias: `tool-ar_addfolders`
- Source path: `AR_AddFolders.jsx`
- Typed plan: `recipes/ar-addfolders-typed-plan.md`

## Safe Adaptation

The candidate intent is treated as a generated Project folder creation
workflow. The supported adaptation uses `get_project_info`,
`get_project_snapshot`, `create_project_folder`, and read-back through
`find_project_items` or `list_project_folder_items`.

Every folder name must be reviewed in the dry-run plan before mutation. The
recipe creates generated Project folders only and preserves existing Project
items, folder contents, sources, render queue state, project files, and
non-generated user assets.

## Out Of Scope

Source-exact raw JSX execution, Project panel selected-folder or selected-item
reads, broad project organization, moving items into folders, deleting folders,
renaming items, importing files, traversing filesystem folders, source relinking,
render queue work, project save/saveAs, and non-generated user-asset mutation
remain fail-closed.

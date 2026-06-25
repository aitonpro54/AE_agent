# Generic Repo Intake: Rename Composition To File Name

- Candidate: `tool-compositions-rename-composition-to-file-name`
- Source path: `Compositions/Rename_Composition_To_File_Name.jsx`
- Typed recipe: `recipes/rename-composition-to-file-name-typed-plan.md`
- Live lane family: `composition-rename-to-file-name-generated-only`

## Safe Adaptation

The source intent is reduced to a generated-only typed workflow:

1. Read `get_project_info.file` and derive a reviewed project file basename.
2. Bind one explicit generated composition project item through
   `find_project_items` / `get_comp_details`.
3. Rename only that concrete comp project item with `rename_project_items`
   `mode:"exact"` and `type:"comp"`.
4. Read back the renamed generated comp through `find_project_items` and
   `get_comp_details`.

## Fail-Closed Scope

Do not copy raw JSX or source prompt behavior. Project panel selection,
unsaved-project inference, arbitrary path reads, project save/saveAs, file
export, source relinking, comp duplication, broad all-composition traversal,
non-generated user assets, render queue work, and raw ExtendScript remain out
of scope.

`usesFileIo` is accepted only as read-only project path evidence returned by
`get_project_info.file`; the product workflow must not perform filesystem
mutation.

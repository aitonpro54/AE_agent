# Generic Repo Intake: tool-project-add-selection-to-new-folder

- Candidate: `tool-project-add-selection-to-new-folder`
- Source: `Project/Add_Selection_To_New_Folder.jsx`
- Safe recipe: `recipes/add-selection-to-new-folder-typed-plan.md`

Use the recipe only for explicit generated Project items. The source-exact
script works from Project panel selection and creates a new folder for that
selection, but current typed tools do not expose selected Project items. The
safe adaptation therefore requires current typed project evidence, concrete
`itemIndices`, one reviewed generated folder name, `create_project_folder`,
`move_project_items_to_folder`, and folder/project read-back.

Keep Project panel selection reads, empty-selection UI behavior, non-generated
user assets, item rename/delete, source relinking, import/export, render queue
work, filesystem operations, broad project mutation, raw ExtendScript, and
source JSX copy out of scope.

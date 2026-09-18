# Generic Repo Intake: tool-project-add-folder-to-render-queue

## Source

- Candidate: `tool-project-add-folder-to-render-queue`
- Source path: `Project/Add_Folder_To_Render_Queue.jsx`
- Source intent: select one Project panel folder, recursively find nested `CompItem` objects, and add each composition to the Render Queue.

## Safe Adaptation

Use `recipes/add-folder-to-render-queue-typed-plan.md` only when the selected-folder behavior has been narrowed to one explicit generated Project folder. The generated-only plan reads folder contents with `list_project_folder_items`, verifies generated composition targets with `get_comp_details`, adds concrete comps through `add_comp_to_render_queue`, optionally updates reviewed output settings with `set_render_queue_output`, and reads back status with `get_render_queue_status`.

## Fail Closed

Keep source-exact Project panel selected-folder discovery, non-generated/user folder traversal, filesystem folder traversal, render execution, render queue cleanup/deletion, project save/saveAs, raw ExtendScript, dependency changes, source-checkout writes, and non-generated user-asset mutation out of scope.

No source JSX was copied.

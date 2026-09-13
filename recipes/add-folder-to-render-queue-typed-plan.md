# Add Folder To Render Queue Typed Plan

## Goal

Добавить композиции из явно заданной generated Project folder в render queue через existing typed bridge tools, без запуска рендера.

## Applies When

- Пользователь просит add folder to render queue or queue comps from a project folder.
- Safe adaptation is acceptable: the folder target is an explicit generated folder name or item index proven with current typed project evidence.
- The requested source behavior has been narrowed from Project panel selection to explicit folder binding. Current typed tools do not expose Project panel selected folder state.
- This recipe is for generated composition project items only; non-generated folders, footage, files, arbitrary project selection, and ambiguous nested inventory must fail closed.
- Optional output path and render/output module templates are explicit reviewed values. If no output settings are requested, only queue insertion is performed.
- If the request needs true Project panel selected-folder discovery, queueing non-generated user comps, folder cleanup, render start, render queue deletion/reordering, file output, save/saveAs, or exact source JSX behavior, fail closed and require a separate typed-tool contract.
- Задача не требует raw script execution, render start, project save/saveAs, non-generated user-asset mutation, source replacement, import/export, folder deletion, or broad project mutation.

## Plan Pattern

1. Run `get_project_info` and `get_render_queue_status` to establish project and render queue baseline.
2. Resolve the explicit generated folder by exact generated folder name or `folderItemIndex`. Use `find_project_items` with `type:"folder"` when a folder name needs binding.
3. Run `list_project_folder_items` with `recursive:true`, `type:"comp"`, and a bounded `limit` for the explicit generated folder.
4. Require every accepted target to be a generated composition project item. Use `get_comp_details` for each accepted comp before mutation and record item identity, name, width, height, duration, frame rate, layer count, and current render queue baseline.
5. Fail closed when the folder is missing, duplicated, not generated, derived only from Project panel selection, contains non-generated/user comps, contains footage-only targets, or requires filesystem folder traversal.
6. Compute and disclose `renderQueueFolderPlan`: explicit folder identity, accepted comp item indices/names, skipped items, baseline render queue count, optional output settings, expected new queue items, and the Project-panel selection limitation.
7. Run one `add_comp_to_render_queue` step per accepted generated comp using concrete `compItemIndex` or exact `compName`. Include reviewed `renderSettingsTemplate`, `outputModuleTemplate`, and/or `outputPath` only when requested.
8. When output settings need adjustment after queue insertion, run `set_render_queue_output` with concrete new `renderQueueItemIndex` values and no render start.
9. Run `get_render_queue_status` after mutation with a limit large enough to include the new items. Verify queued comp names, item indices, status, and output module/path evidence.

## Safety Gates

- Mutating render queue setup workflow for generated compositions from one explicit generated Project folder only.
- Requires validated Agent plan, dry-run, explicit confirmation, `allowMutations:true`, idempotency, checkpoint or edit-session protection, and post-mutation read-back.
- Require current `list_project_folder_items`, `get_comp_details`, and `get_render_queue_status` evidence before adding any comp to the render queue.
- Mutate only the render queue by adding explicit generated composition items and optional reviewed output settings. Do not start renders, save the project, delete/reorder render queue items, change comp settings, layers, sources, footage, folders, expressions, masks, effects, keyframes, labels, or non-generated user assets.
- Treat Project panel selected-folder discovery and filesystem folder traversal as typed-tool gaps unless a separate contract exists.
- Do not use this recipe for render execution, render queue cleanup, Project panel selection reads, non-generated assets, arbitrary output templating, user-asset cleanup, filesystem folder traversal, or raw script execution.

## Verification

- The plan reads render queue baseline with `get_render_queue_status` before mutation.
- The plan binds one explicit generated Project folder and lists its composition contents with `list_project_folder_items`.
- Pre-run `get_comp_details` records every accepted generated composition name, item identity, width, height, duration, frame rate, layer count, and comp item identity.
- Dry-run evidence lists accepted comps, skipped targets, baseline render queue count, optional output settings, and the current Project-panel selection limitation.
- The mutating steps use `add_comp_to_render_queue` with concrete generated comp identity and, when needed, `set_render_queue_output` with concrete render queue item indices.
- Post-run `get_render_queue_status` shows new render queue items for the accepted generated comps, expected item count increase, reviewed output settings when provided, and no render started.
- The plan reports Project panel folder selection, filesystem folder traversal, non-generated user assets, render start, queue deletion/reordering, save/saveAs, and exact source JSX semantics as typed-tool gaps.

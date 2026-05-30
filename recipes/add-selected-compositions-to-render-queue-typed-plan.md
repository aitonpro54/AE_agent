# Add Selected Compositions To Render Queue Typed Plan

## Goal

Добавить явно определенные generated composition project items в render queue через existing typed bridge tools, без запуска рендера.

## Applies When

- Пользователь просит add selected compositions to render queue, queue selected comps, or add selected generated compositions to the render queue.
- Safe adaptation is acceptable: selected compositions are already translated into explicit generated comp names or project item indices by the user or a prior safe planning step.
- Current typed tools do not expose Project panel selected composition state, so Project-panel selection reads are a typed-tool gap unless explicit target composition evidence already exists.
- Optional output path and render/output module templates are explicit reviewed values. If no output settings are requested, only queue insertion is performed.
- This recipe is for generated compositions only; non-generated user assets, footage, folders, arbitrary project selection, and ambiguous project inventory must fail closed.
- If the request needs true Project panel selection discovery, selected footage/folder handling, render start, render queue deletion/reordering, arbitrary output templating, source relinking, save/saveAs, or exact source JSX behavior, fail closed and request a separate typed-tool contract.
- Задача не требует raw script execution, render start, project save/saveAs, non-generated user-asset mutation, source replacement, import/export, comp/layer mutation, or broad project mutation.

## Plan Pattern

1. Run `get_project_info` and `get_render_queue_status` to establish project/render queue baseline before mutation.
2. Run `find_project_items` for each explicit generated composition name or narrow generated-prefix query. Use `type:"comp"` and bounded limits.
3. Require every accepted target to be a composition project item and generated asset. Use `get_comp_details` for each accepted comp before mutation and record item identity, name, width, height, duration, frame rate, layer count and current render queue baseline.
4. Fail closed when targets are missing, duplicated, not compositions, not generated, derived only from Project panel selection, or mixed with footage/folders/non-generated user assets.
5. Compute and disclose `renderQueueAddPlan`: target comp item indices/names, baseline render queue count, optional output path/template settings, expected new queue items, skipped targets and the Project-panel selection limitation.
6. Run one `add_comp_to_render_queue` step per accepted generated comp using concrete `compItemIndex` or exact `compName`. Include reviewed `renderSettingsTemplate`, `outputModuleTemplate`, and/or `outputPath` only when the user requested them.
7. When output settings need adjustment after queue insertion, run `set_render_queue_output` with the concrete new `renderQueueItemIndex`, reviewed output settings, and no render start.
8. Run `get_render_queue_status` after mutation with a limit large enough to include the new items. Verify the queued comp names, queue item indices, status and output module/path evidence.
9. Fail closed instead of using raw script execution when the request needs automatic Project panel selected-comp discovery, adding footage or folders, rendering, queue cleanup, queue reordering, save/saveAs, or exact source JSX semantics.

## Safety Gates

- Mutating render queue setup workflow for generated compositions only.
- Requires validated Agent plan, dry-run, explicit confirmation, `allowMutations:true`, idempotency and post-mutation read-back.
- Use checkpoint or edit-session protection for confirmed live runs.
- Require current `find_project_items`, `get_comp_details`, and `get_render_queue_status` evidence before adding any comp to the render queue.
- Mutate only the render queue by adding explicit generated composition items and optional reviewed output settings. Do not start renders, save the project, delete/reorder render queue items, change comp settings, layers, sources, footage, folders, expressions, masks, effects, keyframes, labels, or non-generated user assets.
- Treat Project panel selected composition discovery as a typed-tool gap unless targets are already explicit. Do not infer selected compositions from names, labels, prior chat context, or unavailable panel state.
- Do not use this recipe for render execution, render queue cleanup, Project panel selection reads, selected footage/folder handling, source relinking, source replacement, template batch updates, user-asset cleanup, or raw script execution.

## Verification

- The plan reads render queue baseline with `get_render_queue_status` before mutation.
- The plan uses `find_project_items` to identify explicit generated composition project items before mutation.
- Pre-run `get_comp_details` records every target generated composition name, item identity, width, height, duration, frame rate, layer count and comp item identity.
- Dry-run evidence lists accepted comp targets, skipped targets, baseline render queue count, optional output settings and the current Project-panel selection limitation.
- The mutating steps use `add_comp_to_render_queue` with concrete generated comp identity and, when needed, `set_render_queue_output` with concrete render queue item indices.
- Post-run `get_render_queue_status` shows new render queue items for the accepted generated comps, expected item count increase, reviewed output settings when provided, and no render started.
- The plan reports Project panel selection reads, footage/folder queueing, non-generated user assets, render start, queue deletion/reordering, save/saveAs and exact source JSX semantics as typed-tool gaps.

# Rename Selected Project Items Typed Plan

## Goal

Переименовать явно определенные project items в один явный user-provided text через existing typed bridge tools.

## Applies When

- Пользователь просит rename selected project items, rename selected items in the Project panel, or rename a known set of project items to a concrete text value.
- Safe adaptation is acceptable: current typed evidence must identify the project items as explicit `itemIndices` before mutation.
- The target text must be explicitly provided by the user and must be non-empty.
- Current typed tools can rename project items by explicit `itemIndices` or a scoped search, but do not expose current Project panel selection.
- If the request depends only on live Project panel selection, selection order, prompt/UI behavior, or exact source JSX semantics, fail closed and request a separate typed-tool contract.
- Задача не требует layer rename, project item movement, source relinking, item deletion, import operations, folder cleanup, render queue edits, dependency cleanup, or raw script execution.

## Plan Pattern

1. Run `get_project_info` to establish current project context.
2. Run `get_project_snapshot` with bounded item limits when current project inventory or item names are needed.
3. Run `find_project_items` for an explicitly named item set, or `list_project_folder_items` for an explicitly identified folder scope.
4. Fail closed if the task depends only on current Project panel selection; current typed tools do not expose selected project items.
5. Bind a concrete `itemIndices` list only from current typed evidence. Do not infer items from prior chat context.
6. Choose one explicit non-empty user-provided `targetName`.
7. Run one `rename_project_items` step per concrete project item with `itemIndices:[itemIndex]`, `mode:"exact"`, and the same explicit `name` value for that item.
8. Include `verifyAfter:true` and a stable `idempotencyKeyTemplate` on each mutating project-item rename step.
9. Run `get_project_snapshot`, `find_project_items`, or `list_project_folder_items` after mutation to confirm every renamed item and unchanged unrelated project inventory.
10. Fail closed instead of using raw script execution when exact source JSX semantics, Project panel selection reads, selection ordering, automatic prompt behavior, source relinking, item deletion, or broad project mutation is required.

## Safety Gates

- Mutating project-item rename workflow.
- Requires validated Agent plan, dry-run, explicit confirmation, `allowMutations:true`, idempotency and post-mutation read-back.
- Use checkpoint or edit-session protection for confirmed live runs.
- Require current typed evidence for every renamed project item before binding `itemIndices`.
- Preserve item sources, item types, parent folders, comp contents, layer source references, footage files, render queue items and unlisted project items.
- Do not promise Project panel selection reads, source-exact prompt behavior, selection ordering, source relinking, import cleanup, project item movement, project item deletion, folder deletion, dependency cleanup or exact source JSX semantics.
- Do not use this recipe for layer rename, selected-layer rename, project item movement, source replacement, deep precomp/source duplication, render queue changes, user-asset cleanup, or broad project mutation.

## Verification

- The plan reads current project inventory before any mutation with `get_project_info` plus `get_project_snapshot`, `find_project_items`, or `list_project_folder_items`.
- Every renamed project item is bound from current typed evidence into a concrete `itemIndices` entry before `rename_project_items`.
- Each `rename_project_items` call targets exactly one project item with `mode:"exact"` and reports `changedCount:1` plus before/after rename evidence.
- Post-run project read-back shows every affected item has the exact requested target text.
- Post-run project read-back shows no unexpected project item deletion, movement, source replacement, layer relink, import, render queue mutation or folder cleanup.
- Exact source JSX semantics for Project panel selection, selection order, prompt behavior, item filtering, or automatic multi-item naming are reported as typed-tool gaps.

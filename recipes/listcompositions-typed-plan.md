# List Compositions Typed Plan

## Goal

Report current project composition inventory from typed bridge read-back evidence, without copying source JSX or relying on hidden AE `CompItem` traversal.

## Applies When

- The user asks to list compositions in the current project or needs compact composition inventory before a later reviewed plan.
- The requested workflow is inspection-only and can be satisfied from current `get_project_info`, `get_project_snapshot`, `find_project_items`, or `get_comp_details` evidence.
- If the request requires source-exact `listCompositions.jsx` formatting, hidden `CompItem` fields, Project panel selection reads, raw script execution, composition mutation, render queue changes, or filesystem access, fail closed and require a separate typed-tool contract.

## Plan Pattern

1. Run `get_project_info` when project identity, saved/file state, or offline/unavailable state should be reported with the inventory.
2. Run `get_project_snapshot` to capture current project item inventory and identify entries whose typed evidence marks them as compositions.
3. Use `find_project_items` when the request needs a narrowed composition search by explicit name, folder context, or item type supported by the typed tool.
4. Run `get_comp_details` only for concrete compositions identified by current typed evidence and only when the user requests additional exposed comp fields such as size, duration, frame rate, work area, layers, or markers.
5. Report only fields returned by typed tools, such as composition item name, item index, folder path/context when available, dimensions, duration, frame rate, work-area fields, layer counts, marker summaries, or unavailable fields.
6. Label missing, unsupported, ambiguous, offline, or truncated fields as typed-tool gaps instead of inferring hidden AE state.
7. Do not execute raw scripts, do not read arbitrary filesystem paths, do not change Project panel selection, and do not call mutating tools.

## Safety Gates

- Read-only workflow.
- Requires Agent plan validation when used in planning context.
- Does not require explicit confirmation, `allowMutations:true`, idempotency, checkpoint/edit-session protection, or post-mutation verification because no mutation is allowed.
- Do not infer composition inventory from prior chat context; use current typed read evidence.
- Do not use this recipe for composition creation, rename, deletion, property edits, layer changes, render queue edits, source relinking, filesystem access, raw script execution, broad hidden object traversal, or exact source JSX behavior.

## Verification

- Pre-run evidence comes only from typed read tools.
- The report cites project identity or offline/unavailable state when `get_project_info` is used.
- The composition list cites concrete item indices/names returned by `get_project_snapshot` or `find_project_items`.
- Any detailed composition fields cite only data returned by `get_comp_details` for concrete evidence-backed compositions.
- Ambiguous, missing, unavailable, unsupported, offline, or truncated detail fields are reported as typed-tool gaps.
- No project-changing tool, raw script execution, filesystem access, Project panel selection change, composition mutation, render queue edit, or user-asset mutation appears in the plan.

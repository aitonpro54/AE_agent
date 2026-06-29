# Get Project Info Typed Plan

## Goal

Report current project information from `get_project_info` typed bridge evidence, without copying source JSX or relying on hidden AE Project object traversal.

## Applies When

- The user asks for project-level information such as project name, saved/file state, frame-count settings, basic project metadata, or bridge-exposed project context.
- The requested workflow is inspection-only and can be satisfied from fields returned by `get_project_info`.
- If the request requires source-exact `getProjectInfo.jsx` formatting, hidden Project object traversal, arbitrary filesystem reads, broad item inventory, raw script execution, project save/saveAs, render queue changes, project item mutation, or other mutation, fail closed and require a separate typed-tool contract.

## Plan Pattern

1. Run `get_project_info` to capture current project identity and bridge-exposed project metadata.
2. Report only fields returned by `get_project_info`, such as project file/name state, saved or unsaved state, frame-count settings, application/project context, or explicit unavailable fields.
3. Label missing, unsupported, ambiguous, unavailable, or offline fields as typed-tool gaps instead of inferring hidden AE state.
4. Do not inspect arbitrary filesystem paths, do not save or rename the project, do not enumerate or mutate project items, and do not call mutating tools.

## Safety Gates

- Read-only workflow.
- Requires Agent plan validation when used in planning context.
- Does not require explicit confirmation, `allowMutations:true`, idempotency, checkpoint/edit-session protection, or post-mutation verification because no mutation is allowed.
- Do not infer project file state, frame-count settings, or project identity from prior chat context; use current typed read evidence.
- Do not use this recipe for project saves, project item rename/move/delete/import/export, render queue edits, arbitrary filesystem access, broad project inventory, raw script execution, or exact source JSX behavior.

## Verification

- Pre-run evidence comes only from `get_project_info`.
- The report cites the current project identity/file state or offline/unavailable state returned by the typed tool.
- Every reported project field uses only data returned by `get_project_info`.
- Ambiguous, missing, unavailable, unsupported, or offline fields are reported as typed-tool gaps.
- No project-changing tool, raw script execution, filesystem write, project item mutation, render queue edit, or project save/saveAs appears in the plan.

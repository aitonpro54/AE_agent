# Generic Repo Intake: tool-src-scripts-getprojectinfo

- Candidate: `tool-src-scripts-getprojectinfo`
- Source: `src/scripts/getProjectInfo.jsx`
- Safe recipe: `recipes/getprojectinfo-typed-plan.md`

This intake adapts only the project-information inspection idea into a read-only typed-plan recipe. No raw JSX is copied into the product.

The safe supported path uses `get_project_info` to report project details already exposed by typed bridge tools: project identity/file state, saved or unsaved state, frame-count settings, application/project context, and explicit unavailable fields.

## Fail-Closed Scope

- Exact source `getProjectInfo.jsx` formatting and hidden AE Project object traversal are not reproduced.
- Arbitrary filesystem reads, broad project item inventory, project save/saveAs, project item mutation, render queue changes, raw script execution, and user-asset mutation require separate typed-tool contracts.
- The detached child worktree did not contain the source JSX, so this recipe keeps the imported behavior limited to the candidate name, wrapper scope, existing typed read tools, and fail-closed project-inspection semantics.

## Validation

- Not run in this child batch by design.
- Parent importer owns registry validation, solution-library validation, and any live acceptance lane.

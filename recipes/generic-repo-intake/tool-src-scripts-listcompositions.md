# Generic Repo Intake: tool-src-scripts-listcompositions

- Candidate: `tool-src-scripts-listcompositions`
- Source: `src/scripts/listCompositions.jsx`
- Safe recipe: `recipes/listcompositions-typed-plan.md`

This intake adapts only the composition-listing inspection idea into a read-only typed-plan recipe. No raw JSX is copied into the product.

The safe supported path uses `get_project_info`, `get_project_snapshot`, `find_project_items`, and optional `get_comp_details` to report composition entries already exposed by typed bridge tools: composition item identity, names, indices, folder context when available, and explicit unavailable fields.

## Fail-Closed Scope

- Exact source `listCompositions.jsx` formatting and hidden AE `CompItem` traversal are not reproduced.
- Composition creation, deletion, rename, property mutation, Project panel selection reads, arbitrary filesystem access, render queue changes, raw script execution, broad hidden object traversal, and user-asset mutation require separate typed-tool contracts.
- The detached child worktree did not contain the source JSX, so this recipe keeps the imported behavior limited to the candidate name, wrapper scope, existing typed read tools, and fail-closed composition-inventory semantics.

## Validation

- Not run in this child batch by design.
- Parent importer owns registry validation, solution-library validation, and any live acceptance lane.

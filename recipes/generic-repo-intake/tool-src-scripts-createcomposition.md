# Generic Repo Intake: tool-src-scripts-createcomposition

- Candidate: `tool-src-scripts-createcomposition`
- Source: `src/scripts/createComposition.jsx`
- Safe recipe: `recipes/basic-comp-setup-typed-plan.md`

This intake adapts only the basic composition creation behavior into an
existing typed-plan recipe. No raw JSX is copied into the product.

The safe supported path uses `create_comp` with explicit `name`, `width`,
`height`, `pixelAspect`, `duration`, `frameRate`, and optional
`backgroundColor`/`bgColor`, then reads the generated composition back with
`get_comp_details`.

## Fail-Closed Scope

- The temp args file wrapper, raw ExtendScript execution path, and source output
  formatting are not reproduced.
- Broad project scans, template batch changes, composition deletion, layer
  creation, render queue changes, filesystem access, and user-asset mutation
  require separate typed-tool contracts.
- The supported recipe requires normal Agent plan validation, mutation
  confirmation, idempotency, checkpoint or edit-session protection, and
  post-mutation read-back before any live run.

## Validation

- Existing registry entry: `basic-comp-setup-typed-plan`.
- Existing solution-library smoke verifies retrieval for basic composition
  creation prompts.
- Parent closeout owns repo rule checks and any future live acceptance lane.

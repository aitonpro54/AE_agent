# M208 Duplicate Layers Solution Library Guidance

## Goal

Add planner-visible Solution Library guidance for bulk and selected-layer duplicate workflows now that `duplicate_layers` has runtime, planner/repair, semantic and generated-only live evidence from M204-M207.

## Scope

- Add a reviewed `tool` entry for `duplicate_layers` rather than a standalone `recipe` file, because this queue item's `plannedPaths` do not include `recipes/`.
- Keep execution advisory-only: retrieval can nudge planning, but the actual run must still become normal MCP plan steps with validation, explicit mutation permission, idempotency, checkpoint/edit-session protection and read-back.
- Prefer `duplicate_layers` for explicit bulk layer duplication with concrete `layerIndices`.
- Require prior `get_selected_layers` evidence before selected-layer duplicate workflows bind selected layer indices.

## Non-Goals

- No raw ExtendScript recipe or promoted JSX file.
- No deep precomp/source duplication or source relinking; those remain separate from layer-instance duplication.
- No destructive deletion workflow.
- No CEP panel edit, dependency change, package manifest edit, live AE/CEP mutation, push or PR.
- No claim that `duplicate_layers` handles mask/path edits, audio workflows or arbitrary user-asset mutation.

## Implementation Notes

- `registry/solutions.json` now records `bulk-layer-duplicate-typed-tool` with status `tool`, preferred tools `get_active_comp`, `get_selected_layers`, `duplicate_layers` and `get_comp_details`.
- `mcp-server/solution-library.js` now includes compact tool-match details in prompt hints, so tool-backed guidance can carry selected-layer evidence and verification notes without exposing full registry metadata.
- `scripts/solution-retrieval-smoke.js` proves tool-backed prompt formatting includes `duplicate_layers` and `get_selected_layers` guidance.
- `scripts/solution-library-validation-smoke.js` proves the real registry entry stays typed-tool-only, requires selected-layer evidence, excludes raw execution and points to M208 promotion evidence.

## Validation Plan

Run the queue validation commands:

```powershell
node --check mcp-server/solution-library.js
node --check scripts/solution-registry-smoke.js
node --check scripts/solution-retrieval-smoke.js
node --check scripts/solution-library-validation-smoke.js
node scripts/solution-registry-smoke.js
node scripts/solution-retrieval-smoke.js
node scripts/solution-library-validation-smoke.js
npm.cmd run check:rules
git diff --check
```

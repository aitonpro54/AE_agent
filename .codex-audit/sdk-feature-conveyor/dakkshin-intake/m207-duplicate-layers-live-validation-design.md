# M207 Duplicate Layers Live Validation Design

## Goal

Add a generated-only Full UI Agent live validation lane for the existing `duplicate_layers` typed bridge tool.

## Acceptance Lane

- Runs only through the installed AE Agent panel over CDP.
- Uses provider `openai-cli`, model `gpt-5.5`, and Agent mode.
- Requires a panel-generated plan; deterministic fallback is not accepted as evidence.
- Requires a dry run before the protected run.
- Requires protected run/edit-session handling through the normal AE Agent runner.
- Requires bridge read-back and semantic verification after the run.
- Requires generated-prefix cleanup and rejects leftover generated items.

## Required Generated Plan Shape

The scenario asks the panel planner to return one exact generated-only fixture:

- `create_comp` for a generated QA comp.
- two `create_solid_layer` steps for generated source layers.
- `duplicate_layers` with explicit concrete `layerIndices`, expected `sourceNames`, and a `nameSuffix`.
- `get_comp_details` read-back with layer details.

The lane deliberately does not duplicate selected layers without prior evidence, delete layers, mutate user assets, relink sources, deep-duplicate precomp trees, edit masks/paths, touch audio, or use raw ExtendScript.

## Fail-Closed Rules

- Missing installed panel, CDP, bridge, saved project, OpenAI CLI readiness, or active-comp readiness stops the lane.
- Missing exact mutating live approval text stops the lane.
- Any deterministic backend fallback stops the lane.
- Any Local/Ollama or OpenRouter fallback stops the lane.
- Any leftover generated item after cleanup stops acceptance.

## Files

- Queue contract: `.codex-audit/sdk-feature-conveyor/184-dakkshin-intake-feature-queue.json`
- Runner: `orchestrator/run-ae-agent-feature-conveyor.mjs`
- CDP smoke lane: `scripts/cep-panel-cdp-smoke.js`
- Fixture: `scripts/agent-scenario-fixtures.js`
- Local queue smokes: `scripts/sdk-ae-agent-feature-conveyor-readiness-smoke.js`, `scripts/sdk-ae-agent-feature-conveyor-command-smoke.js`

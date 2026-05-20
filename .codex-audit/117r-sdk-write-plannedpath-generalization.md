# M117R SDK Write PlannedPath Generalization

## Result

pass

## Scope

M117R generalizes `docs-audit` `sdk-write` operation-envelope `plannedPaths` without retrying real SDKThread write work.

## Changes

- Removed the M115-only `sdk-write` planned path restriction.
- Added docs-audit `sdk-write` planned path validation that accepts non-empty safe `.codex-audit/**` paths.
- Kept `sdk-write` limited to `scope:"docs-audit"` and `mode:"sdk-write"`.
- Preserved rejection for unsafe path shapes, forbidden paths, outside-scope paths, unsafe/bypass envelope fields, and unsafe CLI flags before any possible SDK thread creation.
- Tightened post-run `sdk-write` diff validation so changed files must be in the validated planned path set.
- Updated local contract smoke to cover M115, M117, and arbitrary safe `.codex-audit/**` planned paths plus rejected `src/**`, `orchestrator/**`, `../outside.md`, `.env`, `node_modules/**`, and `.git/**`.

## Safety

- Real SDKThread write was not retried.
- SDK thread was not created.
- External-provider validation, OpenAI CLI planner validation, mutating-live, live CEP / AE smoke tests, tenant-policy bypass, network diagnostics, package installation, staging, and commit were not run.

## Validation

- `node --check orchestrator/codex-sdk-orchestrator.mjs` passed.
- `node --check orchestrator/run-buffered-acceptance.mjs` passed.
- `node --check orchestrator/run-write-capable-scaffold.mjs` passed.
- `npm.cmd run codex:orchestrator:help` passed.
- `npm.cmd run check:rules` passed and printed `PASS M117R SDK orchestrator contract smoke`.

# M107 SDK Orchestrator Acceptance Smoke

## Result
partial

## What was checked
Reviewed provided M107 milestone context, current handoff, orchestrator README, orchestrator source, and package.json.

The scaffold is syntactically valid and uses conservative defaults: read-only sandbox, approval never, network disabled, and web search disabled.

## Pre-run validation
`node --check orchestrator/codex-sdk-orchestrator.mjs`: pass.

`git diff --check`: pass.

`npm.cmd run check:rules`: fail. The repository has no `check:rules` script in `package.json`.

Pre-run status also showed an existing untracked file: `orchestrator/run-buffered-acceptance.mjs`. This review did not create or modify it.

## Orchestrator readiness
Ready for the next controlled milestone, but not a full acceptance pass.

The CLI scaffold is usable for help/syntax-level validation and controlled read-only SDK experiments. It should remain behind explicit milestone rules because the CLI exposes unsafe-capable flags such as `--sandbox danger-full-access`, `--approval on-request`, `--network`, and `--web-search live`.

## Risks
The orchestrator does not validate option values before passing them to the SDK.

The safe defaults are good, but policy enforcement currently depends on the caller or wrapper.

No real SDK turn was run in this review, by instruction.

`check:rules` is referenced by the milestone but absent from `package.json`.

## Blocked items
External-provider validation remains blocked by tenant policy and must not be bypassed.

OpenAI CLI planner validation remains forbidden for this milestone.

Rules validation cannot pass until the repository defines a `check:rules` script or the milestone removes that check.

## Next safe milestone
M108: add a non-mutating local contract smoke for the SDK orchestrator wrapper.

Scope should be limited to CLI argument handling, safe-default verification, README/package script consistency, and wrapper enforcement that rejects unsafe flags during buffered acceptance mode.

## Commands allowed next
`node --check orchestrator/codex-sdk-orchestrator.mjs`

`npm.cmd run codex:orchestrator:help`

`git diff --check`

`npm.cmd run check:rules` only after the script exists or the plan explicitly defines its replacement.

## Commands forbidden
External-provider validation.

OpenAI CLI planner validation.

Mutating-live validation.

Tenant-policy bypass.

Production code or CEP panel edits.

Broad npm/cache/network diagnostics.

Commits from this acceptance review.

## Notes
No files were edited by this review. This report is intended to be written by the host wrapper to `.codex-audit/107-sdk-orchestrator-acceptance-smoke.md`.
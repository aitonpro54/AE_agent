# M127 SDK Scope Expansion Acceptance Gate

## Result

pass

## Goal

Add a local-only acceptance gate for any future SDK write scope expansion, without enabling production-code or CEP-panel SDK writes.

## Changes

- `orchestrator/run-write-capable-scaffold.mjs`
  - Added `SDK_WRITE_REVIEW_REQUIRED_SCOPES`.
  - Added contract cases proving `production-code` and `cep-panel` `sdk-write` envelopes are rejected before SDK thread creation.
  - Exposes gate status in the contract smoke result.
- `orchestrator/run-buffered-acceptance.mjs`
  - Asserts the M127 gate from `check:rules`.
  - Reports `Write-capable sdk-write scope expansion gate: pass`.
- `orchestrator/README.md`
  - Documents that `production-code` and `cep-panel` remain review-required.
- `plans/target-app-execplan.md`
  - Records M127 progress, decision, and validation.

## Validation

- `node --check orchestrator/codex-sdk-orchestrator.mjs`: pass.
- `node --check orchestrator/run-buffered-acceptance.mjs`: pass.
- `node --check orchestrator/run-write-capable-scaffold.mjs`: pass.
- `npm.cmd run codex:orchestrator:help`: pass.
- `npm.cmd run codex:orchestrator:write-scaffold:contract`: pass.
- `npm.cmd run check:rules`: pass.
- `git diff --check`: pass; only LF-to-CRLF working-copy warnings.
- `node scripts/provider-contract-smoke.js`: pass.
- `node scripts/solution-registry-smoke.js`: pass.
- `node scripts/solution-candidate-report-smoke.js`: pass.
- `node scripts/solution-promotion-smoke.js`: pass.
- `node scripts/solution-retrieval-smoke.js`: pass.
- `node scripts/solution-library-validation-smoke.js`: pass.
- `node scripts/project-intent-memory-smoke.js`: pass.
- `node scripts/plan-classification-smoke.js`: pass.
- `node scripts/plan-repair-smoke.js`: pass.
- `node scripts/semantic-verification-smoke.js`: pass.
- `node scripts/reliability-validation-suite-smoke.js`: pass.
- `node scripts/chatgpt-connector-smoke.js`: pass.
- `node scripts/provider-api-smoke.js`: pass.
- `node scripts/prompt-optimization-smoke.js`: pass.
- `node scripts/bridge-only-smoke-test.js`: pass.
- `node scripts/smoke-test.js`: pass.

## Not Run

- Live CEP / After Effects smokes: not run; M127 does not change panel, bridge runtime behavior, or AE project mutation paths.
- External-provider validation and OpenAI CLI planner validation: not run; out of scope for this local gate.
- Mutating-live validation: not run; out of scope.
- Package installation: not run.
- SDKThread creation or real SDK write work: not run.

## Decision

Controlled SDK automation remains enabled only for the proven `docs-audit` and controlled `orchestrator` output lanes. Production-code and CEP-panel SDK writes remain disabled until a separate review explicitly approves a narrower lane.

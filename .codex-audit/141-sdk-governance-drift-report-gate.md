# M141 SDK Governance Drift Report Gate

## Результат

pass

## Цель

Добавить локальный drift/report gate, который строит отчет о SDK launch governance из committed packets и падает, если launch state, enabled scopes или production-code allowlist расходятся с runner contract.

## Изменения

- Добавлен `SDK_LAUNCH_GOVERNANCE_DRIFT_REPORT_SCHEMA` со значением `sdk-launch-governance-drift-report.v1`.
- Добавлен `buildSdkLaunchGovernanceDriftReport()`.
- Drift report сверяет:
  - enabled SDK write scopes;
  - review-required scopes;
  - production-code governance allowlist;
  - production-code enablement allowlist;
  - disabled CEP-panel SDK write state;
  - отсутствие новых SDKThread/network approvals;
  - отсутствие broad production-code approval.
- `check:rules` строит drift report из committed `.codex-audit/sdk-launch-governance/140-sdk-launch-governance.json` и `.codex-audit/sdk-write-lane-enablement/135-production-code-smoke-harness-enable.json`.
- `check:rules` теперь печатает `SDK launch governance drift report: pass`.
- README описывает drift report schema and gate.

## Решение

M141 не расширяет SDK write scope. Он делает существующий local-gated launch state проверяемым как сводный drift report, чтобы future changes не могли тихо разойтись между governance artifact, enablement packet и runner constants.

## Validation

- `node --check orchestrator/run-write-capable-scaffold.mjs`: pass.
- `node --check orchestrator/run-buffered-acceptance.mjs`: pass.
- `npm.cmd run codex:orchestrator:write-scaffold:contract`: pass.
- `npm.cmd run check:rules`: pass; output includes `SDK launch governance drift report: pass`.
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
- `git diff --check`: pass; Git printed only LF-to-CRLF working-copy warnings for touched text files.

## Not Run

- SDKThread creation, real SDK write work, package install, external-provider validation, OpenAI CLI planner validation, live CEP / After Effects smokes and mutating-live validation were not run; M141 is a local governance drift/report milestone.

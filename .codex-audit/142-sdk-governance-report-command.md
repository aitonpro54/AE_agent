# M142 SDK Governance Report Command

## Результат

pass

## Цель

Добавить локальную команду для on-demand вывода SDK launch governance drift report без запуска SDKThread, network work или полного smoke-набора.

## Изменения

- Добавлен buffered acceptance flag `--governance-report`.
- Добавлена package script команда `codex:orchestrator:governance-report`.
- Команда строит report из committed packets:
  - `.codex-audit/sdk-launch-governance/140-sdk-launch-governance.json`;
  - `.codex-audit/sdk-write-lane-enablement/135-production-code-smoke-harness-enable.json`.
- Report выводится как JSON и содержит:
  - `schema:"sdk-launch-governance-drift-report.v1"`;
  - `launchGovernanceState:"local-gated"`;
  - `driftDetected:false`;
  - exact enabled scopes;
  - exact review-required scopes;
  - exact production-code planned path allowlist;
  - packet paths used to build the report.
- `check:rules` validates that the report command remains wired and working.
- README documents `npm.cmd run codex:orchestrator:governance-report`.

## Решение

M142 improves SDK operability visibility without changing write permissions. The command is a local read/report surface only and does not create SDK threads or approve new live work.

## Validation

- `node --check orchestrator/run-buffered-acceptance.mjs`: pass.
- `npm.cmd run codex:orchestrator:governance-report`: pass; output includes `schema:"sdk-launch-governance-drift-report.v1"`, `launchGovernanceState:"local-gated"`, and `driftDetected:false`.
- `npm.cmd run codex:orchestrator:write-scaffold:contract`: pass.
- `npm.cmd run check:rules`: pass; output includes `SDK launch governance report command: pass`.
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

- SDKThread creation, real SDK write work, package install, external-provider validation, OpenAI CLI planner validation, live CEP / After Effects smokes and mutating-live validation were not run; M142 is a local report-surface milestone.

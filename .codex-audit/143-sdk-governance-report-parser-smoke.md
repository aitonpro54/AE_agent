# M143 SDK Governance Report Parser Smoke

## Результат

pass

## Цель

Добавить локальный subprocess smoke, который запускает package command `codex:orchestrator:governance-report`, парсит JSON-вывод и проверяет exact local-gated governance fields без SDKThread, network work или live validation.

## Изменения

- Добавлен `scripts/sdk-governance-report-smoke.js`.
- Добавлена package script команда `codex:orchestrator:governance-report:smoke`.
- `check:rules` теперь запускает parser smoke и печатает `SDK governance report parser smoke: pass`.
- Smoke проверяет:
  - `schema:"sdk-launch-governance-drift-report.v1"`;
  - `launchGovernanceState:"local-gated"`;
  - `driftDetected:false`;
  - exact enabled SDK write scopes;
  - exact review-required scopes;
  - exact production-code planned path allowlist;
  - exact source milestone evidence;
  - exact committed packet paths;
  - all governance report checks are `ok:true` and `actual` equals `expected`.
- README documents the standalone smoke command.

## Решение

M143 keeps SDK launch readiness local and observable. The parser smoke proves the report command remains machine-readable from a real subprocess while preserving the current local-gated contract and not approving new SDKThread/network work.

## Validation

- `node --check scripts/sdk-governance-report-smoke.js`: pass.
- `node --check orchestrator/run-buffered-acceptance.mjs`: pass.
- `npm.cmd run codex:orchestrator:governance-report`: pass; output includes `schema:"sdk-launch-governance-drift-report.v1"`, `launchGovernanceState:"local-gated"`, and `driftDetected:false`.
- `npm.cmd run codex:orchestrator:governance-report:smoke`: pass; output includes `SDK governance report parser smoke: pass`.
- `npm.cmd run codex:orchestrator:write-scaffold:contract`: pass.
- `npm.cmd run check:rules`: pass; output includes `SDK governance report parser smoke: pass`.
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

- SDKThread creation, real SDK write work, package install, external-provider validation, OpenAI CLI planner validation, live CEP / After Effects smokes and mutating-live validation were not run; M143 is a local parser-smoke milestone.

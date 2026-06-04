# Autonomy Handoff

## Цель

Итеративно инвентаризировать, ранжировать, валидировать и отбирать scripts/tools в репозитории через компактный файловый state/handoff contract.

## Что уже сделано

- Iteration: 3/50
- Status: done
- Last validation: passed - accepted=4, rejected=0, needs_lane=0, needs_revalidation=0, blocked=0
- External-risk blockers resolved with explicit safe `mock`,
  `read-only-fixture`, and `static-fixture` lanes; generated static lanes alone
  remain insufficient for network/credential/live-runtime risk.
- Parent-managed visible thread continuation request is available at
  `.codex-autonomy/thread_request.json`.

## Какие скрипты приняты

- `package.json#scripts/check:rules` - Accepted: static checks passed and an existing validation lane is present.
- `package.json#scripts/smoke:autonomy` - Accepted: static checks passed and an existing validation lane is present.
- `package.json#scripts/smoke:bridge` - Accepted: static checks passed and an existing validation lane is present.
- `package.json#scripts/smoke:full-intake` - Accepted: static checks passed and an existing validation lane is present.
- `package.json#scripts/smoke:planning` - Accepted: static checks passed and an existing validation lane is present.
- `package.json#scripts/smoke:provider-api` - Accepted: static checks passed and an existing validation lane is present.
- `package.json#scripts/smoke:provider-contract` - Accepted: static checks passed and an existing validation lane is present.
- `package.json#scripts/smoke:solutions` - Accepted: static checks passed and an existing validation lane is present.
- `scripts/provider-contract-smoke.js` - Accepted: static checks passed and an existing validation lane is present.
- `scripts/sdk-generic-repo-full-intake-smoke.js` - Accepted: static checks passed and an existing validation lane is present.
- `scripts/semantic-verification-smoke.js` - Accepted: static checks passed and an existing validation lane is present.
- `scripts/solution-promotion-smoke.js` - Accepted: static checks passed and an existing validation lane is present.
- `scripts/agent-scenario-report.js` - Accepted: static checks passed and an existing validation lane is present.
- `scripts/reliability-validation-suite-smoke.js` - Accepted: static checks passed and an existing validation lane is present.
- `scripts/safe-rg.js` - Accepted: static checks passed and an existing validation lane is present.
- `scripts/solution-retrieval-smoke.js` - Accepted: static checks passed and an existing validation lane is present.
- `scripts/agent-scenario-report-smoke.js` - Accepted: static checks passed and an existing validation lane is present.
- `scripts/autonomy-layer-smoke.js` - Accepted: static checks passed and an existing validation lane is present.
- `scripts/chatgpt-connector-smoke.js` - Accepted: static checks passed and an existing validation lane is present.
- `scripts/manual-typed-tool-regression-smoke.js` - Accepted: static checks passed and an existing validation lane is present.
- `scripts/plan-classification-smoke.js` - Accepted: static checks passed and an existing validation lane is present.
- `scripts/plan-repair-smoke.js` - Accepted: static checks passed and an existing validation lane is present.
- `scripts/prompt-optimization-smoke.js` - Accepted: static checks passed and an existing validation lane is present.
- `scripts/sdk-generic-repo-importer-command-smoke.js` - Accepted: static checks passed and an existing validation lane is present.
- `scripts/sdk-generic-repo-queue-supervisor-smoke.js` - Accepted: static checks passed and an existing validation lane is present.
- `scripts/smoke-test.js` - Accepted: static checks passed and an existing validation lane is present.
- `scripts/solution-candidate-report-smoke.js` - Accepted: static checks passed and an existing validation lane is present.
- `scripts/solution-candidate-report.js` - Accepted: static checks passed and an existing validation lane is present.
- `scripts/solution-registry-smoke.js` - Accepted: static checks passed and an existing validation lane is present.
- `scripts/cep-panel-cdp-smoke.js` - Accepted: static checks passed and an existing validation lane is present.
- `scripts/project-intent-memory-smoke.js` - Accepted: static checks passed and an existing validation lane is present.
- `scripts/reliability-validation-suite.js` - Accepted: static checks passed and an existing validation lane is present.
- `scripts/solution-library-validation-smoke.js` - Accepted: static checks passed and an existing validation lane is present.
- `orchestrator/run-generic-repo-auto-intake.mjs` - Accepted: generated static validation lane passed.
- `orchestrator/run-generic-repo-importer-supervisor.mjs` - Accepted: generated static validation lane passed.
- `orchestrator/run-generic-repo-queue-supervisor.mjs` - Accepted: generated static validation lane passed.
- `scripts/clean-current-check.js` - Accepted: generated static validation lane passed.
- `scripts/solution-promotion-helper.js` - Accepted: generated static validation lane passed.
- `mcp-server/server.js` - Accepted: generated static validation lane passed.
- `orchestrator/core/post-run-contract.mjs` - Accepted: generated static validation lane passed.
- `orchestrator/core/runtime-store.mjs` - Accepted: generated static validation lane passed.
- `orchestrator/full-intake-diagnose.mjs` - Accepted: generated static validation lane passed.
- `orchestrator/full-intake-ledger-summary.mjs` - Accepted: generated static validation lane passed.
- `orchestrator/full-intake-proof.mjs` - Accepted: generated static validation lane passed.
- `orchestrator/full-intake-status.mjs` - Accepted: generated static validation lane passed.
- `orchestrator/parallel-candidate-worktrees.mjs` - Accepted: generated static validation lane passed.
- `orchestrator/run-generic-repo-full-intake.mjs` - Accepted: generated static validation lane passed.
- `package.json#scripts/autonomy` - Accepted: generated static validation lane passed.
- `package.json#scripts/full-intake:diagnose` - Accepted: generated static validation lane passed.
- `package.json#scripts/full-intake:proof` - Accepted: generated static validation lane passed.
- `...и еще 32` - нет validation result

## Какие отклонены и почему

- `scripts/safe-rg-smoke.js` - Rejected: destructive signal without a safe dry-run/mock signal.

## Какие требуют lane

_нет_

## Какие требуют повторной валидации

_нет_

## Какие команды запускались

- `npm.cmd run autonomy -- revalidate --include-blocked --batch-size 4`
- `npm.cmd run autonomy -- handoff`
- `npm.cmd run autonomy -- thread-request`
- `node --check scripts/sdk-generic-repo-full-intake-smoke.js`
- `node --check scripts/semantic-verification-smoke.js`
- `node --check scripts/solution-promotion-smoke.js`
- `node --check scripts/agent-scenario-report.js`
- `node --check scripts/reliability-validation-suite-smoke.js`
- `node --check scripts/safe-rg.js`
- `node --check scripts/solution-retrieval-smoke.js`
- `node --check orchestrator/run-generic-repo-auto-intake.mjs`
- `node --check orchestrator/run-generic-repo-importer-supervisor.mjs`
- `node --check orchestrator/run-generic-repo-queue-supervisor.mjs`
- `node --check scripts/agent-scenario-report-smoke.js`
- `node --check scripts/autonomy-layer-smoke.js`
- `node --check scripts/chatgpt-connector-smoke.js`
- `node --check scripts/clean-current-check.js`
- `node --check scripts/manual-typed-tool-regression-smoke.js`
- `node --check scripts/plan-classification-smoke.js`
- `node --check scripts/plan-repair-smoke.js`
- `node --check scripts/prompt-optimization-smoke.js`
- `node --check scripts/sdk-generic-repo-importer-command-smoke.js`
- `node --check scripts/sdk-generic-repo-queue-supervisor-smoke.js`
- `node --check scripts/smoke-test.js`
- `node --check scripts/solution-candidate-report-smoke.js`
- `node --check scripts/solution-candidate-report.js`
- `node --check scripts/solution-promotion-helper.js`
- `node --check scripts/solution-registry-smoke.js`
- `...и еще 39`

## Последние ошибки

_нет_

## Следующий конкретный шаг

Autonomy loop stopped with status done; inspect reports before continuing.

## Exact next prompt

См. `.codex-autonomy/exact_next_prompt.md`.

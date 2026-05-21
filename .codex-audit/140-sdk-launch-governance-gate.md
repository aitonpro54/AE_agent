# M140 SDK Launch Governance Gate

## Результат

pass

## Цель

Добавить проверяемый local-gated слой SDK launch governance после M138/M139, чтобы SDK явно различал уже доказанную узкую lane и любые будущие действия, которым нужен отдельный approval.

## Изменения

- Добавлен schema/validator `sdk-launch-governance.v1`.
- Добавлен committed governance artifact `.codex-audit/sdk-launch-governance/140-sdk-launch-governance.json`.
- `check:rules` теперь валидирует committed launch-governance JSON.
- Contract smoke отвергает governance packets, которые:
  - скрыто одобряют новый SDKThread/network run;
  - расширяют production-code allowlist за пределы `scripts/provider-contract-smoke.js`;
  - включают CEP-panel SDK writes;
  - отмечают external network retry как approved;
  - не ссылаются на M138/M139 evidence;
  - содержат unsafe execution fields.
- README описывает новый local-gated governance artifact.

## Решение

M140 улучшает операционную готовность SDK без запуска нового SDKThread. Текущее состояние SDK остается `local-gated`: разрешенные lanes и single-file production-code allowlist проверяются контрактом, но новые live SDKThread/network writes требуют отдельного review/approval milestone.

## Validation

- `node --check orchestrator/run-write-capable-scaffold.mjs`: pass.
- `node --check orchestrator/run-buffered-acceptance.mjs`: pass.
- `npm.cmd run codex:orchestrator:write-scaffold:contract`: pass.
- `npm.cmd run check:rules`: pass; output includes `SDK launch governance packet gate: pass` and `SDK launch governance packet files: pass`.
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

- SDKThread creation, real SDK write work, package install, external-provider validation, OpenAI CLI planner validation, live CEP / After Effects smokes and mutating-live validation were not run; M140 is a local governance/contract milestone.

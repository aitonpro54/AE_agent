# AE Agent handoff - 2026-05-14

Этот handoff предназначен для продолжения работы в новом чате Codex.

Репозиторий:

`C:\Users\Ant\Documents\Codex\AE_agent`

По умолчанию общаться с пользователем, вести видимые планы и проектные заметки на русском языке, если пользователь явно не попросил другой язык.

## Что читать в новом чате

Перед кодингом прочитать:

- `AGENTS.md`
- `specs/target-app.md`
- `plans/target-app-execplan.md`
- этот handoff
- `docs/2026-05-14-roadmap-1.1-release-notes.md`

Полезные навыки:

- `cep-panel-controls` для изменений CEP composer/UI.
- `ae-mcp-bridge-workflow` для bridge daemon, MCP tools и validation.
- `ae-safe-project-automation` для live AE mutations и checkpoint/edit-session защиты.

## Текущее состояние

- Активный root: `C:\Users\Ant\Documents\Codex\AE_agent`.
- Ветка: `codex-v0.26-agent-ux-polish`.
- Native CEP title/menu: `AE Agent 1.0.0`.
- Live daemon был перезапущен из этого repo root на `127.0.0.1:3456`.
- Installed CEP extension: `C:\Users\Ant\AppData\Roaming\Adobe\CEP\extensions\com.codex.aemcpbridge`.
- Provider paths разделены: OpenAI API, OpenAI CLI, Gemini, Claude, OpenRouter и Local/Ollama.
- Agent mode строит structured MCP plans, валидирует tools/required fields/bindings, делает dry-run и выполняет mutating runs только через safety gates.
- Project-changing tools используют idempotency metadata, optional checkpoints, edit-session protection и post-mutation verification.
- Raw ExtendScript остается escape hatch; обычные workflows должны предпочитать typed bridge tools.

## Завершенный roadmap 1.1 block

Milestone 46: Библиотека Agent-сценариев.

- Commit `6fad203 Add Agent workflow presets`.
- CEP composer получил workflow presets для типовых Agent prompts.

Milestone 47: Улучшенный Plan Review UX.

- Commit `0fc03d1 Improve Plan Review UX`.
- Plan Review transcript стал явно показывать affected targets, mutation count, checkpoint expectation, warnings и read-only/protected run readiness.

Milestone 48: Project Context Snapshot.

- Commit `d4f92a6 Add Agent project context snapshot`.
- Agent planning prompt получает compact project context snapshot без широкого project scan и без блокировки offline CEP.

Milestone 49: Recovery и checkpoint UX.

- Commit `8dcfd41 Improve recovery and checkpoint run UX`.
- Run transcript показывает checkpoint/edit-session state; failed mutating runs получают текстовый `recoveryHint` без automatic restore.

Milestone 50: Provider reliability polish.

- Commit `af06626 Normalize provider reliability errors`.
- Provider failures нормализованы через `providerError` с кодами `missing_auth`, `missing_model`, `model_unavailable`, `network_failure`, `rate_limited`, `malformed_response`, `provider_error`.

Milestone 51: Installer и CEP sync health.

- Commit `60261bf Add CEP sync health helper`.
- Добавлен `scripts\cep-sync-health.js` и `scripts\install-cep-panel.ps1 -SyncOnly`.

Milestone 52: Полная 1.1 validation.

- Обновлены release notes и handoff notes.
- Финальная validation записана в `plans/target-app-execplan.md`.

## Важные решения

- Roadmap 1.1 не включает отдельную веху русификации UI/документации.
- Roadmap 1.1 не включает render workflow polish; render queue setup tools остаются доступными.
- Workflow presets являются prompt helpers и не обходят Agent planning, validation, dry-run или mutation gates.
- Project Context Snapshot остается planning hint, а не доказательством безопасности мутации.
- Recovery UX не запускает restore автоматически.
- CEP sync health read-only по умолчанию; запись в installed extension только через явный `--sync` или `-SyncOnly`.

## Финальная проверка

Проверки roadmap 1.1:

```powershell
node --check mcp-server\ai-agents.js
node --check mcp-server\bridge-daemon.js
node --check cep-panel\panel.js
node --check scripts\cep-panel-cdp-smoke.js
node --check scripts\provider-api-smoke.js
node --check scripts\cep-sync-health.js
node --check scripts\smoke-test.js
git diff --check
node scripts\provider-contract-smoke.js
node scripts\provider-api-smoke.js
node scripts\prompt-optimization-smoke.js
node scripts\bridge-only-smoke-test.js
node scripts\smoke-test.js
node scripts\cep-sync-health.js --check
node scripts\cep-sync-health.js --sync --check
node scripts\cep-panel-cdp-smoke.js reload
node scripts\cep-panel-cdp-smoke.js workflow-preset-smoke
node scripts\cep-panel-cdp-smoke.js plan-review-smoke
node scripts\cep-panel-cdp-smoke.js smoke
node scripts\cep-panel-cdp-smoke.js mutating-smoke
```

Отдельный package-manager check не запускался, потому что в репозитории нет `package.json`.

## Следующий разумный шаг

Если работа продолжается после этого блока, сначала проверить `git status --short --branch` и `git log --oneline -6`, затем решать: review/merge/tag/push или новый roadmap block. Новую разработку продолжать milestone-by-milestone с обновлением плана и отдельным commit после каждой самостоятельной вехи.

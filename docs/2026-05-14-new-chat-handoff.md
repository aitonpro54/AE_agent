# AE Agent handoff - 2026-05-14

Этот handoff предназначен для продолжения работы в новом чате Codex.

Репозиторий:

`C:\Users\Ant\Documents\Codex\AE_agent`

По умолчанию общаться с пользователем и вести видимые рабочие заметки на русском языке, если пользователь явно не попросил другой язык.

## Что читать в новом чате

Перед кодингом прочитать:

- `AGENTS.md`
- `specs/target-app.md`
- `plans/target-app-execplan.md`
- этот handoff

Полезные навыки:

- `cep-panel-controls` для изменений CEP composer/UI.
- `ae-mcp-bridge-workflow` для bridge daemon, MCP tools и validation.
- `ae-safe-project-automation` для live AE mutations и checkpoint/edit-session защиты.

## Текущее состояние

- Активный root: `C:\Users\Ant\Documents\Codex\AE_agent`.
- Ветка: `codex-v0.26-agent-ux-polish`.
- Native CEP title/menu: `AE Agent 1.0.0`.
- Provider paths разделены: OpenAI API, OpenAI CLI, Gemini, Claude и Local/Ollama.
- Agent mode строит structured MCP plans, валидирует tools/required fields/bindings, делает dry-run и выполняет mutating runs только через существующие safety gates.
- Project-changing tools используют idempotency metadata, optional checkpoints, edit-session protection и post-mutation verification.
- Raw ExtendScript остается escape hatch; обычные workflows должны предпочитать typed bridge tools.

## Последний завершенный milestone

Milestone 46: Библиотека Agent-сценариев.

Commit:

```text
6fad203 Add Agent workflow presets
```

Что вошло:

- Новый `Workflow preset` selector и `Insert` button в CEP composer.
- Пять preset prompts: selected-layer timing, precompose/rename, text/shape layout, basic animation и replace source.
- Preset insert переключает панель в Agent mode, включает Prompt Optimization, вставляет prompt без автоотправки и не пишет в chat history.
- Добавлен live CEP smoke: `node scripts\cep-panel-cdp-smoke.js workflow-preset-smoke`.
- Измененные `index.html`, `panel.js` и `style.css` скопированы в установленную CEP-панель.

## Validation на Milestone 46

Пройдено:

```powershell
node --check cep-panel\panel.js
node --check scripts\cep-panel-cdp-smoke.js
git diff --check
node scripts\provider-contract-smoke.js
node scripts\provider-api-smoke.js
node scripts\prompt-optimization-smoke.js
node scripts\bridge-only-smoke-test.js
node scripts\smoke-test.js
node scripts\cep-panel-cdp-smoke.js workflow-preset-smoke
node scripts\cep-panel-cdp-smoke.js smoke
```

Отдельный package-manager check не запускался, потому что в репозитории нет `package.json`.

## Текущий roadmap

Следующий блок находится в `plans/target-app-execplan.md`.

Активная следующая веха:

### Milestone 47: Улучшенный Plan Review UX

Цель:

- Улучшить CEP plan review text для affected targets, mutation counts, checkpoint expectations и warnings.
- Сделать dry-run versus mutating run состояние легче считываемым перед `Run plan`.
- Сохранить backend plan schemas и существующие execution gates.

Дальше по roadmap:

- Milestone 48: Project Context Snapshot.
- Milestone 49: Recovery и checkpoint UX.
- Milestone 50: Provider reliability polish.
- Milestone 51: Installer и CEP sync health.
- Milestone 52: Полная 1.1 validation.

Важное решение: roadmap 1.1 не включает отдельную веху русификации UI/документации и не включает render workflow polish.

## Обычная проверка для следующих изменений

Перед завершением milestone запускать:

```powershell
node --check <каждый измененный js-файл>
git diff --check
node scripts\provider-contract-smoke.js
node scripts\provider-api-smoke.js
node scripts\prompt-optimization-smoke.js
node scripts\bridge-only-smoke-test.js
node scripts\smoke-test.js
```

Если затронута CEP-панель и After Effects доступен:

```powershell
node scripts\cep-panel-cdp-smoke.js reload
node scripts\cep-panel-cdp-smoke.js smoke
```

Installed CEP extension:

`C:\Users\Ant\AppData\Roaming\Adobe\CEP\extensions\com.codex.aemcpbridge`

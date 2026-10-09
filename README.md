# AE Agent

AE Agent 3.3.1 is a local After Effects assistant: a CEP panel talks to a local
bridge daemon, and the daemon owns all provider calls, plan validation, AE
execution gates, checkpoints, logs, and verification.

The product target is in `specs/target-app.md`. The active work plan is
`plans/target-app-execplan.md`.

Версия 3.3.0 опубликована в отдельной ветке `codex/release-3.3.0`.
Подготовка 3.3.1 ведётся в отдельной ветке `codex/release-3.3.1`.
Порядок выпуска и возврата к предыдущей версии —
[в руководстве по версиям](docs/release-workflow.md).

Поиск готовых решений через MCP, локальные генераторы планов и измерение
их использования описаны в [руководстве по повторному использованию](docs/solution-reuse.md).

## What Stays In This Repo

- `cep-panel/`: the CEP UI.
- `mcp-server/`: bridge daemon, typed tools, provider integration, planning,
  semantic verification, and safety gates.
- `chatgpt-connector/`: local connector used by the panel.
- `recipes/` and `registry/`: reviewed typed-tool planning patterns and the
  solution library.
- `orchestrator/` and four related scripts: manifest-pinned, frozen opt-in
  legacy Intaker/importer/orchestration tooling. The one active exception is
  `orchestrator/bounded-process-result.cjs`, used by the provider runtime.
- `specs/`, `docs/`, `plans/`: compact current product and project docs.

Runtime output stays local and ignored: `.codex/`, `.codex-runtime/`,
`.codex-autonomy/`, `logs/`, `backups/`, `snapshots/`, and
`pro-review-bundles/`.

Выбранные офлайн-проверки, receipts и hashes можно собрать одним запуском
[компактной диагностики](docs/compact-diagnostics.md); полный отчёт остаётся в `logs/diagnostics/`.
Перенос проверенного checkout на Windows и порядок локальной приёмки —
[в инструкции переноса](docs/windows-transfer.md).

## Run The Bridge

Start the local bridge daemon:

```powershell
$env:AE_BRIDGE_TOKEN = "<random automation credential>"
$env:AE_BRIDGE_PANEL_TOKEN = "<different random panel credential>"
node mcp-server/bridge-daemon.js
```

The daemon serves the CEP panel and MCP tools. It is also the safety boundary
for mutating AE actions. `AE_BRIDGE_TOKEN` authenticates normal MCP/CLI
automation but never grants manual confirmation or autonomy enablement.
`AE_BRIDGE_PANEL_TOKEN` is entered in the CEP **Panel token** field and is the
only credential accepted for proposal adoption, manual execution, and the
persistent autonomy toggle. There is no shared fallback and credentials are not
accepted in URLs. The daemon rejects startup when any enabled automation,
panel, or dev-admin credentials are equal.

Local development can additionally set `AE_BRIDGE_DEV_ADMIN=1` together with a
third, distinct `AE_BRIDGE_ADMIN_TOKEN`. This opt-in credential can use POST
`/dev/tool/*`; ordinary automation still passes the normal proposal policy and
GET remains read-only. The dev-admin path does not authorize
`save_current_named_project`, whose panel confirmation and save proof stay
separate.

Agent Hardcore is not an ordinary automation endpoint: HTTP entry requires the
panel credential and an active CEP Autonomous Codex session. Its
mutating attempts still use the same typed-only autonomous runner policy;
raw/destructive plans and the special save contract are not widened.

Browser requests are checked against loopback/explicit Origin and Host policy.
CEP opaque `Origin: null`/`file://` is supported with a valid credential; CLI
clients without an `Origin` header remain supported. Add exceptional browser
origins explicitly with `AE_BRIDGE_ALLOWED_ORIGINS` rather than disabling CORS.

## Install The CEP Panel

Для локальной разработки используй `cep-panel/` как исходники расширения. Панель
требует работающий локально bridge daemon. Если панель отображается offline, сначала запусти daemon, затем выполни scoped-команду reload из [Tool-First workflow](docs/tool-first-workflow.md#штатная-диагностика-и-reload-cep):
`$env:CEP_PANEL_ENSURE_DAEMON='0'; node scripts/cep-panel-cdp-smoke.js reload`.

### Обновление с общего токена на раздельные роли

Копирования `panel.js` и `index.html` недостаточно: в конфигурации запуска bridge
должны присутствовать разные `AE_BRIDGE_TOKEN` и `AE_BRIDGE_PANEL_TOKEN`.
Если bridge запускается MCP adapter, добавьте panel token в ту же секцию `.env`
его локальной конфигурации. В CEP поле **Panel token** должно содержать именно
`AE_BRIDGE_PANEL_TOKEN`; прежний automation token не подходит для `/bridge/next`.
Не передавайте токены в URL, отчётах или командной строке.

После изменения окружения перезапустите свободный daemon (нет pending/inflight
commands и активного edit session); уже работающий процесс не перечитывает `.env`.
Перезапустите MCP adapter перед его следующим автоматическим запуском daemon,
чтобы он унаследовал новое окружение. Проверьте `Connected`, затем реальный
`get_project_info` и повторное подключение после Reload. `connector-status-smoke`
проверяет UI на подставных ответах и сам по себе не доказывает live connectivity.

## Provider Paths

Configured provider surfaces include OpenAI API, OpenAI CLI/Codex CLI, Gemini,
Claude, OpenRouter, and Local/Ollama.

Important boundaries:

- ChatGPT subscription access is the OpenAI CLI/Codex CLI path, not an OpenAI
  API key.
- OpenAI API access uses `OPENAI_API_KEY` or the bridge secret store.
- Local/Ollama is allowed as a target product provider, but validation/intake
  must not use it without explicit approval.

## Safety Model

- Prefer typed tools over raw ExtendScript.
- Mutating plans require validation, explicit permission, dry-run evidence when
  applicable, and post-run read-back.
- Broad or risky mutations require checkpoint/edit-session protection.
- Raw ExtendScript remains an escape hatch behind bridge-owned gates.
- Переключатель **Автономная сессия Codex** сохраняет `desiredEnabled` до явного
  выключения. При первом доверенном подключении панели без сохранённой настройки
  он включается автоматически. Reload панели и restart bridge сохраняют настройку; готовность
  восстанавливается только после подключения доверенной панели. Разрешение
  конкретного proposal, checkpoint, freshness и read-back проверяются отдельно.
  Direct mutations, raw JSX, destructive и специальный named save остаются
  за отдельной ручной границей.
- Dev-request bundles are local handoffs for separate Codex App development
  work; the panel must not imply it created a Codex thread automatically.

Настройка хранится в `autonomy-preference.json` внутри `AE_BRIDGE_STATE_DIR`
(по умолчанию local ignored log directory). При отсутствии файла она включается
после первого доверенного подключения CEP; явно сохранённое off остаётся off.
Повреждённый или старый temporary state даёт off. Ошибка записи показывается явно: off немедленно отзывает право
в текущем процессе, но при ошибке диска сохранение off после restart не гарантируется.
Отсутствующая панель означает ожидание соединения при сохранённом enabled.
Heartbeat поддерживает готовность во время долгого JSX и не получает команды.

Этот переключатель меняет только право MCP выполнить уже предложенный typed-план.
Поиск решений, регистрация карантинных кандидатов, проверяемое продвижение рецептов
и отчётность работают независимо от него. Полный доступ Codex к файловой системе
не заменяет разрешение bridge на изменение AE.

Panel/bridge используют command contract v2: execution, lease, owner и generation
сверяются до принятия результата. Старую панель нужно обновлять вместе с bridge;
ослабленного fallback нет. Уже submitted/unknown шаг после reconnect не повторяется.
Off не прерывает синхронный JSX: его результат/read-back принимается, следующая
mutation блокируется.

## Frozen Full Intaker Boundary

The exact frozen paths and normalized SHA-256 values are recorded in
`config/frozen-intake-manifest.json`; its companion lock detects unexplained
manifest edits. `npm run check:rules` verifies the boundary but never refreshes
it. Default search excludes the frozen paths. Existing `full-intake:*`,
`generic-repo:*`, and `smoke:full-intake` commands remain explicit legacy
entrypoints and are not part of normal startup or default product tests.

Product tools, recipes, registry entries, discovery, plan builders, semantic
verification, and their regressions remain active even when they originated
through intake. Reusable generic orchestration belongs in the sibling
`codex-sdk-orchestrator-tool` through a separate reviewed migration.

Approval-gated by default:

- Local/Ollama and fallback providers in validation/intake
- broad/default CEP smoke
- live AE mutation
- dependency changes
- push and PR

## Validation

Default guard:

```powershell
npm.cmd run check:rules
```

For JavaScript/MJS edits, also run `node --check` for every touched source file
and:

```powershell
git diff --check
```

Focused smoke groups:

```powershell
npm.cmd run smoke:provider-contract
npm.cmd run smoke:provider-api
npm.cmd run smoke:solutions
npm.cmd run smoke:planning
npm.cmd run smoke:bridge
npm.cmd run smoke:network-boundary
npm.cmd run smoke:frozen-intake
```

M7 remediation проверяется actual-module/VM и isolated loopback fixtures, а
generated-only subset дополнительно прошёл в реальном AE/CEP: exact duplicate
identity, negative preflight, restart/reload/off и protected save/reopen.
Матрица критериев, actual IDs/hashes и честное разделение live/offline evidence
находятся в [отчёте M7](docs/m7-integration-acceptance-2026-09-19.md).
Клиентская визуальная приёмка не входит в release gate 3.3.0.

Run only the groups relevant to the touched surface unless a milestone calls
for a broader pass. Frozen `smoke:full-intake` requires an explicit reviewed
thaw and is not part of the default product suite.

## Handoff

After each milestone, update `.codex/handoff.md` with the goal, current state,
files touched, validation, decisions, risks, commit id, and exact next prompt.
Keep it compact; long historical evidence belongs in git history or the legacy
repository, not in the clean baseline.

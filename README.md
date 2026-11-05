# AE Agent Core

Текущая основная версия Core — **4.1.0**. Ветка `codex/ae-agent-core-4.1.0`,
тег `v4.1.0`, имя панели в After Effects — **AE Agent Core 4.1.0**.
Упаковка и команды проверки описаны в [README Core4](core4/README.md).

Постоянное архитектурное требование проекта — [переносимость десктоп ↔ MSI](docs/portability.md)
без ручной перенастройки после первичной подготовки сред. Приёмка P1–P8 для
предыдущего пакета 4.0.0 зафиксирована в [отчёте двух машин](docs/core-portability-final-two-host-result-20261104.md).
Проверки новой версии и границы приёмки указаны в [плане](plans/core-4.0.0-installable.md#5-ноября-публикация-core-410).

Ниже сохранено описание проверенной исходной базы 3.3.5. Её runtime manifest не включает рабочие пакеты Core4.

Отдельная сборка 3.3.5 для Codex → MCP → typed bridge → AE. Старая сборка и её история остаются в `AE_agent`; source provenance: [config/source-provenance.json](config/source-provenance.json).

`mcp-server/mcp-adapter.js` — stdio MCP; `bridge-daemon.js` — приватные grants, risk/proposal/dry-run/runner, ownership/checkpoint/read-back и HTTP boundary. `core-tool-catalog.js` строит typed schemas, `core-tool-dispatch.js` содержит реализации typed handlers через явные порты runtime. `core-plan-catalog.js` задаёт фиксированные deterministic builders; `project-state-store.js` хранит защиту, ownership, review и lifecycle.

Проверки: `npm.cmd run check:rules`, `npm.cmd run smoke:core-runtime`. Fixture запускает временные adapter+daemon на отдельном порту с synthetic credentials. Это offline proof, без live AE и native factories.

Installed CEP/MCP и production authority не переключены. Минимальный CEP, workflow coverage и проверяемый cutover остаются в [плане](plans/core-migration.md). AME сохранён с действующей паузой проверок. Codeburn остаётся отдельным внешним MCP.

Рабочие контракты: [model routing](docs/model-routing.md), [Tool-First](docs/tool-first-workflow.md) и [монтаж по сценам](docs/montage-workflow.md). Для сложных инженерных этапов — [ручной Argon review workflow](docs/argon-review-workflow.md). Offline Stage 3 проверил четыре workflow chains и 23 safety checks; это не live/visual/save-reopen/render acceptance. Staged external instruction bundle и deferred hook disposition записаны в [cutover manifest](cutover/external-instructions/manifest.json); глобальные skills, hooks и config не применялись.

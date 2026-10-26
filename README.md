# AE Agent Core

Ветка `codex/release-4.0.0` содержит изолированный контур [Core4](core4/README.md) с собственным package, модульными manifests и проверками. Offline [M2a: optional CEP bridge](plans/core-4.0.0-m2a-bridge.md) завершён: actual TCP/VM, durable completion и original dispatch provenance; [основной план](plans/core-4.0.0.md) сохраняет M1 и последующие этапы. Команды нового контура выполняются через `npm.cmd --prefix core4`; обычная правка выбирает проверки через `node core4/tools/validate-diff.js <changed-path> --run`. Установленный MCP/CEP на эту ветку не переключён; production connect без настоящего lifecycle/grant producer остаётся unavailable.

Ниже сохранено описание проверенной исходной базы 3.3.5. Её runtime manifest не включает рабочие пакеты Core4.

Отдельная сборка 3.3.5 для Codex → MCP → typed bridge → AE. Старая сборка и её история остаются в `AE_agent`; source provenance: [config/source-provenance.json](config/source-provenance.json).

`mcp-server/mcp-adapter.js` — stdio MCP; `bridge-daemon.js` — приватные grants, risk/proposal/dry-run/runner, ownership/checkpoint/read-back и HTTP boundary. `core-tool-catalog.js` строит typed schemas, `core-tool-dispatch.js` содержит реализации typed handlers через явные порты runtime. `core-plan-catalog.js` задаёт фиксированные deterministic builders; `project-state-store.js` хранит защиту, ownership, review и lifecycle.

Проверки: `npm.cmd run check:rules`, `npm.cmd run smoke:core-runtime`. Fixture запускает временные adapter+daemon на отдельном порту с synthetic credentials. Это offline proof, без live AE и native factories.

Installed CEP/MCP и production authority не переключены. Минимальный CEP, workflow coverage и проверяемый cutover остаются в [плане](plans/core-migration.md). AME сохранён с действующей паузой проверок. Codeburn остаётся отдельным внешним MCP.

Рабочие контракты: [model routing](docs/model-routing.md), [Tool-First](docs/tool-first-workflow.md) и [монтаж по сценам](docs/montage-workflow.md). Offline Stage 3 проверил четыре workflow chains и 23 safety checks; это не live/visual/save-reopen/render acceptance. Staged external instruction bundle и deferred hook disposition записаны в [cutover manifest](cutover/external-instructions/manifest.json); глобальные skills, hooks и config не применялись.

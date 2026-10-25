# AE Agent Core

Отдельная сборка 3.3.5 для Codex → MCP → typed bridge → AE. Старая сборка и её история остаются в `AE_agent`; source provenance: [config/source-provenance.json](config/source-provenance.json).

`mcp-server/mcp-adapter.js` — stdio MCP; `bridge-daemon.js` — приватные grants, risk/proposal/dry-run/runner, ownership/checkpoint/read-back и HTTP boundary. `core-tool-catalog.js` строит typed schemas, `core-tool-dispatch.js` содержит реализации typed handlers через явные порты runtime. `core-plan-catalog.js` задаёт фиксированные deterministic builders; `project-state-store.js` хранит защиту, ownership, review и lifecycle.

Проверки: `npm.cmd run check:rules`, `npm.cmd run smoke:core-runtime`. Fixture запускает временные adapter+daemon на отдельном порту с synthetic credentials. Это offline proof, без live AE и native factories.

Installed CEP/MCP и production authority не переключены. Минимальный CEP, workflow coverage и проверяемый cutover остаются в [плане](plans/core-migration.md). AME сохранён с действующей паузой проверок. Codeburn остаётся отдельным внешним MCP.

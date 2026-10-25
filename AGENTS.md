# AE Agent Core 3.3.5

Цель: Codex → MCP → typed bridge → After Effects. Исходный запрос — «приступай к переносу»; текущий план: `plans/core-migration.md`.

- Работать по-русски, сохранять чужие изменения; один writer на ресурс и один live-контроллер.
- Typed inspection → deterministic build → server-owned proposal → dry-run → подтверждение по риску → read-back. Private brands, grants, ownership, checkpoint и UNKNOWN/no-replay обязательны.
- Raw JSX, destructive и save сохраняют отдельные ручные gates. Файловый доступ не выдаёт runtime authority.
- Providers, встроенный чат, Hardcore, recipes/registry/candidates и Full Intaker не входят в Core. Codeburn — отдельный внешний MCP.
- Старый `AE_agent` — неизменяемый источник provenance; runtime state, credentials, `.git` и зависимости не копировать. Действующую установку/config не переключать до отдельного cutover.
- AME сохранён без новых работ и проверок. Live/CEP/CDP/bootstrap/native factories в текущем offline-блоке не запускать.
- Для проверок: `npm.cmd run check:rules`, `npm.cmd run smoke:core-runtime`, `git diff --check`. Offline stub не является live proof.
- Завершённые этапы фиксировать небольшим commit и обновлять Progress / Decision Log / Validation текущего плана.

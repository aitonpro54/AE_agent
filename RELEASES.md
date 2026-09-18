# AE Agent Releases

## v3.0.0 — 2026-09-13

Панель и bridge получили согласованную версию 3.0.0. Обновлены native CEP
menu/title, HTML title, версия ресурсов и Reload, package/lockfile, MCP handshake
и health. Extension ID сохранён, чтобы обновление использовало существующие
настройки и историю панели.

Новые возможности по сравнению с рабочей версией 2.0.0:

- Поиск reviewed решений на русском и английском через `search_solutions`.
- Чтение реальных рецептов и нужных schemas через `get_solution`.
- Локальные builders четырёх операций распределения scalar linear ключей,
  серверные proposals и MCP dry-run без дополнительного LLM.
- Обязательная проверка исходных ключей перед записью и точный post-readback.
- Ограниченный planner prompt без молчаливого отсечения обязательных правил.
- Метрики обращений к базе и offline-обработчик будущих A/B-замеров.

Контрольные RU/EN запросы и все 181 точных названий проходят retrieval smoke.
Реальное применение новых builders к проекту AE и процент экономии токенов
ещё не измерены. MCP preview не заменяет подтверждение реального запуска через
CEP. Исторические `testedAeContext` в registry сохраняют исходные версии.

Проверки выпуска: `check:rules`, `smoke:bridge`, `smoke:solutions`, syntax и
`git diff --check`; установленная панель — scoped branding/reload и inspect.
Подробности работы базы: [solution-reuse.md](docs/solution-reuse.md).

## v2.0.0-clean-baseline - 2026-06-04

AE Agent 2.0.0 is maintained as a compact clean baseline.

Current shape:

- local After Effects CEP panel
- local bridge daemon and stdio MCP adapter
- bridge-owned provider calls, AE plan validation, dry-run/run gates,
  checkpoints, edit-session protection, logs, and read-back verification
- typed tools, reviewed recipes, solution registry, and AE-specific Full
  Intaker/importer tooling

Cleanup refresh on 2026-07-02 keeps runtime output local and ignored, removes
stale longrun documentation from the active plan, and keeps historical evidence
in legacy storage or git history.

Validation:

- `npm.cmd run check:rules`
- touched-file `node --check` for JavaScript/MJS edits
- `git diff --check`
- focused `smoke:*` scripts for touched product/tooling surfaces

## Legacy Notes

Earlier release details live outside the clean baseline. Use legacy material
only for targeted lookup; do not re-add historical runtime evidence to this
repository.

# Проверка переноса Computer Use → CLI/MCP — 5 октября 2026

Основной перенос — M1–M5 в [плане MCP-first без рендера](../plans/tool-first-execplan.md). Проверен checkout `6e5a9e7`, AE Agent 3.3.0. Все 11 инструментов переноса присутствуют в загруженном каталоге из 170 AE MCP tools. Это подтверждает доступность имён, а не live-приёмку каждой операции.

Сегодня 8 из 9 выбранных smoke-групп прошли; `smoke:solutions` завершился с ошибкой. `check:rules` и `git diff --check` прошли отдельно. В живом AE подтверждены подключение, native чтение проекта, пассивное ожидание и CLI inspect. Live mutation, GUI, reload, save, экспорт PNG и рендер в этом аудите не выполнялись.

## Список маршрутов и текущий статус

| Задача, прежде требовавшая UI | Штатный маршрут | Проверка 5 октября |
|---|---|---|
| Ожидание подключения/свободного bridge | `wait_for_bridge_state` | Live `connected_idle`; offline regression PASS, ожидание не отправляет AE-команды |
| Ожидание завершения конкретного плана | `wait_for_plan_state` с точными observer pins | Offline PASS; live proposal отсутствует, ожидание конкретного исполнения не проверялось |
| Сбор пакета кадров для визуальной проверки | `build_comp_visual_review_plan` | Offline actual-module/isolated runner PASS; текущий проект пустой unnamed, live capture не проводился |
| Получение проверяемого списка экспортированных кадров | `get_comp_visual_review_manifest` | Offline PASS; проверяет файлы/хеши/размеры, не художественное качество |
| Состояние AEP, dirty/revision/file | `get_project_lifecycle_state` | Live PASS: AE `26.2x49`, unnamed, dirty=false, revision=1 |
| Подготовка одного именованного перехода | `build_project_lifecycle_plan`, также `build_solution_plan` для `guarded-project-lifecycle` | Offline PASS; lifecycle opt-in текущего runtime выключен |
| Save As / Open / New с именованным AEP | `save_project_as`, `open_project`, `create_named_project` внутри защищённого terminal plan | Offline PASS; live переходы намеренно недоступны до отдельной fixture-приёмки |
| Сверка неизвестного результата перехода и завершение доказанного перехода | `reconcile_project_lifecycle`, `finalize_project_lifecycle` | Offline PASS; live transition отсутствует. Reconcile не разрешает replay; finalize сохраняет manual gate |
| Диагностика и перезагрузка CEP | `node scripts/cep-panel-cdp-smoke.js inspect` / `reload` с `CEP_PANEL_ENSURE_DAEMON=0` | Сегодня inspect PASS: уникальная AE Agent page, title 3.3.0, Connected/online. Reload уже проверен в предшествующем обновлении панели; сегодня не повторялся. Остался дефект выбора CDP target, F-01 |
| Локальная классификация прежних CU-действий | `npm.cmd run report:cu-audit` | Классификатор входит в прошедшую `smoke:tool-first`; новый разбор истории сессий не запускался |
| Независимая сводка результата задачи | `node scripts/ae-task-completion.js <input.json>` | Offline CLI/actual module PASS: 24 группы, AE/provider calls=0 |
| Сохранение уже названного проекта | `save_current_named_project` через точный protected/manual flow | `smoke:project-save` PASS offline; текущий проект unnamed, live save не проводился |
| Сборка, назначения и read-back плейсхолдеров | `build_placeholder_plan`, `verify_placeholder_coverage`, `get_placeholder_usage`, `check_placeholder_assignments` | `smoke:placeholder-plan` и `smoke:placeholder-usage` PASS; usage 36/36. Это смежный ранее существовавший typed маршрут |
| Визуальные доказательства плейсхолдеров и PNG integrity | `build_placeholder_visual_review_plan`, `get_placeholder_review_manifest`, `verify_placeholder_visual_review`, generated PNG proof | `smoke:placeholder-visual` и `smoke:png-proof` PASS offline; фактический просмотр кадров остаётся необходимым |

Обычная инспекция comp/layer/property и импорт/замена source/тайминг/transform уже имели typed инструменты до M1–M5. Сегодня выполнен `get_project_info` и выбранные planner/placeholder проверки, а не live-проверка всех setters и импортов. [Разбор прежних CU-сессий](placeholder-workflow-review-2026-09-28.md) отделяет эти существующие маршруты от нового переноса.

## Найденные проблемы

### F-01 — подтверждённый дефект выбора CEP target

В `scripts/cep-panel-cdp-smoke.js:1555`:

```js
const page = pages.find((item) => item.url && item.url.indexOf(EXTENSION_ID) >= 0) || pages[0];
```

Если AE Agent page отсутствует, helper подключается к первой CDP-странице. При нескольких совпадениях выбирается первое. Для `reload` это может перезагрузить чужую CEP-панель; для `inspect` — дать ложную диагностику и затем спровоцировать ненужный CU fallback. В исправленных инструкциях уже есть внешний preflight уникальной страницы, но сам helper ещё не отказывает безопасно. Требуется точный уникальный target, отсутствие fallback и offline regression для missing/ambiguous/foreign page.

### F-02 — потеря общих правил в контексте встроенного планировщика

`mcp-server/planner-context.js:42–56` фильтрует guidance по именам выбранных tools в первом предложении каждого правила. Независимая проба использовала production `buildPlannerContext` и фактический каталог 170 tools из существующего isolated fixture. На трёх запросах (замена текста, изменение position, изменение fontSize) selectedTools содержали нужный setter, но не runner/waits; в итоговом prompt отсутствовали оба дополнительных правила: passive waits и MCP-first/CU fallback. Общая typed policy и финальные validation/dry-run/confirmation/checkpoint/read-back gates сохранились. Нужны безусловные общие правила и regression на реальные selected tool sets. Эта проблема относится к встроенному планировщику панели (`buildAePlanPrompt`); текущий Codex dispatcher получает project AGENTS и личные skills отдельно.

### F-03 — подтверждённое несовпадение схемы библиотеки решений

`smoke:solutions` остановился на первом вложенном `solution-registry-smoke.js`:

```text
text-visual-review-plan: inputs[1].type is not allowed: integer
```

В `registry/solutions.json` у `rootCompItemId` рецепта `text-visual-review-plan` стоит `type: "integer"`; `scripts/solution-registry-smoke.js:18–31` допускает `number`, но не `integer`. Остальные вложенные проверки этой группы после отказа не исполнились. Живые `search_solutions`/`get_solution` для двух других рецептов работают, поэтому это не доказательство полного отказа библиотеки. Нужна согласованная правка registry contract и повтор всей `smoke:solutions`; простой обход валидатора недопустим.

### D-01 — устаревшее описание integration в lifecycle recipe

`recipes/project-lifecycle.md:30–32` говорит, что `build_solution_plan` станет доступен после завершения daemon integration. Special case `guarded-project-lifecycle` уже реализован в `mcp-server/bridge-daemon.js:13679–13683` и покрыт прошедшей lifecycle bridge regression. Формулировка устарела. Это не разрешает включать production opt-in или обходить manual gate.

## Ограничения, которые остаются намеренными

- Первый Save unnamed AEP остаётся UI fallback по принятому lifecycle contract.
- Открытие закрытой CEP-панели, защищённое подтверждение, реальные modal/UI-only blockers и визуальная инспекция могут требовать UI. Наличие typed/CLI пути нужно проверять до fallback; отказ gate не является отсутствием инструмента.
- Lifecycle runtime сейчас `enabled=false`, `blocked=false`, `pending=null`. Native readiness false из-за unnamed проекта. Save As/Open/New не проверялись через GUI или live mutations.
- Рендер/AME исключены из M1–M5. PNG hash/manifest и тесты VM не доказывают художественную приёмку, font rendering или экономию времени/токенов.

## Проверки и evidence

Luna сверила scope entrypoints: bridge regression используют изолированные fixture-порты и VM, без live AE/provider. Выполнены `smoke:tool-first`, `smoke:planning`, `smoke:png-proof`, `smoke:ae-task-completion`, `smoke:project-save`, `smoke:placeholder-plan`, `smoke:placeholder-visual`, `smoke:placeholder-usage` — PASS; `smoke:solutions` — FAIL. Отдельно `check:rules`/diff — PASS. Tracked Git status до/после серии чистый.

Root — единственный live controller: bridge 3.3.0/PID34896, Connected, pending=0/inflight=[], editSession=null; desiredEnabled/active автономной сессии сохранены. Повторное native чтение после offline серии сохранило unnamed/dirty=false/revision=1. Exact catalogue содержит все 11 migration names. Настройки/grants и файлы проекта AE не менялись.

Flash: профиль `ae-agent`, configured model `gemini-3.8-flash-high`/high; effective model подтверждён driver metadata, effective effort отдельно не возвращён. Terminal/schema/artifact verification PASS, источник не менялся. Parent сверил findings по исходникам и фактической проверочной серии; обобщение Flash, включавшее reconcile в mutating/manual-only группу, не принято: adapter отделяет read-only reconcile от mutation context.

Локальные текущие артефакты (ignored, не historical archive): `.codex-runtime/tool-first-audit-20261005/checks/summary.json`, логи соответствующих групп, `live-readonly.json`, planner probe; Flash response — `.codex-runtime/agy-bridge/tool-first-capability-audit-20261005-01.response.json`. Отчёт проверяет указанный scope и не заявляет исправление всех 170 tools.

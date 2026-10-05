# Проверка переноса Computer Use → CLI/MCP — 5 октября 2026

Основной перенос — M1–M5 в [плане MCP-first без рендера](../plans/tool-first-execplan.md). Проверен checkout `6e5a9e7`, AE Agent 3.3.0. Все 11 инструментов переноса присутствуют в загруженном каталоге из 170 AE MCP tools. Это подтверждает доступность имён, а не live-приёмку каждой операции.

Первичный аудит дал 8/9 smoke PASS и отказ `smoke:solutions`. После исправлений все девять выбранных smoke-групп прошли; шесть изменённых JS прошли `node --check`, rules/diff — PASS. Ошибки исходного прогона сохранены в evidence. В первоначальном live read-only срезе подтверждены подключение, native чтение проекта, пассивное ожидание и CLI inspect. Активация исправленного bridge и финальный live read-back фиксируются ниже отдельно.

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
| Диагностика и перезагрузка CEP | `node scripts/cep-panel-cdp-smoke.js inspect` / `reload` с `CEP_PANEL_ENSURE_DAEMON=0` | Исходный inspect PASS. Исправленный selector и actual connector — 16 offline случаев PASS; итоговая live диагностика фиксируется после активации отдельно. GUI reload исключён |
| Локальная классификация прежних CU-действий | `npm.cmd run report:cu-audit` | Классификатор входит в прошедшую `smoke:tool-first`; новый разбор истории сессий не запускался |
| Независимая сводка результата задачи | `node scripts/ae-task-completion.js <input.json>` | Offline CLI/actual module PASS: 24 группы, AE/provider calls=0 |
| Сохранение уже названного проекта | `save_current_named_project` через точный protected/manual flow | `smoke:project-save` PASS offline; текущий проект unnamed, live save не проводился |
| Сборка, назначения и read-back плейсхолдеров | `build_placeholder_plan`, `verify_placeholder_coverage`, `get_placeholder_usage`, `check_placeholder_assignments` | `smoke:placeholder-plan` и `smoke:placeholder-usage` PASS; usage 36/36. Это смежный ранее существовавший typed маршрут |
| Визуальные доказательства плейсхолдеров и PNG integrity | `build_placeholder_visual_review_plan`, `get_placeholder_review_manifest`, `verify_placeholder_visual_review`, generated PNG proof | `smoke:placeholder-visual` и `smoke:png-proof` PASS offline; фактический просмотр кадров остаётся необходимым |

Обычная инспекция comp/layer/property и импорт/замена source/тайминг/transform уже имели typed инструменты до M1–M5. Сегодня выполнен `get_project_info` и выбранные planner/placeholder проверки, а не live-проверка всех setters и импортов. [Разбор прежних CU-сессий](placeholder-workflow-review-2026-09-28.md) отделяет эти существующие маршруты от нового переноса.

## Найденные проблемы и исправления

### F-01 — подтверждённый дефект выбора CEP target

На исходном baseline в `scripts/cep-panel-cdp-smoke.js:1555`:

```js
const page = pages.find((item) => item.url && item.url.indexOf(EXTENSION_ID) >= 0) || pages[0];
```

Исходный helper мог подключиться к чужой или первой из нескольких страниц. Исправлено через `scripts/cep-panel-target.js`: только `type=page`, точный ID непосредственно после первого `CEP/extensions`, ровно один target и пригодный WebSocket URL. Удалён fallback; malformed encoding, вложенная папка чужой extension, worker, URL fragment/credentials и ambiguity не допускают подключения. Реальный `connectToPanel` вызывает selector до socket. Leaf regression: 11 unit, 4 dynamic-loopback integration случая и defect proof — PASS; независимый reviewer повторил counterexamples без сети. Штатный CLI сохранён.

### F-02 — потеря общих правил в контексте встроенного планировщика

Первичный probe передавал в `buildPlannerContext` весь exposed каталог 170 tools; оба дополнительных правила исчезали. Production wrapper использует 134 planning names и явный Set из 91 mutation. Перепроверка этих настоящих declarations уточнила вывод: старый production filter терял **passive-wait**, а **MCP-first сохранялся**. Прежний вывод об исчезновении обоих правил именно в production был завышен; общий typed/execution gate контекст не терялся.

Исправлено явной always-included metadata двух cross-cutting правил в `planner-tool-guidance.js`. Три реальных запроса проверены через bounded извлечение production declarations и `buildAePlanPrompt`; имена, порядок и mutation Set совпадают, нужные setters/правила/ручные gates сохраняются, specialized guidance фильтруется. Все четыре lifecycle mutations правильно размечены без `autoCheckpoint`. Anonymous `/tools` остаётся 401; authenticated fixture даёт 170 tools. Использованы decorated exposed schemas, поэтому доказано равенство names/mutation Set и консервативный budget, а не полное равенство raw schemas. Legacy Array export сохранён. Это built-in planner; Codex dispatcher получает AGENTS/skills отдельно.

### F-03 — подтверждённое несовпадение схемы библиотеки решений

`smoke:solutions` остановился на первом вложенном `solution-registry-smoke.js`:

```text
text-visual-review-plan: inputs[1].type is not allowed: integer
```

У `rootCompItemId` был недопустимый custom-registry type `integer`. Исправлен на `number` с явным positive-integer требованием в description; фактический typed builder по-прежнему проверяет integer. Первый post-fix прогон выявил ещё один mismatch того же descriptor: `projectKind=offline-native-shaped-fixtures` вне enum. Указан `synthetic`, исторические версии и offline/no-real-glyph notes сохранены. Валидатор не ослаблен. Полная `smoke:solutions`, включая все 189 entries и последующие subtests, — PASS.

### D-01 — устаревшее описание integration в lifecycle recipe

Устаревшее обещание будущей integration удалено. Recipe описывает оба текущих пути к одному контракту: `build_solution_plan` и `build_project_lifecycle_plan`. Opt-in остаётся off до отдельного fixture scope; перед предложением нужна фактическая native/runtime готовность. Manual gate и первый unnamed Save через UI сохранены.

## Ограничения, которые остаются намеренными

- Первый Save unnamed AEP остаётся UI fallback по принятому lifecycle contract.
- Открытие закрытой CEP-панели, защищённое подтверждение, реальные modal/UI-only blockers и визуальная инспекция могут требовать UI. Наличие typed/CLI пути нужно проверять до fallback; отказ gate не является отсутствием инструмента.
- Lifecycle runtime сейчас `enabled=false`, `blocked=false`, `pending=null`. Native readiness false из-за unnamed проекта. Save As/Open/New не проверялись через GUI или live mutations.
- Рендер/AME исключены из M1–M5. PNG hash/manifest и тесты VM не доказывают художественную приёмку, font rendering или экономию времени/токенов.

## Проверки и evidence

Первый аудит сохранён: 8/9 smoke PASS, solutions FAIL. Post-fix матрица дала 15/17 PASS; новые fixtures выявили missing-property default и неаутентифицированный catalog GET. После коррекции и независимого review целиком повторены `smoke:tool-first` и `smoke:planning`, шесть JS syntax, rules/diff — 10/10 PASS. Остальные семь smoke-групп ранее прошли и не дублировались: solutions, PNG proof, task completion, project save, placeholder plan/visual/usage. Новые leaf suites встроены в tool-first/planning и отдельно повторно не запускались. Source SHA и ownership status до/после recheck совпали. Всё offline/isolated VM; provider/live AE calls из suites=0.

Root — единственный live controller: bridge 3.3.0/PID34896, Connected, pending=0/inflight=[], editSession=null; desiredEnabled/active автономной сессии сохранены. Повторное native чтение после offline серии сохранило unnamed/dirty=false/revision=1. Exact catalogue содержит все 11 migration names. Настройки/grants и файлы проекта AE не менялись.

Маршрут: Luna inventory/registry/fixture validation; Flash/high основная реализация; Sol/high bounded review, Sol/xhigh узкий production-fixture parity blocker; root единственный live controller. Первоначальный Flash inspect завершился valid. Flash edit после файлов завершился сетевым failure/unknown без валидного terminal JSON; оба процесса exited, фактические файлы сверены и explicit reconciliation освободила claim. Этот outcome не переписан в success: изменения приняты по diff, review и тестам. Configured model/effort Flash подтверждены, effective model подтверждён metadata, отдельный effective effort не возвращён. Reconcile lifecycle не смешан с mutating/manual-only группой.

Локальные текущие артефакты (ignored): исходный audit `.codex-runtime/tool-first-audit-20261005/`; post-fix `.codex-runtime/tool-first-fixes-20261005/{registry,checks,cep-correction,planner-correction,final-recheck}/`. Старые failures сохранены. AGY inspect/edit metadata — `.codex-runtime/agy-bridge/tool-first-*20261005-01*`. Отчёт закрывает F-01/F-02/F-03/D-01 в указанном scope; проверка всех 170 инструментов live не заявляется.

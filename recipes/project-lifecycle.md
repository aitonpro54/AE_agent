# Guarded Project Lifecycle

## Доступность

Lifecycle доступен только при явном opt-in
`AE_PROJECT_LIFECYCLE_ENABLED=1` и валидном protection store. Live acceptance
проведён в отдельном fixture scope; исторические сведения об активации и
подключении записаны в [acceptance note](../docs/tool-first-live-acceptance-2026-10-05.md).
Они не заменяют проверку состояния подключённого runtime.
Перед каждым lifecycle предложением проверь свежий `get_project_lifecycle_state`:
`enabled === true`, `blocked === false`, `problem === null`, `pending === null`;
при disabled, blocked, problem, неизвестных полях или pending transition остановись.
Если runtime выключен, недоступен или
наблюдение не свежее — остановись и сообщи фактическое состояние. Для работы требуется
уже существующий валидный protection store; runtime не создаёт пустую базу автоматически.

## Когда применять

Только по явному запросу пользователя на одну операцию: сохранить именованную
копию, открыть существующий именованный `.aep` или создать пустой именованный
проект. Первое сохранение unnamed проекта остаётся штатным UI-путём. Нативный
Save/Open/New и финальное открытие меняют Undo и активный проект; disclosure
показывается до подтверждения.

## План

1. Получить у пользователя цель `targetProjectFile` и короткую метку
   `checkpointLabel`. Проверить read-only `get_project_lifecycle_state`: текущий
   проект должен быть named, а `lifecycleReady` — true. Если значение неизвестно,
   lifecycle disabled, protection store отсутствует/повреждён или есть pending
   transition, остановиться.
2. В объекте `lifecycle` проверить `enabled === true`, `blocked === false`,
   `problem === null` и `pending === null`. Сейчас доступны оба пути к одному
   контракту: `build_solution_plan` с `solutionId: "guarded-project-lifecycle"`
   и теми же входными полями либо прямой
   `build_project_lifecycle_plan({operation, targetProjectFile, checkpointLabel})`.
   `operation` строго одно из `save_project_as`, `open_project`,
   `create_named_project`.
3. Builder сам читает свежие native file/dirty/revision, disk SHA-256 source и
   для `open_project` SHA-256 существующего target. Клиентские поля authority,
   native observations, overwrite, raw script и runtime bindings запрещены.
   Результат — ровно один terminal lifecycle step; `plan.targetProject.file`
   должен ссылаться на source.
4. Проверить цель, operation, high-risk disclosure и одношаговый scope. Source
   должен быть clean для open/create; Save As может сохранить одобренное dirty
   in-memory состояние. Новый target path для Save As/create должен быть
   свободен; существующий open target должен иметь собственную сохранённую
   policy entry. Source и target не могут совпадать.

## Исполнение

Только обычная цепочка `propose_ai_agent_plan` → успешный exact dry-run → явное
подтверждение и запуск в CEP manual lane. Direct/admin/autonomous lane запрещены,
даже если для других функций включена автономная сессия. Перед native изменением
обязательна on-disk копия source. Она сохраняет диск и не восстанавливает dirty
память After Effects.

Save As и create используют owned stage в каталоге цели, проверяют staged
inventory и публикуют финальный файл через `COPYFILE_EXCL`. Затем
проект открывается из проверенного финального файла. Open требует существующий
target и проверяет его SHA до открытия; полный native inventory target собирается
только после открытия и сравнивается с его сохранённой policy. Во всех случаях
проверяются ограниченный inventory, declared project settings, footage/proxy и
composition source identities. Неизвестные поля и переполнение блокируют запись.
Для полной media/proxy приёмки native inventory должен показывать фактические
kind/path/metadata и их cross-relations; один `complete:true` или совпавший hash
недостаточен. Актуальный live пример и известная отдельная CEP race записаны в
[acceptance note](../docs/tool-first-live-acceptance-2026-10-05.md).

Lifecycle сохраняет только точно подтверждённые restrictions, mappings и
constraints по совпадающим IDs, значениям и зависимостям. Old visual/review,
image, canonical и source-load proofs не переносятся как действительные.
Inherited ownership остаётся ограничительным: обычные edit/delete/cleanup и
повторная регистрация унаследованных IDs/owners запрещены до отдельного adoption
scope.

Рендер, AME, render queue и автоматизация экспорта в этот рецепт не входят.
Сохранённый PNG или M2 visual-review manifest означает только исторический
захват; `currentProjectStateVerified` и `artisticAccepted` остаются false, а
визуальное качество требует отдельного фактического просмотра кадра.

## Неизвестный исход и завершение

Не повторять lifecycle шаг после timeout, ошибки доставки или неизвестного
результата. Вызвать read-only `reconcile_project_lifecycle({transitionId})` и
сопоставить native/file facts. Reconcile не пишет state, не исполняет native
команды и не разрешает replay.

Только если reconciliation находит уже сохранённый `final_proven` или
`context_retired` proof, можно построить **новое** manual CEP предложение
`finalize_project_lifecycle({transitionId})` и пройти exact dry-run/подтверждение.
Finalize фиксирует доказанное состояние в protection store и не запускает
Save/New/Open. При partial/unknown состоянии требуется явно заданный проверяемый
recovery scope; уже данное разрешение на этот scope повторно не запрашивается.
Автоматического rollback, source reopen и удаления stage или partial final нет.

Для Save As `unknown/open_final_submitted` после проверенного stage/publish
доступен отдельный state-only путь. Read-only
`build_project_lifecycle_recovery_plan({transitionId})` или
`build_solution_plan({solutionId:"published-save-as-state-only-recovery",inputs:{transitionId}})`
проверяет полный persisted chain, checkpoint/source/stage/target SHA/bytes/identity,
policy migration и свежий clean final inventory. При неполном evidence, drift,
busy original run/queue или другом phase/operation builder отказывает без writes.
Summary reconcile и совпадение item count не заменяют эту проверку.

Новое предложение содержит единственный `recover_project_lifecycle({transitionId})`;
`targetProject.file` соответствует открытому final, а original source pins остаются
историческими. Exact dry-run фиксирует полный pending fingerprint, policy/migration,
native tuple/inventory и disk pins без transient observedAt. После свежего manual
CEP подтверждения recovery повторяет проверку под admission barrier, записывает
proof и immutable origin, завершает owned context, ещё раз проверяет final и
атомарно фиксирует existing target policy/receipt/generation. Ноль native
Save/Open/New и filesystem publish/save/copy/cleanup; existing checkpoint и stage
сохраняются. Original authorization и failed/unknown execution не превращаются в
успех: `recoveredBy` подтверждает только новый recovery run. Artistic acceptance,
Undo и unsaved memory не восстанавливаются.

Failure до proof write оставляет original pending; после write barrier и recovery
origin сохраняются. Только реально persisted recovered proof допускает новый
strict manual finalize, без replay. Unknown store-write исход сначала сверяется;
слепой повтор запрещён. Старый строгий reader может не прочитать новые optional
recovery fields: downgrade после исполнения требует совместимого reader либо
отдельной reviewed migration.

Поддерживается один production daemon/controller на один store. Изменение
контекста меняет Undo; старые proposals/caches/context retired. Persistent
generation отделяет будущие cache keys, но не является разрешением повторить
операцию. Если при остановленном сервере выключить флаг и удалить одновременно
store и initialized marker, отсутствие этой истории нельзя обнаружить без
внешнего evidence; такой сценарий не является поддерживаемым recovery.

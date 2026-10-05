# Guarded Project Lifecycle

## Доступность

Rollout production opt-in `AE_PROJECT_LIFECYCLE_ENABLED=1` остаётся OFF до отдельной
fixture scope. Перед lifecycle предложением проверь свежий `get_project_lifecycle_state`:
`enabled === true`, `blocked === false` и `pending === null`; при disabled, неизвестных
полях или pending transition остановись. Для работы требуется уже существующий валидный
protection store; runtime не создаёт пустую базу автоматически.

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
Save/New/Open. При partial/unknown состоянии требуется отдельный явно заданный
recovery scope; автоматического rollback, source reopen и удаления stage или
partial final нет.

Поддерживается один production daemon/controller на один store. Изменение
контекста меняет Undo; старые proposals/caches/context retired. Persistent
generation отделяет будущие cache keys, но не является разрешением повторить
операцию. Если при остановленном сервере выключить флаг и удалить одновременно
store и initialized marker, отсутствие этой истории нельзя обнаружить без
внешнего evidence; такой сценарий не является поддерживаемым recovery.

# Минимальный путь: подключение → два задания AME → запуск очереди

15 октября 2026. Поручение пользователя: определить обязательный минимум;
первоочередной результат — валидные элементы в AME и простой запуск очереди.
Автоматическая проверка готового видео сейчас не требуется. Предпочтение — без Computer Use.

## Progress

- Аудит исходников и актуального MCP-статуса завершён; реализация нового профиля не начата.
- MCP: `owned_registration_absent`, `owned=false`, `replayAllowed=false`.
  Доступны только owned/usage tools; `search_solutions/get_solution` недоступны.
  Локальный просмотр registry не выявил подходящего AME-рецепта.
- Последний проверенный source/build checkpoint — `507740e` (Completion77).
  Постановка двух заданий и запуск в этом аудите не выполнялись; видео 0/2.
- `ae_architect` проверил startup/admission и native predicates; `ae_scout` —
  AME adapter, схемы очереди и ограничения API. Root владеет только этим планом
  и записью в основном execplan; чужие smoke/WIP, runtime и AE не изменяются.

## Decision Log

Ближайший профиль — **один batch, два независимых варианта, один START**.
Повторно используем существующий AME adapter; универсальный runtime не переписываем.
Это новый сокращённый контракт, а не снятие guards текущего serial/media профиля.
Пауза старого сценария проверенных видео сохраняется; здесь поручены аудит и план.

| Область | Обязательно для ближайшего результата | Отложено |
|---|---|---|
| Подключение | Принадлежащие controller/daemon, auth, panel connection, свежий project READ | AME/media как условие первого READ |
| Исходник | Точные AEP/comp/layer IDs, актуальное RAM-состояние, сохранность оригинала | Общая система выбора произвольных вариантов |
| Два варианта | Независимые неизменяемые AEP-снимки и восстановление рабочей копии | Дополнительные титры и визуальная переработка |
| Параметры AME | Точный source GUID, preset ID/SHA, диапазон, отдельные output без overwrite | Доказательство формата/качества по закодированному файлу |
| Постановка | Две подтверждённые association source/preset/output и queued/readiness | Декодирование файлов |
| Общий START | Один закреплённый batch/process, честное подтверждение состава очереди, один dispatch | Автоматический полный native census очереди |
| Завершение | Различать accepted/running/native finished/error/unknown; безопасный lifecycle | MediaAccepted, D49 decoder reservations, D50 media collector |
| Кадры | Не менять оформление в рамках этой задачи | PNG, alpha/frame/full-decode и визуальная приёмка видео |
| Допуск | Source closure, build, конечный бюджет и seal именно сокращённого профиля | Прежний бюджет полного media workflow как prerequisite |

DXV3 High Quality с alpha остаётся требуемой настройкой выбранного EPR;
применение пресета проверяется на задании настолько, насколько позволяет API.
Это не доказательство свойств закодированного файла: `mediaVerified=false`.

## Что уже есть и что действительно мешает

1. `enqueue_ame_title_variant` вызывает `addDLToBatch`, `start_ame_title_batch` —
   `runBatch`. Computer Use для самих этих операций не нужен.
   Backend допускает два enqueue в одном batch до START: `previousJobsReady`
   проверяет другие batches ([код](../mcp-server/ame-title-jobs.js#L363)).
2. Поддержка exact2 manifest v1 существует, но нынешний START принимает только
   `cep_user_declaration_v2` с одним новым job; `observeQueue` также требует один.
   Нужна согласованная exact2 связка adapter → CEP declaration → native capability,
   а не только расширение enum ([START](../mcp-server/ame-title-jobs.js#L442),
   [manifest](../mcp-server/ame-manual-queue-grant.js#L26)).
3. Native serial-профиль требует `MediaAccepted` перед slot2 copy/source/enqueue,
   completed-prefix и restoration; broker также проверяет media terminal.
   Эти predicates нужно разделить по новому queue-only контракту с собственными
   receipts и restoration/quiescence, без поддельного media success
   ([client](../native/owned-runtime-local-session/local_session_native_client.cpp#L2257),
   [broker](../native/owned-runtime-local-session/local_session_win32.cpp#L915)).
4. `runBatch` запускает общую очередь. Нынешний adapter читает только свои retained
   wrappers; полного native census чужих items он не доказывает.
   Короткий маршрут сохраняет **одно настоящее подтверждение пользователя в CEP**
   для exact2 manifest. Оно не является Computer Use и не подменяется скриптом.
   `nativeQueueCompositionVerified=false` остаётся честным. Если подтверждение
   невозможно или состав неоднозначен, START закрыт, без очистки чужих заданий
   ([ограничение API](../docs/ame-title-batch.md#L351)).
5. Для полностью автоматического запуска без участия человека отдельно требуется
   подтверждённый API полного состава очереди либо запуска только выбранных items.
   Его наличие в установленном AME не установлено; это не prerequisite пути с CEP-confirmation.

## Последовательность реализации и приёмки

1. **Закрыть сокращённый контракт.** Фиксировать exact2 batch/start, допустимые
   READ/effects, native terminal отдельно от media acceptance, restoration и teardown.
   Пересчитать бюджет фактических операций; старые Call86/external192 не переносить
   автоматически. Не расширять ambient/default daemon admission.
2. **Согласовать существующую реализацию.** Принять queue-only enrollment/capabilities,
   native slot predicates, adapter/CEP exact2 START и статус без обязательного media probe.
   Existing media tools/tests сохранить для последующего этапа; noReplay и UNKNOWN
   reconciliation, auth/proposal/dry-run/confirmation и source protection не ослаблять.
   Проверить адресные отказы: чужой/изменившийся source/preset/process, output collision,
   второй START, lost ACK, неверное число jobs, чужая очередь и restoration debt.
3. **Собрать выбранный профиль и проверить подключение.** Source/build closure,
   finite footprint/FIT и activation seal относятся только к нему. Первый live READ
   выполняется в той же заранее принятой original session, что и очередь; не расходовать
   одноразовый launch на disposable READ с последующим hot-upgrade/replay.
   Приёмка подключения — panel connected и свежий `get_project_info`, не HTTP health.
4. **Подготовить и поставить два задания.** По свежему READ подтвердить текущие
   AEP/dirty/comp/layer identities и ранее выбранные первые два состояния текста.
   Не открывать исторический AEP вместо текущего автоматически. Защитить оригинал,
   создать независимые snapshots без overwrite, сверить каждый source GUID и preset,
   добавить два items и проверить их readiness/association. До START обязателен
   отдельный read-back барьер: исходные RAM/project/UI восстановлены, debt cleared.
   Новый контракт явно разрешает restoration при own queued-but-not-started items,
   сохраняя pins обоих immutable snapshots; EOF/UNKNOWN не считаются освобождением.
5. **Подтвердить состав и выполнить один START.** Пользователь подтверждает exact2
   manifest в CEP; после restoration нужны свежие queue/source/process guards
   и действительное exact2 подтверждение, прежние permits не наследуются автоматически.
   Затем сервер выполняет once-dispatch `runBatch`.
   Результат ближайшей приёмки — queued2/2 + `batch_start_accepted`, с отдельным
   factual running/native-finished статусом, когда он наблюдён. Принятый START не
   объявляется двумя завершёнными экспортами и не завершает original lifecycle.
   Original controller/broker и нужные snapshot/queue witnesses удерживаются до
   factual завершения/ошибки своих jobs и проверенной quiescence; затем выполняются
   разрешённый cleanup, exact teardown/exit. UNKNOWN сохраняет unresolved state,
   не разрешает повтор START и не считается PASS. Пользовательские AE/AME не
   завершаются; видео не декодируется.

Не создавать отдельную ветку разработки native census, media collector или нового
универсального SDK ради этого результата. При найденном blocker фиксировать точный
недостающий queue/start контракт, не возвращать весь media workflow по умолчанию.

## Validation

Аудит — чтение исходников/контрактов и один read-only MCP status; live operations,
build, изменение AEP/очереди и Computer Use не выполнялись. Архитектурная проверка
плана принята с уточнениями restoration-before-START и original lifecycle до quiescence;
оба внесены. Проверки документации: `npm.cmd run check:rules`, `git diff --check`
и проверка staged diff — PASS. Product/native smoke не запускались: изменён только план.
Реальная совместимость установленного AME/EPR и текущие project IDs пока не подтверждены.

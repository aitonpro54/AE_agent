# Минимальный путь: проверка своих элементов → запуск общей очереди AME

15 октября 2026. Пользователь уточнил смешанный workflow: он может параллельно
добавлять свои задания в AME. Проверять всю очередь не требуется; достаточно
проверять каждый элемент агента сразу после добавления. Штатный запуск —
без ручного подтверждения и без Computer Use. Проверка готового видео отложена.

## Progress

- Аудит существующих AME submit/status/start и native admission выполнен.
  Новый профиль ещё не реализован; AEP и очередь не изменялись, видео 0/2.
- Последний проверенный MCP status: owned_registration_absent / owned=false.
  Последний product source/build checkpoint — 507740e (Completion77).
- ae_architect — bounded source/policy review; ae_scout — AME item observations;
  root — этот план и основной execplan. Чужие smoke/WIP сохраняются.
- Предыдущие варианты с exact2 census общей очереди и ручным CEP witness
  заменены явным новым поручением о смешанной очереди.

## Decision Log

- Два задания — количество создаваемых агентом items, не полный состав AME.
  Наличие заданий пользователя, другой preset или другое количество общих
  entries само по себе не закрывает enqueue/START.
- START имеет явную семантику «запустить общую очередь AME». Пользовательские
  ready items также могут начать кодироваться. Выборочный запуск только своих
  jobs не обещается. Параллельное добавление пользователем разрешено.
- Не перечислять, не удалять, не менять настройки и не переставлять чужие items.
  Не проверять отсутствие других writers и неизменность всей очереди перед START.
- Это новый разрешённый shared-queue контракт. Требуются согласованные typed/native
  capabilities; нельзя обходить старый gate прямым HTTP/JSX или выдавать
  автоматический вызов за человеческий witness.
- nativeQueueCompositionVerified и mediaVerified остаются false.
  Разрешение общего START не является утверждением о составе или качестве видео.
- Не разрабатывать full queue observer, per-item START, decoder/alpha/PNG/D50
  ради ближайшего результата. Runtime identity, auth, once/noReplay, UNKNOWN
  reconciliation, pins своих snapshots/output и сохранность RAM остаются.

## Достаточная проверка добавляемого элемента

До enqueue проверить точный сохранённый snapshot/SHA, source GUID из этого AEP,
выбранный EPR path/SHA, допустимый диапазон и отдельный output без overwrite.
Для двух вариантов нужны независимые immutable snapshots; исходные AEP/RAM защищены.

Сразу после addDLToBatch проверить фактический возвращённый EncoderWrapper,
успешность установки диапазона, его outputFiles и отсутствие ошибок доступа.
Затем прочитать тот же retained wrapper отдельным собственным status read
с привязкой к process/session/request; потерянный ответ сверять по прежнему nonce,
не повторять enqueue. Хранить отдельный receipt успешного добавления каждого item.

Границы текущего API: source/GUID/preset/range в readEntry частично берутся
из собственной записи запроса; это не независимый getter AME. outputFiles —
фактическое свойство wrapper, setWorkArea возвращает подтверждение вызова.
queued — состояние adapter после submit, running/native-finished уточняются
events; это не полная инспекция native очереди. Нельзя выдавать собственные
поля за подтверждение фактически применённого пресета или содержимого видео.
Требуемый DXV3 HQ-alpha задаётся точным EPR; media proof в этом scope отсутствует.
При API refusal, неверном output или неподтверждённой association item не принимается;
частично выполненное добавление сохраняет UNKNOWN, без автоматического дубликата.

Основа: [native submit/status](../mcp-server/ame-title-jobs.js#L81),
[source GUID и enqueue](../mcp-server/ame-title-jobs.js#L127),
[status service](../mcp-server/ame-title-jobs.js#L487).
Публичный [EncoderHost API](https://ame-scripting.docsforadobe.dev/reference/#encoderhostscriptobject)
описывает общий runBatch; полное перечисление очереди этому workflow не нужно.

## Недостающая реализация и минимальная последовательность

1. Принять узкий shared-queue контракт: source/item validation, два own enqueue,
   один автоматический общий START, native completion/error отдельно от media.
   Пересчитать конечный бюджет выбранного профиля без D49/D50/decoder children.
2. Согласовать existing adapter/native predicates. Backend уже допускает два
   enqueue в одном batch; текущий START schema/CEP grant рассчитаны на single-job
   human declaration, native slot2/restoration требуют MediaAccepted.
   Заменить эти связи явными receipts своих items и shared-queue capability,
   сохранив старые профили и fail-closed при неподтверждённой собственной операции.
3. Проверить и собрать только этот профиль: адресные negatives для source/preset/
   output/process changes, invalid own wrapper, duplicate/unknown enqueue/START,
   restoration debt; положительный случай с чужими ручными items в очереди.
   Общий queue count и чужие preset не являются проверкой отказа.
   Source/build/FIT/seal относятся к сокращённой программе.
4. Один original lifetime: подключение → actual project READ → защита оригинала
   и два snapshot → enqueue каждого с немедленным собственным read-back →
   восстановление исходных project/RAM/UI и cleared debt → свежая адресная
   проверка своих items/process/session → автоматический START.
   Не расходовать одноразовый launch на disposable READ с hot-upgrade.
   Текущий код закрывает enqueue при batchRunning; поддержку добавления во время
   чужого encoding проверить отдельно и не обещать по одному смешанному составу.
   Если наши items уже начали кодироваться вследствие запуска пользователем,
   согласовать фактический статус, не выполнять повторный START как retry.
5. Ближайшая приёмка: own items accepted 2/2 и общий START accepted либо уже
   наблюдаемый running своих items. Это не два завершённых экспорта.
   Original controller/broker и нужные own snapshot/queue witnesses сохраняются
   до factual terminal/quiescence своих jobs, затем exact cleanup/teardown.
   UNKNOWN остаётся unresolved; пользовательские AE/AME и чужие jobs не завершаются.
   Никакого ожидания чужих jobs ради объявления собственной media acceptance.

## Validation

Только source/doc reads; прежний read-only MCP status. Live submit/start, build,
Computer Use, video decode и проектные изменения не выполнялись.
Bounded architecture review подтвердил реализуемость shared START без полного census;
перед START добавлена свежая адресная проверка своих items. Проверки документации:
check:rules и git diff/staged diff --check — PASS.
Shared-queue implementation/live acceptance ещё не заявляются.

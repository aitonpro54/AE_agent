# Минимальный путь: проверка своих элементов → запуск общей очереди AME

15 октября 2026. Пользователь уточнил смешанный workflow: он может параллельно
добавлять свои задания в AME. Проверять всю очередь не требуется; достаточно
проверять каждый элемент агента сразу после добавления. Штатный запуск —
без ручного подтверждения и без Computer Use. Проверка готового видео отложена.

## Progress

- Пользователь поручил реализацию и реальный запуск; работа возобновлена.
  ae_specialist пишет native/initial admission, ae_implementer — AME adapter/grant.
  Root — единственный build/deploy/AE/AME controller. AEP/очередь пока не менялись.
- Дополнительное поручение «Поставь всё необходимое» разрешает нужные установки.
  Bundled Node24.19 и MSBuild найдены; проверяются остальные точные build inputs.
- AME source-блок готов: shared queue grant, немедленный own-item read-back,
  global once START; root повторил VM-проверки. Устранён необоснованный лимит 1s
  до consume после native preparation, добавлен regression на задержку 5s.
  Это offline checkpoint; native admission/build и live запуск ещё выполняются.
- Native source-блок готов: отдельный shared_queue_v1, восстановление исходного
  проекта до общего START, собственные terminal receipts 2/2 и барьер завершения
  своего I/O. Root повторил три focused проверки и 11 AME VM-сценариев: PASS.
  Сборка Windows и реальное подключение остаются следующим этапом.
- Driver source готов: actual pin/census collection, предварительная компиляция
  всех трёх ролей без запуска creator и отдельный production build/seal.
  Root проверил pure smoke 9 групп, syntax 6 JS и PowerShell parser: PASS.
  Перед native-сессией выполняется фактическая компиляция Windows.
- Actual Collect PASS: 677 файлов и 10 реальных prior namespaces; native factories 0.
  Первый CompileOnly остановился до создания MSBuild: Process.Start error 87 для
  Volume GUID executable locator. Physical pins проверены; исправляется отдельный
  ordinary launch locator с сохранением проверки исходного процесса. Native build,
  seal/C1 и live enqueue/START ещё не выполнены.
- Исправлен launch locator: ordinary DOS path отдельно от physical canonical pin;
  исходный process HANDLE/image/birth проверяются до/после ожидания. Только error87
  без process association классифицируется NOT_CREATED, остальные исходы UNKNOWN.
  CompileOnly также требует сохраняемого root owner. Pure10/parser/syntax3 — PASS;
  перед повтором собираются актуальные build inputs, старые записи сохраняются.
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

Native/shared source checkpoint: context-smoke, runtime-smoke, source-proof,
AME shared queue smoke (11 групп), syntax 10 JS, check:rules, diff --check — PASS.
Это offline проверки; native binary, admission и два реальных enqueue не заявлены.

Только source/doc reads; прежний read-only MCP status. Live submit/start, build,
Computer Use, video decode и проектные изменения не выполнялись.
Bounded architecture review подтвердил реализуемость shared START без полного census;
перед START добавлена свежая адресная проверка своих items. Проверки документации:
check:rules и git diff/staged diff --check — PASS.
Shared-queue implementation/live acceptance ещё не заявляются.

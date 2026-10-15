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
  Исправлены Windows launch locator, startup GO+EOF и exact-vendor link mode.
  Все действия используют сохраняемый root owner; исход v3 source-only Node
  сохраняется UNKNOWN (original exit не доказан), без повтора прежней операции.
- Actual v7 preflight COMPLETE на source dc2ab41: provisioner, Node client и broker
  CPP/link PASS (0 ошибок); preprocess/includes/link-read входят в planned M.
  Compile original children 9/9 CLOSED, exit0/EOF; actual source AEP и EPR прежние.
  Input SHA 4ceb2547…d221f, receipts остаются local/ignored.
- Actual BuildAndSeal с теми же inputs собрал и установил все три native роли.
  Original creator выдал prepare424 и final752 после записи seal/enrollment.
  Parent verify-final отказал: artifact JSON сохранился в порядке 3,1,2 вместо
  1,2,3 (`Sort-Object code` для OrderedDictionary). ACK не отправлен; original
  creator CLOSED exit2, stdout/stderr EOF подтверждены тем же HANDLE.
  Root сохраняет original pins/owner; повтор creator/build запрещён. Выполняется
  отдельная полная read-only сверка той же установки; успех BuildAndSeal не заявлен.
  C1/daemon ещё не запускались, enqueue 0/2, START не отправлен.
- Полная read-only reconciliation v7 PASS: 660 build inputs, 137 dependencies,
  690 byte files, 700 expected pins; actual creator exit2/noACK сохранены.
  Первая factory отвергла argv0 slash mismatch до broker creation; original
  Node exit0/stdio close. Исправленный launch создал broker, но header timeout:
  actual existing HANDLE pair через CompareObjectHandles подтверждает exit2.
  Root удерживал READ witness lock, мешавший exclusive fence; startup budget1s
  также меньше observed3.47s. Connect/native.open/StartJournal не достигнуты,
  journal пуст. Original controller exit0/stdio close; v7 RETIRED_UNADMITTED.
  Старые seal/runtime/records сохранены, exact3 artifacts перенесены в local
  retired-artifacts с сохранением file IDs/SHA; consumed floor не сбрасывался.
- Минимальный repair source готов: bootstrap read/EOF30s отдельно от established
  I/O1s; driver сортирует OrderedDictionary по числовому code. Offline12groups,
  shared source proof, actual PS3,1,2→1,2,3 и parser PASS. Далее fresh v8 provisioning
  с явным audit старой не допущенной установки; root не удерживает lock witness
  перед передачей exclusive fence broker. AE/AME effects остаются0.
- Startup audit выявил тот же1s bound у reply Open/ReserveInitialLaunch/BootHello;
  Reserve синхронно повторяет полный seal check до ответа. Исправлены только эти
  три role/verb reads на30s; writes/cancel/остальные reads остаются1s. Source
  predicate3positive/15negative PASS. V8 Collect завершён2/2exit0/EOF, но его
  source-only manifest отмечен superseded до compile/seal/factory. Следующий
  frozen source/M — v9; v7 retirement audit остаётся явно связан с новой policy.
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
- [block: reconciliation полного seal после несостоявшегося ACK]
  [executor: ae_specialist / Sol6.1 xhigh] [reason: native authority boundary]
  [ownership: новый ignored read-only verifier]. Root — sole original owner.
  Native ACK не является persistent admission marker: final752 отправляется после
  durable write/read-back, OpenFixed независимо проверяет полную установку.
  Допустима только factual сверка same installation с сохранением exit2/noACK;
  normal success receipt, replay, новый seal и исправление pinned source запрещены.
- После exact settlement pre-C1 допускается replacement отвергнутой установки:
  старое состояние явно retired/сохранено, его binaries выведены из fixed root;
  новое provisioning не скрывает old runtime как absent и не сбрасывает floor.
  Runtime admission остаётся самостоятельным gate. При consumed C1 этот путь
  неприменим. Native bootstrap repair — ae_specialist, root — driver/install/live.

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

# План исполнения AE Agent 3.3.1

Продукт: [specs/target-app.md](../specs/target-app.md).
Режимы запуска: [docs/deployment-modes.md](../docs/deployment-modes.md).
Точная текущая задача: [автоматическая передача и завершённая пара титров](../docs/product-two-title-workflow.md).

## Текущая цель пользователя

По поручению 16.10 довести существующий адаптер и выполнить одну реальную
автоматическую передачу в AME с точным preset и полным диапазоном0..15.4s,
затем независимо проверить собственный wrapper. Без новой системы, GUI-передачи,
нового export/save/open, повторного enqueue и START/рендера. Предыдущая задача
двух титров и одного START завершена через явно разрешённый GUI fallback;
её результат и старые UNKNOWN сохранены как история в linked workflow.

## Progress

- 16.10 уточнён default следующих заданий: свежая marked workArea exact pinned
  comp → explicit start/end. Full comp только явно; adapter range не подменяет.
  Tool metadata/workflow исправлены; nonzero2..12s fixture PASS, live0.

- 16.10: одна автоматическая передача выполнена: run `580dec47`, job `27f44aa2`,
  exact EPR/source/GUID/output, живой wrapper и setWorkArea(3,0,15.4)=true.
  После `eed1585` независимый STATUS `89125766` подтвердил queued/ownItemAccepted;
  START0, outputFiles[] сохранён как список ещё не созданных файлов. Output/preset
  binding — подтверждённые аргументы addDL, отдельного getter proof нет.
  Source changes: `b5cbcbe` → `a413840` → `ece4680` → `019c220` → `eed1585`.

- 16.10: пользователь разрешил завершение через GUI. На фактически пустой очереди
  добавлены ровно2 own items из проверенных snapshots, каждый проверен с точным
  preset/output и Entire Composition15.4s. Один START принят, фактически наблюдались
  Pause/Stop и активный encoding первой строки. Цель выполнена через GUI fallback;
  старый native UNKNOWN сохранён, native ledger не подменялся GUI proof. UI-блок
  закрыт/reset; готовое видео не проверялось. Evidence — в linked workflow.
- `3c5287d`: обычный запуск панели; manual connect, reload auto-connect и реальный
  get_project_info подтверждены. Базовый connect больше не зависит от finite admission.
- `fbf2a4f`: product reads, proposal/dry-run и autonomy доступны через проверенное
  product provenance. Fresh lifecycle provisioned без выдуманного ownership/checkpoint.
- `fabb7ff`: inspector сохраняет неизменяемых TextLayer consumers общего matte;
  исправлено завершение bridge при idle CEP longpoll. Live inspector PASS.
- `b690fc6`: ordinary product AME read port; protected SaveAs dry-run доступен
  без manual execution authority. Exact proposal/dry-run PASS, save/enqueue/start0.
- `b119b5c`: autonomous AME context/dispatch в существующем runner;
  отдельный typed export_two_title_snapshots с source checkpoint, двумя новыми
  файлами, фиксированными двумя переключениями и возвратом исходника. Offline
  проверки и bounded source review GO. Установлено; live export дошёл до двух
  snapshot saves, затем server timeout при source reopen; результат требует recovery.
- `69b5244`: native primitive comparator исправлен; actual dry-run PASS.
  Run `b9377a63` UNKNOWN: два snapshot files существуют, source/checkpoint неизменны,
  callback пришёл позже120s и был отвергнут. Enqueue0/start0; export не повторять.
- `6483092`: узкий capture-first recovery установлен; native receipt, snapshots и
  fresh source baseline проверены, private saved-source proof восстановлен.
  Первый enqueue run `d784c316` UNKNOWN; исходный exception не сохранён, поддержанного
  пассивного способа восстановить его нет. Приём не установлен, slot2/START0.
- `07f64c1`: not_sent settlement по immutable no-command record и rehydrate из
  verified snapshot receipt проверены. Две предdispatch попытки завершены без
  доставки; новая run `0a310bc2` отправила один настоящий enqueue command и остаётся
  UNKNOWN. Slot2/START0; его replay запрещён.
- `0054e60` → `a9fff09`: исправлены wire serializer и exact UTF-16 arguments;
  live current source/output paths совпали с серверными. Независимый readonly
  own-status подтвердил retained entry с wrapper null и прежним удвоенным path;
  original nonce `5b59…` callback timeout/body null. Приём не установлен.
  Actual AME capability reflection не выявил queue lookup/save. Затем пользователь
  разрешил точечное GUI исключение; результат завершения приведён выше.
- AME source discovery nonce сохранён timeout без повторной отправки. Это
  getDLItemsAtRoot, а не подтверждение приёма собственного задания. Для enqueue
  требуется actual saved snapshot/native GUID и реальная проверка own wrapper.

## Decision Log

- Выбор диапазона выполняется при подготовке плана: workAreaStart + Duration
  из get_comp_details того же source/comp; explicit user range имеет приоритет.
  Невалидная/отсутствующая область требует уточнения, не fallback на comp.duration.
  Предыдущий actual0..15.4s и его receipts сохраняются как история.

- 16.10: outputFiles — generated files, поэтому queued admission использует только
  exact addDL call ack + живой own wrapper + явный range ack + свежий stopped/queued
  read без ошибок/завершения. Generated-output/completion/media proof не выдаётся.
  Старый UNKNOWN не replay: его transport slot сохранён отдельно; новый job имеет
  собственную reservation. Run `04748598` доказанно отказал до BridgeTalk constructor
  и получил отдельный exact not_sent settlement; та же reservation доставлена один раз.

- 16.10: исправление передачи путей не даёт права повторить неизвестный addDL.
  Readonly observation имеет отдельный nonce/audit; original mutation sender
  неизменен. Null wrapper и старый batch.xml не доказывают отсутствие queue item.
  Пользователь явно разрешил GUI завершение; независимая визуальная сверка пустой
  очереди предшествовала GUI добавлению. Чужие items и старый UNKNOWN не изменялись.
- В обоих snapshots наблюдался missing ReservoirGrunge; закрыт информационный OK,
  штатная подмена не сохранялась в AEP. Причину прежнего timeout не объявляем доказанной.
- 15.10: по прямому поручению пользователя управление передано в чат
  `01a14081-3bdf-7ed0-8ae8-e583c49f06ef`; прежний writer и AE/CEP/AME controller
  остановлены. Цель — минимальный запуск через действующую автономную сессию.
  Один обязательный server dry-run на актуальный план; неизменённые проверки
  повторно не запускать. Новая experimental приёмка и общий UI workflow не нужны.
- Продолжаем обычный product путь. Historical finite/native admission, old whole-M
  acceptance и legacy media proof не являются условиями product экспорта.
- Generic SaveAs/Open, raw и destructive gates сохраняются. Новая операция
  snapshots — один server-proposed typed step с действующей автономной сессией,
  успешным dry-run, exact args/current proposal, clean source и checkpoint.
- Source disk не перезаписывается; snapshots создаются только в его каталоге с
  CREATE_NEW. Native программа меняет только visibility двух выбранных слоёв,
  сохраняет каждый вариант и возвращается к тому же pinned source.
- Сервер проверяет SHA/file identity; AE проверяет path/dirty/revision, length/mtime,
  IDs, baseline graph/matte/text/flags и actual GUID после каждого сохранения.
- Deadline ограничивает допуск следующей мутации. Известное завершение уже
  допущенного open после deadline сохраняет силу при успешном read-back.
- Частичный/неизвестный исход сохраняется в original plan/command record и
  reservations. Нет слепого replay, catch-restore или принудительного discard.
- Узкий recovery-read восстанавливает прежний receipt, сохраняя original UNKNOWN.
  Startup selector не выдаёт authority; native guard до HTTP защищает capture от
  фонового placeholder-state-read. После durable capture обязательны exact native
  joins, stable files и fresh source baseline до private saved-source adoption.
  Original lease generation/connectionId и current panel/process continuity
  сверяются; отсутствующие historical PID/epoch поля не выдумываются.
- AME использует существующие private executor capabilities, shared-queue issuer
  и once reservations; выбор product/experimental сделан до отправки.
- Exact sources reconciliation классифицирует исходный read-only slot; sender
  сохраняет его callback отдельно в том же объекте. Он не блокирует независимый
  queue send; unknown enqueue/start/status сохраняет fence. Retained read только один.
- Семь чужих WIP сохраняются. Push/PR, paid providers, Local/Ollama и frozen
  intake не входят в этот этап.

## Validation

- Текущий scope: focused diagnostics8 / own-status29 / not-sent+rehydrate25 PASS;
  syntax/ES3/rules/diff PASS. Live current dry-run `746128d6`, actual delivery
  `580dec47`, independent STATUS `89125766` PASS; actual addDL1, START0.
- Receipt честно разделяет exact call ack и API getter/generated-file proof:
  queued acceptance=true, appliedPresetVerified/generatedOutputVerified/mediaVerified=false.
  Evidence: ignored `.codex-runtime/product-two-title-sol/auto-one-final-acceptance-*.json`
  и `auto-one-final-independent-status.json`; точные pins/ограничения — в workflow.
- Предыдущая GUI-пара:2 Ready rows, exact preset/output/full range, START1 и active
  encoding подтверждены screenshots/root review; видео не проверялось.
- Исторические bridge/export/recovery/wire checks и original UNKNOWN описаны в
  workflow и Git. Их результаты не подменяют текущую live приёмку и не требуют повторов.

## Следующий шаг

Текущий этап завершён: одно своё задание принято и независимо прочитано в AME.
Дополнительный ENQUEUE, START и проверка готового видео в этот этап не входят.
Новые операции требуют отдельного поручения и свежих штатных gates; старые UNKNOWN
не повторять. Повторный export/save/open и historical finite admission не нужны.

## Отложенные и исторические scope

- Выпуски, PR и merge: [release workflow](../docs/release-workflow.md).
- Монтаж: [workflow](../docs/montage-workflow.md),
  [план](montage-pipeline-execplan.md). Остальной product backlog — в target spec.
- Frozen intake: [manifest](../config/frozen-intake-manifest.json); разморозка отдельно.
- Исторические first-two states: [документ](../docs/owned-runtime-first-two-test-states.md).
  Старые MSI/receipt/budget подробности сохранены в Git до `b690fc6` и существующих
  historical docs; они не повторяются как активные blockers этого этапа.

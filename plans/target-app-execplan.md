# План исполнения AE Agent 3.3.1

Продукт: [specs/target-app.md](../specs/target-app.md).
Режимы запуска: [docs/deployment-modes.md](../docs/deployment-modes.md).
Точная текущая задача: [два титра через product workflow](../docs/product-two-title-workflow.md).

## Текущая цель пользователя

Добавить два собственных задания TITR_01 / TITR_02 из titr_all.aep в смешанную
очередь AME, проверить каждый собственный item сразу после enqueue и один раз
запустить общую очередь. Пользователь явно разрешил общий START, исключил
Computer Use, участие человека и проверку готового видео. Точные human thread /
turn, тексты, comp/layer IDs, snapshot paths и исходный hash — в linked workflow.
Чужие задания не изменять; полный обход очереди не входит в приёмку.

## Progress

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
- AME source discovery nonce сохранён timeout без повторной отправки. Это
  getDLItemsAtRoot, а не подтверждение приёма собственного задания. Для enqueue
  требуется actual saved snapshot/native GUID и реальная проверка own wrapper.

## Decision Log

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
- Разовый Astra override завершается этим source milestone; далее задачу ведёт
  Sol 6.1/XHigh, Astra — только штатная эскалация по existing routing rules.
- Exact sources reconciliation классифицирует исходный read-only slot; sender
  сохраняет его callback отдельно в том же объекте. Он не блокирует независимый
  queue send; unknown enqueue/start/status сохраняет fence. Retained read только один.
- Семь чужих WIP сохраняются. Push/PR, paid providers, Local/Ollama и frozen
  intake не входят в этот этап.

## Validation

- Уже подтверждены live: connected, project info/snapshot/property reads,
  ordinary proposal/dry-run/autonomy; title inspector; нормальный bridge restart.
- `b690fc6`: actual product read port/lifecycle gate — 10 focused PASS;
  SaveAs dry-run — PASS. Source discovery timeout не объявлен успехом.
- Текущий source: AME adapter/actual runner context/own START — 25 focused PASS;
  snapshots actual module/file reservations/fixed native program — 20 PASS
  (AE mock), включая partial save, deadline, stale source/revision/checkpoint,
  foreign destination, once, восстановление и known late-open completion.
- Fixed snapshot program ES3, touched JS syntax и diff — PASS.
- Bounded source review GO, check:rules PASS; новый source ещё не установлен.
  Offline fixtures не доказывают реальные SaveAs, AME enqueue или START.
- Source-read fence: focused VM PASS (legacy exact classification, late callback,
  original reconcile после enqueue, mutation UNKNOWN deny); ES3/syntax/diff/rules PASS.
- Live snapshot dry-run PASS. Run9da37cfd отказал в native preflight, saved0,
  исходник clean/тот же revision/hash. Причина: Windows File.modified в секундах
  сравнивался с Node mtime в ms. Native сравнение приведено к секундам при сохранении
  exact server SHA/inode/mtime; executor21PASS, включая timestamp drift deny.
  Только две exact owned0-byte reservations после сверки удалены; original record сохранён.
- Run4f9100dc также остановился в preflight/saved0: strict Double против wire baseline.
  Native comparator использует тот же String(number), сохраняет first mismatch.
  Readonly comparator проверяется в dry-run до CREATE_NEW. Executor23PASS: wire1/30
  проходит, actual1/24 drift блокируется без reservations; ES3/syntax/diff/rules PASS.
- Official adapter health budget1200ms дал ложный unreachable при живом bridge.
  Budget5s; delayed healthy1600ms+concurrent ensure fixture PASS, daemon starts0.
  Стандартный отдельный stdio adapter допустим; custom adapter marker не используется.
- Readonly comparator29f15e6a выявил projectFile mismatch до reservations; diagnostic
  dry-run12c38350 потерял только result POST (native callback был, saves0).
  Root cause нагрузки: observation/completion/passive tickets вызывали mutation
  admission. Теперь admission только intake/execution; actual service35PASS,
  включая no-admission reads на health/result и pre-drain intake continuation.
- Native comparator30PASS, ES3/syntax/diff/rules PASS (`69b5244`). Dry-run
  `cc153074` PASS; run `b9377a63` command `9353601e` submitted17:29:03Z,
  timed_out_after_submit17:31:02Z; CEP callback17:31:16Z/HTTP409. Source/checkpoint
  SHA совпадают; snapshots32001325/32002424bytes. Native contents ещё не приняты.
  Durable event suffix17:42Z: более новых native dispatch нет. Supported panel
  state совпадает с original lease; current AE/AME process starts предшествуют run.
- Recovery19PASS и comparator30PASS, ES3/syntax/rules/diff PASS; live recovery PASS
  без повторных save/open. Slot1 dry-run `b3cdf496` PASS, real run `d784c316`
  `ae_delivery_unknown`; exact status `transport_correlation_unknown`. Journal и
  retained results содержат только project/checkpoint reads, нового enqueue-sender
  нет; status вернул старый readonly nonce, который не подтверждает новую mutation.

## Следующий шаг

Текущая попытка остановлена на фактическом UNKNOWN: exact server exception потерян,
existing retained/status reads исчерпаны. Отправлена одна попытка enqueue; accepted
не установлен, slot2/START0. UNKNOWN не превращать в not_sent по отсутствию команды;
старый readonly nonce не считать ответом enqueue. Повторных save/open/export,
enqueue и START не выполнять. Future instrumentation не восстановит потерянную
причину этой попытки и сейчас не реализуется. Исходная цель не выполнена;
root принимает saved artifacts и оставшийся блокер.

Исторический sources timeout сохранён без повторной отправки, но не является
условием этого product пути: enqueue использует GUID фактически сохранённых
snapshots. Потерянный diagnostic result `12c38350` относится к `dryRun:true`,
`executedCount:0`, `steps:[]`, mutation `not_started`; исходная запись проверена
через evidence store. Восстановление доставки этого чтения не блокирует новый план.

## Отложенные и исторические scope

- Выпуски, PR и merge: [release workflow](../docs/release-workflow.md).
- Монтаж: [workflow](../docs/montage-workflow.md),
  [план](montage-pipeline-execplan.md). Остальной product backlog — в target spec.
- Frozen intake: [manifest](../config/frozen-intake-manifest.json); разморозка отдельно.
- Исторические first-two states: [документ](../docs/owned-runtime-first-two-test-states.md).
  Старые MSI/receipt/budget подробности сохранены в Git до `b690fc6` и существующих
  historical docs; они не повторяются как активные blockers этого этапа.

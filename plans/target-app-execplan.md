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
  проверки и bounded source review GO; установка, live dry-run и выполнение pending.
- AME source discovery nonce сохранён timeout без повторной отправки. Это
  getDLItemsAtRoot, а не подтверждение приёма собственного задания. Для enqueue
  требуется actual saved snapshot/native GUID и реальная проверка own wrapper.

## Decision Log

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

## Следующий шаг

1. Сверить retained callback исходного readonly sources timeout (16:41:53Z всё
   ещё unknown); не стирать sender slot и не повторять send. Bridge connected/idle.
2. Применить reviewed source, выполнить один exact snapshot proposal/dry-run.
3. Создать два snapshots и сверить source restoration; при UNKNOWN остановить
   отправки и сверить только исходную операцию.
4. Enqueue первый own item → immediate wrapper read; затем второй и его read.
5. START общей очереди один раз; записать фактический outcome, без video proof.

## Отложенные и исторические scope

- Выпуски, PR и merge: [release workflow](../docs/release-workflow.md).
- Монтаж: [workflow](../docs/montage-workflow.md),
  [план](montage-pipeline-execplan.md). Остальной product backlog — в target spec.
- Frozen intake: [manifest](../config/frozen-intake-manifest.json); разморозка отдельно.
- Исторические first-two states: [документ](../docs/owned-runtime-first-two-test-states.md).
  Старые MSI/receipt/budget подробности сохранены в Git до `b690fc6` и существующих
  historical docs; они не повторяются как активные blockers этого этапа.

# Передача титров в AME через product workflow

## Текущая цель

По повторному поручению 19.10 проверка TITR_01/TITR_02 и добавление в AME
без запуска рендера выполнены: verifier принял оба снимка, оба задания имеют свежий
own-item STATUS `queued`. START0; итоговое видео и media не проверялись.
Подробности завершения — ниже, реализация и контракт verifier —
[здесь](title-export-verification.md).

Поручение 16.10: довести существующий адаптер и проверить одну автоматическую
передачу с точным preset и полным диапазоном. Этап завершён: один actual addDL,
независимый queued own-wrapper STATUS, START0. Нового export/save/open и GUI
в этой проверке не было. Предыдущая задача двух титров завершена через GUI ниже.

Исходное поручение пары титров: прямое поручение пользователя в чате «Найти этап остановки работы»
`01a13e8b-b936-79e0-99f1-fe70b9e8fbdf`, turn
`01a13eab-9964-7332-9501-a2f2c07484c3` от 15.10.2026:
«Приступай к реализации этого минимального пути: восстановить подключение,
добавить два задания с проверкой каждого и запустить общую очередь AME.
Без человека, Computer Use и проверки готового видео.»
Это заменяет прежний критерий двух проверенных видео и finite/native whole-M
приёмку как маршрут обычного product режима. Сами experimental receipts не меняются.

## Проверка очереди 17.10: остановка до enqueue

После штатного product reset bridge Connected, autonomy active, pending/inflight0,
editSession=null. Свежие AE PID21876 / AME PID4704; AME26 build52 отвечает,
batch stopped/isBatchRunning=false. Исходный `titr_all.aep` clean, revision12968664,
SHA01a5985b…; native stateHash0114062a… и flags TITR_01=true/TITR_02=false совпали.
Comp70127/GUID000111ef…: свежая workArea0..10.0333333333333, duration15.4.
Preset FHD_HQ_alfa_nosound IDamep_bad667…/SHAc1b97e2f… подтверждён каталогом.

Исторические snapshots не переотправлялись: их saved-source capability связана
с прежним actor. Подготовлен новый isolated `export_two_title_snapshots` proposal
`act_53393dae6fa548a3843684e38ec4599a`, dry-run
`305d1e82-2024-433f-b2f1-d49db1ba3a07` PASS, autoEditSession/checkpoint включены.
Новые destination отсутствовали до единственного запуска. Fixed export не пишет
workArea; выбранный range связан с новым baseline как derivation invariant,
а не выдан за отдельное native измерение каждого saved snapshot.

Real run `dad3dc19-f4c6-44a4-a379-8f47ad404d34`, command
`f988d318-c55b-4c77-ab21-451b21a7519f`: submitted16:34:30Z,
timeout120s16:36:30Z; adapter вернул request timeout125s. На restore фактически
наблюдался Resolve Fonts/ReservoirGrunge. Родитель закрыл только этот modal через
установленный Computer Use, но уже после deadline; повторного export не было.
UI read-back подтвердил отсутствие modal, свой node REPL сброшен.

Созданы `titr_01_ame_product_20261017.aep` (32001325bytes,
SHA4b76365617fc71a9aacdd753983c3f457efcd3841e867a154bab2be60b0a5834) и
`titr_02_ame_product_20261017.aep` (32002424bytes,
SHA7d9cca483cde05e08b164edd1914327aa2d8f9908b6eb9b7f70a7beaf918c540).
Наличие файлов не подтверждает native flags/GUID и не выдаёт saved-source capability.

Свежие get_project_info/inspect_title_variants подтвердили возврат к исходному AEP,
revision/stateHash/flags без drift. Reconcile нового run: incomplete,
mutationStatus=unknown, verification=insufficient/unsupported_or_unbound_target,
replayAllowed=false. Pending/inflight0, editSession=null; в AME не отправлялись
enqueue/START. Исторические UNKNOWN и очередь не менялись.

Source diagnostic: поздний `/bridge/result` получает terminal_result_conflict и
не сохраняет callback body; `retainStaleCommandResult` не вызывается. В текущем
unarmed recovery нет verified receipt этого run. Обычные последующие native reads
перезаписали общий result global, поэтому exact-tail startup capture больше
не подходит; restart/recovery/reexport для обхода не выполнялись.

Для продолжения нужен отдельный bounded verifier существующих owned snapshots:
actual flags/GUID/workArea, protected restoration и отдельная verification receipt,
с сохранением original UNKNOWN/noReplay. Это выявленный пробел текущего product
flow, а не разрешение ослабить saved-source gate. Полезная отдельная профилактика —
addressable retention authenticated late callback до terminal-conflict response.

Evidence текущей попытки: ignored `.codex-runtime/ame-queue-20261017/`,
`logs/evidence/plan-runs/dad3dc19-f4c6-44a4-a379-8f47ad404d34.json`.
Production code не менялся, новые offline/native smokes не запускались.

## Завершение verifier и двух enqueue — 19.10

После известного отказа reset по `pid_reused` подтверждено свежее отсутствие
предыдущего процесса. Единственный разрешённый product reset завершился успешно:
operation `7787e01d-f4cf-4dcf-8e9c-45498b6d9c73`, generation
`4513c15a-38f9-46c5-84f6-e2900613f685`, runtime `321122e`.

Verifier run `464632f4-0e4a-4ba1-bd7c-ba1a500af473` завершён PASS с receipt
`0b5e000f0c2fa6d85a46ecad5416a036cb1e199ca364a164930abf9d79ee8aac`. У обоих
снимков подтверждены противоположные TITR_01/TITR_02 flags, GUID
`000111ef-0000-0000-0000-000000000000` и workArea `0..10.0333333333333`;
исходный AEP восстановлен чистым на revision `12968664`. Selector исходного
экспорта `dad3dc19-f4c6-44a4-a379-8f47ad404d34` /
`f988d318-c55b-4c77-ab21-451b21a7519f` сохраняет `UNKNOWN/noReplay`.
Дополнительное discovery-read `55ada78d-493e-462b-8aae-9b103f2c9a26` истекло;
это не queue mutation и оно не повторялось. Resolve Fonts на первом снимке
закрыт; после ограниченных UI-блоков собственный REPL сброшен.

Задание TITR_01: batch `fcfc1372-2a36-43a3-a93c-47e1836c5a78`, job
`6dbb3e17-eca7-44d3-a247-8f55af57e694`, nonce
`ae8da48a-59d9-4d36-846b-e73a18b50df5`,
`titr_01_verified_20261019_fcfc1372.mov`. Задание TITR_02: batch
`6aa0ed33-f6c0-4c8b-8e7b-640d82c0c57c`, job
`32dcddb0-6f54-4e12-ac42-7fafb96ef077`, nonce
`f0338213-c049-47c2-b6ed-bc7a3a18c76b`,
`titr_02_verified_20261019_6aa0ed33.mov`. Свежие STATUS в 10:18:40Z и
10:18:42Z подтвердили для обоих `ownItemAccepted`, `nativeAssociationVerified`,
`workAreaApplied`, `queued`, `batchRunning=false`, progress/time `0` и
`readErrors=[]`. Каталожный preset `FHD_HQ_alfa_nosound` имел hash
`c1b97e…`; отдельная фактическая проверка applied preset и media остаётся false.
Выбранный range следует подтверждению `setWorkArea_call_ack`.

Попытка slot 2 в первом batch была отвергнута локальным sender guard до
BridgeTalk constructor/send; settlement вернул `proof_denied`, поэтому она
сохранена и не переигрывалась. Slot 2 принят отдельным cross-batch retirement
proof. Финальный агрегатор второго enqueue-плана сообщил
`semantic verification_required`, хотя оба свежих STATUS и final readbacks
подтверждают queued; это остаётся semantic consistency gap, aggregate success
не заявляется. Read-only разбор `verifyAmeTitleAssociation` установил устаревшие
ожидания `job_enqueued`, enqueue-binding/nonce и одного outputFiles: shared enqueue
возвращает `job_observed` с binding/nonce независимого STATUS, а queued-only proof
законно содержит `outputFiles=[]` и `exact_addDL_call_argument_ack`. Исправление
этого агрегатора в текущий live scope не включалось; фактические записи не менять.
Snapshot receipt и STATUS находятся в ignored
`.codex-runtime/ame-verify-20261019/`. AME содержит два задания в разных
batches; typed same-batch START готовность не подтверждена. START/render не
выполнялись.

## Исправление queued-only checker — 19.10

По отдельному поручению пользователя исправлен `verifyAmeTitleAssociation`.
Shared enqueue с внутренним STATUS теперь проверяется по своему контракту:
исходная completed ENQUEUE-команда связывает nonce и operation args; два свежих
различных STATUS связывают wrapper, job/source/process/session/output/preset/range.
При пустом outputFiles дополнительно обязательны stopped/queued, нулевые
progress/time, отсутствие completion/errors, точный addDL/workArea ack и
own-item receipt. Эта ветка не доказывает готовность видео или применение preset;
legacy file-backed проверки не ослаблены.

Focused `ame-queued-association-smoke.js` со старой реальной записью — PASS
213 cases, включая подменённые/неполные доказательства и legacy regression.
Association старой записи проходит, но её сохранённый run.ok=false не меняется;
новый aggregate проверен на offline pre-semantic clone. Related semantic smoke
`--ame-only` — PASS 10 groups после добавления event listener в clean mock.
Независимое source review — GO. Production queue, exports и START не вызывались;
на момент записи работающий bridge оставался на прежнем source до отдельного
штатного restart.

## Применение checker и повторное чтение очереди — 19.10

Отдельно разрешённый штатный restart применил runtime `921be66`: generation
`4f6d5b36-38f3-499a-aea5-5fa23e0109e4`, daemon PID `21860` (10:34:54Z), source
SHA `ea78e477fd35ac971cbe4821b49d25a4b77c0e06fa99e85dc12c3488cb0ca28e`.
Bridge Connected/autonomy active; native read подтвердил исходный `titr_all.aep`
clean, revision `12968664`, pending/inflight `0`, editSession `null`.

Fresh own-item STATUS после restart (TITR_01/job `6dbb3e17-eca7-44d3-a247-8f55af57e694`
10:35:18Z; TITR_02/job `32dcddb0-6f54-4e12-ac42-7fafb96ef077` 10:35:21Z)
подтвердили оба `queued`, association/workArea applied, batch stopped, progress/time
`0`, без read errors. Это read-back существующих jobs: enqueue/START/render/export/
open/save не выполнялись.

Read-only checker по старым exact runs: slot 2 (`0cb0ad38-fa07-4c78-afa5-aea66ea19d3c`)
association PASS, aggregate `needs_review` из-за неизменённого `run.ok=false`; slot 1
(`e1a0ce3f-c98b-4502-8e80-75eed71efe1d`) остаётся `needs_review` после failed/UNKNOWN
шага. Исторические bytes/outcomes не менялись. API для semantic check свежих STATUS
без run record нет; они не переоценивают UNKNOWN и не дают aggregate PASS обоим jobs.
Evidence: ignored `.codex-runtime/ame-checker-restart-20261019/summary.json`.

## Диапазон следующих заданий: отмеченная рабочая область

По уточнению пользователя 16.10 default подготовки плана — отмеченная рабочая
область композиции. Явно заданные пользователем секунды имеют приоритет;
полная композиция выбирается только по прямому запросу. Исторический запуск
ниже действительно получил0..15.4s; это не default будущих заданий.

Перед подготовкой range использовать существующий get_comp_details для exact comp
того же pinned source/snapshot: взять свежие workAreaStart и workAreaDuration,
проверить конечные числа, start>=0, duration>0 и end<=comp.duration. Передать
`{startSeconds:workAreaStart,endSeconds:workAreaStart+workAreaDuration}`;
например, отмеченная область start2s/duration10s даёт range2..12, а не0..10.
Если область отсутствует/невалидна, уточнить недостающие данные; full comp молча
не подставлять. В evidence подготовки связать это чтение/project revision/exact
comp GUID и выбранный range с snapshot SHA. Existing intent/operation binding
и workArea call ack сохраняют тот же range; старые receipt/schema не дополнять
задним числом. ENQUEUE исполняет explicit range дословно, без нового default в sender.
Правка проверена офлайн; нового live enqueue/рендера/установки не было.

## Одна автоматическая передача: результат 16.10

Существующий snapshot1 и native GUID использованы напрямую. Новый output:
`C:/Users/Ant/Documents/Codex/AE_agent/logs/generated-renders/titr_01_ame_auto_20261016.mov`.
Preset `FHD_HQ_alfa_nosound.epr` с прежним exact SHA/identity; вызов
`addDLToBatch` вернул живой wrapper. `setWorkArea(3,0,15.4)` вернул true.
Run `580dec47-19b2-4c3d-95ee-536d36a274ce`, mutation command
`b1f2d16d-3b35-4bcf-bd42-fe1fc0d81fa6`: sent=true, result correlated.
Batch `16259490-2707-4191-99a8-be892133e6c9`, job
`27f44aa2-34e8-4eab-93d9-24622b9a1f6b`, enqueue nonce
`9585b0ea-a69c-4fba-a9f5-69387f9df580`.

Независимый STATUS `89125766-d993-4896-8534-f97d1e2f706d` подтвердил тот же
wrapper/job/nonce, exact source/GUID/presetIdentity/range/output bindings,
queued, host stopped, progress/time0, readErrors[], native error null и
creationFailures[]. Own acceptance=true; START0 и готовое видео не проверялось.

Первый read вернул outputFiles[]: [API описывает это поле как уже созданные
encode files](https://ame-scripting.docsforadobe.dev/reference/#encoderwrapper).
Исправлена queued-only приёмка: raw[] остаётся, evidence называется
`exact_addDL_call_argument_ack`, rangeProof=`setWorkArea_call_ack`.
`appliedPresetVerified`, `independentOutputGetterVerified`,
`generatedOutputVerified`, `mediaVerified` — false: echo аргументов не выдаётся
за независимый getter результата. Null wrapper, отсутствующий ack, ошибки,
malformed list, непустой чужой output и completed без generated proof отклоняются.

Предdispatch run `04748598` остановился до BridgeTalk constructor из-за истёкшего
60s допуска. Exact completed native refusal и reviewed source/journal pins дали
отдельный not_sent settlement той же reservation; original failed record неизменён.
Допуск180s сохраняет fresh process и actual AME session/wrapper/old-entry checks.
Actual addDL выполнен ровно один раз. Старый `5b59…` остаётся UNKNOWN, его message
и callback отделены от нового sender. Старый большой readonly request сохранён
как transportUnknown; компактный запрос ответил. Связь с размером payload —
гипотеза, доказанного универсального 32KiB лимита не заявляем.

Из experimental переиспользованы существующие server-owned authority, exact
canonical process/target/session, saved-source proof и direct GUID без census,
UTF-16 wire, own wrapper + independent read, unknown/no-replay и явный full range.
Finite admission, whole-M, новый dispatcher и повторный render не запускались.

Source commits: `b5cbcbe`, `a413840`, `ece4680`, `019c220`, `eed1585`.
Focused diagnostics8 / own-status29 / not-sent+rehydrate25 PASS; syntax/ES3/rules/diff PASS.
Live evidence в ignored `.codex-runtime/product-two-title-sol/`:
`auto-one-final-acceptance-proposal.json`, `auto-one-final-acceptance-dryrun.json`,
`auto-one-final-acceptance-run.json`, `auto-one-exact-sender-settlement.json`,
`auto-one-final-independent-status.json`. Final daemon19600/source `eed1585`;
после установки выполнен только STATUS, source proofs повторно не adopt.

## Точная подготовленная пара

Native read 15.10: `titr_all.aep`, comp `TITR_ALL_VARIANTS_FHD`, ID70127,
1706×960, duration15.4, FPS30; 19 слоёв без усечения.

| Slot | Layer ID / index | Имя | Текст | Output leaf |
| --- | --- | --- | --- | --- |
| 1 | 70132 / 6 | TITR_01 | «MISIRLOU» / обработка Д. Калинина | titr_01.mov |
| 2 | 70149 / 7 | TITR_02 | Г. Гладков, Ю. Энтин / «ЛУЧ СОЛНЦА ЗОЛОТОГО» | titr_02.mov |

Пользователь разрешил два существующих варианта без указания имён; выбрана
первая семантически обозначенная пара. Whitespace, исходный текст и
`MEASURE_TITR_01` — не самостоятельные варианты. Старое правило «первые два
непустых TextLayer по index» не является пользовательским выбором.
Оба слоя используют alpha matte70136. Baseline: первый включён, второй выключен;
остальные flags/матте/оформление сохраняются. Текст не переписывается.
Эти сведения — подготовка; перед изменением нужны свежие project/revision/target
bindings, без превращения этого документа в runtime authority.

15.10 readonly `inspect_title_variants` PASS после исправления immutable text
matte consumers; stateHash `0114062a5330e3b93b81acda41d8b3ed240c809d1c728c2cc3c56960b48fdbb8`.
Полный native результат сохранён локально в ignored
`.codex-runtime/product-start-activation-20261015/product-two-title-inspection.json`.

## Последовательность

1. Исправить readonly variant inspector для остальных неизменяемых текстовых
   consumers общего matte и получить exact snapshot.
2. Восстановить обычный product AME dispatch через existing typed runner и
   source/process/preset/output bindings, отделив private experimental port.
3. Подготовить checkpoint и отдельные snapshots через новый typed
   `export_two_title_snapshots` в обычном runner; источник не перезаписывать. Диапазон —
   полная композиция, без изменения workArea/FPS/Source Text.
4. Enqueue slot1, проверить его собственный wrapper; затем slot2 и его wrapper.
   Использовать фактический DXV3 HQ Alpha preset, не объявлять codec по имени.
5. Запустить общую AME очередь один раз через typed shared-queue route.
   Unknown не повторять; сохранить фактический результат запуска.

Реальные gates: proposal/dry-run, project/checkpoint, отдельный named-save
контракт, точные targets и файлы, idempotency и неизвестные доставленные эффекты.
Нельзя объявить выполнение этих шагов по одному offline тесту или этому плану.

## Фактический export snapshots — 15.10

Исходный каталог:
`C:\Проекты 21\2026.10.12 - Русский оркестр. Ломаем шаблоны (Мунивер и ШМПушка, Былина)\titr_all folder`.
Source `titr_all.aep`: SHA256
`01a5985b82cb207eedbec64bdd727187990c9e25bf2c1c8bcb73c1267c50b34a`,
revision12968664, dirty=false перед export. Собственный native comp GUID:
`000111ef-0000-0000-0000-000000000000`.

Один server-proposed typed `export_two_title_snapshots` заменяет прежнюю
подготовку через generic save/open. Proposal `act_7fe98062e5754aeda87b01cbfec54dde`,
dry-run `cc153074-94a5-44ea-a653-ef0ce5532142`: PASS. Реальный run
`b9377a63-3b57-4dfc-8f6d-7116c2092488`, native command
`9353601e-152c-4ed3-9b53-dc5022fdb81c` отправлен 17:29:03Z.
Сервер завершил ожидание через120s; CEP получил callback примерно через133s
и ответ POST был отвергнут `terminal_result_conflict`. Original run остаётся
`timed_out_after_submit`, mutation UNKNOWN. Повторный export запрещён.
Предположение пользователя о предупреждении отсутствующего шрифта согласуется
с задержкой reopen, но пока не подтверждено. Шрифты и содержимое не меняются.

Оба snapshots существуют; filesystem read 17:42Z:

| Snapshot | Bytes | SHA256 |
| --- | --- | --- |
| `titr_01_ame_product_20261015.aep` | 32001325 | `9d5d15a11fccc24b7ca284b6da866bd46f3626d621c80f83c8c1672791ff996f` |
| `titr_02_ame_product_20261015.aep` | 32002424 | `07ec31721b621ddff67f3a25c1deb882ac6c1713a15b877610b9995de4c59a80` |

Source и checkpoint имеют одинаковый исходный SHA и32000676bytes; exact pins
не изменились. Наличие snapshots само по себе не подтверждает их native flags/GUID
и не выдаёт private saved-source proof. AE atomic save заменил inode пустых
CREATE_NEW reservations; recovery связывает exact paths и новые стабильные pins.

Оба output leaf `titr_01.mov` / `titr_02.mov` проверены отсутствующими в
`logs/generated-renders`. Job intents используют разные snapshot files,
один batch, range0..15.4 и preset
`amep_bad667d2b5fb1113c3ba017a168a37eaf7c3b39a` (`FHD_HQ_alfa_nosound.epr`,
SHA256 `c1b97e2fdba6076d0ae2da960c402da29032eacc42699dfbcc924d3eeaeded1c`).
Catalog/name не заменяет actual own-wrapper acceptance.

Live AME26 build52/PID19932: `addDLToBatch`, `runBatch`, DXV3 доступны,
batch stopped. Product source-discovery read достиг native dispatch, но callback
nonce `73c7c6d4-f53a-4dc9-998b-1cf0ae117556` остался timeout при exact
reconciliation; не переотправлялся. `getDLItemsAtRoot` — отдельное перечисление
источников AEP, не проверка добавленного item. Новый write path должен связывать
точный saved snapshot/его native comp GUID и проверять собственный wrapper.
Generic SaveAs/open сохраняет private manual CEP authority.

## Узкое восстановление уже выполненной операции

До любого обычного native read требуется захватить сохранённый wrapper result:
новое чтение перезаписывает `__codexMcpBridgeResult`. После restart CEP автоматически
вызывает `/placeholder/protection` и `placeholder-state-read`; обычный restart
без заранее установленного guard поэтому небезопасен для recovery.

Утверждённый scope: fixed startup selector выбирает только integrity-checked
original run/command; guard до HTTP блокирует другие native dispatch. Fixed capture
выполняется один раз; его отдельное durable evidence сохраняется до fresh reads.
Только exact native schema/restored/two paths/GUID/flags, source/checkpoint pins,
stable snapshots и свежий source baseline совместно восстанавливают private proof.
Selector и client JSON не являются authority. Original failure неизменен;
recovered evidence имеет `replayAllowed:false`. Snapshot reopen, save и replay
не входят в recovery. Ошибка захвата не разрешает повтор.

Product AME context теперь отделён от private experimental/manual ingress до
dispatch. Enqueue принимает privately retained saved-source proof от этого export
executor и использует фактический GUID напрямую: `getDLItemsAtRoot` не нужен для
этого узкого пути. Приёмка всё равно требует actual returned own wrapper и
immediate independent status. START проверяет два own items и once receipt,
не всю mixed queue. Source proof находится в памяти текущего daemon; рестарт
после snapshots требует отдельной фактической сверки, не восстановления из client JSON.

Focused snapshot comparator:30PASS, ES3/syntax/diff/rules PASS на `69b5244`.
Durable event suffix 17:42Z подтверждает, что последняя native команда всё ещё
`9353601e…`; после неё AE native reads не отправлялись. Supported panel state
сохраняет original lease connectionId/generation. Текущие AE PID25132 и AME PID19932
запущены до исходной операции; это continuity evidence, а не поля original run.
Прежний source-discovery timeout сохраняется; независимый queue send разрешён
существующим разделением readonly sender и mutation fence. Census не повторять.

## Текущий live результат (16.10, задача завершена через GUI)

После прямого разрешения пользователя «Разрешаю завершить через GUI» выполнен
ограниченный fallback через установленный Computer Use. Начальная фактическая
очередь AME была пуста; чужих items не было. Импорт через AME показал отложенно
загружаемое дерево без найденной целевой comp и был отменён до добавления.
Оба проверенных snapshots открыты в AE без сохранения; точная comp
`TITR_ALL_VARIANTS_FHD` передана штатным Add to Adobe Media Encoder Queue.
У второго snapshot shortcut не дал подтверждённого эффекта; спустя >60s сверены
одна строка очереди и отсутствие модальных/ожидающих действий, после чего выполнен
один видимый пункт меню. Финальная очередь содержала ровно два собственных items.

Оба items проверены сразу после добавления и настройки: `DXV 3`,
`FHD_HQ_alfa_nosound`, отдельные `logs/generated-renders/titr_01.mov` и
`titr_02.mov`, `Entire Composition` с исходными 00:00:15:12 @30fps (15.4s).
Preset сохраняет 1920×1080, alpha, no audio, 29.97fps; отображаемая выходная
длительность00:00:15:11 соответствует этому preset, диапазон не ограничен Work Area.
Перед START обе строки имели Ready, счётчик0of2 и Not currently encoding.
START нажат ровно один раз; Pause/Stop активировались, затем фактически наблюдались
`1 output encoding` и progress первой строки (elapsed00:00:33, remaining00:00:29).
Готовое видео не проверялось. Удалений и изменений чужих items не было.

При открытии каждого snapshot появился информационный Resolve Fonts:
отсутствует `ReservoirGrunge`, применяется штатная временная подмена. Закрыт OK;
шрифты вручную не менялись, проекты не сохранялись. Наличие этого modal подтверждено,
его причинная связь с прежним timeout отдельно не доказана. AE оставлен на snapshot2.
UI-блок завершён, свой node REPL сброшен; encoding не останавливался.

GUI evidence в `.codex-runtime/product-two-title-sol/`: `gui-slot1-settings.png`,
`gui-slot2-settings.png`, `gui-two-jobs-ready.png`, `gui-start-accepted.png`,
`gui-encoding-readback.png`, `gui-completion.json`. Приёмка завершения этой задачи —
фактический GUI read-back; старые native UNKNOWN records/ledger не объявлены success.

`6483092`: recovery выполнен один раз. Capture `62e7bc3d…`, fresh source verifier
`ac4fe6b5…`; оба snapshots native-verified, flags и GUID совпали, source clean с
исходными revision/stateHash. Private saved-source proof восстановлен, guard снят;
original run остаётся UNKNOWN. Повторных save/open не было.

Batch `3868d0ff-6960-4ce4-b3e3-95836729bdda`, job
`cce91efe-a719-4291-a795-590faa174858`, enqueue nonce
`5b59f788-fb03-46a4-8b13-64fd69662872`. Две ранние попытки (`d784c316…`,
`e9c71b63…`) доказанно не дошли до native queue: finalized integrity records
не содержат commands при обязательном fsync-before-delivery. Отдельные not_sent
settlements позволили однократно использовать ту же reservation. Во второй
попытке сохранён точный предdispatch отказ `ame_product_dispatch_binding_changed`;
исправлено представление process timestamp в плане, без ослабления gate.

Run `0a310bc2-275f-4647-b0c2-49dbed6e6f6c` действительно отправил mutation command
`c2cafb96-f99f-4ea9-aeb6-2b69d402817e`. Его исход UNKNOWN: original sender callback
остаётся `timeout`, body отсутствует. Эта попытка содержит command; not_sent
settlement и повторный enqueue для неё запрещены. Slot2/START0; приём slot1 не установлен.

Независимый fixed readonly STATUS сохраняет original mutation sender и читает
только наш retained entry. Подтверждены enqueue nonce и `wrapper:null`, association
и workArea false. Старые поля source/output содержат удвоенные backslashes.
Исправлены serializer ответа и передача generated source/строковых аргументов
через exact UTF-16. Live read `exact-args-fresh.json` подтвердил точный текущий
input: source length135/backslashes4, output72/8; retained старые значения139/8
и80/16 не менялись. Ручного декодирования под authority и повторного addDL не было.

Точные входы: snapshots `titr_01_ame_product_20261015.aep` /
`titr_02_ame_product_20261015.aep` в исходном `titr_all folder` (полный путь выше),
outputs `C:/Users/Ant/Documents/Codex/AE_agent/logs/generated-renders/titr_01.mov`
и `titr_02.mov`, range0..15.4, прежний preset/GUID. Source proof после штатных
restart восстанавливается из verified receipt со свежей сверкой, без save/open/capture.

Bounded reflection app/frontend/encoderHost/batchEncoder/exporter в actual AME26.0
не обнаружил exact queue lookup/save; неизвестные методы не вызывались.
Старый `batch.xml` не свежий и не является доказательством отсутствия item.
После исчерпания этого пути пользователь разрешил точечное исключение запрета
Computer Use; задача завершена описанным выше GUI fallback.

Source checkpoints: `0054e60`, `a038a5d`, `4a26285`, `55e1d1a`, `a9fff09`.
Focused actual generated sender/receiver tests:15 PASS; ES3/syntax/rules/diff PASS.
Live evidence — ignored `.codex-runtime/product-two-title-sol/`: `input-wire-fresh.json`,
`exact-args-fresh.json`, `reflection-own-status.json`, `batch-meta-own-status.json`.
На момент GUI daemon PID10668, source `a9fff09`; source proof был rehydrated до GUI.
После открытия snapshot2 прежний source context нельзя использовать без свежих gates.
Recovery capture/receipt — `logs/evidence/title-export-recovery/`; original records неизменны.

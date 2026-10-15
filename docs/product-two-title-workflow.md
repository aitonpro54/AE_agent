# Два существующих титра через обычный product workflow

## Текущая цель

Добавить два своих задания в общую очередь AME, проверить каждый добавленный
item сразу после enqueue и запустить общую очередь. Чужие items не изменять;
полный обход очереди, Computer Use и проверка готового видео не нужны.

Источник: прямое поручение пользователя в чате «Найти этап остановки работы»
`01a13e8b-b936-79e0-99f1-fe70b9e8fbdf`, turn
`01a13eab-9964-7332-9501-a2f2c07484c3` от 15.10.2026:
«Приступай к реализации этого минимального пути: восстановить подключение,
добавить два задания с проверкой каждого и запустить общую очередь AME.
Без человека, Computer Use и проверки готового видео.»
Это заменяет прежний критерий двух проверенных видео и finite/native whole-M
приёмку как маршрут обычного product режима. Сами experimental receipts не меняются.

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

## Текущий live результат

`6483092`: recovery выполнен один раз. Capture `62e7bc3d…`, fresh source verifier
`ac4fe6b5…`; оба snapshots native-verified, flags и GUID совпали, source clean с
исходными revision/stateHash. Private saved-source proof восстановлен, guard снят;
original run остаётся UNKNOWN. Повторных save/open не было.

Первый enqueue: dry-run `b3cdf496…` PASS, run `d784c316…` завершён
`ae_delivery_unknown`. Batch `3868d0ff-6960-4ce4-b3e3-95836729bdda`, job
`cce91efe-a719-4291-a795-590faa174858`, nonce `5b59f788-fb03-46a4-8b13-64fd69662872`.
Exact status дал `transport_correlation_unknown` и прочитал прежний readonly
nonce `73c7…`; новый enqueue этим не подтверждён. Native journal этого run содержит
только успешно завершённые project/checkpoint reads, нового enqueue-sender в нём нет.
Отправлена одна попытка enqueue; её приём не установлен, slot2/START0.
Точный прежний exception потерян: `ame-title-jobs.js` свёл его к общему
`ae_delivery_unknown`, не сохранив исходный code/error и dispatch stage в ledger.
Существующие retained/status reads уже исчерпаны. Отсутствие нового sender само
по себе не переклассифицирует UNKNOWN в not_sent. Reservation и UNKNOWN сохраняются;
повторный enqueue и START не разрешены. Исходная цель пользователя не выполнена.

Runtime evidence: `.codex-runtime/product-two-title-sol/recovered-snapshots-once.json`,
`ame-slot1-proposal.json`, `ame-slot1-dryrun.json`, `ame-slot1-run.json`,
`ame-slot1-reconcile-once.json`, `ame-slot1-retained-results.json` и
`ame-slot1-panel-inspect.json`. Это локальные ignored artifacts; recovery capture
и receipt лежат в `logs/evidence/title-export-recovery/`, original run не изменён.

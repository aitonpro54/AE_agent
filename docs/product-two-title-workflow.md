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
3. Подготовить checkpoint и отдельные сохранённые snapshots вариантов через
   существующие typed gates; источник не перезаписывать. Разрешённый диапазон —
   полная композиция, без изменения workArea/FPS/Source Text.
4. Enqueue slot1, проверить его собственный wrapper; затем slot2 и его wrapper.
   Использовать фактический DXV3 HQ Alpha preset, не объявлять codec по имени.
5. Запустить общую AME очередь один раз через typed shared-queue route.
   Unknown не повторять; сохранить фактический результат запуска.

Реальные gates: proposal/dry-run, project/checkpoint, отдельный named-save
контракт, точные targets и файлы, idempotency и неизвестные доставленные эффекты.
Нельзя объявить выполнение этих шагов по одному offline тесту или этому плану.

## Подготовка snapshots и собственных AME items — 15.10

Исходный каталог:
`C:\Проекты 21\2026.10.12 - Русский оркестр. Ломаем шаблоны (Мунивер и ШМПушка, Былина)\titr_all folder`.
Source `titr_all.aep`: SHA256
`01a5985b82cb207eedbec64bdd727187990c9e25bf2c1c8bcb73c1267c50b34a`,
revision12968664, dirty=false. Собственный native comp GUID:
`000111ef-0000-0000-0000-000000000000`.

1. Protected `save_project_as` в отсутствующий
   `titr_01_ame_product_20261015.aep`, label `titr-01-ame-product`.
   Proposal `act_3493563fecc24f5ab00219914e929e5b`, dry-run
   `69ea47d4-adf1-4285-970a-e7d5b8c31eca`: PASS, executed0.
2. В открытой копии после свежего identity read выключить только TITR_01 и
   включить только TITR_02 через `set_layer_metadata`, protected typed plan.
   Остальные слои/matte/стили неизменны. Затем terminal `save_project_as` в
   отсутствующий `titr_02_ame_product_20261015.aep`, с фактическими новыми
   revision/dirty/file hash; заранее их не подставлять.
3. После каждого сохранения получить фактические snapshot hash и comp GUID;
   GUID/ID исходника не считать автоматически доказанными для копии.
4. Восстановить исходный открытый проект через protected `open_project`,
   проверив original hash выше и clean последнего snapshot. Его disk file
   не переписывается; текущий source checkpoint обеспечивает lifecycle runner.

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
Сейчас enqueue0/start0/save0. Реальное SaveAs/open всё ещё требует private manual
CEP authority; успешный dry-run не снимает эту границу. Product read port не
выдаёт write capability, experimental/manual режимы не переключаются по отказу.

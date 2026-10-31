# Устойчивый запуск и восстановление Core/CEP

30 октября 2026. Прямое поручение пользователя в чате
`01a18cce-e909-72d1-a327-07743704304e`: поставить устойчивость запуска и
восстановления перед дальнейшими продуктами. Baseline `9f49a2c`.
Titles остаётся сквозным проверочным сценарием; расширение Titles, C1b и
Slideshow следуют после этого этапа. Полная release-проверка и P1–P8 остаются
отдельной финальной приёмкой.

## Цель

Обычные startup/restart/disconnect не требуют правки config, удаления locks,
переиздания credentials или специальных одноразовых maintenance scripts.
При неизвестном исходе отправленной команды система сохраняет ограничения,
показывает точную причину и предлагает штатный путь выяснения original outcome.

## Выбранная модель владения

Один **installation-scoped runtime owner** на локальную установку владеет
единственным Broker, журналом, receiver, CEP HTTP endpoint и physical queue.
Чаты подключаются через тонкие stdio MCP clients. Initialize/discovery/status
дают наблюдение и не захватывают управление. Завершение одного stdio client
отсоединяет только его, а owner завершает уже принятую работу независимо от
доставки ответа этому клиенту. Это замена per-chat lifetime того же Core,
не второй broker, не SDK и не перенос workflow внутрь Core.

Управление выдаётся явно одному authenticated attachment через private
controller lease: boot identity, generation и непрозрачный server-owned handle.
Thread UUID и metadata сами по себе не являются identity или authority.
Lease охватывает не только run: inspect/build/propose/dry-run/reset/reconcile,
connect/host refresh и другие операции, затрагивающие состояние/очередь.
Нужны проверки перед входом и повторно перед physical submit/deliver после await.
Проектные grants/native confirmation/checkpoints действуют отдельно.

Expiry отзывает новые sends, но не передаёт управление автоматически.
Detach при принятой операции переводит owner в draining; новый controller
не допускается до durable результата и окончания control/physical pending.
UNKNOWN сохраняет recovery-only/fenced состояние. Нужен отдельный путь
original reconciliation; reconnect не повторяет mutation. Простой status
должен оставаться доступен также при занятом controller и закрытой очереди.

Подробные seams и отклонённые варианты —
[архитектурное решение](../docs/core-runtime-ownership-20261030.md).

## Сверка прежней работы и передача управления

- `9f49a2c` содержит завершённый stopped readoption и новую test-copy.
  Одноразовую transaction `stopped-readopt-Titles-T2-20261030-c47a91e8`
  не повторять. Maintenance результат `readopted`, project/journal/installation
  unchanged, nativeDispatch0. Новая adoption привязана к AE6492; перед будущим
  исполнением необходим fresh probe, сохранённые PID не заменяют его.
- Прочитан чат «Продолжи текущую работу» `01a18b19…`: backend сообщает
  notLoaded/interrupted, последний tool завершён. UI сохранил старый running
  indicator после restart. Это расхождение не является активной AE-операцией.
- Штатная отправка handoff вернула `thread not found`. Поручение через UI
  поставлено в очередь; подтверждения принятия нет. UI Stop вернул
  «Не удалось остановить чат». После вопроса пользователя дальнейший CU
  прекращён. Не повторять отправку автоматически и не считать очередь ACK.
- Root этого чата получил configured `core_status`: PID2308, manual3f92,
  ready=true; ownershipFault=null, ledgerFault=false, unresolved=[], worker
  pending0, physical pending=null, storeClosed/storeFault/unknown=false,
  peer.connected=false. Native dispatch не выполнялся.
- Read-only OS facts: единственный наблюдавшийся Core listener3457 — PID2308,
  AE6492 открыт; отдельных readopt/retirement helpers не обнаружено (собственная
  диагностическая shell исключается). Receiver journal — те же16events,
  SHA256 `4cfe881718e7255829785e57b604304493b319ba6e68d597074a98454e146f45`.
  Broker ledger отсутствует. Новой незавершённой команды дожидаться не нужно.
- Организационный writer/координатор — текущий чат. До надёжного завершения
  handoff/recheck не выполнять live переключение или новый AE dispatch.
  Source/offline работа не требует остановки работающей установки.
- После выполненного пользователем restart Codex штатная отправка handoff
  принята. `01a18b19…` завершил turn `01a18d03…`, подтвердил отсутствие
  незавершённых AE callbacks/helpers и передал управление этому чату.
  Подробности и post-restart storeClosed — в [R2a](core-cep-r2-attachments-20261030.md).

Предыдущие maintenance tests доказывают свои exact transactions, а не устойчивость
нового lifecycle. Их полезные guards/evidence сохраняются; переиспользование
одноразовых bound scripts как штатного восстановления исключено.

## Этапы и приёмка

| Этап | Результат | Проверка |
| --- | --- | --- |
| R0 — сверка и архитектура | Установить исходы прежнего маршрута, выбрать одного owner, обновить очередь | Backend/OS/configured status/journal; доставка handoff отмечается отдельно |
| R1 — private controller lease | Нейтральный in-memory компонент: observer, explicit acquire, generations, detach/drain/expiry/fence | Адресные adversarial tests; без production wiring/install |
| R2 — owner и stdio attachments | Единственный Core runtime; локальный аутентифицированный IPC; stdio EOF не закрывает owner; оба чата получают status | TEMP real processes: concurrent startup, attach/detach, exact singleton, stale boot/token/sequence, accepted-call loss; installer/package closure |
| R3 — штатное восстановление | Verified dead-owner recovery, durable control intents, current AE re-adoption и штатный stop/update/start | Crash до/после intent, CAS/races/PID reuse, corruption/UNKNOWN refuse, original receipt, fresh native host identity; без очистки очередей |
| R4 — панель | Ожидание runtime/AE, безопасное восстановление связи, раздельные connected/ready/busy/recovery states | Source VM + HTTP; timeout/cancel/generation; local latch/completion replay защиты; actual own CEP без принудительного reload |
| R5 — installed приёмка | Штатный запуск в разном порядке, MCP restart, второй чат, обрыв связи, новый AE | Fresh configured-client read; Titles одна операция на выбранной test-copy с native confirm и read-back; повторные ordinary cycles без ручного ремонта |

R2 до production wiring обязан определить exact IPC framing/auth, trusted launch,
ownership election, controller APIs и drain/shutdown. Detached child на Windows
не доказывает переживание MSIX/job lifecycle: это отдельная измеряемая проверка.
Если среда не даёт поддержанного persistent process, выбрать installer-owned
launcher/supervisor в том же owner-контракте, не возвращать per-chat Broker.

R3 не использует fake production epoch и не переносит authority прежнего AE.
Новая adoption требует quiescent owner maintenance с exact CAS/свежим witness,
либо штатного stop→verified operator→start; текущий absent-only bootstrap
не заменяется unconditional overwrite. Save/raw/destructive и restart AE
сохраняют действующие отдельные разрешения.

## Progress

- [x] R0: сохранённая работа сверена; незавершённого native исполнения нет;
  модель installation owner выбрана после source-inspection архитектором.
- [x] Доставка/ACK handoff соседнего чата после restart: idle/completed, управление передано.
- [x] R1: private lease реализован вне production package closure.
- [x] R1:13/13 адресных tests PASS; source review ACCEPT без открытых P1/P2.
- [x] R2a: private owner/stdio/IPC,22+22+2 адресных PASS и5routing,
  source review ACCEPT; [evidence/границы](core-cep-r2-attachments-20261030.md).
- [x] R2b: verified owner execution/physical guards/thin client loader,
 129selectedPASS, source review ACCEPT; [границы](core-cep-r2-runtime-20261030.md).
- [x] R3a: explicit expired-controller transfer,16lease+24owner+1wire PASS,
  source review ACCEPT; [границы](core-cep-r3-transfer-20261030.md).
- [x] R2c1: transactionally installed owner/client closure и sidecar,
  общий packet169PASS, source review ACCEPT; [границы](core-cep-r2-installation-20261030.md).
- [x] R3b: receiver/ledger fact readers,16selectedPASS и read-only actual signed
  history unchanged, source review ACCEPT; [границы](core-cep-r3-inspection-20261030.md).
- [x] R2c2: guarded autolaunch,93selectedPASS, source review ACCEPT;
  [границы](core-cep-r2-launcher-20261030.md).
- [x] R3c: boot-bound owner recovery/diagnostics и atomic markers,
 359selectedPASS, source review ACCEPT; [границы](core-cep-r3-owner-20261030.md).
- [x] R3d1: private maintenance stop/same-descriptor resume,329selectedPASS вместе
  с R4, source review ACCEPT; [границы](core-cep-r3-maintenance-20261030.md).
- [x] R4 source: bounded idle reconnect, truthful states и сохранение raw latch,
  66component/HTTP и общий329selectedPASS, review ACCEPT;
  [границы](core-cep-r4-panel-20261030.md). Actual CEP proof остаётся в R5.
- [x] R3d2b1: complete installer staging/config-last, independent100selectedPASS,
  review ACCEPT; [границы](core-cep-r3-installer-staging-20261031.md).
- [x] R3d2a: explicit interrupted-resume finish с sealed continuation,
  221selectedPASS, review ACCEPT;
  [границы](core-cep-r3-maintenance-finish-20261030.md).
- [x] R3d2b2a: private interrupted-stop certification и bounded actor continuation,
  immutable184selectedPASS после local review fixes;
  [границы](core-cep-r3-stopped-certification-20261031.md). Installer/update/legacy
  integration продолжается отдельно, installed runtime не переключён.
- [x] R3d2b2 source: stopped update/rotation/explicit enable, legacy normal и
  dedicated recovery, immutable354selectedPASS после bounded review fixes;
  [контракт/evidence](core-cep-r3-stopped-update-20261031.md). Actual switch завершён ниже.
- [x] Actual first legacy→owner switch/enable: package8a79e069, owner PID9812,
  ready=true, physical store open/unknown=false, old history16events unchanged.
  Два standard stdio clients — один owner; EOF обоих/parent exit owner не закрыли.
  Исходно configured-client proof ждал manual Codex restart: старый transport closed.
  [Продолжение без повторной установки](core-cep-checkpoint-installed-20261031.md).
- [x] После ручного restart Codex: configured MCP восстановлен. Owner9812 absent;
  штатные attributed recovery/ready receipts завершены, owner27112 active/ready,
  один listener3457, journal16events/origins/config unchanged. Первый cold status
  `owner_unavailable`, следующие чтения успешны. Survival9812 не наблюдался;
  причина завершения процесса отдельно не установлена.
- [ ] R3d2–R5: fresh host adoption, actual CEP/reconnect, cold-start timing,
  повторные ordinary cycles и Titles/native confirm/read-back;
  устойчивость installed runtime пока не заявлена.

## Decision Log

- Одни retry панели не решают per-chat захват порта и state ownership.
- Автоматический выбор «первый загрузившийся чат — controller» отклонён.
  Контакт с owner и право на stateful operation разделены.
- Данные журналов/authority/credentials остаются machine-local; IPC handle
  ограничен текущим boot и attachment, не переносится между машинами/чатами.
- После app restart принимается измеренный штатный recovery при сохранённых
  histories/fences; смена PID не объявляется survival прежнего owner. Первый cold
  отказ фиксируется отдельно от успешного configured reconnect. Новая ручная
  установка/очистка markers для этой проверки не потребовалась.
- Ранее завершённые T1/C1a сохраняются; новые продуктовые функции отложены.
- R1 не является механизмом снятия durable UNKNOWN и не подключён к stdio-entry.
- Renew использует один monotonic sample для проверки/продления; boundary
  regression фиксирует expiry без неоднозначности двух чтений clock.
- Trusted `complete(...,'settled')` вызывается только после durable outcome
  processing **и окончания всего physical/control pending**, даже если RPC caller
  уже получил timeout. Embedding восстанавливает durable fences до attach/acquire.

## Validation

31 октября, после пользовательского restart Codex: configured `core_status`
сначала `owner_unavailable`, далее `owner_status` и два `core_status` PASS на owner27112.
Native probe подтвердил absence9812 и current birth27112; OS inventory — один
owner/listener3457, AfterFX.exe отсутствует. HMAC seals/descriptor bindings и
completion→intent hashes recovery`8702b1b6…`/ready`0fff29d9…` PASS. SHA256 config,
origin/anchor и receiver journal совпали с checkpoint;16events, ledger отсутствует,
unresolved/faults/UNKNOWN нет. Controller lease не приобретался, AE dispatch0.
Санитизированное evidence —
`snapshots/core4-lifecycle/20261031/INSTALLED/configured-restart-observation.json`.
Первый cold отказ и около5.59с CreationDate→ready intent оставлены открытыми R5
наблюдениями. Это read-only installed proof; source tests не повторялись.
Согласованность сохранённого JSON evidence (PID/birth/boot, singleton, receipt links,
history и отсутствие credential fields) и `git diff --check`: PASS.

На начало этапа tracked tree clean, кроме постороннего `.codex-attachments/`.
Configured status — реальный control-only ответ installed manual3f92;
проверки source lease — отдельные offline evidence:

- `node core4/tools/validate-diff.js core4/runtime/controller-lease.js core4/test/controller-lease.test.js --run`:
  **13/13 PASS**,0fail; evidenceKey
  `18c0ed5065de2dea3c406dca3b581384adc63ac25f98c7aac1e43d31ddc63050`.
  Raw log и exact source hashes — в `snapshots/core4-lifecycle/20261030/R1/lease.log`
  и `summary.json`.
- `node core4/tools/validate-diff.js core4/config/validation-map.json --run`:
  **5/5 validation-routing PASS**; evidenceKey
  `6608d231e2a436fea3d833a6773cf510bfa9d6325175ca540cd3712e678a104a`.
- `npm.cmd --prefix core4 run check:boundaries`: **29 checked**,liveCalls0.
  JS syntax обоих новых файлов и `git diff --check`: PASS.
- Read-only in-memory package build: readonly40files hash
  `7a46f386447340ea394174ffde1965dd8b96df4ba1afac3b17ab5938385634ab`,
  manual59files hash
  `3f9293f76f5dbef30f8919151145e28ebceb8fe796ee4495b9747e18e0ff8c51`.
  Оба прежние, новый lease в package не включён. Dist не записывался.
- Source review архитектора: ACCEPT для offline R1, без открытых P1/P2;
  native/singleton/IPC/install proof не заявлен. Broader integrations из selection
  остаются `current-closure-unverified`; full release не запускался.

Restart Core/AE, install и native dispatch этого этапа0. UI попытка остановить
только зависший chat turn была отклонена самим приложением; runtime не завершался.

## Продолжение

Installed switch/enable package8a79 завершены; после ручного restart Codex
configured-client proof и штатный dead-owner recovery подтверждены. Актуальные
IDs, evidence и границы — в [installed checkpoint](core-cep-checkpoint-installed-20261031.md).
Migration/update/enable и завершённые one-shot transactions не повторять.

Следующий installed блок — actual CEP waiting/reconnect и typed read после
появления AE, со свежим native host probe/adoption до исполнения. Затем R5 Titles
на выбранной test-copy с native confirm/read-back и повторные ordinary cycles,
включая cold-start timing. AE сейчас отсутствует; эта проверка не запускала его.
Развитие Titles/Slideshow и финальная portability/P1–P8/full release не выполнены.
Перед live изменением сверить свежие status/queue/authority; сохранить чужие
snapshots/AEP и старые receipts. Полная installed устойчивость пока не объявлена.

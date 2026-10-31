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
- [x] Actual CEP после пользовательского открытия AE26308 подключилась к owner27112;
  configured typed `project-inspection` прочитал пустой несохранённый проект,
  authority/continuity=false. Один physical read, mutation/save/reload0; lease released,
  journal18events с сохранённым prefix16events. Первый idle status `ipc_closed`,
  новое явное чтение успешно; это стало основанием для source client блока.
- [x] R5 source: client first-call resilience (bounded cold readiness15с и один
  proven pre-send idle reconnect, без replay accepted/unknown и переноса leases).
  186selectedPASS,10checks/10batches, source review ACCEPT;
  [границы/evidence](core-cep-r5-client-resilience-20261031.md).
- [x] Installed client resilience packagecc2f: first cold standard status6108.60мс
  PASS без retry, два clients/EOF/parent exit — один ready owner2600.
- [x] Actual configured proof нового cc2f после restart: первый `core_status`
  успешен, current client22952/owner6716 cc2f и один listener3457. Owner2600 absent;
  HMAC recovery4abb9cb7/readyfd7af275 и exact PID/birth/boot подтверждены,
  journal18events/config/origins/adoption unchanged. Survival2600 не наблюдался.
- [x] Первый configured status после314.85с idle PASS с первого вызова за62мс;
  same owner/boot, faults/UNKNOWN/pending0. Wire reconnect отдельно не трассировался.
- [ ] CEP после долгого отсутствия Core остановилась по `runtime_wait_expired`;
  ожидается штатная кнопка «Подключить» и typed read нового cc2f. Computer Use
  не адресовал CEP child: две попытки с fresh binding отклонены до input.
- [x] Normal stop`b99e2f80…` и update`88e4a61e…`, прерванный root45с timeout,
  завершены через [явный owner pre-ready recovery](core-cep-r3-owner-preready-20261031.md)
  с original payload/credentials, fresh switchIndex5 и explicit enable.
- [x] Owner pre-ready source: explicit inspect/finish, original payload/gates/certificate,
  actor-death/CAS и monotonic attempt lineage;209selectedPASS/10batches,19deferred,
  review findings исправлены. Runtime targetcc2f unchanged, helper distribution6ae8960f
  verified. Actual inspect gatePrefix2 → finish/update-stopped → enable завершены.
- [x] Actual installed CEP после1close/reopen подключилась к ready2600;
  history18events/adoption/origins unchanged, gates отсутствуют, AE26308 прежний,
  mutation/save/AE restart0. Это installation reload, не proof idle recovery.
- [ ] R3d2–R5: fresh host adoption, repeated CEP/reconnect, cold/idle ordinary cycles,
  повторные ordinary cycles и Titles/native confirm/read-back;
  устойчивость installed runtime пока не заявлена.

## Decision Log

- Configured cc2f принят непосредственно через MCP tool; standalone proof больше
  не является единственным evidence. Изменение owner PID классифицировано как
  attributed recovery по completed HMAC receipts, а не survival. Долгое отсутствие
  Core исчерпывает bounded CEP wait; ручной Connect не объявляется automatic recovery.
- После завершения88e4 новые установка/credentials не генерируются повторно.
  Следующий restart обновляет только Codex configured attachment к текущему owner;
  старые stdio processes не считаются proof нового client. App/owner survival либо
  recovery определяется fresh facts; old host adoption не становится grant.
- Owner intent-only prefix продолжается отдельным private inspect/finish с exact
  original payload; JSON не становится normal plan/certificate. Gates сохраняют
  original role bytes и закреплённые inode facts. Short forced timeout installer
  больше не используется; outcome проверяется по original durable transaction.
- Одни retry панели не решают per-chat захват порта и state ownership.
- Автоматический выбор «первый загрузившийся чат — controller» отклонён.
  Контакт с owner и право на stateful operation разделены.
- Данные журналов/authority/credentials остаются machine-local; IPC handle
  ограничен текущим boot и attachment, не переносится между машинами/чатами.
- После app restart принимается измеренный штатный recovery при сохранённых
  histories/fences; смена PID не объявляется survival прежнего owner. Первый cold
  отказ фиксируется отдельно от успешного configured reconnect. Новая ручная
  установка/очистка markers для этой проверки не потребовалась.
- Actual project-inspection — read-only observation с authority/continuity=false.
  Она допустима до новой host adoption и не выдаёт mutating grant для AE26308.
  Первые client failures устраняются source/offline в отдельном ограниченном блоке;
  автоматическое повторение отправленных операций исключено.
- Ранее завершённые T1/C1a сохраняются; новые продуктовые функции отложены.
- R1 не является механизмом снятия durable UNKNOWN и не подключён к stdio-entry.
- Renew использует один monotonic sample для проверки/продления; boundary
  regression фиксирует expiry без неоднозначности двух чтений clock.
- Trusted `complete(...,'settled')` вызывается только после durable outcome
  processing **и окончания всего physical/control pending**, даже если RPC caller
  уже получил timeout. Embedding восстанавливает durable fences до attach/acquire.

## Validation

Configured cc2f: первый и последующий `core_status` PASS, owner6716 ready/active,
pending/UNKNOWN/faults0, controller idle/accepted0. Read-only installed verifier
проверил descriptor/package/client closure, HMAC seals/bindings и completion→intent
hashes, native absence2600/current6716/unchanged AE26308, один listener3457 и
только cc2f clients. Journal18events/prefix16events/origins/config/adoption unchanged;
maintenance/install/broker gates и ledger отсутствуют. Initial verifier comparison
исправлено с несуществующего `unresolvedCount` на actual `unresolved.length`;
повторный read-only run PASS. Runtime/source/credentials не менялись.
Evidence: `snapshots/core4-lifecycle/20261031/R5CONFIGURED/`.
Configured idle: gap314850мс, first-call62мс PASS без manual retry; same6716/boot,
attachments1/controller idle/generation0/accepted0. Между двумя status текущий чат
не вызывал MCP; production sessionMs300000 подтверждён source. Отдельная wire
трасса reconnect не снималась. Final read-only installed history/native readback
после idle сверяется с тем же baseline; полный repeated-cycle proof не заявлен.
CEP UI показывает runtime_wait_expired; configured peer disconnected. Input на
«Подключить» отклонён helper из-за CEPHtmlEngine child process, fresh activation
и одна повторная попытка также отказали. Reload/AE restart/dispatch/save/mutation0.

Actual recovery88e4: original payload target descriptor898261e1… preserved,
finish recovered/update-stopped, fresh inspect switchIndex5, enable=true;
journal18events/origins/hostadoption unchanged, gates отсутствуют. New owner2600
active/ready, cold first standard status6108.60мс PASS; two clients/EOF/parent exit
один owner. CEP peer connected/inspectionAvailable, unknown/faults/pending нет.
AE26308 birth прежний; mutation/save/AE restart0. Configured client после ready2600
остаётся old8a79/owner_unavailable, manual Codex restart pending.
Evidence: `OWNERPREREADY/installed-readback.json`, stdio-first-call/stdio-after-panel,
finish/enable results и configured-after-owner-ready.json.

Owner pre-ready source:209PASS/0FAIL/skipped0 на immutable export e50dbeb +9paths,
10checks/10batches,19deferred integrations. Source/frozen hashes и evidence keys
совпали; boundaries43/live0,8syntax/diff PASS, source review findings закрыты.
Frozen build даёт exact targetcc2f/helper6ae8960f. Actual read-only inspect получил
phaseowner-pre-ready/gatePrefix2 без writes. [Evidence/границы](core-cep-r3-owner-preready-20261031.md).

R5 client source:186PASS/0FAIL/skipped0 по scoped selection10checks/10batches;
16deferred integrations сохранены. Source hashes/evidence keys до/после совпали,
boundaries43/live0,4syntax/diff PASS, bounded source review ACCEPT. Runtime package
cc2f0713 отличается от installed8a79 только двумя client files; standalone build
и dry-run PASS. [Подробности](core-cep-r5-client-resilience-20261031.md).

После открытия AE: configured discovery/contract, explicit lease, один typed
project-inspection и release PASS; observation`d46dad6f…`, AE26.3x87/0items.
Fresh status — тот же owner27112, peer.connected/inspectionAvailable=true,
controller idle, unresolved/faults/UNKNOWN нет. Native process26308/birth зафиксирован;
сохранённая adoption6492 не менялась. Receiver history18events, prefix16events
SHA256 прежний; новые begin17/complete18 соответствуют ровно этой inspection.
Evidence: `snapshots/core4-lifecycle/20261031/INSTALLED/configured-cep-inspection-observation.json`.
Первый idle `core_status` получил `ipc_closed`; следующий fresh read прошёл.
Отправленную inspection не повторяли; mutation/save/restart/reload0.
Согласованность JSON evidence (receipt command binding, prefix history, native PID,
released lease и отсутствие credential fields) и `git diff --check`: PASS.

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

Installed switch/recovery/enable packagecc2f завершены; standard client cold и CEP
proof подтверждены. Configured proof нового client подтверждён на owner6716;
attributed recovery2600→6716 проверен по receipts/native facts. Актуальные
IDs, evidence и границы — в [installed checkpoint](core-cep-checkpoint-installed-20261031.md).
Migration/update/enable и завершённые one-shot transactions не повторять.

Actual CEP и один configured typed read package8a79 подтверждены ранее. Interrupted
update88e4 продолжен штатно после209selectedPASS, owner2600/cc2f ready и новая CEP
подключена; повтор finish/enable не нужен. Теперь CEP UI остановилась после bounded
runtime wait: нужна штатная кнопка «Подключить» (helper не адресовал child), затем
new typed read и live ordinary cold/idle cycles. Fresh native host probe/adoption нужен до
исполнения, R5 Titles на выбранной test-copy с native confirm/read-back и повторные
ordinary cycles. AE26308 сейчас открыт; root его не запускал/перезапускал.
Развитие Titles/Slideshow и финальная portability/P1–P8/full release не выполнены.
Перед live изменением сверить свежие status/queue/authority; сохранить чужие
snapshots/AEP и старые receipts. Полная installed устойчивость пока не объявлена.

Завершённый блок: configured cc2f first-call/recovery и один production idle
first-call. Изменены AGENTS, checkpoint, lifecycle/R5/recovery планы и sanitised
R5CONFIGURED evidence/reader; production source/runtime/config не менялись.
Проверки: actual MCP calls, signed read-only native/history verifier, JSON
consistency/credential exclusion, reader syntax и diff check. Следующий шаг —
штатный Connect панели, затем configured typed read; helper не адресовал CEP child.

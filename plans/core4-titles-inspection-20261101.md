# R5 — причина отказа native Titles inspection

**Пауза по прямому поручению пользователя 1 ноября: «завтра рпазберемся, пока
сворачивай».** Новых live действий/установок не начинать до продолжения. Выбор
новой цели и разрешение на сохранение отдельного AEP не получены.

1 ноября 2026, MSI (первичные captures используют UTC 31 октября). Это узкий
engineering block текущей lifecycle приёмки, не новый пользовательский заказ.
База: commit0c29739, installed runtimecc2f, helperc787e013. Повторная привязка
c4c0af30… завершена и не повторяется. Root — sole live/CEP/UI и Git controller.

## Цель и scope

Получить точную безопасную причину native отказа Titles и исправить подтверждённый
source defect в пределах существующего static single-line uniform-style пути.
Typed inspection/build/proposal/dry-run/native confirmation/read-back сохраняются.
Raw probes/JSX, fake epoch/grants, изменение установленного registry на месте,
save/destructive/AE restart/AME/full release и новый внешний review вне этого блока.
Read-only диагностика не выдаёт authority для изменения текста.

Выбран узкий diagnostic путь: module-owned inspect/verify wrapper возвращает
existing readFailureVersion с конечным набором безопасных кодов. Общий generated
registry и owner catch/refs не меняются. Peer принимает новые коды лишь для
точного manual asset и read-only phase; после validated durable completion может
показывать bounded lastReadFailure в существующем physical status. Произвольные
messages/stacks/values не выводятся, дополнительный tool/grant не вводится.

## Progress

- [x] После пользовательского Connect configured status29мс: same owner9584/boot,
  peer connected/inspectionAvailable, idle, pending/UNKNOWN/faults0.
- [x] Configured project-inspection на comp218 подтвердила exact current test-copy,
  `Text_1_1`, единственный слой219 `PAPER TITLES`,465project items.
- [x] До `core_connect` первый generic Titles inspect вернул MCP text error;
  root parser ошибочно ожидал JSON и не сохранил исходный текст отказа. История
  подтверждает отсутствие native dispatch этой попытки. Это явный coverage gap.
- [x] После отдельного штатного `core_connect` available=true/synthetic=false
  один native Titles inspect27/28 завершился rejected/inspection_failed.
  Command `inspect-39e4deea-b0d0-427d-844e-0ef7d4cb2f7b`; неизвестной mutation нет.
- [x] Receiver28settled/prefix24 unchanged; descriptor/client/config/origins/
  adoption/AEP hashes unchanged; ledger/gates absent; controller generation2 released.
- [x] Visual baseline в Composition Viewer: `Text_1_1`,0:00:02:11 при30fps,
 12.5%/Quarter, белый PAPER TITLES. Это не typed snapshot или uniform-style proof.
- [x] Bounded read-only source/API brief: finite native error vocabulary и
  минимальная корректная обработка подтверждённых TextDocument API ограничений.
- [x] Scoped source implementation, independent ACCEPT и meaningful validation
  по changed paths:192unique PASS, boundaries44, source freeze02.
- [x] Reviewed installable срез через штатный stopped update/enable, exact installed
  read-back и standard client/CEP proof.
- [x] Configured client после restart загрузил be9afe99; exact native/HMAC recovery
  от23816 к16772 подтверждён, история/привязки сохранены.
- [x] CEP Connect и fresh configured project/Titles read: project PASS,
  Titles terminal rejected/titles_missing_stroke_color; native snapshot acceptance открыта.
- [ ] Compiler/build/proposal/dry-run и исполнение с локальным подтверждением
  текущей цели, original receipt/read-back и кадр; без save.

План кадров R5 перед mutation: direct `Text_1_1` на0:00:02:11 (30fps), затем
известные по native breadcrumb родительские `Title_1_Color` и `Title_1` на том
же кадре; если переход скрывает текст, дополнительно0:00:05:17. Core discovery
уже подтвердил Title_1_Color как comp4; `Title_1` выбирается лишь по свежему
однозначному UI-наблюдению, его ID не угадывается. Это проверки отображения
изменённого текста на тестовой копии, без render/save и без заявления о полной
типографике или корректности всей анимации/прочих сцен. Пробелы фиксируются явно.

## Decision Log

Generic project observation работает без Broker transport; Titles путь требует
явного `core_connect`. Добавляется в operator workflow, автоматический grant из
Connected не выводится. Initial MCP parsing error исправлен только у root reader.

Current package registry catch скрывает readonly module/native getter exceptions
как inspection_failed. Причина текущего отказа по установленному интерфейсу
не различается; сырой error message/stack или произвольный coreCode наружу не
выдаются. Временный raw probe или patch установленного registry не используется.

Первичный [Adobe AE Engineering post](https://community.adobe.com/questions-534/per-character-scripting-public-beta-announcement-314331)
подтверждает: inactive TextDocument fillColor/strokeColor могут throw, а
CharacterRange возвращает эти значения; API выпущен в24.3. Исходный executor
безусловно читает их через TextDocument, fixture с applyStroke=false сохраняет
plain strokeColor и не моделирует native throw. Это подтверждённый source defect,
но причина именно текущего native отказа остаётся гипотезой до нового typed read.

Принятый fix сохраняет полный protection representation: character baseline из
doc.characterRange(0,1), затем сравнение каждого range. Все13character fields,
включая flags, active и dormant colors, остаются наблюдаемыми и сравниваемыми.
TextDocument используется для text и3paragraph fields; missing/mixed/недоступный
range означает отказ. Fake RGB, defaults и исключения dormant fields не вводятся.
Mutate вызывает throwing snapshot напрямую; внутренние readonly diagnostic codes
не меняют mutate coreCode/started/catch/UNKNOWN. Contract/compat остаются byte-equal
при сохранении этой representation, module/admission/compiler pins обновляются.

В том же product compiler срезе optional taskId первого build опускается, stable
workflowId/contextId остаются. Server taskId берётся из build result. Owner gate
для чужих/старых task refs не меняется; требуется meaningful real owner regression.
Документация оператора добавляет acquire/core_connect/renew/current-generation refs.

Brief принят root; scoped implementation/tests поручены существующему
ae_specialist/XHigh из-за связи native API/protected style/diagnostic admission.
Root docs/README/workflow/evidence и Git не пересекаются с source ownership.
Новых helpers и повторного Argon нет. Installed files/live остаются только у root.

Перед actual update требуется frozen source/адресная matrix, root review и один
official immutable distribution. Новые stop/update UUID не заменяют уже settled
c4c0af30; current adoption сохраняется. Client entry проверяет exact release root,
поэтому после нового package может потребоваться штатный reload configured клиента
пользователем. Такой запрос делается после готовой проверенной установки, AE не
перезапускается. Native text confirmation остаётся отдельным действием в AE;
lease при долгом ожидании продлевается штатным renew, без снятия timeout/fences.

## Validation

Evidence — `snapshots/core4-lifecycle/20261031/R5TITLES/`. Read-only
`observe-receiver.cjs` сверил цепочку и exact native response, оба command bindings,
current protected bytes и28settled events. Source/runtime/package не менялись;
source suites не повторялись. Actual mutation/build/proposal/run0, save/restart0.
Следующий шаг задан планом: закончить bounded source brief и реализовать принятый
минимальный срез, сохранив native gates; пользователю не требуется выбирать этап.

Дополнительный ordinary-cycle checkpoint на новом owner: minimum323000мс без
configured AE calls этого чата, затем first-call core_status44мс, same9584/
boot04d9b162…/peer, controller idle, pending/UNKNOWN/faults0. Evidence —
R5TITLES/configured-owner9584-idle.json. Это actual successful first call;
wire reconnect отдельно не инструментирован, history/native inventory этим
вызовом не перечитывались. Полная repeated-cycles устойчивость не объявляется.

## Source milestone — freeze02 принят

Progress: изменены10согласованных source/test paths: executor/artifact/admission,
peer diagnostics, compiler и5test files. CharacterRange даёт полный character
proof; readSnapshot ограничен inspect/verify; readonly tuple публикуется после
validated durable completion. Optional taskId первого build удалён. Registry
generator, owner catch/refs/grants, contract/compat и validation-map unchanged.
Дополнительная test-only правка убрала stale package==cc2f expectation: текущие
package/release/files независимо сверяются с buildPackage и verified standalone;
70files/helper union/provider assertions сохранены. Это единственное расширение
исходного9path ownership; production freeze01/02 byte-equal.

Validation: один frozen current запуск выбрал7checks/7disjoint batches:
manual51/installable40/owner-runtime21/native-read-recovery19/owner-attachments25/
readopt-operator17/recovery-inspection11 =184PASS; отдельно product8PASS.
Итого192unique PASS/0FAIL/skip/cancel/todo. Все3commands exit0, без исправлений
или повторов. Core976.287с/product1.130с/boundaries0.092с; boundaries44/liveCalls0.
Root независимо сверил10source/189dependency hashes до/после/current,7keys/
commands, полный selector prefix и framework summaries/rawSHA. Tests replay0.
Source syntax/whitespace/EOF10 PASS. Текущая source приёмка адресная;24deferred
closures (включая stopped-update55) остаются current-closure-unverified, прежние
338PASS не переобъявляются результатом новой версии; full release не запускался.

Independent review freeze02 ACCEPT, без открытых P1/P2/P3, все10SHA совпали.
Module pin189c58bf5335a8ce7c889159808b7791a39dc0ad3f0641cd522342bcdb8c6e79;
executorSHA6d84fdbb…/peer0b40242f…/compiler1adf06aa…; CONTRACT_HASH6226f911…
прежний. Root и writer pure builds независимо дали package
`be9afe99d4b04fa480477af288bb0b3e8dfc15c493add2e0da3225fe4940ad43`, distribution
`5de01291e5dd0a7e1d8142f3a64dc4acd466bec8d94eb22f129059f6f88bccf7`,70runtime/87bundle.
Evidence — R5TITLES-SOURCE/final02 и accepted-evidence.json; parent verifier
verify-source-evidence.cjs не запускает tests/runtime operators.

Decision Log: source этап принят, official output/installed writes/AE mutation0
на этой точке. Следующий шаг — source commit, immutable write/verify, fresh
configured/native preflight и один новый штатный stopped update/explicit enable.
Сохранить current host adoption и28event receiver prefix, не повторять c4c0af30.
Actual причина прежнего отказа и native Titles acceptance пока не объявляются.

## Actual update — установленный be9afe99

Progress: source commit40929298942fc2f0257160aa36fdc7809398b174; root записал и
полностью проверил immutable `dist/owner-titles-inspection-5de01291e5dd`:
distribution5de01291…/packagebe9afe99…,87bundle/88physical files. Fresh configured
preflight был на9584/cc2f, idle/no pending/UNKNOWN; native AE26308/birth прежний,
28settled receiver events и все protected bytes совпали с checkpoint.

Один новый stop`f1b8ca9c-66c7-4b9b-b9a9-0974ea04faf8`: первый inspect честно
вернул stop-in-progress, следующий — stopped. Повтор stop не отправлялся.
Один owner-update завершён97.414с, новая transaction
`90539075-ff4c-459c-a659-ecfdbb521c7f`; update-inspect подтвердил switchIndex5/
update-stopped, затем отдельный explicit update-enable enabled/sameDescriptor.
Finish/replay/forced timeout0; c4c0af30 и old transactions не выполнялись.

Validation: root read-only verifier проверил exact70runtime files,7CEP files,
descriptor/client/config против подписанного original payload и8records с dual
old/new HMAC. Hashes: descriptor50bd6835…/client94d94d77…/configca895a00….
Origins/anchor00d9c5d0…, adoption666c79a6…, receiver28/SHA256 d5d0fcc6… и AEP
e3b24989… unchanged. Gates/ledger absent. Первый root reader ошибочно требовал
старые credential values; исходный installer contract выдаёт новую split пару
один раз при planInstall. Проверка исправлена на exact original-new descriptor
и dual signatures, key issuance/оператор не повторялись; correction сохранена.

Configured first call после update дал owner_unavailable: действующие5clients
всё ещё изcc2f. Root не запускал новый Codex app-server и не подменял этим proof.
Два отдельных real standard stdio observers изbe9afe99 успешно завершены exit0:
client27816 поднял owner23816, client16028 увидел тот же owner. Status+EOF timings
7678мс/16мс (не отдельные response-only замеры). Native/HMAC read-back после EOF:
owner23816/birth639290751829705860/boot44f3b34a-9b71-443b-882f-41138203cda4
active/ready, один listener3457; prior9584 absent. Lease generation0/idle,
accepted/pending/UNKNOWN/faults0, lastReadFailure=null. Это standard, **не configured** proof.

Собственная CEP закрыта/открыта1раз для установки. Новая панель автоматически
подключилась: peer panel-e3b94a02…/inspectionAvailable=true, подтверждено вторым
standard observer; AE26308 и test-copy открыты прежние, property edits/save/restart0.
Evidence — R5TITLES-ACTUAL. Actual typed inspection/build/proposal/run после update0.

Decision Log: installation/enable завершены, повторять f1b8/9053/update/readoption
нельзя, markers не чистить. Следующее необходимое действие — штатная перезагрузка
configured клиента пользователем (restart Codex, AE не закрывать). Затем root
проверяет fresh configured status/owner/peer, acquire → core_connect → fresh
contracts/project/Titles inspection на current exact IDs. После source module
pin189c58bf… compiler готов; technical_check/ephemeral_check задать явно. Native
confirmation/read-back/план кадров остаются обязательными. Standalone status,
192source PASS и connected CEP не закрывают этот оставшийся R5 шаг.

## Configured restart — be9afe99 подтверждён

Progress: после сообщения пользователя о restart Codex первый configured status
успешен без retry: packagebe9afe99, owner16772/birth639290764154052560/
boot805165c7-0da7-433e-be27-d5a5196a76c1 active/ready, lease generation0/idle,
pending/UNKNOWN/faults0. Все5configured clients уже изbe9afe99; stalecc2f отсутствуют.
AE26308/birth639290395690521480 прежний, один listener3457 на16772.

Validation: read-only observer независимо проверил native PID/birth, HMAC current
owner, descriptor/client/config/origins/adoption прежние и receiver28settled/
SHA d5d0fcc6… (включая точный prefix28), ledger/gates absent, saved AEP e3b24989…
unchanged. Completed HMAC recovery6b6a3d4c… относится к exact23816/birth/boot,
readyec7594f2… — к exact16772/birth/boot. Intent→completion hashes,3archived
markers и current active replacement проверены. Old23816 absent; причина выхода
не наблюдалась, survival через app restart не заявляется. Ошибка первого root
reader (plain broker/receiver markers ошибочно считались HMAC envelopes) исправлена
на exact signed-intent hash и previous-scope marker bytes; runtime writes/replay0.

Decision Log: это configured proof нового пакета, новый stop/update/readoption
не нужен. CEP peer=false/inspectionAvailable=false; свежий native UI показывает
«Остановлено: runtime_wait_expired». Пользователю отправлена просьба Connect,
дочернюю CEP-кнопку CU повторно не адресует. Новый typed Titles read/build/run
ещё0, controller не приобретался, AE restart/save/mutation0. После Connect
продолжить acquire→core_connect→fresh project/Titles inspection и заданный R5 flow.
Evidence — R5TITLES-CONFIGURED; source suites не повторялись.

## Configured native read — получен точный missing-field отказ

Progress: пользователь нажал Connect; same16772/boot805165c7…/be9afe99,
peerpanel-60fa36ee… connected/inspectionAvailable=true. Explicit controller
generation1 acquired, core_connect available=true/synthetic=false; fresh contracts
подтвердили Titles pin189c58bf…. Project-inspection29/30: exact current test-copy,
465items, Text_1_1/comp218, PAPER TITLES/layer219. Один Titles inspect31/32
завершился rejected/titles_missing_stroke_color; command
inspect-7f249231-8279-450a-8644-43df98a8253a/executor6d84fdbb….

Validation: finite physical.lastReadFailure совпал с original durable reply;
observer проверил оба exact command/result bindings и32settled receiver events,
SHA ddba46ec…, prefix28 d5d0fcc6… unchanged. Descriptor/client/config/origins/
adoption/AEP прежние, ledger/gates absent, pending/UNKNOWN/faults0. Lease generation1
released. MCP owner_outcome_uncertain в данном случае — скрывающий exception
generic wrapper; independent receiver evidence доказывает terminal readonly rejection,
не неизвестную mutation. New mutation/build/proposal/run0, save/AE restart0.

Decision Log: missing-field код означает undefined ИЛИ null; сам native отказ
не подтверждает значение applyStroke, mixed state или точную причину недоступности.
Предыдущая гипотеза «CharacterRange всегда даст dormant RGB» не доказана на этой
цели; установленный executor штатно fail-closed. Новый raw probe, смена цвета или
включение обводки на пользовательском слое для удобства запрещены. Существующему
ae_specialist/XHigh поручен read-only source/API design: полный защищённый proof
без fabricated/default/dropped colors либо честный контрактный gap. До принятого
решения source/install повторно не меняются. Новый Argon review не запускается.

## Завершение на паузе — строгий профиль сохранён

Progress: bounded API/source review не подтвердил read-only fallback для
недоступного strokeColor. No-throw CharacterRange не является гарантией RGB.
ParagraphRange не даёт отдельного цветового API; конструктор TextDocument из
строки не копирует native style. Активация applyStroke на user-derived документе
не доказывает исходный latent RGB. Прежний full13+3 профиль остаётся строгим,
без defaults/неявного уменьшения гарантии. Причина старого inspection_failed
не доказана. Источники: [CharacterRange](https://ae-scripting.docsforadobe.dev/text/characterrange/),
[Adobe Engineering](https://community.adobe.com/questions-534/per-character-scripting-public-beta-announcement-314331).

Один соседний readonly кандидат Text_1_2/comp231/layer232 NOISE также terminal
rejected/titles_missing_stroke_color, command1201890f…. Project read33/34 и
Titles35/36 сверены с original replies, receiver36settled/SHA a3996201…,
prefix32 ddba46ec… exact. Generation2 потеряла attachment между calls:
Titles отказан owner_controller_required до native dispatch, release — owner_lease_token.
Причина потери отдельно не трассировалась; переноса grant не предполагалось.
На fresh generation3 выполнен ровно один Titles read, затем release=true.
Пакет/descriptor/config/origins/adoption/AEP прежние, pending/UNKNOWN/faults0,
build/proposal/run/mutation/save/AE restart0. Другие слои не перебирались.

Validation: test-only regression в core4/test/manual-runtime.test.js добавила
8cases: undefined/null color × active/inactive flag × fill/stroke; single-character
fixture запрещает style/text/property setters и confirmation при отказе.
Существующие readable dormant и post-setter UNKNOWN tests сохранены. Один selector
manual-runtime завершён59PASS/0FAIL, exit0,8.589с; raw Node duration8.362с.
Root сверил manifest/raw, selector prefix/summary, sourceSHA8e21bd4d…,
76dependency hashes до/после/current и181прочий Core non-Markdown файл byte-equal.
Parent replay0, production/package changes0; новый install не нужен.
Evidence — R5TITLES-MISSING-REGRESSION и R5TITLES-CONFIGURED.

Decision Log/продолжение: пользователь отложил задачу до завтра. Отдельный
Titles-R5-uniform.aep лишь предложен, не создан/не сохранён; save не разрешён.
Следующее решение после возобновления — отдельная тестовая цель с наблюдаемыми
цветами или другая указанная пользователем saved target. Затем fresh configured
status/acquire/core_connect/contracts/inspection, новый compiler build/proposal/
dry-run/native confirmation/read-back/кадры по действующим gates. Старые refs не
переиспользовать; current target не менять и rejected reads не повторять ради
обхода. Source192PASS и новый regression59PASS — разные runs, не суммировать как
единый current release. Full release, native mutation acceptance и portability открыты.

# Адресное завершение первой native launch после preStart refusal

Статус: **design и offline implementation ACCEPT root/independent specialist; открытых P1/P2 нет**. Baseline `d131105296a52d05c3928f3272fe801a826512bc`. Directory representation fix нормализует только native directory size к Node Windows0; file sizes и остальные identity/names/reparse проверки сохранены. Actual administrative disposition/resume ещё не выполнялись writer; live завершение остаётся pending по fresh controller gates.

Это ровно одна административная disposition и одно append-only продолжение **той же** исходной operation `9c9fb972-201d-4c73-8bf2-35bd6c8596f9`, generation `1672be8d-76e4-4fa3-9994-8a750c8a2209`. Исходный bootNonce и все original bytes сохраняются. Ordinary `start-once` остаётся read-back only; наличие новых файлов не запускает resume автоматически. Общий retry/rescue framework не создаётся.

## Основание и честный класс evidence

Pinned baseline helper `d08061c0f40669e2c0c4a14fe5c497e500fae5a014b890c9b6a92cc0e7e40d80` выдаёт `owned_core_migration_resource_namespace_changed` в `AssertMigrationFinal` до native launch-attempt/StartIndependent. Sanitized operator read-back: names/dev/ino/mtime/ctime совпали, Node directory size0 против kernel4096. JS preflight прошёл; отправлен ровно один start-once, затем specific refusal и observe unavailable. Native attempt/candidate/registration/genesis/current отсутствовали; controller штатно released/exit0, затем owner/children/Core daemon отсутствовали и3456 был свободен.

Operator audit refs: exec22139, fixed Node/Core control, owner28128/birth134374083104164188/UTC2026-10-25T13:25:10.4164188Z, native session `a7592271-26ef-4530-a506-7c32fe978701`. Это пересказ read-back sole controller, **не** новая проверка writer.

Существующие JS launch-attempt/unknown — plain JSON без HMAC/session/phase. Durable authenticated native transcript не сохранён. Error string, absence/PID/port и operator reconciliation не становятся machine no-Start proof или exit proof. Новая подпись удостоверит административное решение, а не прошлое исполнение. Automatic retry по этим данным запрещён.

## Новые append-only records

Все records остаются внутри `.codex-runtime/core-product-migration/`; original intent/once/migration policy/resource projection/JS attempt/unknown и reservation/ticket не редактируются и не удаляются.

| Record | Закрытая роль и обязательные связи |
|---|---|
| `prestart-disposition.json` | `wx`+fsync+NEW Core HMAC; отдельные schema/kind `directory_size_representation_prestart_refusal`; exact original op/gen/bootNonce и `explicit_user_chat` reference `01a171dd-b843-7141-b28a-ae75d79ce7f1`. Pins raw SHA original once/intent/migration policy/projection/JS attempt/unknown/reservation/ticket, old helper и fixed reconciliation/metadata/release refs. `evidenceClass:operator_attested_private_rpc`, `nativeCryptographicNoStartProof:false`, historical outcome unknown, oldExitProven false, replayAllowed false. Только capability `complete_same_operation_first_native_start_once`; никаких stop/reset/retirement/resource releases. Новые reviewed runtime set/digest/manifest/helper/CLI/Node/pwsh pins и effective review facts закреплены явно. |
| `prestart-resume-launch.json` | Создаётся непосредственно перед dispatch под новой actual Source→Core pair; HMAC связывает disposition+old intent refs, прежние op/gen/bootNonce/command/credential/authorization и вложенные effective reservation/startup-ticket envelopes с новым reviewed source set/digest и fresh обычным ticket window. Включает fresh source absence witness/createdAt/replayAllowed false. Запись **расходует** новую authority до native RPC. Existing/equal запись — только read-back; partial/corrupt/timeout/EOF/unknown не дают повторный dispatch. |
| Resumed genesis | Явный отдельный resumed schema variant; refs old intent+disposition+resume binding, effective provenance и реальные штатные registration refs. Не изображать новые facts исходным v1 intent. После seal/adoption own-chain reader не перечитывает mutable legacy/config secret. |

Административный verb фиксирован, без caller UUID/path/hash/force. Case validator связывает точные исходные IDs и raw hashes/audit refs, а не только error code. До новой disposition сверяются existing invocation/metadata и original bytes; existing equal decision читается, differing/partial закрывает путь. Disposition сама не запускает процесс.

## Original и effective launch origins

Private engine resolver возвращает отдельно original signed intent и effective launch origin. Старый v1 intent не подменяется в памяти новыми facts. Supervisor централизует effective reservation/ticket selection только для exact Core root и указанной generation при valid signed disposition+binding; остальные поколения остаются на прежнем reader.

Один resolver обязателен для `readCandidate`, `assertStartupReservation`, register и `registeredGeneration`: новый daemon должен проверять те же effective envelope hashes/pins, что native launcher. Native `MigrationIntent` сначала проверяет immutable old origin/policy, затем отдельную disposition/binding; native `Reservation` выбирает ту же effective pair. Candidate/registration создаются штатно с новыми effective hashes.

Immutable validation отделена от prelaunch admissibility. Первая работает и после Start; вторая требует отсутствие native attempt/candidate/registration/genesis/current. Нельзя после успеха заставлять reader требовать отсутствие созданного attempt.

Binding закрепляет actual `nativeSessionId` нового paired controller. Другая session или потеря pair не разрешает повторный dispatch existing binding. Native private flag сбрасывается на каждой входной строке и устанавливается только closed resume path после единственного CreateNew native attempt; перед Start повторяются actual pair/current-session checks. Ordinary single-lock launch этой exact case запрещён, включая consumed binding. Immutable readers/registered stop и normal lifecycle других generations сохраняют прежний контракт.

`daemon-reservations/<same-generation>` сохраняет original reservation/ticket и позднее штатные candidate/registration; effective envelopes находятся в migration namespace. Native final namespace допускает единственную exact generation и original reserved files. Старый unknown допустим только как exact pinned history этой disposition; foreign/unknown entries закрыты.

## Последовательность после offline implementation ACCEPT

1. Offline implementation, focused tests и independent implementation review → final code/manifest/helper pins. Original records/state/config/installed assets остаются неизменными.
2. Fixed administrative disposition фиксирует новую bounded decision и exact audit/original refs. Это не launch и не retroactive proof.
3. Новый sole persistent controller получает actual mutex pair Source→Core. Повторяются fresh source absence/free3456, quiescence/noqueue/physical0/native idle, source identity/names/guards, destination byte-exact store/marker/preference, installed8, Core config/credential, ordinary policy и все3 resource constraints.
4. Effective review отличается только явно разрешёнными reviewed Core code pins. Source proof/state outputs/config/assets/credential fingerprints/projection/fences совпадают исходным; никакой silent non-code rebase.
5. Закрытый `start-prestart-resume-once`: fresh preflight → signed resume binding → native final → один native attempt → Start → штатные candidate/register → resumed seal/current/handover → own adoption. Новый verb может добавляться в существующий fixed persistent CLI/closed RPC, без arbitrary selectors.
6. После consumption любой Start/identity/argv/candidate/register/seal/current/ACK/timeout/LOST fault остаётся held/read-back UNKNOWN по прежнему контракту. Этот scope не даёт третьей launch. Нельзя повторять POST/register/Start, менять UUID/gen или восстанавливать отсутствующую authority repair-записью.

## Focused acceptance

- Error string/отсутствующий attempt/free port/new UUID сами недостаточны. Wrong op/gen/nonce/root/THREAD/original raw hash/audit ref/HMAC, duplicate/unknown runtime pin отвергаются.
- Любой non-code drift до Start закрывает путь: directory dev/ino/names/mtime/ctime, file bytes/size, fixed guards, reparse/hardlink, installed assets и protected state. Directory size0/4096 — единственная нормализация представления; file sizes сохраняются.
- Existing native attempt/candidate/registration/genesis/current/foreign generation при authorizing/preflight отвергаются. Existing/partial launch binding, expired effective ticket и lost pair дают dispatch0.
- Проверяются actual JS/native effective resolvers, child startup/registration и production native loop с synthetic kernel ports. Fault injection каждого Start/register/seal/current seam подтверждает максимум1 Start/1register POST; UNKNOWN после Start не даёт новый retry.
- Original unknown и все original bytes сохраняются после success. Own resumed genesis и последующая adoption не зависят от legacy mutable reads. Offline tests не являются live acceptance; новых native/AE/AME checks этим design note не выполнялось.

Неприемлемы directory fix + старый start replay, перепись once/intent/policy/reservation, новый UUID/gen для обхода consumed UNKNOWN и универсальный rescue. Текущая explicit user authorization на actual migration покрывает адресное административное завершение той же первой native launch; arbitrary повторное подтверждение не требуется. Independent review и fresh actual controller proofs обязательны.

## Принятая offline evidence

- `core-migration-directory-metadata-smoke.ps1`: PASS9, production metadata/resource foreach с managed synthetic kernel; directory4096→0, остальные fields/names и file-size negatives.
- `core-prestart-recovery-smoke.js`: PASS38, actual engine/effective resolvers/startup/candidate/register/current/resumed genesis на isolated signed files; actual first-adoption source read-set checks, redirect→lawful successor→fresh activation, fault windows и immutable originals. Native/RPC/source producers обозначены synthetic.
- `core-prestart-recovery-native-smoke.js` + `.ps1`: PASS51/11 cases, actual native resolver/production loop с managed ports; exact-case ordinary lane Start0, paired/current-session positive, ticket/session/pair/pin faults и original-byte preservation. Actual native/process APIs не выполнялись.
- Existing relevant checks переиспользованы: engine81, integration51, native-contract20 PASS. Final scoped specialist review прочитал code/test evidence, подтвердил закрытие alternate native lane P1 и завершил ACCEPT без новых findings. Эти результаты не являются live proof и не разрешают обход fresh runtime gates.

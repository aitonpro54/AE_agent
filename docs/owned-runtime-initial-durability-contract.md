# Initial OWNED: Windows journal/consumption prerequisite

13 октября 2026. **Spec GO для минимального test-only prerequisite.**
Independent bounded review SHA256: `84c91f65e4d012b78321baf5d48563dc7344c11328dae1a974ca7d5cacf3b472`.
Implementation ждёт native fence acceptance и согласованного facade ownership.
Зависимости: [initial model](owned-runtime-initial-contract.md), [fence](owned-runtime-initial-fence-contract.md),
[issuer gap](owned-runtime-initial-integration.md). Spec GO не доказывает native fence/storage
и не расширяет scope нынешнего native writer.

Все records/results: `scope: windows_initial_durability_prerequisite`,
`productionAuthority:false`, `issuerStatus:unavailable`, `admission:false`,
`replayAllowed:false`, `mayDispatch:false`. Никаких daemon/AE/AME effects,
auth tokens, migration receipts, retained history или production store wiring.
Fixture IDs/floor удостоверяют только собственный тест, не machine/user/chat.

## Минимальный полезный результат и границы гарантий

Проверить на local NTFS: serialized immutable journal, original lineage,
process-crash reconstruction, conservative consumption и owner epoch/CAS.
Нельзя принимать file existence/hash/flush receipt за issuer или право выполнить effect.
Storage API не выпускает effect permit/callback. Same-user hostile modification,
старый whole-volume snapshot и hardware rollback не защищены этим модулем.

Один no-replace record file на переход; head выводится из chain. Нет mutable HEAD,
replacement/compaction/repair/truncate, automatic retry/new lineage после unknown.
SQLite/TxF/registry не добавлять; существующие product modules не менять.

## Private factory и необходимое расширение fence interface

RootConfig получает original driver-pinned runRoot/fixture/пустой journal-directory
FILE_ID_INFO, fixed fence-file identity и approved fixture installation ID.
Storage opens относительно held directory HANDLE; весь no-follow/NTFS/identity/
hardlink/case-sensitive contract fence сохраняется. Backend не создаёт missing dirs.
Test driver может заранее provision только пустой fixture journal namespace;
**все backend writes**, включая GENESIS/epoch, требуют held fence + fresh identity.
Любая normal-directory replacement — отказ без rebind. Путь/source/config не создают scope.

Current fence specification не даёт private fenced filesystem write port. Нужна facade:
`WithLiveFence(rootLease,fenceLease,fn)` в **том же процессе**, serial/non-reentrant,
с private held parent handle и in-memory factory/session binding. CLI `check`, затем
запись Node/PowerShell другим процессом этому не эквивалентны. Serialized sessionRef,
PID или epoch не заменяют живой FenceLease. Во время fn release/reacquire запрещены.
Дополнительно private live `ContinuityPort`: held driver process instance + private test channel,
без PID reopen/JSON heartbeat/token. Отсутствие port — UNAVAILABLE, не production issuer.
Stage guard требует fresh port round-trip и `WaitForSingleObject(heldDriverHandle,0)==WAIT_TIMEOUT`;
WAIT_FAILED/signaled/broken channel закрывают port, cached liveness/receipt недостаточны.
Driver liveness проверяется на входе, перед каждым mutating IO и после IO; detected death/disconnect
навсегда закрывает новые writes/ACK. Уже отправленный IO может завершиться только UNKNOWN;
retroactive cancellation и linearization с driver death не обещаются; surviving child не clears unknown.
Оба accessor пока interface gaps; exact driver death before append даёт0creates.

Новый writer scope после spec GO и native fence acceptance:
`native/owned-runtime-initial-durability/store_win32.h/.cpp`,
`durability_proof_main.cpp`, `DurabilityPrerequisiteProof.vcxproj`,
`scripts/owned-runtime-initial-durability-proof.ps1`. Fence facade — отдельное согласованное
ownership расширение после завершения нынешнего writer, без incidental edits.
Proof outputs только в новом owned `.codex-runtime/initial-owned-durability/<runId>/`;
build/helper children test-only, без AE SDK/providers/dependency installs.

## Closed schema и стабильный scope

`ScopeBinding = {fixtureInstallationId, runRootPin, fixtureRootPin, journalDirectoryPin,
fixedFenceFilePin}`; каждый pin содержит original volume GUID/serial64/FileId128.
Все pins поступают из private fixture factory; canonical paths проверяются отдельно.
Canonical bytes: installation ID raw16; pins в указанном порядке, каждый GUID raw16
(Windows GUID layout), serial LE uint64, FileId raw16; путей/string fields здесь нет.
`scopeHash = SHA256(canonical fixed-width ScopeBinding bytes)` не зависит от spelling,
source/config hash, child/controller ID, nonce или restart. ID installation неизменен
в этом fixture run; backend не генерирует replacement installation ID при read failure.

GENESIS задаёт один `lineageId128` и scope binding; это fixture lineage, без fabricated
predecessor/issuer/authorization. Последующие records ссылаются на exact genesis hash.
Source/config fingerprints допускаются только как diagnostic hashes NOTE, не часть key.

Минимальный frame v1: magic8=`OWNJRN01`, version16=1/type16, frameLength32, scopeHash32,
lineageId16/genesisHash32, sequence64, ownerEpoch64, ownerAcquisitionId16,
previousHash32, stableAttemptKey32, payloadLength32, closed payload, frameSha25632.
Endian LE для integers, hash по всем предшествующим bytes. Frame ≤16 KiB,
payload ≤4 KiB; enum/length/overflow/trailing bytes/unknown fields отвергаются.
Types1..5 по порядку таблицы; CONSUME class16=1..3, OBSERVATION outcome16=1..3.
Selector payload: launchId16/count16/entries(class16+targetId16), sorted unique bytes;
OWNER_EPOCH payload=ownerId16, OBSERVATION=consumeHash32+outcome16, NOTE=hash32+hash32.
64-bit counters в JSON results — canonical decimal strings, не JavaScript Number.
FileId — raw bytes hex, serial64 —16 hex; не DWORD serial из volume query.
SHA256 обнаруживает corruption при заданном original head; это не keyed authenticity.

| Type | Closed payload / semantic effect |
| --- | --- |
| GENESIS | Full ScopeBinding + frozen fixture selector table; sequence1/epoch0, zero previous/genesis/owner reference; одна на store |
| OWNER_EPOCH | New ownerAcquisitionId; epoch=previous epoch+1; acquisition bound to live fence |
| CONSUME | effectClass=fixture_launch_once/fixture_dispatch_once/fixture_stop_once, logicalTargetId16; permanently spent key |
| OBSERVATION | exact consumed record hash, outcome=ACK/UNKNOWN/OBSERVED; только добавляет факт |
| NOTE | source/config digest pair; не меняет lineage/epochs/consumption |

`consumptionKey = H(scopeHash,lineageId,effectClass,logicalTargetId)`.
Client operation UUID/new owner/source/config не дают новый key. Для launch logical
target фиксирован genesis, повтор с новым generation selector запрещён. Dispatch/stop
targets берутся из заранее reviewed fixture selector table, закреплённой GENESIS;
таблица содержит launchTargetId16 и максимум16 dispatch/stop entries с class+targetId16.
Private factory проверяет её exact approved bytes; backend не меняет table из source/config.
Each stableAttemptKey выводится из type и semantic target, не из caller nonce;
duplicate exact request — factual read-back, conflicting payload — отказ.
Для OWNER_EPOCH key включает previous epoch/new owner; GENESIS key фиксирован scope.
OBSERVATION связывает consumed hash+outcome, NOTE — diagnostic digest pair.
Consumption никогда не очищается terminal observation, новым epoch или reconstruction.
`ownerAcquisitionId` unique raw16 назначается driver на каждую acquisition, включая same child;
driver связывает ID с exact held child process/acquisition/session; один session имеет один epoch.
GENESIS: empty namespace + original pins + held fence + live port + initial floor
`UNPROVISIONED(scope,seq0,epoch0,head0)`, без pending/прежнего lineage; current owner не требуется.
OWNER_EPOCH: reconciled GENESIS/floor, no pending, acquisition без committed epoch, exact previous CAS;
takeover не требует equality нового owner со старым head, но driver revokes старый session.
Первый OWNER_EPOCH —1. Normal CONSUME/NOTE/OBSERVATION требуют committed current acquisition
epoch/owner и exact CAS. Stale owner/CAS —0creates, нельзя вызвать takeover как normal append.

## Append ordering, CAS и acknowledged persistence

Namespace — fixed-width `00000000000000000001.rec` + contiguous slots; имя не caller pathname.
Inventory через held HANDLE: максимум256 slots/4194304 aggregate bytes; bounded enumeration,
overflow/limit/foreign/gap/hardlink/reparse/nonregular/duplicate key/semantic error закрывают store.
Known slot IDs сверяются с driver pins; complete unknown tail только через pending reconciliation.

1. Fresh fence/pins/live port + bounded chain/floor/pending reconstruction; проверить отдельные
   GENESIS/takeover/current-owner preconditions и expected epoch/seq/head CAS **до create**.
2. До FILE_CREATE driver privately регистрирует один `PendingAppend` для exact child process,
   acquisition/session/scope, expected epoch/seq/head, nextSlot, type/semanticKey/frameHash.
   Для CONSUME semanticKey=consumptionKey, для прочих types=stableAttemptKey.
   Driver проверяет approved scope/floor/acquisition binding; caller не подставляет чужой process/session.
   Только live confirmation регистрации допускает IO; snapshot/JSON receipt не заменяет port.
3. Снова fresh fence/continuity; held journal-relative no-follow FILE_CREATE/CREATE_NEW,
   no replace/delete-on-close; existing next slot → reconciliation/UNKNOWN, не retry.
   Exact synchronous WriteFile; short/error → UNKNOWN, partial сохраняется без дозаписи/удаления.
4. FlushFileBuffers same HANDLE, held read-back digest/scope/chain + fresh guards;
   failure/death → UNKNOWN. Driver independently открывает/query/read exact slot под original
   held dir, сверяет pending frame/identity, advances floor, **затем** clears pending и ACK.
   Floor advance+pending clear — driver-serial critical section; внешняя операция между ними запрещена.
   Необходимый handle-sharing/read witness port — часть отдельного source review.
   ACK=`os_flush_ack_and_readback`, consumptionRecorded=true только для CONSUME,
   mayDispatch:false. Missing slot/failed reconciliation никогда не clears pending.

[WriteFile](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-writefile)
не гарантирует atomic multi-sector record. Complete validation + fence дают logical all-or-refuse:
partial slot существует, но закрывает writes; atomic filesystem append не обещается.
[FlushFileBuffers](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-flushfilebuffers)
даёт API success; controller/cache/media ordering, directory-entry persistence и power-loss
survival **UNVERIFIED**. Rename не нужен и не доказывает durability. Process crash/child restart
проверяемы; OS crash/reboot/hardware tests вне scope. ACK не открывает production launch.

## Epoch, continuity floor, reconstruction и noReplay

Каждая acquisition, включая same child reacquire, получает новый owner ID и epoch+1 до normal writes.
Lost epoch ACK не восстанавливает старый owner; valid record входит консервативно через reconciliation,
partial блокирует всё. Overflow/source/config/restart не сбрасывают counters/revoked sessions.

Private `ContinuityFloor = {scopeHash,genesisHash,minimumSequence,minimumEpoch,
knownPrefixHeadHash,knownSlotFileIds}` + pending хранит **независимый живой test driver**.
Это test dependency, не issuer/secret/production authority JSON. Driver owns original witnesses;
floor advances только independent held-handle query/read, never child ACK, never decrement.
Exact known prefix/epoch/file IDs обязательны; byte-identical known file replacement — refusal.
Child не выбирает floor/pins. Длинный complete tail допустим лишь при exact pending match;
driver observes it, advances floor, clears pending. Необъяснённый tail → UNKNOWN.
Recovery read-back без наблюдённого original flush даёт лишь `recovered_readback_only`, не OS-flush ACK.
Absent/partial/conflicting pending slot НЕ clears intent: store UNKNOWN закрывает **все** append,
GENESIS/new epoch/takeover. Pending CONSUME semanticKey остаётся conservatively spent даже при
валидном старом prefixN после disappearance complete N+1/lost ACK до driver query.
Reconciliation только read-only до доказанного exact complete slot; отсутствующий slot не free key.

Без original live floor+pending rollback valid prefix неотличим. Driver death/disconnect закрывает
surviving child: read-only UNAVAILABLE, in-flight UNKNOWN; нельзя привязаться к replacement driver,
append/provision/new epoch/lineage. Persistent anti-rollback floor/power loss — integration gaps.

Reconstructed CONSUME key spent без ACK; OBSERVATION дополняет UNKNOWN, не переписывает его.
Partial/unparseable slot блокирует весь store; даже valid consume даёт лишь read-back, не effect.
Missing GENESIS при provisioned floor/pending → UNKNOWN, не fresh UNPROVISIONED factory.

## Exact parent-run proofs и review gates

Parent — sole driver/temp writer/controller; original pins, factory/process instances,
fence lifetime и replacement-safe cleanup берутся из fence contract. Driver floor
сохраняется между **child** crashes, не считается пережившим смерть driver/OS.
Каждый fault имеет exact stage + held child process exit evidence + inventory до/после.
Test-only pause/crash hooks не подменяют реальные Windows IO; API-failure injection
отмечается отдельно от actual short writes/crash/handle-error evidence.

| Case family: каждый вариант отдельный mandatory ID | Ожидаемый результат |
| --- | --- |
| Empty original fixture: GENESIS→first epoch1→consume→observation; child reconstruction | Initial floor/pins/held fence mandatory; same lineage/key spent, no admission |
| Два competing writers, one physical root/alias | Kernel exclusion; один append; stale CAS создаёт0files |
| Child B takeover; отдельно same-child reacquire/source/config change | New acquisition owner, epoch строго+1; old owner/CAS0creates, прежний consume key |
| Crash before pending/registered-beforecreate/aftercreate/partial/fullwrite/preflush/postflush/preACK | Beforepending0IO; unresolved pending→UNKNOWN; valid tail→exact reconciliation; zero replay |
| Actual partial frame then abrupt ExitProcess; flush on invalidated test handle | Real truncated slot/error preserved; no positive ACK/new append |
| Lost ACK + exact duplicate/conflicting key/new operation ID | Read-back exact consumed record или refusal; no second consume/effect |
| FloorN: complete CONSUME N+1/lost ACK/crash; tail исчез до driver query | Pending retained; store UNKNOWN/all append+epoch blocked, key spent despite valid prefixN |
| Driver dies before child append; отдельно during in-flight IO | First0creates; second UNKNOWN/no ACK/continuation; surviving child/replacement driver cannot write |
| Known slot byte-identical ordinary replacement; отдельно root/journal-dir replacement/reparse/hardlink/foreign entry | Pins/shape/hash/inventory refusal до writes; original evidence не удаляется |
| Valid old prefix/suffix deletion при known driver floor | Rollback refusal; без floor writes unavailable, не fresh lineage |
| 257slots/aggregate-size limit; отдельно counter overflow/gaps/duplicates/semantic-invalid hash-valid record | Bounded refusal, no repair; independent parser validation |
| Reconstruction of complete consume + UNKNOWN then terminal observation | Original UNKNOWN retained, spent key survives |
| GENESIS missing initialfloor/pins/fence/port; missing genesis at provisioned floor; identity query failure |0privatewrites, no auto-provision/epoch reset |
| Crash/lost ownership during publication; stale/crosschild references | Terminal UNKNOWN/read-back; no release/rebind of чужой lease |

Actual process-crash matrix проходит в own temp namespace; outcomes могут быть
strict UNKNOWN, а не forced success. Все native cases пока UNVERIFIED, skipped mandatory
case не PASS. Spec GO принимает contract, отдельный source review принимает implementation,
parent native evidence принимает только реально проверенные guarantees.

## Evidence, decisions и остающийся пробел

Targeted reads: initial model snapshot/append/storePort, initial/fence docs;
`owned-runtime-lifecycle.js:73` и `native-fixture-attempt-ledger.js:26` — wx/fsync patterns;
`service_win32.cpp:134–149` — held no-replace file/flush/rename pattern. Они не доказывают
новые scope/floor/reconstruction guarantees и не переиспользуются как authority.
Frozen intake/history/runtime logs не читались; issuer/protected assets не затронуты.

Prerequisite не требует genuine host issuer, поскольку хранит только fixture bookkeeping
и навсегда закрывает admission. Gaps: same-process fence write facade, private live continuity/pending
port+read witness, original floor, native acceptance и power-loss semantics ещё не доказаны.
Нельзя напрямую подключить этот backend к synchronous offline model storePort или
считать binary fixtures production Event/Authorization. Production wiring/semantic mapping,
trusted floor/provisioning и issuer остаются отдельным reviewed scope.

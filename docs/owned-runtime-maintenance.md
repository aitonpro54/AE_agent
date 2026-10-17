# Штатное завершение owned runtime: R1

## Ограниченное восстановление initial startup — 17 октября

`scripts/owned-runtime-initial-recovery.js` обслуживает один случай: после
разрешённого administrative reset обычный initial `ensure` оставил только
`intent`/`launch-intent` и startup chain до registration, но не current pointer.
Это отдельный новый startup, не повтор или завершение старой операции.

Private `prepare --authorization-reference <current-chat-UUID>:initial-startup-recovery-20261017`
пишет HMAC capability: exact original operation/generation/восемь file pins,
исторический fixture/retained inventory, current source/config/policy и новые
generation/nonce/operation. Policy/credentials не меняются. Caller не задаёт PID,
executable, argv или authority path. `inspect` не запускает процесс;
`recover-once` использует прежний fixed native launcher. Это локальный bounded
administrative CLI, не remote grant или универсальный reset.

Generation key потребляется до effects независимо от UUID/source alias.
Native preflight держит read locks на capability/config/policy/source/original
witnesses; требует expired original ticket, успешный process/TCP census,
отсутствие старого owner/helper и постороннего pointer/reservation. Unknown
observation отказывает. Current публикуется create-only; отдельный completed
receipt следует после publication/read-back. Любой UNKNOWN запрещает initial
admission и повтор. Старые journals/keys/outcome неизменны; PID absence не exit proof.

Initial trust требует exact current registration, неизменные source/config/policy
и свежий authenticated CEP connection. Ordinary transport сохраняет namespace и
receipt gates. Explicit autonomy off и manual/autonomous/raw/destructive/save gates
сохраняются. Retained/nativeFixture admission этот trust не выдаёт. Readiness
требует current fixture/runner quiescence и pending cleanup0; историческим children
не приписывается exit. Future retained succession не добавлена: будущий restart
требует отдельного поддержанного initial lifecycle решения.

Offline: `node scripts/owned-runtime-initial-recovery-smoke.js` и
`pwsh -NoProfile -File scripts/owned-runtime-initial-recovery-native-smoke.ps1`;
native smoke исполняет actual preflight AST с mocked file/CIM/TCP, effects0.
Live17окт: recovery `9a61a1d1-6680-4023-9dcd-7d3c1ccffef4`, generation
`ef0668f2-b90a-45d1-9521-e58e7fc057b7`, source `915a7e0a…c73617`; после
штатного Connect admission open/readiness true, pending0/inflight[]. Подтверждён
native read `Titr_atomx_template.aep`/171items/revision100570317. По прямому
поручению пользователя один stale offline CEP Connect архивирован из active queue
с exact backup трёх storage keys/unknown sidecar; server queue уже была пуста.
AE mutations/save0. Evidence: ignored `.codex-runtime/title-template-20261017/`.

R1 добавляет закрытие двух disposable native fixture children. Исходный daemon,
основной AE, AME, CEP и пользовательские проекты остаются за отдельными gates.
R1 не запускает и не перезапускает приложения. Следующие этапы используют тот же
контракт authority/journal; R1 не меняет runner, daemon и набор runtime hashes.

CLI принимает только `inspect`, `close-once`, `read-back` и три обязательных
селектора. Единственный production profile selector —
`migration-fixture-children-v1`. PID, executable, command, path, process tree и
caller-supplied disposable/force flags не входят в публичный контракт.

```powershell
node scripts/owned-runtime-control.js inspect --profile migration-fixture-children-v1 --run-id <UUID> --stage-id <32hex>
node scripts/owned-runtime-control.js close-once --profile migration-fixture-children-v1 --run-id <UUID> --stage-id <32hex>
node scripts/owned-runtime-control.js read-back --profile migration-fixture-children-v1 --run-id <UUID> --stage-id <32hex>
```

`inspect` проверяет authority, открывает query/sync handle и читает HWND/состояние.
Он не создаёт shutdown journal. Отсутствующий или устаревший provision закрывает
доступ к эффектам. `read-back` читает потреблённый журнал даже после смены daemon
или истечения профиля; `profileFresh:false` не допускает новый эффект.

## Provision и схема

Фиксированный источник authority:
`.codex-runtime/owned-runtime-maintenance/profiles/migration-fixture-children-v1.json`.
Это отдельное доверенное локальное решение оператора после review оригинальных
launch witnesses. Содержимое текущего writable ledger, его producer strings,
plain SHA и inspector сами по себе не дают ownership. CLI не принимает путь
профиля, его hash, credential или обходной executable. Профиль нельзя публиковать
как remote tool evidence. Этот контракт не заявляет защиту от другого процесса
с полномочиями того же локального оператора.

Все поля ниже обязательны; дополнительные поля отказаны `validateProfile`.
Пример задаёт форму, значения в угловых скобках заполняет оператор:

```json
{
  "schema": "ae-agent.owned-runtime-profile.v1",
  "profileId": "migration-fixture-children-v1",
  "generation": "<уникальный nonce поколения>",
  "issuedAt": "<UTC ISO>",
  "expiresAt": "<UTC ISO>",
  "context": {
    "runId": "<UUID>",
    "requestId": "<UUID original transport>",
    "actionId": "act_<32hex>",
    "instanceId": "<UUID original transport>",
    "proposalRevision": 2,
    "payloadHash": "sha256:<64hex>"
  },
  "canonicalBindingSha256": "<hash(context)>",
  "canonicalRecord": {
    "path": "<absolute logs/evidence/plan-runs/runId.json>",
    "rawSha256": "<SHA256 всех bytes файла>",
    "envelopeSha256": "<record envelope.sha256>"
  },
  "daemon": {
    "identity": "<Identity object ниже>",
    "startedAt": "<exact /dev/status.startedAt>",
    "loadedRuntimeSha256": "<humanGuardRuntime.sourceSha256>",
    "port": 3456,
    "credentialSha256": "<SHA256 private AE_BRIDGE_TOKEN, без самого token>"
  },
  "protected": ["<daemon Identity>", "<primary AE Identity>", "<AME/прочие защищённые Identity>"],
  "protectedInventorySha256": "<hash(protected)>",
  "stages": ["<capture Stage object>", "<stage Stage object>"],
  "policy": {
    "disposableFixture": true,
    "allowForce": true,
    "gracefulDeadlineMs": 5000,
    "forceDeadlineMs": 5000
  }
}
```

`Identity` имеет ровно `pid` (positive int32), `birthFileTime` (decimal string
FILETIME), `birthUtc` (UTC с **семью** дробными цифрами), `imagePath` (полный
Windows path), `executableSha256` (64 lowercase hex). FILETIME и UTC должны
представлять одно и то же значение 100 ns; миллисекунды не являются birth pin.
Daemon Identity должен полностью присутствовать в protected. PID всех protected
уникальны; PID обоих stage не совпадают с ними и друг с другом.

`Stage` имеет ровно `stageId`, `role` (`capture`/`stage`), `identity`, `descriptor`,
`pins`. Descriptor — точная оригинальная структура runner:
`nonce,stageId,role,rootPath,pluginPath,pluginSha256,executablePath,executableSha256`.
В `pins` ровно четыре записи: `reservation`, `launch`, `manifest`, `unknown`.
Каждая имеет `path` (absolute), `rawSha256`, `valueSha256`. Для manifest
`valueSha256:null`; для трёх JSON envelopes это оригинальный `envelope.sha256`,
который дополнительно проверяется против digest `value`. Raw SHA считает все
bytes, включая форматирование. Manifest hashes каждого stage проверяются отдельно.

Фиксированные evidence paths:

- `logs/evidence/plan-runs/<runId>.json` — canonical envelope `{schema,sha256,record}`;
- `.codex-runtime/ame-native-fixture-ledger/<stageId>/reservation.json`;
- `.codex-runtime/ame-native-fixture-ledger/<stageId>/launch.json`;
- `.codex-runtime/ame-native-fixture-ledger/<stageId>/unknown.json`;
- `.codex-runtime/ame-native-fixtures/probe-<nonce>/launch.manifest`.

Canonical envelope проверяется целиком, включая `record.runId`, `run.id` и
`run.provenance.actionId/proposalRevision/payloadHash`. Request/instance IDs
оператор сверяет с сохранённым original transport; этих полей в canonical record
нет. Их нельзя достраивать из нового inspector read-back. `canonicalBindingSha256`
и `protectedInventorySha256` вычисляет экспорт `hash` из lifecycle — canonical
JSON с рекурсивной сортировкой object keys. Hash original envelopes использует
существующий ledger digest `JSON.stringify(value)`; это разные представления.

Credentials читаются только из фиксированного repo `.codex/config.toml`, секции
`[mcp_servers."after-effects".env]`: automation `AE_BRIDGE_TOKEN` и отдельный
`AE_BRIDGE_PANEL_TOKEN`. Ограниченный parser допускает однострочные double-quoted
TOML basic strings с общими JSON escapes, отказывает duplicate keys/sections,
multiline/unsupported values и совпадение двух tokens. Host фиксирован
`127.0.0.1`, port `3456`; заданные в секции host/port обязаны совпадать. Если
задан `AE_BRIDGE_LOG_DIR`, он обязан разрешаться в repo `logs`. Другие секции
не являются credential source. Token не попадает в profile, stdout или docs.
Profile содержит automation fingerprint и port; environment/CLI/global config
fallback отсутствует. Оператор отдельно проверяет
свежий полный protected inventory и оригинальные witnesses перед provision.
Файлы и все ancestors обязаны быть обычными contained путями без symlink/junction;
hard links отказаны. Load копирует/freeze JSON и сохраняет source identity/hash;
каждая async граница повторно проверяет их.

## Native эффект и журнал

Backend использует единственный одобренный portable PS7.6.5 `pwsh.exe`, pinned
в `owned-runtime-win32.POLICY` вместе с SHA fixed helper. `-File` получает
фиксированный helper, structured NDJSON идёт через stdin; shell-built commands,
PS5 fallback и ExecutionPolicy bypass отсутствуют.

OpenProcess открывает QUERY_LIMITED_INFORMATION/SYNCHRONIZE и, для close,
TERMINATE. Тот же handle удерживается через identity checks, EnumWindows,
WM_CLOSE, TerminateProcess и WaitForSingleObject. Image path/SHA и lossless birth
сверяются с trusted witness; image file удерживается без разрешения записи.
Выбор окна использует PID ownership, без title, broadcast и dialog clicks.
Ноль или несколько HWND — явное graceful unavailable. Ошибка OS/API/auth/access
прекращает operation и не переводится в force.

Native helper непосредственно перед каждым эффектом перечитывает профиль,
source file identity, expiry, witness bytes, protected identities и authenticated
original-daemon status/registration. На время send профиль и witness files
удерживаются Share.Read handles. Fixed credential config также перечитывается,
проходит тот же strict parser и fingerprint check и удерживается Share.Read
handle на время эффекта; parse/auth refusal не допускает force. Истечение
проверяется ещё в C# перед API.
Legacy bootstrap допускается только для явного terminal `stage:"verified"`
при отсутствующем `busy`; running/pending/unknown отказаны. Это узкая проекция
старого status, она **не** является общим daemon drain или authority на primary AE.

Журнал лежит в `.codex-runtime/owned-runtime-maintenance/journal/<runId>/<stageId>`.
Exclusive mkdir и fsynced `intent.json` предшествуют эффектам. Отдельные
`graceful-intent`/`force-intent` потребляются до единственной отправки; результаты
пишутся отдельными immutable envelopes. Любой existing/partial directory,
неизвестная отправка или timeout блокирует следующую `close-once`, в том числе
из нового factory/process. Журнал нельзя удалять или переписывать для retry.

Persistent policy допускает один force только после graceful deadline или true
unavailable, только для доверенного disposable fixture. Force использует
TerminateProcess с тем же handle. Успех PostMessage/TerminateProcess означает
лишь отправку; фактический exit подтверждает `WAIT_OBJECT_0`. Exit code 259
допустим для signaled handle. PID absence/reuse и незавершённое ожидание не дают
exit proof.

Положительный wait/inspect результат сохраняется синхронно до следующей async
проверки authority. Если эта проверка отказывает после intent, immutable result
сохраняет фактический `shutdownExitProven:true` и прежний shutdown proof вместе
с `followupRefused:true` и code отказа. Отзыв policy блокирует будущие эффекты,
не отменяя уже наблюдённый exit; timeout по-прежнему не создаёт proof и остаётся
consumed без force/retry после отзыва.

`ae-agent.owned-runtime-shutdown-handle-result.v1` — собственное свидетельство
закрытия. Оно не заменяет **original launch observer** retirement proof.
`shutdownExitProven` не означает success старой native mutation, replay,
guard/admission release или разрешение остановить original daemon. UNKNOWN
старого run сохраняется. `inspector.processExited` относится к retirement audit
и может оставаться false после реального original observer proof. Следующий этап
проверяет обе оригинальные proofs отдельно до daemon restart.

## Встраивание и проверки

Private factory `createOwnedRuntimeLifecycle({repoRoot,journalRoot,
loadTrustedProfile,checkOriginalRegistration,native,now})` возвращает `run` для
закрытой selector schema. Loader возвращает
`{profile,profilePath,profileRawSha256,assertUnchanged}`. Registration adapter
возвращает `registered,originalDaemonVerified,idle,generation,
canonicalBindingSha256,protectedInventorySha256`; это не launch ownership.
`checkWitnesses`/`writeJournal` overrides предусмотрены только для trusted
private harness/integration, не для публичных tool args.

Shared exports: `validateProfile`, `pinFiles`, `selector`, `binding`, `canonical`,
`hash`, `freeze`, `journalDirectory`, `readJournal`, `writeJournalOnce`,
`exitProof`, schemas/outcome. Native factory `createWin32Backend().open` возвращает
`inspect/graceful/force/wait/dispose` одного held session; `authority` — private
native lease из loader. CLI экспортирует fixed `loadTrustedProfile`,
`checkOriginalRegistration` и private trusted JS helpers `credential(profile)` /
`request(profile,route,body)` для общего authenticated transport. Transport
проверяет automation fingerprint и fixed endpoint; сам по себе не даёт ownership
или admission. `credentialFingerprint()` без profile возвращает только SHA256
automation token из fixed config для operator provision; `parseCredentialConfig`
экспортирован для scoped regression harness. Эти helpers не являются публичными
MCP tools/CLI commands. Native session напрямую не публикуется в MCP/CLI.

```powershell
node scripts/owned-runtime-lifecycle-smoke.js
node scripts/owned-runtime-win32-smoke.js
npm.cmd run check:rules
```

Offline smoke проверяет contract refusals, async invalidation, journal failure,
partial/unknown/duplicate, concurrent factories и strict credential parser.
Native smoke проверяет тот же parser по fixed helper AST и запускает только
собственные hidden synthetic PS processes/windows: graceful, stubborn single
force, no-window, code 259, protected/birth refusal, native lease revocation и
inspect-only refusal, credential revocation перед graceful и parser refusal
перед force после timeout. Собственный synthetic nonce root имеет фиксированный
`.codex/config.toml` с придуманными credentials; production config тесты не меняют.
Synthetic profile существует в отдельном nonce root и
не является production authority. Test children самоистекают; cleanup ждёт их
закрытия и удаляет только проверенный exact собственный temporary root после
завершённого теста. Synthetic результат не доказывает живую AE migration,
original daemon registration или original observer proofs.

Нормативные API: [PostMessageW](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-postmessagew),
[TerminateProcess](https://learn.microsoft.com/en-us/windows/win32/api/processthreadsapi/nf-processthreadsapi-terminateprocess),
[WaitForSingleObject](https://learn.microsoft.com/en-us/windows/win32/api/synchapi/nf-synchapi-waitforsingleobject).

## R3: внешний owned daemon supervisor

`createOwnedRuntimeSupervisor()` предоставляет закрытые `status()`, `ensure()`,
`restart()`, `shutdown()`, `readBack(operationId)`. Публичные MCP операции не
принимают selectors; CLI принимает только следующие формы:

```powershell
node scripts/owned-runtime-control.js status
node scripts/owned-runtime-control.js ensure-bridge --operation-id <UUID>
node scripts/owned-runtime-control.js restart-bridge-once --operation-id <UUID>
node scripts/owned-runtime-control.js shutdown-bridge-once --operation-id <UUID>
node scripts/owned-runtime-control.js read-back --operation-id <UUID>
node scripts/owned-runtime-control.js cleanup-fixtures-once --run-id <UUID>
node scripts/owned-runtime-control.js disable-owned-maintenance
```

Fixed `BASE` остаётся `.codex-runtime/owned-runtime-maintenance`. Policy файл
`BASE/policy.json` имеет schema `ae-agent.owned-runtime-policy.v1`, generation,
enabled, authorization `{source:"explicit_user_chat",reference:<исходный chat>}`
и acceptedServerCoverage. Выключение сохраняется атомарно с fsync и immutable
disable receipt; оно не выдаёт новых grants. Enabled policy перечитывается перед
каждой фазой. Native pre-effect lease удерживает read locks на policy/config,
profile, source и witnesses; отказ lock/API/auth запрещает effect. Уже наблюдённый
exit остаётся фактом после отзыва policy. Credentials берутся только из fixed
`.codex/config.toml`; token не сохраняется в profiles, receipts или выводе.

Node executable и его SHA заданы в `supervisor.POLICY`; argv в точности
`[fixedNode, ROOT/mcp-server/bridge-daemon.js]`, cwd ROOT, запуск скрытый.
Native helper source и portable PS7 также pinned. Caller не задаёт PID/path/argv,
force, profile filepath или disposable flag. `/health`, PID и producer rows не
дают ownership. Process без startup ticket не получает owned maintenance
authority; при активном reservation не допускается unreserved listen.

Immutable startup files находятся в `BASE/daemon-reservations/<generation>/`:

```text
reservation.json: {schema:supervisor.v1.reservation, generation, operationId,
 bootNonce, command:{executable,executableSha256,argv,cwd}, sourceSha256,
 sourcePins:[{name,sha256}], credentialSha256, authorizationRef, createdAt,
 replayAllowed:false}
startup-ticket.json: {schema:supervisor.v1.startup-ticket, generation, bootNonce,
 reservationSha256, issuedAt, expiresAt, replayAllowed:false}
native-candidate.json: {schema:supervisor.v1.native-candidate, generation,
 bootNonce, reservationSha256, startupTicketSha256, kernelIdentity, argv,
 sourceSha256, heldLaunchWitness:{kind:"native_launch_held_process_handle",
 handleOpenedAt,identityVerifiedAt}, authentication:HMAC_SHA256}
registration.json: {schema:supervisor.v1.registration, generation, bootNonce,
 reservationSha256, startupTicketSha256, nativeCandidateSha256,
 serviceStartedAt, registeredAt, requiresRetainedAdoption:true,
 replayAllowed:false}
```

В этом блоке `supervisor.v1.*` означает полный prefix
`ae-agent.owned-runtime-supervisor.v1.*`; каждый файл — R1 envelope
`{schema:"ae-agent.owned-runtime-shutdown.v1.envelope",sha256,value}`. Startup TTL
фиксирован в 600000 ms. Candidate HMAC подписывает canonical value без поля
authentication через общий fixed credential reader. Он создаётся только native
launcher после проверенного actual launch и held HANDLE; plain row/SHA не
заменяет этот private origin. Registration проверяет actual own pid/argv/source,
boot nonce и STARTED_AT. Service startedAt имеет миллисекунды и проверяется между
kernel birth и registration time; его не приравнивают к kernel birth.

Отдельная ветка retirement относится только к исходному ROOT71 startup, который
никогда не был admitted. До завершения kernel retirement и исходной операции
97441 её замороженный source `9e9` остаётся неизменным. Retirement требует
подписанный acquisition именно этого исходного source, доказанный exit того же
удерживаемого kernel HANDLE, post-exit inventory и фактическое завершение
исходной операции 97441. Обычный ACK, registration, отсутствие PID или вывод о
результате операции не заменяют ни одно из этих свидетельств и не разрешают
admission. Исторический reader вызывается явно и принимает только completed
original signed source; `sourceStable:false` не отключает проверку.

Persistent enabled policy сохраняет исходную явную авторизацию и допускает
будущую автоматическую уборку только точного owned disposable profile либо
подтверждённого never-admitted startup. Она не распространяется на primary AE,
AME project window или неизвестные процессы. Поддерживаемые команды остаются
`status`, `ensure-bridge`, `restart-bridge-once`, `shutdown-bridge-once` и
`cleanup-fixtures-once`; последний ограничен указанным run и его owned fixtures.
Границы policy, source pins, protected inventory и UNKNOWN guards сохраняются.

`loadCurrentDaemonRegistration(root,actual)` возвращает frozen projection
`{generation,bootNonce,reservationSha256,startupTicketSha256,kernelIdentity,argv,
sourceSha256,serviceStartedAt}`. Actual содержит pid/argv/sourceSha256/generation/
bootNonce и, если доступно, serviceStartedAt. `registerCurrentDaemon` принимает
только `{generation,startupTicketSha256}` плюс private actual facts.
`readDaemonRegistration(root)` читает fixed `BASE/current-daemon.json` и добавляет
credentialSha256 из sealed reservation. `assertStartupReservation(root,actual)`
вызывается до listen и возвращает managed/requiresRetainedAdoption. Эти private
JS seams не публикуются как caller authority.

Owned future daemon закрывается штатно. Supervisor открывает и проверяет один
kernel HANDLE до drain, резервирует durable intent, вызывает authenticated
drain-once и shutdown-once, читает durable ACKs, затем ждёт WAIT_OBJECT_0 на том же
handle. Future daemon force отсутствует. Drain deadline оставляет daemon живым
с закрытым admission. Потерянный drain ACK, partial spawn и unknown consume key;
новый UUID или alias ensure/restart не разрешают повтор. Healthy ensure читает
состояние без consuming effect key. Read-back не повторяет effects.

Service использует `BASE/daemon-operation-keys/<hash>.json` и
`BASE/daemon-operations/<operationId>/{intent,drain-ack,shutdown-ack}.json`;
supervisor — `supervisor-operation-keys`, `supervisor-operations`,
`daemon-launch-keys`. Keys создаются wx/fsync до effects и не удаляются.
Observed exit-result fsync выполняется до следующего await; subsequent отказ
policy сохраняет positive proof в unknown. Данный exit не доказывает выполнение
native AE mutation или освобождение retained admission.

## Подготовка root legacy migration

Distinct root profile `BASE/profiles/bridge-daemon-migration-v1.json` содержит
следующие exact поля. Никакие исторические PID не зашиты в product code.

```text
{schema:"ae-agent.owned-runtime-supervisor.v1.legacy-profile",
 profileId:"bridge-daemon-migration-v1", generation:<legacy-cap UUID>,
 issuedAt,expiresAt,authorizationRef,
 daemon:{identity:<lossless kernelIdentity>,argv:<fixed argv>,startedAt,
 loadedRuntimeSha256,port:3456,credentialSha256},
 sourcePair:{loadedSourceSha256,currentSourceSha256},
 sourcePins:[{name,sha256}],
 successor:{generation,bootNonce,reservationSha256,startupTicketSha256},
 launchReceipt:{path,rawSha256,envelopeSha256},
 capsule:{path,rawSha256,envelopeSha256},
 children:[{stageId,launch:{path,rawSha256,envelopeSha256},
 retirementProof:{path,rawSha256,envelopeSha256}}],
 protected:[<fresh lossless kernelIdentity>,...],
 policy:{transition:"native_forced_legacy_transition",waitMs:1..10000}}
```

Требуется ровно два independently pinned original-launch retirement proofs;
R1 shutdown handle result не заменяет original observer. Launch receipt имеет
fixed путь `.codex-runtime/fixture-refusal-lookup-deploy-20261011-r2/daemon-start-result.json`;
capsule — `logs/evidence/native-fixture-retained-maintenance/capture.json`;
child launch/proof — original ledger paths. Raw pins связывают весь файл,
envelope pins — original value. Native original-retirement проверяет общий
pid/createdUnixMs/full birth/image identity, held observer kind/WAIT_OBJECT_0,
целый exitCode и chronology. Дополнительный `process.createdFileTime` в proof
проверяется точно против full 100ns birth; launch row с четырьмя полями остаётся
валидным. Original proof/launch bytes и raw/envelope pins сохраняются.
Original R1 profile и consumed stage journals
не продлевают и не переигрывают. New legacy cap имеет собственный fresh TTL и
source pair. Protected snapshot дополняется actual full kernel identities всех
root обнаруженных primary процессов; caller не добавляет close targets.

Порядок root provisioning после final source freeze:

1. Проверить source hashes, original launch receipt и два original proofs,
   provision fixed policy с исходным persistent human authorization reference.
2. В private ignored provision script вызвать
   `prepareSuccessorReservation(ROOT,{operationId,generation,bootNonce,targetGeneration})`.
   targetGeneration — будущий legacy-cap UUID. Этот export создаёт reservation,
   ticket и immutable `BASE/prepared-successor.json`, без launch/HTTP/close.
3. По returned refs добавить exact prospective owned pair в retained-authority
   до R2 capture. Source pins берутся из sealed reservation; sourceSha256 — digest
   полного evidence module set. Старый loaded runtime pair сохраняется.
4. Выполнить root fresh authenticated R2 capture/read-back brackets и pin весь
   actual capsule. Создать distinct legacy profile с successor refs, actual
   protected inventory и separately retained legitimate launch witnesses.
5. Dry private `loadLegacyProfile(ROOT)` проверяет schema/pins/policy/TTL без
   effects; обычный `status` также не запускает daemon. Затем выполнить
   `restart-bridge-once --operation-id` с тем же operationId из preparation.

Effect sequence: native exact held HANDLE → fresh auth/lease → exclusive intent
и pre-stop inventory → один TerminateProcess по distinct legacy authority →
WAIT_OBJECT_0 и durable exit → immutable final inventory → hidden fixed successor
launch → full birth/image/argv/candidate HMAC → authenticated register с same nonce
→ sealed current registration. Pre-stop quiescence не считается ingress fence;
race cutoff сохраняет UNKNOWN. Original daemon exit является actual barrier.
Новый daemon удерживает write admission закрытым до fresh R2 audit/adoption.
Unknown stop/launch сохраняется для read-back; old consumed transition/helper
никогда не повторяется. TTL не продлевается внутри операции.

`readProtectedInventory(root)` возвращает identities/assertUnchanged из fixed
root migration acquisition. Он не требует актуального source pair после будущего
restart и не выдаёт stop authority. Cleanup reader проверяет эти identities в
kernel заново и добавляет текущий validated managed daemon.

## Автоматическая очистка будущих fixtures и succession

`createFixtureLifecycleController({repoRoot,getCurrentActor,getRuntimeIdentity,
renewRetainedAdmission,assertRetainedAdmission,readNativeResult})` предоставляет
renewAdmission/assertAdmission/registerLaunch/prepareCleanup/finishCleanup и
quiescence. Original runner context и actual ledger.launch hook создают private
memory witness. Durable job/row не восстанавливают этот brand. Prepare выполняет
только journal; finish требует finished canonical envelope, whole raw hash и
private native read-back после inspectResult. Он генерирует fixed
`BASE/fixture-profiles/<runId>/profile.json` typed managed-disposable-fixture
с 1/2 реально registered children, context/canonical/original launch pins,
protected inventory и managedAuthority `{daemonGeneration,bootNonce,
reservationSha256,startupTicketSha256,policyRawSha256,jobPath,jobRawSha256,
registeredStagesSha256,authentication}`. HMAC связывает private origin и весь
profile. Native lease проверяет этот же chain/job/policy и current authenticated
issuer непосредственно перед R1 effects. Historical validator ровно двух children
остаётся отдельным. Новый CLI не принимает generated profile path.

Очистка использует существующий R1 Win32 backend; original observer proofs после
закрытия остаются отдельным требованием. Уже positive original proof пропускает
новый close. Partial child закрывается точно, но остаётся
children_closed_audit_pending. Cleanup/quiescence не освобождает admission без
покрытого audited disposition; неизвестные/unbranded children блокируют shutdown.

Permanent restart создаёт append-only `BASE/daemon-succession/<successor>.json`.
`mintSuccession(root,operationId,successorGeneration)` требует durable positive
operation result, полную predecessor registration и signed exit evidence,
successor reservation/ticket/candidate/registration и fresh policy. Evidence
создаётся до launch: `observed_owned_exit` означает фактический WAIT_OBJECT_0
того же открытого HANDLE без fictional graceful ACK; `graceful_owned_shutdown`
дополнительно связывает durable drain/shutdown ACKs. Обе ветки сохраняют
`supervisor-operations/<operationId>/exit-result.json`, затем immutable
`final-stop-inventory.json` и HMAC `predecessor-exit.json`. Полный outstanding
inventory сохраняет `historicalOutcome:unknown`, `ingressFenced:false` и no replay.

Успешный отдельный штатный shutdown создаёт append-only
`BASE/daemon-verified-shutdown/<generation>.json`:
`{schema:supervisor.v1+".verified-shutdown",targetGeneration,operationId,
predecessorExitSha256,resultSha256,replayAllowed:false,authentication}`.
Следующий ensure проверяет оригинальные registration, ACKs, held exit и result
по этому HMAC receipt до native open/новой reservation. Evidence kind
`prior_verified_shutdown` ссылается на исходный operationId и receipt; gone/reused
PID не открывается и не трогается. Missing/corrupt/UNKNOWN/cross-generation proof
не даёт этой ветки; отказ native open не считается exit. Observe-only shutdown
уже вышедшего процесса не создаёт graceful verified-shutdown receipt.

`predecessor-exit` содержит schema/kind/operationId/targetGeneration,
predecessor refs, sourceOperationId,
`source:{intentSha256,exitResultSha256,drainAckSha256,shutdownAckSha256,
priorShutdownReceiptSha256}`, finalInventorySha256, historicalOutcome/ingressFenced,
replayAllowed и authentication. ACK refs равны null только для independently
observed exit; prior receipt обязателен для prior_verified_shutdown. Полная
подпись не позволяет producer rows с пересчитанным plain SHA создать exit proof.

Amendment HMAC связывает anchor `{retainedManifestRawSha256,
capsuleRawSha256,capsuleEnvelopeSha256,initialGeneration}`, predecessor refs,
operation `{intentSha256,evidenceKind,predecessorExitSha256,sourceOperationId,
source,finalInventorySha256,resultSha256}`, successor refs/source/nonce и
policyRawSha256. Predecessor/successor refs включают nativeCandidateSha256.
Current pointer публикуется только после durable amendment; invalid chain
отвергается до launch, partial/UNKNOWN launch остаётся consumed для read-back.
Original authority,
capsule и receipts остаются неизменными. `resolveRetainedSuccession(root,
pairAnchor,runtime)` проверяет полный linear chain, rejects forks/cycles/orphans/
UNKNOWN и возвращает validated current registration. Amendment не mint-ит lease
или panel adoption; fresh retained/panel gates выполняются отдельно.

Native legacy pre-effect BootstrapIdle использует принятую R1 projection:
terminal `stage:verified` без поля busy разрешён; explicit busy:true и любой
nonverified stage отвергаются даже при busy:false. Эта проверка повторяется
в самом native lease перед effect, отдельно от JS status observation.

Focused offline suite: `node scripts/owned-runtime-supervisor-smoke.js`.
Real own hidden Node suite: `node scripts/owned-runtime-supervisor-native-smoke.js`.
Обе проверки не являются live AE/AME acceptance. Integration-dependent acceptance
выполняется root после независимого review и final source freeze.

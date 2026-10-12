# Initial OWNED: offline-контракт первого поколения

## Назначение и граница
Первый принадлежащий AE Agent daemon новой установки должен иметь собственную
initial lineage, точные разрешения и путь завершения до первого launch. Retained
migration остаётся отдельным контрактом; её history/proofs нельзя изготовить для bootstrap.

Первый implementation scope — изолированная исполняемая модель контракта. Её outputs
помечаются `scope: offline_contract_model`, `productionAuthority: false`. Она не вызывает
процессы/HTTP/AE/CEP/AGY, не читает real config/credentials/history и не подключается
к existing daemon/service/retained branch. Fixture proof не принимается за live evidence.
Реальная интеграция потребует отдельных issuer, fence и Windows lifecycle readers.

## Проверенная граница issuer
- `mcp-adapter.js:176–190`: initialize не сохраняет clientInfo/principal.
- `mcp-adapter.js:153–168`: HTTP payload содержит только name/arguments.
- `mcp-adapter.js:59–72`: общий token и фиксированный marker не удостоверяют чат.
- `owned-runtime-authority.js:29`: authorization reference проверяется по shape.
- `privateFile()` фиксирует bytes/identity файла; это не доказательство его issuer.

Из этого не следует отсутствие любых возможных host API. Следует отсутствие нужного
доказательства в текущем входном тракте. Результат настоящего trusted issuer/verifier
должен поступать по private backend port; входящий tool request не задаёт его identity.
Missing/unavailable issuer закрывает reserve/bootstrap/adopt/read до effects.
Ни JSON, ни env UUID, ни possession общего token, ни lifetime stdio process не заменяют
attestation. Exclusive controller session не называется удостоверенным чатом.

## Threat model
Защищаем переходы от caller-supplied authority, старых receipts, crossed chats/roots,
stale actor/runtime, параллельных controllers, queued work после handover, consumed
launch после смены source/config и потери ACK. Отказываем при неполном state.

Сам по себе модуль в процессе с теми же правами Windows не изолирует злонамеренный
same-user процесс, который меняет код/ключи/backend. Такая гарантия потребовала бы
другой trust boundary. Production issuer должен независимо удостоверять principal,
а code/config pins и private reader placement входят в отдельно проверяемый deploy.
Offline reader является доверенной fixture dependency только в тесте.

## Обязательные инварианты
1. Origin `initial_owned` не содержит fabricated predecessor retirement или original pins.
2. `launchKey = hash(machineId,userId,physicalRootId,installationLineage)`.
   Canonical path проверяется отдельно; его spelling/alias не создаёт новый ключ.
   Source/config/chat/generation меняются только внутри lineage; не дают нового first launch.
3. Один fence охватывает inventory→reserve→launch/register/adopt. Operation-key dedup
   не является fence; CAS/revision и owner epoch проверяются при каждом переходе.
4. Durable launch consumption записывается до modeled effect. Partial/crash/UNKNOWN
   не переигрываются новым UUID, source hash, controller или chat.
5. Bootstrap/read, completion, lifecycle control и execution — отдельные capabilities.
   Initial branch никогда не открывает execution. Boolean OR с retained admission запрещён.
6. Initial teardown не требует живого read lease. Его authority привязана к exact owned
   generation/process/lineage и отдельному immutable teardown grant, а не к произвольному PID.
7. Нельзя начать launch без принятого teardown contract, включая partial registration.
8. Shutdown ACK и отсутствие PID не доказывают exit. Нужен независимый exact held-handle proof.
9. Completion относится к ранее выпущенному immutable ticket. Drain/revoke не создают
   новое разрешение на read; разрешён только terminal result соответствующей операции.
10. Fresh adoption требует связанного status→project→status bracket; drift инвалидирует его.
    Persistent seal не восстанавливает in-memory lease после reconstruction/restart.

## Разрешённые reads
Exact request shape — `{name, args}`; args для обоих инструментов — пустой plain object.

| Tool | До adoption | После adoption | Effects |
| --- | --- | --- | --- |
| get_bridge_status | Отдельный BOOTSTRAP_READ ticket | READ ticket | Status observation/bookkeeping |
| get_project_info | BOOTSTRAP_READ при verified caller/runtime/actor и connected panel | READ ticket | Bounded typed AE project read и associated queue/completion |

Любой другой tool/route, дополнительные поля, Connect/reload/refresh/reconcile,
raw JSX, mutating plan, native child, AME job/export, GET wildcard, annotations или
prefix heuristics не входят в этот allowlist. Disconnect не вызывает auto-connect.
Наличие BOOTSTRAP_READ позволяет собрать project proof до adoption и устраняет circularity,
при этом не открывает execution или произвольное panel control.

## Private backend ports
- Verified caller reader: серверная attestation machine/user/root/chat/controller/epoch,
  issuer identity и срока; не принимает identity из tool args.
- Fence и durable store: canonical scope, owner epoch, atomic revision/consumption,
  exact allowed namespace contents и provenance. Foreign/partial/reparse отказ до effects.
- Runtime/actor reader: exact generation/boot nonce/process birth/image/source/config,
  authenticated panel actor и свежий challenge; cached caller response недостаточен.
- Readiness reader: active tickets, pending/inflight/edit/project lifecycle/bootstrap,
  native execution и отсутствие unaccepted children/jobs.
- Teardown/exit reader: original grant и acquired target identity, closure readiness,
  independently obtained terminal proof. Expired read session не подменяет stop authority.
- Clock: проверяемые expiry/monotonicity и bounded bracket. Rollback не продлевает права.
  Private `readClock()` обслуживает issuer/reads; `readLifecycleClock()` независимо
  ограничивает completion/teardown observation. Сломанный read clock закрывает reads,
  сохраняя original teardown при исправном lifecycle clock. Отказ обоих readers закрывает
  effects; grant/consumed records сохраняются для read-back, без replay.

Модель может использовать только injected fixture реализации этих ports. По умолчанию
не существует real issuer/fence/native provider; unavailable port приводит к отказу.
Схемы backend evidence закрыты, а public API принимает только selectors и read request.

## Namespace contract
Inventory задаётся для каждой фазы. До provision допустима только initial absence;
после reserve — собственные lineage/consumption/ticket записи, после register — связанный
candidate/registration, после drain/shutdown — связанные operation/completion/exit records.
Непустота собственных записей не является поводом для очистки. UNKNOWN и consumed
tombstones сохраняются после source/config/chat changes; historical retained state не
входит в initial inventory. Неполный или чужой record не исправляется автоматически.

## Closed evidence types и операции модели
Ниже поля обязательны; дополнительные keys/getters/symbols и неплоские public args
отвергаются. `Hash` означает SHA256, `Id` — bounded opaque identifier. Сам shape не
удостоверяет issuer. Evidence поступает только из trusted private fixture ports.
Каждый durable record содержит schema/scope/productionAuthority:false; события также
содержат replayAllowed:false. Copy/freeze не заменяет криптографическую attestation.

```text
Principal: issuerId, issuerInstanceId, subjectId, chatId, chatEpoch, transportBindingHash
VerifiedCall: principal, callId, nonce, requestHash, phase, issuedMonoMs, expiresMonoMs,
              revocationEpoch, evidenceScope
Anchor: schema, scope, productionAuthority, origin, machineId, userId, canonicalRoot,
        physicalRootId, installationLineage, anchorId, generation, launchKey, sourceHash,
        configHash, installHash, authorizationHash, clockBootId, createdMonoMs
Authorization: schema, scope, productionAuthority, anchorId, principalHash,
               authorizationId, policyEpoch, capabilities, issuedMonoMs, expiresMonoMs
RuntimeWitness: schema, scope, productionAuthority, anchorId, generation, bootNonce,
                controllerId, heldWitnessId, kernelIdentity, sourceHash, configHash,
                installHash, registrationHash, actor, connected
LifecycleGrant: schema, scope, productionAuthority, anchorId, generation, controllerId,
                preparedGrantId, preparedBeforeLaunch, boundWitnessId, boundRuntimeHash,
                capabilities, validUntil, retired
ReadPermit: schema, scope, productionAuthority, kind, permitId, anchorId, generation,
            principalHash, policyEpoch, revocationEpoch, fenceEpoch, runtimeHash, actorHash,
            requestHash, issuedMonoMs, expiresMonoMs, executionEntitled
Event: schema, scope, productionAuthority, anchorId, generation, sequence, previousHash,
       operationId, attemptKey, operation, outcome, principalHash, runtimeHash,
       lifecycleGrantHash, permitHash, evidenceHash, clockBootId, recordedMonoMs, replayAllowed
```

Kernel identity: pid/birthFileTime/birthUtc/imagePath/executableSha256. Actor:
panelInstanceId/panelGeneration/panelLifecycleEpoch. Principal attestation проверяется
при ingress, enqueue и dispatch; callRef — private transport handle, не claim из tool args.
Callback readCaller связывает phase/request digest и ожидаемый principal. Nonce/call
binding не допускает повторное принятие старого callback в другом запросе.
Reserve и adopt сравнивают `revocationEpoch` между ingress и dispatch; расхождение
отклоняет launch consumption или создание read lease. Caller events сохраняют request
digest как `operationId`, чтобы journal мог проверить зависимости фаз.
После caller bookkeeping обе операции повторно читают clock/fence/inventory и private
caller snapshot, проверяют текущие revocation/expiry и неизменные anchor/authorization
pins до launch consumption или adoption. `adopt` дополнительно проверяет fresh runtime
и status→project→status bracket. Истёкшее во время bookkeeping разрешение не используется.

`LifecycleGrant` готовится до consumption launch и связывается только с witness процесса,
созданного тем же private launcher. До binding он не разрешает остановку произвольной цели.
Он даёт только drain_initial/shutdown_initial/abort_unadmitted/wait_exit, действует до
exact_target_exit_proven. Lease/caller death не отменяют эту отдельную disposition.

| State | Допустимый следующий scope |
| --- | --- |
| UNPROVISIONED | Inspection; никаких эффектов |
| PROVISIONED_NO_PROCESS | reserve после verified caller/authorization/fence/inventory/grant |
| LAUNCH_RESERVED | register того же generation либо original-grant disposition/read-back |
| REGISTERED_CLOSED | Exact bootstrap reads, adopt, drain/teardown |
| READ_SESSION_ACTIVE | Два exact reads, revoke/drain; execution=false |
| DRAINING | Completion ранее dispatched tickets, exact teardown/read-back |
| RETIRED_EXIT_PROVEN | Только read-back; initial launch latch остаётся consumed |
| UNKNOWN_READBACK_ONLY | Factual read-back/completion; original-grant teardown при положительной binding; новая read admission запрещена |

Private операции: reserve/register/invoke/adopt/revoke/drain/shutdown/abortUnadmitted/readBack.
Public invoke не принимает principal/PID/fence/evidence; tickets непрозрачны и принадлежат
одному экземпляру модели. Completion связывает exact dispatched command/request/runtime/
actor/receipt digest; повтор одинакового terminal result — read-back, изменённого — отказ.
`abortUnadmitted` допустим только до любого AE command dispatch, включая bootstrap reads.
После dispatch для того же owned target используется обычный independent shutdown.
Новый fence owner может принимать factual completion/read-back и закрывать reads, но
не наследует lifecycle grant прежнего controller.
`reserve()` фиксирует consumption и возвращает modeled candidate permission;
native launcher отсутствует. `register()` и `readLifecycle` получают только fixture
observations: reader не является скрытым launch/stop effect callback. Число modeled
effects описывает проверяемый переход модели и не доказывает отправку Windows/AE команды.

Runtime witness до panel establishment допускает `actor:null, connected:false`.
Это закрывает reads и исключает panel refs из inventory, но сохраняет held-target teardown.
`actor:null, connected:true` — невалидное evidence. В isolated model actor фиксируется
в initial runtime witness для generation; drift отклоняется до enqueue/dispatch/adopt.
Permit `runtimeHash` и `actorHash` связаны именно с этим durable witness. Согласованная
подмена permit и связанных событий на иной digest не проходит reconstruction.
Замена actor в том же generation требует отдельного reviewed observation contract;
текущая модель такого перехода не создаёт.

Если первый launch observation не дал witness, поздняя положительная observation может
только связать original grant с тем же consumed launch. Она не открывает admission и
не меняет первоначальный UNKNOWN; повторный launch отсутствует.
Повтор `register()` в unbound `launch_unknown` вызывает только private
`observe_original_launch`, связанный с exact consumed launch event/operation ID.
Положительный same-launch witness добавляет отдельный `launch_bound:BOUND` и bound copy
исходного prelaunch grant. Отрицательная observation оставляет target unbound;
чужие generation/controller/pins отвергаются. После binding повтор register — read-back.

Read dispatch сначала durable consumed attempt, затем свежие clock/fence/inventory,
caller/revocation, permit/lease, runtime/actor и readiness guards. Drift возвращает
`UNKNOWN_READBACK_ONLY`, `modeledEffects:0`, не выдавая второй dispatch. Когда held fence
и store позволяют, добавляется отдельный `dispatch_unknown:UNKNOWN`; исходный dispatch
не переписывается. Lost ACK/partial publication дают zero-effect publication UNKNOWN.
Если UNKNOWN event нельзя опубликовать, unresolved dispatch latch всё равно закрывает
admission после reconstruction до exact factual terminal completion. Уже опубликованный
UNKNOWN сохраняется и после completion; independent teardown остаётся отдельным путём.
После `stop_reserve` teardown также перечитывает lifecycle clock/fence/inventory,
положительный same-target authorizer, same-controller grant и readiness до modeled stop.
Drift даёт consumed UNKNOWN с zero modeled effects. Если terminal event нельзя
опубликовать, unresolved stop latch восстанавливается как UNKNOWN и допускает лишь
original factual observation; повторный stop не выдаётся. Exit/completion не зависят
от живого read issuer/lease и сохраняют собственный lifecycle clock contract.

Store atomicAppend проверяет expectedHeadHash + stableAttemptKey + sequence под held fence;
fence owner/epoch записан в backend и меняется при reacquire. Старый lease не восстанавливается
из событий. Reserve/stop consumption fsync/CAS должен предшествовать effects в future backend.
В offline store это только проверяемая модель ordering, не Windows durability proof.

Journal принимает закрытый словарь operation/outcome: caller phases/VERIFIED,
launch_reserve/CONSUMED, launch_ack/ACK, launch_unknown/UNKNOWN, launch_bound/BOUND,
два exact enqueue/QUEUED, dispatch/DISPATCHED, dispatch_unknown/UNKNOWN,
completion/COMPLETED, adopt/READ_ONLY, revoke/REVOKED, drain/DRAINING,
stop_reserve/CONSUMED, stop_ack/ACK, stop_unknown/UNKNOWN и exit_proven/EXIT_PROVEN.
DISPATCHED здесь обозначает consumed attempt, а не native/AE evidence.
Проверяются зависимости launch→binding, enqueue→dispatch→completion,
completed status→project→status bracket→adopt, drain→stop consumption→stop outcome,
bound held target→factual exit. Отбрасываются unused/duplicate grants и permits,
чужие principals, неверные command/request/runtime/actor links и переходы через
drain/revoke/retired barriers. Одного hash-valid chain для acceptance недостаточно.
Enqueue требует authorization capability и connected/non-null durable actor; adoption
требует отдельной READ capability. Caller/read/launch-consumption/adopt events проверяют
authorization time и initial clock boot; dispatch также проверяет permit issue/expiry.
Bootstrap bracket для adoption сохраняет одну clock boot continuity. Factual completion,
teardown и exit не получают read TTL/boot gate.
Каждый reserve/enqueue/dispatch/adopt потребляет собственные неиспользованные phase
proofs в правильном порядке; proof от предыдущего запроса того же tool не заменяет
новый proof. Caller evidence digests уникальны, а их attempt keys вычисляются из exact
lineage/evidence. Дополнительный случайный attempt key не разрешает replay одного nonce.
Post-consumption `caller_dispatch` принадлежит текущему unmatched command того же
request и сразу помечается использованным final guard. Он не разрешает другой заранее
queued ticket того же tool после completion первого command. Пока dispatch unmatched,
journal закрывает новые enqueue/dispatch/adopt; factual completion и lifecycle drain
сохраняются. Два заранее queued tickets могут последовательно выполнить собственные
dispatch/completion с раздельными новыми phase proofs.
Factual exit может наблюдаться без stop request, если исходный exact bound target
завершился самостоятельно; произвольный exit event до consumed launch/binding запрещён.

Clock bootId фиксируется в anchor/events; rollback или boot change закрывают reads,
новый epoch не восстанавливает старую lease. TTL модели: lease60s, call/ticket/command30s,
fresh adoption bracket30s, drain/exit observation budget10s. Expiry не отменяет original
bound teardown grant, но не является разрешением повторить consumed shutdown.
Разделение clock ports — требование к private backend модели, не утверждение о двух
независимых Windows time sources. Их реальную доступность и continuity проверять при интеграции.

Lost launch/register ACK и partial publication сохраняются как UNKNOWN. Один заранее
precommitted guardian может продолжить ещё не использованный retirement effect только
по положительному same-held-target binding. Lost shutdown ACK не создаёт второй stop;
positive exit добавляется отдельным factual event без переписывания original UNKNOWN.

Namespace registry включает initial anchor/events/permits; daemon reservation/ticket/
candidate/registration/pointer; panel transport/index/checkpoints; plan-run records;
fixture ledger/roots/completions/jobs; retained/migration/succession records. Для каждой
группы fixture inventory проверяется по exact own refs/допустимой фазе. Физическое Windows
перечисление всех этих domains и native fence остаются отдельной integration приёмкой.

## Условия дальнейшей интеграции
До wiring в existing service/daemon потребуются genuine issuer evidence, native canonical
fence/durable store и Windows teardown proof, review точных effects и retained regressions.
Новый schema/model receipt не является policy/manifest/capability текущего runtime.
Read acceptance отдельно проверяет настоящий ответ AE; дальнейшие native/AME lifecycle
и два видео остаются отдельными этапами. Текущий immutable transfer package не меняется.

## Связь с ревью
R1 закрывается требованиями independent initial teardown до launch; R2 — точным private
issuer boundary и fail-closed unavailable, без заявления о готовом real host issuer;
R3 — exact read allowlist и раздельными capabilities; R4 — stable lineage/fence/revision
и per-state namespace inventory. Исполняемая модель и adversarial tests должны проверить
эти инварианты до приёмки offline milestone. Live-proof gaps сохраняются явно.

Первое source review: **REVISE**. Воспроизведены восемь случаев: physical key/alias,
late original binding, null panel actor, controller handover, phase revocation,
post-consumption dispatch drift, semantic-invalid journal и поздний abort.
Smoke первого прохода48 не покрывал их; приёмка требует исправления и повторного review.

## Исправления M1–M8 — source candidate, 13 октября 2026
В трёх isolated JS-файлах внесены physical launch key, observational late binding,
nullable actor, same-controller lifecycle guard, phase revocation checks, fresh final
dispatch guards, journal grammar и запрет `abortUnadmitted` после любого dispatch.
`node scripts/owned-runtime-initial-contract-smoke.js` — **PASS150**, включая исходные48
и адресные M1–M8 regressions: aliases, late original/foreign witnesses, null actor,
handover после factual completion, post-consumption drift/partial publication,
coherent forged runtime/actor/capability permits, clock/expiry и phase/nonce journal
replay, stale reserve/adopt bookkeeping, fresh stop guards и bootstrap/adopted abort.

Own review сохранённого source дополнительно воспроизвёл handover после `stop_reserve`:
старый frame допускал modeled shutdown observation до позднего отказа store fence.
Окно исправлено свежими lifecycle guards и адресными handover/epoch/readiness/inventory/
clock/held-target tests. Независимое review промежуточного candidate также обнаружило
stale reserve/adopt и semantic journal gaps; они закрыты и включены в PASS150.
Последний queued-two repro также закрыт: final guard первого command не заменяет
удалённые pre/post proofs второго; forged enqueue/dispatch при unmatched command
отвергаются, genuine queued-two serial reads проходят.
Syntax трёх JS, `npm.cmd run check:rules` и diff checks выполняются по текущему scope.
PASS150 остаётся fixture validation до финального independent GO; source acceptance
и любые native/live permissions из него не следуют.
Все результаты имеют `productionAuthority:false`, `liveProof:false`; genuine issuer,
native physical root/fence, durability, Windows exit и настоящий AE read не проверены.

# Initial OWNED: локальный оператор и управляющая сессия

13 октября 2026. Архитектурное решение по согласованному пересмотру: локальная
управляющая сессия и документированные Windows APIs вместо genuine Desktop-chat
issuer и ProcessDeviceMap. **Контракт разрешает bounded реализацию; production
registration/admission пока отсутствуют.** Следующий implementation — L1.

## Решение и граница доверия

Один профиль local_operator/controller_session. Authority source — явно provisioned
локальная политика оператора + проверенные OS user/installation/physical-root pins
+ exact живой stdio/controller transport. Обязательный публичный результат:
authorityMode=local_controller_session, genuineChatIdentity=false.
Один stdio-процесс может обслуживать несколько Desktop-чатов. Этот контракт
**не обещает cross-chat isolation**: политика разрешает ограниченные операции по
этому доверенному локальному транспорту; request/plan serialization и gates сохраняются.
UUID, clientInfo, env, общий token/marker или JSON receipt не являются authority.

Для этого профиля genuine-chat prerequisite из [initial contract](owned-runtime-initial-contract.md)
и [integration evidence](owned-runtime-initial-integration.md) заменён данным решением.
Offline v1 не становится production: chatId/chatEpoch не заполняются local IDs; retained history/pins не фабрикуются.
Initial lineage, launch consumption, M1–M8, noReplay, phase/revocation checks,
independent exact-target teardown и server-enforced typed/CEP/project gates сохраняются.

Trust model: установленный Windows, trusted same-user оператор, проверенные code/private
provisioning; stale requests, обычные competing controllers, namespace replacement,
reparse/races, crash и lost ACK должны закрываться. Hostile same-user/admin/kernel,
внешнее удаление/whole-volume rollback и доказанная power-loss durability вне гарантии.
Политика честно означает локальное согласие; audit reference не доказывает chat/human issuer.
Frozen intake и user assets вне implementation. Новые provider/SDK системы не нужны.

## Provisioning и точная сессия

1. Доверенный fixed local entry point однократно открывает установленную AE Agent root,
   проверяет source/install pins, получает canonical Volume GUID path, serial64/FileId128
   и SID из OS token. Drive spelling — только fixed enrollment locator; runtime его
   не принимает. Это текущие original enrollment observations, без historical pins.
2. Bounded inventory проверяет предусмотренные initial/daemon/panel/plan/fixture/retained
   namespaces. Foreign/partial/legacy state не очищается и не скрывается новым каталогом.
   Под continuously held witnesses create-if-absent создаёт fixed installation/policy,
   empty lock и journal; original lock FileId pin обязателен. Subsequent genesis/policy
   writes — под kernel fence. Partial/unknown provision закрыт, повтор только read-back.
3. Installation ID/lineage/root/lock/journal pins неизменны; policy отдельно содержит
   enabled, policyEpoch, capabilities и session/lease limits. Source/config/new policy/
   controller/UUID не дают нового first launch. Retained policy не конвертируется.
4. Adapter активирует один broker для exact local profile. Initialize/tools-list/status
   не запускают daemon. Первый named ensure_owned_runtime_daemon с empty args вызывает
   private reserve; missing/disabled/ambiguous profile fail closed, без другого origin.
5. Broker binds original controller process HANDLE, birth/user/image и исходный private
   channel свежим random nonce. PID только private initial locator, дальше нет reopen
   по PID как proof. Adapter отдельно отслеживает lifetime исходного MCP stdin.
   EOF/error/closure permanently revoke эту session. Новый канал не оживляет старую.

Broker — один native process на controller lifetime: владеет root/fence/store и original
lifecycle grant; adapter — один активный tool controller. Daemon↔broker phase verification
идёт по private local named pipe с явной DACL/remote refusal и OS peer PID, связанным с
original held process/birth. Adapter↔broker проверяет original controller HANDLE/birth;
daemon↔broker — original daemon HANDLE/birth и exact launch generation. Controller PID
не сравнивается с daemon peer PID. Pipe name/callRef — locator. Default ACL неприемлема:
[pipe security](https://learn.microsoft.com/en-us/windows/win32/ipc/named-pipe-security-and-access-rights),
[peer query](https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-getnamedpipeclientprocessid).
SID берётся через [GetTokenInformation](https://learn.microsoft.com/en-us/windows/win32/api/securitybaseapi/nf-securitybaseapi-gettokeninformation).
Один helper; public MCP не принимает PID/root/policy/evidence; channel binding сначала проверяется на synthetic processes.

## L1: closed schema и private verifier

Новый mcp-server/owned-runtime-local-session.js, schema ae-agent.owned-runtime-local-session.v1.
Runtime scope local_controller_session; offline tests имеют отдельный scope и
productionAuthority:false, production ports L1 unavailable. Private factory выдаёт
непрозрачные in-memory references; сериализованные ID/hash их не восстанавливают.

| Closed type | Обязательные поля |
| --- | --- |
| LocalPolicy | schema, source=local_operator, installationLineage, userSid, rootPinsHash, policyEpoch, enabled, capabilities, maximumSessionMs, maximumLeaseMs, authorizationAuditReference |
| LocalPrincipal | kind=local_operator, installationLineage, userSid, brokerInstanceId, controllerSessionId, controllerEpoch, controllerWitnessHash, transportBindingHash, policyHash |
| LocalCall | principalHash, callId, requestHash, phase, phaseNonce, policyEpoch, revocationEpoch, issuedMonoMs, expiresMonoMs, controllerSessionId, daemonGeneration, fenceEpoch |

Adapter canonicalizes exact typed {name,args} один раз и создаёт private callRef.
Read request helper принимает только get_bridge_status({}) и get_project_info({});
ensure/bootstrap имеет отдельную closed branch, не расширяет read allowlist.
Call evidence выдаётся только private verifier для живой trusted transport session:
- Ingress до generic handler/effects: exact request digest, policy, live controller/channel,
  expiry/revocation. Caller RPC ID не authority.
- Enqueue: fresh те же bindings + held fence/generation/actor/readiness, без cached ingress.
- Dispatch: durable consumption, затем повторный fresh guard после bookkeeping и прямо
  до доставки. Drift после consumption оставляет UNKNOWN, zero new dispatch/noReplay.

У каждой фазы свежий одноразовый nonce и short monotonic expiry; wrong phase/body/session/
epoch/runtime, replay, clock rollback, EOF и queued-after-revoke отказываются.
Bounded ledger overflow закрывает новые calls, unresolved consumption не вытесняется.
Короткие call/ticket/bracket пределы — существующий initial-contract.js:TTL.
Общий bridge token/marker сохраняют только транспортную роль; private phase fields
не попадают в tool args/public status/logs.

## Общая длительность и READ authorization

Production maximumSessionMs — независимый local longrun предел до 8 часов; maximumLeaseMs <= 60000.
Общий monotonic deadline фиксируется при открытии; renew, token/activity и completion его не сдвигают.
READ expiry даёт REVALIDATION_REQUIRED и закрывает новые READ/dispatch; это не EOF/revocation.
До общего deadline непрерывный original controller/channel/fence при тех же generation,
policy/actor и quiescence проходит отдельную closed BOOTSTRAP_READ ветку status→project→status.
Свежий adoption bracket выдаёт private ReadAuthorization с новым lease epoch и expiry
min(now + maximumLeaseMs, original session deadline); прежние permits/bracket недействительны.
Hash связывает original controller/fence/generation/actor, policy/revocation epochs, bracket
и сроки. Новый actor, drift, UNKNOWN, overflow, revoked/expired session исключают renew.
Original principal/launch key/grant сохраняются. Dispatch/completion не продлевают execution grant.
Первый panel bootstrap может длиться >60s по original bounded panel grant; one-time actor
observation и fresh bracket затем дают READ. Exact dispatched job может завершиться после
READ expiry по original completion/lifecycle contract; completion не разрешает новый export/replay.
L4 вводит explicit schema ae-agent.owned-runtime-local-session.v2 и private ReadAuthorization;
closed READ LocalCall требует readAuthorizationHash. Offline L1 v1 (PASS106, <=60s, noRenew) неизменен и без этой отдельной реализации не подключается к production.

## Canonical native surface и конечная acceptance

Private factory получает один original pinned \\?\Volume{GUID}\ directory anchor +
single components. Runtime drive/UNC/SUBST/device/ADS/mounted-folder/override inputs
отсутствуют. GUID — locator; одному volume могут соответствовать несколько GUID paths.
Physical root key использует serial64+FileId128 внутри fixed installation; canonical
path — отдельный pin, FileId не вечная lineage. Основания:
[volume naming](https://learn.microsoft.com/en-us/windows/win32/fileio/naming-a-volume),
[FILE_ID_INFO](https://learn.microsoft.com/en-us/windows/win32/api/winbase/ns-winbase-file_id_info).

Переиспользовать OpenRoot/RelativeOpen/DirectoryIdentity/LockIdentity/TryAcquire/LiveCheck,
move-only RootLease/FenceLease. Новый private canonical factory минует QueryDosDevice/
drive classifier. Local NTFS, successful queries, no-follow каждого component,
no reparse/offline/recall/case-sensitive, held ancestors без SHARE_DELETE; fixed
original empty regular single-link lock с ShareAccess=0. Root/lock original IDs и
fresh attributes обязательны до positive witness/effect. API:
[NtCreateFile](https://learn.microsoft.com/en-us/windows/win32/api/winternl/nf-winternl-ntcreatefile),
[sharing](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-createfilew).
WRITE_DATA open не WriteFile; metadata-only opens не считаются kernel exclusion.

Новая matrix: canonical_pinned_local_root_v1. Parent сообщил прежние 77 PASS/0 FAIL/3 UNVERIFIED, 101 children CLOSED, timeout/PASS150; здесь не повторены.
Старые SUBST/file-symlink/ambient unsupported-query cases остаются UNVERIFIED расширенного
прежнего профиля. Пересмотр принимает следующий finite mandatory набор:

| Свойство | Required evidence |
| --- | --- |
| Private canonical factory/original root+lock+journal pins | Fresh positive native IDs; wrong root/GUID/ordinary replacement refusal; public selectors/drive input отказ до opens/effects |
| Same physical root/two controllers/release/EOF/crash/reacquire/stale/cross-ref | Fresh kernel exclusion/exact exit на own temp roots; новый factory path требует нового receipt |
| Ancestors/races/reparse components | Старые actual junction/race PASS сохраняются; изменённый canonical traversal проверяется fresh без weakening |
| Fixed lock replacement/hardlink/nonempty/directory/delete/rename | Native refusal/no publication/private writes; replacement не переиздаёт original pin |
| Lock reparse property | Own junction по fixed lock basename, independently held no-follow HANDLE, actual REPARSE_POINT/tag query и LockIdentity refusal. При раннем acquire refusal — test-only exact verifier этого HANDLE |
| File-only reparse/query failure branch | Отдельный pure predicate REPARSE_POINT без DIRECTORY + source review; actual invalid-HANDLE errors и unit unsupported-return refusal, честно отмеченные своим scope |
| UNKNOWN/timeout/cleanup | Same original child/channel reconciliation, no replay/следующих effects до exact exit; pinned cleanup либо scratch сохранён |

Root junction не называется lock-file symlink proof. New lock-junction/native tag +
file-only synthetic predicate дают layered evidence; actual file-symlink end-to-end
при error1314 остаётся непроверенным. Actual error6 + unit failures не доказывают
ambient unsupported FS. Positive baseline требует всех успешных queries на NTFS;
неизвестная query закрывает его. SUBST input отсутствует до effects, DOS alias не нужен.
Не нужны ProcessDeviceMap/PDB/kernel hash/debugger/reboot/privilege changes.

## Store, launch и independent lifecycle

Native broker выполняет fenced IO через same-process serial/non-reentrant WithLiveFence;
CLI check + отдельная Node запись недопустимы. [Durability contract](owned-runtime-initial-durability-contract.md):
immutable no-replace journal, bounded exact inventory, CAS/epochs, pending/floor,
conservative reconstruction, flush/read-back. Test driver floor не production authority.
launchKey=H(localInstallationId,userSid,physicalRootId,installationLineage);
source/config/controller/generation/request UUID/spelling не меняют key.

No-replace launch tombstone и prepared original lifecycle grant фиксируются до
CreateProcess. Partial/missing genesis/unresolved intent/consumed latch запрещают launch.
Original returned process HANDLE/birth/image/boot nonce связываются private launcher;
fixed node/source/cwd/argv, без shell и inheritance root/fence handles.
[CreateProcessW](https://learn.microsoft.com/en-us/windows/win32/api/processthreadsapi/nf-processthreadsapi-createprocessw)
даёт original target handles; ACK не exit.

MVP: broker хранит независимые live continuity floor/pending; после потери **всего**
original broker continuity positive recovery/admission/takeover не реализуются.
Только factual read-back/closed state, без нового launch/PID adoption/stop.
Process-crash consumption проверяется; power-loss/volume rollback не доказаны. Future recovery требует отдельного grant/floor contract;
для двух последовательных вариантов достаточно одного непрерывного controller.

Cancel/EOF/revoke закрывают new reads/execution/queued tickets; ранее dispatched
tickets получают exact terminal completion. Original broker сохраняет lifecycle grant
при смерти adapter/истечении read policy, но teardown требует lifecycle clock, exact
held target и pending/inflight/edit/project/native/job/child readiness. До AE dispatch
допустим abort-unadmitted, после — drain/shutdown. Stop consumed до send; unknown только
original observation, не повтор. Original HANDLE [wait](https://learn.microsoft.com/en-us/windows/win32/api/synchapi/nf-synchapi-waitforsingleobject)
даёт independent exit; ACK/missing PID/WAIT_FAILED не PASS. Broker не завершает AE/AME.
Handover не передаёт grant; старый broker завершает свою цель либо остаётся closed.
До сверки fence/unknown новый controller не действует; first-launch latch всегда spent.

## Проектируемый independent successor для закрытого C1 до launch

Этот отдельный контракт принят по разрешённому поручению restore/install;
реализация и native приёмка ещё не завершены. Он не разрешает использовать
существующий provisioner для обхода spent latch. Старые native floor/pending
не реконструируются, old namespace остаётся CLOSED/UNKNOWN с исходными records.

Планируемая optional successor branch того же SetupCreator выдаёт самостоятельный
local_operator grant; genuine human/chat attestation остаётся false. Исторический
tool audit завершения original pair — supplementary evidence, не grant и не fresh
exit attestation нового creator. Новый native creator самостоятельно удерживает
exclusive ORIGINAL old fence и читает exact physical roots/SID/ACL, seal/enrollment
и закрытый journal prefix Genesis(seq1,epoch0) → OwnerEpoch(seq2,epoch1). Partial,
третья запись, неверный hash/pin/lineage/scope или namespace race закрывают branch.
Исторический old source commitment не выдаётся за текущий OldSeal.Fresh после patch.

Shared repository остаётся контейнером исходников: original physical pin,
SID владельца и корректная ненулевая DACL проверяются без запрета всех сторонних
writers рабочего дерева. Private old runtime/journal/setup требуют protected DACL
и отсутствия effective foreign write/delete/ACL-control grants; файлы истории и
intent требуют тех же строгих прав. Intent может наследовать безопасную DACL от
protected runtime. Переименование ancestor сохраняет physical key/intent и
закрывает canonical/pin проверку; оно не разрешает новый grant или удаление intent.

До новых anchor/enrollment effects native делает CREATE_NEW фиксированного
oldRuntime/.initial-owned-successor.intent, flush и same-object read-back.
Ключ связывает SID, physical repository, old physical runtime, installation и
lineage; новый UUID/source/policy/successor directory его не меняют. Любой existing
intent, включая zero/partial/correct, означает consumed/read-back-only. Intent
связывает ровно один новый installation/root/policy и original creator lifetime.
Grant непередаваем, существует в памяти и потребляется тем же creator; JSON не
создаёт и не восстанавливает его. Старый journal не изменяется.

Fresh-install v1 сохраняется. Successor-only seal binding удостоверяет spec/key и
actual intent pin/hash; обычные fresh prepare/seal/runtime gates нового installation
сохраняются. Native runtime читает этот факт, но нового successor grant не выдаёт.
AE/AME, их процессы и пользовательские задания не входят в retirement.

## Server gates и минимальный implementation path

Private record выбирает exact initial_local origin; mixed/unknown fail closed.
Нет boolean OR с retained admission. Bootstrap/read/completion/lifecycle/execution
раздельны. Exact initial reads: get_bridge_status({}), get_project_info({});
alternate GET/dev/raw/panel/render routes закрыты до handler и actual enqueue/dispatch.
Actor=null/disconnected сохраняет teardown, закрывает AE reads. First panel establishment
— существующий typed bootstrap с отдельным panel grant. Actor=null→first actor фиксируется
однократной private durable append-only observation под held fence для того же runtime;
original target identity/generation/boot nonce и lifecycle grant не меняются. Переход
инвалидирует прежние permits/bracket, затем нужен fresh status→project→status.
Вторая actor replacement запрещена даже после stale/disconnect: first-actor latch не
сбрасывается. Старый offline immutable-actor model не подключается напрямую к production.
READ adoption не открывает execution: library/build/propose/dry-run, CEP autonomy,
protected save/raw/destructive/project/native export gates остаются обязательными.

| Этап и ownership будущего writer | Приёмка/следующий gate |
| --- | --- |
| **L1 сейчас:** новый mcp-server/owned-runtime-local-session.js + scripts/owned-runtime-local-session-smoke.js; pure exact/hash/request/ready/TTL reuse, без daemon/config/native changes | Closed schemas/private verifier; forged/replay/phase/hash/expiry/drift/EOF/revocation/overflow tests; production unavailable. Independent scoped review; первый обратимый commit parent |
| L2: native/owned-runtime-initial-fence/fence_win32.h/.cpp, test entry, scripts/owned-runtime-initial-fence-proof.ps1 | Private canonical pinned factory/original lock pin/property proof; fresh revised native matrix. Existing test-only guard не снимать; legacy UNVERIFIED сохранить |
| L3: planned native/owned-runtime-initial-durability/* + proof driver; native/owned-runtime-local-session/local_session_win32.h/.cpp, local_session_main.cpp/project | Agreed same-process facade/store; fixed enrollment/private channels, synthetic held-target lifecycle, crash/cancel/late-guard/two-controller proof, без daemon/AE |
| L4: новый mcp-server/owned-runtime-initial-runtime.js; exact branches в owned-runtime-supervisor.js, owned-runtime-service.js, mcp-adapter.js, bridge-daemon.js | Async native gate/phase seams/allowlist/lifecycle split; production v2 + ReadAuthorization hash; >60s first panel/job completion при закрытых новых READ, fresh bracket renew после 60s и отказ старым permits; repeated renew не сдвигает original fixed session deadline, maximumSessionMs <= 8h; после configured deadline renew запрещён; EOF/revoke/drift/UNKNOWN/overflow отказываются. PASS150 + bounded retained regressions; offline fixture не async production wiring |
| L5: fixed scripts/owned-runtime-local-provision.js вызывает native enrollment, не пишет fenced records из Node; parent sole config/native controller | Reviewed source/install pins; actual first registration initial_owned/local_operator/genuineChatIdentity=false/execution closed; approved panel grant + fresh reads |
| L6: existing typed execution/export + separate local project/plan execution grant | Actual comp/layer/variant/settings preflight; два sequential DXV3 High Quality alpha outputs, media read-back и восстановление enabled state |

Не переписывать retained helpers/pins; не добавлять generic SDK/provider/frozen intake work.
Каждый этап — bounded review/checkpoint parent; consumption не отменяется откатом code.
L1 не ждёт L2/L3 и ничего не запускает. Для поздних native/daemon effects сначала принимается
точная implementation/proof; новых user confirmations уже согласованного local profile нет.

**Registration без внешнего host API достижима после L1–L5.** Конечные текущие gaps:
local verifier, private canonical factory, same-process durable broker/continuity,
original-target lifecycle и server wiring. Genuine host profile отдельно, не prerequisite.
Token-as-chat и adapter-memory/lockfile-presence варианты отвергнуты: неверная authority/
нет kernel fence и independent disposition. Выбран один broker вместо нового host/SDK.

Evidence: targeted initial/model/service/supervisor/authority/adapter/fence reads и official API docs. При failure вернуть error/evidence соответствующего
этапа; не расширять kernel/host/privilege scope. В этом блоке изменён только документ,
без MCP/AE/native/build/keys/config/deps/Git; rules/diff validation выполняет parent.
Role configured Sol 6.1/xhigh; effective runtime model/effort не утверждаются.

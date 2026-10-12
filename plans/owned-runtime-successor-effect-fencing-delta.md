# Prospective successor: минимальный effect fencing delta

Дата: 2026-10-12. Статус: архитектурный proposal для отдельного review и реализации;
effect enable и live restoration ещё не подтверждены. Этот файл дополняет
[основной контракт](owned-runtime-source-unknown-disposition-contract.md) из
checkpoint `99bbbcb`, не меняя его и immutable v1 operation/review.

## Решение и граница

Сохранить observation-only checkpoint с effects OFF. Следующий reviewed scope —
prospective `current_source_quiescent_successor`: новый distinct operation под
новым sealed v2 review, full current preservation, один deploy/launch и
native-owned pointer publish. Старый UUID `5e1210de-30a6-4655-97e1-49d26930c06e`,
UNKNOWN, key, partial archive и historical outcomes остаются неизменными.
Новая current quiescence не доказывает historical exit, execution или no-effect.

ROOT: `C:/Users/Ant/Documents/Codex/AE_agent`; oldstage:
`C:/Users/Ant/.codex/worktrees/daemon-cold-recovery/AE_agent`; newstage:
`C:/Users/Ant/.codex/worktrees/cold-budget-disposition/AE_agent`.
Frozen intake, providers, зависимости, credentials и пользовательские AE/AME
assets не входят в delta. Старый stage не записывать; его entry fencing использует
только held handles. Root остаётся единственным live controller, один writer — в
newstage. Этот packet создаёт только документ, без live действий.

## Code mapping и работоспособный startup

Basis — committed `4050286`, отдельно frozen `8e256004d17d2a72d8a0a14482d210eeb57d131a`.
Mutable source implementer не является основанием этих выводов.

| Actual path | Что требуется сохранить/добавить |
| --- | --- |
| `owned-runtime-supervisor.js:358–375`: cold `session.launch`, authenticated `/dev/status`, `/runtime/owned/register`, status, same-handle `wait` | Всё выполняется при held cold controller; ordinary win32 backend/open не вызывается. Returned cold launch handle dispose не освобождает owning session. |
| `owned-runtime-supervisor.js:53–75`: startup assertion, register, load registration | File/schema/HMAC/policy/source checks; native process open отсутствует. `bridge-daemon.js:117/8589/8626` выполняет source hash, startup assertion и registration. |
| `owned-runtime-supervisor.js:561–563`, `owned-runtime-win32.js:21–30` | Policy/image/helper pin checks до spawn. `win.verifyPolicy()` при cold session creation читает pins, не выполняет win32 open. |
| `owned-runtime-daemon-helper.ps1:170/317`, `review-evidence.js:188–200`, supervisor93 | Полный runtime79 читается через SourcePins/runtimeIdentity до launch и при startup. ROOT win32/startup/maintenance helper входят в set: evidence155/159/161. Их нельзя оставить FileShare.None при обычных полных source checks. |
| Helper `ColdNormalGate:286–291`, dispatch307 | Новый и frozen-stage daemon helper приобретают Global per-root mutex до normal entry; installed replacement закрывает fresh ROOT lifecycle entry. Original ROOT raw helper `38c34…be9` этого gate не имел. |
| `owned-runtime-win32-helper.ps1:335–377` | Ordinary open/inspect/graceful/force пока не используют общий mutex; добавить mandatory shared controller/private-lease gate. |
| `ae-agent-panel-bootstrap.js:124–128/195–201/236–237` | AE вызывается непосредственно JS spawn, также возможен CDP reload. Это обходит win32 helper; существующий service.lock/wx gate пригоден для physical fencing. |
| `bridge-daemon.js:13089/13096/22805–22808`, `owned-runtime-cold.js:167–205` | Новый cold official route остаётся observation-only, с latched binding и без normal fallback. Это не proof fencing уже загруженного normal producer. |
| `mcp-adapter.js:121/153–158` | Autostart идёт через supervisor; panel-control route autostart пропускает. Adapter сам не создаёт normal bootstrap service. |

На проверенном startup path вложенной mutating зависимости нет. Поэтому новый
win32 gate может отказать ANY ordinary win32 open, включая inspect, пока cold
owner удерживает mutex. Reentrancy override, caller boolean и исключение по PID
не нужны. Full guard refresh, ordinary Connect и project read выполняются после
confirmed publish и disposal controller; прежние eligibility/authority gates
сохраняются. Startup status/registration не выдают write admission.

Если реализация добавляет nested open/cleanup, это новый конкретный gate gap:
отказать до эффекта и проверить call chain. При доказанной потребности допустим
отдельный closed read-only factual RPC самого owning helper: только query/wait
rights, без TERMINATE, WM_CLOSE, launch/fixture, write и effect escalation; его
response не authority. Для данного mapping такое расширение не требуется.

## Ownership, review v2 и pins

| Production file | Ответственность следующего writer |
| --- | --- |
| `mcp-server/owned-runtime-cold.js` | Closed v2 schemas/resolver, review/claim/proof/fence binding, v1 read-back compatibility, original/extended inventory separation. |
| `mcp-server/owned-runtime-supervisor.js` | Explicit successor path, owning producer RPC, source readiness, native publish, no parent publish/retry и post-error dispatch. |
| `scripts/owned-runtime-daemon-helper.ps1` | Genuine closure, controller/lease/bootstrap/stage fences, RW-to-read handoff, preservation, launch и native publish. |
| `scripts/owned-runtime-cold-recovery.js` | Fixed v2 provision/read-back/one-shot selectors, exact scope binding; прежние aliases не выдают successor authority. |
| `scripts/owned-runtime-win32-helper.ps1` | Shared Global/private-lease gate до ordinary native entry и на effect boundary; existing identity/profile/TTL/force guards сохраняются. |
| `mcp-server/owned-runtime-win32.js` | Новая exact POLICY.helperSha256; существующий fixed executable/argv ABI сохраняется. |

Это core4 + два existing файла; новый module/ABI для bootstrap не нужен.
Closed v2 overlay — прежние семь разрешённых names плюс
`scripts/owned-runtime-win32-helper.ps1` и `mcp-server/owned-runtime-win32.js`.
Runtime ordered set остаётся79; `review-evidence.js` не добавляет bootstrap в set.
Если его bytes входят в materialized overlay9, их current reviewed pin сохраняется;
число scope-owned production изменений от этого не расширяется.

Не переписывать v1 overlay7, provision review/authentication или old records.
V2 descriptor/authentication находятся в отдельном fixed successor-review
namespace; parser принимает закрытую версию/точный список names, а не arbitrary
root/path/argv/PID/force. Stage pins, sourceBefore77, ordered sourceAfter79,
overlay9 hashes и checkpoint должны описывать фактические reviewed bytes.
Scope delta требует нового descriptor/authentication, не нового разрешения
пользователя на уже порученное восстановление.

Обновить оба actual fixed references на новый win32 helper raw SHA:
`owned-runtime-win32.js:9` и daemon helper `Config:127`; сейчас оба равны
`eab199fb33e42debc9f1d266711bc0e610bef6bcb57f02d7ed4b92e0618c9f4e`.
После helper изменений обновить supervisor POLICY.helperSha256 и все stage/
overlay witness pins. Credential parser AST остаётся exact pinned parser;
executable pins, config parser и grant TTL не ослаблять.

Sealed review связывает old raw key/intent/UNKNOWN/review/listings, target/refs,
current policy/config/credential fingerprint/anchor, new UUID/epoch/checkpoint,
current authenticated thread UUID и digest принятого «делай» вместе с его планом.
Чужой/current MCP thread ID не подставлять; старый request hash не клонировать.
Policy `owned_daemon_lifecycle` и coverage проверяются заново. Diagnostics и
sidecars не authority. Несовместимость policy — конкретный reviewed gate.

## Continuous entry fencing

Один native owner удерживает Global mutex и private controller lease всю сессию.
Именование Global mutex — тот же SHA256 canonical full-root алгоритм daemon
helper, с одинаковой нормализацией; `WaitOne(0)`, busy/abandoned — отказ.
Нельзя получить независимый namespace из public frame/env. Native owner context
наследуется только внутри своего процесса, а не через caller identity/boolean.

Новый win32 helper приобретает тот же mutex и проверяет private lease **до**
первого ordinary open с native rights, inspect и fixture entry; удерживает до
dispose. Graceful/force повторяют ownership, exact identity, profile source,
protected targets, freshness и existing single-use predicates непосредственно
перед эффектом. Inspect не повышает rights и не меняет capability mode.
Lease sharing проверяется actual handle open, не по существованию filename.
После UNKNOWN mutex release не является разрешением: current consumed/pending
operation или incomplete/UNKNOWN successor chain остаётся read-back-only через
closed authenticated binding checks. Mere absence of current target key/lease
не доказывает completed v2 epoch. Existing successful ordinary v1 behavior вне
cold scope сохраняется; старый consumed v1 target не становится retryable.

Для ROOT fresh retirement/controller helpers fixed old kernel pins отказывают
после installed daemon replacement; такой отказ должен быть проверен до effect.
Независимые oldstage entry files и bootstrap module сохраняют deny-read handles,
когда authorized ROOT startup их не читает. Полный fixed entry matrix включает
controller-helper вне runtime79; отсутствующий s2 helper не считается gate.
Already-loaded ROOT/oldstage/newstage native helpers, bridges, bootstrap runners
и controllers требуют genuine current native closure: exact PID/birth/image/
argv/ancestry и active/inflight work. Unresolved или capable loaded legacy
producer без уже действующего доказанного gate блокирует consume/handoff.
Disk lock/source hash не доказывает loaded implementation; скрытого kill нет.
Старый UNKNOWN сам по себе не active pending.

### Bootstrap service.lock

Официальный normal service выбирает
`(AE_BRIDGE_STATE_DIR || LOG_DIR)/ae-agent-panel-bootstrap/service.lock`
(`bridge-daemon.js:13089`). Новый ROOT launch задаёт LOG_DIR=`ROOT/logs`, но
STATE_DIR может происходить из pinned config (helper130–132/321).
До нового consume native owner фиксирует exact normalized configured paths,
parent identities/reparse status, source/config binding и отсутствие чужого lock.
Пути из historical/loaded runtime допускаются только при закрытом проверенном
binding; произвольные/unresolved roots не превращаются в новые lock targets.
Oldstage fencing не создаёт/изменяет его runtime: использовать deny-read entry
handles и отказ при unresolved loaded producer.

Создать ROOT configured lock через CreateNew, native owner PID, Flush(true),
actual file identity и FileShare.None; держать до terminal session disposal.
Preexisting service.lock — отказ, без stale cleanup/owner takeover. Normal wx
получает EEXIST; его owner-read не проходит sharing, unlink/recreate также
запрещены. Frozen и405 имеют этот gate до native spawn/CDP reload. Lock не
доказывает прошлое bootstrap outcome и не разрешает новый bootstrap attempt.
Cleanup только собственного created handle/object с atomic handle-owned delete
или проверенным DeleteOnClose; не закрыть и затем удалить произвольный path.
При смене identity/uncertainty сохранить fence и отказаться. Own cleanup удаляет
только ephemeral lock, не attempt.json, UNKNOWN или чужую историю.

## Source handoff и native pointer publish

`EXCLUSIVE_DEPLOY → HANDOFF_BLOCKED → READ_FENCED → PUBLISH_PREPARED →
PUBLISHED_READ_FENCED`; uncertainty переводит session в `UNKNOWN_READBACK_ONLY`.
Controller/private lease/bootstrap/legacy entry fences непрерывны. Их проверка
предшествует освобождению первого incompatible source handle.

Initial entry/source handle mode определяется closed v2 overlay: изменяемые
existing files, включая win32 helper, сразу имеют RW/FileShare.None. Нельзя
унаследовать его old read-only entry handle и позже закрыть ради RW upgrade.
На HANDOFF_BLOCKED все effect entries закрыты; held handles фиксируют sourceAfter
raw hashes/native identities, overlay receipts, current source/refs/history,
installed mutex-aware helper+win32 gate pins и genuine fresh closure.
Dispose incompatible ROOT source handles и reopen **весь ordered runtime79**
Read/FileShare.Read под тем же owner. Сверить каждый actual native identity,
raw hash, ancestor/reparse и complete set; повторить private/history/controller
и current witness checks. Только затем authentic READ_FENCED readiness.
Source sharing не является entry exclusion proof. Failure/partial reopen —
UNKNOWN; ни launch, ни queued effects, ни implicit repair не допускаются.

Native owner сам публикует pointer; ACK→parent `publishCurrent()` в этом lane
запрещён. Начать publish phase и monotonic session/budget guards до temp write.
Пока old strict Read/ShareRead handle held, открыть overlapping Read/ShareRead|
ShareDelete handle того же old object; подтвердить native identity/raw digest/
old registration. Без Write sharing. Учитывать все strict aliases в registry.
Под fence записать и flush fixed temp envelope и append-only publish-intent с
old identity/raw, temp identity/raw, new registration/epoch/review/claim refs.
После точной проверки закрыть только strict old aliases; overlapping old handle,
controller/lease/entry/source fences остаются. Один native atomic replace;
проверка freshness/deadline непосредственно перед ним. Reopen new pointer
Read/ShareRead, сверить path/object identity, raw envelope, exact registration,
epoch/chain и private/history pins; сохранить publish receipt и новый read fence
до disposal. Lost ACK/partial publish/failed new reopen — UNKNOWN/read-back,
без повторного rename. Pointer read/delete share сам по себе не исключает
чужой replace: эту роль выполняет непрерывный verified entry matrix/closure.

## Original projection и single-use chain

Original intent history digest:
`4c379f49f620888ce9d923870d4a68055d3b8574242d6ea945d218f6b9fbc926`.
Frozen helper213–224 и405229–240 задают одинаковый recipe: recursive raw hashes
и directory/absent listings для точных ROOT-relative roots:

```text
logs/evidence/plan-runs
logs/evidence/native-fixture-retained-maintenance
logs/cep-panel-control
.codex-runtime/ame-native-fixture-ledger
.codex-runtime/panel-cycle-live
.codex-runtime/owned-runtime-maintenance/daemon-operations
.codex-runtime/owned-runtime-maintenance/cold-lifecycle-journal-authorizations
.codex-runtime/owned-runtime-maintenance/s2-maintenance-retirements
.codex-runtime/owned-runtime-maintenance/s2-maintenance-retirement-keys
```

Затем each existing immediate child двенадцати containers под
`.codex-runtime/owned-runtime-maintenance/`:

```text
daemon-reservations
supervisor-operations
daemon-succession
daemon-verified-shutdown
startup-retirements
maintenance-retirements
historical-sources
profiles
original-inventories
daemon-operation-keys
supervisor-operation-keys
daemon-launch-keys
```

Child directories рекурсивно обходятся, child files хешируются; отсутствующий
container пропускается. Самих parent listings второй группы нет. Original
Sort-Object Name/path и Canon с ordinal object keys/UTF-8 SHA256 воспроизводятся
точно; reparse/invalid kind, depth>12, budget>4096/files>16MiB дают отказ.

Cold operation/key/provision/archives/diagnostics/lease/current pointer не входят
в recipe. UUID5e не исключать. Successor owned-panel listing exclusions применимы
только относительно полных original saved entries и authenticated new generation;
deferred listings не заменяют final digest. Current pure read-only пересчёт дал
842 files/44 namespaces и exact original digest без exclusions. Это observation,
без held snapshot/native authority. Новый genuine producer обязан повторить
digest под fences, сохранить полную original projection отдельно от extended
claim/review inventory и проверять обе перед effects. Partial143 не listings proof;
при mismatch нельзя угадывать фильтр или заменить original digest extended digest.

Old key `a8590b32f7e4f75ebcc9eceb057e2f58aec0f2b7039b8de4e80e5f52b5907fbf`
остаётся immutable chain root. Append-only slot определяется predecessor attempt,
а не новым UUID/review/sourceAfter: один CreateNew+flush slot под тем же controller,
с full old raw refs и new sealed scope/current proof refs. Rooted chain без fork/
cycle/orphan; partial claim после crash блокирует effects. Same/new UUID aliases
не создают retry; v1 provision/ensure/restart/recover aliases остаются read-back.
Unknown любой новой effect phase закрывает текущую сессию, очередь effects=0.

## Required gates и validation следующего writer

1. Observation-only checkpoint и bounded review; затем scoped implementation,
   exact code/pin/schema review v2 и fixed provision PASS. Runtime authority требует
   genuine producer/closure/full preservation, а не AST/mock/checkpoint.
2. Actual Windows temp-FS: initial None блокирует Node read/write/rename;
   HANDOFF_BLOCKED исключает competing entries; полный79 read reopen допускает
   full source reads, запрещает write/delete, сверяет IDs/hashes и reparse drift;
   failed reopen/partial overlay даёт launch0/queued effects0.
3. Actual Windows pointer sharing: strict alias блокирует rename; overlapping
   Read+Delete даёт один replace только после guarded strict-alias disposal;
   temp flush/raw/identity, reopened strict new identity, competing replacement,
   lost ACK и failed reopen; повторный publish=0. Это не mock sharing proof.
4. Actual Windows bootstrap wx: configured/nondefault STATE_DIR, EEXIST owner-read
   sharing refusal, attempted stale-owner unlink/recreate, preexisting foreign
   lock refusal, owned handle cleanup/identity replacement, crash leftovers.
   Native spawn/CDP reload/project read в blocked normal service равны0.
5. Global mutex contention/abandonment и private lease actual sharing на всех
   relevant roots; native fixture/thread tests не управляют AE/AME. Mutating
   win32/fixture entry при held cold owner=0; inspect не escalates rights.
6. Startup call-chain fixture: same cold session launch/wait + file/HMAC/policy/
   source assertion + authenticated status/registration завершаются без ordinary
   win32 open; admission остаётся closed. Nested native call/auto cleanup/gate
   mutation, loaded old producer либо unresolved ancestry приводят к отказу.
7. Claim/fork/alias/partial write races, scope/hash/TTL tamper, after-UNKNOWN
   queued dispatch=0; original key/records/review/archive raw bytes неизменны,
   old digest и extended digest разные bindings; v1 aliases read-back unchanged.

Fixed budgets init30/source120/deploy60/launch30/finalize30/publish30 seconds,
session360, first RPC160 совместимы только при прежних freshness limits:
witness TTL120000ms, census elapsed cap30000ms, reservation/ticket/profile/grant
expiry неизменны. Genuine source witness mint — после фактической fresh closure
и полной preservation, не при transport start; rechecks перед каждым effect.
Negative clock/elapsed expiry до write дают write0, publish0 и unchanged pointer.
Controller lifetime не продлевает grant и не заменяет source/history pins.

## Остающееся evidence и текущая validation

Вывод startup compatibility подтверждён targeted committed reads. Exact original
history observation match выполнен pure filesystem hash, без native/census/live
control и вывода raw config/секретов. Новых authority records не создано.
Actual six-file implementation, новые raw pins, closed v2 review/policy compatibility,
Windows sharing tests и genuine held closure/preservation ещё нужны. При loaded
legacy producer или неполном entry matrix effect enable остаётся закрыт до
конкретного устранения gate gap; этот контракт не выдаёт kill/replay/asset scope.
Markdown validation: `npm.cmd run check:rules` PASS; own-file
`git diff --no-index --check` PASS; trailing whitespace=0. Product/native/live
tests в этом архитектурном блоке не выполнялись.
Правки этого блока ограничены данным новым Markdown; старый packet/plan/code/
runtime/oldstage не меняются. Commit и root milestone запись выполняет parent.

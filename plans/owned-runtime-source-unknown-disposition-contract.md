# Новый successor после source UNKNOWN: ограниченный контракт

Status: ARCHITECTURE MILESTONE COMPLETE after successful corrected contract review. The prior lifetime-handles P2 is closed; no other P1/P2 remains in this packet. This reviewed contract has no implementation authority and does not authorize a live call.
Continuous fencing remains required: source handoff stays off until native IDs/hash/census; pointer publish is native-owned; actual Windows temp-FS sharing tests are mandatory before effects. The old UNKNOWN is not treated as active pending work, and original oldProjection remains separate from extension inventory.
Implementation is separate and currently observation-only with effects OFF in the successor WT. A budget-path parent-publish ordering P2 remains pending; see the maintenance plan for the bounded correction and validation gap. This packet does not close that review or authorize launch.
Production code, old stage/review/key, records and consumed UUID are unchanged by this architecture milestone.



## Решение

Добавить отдельный prospective путь `current_source_quiescent_successor`.
Новый genuine native producer подтверждает текущее безопасное состояние под
удерживаемыми fences; append-only claim допускает ровно одну новую операцию с
отдельными review, scope и UUID. Это не replay, завершение старой операции,
historical no-effect certificate или доказательство старого exit.

Исходный `5e1210de-30a6-4655-97e1-49d26930c06e` остаётся UNKNOWN/noReplay,
target generation `83e86583-fe0c-42a2-975c-0dcc6019504e` и его исходный
`cold-target-keys/a8590b32f7e4f75ebcc9eceb057e2f58aec0f2b7039b8de4e80e5f52b5907fbf.json`
сохраняются побайтно. Старые AE/native/bootstrap outcomes, transport receipts,
retained audit/adoption и write admission этим переходом не урегулируются.

| Вариант | Цена миграции | Failure mode / вывод |
| --- | --- | --- |
| Оставить только read-back | Нулевая | Безопасно; восстановление блокировано действующим consumed target. Это fallback при любом недостающем gate. |
| Снять ключ, сменить target hash по sourceAfter или выдать другой UUID | Малая, но нарушает контракт | Разрешает алиас/replay неизвестного effect; исключено. |
| Признать source UNKNOWN историческим no-effect | Потребует недостающего original producer/terminal evidence | Одна phase/code запись и отсутствие deploy rows недостаточны; сейчас не выбирать. |
| Новый текущий quiescence witness + predecessor claim | Четыре существующих product files и focused fixtures | Выбрано. Fail closed при drift, неизвестном producer, незакрытом controller или неоднозначной цепочке. Старый outcome неизменен. |

## Что подтверждено и чего из этого не следует

Targeted чтение frozen stagedWT `8e256004d17d2a72d8a0a14482d210eeb57d131a`
подтвердило: `ColdBegin` сохраняет source/history и не заменяет ROOT code;
`ColdDeploy` — отдельная RPC после ACK `begin`; source-preservation durable
запись предшествует ACK. Сохранённый native UNKNOWN связан с intent и содержит
`phase:source`, `code:owned_cold_phase_budget`. По supplied forensic evidence
первый `cold-begin` не ACK, `begun=false`; JS не отправлял `cold-deploy`.

Но старый UNKNOWN не содержит producer identity или native child terminal proof.
`ColdUnknown` также доступен через explicit `cold-unknown`, после которого
старый dispatch делает `continue`; его запись сама по себе не является
terminal/no-effect attestation. Recorder доказал terminal exit1 Node CLI PID40016,
а не terminal status его native helper. Отсутствие deploy/launch rows — только
структурная проверка, не самостоятельное доказательство отсутствия effects.

Supplied audit: ROOT77 и source archive77 exact; source-preservation отсутствует;
history archive частичный (143 включённых файла exact), refs archive пуст;
старый pointer, protected4/4 и original refs7/7 неизменны; два новых overlay files
в ROOT отсутствуют. Эти факты полезны для нового preflight, но не создают старый
native witness. Current process absence не становится historical exit proof.

## Новый review и authority binding

Старые `cold-provision/review.json` и `review-authentication.json` не переписывать.
Новый review хранить в отдельном append-only fixed namespace, например
`cold-successor-reviews/<reviewHash>/`. Closed versioned descriptor связывает:

- original review raw/hash, old key raw/hash, полный immutable old operation
  listing и raw/hash intent/UNKNOWN, target generation/registration;
- новый operation UUID, epoch, checkpoint commit и фактические raw code/stage
  pins, exact ROOT77 sourceBefore и только reviewed overlay/sourceAfter;
- текущие policy/config raw pins, credential fingerprint, retained anchor и
  исходные authority refs; действующий `owned_daemon_lifecycle` gate;
- новый scope `current_source_quiescent_successor`, current-thread authority
  reference на принятое поручение «делай» вместе с его контекстом/планом и
  request digest. Старый request hash нельзя клонировать в новый scope.

Parent/provisioner связывает уже данное поручение с конкретным reviewed пакетом;
эта записка не выдумывает новый grant или policy coverage. Несовместимость
существующей policy с новым scope — отдельный explicit reviewed gate, не bypass.
Git commit служит контекстом; byte pins остаются authority. Точные новые hashes
вычисляются после реализации и review, сейчас не угадываются.

CLI выбирает descriptor только из fixed namespace по закрытым UUID selectors.
Не публиковать произвольные review path, root, PID, argv, force или caller boolean.
HMAC использует действующий strict ROOT config reader; diagnostics и transport
sidecars никогда не принимаются как authority. Trust model остаётся private
local operator, без заявления защиты от другого hostile процесса того же user.

## Genuine current-source-quiescence proof

Новый reviewed/pinned native helper в fresh session приобретает тот же
Global per-ROOT controller mutex и private exclusive lease. До первой census
он удерживает entry/source/history/policy/config/current-pointer/registration
handles с объявленными access/share modes. Непрерывными через всю session являются
controller mutex, private lease и проверенное entry/effect fencing; конкретные
source/pointer handles имеют фазовый срок жизни по протоколу ниже. Отдельный
inspect после освобождения fences не является разрешением deploy. Ни `Dispose`,
ни записанный ACK сами по себе не доказывают безопасную передачу защиты.

Proof содержит exact producer helper+launcher kernel identities, code/review
pins, observedAt, completed native census и endpoint result, held mutex/lease,
entry fence identities, relevant-roots digest, source progress 0, exact
current pointer/registration/source/private pins и полный current inventory.
Consumer сверяет producer с фактическим запущенным child/parent, а не с caller
string. Access, enumeration, bind, schema, timeout или unresolved candidate
дают отказ; incomplete observation не превращается в empty inventory.

Relevant closure включает ROOT, original review.stageRoot, новый stageRoot,
фиксированные recorder/old operation/helper paths и известные original launcher
identities. Сегодня `ColdCensus` ищет только ROOT и свой stageRepo: после смены WT
старый stage нельзя считать unrelated. Self/ancestor exclusions основаны на
actual identity и точном reviewed argv; relevant old controller нельзя исключить
лишь потому, что он ancestor нового launcher. Любой живой relevant old helper,
active/pending execution или неразрешимый candidate блокирует новый claim.
Pending здесь означает фактически отправленную/исполняемую работу с возможным
продолжением, active executor или удерживаемый чужой controller. Само наличие
сохранённого predecessor UNKNOWN не является active execution и не блокирует
prospective successor автоматически; оно сохраняется и проверяется как history.
Обычные unresolved guards панели этим определением не меняются. Не закрывать
и не убивать relevant процесс этим контрактом.

Проверить exact ROOT77 raw pins, отсутствие обоих new-overlay files, старый
pointer и original signed refs, config/policy/anchor, все original UNKNOWN keys
и records. `oldProjection` пересчитывается точным прежним snapshot recipe:
те же historical namespace roots, listings, ordering, raw pins и canonical hash.
Его digest до добавлений в historical namespaces должен совпасть с old
intent.historySha256. UNKNOWN не фильтровать ради совпадения; частичный archive
не заменяет это сравнение. После штатных successor additions сохранять точный
original projection по pinned original inventory, с прежними проверенными
правилами descendant additions; не менять old digest.

`extensionInventory` отдельно содержит predecessor key/operation/provision raw
refs и exact новые review/claim/binding/handoff artifacts. Его отдельный digest
связывается новым closed descriptor/proof и preservation metadata; он не
подставляется вместо old history digest. Добавления допускаются только в новых
объявленных namespaces/single-use slots и прежнем normal successor scope;
изменение старого namespace вне этих правил остаётся отказом. Если нужен
composite digest, его schema явно включает оба digest.
Drift/невозможность восстановить inventory — отказ и отдельный reviewed scope.
Current AE/AME census фиксирует также новые пользовательские identities;
AE37220/birth `2026-10-12T04:24:42.662964Z` — supplied protected asset, а не fresh
live proof. Исчезнувшие originals остаются current absent без exit/cleanup grant.

При complete current absence relevant old executors, held mutex+entry fences и
exact state новая операция не требует выдуманного historical child exit. Это
prospective quiescence, historical outcome всё ещё unknown. Если active/pending
old executor обнаружен, переход запрещён до самостоятельного доказанного
terminal/quiescent результата exact child; CLI exit или PID absence недостаточны
для такой historical аттестации.

## Фазовая передача fences: source → launch → pointer publish

Это требования к новому successor lane, а не утверждение, что legacy code уже
их выполняет. В old helper `ColdDeploy` освобождает coldFiles перед launch;
`ColdFinalize` закрывает pointer перед parent `publishCurrent`. Новый lane не
может принимать эти `Dispose` как достаточную передачу authority.

Native session имеет закрытую state machine: `EXCLUSIVE_DEPLOY` →
`HANDOFF_BLOCKED` → `READ_FENCED` → `PUBLISH_PREPARED` →
`PUBLISHED_READ_FENCED`, а при uncertainty — `UNKNOWN_READBACK_ONLY`.
Переходы одноразовые, связаны с operation/epoch/claim/review. Во время handoff
effect dispatch закрыт; ошибка в любой точке даёт UNKNOWN/read-back. Transition
receipts в новом versioned namespace содержат IDs/hashes/access/share modes
before/after. Они подтверждают выполненный переход, но не заменяют фактически
удерживаемые fences, runtime grants или fresh lease.

### Source: EXCLUSIVE_DEPLOY → HANDOFF_BLOCKED → READ_FENCED

1. До и во время deploy заменяемые source файлы имеют actual writer HANDLE
   `ReadWrite / FileShare.None`; immutable history/private pins — совместимые
   read handles. Legacy helper entry deny-read сохраняется до проверки installed
   entry-gate coverage. Каждый reviewed bounded write имеет durable deploy intent,
   expected old native file identity/raw hash, flush и read-back. Source deploy
   остаётся per-file, а не атомарной заменой всего source set; partial write даёт
   UNKNOWN и не replay.
2. До освобождения любого deny-read entry handle подтвердить exact installed
   helper/gate pins и coverage КАЖДОГО fixed entry: actual side-effect path
   либо обязан получить уже удерживаемый per-ROOT mutex, либо существующий
   immutable source/authorization gate гарантированно отказывает до effect.
   `Read / FileShare.Read` запрещает write/delete, но НЕ исполнение читаемого
   script; одно изменение share mode не считается entry fence. Coverage нельзя
   объявить по hash одного daemon helper. Непроверенный legacy entry блокирует
   effect enable; расширение product file scope не происходит автоматически.
3. В `HANDOFF_BLOCKED` controller/lease и доказанное entry/effect fencing остаются
   held. Reservation admission, StartIndependent, publish и повторные source
   writes запрещены. Зафиксировать exact final per-file native identities/hashes;
   лишь затем закрыть writer/deny-read handles и немедленно открыть каждый
   sourceAfter файл `Read / FileShare.Read`, без Write/Delete sharing.
   У `FileShare.None` нет совместимого overlapping read open: физический
   промежуток существует. Его safety обеспечивают закрытый effect dispatch,
   held controller/entry gates и обязательный повторный контроль после reopen.
4. Все reopened handles сверить по native identity, full raw hashes,
   containment/reparse/hardlink rules и exact sourceAfter. Writer, replacement,
   missing file, sharing violation или identity drift дают отказ, даже если hash
   совпал. До acquire/recheck ВСЕГО набора launch недопустим. Затем повторить fresh
   census/endpoint/private/history checks и лишь после них перейти в
   `READ_FENCED` с новым authentic witness при прежнем TTL.
5. Read fences разрешают обычные Node source hash/module reads и запрещают source
   write/delete; они held через startup/registration/finalize/publish. History и
   private immutable pins остаются read-fenced. Node actual source reads не
   подменять archive/cache/caller assertion. Installed entry/effect gate блокирует
   конкурирующих controllers, хотя script теперь читаем. Неизвестный/непроверенный
   entry path оставляет effect entry OFF и допускает лишь observation-only lane.

No-effect окно действует от закрытия writer до полной revalidation; физически
непрерывный writer HANDLE не обещается. User edit в этом окне не должен пройти
identity/hash recheck или достичь launch. Защита от hostile mutate-and-revert
того же local operator не заявляется.

### Pointer: native-owned PUBLISH_PREPARED → PUBLISHED_READ_FENCED

Selected successor lane публикует pointer внутри того же genuine native helper,
который фактически удерживает controller mutex/lease. Parent supervisor вызывает
closed fixed publish RPC и читает результат; normal non-successor publish ABI
сохраняется. ACK от helper с последующим parent rename недопустим: helper может
завершиться и потерять mutex между ACK и записью. Caller bytes/paths не принимаются.

1. После genuine new launch-result и durable non-exit epoch native helper
   сверяет old pointer через held `Read / FileShare.Read` handle, old path
   identity/raw hash, old archived bytes и exact new registration/epoch/binding.
   Создать единственный same-directory/same-volume temp с fixed canonical current
   envelope: CreateNew, flush, native identity/raw read-back. Publish RPC не
   выдаёт новое launch authority.
2. Пока строгий old pointer handle ещё held, открыть overlapping old object
   `Read / (FileShare.Read | FileShare.Delete)` и сверить тот же ID/raw hash.
   Два read handles совместимы; replacement пока запрещён первым handle без
   Delete sharing. Все aliases строгого pointer handle учтены в handle registry;
   скрытый alias не должен блокировать rename. Durable single-use publish-intent
   связывает expected old ID/raw, temp/new ID/raw, epoch, producer/controller
   и operation. Нельзя закрыть pointer только ради будущего parent publish.
3. В том же native handler перейти в `PUBLISH_PREPARED` и закрыть все строгие
   old pointer aliases. Old read/delete-share handle, mutex/lease и проверенные
   entry/source/history fences остаются held. Повторно открыть actual old path,
   проверить expected ID/raw и закрыть временный строгий probe; затем выполнить
   ровно один fixed atomic replace на том же volume. Delete sharing допускает
   rename, отсутствие Write sharing запрещает изменение held old object;
   authorized competing publisher исключён mutex. Same-user hostile rename
   не объявляется технически невозможным.
4. Не освобождая controller, открыть new actual pointer `Read / FileShare.Read`
   без Write/Delete sharing. Проверить native identity against temp transition,
   exact canonical envelope/raw hash, generation/registration/epoch. Старый
   read/delete-share handle удерживает original object для проверки сохранности;
   новый строгий handle защищает опубликованный path. Сохранить published receipt
   и лишь затем ACK; parent выполняет independent exact read-back.
5. Ошибка до/после replace, lost ACK, неизвестный rename outcome или невозможный
   new read fence дают consumed UNKNOWN. Read-back сверяет pointer/epoch/
   registration; rename/publish/launch повторно не отправляются. Оставшийся temp
   не даёт retry grant и не удаляется для снятия consume. Cleanup fences допустим
   после завершения session, когда дальнейший effect dispatch закрыт.

Windows sharing и выбранный atomic-replace API обязаны пройти настоящие temp-FS
проверки; документ не доказывает их поддержку. Несовместимость Node reads или
rename с declared handles блокирует effect enable до bounded correction/review.

## Append-only target chain и single-use

Старый target key — неизменный корень цепочки. Для каждого predecessor attempt
создать ровно один successor slot, например
`cold-target-successors/<rootTargetKey>/<predecessorAttemptId>.json`.
CreateNew/wx + flush/fsync обеспечивает выбор единственного next operation:
slot содержит old key/intent/UNKNOWN/review raw refs, predecessor claim digest,
новый operation/epoch/review/scope refs и genuine current proof ref.

Идентичность slot определяется predecessor, а не new UUID/sourceAfter/review.
Иначе конкурирующие UUID смогут создать разные keys. Перед consume под тем же
mutex проверить уникальную rooted chain без fork/cycle/orphan, exact directory
listings и все hashes/signatures; partial slot после crash блокирует продолжение.
Новый binding хранится отдельно от закрытых старых operation schemas.
Original v1 readers сохраняют старую семантику; new version resolver принимает
successor только через полный authenticated chain, никогда через отсутствие key.

Обычные ensure/restart/recover-once aliases по consumed target продолжают
возвращать read-back. Только новый explicit successor path может использовать
конкретный sealed claim. Повтор с тем же UUID — read-back; другой UUID, review или
sourceAfter не создаёт вторую попытку. После нового consume неизвестный source,
deploy, launch, finalize или publish результат закрывает этот session для effects.
Разрешены только disposal/read-back. Новый generic auto-retry отсутствует.
Следующий successor после ещё одного UNKNOWN потребует собственного distinct
review и authority scope; нынешний binding не является бессрочным retry grant.

Старый partial archive не дополнять и не переименовывать в complete preservation.
Новая операция создаёт собственный полный source/history/refs archive и genuine
source-preservation. Лишь затем штатные deploy → normal reservation/ticket →
fresh launch witness → один launch → durable non-exit edge → pointer publish.
Оригинальный historical projection и extended successor refs имеют отдельные
digests в новом preservation binding и проверяются перед каждым effect.
Claim не является lineage exit,
normal retirement proof, admission grant или замещением original adoption/audit.

## Budgets и freshness

Предложенная fixed matrix init30/source120/deploy60/launch30/finalize30/publish30
seconds и shared session360 совместима при следующих условиях:

- first RPC включает PS/Add-Type/init, source и ACK slack10 (160 seconds);
  последующие RPC ограничены phase+slack10 и оставшимся shared budget;
- 120000ms witness TTL, census elapsed cap30000, reservation/ticket expiry и
  runtime grants не расширяются вместе с watchdog budgets;
- source-preservation witness mint после второго завершённого fresh census;
  каждый deploy effect имеет собственный свежий witness и age check;
- controller/lease и проверенное entry/effect fencing непрерывны всю session;
  source/pointer access/share modes и handoffs следуют фазовому протоколу выше;
  history/private immutable handles остаются read-fenced, pins и native file
  identities повторно проверяются непосредственно перед effect;
- deadline/transport uncertainty сохраняет consumed UNKNOWN и не разрешает
  replay, claim renewal или новый launch. Diagnostic sidecar не выдаёт authority.

## Implementation ownership и приёмка

После budget milestone реализовать последовательно в новой WT; один writer.
Frozen oldstage и ROOT code/runtime до genuine live gates остаются неизменны.

| Файл | Scoped ответственность |
| --- | --- |
| `mcp-server/owned-runtime-cold.js` | Closed successor review/proof/binding/handoff schemas; separate old/extended inventory digests; immutable claim resolver; v1 совместимость. |
| `mcp-server/owned-runtime-supervisor.js` | Explicit successor admission; producer binding; source-handoff readiness; successor native-owned fixed publish; normal ABI/read-back/noReplay. |
| `scripts/owned-runtime-daemon-helper.ps1` | Genuine current producer/closure; continuous controller/lease/entry fencing; phase-specific sharing/handoffs; native-owned atomic publish; preservation и terminal effect gate. |
| `scripts/owned-runtime-cold-recovery.js` | Fixed versioned successor provision/read-back/one-shot selectors; exact current authorization/review binding; старый provision неизменен. |
| `scripts/owned-runtime-cold-recovery-smoke.js` | Pure schemas/temp-FS claim/race/crash/ABI fixtures и supervisor fake-deps checks. |
| `scripts/owned-runtime-cold-native-smoke.ps1` | Scoped AST/pure C#/temp-FS producer/fence/freshness fixtures, native process/launch calls=0. |

Новые modules, dependency/provider/credential/SDK/frozen intake изменения не нужны.
`review-evidence.js` уже перечисляет product файлы; менять его только если
доказан отдельный inventory gap. Bridge/CEP/full guards/Connect eligibility
сохраняются. Сам claim не открывает Connect или write admission.

Обязательные focused negatives: phase/code-only и fabricated producer;
old stage process outside new stage; relevant ancestor и unresolved identity;
incomplete census/occupied endpoint; source/history/private/pointer drift;
new-overlay file already present; concurrent aliases/UUID/review/sourceAfter;
fork/cycle/orphan/tamper/partial claim; stale proof и phase budget vs TTL;
unknown → queued deploy/launch отказ; old key/records/archive raw bytes unchanged;
v1 read-back, normal healthy/retirement и server full guard behavior unchanged.

Обязательные Windows temp-FS handoff tests проверяют actual sharing, а не только
fake counters: writer None блокирует reader; после gated reopen actual pinned
Node source read проходит, competing write/delete/rename отказывает; writer,
identity/hash drift или mutex loss в HANDOFF_BLOCKED блокируют launch. Проверить
each fixed entry coverage и отказ при пропущенном legacy entry. Old strict
pointer handle блокирует replace; overlapping Read+Delete сохраняет original
object; selected native atomic replace и новый strict read fence проходят.
Добавить hidden-handle alias, race competing controller, partial temp/failed
rename, crash before/after replace/lost ACK и expired witness без replay.
OldProjection digest сравнивается отдельно от extensionInventory; сохранённый
predecessor UNKNOWN проходит только при genuine отсутствии active execution.
Fixtures затрагивают лишь temp-FS/test-harness synchronization и фиксированные
runtime reader semantics, не production ROOT/daemon/AE/CEP lifecycle. Mocked
sharing result не закрывает этот gate.

Правила/node syntax/diff и названные offline fixtures проверяет implementation
owner после изменения; никакие broad CEP/Full Intaker/live checks не входят в
эту архитектурную фазу. Offline PASS не является genuine native/live proof.

Минимальный обратимый следующий шаг: реализовать closed validators и
current-quiescence observation producer в новой WT с effect entry выключенным;
сначала независимый bounded review и focused offline fixtures. Затем parent
привязывает точный reviewed пакет к уже данному scope и собирает genuine native
proof. Observation-only producer сохраняет initial handles до конца наблюдения;
source/pointer handoffs в нём не выполняются. Effect enable требует отдельно
reviewed state/share protocol и PASS sharing fixtures в той же задаче. До этого
launch/publish entry остаётся OFF. Только после всех gates допускается отдельная
новая one-shot операция.
Обычный Connect и typed project read следуют лишь после штатных full guards.

## Остающееся evidence / stop

Сейчас отсутствуют genuine current successor witness, полный повторный exact
inventory, sealed new authorization/review/checkpoint/code pins и реализованный
single-use chain consumer. Original native terminal identity/receipt не сохранён;
его нельзя восстановить из wrapper exit1. Нет основания маркировать old UNKNOWN
как success/no-effect/exit. Если prospective current quiescence или exact inventory
не подтверждаются, единственный разрешённый этим контрактом путь — old read-back
и отдельный review конкретного gap, без replay/reset/GUI bypass.

В этом блоке выполнялись только targeted local reads и правка этой новой
записки в назначенном ownership. Product tests, native/UI/MCP/HTTP/CDP calls,
runtime record writes, code edits и commits не выполнялись.

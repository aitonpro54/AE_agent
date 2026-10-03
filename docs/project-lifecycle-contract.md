# Защищённый lifecycle без рендера — контракт M3

Локальное архитектурное ревью заменяет Pro по явному решению пользователя.
Verdict revise принят; ниже зафиксированы обязательные поправки до реализации.
Один writer lifecycle core/store, root интегрирует bridge hooks после M2 writer.

## Возможности и rollout
Три terminal операции named source: save_project_as, open_project, create_named_project.
Дополнительная finalize_project_lifecycle — только подтверждённое server-state завершение после доказанного final open, без native save/new/open replay.
Первое сохранение существующего unnamed проекта остаётся UI fallback.
Все writes manual/destructive; direct/admin/autonomous execution запрещены.
Native dirty/revision/file неизвестны -> blocked, никогда false/0.
Общий legacy behavior сохраняется при отключённой новой capability.
AE_PROJECT_LIFECYCLE_ENABLED=1 — приватный opt-in до live fixture приёмки (не client arg).
Capability остаётся выключенной по умолчанию; текущий production runtime ещё не
перезапущен с этим флагом, поэтому описанный flow не является live-доступным.
При первом включении требуется уже существующий валидный protection store; пустую базу startup не создаёт.
Permanent initialized marker сохраняет требование валидного store при последующих рестартах/выключении capability; missing/corrupt marker/store blocks writes.
Marker не содержит pending authority: pending и commit только в одном atomic V2 store.
V2 pending блокирует writes даже при выключенном флаге. Read-only diagnostics доступны.

## Public arguments
Общие source guards: expectedSourceProjectFile, expectedSourceSavedSha25664, expectedSourceRevision,
expectedSourceDirty, checkpointLabel. Native revision safe integer, dirty strictly bool.
save/create: targetProjectFile (absent local canonical-parent AEP).
open: targetProjectFile + expectedTargetSavedSha25664 (existing canonical AEP).
Не принимать overwrite, raw script, authorization/phase/transition overrides.
New source и destination policy entry тоже не должны конфликтовать.

Public read-only builder принимает ровно `{operation, targetProjectFile, checkpointLabel}`.
Source tuple, saved source SHA, open-target SHA и native inventory собираются свежими
серверными чтениями; клиент не поставляет доказательства или execution authority.
Builder возвращает ровно один terminal step с `plan.targetProject.file`, равным source.
Пользовательская последовательность и допустимое восстановление описаны в
[guarded lifecycle recipe](../recipes/project-lifecycle.md).
Finalize input только transitionId; current source/native guards связывает fresh manual proposal, backend берёт exact target и proof из pending.
Read-only reconcile_project_lifecycle принимает transitionId и возвращает current facts/phase, не совершает writes или replay.

## Admission и authority
До первого native mutation — idle queue/leases/submitted outcomes, отсутствие чужой edit session.
Синхронный admission lock захватывается до записи pending и сохраняется до terminal/error.
Barrier проверяется before idempotency return, project-state/controller/panel writes, enqueue AND lease.
После restart pending/missing/corrupt store восстанавливают barrier до обработки mutations.
MCP client transition ID, confirm:true или JSON с полями authority не создают capability.
Private immutable capability bound action/run/full hashes/transition/phase/current file.
Только этой capability разрешён конкретный internal native phase; fixed read-only lifecycle diagnostics могут получить отдельный read capability.
Ordinary source bindProject/native guards не ослаблять глобально.
Plan.targetProject остаётся source; один lifecycle tool, никаких runtime bindings/других mutations/последующих client steps.
Manual runner authority требует current valid CEP confirmed action, successful exact dry-run, source policy/native/target pins, mandatory source-matched on-disk checkpoint.
Существующий checkpoint не заявляется как rollback unsaved memory.
All new tools deny direct/admin/autonomous even escape-hatch settings.
После окончания owned session закрывается, proposal retired, old caches/context readiness invalidated, desiredEnabled preference preserved.
Persistent lifecycle generation namespaces future idempotency keys; legacy cache cannot satisfy new project after switch.

## Строгий Save As/create
Owned UUID stage расположен в target parent, заранее зарезервирован сервером.
Native action проверяет current exact file/dirty/revision внутри того же evalScript перед действием.
saveAs: source named; сохраняет current approved dirty memory в stage.
create: source named clean; guarded newProject+save(stage) в одном script; resulting empty project и native features проверяются.
Stage native file/hash/dirty=false/revision/inventory проверяются; original source disk SHA остаётся прежним.
Publish final только COPYFILE_EXCL, hash/fsync и file identity read-back; AE не пишет final непосредственно.
Final open проверяет exact current stage native tuple и published file/hash; stage manual edit блокирует open.
Reopening меняет undo/active context: disclosure в preview/receipt.
Все file-backed items/proxies/comp-layer-source IDs, declared project settings и protected snapshots/dependencies наблюдаются до первой mutation и после open.
Для open до mutation наблюдается полный source inventory, фиксируются target disk hash/identity и сохранённая target policy; native target inventory доступен только после открытия. Он сверяется с target policy, а не с source. Не заявлять предварительную native-инспекцию закрытого AEP.
Complete inventory имеет finite budgets; unknown required fields/overflow блокируют до mutation.
Known already-missing assets сохраняются как известный missing status без autorelink; неизвестные пути не выдумываются.
Нет автоматического save/open source назад, rollback, удаления stage/partial final или replay unknown.
COPY failure может оставить partial final, который сохраняется как evidence и pending.

## Protection V2
Existing projectState остаётся. V1 read-compatible; только подтверждённый lifecycle пишет V2.
V2 содержит singleton pendingLifecycle:null|record, bounded terminal receipts и persistent lifecycle generation.
Before mutation проверить packed/logical capacity source+pending+target restrictions/ownership/terminal receipt.
Source запись сохраняется без изменений.
SaveAs переносит exact accepted restrictions/mappings/constraints по ID/value/dependency match.
Target reviewArtifacts/sourceLoadEpochs пустые: никакой artistic/canonical/image validity.
Restrictive inherited ownership index owner/itemIDs/sourceKey/transitionID/proofValidity invalid
запрещает обычные mutations/delete/cleanup/re-registration этих IDs до отдельного adoption scope.
Open читает существующую target policy; create получает пустую target policy.
Target state + terminal receipt + cleared pending + generation фиксируются одним atomic replace только после full proof/session close/proposal retirement.
Error после possible delivery сохраняет pending/unknown; undelivered not_started только по authoritative lifecycle evidence.
Read-only reconciliation не разрешает replay или auto-commit. Fresh manual finalize допускает только already proven final state; остальные partial/unknown требуют отдельного explicit recovery scope, без reset-lock кнопки.

## Core interfaces для root bridge adapter
contract: toolDefinitions, isLifecycleTool, validateInput, nativeInventoryScript, phaseScript, verifyReceipt.
transition: V2 validation, source/target restriction migration, capacity estimate, guarded store adapter,
pending projection, admission/capability predicates, epoch reader. Existing controller hooks reuse this.
service factory deps: readNative(script,capability), sourceCheckpoint(context), storage adapter,
verifyManualAuthorization(context,input), retireContext(context), admission hooks, filesystem injectable.
execute(name,args,server-held authorization) returns authoritative lifecycle receipt and bounded proof;
reconcile is strictly observation. Client никогда не передаёт Native observations or private capability.
Generic run gets manual context only from existing confirmed CEP runner; root passes phase capability through private AsyncLocalStorage to enqueue/lease guards, not public args.

## Offline checks
Strict input/unsupported fields/drift, unauthorized/direct/admin/autonomous, phase capability forgery,
existing target and policy conflict, stage edit, source unchanged, asset/proxy/ID mismatch,
concurrent admission/queued writer, failure after every phase/restart/marker-store absence/corruption,
pending before cache/panel writes, source restriction retention/target ownership invalid proofs,
finalize never emits native mutations, generation cache isolation and no replay.
Live fixture отдельно проверяет AE26.2 getters, different-directory saveAs/assets/proxies, reopen и empty create.

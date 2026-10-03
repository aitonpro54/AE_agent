# Lifecycle M3: контракт интеграции core/store

Offline core реализует `save_project_as`, `open_project`, `create_named_project`,
readonly `reconcile_project_lifecycle` и manual state-only
`finalize_project_lifecycle`. Условия и границы заданы в
[утверждённом контракте](project-lifecycle-contract.md). Native/CEP integration
принадлежит root adapter. Live AE, save/reopen и AE 26.2 getters этими тестами
не проверены. Production capability остаётся приватным opt-in
`AE_PROJECT_LIFECYCLE_ENABLED=1` до отдельной live fixture приёмки.

Пользовательские ограничения и runbook находятся в
[guarded lifecycle recipe](../recipes/project-lifecycle.md). Прямой read-only вход
`build_project_lifecycle_plan({operation, targetProjectFile, checkpointLabel})`
сам запрашивает свежие server/native/disk observations и строит один terminal step.
Тот же сценарий доступен через подключённый registry recipe forwarder:
`build_solution_plan` с `solutionId: "guarded-project-lifecycle"`. Текущий runtime
не перезапущен с lifecycle opt-in, поэтому live execution пока недоступен.

## Подключение service

`require('../mcp-server/project-lifecycle-service').createProjectLifecycleService(deps)`
возвращает `execute(name,args,serverHeldContext)`, `reconcile({transitionId})`,
`finalize({transitionId},serverHeldContext)`, `storage` и offline utility
`readFileRecord(path)`. У service нет собственного публичного runner, authority
или автоматического recovery. Достаточно вызывать `execute` из единственного
подтверждённого CEP runner; direct/admin/autonomous lanes должны отказать ещё
до вызова service. `serverHeldContext` — объект adapter, полученный после
реального CEP подтверждения и exact successful dry-run, а не JSON клиента.

Обязательные зависимости:

| Hook | Точный контракт |
| --- | --- |
| `readNative(script,capability)` | Выполняет переданный ES3 body через обычную защищённую queue и возвращает результат; допускается существующий `{result:...}` wrapper. Private capability переносится через server-held scope, никогда через args. Promise завершается после authoritative command outcome; timeout не разрешает replay. |
| `verifyManualAuthorization(context,hints)` | Проверяет server-held brand, current CEP action, confirmation, exact dry-run, plan hashes, single terminal step/source binding, policy/native/target pins. Возвращает frozen binding ниже. Нет default verifier. |
| `sourceCheckpoint(request)` | Создаёт отдельную точную on-disk копию source. Возвращает metadata ниже. Service самостоятельно проверяет SHA/bytes/canonical path/отличающийся file identity. Копия не является восстановлением unsaved AE memory. |
| `retireContext(context,hints)` | Закрывает только owned edit session, retires proposal, invalidates old context/caches/readiness, сохраняет desiredEnabled preference. Возвращает все четыре boolean proofs ниже. |
| `assertIdle(context)` | Синхронно возвращает строго `true`, когда нет queued/leased/submitted outcomes, чужих leases или edit session. Если текущая сессия принадлежит данному manual run, ownership проверяет adapter. Promise здесь недопустим. |
| `storage` | Результат `createLifecycleStorage({statePath?})`; production `enabled` берётся из приватного env. `enabled` и injectable `filesystem` предназначены только для server config/offline fixtures. |

Verifier получает frozen `hints`:

```js
{ name, args, inputHash, sourcePolicyHash, targetPolicyHash, expectedNative,
  // Только finalize:
  pending }
```

И возвращает frozen объект:

```js
{ channel: 'manual_cep', confirmed: true, dryRunVerified: true,
  actionId, runId, payloadHash, inputHash, sourcePolicyHash, targetPolicyHash,
  ownedEditSessionId /* optional exact server-held ID */ }
```

`inputHash = contract.hash({name,args})`. Policy hash нужно вычислять через
`contract.hash(transition.readState(store, sourceFile))`; default source state
включает `sourceLoadEpochs:{}`. Target pin вычисляется как
`contract.hash(store.projectState[memory.projectStateKey(targetFile)] || null)`.
Нельзя заменять отсутствующий target policy пустым state для `open_project`.
Полный plan payload hash сохраняется отдельно в `payloadHash`.

Checkpoint request:

```js
{ context, transitionId, label, sourceFile, sourceBytes, sourceSha25664,
  snapshotScope: 'on_disk_before_lifecycle' }
```

Checkpoint result:

```js
{ checkpointFile, sourceFile, label,
  snapshotScope: 'on_disk_before_lifecycle', bytes /* optional */, sha256 /* optional */ }
```

Retirement hints:

```js
{ transitionId, authorization, sourceProjectFile, targetProjectFile, generation,
  finalizationAuthorization /* optional fresh manual finalize binding */ }
```

Retirement result:

```js
{ sessionClosed: true, proposalRetired: true,
  cachesInvalidated: true, desiredEnabledPreserved: true }
```

После retirement service ещё раз делает readonly inventory с exact final
native tuple, перечитывает pinned files и только затем атомарно commits V2.
Original `pending.authorization` сохраняется для native operation. Fresh
manual finalize binding записывается в `pending.finalizationAuthorization` и
terminal `receipt.finalizedBy`; semantic adapter проверяет current finalize
run против `finalizedBy`, обычные операции — против `authorization`.

## Queue, controller и cache barrier

`project-lifecycle-transition` экспортирует:

- `createLifecycleStorage(options)`, `assertMutationAllowed(options)`,
  `assertReadableProtectionStore(options)`, `assertPolicyWriteAllowed(options)`;
- `validateCommandCapability(cap,{rawScript?,script?,phase?,commandId?})`,
  `isPhaseCapability(cap)` и readonly `phaseCapabilityFacts(cap)`;
- `epoch(options)`, V2 validators, migration/capacity helpers.

Storage имеет `load()`, `pendingProjection()`, `epoch()` и
`assertMutationAllowed({capability?,command?})`. Sync barrier должен стоять
**before idempotency return**, controller/panel/project-state writes, enqueue и
lease. Root хранит original body отдельно как `lifecycleRawScript`: hash binding
проверяется по нему, полный wrapped script создаётся только фиксированным bridge
serializer. На enqueue и lease передавать один и тот же `commandId`; другая
команда с той же capability запрещена. Validator повторно проверяет live pending
phase/action/run/full hashes, admission lease и source/destination disk pins;
для `open_final` также stage disk pin. Exact native file/dirty/revision проверяет
emitted script внутри одного eval перед действием.

Private capability — frozen opaque object с process-local WeakMap brand, живёт
только до конца awaited callback. Поля JSON, `confirm:true`, transition ID,
старый receipt или copied object brand не получают. Source bindProject и
обычные native/placeholder guards остаются строгими; adapter пропускает только
эти source guards для проверенной private phase и сохраняет прочие queue gates.

Storage выпускает отдельные fixed readonly scopes:

- `withReadCapability(transitionId, {expectedNative?,accepted?}, callback(script,cap))`
  генерирует только `nativeInventoryScript`;
- `withStateReadCapability(callback(script,cap))` генерирует только
  `'return '+projectLifecycleState.nativeReadScript()`, phase `readonly_state`.
  Этот reader доступен при pending, missing/corrupt store и unsupported inventory;
  он не разрешает writes или auto-finalize.

Core lifecycle writer использует внутренние
`acquireAdmission(binding,idleCallback)`,
`acquireFinalizeAdmission(binding,transitionId,idleCallback)`,
`releaseAdmission(lease)`, `begin(lease,pending)`,
`update(lease,transitionId,mutate)`, `commit(lease,transitionId,receipt)` и
`withPhaseCapability(lease,pending,phase,nativeTuple,script,callback,deliveryPins)`.
Root не передаёт эти handles публичным инструментам.

Admission является process-wide синхронным lock по canonical store path.
Поддерживается **один production daemon/controller на store**. Fingerprint CAS
защищает наблюдаемые внешние изменения, но не является cross-process admission;
второй daemon с тем же store не поддерживается. Дополнительного lock sentinel
или автоматической очистки stale locks в этом scope нет.

Persistent `lifecycleGeneration` namespaces будущие idempotency keys. Generation
считать через guarded epoch после startup barrier; legacy cached response не
может удовлетворять mutation в новом project/context.

## Protection и persistence

`project-intent-memory` остаётся V1 read-compatible, добавляя V2 validation и
controller/write barriers. Никогда не создаётся пустой store при enabled runtime.
Permanent `<statePath>.lifecycle-initialized.json` связывает initialized runtime
с одним store. После V2/marker или наблюдённой в процессе инициализации отсутствие
либо повреждение marker/store блокирует writes и при flag-off. Marker содержит
только schema и store-path hash; pending authority/commit находятся в одном V2
atomic replacement. Если при остановленном процессе удалить одновременно все
marker/store следы и отключить flag, это невозможно обнаружить без внешнего
evidence. Такая операция не является поддержанным recovery.

Before first native mutation проверяется packed/logical capacity с резервом
source/stage/final inventories, ownership/restrictions и terminal receipt.
Stage UUID file резервируется через `wx` в canonical target parent. Publish
использует только `COPYFILE_EXCL`, fsync и SHA/file-identity read-back. Source
disk/hash/identity и source policy entry должны сохраниться. Stage/partial final
после ошибки остаются evidence; cleanup, rollback, source reopen и native replay
отсутствуют. Atomic store/marker writes fsync-ят temporary file перед rename;
техническое crash-recovery evidence определяется наличием valid store/marker.

SaveAs сохраняет exact accepted snapshots/mappings/constraints по verified IDs,
values и dependencies. Open до mutation читает полный **source** inventory,
target disk SHA/identity и уже существующий target policy; fresh native target
inventory наблюдается после guarded open. При SaveAs/create/open target
`reviewArtifacts` и `sourceLoadEpochs` пусты. Existing owned review objects
становятся `inheritedOwnership` с invalid proofs; original source entry остаётся
неизменной. При open ownership sourceKey — прежний target key.

Root обязан вызвать
`memory.checkInheritedOwnershipSteps({state,inventory,steps})` **до** early
empty accepted-placeholder shortcut, даже если accepted/constraints отсутствуют.
Helper запрещает mutation/delete/cleanup по inherited item IDs/owner и неизвестный
mutation footprint. Явно независимые new-item additions допускаются. Controller
сам запрещает re-registration/removal/image/load-epoch registration inherited
IDs/owners. Adoption не реализован и требует отдельного scope.

Inventory finite: 1000 items, 5000 layers, 200 protected snapshots, 1 MiB result.
Known FileSource/SolidSource/PlaceholderSource и proxy kind различаются явно;
known missing paths/status сохраняются. Unknown required field/overflow блокирует
mutation. Declared Project settings: bitsPerChannel, workingSpace,
linearBlending, linearizeWorkingSpace, expressionEngine, colorManagementSystem,
timeDisplayType, framesCountType, feetFramesFilmType, framesUseFeetFrames.
`displayStartFrame` не заявлен как Project getter. Live support этих getters и
различия AE после saveAs/reopen должны проверяться отдельно.

## Offline validation

Изолированный `scripts/project-lifecycle-fixture.js` экспортирует
`fixture(options)` с VM-классами AE и реальными temporary files:
`runtime`, `execute(fullWrappedScript)`, `service`, `storage`, `args()`, `context`,
`calls`, `setNativeHook(fn)`, `dispose()`. Hook получает
`{when,script,facts,runtime,result?,calls,storage,service}`. Никакого bridge/live
подключения fixture не создаёт.

```powershell
node scripts/project-lifecycle-contract-smoke.js
node scripts/project-lifecycle-transition-smoke.js
node scripts/project-lifecycle-service-smoke.js
```

Проверяются strict input/native unknown/drift, emitted ES3 guards, forged
authority/capability, phase failures, restart/missing/corrupt barriers, capacity,
source invariance, restrictions/invalid inherited ownership, nonoverwrite/partial
copy, stage drift, concurrent admission и finalize с нулём native mutations.
Отдельная root integration проверяет реальные MCP/CEP endpoint gates на offline
fixture. Эти результаты не являются live AE приёмкой или artistic proof.

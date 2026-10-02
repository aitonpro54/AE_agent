# Детерминированный монтажный конвейер V1

M1 — чистая offline проверка readiness. `validateMontageManifest({manifest, materials,
observations, budgets})` использует существующие `buildSourceUsageMap`,
`checkPlaceholderAssignments`, `buildPlaceholderPlan` и framing helper. Функция
не читает медиа/AE, не исполняет планы и не подтверждает художественную приёмку.
M1–M4 реализованы: bounded material reader, compiler, summary и read-only
server/library integration описаны ниже. Приёмка offline; live/artistic proof отдельно.

## Контракты

Manifest имеет schema `ae-agent-montage-manifest.v1`, положительную `revision`,
безопасный строковый `taskId`, UTC `observedAt` и
`project:{projectFile:absolute, projectKey, revision:nonnegative}`.

- `scenes`: уникальные `sceneId`, `rootCompItemId`, `rootRange:[in,out)`, `fps`,
  точные `assignmentIds`, `visibleCutCount`, `cameraEvents:[{eventId,rootTime}]`.
  Необязательный `rootCompName` сверяется с native name.
- `assignments`: уникальные `assignmentId`, `sceneId`, `target:{compItemId,layerId}`,
  `routeLayerIds`, `materialId`, `sourceRange`, `groupId`,
  `crop:{mode:'static-cover',samples,marginPixels}`, `shots:[{shotId,sourceRange}]`,
  `protectedFields:[]`. Необязательный `rootRange` берётся из известной сцены;
  заданный интервал обязан лежать внутри неё. Shots сохраняют исходный порядок,
  непрерывно и точно покрывают sourceRange. Три shots означают две внутренние cuts.
- `groups`: уникальные `groupId`, `provenance:'explicit_metadata'|'user_confirmed'`,
  `confirmed:true`. Assignment/group/provenance связываются с authoritative
  mediaKey mappings; имя файла не подтверждает группу.
- `groupPolicy`: V1 поддерживает `distinctGroups:true`,
  `disallowSourceOverlap:true`, `balancedRepeats:[]`. Непустые repeats дают
  `unsupported_balanced_repeat`; client waiver не отключает server policy.
- `dependencies:{complete:true,scope,edges}`: scope содержит точные множества
  `rootCompItemIds`, `targetKeys`, `sourceItemIds` текущих и будущих источников.
  Edge: `{dependencyId,kind:'target'|'source'|'route',sceneIds,...identity}`.
  Target/route используют `compItemId,layerId`, source — `sourceItemId`.
  Каждый use и native shared use внутри объявленных сцен обязан иметь точное ребро.
  Неизвестные/дублирующие связи блокируются. Native comp cycle блокирует usage.
- `frameCoverage`: `{frameId,sceneId,assignmentId,compItemId,rootFrame,rootTime,
  roles,reasons}`. Все IDs стабильны. Обязательны first/middle/last каждого
  assignment, scene anchors в его интервале, внутренний кадр каждого shot, обе
  стороны cuts, camera events и crop samples. Middle = `floor((N-1)/2)`, last =
  `N-1`. Дедуп выполняется по scene + assignment + frame; все per-use причины
  сохраняются. Один root frame разных assignments остаётся отдельными требованиями.

Prepared catalog имеет schema `ae-agent-prepared-materials.v1`, положительную
`revision`, `materials:[{materialId,sourceItemId,path:absolute,sha256:64hex,
byteLength,width,height,pixelAspect:1,duration,fps,provenance}]`.
`provenance.kind:'prepared_clip'`; optional `originalMaterialId` и
`originalSourceRange` проверяются, но не заменяют source evidence.

Abstract IDs — безопасные строки `[A-Za-z0-9_-]{1,128}`; native IDs/indices —
положительные safe integers. Все интервалы полуоткрытые, frame-aligned; root,
route comps, target comp и planned source имеют один fps. Статичные uniform
cover samples используют действующий framing contract: source_pixels, imageRef,
imageSha256, observation и subjects либо `noSignificantSubjects:true`. Неизвестные
поля manifest/catalog и их описанных вложенных объектов — адресные blockers.

## Внутренние native observations

`ae-agent-montage-observations.v1` — факты доверенного server adapter, **не public
client input**. Synthetic fixtures не доказывают настоящий native read-back.
Обязательны `observedAt`, exact `project`, `inventory`, `usage`, `targets`,
`materials`, `dependencyScope`.

Inventory: `complete:true`; comps с точными itemId/itemIndex/name,
duration/frameRate/width/height/PAR и layers; sources с identity/type/file и
metadata. Native item IDs и presentation indices не дублируются. Layer record:
`id,index,name,sourceItemId,enabled,locked,startTime,inPoint,outPoint,stretch,
timeRemapEnabled`. Нет подстановки default index. Для текущего/планируемого video
source нужны `type:'footage'`, `hasVideo:true`, `footageMissing:false`, absolute
file, положительные metadata и PAR1. Prepared path/metadata/fps должны совпасть
с imported source. Polymorphic generic inventory может содержать прочие items;
они не получают разрешения стать video target/source.

`usage.ok/complete:true` с entries/occurrences/sources/groupMappings/scope
сверяется с заново вычисленным `buildSourceUsageMap` всего bounded root scope.
Сохранённый `complete` не заменяет эту проверку. Aliases используют существующий
mediaKey contract; overlapping ranges блокирует existing assignment checker.

Target record содержит exact `target`, full `targetLayer`, planned-source
`geometry`, actual `transform`, exact `route`, `footprint`,
`protection:{checked:true,ok:true}`. TargetLayer identity/timing строго совпадают
с inventory, geometry comp/source — с native metadata; transform anchor/rotation
связаны с geometry. Статичный 2D framing запрещает 3D, parent, rotation, masks,
collapse, keys и expressions. Footprint обязан явно содержать
`{complete:true,hasTrackMatte:false,hasEffects:false,hasExpressions:false,
hasTransformKeys:false}`. Отсутствие любого обязательного факта блокирует readiness.

Каждый route edge сохраняет existing builder поля `parentCompItemId,
childCompItemId,layerId,layerIndex,startTime,inPoint,outPoint,stretch,
timeRemapEnabled`; они сверяются с native parent layer. Дополнительно обязательны
`geometry:{comp:parentGeometry,source:childCompGeometry,layer:static2DGeometry}` и
такой же полный `footprint`. Неизвестные route geometry/matte/effect/keys не
принимаются как false. Все edge/source identities, timing и конечная цель связаны;
enabled=true, locked=false, stretch100/remapfalse. Presentation drift допустим
при согласованных native/observation indices и прежних stable IDs.

Observed material содержит `materialId,sourceItemId,verified:true,path,sha256,
byteLength,metadata:{width,height,pixelAspect,duration,fps}`. Full SHA/bytes/path
и metadata сверяются с catalog; aliases не могут заявлять разные bytes/hash.
`dependencyScope:{complete:true,rootCompItemIds,targetKeys,sourceItemIds}` должен
точно совпасть с вычисленным scope. Server protection и обычные AE gates остаются
обязательными при будущем proposal/run.

## Бюджеты и результат

Caller может только уменьшить ceilings. JSON UTF-8 bytes/depth/cycles и array
counts проверяются до semantic traversal; non-JSON/accessors/sparse arrays
блокируются. Превышение никогда не приводит к усечённому ready.

| Budget | Ceiling |
|---|---:|
| scenes / assignments / materials / groups | 32 каждый |
| routeDepth / shotsPerAssignment | 4 / 12 |
| frameCoverage / dependencyEdges / graphNodes | 768 / 512 / 5000 |
| manifestBytes / materialsBytes / snapshotBytes | 256 KiB / 256 KiB / 4 MiB |
| maxSteps / materialReadRequests | 50 / 32 |
| materialFileBytes / materialTotalBytes | 512 MiB / 2 GiB |

Дополнительно native inventory ограничен 200 comps, 1000 sources, 2000 items,
5000 layers; crop samples — 24 на assignment. `maxSteps` уже проверяется на
actual existing builder plan. File budgets в M1 проверяют declared/observed
bytes; фактический bounded reader реализуется в M2.

Ответ: `{ok,readiness:'ready'|'blocked',normalized?,preparedMaterials?,blockers,
budgets}`. Blocker содержит `code,path` и при необходимости details/assignmentId/
sceneId. На malformed input функция возвращает blocked. Ready содержит
детерминированный normalized manifest (с совместимым flattened `materials`) и
отдельный canonical `preparedMaterials` catalog с **собственной revision**.
Compiler может восстановить strict manifest, удалив только normalized.materials;
catalog не восстанавливается догадкой из manifest revision.

Timestamps и full hashes связывают identity/provenance; они не доказывают
freshness или неизменность AE/файла после наблюдения. Сохранённый PNG и декларация
samples не означают художественной приёмки.

Адресная offline проверка M1: `npm.cmd run smoke:montage-manifest`. Она вызывает
реальные pure modules с synthetic native-shaped fixtures; AE/CEP/providers,
текущий AEP, M5 и этап 3 не используются.

## M2: Pure Compiler и Bounded Material Adapter

M2 реализует чистый компилятор планов монтажа (`mcp-server/montage-pipeline.js`) и
изолированный адаптер верификации файлов (`mcp-server/montage-materials.js`).

### Pure Compiler (`compileMontagePipeline`)

Компилятор работает полностью синхронно и детерминированно, без обращений к AE,
файловой системе, сети или вызовам моделей.
Выходная схема: `ae-agent-montage-compilation.v1`.

- **Вход**: `{ validated, observations, budgets }` либо `{ manifest, materials, observations, budgets }`.
  Повторно валидирует вход или использует доверенный результат `validateMontageManifest`.
- **Глобальная проверка коллизий**: вызов `checkPlaceholderAssignments` на всём
  множестве назначений до сегментации. Одинаковые или конфликтующие намерения на
  одну цель блокируются (`conflicting_target_intent` или `unsupported_shared_target`).
- **Release-Order DAG и Swaps**:
  Если новое назначение $A$ требует диапазон исходника, который в текущем проекте занят
  слоем $B$, а слой $B$ освобождает его в другом назначении, выстраивается ребро $B \to A$
  ($A$ зависит от $B$).
  При взаимном пересечении ($A \leftrightarrow B$) обнаруживается цикл и возвращается
  блокер `unsupported_atomic_exchange` (атомарный обмен несколькими слоями не поддерживается).
- **Симуляция последовательного применения**:
  После топологической сортировки выполняется пошаговая симуляция `checkPlaceholderAssignments`
  для каждого юнита с обновлением промежуточного состояния занятости.
- **Структура юнита**:
  `{ unitId, assignmentIds, kind: 'application', dependsOn, plan, contentHash, expectedReadBack, frameRequirements, budget }`.
  `unitId` строится из `${assignmentId}_rev${manifestRevision}`.
  `contentHash` детерминированно фиксирует целевой слой, stable source IDs, full SHA256
  материала, ревизии манифеста и каталога, диапазоны, геометрию, полный исполняемый план
  (инструменты, аргументы, включая `expectedPreviousSourceItemId`), `expectedReadBack`,
  `placeholderFraming`, `placeholderAssignments`, `placeholderConstraints`, факты маршрута,
  субъекты кадрирования и привязку к проекту. Любое изменение в исполняемом плане или
  источниках-псевдонимах изменяет хэш.
  Каждый план содержит метаданные привязки `plan.montagePipeline` (unitId, manifestRevision,
  materialRevision, materialId, sourceItemId, path, sha256, metadata, budget, project).
- **Пакеты визуальной приёмки (`reviewPackets`)**:
  Формируются как спецификации для штатного `build_placeholder_visual_review_plan`
  (без создания фальшивой регистрации владельца или UUID).
  Совместимость проверяется вызовом `resolveReviewTargets(inputs, predictedInventory)`
  на предиктивном инвентаре после мутаций.
  Лимиты: $\le 4$ целей на пакет, $\le 24$ сэмплов, $\le 24$ видов, шаги = `views + 3` $\le 50$
  и $\le \text{maxSteps}$.
  Обязательные якоря (`first`, `middle`, `last`) сохраняются в каждом пакете; при
  секционировании цели якоря повторяются с явной причиной. Если сэмплы не помещаются в
  лимит шагов, компилятор не отбрасывает кадры, а возвращает блокер (`review_packet_samples_cannot_fit`).

### Bounded Material Adapter (`verifyMontageMaterials`)

Изолированный адаптер файловой системы для проверки подготовленных материалов:
- **Авторизация до чтения**: разрешены только те пути, которые точно соответствуют
  импортированным источникам из доверенного инвентаря AE (`inventory.sources`).
  Произвольные пути вызывающей стороны немедленно отклоняются (`arbitrary_path_denied`)
  до обращения к файловой системе.
- **Проверка realpath и изоляция**: проверка канонических путей и предотвращение побега через
  symlink за пределы каталога исходников (`symlink_escape_denied`).
- **Pre-stat, FD-stat и Post-stat**: сверка `dev`, `ino`, `size`, `mtimeMs` на этапе pre-stat,
  на открытом файловом дескрипторе (`material_changed_during_open`) и после чтения с проверкой
  повторного realpath (`material_retargeted_during_read`, `material_changed_during_read`).
- **Потоковый полный SHA256**: потоковое чтение ограниченными блоками (64 KiB),
  контроль лимитов на размер файла (`materialFileBytes`) и суммарный объём (`materialTotalBytes`).
  При превышении лимита или неполном чтении SHA возвращается как `null`.
- **Строгая валидация метаданных и бюджетов**: блокеры нормализатора бюджетов не игнорируются,
  значения `NaN` или отсутствующие поля блокируются, дубликаты записей каталога или нативного
  инвентаря блокируются.
- **Сверка нативных метаданных**: проверка совпадения `width`, `height`, `pixelAspect` (строго 1),
  `fps` и `duration` с нативным источником footage.
- При дрейфе материала требуется выпуск новой ревизии каталога (`materialRevision`).

Адресные проверки M2:
- `npm.cmd run smoke:montage-pipeline` — 19 offline тестов компилятора, DAG, коллизий, бюджетов и пакетов.
- `npm.cmd run smoke:montage-materials` — 20 offline тестов адаптера материалов с реальными временными файлами.

## M3: Свежий read-back, зависимости и частичный исход

Pure-модули `montage-pipeline-summary.js` и `montage-run-bindings.js` не
исполняют AE-команды и не дают полномочий повторить старый план.

`affectedMontageScenes({manifest,materials,observations,changes,budgets})`
повторно проверяет bounded native baseline через существующий M1 validator:
точные target/route/source edges, общие occurrences, scene refs и scope.
Normalized manifest допускается с отдельным catalog либо явной materialRevision.
Неполный/пустой граф, неизвестная цель/источник/маршрут, неизвестный footprint
и неизвестный route transform требуют baseline всех известных сцен и кадров.
Для manual/property/matte/effect/parent change нужен явный complete footprint;
без него область последствий считается неизвестной.

Index-only exemption требует полные native `before/after` target snapshots:
after совпадает с фактическим `observations.targets`, stable IDs и всё содержимое
равны после исключения presentation indices. Флаг `contentUnchanged` и имя
`index_drift` не заменяют эти факты. Position/scale маршрута входят в сравнение.

`summarizeMontagePipeline({compilation,runEvidence,readBack,reconciliation?,visualReview?})`
сверяет UUID записи и run.id, exact project file, полный unit.plan и выполненные
args каждого шага. Обязателен native `ae-agent-run-provenance.v1`:
actionId, proposalRevision, projectId, planSha256. Хэши считаются существующим
`review-evidence.sha256`. Native projectRevision может быть null только с
`projectRevisionReason:'in_memory_revision_not_observed'`; это не revision0.
Дубликаты, неизвестные unit bindings, missing dependency IDs и циклы блокируют
проверку. JSON bytes/depth/cycles/accessors и размеры коллекций ограничиваются
до semantic walk; malformed input возвращает blockers.

### Внутренний контракт readBack для M4

Эти факты собирает доверенный server adapter из существующих native readers
и bounded material verifier. Они не являются public client input. Synthetic
fixtures, сохранённый timestamp или самостоятельно заявленный hash не доказывают
фактического чтения проекта/файла.

`readBack` содержит отдельные массивы:

- `projects:[{unitId,file,evidence}]`.
- `targets:[{comp,layer,transform,geometry,footprint,evidence}]`: native comp.itemId,
  comp.itemIndex, name/frameRate; layer.id/index/name/source и полный timing;
  enabled/locked/threeDLayer/remap — явные boolean. Source содержит itemId/name/file/
  footageMissing. Static footprint и geometry полны.
- `materials:[{materialId,sourceItemId,path,sha256,byteLength,metadata,verified:true,evidence}]`:
  полный SHA256 прочитанных bytes, absolute path и width/height/PAR/duration/fps
  совпадают с `unit.verificationBindings.material`.
- `routes:[{unitId,edges,evidence}]`: каждый edge сохраняет parentCompItemId,
  childCompItemId, layerId/layerIndex, startTime/inPoint/outPoint/stretch/remap,
  geometry, static footprint и **transform** (anchorPoint/position/scale/rotation/
  opacity). Отсутствие route transform — insufficient, а его дрейф — failed.

Каждый observation имеет receipt:

```text
evidence: {
  schema: 'ae-agent-montage-post-run-read.v1',
  readId: UUID, phase: 'after_run',
  runId, actionId, proposalRevision, projectId,
  planSha256, unitContentHash, observedAt, stateSha256
}
```

projectId = sha256(normalizeProject(projectFile)); planSha256 относится к точному
native prepared plan, unitContentHash — к compiler unit. stateSha256 =
`observationHash(observation)`: canonical hash всех фактов без evidence.
observedAt должен быть не раньше native run.finishedAt. Помимо времени обязательны
exact run/action/revision/project/plan/unit bindings; старый receipt нельзя
перенести на новые факты. Для одного unit/run должно быть ровно одно наблюдение
каждой цели, проекта, материала и маршрута.

`bindPostRunObservation({record,unit,project,observation,readId,observedAt})`
возвращает `{ok,observation? ,code?}`; server adapter передаёт собственные read ID,
время и факты после реальных читателей. Экспорты `observationHash` и
`freshObservation` проверяют форму/привязку. Constructor не аутентифицирует
caller claims и не создаёт store/status/runner.

Технический pass требует весь набор fresh AFTER-run фактов. Используются
штатные `verifyPlaceholderReadBack`, `verifyPlaceholderCoverage` и
`reconcilePlanRun({record,project:{file},freshReadSteps})`. Missing/stale данные
дают insufficient; подтверждённый material/route/target/project drift — failed.
Дополнительные narrow `freshReadSteps`, если нужны, имеют тот же receipt contract.

### Reconciliation и оставшаяся работа

Переданный reconciliation не authority: стандартный отчёт сравнивается с заново
вычисленным результатом по independent reads. M4 может добавить рядом
`montageReadBack`; при сравнении исключается только это поле, а стандартные
schema/runId/sameProject/status/steps/replayAllowed/originalError сохраняются.

Applied шаг никогда не попадает в `remainingSteps`. Только явное native
undelivered/preMutationRejected доказательство даёт not_applied original index.
Missing executed step остаётся в `unresolvedSteps`, даже если желаемое состояние
впоследствии видно. Unknown блокирует dependents; не подавляет результаты
проверенных независимых units. Original execution error и dryRun сохраняются.
`replayAllowed:false` всегда, remaining — описательный список; пересборка нужна
от фактического состояния, без слепого повторения старого плана.

Отсутствующий record сам по себе не разрешает proposal. Для действительно
непредложенного unit server adapter может передать `readBack.baseline` с полным
свежим M1 input и `unexecutedUnits` с внутренним proof
`ae-agent-montage-never-proposed.v1`: unitId/contentHash/planSha256/projectId,
manifestHash/materialsHash/evidenceHash, phase:'current_baseline', observedAt
и serverConfirmedNeverProposed:true. Baseline заново компилируется; точный план,
хэши и observations timestamp должны совпасть, а baseline следует за известными
finished runs. Server подтверждает отсутствие proposal по своей истории;
public boolean не является полномочием. Dependents требуют completed parents.

### Визуальная приёмка

Pure summary возвращает `artisticAccepted:false` и `not_established` даже для
полного списка кадров с fake SHA, matching stateHash и заявленным accepted.
Устаревшие stateHash отмечаются pending/stale_png_rejected. Для художественной
приёмки нужно отдельно использовать существующий visual owner API с validated
owner/receipt, full frame/state/material/image bindings, paired official views
и конкретными observations. Нового viewer или альтернативного authority нет.
Summary completed/ok означает техническую сверку и не означает принятие artwork.

M3 smoke: `node scripts/montage-summary-smoke.js` — 96 адресных offline случаев.
Они проверяют actual pure modules с synthetic native-shaped facts, а не live AE.

## M4: read-only tool и штатное исполнение unit

`build_montage_pipeline_plan({manifest,preparedMaterials,budgets})` и recipe
`montage-pipeline-plan` в `build_solution_plan` используют один server adapter.
Public schema запрещает дополнительные верхние поля; bounded structural preflight
и strict nested keys отклоняют client observations/usage/verified до native/fs reads.
Сборка возвращает preview compilation, не proposal и не общий runner.

Сервер наблюдает saved project file, Project Intent key/revision (включая 0),
bounded inventory с `locked`, usage, current/planned source metadata, target и
каждую route edge. Узкий native reader дополняет existing geometry фактической
opacity и проверяет наличие всех transform properties, keys/expressions, effect
group и обеих matte roles — consumer и producer. Отсутствующее свойство остаётся
unknown; оно не становится `false`. Dependency scope вычисляется из native
current sources/target IDs и planned imported sources, затем M1 проверяет graph.

Каждый singular unit проходит `validateAgentPlanWithRepair(...,{repairPlan:false})`
и обычный `guardPlaceholderPlan`. Для release DAG только preview usage получает
симуляцию предыдущих units; protection, identities, geometry и policy читаются
заново. Policy hash включает stable accepted snapshots, group mappings и
constraints, исключая presentation `acceptedAt` и review logs. Namespace хранит
intent/material/provenance/route/verificationBindings/readBudgets; contentHash
включает его до добавления self `unitContentHash`. Final plan SHA остаётся отдельной
привязкой обычного runner. `targetProject.file` включён в preview для exact plan
binding через штатный proposal.

Hash budgets считаются на всю read-only сборку: initial full reads и final full
rehash используют общий counter bytes/requests. Проверка идёт последовательно
по одному файлу и останавливается на первой ошибке. Preview guards повторно
используют initial material facts только внутри этой read-only операции и при
совпадении native source records. Финальный rehash и повторное чтение всего
target/route scope обязательны. При ceiling 32 full read requests каталог из
более 16 материалов возвращает budget blocker; массив не усекается. Proposal,
run preflight и каждая запись всегда выполняют свежий full verifier, включая
native path authorization до filesystem, realpath containment и pre/fd/post
identity. Stat cache, file locking и in-memory project revision не заявляются.
В одном mutating run используется transient counter для preflight и каждого
setter guard; заранее проверяется стоимость `byteLength × (1 + mutatorCount)`
и число reads. Предсказуемое исчерпание блокируется до первой записи. Это локальный
counter данного run, не новый persistent store. Proposal и reconciliation имеют
отдельные operation budgets; стандартная bounded sentinel read при неожиданном
росте файла остаётся детектором ошибки, не partial hash.

Unit передаётся отдельно в обычный proposal → dry-run → grants/confirmation → run.
Guard работает и перед idempotency early return. Перед очередной записью target
должен совпасть с точным доказанным prefix ранее completed steps текущего run;
manual переход к будущему desired state не является допустимым prefix. Штатные
runner `verifyAfter/idempotencyKey/idempotencyScope` принимаются M3 только при
exact binding к persisted validation safeArgs; semantic args не меняются.
Closed unit chain допускает только existing replace_source → timing → optional
static framing → placeholder read, с одной namespace target/source identity и
согласованными intent/expectedReadBack args. Пересчитанный caller digest не даёт
права добавить create/effect или запись в другую цель.

`reconcile_plan_run` аддитивно возвращает `montageReadBack.projects/targets/materials/routes`.
Все facts — после-run actual native/file reads, без expected fallback. Время receipt
фиксируется после завершения readers; future timestamp не синтезируется. Material
receipt требует двух bounded full reads (actual digest + existing verifier); reads
и bytes ограничены budgets текущей reconciliation операции. Read errors дают
missing/insufficient, известный drift — failed. M4 project policy binding обязателен,
final timing/static transform/source metadata сверяются с precision `1e-6`, без
широкого окна старого placeholder preview. Native `set_layer_time_range` response
аддитивно содержит actual `comp.itemId` для штатного reconciliation identity check.

`npm.cmd run smoke:montage-library` проверяет recipe/catalog contract.
`npm.cmd run smoke:montage-bridge` запускает isolated daemon и выполняет настоящие
emitted scripts в VM-панели: read-only build, proposal/dry-run, три разные записи,
stored run, reconciliation и actual M3 technical pass; затем bounded input,
authorization/budget, missing native properties, project/material/target/route
drift и read errors проверяются теми же readers. Официальный stdio MCP adapter
того же fixture проверяет server proposal/dry-run pins и no-grant/direct negatives.
Это offline proof; artistic
acceptance остаётся `false` и требует отдельного existing visual owner API.

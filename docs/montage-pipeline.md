# Детерминированный монтажный конвейер V1

M1 — чистая offline проверка readiness. `validateMontageManifest({manifest, materials,
observations, budgets})` использует существующие `buildSourceUsageMap`,
`checkPlaceholderAssignments`, `buildPlaceholderPlan` и framing helper. Функция
не читает медиа/AE, не исполняет планы и не подтверждает художественную приёмку.
Public integration и material reader относятся к следующим milestones.

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

Адресная offline проверка: `npm.cmd run smoke:montage-manifest`. Она вызывает
реальные pure modules с synthetic native-shaped fixtures; AE/CEP/providers,
текущий AEP, M5 и этап 3 не используются.

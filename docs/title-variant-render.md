# Native render вариантов титра

Все варианты используют одну общую композицию с текстовыми слоями. `rootCompItemId`
указывает композицию рендера, `variantCompItemId` — общую текстовую композицию;
они могут совпадать. `controlledLayerIds` — полный явно заданный набор текстовых
слоёв, `activeLayerIds` — видимая группа одного варианта. Инструмент не создаёт
композиции, не клонирует титры, не переименовывает слои и не сохраняет AEP.

Из анализа Titles использованы идеи переключения `enabled`
и восстановления исходных флагов слоёв/очереди. Отправка в AME не доказывает snapshot выбранной видимости;
поэтому этот контракт поддерживает только синхронный native Render Queue.

## Порядок работы

1. Прочитать `inspect_title_variants` с точным named `expectedProjectFile`, ID обеих
   композиций, `controlledLayerIds` и `variants[{variantId,activeLayerIds,outputFileName}]`.
   Инспекция возвращает snapshot, SHA-256 `stateHash`, фактические слои и очередь.
   Она не добавляет элемент в очередь ради получения шаблонов. При пустой очереди
   возвращает `existing_queue_template_carrier_required`: через существующий
   защищённый `add_comp_to_render_queue` можно явно создать template carrier,
   затем повторить инспекцию. Его исходный `render` также будет восстановлен.
2. Подготовить новый typed plan для одного варианта: checkpoint/edit session,
   один `render_one_title_variant`, затем `inspect_title_variants` с полученным
   `attemptId` (можно через result binding). Использовать свежий `expectedStateHash`,
   точные имена существующих render/output шаблонов и `range{startFrame,frameCount}`.
   Предварительный checkpoint нужно подготовить до получения окончательного hash,
   если его создание меняет native revision. Отдельного dedicated builder нет.
3. Выполнить `propose_ai_agent_plan`, успешный dry-run текущего payload и ручное
   подтверждение в CEP. Для каждого следующего варианта нужны свежая инспекция,
   новый proposal и новое уникальное имя файла. Прямой/admin/autonomous вызов
   отвергается внутри модуля до native delivery. Клиент не может подделать grant.
4. Проверить `renderReceipt` и независимое чтение. Только `terminal: DONE`, точная
   привязка attempt/run/action и восстановленные состояния подтверждают native
   completion. Существование файла само по себе не является подтверждением.

## Ограничения и неизвестный исход

Выход — один MOV/AVI внутри существующего generated render root. Запрещены
абсолютные/вложенные пути, Win reserved имена, trailing dots, case aliases,
перезапись, symlink root и image sequence templates. Поддерживаются QuickTime/AVI
output modules, формат соответствует расширению. После применения шаблона
`postRenderAction` принудительно устанавливается в `NONE` и сверяется:
импорт результата, замена usage и установка proxy не выполняются.
Имя шаблона не подтверждает DXV, качество High или alpha.
Нужны stable native layer IDs и `app.project.revision`. Variant comp должна
встречаться в root graph ровно один раз, по включённому пути. Solo, controlled
guide/locked, текстовые expressions и неоднозначные графы отвергаются.
Здесь проверяются ID и видимость; художественный layout требует отдельного
просмотра кадров по действующей text-layout policy.

Controlled text может иметь прямой `ALPHA` track matte через стабильный
`trackMatteLayer` в той же variant comp. Producer должен быть отдельным
noncontrolled слоем с source `CompItem`, `isTrackMatte=true`, без собственной
matte-связи, solo, guide или locked. Допуск в comp graph относится только к этому
точному producer layer в его owner comp; другой слой с тем же source остаётся
отдельным фоном.
Producer может быть выключен: инструмент сохраняет его `enabled` и никогда
не переключает matte, фон, timing, transform или masks. У controlled text
shape/text producers без source и footage producers не поддерживаются.

В каждом посещённом comp выполняется такой же локальный проход для immutable
`AVLayer` с source `FootageItem`, который напрямую использует ALPHA producer с
source `CompItem`. Consumer также остаётся immutable; сохраняются его identity,
enabled/roles, footage metadata (включая alpha interpretation), timing и transform
definitions. Повторные посещения comp и несколько consumers одного producer
дают одну dependency на пару `(ownerCompItemId, consumerLayerId)`. Связь с другим
comp, consumer с source comp, matte chains, parent/3D/separated transforms, proxy
source, неполные определения, другие matte types и циклы отвергаются. Прежде
допустимые uncontrolled footage/shape producers не получают новых dependency
полей или дополнительных ограничений: exception относится только к producer
с source comp, которому нужен допуск в существующем comp graph.

Только snapshot с указанными зависимостями получает `matteDependencies`: direct fill link/type,
producer identity/flags/enabled, source comp metadata, timing и определения
двумерных transform обоих слоёв. Для анимации читаются key values, interpolation,
temporal ease и spatial metadata; expressions читаются как definitions. У static
expression base берётся `valueAtTime(0,true)`, то есть постоянное pre-expression
значение без keys. Текущее `comp.time` и вычисленный animated/expression value
не используются. Legacy unmatted и ранее допустимый footage/footage matte
snapshot и его hash сохраняют точную форму.
Зависимости входят в `stateHash`, сверяются перед delivery, после native render,
после восстановления и независимым exact attempt read-back с durable baseline
и receipt. Drift не считается успешным DONE и не вызывает matte repair writes.

Перед delivery сервер эксклюзивно записывает и fsync-ит per-output reservation
с полным attempt. Она сохраняется даже после ошибки/отмены и блокирует повтор
той же canonical destination после restart. Это per-output guard, а не глобальная
блокировка всех новых filename после неизвестного исхода. Операционное правило:
после unknown остановить этот workflow и сверить результат перед новым proposal;
не менять filename для обхода неизвестной доставки.
`timeoutMs` ограничен 1000–600000 и применяется только к этой
команде: timeout не останавливает AE. Не повторять рендер; прочитать status,
`reconcile_plan_run` и инспекцию exact attempt. Без сохранённого native DONE receipt
исход останется `unknown`, даже если файл или DONE item обнаружен позже.

Native body сохраняет все existing queue `render` flags и controlled `enabled`,
изолирует чужую очередь, добавляет ровно один owned item, рендерит и восстанавливает
состояния в `finally` при success/error/cancel. Owned item остаётся выключенным
для точного read-back, удаления по имени/пути нет. Ошибка restoration не считается
успехом. При сбое процесса/AE до выполнения finally восстановление не доказано:
нужна инспекция и отдельное ручное исправление. Unknown не разрешает replay.
Существующие placeholder/inherited ownership guards сохраняют fail-closed режим;
неизвестный footprint в защищённом проекте может дополнительно заблокировать plan.

`mediaProof`, `visualProof`, `alphaDxvProof` отделены от native completion:
здесь они соответственно `not_inspected`, `not_reviewed`, `not_verified`.
Для приёмки медиа отдельно нужны проверка контейнера/codec/alpha и просмотр кадра.

Офлайн проверка: `npm.cmd run smoke:native-title-render`, ES3 parse + fake AE VM,
разные группы видимости, чужая очередь, успех/error/cancel, stale preflight,
manual auth negatives, timeout/restart/replay и строгие semantic/reconciliation
negatives; direct ALPHA/shared precomp/disabled producer, nested footage consumer,
повторные graph visits и общие producers, definition-based keys и expressions,
ошибочные link/type/roles/cycles, dependency drift и tampered receipts.
VM и transport fixtures не доказывают живой рендер или alpha/DXV.

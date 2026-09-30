# Принятые ручные плейсхолдеры

Кнопка CEP «Принять выбранный плейсхолдер» сохраняет авторитетный снимок
выбранного видеослоя. Сервер сам читает текущий проект, стабильные `compItemId`
и `layerId`, источник с полным file path, timing и статические transform values.
Индексы служат адресными подсказками и не входят в содержимое снимка. После
перестановки items/layers сервер повторно разрешает IDs и обновляет адреса тела
setter. AE проверяет эти адреса ещё раз до открытия undo group.

Setter identity использует только `expectedCompItemId`, `expectedLayerId` и
`expectedSourceItemId`. Aliases `compItemId`/`layerId` в setters и `sourceItemId`
в `replace_layer_source` отвергаются в общем gate и в actual JSX до undo:
проверка и тело операции не могут выбрать разные targets по ID и индексу/name.
Read-only `get_layer_details` продолжает поддерживать свои `compItemId`/`layerId`.

Флажок «Защитить выделенные свойства оформления» читает реальные selected
properties того же слоя: максимум 12 свойств, глубина пути до 8, matchName и
propertyIndex для точного свойства. Альтернативный API input `protectedProperties`
тоже задаёт только пути: значения всегда читает сервер. Ключи, expressions,
separated dimensions, нечисловые структуры и неизвестный source отказывают с
причиной unsupported. Базовый timing — `stretch=100`, remap выключен. Accepted
source должен быть доступным video footage; still/audio/solid/shape/text не
принимаются как видеоплейсхолдер.

«Снять защиту» снимает снимок только реально выбранного слоя. Endpoint
`/placeholder/protection` требует существующие отдельные panel credentials и
реальную authenticated panel role; automation/admin credentials не могут принять
или снять защиту. Клиентские `target`, `snapshot`, `acceptedPlaceholders` и
`allowProtectedChanges` отвергаются. MCP не предоставляет write API для acceptance.
Принятие без saved project identity возвращает `project_identity_unavailable`;
проект ради ключа не сохраняется.

Состояние хранится в существующей Project Intent Memory как typed runtime
`projectState`, по SHA-256 canonical saved project path. Файл
`project-intent-state.json` находится в ignored runtime directory
(`AE_BRIDGE_STATE_DIR`, иначе `.codex-runtime/project-intent`). Tracked advisory
registry не содержит пользовательские пути или снимки. Запись идёт через
temporary file, fsync и atomic rename с revision check. Повреждённый файл не
сбрасывается в пустую память: мутации отказывают `project_state_corrupt`.
Снимок не является защитой от администратора, редактирующего runtime filesystem.

Проверка встроена в существующие proposal, runner перед первой мутацией,
`callToolLogged` перед каждой/direct мутацией и AE script до undo. Для
`replace_layer_source`, `set_layer_time_range`, `set_layer_transform` и
`set_property_value` изменение защищённого значения даёт conflict. Присвоение
того же значения разрешено, если свежий read-back ещё совпадает со снимком.
Защищаются relink общего footage source и source/timing всех ancestor routes
(глубина 16, максимум 256 зависимостей). Drift содержит конкретные изменившиеся
поля; индексный drift сам по себе не является content conflict. Свойства,
адресованные и с propertyIndex, и через matchName, не обходят защиту.

Поддерживаемые setters на другом известном слое и известные additions разрешены.
Raw JSX и остальные потенциально затрагивающие writes при активной защите
отказывают с `unknown_protected_mutation_footprint`: неподдержанный footprint не
выдаётся за сохранение ручных правок. Неизвестные будущие targets и изменения
ancestor transform/property также требуют отдельного поддерживаемого контракта.

CEP явно связывает выбранный source с group/performer ID. Filename не определяет
группу. Mapping сохраняется с `user_confirmed`, `confirmed:true`. Controls для
distinct groups и запрета пересечений сохраняют IDs выбранных targets в том же
projectState. Выполнение плана проверяет свежий compact inventory сервера и
production usage helper, включая candidate source, повторные импорты одного
файла, structural occurrences и существующие использования. Client usage,
group claims и `selectedTargets` не заменяют пользовательскую политику.
Проверяются существующие и внутрипакетные half-open source intervals; adjacency
разрешена, реальный overlap отказывает. Shared/repeated precomp targets,
incomplete/unknown media mapping, stretch/remap и cycles не дают pass.

Read-only tools зарегистрированы в actual catalog: `get_placeholder_protection`,
`get_placeholder_usage`, `check_placeholder_assignments`. `build_placeholder_plan`
сохраняет `expectedReadBack`, frame review, assignments и optional constraints
в самом plan. При активной серверной защите/constraints его preview тоже проходит
свежий gate. `manualProtection`/`usage` input — только advisory; авторитетные
accepted snapshots берутся из runtime memory. `get_layer_details` принимает
stable `compItemId`/`layerId` вместе с address hints. Placeholder projection
содержит только bounded static transform/property values и file identity;
read-back verifier проверяет IDs, source/timing и запрошенные protected values.

Offline proof: `placeholder-protection-smoke.js` выполняет production memory,
helper, generated JSX и independent read-back в синтетическом VM. Isolated
`placeholder-protection-bridge-smoke.js` использует существующий daemon/HTTP
fixture и ограниченную fake panel: acceptance role, fresh usage, proposal,
stale/per-step drift, direct/raw enforcement и актуальные адреса. Это не live AE
acceptance; установленная CEP копия, AEP, реальные медиа и настройки не менялись.
Общая mutation/verification state machine относится к следующему этапу.

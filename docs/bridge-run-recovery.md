# Результат запуска и независимая сверка

Обычный runner сохраняет исходный plan, проект, фактически разрешённые args,
steps/results/errors и привязанные команды рядом с existing step evidence:
`logs/evidence/plan-runs/<runId>.json`. В isolated daemon используется его собственный
log root. Atomic replace/fsync, schema/hash, UUID-only filenames и budget16MiB
защищают от частичного/неполного чтения; повреждённый либо отсутствующий record
не доказывает, что изменение не произошло. Это evidence store, не новый runner
и не разрешение на исполнение. Завершённый run не переписывается сверкой.

Команда связывается с шагом до доставки и имеет role mutation/readback/checkpoint.
Queued/leased/submitted/terminal stages сохраняются независимо от executedCount.
Типизированный mutationResult записывается до последующего read-back. Поэтому
timeout проверки не превращает уже подтверждённую мутацию в «не началась».
Submitted timeout и исключение после частичной записи остаются unknown до чтения;
authoritative отказ до accepted submit позволяет not_started. Исходные commandId,
lifecycleState, timedOutFrom и phase не теряются в catch.

`reconcile_plan_run({runId,stepIndices?})` — typed read-only tool. Он принимает
только server run ID/необязательный набор номеров шагов; читает проект до и после
адресных allowlisted reads. Targets/desired values приходят из record, stable IDs
переживают смену индексов. Сверка подтверждает текущие postconditions и никогда
не делает причинный вывод «setter точно не запускался» из одного несовпадения.
Command receipt retention/restart не заменяют сохранённые evidence. Supported
setter postconditions перечислены в `docs/plan-run-recovery.md`; raw/create и
неподдержанные footprint остаются unknown. Нет automatic mutation replay.

Точный `get_property_value` возвращает identity/propertyPath/value и requested-time
key evidence; existing effect read дополнен stable IDs. Setter transform/property/
effect проверяет и разрешает IDs в actual JSX до undo. Composite property identity
сохраняется, effect undo закрывается в finally. Existing generic postverification
этих трёх setter использует независимые typed reads и semantic checks.

CEP показывает раздельные execution/mutation/verification/coverage и исходную
ошибку. «Сверить результат» передаёт только run ID; lock/error/disconnected flow
без повторов. Не проверенный mutating run останавливает Hardcore retry. Чужие
accepted snapshots не освобождаются; protection bulk binding использует те же
expected stable IDs, что actual setter.

MCP autonomous run требует полный proposal reference/hash/preview/risk tuple.
Пропущенные pins дают ранний `proposal_required` без AE-команд; exact matching,
current proposal, expiry и replay остаются в существующем runner. Активная сессия
не разрешает исполнение клиентского плана без server-owned proposal.

Validation: production generated JSX VM, обычный confirmed isolated daemon и
actual panel functions VM. Проверены timeout после записи, queued cancellation,
readback timeout, partial setter/finally, manual/index/project drift, missing/
corrupt records и restart. Пользовательский AEP и установленная CEP не изменялись.

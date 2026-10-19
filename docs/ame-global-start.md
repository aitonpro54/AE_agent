# AME: запуск общей очереди

## Два независимых пути

1. **Задание агента.** При закрытом AME разрешён запуск AME существующим
   инструментом и продолжение staged per-job пути с собственной проверкой задания.
   `prepare_ame_title_enqueue` сохраняет точное staged поручение (source, preset,
   output, range, ensure args) и выдаёт план, не меняя AME. Default recipe —
   `shared_queue_v1`; прежний enqueue default сохранён. Отдельный proposal/dry-run/
   execute относится к single-step ensure plan. `continue_ame_title_enqueue`
   принимает `stageId` и `ensureRunId`, проверяет сохранённый завершённый ensure,
   независимый transport/read-back/semantic proof и exact process/session, после
   чего возвращает существующий single-step enqueue plan. Оба prepare/continue
   вызова сами ничего не запускают и не отправляют. Каждый mutating шаг имеет
   отдельные proposal, dry-run и execute gates.
2. **Общий запуск.** Только отдельное явное поручение запускает `runBatch` для
   всей готовой очереди AME. `start_ame_queue` требует `globalQueue:true`, точные
   target/process/session pins и уникальный `startRequestId`; `verifyAfter:false`
   отклоняется. Результат сверяется
   через `get_ame_queue_start_status` и retained native nonce read-back.

Per-job acceptance остаётся неизменной и фиксируется один раз после enqueue.
Автозапуск процесса AME не создаёт повторный enqueue, не перечисляет очередь,
не читает и не редактирует пользовательские jobs и не запускает рендер. Общий
start может затронуть все готовые задания, включая пользовательские, только по
отдельной явной команде; census и предварительное чтение содержимого очереди для
разрешения запуска не выполняются. Прежние guards ручного/title START сохраняются.

## Отказы и статус

Ensure допускает штатный запуск только при доверенной проверке бинарника
`Valid`. `HashMismatch` требует ручной работы в CEP; обхода проверки нет.
Неуспешный или неизвестный ensure не выдаёт enqueue plan, а continuation не
повторяет ensure. Потерянный/неизвестный результат запуска сверяется по exact
request/status и retained proof; повторять enqueue или start вслепую запрещено.
Durable once intent и UNKNOWN blockers учитывают прежние START, поэтому новый
request ID сам по себе не обходит уже принятую команду или unresolved outcome.

Если потерян только outer reply после сохранённого terminal sender, результат
сверяется по сохранённому run. Если потерян именно native callback, исход остаётся
`UNKNOWN/noReplay`, в том числе после restart. Автоматического retry нет;
`get_ame_queue_start_status` не заявлен как полная сверка native callback.

## Приёмка реализации

Offline implementation завершена: production API `prepare_ame_title_enqueue`,
`continue_ame_title_enqueue`, `start_ame_queue` и `get_ame_queue_start_status`
реализованы. `ame-queue-control-smoke.js` — PASS, 17 groups; проверяет production
executor/native sender, AME VM, semantic checks и daemon authority.
`ame-enqueue-sequence-smoke.js` — PASS, 6 groups для ensure/startup/transport/
enqueue/semantic VM; `runBatch` в нём не вызывается. Также PASS: `ame-running`
27, acceptance 9, title-semantic 18, product-dispatch 25, shared-queue 11,
product-read 10, source-read-fence (`--expose-internals`), `node --check` 11 JS,
`check:rules` и `git diff --check`. Независимый final review и last-delta review —
GO, открытых P1/P2 нет; исправления покрыты fixtures.

Реализация и offline checks закоммичены как `fcbb8cb`. Первая штатная попытка
restart в 11:45:05Z завершилась STOP `owned_supervisor_started_process_exited`,
`replayAllowed:false`: старый PID22484 вышел с held-exit proof (`WAIT_OBJECT_0`,
code 0), новый незарегистрированный PID14184 также завершился; registration
осталась старой, listener3456 отсутствовал. Offline cause: долгоживущий MCP
controller cache v84 получил reservation/source `e4a8a341…`, а свежий collector
v86 — `2a7028e2…`, отказ `owned_supervisor_startup_binding_invalid` до listen.
Fresh-v86 offline reservation/validator PASS не означали live startup.

По явному поручению пользователя от 19.10 root выполнил fresh CLI reset один раз:
`node mcp-server/owned-runtime-product-session-reset.js reset` — PASS,
operation `48ebe813-d4bf-4166-b1a7-d6e97a051ac4`, generation
`f735709b-0a90-4c41-bf73-8d3763a8d33e`, pending preflight → reset_active.
Новый runtime PID3352 стартовал в 11:57:56.322Z, source
`2a7028e2595dbf91dcd779e2851c2d1bfd040bf5a0aa26d72c677acdad6680b5`, git
`17f672e` с feature commit `fcbb8cb`. `wait_for_bridge_state` connected_and_idle
и фактические `get_bridge_status` (Connected, autonomy active, pending0,
inflight[], editSession=null) прошли. `get_project_info` PASS: `titr_all.aep`,
revision12968664, 465 items, active comp `TITR_ALL_VARIANTS_FHD`.

В runtime catalog присутствуют четыре новых API; подтверждён только `tools/list`,
все четыре вызова — 0. Queue/job STATUS/census, enqueue, AME launch, START и render
также 0. Предыдущий failed restart `caad…` / generation
`22273472-2a7e-403a-a155-0207f23fcc84` сохраняет `UNKNOWN/noReplay`; reset не очищал
его историю. Direct MCP lifecycle collector всё ещё кэширует v84; дальнейшие
служебные операции восстановления выполняются fresh CLI без дополнительных
restart. Runtime reset и доступность команд применены, но live AME cold start,
global `runBatch` и render не принимались и не проверялись.

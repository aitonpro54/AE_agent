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

## Сверка завершённого generated PNG export

Для ограниченного `save_comp_frame_png` recovery использует существующий
`plan.reconcile({runId})` и unique lookup исходного `plan.run`, включая случай,
когда панель уже приняла recovery, а transport-проекция ещё не завершена.
Сервер проверяет исходную запись, terminal native command и восстановление
resolution, свежую project/comp/project скобку и PNG по filename из записи с
проверкой containment и полных PNG bytes. Отсутствующий или неполный файл после
доказанного terminal native результата даёт `terminal=failed` и artifact
`missing|invalid`; это не переписывает прежние unknown receipts и не означает
визуальную или художественную приёмку.

Recovery envelope сначала атомарно сохраняется сервером. Панель затем принимает
его через trusted handler и сохраняет private adoption, после чего transport
отдельно проецирует подтверждённую ссылку. Sidecar панели после reload остаётся
unconfirmed до свежей canonical server validation; missing/corrupt evidence,
несовпадение binding, storage failure и чужой controller lock fail closed.
Перед private adoption callback проверяет актуальность lifecycle epoch/generation;
устаревший callback после drift не может сохранить original recovery.
`replayAllowed=false`: сверка не возобновляет старый plan и не разрешает следующий
execution. Клиентские proof/terminal/release assertions, reset и raw/create/import/
save/destructive/Hardcore остаются вне recovery-контракта.

### Двухэтапное восстановление транспорта

Если canonical P1 reconciliation валидирует допустимый terminal PNG run, но bridge
отключён, сервер возвращает отдельный `transport_prerequisite`: это ещё не recovery
receipt, не освобождает исходный unknown guard и не разрешает replay. Trusted panel
handler сохраняет завершённый P1 receipt при прежних epoch/generation и только после
успешной записи начинает private same-config transport с новым lifecycle identity.
При сбое записи, изменении lifecycle/config, timeout или истечении scope продолжения
и автоматического повтора нет.

Handshake обязан быть пустым. Временный server-owned scope привязан к точным run,
исходному request, panel connection и recovery generation. В recovery polling
разрешена доставка только новых `get_project_info` и `get_comp_details` команд,
помеченных этим scope; чужая queued/inflight команда, неверный или потерянный после
restart scope блокируют выдачу без обычной queue fallback. P2 — отдельный новый
`plan.reconcile` context с повторной canonical validation и одним свежим
project/comp/project окном. Только полный durable receipt вместе с точной private
panel adoption снимает targeted guard. После этого обычный `bridge.connect` может
вернуть polling через существующие gates; автоматического продолжения plan нет.

Validation: `generated-export-reconnect-smoke.js` проверяет production HTTP queue и
handlers в isolated full-panel VM: P1 без native dispatch, handshake, точные три P2
read, no export/replay, сохранение чужих команд и normal-poll gates. Это offline
evidence. Source correction закрывает гонки при poll error и scope expiry: transport
invalidates lifecycle, поэтому held P2 response не сохраняет adoption. Reconnect smoke
также проверяет selector: connected unknown setter выполняет только текущую typed
postconditions-сверку и сохраняет guard без recovery/release/replay; disconnected
setter не вызывает connect или native reads. Offline source/integration checks passed.

### Ограниченная live-проверка — 9 октября 2026

Для исходного run P1 завершился durable `transport_prerequisite` без снятия guard.
После empty handshake новый P2 сделал шесть свежих reads: project, четыре comp и
project. Canonical recovery receipt сохранён и принят: `terminal=failed`, причина
`generated_png_missing_after_native_terminal`, артефакта PNG нет, replay запрещён;
targeted guard снят после recovery. Затем обычный `bridge.connect` завершился, а
независимый `get_project_info` подтвердил тот же `titr_all.aep`, 448 items и revision
12896026. Исторический исходный receipt остался `unknown` (`ok=false`) со ссылкой на
отдельное canonical recovery; повторного экспорта не было.

Live runtime: commit `4d7dc119f41c689a9470079e9ba6ccf39594168e`, PID 28352,
source SHA-256 `282ff58144e974464479f6475b5eb67a3a8156ab2bfe43bc9ca77c3efc81ebc1`;
installed assets совпали. Полные request/recovery IDs и read evidence — в
`.codex-runtime/export-recovery-20261009/live-report.json`. Это bounded acceptance
восстановления результата как failed/missing, а не успешного PNG экспорта: файл не
появился, визуальная/художественная приёмка и правка титров остаются pending.

Validation: offline production-runner/adjudicator, full-panel VM и isolated
transport fixtures покрывают terminal export, partial projection, reload,
fail-stop и no-replay. Live activation/read-back, исходный run recovery и просмотр
PNG остаются отдельной проверкой; физическая полнота PNG не заменяет визуальную
приёмку.

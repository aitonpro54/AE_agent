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

## Точный recovery сборки общей композиции титров

Отдельный профиль `common-title-assembly` распознаёт только сохранённый run
`c6d0acfb-5c05-4897-80a9-e509ab0a47cf`, исходный CEP request
`cb5c3b53-5443-474e-93df-aa8210758886` и raw BODY SHA-256
`9d4bfaeb6dcf9ed0695ee009abb47ccbaf888b2ea775568df5572771e2e22262`.
Другие raw/create runs продолжают давать unknown в обычной сверке. PNG-контракт
не расширен. Клиент передаёт только исходные run/request selectors; baseline,
script, target IDs, proof и clear/release assertions запрещены.

Inline JSON baseline разбирается без eval из канонического record. Проверяются
envelope/hash, action/proposal/payload/plan/checkpoint, submitted timeout command,
lease, исходный transport и точная **redacted** server run projection панели.
Серверный readonly native verifier сам выводит unique common comp, 11 принятых
текстов и mapping девяти base layers в итоговые 19 layers. Он сверяет текущее
состояние/text исходников с inline baseline, полные текущие source/copy trees
(character-range styles, transform, effects, text animators, markers, masks,
expressions и key definitions), visibility/order/parent/matte relations и
project/revision bookends. Animated/evaluated values не семплируются; static base
читается pre-expression при нулевом времени. Limits: 11 source comps, 19 common
layers, 50000 property nodes и 20000 keys; неполные key metadata fail closed.

Durable envelope имеет отдельный статус `verified_current_state`. Это проверка
текущих copies и сохранённого baseline state/text. Полные pre-mutation trees
исходников не сохранялись, поэтому историческая неизменность всех styles/effects
не доказана. Исходные run/transport остаются `unknown`, native DONE не создаётся,
старый script не повторяется, replay запрещён. Private adoption освобождает только
указанный request guard; остальные операции сохраняют manual CEP gates.

### Maintenance loader для старой панели

До restart/install единственный live-контроллер делает свежий обычный
`get_project_info` и получает его **completed command UUID** через bridge status.
Барьер должен иметь тот же старый panel connection/generation/lease owner и
submitted/completed timestamps после первоначальной raw submit. Reviewed BODY
синхронен и не содержит schedule/evalScript/process lanes. Serial `executeCommand`
и завершённый поздний native барьер доказывают возврат старого BODY, сохраняя
неизвестным его утраченный receipt. Одних JSONL событий для этого недостаточно.

Затем из корня репозитория:

```powershell
node scripts/common-title-assembly-maintenance.js capture --barrier-command-id <completed-command-uuid>
```

Loader сам читает authenticated `/results/<id>`, status, canonical records,
точную installed панель и её API. Он сверяет загруженные старые JavaScript sources
через read-only CDP Debugger с Git checkpoint runtime, не исполняя их. Старое
`state.busy` включает unknown guard; отдельная availability `plan.reconcile` в
существующем catalog доказывает отсутствие `panel_busy`/`action_in_flight`.
Capsule fsync-ится в `logs/evidence/common-title-assembly-recovery/<runId>/`;
действует 120 секунд, guard остаётся на месте. Auth/config и storage сохраняются.

Только после успешного capture контроллер выполняет уже разрешённый maintenance
restart daemon и установку согласованных CEP assets. Сам loader этого не делает.
В пределах срока capsule:

```powershell
node scripts/common-title-assembly-maintenance.js reload
```

Новый daemon предварительно валидирует capsule, неизменные credentials/config,
idle, controller lock, старую current binding, единственный historical guard и
точный installed target/assets. Reload authorization записывается до первого
`Page.reload(ignoreCache:true)` и не используется повторно. Обычный CDP reload,
reset и очистка localStorage не подходят. При unknown submit, missing/stale
barrier/capsule, изменённом target/config или storage failure процесс останавливается
с сохранённым guard; автоматического повтора нет.
После durable authorization loader получает общий controller lock по `scopeId`
и держит его через повторные server-idle, binding/epoch/generation, sole guard,
config/assets/linkage проверки до исхода `Page.reload`. Чужой lock после authorization
блокирует отправку; reservation остаётся использованной, повтор не допускается.

Новая панель загружает прежний guard как unconfirmed. Контроллер вызывает новый
`plan.reconcile` для того же run: P1 не отправляет native commands, сохраняет
prerequisite и делает пустой same-config handshake. Существующая preference
автономии должна быть явно выключена; профиль не меняет её автоматически.
Затем отдельный P2 разрешает
только server-owned `common_title_assembly_verify` в пяти минутном scope. Чужие
queued/inflight commands и потеря scope после restart блокируют транспорт.
Перед входом в P2 capsule также должна оставаться в исходном сроке 120 секунд;
пяти минутный scope не продлевает этот срок. P1 и P2 выполняются сразу после reload.
После durable native current-state envelope, private adoption и transport projection
можно отдельно выполнить обычный `bridge.connect`. Автоматического выполнения
нового render/save plan нет; native media/alpha/DXV и визуальная приёмка отдельны.

Offline checks: `node scripts/common-title-assembly-recovery-smoke.js` и
`node scripts/common-title-assembly-reconnect-smoke.js`; generated verifier ES3,
actual full-panel VM и isolated production HTTP проверяют lineage/metadata/tamper,
styles/effects/animators/keys/mattes/drift, barrier/config/controller negatives,
one-shot maintenance reservation, guard retention/restart, private adoption и
durable projection. Эти fixtures не доказывают live recovery.
# Human settlement двух подтверждённых старых guards

Для подтверждения пользователя «всё объединено, снять блокировки» предусмотрен узкий
maintenance маршрут только для request `568c1a03-1eef-4f04-806a-eaa7acaa0c20` /
run `eb28a045-048a-46ad-aa69-276302b38c73` и request
`cb5c3b53-5443-474e-93df-aa8210758886` /
run `c6d0acfb-5c05-4897-80a9-e509ab0a47cf`. Статус sidecar —
`abandoned_reviewed`; `guardDisposition=released`, `aeExecutionProven=false`,
`replayAllowed=false`. Это отдельное решение человека об admission guard.
Исходные транспортные receipts и canonical run files сохраняются побайтно.
Их `unknown`/ошибка не превращаются в успешное выполнение AE.

Перед установкой или restart выполнить `node scripts/human-guard-settlement-maintenance.js capture`
с уже настроенными `AE_BRIDGE_HOST=127.0.0.1`, `AE_BRIDGE_PORT`, `AE_BRIDGE_TOKEN`.
CLI не выводит token и не читает panel credential. Capture фиксирует свежие daemon
PID/start, единственный текущий AE PID/creation, остановку исходного AE host
PID 12528 с creation `2026-10-09T04:47:25.0963540Z`, exact CEP target/binding,
хеши реально загруженных scripts через ограниченный Debugger read, installed baseline,
desired assets и локальные/удалённые receipts/canonical runs. Все семь baseline assets
копируются в `logs/evidence/human-guard-settlement-20261010/baseline-assets`.
Разрешено обновить только `panel-actions.js` и `panel.js`; прочие assets должны совпадать.

Затем внешний контроллер при idle перезапускает только daemon из текущего checkout.
Новый daemon должен показать `humanGuardRuntime` с новым PID/start и текущим
`sourceSha256`. Runtime fingerprint включает human settlement module и maintenance CLI.
Capture действует 30 минут; новый capture, повторная авторизация или продление старого
пакета после reservation автоматически не выполняются.

```powershell
node scripts/human-guard-settlement-maintenance.js authorize --reason "Пользователь подтвердил: всё объединено. Снять ровно два старых guards."
node scripts/human-guard-settlement-maintenance.js apply
node scripts/human-guard-settlement-maintenance.js read-back
```

`authorize` отправляет authenticated automation POST
`/human-guard-settlement/maintenance`. Server повторно проверяет idle, current target,
binding, loaded/disk hashes, текущий AE process и неизменность исходных файлов;
сопоставляет captured, loaded и current runtime fingerprint. Audit записывается до
settlement и reload authorization. Доступ к lookup
`GET /human-guard-settlement/lookup` имеет только panel credential, с сохранением
обычных loopback/Host/Origin границ.

`apply` один раз резервирует `reload-attempt.json` до любых disk/UI действий,
устанавливает ровно два assets и запрашивает свежий exact target/panel state/catalog
после установки. Только после повторной проверки binding, idle и original bytes
выполняется один `Page.reload`. Crash, ошибка установки, изменённый target или
`reload_outcome_unknown` оставляют reservation занятой: **apply не повторять**.
Дальше допустим только passive read-back и отдельный разбор фактического состояния.

Новая панель получает sidecar из private trusted lookup до AutoConnect/admission;
после временного отказа допустимы три passive повтора с интервалом 2 секунды.
До успешной проверки guards сохраняются. Transport независимо читает audit/sidecar
и проверяет hashes/binding. Reload снова требует server lookup: local cache сам по
себе не снимает guard. Public ack/reset API не добавлен. Оригинальный requestId всегда
возвращает его прежний результат, без повторного dispatch. Raw/destructive/save,
checkpoint и обычные confirmation gates сохраняются.

Артефакты `capture.json`, `audit.json`, `settlement.json`, `reload.json`,
`reload-attempt.json`, `reload-result.json` — ignored runtime evidence в том же
каталоге; удалять их или journals для повторной попытки нельзя. `read-back` проверяет
обе стороны, новый panel instance, installed hashes и исходные байты. Он не выполняет
native read и не доказывает художественный результат или исторический успех AE.
Офлайн contract: `node scripts/human-guard-settlement-smoke.js` (production panel VM,
production transport, isolated HTTP; fake process/CDP/native boundary).

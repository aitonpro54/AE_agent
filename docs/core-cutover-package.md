# Пакет переключения Core

Cutover разрешён пользователем в текущей задаче. **Actual переключение pending**: offline implementation и tests не являются native/CEP/AE proof. Выпускать в production можно после independent implementation review и fresh preflight единственного контроллера. Старую сборку/checkpoint, config и installed assets сохраняем для отката.

**Активный маршрут:** [owned-loss runbook](core-owned-loss-runbook.md). Initial start и адресный preStart resume уже consumed; все команды ниже для generation1672 — исторические, их не выполнять снова. Новый replacement — normal lifecycle generation с отдельной loss authority/once/edge, closed admission до observer survival, затем fresh adoption/redirect под той же pair. Force historical/not armable. Root code rollback tag `checkpoint/core-before-owned-loss-2026-10-26` →4efc70b сохранён; это не exit proof.

Глобальные7 instruction patches уже применены адресным блоком root; receipt `743dfd4b`. Повторно применять staged глобальные copies нельзя без drift/read-back. Последующие source/global instruction уточнения ведёт отдельный назначенный writer с собственным backup/read-back. Этот пакет не создаёт нового разрешения и не требует повторного разрешения уже согласованного cutover.

## Неизменные границы

- Source `C:/Users/Ant/Documents/Codex/AE_agent`, checkpoint `checkpoint/ae-agent-before-core-2026-10-25` → `1b48076e0aa4a68f21b3229af511d9e526ed0072`; runtime code baseline `2b06e19cf52f0ab9e8c4048a3a693eddccb2a0ab`. Core `C:/Users/Ant/Documents/Codex/AE_Agent_Core`, branch `codex/core-migration`.
- Старые b7 disconnect, reset88e88472 и f92e receipts остаются legacy unchanged/UNKNOWN/noReplay. Их наличие/status/hash не Core startup/activation/admission requirement. Source process absence не exit: `oldExitProven:false` сохраняется. Старые stop/reset не повторять.
- Core получает byte-exact protected store/preference, marker с единственным final-path rebind и компактные3 typed native constraints; полные work/bootstrap/plan/native/recovery archives остаются legacy. См. `core-migration-admission.md` и `record-context.md`. Source output/AEP/job/native reservations не освобождаются новым UUID/чатом.
- Новый Core automation credential одновременно служит runtime HMAC. PANEL credential сохраняется намеренно для bootstrap, отдельно от automation. Старый source config/key сохраняется до verified own adoption. Секреты не выводить и не коммитить.
- Один writer и один live AE/CEP/runtime controller. Default Core workflow: public builder contract → deterministic build → server proposal → dry-run → подтверждение по риску → read-back. Raw/save/destructive/manual/ownership/checkpoint gates сохраняются. AME paused; новых AME работ/проверок нет.

## Исторический первоначальный протокол (не повторять для consumed case)

**Текущее partial state:** исходная operation `9c9fb972-201d-4c73-8bf2-35bd6c8596f9`, generation `1672be8d-76e4-4fa3-9994-8a750c8a2209`, bootNonce `84c4eb15-a221-4c99-84ff-a4b1d10f95cf` уже подготовлена. State/preference и installed8 опубликованы sole controller под actual pair. Единственный `start-once` отказал на directory size representation; controller штатно released. Original once/intent/policy/projection/launch-attempt/unknown/reservation/ticket сохраняются byte-unchanged. Operator reconciliation — audit, не authenticated no-Start/exit proof. Ниже шаги1–7 описывают исходный протокол; **для этой consumed case их не повторять и не создавать новые inputs/UUID**. Первоначальный preStart resume уже был единожды выполнен, generation1672 registered/current/adopted, затем later exit/cause UNKNOWN. Этот partial state исторический; active next sequence — отдельный owned-loss runbook.

1. Зафиксировать final implementation review/commit, runtime manifest, helper/Node/pwsh/adapter/daemon и8 CEP asset hashes. Адресные backups: source config, используемые внешние MCP registrations и installed8 assets; отдельно metadata bytes/object IDs защищённого state. Сохранять оригиналы и receipts в ignored cutover directory. Не копировать legacy credential/grants/registrations/journals в Core.
2. Подготовить только новые, ещё не используемые Core inputs: fresh Core config, ordinary policy coverage **ровно** `owned_daemon_lifecycle`, staged byte-exact state через существующий `core-state-migration.js prepare <один UUID>`. Missing/corrupt/pending/overridden layout/marker или explicit OFF не угадывать. Helper имеет prepare/status/rollback-status, а не authority/apply API. Source bytes не менять.
3. Выполнить fixed migration review/intent commands ниже. `authorize-current-review` создаёт отдельную closed one-shot policy `create_core_product_genesis_once` с original explicit-user reference `01a171dd-b843-7141-b28a-ae75d79ce7f1`. `prepare-genesis` закрепляет immutable once/operation/generation и ожидаемые staged state/Core assets; final publication ещё не требуется. Это устраняет цикл «publish до mutex».

```powershell
$fixedNode = 'C:\Users\Ant\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
$control = 'C:\Users\Ant\Documents\Codex\AE_Agent_Core\scripts\core-product-migration-control.js'
& $fixedNode $control inspect
& $fixedNode $control authorize-current-review
& $fixedNode $control prepare-genesis
& $fixedNode $control read-back
```

4. Запустить **сохраняемый** root-owned controller; не закрывать его stdin/terminal/process во время публикации и запуска:

```powershell
& $fixedNode $control control
```

Дождаться `actual_pair_controller_ready`, сохранить его operation/generation/owner identity. Он держит настоящие source→Core mutex в принятом порядке; JSON/Boolean/сохранённый receipt их не заменяют. Внутри этого процесса допускаются только строки `preflight`, `start-once`, `observe`, `release`. Он не принимает arbitrary roots/PIDs/receipts/force/register inputs. `preflight` до complete final state честно отказывает, не стартуя процесс.

5. Пока **тот же реальный pair удерживается**, sole controller получает fresh source native `absent/Win32Error87 + free3456`, current/registration/code/state/shared-resource и physical0/native-idle/noqueue proof. Если source alive/reused/unknown/denied/endpoint занят — публикация и запуск закрыты. Здесь нет требования выдумать historical exit. Source/source-owned restarts блокирует удерживаемый source mutex.
6. Адресно опубликовать только проверенные staged `project-intent/` → Core `.codex-runtime/project-intent` и preference → Core `logs/autonomy-preference.json`, а также installed8 Core CEP assets, под удерживаемой парой. Перед **каждым** move/copy сверить literals/absolute paths/ancestors(no reparse)/source bytes+object IDs/final absence и current state-helper status. Это operator publication, не команда native engine. Между store и preference start запрещён. Partial/unknown move сначала сверяется status/read-back; известный move не повторяется, marker не создаётся заново и UUID не меняется. OFF остаётся OFF.
7. В том же controller отправить `preflight`: final-path marker, staged outputs, config/ordinary coverage, installed8 hashes, source proof/shared resources и target freshness повторно проверяются до native launch-attempt/Start. Затем один раз `start-once`. Только own new Core candidate/registration/genesis/current становятся provenance. Ordinary `ensure-bridge` **не является** first-launch путём и не может создать второй generation после partial/corrupt migration origin.
8. После own registration/genesis/current выполнить own Core CEP challenge→physical project-read→signed activation/verified first-adoption marker. Core active journal отдельный `ae-agent-core.v1` (`logs/core-cep-panel-control`, `codexAeCore*` keys), legacy storage не копируется/не очищается. Shared physical/bootstrap-delivery/native latches сохраняются; local-only legacy mutation UNKNOWN продолжает закрывать shared-effect gate. Availability b7 row не участвует. First adoption ещё раз проверяет row-independent source/resource brackets; после verified own marker normal Core не читает legacy config/key/history.
9. Только после durable own adoption перенаправить адресные source project MCP command/args/automation env и согласованные Antigravity MCP registration paths на Core launcher/adapter, сохранив backups и прочие поля. Codeburn не менять. `agy-bridge` executor profile и MCP registration — разные настройки; Core profile не выдумывать/не создавать hidden fallback. Global7 уже применены, см. receipt выше.
10. Проверить **новый Core adapter**, actual daemon/source/generation identity и current Codex transport binding. Выполнить настоящий typed `get_project_info`, прочитать current project/revisions/ownership и фактическую autonomy preference; OFF остаётся OFF. Health/reload/config bytes не доказывают transport adoption. Существующие чужие adapters не завершать. Если host требует штатный reconnect/refresh, выполнить только адресный подтверждённый путь; при внешнем reconnect prerequisite не объявлять cutover завершённым.

Fixed Node SHA `3602f2bb1a10f2cbab4c36886218a33c1ab3db87290e73b033c46c77147d0237`; pinned pwsh SHA `362a356ce7f0940ec74f73a8fc2c990a2cc24a38a11c90bbd8eca947110ad139`. Installed CEP root `C:/Users/Ant/AppData/Roaming/Adobe/CEP/extensions/com.codex.aemcpbridge`; assets: `CSXS/manifest.xml`, `index.html`, `panel-action-contract.js`, `panel-actions.js`, `native-probe-startup-guard.js`, `panel.js`, `style.css`, `lib/CSInterface.js`. Не менять extension/origin IDs.

## Same-operation recovery и rollback

### Исторический адресный preStart resume — consumed/noReplay

Offline directory fix и bounded same-operation recovery прошли independent design/implementation ACCEPT, открытых P1/P2 нет. Полный контракт: `core-prestart-recovery-design.md`; fixed case/pins — `config/core-prestart-recovery-case.json`. Actual resume остаётся pending.

1. После final milestone commit sole controller закрепляет новый reviewed runtime/manifest/helper/CLI/Node/pwsh set и сверяет exact original/audit refs. Fixed `authorize-prestart-disposition` создаёт отдельную signed `wx`+fsync decision; это не launch и не подпись прошлого outcome. Existing equal decision только read-back, differing/partial — отказ. Никаких original rewrites/non-code rebase.

```powershell
& $fixedNode $control authorize-prestart-disposition
& $fixedNode $control control
```

2. После `actual_pair_controller_ready` новый sole persistent controller удерживает реальную Source→Core pair. Existing published state/preference/marker/assets/config/projection/ровно3 shared fences повторно проверяются без повторной publication. Требуются fresh source absence/free3456, quiescence/noqueue/physical0/native idle и все прежние ownership/state/actor gates. Внутри этого же controller выполнить `prestart-resume-preflight`; только reviewed Core code pins могут отличаться от original facts.
3. Один раз отправить `start-prestart-resume-once`. До native RPC создаётся signed `prestart-resume-launch.json`, расходующий authority и связывающий old origin/disposition/effective reservation+fresh ticket с actual nativeSessionId. Existing binding не даёт dispatch, другая session/lost pair не переиспользует её. Ordinary `start-once` остаётся read-back; exact-case ordinary launch закрыт.
4. Успех проходит штатные candidate/register→explicit resumed genesis→current/handover и затем own CEP adoption/redirect/actual MCP read-back по шагам8–10. Любой partial/timeout/LOST после consumption — только same-operation observation; третья launch/register replay/metadata repair/stop privilege этим scope не выдаются. Original UNKNOWN/history не объявляется PASS.

`observe`/`release` сохраняют прежние lifetime ограничения. При возможном Start сначала factual reconciliation; отсутствие PID/port не exit. Все actual administrative/runtime действия выполняет назначенный sole controller, а не offline writer.

### Общий контракт после возможного Start

После Start native HANDLE сохраняется немедленно. Identity/argv/candidate/register/seal/current/ACK fault сохраняет immutable once и ту же operation/generation. При held recovery допустимы только `observe`/same-operation read-back. Не повторять POST/register/start, не создавать вторую lineage/UUID, не repair metadata и не выдавать prereg rescue/stop privilege. EOF не должен потерять живой HANDLE/pair: persistent owner продолжает observation; LOST остаётся UNKNOWN, не exit.

До verified handover partial owner может удерживать pair/HANDLE и не иметь lawful stop lane. Это честный external prerequisite; **rollback нельзя обещать или выполнять до factual lawful exit**. После verified registered own-origin handover работает обычный Core lifecycle stop с его policy/grants/readiness и actual held `WAIT_OBJECT_0`. Только такая фактическая остановка разрешает rollback; отсутствие PID/port, timeout/TTL или старый receipt этого не доказывают.

Rollback сохраняет текущие Core revisions/OFF: существующий `core-state-migration.js prepare-rollback/status-rollback` подготавливает reverse bytes и marker для legacy final path, проверяя original baseline и object IDs. Нельзя перезаписывать legacy snapshot поверх новой работы. Адресные reverse moves с backup сверяются после каждого шага при genuine quiescence; unknown/partial сначала read-back. После final state validation вернуть только адресные config/installed fields с учётом ручных изменений и выполнить штатный legacy read-back. Старый reset/disconnect/мутации не replay.

Прежний checklist с обязательным historical terminal exit, новым source shutdown/reset, ordinary `ensure-bridge` first launch, публикацией до реального pair и «будущим отдельным разрешением» **superseded** текущим persistent migration protocol. Команды из старых revisions документа не являются active инструкцией.

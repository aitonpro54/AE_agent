# Core migration admission: проект контракта

Статус: **design review required**. Пользователь разрешил actual cutover: «Да, переключай MCP/CEP на Core по подготовленному пакету, переноси защищённое состояние и применяй инструкции. Старую сборку сохрани для отката.» Это разрешает подготовить необходимое исправление; production grant, native launch, moves, config и installed CEP остаются заморожены до review и офлайн-проверок этого контракта. Исполнитель — назначенный `ae_specialist`, sole Core writer и live controller; независимое review — `ae_reviewer`.

## Исходные факты и граница

- Fixed source: `C:/Users/Ant/Documents/Codex/AE_agent`; fixed target: `C:/Users/Ant/Documents/Codex/AE_Agent_Core`. Source code/private authority не меняются. Старые registrations, credentials, grants и journals не становятся Core authority.
- Live preflight `16d64090-a9c5-4976-82f9-7651dfed2500`: source generation `7001a144-11c1-4841-8de8-e500c499db51`, PID28832; genuine native query дал `absent`, Win32Error87, свободный3456. Это историческое наблюдение, **не** `WAIT_OBJECT_0`, exit proof или будущая launch capability. Старый reset `88e88472-5cc2-4ec8-8aa8-1ab13c7a5d8c` остаётся `unknown_preserved`, `oldExitProven:false`, `operator_abandoned`, no replay.
- CEP остановлена и physical latch0. Единственный observed unresolved row — `bridge.disconnect`, request `b7f2a79a-63ac-416f-81a4-a982280f3766`, row SHA `0b42a4441a937e13c01400911a9136dbf2c56cd5a06378e1ba811df58d810be7`, runIdnull. Его SHA уже покрыт проверенной source reset activation. Это control-only history, не подтверждение AE/output effects.
- Source store v2:6 projects, lifecycle generation7/7 receipts, pendingfalse; фактическое preference `desiredEnabled:true`. Сохраняется фактическое значение; synthetic OFF должен оставаться OFF. Это не census внешних resource reservations.
- Адресные backups и безопасные metadata: ignored `.codex-runtime/core-cutover-live/16d64090-a9c5-4976-82f9-7651dfed2500/{receipt,preflight-conclusion}.json`. Production state/config/CEP/runtime не изменены.

Существующий same-root reset не подходит: `owned-runtime-product-session-reset.js:79–104` требует своего predecessor/current/grant/CAS. `owned-runtime-product-lifecycle.js:16–38` требует historical f92e migration receipt; `owned-runtime-supervisor.js:442` вызывает `ensureAnchor` после launch. Копировать или имитировать этот receipt, повторять source reset либо стартовать source ради нового stop нельзя.

## Закрытый административный интерфейс

Один новый продуктовый модуль — `mcp-server/core-product-migration.js`; fixed Core CLI использует его административные методы. Публичных MCP/HTTP аргументов для grants, roots, PID, kernel identities или receipt JSON нет. Это одно конкретное source→Core переключение, не общий migration service.

| Метод | Разрешённый результат |
|---|---|
| `inspect()` | Только чтение fixed roots; canonical review digest, pins, metadata и точные blockers. Не capability. |
| `authorizeCurrentReview()` | Отдельная private migration policy, связанная с текущим review. Actual provision только после review; root подтвердил из своего runtime UUID `01a171dd-b843-7141-b28a-ae75d79ce7f1`, child/environment другого MCP не является approval reference. |
| `prepareGenesis()` | Immutable intent + once-key + один operationId/target generation; никакого spawn. При consumed/partial/unknown — read-back прежнего operation. |
| `acquireMigrationController(id)` | Реальная paired native lease по private operation selector. Не принимает пути/процессы/boolean proof. |
| `verifyBeforeSpawn(context)` | Проверка свежих фактов под paired lease; private WeakMap brand в текущем процессе. JSON этого witness не заменяет. |
| `sealGenesis(context, registration)` / `readGenesis()` | Своя Core genesis, связанная с реальной registration и signed новым Core key; никаких historical f92e claims. |
| `createAdmissionSession()` | Отдельные challenge/activate/admissionReady для этого origin; не расширяет старый reset. |

Обычная Core lifecycle policy по-прежнему имеет ровно `acceptedServerCoverage:["owned_daemon_lifecycle"]`. Отдельная closed policy `ae-agent.core-product-migration-policy.v1` связывает: `capability:"create_core_product_genesis_once"`, `authorization:{source:"explicit_user_chat",reference}`, `reviewDigest`, fixed `sourceRoot/sourceGeneration/sourceCurrentRawSha256`, `targetRoot/targetSourceSha256`, `stateMigrationIntentSha256`, `installedExtensionIdentity/expectedCoreAssetHashes`. Неизвестные поля, другой capability/root, missing/stale pins, другой review или authorization запрещают подготовку/launch. Intent дополнительно закрепляет generated operationId/generation, policy raw SHA, exact source code/control witness pins, state outputs и installed8 assets. Grant не хранит source secret; credential fingerprints не являются capability.

Credential bootstrap: намеренно сохраняется только existing PANEL-role credential той же extension/origin. Новый Core `AE_BRIDGE_TOKEN` генерируется отдельно от source automation token и panel token. По текущему коду это одновременно network automation credential **и** private runtime HMAC key: `owned-runtime-control.js:40–41,49` → `supervisor.js:49–50` / `product-lifecycle.js:29–36`; native `Config()` использует pinned `ParseCredentialConfig`, возвращающий тот же `AE_BRIDGE_TOKEN` (`win32-helper.ps1:135–154`). Отдельного третьего signing key сейчас нет. Panel continuity не переносит source HMAC/grants; Origin/Host/asset/actor gates сохраняются. Ротация panel token до собственной activation потребовала бы отдельного bootstrap, потому что historical reconciliation блокирует `bridge.configure`; прямое изменение localStorage/CDP для обхода этого gate запрещено.

Source `.codex/config.toml` с прежним automation credential остаётся точными bytes до sealed Core provenance и собственной activation: ранний redirect env на новый Core token разрушил бы source HMAC reader. Отдельный Core config получает fresh automation/HMAC + intentional panel continuity. Source auto-start во время перехода блокирует source часть настоящей paired lease, затем — known Core endpoint и обычные foreign-endpoint checks. Только после adoption адресно меняются source project after-effects command/args/automation env с backup; Codeburn не меняется. `readGenesis()` и последующие own activation readers проверяют Core-signed frozen provenance и свои immutable facts, не зависят от будущего mutable legacy config/key и не импортируют source code. Это historical provenance, не authority из backup/source secret.

## Source verifier и control disposition

Административный entry `verifyFixedLegacyControlDisposition()` не принимает public inputs: generation/reset/request/directory берутся из private reviewed intent. Он читает только fixed legacy root отдельно от normal Core runtime. Порядок в одном synchronous fresh proof view: `supervisor.readDaemonRegistration` → `registeredGeneration` → `reset.readAnchor` для **этой exact generation**, без поиска новой lineage → `daemonSession(...).activation()` → реальный `cep-panel-control.readIndexedReceipt` из exact reviewed directory. `loadDurableReceipt`/UNKNOWN fallback запрещены. Проверяются exact reset operation/current refs, source receipt metadata и covered local entry. Сам status JSON не доказательство.

Fixed child использует pinned Node и один fixed Core reader entry/argv/cwd, без `-e`/caller source. Environment создаётся из минимального Windows runtime allowlist с добавлением только `AE_AGENT_DEPLOYMENT_MODE=product`; inherited AE/AE_AGENT_TRUSTED/AE_OWNED_RUNTIME, CODEBURN, provider/proxy credentials и Node options/path/cache/coverage injection не передаются. Ни key, ни token не передаются в env/argv. Credential читается только из original source config через pinned parser/fixedCredential и fingerprint match. Допустимы только read-only factories `daemonSession` с `readLifecycle/readEditHash/retireEdit:DENY` и неизбежный `initialRuntime.createInitialRuntime()` **только product-null branch**; non-null runtime немедленно отвергается. Provision/reset/activate/admissionReady/startup/native factories и эффекты запрещены; `admissionReady()` вызывает `retireEdit` и не является reader.

Exact callable whitelist:

- supervisor: base/directory, envelope/row readers, fixedCommand, reservation/startup-ticket validators (`fresh=false`), credential/signature/candidate/projection/current/registered readers и plain validation helpers;
- authority + fixed control: exact/base/privateFile/runtimeControlFor, parseCredentialConfig/fixedCredential/credential;
- reset: row/policy/intent/anchor/grant/activation readers, signature/disposition/plain validators; product-activation только sessionGrant/readGrant/base/onceKey/plain validators; product-lifecycle только legacyPresent;
- ledger/lifecycle: bounded safe read/fresh proof view/hash/canonical/freeze/memo/plain validation; win32 только validateIdentity; review-evidence только sha256; deployment-mode только product selection;
- CEP control: exact request/path/root (`create=false`)/regular/bounded-read/index (`create=false`)/binding/stored/checkpoint/owned-index readers и readIndexedReceipt; panel contract только getActionDefinition.

Callable whitelist не доказывает безопасность top-level imports. Отдельный exact module-load manifest должен закрепить **каждый** source module/raw SHA и разрешённые Node builtins; loader отвергает неизвестный require, native addon и effects до загрузки source entry. FS methods только для exact reviewed files/directories/ancestors: existsSync/lstatSync/realpathSync, bounded readdirSync, readFileSync/openSync(read-only)/fstatSync/readSync/closeSync. Pure JSON/path/crypto hash/HMAC/timingSafeEqual разрешены. FS write/mkdir/append/rename/unlink/truncate/write-fsync, spawn/exec, HTTP/net/fetch, native addon, timers/polling/kill запрещены. Если pinned branch требует новый helper/method/path, это отдельное reviewed whitelist addition, не arbitrary-export fallback. Static closure review и offline effect traps обязательны; не заявлять, что filesystem permissions технически запрещают writes.

Вызовы выполняются в одном новом source `withFreshProofReadView`; до/после сравниваются bytes, raw SHA, object IDs и bounded namespace всех прочитанных source code/authority/current/registration/reset/receipt/index файлов. Изменение closure, alias, новый namespace entry, missing/invalid HMAC или неоднозначная строка закрывают проверку. Source credential используется локально только для проверки прежней HMAC chain, не выводится и не сохраняется как Core authority. Normal Core daemon legacy code не импортирует. Этот абзац задаёт требования: отсутствие побочных эффектов полного callable closure ещё должно быть подтверждено implementation review и негативным тестом, prose не является read-only proof.

Новый `ae-agent.core-control-disposition-witness.v1` имеет закрытые разделы:

- `source`: fixed root, generation, current/registration refs, reset operation, intent/anchor/activation и durable receipt/index raw hashes;
- `entry`: requestId, **original localStorage `panelEntrySha256`**, `action:"bridge.disconnect"`, `effect:"panel_lifecycle"`, `state:"unknown"`, `runId:null`;
- `target`: migration intent SHA, Core generation, exact extension identity и8 Core asset hashes;
- `disposition`: `scope:"availability_only"`, `oldOutcome:"unknown_preserved"`, `oldExitProven:false`, `oldCommandsReplayAllowed:false`, `oldExternalEffectsAdjudicated:false`.

Verifier обязан доказать, что **тот же** local row request/SHA уже присутствует в verified `sourceActivation.panelControl.oldActionEntries`; current source durable receipt отдельно должен иметь тот же request/action/effect/unknown. `runId:null` в canonical witness разрешён только для schema-absent либо literal null исходного поля; false/0/empty string не нормализуются через `!runId`/`||null`, а отвергаются. Local `sha256(JSON.stringify(record))` и raw SHA durable receipt — разные representations, они не приравниваются. После reload CEP заново считает local entry hash. Core подписывает собственным key только проверенный provenance. Нельзя перенести source activation как новое разрешение, принять произвольный oldActionEntries array, plan.run, другой action/hash/effect или non-null runId. Original record/tombstone/index остаются на месте и UNKNOWN/noReplay.

## Paired native lease и pre-spawn fence

Текущий mutex в `scripts/owned-runtime-daemon-helper.ps1:346–350` зависит от root: `Local\AEAgentProductController-Hash(canonicalRootLower)`. Single Core lock не защищает source. Новый закрытый Core seam получает **оба существующих** mutex в фиксированном порядке: canonical legacy root → Core root; освобождает в обратном. При конфликте, потере lease или abandoned mutex только journal/read-back; abandonment сам по себе не разрешает повтор launch. Lease проверяется в живой native session, а не сохранённым `mutexHeld:true`.

Migration путь не входит сначала в обычный Core `controlled()` с single-root lease: acquire Core→source нарушил бы порядок. Существующие normal source/Core controllers продолжают пользоваться своими прежними именами и конфликтуют с соответствующей частью paired lease.

Пара удерживается через fresh source native probe, Core launch, register, genesis seal и current CAS publication. Перед sensitive boundaries native helper проверяет оба ownership. Старый source helper/код не меняются. Native accepts только private operation selector и сам читает fixed validated intent/policy; caller generation не подменяет intent. Source current/registration/generation/code pins повторно сверяются под source mutex. Разрешена только genuine `absent + Win32Error87 + endpointFree:true`; PID reuse/access denied/unknown/foreign listener/stale probe запрещены. Отсутствие процесса сохраняет `oldExitProven:false`.

**До любого spawn**, включая создание consumed launch-intent, известны и проверены:

1. Точные roots/no aliases, source+target code pins, policy/review/intent/current, отсутствие чужой/partial Core genesis и единственность operation/generation.
2. Byte-exact destination store/preference полностью опубликованы, marker проверен на final path, source hash/object identities неизменны; fresh `core-state-migration status` перед каждым move и перед spawn. Partial publication запрещает start.
3. Installed8 Core assets/extension identity совпадают; source control witness проходит повторную проверку; отдельный Core config разделяет panel/automation roles. Legacy credential config ещё не меняется; old auto-start защищён реальной source lease до known Core endpoint, затем normal foreign-endpoint checks.
4. Обе live native leases удерживаются, exact source absence подтверждена заново,3456 свободен. Ни receipt snapshot, ни старый probe не заменяют этот шаг.

Только actual future candidate/registration проверяется после spawn. Нельзя переносить известный отказ historical genesis на post-spawn этап. `readProductStopAuthority` может признать новую verified Core origin для lifecycle stop, но не открывает execution admission.

## Отдельная CEP activation и admission

Bridge публикует `coreMigrationSession` / `coreMigrationSessionActivation` с отдельной schema/origin; не `resetSessionActivation`. Challenge связывает nonce/expiry, target Core generation, exact panel actor/connection/epoch и installed asset hashes. Fresh physical preflight использует существующую bounded project-read механику: physicalInflight0, native idle, activeActionnull, recoveryTransportnull, action storage ready; после install/reload original row SHA проверяется повторно. AE project не изменяется. Новый Core HMAC activation закрепляет target generation, challenge, actor, witness и полученный project preflight.

`panel-actions.unresolvedEffects()` получает единственное узкое исключение availability: точный уже covered control-only row из **active собственной** migration session. История не завершается и не получает replay. Любой drift/foreign actor/другой unresolved action закрывает gate. `panel.js` получает отдельный typed origin handler; существующий reset path не превращается в permissive OR.

Для migration-origin обязательна формула `existingNormalGates && coreMigrationSession.admissionReady() && externalResourceReadiness`. Missing/partial/corrupt migration origin/session **закрывает** admission; `!session => true`, product-stop authority и existing retained OR не могут его открыть (`bridge-daemon.js:9328–9331`). Proposals/grants/ownership/checkpoints/dry-run, manual raw/save/destructive подтверждения и noReplay остаются прежними. Никакие прежние session capabilities не наследуются.

### Незакрытая resource boundary

До mutable admission требуется адресный read-only census реально сохраняемых external resource guard records: output/job/native reservations, bootstrap/control/lifecycle и их current fences. Existing `owned-runtime-supervisor.inventory()` охватывает plan-runs/CEP/native-fixture ledger, но сам не доказывает complete resource coverage. Exact projection и каждый consumer этого census должны быть перечислены в implementation/review до открытия writes; boolean `noDebt` недопустим. При incomplete/unreadable coverage допустим read-only adoption и настоящий typed project read, **mutable readiness временно closed**. После классификации действующие UNKNOWN/fences ограничивают ровно свои ресурсы/операции по существующей семантике. Старые AME FAIL/NOT ACCEPTED сами по себе не становятся долгом или глобальным запретом несвязанных AE-текстовых операций. Opaque AME state сохраняется, AME остаётся paused/out of scope; новых AME checks/execution/rework нет. Availability witness не освобождает старые resource fences.

## Once, crash и возврат

Durable progression: reviewed → authorized → immutable prepared → paired preflight → проверенная state/config/assets publication → launch-intent → actual candidate → registered_admission_closed → Core genesis sealed → current CAS published → own panel challenge → active. Один once-key связывает operation/generation/review; смена UUID/absence PID не разрешает второй spawn.

- До launch-intent отказ не запускает процесс; partial preparation читается по тому же operation.
- После launch-intent без verified outcome — read-back only. Существующий candidate допускает завершение **той же** generation только после actual identity verification и того же capability. Исчезновение child не доказывает never-spawn/exit.
- Lost register/publish ACK сверяется с exact journals/current/candidate; known output не пересоздаётся. Partial anchor/current никогда не открывает admission. Challenge refresh после reconcile/physical0 не повторяет AE command.
- Rollback сохраняет current Core revisions/preference и old source bytes, использует существующий byte-exact state helper и адресные backups. Он не возвращает старую authority/control epoch и не решает UNKNOWN. Для остановки запущенного Core нужны его нормальные actual native stop/read-back gates; file restore их не заменяет.

### Partial candidate: observation-only recovery

Выбран минимальный вариант A: **никаких startup-stop capability, rescue routes или nonce authority**. Возможность rollback сохраняется после lawful factual exit; автоматический rollback любого crash не обещается. До own genesis/current у candidate может не быть законной stop authority — это честный UNKNOWN/external prerequisite, не основание расширять права.

Independent review выявил несовместимые текущие paths: native helper `:399` catch→break→finally Dispose; supervisor RPC `:465` ok:false→dead/stdin.end, `session():477` catch→close, `controlled():453` и `launch():383` dispose. Меняется **только новая migration lane**, обычный control сохраняет поведение. Service `privateOperation()` по-прежнему требует registered lifecycle authority; новая migration не обходит это условие.

Native transitions: `controller_only → launch_entered → held_unbound → held_candidate_memory → held_candidate_durable → registered_closed → genesis/current_committed → handover_committed`. HANDLE записывается в private native state сразу после **фактического возврата** StartIndependent, до Identity/AssertArgv/candidate write. Если Start не вернул сохранённый nonzero HANDLE, нельзя объявлять held_recovery_only: launch effect UNKNOWN, без durable candidate это внешний blocker. Последующий отказ с реально удерживаемым HANDLE переводит в `held_recovery_only`.

В recovery разрешены только assert_pair/inspect_same_handle/wait и read-back **того же** operation/candidate; до verified identity — только query/wait того же HANDLE. Missing/ambiguous registration ACK не разрешает второй register. Partial/corrupt existing authority/control files не переписываются; автоматического metadata repair/seal нет. Допустима запись фактического observation/exit evidence того же operation, не создание candidate authority. Фактический positive wait даёт terminal_exit_proven; source UNKNOWN не меняется.

Helper для recognized recoverable migration error выдаёт exact typed recovery schema и продолжает loop с HANDLE/leases. JS принимает её только из той же pending sequential pipe/native session и сохраняет private WeakMap ownership/target serial, зарезервированный **до launch RPC**. Операция отклоняется без dead/stdin.end; caller/error `retainHandle` boolean отсутствует. Migration `launch/controlled` сначала передаёт ownership root recovery owner, только потом решает cleanup. Dispose/release-target отказывает при unresolved held recovery; release допускается после factual exit или verified committed handover. Uncertifiable stream/EOF/protocol corruption — LOST/UNKNOWN, не утверждение о held ownership. Timeout сначала сверяется по той же pipe, только если её последовательность доказуема; иначе LOST.

Actual control использует persistent root-owned controller/continuation loop, не one-shot launch CLI, который печатает error и выходит с живым target. Он сохраняет native process/HANDLE для bounded observation/read-back и показывает owner/session identity; detached authority не создаётся. При смерти owner без durable signed candidate автоматический reopen запрещён. При valid durable candidate отдельный paired observation controller может открыть только его exact kernel identity/argv/source без terminate rights; PID reuse/access denied/invalid candidate закрывают путь. Это observation, не новый stop privilege.

| Failure window | Допустимое продолжение |
|---|---|
| Start не вернул HANDLE | UNKNOWN; error schema не создаёт held proof. |
| Identity/AssertArgv/candidate write после фактического CreateProcess | Та же live session/HANDLE, query/wait/read-back. Lost session без signed candidate — внешний blocker. |
| Candidate durable, register/anchor/current write failed | Same-operation read-back. Если own lifecycle origin ещё не sealed/published, stop/repair не подразумеваются; никаких новых control routes. |
| ACK unknown | Не повторять POST; читать exact attempt/ACK/current и удерживаемый process. |
| Endpoint не отвечает или prereg candidate остаётся alive | Retain HANDLE/observe, honest external prerequisite. Force/graceful rescue authority не добавляется. |
| Exit получен, durable receipt write failed | Сохранить actual held proof у recovery owner, повторить только persistence того же outcome; не объявлять durable success. |
| Owner/pipe потерян либо ambiguous publication | LOST/UNKNOWN/read-back; отсутствие PID не adjudicates outcome и не создаёт once заново. |

После verified own genesis/current работает обычный registered Core lifecycle stop с его grants/readiness и actual held exit. До lawful exit неизвестного candidate нельзя продолжать state rollback/start legacy. Expired launch ticket запрещает новый launch, но не пассивное чтение исходных hashes с fresh=false и observation того же actual HANDLE; никаких новых прав это не даёт.

## Адресные seams и проверка

| Файл/кодпойнт до изменения | Требуемая узкая правка |
|---|---|
| `core-product-migration.js` (новый) + fixed CLI | Policy/review/once, source verifier, own genesis/admission; нет generic paths или public grant. |
| `owned-runtime-supervisor.js:281,339–348,367–442` | Pre-spawn origin verification, private paired lease path, new genesis/stop-origin reader; убрать post-spawn known-failure для Core migration. |
| `owned-runtime-product-lifecycle.js:16–38` | Явный distinct verified Core origin; historical f92e branch сохраняет свой exact validator. |
| `scripts/owned-runtime-daemon-helper.ps1:272–299,346–375` | Fixed dual mutex lease + проверка own migration intent/roots/pins перед native start; без source helper edits. |
| native helper `:399`; supervisor RPC `:465`, `launch():383`, `controlled():453` | Recoverable held native error state и cleanup ordering; session/transport UNKNOWN не маскируется как held proof. |
| `bridge-daemon.js:8968–9024,9311–9344` | Отдельные typed migration challenge/activate fields, fail-closed origin/admission AND. |
| `cep-panel/panel.js:2022–2030,2248–2267,2410–2446`; `panel-actions.js:75–79,579–596` | Dedicated own migration preflight/adoption и exact availability-only old row exception. |
| `core-state-migration.js` | Byte exact/OFF/marker protocol не расширять; использовать существующий status/bracketing. |
| runtime census/manifest/pins | Новые product assets и reviewed helper raw SHA закрепить обычным Core tooling; source allowlist не расширять legacy runtime import. |

Bounded offline negatives: bad/missing policy/digest/codepins/roots/source generation/witness/state brackets → **spawn0**; ordinary ensure без migration origin не запускает partial daemon; single-root/fake/saved lease и stale probe reject; PID reuse/access denied/occupied/unknown reject; forged/uncovered/changed row, plan.run/non-null runId/foreign actor reject; missing/partial origin/session не проходит stop/retained OR. Identity/AssertArgv/candidate/register/anchor/current/ACK fault injection честно различает actual retained HANDLE+pair и LOST, сохраняет once/one generation/noReplay; prereg отказ не получает stop privilege, ACKunknown не повторяет submit. Source-token change до seal/adoption, panel-as-HMAC, rawReceipt-as-localEntry, runId false/0/empty, prohibited reader effects/unknown module/path/env — отказ до эффекта; redirect после own seal/adoption не ломает origin и не читает старый key. Byte-exact store/preference/marker scope и OFF сохраняются; incomplete resource coverage временно закрывает mutable readiness, classified fences остаются адресными; старый AME FAIL не становится global debt. Source writes, old authority transfer и fake f92e receipt отсутствуют. Meaningful positive controls не симулируют native proof флагом.

До implementation acceptance остаются обязательными: independent design review source-verifier callable closure/side effects, dual mutex integration и exact resource-fence policy. После implementation/review/targeted tests — заново fresh actual paired preflight, адресная публикация, один Core launch, actual registration/genesis/current/source hashes, своя CEP activation, настоящий typed `get_project_info` и preference read-back. Health/reload/offline stubs этого не доказывают. Live AE writes/render/AME не нужны.

Отдельный live acceptance факт — MCP binding. После source config redirect старые adapters могут жить с прежними argv/env; config bytes не доказывают переподключение. Проверяется **новый Core adapter**, его реальный daemon/endpoint/source identity и typed `get_project_info`, затем current Codex transport binding. Чужие adapters/processes не завершаются. Если host требует штатного refresh/restart, используется только подтверждённый адресный путь; при его отсутствии фиксируется внешний reconnect prerequisite, а cutover не объявляется полностью подтверждённым.

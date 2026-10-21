# Техническое доказательство отсутствия submit для panel lifecycle

Подготовлен изолированный кандидат AE Agent 3.3.4 для независимого review. Canonical source, provisioning, daemon, installed CEP и исходные runtime records этим исполнителем не изменялись. Применение и live read-back выполняет root отдельно. Офлайн-проверки не являются live adoption/native connectivity.

Поддерживается только recipe `bridge_disconnect_idle_post_failed_before_submit_v1`: exact reviewed OLD loaded bytes трёх JS assets; handler `bridge.disconnect`; HTTP0 и точные diagnostic/body/message POST `get_bridge_status` в `panelLifecycleIdle`; error-return до `context.submit`. GET plan-sync failure, duplicate XHR и callback/storage exception после submit проверяются отдельно и не расширяют recipe. `delivery:delivered`, nested postState и submitProof сами по себе доказательством не являются.

Исходный outcome — `unknown_preserved`; causal result — `handler_not_submitted`; release scope — `current_panel_control_guard_only`. `replayAllowed`, `nativeExecutionAuthority`, `humanAbandonAuthority` всегда false. Original receipt/index не исправляются. Same UUID getResult/reinvoke возвращают исходный UNKNOWN. Native/resource/cutover/reset/force/reservation authority не добавляется.

## Private namespace и исходные данные

Фиксированный BASE: `authority.base(realRoot)/panel-lifecycle-causal`. HMAC key выводится только из genuine `authority.runtimeControlFor(realRoot).credential()` для fingerprint подписанной registration, с domain `ae-agent.panel-lifecycle-causal.v1\0<normalized-real-root>`. Token не сохраняется и не выводится. HMAC integrity не заменяет авторизацию или runtime succession.

Root после review переносит только данные в fixed `provisioning.json`:

- schema `ae-agent.panel-lifecycle-causal.v1.provisioning`; authorizationRef source `explicit_user_chat`, reference `<current-task-uuid>:panel-lifecycle-causal-technical-recovery`;
- точные UTF-8 строки `raw:{capture,input,before}` и их `rawSha256`;
- полный OLD `oldInstalledAssetsManifest`8 плюс `oldDebugSha256`;
- localTransport namespace `logs/cep-panel-control`, exact receiptRaw/identityRaw/initializedRaw с SHA, indexRawSha256 для issuance audit, checkpoint `{kind:not_owned,present:false}`.

В `subject-assets/` лежат reviewed OLD9 как данные: `.debug`, `CSXS/manifest.xml`, `index.html`, `panel-action-contract.js`, `panel-actions.js`, `native-probe-startup-guard.js`, `panel.js`, `style.css`, `lib/CSInterface.js`. Их не импортируют/исполняют. OLD pins происходят из ранее проверенного backup; installed копия не подтверждает сама себя.

CREATE_NEW+fsync создаёт signed subject-source, затем отдельный policy с raw/envelope SHA subject-source. Идентичный provisioning идемпотентен; drift/partial запрещает issuance. Reset/force/retained policies не меняются. CLI не принимает URL/path/eval/PID/outcome/request selector.

Remote signature проверяется по bound API algorithm с fixed actor order; local — отдельно штатным `computeActionSignature(originalInput)`. Равенство этих signatures не требуется. Сверяются raw, selected identity, original actor, timestamps, action и diagnostic. Local delivery не считается submit proof.

## Prepare, static install и один reload

1. Prepare выполняется после final new-runtime seal/authenticated full-ready, до static install. Fresh observer подтверждает OLD loaded3 + OLD disk9. Certificate CREATE_NEW pin-ит exact new runtime/credential и NEW repo assets9.
2. Root устанавливает static9 отдельно. Genuine no-args API: `await require('../mcp-server/panel-lifecycle-causal').staticInstallPreflight()`. Deeply frozen result содержит certificate/runtime pins, installed root/indexPath, target, actor/context, subject SHA, oldAssets/newAssets maps с canonical `/` keys и synchronous assertUnchanged.
3. Closure проверяет immutable authority/source/currentruntime/local proof и допускает промежуточную static copy. Installer сам обязан проверить OLD preimage, wx intent/backup и NEW9 read-back. Он не выдаёт runtime grant и не выполняет reload.
4. `reload-once` требует external full-ready до/после первого fresh view. Только эта explicit фаза допускает OLD loaded3 + NEW disk9 при exact historical target/context/actor. Signed wx reload-intent создаётся до эффекта. Effect socket открывается заранее; затем последний fresh readonly view, synchronous guard и ровно один Page.reload(ignoreCache:true) на том же target.
5. ACK/UNKNOWN потребляют попытку. Разрешён только read-back. Postreload обязательно NEW loaded/disk, actual new actor, unchanged raw/index и пустой physical latch. Ошибка не очищает latch и не разрешает повторный reload.

Read→reload не атомарный native fence; обязательный postreload read-back отказывает при гонке/поздней работе. Штатный bootstrap comparator не имеет общего sourceMismatch bypass. Старый NoHost installer не меняется.

## Fresh observation и transient adoption

Observer переиспользует exact installed target selector, fixed8870/fileURI и readonly CDP allowlist. Читаются ровно3 loaded asset sources только для hashes, state/catalog API и4 fixed storage keys: receipts/index/initialized/physical latch. Выводит только выбранную receipt row; полный index нужен private Node hash, без tokens/prompts/других actions. Double read pin-ит raw/index/initialized/physical, actor/default context/unique target/source. Cleanup drift отменяет capture.

Сверяется SHA полного final JSON.stringify(record) со свежим OUTER unresolved entry; nested postState SHA игнорируется. Whole-index SHA — issuance/race pin, не вечный запрет новых независимых entries. Позднее selected identity/raw/marker/schema/namespace остаются exact; ordinary checkpoint обязан отсутствовать.

Physical producer хранит map `{id:{submittedAt}}`. Допустимы null/отсутствие или plain empty `{}`. Любое поле, включая pendingCount:0, означает непустой map и отказ. OLD reader использует canonical bridge.connect availability для private busy, activeAction:null/storage:ready/recovery:null/trusted refresh idle и raw physical map. Отсутствующие новые passive поля OLD reader не требует. NEW reader дополнительно требует nativeBusy:false/physicalInflight:0.

Trusted refresh завершает остальные lookup последовательно и запускает causal lookup последним. Только private own frame nonce/sequence/actualactor допускает собственный trusted_guard_refresh_pending и ровно этот reasonCode. Другие pending lookup должны отсутствовать. Finally очищает frame; failure очищает causal trust. Public skipPending/ignoreBusy/proof setter отсутствует.

Authenticated panel GET `/panel-lifecycle-causal/lookup` требует private observation context без execution/bootstrap entitlement, exact own process/current registration/loaded source и not-draining/not-closing. Он не делает selfHTTP и не требует activeTickets0 внутри собственного observation. External prepare/install/upgrade/rearm сохраняют authenticated full-ready. Native/resource/readiness gates не меняются.

Panel transient map принимает только fresh nonce-bound witness из authenticated lookup. Header `x-ae-panel-causal-runtime` — revocation-only hash generation/bootNonce/pid/startedAt/loadedSourceSha256. Request finish обрабатывает stamp ДО callback. Missing/error/change/config/lifecycle drift отзывает entries. Поздний старый header сам не восстанавливает trust. Stamp без нового ответа означает last verified transport, не live attestation.

CEP private memory-branded projection исключает только exact original local row из maintenanceTransportState и invoke unresolved scan. Свежий view доказывает actual adoption/currentactor/runtime/remote+local raw. getResult возвращает исходный UNKNOWN до merge/persist. Cutover/projectRecovery/native/resource authority projection не принимает.

## Reopen и обычный graceful restart

Исторический CDP target/context закреплён только для issuance/static preflight/одного reload. Lookup/read-back/local projection заново выбирают unique installed fileURI с NEW loaded/disk pins, actual current actor и physical gates. Reopen AE может менять CDP target/context; fresh witness остаётся обязательным.

После runtime change stamp отзывается. Closed `rearm-current-once` не делает reload/connect/spawn/reset/project effects. Требует SAME source/assets/credential, external full-ready до/после fresh NEW panel/raw/local/index/physical read и continuous verified GRACEFUL lineage initial certificate/lastbinding→current.

Readonly `readVerifiedGracefulSuccession(root,{from,to})` использует existing successionFacts/predecessorExitFacts/strict continuation reader. Каждый переход требует exact endpoint refs, held-HANDLE WAIT_OBJECT_0 exit0, identity/timestamps/ACKs и positive ensure/restart result registered_admission_closed, writeAdmissionReleased:false, replayAllowed:false. Разрешены graceful shutdown, strict verified-shutdown row, verified graceful continuation. Force/crash/observed exit, startup/repair/maintenance/reset retirement, fork/gap/cycle, иной source/credential и UNKNOWN owning successor operation отказывают. Исторический UNKNOWN parent у strict verified continuation сохраняется; разрешение даёт отдельный положительный receipt.

Rearm добавляет CREATE_NEW+fsync HMAC runtime-binding/<current-generation>.json с previous binding SHA, from/to snapshots, lineage pins и fresh observation. Original certificate/reload-intent/receipts неизменны. Reader проверяет append-only chain и всю verified initial→current lineage, включая saved edge/pin prefixes. Succession census — fence внутри операции; следующий graceful restart не запрещается навсегда. Уже bound current даёт read-back only. Иной successor не наследует допуск по одному key.

## Закрытые команды после отдельного применения/review

```text
node scripts/panel-lifecycle-causal.js inspect
node scripts/panel-lifecycle-causal.js prepare-once
node scripts/panel-lifecycle-causal.js read-back
node scripts/panel-lifecycle-causal-upgrade.js reload-once
node scripts/panel-lifecycle-causal-upgrade.js read-back
node scripts/panel-lifecycle-causal.js rearm-current-once
```

Admin inspect/read-back дают raw inventory/adoptionObserved:false. Upgrade read-back отдельно сообщает fresh observed adoption или pending. UNKNOWN reload исключает повтор. Root sole controller проверяет фактические результаты; документ не заменяет runtime grants/gates.

## Offline evidence

Census содержит116 файлов: добавлены ровно core/observer/adminCLI/upgradeCLI. Собственные authority/observer/effect bytes входят в source seal. Supervisor изменён только readonly adapter/export. Старый copied backend baseline не входит в apply manifest.

- Core57: classifier, actual reviewed request/handler VM, real HMAC/canonical envelope и virtual CREATE_NEW. Stand-in hashes только для синтетических OLD assets.
- Observer18: fixed readonly CDP/storage, double/cleanup drift и final outer SHA.
- Protocol27 дополнительных +57 core: genuine core factory на virtual FS, static preflight/partial-copy closure, own nonce/sequence, actual panel factory, immutable getResult/reinvoke.
- Coupling19: actual request revoke-before-callback, actual bridge route observation entitlement, actual upgrade one-send/UNKNOWN/final-view0send, actual CEP projection/getResult,4 actual116-census byte mutations с отказом до causal sidecar key lookup/reload intent. Обязательная signed registration authentication не обходится.
- Daily33: actual readonly supervisor adapter +actual successionFacts с mocked уже проверенным predecessor/native journal reader; strict prior continuation/shutdown, identity/time/exit0/source/credential/fork/gap/UNKNOWN negatives,2 restarts и reopened target. Это contract/coupling proof, не native held-HANDLE live proof.

154 уникальных cases:57+18+27+19+33. Protocol запускает core57 повторно;84 нельзя ещё раз прибавлять к57. Final raw reports, syntax/diff и frozen10 production pins — в ignored draft evidence/. Live provisioning/install/reload/rearm этой стадией не выполнялись.

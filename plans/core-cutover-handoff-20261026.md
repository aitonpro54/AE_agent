# Передача: завершить AE Agent Core после текущего offline-блока

26 октября 2026. Передача подготовлена по прямой просьбе пользователя: «Завершай последнюю текущую задачу и дай промпт для продолжения в новом чате». Новый live-этап после этого поручения не начинать. Исходная цель — довести перенос до согласованной Core MCP/CEP сборки и настоящего host MCP `get_project_info` — остаётся незавершённой.

## Рабочие копии и последнее опубликованное состояние

- Original/runtime root: `C:/Users/Ant/Documents/Codex/AE_Agent_Core`, ветка `codex/core-migration`, последний опубликованный runtime commit `525edffa01ef35c9f183c430e76bc4ec27e1328e`. Это `a711f4c` (основной owned-loss блок), `14784c5` (факт публикации в плане) и cherry-pick historical-reader fix из repair. Source SHA `63e9ee0ffdfc5a43626b4950939e24f151b14c1aa65357d426b5d0f3d316fe8f`, 192 runtime names. **Этот dispatcher содержит обнаруженный ACK bug; owner на нём повторять нельзя.**
- Development: `C:/Users/Ant/Documents/Codex/AE_Agent_Core_repair`, ветка `codex/core-runtime-repair`, чистый checkpoint `86ce0936eb2f7d3e6d2fdf5148532e1e35e36249`. Текущий ACK/code-repair блок завершён offline и reviewed ACCEPT, но **не опубликован в original**.
- Legacy: `C:/Users/Ant/Documents/Codex/AE_agent`, ветка `codex/release-3.3.5`, HEAD на последней проверке `7acb153b`. Код и история сохранены. Source project MCP и глобальный `.gemini/config/mcp_config.json` всё ещё направлены на legacy.
- Установленная CEP остаётся прежней Core-сборкой, совпадавшей с original `4efc70b`; новые assets ещё не публиковались. Блок «Защита плейсхолдеров» удалён в reviewed исходниках, но не в установленной панели. Runtime root каталогом repair не заменяли.

## Фактический runtime: до любого нового Start

Old Core generation `1672be8d-76e4-4fa3-9994-8a750c8a2209`, migration operation `9c9fb972-201d-4c73-8bf2-35bd6c8596f9`, PID29964/birthFileTime134374129383492526. Initial registration/current/adoption ранее прошли; later exit/cause остаются **UNKNOWN**, exit proof отсутствует. Old runtime source `cc191dd1c263256f4b9c1b66f75eab4af7589a41ec84d9b0171a0772d777f529`. Не повторять original start/resume, prepare-genesis, state transfer или historical force WIP.

В original уже созданы и должны остаться byte-exact:

- `.codex-runtime/core-owned-loss-lifetime-proof.json`, SHA `bc6a62d128b4822c1c80ef1d686092e9587f5174d4abb95de7bbcae2a79d87a7`. Это accepted fixture prerequisite, `productionAcceptance=false`.
- `.codex-runtime/core-owned-loss/1672be8d-76e4-4fa3-9994-8a750c8a2209/disposition.json`, SHA `c84832b82a774dc348f7e9310674828bc6ce06d0156152cf7a53e8c2497b44e9` (D0). Закрепляет runtime `63e9…fe8f` (R0); подписанные исходные данные не переписывать.

Замещающий Core daemon **не запускался**: Root не отправлял `start-once`. На последнем подтверждённом чтении нет server journal, provision intent/origin, launch-once/binding/native-attempt/new generation; reservation directory только исходного `1672…`; current pointer и старые own refs не менялись. Защищённые store/marker и preference сохранены; последнее проверенное `desiredEnabled=true`, явное OFF необходимо сохранять, если оно появится.

## Фактический acquire timeout и причина текущего блока

Единственный acquire на опубликованном runtime `63e9…` запустил owner Node12952/native pwsh33196, tool session99552. Был отправлен **только** `acquire-core-loss-owner`; Start/provision/preflight не отправлялись. После 20 секунд CLI сообщил `core_loss_native_timeout_owner_retained` до создания readline/context. Поддерживаемого восстановления того же CLI context нет; late ACK отбрасывается.

Независимое bounded review подтвердило допустимость отмены именно собственного **пустого pre-Start** PTY, не Start/observer. Root один раз послал Ctrl-C: tool exit1, chunk `845c41`. Fresh 10:42:10 UTC: обе точные программы отсутствуют, old-case PIDs отсутствуют,3456 свободен; D0/lifetime/current/21 own refs неизменны, consumption/journal/new generation отсутствуют. Выполнение helper finally и retained kernel exit **не доказаны**; старый Core exit от этого не становится доказанным. Непрерывная pair lease не заявляется.

Audit A0: `.codex-runtime/core-cutover-observations/20261026/empty-owner-timeout-reconciliation.json`, SHA `6071e8b2b390e8f9d2c468d6fccc203e47c685f038d6cdb114bcf9a6b9241402`. Это operator-attested private-RPC evidence, не cryptographic kernel no-Start proof.

Детерминированная причина: `owned-runtime-daemon-helper.ps1` присваивает `$lossResult=LossDispatch $row`; прежний `Emit` возвращает JSON в PowerShell pipeline. ACK захватывается локально, не попадает в stdout Node. Повтор acquire того же кода повторит дефект. Исправление — loss-only direct-console `LossEmit`, общий `Emit` и единственный `'launch'` sentinel сохраняются.

## Принятое дополнение кода без переиздания authority

Root+independent design review ACCEPT: один fixed append-only `code-repair.json` в том же loss namespace, привязанный только к D0/R0/A0. Никакой общей revision chain, нового genesis/resume, operation/generation либо дополнительного Start.

Resolver хранит отдельно `{disposition, codeRepair, effectiveRuntime}` и не подменяет `d.value.runtime`. Сохраняются exact192 names/order и все неразрешённые source pins; helper меняет только trusted-import SHA, supervisor — только helper-policy SHA, C#/Node/pwsh/credentials/state/pref/assets/fences неизменны. В existing once и binding добавляются одновременно исходный D0 SHA и supplement SHA; native path проверяет всю цепочку до единственного Create.

После исправленного bootstrap acquire под настоящей pair разрешены лишь наблюдение, release и fixed `repair-code-binding`. Issuer работает **до** provisioning/consumption, проверяет точные исходные refs/current/runtime, свежие native guards и отсутствие новых/partial namespace artifacts. Historical reader после Start не должен снова требовать no-launch/no-provision/current bytes: это сломало бы admission/stop/succession. Global graceful validator не меняется.

Порядок следующего live-блока после публикации reviewed fix: fresh census → corrected owner/pair ACK → фактический CDP idle read → адресная установка тех же reviewed8 assets и известный exact-page reload/read-back без panel-input в lossdir → `repair-code-binding` → provision journal → fresh prelaunch witness → preflight → **один** Start. Затем retained observer, owner release, **actual owner exec tool completion**, новая real pair, same-HANDLE survival ≥5000ms, fresh activation, два post-adoption witnesses вокруг config redirect/readback, finish-redirect, observer release и только потом host MCP reconnect/настоящий typed read. Актуальный подробный порядок пока находится в **repair**: `C:/Users/Ant/Documents/Codex/AE_Agent_Core_repair/docs/core-owned-loss-runbook.md`; original-копия ещё не содержит текущую неопубликованную дельту.

## Операторы, backups и проверки

Все пути ниже — original Core, `.codex-runtime/core-cutover-observations/20261026/`:

- `code-publication/receipt.json`: original4efc→a711, verified27 source hashes, preserved21 own refs и protected2 bytes/identity; старый manifest сохранён. Historical-reader fix опубликован отдельно как525edff, actual original registration/origin/current descriptor читаются; fresh старый descriptor отвергается.
- `installed-cep-before-publication/`: byte-exact backup8, manifest SHA `45c10a3ed646b0962300ba0e16fac5bd2f487233a47de09107a565d817c7cb02`.
- `redirect-staging-v2/operator.cjs`: проверенные backups/staged source TOML и global JSON, `prepare/status` PASS, независимый Python tomllib/JSON semantic check PASS. Actual apply отсутствует. **V1 не применять** — известная offline ошибка offsets, исходные файлы она не меняла. Before apply повторить CAS, actual observer finalguard под той же pair; флаг оператора не является runtime authority.
- `witness-capture/capture-core-loss-witness.js`, SHA `908409209a69835b4dec7f33f7fe45057b53695cb91b3952b2b213049cdc05a0`: только ignored operator, не runtime. `prelaunch`/`post-adoption`; TTL15s; фактические CDP/state/storage/asset reads, empty physical `'{}'`, absent bootstrap, lawful numeric actor successor. Syntax и offline positive/negative fixtures PASS; actual capture/input write ещё не выполнялись. После новых API изменений сверить helper до исполнения.
- `local-connect-unknown.json`, SHA `3c2ac1f3b5e2c90b4755151009749693b87a54ef0314a6547af23465b6ec66e0`: exact own UI row `ee5f6b98-7f85-4941-9621-38b48c4bcbdc`, entry SHA `e337c35410d5de80ceaca69852ce7704256a26e6a335e653f6b62fda5df50e88`, UNKNOWN/noReplay сохраняются. Вложенный automatic request d2b9 не является этой explicit ee5f попыткой. Administrative coverage не утверждает no-effects/terminal/exit.

Уже принятый baseline: offline rules223; isolated MCP204/nativeFactories0; loss26; control/redirect45; transport4; native24; actualDOM/CEP; PS AST/C# compile; historical regression51/recovery38; scoped reviews ACCEPT. ACK stdout regression текущего блока PASS6 воспроизвёл старую ошибку и правильный stdout исправления на managed lower ports. Это не production/live acceptance. Итоговые проверки текущего supplement-блока указываются при закрытии ниже.

Откат кода: original tag `checkpoint/core-before-owned-loss-2026-10-26` →4efc70b; legacy tag `checkpoint/ae-agent-before-core-2026-10-25` →1b48076e. Runtime rollback требует lawful factual Core stop, current state/revisions/OFF и прежних scoped reverse gates; не накатывать старый snapshot поверх новой работы.

AME-код сохранён; новых AME работ/проверок нет. Providers, Full Intaker, Codeburn и посторонние улучшения вне scope. Один writer на ресурс, один live-контроллер; max2 helpers включая AGY. Общее разрешение миграции/MCP/CEP уже дано, технические gates сохраняются.

## Closing-срез текущего чата

Свежие read-only observations на `2026-10-26T11:32:02Z` сохранены в `handoff-closing-runtime.json` и `handoff-closing-panel.json` внутри того же ignored audit directory. Original-код HEAD525edff, legacy `7acb153b60f161d89946afc539257eeccebfcfda` чистый; original имел только этот новый handoff draft. Original controllers и адресные historical PID rows не найдены; listener3456 отсутствует, CDP8870 доступен. Это absence observation, не exit proof.

Loss namespace содержит **только disposition.json**; server journal отсутствует; reservations — только старый1672; D0/lifetime hashes прежние; `desiredEnabled=true`. Config staging v2: source/global `current=original`, stages/backups expected, apply intent отсутствует. Установленные8 совпали со старым backup; пять отличаются от новых source assets. Панель offline/runningfalse/physical0/nativefalse/pollfalse/actionStorage ready, единственный unresolved ee5f с прежним e337 SHA, заголовок защиты плейсхолдеров **в установленной панели ещё присутствует**. Ни CodeRepair, ни provisioning, ни daemon Start, ни redirect не выполнялись.

## Итог текущего offline-блока

Commit repair: **`86ce0936eb2f7d3e6d2fdf5148532e1e35e36249`**. Independent implementation review **ACCEPT**, открытых P1/P2 нет. Все17 frozen hashes совпали до/после review и после commit. Исходная D0 остаётся immutable; отдельный supplement связан с ней и эффективным runtime. Issuer/reader, bootstrap ограничения, once/binding/native checks и historical admission/stop/succession реализованы. Loss-only `LossEmit` отправляет ACK прямо в Console; общий `Emit` и routing sentinel сохранены.

```text
source   c0f66f08897312f74e0dad4bbe828e16099b9208722a52dd844b2454f7920bc4  (192 names)
helper   e2e220fbe4a8af1ca41b64538c5ca96bd68ae0718a48652d02c3d8f0be23c5ee
import   31e08d2bbc483a04797ad1ccc2044a0940ea0be389bbb87f4a628270a0700a97
manifest f1037593ec81a6a0f8b8393686a7544c4b7c3fc56924193a1af9c6d852ac9e35
freeze   364e3922a57399f0c337c9281216f98766ff03cb56bf0a1ebab12493e62079c6
```

Freeze file: `AE_Agent_Core_repair/.codex-runtime/core-owned-loss-ack-code-repair-review-freeze.json`. Проверки PASS: stdout6 (настоящий production main-loop/emitters→production createPipe с явно managed lower ports), retained transport4, native44, loss77, control45, rules225, isolated MCP204/nativeFactories0/liveAEfalse, PS AST4/production C# compile/exact b0b1 primitive, syntax/diff. Финальный issuer→resolver192 fixture PASS, Start/register0. Это offline/code acceptance; **original/S issuance/owner/daemon Start в этом блоке не выполнялись**.

Следующий конкретный шаг: прочитать свежие Git/config/runtime/pending факты, затем адресно опубликовать reviewed delta из repair в original **с сохранением этого handoff и оригинальных данных**. Original имеет собственные docs commits, поэтому не делать blind reset/FF к repair; выбрать cherry-pick/адресный перенос проверенной дельты, разрешив лишь документальные конфликты. Проверить точные pins и current state. Лишь затем corrected owner/pair → install/reload → `repair-code-binding` и остальной актуальный repair runbook. D0/lifetime не переиздавать; ни старый acquire на runtime63e9, ни original start/resume/force не повторять.

Пользователь остановил чат после завершения именно текущего offline-блока. Публикация последнего fix, supplement issuance и actual live cutover оставлены следующему чату осознанно, не из-за контекста или токенов. При необходимости host MCP reconnect пользователь делает адресный Restart `after-effects`; config bytes или отдельный adapter test не заменяют настоящий current-host typed read.

# AE Agent Core 4.0.0 — проектирование и постепенное извлечение

26 октября 2026. Проектирование завершено commit `1f5b8204ed4c50c3aed175f2709deefdfd7836a7`, offline M1 — `5667b5b8c9d29621cc5136d1abd89f6699ab9ce8`, [M2a](core-4.0.0-m2a-bridge.md) — `81ab980`. Текущий принятый этап — [M2b: offline-контракт событий проекта](core-4.0.0-m2b-events.md). Старый cutover handoff используется как описание сохранённого состояния. Установка/публикация, production daemon, подключение живого MCP/CEP/AE и Codeburn в этот блок не входят.

## Результат и документы

- [Intent и обязательные инварианты](../docs/core-4.0.0-intent.md).
- [Границы, контракты, mixed workflow и выбор проверок](../docs/core-4.0.0-architecture.md).
- [Codeburn: один ledger и документальная атрибуция уже начатой работы](../docs/core-4.0.0-cost-accounting.md).
- [Graphify: оценка и будущий ограниченный pilot](../docs/core-4.0.0-graphify-pilot.md).

Проектный критерий: локальная правка модуля затрагивает его identity, его проверки и доказанно затронутые контракты/потребителей. Она не меняет identity Core, pins чужого плана или результаты неизменённых функций. Полная проверка выпуска остаётся отдельным действием.

## Проверенная исходная точка и база будущей ветки

| Копия | Проверено чтением Git | Значение для 4.0.0 |
| --- | --- | --- |
| Основной Core | `codex/core-migration`, исходный HEAD `acfb5e88fbf49c8028421e0eca2a56abb4316928`, дерево до документов чистое | Сохраняет публикационные заметки и handoff; исходная база будущей ветки |
| Repair | `codex/core-runtime-repair`, HEAD `0af69779307bcdf0961e290e25f0f27de7db0911`, чисто | Проверенный ACK/code-binding checkpoint `86ce0936eb2f7d3e6d2fdf5148532e1e35e36249`, ещё не опубликован в основном runtime |
| Codeburn fork | `codex/core-4.0.0-module`, HEAD `55735f36034c5496bdfc253fde269622f56b015b`, чисто | База `3f36f682cdafccc649811eb86011088ea9243b81`; после `da04f76` только документационная поправка `FORK.md` |

Последняя опубликованная кодовая дельта Core — `525edff`, с известным ACK defect. Сравнены `525edff`→`86ce093`, состав самого `86ce093` и документационные cleanup commits `acfb5e8`/`0af6977`. У `86ce093` 13 изменённых файлов: fixed loss ACK, append-only code binding, связанные pins, проверки и адресная документация. Historical-reader fix `525edff`/repair `67e0fd2` уже совпадает по содержимому `core-prestart-recovery.js` и соответствующего smoke-файла: повторно переносить его не нужно. `AGENTS.md` обеих копий одинаков. В `plans/core-migration.md` есть разная фактическая история публикации; repair-план не заменяет основной. Два owned-loss design/runbook документа содержат дополнения repair, которые потребуется объединить адресно.

**Выбранная база:** `codex/release-4.0.0` создана от `1f5b820` в управляемом worktree `C:/Users/Ant/.codex/worktrees/core-4-m1/AE_Agent_Core`. Основной каталог остаётся на `codex/core-migration`/`1f5b820`. Проверенная дельта `86ce093` перенесена `cherry-pick --no-commit` без конфликтов с сохранением основных publication/handoff записей. Это изолированное изменение исходников, не публикация в действующий runtime. Повторное чтение подтвердило чистую базу Core и repair. `.git`, зависимости, credentials и runtime state не копировались.

ACK fix сохраняется как проверенный материал для извлечения control path; его принятие в исходники 4.0.0 не разрешает issuance старого supplement или old Start. Разработка 4.0.0 не зависит от завершения прежнего cutover. Перед будущим живым запуском отдельно сверить реальные pending/inflight, shared fences, origins и UNKNOWN по [сохранённому handoff](core-cutover-handoff-20261026.md); новая версия и новый UUID не доказывают отмену старых команд. В этом этапе свежий runtime census не выполнялся, фактический runtime описан только историческим срезом.

## Предложение первого этапа M1

**M1: минимальное управляемое ядро + optional plan engine + `photo-placeholder` + `titles` + один смешанный workflow.** Исполнение сначала на isolated transport fixtures, затем отдельная адресная live-приёмка по явно разрешённому scope. Это небольшой вертикальный срез, не перенос всех существующих typed handlers.

Первый photo scope: заменить source одного существующего слоя на уже импортированный still FootageItem; сохранить transform/timing. Первый titles scope: изменить Source Text одного существующего статичного text layer, сохранив форматирование. Не добавлять import/relink/fit, создание композиций или общий AE primitive набор в Core. Для других вариантов возвращать `unsupported`, без расширения полномочий.

| Подблок | Изменение будущей реализации | Проверяемый результат |
| --- | --- | --- |
| M1a: база и contracts | Сверить/перенести reviewed repair; ввести package ownership, public contracts, scoped manifests, validation map и fixtures | Состав базы и причины включённых проверок записаны; нет runtime/config публикации |
| M1b: control Core | Выделить lifecycle/connection/task queue/admission/receipts/shared fences; декларативный registry; один worker по запросу | Core поднимается без рабочих пакетов; worker не нужен для status/reset/diagnostics |
| M1c: два модуля | Извлечь только выбранные handlers/builders/validation/read-back; отдельные trusted executor assets и admission records | Generic discovery/build/propose/dry-run/run используют реальные typed contracts, чужие пакеты не загружаются |
| M1d: mixed recovery | Подключить optional plan engine и durable workflow/step results, свежие bindings, reset epochs | Фото подтверждено один раз; titles fault восстанавливается адресно; UNKNOWN не переигрывается |

Архитектурные названия будущих пакетов/файлов в документах — целевая схема, а не уже существующие APIs. Существующий `replace_layer_source` даёт материал для exact identity checks; у `update_text_layer` пока отсутствует exact layer-ID/previous-text CAS. Последний перенос требует доработки, а не механического перемещения кода.

### Измеримая приёмка M1

| ID | Сценарий и измерение | Какое обещание проверяет |
| --- | --- | --- |
| A1 | Физически убрать plan-engine и рабочие пакеты из fixture root. Core ready/status/disconnect/diagnostics работают; file access trace показывает 0 reads/hashes/imports из отсутствующих пакетов | Самостоятельный старт и отсутствие общего функционального manifest |
| A2 | После connect выбрать только titles. До выбора module imports=0, после — titles и только его явная dependency closure; photo/остальные packages не открыты. Plan engine загружается только при plan/workflow запросе | Настоящая lazy boundary; каталог не исполняет код |
| A3 | Изменить photo и обновить registry при idle; Core identity и уже созданный titles-only plan pins остаются byte-identical. Новый discovery видит photo без MCP reconnect; после безопасного drain перезапускается максимум worker | Независимые versions/pins и обслуживание без полного рестарта |
| A4 | Diff только titles implementation выбирает owner suite и exact titles↔typed executor contract fixtures, не photo suite. Изменение общего target contract выбирает обоих потребителей. Каждая включённая проверка имеет reason; неизвестный owner отказывает scoped-certification | Честная локальная проверка и сохранение неизменённого evidence |
| A5 | В mixed workflow счётчик mutation photo=1; после titles fault фото имеет durable succeeded/read-back. Recovery с новым runId/attemptId делает fresh targeted inspection и исполняет только titles; mutation photo остаётся 1 | Partial success, зависимости и no replay |
| A6 | Reset до send даёт 0 отправок; reset между authorize/send и потеря ACK не стирают receipt. Поздний worker reply со старым taskEpoch отвергнут; delivered/ambiguous command сохраняет UNKNOWN/fence до reconciliation | Сброс не выдаёт ложную отмену |
| A7 | Worker infinite loop/exit/невалидный IPC: Core status/reset/diagnostics отвечают ≤2 s на controlled local fixture. Новый send запрещён старой задаче; Core PID не меняется, pending AE receipt не теряется | Изоляция event loop и один контроллер |
| A8 | Подделанные effect/resource claims, чужая executor identity, script/code в worker output, stale target revision, недопущенный пакет и private import получают отказ до transport | Схема и hash не являются authority |
| A9 | Подменить пакет после выбора версии: текущий run использует immutable content-addressed copy либо отказывает до send. Чужая версия не меняет receipt старого шага; error не вызывает автоматический retry | TOCTOU/pin integrity и UNKNOWN/no-replay |
| A10 | Durable send-intent записан до физической отправки; crash в каждой границе intent/send/ACK/read-back сохраняет conservative reconciliation. Между reconnect и поздним результатом commands остаются сериализованными | Нейтральный resource ledger не зависит от plan engine/worker |

Адресные counterexamples внутри A5/A8/A10: ручной drift photo между failure/resume не вызывает повторную замену; совпадение нужного текста при ещё не завершённой UNKNOWN-команде не снимает fence; отзыв operation admission между dry-run/send блокирует отправку. Эти случаи уточняют уже заявленные инварианты и не расширяют состав M1.

Уточнение A4: для private-file titles diff широкая integration evidence перечисляется как deferred/current-closure-unverified; это не доказательство прежнего PASS для новой closure. При изменении общего Core выбираются реально зависимые component conformance и явно объявленные integration consumers. Намеренное изменение публичного поведения без schema diff задаётся `contractImpacts`. Deferred reporting не открывает отсутствующие packages и не блокирует module-only conformance; full release остаётся отдельным действием.

У fixture evidence явно указываются synthetic/native calls, pins и environment. Даже PASS A1–A10 не является live AE, визуальной или save/reopen приёмкой. Отдельный будущий live-срез на контролируемой копии AEP доказывает exact project/comp/layer identities, revision freshness и read-back выбранных двух операций; старые runtime UNKNOWN сначала сверяются. Save остаётся отдельным ручным gate. Полную release suite не запускать как условие каждой итерации M1.

## Следующие этапы после M1

1. **M2 — повторяемое извлечение.** Первый следующий нужный срез — [M2a optional CEP bridge](core-4.0.0-m2a-bridge.md): source-only transport/host dispatcher/durable completion и original dispatch provenance, без issuer/live launch. Далее переносить по одному нужному модулю: ownership/manifest → предметные builder/validator/executor/read-back → независимые pins → адресная regression. Core не импортирует модуль; shared API выделяется только при доказанной общей семантике и объявленных потребителях. Старый монолит не используется как скрытый fallback.
2. **M3 — необязательная аналитика.** Развить подготовленный Codeburn fork по отдельному плану учёта: выбрать одного владельца collector/DB, атрибуции existing events, report-only dashboard, таблицы/справка. Не блокирует M1/M2. Graphify pilot независим и также не блокирует продукт.
3. **M4 — выпуск 4.0.0.** Явная полная проверка выбранного состава выпуска, актуальная runtime reconciliation, installation/cutover и ограниченная live-приёмка отдельным разрешённым блоком. Это будущие действия, не продолжение старого runbook по факту завершения проектирования.

## Риски, компромиссы и действительно открытые решения

| Риск / компромисс | Принятое ограничение и evidence для закрытия |
| --- | --- |
| Предметный executor всё ещё способен на AE-эффекты | Только reviewed/admitted artifact, bounded typed schema и neutral policy enforcement. Worker под тем же OS user не sandbox; произвольные плагины не исполняются |
| Один worker может задержать другие workflows | Для M1 один worker и последовательные задачи; Core остаётся доступным. Pool не нужен до измеренной необходимости |
| Exact AE identity и revision после ручных edits | Адресный preflight/CAS в executor + read-back; отсутствие надёжной identity означает отказ. Это live evidence gap, не повод угадывать по layer index |
| IPC, ledger и manifests добавляют contracts | Держать surface малой; общие API изменения честно проверяют потребителей, прежняя полная runtime identity не переносится |
| Reset/kill не отменяет ExtendScript | Непрерывный core receipt/fence ledger, no-replay и отдельное reconciliation; атомарный rollback workflow не обещается |
| Изменение private code может повлиять на public поведение | Owner regression обязательна, consumer contract fixtures включаются при изменении exposed boundary/семантики; cache не скрывает новые failures |

Открыты только решения, требующие внешнего выбора или ещё не полученных фактов:

- Перед подключением Codeburn выбрать фактического владельца collector и DB path/установку; до этого fork остаётся исходником, не сервисом.
- Перед live/выпуском определить актуальный способ правомерного владения общими runtime/AE-ресурсами по свежим фактам. Исторический handoff этого не доказывает.

Границы core/engine/worker, первые два модуля, версия identities, no raw script, shared fences и partial-success semantics уже предложены конкретно; их не оставляем абстрактным «выбрать позже».

M2a offline завершён: новый optional bridge, durable receiver, fixed host dispatcher и original dispatch provenance проверены через actual TCP/VM. Итоговые scoped checks 54/54, boundaries18 PASS; source-only и review coverage limits — в [M2a validation](core-4.0.0-m2a-bridge.md). Producer/issuer/live installation не входят в этот результат; переход к ним требует отдельного актуального scope и shared-resource facts.

После восстановления исходного чата подтверждены чистые `codex/ae-agent-core-4.0.0`/`81ab980` и совпадение с upstream. [Предложение следующего offline-среза](core-4.0.0-next-scope.md) зафиксировано локальным `7a4d2e5`. Пользователь выбрал [M2b: offline-контракт событий проекта](core-4.0.0-m2b-events.md) с проверкой на симуляции. Текущий инженерный блок продолжает 4.0.0 без live/cutover/push.

M2b offline реализован: private lifecycle reducer, exact approval и проверки текущей incarnation перед send и terminal результатами. Разрешённые non-network batches **74/74 PASS**, boundaries18 PASS; review P2 закрыт. Mandatory CEP batch остаётся not-run, catalog-discovery deferred; полной scoped/release-сертификации нет. Детальные Progress/Decision Log/Validation — в [M2b work block](core-4.0.0-m2b-events.md). Production event source/issuer и live-приёмка остаются отдельным scope.

27 октября 2026 завершён отдельный разрешённый [engineering block H1–H4](core-4.0.0-audit-repairs.md) по итоговому аудиту той же базы `bd2d6fa`: исправлены completed read refusals, completion concurrency/deadline/drain, narrow resource restrictions и artifact ownership/atomic publication. **119/119 выполненных тестов PASS**, boundaries18 PASS; M2b сохранён. Оба CEP B6 исключены, whole CEP batch unverified, catalog-discovery deferred; release/live certification не заявляется. Спорные sibling-layer semantics не менялись; без AE, push и merge.

В последующем разрешённом targeted запуске оба ранее исключённых B6 прошли **2/2** после test-only исправления setup/child continuity. Production code и pins не менялись, CAS/assertions сохранены. Подробные baseline/final raw logs, команда и ограничения — в дополнении B6 существующей [Validation H1–H4](core-4.0.0-audit-repairs.md); весь CEP batch заново не сертифицирован.

По следующему явному поручению пользователя на чистом `29f1bfb` выполнен **весь CEP-набор: 15/15 PASS**, skipped/cancelled/todo0, оба B6 включены. Пробел whole CEP check для текущей closure закрыт; все59 файлов Core4 неизменны. Полные raw logs/evidence key — в той же [Validation](core-4.0.0-audit-repairs.md). Это offline CEP evidence, без release/live certification, AE, push или merge.

## Progress

- [x] Прочитаны start prompt, текущие AGENTS/README, адресный handoff и Git checkpoints; старый launch маршрут не возобновлялся.
- [x] Архитектурный блок делегирован `ae_architect` (Sol 6.1/XHigh role), Codeburn evidence — `ae_scout` (Luna/High role). Runtime model/effort токенов по этим настройкам не утверждаются. Оба read-only; root — единственный writer документов и координатор.
- [x] Подготовлены intent, architecture, mixed recovery, cost accounting, Graphify pilot и M1 acceptance. Root объединяет зависимые решения/факты; отдельного независимого writer для интеграции нет, чтобы не разойтись в contracts.
- [x] Адресное независимое review `ae_reviewer` завершено без P1/P2; уточнены три counterexample fixtures. Локальные ссылки/UTF-8 проверены, подготовлен отдельный документационный milestone commit `docs: design modular AE Agent Core 4.0.0`.
- [x] Реализован принятый пользователем offline M1 в отдельном worktree; A1–A10 покрыты isolated Node/VM fixtures и адресными regressions. Живая приёмка/публикация остаются отдельным блоком.

## Decision Log

- 2026-10-26: 4.0.0 имеет собственный intent и порядок работ. Незавершённый 3.3.5 cutover — сохранённый контекст, не prerequisite проектирования/реализации.
- 2026-10-26: permanent Core не зависит от предметных пакетов. Один on-demand worker изолирует зависание; neutral admission/queue/receipts/fences остаются в Core, lifecycle плана — в optional engine.
- 2026-10-26: independent content identities и plan closure заменяют общий hash всех функций. Registry — данные; новые модули обнаруживаются через стабильный generic MCP surface.
- 2026-10-26: для M1 выбран existing-photo-source + static Source Text; mixed workflow сохраняет успех первого шага и отдельно восстанавливает второй.
- 2026-10-26: Codeburn расширяет исходные события, а Graphify остаётся необязательным developer tool. Ни один не стартует вместе с Core.
- 2026-10-26: независимый reviewer не нашёл P1/P2. Предложенные counterexamples включены в существующую M1 matrix; неизвестные live/реализационные факты остаются evidence gaps, а не пройденной приёмкой. Локальный Pro review bundle подготовлен по allowlist, внешняя отправка/Pro review не проводились и не объявляются разрешением на реализацию.

## Validation

- Чтение Git подтвердило исходные SHA и чистоту трёх деревьев; Codeburn HEAD уточнён до `55735f3`. Сравнение addressed files не меняло refs/checkout.
- Связанность из стартового запроса не исследовалась повторно целиком. Адресно уточнены existing handlers, script transport/CEP boundary и Codeburn seams; Graphify проверен по pinned официальным исходникам.
- Продуктовые `check:rules`/`smoke:core-runtime`, daemon/native/live tools и Codeburn **не запускались**, по явному ограничению планового этапа. Документальные проверки и review фиксируются ниже при закрытии.
- Документальная проверка: 6 новых Markdown документов, 14 локальных ссылок, отсутствующих targets/ошибок UTF-8 нет. Независимое read-only design review — без P1/P2; Git/source assertions reviewer повторно не проверял. `git diff --check` и финальный `git diff --cached --check` — PASS; staged allowlist содержит только 7 Markdown файлов.
- Review bundle: `C:/Users/Ant/.codex/review-bundles/core-4.0.0-review-bundle.md`; manifest `COMPLETE`, included files 2, skipped 0, warnings 0. Privacy/allowlist и вопросы — [review request](core-4.0.0-review-request.md). Bundle прочитан локально, данные никуда не отправлялись; результат сохранён вне repository согласно правилу генератора.

## Реализация M1 — текущий work block

### Progress

- [x] По прямому поручению пользователя создан isolated managed worktree и ветка `codex/release-4.0.0` от design milestone `1f5b820`.
- [x] Проверенная ACK/code-binding дельта `86ce093` адресно перенесена без конфликтов; основной runtime root/ветка не изменены.
- [x] M1a baseline: 10 imported code/manifest hashes совпали с repair; rules225, isolated runtime204 и ACK stdout6 PASS. Отдельный milestone `chore: establish isolated Core4 baseline from reviewed ACK repair`; contracts/scoped manifests продолжаются в новом контуре.
- [x] M1b–M1d: самостоятельный контур `core4/`, два executor bundles, worker/optional engine, mixed recovery и объяснимый выбор проверок.
- [x] Независимое bounded review реализации: все конкретные P1/P2 закрыты; final scoped checks прошли. Milestone `feat: implement isolated modular Core4 M1` фиксирует новый контур и его документацию.

### Decision Log

- Реализация, тесты Node worker и synthetic transport теперь разрешены пользователем. Design-only stop line предыдущего этапа больше не запрещает эту работу; production/runtime/live/config/БД scope не расширен.
- Новый контур живёт в `core4/` со своим package, manifests и checks; старый 3.3.5 код сохраняется как provenance/проверенная база. Core4 не импортирует старые adapter/bridge-daemon и не использует старый монолит как fallback.
- `ae_specialist` владеет только `core4/**`: сложные взаимодействия admission/IPC/ledger. `ae_scout` адресно извлёк handler seams; `ae_operator` выполняет готовые baseline checks. Одновременно активны не более двух helpers. Root владеет plan/docs и Git commits; ни у кого нет live-controller scope.
- Production transport Core4 до отдельного подключения возвращает unavailable. Synthetic fixture authority изолирована и не публикуется MCP-инструментом. Текущий M1 не выдаёт production grants и не изменяет существующие credentials/полномочия.
- Независимый module review выявил P2: path/IDs с одной строкой session без provenance не отличают повторное открытие AEP. Контракт уточнён: sessionId — project-incarnation epoch; new/open/revert/replacement ротируют его, неизвестный lifecycle закрывает live admission. P2 закрыт offline same-path/same-IDs/new-epoch fixture; production lifecycle producer остаётся live evidence gap.
- Титры доказывают uniform/preserved style только для явно перечисленных character/paragraph fields. Это не all-style гарантия и не доказательство ExtendScript/live совместимости; unsupported при недоказанном поддержанном наборе сохраняется.
- По конкретному routing/evidence blocker назначен bounded `ae_architect` review. Принято разделение обязательного запуска и применимости evidence: actual byte dependencies сохраняются, component reverse closure обязательна; широкие integration checks вне private-file scope явно deferred/current-unverified. Public/declared semantic/shared-runtime impacts выбирают обязательных consumers. Это не обнуление зависимостей и не утверждение семантической эквивалентности по пути файла.
- Финальное review закрыло scope/CAS drift, stdio backpressure, project-incarnation contract, stale-lock takeover, terminal close, unknown constraint envelope и routing coverage. Короткий atomic gate сериализует владение journal; orphan gate автоматически не восстанавливается. Worker получает только минимальный OS env и запускается из immutable permanent closure. Неизменённые source bundles повторно целиком не review'ились.
- `recordContext` новых plan/command records описательный: обычный ingress явно `user_work/work_context`, fixtures — `technical_check/ephemeral_check`. Он не выдаёт authority и не снимает fence.

### Validation

- Исходные HEAD/branch/status проверены перед созданием worktree. Дельта repair применена без конфликтов, 13 tracked paths; `.codex-runtime` и установленный runtime не изменялись.
- Source seams подтверждены read-only scout: все expected IDs замены source в M1 обязательны, `fixExpressions=false`, независимый verifier; text setter требует новых exact ID/previous-text guards и доказательства uniform style либо unsupported.
- M1a baseline: `npm.cmd run check:rules` PASS (225 файлов; syntax/manifest/exclusions, imports0); `npm.cmd run smoke:core-runtime` PASS (204 tools, random fixture port, synthetic credentials, mutation refused, liveAE=false/nativeFactories=0); `node scripts/core-owned-loss-stdout-smoke.js` PASS6 (old ACK0/fixed ACK1, managed starts≤1, nativeCalls=0/liveProof=false). Каждая команда выполнена один раз; native suite не запускалась.
- Все 10 imported code/manifest файлов byte-exact совпали с repair: manifest `f1037593…`, native import `31e08d2b…`, helper `e2e220fb…`; docs/plan намеренно объединены с основными publication notes, а не заменены. AE/CEP/production owner/start и действующая конфигурация не затронуты.
- A1–A10 добавляются по фактическому выполнению; прежние design/offline результаты не объявляются новой live-приёмкой.
- Module review: 6 implementation/contract/executor файлов просмотрены и зафиксированы SHA; подтверждён один P2 project-incarnation, P1 нет. Node VM probe same-path/same-IDs с прежней session показал необходимость указанного контракта. Setter-after-start→UNKNOWN, mandatory expected guards, still-only и `fixExpressions=false` подтверждены чтением; полная runtime/fixture validation продолжается отдельно.

### Закрытие offline M1 — 26 октября 2026

Новый контур: [core4/README.md](../core4/README.md). Индивидуальные package/admission records, generic stdio MCP, permanent broker, один child worker, optional engine, actual JSX assets photo/titles и validation tools находятся в `core4/`; импорта прежнего bridge нет. Installed runtime, исходная основная ветка, credentials/config и AE-проект не менялись.

| Критерий | Фактическое offline evidence |
| --- | --- |
| A1–A3 | Отсутствующие optional packages и bad catalog; lazy selected loading; независимые Core/titles pins при photo/catalog refresh; immutable worker и минимальный env |
| A4 | Title private diff: 2 checks/1 batch, 4 теста без photo/engine; 7 affected integrations явно deferred. Shared Core выбирает component consumers и integration edges; semantic `contractImpacts` выбирает workflow; unknown owners/impacts отвергаются |
| A5 | Photo success сохраняется после titles fault, worker/broker restart и новой titles revision. Счётчик photo setter остаётся 1; drift и неизвестный исход требуют адресной сверки |
| A6–A7 | Reset до/после intent, late epochs, worker infinite loop/exit/malformed IPC; Core остаётся управляемым; receipts/UNKNOWN сохраняются |
| A8–A9 | Script/claims/foreign identities, stale expectations, revocation и resource constraints; read-back actual JSX в VM; selected artifact substitution и private imports отвергаются |
| A10 | 8 настоящих child-process crash windows, reopen ledger, command success до engine record, совпавший текст при ongoing UNKNOWN, один writer при reclaim, terminal close и orphan gate |

Проверки и точная область действия:

- Полный первоначальный new-Core4 набор: `npm.cmd --prefix core4 test` — 43/43 PASS. Это baseline до последних адресных constraints/routing fixes, а не release certification итогового diff.
- Итоговый frozen source: `node core4/tools/validate-diff.js core4/core/resources.js --run` — 10 обязательных checks в 3 неповторяющихся test-file batches: Core 31/31, photo 3/3, titles 4/4; всего 38 выбранных выполнений, без ошибок/пропусков. Их причины owner/shared-runtime/component-dependency перечислены самим selector. Отчёт сохраняет `releaseCertified:false`, `validation-routing` — deferred/current-closure-unverified для этого конкретного resource-only запроса.
- Отдельный owner diff самого selector/map: routing fixtures 5/5 PASS на итоговой версии, включая semantic impact, deferred coverage без открытия отсутствующих packages, batching и фактический titles-only subprocess. Не складывать пересекающиеся test groups как число уникальных тестов.
- Последний unknown-envelope fix: 2 targeted constraint regressions и 7 настоящих module consumers PASS; ключи/manifest ресурса совпадают. Boundaries — 13 source units PASS. Старые 3.3.5 suites после M1a без нового diff не повторялись.
- Финальный независимый read-only review — открытых P1/P2 нет. Последние два findings проверены адресными probes; остальных неизменённых runtime/module файлов повторного full audit не было.
- Node `v24.15.0`, Windows x64. Canonical Core pin: `d4a38d7254f5b7e381cdf5637fd9bc62e15c331ed9075918a8ea5224e75ba509`; raw core manifest SHA-256: `03958acba429c5af4d732c5a96142a2ccdcd20a4134b42548fbbe9327a8e891d`. Final resource/router/map/test hashes совпали у writer, reviewer и независимого validator. TAP последнего scoped запуска — локальный temp artifact `core4-resources-final-c1f519d6cd3248259d7fed6c03e2789e.tap.log`, не runtime authority.
- Closing representation check: все 45 staged Core4 файлов byte-exact совпадают с Git blobs, pin не изменился. Проверены 9 Markdown документов и 23 локальные ссылки; missing targets/ошибок UTF-8 нет. `git diff --check` и `git diff --cached --check` PASS. Старый основной checkout и repair сохраняются без рабочего diff.

Все проверки изолированы: native/live AE calls 0. Production CEP transport, project-lifecycle/grant issuer, actual style round-trip и актуальный shared-resource census **не подключены и не приняты**. Default connect возвращает unavailable; synthetic authority доступна только explicit private fixture embedding. Это завершение инженерного offline M1, не выпуск 4.0.0 и не разрешение live cutover. M2/M3/M4 остаются будущими блоками по своему scope.

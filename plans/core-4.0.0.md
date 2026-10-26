# AE Agent Core 4.0.0 — проектирование и постепенное извлечение

26 октября 2026. Текущий этап — **только проектирование** по `.codex/core-4.0.0-start-prompt.txt`. Этот план задаёт дальнейшую последовательность; старый cutover handoff используется как описание состояния. Реализация, ветки/checkout, установка, публикация, daemon, MCP/CEP/AE, Codeburn и продуктовые тесты сейчас не запускались.

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

**Выбор базы:** будущую `codex/release-4.0.0` создать от документального milestone этого плана в основном Core (потомок проверенного `acfb5e8`). Затем в новой ветке адресно перенести проверенную дельту `86ce093`, сохранив основные publication/handoff записи и согласовав только затронутые docs. Это не команда сейчас и не публикация в действующий runtime. До создания ветки повторить статус/HEAD и сравнение, если появились новые изменения. Не делать reset/слепой FF к repair и не копировать `.git`, зависимости, credentials или runtime state.

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

У fixture evidence явно указываются synthetic/native calls, pins и environment. Даже PASS A1–A10 не является live AE, визуальной или save/reopen приёмкой. Отдельный будущий live-срез на контролируемой копии AEP доказывает exact project/comp/layer identities, revision freshness и read-back выбранных двух операций; старые runtime UNKNOWN сначала сверяются. Save остаётся отдельным ручным gate. Полную release suite не запускать как условие каждой итерации M1.

## Следующие этапы после M1

1. **M2 — повторяемое извлечение.** Переносить по одному нужному модулю: ownership/manifest → предметные builder/validator/executor/read-back → независимые pins → адресная regression. Core не импортирует модуль; shared API выделяется только при доказанной общей семантике и объявленных потребителях. Старый монолит не используется как скрытый fallback.
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

- Принять ли M1 в указанном узком scope как следующий **implementation** block. Текущий запрос разрешает только документы.
- Перед подключением Codeburn выбрать фактического владельца collector и DB path/установку; до этого fork остаётся исходником, не сервисом.
- Перед live/выпуском определить актуальный способ правомерного владения общими runtime/AE-ресурсами по свежим фактам. Исторический handoff этого не доказывает.

Границы core/engine/worker, первые два модуля, версия identities, no raw script, shared fences и partial-success semantics уже предложены конкретно; их не оставляем абстрактным «выбрать позже».

## Progress

- [x] Прочитаны start prompt, текущие AGENTS/README, адресный handoff и Git checkpoints; старый launch маршрут не возобновлялся.
- [x] Архитектурный блок делегирован `ae_architect` (Sol 6.1/XHigh role), Codeburn evidence — `ae_scout` (Luna/High role). Runtime model/effort токенов по этим настройкам не утверждаются. Оба read-only; root — единственный writer документов и координатор.
- [x] Подготовлены intent, architecture, mixed recovery, cost accounting, Graphify pilot и M1 acceptance. Root объединяет зависимые решения/факты; отдельного независимого writer для интеграции нет, чтобы не разойтись в contracts.
- [x] Адресное независимое review `ae_reviewer` завершено без P1/P2; уточнены три counterexample fixtures. Локальные ссылки/UTF-8 проверены, подготовлен отдельный документационный milestone commit `docs: design modular AE Agent Core 4.0.0`.
- [ ] Реализовать M1 после решения пользователя; это не выполнено и текущим запросом не разрешено.

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

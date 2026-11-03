# AE Agent Core 4.0.0 — проектирование и постепенное извлечение

**Актуально, 3 ноября:** продолжается [доводка базы](core-base-reliability-20261101.md),
по прямому уточнению пользователя — доставка, поздние ответы и recovery.
B1–B3 ограниченно приняты; B4 installed/standard принят, configured B4 отложен
вместе с MCP/Codex maintenance. B5 добавляет составной TEMP HTTP/VM proof,
14fresh cases/55boundaries PASS, production unchanged; native delivery/late
callback и mutation recovery остаются открытыми. Titles/Slideshow на паузе.
Актуальные pins и запреты повторов — [checkpoint](core-base-installed-checkpoint-20261102.md).
Ниже сохранена история приоритетов; она не возобновляет отложенные действия.

**Актуальное уточнение, 1 ноября:** [база отдельно от Titles](core-base-reliability-20261101.md).
Пользователь отложил Titles/Slideshow; сначала comparative MCP research, затем
connection/recovery/diagnostics с ограниченными проверками. Project lifecycle —
отдельный research. R5 text mutation ниже сохраняется открытой, но не блокирует
обычные read-only циклы базы. Два отдельных Argon обращения завершены: plan ответ
получен и локально разобран, comparative ответ — отказ без исследования.

**Актуальный приоритет, 30 октября:**
[устойчивый запуск и восстановление Core/CEP](core-cep-lifecycle-20261030.md).
Один installation owner, тонкие stdio attachments и явный controller lease;
Titles — проверочный сценарий. Продуктовая очередь ниже следует после R1–R5.
Исторические live-read PASS не являются приёмкой нового lifecycle.

**Принятая архитектура и активный план, 29 октября:**
[внешние продукты / Titles](external-products-titles-20261029.md).
Пользователь поручил начать самостоятельный Titles-пакет вне `core4/`.
Продуктовая логика отделяется от допущенных операций AE и общего Core;
существующий runtime и его гарантии сохраняются. Порядок: Titles pilot →
проверка применимости → поставка capabilities → Slideshow; переносимость P1–P8
и полная приёмка выбранного выпуска — финальный этап. Ниже сохранена история.
T1 завершён: внешний `products/titles/`0.1.0,8/8offline checks PASS, настоящий
Broker build TEMP/VM, Core/CEP bytes unchanged. Следующий предметный этап — T2.
T2 live поручен пользователем и ведётся в [focused плане](titles-live-20261029.md).
C1a source/temp завершён: [standalone installer closure](../docs/core-standalone-closure-20261029.md),
7/7+5/5PASS, review fixes подтверждены локально; installed/dist не изменялись.

**Фактическая установка,29октября2026:** [manual install/live](core-manual-install-live-20261029.md).
Manual package3f9293… установлен после exact owner recovery; origins и original
UNKNOWN/disposition сохранены.109offline/tempPASS, independent installed read-back
и один real stdio MCP→CEP→AE read PASS(AE26.3x87,пустой проект,mutation0,exit0).
Diagnostic runtime закрыт. Затем [configured Codex-client proof](core-client-reconnect-20261029.md)
завершён в текущем чате: разрешённые shared restart и AE recovery после CEP crash,
managed33164→CEP→AE9672,один fresh native read PASS. Receiver12events settled,
pending/UNKNOWN0,mutation/save0; runtime и CEP оставлены подключёнными.
Standalone distribution apply closure gap исходного ad hoc пакета исправлен
новым штатным source builder и TEMP actual apply (C1a выше); старые dist
не переписаны. Full release,
manual mutation/adoption и P1–P8 не подтверждаются. Ниже — история этапов.

**Source/temp этап завершён, 29 октября 2026:**
[декларативная устанавливаемая композиция](core-installed-composition-20261029.md).
Source `ed747ef`, local fixes `510d5ca`; final scoped75PASS +exact-f5481PASS,
boundaries28PASS. Readonly40/manual59 собраны детерминированно; independent
source review ACCEPT, единственное Argon `go`,3P3 разобраны локально.
Configured Core4 tools доступны; status/discovery/contract прочитаны в текущем
чате. Installed f548 пока не меняется: receiver store закрыт, marker старше
нынешнего MCP, pending/unresolved пусты, историческая UNKNOWN имеет disposition.
Native read при закрытом store не отправляется. Следующий зависимый блок —
обслуживание ownership и установка final candidate, без повторного XVI INSTALL.
Независимая горячая установка модулей пока не реализована. Следующие записи сохраняют
историю завершённого аудита и прежних установок.

**Актуальный блок, 29 октября 2026:** [аудит после переустановки внешней среды](core-post-reinstall-audit-20261029.md).
Installed f548 проверен; панель подключилась в первом снимке примерно через818мс
после открытия и оставалась Connected в снимке через376с. Свежий MCP→AE read
этого чата не подтверждён: tools отсутствуют, existing proxy os10050.
Исправлен подтверждённый предел16descriptors в истории обновлений;
17updates с installed startup/store и UNKNOWN/no-replay проверены адресно.
M1:108PASS, baseline connection/install suites:86PASS, boundaries21PASS.
Fixed installed composition всё ещё требует titles-current-target; независимая
установка модулей и P1–P8 остаются открытыми. Следующий абзац — история до
завершённой установки f548, а не текущая рекомендация повторить recovery.
Единственное Argon review аудита: `go`,2P3, локально учтены; повтор не нужен.
Следующий composition блок включает release-specific verifyCep и проверку
перехода с fixed f548 при сохранении historical disposition.

**Текущий приоритет, 29 октября 2026:** по прямому поручению пользователя
перенос на десктоп отложен до устойчивой работы на MSI. Продолжается локальная
доводка; первый ограниченный блок — [повторное подключение панели](core-msi-panel-reconnect-20261029.md).
Configured MCP → CEP → AE read-only уже подтверждён в `5e5b36e`.
В текущем turn Core4 tools отсутствуют в inventory при работающем MCP-процессе;
новый сервер вместо него не запускается. Manual mutation/adoption ещё не приняты.
P1–P8 остаются открытым требованием, работы второй машины сейчас отложены.
После разрешённого поручения прежнему чату выяснено: очередь пуста, штатное
закрытие managed MCP недоступно. Windows подтвердил AEcrash RuntimeInstaller.DLL;
AE завершился, MCP21872 остался. После restart Codex прежний owner завершён,
но новый26568 вновь удерживает installedfa9e; fresh file verifier PASS,
existing proxy снова os10050. Готов отдельный launcher штатной установки
f548 при закрытом Codex:29fixture assertions PASS, actual check-only закрыт
занятым owner до apply. Candidatef548 пока не установлен; актуальные facts —
в [локальном плане](core-msi-panel-reconnect-20261029.md).
Следующие вводные записи сохраняют историческое состояние своих этапов.

**Продолжение 29 октября 2026:** startup-причина `installation_path` воспроизведена
на exact configured argv. Исправлен installer: native paths сохраняются в MCP
TOML; regression потребляет generated config.45 selected и boundaries21 PASS.
Actual project entry исправлена, отдельный installed process с её точными argv
дал initialize/status PASS и clean exit0. fa9e/CEP/state сохранены, AE sends0.
Managed Codex-client ещё не перечитал запись; existing proxy недоступен (10050).
[Progress/Decision Log/Validation](core-portability-installation-20261028.md).

**Продолжение 28 октября 2026 по прямому поручению пользователя:** точная
установка fa9e повторно верифицирована. Configured-client reconnect остаётся
открытым: tools отсутствуют, existing app-server proxy отказал socket10050
до initialize. Завершён первый независимый [source-блок переносимости installer](core-portability-installation-20261028.md):
workspace больше не зависит от cwd, Node выбирается автоматически; final45/45
selected PASS, boundaries21 и actual foreign-CWD dry-run PASS. Runtime fa9e/60files
и local state bytes сохранены. Новых AE sends нет; P1–P8 пока открыты. Следующая запись об остановке — история
предыдущего завершённого ремонта.

**Актуальный итог 28октября2026:** текущий ремонт панели и read-only установка
завершены. Installed package `fa9e2f454588`, source `36905c4`; authenticated
installed MCP stdio→CEP→AE native read PASS. Исходный UNKNOWN сохранён как
история с verified terminal disposition/noReplay; новое чтение имеет новый ID.
Own proof process закрыт exit0, owners/gates0, MCP enabled=true восстановлен.
Configured Codex-client reconnect остаётся первым шагом нового чата.
По поручению пользователя работа здесь остановлена; [handoff](core-panel-installation-handoff-20261028.md).
Переносимость десктоп↔MSI остаётся обязательным незавершённым критерием готовности.

Следующие вводные абзацы — **исторический статус до завершения recovery**;
ограничения6c94/947 не описывают текущую установленную версию.

Последний actual результат: установлен6c94, authenticated CEP link PASS.
Одна native read остановилась на ES3 reserved word protected154, UNKNOWN сохранён.
Минимальный source fix и42checks/independent ACCEPT готовы, новый package947
не установлен до корректного reconciliation. Точный статус и следующий блок —
[native ES3/recovery](core-native-es3-recovery.md); старые pending записи ниже
сохраняют историю, а не отменяют этот fence.

Актуализация28октября: по прямому поручению пользователя схема Argon теперь
одно review → локальная проверка/исправление замечаний → local tests/read-back.
Обязательные второе result-review, повторы fixes и финальный Argon gate отменены
для всей схемы. Старые записи таких gates ниже — история. Origin package6c94
установлен с verified read-back; actual CEP read ещё ожидает открытия панели
после nullptr warning AE, см. [focused план](core-4.0.0-origin-repair.md).

Последний завершённый блок установки: package6c94 применён штатно, read-back
56release/7CEP и реальный installed MCP initialize/status/contract PASS, origins
сохранены. Proof client завершён exit0, owners отсутствуют, receiver journal
содержит только origin (native commands0). AE UI завис после nullptr warning;
пользователь подтвердил повторяемость зависания. Root не делает новых UI-вводов
и ждёт отдельного разрешения на restart/при необходимости exact-process kill.
Общая схема одного review закреплена в обоих проектах; итоговый result01 больше
не gate и не переотправляется. UTF-8/62относительные ссылки/diff документации PASS;
код runtime не менялся, прежние33selected checks не повторялись без причины.

26 октября 2026. Проектирование завершено commit `1f5b8204ed4c50c3aed175f2709deefdfd7836a7`, offline M1 — `5667b5b8c9d29621cc5136d1abd89f6699ab9ce8`, [M2a](core-4.0.0-m2a-bridge.md) — `81ab980`. Принятый offline-контракт — [M2b](core-4.0.0-m2b-events.md). 27 октября начата подготовка минимального реального среза на MSI: bounded read-only readiness и план приведены в конце этого документа. Старый cutover handoff используется как описание сохранённого состояния. Текущий блок не запускает installation/cutover, production daemon, живые MCP/CEP/AE-команды или Codeburn.

## Результат и документы

- [Intent и обязательные инварианты](../docs/core-4.0.0-intent.md).
- [Границы, контракты, mixed workflow и выбор проверок](../docs/core-4.0.0-architecture.md).
- [Постоянное правило переносимости AE Agent Core: десктоп ↔ MSI и приёмка P1–P8](../docs/portability.md).
- [Codeburn: один ledger и документальная атрибуция уже начатой работы](../docs/core-4.0.0-cost-accounting.md).
- [Graphify: оценка и будущий ограниченный pilot](../docs/core-4.0.0-graphify-pilot.md).

Проектный критерий: локальная правка модуля затрагивает его identity, его проверки и доказанно затронутые контракты/потребителей. Она не меняет identity Core, pins чужого плана или результаты неизменённых функций. Полная проверка выпуска остаётся отдельным действием.

**Обязательный критерий готовности, добавлен 28 октября 2026:** выбранный состав
должен поддерживать перенос крупных архитектурных блоков десктоп ↔ MSI без
повторной ручной настройки после первичной подготовки двух сред. Это постоянное
требование всего AE Agent Core, включая следующие версии; Core4 — рабочее
название текущего среза. Реализация и фактическая приёмка P1–P8 входят в активный
[план установки](core-4.0.0-installable.md). Пока они открыты, локальная установка
или положительный review не означают готовности выбранного состава.

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

- 29 октября: выполнен аудит прошлых workaround/compatibility changes и
  ordinary connect; текущая сводка, source correction и границы приёмки —
  [post-reinstall audit](core-post-reinstall-audit-20261029.md).

- [x] Разрешённая пересылка в прежний чат выполнена; shutdown не подтверждён.
  Полный installer closure63/dry-run PASS. Root read-only подтвердил AEcrash
  и exit; установкаf548/live verification остаются открытыми.
- [x] 29 октября: по новому приоритету переноса нет; локальный CEP reconnect
  source repair прошёл47selected/boundaries21/source ACCEPT. Candidatef548
  подготовлен, installedfa9e не менялся; live update ждёт штатного освобождения
  владельца предыдущего чата. [План и evidence](core-msi-panel-reconnect-20261029.md).
- [x] 29 октября: standalone endpoint observation реализована и проверена
 21selected PASS/root actual occupied; runtime package неизменён. Это отдельный
  шаг переносимости, без install grant/capability/round-trip PASS;
  [Progress/Decision Log/Validation](core-endpoint-observation-20261029.md).
- [x] 29 октября: configured MCP → installed fa9e → authenticated CEP → AE
  подтверждён одной новой typed read-only inspection пустого проекта. Очередь
  после чтения пуста, UNKNOWN/faults=false; manual mutation/adoption, P1–P8
  и full release остаются открыты. Подробности — в focused плане установки.
- [x] 28октября завершён текущий ремонт установки/панели: packagefa9e2f454588,
  actual native read PASS, original UNKNOWN/noReplay сохранён; source36905c4.
  История и результат — в handoff; следующие milestones по просьбе пользователя
  здесь не запускаются. Общая готовность Core4 и P1–P8 ещё не закрыты.
- [x] Прочитаны start prompt, текущие AGENTS/README, адресный handoff и Git checkpoints; старый launch маршрут не возобновлялся.
- [x] Архитектурный блок делегирован `ae_architect` (Sol 6.1/XHigh role), Codeburn evidence — `ae_scout` (Luna/High role). Runtime model/effort токенов по этим настройкам не утверждаются. Оба read-only; root — единственный writer документов и координатор.
- [x] Подготовлены intent, architecture, mixed recovery, cost accounting, Graphify pilot и M1 acceptance. Root объединяет зависимые решения/факты; отдельного независимого writer для интеграции нет, чтобы не разойтись в contracts.
- [x] Адресное независимое review `ae_reviewer` завершено без P1/P2; уточнены три counterexample fixtures. Локальные ссылки/UTF-8 проверены, подготовлен отдельный документационный milestone commit `docs: design modular AE Agent Core 4.0.0`.
- [x] Реализован принятый пользователем offline M1 в отдельном worktree; A1–A10 покрыты isolated Node/VM fixtures и адресными regressions. Живая приёмка/публикация остаются отдельным блоком.

## Decision Log

- Переустановка внешней среды не отменяет доказанные ES3/MCP/Windows path fixes
  или UNKNOWN/no-replay. Разовые recovery operators не включаются в startup.
  Дефект числового предела lineage устраняется отдельно от архитектурного долга
  fixed installed composition; новый recovery/cutover не создаётся.

- Old configured client сохранил Node21872:core_disconnect не завершает stdio.
  Force kill/marker cleanup не используются. После AEcrash source-only кандидат
  не объявляется установленным; native0/restart0, перенос по-прежнему отложен.
- Локальная доводка MSI имеет приоритет до переноса. Быстрое переоткрытие CEP
  обрабатывается ожиданием bounded handshake; server/auth/UNKNOWN не меняются.
  Недоступный configured MCP не заменяется вторым владельцем или live proof
  через offline fixture; source milestone и установленная проверка разделены.
- Успешный installed stdio proof не объявляется configured-client proof. Новый
  чат начинает с Core4 MCP status/reconnect; повтор original command запрещён.
  Постоянное правило двусторонней переносимости и схема одного Argon review
  сохраняются. После текущего результата Root остановлен по поручению пользователя.
- 2026-10-26: 4.0.0 имеет собственный intent и порядок работ. Незавершённый 3.3.5 cutover — сохранённый контекст, не prerequisite проектирования/реализации.
- 2026-10-26: permanent Core не зависит от предметных пакетов. Один on-demand worker изолирует зависание; neutral admission/queue/receipts/fences остаются в Core, lifecycle плана — в optional engine.
- 2026-10-26: independent content identities и plan closure заменяют общий hash всех функций. Registry — данные; новые модули обнаруживаются через стабильный generic MCP surface.
- 2026-10-26: для M1 выбран existing-photo-source + static Source Text; mixed workflow сохраняет успех первого шага и отдельно восстанавливает второй.
- 2026-10-26: Codeburn расширяет исходные события, а Graphify остаётся необязательным developer tool. Ни один не стартует вместе с Core.
- 2026-10-26: независимый reviewer не нашёл P1/P2. Предложенные counterexamples включены в существующую M1 matrix; неизвестные live/реализационные факты остаются evidence gaps, а не пройденной приёмкой. Локальный Pro review bundle подготовлен по allowlist, внешняя отправка/Pro review не проводились и не объявляются разрешением на реализацию.

## Validation

- Новый audit: M1 108/108, baseline connection/install 86/86 и boundaries21PASS;
  finite inventory отрицательные случаи и real17updates проверяются в focused
  record. UI connection, offline regression и configured native proof разделены.

- Продолжение установки: dry-run63closure PASS, packagef548 неизменён;
  owner-thread status empty, managed shutdown not-supported. ApplicationError1000
  подтвердил AE26.2/RuntimeInstaller.DLL/c0000005; root censusAfterFX0/Node21872.
  Actual install/live proof отсутствует;47source checks заново не запускались.
- Reconnect source:47PASS/0FAIL, meaningful baseline-negative1FAIL,
  boundaries21/syntax/diff и independent source review ACCEPT. Deterministic
  packagef548/60files, actualfa9e read-only verification PASS. Fresh native
  приёмка обновлённой панели и manual mutation ещё открыты; full release0.
- 28октября, actual `root-final-native-proof.json` в локальном каталоге
  `snapshots/core4-live-proof/VII-native-read-recovery-20261028/`: fresh CEP/AE26.2x49,
  empty project, one completed new inspection, mutation/save/replay0; журнал6,
  byte-identical original prefix3 и verified historical disposition. После clean
  close owners/gates0. Full-release/вторая машина/configured-client не приняты.
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

## Подготовка минимального реального среза — readiness на MSI

27 октября 2026. Поручение: подготовить Core4 → AE на отдельном тестовом AEP; первый обозримый блок — свежие read-only факты, ограниченная архитектура и, если доказан контракт подключения, source-реализация. Baseline: чистый `0ffd28432a9af4114d0d5e8dcd15d8bc5fa4fc30`, ветка `codex/ae-agent-core-4.0.0`, origin `https://github.com/aitonpro54/AE_agent.git`. Рабочий root: `C:/Users/Ant/Documents/Codex/AI Coverage Agent/AI Agent Core`. Версия остаётся 4.0.

### Progress

- [x] HEAD, ветка, origin и чистота сверены; прочитаны AGENTS, README, основной план, M2b и H1–H4/B6 Validation.
- [x] Снят ограниченный OS/installed snapshot без credentials, конфигурационных изменений, подключения к AE или запуска служб.
- [x] `ae_architect` выполнил bounded read-only анализ private seams. Root — единственный writer и AE/CEP/UI-контроллер; агент не управлял runtime и не менял файлы.
- [x] Записаны разрывы, последовательный план и критерии go/no-go. Это завершённый readiness-блок; production source/live-приёмка не заявляются.
- [x] Отдельным source-only блоком проверены опубликованные API-материалы и queued-execution контрмодель:11/11 VM-сценариев. Решение — native capability остаётся **не доказана**, подробности ниже; отсутствие API не утверждается.
- [ ] Подтвердить native capability contract для project-incarnation в момент исполнения; затем реализовать выбранный private канал, production issuer и shared-lane admission по шагам ниже.
- [ ] Получить свежий authenticated runtime census, конкретный тестовый AEP и server-owned typed plan до живых проверок.

### Проверенные факты и непроверенные состояния

| Область | Наблюдение | Практический предел |
| --- | --- | --- |
| AE | PID4312, `C:/Program Files/Adobe/Adobe After Effects 2026/Support Files/AfterFX.exe`; есть CEPHtmlEngine children | Не доказывает готовность API или identity открытого AEP; проект не читался и не менялся |
| Installed CEP | `com.codex.aemcpbridge`, manifest version3.3.3; 6 из 8 выбранных assets отличаются от legacy `cep-panel/` этого checkout; совпали guard и CSInterface | Это сравнение bytes двух копий, не Core4 adoption и не оценка совместимости по номеру версии. Ничего не публиковалось/не reload-илось |
| OS listeners | Успешный `Get-NetTCPConnection -State Listen`: среди наблюдавшихся node PID listeners не найдены | Одномоментный OS snapshot; не доказательство idle, отсутствия daemon/отправки или terminal exit |
| Target state | В текущем checkout нет `.codex-runtime` и `logs` | Состояние старых копий и общих ресурсов этим не установлено; чужие dirty files не читались/не менялись |
| Typed runtime census | В доступном каталоге tools нет bridge status/project tools; authenticated pending/inflight/edit-session/UNKNOWN/shared-lane census не получен | Все эти состояния **unobserved**, а не0/idle. Live admission закрыт |
| Core4 | Default `Broker.connect` возвращает `live_transport_not_installed`; stdio не передаёт private embedding | Даже исправно установленная старая CEP-панель не подключает новый Core автоматически |

Сохранённый full CEP15/15 на MSI, targeted B6 на новом пути и совпадение59 файлов из передачи переиспользуются как историческое offline evidence. Повторный аудит или full CEP suite в этом документальном блоке не выполнялись.

### Decision Log

- **Source GO: только после подтверждения физического lifecycle-контракта; live сейчас NO-GO.** [Private authority](../core4/core/authority.js) выпускает только явно synthetic lifecycle. `validateLifecycleBinding` проверяет private текущий объект; JSON, `synthetic:false`, path/dirty/revision, PID, store/channel epoch и `AE_CORE_SESSION_ID` из payload не могут создать production authority.
- [Broker](../core4/core/broker.js) проверяет lifecycle перед transport send; [actual JSX](../core4/modules/titles/executor.jsx) сверяет `AE_CORE_SESSION_ID` и exact target. Межпроцессная доставка может задержать физическое исполнение. Production producer обязан доказать актуальность incarnation непосредственно на AE execution boundary, включая ручные/внешние same-path new/open/revert/replacement. Событие, доставленное в CEP после смены проекта, само по себе эту границу не закрывает. Наличие подходящего native hook/API здесь **не установлено**.
- [Transport](../core4/integrations/cep/transport.js) принимает private channel, но реальная stdio Node ↔ CEP renderer доставка отсутствует; текущая TCP-реализация находится только в [synthetic fixture](../core4/test/fixtures/cep-host.js). Host dispatcher, receiver и durable completion store уже есть. Новая in-process обёртка над ними сейчас не решила бы IPC, lifecycle или shared-lane gap, поэтому production-код и pins в этом блоке не меняются.
- Core4 state lock и resource ledger не являются actual shared-lane ownership старого runtime/AE. Новый каталог/UUID не отменяет pending/UNKNOWN и не снимает resource fences. Старый cutover runbook не исполняется; credentials, grants и runtime state не переносятся.
- Минимальная первая операция — **titles-only**: один существующий статичный single-line text layer в отдельном сохранённом тестовом AEP. Photo/mixed workflow добавляется после доказанного titles-path; отдельный test AEP не отменяет общую физическую очередь. Текущий рабочий AEP не является тестовой целью.

### Последовательный план и приёмка

| Шаг | Конкретный scope | Проверяемое условие завершения |
| --- | --- | --- |
| 1. Native capability decision, source-only | Определить реальный источник new/open/revert/replacement и способ проверки incarnation **в AE до target lookup/setter**; записать API, lifetime, authentication, coverage ручных переходов и потери observer. Не выполнять native вызовы/установку для этого исследования | Рассмотрена задержка send→evaluate и same-path/same-IDs replacement. Если гарантии недоступны, зафиксирован конкретный gap; connect остаётся unavailable. Polling/path/hash не объявлены observer |
| 2. Private production boundary, source-only | После шага1 выбрать explicit Node↔CEP IPC с подтверждённым runtime обеих сторон; связать channel/controller/command/store/pinned executor с private producer. Проработать actual shared-lane owner/census provider до разрешения первого send; UI/службы не стартовать | Reviewable API без discovery/fallback/raw ingress; один owner, same-store completion, loss/timeout/disconnect сохраняют UNKNOWN/no-replay. Private producer не является public event-injection tool. Synthetic issuer не переименован в production |
| 3. Issuer и execution admission, source-only | Сервер регистрирует exact proposal/step/target/baseline/pins; реальное подтверждение пользователя связывается с этой записью. Resource/checkpoint и held shared-lane проверяются снова на границе отправки/исполнения | Forged/stale/revoked grants и потеря lifecycle/ownership блокируют setter. После physical send отказ не доказывает no-effect; между durable intent и send definite rejection допустим только при доказанном срабатывании guard до отправки. Есть scoped regression на обе стороны физической границы и независимый read-back; confirmation недоступен public MCP как Boolean |
| 4. Fresh live readiness | Единственный контроллер получает authenticated pending/inflight/active-edit/UNKNOWN/resource census и actual ownership. Затем готовится отдельный тестовый AEP и адресная загрузка только reviewed компонентов в отдельно определённом installation scope | Exact source/runtime/installed identities, protocol/capability match и disposition каждого влияющего fence получены свежими. Missing/denied/unknown не превращены в пустой census. Без этого нет physical inspect, bootstrap или замены открытого AEP |
| 5. Read-only AE proof | На явно выбранном test AEP проверить actual JSON/API capabilities, session/project/comp/layer identities, titles snapshot и перечисленные style fields через новый typed путь | Реальный correlated receiver result на тех же pins/store/epoch; один bounded запрос, без raw fallback и повторения timeout. Unsupported/undefined/mixed styles остаются отказом; это read-only evidence, ещё не mutation PASS |
| 6. Одна typed mutation | Зафиксировать exact test AEP/compId/layerId/session/revision/oldText/newText, checkpoint и scope; `inspect → build → server proposal → dry-run → confirmation → run → independent verify` | Одна исходная mutate-команда с correlated durable completion, без replay; единственный вызов setter подтверждается source-контрактом executor. Изменён только одобренный Source Text, перечисленные protected поля совпали. Fresh server grants и подтверждение по риску получены **до** AE-изменения. Timeout/UNKNOWN не replay. Save/reopen/destructive/raw требуют собственных manual gates и сюда не входят |

Пока не определены test AEP и actual target IDs/revision, строка шага6 — приёмочный контракт будущего server-owned плана, **не исполнимый план** и не выданное подтверждение. Целевые файлы для будущей source-реализации выбираются после шага1: private authority/receiver API, выбранная optional integration и её consumers; Core не импортирует старый bridge/adapter. Новый optional artifact получает собственный pin, реальные dependency routes и адресные checks. Нельзя ослаблять validation map, чтобы скрыть затронутого потребителя.

### Validation и продолжение

- Read-only evidence: `C:/Users/Ant/AppData/Local/Temp/core4-msi-readiness-fdec7cd95c324a70b464091d18ea87c3/readiness.json`, SHA-256 `b42adc99ee2daed5b543a9beef7757c64c5fa6c27c8ba55bd5e950d7f0f92956`; `core4-before.json` содержит59 hashes. OS/installed snapshot имеет timestamp и не выдаёт runtime authority.
- Результат этого блока — документация и read-only readiness. Native AE calls0; нет physical project reads/mutations, browser/Argon/Codeburn, production services/factories, установки/reload/cutover, config/credential/state edits, push/merge. Старый `AE_agent` и stage-копия не затрагивались.
- Closing checks: UTF-8 и22 локальные ссылки изменённого Markdown PASS, `git diff --check` PASS; все59 Core4 файлов совпали с before snapshot. Результат сохранён в `validation.json` рядом с readiness. Тот же read-only архитектор выполнил bounded review плана: уточнены intent/send rejection и границы доказательства единственного setter; OS facts/hashes им независимо не проверялись, runtime/тесты не запускались. Исполняемые файлы не меняются, поэтому offline suites/seal/release повторно не требуются; `releaseCertified:false`, live PASS отсутствует.
- На закрытии readiness следующим шагом был **source-only native capability decision**; результат последующего поручения записан ниже. К implementation канала переходить по доказанному контракту, не по отсутствию ошибок у старой панели. Root сохраняет ownership; продолжение остаётся в текущем чате, новый handoff/chat не требуется.

### Native lifecycle API — source-only проверка

27 октября 2026 пользователь поручил проверить same-path open/revert и смену проекта между отправкой и исполнением; AE и установленный runtime исключены. База — чистый `5c0cb6d520a987d657c0dae63bb24e95fd653ed6`. Root владеет документацией и изолированным diagnostic probe; тот же `ae_architect` адресно анализирует Core4 и читает evidence без записи, запусков и веб-исследования.

#### Progress

- [x] Проверены доступные исходники Core4, публичные материалы Adobe CEP/UXP и маршрут получения C++ SDK. В репозитории нет C++ SDK headers/native implementation; bounded поиск SDK-файлов в Downloads и SDK-каталогов верхнего уровня Documents ничего не дал. Это не полный поиск по компьютеру.
- [x] Локализована граница send→native execution; прежний callback delay не признан проверкой очереди перед исполнением.
- [x] Выполнена отдельная условная VM-матрица с actual Broker/worker/transport/receiver/dispatcher/titles JSX и durable store; raw TAP и воспроизводимый probe сохранены вне runtime/репозитория.
- [x] Записано решение: **доказательства production capability недостаточно**. Source-only исследование и контрпример завершены; реализация безопасного native producer и live GO из этого не следуют.
- [ ] Получить официальный version-bound C++ SDK/API-контракт, применимый к AE26.2, и проверить точную гарантию identity/invalidation/ordering. Не повторять уже завершённый broad поиск или offline-аудит вместо этого входа.

#### Decision Log: что подтверждено источниками

| Источник | Проверенный факт | Вывод для этого проекта |
| --- | --- | --- |
| [Adobe CEP12 Cookbook](https://github.com/Adobe-CEP/CEP-Resources/blob/ab5e4e3e53a42fad08e1225a22a991bb1ffe73f6/CEP_12.x/Documentation/CEP%2012%20HTML%20Extension%20Cookbook.md), разделы Standard Events / ExtendScript | В таблице document events нет колонки AEFT; исполнение script и dispatch CEP events описаны на main thread host | Таблица не предоставляет нужного AE lifecycle-контракта. Из неё нельзя заключить, что AE26.2 вообще не имеет иных events; доставка уведомления не объявляется синхронной защитой queued mutation |
| [Adobe CSInterface12](https://github.com/Adobe-CEP/CEP-Resources/blob/ab5e4e3e53a42fad08e1225a22a991bb1ffe73f6/CEP_12.x/CSInterface.js), строки612–619 | `evalScript(script, callback)` делегирует вызов `window.__adobe_cep__.evalScript`; JS-обёртка не проверяет project incarnation | Node preflight не становится atomic guard native lookup/setter. Точный native scheduling/lifetime на AE26.2 этим source не установлен |
| [Официальный Adobe UXP Project](https://developer.adobe.com/after-effects/uxp/after-effects-api/project) | Опубликованный Project API помечен Min Version27.0; `telemetryGuid` описан как stable project identifier | Это не подтверждение доступности на AE26.2 и не обещание fresh incarnation при каждом open/revert. Host не обновлять ради проверки |
| [Официальная точка входа C++ SDK](https://developer.adobe.com/after-effects/) → Get the SDKs | Ссылка ведёт в Developer Console; статический ответ — Loading, version-bound пакет/headers не получены | Auth/условия/доступ за пользователя не подтверждались. Нельзя объявить полный аудит актуального SDK или отсутствие нужного native API |

Версия опубликованных CEP sources закреплена commit `ab5e4e3e53a42fad08e1225a22a991bb1ffe73f6`; cookbook Git blob `5a2437f2a375b907674c75300959a79ada9c0938`, CSInterface blob `f66054c0a0cc8f7977fcd83894950201fbc696e6`. Это remote source bytes, не прочитанный installed runtime. [SDK Guide](https://ae-plugins.docsforadobe.dev/aegps/aegp-suites/) и его [описание ownership](https://github.com/docsforadobe/after-effects-plugin-guide/blob/master/readme.md) использованы только для поиска кандидатов; community-maintained редакция не принята как официальный version-bound контракт AE26.2. Обсуждения форумов, сторонние wrappers и зеркала SDK не использовались как доказательство native authority.

Кандидаты для следующей **адресной** сверки: `AEGP_RegisterCommandHook`, `AEGP_RegisterIdleHook`, `AEGP_ProjSuite`/`AEGP_ProjectH` и execution-time host-owned capability. Для каждого отсутствует принятая здесь гарантия, что любой ручной/внешний same-path open/revert/new→open меняет identity до setter; нельзя подменить её наблюдением path/dirty/IDs или сравнением адреса handle. Нужны точная SDK version/suite/header, правила invalidation/reuse, coverage всех переходов и отсутствие lifecycle reentry между guard и setter. Установка hooks, вызовы `NewProject/OpenProject`, перехват/подмена app methods, native factories и изменение globals не выполнялись.

Host-owned object capability может быть альтернативой непрерывному observer **только при доказанном native контракте**: capture на approved inspect, проверка принадлежности текущей incarnation перед setter, invalidation на open/new/revert, отсутствие wrapper/handle ABA/rebind и atomic execution boundary. `app.project === capturedProject`, `isValid(ref)` или nonce отдельно этих гарантий не дают. Потерянный host registry не восстанавливается из path/IDs; confirmation/shared-lane/UNKNOWN остаются отдельными требованиями.

#### Source finding и проверенная матрица

Последний Node lifecycle guard находится в [Broker send](../core4/core/broker.js), строки110–131 и256–275. Далее [receiver](../core4/core/receiver.js) сохраняет begin и вызывает evaluate; [dispatcher](../core4/integrations/cep/host-dispatcher.js) передаёт fixed script в `evalScript`. [Titles JSX](../core4/modules/titles/executor.jsx), строки5–14 и26–43, проверяет global session/path/IDs и text/style revision при исполнении. Если producer не обновил native global и Node binding, другая incarnation с теми же наблюдаемыми значениями не различается этими predicates. Post-send invalidation не отменяет уже поставленную/исполненную native команду.

В [старом CEP fixture](../core4/test/fixtures/cep-host.js), строки26–28, VM исполняется **до** callback delay. [Synthetic projectEvent](../core4/test/fixtures/ae.js), строки62–64, одновременно обновляет reducer и VM session. Их прежние PASS сохраняют свой scope и не доказывают live своевременность producer. Новый temp probe удерживает actual dispatcher script **до** `vm.runInContext`, проверяет receiver ongoing/physical pending и setter0, затем меняет active VM model и явно отпускает единственную исходную mutation. Сокеты не открывает, synthetic authority не становится production.

| Состояние к release queued script | Фактический результат в условной VM-модели |
| --- | --- |
| Нет перехода | applied, setter1, independent verify, Broker succeeded |
| Другой path / compId / layerId | project_cas / comp_cas / layer_cas, setter0 |
| Same-path, baseline text изменён | stale_target, setter0 |
| Same-path open, native epoch обновлён при stale Node source | session_cas, setter0 |
| Same-path open с теми же path/IDs/text/style и stale global/source | Setter новой B=1, исходной A=0; verify и Broker succeeded — контрпример достаточности predicates |
| Same-path revert-in-place при stale global/source | Hidden incarnation изменена с сохранением object/state values; setter1 и Broker succeeded — отдельная условная модель revert |
| New→open исходного path между наблюдениями, stale global/source | Модель ABA: setter новой B=1, исходной A=0; Broker succeeded |
| Observer loss после queue, native global stale | Setter B=1; Broker stopped / trusted_project_lifecycle_unavailable, command UNKNOWN/unresolved1. Completion completed не снял fence, replay нет |
| Unsaved new к моменту execution | project_cas, setter0 |

**11/11 PASS означает совпадение с ожидаемыми результатами контрмодели**, включая небезопасный исход при нарушенной предпосылке producer. Это не реализация/сертификация native API, не дефект, воспроизведённый в установленном AE, и не новый полный lifecycle/CEP PASS. Реальные persistence global, object identity и возможность такого event scheduling на AE26.2 не проверялись. В каждом сценарии mutate queued/executed ровно1; native AE calls0.

#### Validation и следующий шаг

Точная final команда (cwd — корень репозитория):

```powershell
node --test --test-reporter=tap 'C:/Users/Ant/AppData/Local/Temp/core4-native-lifecycle-69aa7d40c2b04aa9870a9111e87d866b/probe.cjs'
```

- Evidence directory: `C:/Users/Ant/AppData/Local/Temp/core4-native-lifecycle-69aa7d40c2b04aa9870a9111e87d866b/`. `sources.json` сохраняет remote refs и coverage gaps; `probe.cjs` — воспроизводимый diagnostic harness; `probe-results.json` — structured outcomes; `probe.tap.txt`/`probe.stderr.txt` — raw final output; `before-core4.json` —59 исходных hashes. Runtime/CAS/journals probe находятся только в собственных temp subdirectories; секреты не печатались и не переносились.
- Final TAP:11 tests, pass11/fail0/skipped0/cancelled0/todo0, exit0. После изменения только названий полей отчёта nativeResult/nativeCode→executorResult/executorCode выполнен один final повтор; preliminary11 не суммируются. Probe SHA-256 `690d6e3a521a163ed09e559825c8adede114a8a86087ab9c3a15b496d6eeb177`; TAP `d3727533b3eb3adc203c5a3eed1c470721ccf85d1646b3773bb7b374bfaafc5e`; results `48a2362b218accc565d5518469ed9fc3a1a0ea7567efb398b0d8a985e87cd6eb`.
- Bounded read-only review — ACCEPT с перечисленными ограничениями. Архитектор сверил final hashes, raw TAP и actual queue barrier, не делал запусков. Намеренно пропущенное уведомление не является дефектом reducer; revert-in-place использует тот же state object (aSetters=1 ожидаем), а промежуточное null→same-path в ABA не является native new/open proof. Source model не устанавливает правила AE global/object lifetime.
- Production source, public MCP, pins и validation routes не менялись. Final checks: все59 Core4 hashes совпали с before snapshot; UTF-8,28 локальных ссылок и `git diff --check` PASS; `validation.json` сохранён рядом с evidence. Full offline audit/CEP/release/seal не повторялись. Source/VM evidence имеет `releaseCertified:false`. Нет обращений к AE/installed runtime, браузеру/UI, конфигурации/credentials/общему state, push/merge.
- Следующий ограниченный source-only вход — официальный version-bound C++ SDK/подтверждённый host API contract и проверка перечисленных native гарантий. Пользователь поручил самостоятельно найти имеющиеся компоненты; дополнительный локальный поиск записан ниже. Пока native контракт не получен, producer/issuer/новый channel не активировать, synthetic-only gate и `live_transport_not_installed` сохранить.

#### Дополнительный локальный поиск SDK и toolchain на MSI

27 октября 2026, baseline `ce7c1e4601acd8c17c0c1c57a80d79f3695d46a2`. Пользователь сообщил, что на ноутбуке есть AE, и поручил самостоятельно найти остальное. Root сохранил единоличную запись; `ae_scout` выполнял только bounded поиск имён пользовательских файлов, без чтения runtime/запусков. Его Documents limit15000 закрыт последующим root filename-only обходом указанных roots без такого лимита.

- **Progress:** прочитаны адресные записи uninstall registry и метаданные вероятных dev/source directories. Найдены Visual Studio Build Tools2022 `17.14.41`, MSVC toolset `14.44.35207` с существующим `bin/Hostx64/x64/cl.exe`, Windows SDK include directory `10.0.26100.0`. Компилятор/установщики не запускались, работоспособность сборки не заявляется.
- **Progress:** filename-only поиск `AE_GeneralPlug.h`, `AEGP_SuiteHandler.h`, `AEConfig.h`, имён After Effects SDK и SDK-архивов выполнен в Documents/Downloads/Desktop; отдельные поиски — выбранные Codex directories, Adobe/Common Files обеих разрядностей и `C:/Users/Ant/Tools`. Итог по пользовательским roots: rg exit1, matches0, stderr пуст. В Program Files нашлись готовые `AEGPDriver.aex`/Mocha AEGP binaries, но не SDK source. Они не загружались и не исполнялись.
- **Decision Log:** MSVC/Windows SDK и готовые AEGP modules не заменяют Adobe AE C++ SDK headers и не доказывают lifecycle capability. Вывод — **SDK не найден в обследованных областях**, а не «на компьютере SDK отсутствует». Старый `AE_agent`, `AE_Agent_Core`, stage/intelligence-config, `.git`/`.codex`, зависимости, runtime/logs/credentials исключены; symlinks не обходились, H-диск не сканировался.
- **Decision Log:** [официальный SDK route](https://developer.adobe.com/console/servicesandapis/ae) дополнительно прочитан как публичные HTML и указанные в нём frontend JS-файлы, без исполнения. Frontend содержит получение SDK catalog/download link и отдельный account/Developer Terms flow. Account/terms state пользователя **unobserved**; никакие GraphQL requests, auth, принятие условий, выдача download link, скачивание SDK или установка не выполнялись. Статический source не принят за отказ доступа или требование заново принять уже принятые условия. Старый запрещённый Brave/SaveAs не затрагивался.
- **Validation:** evidence — `C:/Users/Ant/AppData/Local/Temp/core4-sdk-locator-baf097e820b24767bffcc0e4577e812e/census.json`; рядом сохранены public frontend texts и пустой `documents-name-search.stderr.txt`. Native AE calls0; installed/config writes0. Все59 Core4 файлов совпали с прежним source manifest; UTF-8,28 локальных ссылок и `git diff --check` PASS, результаты в `validation.json`. Offline tests/seal/release не повторялись — source не менялся.
- **Продолжение:** наличие локального SDK теперь не предполагается. Для source-реализации по-прежнему нужен официальный version-bound SDK/API contract; уже найденные build tools можно использовать только в последующем конкретном source/build scope. Live/installed admission остаётся закрытым, производственный контракт не ослабляется.

### Перенос в постоянный рабочий каталог — 27 октября 2026

#### Progress

- По прямому поручению пользователя репозиторий перенесён из `C:/Users/Ant/Documents/Codex/AI Coverage Agent/AI Agent Core` в `C:/Users/Ant/Documents/Codex/AE_agent_core`, включая собственный `.git` и все локальные commits. Исходная папка пуста; дальнейшая работа Core ведётся только из нового корня.
- До переноса: чистая ветка `codex/ae-agent-core-4.0.0`, HEAD `83f1310471d0b3348db3659485475d6c96e20438`. Сразу после переноса HEAD, refs и чистое рабочее дерево совпали с исходными.
- Новый корень закреплён в `AGENTS.md`. Изменения этого блока ограничены инструкциями и этой записью плана; продуктовый код не изменён.

#### Decision Log

- Исполнитель — root: единый последовательный блок переноса и проверки сохранности, без независимой инженерной подзадачи для делегирования. Перенесены дочерние элементы обычным `Move-Item -LiteralPath`; это позволило сохранить открытый исходный каталог без переименования и остановки чужих процессов.
- Исторические evidence, pinned paths и прежние runtime/cutover records не переписываются. Перенос не является установкой, cutover или выдачей новых grants; следующий продуктовый шаг остаётся прежним source-only исследованием официального SDK/API-контракта.

#### Validation

- SHA-256 и размер всех377 файлов (включая Git metadata и59 файлов Core4) совпали до/после; differences0. Ветки/refs сохранены; исходный каталог после операции содержит0 элементов.
- Полные manifests и read-back: `C:/Users/Ant/AppData/Local/Temp/core4-root-relocation-f79d9c7bd7b74471893e60f0a66607f2/` (`before-files.json`, `after-files.json`, `before-git.json`, `relocation.json`).
- Из нового корня: `git fsck --connectivity-only` PASS, `git diff --check` PASS, строгая UTF-8 проверка обоих изменённых Markdown и28 локальных ссылок PASS. Исполняемые исходники не менялись; повтор полного offline-аудита, CEP/live/release не требуется. AE, установленный runtime, конфигурация и credentials не затрагивались.

### Получение официального SDK — проверка публичного каталога

27 октября 2026, baseline `8ad66b7`. Продолжение после переноса рабочего корня: адресно проверить официальный источник SDK, необходимый для шага1 native capability decision. Root — единственный writer; `ae_scout` проверял только публичные официальные источники. Локальный поиск SDK и прежние VM/CEP-проверки не повторялись.

#### Progress

- [x] Официальная [документация Developer Console](https://developer.adobe.com/developer-console/docs/guides/apis-and-services) подтверждает каталог SDK в Downloads и выбор конфигурации пакета. Публичная инструкция не содержит version-bound headers или пакета для AE26.2.
- [x] По ранее сохранённому официальному frontend уточнён фактический маршрут: `/console/graphql`, операция чтения `GetSdks`. Выполнен запрос каталога без пользовательских credentials: GET вернул HTML оболочки (`200`, `text/html`,2152 bytes); POST с GraphQL **query**, соответствующий клиентскому способу доставки, вернул JSON `403`, `ErrMissingOauthToken`, `error_code:403010`, `Oauth token is missing`. Ни один ответ не содержит каталога или SDK.
- [x] Установлено ограничение выбранного исследовательского маршрута: каталог C++ SDK без OAuth не получен. Это не устанавливает зависимость продукта от C++ SDK и не доказывает необходимость его получения.
- [ ] Сначала проверить возможность выполнить требования lifecycle через существующий CEP/ExtendScript-контур и определить точный недостающий host-контракт. Если потребуется C++ путь, отдельно обосновать его необходимость; затем исследовать соответствующий официальный SDK/API.

#### Decision Log

- Отсутствие OAuth token относится к этим запросам без аутентификации. Это не отказ аккаунту пользователя, не доказательство отсутствия лицензии и не подтверждение необходимости принять новые условия. Состояние существующего browser login и Developer Terms остаётся **unobserved**.
- После `403` новые варианты доступа не пробовались. Cookies/tokens не читались и не переносились; login, принятие условий, получение download link, загрузка SDK, установка и browser control не выполнялись. Старый остановленный Brave/SaveAs и дополнительный сетевой probe не повторялись.
- Уточнение после вопроса пользователя: C++ SDK не был установленной зависимостью перенесённого кода. Legacy `cep-panel/panel.js` использует `CSInterface.evalScript`; Core4 `integrations/cep/host-dispatcher.js` сохраняет этот путь для reviewed JSX. В репозитории нет C/C++ headers/sources, CMake/Visual Studio projects. Эти факты не доказывают наличие SDK на исходном ПК и не дают оснований ожидать его на MSI. Предыдущее требование пользователю скачать SDK было необоснованным расширением исследовательского варианта; оно снято. Для следующего source-only анализа получение SDK пользователем не требуется.
- Само наличие SDK не доказывает нужную гарантию. Проверка должна установить invalidation/reuse `AEGP_ProjectH` либо другой host-owned capability при new/open/revert/replacement, покрытие ручных/внешних переходов и порядок guard→target lookup→setter. Если это не документировано, фиксируется точный пробел для официального уточнения; synthetic issuer и `live_transport_not_installed` сохраняются.

#### Validation

- Evidence: `C:/Users/Ant/AppData/Local/Temp/core4-sdk-public-catalog-91f8c1900e5e418dbfe489d2bf1d19c0/`: `request.json` и `catalog-response.txt` для GET, `post-request.json` и `catalog-post-response.txt` для POST. Метаданные содержат время UTC, operation/method/status/content type; account credentials отсутствуют. SHA-256 JSON-ответа Adobe: `73f5353179ac1a77a2ccebf7683501c7b85742c70f31bd24d4dcf768758249f8`.
- Native AE calls0; SDK downloads0; installed/config/runtime writes0. Diff ограничен этим планом; код Core4 и artifact pins не менялись. Строгая UTF-8 проверка,28 локальных ссылок (missing0) и `git diff --check` PASS; результат исходного блока сохранён в `validation.json` рядом с evidence. После уточнения зависимости SDK повторно проверены UTF-8, локальные ссылки и diff; продуктовые offline/live/release suites для документального diff не запускались.

### Продолжение без C++ SDK — ручной CEP/JSX-контракт

27 октября 2026 пользователь поручил продолжить существующий CEP/JSX-путь без SDK и явно допустил подтверждение изменения в AE. Активный bounded source-only блок — [защита текущей цели](core-4.0.0-cep-project-safety.md). Он уточняет следующий шаг вместо прежнего требования получить C++ SDK: отдельная политика одобрения текущей совпадающей цели после локального подтверждения, experimental reviewed JSX и adversarial offline tests. Автоматический контракт исходной incarnation не ослабляется; production issuer/channel, installed/runtime, authenticated shared-lane census и live acceptance остаются отдельными последующими этапами.

- **Progress:** source/reentry/authority границы проверены; выбор ручного режима подтверждён пользователем. Изолированный прототип реализован единственным writer; root сверил frozen evidence, независимый reviewer дал ACCEPT без открытых P1/P2. Source-only milestone закрыт; actual host-validation остаётся отдельным следующим входом.
- **Decision Log:** identical same-path replacement может быть принят только новым локальным подтверждением на текущую цель; это не continuity старого проекта. Старые session/grants/checkpoint не получают новую authority из path/IDs или nonce.
- **Validation:** итоговый manual13/13 и selected routing/docs6/6 PASS; direct boundaries18 и diff PASS. Новый case заменяет проект внутри confirm, A0/B1; прежние12 не суммируются. Команда npm завершилась до запуска script, её успех не заявляется. Полные команды/evidence/coverage gaps — в focused плане; production pins не менялись, live и release не проверялись.

### Создание устанавливаемой4.0.0 — 27 октября 2026

Пользователь прямо поручил создавать собственную версию здесь вместо поиска готового дистрибутива. Активный [план установки/runtime](core-4.0.0-installable.md) включает реальный HTTP IPC, отдельную CEP-панель, package/installer, generic MCP и новый manual current-target typed путь. `35f4c90` — исходная чистая база. Source/build/install теперь разрешены целевым поручением; старые offline/desktop-request ограничения не останавливают этот блок.

- **Progress:** I source/package реализован и принят independent review; commit `0131ab3`. Immutable distribution48files установлен root на MSI, release/Node/panel read-back без расхождений. Настоящий installed stdio подтвердил4.0.0, ready и отсутствие pending/UNKNOWN; CEP peer ещё не загружен текущим AE. Writer продолжаетII без нового запроса разрешения. Штатный перезапуск пустого AE отдельно ожидает ответа пользователя и не блокирует source/build.
- **Decision Log:** новый код не импортирует legacy bridge, не выдаёт fake epoch и не переименовывает3.3.3. Automatic incarnation gate остаётся строгим; ручная политика имеет собственные target/resource/checkpoint/verification semantics.
- **Validation:** итоговый I13/13, selected прежние Core36/photo3/titles4 на неизменённой closure, boundaries20/syntax/XML/diff PASS. Exactsource/packagehashes root сверил; packageHash `cf07e3189d88c4921f779b806b5dc45c8a305cd9c4bc27d898b3903678327f04`. Coverage/raw-log/live ограничения — в активном плане; full-release certification не подразумевается.
- **Progress II:** собственный manual current-target workflow и Windows adoption/reservation реализованы, включая native confirm, повторный CAS и original completion verification. Final independent authority review ACCEPT. Package57files `42e101d56879e0f89774499ab2784f2649a6296f59bdafe6ae76bb4a7eb4c3af` собран и независимо сверён; source готов к actual обновлению установки. Отдельный zero-dispatch repair `1cd50b5` уже применён к пустому state с неизменными журналом/store identity.
- **Validation II:** final addressed human3/manual12/installable15 =30PASS, routing5, recovery8, boundaries21/syntax/diff PASS. Full current release certification отсутствует. Runtime package/native acceptance остаются разными этапами; все raw logs, source hashes и прежние infrastructure/closure ограничения сохранены в focused плане.
- **Actual на28октября:** source `4e26bde`, package0aea (56files) установлен и read-back PASS; настоящий CIM query/adoption и installed stdio handshake/status PASS. Панель4.0.0 зарегистрирована и загружена; реальное подключение отклонено `cep_origin_required`, native read ещё не выполнен. Пользователь остановил CU клавишейEsc; UI прекращён, проверочный MCP и диагностический observer штатно закрыты, project MCP enabled=true восстановлен. Последующий scoped Origin repair и configured-client reconnect записаны в focused плане; готовность полной живой цепочки не заявляется.

### Подготовка AEP для host-validation — 27 октября 2026

- **Progress:** пользователь выбрал `titr_01_ame_product_20261015.aep`; создана отдельная ignored byte-copy32001325 bytes с SHA-256 `9d5d15a11fccc24b7ca284b6da866bd46f3626d621c80f83c8c1672791ff996f`. Source metadata/hash до и после совпали. Полные пути и manifest — в [focused плане](core-4.0.0-cep-project-safety.md).
- **Decision Log:** следующая диагностика владельца очереди не требует project-incarnation; порядок исправлен в [control-only readiness контракте](../docs/core4-readiness-preflight.md). Новая обёртка над synthetic provider не добавляется. Сначала отдельный разрешённый read-only preflight существующего authenticated runtime без запуска/переключения/AE evaluate; затем решение по actual IPC/provisioning и host-проверке. Выбор файла не снимает текущий offline-запрет.
- **Validation:** copy hash/size совпали, source неизменён; AE/runtime не запускались, code/pins не менялись. UTF-8,42 локальные ссылки и diff PASS; bounded read-only architecture review нового readiness документа — ACCEPT. Evidence в ignored copy-каталоге; прежние offline suites не повторялись.


### Перенос Argon review workflow на MSI — 27 октября 2026

#### Progress

- Перенесён offline-документ workflow и exact-copy шаблоны в MSI Core; ссылки добавлены в `AGENTS.md` и `README.md`. Подробный provenance/status: [отчёт переноса](../docs/argon-review-msi-transfer.md).

#### Decision Log

- Маршрут указывает на controller `01a17d90-d9dc-7531-a1d7-e50b3f8a501d`, projectId `bc4a1ea4-d52c-47f5-8591-6fc00af37ec0` и существующий ARGON_BrowserUse root. Пример ревью остался в исходном worktree; исторические данные не переносились. Workflow остаётся ручным и не даёт permission на отправку.
- После переноса пользователь отдельно разрешил ограниченную browser-проверку существующему MSI controller. Chrome extension обнаружен, Gemini открылся; чтение вкладки/screenshot вернули Debugger unattached. Аккаунт и Argon не подтверждены, требуется ручная проверка подключения/запроса доступа в расширении. Прежний URL deny исторический; новый сбой не является новым policy deny. Runtime не проверялся.

#### Validation

- Строгий UTF-8, относительные Markdown-ссылки, exact template SHA-256, route/skill read-back и `git diff --check` PASS. `build_bundle.py --help` прошёл локально с UNC-путём; это не MSI execution. Product tests не запускались (docs-only); MSI runtime/browser acceptance отсутствует; свежий результат browser-проверки сохранён в MSI-STATUS.md проекта ARGON_BrowserUse (prompts/uploads/mode switches/login/grants/settings changes: 0).

## Постоянная переносимость десктоп ↔ MSI — 28 октября 2026

### Progress

- [x] Прямое поручение пользователя закреплено для всего AE Agent Core, включая
  следующие версии: Core4 — рабочее название текущего среза. В AGENTS, intent,
  architecture и README добавлены правило и ссылка на постоянный
  [контракт переносимости](../docs/portability.md).
- [x] В активном плане установки добавлен обязательный пункт 4 с приёмкой P1–P8:
  реальные десктоп→MSI и MSI→десктоп этапы разработки, 0 повторных ручных правок
  конфигурации после первичной подготовки, local-state safety и инженерный контекст.
- [ ] Матрица двух сред и gaps текущего installer сверены с новым контрактом.
- [ ] Реализация и двусторонняя фактическая приёмка P1–P8 завершены.

### Decision Log

- Правило постоянно, имя и версия среза его не отменяют. Готовность текущего
  выбранного состава требует P1–P8; переносимость не является optional-модулем.
- Переносимы код, contracts, пакет и проверяемый инженерный контекст; локальные
  credentials/state/authority не выдаются другой машине. Общие fences и UNKNOWN
  сохраняют силу. Штатное обновление не требует ручного ремонта paths/ports/config.
- Этот milestone документальный, baseline `984d543`. Существующие незавершённые
  изменения `docs/argon-review-workflow.md` и `plans/core-4.0.0-continuation.md`
  сохранены отдельно и не включаются в commit этого блока. Таймер, browser review,
  live/AE/UI и установка не возобновлялись.

### Validation

- Строгий UTF-8 семи файлов и разрешение их относительных Markdown-ссылок
  проверены локальным Node-скриптом: PASS; `git diff --check`: PASS.
- Read-back проверил согласованность постоянного intent/AGENTS/architecture и
  критериев двух планов. Изменены только AGENTS, README, intent, architecture,
  новый `docs/portability.md` и два активных плана. Runtime/config/pins не менялись;
  продуктовые suites и live не запускались. Все P1–P8 пока открыты.
- Следующий инженерный шаг при возобновлении — матрица сред и адресный gap-анализ
  installer по постоянному контракту, затем минимальная реализация и проверка
  обоих направлений. Результат документации не является разрешением сменить
  действующего controller или продолжить прерванные AE-команды.

## Возобновлённый ремонт CEP Origin — 28 октября 2026

### Progress

- [x] Пользователь поручил продолжить ремонт текущей панели с учётом переносимости
  и будущего возврата на десктоп. Root — единственный live controller; прочитаны
  active AGENTS и соответствующие workflows.
- [x] Проверена неизменность installed package/Node и совпадение четырёх ключевых
  source/installed файлов. Production owners/ledger отсутствовали, receiver
  journal содержал только origin, отправок не было. Project MCP оставался
  `enabled=false` после предыдущего maintenance; настроенный клиент не проверен.
- [x] После запуска ранее отсутствовавшего AE и обычного Continue в сообщении о
  прошлом crash визуально подтверждён пустой Untitled. Собственная панель отправила
  в one-request observer POST `/challenge` с точным `Origin: file://`. Причина
  `cep_origin_required` установлена: baseline допускает только `null`.
- [x] Независимый source-only synthetic reproducer подтвердил два исхода:
  `null` →200/ACAO null, `file://` →403/cep_origin_required/без ACAO. Exit0,
  source hashes до/после совпали; link/native/commands0.
- [x] Bounded source-analysis дал технический GO на exact `null|file://` с
  server-owned challenge/peer origin binding и неизменными auth/Host/MAC gates.
  [Focused план](core-4.0.0-origin-repair.md) сохраняет порядок изменения и проверки.
- [ ] Принят обязательный Argon plan-review, реализован и проверен repair,
  затем принят result-review и обновлена установка с одной реальной typed read.

### Decision Log

- Один общий exact контракт заменит предположение о единственном opaque origin;
  hostname switch и ручная конфигурация MSI/десктопа не вводятся. Два значения
  Origin не удостоверяют extension: credentials/pins/epoch остаются authority.
- Root запросил свежую readiness существующего Argon controller по standing
  authorization пользователя. Gemini снова доступен, но открыт Aiton Pro/Flash;
  требуемые Rohan/Argon/maximum effort не подтверждены. Контроллер остановился
  на account mismatch без отправок или смены аккаунта. Пользователю показан
  async запрос открыть целевую пару. Автоматизация продолжения не восстановлена.
- Затем пользователь прямо уточнил: «используй aiton, он открыт». Для этого
  Origin review и его продолжения выбран открытый Aiton Pro; controller получил
  поручение подтвердить аккаунт, Argon и максимальное доступное усилие. Это
  явное изменение получателя, а не автоматическая подмена Rohan. Пакет с source
  не отправляется до полной проверки состава/hashes и readiness.
- До обязательного plan-review source/auth repair не начинается; до result-review
  установка не меняется. Применён pro-review-bundle, получатель по проектному
  workflow — Argon через существующий controller, без платного API.
- Local packet01 сохранён как incomplete из-за scanner false positive на ссылке
  `installation.controlToken`; root проверил отсутствие literal/runtime secret.
  Packet02 восстановил полный source, но потребовал уточнить включение самого
  внешнего плана и язык. Последующая редакция фиксируется отдельно; ни один
  из этих пакетов не отправлен. Credentials/state/user AEP не включаются.
- Root дополнительно отклонил packet03: два обязательных context-блока были
  перечислены в таблице, но отсутствовали в body. Итоговый packet04 собран
  последовательным добавлением всех9 context-файлов; root независимо сверил
  наличие всех9 полных body, request/plan/payload hashes и source baseline.
  [Готовый запрос](../reviews/argon/cep-origin/20261028-origin-plan-04/request.md)
  и [manifest](../reviews/argon/cep-origin/20261028-origin-plan-04/manifest.json)
  фиксируют COMPLETE пакет49 552bytes, payload SHA начинается `947a04842b59`.
  Draft01–03 сохранены в ignored operational archive, не в рабочем payload.
- Для packet04 записано approval на одну отправку Aiton/Argon/максимальное усилие;
  exact payload передан существующему controller. Receipt отправки и ответ ещё
  не получены; отправку нельзя считать выполненной по одному dispatch в чат.
  Снимок controller подтвердил Argon и Высокий (максимум среди трёх уровней).
  Локальный capacity error контроллера не является отказом Argon; выполненный
  UI шаг не повторялся вслепую, запрошено одно bounded продолжение.

### Validation

- Installed verification и targeted source equality4/4 PASS; проверка source
  hash9/9 в synthetic reproduction PASS. Это baseline/диагностика, не успешная
  живая цепочка MCP→CEP→AE и не приёмка переноса.
- `validate-diff` без `--run` выбрал installable-runtime и manual-runtime для
  будущих changed paths; текущие source suites не запускались. Прежнее evidence
  не расширяется до новых bytes/окружения. Все P1–P8 переносимости открыты.
- Локальные operational evidence и reproduction: ignored
  `snapshots/core4-live-proof/IV-origin-portability-20261028/`. Native read,
  mutation, save/reopen 0; observer и synthetic server завершились штатно.
- Документальный checkpoint: строгий UTF-8 трёх изменённых планов,45 относительных
  ссылок и `git diff --check` PASS до финального добавления packet links; после
  добавления выполнена заключительная проверка. Итоговый packet04: 9 context
  body/3 полных baseline source и request/plan/payload hashes root PASS. No source
  edits; обязательный review остаётся pending, новая установка не выполнялась.
- Финальные47 ссылок/UTF-8 трёх планов PASS; staged diff-check самих планов PASS.
  Полный staged `git diff --check` выявил четыре `new blank line at EOF` в трёх
  immutable context excerpts и уже переданном bundle04. Они сохранены byte-exact
  ради утверждённых hashes; это известные предупреждения документационных
  артефактов, не PASS полного staged whitespace-check. `.gitattributes` и checks
  не менялись; runtime/source изменений нет. Нового payload ради EOF не создаём.

### Source milestone после plan-review

- **Progress:** packet04 получен (Aiton/Argon/Высокий), go/5 findings проверены
  root и разобраны в [decisions](../reviews/argon/cep-origin/20261028-origin-plan-04/decisions.md).
  Один writer реализовал exact finite Origins, stored challenge/peer binding,
  CORS после Host/Origin guards и client validation, расширил адресные тесты.
  Изменены4файла; независимый source reviewer дал ACCEPT без actionable findings.
- **Decision Log:** signed-body schema/peer-protocol, runtime profiles,
  installer/config и прочие grants/pins не меняются. Один общий контракт не
  требует веток MSI/десктоп. Актуальный candidate не установлен до Argon
  result-review. Runtime authority и неизвестные исходы не переносятся.
- **Validation:** final selected installable20/manual12/documentation1 PASS,
  boundaries21/syntax/source-diff PASS. Root independently checked5source hashes,
 56packagefile hashes, rebuilt byte-identical candidate; packageHash6c94efb678b9,
  fileSHAfd4320d1f0e9,286740bytes. Exact hashes/полные логи/evidence keys/deferred —
  в focused плане и `implementation-freeze/`. Прежний Core37 evidence не
  переобъявляется новым current-release PASS; full release/live/desktop не были.
- **Ограничения:** Node парсер нормализует HTTP OWS до приложения; отдельного
  timing-specific activePoll probe нет. Общий origin auth guard расположен до
  effects; foreign poll/complete сохраняют sequence/pending/journal и исходный
  ACK. Callback loss/reconnect с обеими Origin формами сохраняет UNKNOWN/no replay.
- **Raw response:** immutable `response.txt` хранит UI citation/code labels и
  trailing whitespace исходного DOM text. Его hash сохранён; source/plan scoped
  diff-check PASS не выдаётся за whitespace PASS неизменяемого external evidence.
- Следующий шаг: source commit → bounded Argon result-review exact diff/package
  → только после принятия штатный apply/read-back и одна typed read пустого AE.

### Итоговая передача и текущий gate

- **Progress:** source milestone `30311539ce2b2eb091d19c179667e513217e41cc` сохранён.
  Root проверил [result packet01](../reviews/argon/cep-origin/20261028-origin-result-01/manifest.json):
 85 746bytes, SHAe353f32aff36,8context/request exact, полный Git diff4files и3
  current source snapshots совпали с target. Передан только этот файл через
  существующий controller/Aiton/Argon/Высокий, attempt1.
- **Decision Log:** отправка сначала появилась в UI вместе с генерацией, затем
  исчезла; prompt вернулся в composer без нового ответа. После одного обычного
  reload история не отобразилась целиком, включая старый plan04. Исход остаётся
  `submission-unknown`; отсутствие UI не объявляется доказательством неотправки.
  Повторный send/upload0; результат plan04 не выдаётся за result-review.
- Пользователю показан конкретный выбор: либо ждать итогового Argon, либо явно
  разрешить исключение для установки только этого проверенного исправления по
  независимому локальному review. Пока ответа нет, установленная0aea не меняется.
  Это запрос исключения из review workflow, а не новый runtime grant.
- **Validation:** root подготовил immutable distribution6c94 и отдельно сверил
  installer closure3 + unchanged operators2; в package нет secrets/state.
  Private installed-proof client создан и синтаксически проверен, но не запущен.
  Native read/mutation/save0. Actual CEP/CORS и configured client остаются open.
- Поддержанный протокол Codex0.131.0 содержит `config/mcpServer/reload` без
  thread/server selector; CLI не предоставляет отдельную mcp reload команду.
  Generated schemas лежат в ignored `.codex-runtime/mcp-reconnect-schema-20261028-01`.
  [Официальная документация](https://learn.chatgpt.com/docs/app-server) подтверждает
  reload и thread-bound `mcpServerStatus/list`. Текущий parent app-server найден
  read-only по ancestry shell, но явный socket/listen аргумент отсутствует.
  Подтверждённого client handle для текущего UI нет: новый app-server/daemon,
  повтор старого proxy10050, global reload/config mutation не выполнялись.

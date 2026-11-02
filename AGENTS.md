# AE Agent Core 4.0.0 — создание устанавливаемого runtime

## Рабочий каталог

С 27 октября 2026 по поручению пользователя единственный рабочий корень Core —
`C:/Users/Ant/Documents/Codex/AE_agent_core`. Все дальнейшие чтения, изменения,
проверки и команды Git для Core выполнять отсюда. Прежний каталог
`C:/Users/Ant/Documents/Codex/AI Coverage Agent/AI Agent Core` освобождён и больше
не используется. Исторические пути в evidence и планах сохраняют provenance;
перенос исходников не переключает установленный MCP/CEP или runtime authority.

## Текущий scope и правила

**2 ноября, installed checkpoint B1/B2:** source commits `264522c`/`2d08c71`
приняты адресными checks; штатно установлен package `2fb5aebe…`, distribution
`d8d77c38…`. Standard thin client → CEP → native project-inspection, known rejected
read и auto reconnect после96с без Core проверены. Последний owner19892/один3457,
AE9472/пустой проект, peer connected, pending/UNKNOWN/fault0; history44events с
точным prefix36, origins/adoption/ledger preserved. После restart Codex configured
package2fb5aebe/owner24160 ready, fresh project-inspection пустого AE9472 PASS;
lease1 released, pending/UNKNOWN/fault0. History46events/prefix44 exact,
bindings/origins/adoption/ledger unchanged; install повторять не нужно.
B3a1 source history/process inspection принят118selectedPASS/46boundaries;
B3a2 private durable intent/inspection принят106selectedPASS/47boundaries.
B3a3 process/endpoint barrier принят3ноября118selectedPASS/48boundaries.
Production startup/physical callbacks, archive/finisher/session/UI ещё не
реализованы, installed B3 нет. Следующий срез B3a4 — lease и архивный finisher.
3ноября первый configured status после≥3460с idle сохранил owner24160/тот же boot,
peer connected, pending/UNKNOWN/fault0; один3457,46events/protected files unchanged.
Исходный Argon
plan review получен2ноября21:19, verdict revise; шесть замечаний локально разобраны,
контракт уточнён, повторных отправок нет. Debugger unattached остался историей
предыдущего retrieval. Актуальные IDs, действия и предел proof —
[checkpoint](plans/core-base-installed-checkpoint-20261102.md). История ниже
сохраняет provenance; она не выдаёт authority новому AE или B3 reset.

**2 ноября, уточнение пользователя в чате `01a19c49-8b10-7fe2-af4b-ce58f19219d5`:**
в базу добавлен обязательный режим «Начать заново»: прекратить прежнюю работу,
исключить позднее исполнение старых команд, сохранить неизвестные исходы в истории
и начать новую работу от свежего состояния AE без обязательного выяснения каждого
старого UNKNOWN. Это новый штатный механизм, не удаление journals/locks/fences.
Активная последовательность — B1 → B2 → B3 → installed-проверка;
[обновлённый промпт](plans/core-base-continuation-prompt-20261102.md).
Для разработки и отладки базы разрешены необходимые создание/изменение/сохранение
тестовых AEP, сохранение текущей работы для её защиты, перезапуски AE/CEP/Core
и штатные package/install действия без повторного общего запроса разрешения.
Адресные диагностические JSX допустимы через поддержанный путь с техническими
gates; собственные временные тестовые данные можно удалять/пересоздавать.
Пользовательские исходники и несохранённую работу защищать копией/сохранением,
не уничтожать молча. Один live-контроллер, проверка точной цели, запрет replay и
сохранность истории действуют; B3 должен штатно прекращать действие старых
ограничений после доказанного прекращения старого исполнения, не подменять исход.
Это уточнение заменяет прежние scope-запреты ниже на новый AEP/save/restart/raw
для отладки базы; исторические evidence и запрет повторять settled transactions
сохраняются. Titles/Slideshow и новый транспорт в эту работу не добавлены.

**1 ноября, новое прямое поручение:** Titles/Slideshow отложены. Активен
[план базы без Titles](plans/core-base-reliability-20261101.md): сначала research
готовых MCP и два отдельно заказанных диалога Argon (план базы / сравнение решений),
затем подключение, восстановление, диагностика с конечной матрицей проверок.
Отслеживание смены проекта — отдельное feasibility research без реализации.
Исторический R5 Titles ниже не возобновлять автоматически. Общую базу проверять
существующей project-inspection, без ремонта типографики. Не объявлять read-only
proof приёмкой mutation или всего выпуска.

С 30 октября 2026 текущий приоритет — [устойчивый запуск и восстановление
Core/CEP](plans/core-cep-lifecycle-20261030.md). Организационный coordinator/writer —
чат `01a18cce-e909-72d1-a327-07743704304e`; прежний T2-маршрут не возобновлять
автоматически. Titles сохранён как проверочный сценарий, развитие продуктов
следует после этого этапа. Выбрана модель одного installation-scoped Core owner
с тонкими stdio clients и явным controller lease. 31 октября client resilience
source1a6d442 принят186selectedPASS; interrupted owner pre-ready recovery587b49f —
209selectedPASS. Original stop`b99e2f80…` и update`88e4a61e…` штатно завершены через
новый inspect/finish и explicit enable с тем же original payload/credentials.
Installed package теперь`cc2f0713…`; helper distribution`6ae8960f…`. Owner2600 ready,
один listener3457, peer connected, pending/UNKNOWN/faults нет. Первый cold standard
status6108.60мс прошёл с первого запроса; два клиента/EOF/parent exit сохранили owner.
Journal18events, prefix16events/origins/adoption неизменны. AE26308 не перезапускался,
собственная CEP закрыта/открыта1раз для установки; project changes/save/mutation0.
После restart первый configured core_status новогоcc2f успешен: client22952,
owner6716 ready, один listener3457. Old2600 отсутствует; completed HMAC recovery
4abb9cb7/readyfd7af275 связывают exact PID/birth/boot. History/config/origins/adoption
unchanged, pending/UNKNOWN/faults0. AE26308 прежний. После runtime_wait_expired
пользователь нажал «Подключить»: configured peer connected/inspectionAvailable.
Новый cc2f read-only project-inspection прочитал0items/несохранённый проект,
authority/continuity=false; explicit lease generation1 освобождён. Журнал теперь
20events: begin19/complete20 ровно этой inspection, prefix18 прежний2a7d8b23…;
current SHA262a0934…, origins/config/adoption unchanged. Mutation/save/restart0.
Первый configured status после314.85с
idle прошёл с первого вызова за62мс, same owner/boot, pending/UNKNOWN/faults0.
Второй configured first-call после1194.008с idle с подключённой CEP прошёл за65мс;
тот же owner/boot/peer, history20events/config/origins/adoption unchanged.
Wire reconnect отдельно не трассировался. Следующий инженерный шаг — штатная
fresh host re-adoption: current absent-only adopt-host не заменяет existing adoption.
Активный [re-adoption план](plans/core-cep-r3-host-readoption-20261031.md): один
Argon plan review получен/revise и локально разобран; source slice1 private
evidence/lease adapter принят212PASS/9checks composed coverage и independent ACCEPT.
Private transaction core2–4 теперь принят253PASS/12current checks:7fresh checks
и5exact unchanged reuse, independent code/test ACCEPT. Включён historical terminal
receipt после normal owner startup; current runtime/history/barrier не объявляются
проверенными и authority не выдаётся. Lease доступен только после canonical claim.
CLI slice5 принят338unique PASS/19current checks, с9fresh batches и exact reuse;
общий routing/artifact case counted once. Runtime packagecc2f/70files unchanged.
Official helper outputc787e013… записан/полностью проверен, CLI commit8ce5a58.
Actual новый stop`c4c0af30-1260-4e72-b875-74084ae1d0b3`/certify/readopt/explicit enable
завершён. Adoption теперьAE26308/SHA666c79a6…, old4a453b0f… archived. Первый
configured status6388мс/первый вызов: owner9584 ready, boot04d9b162…, один3457;
old6716 absent. HMAC11phase records/owner, descriptor/client/config/origins/AEP
unchanged, journal24settled/prefix16/18/20 preserved, gates/ledger/pending/UNKNOWN0.
AE restart/save/mutation0. После runtime_wait_expired пользователь снова нажал
Connect: same owner9584, configured29мс, peer/inspectionAvailable=true. Fresh
project-inspection подтвердила Text_1_1/comp218/layer219 на current test-copy.
После штатного core_connect один Titles inspect завершился rejected/inspection_failed;
журнал28settled/prefix24 unchanged, controller gen2 released, pending/UNKNOWN0.
Raw/native mutation не выполнялись. Активный узкий [R5 engineering block](plans/core4-titles-inspection-20261101.md)
устанавливает безопасную диагностику причины, затем Titles compiler/native gate/read-back.
Его source freeze02 теперь принят192unique PASS/7Core checks+product8,
boundaries44 и independent ACCEPT. CharacterRange/full dormant colors proof,
finite read diagnostics и server-created taskId; owner gates/registry unchanged.
Принятый срез: packagebe9afe99…/distribution5de01291… (70runtime/87bundle).
Official output5de01291… записан/verified. Новый stop`f1b8ca9c-66c7-4b9b-b9a9-0974ea04faf8`
и update`90539075-ff4c-459c-a659-ecfdbb521c7f`/explicit enable завершены; installed
package теперьbe9afe99…, descriptor50bd6835…/client94d94d77…/configca895a00….
Штатный installer один раз выдал original-new split credentials, dual old/new
HMAC8records и exact70runtime/7CEP bytes проверены. Origins/adoption666c79a6…/
28settled journal/AEP preserved, gates/ledger/pending/UNKNOWN0. Own CEP close/open1
для установки, новая панель автоматически connected. Real standard clients27816/
16028 exit0, owner23816 ready/boot44f3b34a…, один3457, old9584 absent. Это пока
standard proof до restart: configured oldcc2f далowner_unavailable. Пользователь
перезапустил Codex; первый configured status успешно загрузилbe9afe99. Owner16772/
birth639290764154052560/boot805165c7… ready, один3457;5clients текущие/stalecc2f0,
old23816 absent. HMAC recovery6b6a3d4c…/readyec7594f2… и exact archives/current
replacement подтверждены. Причина выхода23816 не наблюдалась, survival не заявлен.
После user Connect same16772/peerpanel-60fa36ee… connected, explicit acquire1/
core_connect available=true. Fresh project-inspection exact comp218/layer219 PASS;
Titles terminal rejected/titles_missing_stroke_color, command7f249231…/executor6d84….
Original durable reply/finite diagnostic сверены;32settled events/prefix28 preserved,
config/origins/adoption/AEP unchanged, ledger/gates/pending/UNKNOWN/faults0, lease1
released. Actual new build/run/mutation0. Active R5 разбирает native CharacterRange
missing color без fake/default/drop proof и без raw/style probes; source/install
до принятого решения не менять. Source tests не подменяют native.
На паузе1ноября по прямому «завтра… пока сворачивай». Bounded review подтвердил
отсутствие доказанного read-only fallback; строгий профиль не ослаблен. Один
соседний кандидат comp231/layer232 также missing_stroke_color; journal36settled/
SHA a3996201…/prefix32 exact, lease3 released, mutation/save0. Test-only8cases
добавлены в manual-runtime.test.js:59selectedPASS, root verified76deps/181прочий
Core file unchanged. Packagebe9afe99 прежний, новый install не нужен. Новый
минимальный AEP только предложен; разрешение на его save/новую цель НЕ получено.
До пользовательского продолжения новых live действий не делать.
AE restart/save/mutation0. Не повторять f1b8/9053/c4c0/old transactions и не чистить
markers. Full release/deferred closures не переобъявлять PASS.
Не повторять c4c0af30 и old transactions; markers не чистить.
Standalone proof не подменяет configured.
**Settled stop/update/recovery/enable не повторять,
markers не чистить.** [Installed recovery](plans/core-cep-r3-owner-preready-20261031.md)
содержит source/installed evidence и оставшиеся R5 проверки.
Прежний configured project-inspection package8a79 прочитал пустой несохранённый
проект без authority/continuity. Старая adoption6492 не заменяет current host
witness/новую adoption перед исполнением. Эта запись не выдаёт runtime authority.
Точный [installed checkpoint](plans/core-cep-checkpoint-installed-20261031.md)
содержит settled IDs и следующий read-only шаг; migration/update не повторять.
Эта запись не выдаёт runtime authority и не снимает pending/UNKNOWN/fences.

В общей схеме Argon достаточно одного review на самостоятельный этап, затем
замечания проверяются/исправляются и подтверждаются локально. Уже данное поручение
на первые review следующих самостоятельных этапов сохраняет силу; автоматического
второго result/fix/final review нет. Не создавать новые точки согласия для уже
разрешённой работы.

Цель: самостоятельно работающее минимальное ядро Codex → MCP → typed bridge → After Effects и независимо подключаемые рабочие пакеты. Текущий план: `plans/core-4.0.0.md`; `plans/core-migration.md` сохраняет историю исходной базы 3.3.5 и незавершённого cutover.

С 29 октября 2026 пользователь принял архитектуру внешних workflow-продуктов:
активный план — `plans/external-products-titles-20261029.md`. Titles/Slideshow
владеют заданиями, шаблонами и compiler вне `core4/`; пакеты операций AE владеют
typed исполнением, Core — общим допуском/очередью/журналом. Первый pilot —
`products/titles/` поверх существующего MCP, без второго broker и нового SDK.
Фактическая двусторонняя приёмка переносимости отложена пользователем на финал
выбранного функционального состава; правила переносимого кода действуют сейчас.

## Постоянное правило: Argon review

Для любого проекта и этапа Argon review не является обязательной парой «ревью плана → ревью результата», условием продолжения после исправлений или gate объявления выпуска. В рамках явного поручения можно выбрать не более одного ограниченного ревью на подходящем этапе и по подходящему предмету. Затем владелец задачи локально разбирает замечания в разрешённом scope, проверяет их адресными evidence, применяет подтверждённые исправления и подтверждает их релевантными локальными техническими проверками. Повторное обращение к Argon допустимо только по новому явному поручению пользователя; запрос Argon на повтор, изменение boundary или готовность выпуска сами по себе его не разрешают. Это правило не меняет gates авторизации и AE, запрет повтора при неизвестном исходе отправки, требования к техническим проверкам или действующие ограничения доступа.

## Постоянное архитектурное правило: десктоп ↔ MSI

Двусторонняя переносимость разработки и обновлений — обязательное свойство всего
**AE Agent Core**, независимо от номера версии и рабочего названия Core4.
Крупные архитектурные блоки, модули и проверяемый инженерный контекст должны
переноситься между десктопом и MSI без повторной ручной настройки после первичной
подготовки поддерживаемой среды. Переносимость — обязательный критерий готовности
текущего среза и последующих изменений, затрагивающих эту границу.

Нормативный контракт и измеримая приёмка — [docs/portability.md](docs/portability.md).
Код/контракты/пакет отделены от локальных путей, MCP/CEP-конфигурации, credentials
и runtime state; локальные привязки обнаруживает, проверяет и создаёт штатный
installer. Не вводить ветки предметной логики по имени компьютера, ручные правки
исходников/конфига на каждом переносе или скрытый fallback. Состояние исполнения,
authority, pending/UNKNOWN и fences не переносятся как разрешение продолжить
команды на другой машине. Проверка на одной машине не доказывает совместимость
второй. До фактического round-trip результата критерий остаётся открытым.

## Активный устанавливаемый срез

Текущий срез: `plans/core-4.0.0-installable.md`. Пользователь прямо поручил создать и поставить собственную4.0.0 из имеющейся разработки: runtime/IPC/CEP/package/installer и выбранный manual current-target путь без C++ SDK. Root — единственный live/CEP/UI-контроллер. Автоматический lifecycle/grant-контракт M2b сохраняется; fake production epoch, public injection/issuance и перенос legacy authority запрещены. Ручное подтверждение текущей совпадающей цели не объявляется continuity прежней incarnation.

- Работать по-русски, сохранять чужие изменения; один writer на ресурс и один live-контроллер.
- Typed inspection → deterministic build → server-owned proposal → dry-run → подтверждение по риску → read-back. Private brands, grants, ownership, checkpoint и UNKNOWN/no-replay обязательны.
- В базе 3.3.5 builders: `get_plan_builder_contract` → `build_solution_plan`; в Core4 — module discovery/`get_module_contract` и стабильный generic plan API. Recipe search tools исключены. Старый cutover protocol `docs/core-cutover-package.md` — сохранённый пакет без разрешения actual switch; разработка Core4 от него не зависит.
- Raw JSX, destructive и save сохраняют отдельные ручные gates. Файловый доступ не выдаёт runtime authority.
- Codeburn — отдельный внешний MCP для аналитики расхода.
- Старый `AE_agent` — неизменяемый источник provenance; runtime state, credentials, `.git` и зависимости не копировать. Целевые package/install/config изменения для новой4.0.0 теперь явно поручены; historical cutover старого runtime не выполнять.
- AME сохранён без новых работ и проверок. Новое поручение разрешает необходимую проверку собственной установки4.0.0; оно не разрешает перезапуск AE, обход pending/UNKNOWN/fences, raw/destructive/save или изменение пользовательского AEP ради удобства установки.
- Новый контур — `core4/`, без imports старых `bridge-daemon`/adapter и без монолитного fallback. Его проверки выбираются `node core4/tools/validate-diff.js <changed-path> --run`, boundaries — `npm.cmd --prefix core4 run check:boundaries`; M1 fixtures — `npm.cmd --prefix core4 test`. Полная release-проверка — отдельное явное действие. Старые `check:rules`/`smoke:core-runtime` проверяют только изменённую исходную базу 3.3.5; не повторять их из-за правки Core4. `git diff --check` сохраняется. Offline stub не является live proof.
- Завершённые этапы фиксировать небольшим commit и обновлять Progress / Decision Log / Validation текущего плана.

## Рабочие заказы и разработка продукта

- Для сложных инженерных этапов доступен [ручной Argon review workflow](docs/argon-review-workflow.md); ограничения и состояние MSI описаны там и в статусе bridge-проекта.

- Назначение задачи определяется явным scope, а не cwd. Титры, слайды, монтаж и другие пользовательские работы ведут собственный рабочий контекст и результаты. Остановка чата, изменение ТЗ, ручная доработка или обычная рабочая проблема сами по себе не создают product milestone, архитектурное решение или условие запуска AE Agent.
- Progress / Decision Log / Validation продуктового плана и milestone commits относятся к разработке AE Agent. Исправление инструмента выделяется в явный engineering block: scope, изменения, relevant verification и продуктовое решение. Рабочий заказ нельзя молча превращать в разработку продукта. Текущий перенос Core — такой engineering block.
- Новые plan-run records содержат описательный `recordContext`: purpose/lifetime/context/project/resource bindings. Обычный runner явно использует default `user_work/work_context`; engineering и технические проверки указывают `development/product_change` или `technical_check/ephemeral_check` явно. Старые записи без metadata остаются `unclassified`; назначение не угадывается по cwd или UUID. Контракт — `docs/record-context.md`.
- Purpose не является authority и не снимает UNKNOWN, ownership/revisions/checkpoints или fences общих ресурсов. Новый чат/UUID и отмена заказа не доказывают отмену уже отправленной команды. История рабочих заказов остаётся legacy; Core startup зависит от своего origin и действующего состояния/ограничений общих ресурсов, а не от архивной истории работы.

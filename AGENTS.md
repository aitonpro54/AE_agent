# AE Agent Core 4.0.0 — создание устанавливаемого runtime

## Рабочий каталог

С 27 октября 2026 по поручению пользователя единственный рабочий корень Core —
`C:/Users/Ant/Documents/Codex/AE_agent_core`. Все дальнейшие чтения, изменения,
проверки и команды Git для Core выполнять отсюда. Прежний каталог
`C:/Users/Ant/Documents/Codex/AI Coverage Agent/AI Agent Core` освобождён и больше
не используется. Исторические пути в evidence и планах сохраняют provenance;
перенос исходников не переключает установленный MCP/CEP или runtime authority.

## Текущий scope и правила

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

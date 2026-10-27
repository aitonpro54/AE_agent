# AE Agent Core 4.0.0 — создание устанавливаемого runtime

## Рабочий каталог

С 27 октября 2026 по поручению пользователя единственный рабочий корень Core —
`C:/Users/Ant/Documents/Codex/AE_agent_core`. Все дальнейшие чтения, изменения,
проверки и команды Git для Core выполнять отсюда. Прежний каталог
`C:/Users/Ant/Documents/Codex/AI Coverage Agent/AI Agent Core` освобождён и больше
не используется. Исторические пути в evidence и планах сохраняют provenance;
перенос исходников не переключает установленный MCP/CEP или runtime authority.

## Текущий scope и правила

Цель: самостоятельно работающее минимальное ядро Codex → MCP → typed bridge → After Effects и независимо подключаемые рабочие пакеты. Текущий план: `plans/core-4.0.0.md`; `plans/core-migration.md` сохраняет историю исходной базы 3.3.5 и незавершённого cutover.

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

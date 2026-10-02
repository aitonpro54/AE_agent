# Старт второго этапа оптимизации

Подготовлено 2 октября 2026 по просьбе пользователя для нового чата.
Это передача планов; реализация этапа 2 ещё не начата.

## Состояние и материалы

- Workspace: `C:/Users/Ant/Documents/Codex/AE_agent`.
- Ветка на момент подготовки: `codex/production-usage`; сохранять чужие edits.
  В новом чате сверить HEAD/status. Номер версии не менять без release scope.
- Завершённый этап 1: `65d2379` — workflow/skills; `7ae3522` — compact/evidence;
  `50d5cd6` — completion summary. Это проверенные code checkpoints.
- Этап 2: [детерминированный конвейер](../plans/montage-pipeline-execplan.md).
- Этап 3: [общий agy-bridge](../plans/agy-bridge-reliability-execplan.md).
  Он остаётся отдельным scope и не блокирует старт этапа 2.
- Контракты: `docs/montage-workflow.md`, `docs/compact-plan-results.md`,
  `docs/ae-task-completion.md`, `docs/model-routing.md`.
- Исходные компоненты: `mcp-server/placeholder-plan-builder.js`,
  `placeholder-usage.js`, `placeholder-readback.js`, `placeholder-visual-review.js`,
  `placeholder-visual-batches.js`, `placeholder-framing.js`,
  `placeholder-source-recovery.js`; сначала читать только нужные sections.

## Что уже проверено и чего это не доказывает

Этап 1: полный verifier выполняется перед summary, full остаётся default;
canonical records и paged evidence имеют строгие IDs/hash/bindings/containment.
Completion module/CLI read-only, transport/execution/technical/visual независимы,
unknown не повышается, PNG declaration не означает полного task acceptance.
23 completion smoke groups, компактный пакет20steps132153→12249bytes≤12KiB,
rules/node/diff и соответствующие API fixtures прошли.

Локальные AE skills уточнены; `quick_validate.py` недоступен без PyYAML,
frontmatter/fields/links проверены отдельно. Новых зависимостей не установлено.
Первый Flash run завершился provider socket error; после сверки его завершения
Sol/high закончил тот же scope. Не повторять старый task или его мутации.

Runtime21508/sourceSHA69d6616c, connected/autonomy on/queues0/editnull — прошлое
наблюдение, не актуальный baseline нового чата. Текущий клиентский AEP не менялся
ради оптимизации. Новый этап — code/offline работа; открытый проект не является
разрешением на incidental live validation, save/render/cleanup или повтор монтажа.

## Промпт для нового чата

```text
Работаем в C:\Users\Ant\Documents\Codex\AE_agent.
Реализуй обязательные M1–M4 второго этапа оптимизации — детерминированный
монтажный конвейер — по plans/montage-pipeline-execplan.md. Опциональный M5
оставь отдельным будущим scope. Прочитай также AGENTS.md,
plans/target-app-execplan.md и docs/optimization-stage-2-start.md.

Первый этап уже завершён: рабочий контракт, full/summary, paged evidence
и read-only сводка завершения поручения. Не реализуй их заново. Сверь свежие
HEAD/status и существующие placeholder builders, повторно используй их.

Цель: превращать согласованный manifest известных сцен, источников, шотов,
групп и кадрирования в ограниченные typed plans с заранее заданными кадрами
проверки и восстановлением только сверенной оставшейся работы. Выбор фрагментов
и художественная приёмка остаются модельными задачами. Не угадывай неизвестные
маршруты, stretch/remap или данные; учитывай реальные ограничения builders.

Доведи этап до предусмотренной планом offline приёмки, работая milestone
за milestone: применимые проверки, Progress/Decision Log/Validation и отдельный
commit после каждого. Выполнение этапа разрешено; повторно спрашивать разрешение
на обычные изменения кода в этом scope не нужно.

Сохрани действующий маршрут: модель чата диспетчеризирует, архитектура —
Sol/ultra, основная реализация — Flash/high через существующий agy-bridge
профиля ae-agent. Применяй ae-task-routing и antigravity-cli, не переключай
модель чата. До двух помощников включая AGY, один writer на ресурс; не дроби
поручения на отдельные чтения/setters. После timeout/unknown сначала сверка.

Этот этап ограничен AE Agent и offline fixtures. Текущий AEP не менять;
не запускать incidental live/provider demos, full-intake, frozen refactor,
широкие CEP smoke, новые зависимости или изменения общего agy-bridge/auth.
Для Flash допускаются только точные проектные grants на разрешённые файлы
и необходимые offline команды этого этапа, с backup и проверкой остальных полей;
глобальные/wildcard права и обход отказов запрещены. required_commands и grants
проверять отдельно до запуска исполнителя.
AE gates, native read-back, idempotency и независимую визуальную приёмку сохранить.
Этап 3 в plans/agy-bridge-reliability-execplan.md сейчас не выполнять.

Не создавать новый handoff автоматически; продолжать эту задачу до завершения
этапа 2. В финале сообщить изменения, проверки, commits и оставшиеся ограничения;
не заявлять денежную экономию без измеренного сопоставимого монтажа.
```

Следующий шаг: начать новый чат в этом workspace с приведённым промптом.

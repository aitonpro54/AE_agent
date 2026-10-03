# Agent instructions

## Project goal

Maintain AE Agent 3.2.0 in this clean repository. The product target is
`specs/target-app.md`; the active execution plan is
`plans/target-app-execplan.md`.

## Clean repository rules

- Keep only current product code, typed tools, recipes, registry, bridge, CEP
  panel, provider layer, and AE-specific Full Intaker/importer tooling.
- Treat the legacy repository and git history as the source for historical
  context; do not recreate legacy evidence archives or generated runtime logs
  here.
- Keep runtime outputs ignored and local, including `.codex/`,
  `.codex-runtime/`, `.codex-autonomy/`, `logs/`, `backups/`, `snapshots/`,
  and `pro-review-bundles/`.
- Work milestone by milestone for substantive work; do not turn a small fix into
  a new acceptance milestone. Resolve small ambiguities autonomously and record
  material decisions. Communicate with the user and write new handoffs in Russian
  unless requested otherwise; this instruction is scoped to this repository.
- Keep `plans/target-app-execplan.md` compact and current.
- Для новой версии создавай отдельную `codex/release-X.Y.Z` от проверенного
  состояния, сохраняя предыдущую ветку и точный checkpoint/tag. Выпуск, PR и
  возврат к прежнему коду описаны в `docs/release-workflow.md`; слияние PR
  требует отдельного поручения пользователя.

## Продолжение работы

Веди крупные этапы как отдельные проверяемые блоки. После завершения этапа
обновляй существующий план (Progress, Decision Log, Validation) и фиксируй
рабочий commit, если проект использует Git и коммиты не запрещены. Не начинай
новый чат и не создавай handoff из-за длины диалога, счётчика токенов или
приближения compaction. После compaction продолжай ту же задачу, сверив
актуальное состояние файлов и runtime. Handoff делай только по явной просьбе
пользователя. Неизвестный результат мутации сначала сверяй по фактическому
состоянию; не повторяй операцию вслепую. Ограничивай объём чтения и вывода.

## Engineering rules

- В AE-задачах сначала ищи готовое решение через `search_solutions`, затем
  читай нужные страницы `get_solution`; не загружай весь registry в контекст.
- Используй свежие результаты инспекции в пределах операции; запрашивай только
  недостающие поля. После мутаций проверяй изменённые цели заново.
- Для поддерживаемых операций предпочитай `build_solution_plan`, затем
  `propose_ai_agent_plan` и обычные dry-run/confirmation/read-back gates.
  Raw JSX допустим только при конкретном пробеле typed tools.
- Если в CEP активна `Автономная сессия Codex`, после успешного
  dry-run можно выполнить через MCP только server-proposed typed mutating plan.
  Direct mutations, raw JSX и destructive plans остаются в ручном CEP flow.
- Настройка автономной сессии по умолчанию включается при первом доверенном
  подключении панели; явное выключение сохраняется. Полный доступ Codex к файлам
  не заменяет bridge gates. Настройка не управляет поиском, сбором кандидатов,
  продвижением рецептов или статистикой.
- Расход и ограничения измерений описаны в `docs/solution-reuse.md`;
  `npm.cmd run report:reuse` показывает наблюдаемые события, не процент экономии.
- Для чтения общей истории расхода и токенов задачи используй локальные MCP-инструменты
  `get_task_usage` и `get_usage_history` без вызова моделей и при закрытом AE. Текущий
  thread ID берётся только как подтверждённый UUID из runtime (не угадывать и не
  передавать 'current'). Timestamps и coverage показывают фактически сохранённые
  сессии/интервалы; API-эквивалент стоимости условен и не заменяет подписочные лимиты.

- Reuse existing components and design tokens.
- Do not introduce a parallel design system.
- Prefer small, typed modules over large monolithic files.
- Do not add production dependencies without recording the decision.
- Keep API contracts explicit.
- Do not remove tests unless replacing them with better current coverage.

Для монтажа готовых плейсхолдеров использовать `docs/montage-workflow.md`:
три основных блока Flash, единый manifest и заранее заданное покрытие кадров;
после исправления проверять изменённую цель и использующие её сцены. Компактный
ответ сокращает передачу данных, сохраняя полную серверную проверку и AE gates.

## AE references and text layout

- When the user supplies layout examples, use them to identify visual hierarchy,
  typography, spacing, and alignment for the target frame.
- Before editing, compare the relevant examples with the actual target frame:
  date as one visual group, event type versus event title, main performers versus
  supporting details such as cities and instruments. Record the intended hierarchy.
- Принципы оформления любых текстов через AE Agent описаны в
  `docs/text-layout-policy.md`; рабочий набор инструкций —
  `mcp-server/text-layout-policy.js`. Применяй их при подготовке поручений
  исполнителям и проверке результата. Проверяй визуальный вес и поля после
  трансформаций вложенных композиций: Source Text fontSize и центр слоя
  сами по себе не доказывают корректность итогового кадра.
- Preserve that hierarchy when replacing text. If one typed text update would
  flatten different styles in a layer, use separately controllable text ranges or
  reviewed text layers in the existing comp. Fit text with deliberate line breaks,
  font size, weight, leading, and tracking while preserving the frame and animation.
- Judge centering against the visible text bounds and the visible inner panel,
  including perspective in the final comp. Check balanced left/right margins and
  roughly balanced vertical gaps between date, captions, and title; a centered
  layer position alone does not prove the text looks centered.
- Inspect the finished frame at a readable preview size after each layout change.
  For animated text, also inspect entry and exit as needed. Read back the edited
  layers and correct clipping, overlap, or weak visual hierarchy before saving.
- If footage is missing, inspect whether it contributes to the requested visible
  result. Leave irrelevant missing files alone; report a limitation only if the
  missing material changes the output or prevents the requested verification.
- After a text edit, read back layer identity and name before later guarded steps:
  AE may rename a text layer from its new content. If a plan stops partway through,
  reconcile completed steps and submit only the remaining work. If the aggregate
  response conflicts with step results, use independent property and visual
  read-back; never blindly replay a possibly completed mutation.
- If a broad comp inspection fails on multiline text, use narrower comp, layer,
  and property reads. Before executing a proposal, preserve its exact current
  action/revision/hash fields; a rejected submission is not proof of mutation.
- For multiple plaque variants, save each reviewed project under its event name
  and verify the saved path and final frame. Inspect inherited render-queue paths
  before any later export; a saved project or preview screenshot is not a render.

## SDK and Full Intaker boundary

- Intaker/importer/supervisors frozen: exact boundary is
  `config/frozen-intake-manifest.json`; `check:rules` checks its locked hashes.
  No routine search/refactor or full-intake execution inside that boundary.
  The active exception `orchestrator/bounded-process-result.cjs` stays supported.
  Thaw/baseline changes require a separate reviewed scope; normal checks never update it.

- Keep AE Agent-specific Full Intaker/importer tooling in this repo.
- Do not rebuild broad generic SDK orchestration history here. Move reusable
  generic SDK behavior toward the sibling `codex-sdk-orchestrator-tool` only in
  a separate reviewed migration.
- Keep Local/Ollama, fallback providers, broad CEP smoke, live mutation,
  dependency changes, push, and PR approval-gated. An explicit instruction covering
  the current operation supplies task approval; do not ask for the same scope twice.
  Runtime grants, tool confirmations and frozen-boundary rules remain in force.

## Verification

Before marking a milestone complete, run the checks relevant to touched files.
For this clean baseline, the default command is:

- `npm.cmd run check:rules`

For source changes, also run:

- `node --check` for every touched JavaScript file
- `git diff --check`

For product/tooling changes, select the relevant configured smoke groups after
checking their scope; this list is not an instruction to run every group:

- `npm.cmd run smoke:provider-contract`
- `npm.cmd run smoke:provider-api`
- `npm.cmd run smoke:solutions`
- `npm.cmd run smoke:planning`
- `npm.cmd run smoke:bridge`
- `npm.cmd run smoke:full-intake` only after checking it is an allowed offline
  contract check; never treat this name as permission for frozen Full Intaker execution

For read-only live connectivity, when After Effects and the panel are available:

- `node scripts/cep-panel-cdp-smoke.js inspect`
- `node scripts/cep-panel-cdp-smoke.js connector-status-smoke`

Do not run mutating live validation, OpenAI CLI planner lanes, Local/Ollama, or
broad/default CEP smoke unless the current scope explicitly approves it. For
Markdown/TOML-only instruction changes, use rules/config validation and diff checks;
do not run a product acceptance suite or modify AE projects as an incidental test.
Tests that cannot run are reported with reasons; a fake/offline test is not live proof.
Protected raw, destructive and save operations retain their own gates. For live work,
use `ae-safe-project-automation`; for visual UI work, use the installed vendor
computer-use plus `ae-computer-use-workflow`, without modifying plugin cache.

## Windows PowerShell encoding

Read Russian/UTF-8 Markdown files with `Get-Content -Encoding UTF8`.
## AE model routing and shared runtime

Пользователь свободно выбирает любую доступную модель и effort в UI/CLI.
Проект не переопределяет этот выбор, не задаёт model/effort по умолчанию и не
ограничивает селектор списком моделей. Выбранная модель ведёт чат и проверяет
результаты исполнителей; автоматически её не переключать. **Sol 6.1/high** —
рекомендация для диспетчеризации. Таблица ниже — маршрут автоматического
делегирования, если пользователь не указал другого исполнителя.

| Задача | Исполнитель |
|---|---|
| Статус, один готовый короткий вызов проверки или правки | Диспетчер сам |
| Простое самостоятельное поручение: поиск, извлечение данных, правка по образцу | Luna / medium (`ae_scout` для чтения, `ae_operator` для правки) |
| Большинство задач средней сложности с понятным scope и приёмкой | Gemini 3.8 Flash / high через `antigravity-cli`, под контролем выбранной модели чата |
| Узкий сложный инженерный блокер | Sol 6.1 / xhigh (`ae_specialist`) |
| Архитектура, системные границы, сложное планирование | Sol 6.1 / ultra (`ae_architect`) |
| Очень сложная задача, которую Sol 6.1 / ultra не решил | Astra / high (`ae_escalation`) |

Каждый самостоятельный блок требует явного выбора исполнителя по scope; после
закрытия сложного блокера выбор делается заново. Серии routine checks, чтений и
разбора результатов не подпадают под исключение одного короткого вызова: для них
обязательны маршруты Luna/Flash, кроме конкретной записанной причины. Правило и
формат записи описаны в [routine dispatch policy](docs/routine-dispatch-policy.md).

Точные ID: `gpt-6.1-sol`, `gpt-6-luna`, `gpt-6-astra`, `gemini-3.8-flash-high`.
Этот постоянный маршрут разрешён пользователем: для средней задачи не требуется
повторно просить разрешение на Flash. Перед запуском читать `antigravity-cli`,
использовать профиль `ae-agent`. Обсуждение или настройка маршрута не требует demo.

Диспетчер передаёт Flash цель, исходный запрос, ограничения, ownership и приёмку,
затем проверяет diff, артефакты и применимые проверки; параллельно не дублирует
его реализацию. Flash самостоятельно читает материалы, планирует и исправляет.
До двух содержательных исправлений одного проваленного критерия; затем
Sol/xhigh для локального блокера либо Sol/ultra для системного. Astra вызывается
только после содержательной неудачи Sol/ultra с записанными попытками и пробелом.
Auth/quota/network/MCP/permissions устраняются отдельно от эскалации рассуждений.
При недоступности Flash после сверки завершения запуска Sol/high может выполнить
задачу в том же scope с записанной причиной. Обязательного отдельного ревью нет.

Максимум два активных вспомогательных исполнителя суммарно, **включая AGY**
и помощников Ultra. Делегировать только полезные самостоятельные части; один
writer на ресурс и один контроллер AE/CEP/UI. Обычные исполнители не создают
агентов. Архитектурный Sol/ultra может использовать ограниченного помощника
для read-only анализа в свободном слоте общего лимита; помощник дальше не делегирует.
Перед передачей ресурса при timeout сверять процесс, pending и read-back.
Неизвестную мутацию нельзя повторять вслепую.

Luna/medium используется для простых самостоятельных поручений, когда передача
задачи оправдана объёмом работы или независимостью; один короткий вызов не требует
агента. `ae_scout` и `ae_operator` задают 272000 токенов — штатное окно Luna
по каталогу Codex на 1 октября 2026 года; выбранный порог автосжатия — 230000. Общий агент `luna-standard` имеет
такое же окно, порог 230000 и effort high для задач вне AE-ролей; для AE-задач выбирай scoped роли.
Обычный вызов Luna без этих ролей наследует глобальное окно 500000 и порог автосжатия 425000.
При неоднозначности Luna возвращает вопрос диспетчеру, не расширяя scope.
Роль reviewer — Sol 6.1/high для ограниченного ревью. Ultra используется для архитектуры,
max не является обязательной ступенью. Terra, paid API, покупка кредитов,
смена провайдера Codex и скрытый fallback не входят в автоматический маршрут;
модель/effort, явно выбранные пользователем, имеют приоритет над рекомендациями.
Model/effort проверять по metadata, не по самоотчёту; уже загруженные роли не меняются от
редактирования TOML. MCP Antigravity и его права проверять отдельно.
Typed tools, библиотека решений, AE gates и необходимость read-back сохраняются;
транспорт SUCCESS не является приёмкой.
Bounded поручения по умолчанию создавай с `fork_turns: none` и явной целью,
контекстом, ownership и приёмкой; полный history используй только при обоснованной
зависимости.

Практический контракт и проверка доступности: `docs/model-routing.md`.
При делегации читать `ae-task-routing`; возвращать компактные результаты.

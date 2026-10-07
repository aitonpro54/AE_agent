# Программное управление функциями CEP-панели без Computer Use

## 1. Назначение и архитектура

Взаимодействие агента с собственной панелью расширения Adobe After Effects (**AE Agent CEP panel**)
реализовано в исходном коде через типизированные MCP-инструменты и CLI.
До live-проверок подтверждены production-панель в VM, fake CDP и изолированные HTTP/stdio fixtures.
Это не доказывает установку новых assets, текущее live-соединение или выполнение проекта AE.
Использование прямого графического кликанья (**Computer Use / GUI clicking**) по кнопкам и переключателям
внутри панели запрещено.

### Архитектурные уровни

1. **CEP Action Service (`window.AEAgentPanelActions`)**:
   Защищённый frozen-сервис внутри доверенного контекста CEP панели (`cep-panel/panel-actions.js`,
   `cep-panel/panel-action-contract.js`). Экспортирует фиксированный контракт:
   `protocolVersion`, `catalog()`, `state(options?)`, `invoke(envelope)`, `getResult(requestId)`.

2. **Scoped CDP Transport (`mcp-server/cep-panel-control.js`)**:
   Изолированный сервис взаимодействия с CEP через loopback Chrome DevTools Protocol (`127.0.0.1:8870`).
   Выполняет только фиксированные именованные методы `window.AEAgentPanelActions`. Запрещены произвольные
   выражения, DOM-селекторы, передача raw скриптов, URL или токенов через командную строку.

3. **CLI (`scripts/cep-panel-control.js`)**:
   Отдельная консольная утилита с выводом структурированного JSON. Команда `help` работает офлайн без сети.
   Секреты (API ключи) передаются исключительно через защищённый входной JSON-файл и маскируются на выводе.

4. **Типизированные MCP-инструменты (`mcp-server/bridge-daemon.js`)**:
   Четыре инструмента, зарегистрированные в динамическом каталоге daemon:
   - `list_panel_actions`
   - `get_panel_state`
   - `invoke_panel_action`
   - `get_panel_action_result`

---

## 2. Охват именованных действий панели (Action Coverage)

Контракт покрывает все функции и элементы управления панели:

| Категория | Имя действия | Аргументы / Назначение |
|---|---|---|
| **Bridge** | `bridge.configure` | `{ url?: loopback_http, panelToken?: writeOnlyString }` — настройка адреса bridge и токена |
| | `bridge.connect` | `{}` — запуск опроса команд bridge |
| | `bridge.disconnect` | `{}` — остановка опроса bridge |
| **Панель** | `panel.reload` | `{}` — перезагрузка фрейма CEP с верификацией assets nonce |
| **UI** | `ui.diagnostics.set` | `{ open: boolean }` — отображение/скрытие панели диагностики |
| | `ui.sidebar.set` | `{ collapsed: boolean }` — сворачивание/разворачивание боковой панели |
| **Автономия** | `autonomy.refresh` | `{}` — вычитка статуса автономной сессии Codex |
| | `autonomy.set` | `{ enabled: boolean }` — переключение режима автономной сессии на bridge |
| **Плейсхолдеры** | `placeholder.refresh` | `{}` — обновление статуса защиты плейсхолдеров |
| | `placeholder.accept` | `{ useSelectedProperties: boolean }` — постановка выбранного слоя под защиту |
| | `placeholder.release` | `{ confirm: true }` — снятие защиты (требует подтверждения) |
| | `placeholder.mapGroup` | `{ groupId: string }` — назначение группы/исполнителя слою |
| | `placeholder.constraints.set` | `{ distinctGroups: boolean, disallowSourceOverlap: boolean }` — применение ограничений |
| **Коннектор** | `connector.refresh` | `{}` — проверка состояния ChatGPT connector |
| | `connector.emergencyDisable` | `{ confirm: true }` — экстренное отключение write-инструментов коннектора |
| **Расход** | `usage.refresh` | `{}` — обновление метрик токенов и сессий |
| **Провайдеры** | `provider.group.set` | `{ group: "openai"\|"gemini"\|"claude"\|"openrouter"\|"local" }` — выбор вкладки провайдера |
| | `provider.authMode.set` | `{ mode: "api"\|"cli" }` — режим аутентификации OpenAI |
| | `provider.agent.set` | `{ agentId: string }` — выбор активного агента |
| | `provider.model.set` | `{ model: string }` — идентификатор модели |
| | `provider.freeOnly.set` | `{ enabled: boolean }` — фильтрация бесплатных моделей |
| | `provider.refresh` | `{ quiet?: boolean }` — обновление списка агентов |
| | `provider.detectLocal` | `{}` — обнаружение локального сервиса Ollama |
| | `provider.check` | `{ agentId: string, model: string }` — проверка готовности модели |
| | `provider.selfTest` | `{ agentId: string, model: string }` — самопроверка провайдера |
| | `provider.key.save` | `{ agentId: string, model: string, key: writeOnlyString }` — сохранение API-ключа |
| | `provider.setup` | `{ agentId: string, model: string, action?: string }` — запуск процедуры настройки |
| **Чат / Composer** | `chat.mode.set` | `{ mode: "chat"\|"plan"\|"hardcore" }` — переключение режима композера |
| | `chat.optimization.set` | `{ enabled: boolean }` — оптимизация промпта |
| | `chat.prompt.set` | `{ prompt: string }` — установка текста промпта |
| | `workflow.preset.set` | `{ presetId: string }` — выбор пресета рабочего процесса |
| | `workflow.insert` | `{ presetId: string }` — вставка пресета с корректными side effects |
| | `chat.sessions.list` | `{ offset?: integer, limit?: integer }` — список сессий чата |
| | `chat.session.select` | `{ sessionId: string }` — выбор сохранённого диалога |
| | `chat.new` | `{}` — создание нового диалога |
| | `chat.clear` | `{ sessionId: string, confirm: true }` — очистка истории диалога |
| | `chat.transcript.get` | `{ sessionId?: string, offset?: integer, limit?: integer }` — получение сообщений |
| | `chat.send` | `{ prompt, sessionId, agentId, model, mode: "chat", promptOptimization? }` |
| | `agent.plan` | `{ prompt, sessionId, agentId, model, mode: "plan", promptOptimization? }` |
| | `agent.hardcore` | `{ prompt, sessionId, agentId, model, mode: "hardcore", confirm: true }` |
| **Планы действий** | `plan.current` | `{ fresh?: boolean, expectedActionId?: string }` — вычитка текущего плана и pins |
| | `plan.recover` | `{}` — восстановление последнего плана из истории |
| | `plan.prepare` | `{ pins: PIN_SCHEMA }` — принятие предложения без токена и dry-run; возвращает новые pins |
| | `plan.dryRun` | `{ pins: PIN_SCHEMA }` — исполнение сухой проверки без изменения проекта AE |
| | `plan.run` | `{ pins: PIN_SCHEMA, confirm: true }` — исполнение плана через защищённый runner |
| | `plan.reconcile` | `{ runId: string }` — сверка фактического состояния проекта после исполнения |
| | `plan.devRequest` | `{}` — сборка бандла запроса разработки инструментов |
| **Логи** | `logs.get` | `{ offset?: integer, limit?: integer }` — вычитка санированных строк журнала активности |

---

## 3. Политика сохранения проекта, жизненного цикла и библиотеки решений

В интерфейсе CEP-панели отсутствуют отдельные кнопки «Сохранить проект», «Создать проект» или «Открыть библиотеку».
Это архитектурное решение, сохраняющее безопасность и единые gates:

1. **Библиотека готовых решений**:
   Поиск, получение спецификации и построение планов решений выполняются через существующие типизированные MCP-инструменты:
   - `search_solutions` — поиск по описанию
   - `get_solution` — чтение параметров решения
   - `build_solution_plan` — компиляция шагов плана
   Панель не требует отдельных кнопок каталога решений.

2. **Сохранение проекта и управление жизненным циклом**:
   Операции сохранения проекта (`save_current_named_project`, `save_project_as`) и управления жизненным циклом
   (`finalize_project_lifecycle`, `recover_project_lifecycle`) являются плановыми действиями либо
   защищёнными ручными операциями. В программном потоке они исполняются через `plan.run` с точными pins предложения
   и подтверждением `confirm: true`. Прямой неконтролируемый вызов сохранения через CEP не допускается.

3. **Сырой ExtendScript (Raw JSX)**:
   Выполнение произвольного клиентского JSX через панель полностью исключено. Любой скрипт должен происходить из
   серверного предложения (`riskLevel: raw_jsx`), пройти предварительную сухую проверку (`plan.dryRun`),
   получить точный `acceptedDryRunId` и исполняться только с явным подтверждением `plan.run({ pins, confirm: true })`.

---

## 4. Надёжность транспорта и защита от повторов (Durable Receipts)

1. **Фиксация квитанции перед отправкой**:
   Перед отправкой команды в WebSocket CDP формируется и сохраняется на диск долговременная квитанция
   со статусом `accepted` (`delivery: not_submitted`). При отправке статус обновляется на `running` (`delivery: submitted`).

2. **Защита от повторного исполнения (No Blind Replay)**:
   При повторном вызове `invoke` с тем же `requestId`:
   - Если действие и сигнатура аргументов совпадают, возвращается ранее сохранённая квитанция без повторного запуска.
   - Если сигнатура аргументов изменилась, возвращается ошибка конфликта `duplicate_request_id_conflict`.

3. **Неизвестный исход при разрыве связи (Unknown Outcome)**:
   Если сокет закрылся или истёк таймаут до получения ответа, квитанция переводится в состояние
   `state: unknown`, `delivery: unknown`, `replayAllowed: false`. Повторная автоматическая отправка категорически запрещена;
   клиент обязан выполнить пассивную вычитку результата через `getResult` или сверку состояния проекта.

4. **Авторизационный барьер**:
   - Вызовы через `/mcp/tools/call` требуют токена с ролью `automation` и заголовка `x-ae-mcp-adapter: codex-stdio-v1`.
   - Вызовы со стороны `direct-tools-call`, `/dev/tool/` и `connector` отвергаются с ошибкой `official_mcp_adapter_required`.

---

CLI и daemon используют logs/cep-panel-control относительно этого репозитория и один атомарный
межпроцессный lock. CDP port фиксирован: 8870, без flags/env redirect. Новый control-вызов не
открывает/reload панель, не делает native bootstrap и не запускает daemon.
Записи и identity index сохраняются через flushed temporary file и atomic rename.
На Windows directory fsync недоступен; файловый fsync выполняется до rename.
Corrupt/missing indexed receipt даёт unknown; неопределённые записи нельзя удалить для освобождения места.
Live owner не вытесняется. Orphan lock освобождается только после пассивной terminal receipt
того же requestId/original binding при подтверждённом завершении owner process.

Внутренняя capability для четырёх MCP-tools выдаётся только после official marker + automation role;
одна строка source не даёт доступа. Generic invoke имеет conservative readOnlyHint:false,
destructiveHint:true, openWorldHint:true. Schema и gates конкретного действия проверяются общим CEP contract.

Новый UUID не обходит reconciliation_required: state показывает reconciliationRequired и
unresolvedActions. Пассивные чтения, same-run plan.reconcile и connector.emergencyDisable сохраняются.
Сверка текущих postconditions не доказывает остановку исходного execution. Unknown Hardcore без run
identity не имеет надёжного bounded release: guard сохраняется до отдельного проверяемого terminal
evidence, без reset/idle auto-heal.

Проверка installed disk hashes включает panel-action-contract.js и panel-actions.js. Она не
доказывает identity уже загруженного CEP cache: для live-приёмки отдельно нужны фактически
загруженный service/protocol/state и разрешённый protected read-back. Закрытая/устаревшая панель
возвращает явную недоступность; control не делает bootstrap/reload автоматически.

## 5. Использование через CLI

Команды утилиты `scripts/cep-panel-control.js`:

```powershell
# 1. Офлайн-справка
node scripts/cep-panel-control.js help

# 2. Список доступных действий
node scripts/cep-panel-control.js catalog

# 3. Снимок состояния панели
node scripts/cep-panel-control.js state

# 4. Исполнение действия из файла входных данных
node scripts/cep-panel-control.js invoke --input ./action-input.json --wait --timeout 30000

# 5. Пассивное чтение результата ранее запущенного действия
node scripts/cep-panel-control.js result --request-id 12345678-1234-1234-1234-123456789abc
```

Пример входного файла `action-input.json`:
```json
{
  "protocolVersion": "ae-agent.panel-actions.v1",
  "requestId": "12345678-1234-1234-1234-123456789abc",
  "action": "ui.diagnostics.set",
  "args": {
    "open": true
  }
}
```

---

Для нового действия нужен новый lowercase UUID; для результата/повторного чтения используется
исходный UUID. CLI не создаёт UUID автоматически, не выводит содержимое parse error и
принимает только regular JSON-файл до 64 KiB. Secret values передаются в файле, не в argv;
файл пользователя сохраняется.

## 6. Таргетированные команды package.json

В `package.json` добавлены специализированные команды:

- `npm run panel-control -- help` — запуск CLI программного управления панелью
- `npm run smoke:panel-control` — запуск изолированного офлайн смоук-теста транспорта, квитанций и валидатора
- `npm run smoke:panel-actions` — VM production CEP handlers, UI listeners и durable receipts

# Core: Tool-First workflow

Core предоставляет typed MCP инструменты для детерминированной подготовки и проверяемого исполнения AE-планов. Эта инструкция описывает опубликованный контракт; она не является разрешением на live-действие и не подтверждает workflow acceptance.

## Запуск AE и версия загруженной панели

В owner runtime с поддержкой startup сначала прочитайте `core_status`, затем
получите управление текущим `workSession.sessionId` через `controller_acquire`.
`core_ensure_ae_panel` принимает новый UUID v4 `operationId` и необязательный
`timeoutMs` (1000–90000). Он штатно запускает отсутствующий AE и открывает
собственную панель; Computer Use для этого не нужен. Status/connect сами AE
не запускают. При старом MCP-клиенте сначала используйте свежий штатный клиент
из действующей configured привязки; старый клиент не доказывает новую установку.

Различайте версию клиента/owner, установленного пакета и загруженной CEP.
`physical.peer.acceptedIdentity` показывает защищённый ответ выполняемого
`panel.js`; готовность нативного registry подтверждается отдельным bootstrap.
Версия manifest или подпись меню не заменяют эти ответы. После запуска сделайте
обычную typed `project-inspection` по актуальному контракту и освободите lease.
Startup не выдаёт project authority и не снимает baseline/grants.

При timeout/UNKNOWN читайте `core_ae_panel_startup_status` исходного UUID.
Не создавайте второй запуск и не переходите в Computer Use для обхода отказа.
`interrupted` завершает только исход запуска; receiver UNKNOWN сохраняет свой
штатный путь восстановления. Подробный контракт и ограничения первого перехода
со старой панели — [штатный запуск](core-ae-panel-startup.md).

## План и proposal

1. Получи точный контракт выбранного builder через `get_plan_builder_contract(solutionId)`. Не угадывай inputs и не ищи recipe: Core не публикует `search_solutions`, `get_solution` или candidate tools.
2. Построй план через `build_solution_plan(solutionId, inputs)` по schema и inspected evidence из контракта. Поддерживаемый перечень задаёт сервер; неизвестный ID должен быть отклонён.
3. Создай server-owned proposal через `propose_ai_agent_plan`. Пользуйся возвращёнными pins и refs; не конструируй их самостоятельно.
4. `validate_ai_agent_plan` проверяет план, но не заменяет dry-run. Проведи proposal-backed dry-run через `run_ai_agent_plan` с текущими данными proposal и `dryRun: true`.
5. Исполняй только после актуальной проверки результата и всех применимых runtime gates, отдельного защищённого подтверждения для соответствующего риска и свежего read-back. Сессия Codex, dry-run или файловый доступ сами по себе не предоставляют authority.

## Проверка исхода

После известного результата прочти изменённые цели подходящими read tools, например `get_project_info`, `get_comp_details`, `get_layer_details` или `get_layer_essential_properties`. `get_plan_run_evidence` читает сохранённый evidence и не заменяет свежий AE read-back. Для визуального результата получи кадр через `save_comp_frame_png` и действительно просмотри изображение, если визуальная проверка требуется поручением.

При timeout или неизвестном submit сначала сверь proposal/run state и фактический read-back. Не повторяй потенциально завершённую мутацию вслепую. Объём проверки указывай точно: опубликованный tool, offline smoke, live read и визуальная приёмка — разные факты.

## Завершение UI-блока

Перед переходом от интерфейса к CLI/API или отчёту немедленно заверши
Computer Use штатным протоколом используемого runtime. Для `mcp__cua_repl`
после наблюдения конечного исхода следующий вызов содержит только
`completion_summary` (ровно один раз). Не держи UI-управление между шагами.
У native `@oai/sky` в текущей документации нет метода teardown: прекрати
UI-вызовы и не называй это подтверждённым отключением интеграции. Закрытие
AE, убийство helper или удаление плагина не являются заменой завершения.

## Штатный сброс Core

`core_status.startOver.eligibility` сообщает доступное действие и причину.
Панель и CLI используют это решение владельца. Ожидание baseline и
незавершённый сброс отображаются отдельно. После обычного сброса сначала
выполняется чтение проекта. Если само чтение осталось с неизвестным исходом,
владелец может допустить восстановление с сохранением истории. Пока команда
выполняется, новый сброс ждёт её исхода.

Для живого владельца используйте проверенный standalone и UUID операции.

```text
node tools/standalone-installer.js start-over-plan --expected-distribution-hash DIST_SHA --expected-current-package-hash CURRENT_SHA --installation ABS_DESCRIPTOR --operation UUID
node tools/standalone-installer.js start-over-request --expected-distribution-hash DIST_SHA --expected-current-package-hash CURRENT_SHA --installation ABS_DESCRIPTOR --operation UUID --confirm-plan-hash PLAN_SHA
```

После сверки плана подтвердите его SHA во второй команде. При потере ответа
сверьте `core_status` или `start-over-inspect` с UUID сброса, если он известен.
Поддерживаемый путь для остановленного владельца и продолжения прежнего
intent описан в [инструкции Core4](../core4/README.md#начало-сброса-через-cli).

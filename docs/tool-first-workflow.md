# Core: Tool-First workflow

Core предоставляет typed MCP инструменты для детерминированной подготовки и проверяемого исполнения AE-планов. Эта инструкция описывает опубликованный контракт; она не является разрешением на live-действие и не подтверждает workflow acceptance.

## План и proposal

1. Получи точный контракт выбранного builder через `get_plan_builder_contract(solutionId)`. Не угадывай inputs и не ищи recipe: Core не публикует `search_solutions`, `get_solution` или candidate tools.
2. Построй план через `build_solution_plan(solutionId, inputs)` по schema и inspected evidence из контракта. Поддерживаемый перечень задаёт сервер; неизвестный ID должен быть отклонён.
3. Создай server-owned proposal через `propose_ai_agent_plan`. Пользуйся возвращёнными pins и refs; не конструируй их самостоятельно.
4. `validate_ai_agent_plan` проверяет план, но не заменяет dry-run. Проведи proposal-backed dry-run через `run_ai_agent_plan` с текущими данными proposal и `dryRun: true`.
5. Исполняй только после актуальной проверки результата и всех применимых runtime gates, отдельного защищённого подтверждения для соответствующего риска и свежего read-back. Сессия Codex, dry-run или файловый доступ сами по себе не предоставляют authority.

## Проверка исхода

После известного результата прочти изменённые цели подходящими read tools, например `get_project_info`, `get_comp_details`, `get_layer_details` или `get_layer_essential_properties`. `get_plan_run_evidence` читает сохранённый evidence и не заменяет свежий AE read-back. Для визуального результата получи кадр через `save_comp_frame_png` и действительно просмотри изображение, если визуальная проверка требуется поручением.

При timeout или неизвестном submit сначала сверь proposal/run state и фактический read-back. Не повторяй потенциально завершённую мутацию вслепую. Объём проверки указывай точно: опубликованный tool, offline smoke, live read и визуальная приёмка — разные факты.

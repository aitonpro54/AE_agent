## Legacy AE Agent

В `C:/Users/Ant/Documents/Codex/AE_agent` scoped реализация, отладка и содержательная
техническая валидация идут Sol 6.1/high (`ae_implementer`); сложные взаимодействия
компонентов, safety/security/authority и устойчивые дефекты — Sol/xhigh. Flash
configured High разрешён для ограниченных правок с ясной приёмкой в категориях
с подтверждённой пользой; повторное разрешение на такой scope не требуется.
UI/CLI выбор модели и effort свободен. Обычная архитектура и системные границы идут
Sol 6.1/xhigh (`ae_architect`); особо сложные решения или содержательная эскалация
после XHigh — Sol 6.1/ultra (`ae_architect_ultra`). Astra — только после содержательной
неудачи Sol/ultra. При делегировании Flash исполнитель —
`gemini-3.8-flash-high` с `--effort high`. Используй самостоятельный
`C:/Users/Ant/Documents/Codex/agy-bridge/scripts/agy_bridge.py` с явным
`--config C:/Users/Ant/Documents/Codex/AE_agent/config/agy-bridge.json`
перед командой run/status и `profile: "ae-agent"` в задаче.
Общий код/тесты правь в проекте agy-bridge, не в VideoScout.
Контракт и команды: `C:/Users/Ant/Documents/Codex/AE_agent/docs/model-routing.md`.
Передавай всю задачу, исходный запрос без потерь (для длинного текста — точный файл),
ограничения, приёмку и область записи. Не заставляй исполнителя возвращаться после
каждой команды. Результат принимается по артефактам, diff и независимым проверкам.
В текущей task schema исходный текст обязателен в `original_request`; отдельного
поля `original_request_file` нет. Точные файлы указывай в `material_refs` или
`required_inputs`. Команды, которые должен выполнять Flash, перечисляй по одной
в `required_commands`: project grants разрешают доступ, а пакет — этот запуск;
пустой список запрещает терминал. Поля сверяй по актуальному контракту моста.
Финальный ответ Flash — один JSON по result schema, без Markdown-обёртки.
Проверяй transport/task status, `terminal_result_valid`, `schema_valid` и
`artifact_verification`; различай их с фактическими мутациями, технической
проверкой и визуальной приёмкой. `unknown` сохраняется до сверки.
Для монтажа готовых плейсхолдеров используй проектный `docs/montage-workflow.md`:
крупные самостоятельные блоки, единый manifest и пакет кадров по сценам.
Только явный conversation ID завершённого хода; после timeout сначала status/read-back.
Никаких paid API, смены auth, global permission bypass или дочерних координаторов.
MCP Antigravity отдельный: его наличие и права проверяй, не предполагая наследование.
AE typed/search_solutions → get_solution → plan/dry-run/gates/read-back сохраняются.
При неудаче Flash сначала сверить завершение процесса и эффекты; затем допустим
Sol/high в том же scope. Не ждать двух попыток при ясном safety/system blocker.
Нерешённая инженерная сложность Sol/high и обычная системная граница — XHigh;
особо сложная архитектура или содержательно нерешённая задача XHigh — Ultra.
Auth/quota/network/permissions диагностировать отдельно, отказ не обходить.
При недостатке прав останови только зависимую операцию и верни точный blocker.

## AE Agent Core

Core `.gemini/config/mcp_config.json` MCP registration и `agy-bridge` executor profile — разные настройки. MCP server `after-effects` пока связан с legacy path и может переключиться на Core только при отдельном разрешении cutover. Executor profile `ae-agent` остаётся в `AE_agent/config/agy-bridge.json`; Core profile не provisioned. Не переиспользуй его молча и не создавай hidden fallback. Следуй [Core model-routing](C:/Users/Ant/Documents/Codex/AE_Agent_Core/docs/model-routing.md).

# Навыки AE и контракт Antigravity

Проверено 2 октября 2026 года в рамках оптимизации монтажа. Сверены локальные
`ae-task-routing`, `ae-mcp-bridge-workflow`, `ae-safe-project-automation` и AE
reference навыка `antigravity-cli` с AGENTS, task schema и реализацией agy-bridge.

| Навык | Закреплённое уточнение |
|---|---|
| antigravity-cli / references/ae-agent.md | Поддержанный `original_request`, точные material_refs/required_inputs/required_commands, один финальный JSON и поля валидности завершения |
| ae-task-routing | Крупные самостоятельные блоки по рабочему контракту; убраны дублирующие исторические сведения о версиях/окнах, подробности читаются по необходимости |
| ae-mcp-bridge-workflow | Offline scope отделён от подключения AE; верный responseView и различие записанного evidence со свежим read-back |
| ae-safe-project-automation | Повторная проверка изменённой цели и использующих её сцен, обновление baseline при unknown/ручной правке |

Маршрут моделей, два вспомогательных исполнителя, один writer/controller,
confirmation/checkpoint и запрет слепого replay сохранены. Переключение ответа в
summary применяется только при поддержке runtime. Проверки skills не подтверждают
качество монтажа или live availability.

Task schema общего моста требует `original_request` и не принимает
`original_request_file`. Ссылка на файл не заменяет обязательного исходного текста.
Project grants и `required_commands` решают разные задачи; оба проверяются до
запуска. Final transport/task status, `terminal_result_valid`, `schema_valid` и
`artifact_verification` отделены от фактического выполнения и визуальной приёмки.

Полный контракт пакетирования и приёмки: [montage-workflow.md](montage-workflow.md).
Правки установлены только в пользовательские AE skills под `.codex/skills`;
plugin cache, системные навыки, роли моделей и общий agy-bridge не изменялись.
Резервные копии и хеши до/после сохранены в ignored runtime текущей задачи.

Frontmatter трёх изменённых SKILL.md остался идентичен исходному; supported fields
и ссылки проверены отдельно. Официальный `quick_validate.py` недоступен: PyYAML
отсутствует в локальном и bundled Python. Зависимости ради этой проверки не
устанавливались; этот результат не обозначен как успешный полный YAML-validator.

В проект Antigravity добавлены восемь точных offline check commands и один
read-only MCP grant `after-effects/get_plan_run_evidence`: итог 230 rules.
Другие поля project JSON сравнены с резервными копиями и сохранены; wildcard,
глобальные права и auth не менялись. Новые команды будущих задач разрешаются
отдельно по точному scope. Summary и адресное evidence используют прежние gates.

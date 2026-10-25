# Выбор модели и маршрутизация исполнителей

Пользователь выбирает модель и effort в Codex; явный выбор имеет приоритет. Core не задаёт default для чата, не переопределяет его model/effort и не ограничивает селектор. Если пользователь не выбрал исполнителя для самостоятельного блока, применяй рекомендации по scope:

| Scope | Рекомендуемый исполнитель |
|---|---|
| Статус или один короткий готовый вызов | Диспетчер |
| Простое самостоятельное чтение, извлечение фактов или правка по образцу | Luna/high: `ae_scout` для чтения, `ae_operator` для правки |
| Scoped реализация, отладка, содержательная техническая проверка | Sol 6.1/high: `ae_implementer` |
| Сложные взаимодействия, safety/security/authority, устойчивый дефект | Sol 6.1/xhigh: `ae_specialist` |
| Архитектура, системные границы, сложное планирование | Sol 6.1/xhigh: `ae_architect` |
| Особо сложная архитектура или содержательная эскалация после XHigh | Sol 6.1/ultra: `ae_architect_ultra` |
| Независимое ограниченное review | Sol 6.1/high: `ae_reviewer` |
| Сложная задача после содержательной неудачи Ultra | Astra/high: `ae_escalation` |
| Ограниченная правка в категории с подтверждённой пользой | Flash 3.8/configured High через `agy-bridge`, если доступен нужный executor profile |

Таблица маршрутизирует исполнителей, когда пользователь не задал другого; она не переключает модель текущего чата. Named-role настройки — recommendation/runtime setup, не доказательство доступности роли в текущем клиенте. Effective model/effort утверждай только по runtime metadata.

Antigravity имеет два отдельных пути. Пользовательская `.gemini/config/mcp_config.json` уже регистрирует MCP server `after-effects` со старым source path; подготовленные Core paths можно адресно опубликовать только в отдельно разрешённом cutover. Отдельно `AE_agent/config/agy-bridge.json` содержит executor profile `ae-agent`; этот source-bound профиль не provisioned в Core и не применяется здесь автоматически. Не переиспользуй его молча, не создавай скрытый fallback и не меняй пользовательские конфиги вне cutover.

Для legacy `AE_agent` остаются его [проектные routing details](../../AE_agent/docs/model-routing.md) и scoped skills. Этот Core документ не обещает performance, live availability или экономию.

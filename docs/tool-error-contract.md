# Структурированные ошибки и следующее наблюдение

Внешние ответы `/tools/call` и `/mcp/tools/call` добавляют один JSON text-блок
`ae-agent-tool-guidance.v1` после прежнего `content[0]`, когда инструмент сообщил
ошибку. Дополнение также есть у блокирующего `timedOut:true` инструментов
`wait_for_bridge_state`, `wait_for_plan_state` и у `status:incomplete|unknown`
инструмента `reconcile_plan_run`. В этих наблюдениях `error:null`: истечение
ожидания не доказывает ошибку исполнения. Прежние `isError`, `ok`, `error`,
`repairDirective`, outcome, stored records и full/summary не меняются.

```json
{
  "schema": "ae-agent-tool-guidance.v1",
  "error": { "code": "command_timeout", "message": "Unknown execution outcome", "phase": "tool_boundary" },
  "identity": { "runId": "12345678-1234-1234-1234-123456789abc" },
  "nextAction": { "kind": "tool", "tool": "reconcile_plan_run", "arguments": { "runId": "12345678-1234-1234-1234-123456789abc" }, "reasonCode": "reconcile_exact_run" },
  "automaticReplayAllowed": false
}
```

`identity` содержит только подтверждённые поля из документированных мест
server response: requestId/actionId/commandId, run UUID, instanceId,
proposalRevision, payloadHash, planSha256. Поля отсутствуют, если доказательства
нет. Конфликт, недопустимый идентификатор или отсутствующая запись дают stop.
Client arguments не источник идентичности. `executionId` остаётся отдельным
диагностическим полем HTTP-ошибки и никогда не становится runId. Run UUID берётся
из `run_ai_agent_plan.id` или документированного `runId` reconciliation/evidence;
`current.lastRun` и `wait.lastRun` не заменяют исторический запуск.

Подсказка не вызывает инструмент. Она содержит только доступный в текущем
`exposedTools` read-only инструмент с аргументами, соответствующими его схеме:

- Точный run UUID и подключённая панель: `reconcile_plan_run({runId})`.
- Running proposal и все подтверждённые observer pins:
  `wait_for_plan_state({actionId,instanceId,revision,waitMs:1000})`.
- Superseded/expired proposal или неполные pins: `get_current_ai_agent_plan({})`.
  Это инспекция текущего proposal, а не новое доказательство старого run.
- Отключённая панель при работающем daemon:
  `wait_for_bridge_state({targetState:'connected_and_idle',waitMs:1000})`.
- Незавершённая reconciliation с доступной записью:
  `get_plan_run_evidence({runId,limitChars:6000})`, reason
  `inspect_historical_run_evidence`. Это исторические данные; они не подтверждают
  нынешнее состояние AE. Неполная reconciliation не запускает цикл новых native reads.

Проверка аргументов использует ограниченный поднабор JSON Schema: object root,
`properties`, `required`, `additionalProperties`, простые string/integer/number
типы, enum и numeric minimum/maximum. Для строк также проверяются Unicode
code-point `minLength`/`maxLength` и `pattern`. Неизвестное ограничение на root
или используемом свойстве, неподдерживаемый тип либо некорректный pattern дают
stop; helper не пытается оценивать частично понятую схему. Описание и title
игнорируются как аннотации. Декоратор распознаёт уже добавленную guidance только
как отдельный последующий text-блок с валидным JSON и верхнеуровневой схемой;
схема внутри исходного payload не подавляет добавление.

Missing/corrupt records, неоднозначная identity, manual confirmation/auth/session
gates и недоступный daemon дают `{kind:'stop',reasonCode:...}`. Изменившийся или
отсутствующий контракт следующего инструмента тоже даёт stop. Eligible
`repairDirective` не предоставляет authority. Unknown outcome остаётся unknown;
guidance не утверждает `not_applied` и не разрешает replay, restart или мутацию.

HTTP failures daemon могут содержать поле `guidance`. Адаптер при отклонённом HTTP
вызове сохраняет ограниченный diagnostic и requestId/actionId/executionId/commandId,
удаляя raw previews, произвольные вложения и authority. Его fallback консервативно
даёт stop: отклонённый HTTP ответ не доказывает актуальный каталог recovery tools.
Transport failure не использует прежний `tools/list`. Прежний первый блок
HTTP-ошибки дополняется этими allowlisted proof-полями; успешный daemon result
адаптер передаёт без изменений. Local analytics errors получают stop без AE-запроса.

Helper чистый, не изменяет входные объекты, не читает записи и не делает I/O.
Диагностические строки ограничены и редактируются существующим M100 redactor
с дополнительным удалением `AE_BRIDGE_PANEL_TOKEN`/`AE_BRIDGE_TOKEN` и именованных
secrets/tokens из сообщения ошибки или diagnostic. Только первый payload
размером до 2 Mi UTF-16 символов разбирается для guidance; больший ответ сохраняется
дословно и получает консервативный stop без извлечения identity. Это граница
представления, без миграции `structuredContent` или `outputSchema`.
Helper входит в существующий named-module набор `runtimeIdentity`; изменение
только этого файла изменяет composite sourceSha256. Проверка копирует этот набор
в отдельный временный каталог и проверяет drift, не меняя рабочие файлы.

Offline проверки: `node scripts/tool-error-response-smoke.js` и
`node scripts/tool-error-response-integration-smoke.js`. Вторая запускает stdio
адаптер с `AE_DAEMON_AUTO_START=0` и отдельный fake HTTP endpoint на ephemeral port.
Импортированный production daemon не стартует; AE/CEP/provider вызовов нет.
Эти проверки подтверждают pure и wire контракт, а не live connectivity,
reconciliation или визуальную приёмку.

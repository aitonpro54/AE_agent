---
name: ae-mcp-bridge-workflow
description: "Диагностика AE MCP/bridge/CEP и выполнение проверяемых typed plans с повторным использованием решений. Не применять как повод для live demo, полного acceptance или смены модели."
---

# AE MCP Bridge: подключение и выполнение

## Scope

Установи задачу и применимый AGENTS.md. Не превращай простой ремонт панели в
новый acceptance milestone и не требуй повторного разрешения на уже порученные
действия того же scope. Поручение не отключает технические grants и подтверждения.
Загрузка скилла не переключает модель и не запускает child. При полезной делегации
применяй ae-task-routing; если он не установлен, работай последовательно, не
восстанавливай старую таблицу маршрутизации из памяти.

## Подключение

Этот раздел относится к работе с живым AE. Offline-разработка контракта и чтение
сохранённого evidence не требуют подключения панели или пробной мутации.

1. Проверь get_bridge_status: panelConnected, pending/inflight, activeEditSession,
   autonomousSession. HTTP health сам по себе не доказывает связь с AE.
2. При ошибке сверь repo, установленную CEP-копию и runtime. Проверь действующий
   контракт, а не только номер продукта. В дампе описаны отдельные credentials
   AE_BRIDGE_TOKEN (automation/MCP) и AE_BRIDGE_PANEL_TOKEN (CEP). Применяй эти имена
   только если они подтверждаются текущей реализацией/конфигурацией. Не выводи значения.
3. При 401 проверь роли credentials, не отключай auth/Origin/Host gates.
   Изменение файла окружения не доказывает обновление работающего процесса.
   До restart/reload установи судьбу pending/inflight; не теряй незавершённую запись.
4. После scoped исправления проверь Connected и настоящий get_project_info.
   Reload/reconnect проверяй, если затронут жизненный цикл подключения. Providers,
   CodeBurn и Ollama не запускай ради проверки bridge.

## AE-операция

Для legacy `AE_agent` действуют `search_solutions` → `get_solution` и legacy registry contract. В Core recipe discovery отсутствует: прочти точный `get_plan_builder_contract(solutionId)`, затем используй `build_solution_plan` → server-owned `propose_ai_agent_plan` → dry-run и текущие gates. Не требуй recipe поиска для Core.
Для чистой правки HTML без работы с AE registry поиск не нужен. Инспектируй точные цели,
переиспользуй актуальные результаты в рамках операции. Active comp — контекст,
а не замена явно заданной цели. После внешних/ручных изменений baseline обновляется.

При поддержке текущим контрактом используй build_solution_plan →
propose_ai_agent_plan → dry-run → разрешённое исполнение. desiredEnabled не равен
действующему grant: нужны доверенная панель, готовность подключения и актуальный
проверенный proposal. Для описанного в дампе autonomous flow MCP исполняет только
server-proposed typed mutating plan; direct/raw/destructive/save не получают
автоматического разрешения. Фактические capabilities сверяй с текущим сервером,
не ослабляй gate под видом перехода между версиями.

При настоящем typed gap используй лишь разрешённый protected raw flow. Отказ не
обходится HTTP/CDP/UI/JSX/dev-admin. После mutation проверь изменённые цели read-back.
Unknown/timeout после submit требует выяснения исхода, а не повторной mutation.
Checkpoint сохранённого файла не равен защите несохранённого состояния AE.

Для placeholder read-back используй `get_layer_details(responseView:"placeholder")`;
ключи и точные свойства читай адресно через `get_property_value`. Если runtime
поддерживает `run_ai_agent_plan(responseView:"summary")`, полная серверная
верификация остаётся обязательной. `get_plan_run_evidence` читает записанный
результат, не обновляет состояние AE и не заменяет свежий preflight/read-back.
Монтажные блоки и покрытие кадров — в проектном `docs/montage-workflow.md`.

Только в legacy `AE_agent`, и только если его текущий tool contract содержит candidate tools, после protected raw проверь соответствующий candidate receipt. Core не публикует candidate/promotion tools; не ищи и не предлагай recipe promotion в Core.

## Доказательства

Разделяй offline/VM, fake UI, live read-only, live mutation и save/reopen.
Укажи точные проверки, результат и непроверенные части. Один smoke не равен полной
приёмке. references/bridge-patterns.md — существующее локальное дополнение, которого
нет в дампе; используй при наличии и релевантности, не выдумывай его содержание.

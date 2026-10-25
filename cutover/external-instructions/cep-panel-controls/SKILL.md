---
name: cep-panel-controls
description: "Adobe CEP HTML/JS-панели: DOM controls, state/handlers, polling/reload, установленная копия и scoped validation. Для AE Agent — разделение panel/automation credentials по текущему контракту."
---

# CEP-панель: интерфейс и подключение

## Диагностика

Прочти относящиеся к сбою HTML/JS/CSS и состояние установленной панели. Manifest
нужен при host/extension identity, загрузке или другой соответствующей проблеме.
Разделяй DOM, JS exception, сеть, авторизацию и несовместимость contract. Сравни
repo и установленный файл: правка source не доказывает обновление CEP.

Для AE Agent при HTTP 401 проверь роли credentials по текущей реализации. В дампе
это AE_BRIDGE_TOKEN для MCP и AE_BRIDGE_PANEL_TOKEN для CEP. Сверь обе стороны и
версию contract, не выводя секретов. Не отключай auth/Origin/Host gates. Перед
restart/reload выясни pending/inflight; reload панели не доказывает, что daemon
или adapter перечитал окружение.

## Изменение

Переиспользуй DOM IDs, layout tokens, handlers и state storage. Сверяй синтаксис
с фактическим CEP runtime/существующей сборкой; не заменяй весь проект на ES5 по
одному общему правилу. У control проверь нужные loading/error/disabled состояния
и listener. Для polling/reload учитывай in-flight callbacks, generation и single
active command; не теряй submitted result и не повторяй mutation после reload.

Модели/делегация — ae-task-routing. Не создавай child для одного очевидного
control. UI может иметь единственного контроллера; review по snapshots не
означает разрешения второму агенту нажимать кнопки в той же панели.

## Установка и проверка

Для legacy `AE_agent` штатный reload панели используй `node scripts/cep-panel-cdp-smoke.js reload`
с `CEP_PANEL_ENSURE_DAEMON=0` и порядок из [legacy Tool-First](C:/Users/Ant/Documents/Codex/AE_agent/docs/tool-first-workflow.md#штатная-диагностика-и-reload-cep)
(`Штатная диагностика и reload CEP`); не выбирай Computer Use до проверки этого пути. Для Core следуй [Core Tool-First](C:/Users/Ant/Documents/Codex/AE_Agent_Core/docs/tool-first-workflow.md) и не предполагай наличие legacy CDP helper.

1. Для изменённых обычных JS — node --check, для manifest — XML validation;
   git diff --check и относящиеся repository tests. JSX/JSXINC проверяются своим
   способом, не объявляй общий Node parse доказательством поддержки AE API.
2. При порученном обновлении установленной панели сохрани backup и замени только
   нужные файлы. Сверь SHA-256 и проверь reload/действие, не запускай broad installer
   или registry changes ради одного файла.
3. Для connectivity нужны Connected и настоящий typed read из AE. Fake UI smoke
   не подтверждает сеть/evalScript. Для внешнего вида проверь фактический UI.
4. Сохрани preferences, верни временные fake overrides и сообщи отдельно live,
   offline и оставшиеся ограничения. Не расширяй разрешения ради проверки.

references/control-patterns.md не включён в дамп; существующий локальный файл
сохраняется и используется только когда нужен для конкретного пути.

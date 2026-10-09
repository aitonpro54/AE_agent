# Штатное открытие панели AE Agent

`ensure_ae_agent_panel` — typed MCP-инструмент для фиксированной установленной
CEP-панели `com.codex.aemcpbridge.panel`, bundle `com.codex.aemcpbridge`, menu
`AE Agent 3.3.1`. Единственный аргумент — `timeoutMs` (целое 1–30000, default
30000). Например:

```json
{"name":"ensure_ae_agent_panel","arguments":{"timeoutMs":30000}}
```

Инструмент требует automation credential и marker официального MCP adapter.
`/tools/call`, dev routes и шаги произвольного плана не дают ему полномочий.
M100 `read_only` здесь относится к содержимому проекта; annotation
`readOnlyHint:false` честно отмечает открытие/активацию или reload UI панели.
Direct/raw/destructive/save gates остаются прежними. Инструмент не выполняет
restart daemon и не меняет credentials, preferences, проекты или render queue.

## Порядок и доказательства

1. Свежий статус должен доказать пустые pending/inflight и отсутствие
   незавершённого project lifecycle/confirmed или executing proposal. Активная
   ручная edit session сама по себе reload не запрещает и сохраняется.
2. При `panelConnected=true` инструмент выполняет обычный typed
   `get_project_info` через очередь bridge, без native запуска, CDP или reload.
   Проверяются настоящий payload и сохранение panel connection/generation.
3. При отсутствии связи Windows CIM должен найти ровно один `AfterFX.exe`
   с executable, PID и временем создания. Отсутствующий AE не запускается.
   Второй процесс, в том числе `-m` с нулевым main window handle, блокирует
   bootstrap. Focus/окно не используются для выбора.
4. В известных Adobe CEP extension roots ищется единственный panel ID и
   единственный владелец точного menu title. Manifest должен совпадать с
   текущей repo-копией, включая AEFT/version/main path; сверяются SHA-256
   manifest, index, panel.js, style.css и CSInterface.js. Redirected roots,
   устаревшая копия и известная одноимённая ScriptUI-панель блокируют запуск.
5. Если доступна единственная CDP page именно установленного `index.html`
   и WebSocket `127.0.0.1:8870/devtools/page/...`, выполняется только
   `Page.reload`. Другие страницы/неоднозначность не подменяют цель. Поля UI,
   API keys, helper stdout и provider settings не читаются.
6. При отсутствии такой страницы запускается **обнаруженный** executable
   с `-r <private service.jsx>`, `windowsHide:true`, без `-m` и shell. Перед
   отправкой заново сверяются единственность PID/creation/executable,
   установленная копия и idle; native service делает только exact menu lookup
   и `executeCommand` этого результата. Клиент не задаёт пути, JSX, title,
   command ID или executable.
7. Успех требует свежего `panelConnected=true` и обычного native typed
   `get_project_info`; CLI spawn/exit, ack и HTTP health не являются успехом.
   Ответ: `already_connected`, `opened`, `reconnected` либо `failure`, с
   stage/reason, target/process/command/read pins в evidence.

Во время bootstrap admission очередь не принимает чужие AE-команды; единственное
исключение — внутренний обычный project read этого сервиса. Это закрывает race
между idle-проверкой и reload, без расширения client authority.

## Поддержка Adobe и оставшаяся граница

[Adobe Scripts](https://helpx.adobe.com/after-effects/desktop/automate-in-after-effects/automate-animation/scripts.html)
описывает `AfterFX.exe -r` для исполнения скрипта в уже запущенном приложении.
[Текущий Adobe Application API](https://developer.adobe.com/after-effects/uxp/after-effects-api/application)
документирует `findMenuCommandId`/`executeCommand` в UXP; это **не доказательство**
их поддержки в ExtendScript конкретной версии AE. Служебный JSX проверяет
фактические методы, затем ненулевой integer ID точного установленного menu.
При `unsupported_api`/`command_unavailable` скрытого fallback нет.

Menu lookup не принимает extension ID. Проверка установленных владельцев title,
ScriptUI collision и manifest/assets уменьшает риск неверной команды, но ненулевой
ID сам по себе не доказывает binding extension ID. CLI не имеет PID-targeting;
повторная проверка прямо перед spawn не математически исключает exit/start race
после проверки. Это условный native путь, который требует фактической live-проверки
lookup/open/connect/read в текущем AE. `app.openExtension`/`launchExtension` не
предполагаются; CEP `requestOpenExtension` требует уже работающий trusted CEP
context и не решает собственный закрытый bootstrap.

Для root capability validation доступен private generator
`generateBootstrapJsx({requestId,deadline,ackPath,probeOnly:true})`: он проверяет
только фиксированные API/title и пишет `capability_available`/failure ack;
`executeCommand` отсутствует. Это внутренний export для VM/ограниченного
проверяющего, без нового public MCP аргумента или универсального executor.

## Timeout и reconciliation

В существующем state/log root хранится `ae-agent-panel-bootstrap/attempt.json`,
private UUID JSX и ack. Запись `submitted_unknown` сохраняется **до** отправки;
service lock и admission сериализуют вызовы. Server restart не стирает попытку.
JSX проверяет deadline при входе и непосредственно перед `executeCommand`,
пишет `executing` до команды и `executed` после. Повтор того же JSX при уже
существующем ack ничего не выполняет. Outer catch исключает unhandled script
exception/диалог при ошибке service; невозможность записать initial ack
останавливает скрипт до `executeCommand`, оставляя caller unknown для сверки.

Timeout/CLI error/незавершённый ack не разрешает native/reload replay. Следующий
вызов читает ту же запись и ack; отсутствие panel connection возвращает
`bootstrap_submitted_unknown`. Terminal `expired`/unsupported/lookup failure
доказывают, что команда не была выполнена. Подключённая панель после deadline
может быть сверена обычным typed read без повторного UI действия. `get_bridge_status`
показывает compact `panelBootstrap` evidence; runtime outputs локальные и ignored.

Перед typed read сохраняется `project_read_unknown` и queue command ID,
executionId/expiry. Timeout/невалидный результат/смена connection не вызывает
ещё один read или UI replay; сохранённая запись блокирует повтор, в том числе
после restart. Доказанный `before_delivery` rejection отмечается отдельно как
`project_read_not_delivered` и допускает новый обычный read. Budget проверяется
до unknown-записи, поэтому deadline без отправки не создаёт ложный unknown.
Нужна сверка exact command по inflight/retained result и native
read-back в отдельном ограниченном восстановлении; универсального reset tool
нет. Удалять durable unknown запись для слепого retry нельзя.

## Проверки

`node scripts/ae-agent-panel-bootstrap-smoke.js` — bounded offline/VM и настоящий
stdio MCP adapter с изолированным daemon/fake CEP. Он не запускает live AE/CDP,
providers, installed writes или Full Intaker. Live acceptance выполняется
отдельно единственным контроллером: каталог, already-connected read, exact
capability probe, контролируемое открытие закрытой панели и новый project read.
Состояние offline реализации и live evidence отмечается в основном плане.

## Live-проверка 6 октября 2026

В production-подключении штатный stdio `tools/list` вернул 173 tools, включая
`ensure_ae_agent_panel` только с `timeoutMs`. Проверка connected path вернула
реальный typed `get_project_info`: `Bylina_SMPushka.aep`, 427 items, revision
12867128. Отдельный private capability probe подтвердил доступность native
lookup без `executeCommand`; его наблюдавшийся command ID 5039 — evidence этого
запуска, не фиксированная часть контракта. Первый probe без ack сохранил
неизвестный исход и не повторялся.

После закрытия только этой CEP extension через native Adobe API статус панели
стал disconnected; очереди и waiting panels были пусты. Штатный вызов
`ensure_ae_agent_panel` открыл панель, подтвердил connected и выполнил обычный
typed project read с теми же file/items/revision. Отдельный read-back и
последующий `already_connected` использовали тот же bootstrap request/CLI без
нового native действия или reload. Проект не изменялся; save/reopen/render и
Computer Use не выполнялись. Эта проверка подтвердила capability и native
close/open/connect/read фиксированной панели в данном AE runtime. Она не
устанавливает универсальную стабильную привязку menu command ID к extension
между версиями/runtime: API разрешает команду по title, а не по extension ID.
Также остаются CLI exit/start TOCTOU и отдельная live-проверка повторного
подключения уже существующей CDP page; этот путь покрыт offline.

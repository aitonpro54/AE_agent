# MCP текущего чата и фоновое переподключение Core

12 ноября 2026. Поручение: обновить MCP именно в этом чате, убрать ручное
восстановление панели, проверить в live AE и сделать отдельный коммит.
База — `314502d`; установленный desktop package `950d180c…`, Core 4.2.6,
`operator-render-jobs/owner`.

## Progress

- **Итог после полного перезапуска Codex пользователем: обязательный MCP proof
  текущего чата PASS.** Прямой namespace подтвердил package `75a95aa5…`,
  `file://`, panel `2754542e…` и registry ready. Acquire → connect → одна
  fresh `project-inspection` → release завершены. Observation
  `03e5b86d-bed8-4b1d-bbaf-487207c53122`, command
  `inspect-d2872d0c-cf8a-4ea8-a4ea-7d769be0e271`; own project comp 1,
  revision 72, dirty=false. Final holder=null, pending/UNKNOWN/fault отсутствуют.
  Новый app-server 30808/client 46604 загрузил текущий release; AE 39220 и
  owner 31260/boot `e7ca4384…` остались прежними. Ниже сохранены предыдущие
  checkpoints до пользовательского restart; их открытый статус больше не итог.

- Начальная проверка встроенного `core_status` этого чата по-прежнему даёт
  `owner_unavailable`. Работа свежего отдельного CLI-клиента из прошлого этапа
  не считается доказательством обновления этого чата.
- Контракт зафиксирован XHigh `ae_specialist`; scoped реализацию и адресную
  валидацию выполнил Sol High `ae_implementer`. Независимый Sol High review
  принял итоговые bytes без открытых P1/P2. Найденный при review случай
  transport loss → новый небезопасный boot исправлен до упаковки.
- 220 адресных тестов PASS; syntax и `git diff --check` PASS. Две сборки
  совпали: package `75a95aa5…`, distribution `73543e6e…`, panel `2754542e…`.
  Версия 4.2.6 и registry `f58832f9…` сохранены. TEMP foreign-CWD dry-run
  прошёл без production writes. Точные pins/commands — в source evidence.
- Единственный live-контроллер передан `ae_implementer` для fresh preflight,
  штатного initial update и проверки owner restart. Root в это время
  занимается только маршрутом MCP активного чата и документацией.
- Initial stop `da32f172-c71e-49d5-984b-c606dbc78fec`, update
  `a0665061-fa1b-43bf-aaae-cc45e6044063` и enable завершены штатно, по одной
  попытке. Установлен `75a95aa5…`, owner 18248/boot `31b140d7…`. Эти IDs
  settled, не повторять. Старая панель не восстановилась за фактические 76.7 с;
  очередь/UNKNOWN/fault пусты, lease не приобретался, клиент завершился.
- Root отдельно закрыл старую панель и открыл установленную через штатное
  меню AE. Новый UI показал готовый канал; это initial activation, не результат
  background acceptance. AE не перезапускался, проект не изменялся.
  Native `@oai/sky` не документирует teardown: UI-вызовы прекращены, отключение
  интеграции не заявляется. После завершения UI sole control снова передан
  `ae_implementer` только для baseline и owner-restart proof без UI.
- Official OpenAI app-server docs описывают `config/mcpServer/reload` и
  thread-bound `mcpServerStatus/list`; применимость к реально запущенной сборке
  подтверждена по generated schema. Однако активный desktop app-server
  использует stdio; доступного control socket или app tool для вызова reload
  не найдено. Новый app-server не заменяет активный. Дополнительный независимый
  static review MSIX 26.1106.6628.0 не нашёл внешнего deep-link/command route:
  restart существует только во внутреннем renderer IPC, а apply-config
  обновляет remote/project settings. Эти маршруты не вызывались.
- Inventory Computer Use подтвердил, что окно текущего приложения имеет
  displayName/title `ChatGPT` (AppID `OpenAI.Codex_2p2nqsd0c76g0!App`).
  [Bundled Computer Use SKILL.md](C:/Users/Ant/.codex/plugins/cache/openai-bundled/computer-use/26.1106.51428/skills/computer-use/SKILL.md)
  требует соблюдать [guidance.md:241](C:/Users/Ant/.codex/plugins/cache/openai-bundled/computer-use/26.1106.51428/docs/guidance.md:241):
  “Do not automate the ChatGPT desktop app UI”. Действий в этом окне не было.
  UI Restart для текущего MCP не выполнен; успех этой части пока не заявляется.
- После post-initial baseline выполнен реальный background owner restart:
  stop/resume `5d735a2c-a90a-4fbb-8eaa-1f95c49d3bcd`, по одной попытке,
  descriptor/credentials/config/marker сохранены. Новый owner 31260/boot
  `e7ca4384…` принят новой CEP peer/epoch, registry готов до acquire/connect.
  Одна свежая native inspection прошла; lease освобождён, клиент exited 0.
  AE 39220 прежний, own AEP dirty=false. Независимый read-only review исходных
  native/restart receipts не нашёл P1/P2. Финальный preservation aggregate
  подтвердил 828 exact protected files, 80 неизменных non-log preferences,
  prefix 10 logs, четыре пользовательских и собственный AEP, config/identities
  и receiver/ledger prefixes. Последний клиент exited 0, task-клиентов нет.
- Финальный независимый read-only review принял source и bounded desktop
  install/background native proof без открытых P1/P2. Sanitised artifacts
  сверены с private records; [review](../docs/evidence/core-mcp-panel-background-reconnect-20261112/review.json).
- Прямой `core_status` namespace текущего чата после этого результата всё ещё
  возвращает `owner_unavailable`. Это реальный незакрытый пункт, а не повод
  считать отдельный CLI текущим MCP. Запрошено узкое пользовательское исключение
  из CU rule только для штатного Settings → MCP → Restart; ответ ещё ожидается,
  разрешение и выполненный Restart не предполагаются на том checkpoint.
- Пользователь затем явно ответил «Разрешаю только этот Restart». Root выполнил
  только навигацию Settings → search MCP → Plugins → MCP. Проектная запись
  Core и её настройки disabled; Restart на текущем экране отсутствует.
  Config/toggles/restart не менялись, UI-вызовы прекращены. Узкий read-only
  разбор render condition установил: Restart показывается только после UI
  сохранения/enable/uninstall/OAuth (`eO = er.includes(hostId)`); навигация его
  не включает. Project entries намеренно read-only. Restart SSH/WSL и sidebar
  error recovery не являются подтверждённым путём для healthy local host.
  Искусственного изменения глобальных MCP ради этой кнопки не выполнялось.
- Пользователь уточнил, что сам перезапустит Codex целиком; дальнейший поиск
  UI Restart прекращён. На момент передачи old thin client 42676 ещё существовал,
  actual reload не наблюдался. После запуска продолжить в этом же чате: прямой
  namespace `core_status` → проверить package `75a95aa5…`, connected/registryReady
  и свободную healthy lane → acquire по свежему workSession.sessionId → connect
  → свежий contract/project-inspection → release и preservation. Не повторять
  installation IDs, owner-restart proof или source tests. Панельный milestone
  уже зафиксирован отдельным коммитом `5f42f78`; текущий MCP proof остаётся открыт.

## Decision Log

- Последнее уточнение пользователя выбирает полный restart Codex самим
  пользователем. Это закрыло refresh клиента; автоматический reload активного
  Codex этим результатом не заявляется. Root проверил именно MCP текущего чата,
  потому что проверка helper/CLI не заменяет эту границу. Повтор source tests,
  install, owner-restart или AE UI для финального proof не выполнялся.

- Это новый инженерный блок, отдельный от завершённой install/live приёмки.
  Ownership/UNKNOWN/latches, authentication/Origin и project grants сохраняются.
- Реализация и адресная техническая валидация после фиксации контракта — Sol High.
  Другие helpers работают read-only, AE/CEP не управляют.
- Приёмка фонового пути выполняется без CU, кликов, ручного открытия панели,
  повторов UNKNOWN, перезапуска AE или изменения собственного AEP ради связи.
  Если initial cutover старой панели требует отдельного supported перехода,
  он будет явно отделён от повторной проверки нового фонового поведения.
- Не выполнять широкий restart Codex/app-server ради удобства, пока не
  установлен адресный supported путь. Не обновлять инструменты другого чата
  под видом проверки этого. Scope разрешает необходимые штатные reload и
  lifecycle-операции Core после fresh проверки свободной/settled lane.
- Сохранить пользовательские dirty `AGENTS.md` и
  `plans/core-transfer-4.2.5-20261111.md`, четыре AEP, identities/history,
  соседнюю конфигурацию. Frozen исторический MSIX incident rebase не возобновлять.
- Transport retry сохраняет прежний same-boot путь; любой изменившийся boot
  требует same session, ready/no AE exit/no fault. Exact `/poll` 403 допускает
  только отдельную подписанную проверку нового owner. Terminal marker watcher
  читает фиксированный локальный marker и не повторяет отвергнутые auth-запросы.
  Latches/UNKNOWN/in-flight запрещают recovery и reload.
- `stopped-update.prepare()` отвергает обновление на тот же package hash
  (`stopped_update_scope`). Не создавать искусственную source-дельту и не
  обходить этот контракт ради второго live update. Новая marker-watcher ветка
  проверена source/TEMP; initial реальный cutover фиксируется отдельно от
  owner-restart приёмки уже загруженного исправления.
- Не завершать stale thin client ради недоказанного auto-respawn. Узкий
  независимый read-only review не нашёл положительного evidence такого пути;
  немедленный ожидаемый эффект — закрытый transport. App-server, его stdin и
  внутренний IPC не изменять в обход отсутствующего supported endpoint.

## Validation

- [Прямой current-chat MCP proof](../docs/evidence/core-mcp-panel-background-reconnect-20261112/current-chat-mcp.json),
  [сохранность](../docs/evidence/core-mcp-panel-background-reconnect-20261112/current-chat-preservation.json)
  и [процессы](../docs/evidence/core-mcp-panel-background-reconnect-20261112/current-chat-processes.json)
  закрывают обязательный итог этого блока. Fresh native dispatch ровно один;
  release=true, пять AEP и пять Core binding files неизменны, 14 prefixes
  сохранены, receiver 79437 → 82090 (два исходных receipt records), ledger
  140900 неизменён. Пользовательские dirty files сохранены.
- Independent Luna `ae_scout` read-only consistency review: scoped ACCEPT
  direct namespace/native proof и итоговой сохранности. Проверки не повторял.
- Global config после пользовательского полного restart отличается от прежнего
  snapshot: семь ключей notify/command/runtime paths. Root его не изменял и не
  восстанавливал; неизменность всех global bytes через пользовательский restart
  не заявляется. Приватная проверка сохранности сначала исправила ошибочный путь
  к CEP installation.js, затем зафиксировала эту global delta. Нативных повторов
  и production writes не было; завершён только собственный ошибочный read-only
  verifier с проверенными PID/birth/path. Frozen MSIX incident не возобновлялся.

- Обязательный итог: встроенный MCP этого чата подтверждает actual новый
  package/owner и выполняет native inspection с освобождением lease.
- Фоновая live-проверка должна включать реальный owner restart с открытой
  панелью, её authenticated reconnect/registry readiness и новый typed read,
  при прежнем AE/AEP и без UI-восстановления. Изменённую cutover/config границу
  проверить отдельно, если она входит в исправление.
- Source tests назначаются по фактическому diff и инвариантам; прежние 82 keys
  не перезапускаются без изменённой closure. Точные команды, receipts, неудачные
  попытки и source/package pins сохраняются в evidence нового блока.
- До фактических результатов MCP refresh/background PASS не заявляются.
- Фактический background owner-restart PASS ограничен уже активированной
  исправленной панелью. Boot `31b140d7-256c-4b14-8c0f-9b2e3e5d3230` сменился
  на `e7ca4384-f7c2-4a10-9069-3762bc924775`, peer/epoch новые. Native
  `observation-d305af6b-8132-4b94-b699-73c426877dc6` / command
  `inspect-f9ce460a-ebe7-42b6-8450-7c627f543cac` подтвердили собственный AEP,
  comp 1, dirty=false. Lease released; pending/UNKNOWN/store/ledger/ownership
  faults отсутствуют, registryReady=true. См. [live итог](../docs/evidence/core-mcp-panel-background-reconnect-20261112/live/background-result.json).
- CU/ensure/raw JSX/AE restart/project mutation/save в background-блоке — 0.
  До него initial activation потребовала отдельного root CU close/open.
  Без packet capture exact403 против transport ветки в live не различаем;
  обе address-tested offline. Последующий реальный package/marker update в
  live открыт; второй synthetic update не выполнялся.
- До полного restart пользователем MCP чата не был обновлён: два прямых namespace `core_status` дали
  `owner_unavailable`. Source/live panel milestone завершён отдельно; весь
  пользовательский запрос нельзя считать закрытым до прямого configured
  namespace native proof текущего чата после разрешённого refresh.
- Пользовательские dirty `AGENTS.md` и `plans/core-transfer-4.2.5-20261111.md`
  сверены по исходным SHA-256 и не входят в milestone commit. Полный release,
  новая MSI live-приёмка и изменение registry этим блоком не заявляются.

Источники: [OpenAI App Server](https://learn.chatgpt.com/docs/app-server),
[Codex MCP](https://learn.chatgpt.com/docs/extend/mcp?surface=cli),
[предыдущая ограниченная приёмка](core-architecture-install-live-20261112.md).

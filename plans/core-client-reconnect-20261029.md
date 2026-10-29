# Configured MCP: диагностика текущего чата

29 октября 2026. Продолжение [manual install/live](core-manual-install-live-20261029.md),
установка и отдельный native read зафиксированы в `70b340f`. Пользователь прямо
поручил root самому восстановить настроенный клиент, без ручного переключения
MCP пользователем. Root остаётся единственным live/CEP/UI controller Core.

## Progress

- [x] Установленный manual3f9293 и project MCP entry сохранены; повторной
  установки/owner recovery/AE-команды в этом блоке нет.
- [x] CLI `mcp list` из текущего рабочего корня читает Core4 enabled=true.
- [x] UI Settings→Plugins→MCP показывает Core4 включённым; настройки и toggle
  project-owned записи недоступны. Это не подтверждение успешного tool call.
- [x] Native `/` menu→MCP текущего чата показывает global MCP servers, Core4
  отсутствует. Tool inventory текущего чата также его не содержит.
- [x] После открытия другого чата Codex запустил managed PID34608, parent14720,
  exact installed3f92 argv. Новый receiver owner создан14:17:55UTC; journal
  остаётся10events с прежним SHA256. Это наблюдение процесса, не configured read.
- [x] Статически проверены relevant bytes фактически установленного desktop
  app26.1023.6621.0. Выполнена read-only discovery existing app-tools pipe:
 58tools, отдельного MCP reload/request tool нет. Сам pipe не использован для
  неизвестных методов или незаявленных tools.
- [ ] Получить новый configured `core_status` и fresh typed project-inspection.

## Decision Log

- Исходная попытка existing control proxy уже отказала10050 до initialize.
  Её не повторяли; второй app-server/daemon/Core runtime не запускали.
- UI-команда `/mcp`, первоначально вставленная целиком через set_value, была
  воспринята как queued input; собственная запись удалена из очереди до исполнения.
  Рабочий UI-путь подтверждён отдельно: focus composer→type `/`→выбрать MCP.
  Черновики и сообщения пользователя не редактировались и не отправлялись.
- Во время UI-действий обнаружен ручной ввод и переходы пользователя в соседний
  чат. После каждого такого сигнала перепроверялась текущая поверхность.
- Current source `plugins-settings-88cab347d5a5.js`: Restart появляется только
  после UI изменения config/toggle. Его handler отправляет
  `codex-app-server-restart` для host, без thread/server selector.
  Локальный React state P не заполняется внешней правкой project config.
- Current source `.vite/build/src-tOjGKoT3.js`: `restart` вызывает `stopProcess`
  до `ensureReady`; default killCodexProcess=false не означает адресного
  перезапуска одного MCP. Общий restart затрагивает и другие активные чаты.
- `mcpServerStatus/list` current source поддерживает threadId и только читает
  status. `config/mcpServer/reload` существует как общий protocol method;
  доступный текущему root client handle для этого запроса не подтверждён.
  Наличие метода не объявляется доступом или разрешением вызвать его через
  неизвестный transport. Подмены auth, app source или интерфейсов не было.
- Вывод об отсутствии адресного пути ограничен проверенными штатными UI,
  current tool inventory, native app-tools discovery и указанными source bytes.
  Это не заявление о невозможности такой функции во всех версиях Codex.
- Root не перезапускает общий app-server во время активного отдельного чата
  пользователя без уточнения этого расширенного воздействия. Это операционное
  решение по наблюдаемому shared process14720, не новый Argon/release gate.

## Validation

`snapshots/core4-live-proof/XIX-manual-install-live-20261029/app-tools-discovery.json`:
read-only existing pipe discovery, mutations0. Секреты/pipe path не публикуются.
UI snapshots возвращены штатным Windows Computer Use; настоящий managed PID
прочитан через CIM. После этого блока native reads0, mutation/save0.

Официальная документация использована для штатного UI и slash-команд:
[MCP](https://learn.chatgpt.com/docs/extend/mcp?surface=cli),
[Commands](https://learn.chatgpt.com/docs/reference/commands).
Специфичная restart-семантика установлена локальным source, не обобщена по docs.

## Продолжение

Для общего restart сначала согласовать влияние на активный пользовательский
чат, установить судьбу его внешних отправок и повторить Core pending/history
preflight. После restart заново установить ownership, configured discovery и
status; неизвестную команду/отправку не повторять. Проверка текущего чата пока
не завершена; успех отдельного installed stdio остаётся отдельным evidence.

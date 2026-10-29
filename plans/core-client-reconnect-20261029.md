# Configured MCP: диагностика текущего чата

29 октября 2026. Продолжение [manual install/live](core-manual-install-live-20261029.md),
установка и отдельный native read зафиксированы в `70b340f`. Пользователь прямо
поручил root самому восстановить настроенный клиент, без ручного переключения
MCP пользователем. Root остаётся единственным live/CEP/UI controller Core.

## Progress

- [x] Пользователь ответил «делай» на явный вопрос об общем restart app-server
  с остановкой другого активного чата. Это расширение обслуживания разрешено;
  повторного согласования не требуется. Другой чат и Argon уже completed/idle.
- [x] XX preflight: current manual3f92/receiver markers PID34608,
  descriptor/origins/project config unchanged, signed10event journal settled,
  broker ledger absent. Exact PID остановлен один раз через retained native
  handle; оба marker архивированы под standard lease, outcome `retired`.
  Установка и журнал не изменены; runtime/native dispatch0.
- [x] Штатный restart UI подготовлен обратимым off/on Codeburn. Save без
  изменений не активен. Единственная добавленная строка `enabled = true`
  проверена; global config возвращён к точному исходному byte image через CAS.
- [x] Один общий restart штатным UI выполнен: app-server14720 заменён16204,
  parent14360 сохранён. После продолжения текущий чат получил Core4 tools;
  managed installed runtime33164/parent16204 стал единственным owner3457.
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
- [x] Configured `core_status`/discovery/contract доступны в этом чате;
  `inspect_module_target` завершил один real native read через installed CEP.
  AE26.3x87, пустой unsaved project,numItems0, authority/continuity=false.
- [x] Final read-back:12events, прежние10побайтно сохранены; новый begin/complete
  semantically settled. pending=null,unresolved=[],unknown/storeFault=false,
  receiver открыт, owner33164, install/broker gates и broker ledger отсутствуют.

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
- После закрытия старой CEP-панели AE показал `A nullptr was dereferenced`;
  Application Error1000 подтвердил CEPHtmlEngine/libcef crash21:45:39/43local.
  В этот момент native sends0. UI main AE затем не реагировал на меню/закрытие.
  Пользователь отдельно разрешил «Перезапустить AE и завершить проверку».
  Exact AE10856/native birth/path/hash остановлен retained handle без tree kill
  и save; новый AE9672 запущен через штатный UI. Crash Repair не объявлен reset
  preferences/safe mode. Повторный штатный launch вернул окно того же PID9672;
  второй AE не оставлен. Installed CEP открыт после готовности runtime и connected.
- Исторический adopted host PID31452 сохранён; он не является authority AE9672.
  Успешная read-only observation не подтверждает continuity/manual mutation grant.

## Validation

`snapshots/core4-live-proof/XIX-manual-install-live-20261029/app-tools-discovery.json`:
read-only existing pipe discovery, mutations0. Секреты/pipe path не публикуются.
UI snapshots возвращены штатным Windows Computer Use; managed PID прочитан CIM.
В завершённом configured блоке native reads1, project mutation/save0.

XX evidence: `configured-{initial,ready,final}-status.json`, discovery/contract,
`configured-native-submit.json`, `configured-native-result.json`,
`configured-final-readback.json`, `configured-final-census.json`.
Command `inspect-c5486a3b-63bd-433f-99f9-9a399d2db3f6`, observation
`observation-ff045432-ddac-4681-8b5b-d726757ea193`. Native result и begin/complete
совпадают по commandId/store identity. Pure installed verifier проверил release,
CEP и Node; signed-history reader подтвердил settled. Journal SHA256
`39f945b68d67dd8fc5081d896176eaf053aa1c4578cfea83f5ea063f4a2e7d1e`.
Descriptor/origins/project MCP config unchanged. Independent XX review PASS,
18/18 scoped operator tests PASS; исходники Core4 не изменены, full suite не нужен.

Официальная документация использована для штатного UI и slash-команд:
[MCP](https://learn.chatgpt.com/docs/extend/mcp?surface=cli),
[Commands](https://learn.chatgpt.com/docs/reference/commands).
Специфичная restart-семантика установлена локальным source, не обобщена по docs.

## Продолжение

Общий restart разрешён пользователем; соседние задачи completed/idle.
XX:18/18 scoped tests PASS, независимый read-only review PASS. Runtime PID34608
остановлен29.10.2026 16:34:22UTC, markers retired16:34:54UTC; transaction
`stopped-owners-XX-20261029-6f82c4d1` завершена, gates освобождены. Evidence:
`snapshots/core4-live-proof/XX-app-server-restart-20261029/`; maintenance SHA256
`5df5e70f94a39af12d26b325ab995ffdd9756b64a3881edc19b75c27a6342072`.
До следующего старта owners отсутствовали; затем ими штатно владеет33164.
Не повторять stop/retirement/install или завершённую inspection.

Запрошенный configured Codex→MCP→CEP→AE путь подтверждён в текущем чате.
Оставлены работающие configured runtime33164, listener3457 и connected CEP
в AE9672 с пустым unsaved project. Установка и восстановление завершены.
Открытые standalone distribution closure, portability round-trip, manual
mutation/adoption и full release/P1–P8 — отдельный scope, этим read не закрываются.

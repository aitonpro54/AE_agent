# Доводка MSI — повторное подключение CEP

29 октября 2026, baseline `387ab87`. Пользователь поручил продолжить доводку
на MSI и отложить перенос до устойчивой работы здесь. Рабочий корень —
`C:/Users/Ant/Documents/Codex/AE_agent_core`.

## Цель и границы

После быстрого закрытия/открытия панели прежний peer остаётся активным до
45 секунд. Сервер штатно возвращает `duplicate_peer`; прежняя панель прекращает
подключение сразу. Новая панель должна показать ожидание и ограниченно повторить
handshake с новым challenge/proof, затем подключиться или вернуть кнопку.

Только точный отказ `/link` с ожидаемым HTTP status/schema разрешает повтор.
Ошибки auth/Origin/pins/подписи не повторяются. `/poll`, `/complete`, recover,
dispatch и AE-команды автоматически не повторяются. Server TTL, запрет
replacement при pending, durable UNKNOWN/no-replay и grants не меняются.

Root — единственный live/UI-контроллер и writer планов/commit. Делегированный
writer владеет panel JS, адресным тестом и validation map. Installed runtime
сохраняется до отдельной штатной установки под действующими runtime gates.
Core4 MCP tools в этом turn недоступны; второй runtime не запускается.

## Progress

- [x] Приоритет изменён: перенос отложен; постоянное требование P1–P8 открыто.
- [x] Read-only source scout подтвердил конкретный lifecycle gap и проследил
  public manual typed flow без обнаруженного разрыва contract → executor.
- [x] Реализованы bounded handshake retry и понятное состояние ожидания.
- [x] Пройдены адресные lifecycle/auth/no-replay regressions и boundaries.
- [x] Root проверил diff и package identity; независимый source review ACCEPT.
- [x] Подготовлен самостоятельный source milestone; установка остаётся открытой.
- [ ] Обновлён установленный пакет и подтверждено поведение в живой панели.

## Decision Log

- Выбран UI repair с сохранением серверного окна защиты. Новые unlink,
  replacement или снятие UNKNOWN не нужны для исправления сообщения/ожидания.
- Повтор имеет конечный deadline; каждая попытка использует новый challenge.
  Успешный handshake не является fresh mutation grant или lifecycle continuity.
- Окно50с ограничивает начало новых `/challenge` и `/link`, а не длительность
  уже ожидающего fetch. Интервал3с, максимум17попыток защищает от бесконечного
  retry при переводе wall clock назад. Abort и post-link flow не менялись.
- Ранее выполненный configured native read на MSI остаётся историческим proof.
  Отсутствие Core4 tools сейчас не опровергает его и не заменяется отдельным
  stdio server. Read-only process census наблюдал установленный fa9e process;
  pending/ledger/store текущее состояние через MCP здесь не наблюдалось.
- Одна попытка подключения штатного `app-server proxy` из фактического bundled
  Codex binary отказала до initialize: socket10050, stdout0, exit1. Reload/status
  запросы не отправлялись, новый app-server не создавался. Официальный
  [контракт App Server](https://learn.chatgpt.com/docs/app-server) описывает
  `mcpServerStatus/list` и `config/mcpServer/reload`, но наличие методов не
  обеспечивает доступ к control socket текущего desktop-процесса. Повторять
  неизменный отказ и менять config ради принудительного restart не требуется.
- Журнал текущего desktop-процесса подтвердил old thread
  `01a185db-77ee-7bc2-a91a-3df263e7f74f` ready с04:11:58UTC и current thread
  `01a185f0-979d-7c70-b11c-2484b759fe42` failed initialize с04:35:00UTC.
  Actual node21872 запущен04:11:57UTC, parent20440(app-server), broker owner
  pid21872. Старый чат «Доложи обстановку» idle. Совпадение этих facts и fixed
  singleton source согласуется с занятым владельцем; exact child stderr этого
  отказа не получен. Старый runtime/markers не закрывались и не удалялись.
  Запрошено прямое разрешение только на поручение старому чату проверить
  `core_status` и штатно освободить подключение при пустой очереди.
- Следующий функциональный этап после подключения — fresh host/adoption и
  приёмка manual titles-current-target на подготовленной test-copy по generic
  flow и native confirmation. Открытие AEP/save/raw сохраняют свои gates.

## Validation

- Source и test-owned fixtures проверяются отдельно от установленной панели.
  Full release и переносимость обеих машин этим блоком не подтверждаются.
- Root safe evidence: `snapshots/core4-live-proof/XIII-msi-panel-reconnect-20261029/`
  содержит `protected-before.json` (только hashes/несекретные identities) и
  `app-control-observation.json` (ограниченная попытка proxy, native0).
- Final selected **47/47PASS**:41panel +6routing/docs;3check IDs/2batches.
  Root повторно вычислил evidence keys финальных source bytes: mismatches0.
  Baseline387ab87 на том же meaningful regression — ожидаемый FAIL1/1:
  после единственной пары challenge/link панель сразу останавливается.
  Node syntax обоих JS и boundaries21/diff PASS. Источник: `source/` и
  `root-source-readback.json` в указанном evidence-каталоге.
- Fixture выполняет production panel/dispatcher и настоящий WebCrypto с
  synthetic HTTP/clock; sockets/installed reads/AE calls0. Покрыты finite retries,
  fresh challenge/proof, deadline/clock rollback, single start, auth/pins/MAC
  refusal и отсутствие retry для poll/completion/recover/UNKNOWN.
- Девять integrations явно `current-closure-unverified`: native-read-capture,
  windows-cim-probe, zero-dispatch-recovery, human-window, manual-runtime,
  installable-runtime, cep-transport, lifecycle-simulation, native-read-recovery.
  Full release не запускался. Reviewer tests/live не выполнял, P1/P2findings0.
- Candidate `f54863dbb69b5e3a4b0e79d8ee3629cf71c7eced0a3759745d8899fa65a1ce90`,
  package SHA-256 `dc02187e1d71513638d94e544f40901ab343ec22d75640704a08a777c1acb9b8`.
  Два deterministic builds совпали, все60files и manifest hash независимо
  пересчитаны. От installedfa9e изменён только `cep/js/panel.js`.
  Первоначальный distribution с4file installer fragment сохранён как provenance;
  его недостаточно для apply с существующей lineage. Root дополнил package-owned
  installer closure до63files(60runtime+3tools), включая lazy disposition/imports.
  Новый immutable distribution:
  `dist/core4/4.0.0-panel-reconnect-f54863dbb69b-complete/`; read-back —
  `candidate-readback.json`. PackageHash/bytes прежние. Candidate не установлен;
  native0. Полный literal local import graph28files разрешён внутри этого дерева;
  actual CLI dry-run из closure с explicit workspace/node/hash PASS.
- Read-only verifier подтвердил actual installedfa9e/60files/CEP/Node/origins.
  Это не fresh status/queue/adoption proof. Installed package и пользовательский
  AEP этим source block не обновляются; live reconnect acceptance ещё открыта.
- Root final:6изменённых документов strictUTF-8/78relative links PASS;
  descriptor/origin/anchor/receiver journal/project config SHA-256 до/после
  byte-identical. `root-final-static-proof.json`, native0. Git diff-check PASS;
  source block можно независимо установить после штатного освобождения runtime.

## Продолжение после разрешённой пересылки

29октября пользователь прямо разрешил поручение в прежний чат «Доложи
обстановку». Оно передано в `01a185db-77ee-7bc2-a91a-3df263e7f74f`; результат
получен через `wait_threads`, без сообщений обратно и без нового controller.

### Progress

- [x] Прежний configured client прочитал свежий status: pending=null,
  unresolved=[], UNKNOWN/faults=false. Node21872 остаётся runtime owner.
- [x] Проверена семантика `core_disconnect`: disconnected=false,
  физическое подключение принадлежит stdio lifetime. Штатного управления stdin
  или lifecycle managed client не найдено; ос10050proxy повторно не запускался.
- [x] Root завершил полный installer closure/read-back и actual dry-run.
- [ ] MCP lifetime штатно завершён; owners освобождены и установлен f548.

### Decision Log

- Разрешённая пересылка не означает успешное освобождение. Оба чата не меняли
  source/runtime/config/state ради закрытия; force kill и удаление markers0.
  Старый чат завершил поручение и idle; root снова sole live/UI-controller.
- В старом чате пользователь показал «Crash in progress». Root только осмотрел
  окно AE/пустойUntitled project и прочитал процессы/Windows Application events.
  После снимка AE31380 завершился. ApplicationError1000 от04:52:16.211UTC
  подтверждает AfterFX26.2.0.49/RuntimeInstaller.DLL, c0000005, offset0x10de13.
  Это fault location, не доказанная первопричина; candidatef548 не устанавливался.
  AE не запускался заново, диалог/save не нажимались, native dispatch0.
- До фактической остановки managed Node21872 установка остаётся заблокированной.
  Ни отсутствие AE, ни свежий пустой status не заменяют штатное завершение MCP.
  Дальнейшая живая проверка требует восстановленного AE и configured client;
  прежний аварийный процесс не объявляется здоровым по старому screenshot.
- После штатного закрытия Codex/MCP и проверки owners следующий шаг —
  apply exact f548 через полный installer closure, read-back и новый configured
  handshake. Installer штатно создаст новые role credentials; прежние значения,
  ошибочно выведенные при диагностике, до этого остаются действующими.

### Validation

- `installer-dry-run.stdout.json`/`.stderr.log`: exit0/stderr0, workspace/config
  и exact external Nodev24.15.0 совпали;63closure hashes PASS, package SHA/hash
  прежние. Dry-run не выполняет under-lease stopped/receiver acceptance apply.
- `ae-crash-observation.json`: ApplicationError1000 + current process census.
  После crash наблюдался только Node21872; причинная связь с CEP не установлена.
- 47selected/source ACCEPT относятся к неизменённому source7dec462;
  suites не повторялись из-за packaging/docs. Installation/live acceptance0,
  old UNKNOWN/noReplay не менялись, перенос остаётся отложенным.

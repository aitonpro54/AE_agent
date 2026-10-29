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

## Продолжение после перезапуска Codex — 29 октября 2026

### Progress

- [x] Свежий census подтвердил завершение прежнего Node21872. Новый managed
  Node26568, parent19560, запущен в05:00:55UTC и удерживает broker/receiver.
  AE-процессов на момент наблюдения нет. Core4 tools в текущем чате недоступны.
- [x] Полный read-only verifier вновь подтвердил installedfa9e:60release files,
  CEP, external Nodev24.15.0 и origins. Descriptor/origins/receiver journal
  совпадают с сохранёнными hashes; broker ledger отсутствует.
- [x] После фактического restart выполнена одна новая проверка existing
  app-server proxy. Отказ до initialize повторился: os10050, stdout0, exit1.
  Status/reload не отправлялись; новый app-server не создавался.
- [x] Подготовлен и адресно проверен отдельный локальный launcher f548 для
  запуска при закрытом Codex. Root прочитал source и выполнил `--check-only`:
  ожидаемый отказ `runtime_state_owned_or_unknown`, попытка apply не создавалась.
- [ ] Пользователь штатно закрыл Codex и выполнил launcher; установка и live
  reconnect подтверждены новым read-back. Этот переход пока не выполнен.

### Decision Log

- Простое открытие Codex заново запускает прежний enabled MCP и вновь занимает
  state. Обновление следует выполнить между штатным закрытием Codex и его
  следующим запуском. Root готовит конкретный локальный launcher; процессы,
  owners, config preferences, fences и журналы ради освобождения не меняются.
- Это ограниченная операционная подготовка прежней разрешённой установки,
  не новый runtime API или перенос на другую машину. Candidatef548 и его
  package-owned63file installer closure сохраняются. Launcher вызывает штатный
  installer; under-lease stopped/settled checks остаются решающими.
- Root сохраняет исключительное владение live/install и планами; одному
  `ae_implementer` передана только подготовка ignored launcher/fixtures без
  доступа к installed state или исполнения apply. Отдельный runtime не нужен.
- [Официальный App Server](https://learn.chatgpt.com/docs/app-server) описывает
  reload/configured status, но это не устраняет наблюдаемый отказ подключения
  control socket. Повтор того же отказа в этом процессе не выполняется.

### Validation

- Fresh evidence: `snapshots/core4-live-proof/XIV-msi-install-continuation-20261029/`
  — `continuation-observation.json`, `installed-before.json`,
  `app-control-after-restart.json`. Только безопасные identities/hashes;
  configured queue/peer/adoption/authority после restart не наблюдались.
- Установка, recovery, AE launch/native/save0. Source/panel suites не
  повторяются из-за неизменившихся bytes; перенос и full release остаются открыты.
- Launcher fixtures:29 assertions PASS, syntax PASS, real apply0. Покрыты
  изменённые distribution/package/installer bytes, лишний файл closure,
  шесть owner/gate/.next отказов до вызова apply, durable no-replay и точная
  enabled MCP-конфигурация. Fixtures не читают installed paths.
- `offline-update.cjs` SHA-256
  `ec0e04baaced6505c4e6007fc1b39a4db0c539c33580173213f3a6f63f20b4d6`.
  Wrapper проверяет frozen distribution SHA-256
  `3db904cd891c4c8b1dca53f299b53e58f89cc30e674072df2c50db9be807c944`,
  все63installer files, package и exact Node до загрузки candidate code.
  Это local MSI operation в ignored evidence, не переносимый product module.
- Единственный apply идёт через штатный CLI без shell/timeout/retry. До submit
  пишется durable `offline-apply-attempt.json`; неизвестный исход не разрешает
  повтор. Under-lease stopped/settled и UNKNOWN остаются в installer.

### Прежний следующий шаг — заменён диагностикой ниже

Полностью штатно закрыть Codex, затем из Проводника запустить
`snapshots/core4-live-proof/XIV-msi-install-continuation-20261029/INSTALL-CORE4.cmd`
в рабочем корне. Не открывать Codex до результата launcher. На `SUCCESS`
пакет/CEP/Node/config уже прочитаны обратно; это ещё не live proof. Затем открыть
Codex и продолжить этот чат для configured handshake и разрешённой приёмки.
При `BLOCKED`/`UNKNOWN` сохранить `offline-install-report.json` и вернуться
с результатом для диагностики; повтор launcher и ручное удаление locks не нужны.
Root не может штатно закрыть собственный desktop host и продолжать установку
в этом же turn; ручной шаг нужен для освобождения занятого runtime, не для
повторного согласования уже разрешённого обновления.

## Диагностика пользовательского отказа launcher — 29 октября 2026

### Progress

- [x] Получен screenshot и сохранён исходный `offline-install-report.json`:
  `blocked/local_check_failed`,05:28:37.704UTC (10:28MSI). Оригинал и копии
  старых launcher/tests сохранены с суффиксом `.original` в evidence XIV.
- [x] Независимые read-only проверки candidate closure63files, package,
  конфигурации, полного installed verifier и штатного dry-run PASS. Baseline
  совпадает с frozenPIN. Установлен прежнийfa9e; attempt marker отсутствует.
- [x] Исправлена потеря diagnostic stage и OS error code в локальном launcher.
  `--check-only` теперь пишет отдельный отчёт; ошибка после создания attempt
  marker классифицируется `unknown` с no-replay, включая сбой записи/fsync marker.
  Текст ошибки, пути ошибки, stack и raw child output в публичный отчёт не идут.
- [x] Configured MCP теперь доступен: PID24688, start05:29:35UTC. Pending=null,
  unresolved=[], broker/receiver faults=false; peer disconnected,
  physical.storeClosed/unknown=true. Receiver owner существует с04:11:57UTC,
  раньше нового процесса; original journal SHA-256 прежний.
- [ ] Восстановление ownership доказано подходящим scoped оператором и
  выполнено при штатно освобождённом MCP; после этого установленf548.

### Decision Log

- Точная причина `local_check_failed` на screenshot **не восстановлена**:
  старый catch потерял её, отдельные проверки её не воспроизводят. Нельзя
  выдавать текущий ownership blocker за доказанную причину прежнего сообщения.
- Текущая блокировка подтверждается отдельно. Completion store выставляет
  closed при EEXIST receiver owner; marker старше текущего runtime. Семантический
  read-only `assertReceiverJournalSettled` PASS:8events, original UNKNOWN с
  verified terminal disposition и2complete. Это не новая невыясненная AE-команда,
  но settlement сам по себе не разрешает снятие ownership/fences.
- Нельзя продолжать прежнюю инструкцию «закрыть Codex и снова запустить
  launcher»: receiver marker пережил прежние завершения, его lifecycle требует
  отдельного доказательства. Existing `recover-zero-dispatch-owner` допускает
  только single-origin journal, поэтому здесь неприменим; его guards не менять
  и не подставлять этот8event журнал как zero-dispatch.
- Следующий инженерный блок — доказать происхождение и отсутствие владельца
  именно receiver marker и подготовить ограниченное архивирование с identity
  CAS, полным settlement/lineage proof и отсутствием runtime под gates. При
  недостатке provenance переход остаётся закрытым. Автоматического cleanup,
  удаления marker, повторного disposition/replay или переключения config нет.
  До этого не нужно снова закрывать Codex ради прежнего launcher.
- Эта дельта касается только локальной ignored operational обёртки/evidence;
  Core4 source, immutable candidate и installed runtime не менялись. Runtime
  recovery API или новая live authority этим диагностическим блоком не введены.

### Validation

- `local-check-diagnosis.json`:6изолированных read-only checks PASS, frozen
  baseline PASS. Apply/native/runtime start0; исходный report hash
  `9b88f221c575094c284748a920c6b67fafbea9ccf3353251d44c5af52cb6acd6`.
- `offline-launcher-tests.json`:43assertions PASS (прежние29 плюс14адресных
  checks). Проверены OS code/stage без secret message/path, SyntaxError,
  unknown после attempt marker, сохранение domain error и реальный CLI catch
  через in-memory filesystem refusal; check-only не перезаписывает install
  report. Fixtures не читают installed paths, real apply0. Node syntax PASS.
- Actual `--check-only`: `blocked/runtime_state_owned_or_unknown`,
  failureStage=ownership, applyAttemptRecorded=false; новый
  `offline-check-only-report.json`. Исходный installation report byte-identical.
- `configured-status-diagnosis.json` и `owner-blocker-evidence.json` содержат
  current configured status, marker inode/time, semantic settlement и hashes.
  Descriptor/origins/journal/project config совпали с pre-launcher evidence;
  installed release60files/CEP/Node проверены полностью. Owners не изменялись.
- Новый `offline-update.cjs` SHA-256
  `90e52b323dbb9893bafcdafcb024f4e71d63c621b3558830016b678f2bfdc325`;
  tests `4b9596c8bc11c7ae4f2905a492f2a692e32faea94f18a9194b8a57df8bccba6e`.
  Original launcher SHA-256 остаётся `ec0e04baaced6505c4e6007fc1b39a4db0c539c33580173213f3a6f63f20b4d6`.
  Product suites/full release не повторялись: product bytes прежние.

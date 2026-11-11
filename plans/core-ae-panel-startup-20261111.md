# Штатный запуск AE и проверка загруженной панели

## Цель и scope

По поручению пользователя: запускать After Effects и собственную CEP-панель
штатным инструментом без Computer Use; получать версию именно загруженной
панели через проверяемый ответ; завершать Computer Use сразу после UI-блока.
Это отдельный engineering block, не продолжение продуктовых Titles/Slideshow.
Публикация Git refs и полная release-приёмка не назначены.

## Progress

- База исходников: a238259 (Core 4.2.5). До начала уже изменены AGENTS.md и
  plans/core-transfer-4.2.5-20261111.md; эти изменения сохраняются.
- Текущий configured runtime: Core 4.2.4, package 193539df…, AE 23616,
  CEP connected/file://. Статус не сообщает версию загруженной CEP-копии.
- Архитектура startup/loaded-panel identity: ae_architect startup_contract;
  причина — границы запуска хоста, подключения и проверки live-identity.
- Штатное завершение Computer Use исследует read-only ae_scout
  cua_cleanup_facts. Единственный live-контроллер — координатор.
- Архитектурный контракт принят; реализация и адресные offline-проверки
  переданы ae_implementer startup_implementation (Sol/high). Причина —
  ограниченная реализация уже определённых startup/handshake/packaging границ.
- Пока шло исследование, отдельный чат «4.2.4» завершил установку Core 4.2.5
  и перешёл в idle. Его исход прочитан без повторения stop/update/enable.
  Свежий configured client подтвердил b24af0e1… / 4.2.5, CEP disconnected;
  старый MCP-клиент этого чата не используется для дальнейших live-действий.

## Decision Log

- Новый путь сохраняет existing Host/Origin/auth, очередь, lease, UNKNOWN,
  ownership и все gates изменений проекта. Открытие панели не предоставляет
  права на изменение AEP и не требует его сохранения или перезапуска AE.
- Версия исходного/установленного manifest не выдаётся за версию загруженного
  CEP. Проверка должна различать отсутствующую, старую и совпадающую панель.
- Пути и AE identity получает общая локальная установка; hostname-веток и
  встроенных пользовательских paths в переносимом коде нет.
- Отдельный explicit `core_ensure_ae_panel` принимает UUID операции и bounded
  timeout, сохраняет intent до внешнего действия и неизвестный исход без replay.
  Status/connect не запускают приложение скрытно. Отсутствующий AE запускается
  один раз по проверенному executable binding; один существующий сохраняется;
  неоднозначный inventory отклоняется до dispatch. Host-adoption используется
  как locator, а не как authority для новой incarnation AE.
- Fixed package-owned JSX открывает только собственную панель через точное
  имя меню и проверенный положительный command ID. Произвольных scripts/paths/
  command IDs от клиента нет. Adobe документирует AfterFX.exe -r как запуск
  JSX в существующем процессе: https://helpx.adobe.com/after-effects/desktop/automate-in-after-effects/automate-animation/scripts.html.
- Литерал версии/build identity в выполняемом panel.js передаётся в MAC
  существующего /link; owner сверяет его с проверенным release. Старая панель
  с новой installation config не получает рабочий command lane.
- У старой 4.2.4/4.2.5 нет подтверждённого self-reload контракта. Новый ensure
  не перезапускает пользовательский AEP: stale/cache ambiguity сообщает
  конкретно. Новая панель получает стабильное имя меню AE Agent Core.
- Для native sky документированного teardown API не найдено. Правило немедленно
  завершать доступный UI-протокол/прекращать UI-вызовы закреплено в общих
  C:/Users/Ant/.codex/AGENTS.md и docs/tool-first-workflow.md. Убийство helper,
  закрытие AE и удаление плагина не выдаются за завершение UI-сессии.

## Validation

Предстоят: scoped позитивные/негативные тесты запуска и live-identity,
packaging/closure/boundaries, независимое ограниченное review, проверка
штатного пути на доступной машине без Computer Use и фиксация ограничений
недоступной среды. Установка/открытие панели выполняются только после
проверки реализации; пользовательский AEP сохраняется без изменений.

- Configured preflight: существующий проверенный launch-check.cjs status
  startup-work-baseline-01 → PASS, server4.2.5/package b24af0e1…, native calls0.
- Native Computer Use/CUA вызовов в этом engineering block — 0. Другой чат
  сообщил, что пользователь остановил свой UI-блок через Esc.
- Доступные проекты/чаты сейчас показывают только local desktop; доступный
  MSI host не найден. Локальная адресная проверка не будет названа MSI-приёмкой.

## Кооперативное обновление открытой панели

### Progress

- В первом implementation block исполнитель сообщил 145/145 адресных
  owner/client/panel/startup checks, ещё 6/6 installer regressions и 90
  boundaries PASS. Финальные logs/pins ожидаются; упаковка выявила явный
  allowlist версий, который требуется дополнить 4.2.6.
- Снимок текущего desktop перед изменениями завершён: 1770 файлов установки,
  7 CEP, 89 текущих preferences, project/global config и четыре AEP. Каждый
  файл копии сверен с исходником, source unchanged. Приватная копия и манифест
  остаются вне Git в .codex-runtime/core-ae-panel-startup-20261111/.
  Manifest SHA 90f457a4f1f219046557cf9e94d83f0e68815d46ca3ae1c8170be3c63c8bfaf0.
- Root-controller helper scripts подготовлены ae_operator
  startup_native_helpers; root прочитал их и вернул три конкретные ошибки
  сериализации/held-lease/маскировки. Они исправлены, syntax checks 3/3 PASS.
  Scripts update/ensure/inspect ещё не запускались.

### Decision Log

- Требование portability исключает обязательный перезапуск AE при каждом
  обновлении. Для 4.2.6 нужен cooperative idle reload, а первый переход со
  старой панели без такого механизма проверяется отдельно.
- Архитектурный followup ae_architect зафиксировал инертный локальный marker
  {version,installationId,packageHash,panelConfigHash}. Он не содержит raw
  credentials и меняется также при same-package credential rotation.
- Marker читается только как данные по фиксированному пути через CEP fs.
  Старые closure config и loaded identity не подменяются. Reload разрешается
  только после полного завершения native callbacks, dispatch/recover и
  post-completion ACK; фиксируется single-flight budget на пару config hashes.
- HTML reload сам по себе не доказывает обновление JSX registry. Требуется
  loaded registry identity и fixed package-owned refresh. Provisional signed
  peer пока не получает poll/inspection lane; owner сначала проверяет отсутствие
  другого peer/pending, затем допускает authenticated registry-ready.
- Native проверка по возможности использует два штатных состава одного
  source: 4.2.6 manual/owner после первого cold start, затем горячий переход
  к конечному operator-render-jobs/owner. Это даёт реальную смену registry
  без фиктивной следующей версии; исходные R1/history и AEP сохраняются.

### Validation

Ожидаются реализация и адресные проверки marker/idle/registry-ready, scoped
независимое review, проверка упаковки и live desktop proof без Computer Use.
Новых install/native отправок на этом этапе нет.

### Независимое review до установки

- ae_reviewer startup_review нашёл два дефекта startup: uncertainty не
  блокировала несовместимые операции после lease expiry; подтверждённый отказ
  последнего preflight до launch становился вечным UNKNOWN. Исполнитель
  исправляет отдельный startup gate и durable dispatch-entered boundary.
- В stage2 найдены отсутствующая пересборка registry/panel fingerprint у
  capability delta и прежний manifest ScriptPath, исполняющий registry до
  provisional admission. Требуются real-delta compose test и исключение
  автоматического executable ScriptPath у новой версии. Исторический verifier
  старых пакетов сохраняется.
- **Product source пока не ACCEPT; установка ещё не выполнялась.**
- Отдельный ignored close-empty-host.cjs получил ограниченный ACCEPT после
  исправления import/compact request bytes/собственного forwarder и снятия
  требования connected peer. Дважды проверяет непосредственно в AE: только
  clean empty Untitled, file=null, items=0, пустая неактивная очередь. Force
  kill/save/open отсутствуют. Это одноразовая проверка cold startup, не CU teardown.
- Helper VM: clean empty → quit один раз; dirty/saved/nonempty/rendering/queued
  → quit ноль раз; свой forwarding PID допускается, чужой второй AE отвергается.
  Helper ещё не запускался на AE. Update helper требует отдельный точный
  previous-package-hash.txt; для первого шага закреплён установленный b24af0e1….

### Замороженный source принят

- Source4.2.6 зафиксирован в stage2-source-freeze.json: 32 LF файла,
  SHA реестра b40617132ff98b3ac6b247beb3a3500e09d9fac77cad7b62167c6e61aa6a4676.
- Повторный независимый ae_reviewer startup_review: **ACCEPT**, 32/32 hashes
  совпали; блокирующих findings нет. Все прежние P1/P2 исправлены, включая
  terminal interruption исходного UUID по доказанному завершению host и
  submission process после deadline; receiver UNKNOWN при этом сохраняется.
- Подтверждены session-bound registry retirement с exact archive/CAS,
  ownership каждого позднего callback, запрет новых bootstrap admissions
  при maintenance с возможностью завершить оригинальный accepted callback,
  owner-only startup closure и оба named validation runners.
- ACCEPT ограничен source-контрактом, не нативной приёмкой. Финальные current
  tests/deterministic packages ожидаются; установленный desktop всё ещё4.2.5.

## Source milestone завершён, native этап начинается

### Progress

- Финальные current проверки: main 177/177, installable 7/7, standalone 2/2,
  C1b real capability delta 1/1; boundaries90, syntax25 JS, fixed JSX и оба
  generated registry ES3, XML и diff-check PASS.
- Независимый ae_scout cua_cleanup_facts повторно проверил 32/32 source SHA,
  7/7 stdout hashes, четыре standalone целиком и их executing panel identity.
  Оба deterministic pair совпали; manual/operator registryBuildId различаются.
- manual/owner: package d4443d74e3e40e8f16593bfb7e4474ccfe57628398d04b8a68fba49ba6c8564d,
  distribution40c393a801e07a65846a18d9f3b2e83633202d9fdc2fd0e987defd45cc372aea,
  registry58b976a1c0b3827c330414ef66cb272014cb3ac55180e595f1c423cabcf04c54.
- Конечный operator-render-jobs/owner: package6c127681eb6540a8fb676f914656ac5c2fb3db6c19cfde4c917a011dde5b3ca9,
  distributionf60d9aa0d8f48f0cf583755e4fdea015d536a401489cdae0dcdeed9fb0242da3,
  registryf58832f938483dd9a84a10f90abc4b5e7c90aa5028f0aa32ae2cf47827f091ee.

### Decision Log

- Проверенные source/artifacts принимаются до native install отдельным рабочим
  commit; tag/push не назначены. AGENTS.md и чужой план4.2.5 не включаются.
- Root остаётся единственным live-контроллером. Перед install свежий configured
  preflight4.2.5 PASS; CEP disconnected, holder/pending/UNKNOWN/fault отсутствуют.
- Native последовательность: ordinary stopped update4.2.5→manual4.2.6;
  проверка старого cached menu и fresh project facts; завершение только доказанно
  clean empty Untitled; cold ensure+identity+typed read/release; hot update
  manual→operator с прежним AE; same-package repeat конечного operator.

### Validation

Source commands, cwd C:/Users/Ant/Documents/Codex/AE_Agent_Core:

```text
node --test core4/test/ae-panel-startup.test.js core4/test/panel-lifecycle.test.js core4/test/owner-attachments.test.js core4/test/client-entry.test.js core4/test/panel-reconnect.test.js core4/test/panel-start-over.test.js core4/test/ae-readiness.test.js
node --test --test-name-pattern="package deterministic closure|unknown Broker owner|Origin-bound challenge|panel VM/WebCrypto|real stdio" core4/test/installable-runtime.test.js
node --test --test-name-pattern="standalone-installer deterministic|actual apply and settled-journal" core4/test/standalone-installer.test.js
node --test --test-name-pattern="C1b packages" core4/test/stopped-update.test.js
```

Полные logs/hash/manifest: .codex-runtime/core-ae-panel-startup-20261111/
stage2-summary.json, stage2-builds.json, stage2-source-freeze.json и stage2-checks/.
Исторические fixture FAIL сохранены отдельно; не объявляются current PASS.
Нативная приёмка и full release certification этим source milestone не заявлены.

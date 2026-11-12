# Core 4.2.7: установленный MCP и автоматическое переподключение CEP

12 ноября 2026. Поручение пользователя: обновить установленный MCP и панель
до 4.2.7 и проверить в live AE, что панель переподключается сама.
Source version 4.2.7 опубликован в `02dc254` / `codex/ae-agent-core-4.2.7`.

## Progress

- Прямой MCP текущего чата перед передачей подтвердил прежнюю 4.2.6:
  package `75a95aa5…`, owner 31260 / boot `e7ca4384…`, CEP `file://`,
  registry ready. Holder=null, pending/UNKNOWN/store fault отсутствуют.
- Проверенный 4.2.7 operator-render-jobs/owner: package
  `2ce5b1c2c49ddc7be422a9d4b57d1d2d84e0b30e5ce703a9278df306e1c03e04`,
  standalone v3 `f6803959685c71db19b8335fb97349343df86203ca3ec8ffff4f9f17d379fc9b`.
  Panel `2111abf8…`, registry `f58832f9…`. Две deterministic сборки,
  163 адресных source tests и independent review переиспользуются по тем же bytes.
- `ae_implementer` Sol High получает единственный live Core/AE/CEP control:
  fresh preflight/snapshot → штатное остановленное обновление → автоматический
  переход открытой панели 4.2.6 → 4.2.7 → native read/release → отдельный
  same-package owner restart и автоматическое переподключение/native read.
  Root ведёт план, review и Git, не вызывает Core и не управляет AE параллельно.
- Штатные stop `b49fb68b-85e8-4e05-ad47-b9b373088e2d`, update
  `31b1ae75-9d66-4186-b193-817e3a575c22` и enable завершены по одной попытке.
  164 runtime files и установленная CEP 4.2.7 сверены; configured client path
  указывает на release `2ce5b1c2…`, initialize serverVersion=4.2.7.
- Открытая 4.2.6 панель автоматически перешла на authenticated 4.2.7
  `2111abf8…` / `file://` / registry ready до acquire/core_connect;
  наблюдаемый интервал 18.087 с от первого status. Native
  `observation-9867e807-ebb6-470c-9d7f-ee01ecf8d988` / command
  `inspect-87f64db7-5ab5-466e-93a7-9e48d501fb35` прошёл, lease released.
- Отдельный same-package/same-credentials owner stop/resume/start
  `43252957-687a-4b54-8844-be067374bce9` завершён по одной попытке. Панель
  сама создала новый authenticated peer/epoch до acquire/core_connect;
  наблюдаемый интервал 17.828 с. Native
  `observation-4bf952fc-9de1-4ad0-a6be-654959be6684` / command
  `inspect-658df3bc-8284-4bb6-9bf7-f1ada010ccd3` прошёл, lease released.
- Final owner 34544 / boot `e5b2dffd-c096-46cd-9a37-f7e21fbce70b`, один
  listener 3457; все три helper clients завершены. Control возвращён root.
  Same AE 39220/birth, AEP revision 72/dirty=false; pending/UNKNOWN/fault нет.
- Прямой `core_status` текущего чата после передачи control вернул
  `owner_unavailable`: текущий процесс клиента ещё cached 4.2.6.
  Только этот namespace refresh остаётся открыт до полного Codex restart
  пользователем. Установка, cutover и owner-restart проверки повторно не нужны.
- Independent `ae_reviewer` Sol High принял bounded install и оба live
  reconnect без P1/P2. Независимо сверены 164 runtime файла/CEP с candidate,
  1035 защищённых файлов/14 prefixes с sealed pre-update manifest, chronology
  authenticated readiness до acquire/connect и original native receipts.

## Decision Log

- Рабочий descriptor: `C:/Users/Ant/AEAgentCore4/installation.json`.
  Используются проверенные standalone/maintenance tools, новые UUID и
  durable intents; settled IDs прежних этапов не повторяются.
- Приёмка автоматического перехода и owner restart проходит без CU, меню,
  ensure, ручного Connect/reload, перезапуска AE, raw JSX и изменения сцены.
  Native registry bootstrap — штатная часть authenticated CEP handshake.
  Собственный AEP и его текст `CORE 4.2.6 LIVE` не меняются ради номера продукта.
- Реальный автоматический package/credentials/marker cutover 4.2.6 → 4.2.7
  закрывает ранее отложенную bounded live-границу последующего обновления из
  [плана reconnect 4.2.6](core-mcp-panel-background-reconnect-20261112.md).
  Точный wire/reload subpath при этом не приписывается без packet capture.
- Сохраняются same AE birth, пять AEP, пользовательские preferences,
  installation identity/history/archive prefixes и соседние настройки.
  Только штатная замена Core args-path и rotation credentials допускаются
  ожидаемым update-контрактом. Перед действиями берётся свежий snapshot.
- Прежняя global config delta после полного Codex restart пользователем не
  восстанавливается: текущие bytes являются baseline нового этапа.
- У current-chat MCP immutable descriptor cache. По уже установленному
  пользовательскому рабочему пути новый клиент этого чата может потребовать
  полного перезапуска Codex пользователем после фактической установки.
  CLI proof не подменяет проверку namespace текущего чата; Codex UI/IPC и
  app-server/thin-client termination для refresh не применяются.
- Пользовательские dirty `AGENTS.md` и
  `plans/core-transfer-4.2.5-20261111.md` сохраняются вне коммита.
  Source/live evidence фиксируется отдельным milestone commit в ветке 4.2.7.
- Публикация evidence продолжается в ранее явно назначенную пользователем
  ветку `codex/ae-agent-core-4.2.7` обычным push; local/remote HEAD сверяются.
  Локальный post-commit receipt —
  `.codex-runtime/core-4.2.7-install-live-20261112/push.json`.
- Исчезновение двух пустых LOCK-копий из private TEMP backup после initial
  byte-exact verification зафиксировано отдельным artifact-gap. Текущие source
  bytes/размеры совпадают с sealed fresh manifest; сохранившиеся backup bytes
  используются для prefix proof. Ничего не восстанавливалось; полная
  восстанавливаемость private backup не заявляется. Scope не расширялся на
  temp cleanup, MSIX incident repair или чужие настройки.

## Validation

- Обязательны exact installed package/read-back, authenticated executing
  productVersion 4.2.7/panelBuild/Origin/registryReady и новое native чтение.
- Отдельно должны пройти реальный package/credential/marker cutover при
  открытой старой панели и same-package/same-credentials owner restart.
  Видимая версия меню или manifest без accepted identity не являются proof.
- Финал: same AE/AEP, пять AEP hashes и append-only histories сохранены,
  lease released, pending/UNKNOWN/fault отсутствуют. Неопределённый исход
  устанавливается по исходной операции; повторов вслепую нет.
- Новая MSI/full release сертификация этим desktop-блоком не назначается.
  До фактических receipts установка и reconnect PASS не заявляются.
- [Live summary](../docs/evidence/core-4.2.7-install-live-20261112/summary.json)
  фиксирует два bounded PASS. Принята executing identity 4.2.7/panel `2111abf8…`,
  registry `f58832f9…`; native result связан с новым channel epoch и receiver
  store. Wire packet capture и точный внутренний reload/recovery subpath
  не устанавливались; фактические автономные переходы подтверждены.
- [Сохранность](../docs/evidence/core-4.2.7-install-live-20261112/preservation.json):
  1035 immutable files exact, 90 preferences (80 exact + 10 log prefixes),
  четыре пользовательских AEP и собственный AEP exact; global/foreign config,
  identity и история сохранены. Receiver prefix 84743 → 94877 с 8 новыми
  записями; ledger 140900 неизменён. Это same observed host/session/project,
  не доказательство автоматического lifecycle/continuity прежней incarnation.
- CU/ensure/manual panel Connect/reload/AE restart/project mutations/save — 0.
  Original operation IDs settled; не повторять. Полное closed-loop proof
  именно MCP текущего чата ещё не заявляется — см.
  [direct cached-client result](../docs/evidence/core-4.2.7-install-live-20261112/current-chat-before-restart.json).

# Штатный запуск AE и проверка загруженной панели

Разработка Core 4.2.6. Публикации 4.2.5 и их evidence сохраняются.

В owner runtime доступны `core_ensure_ae_panel` и
`core_ae_panel_startup_status`. `core_status`, `core_diagnostics` и
`core_connect` сами не запускают AE и не открывают панель.

После обычного чтения статуса и `controller_acquire` текущего сеанса:

```json
{"payload":{"operationId":"10000000-0000-4000-8000-000000000001","timeoutMs":60000}}
```

UUID v4 обязателен; `timeoutMs` необязателен, от 1000 до 90000. Другие поля
запрещены. Observer принимает только `operationId`, сверяет поздний исход и
может записать его терминальную квитанцию. Повтор `ensure` с тем же UUID
выполняет такую же сверку; нативный вызов не повторяется. После timeout
использовать этот UUID, не новый. Startup tools и два нативных startup asset
поставляются только в owner; marker/registry инфраструктура общая для CEP.

Перед действием проверяются действующий controller lease, неизменность
верифицированной установки, свободная очередь, отсутствие UNKNOWN/fault,
maintenance, единственность AE, executable и коллизии точного меню.
`host-adoption.json` служит только локальным locator для executable с SHA-256.
Запуск не изменяет adoption, baseline, grants, проект или право его изменять.
Отсутствие locator возвращает `startup_executable_binding_required`.
Штатный stopped readoption сохраняет hardlink к `host-adoption.json` в preparation
history. Для чтения только этого фиксированного data leaf допустимы стабильные
hardlinks: размер ограничен 64 KiB, проверяются regular-file, все ancestors,
realpath, inode/bytes и неизменность nlink во время чтения. Installation/machine
и executable hash сверяются как прежде. Исторический alias не удаляется.
Descriptor/release/CEP, executable и startup receipts сохраняют строгие guards.

Если AE отсутствует, используется привязанный executable; если запущен один
AE, сохраняются PID, birth и path. Команда имеет только фиксированные аргументы
`AfterFX.exe -r <package-owned bootstrap.jsx>`. Входные пути, произвольный JSX,
menu ID и `-m` не принимаются. Кратковременный собственный forwarding CLI при
существующем AE допускается только как ожидающий процесс; готовность
подтверждается после его исчезновения и повторной проверки единственного AE.

В `state/production/panel-startup/<UUID>/` до dispatch записываются долговечный
attempt, request и фиксированная копия JSX. Непосредственно перед внешним вызовом
записывается `dispatch-entered.json`. Доказанная ошибка подготовки завершается
`rejected_before_dispatch`; собственные prepared-only остатки сверяются без
нативного повтора. После входа во внешний вызов неопределённый исход остаётся
UNKNOWN. JSX проверяет deadline, находит
точное стабильное меню `AE Agent Core`, записывает executing receipt и вызывает
положительный целый command ID. Ошибки перехватываются без alert/необработанного
AE modal. Ack содержит узкие read-only `app.version` и
`projectPresent/file/dirty/numItems`; они не заменяют typed inspection.
Пути состояния проверяются на junction/symlink/hardlink, записи owner публикуются
эксклюзивно после fsync. Startup pending/UNKNOWN блокирует несовместимые операции
и maintenance даже после истечения lease; observer и получение управления для
сверки остаются доступны. Собственный registry bootstrap допускается в ожидании
ensure только по точной привязке operationId/commandId/peer/epoch.

После dispatch прежний cached peer не подтверждает новую загрузку: нужен новый
принятый handshake. Cached connected при отсутствии AE не заменяет cold launch.
Если deadline истёк, исходный/наблюдённый host доказанно исчез и собственный
submission PID доказанно отсутствует, observer сохраняет `interrupted`. Он
снимает только startup gate; receiver UNKNOWN, grants и baseline не меняются.
Новый AE B не доказывает успешность старого запуска AE A. Без этих доказательств
UNKNOWN сохраняется.

`requires_host_restart` означает отсутствие точного стабильного меню в текущем
AE cache. Переход со старой версии с версионным меню может потребовать отдельного
штатного перезапуска host. Ensure сам не закрывает и не перезапускает AE/AEP.
Для последующих обновлений 4.2.6 работает cooperative reload с сохранением
текущего AE/AEP; штатный reload не требует перезапуска host.

Исполняемый `panel.js` содержит литерал
`{protocolVersion,productVersion,panelBuildId,extensionId,registryBuildId}`. Fingerprint вычисляется
при упаковке из panel.js с обнулённым digest slot, dispatcher, сгенерированного
registry.jsx, HTML, CSS и manifest. Это не чтение текущего JS с диска работающей
панелью. Registry имеет отдельный deterministic ID с обнулённым собственным
digest slot, включающий codec, executors и dispatch wrapper. Capability compose
перегенерирует registry и повторно штампует panel identity при реальной дельте.
Исторические 4.2.5 packages сохраняют прежнюю генерацию и правила проверки.

`/link` подписывает challenge вместе с литералом, peer ID и extension root,
полученным из штатного Adobe API. Owner сверяет root с установленной CEP-копией
и identity с verified release. Существующие
MAC, nonce, epoch, installation/package pins и Origin gates сохраняются.

Manifest больше не загружает JSX через `ScriptPath`. Успешный `/link` даёт только
provisional peer: poll, inspection и broker connect закрыты. До ответа owner
сохраняет обычный receiver `begin` для registry bootstrap. После допуска панель
пишет persistent latch и вызывает один fixed wrapper: прочитать identity
`AECore4Host`, при несовпадении загрузить только собственный
`<extensionRoot>/jsx/registry.jsx` через `$.evalFile`, снова сверить ID. Проектные
API этот wrapper не вызывает. При совпадающем registry `evalFile` не нужен.

Подписанный sequenced `/registry-ready` содержит
`{nonce,registryBuildId,refreshed,sessionId}`. Owner требует исходные peer/epoch,
nonce, ID и явный sessionId, сохраняет receiver `complete` до signed ACK и только
затем открывает очередь. Потеря callback/deadline сохраняет receiver UNKNOWN и
локальный latch; таймер не снимает native guard и не разрешает повтор eval.
Late callback/ACK сверяет собственные exact latch bytes до save, POST и удаления;
старый callback не может перезаписать или снять latch нового сеанса.

`physical.peer.acceptedIdentity`, `identityObservedAt` и `identityEpoch` в статусе
и диагностике относятся к принятому JS handshake. `registryReady` и
`registryBuildId` показывают отдельно подтверждённый нативный registry того же
peer/epoch; `physical.registryBootstrap` сохраняет command/session и состояние
квитанции. Неизвестная старая панель не
получает выдуманный номер версии. `lastPanelRejection` фиксирует несовпадение;
непринятый peer не получает командный канал.

Installer создаёт рядом с `installation.js` data-only `installation-state.json`:
`{version:1,installationId,packageHash,panelConfigHash}`, где последний digest —
SHA-256 canonical `installationConfig`. Raw credentials в marker отсутствуют.
Он installation-local, вне переносимой package closure; verifier, staging и
rollback требуют точные descriptor-derived bytes. Same-package credential
rotation меняет config digest при прежнем packageHash.

Панель один раз захватывает cfg и его digest. После transport/auth/binding
отказа она читает только фиксированный marker через штатный `cep.fs.readFile`
из корня текущего extension. Ни eval конфигурации, ни caller URL, ни смены cfg
в существующих callbacks нет. При прежнем marker сам отказ не вызывает reload.
При сменившемся marker повторно проверяются все dispatch/recover/post-ACK,
native callback, HTTP/reset watcher и latch gates, останавливается polling и
выполняется один фиксированный `location.reload()`. SessionStorage фиксирует
budget для пары loaded→target config hash до reload; он становится settled только
после нового signed JS/registry handshake. Callback со старым cfg сохраняет
прежние credentials/session.

Registry UNKNOWN не снимается сменой epoch, package, credentials или reload.
Исключение — уже существующий StartOver: свежий полностью проверенный signed
`status` подтверждает completed reset, новый непустой session UUID, reset UUID,
`requiresAEExit:false`, отсутствие fault и готовую фазу. При idle native guard и
всех operations прежний latch с явным другим sessionId (включая explicit null)
архивируется exact raw bytes + digest + old/new session + полный signed proof.
Только после read-back архива и повторной проверки владения снимается прежний
active key. Итог архива — `unknown_preserved/retired_after_completed_reset`,
не успех старой команды. Missing old session, forged proof, запись/конфликт
архива или replacement active key оставляют fence. Signed status читается до
старого latch gate; новый provisional bootstrap при неразрешённом старом latch
не отправляется. Baseline и исходный receiver UNKNOWN ведёт прежний StartOver.

Результат запуска всегда имеет `nativeVerified:false`. Для рабочей приёмки
после authentic current handshake требуется отдельная свежая обычная typed
project-inspection и освобождение lease. Startup не снимает `baselineRequired`.
`completion` хранит исторический исход UUID, а `panel` показывает текущую связь;
после owner restart прежняя completion не доказывает актуальную связь сама по себе.

Проверки среза — TEMP/VM/loopback, fake AE и упаковка. Они не подтверждают живой
CEP/AE, фактический Windows cold launch или перенос на недоступный второй host.
Computer Use в реализации и проверках этого среза не запускался.

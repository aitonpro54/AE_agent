# Диагностика транспорта AME

`inspect_ame_transport` — первый ограниченный этап AME adapter. Через уже
подключённую AE Agent CEP-панель он отправляет в точный AME specifier один
фиксированный BridgeTalk read payload и возвращает структурированный ответ.
Параметров `script`, операции, пути файла или произвольного кода нет.

```json
{
  "targetSpecifier": "ame-26.0",
  "expectedSessionNonce": "точный-ранее-наблюдённый-nonce",
  "timeoutMs": 5000
}
```

Specifier требуется точный, без выбора первой найденной версии. Перед отправкой
проверяется `BridgeTalk.isRunning`. Явные запуск, установка, перезапуск,
`bringToFront`, GUI и замена `BridgeTalk.onReceive` отсутствуют. Документированный
[`BridgeTalk.send(timeout)`](https://extendscript.docsforadobe.dev/interapplication-communication/bridgetalk-message-object/#send)
может автоматически запустить переставший работать target; атомарного
existing-only параметра нет. Поэтому preflight не исключает гонку закрытия
процесса. Для доказательства работы с тем же открытым AME отдельно нужны
совпавший прежний session nonce и проверенные PID/время старта процесса.

`send(timeout)` ждёт синхронный ответ; его Boolean не удостоверяет выполнение.
Проверяется только `onResult.body`: JSON schema, новый серверный `requestNonce`,
точный `appSpecifier` и время наблюдения. `message.timeout` задаёт TTL очереди,
а не deadline уже выполняющегося тела. После синхронного ожидания допускается
короткий bounded `BridgeTalk.pump()` до 250 мс. Pump обслуживает messaging
интерфейсы отправителя. Тайм-аут самого AE bridge — 30 секунд.

## Что читается

В AME payload читает прежний `$.global.aeAgentAMEProbeSessionNonce`,
`BridgeTalk.appSpecifier`, build number и ограниченные `reflect.methods`/
`reflect.properties` для app, frontend, encoderHost и доступного batchEncoder.
Списки ограничены 128 именами по 160 символов; metadata сообщает count,
truncated и доступность reflection. Отсутствующее имя в неполном metadata не
доказывает отсутствие API.

Из [EncoderHost API](https://ame-scripting.docsforadobe.dev/reference/#encoderhostscriptobject)
вызываются только доступные `isBatchRunning`, `getBatchEncoderStatus` и
`getFormatList`. Список форматов ограничен 128 значениями. Получение frontend и
encoderHost возвращает интерфейсы; encoder/preset wrapper не создаётся.
`getFormatList` принадлежит encoderHost: его наличие у frontend не предполагается.
Ни одного вызова add/encode/run/start, загрузки пресета, доступа к item очереди,
listener или записи файла нет. В AME globals ничего не записывается.

В AE читаются только путь/dirty проекта, `typeof` save/saveCopy/saveAsCopy и
ограниченные имена save/copy методов. Методы сохранения не вызываются. Это
metadata для выбора последующего решения; наличие функции не доказывает
безопасное сохранение несохранённых вариантов.

## Результат и неизвестный исход

`deliveryVerified:true` подтверждает совпавший ответ именно новой команды.
`warmSessionVerified:true` требует дополнительно совпавший переданный
`expectedSessionNonce`. Этот nonce diagnostic только читает; без уже полученного
session nonce поле остаётся false. `target_session_changed` не принимается за
warm proof. PID не возвращается из ExtendScript и сверяется контроллером отдельно.

`adapterReady:false` сохраняется при любом результате. Диагностика не доказывает
наличие native job ID, безопасное чтение чужой очереди, preset identity,
применение диапазона, независимые snapshots, кодирование или media proof.
Batch state относится ко всей очереди и не является статусом нашего задания.
Существующие [пассивные media/output checks](ame-passive-status.md) сохраняют
свои отдельные ограничения.

Sender удерживает один BridgeTalk объект в собственном AE global namespace
`aeAgentAMETransportDiagnosticV1` до terminal callback. Это служебное состояние
доставки, без изменения проекта. Unknown/timeout блокирует новую отправку.
Поздний callback сохраняется. Для сверки передайте тот же target/session и
точный `reconcileRequestNonce` из предыдущего результата:

```json
{
  "targetSpecifier": "ame-26.0",
  "expectedSessionNonce": "точный-ранее-наблюдённый-nonce",
  "reconcileRequestNonce": "UUID-из-неизвестного-ответа",
  "timeoutMs": 1000
}
```

Этот вызов только читает удержанный callback и pump до заданного timeout;
повторной send нет. Неверный nonce или target отклоняется. Состояние sender
локально для текущего AE scripting runtime; после его перезапуска нельзя
считать отсутствие slot доказательством судьбы старой отправки. Ошибка доставки
самого AE bridge возвращает `ae_delivery_unknown`; автоматического retry нет.
Никакие raw JSX, destructive, save или CEP grants этой регистрацией не меняются.

## Проверка

`npm.cmd run smoke:ame-transport` выполняет только offline strict ES3 parse
обоих generated payload и реального bridge wrapper, ES3 VM сценарии matching,
nonce/session mismatch, late callback, timeout/error, отсутствующий target,
blocked resend, metadata/getter calls и exact M100 typed registration.
В fake VM отсутствуют JSON и современные Array helpers; queue/save mutators
запрещены spy-функциями. Smoke не запускает Adobe приложения, daemon, MCP или
GUI и не является доказательством live транспорта.

Live результат записывается отдельно после scoped activation source в idle
daemon и единственного контроллера. Для первого milestone требуются cold и
warm структурированные ответы с разными request nonce, общим session nonce и
стабильным process identity; полная цепочка экспорта сюда не входит.

## Запуск и подключение AME

`ensure_ame_running` — mutating typed tool для внешнего приложения. Используется
только в отдельном server-proposed плане из одного шага: proposal → успешный
dry-run → действующее подтверждение CEP либо autonomous typed grant → run с
`allowMutations:true` и обычной checkpoint/edit-session защитой. Прямой вызов,
dev-admin, plain JSON authorization и повтор capability не разрешают запуск.
Консервативный существующий runner требует saved named AE project и копию
сохранённого файла (`COPYFILE_EXCL`). Эта копия не вызывает `app.project.save`,
не фиксирует dirty memory и не является снимком варианта. Путь и содержимое
рабочего AEP этим инструментом не изменяются.

Пример одного шага:

```json
{
  "summary": "Проверить запуск и read transport AME",
  "targetProject": { "file": "точный текущий сохранённый AEP" },
  "steps": [{ "tool": "ensure_ame_running", "args": { "timeoutMs": 10000 } }]
}
```

Installed metadata читается из bounded Adobe Program Files и registry App Paths;
проверяются canonical Adobe exe path, product/company metadata, действующая
Adobe Authenticode signature, file version и SHA-256. Несколько подходящих
установок требуют точного `installationId` из diagnostic результата. Несколько
AME процессов, неизвестные process paths и смена PID/времени старта блокируют
ready. Для существующего экземпляра вызов делает fixed inspect и проверяет
process identity до и после; запуска нет. Дополнительно можно передать ранее
проверенный `expectedSessionNonce`.

Если AME отсутствует, повторно проверяются отсутствие процессов и exe identity.
До start сохраняются fsync reservation и exclusive launch lock в ignored
`.codex-runtime/ame-running/`, затем собственный fixed startup JSX. Запуск
использует только `--console es.processFile` и этот файл; caller exe/args/code
невозможны. Startup пишет только собственный session nonce и свой result file;
не регистрирует listeners, не меняет очередь и не закрывает приложение.
Между последней проверкой отсутствия и process start остаётся внешняя гонка;
multiple-process read-back блокирует её принятие.

Unknown сохраняет reservation/lock и запрещает новую попытку. Для явной
сверки того же запуска создайте новый bounded proposal с
`reconcileAttemptId` из ответа и прежним `installationId`: проверяются original
process identity/session и свежий transport, без start. Если original процесс
сменился или результат неизвестен, блокировка остаётся. После подтверждённого
transport lock освобождается по exact attempt ownership; последующее
самостоятельное закрытие приложения не стирает историю попытки.

`ready:true` означает только `transportVerified:true`. После выполнения runner
отдельно вызывает `inspect_ame_transport` с новым request nonce и проверяет
стабильность процесса; server-attached read является обязательным semantic
proof. Поля `nativeQueueOwnershipVerified:false`, `adapterReady:false`,
`externalApplicationMutation:true`, `projectContentMutation:false` и
`checkpointScope:"on_disk_saved_file"` остаются явными.

`npm.cmd run smoke:ame-running` — offline fake adapters/strict ES3, включая
authorization negatives, absent/existing/ambiguous/races, durable unknown,
read-only reconciliation и startup scope. Он не запускает AME или AE.

Windows metadata queries запускают штатный Windows PowerShell 5.1 с отдельным
окружением: унаследованный `PSModulePath` удаляется только у ребёнка, затем
используются `$PSHOME\Modules` и native Security manifest. Это исключает
несовместимые модули pwsh 7 из Codex runtime. Execution policy сохраняется;
ошибка native import или неподтверждённая Adobe signature блокирует discovery.

ProductName допускает точные `Adobe Media Encoder` и `Adobe Media Encoder YYYY`,
если год совпадает с непосредственной папкой установки внутри canonical Adobe
root. Только signature `Valid` с Adobe signer даёт launchable installation.
`discoverInstalled()` сохраняет массив trusted installations; отдельное свойство
`.diagnostics` содержит только non-launchable metadata (path/version/SHA/identity,
signature status/message). Для JSON чтения передавайте его отдельным полем.
Подходящий exe с `HashMismatch`/`UnknownError` даёт
`ame_running_installation_unverified` и `installationDiagnostics` в typed ответе,
а не `installation_missing`; attach/start в этом случае блокируются.

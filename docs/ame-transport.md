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

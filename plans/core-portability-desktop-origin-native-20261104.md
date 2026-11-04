# Desktop: подтверждение configured client, Origin и native inspection

4 ноября 2026. [Evidence](../docs/evidence/core-portability-desktop-origin-native-20261104.json). Исходный commit: `2ec9671b6a41817bf7d6e4d432eb78f961fbbaf4`. Установленный пакет `1f8c…` не изменялся. Этот checkpoint оформляет уже полученный результат; повторных live-действий при оформлении нет.

## Progress

- [x] После fast-forward проверены 71 evidence key, 215 файлов source snapshot, 33 supplemental-файла и 26 сохранённых журналов. Покрытие осталось 69/71, две проверки Titles удержаны. Тесты не запускались повторно.
- [x] До native inspection проверены descriptor/client и цепочка транзакций `a88c → 9157 → 82b`, receiver из трёх записей, отсутствие ledger, origins/config, 39 файлов preferences и 9 legacy-файлов.
- [x] Настоящий configured client PID 9260, birth `16:27:25.1066450Z`, parent 7060 использует установленную project entry пакета `1f8c…`.
- [x] Первый `core_status` через этот клиент запустил owner PID 1652, birth `18:42:22.7570770Z`, parent 9260. CEP подключилась без reload.
- [x] При `physical.peer.connected=true` поле `physical.peer.origin` содержало строку `file://`.
- [x] Выполнена цепочка contract → acquire generation 1 → connect → одна typed project-inspection → finally release.
- [x] Receiver вырос с 3 до 5 записей. Исходные 2325 байт сохранены; новая пара begin/complete относится к `inspect-84cb3ab8-f18f-48ab-92a9-308573323861`.

## Decision Log

Клиент 9260 уже существовал в начале проверки после пользовательского подтверждения подключения десктопа. Механизм его пересоздания не наблюдался. Контроллер не перезапускал клиент или app-server и не создавал ручной stdio-клиент либо sidecar. Parent app-server 7060 остался прежним. Оформление checkpoint выполняет тот же назначенный writer; новый исполнитель или live-контроллер не привлекался.

Origin подтверждён полем `physical.peer.origin` подключённого peer. Начальный Origin без peer был JavaScript null; после подключения наблюдалась строка `file://`. Поле `resourceProvider.origin=null` не использовалось как доказательство. Owner lifecycle boot `09de97f6-679f-4d19-bdfe-54fd9a124d1c` отличается от attachment boot `f9f4982c-8b78-48d1-8d89-574f7180ec5e`.

В inspection переданы только moduleId, contractId и target `{}`. Lease удерживался менее 0,4 секунды, token не публиковался. Результат содержит `authority=false`, `continuity=false`.

Успешная активация относится к пакету `1f8c…`. Активация промежуточной установки CDF/9157 не выполнялась. Предыдущие apply/stop/resume/native-команды не повторялись. Итоговую двухмашинную матрицу P1–P8 после проверки receipt завершает координатор.

## Validation

Сохранённые final status/diagnostics показывают owner ready, peer connected, holder=null, отсутствие pending, UNKNOWN, faults и unresolved. Проверены hash chain пяти записей receiver и точное сохранение исходного префикса; ledger отсутствует.

Сохранены 221 прежний файл установки, истории, архивов, транзакций и releases; единственное изменение среди 222 исходных файлов — append receiver. Descriptor/client/config, 7 файлов CEP, 39 preferences и 9 legacy-файлов совпадают с baseline. Процесс AE 28156 и его birth прежние; native inspection вернула пустой несохранённый проект AE 26.3x87.

При оформлении checkpoint файловая проверка `audit-checkpoint.cjs` завершилась `PASS_READONLY_CHECKPOINT_AUDIT`: все ссылки evidence в manifest соответствуют SHA, 71 ключ и source coverage не изменены, сохранённые 26 журналов проверены без запуска тестов. Шесть текущих и исторических значений credentials приватно сверены с пятью публикуемыми файлами; совпадений и private token/MAC-полей в evidence нет. SHA evidence: `669ca55300450ffe49ea27e4b608616c4a3c90098d994607d4313bace5ba90ac`.

Новых install/build/tests/restart/save/mutation/reset/adoption нет. Coverage source осталось 69/71. Checkpoint подтверждает наблюдённое состояние; дальнейшая непрерывность подключения и глобальная сертификация релиза им не заявляются.

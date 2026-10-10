# Самостоятельное ревью пути экспорта AME

10 октября 2026 года пользователь явно поручил продолжить без GPT Pro и Flash,
провести ревью в текущем чате и довести цепочку до рабочего экспорта. Это снимает
требование внешнего Pro-review для данной задачи; действующие CEP/runtime grants
и подтверждения сохраняются. Официальный установщик и GUI-автоматизация исключены.

## Выводы ревью

1. Сначала доказать способ кодирования конкретного AEP и связь его native событий
   с уникальными source/output. Общий `runBatch` без проверки чужих заданий не
   допускается. Фиксированное live-чтение подтвердило `getExporter` и его интерфейс;
   `exportItem`, добавление listeners и кодирование этим чтением не выполнялись.
2. Полная сохранность undo-history и защита от враждебного процесса того же
   пользователя добавлены нами сверх исходной приёмки. Они не являются обязательным
   условием нового bounded fixture-контракта. Обязательны сохранность исходного
   пути, видимости, unsaved edits и независимость двух снимков, включая зависимости.
   Предыдущие закрытые guards не ослабляются скрыто; другой writer требует отдельного
   явного контракта и проверки на собственных тестовых проектах.
3. `queueInAME(false)` — кандидат для программной доставки, а не native AE render.
   Он не начинает encode, но отправляет QUEUED items и применяет последний AME preset.
   Сохранность path/dirty и независимые временные AEP пока не доказаны. До проверки
   нельзя считать этот путь готовым stage или отправлять проект пользователя.
4. `HashMismatch` не объяснён. Default signature gate остаётся. Возможное исключение
   должно быть отдельным ручным контрактом для точной installation identity/hash,
   без общего `allow-unverified`, подмены бинарника или повторной неизвестной отправки.
5. Native child с собственными fixtures может проверить `AEGP_SaveProjectToPath`,
   но не получает право записи из parent ACK. Это отдельный typed scope, checkpoint,
   подтверждение и точная привязка процесса/проекта. Hot-load в dirty original host
   пока не доказан; успешный child-save не заменяет доказательство original capture.

## Следующий проверяемый блок

Root выполняет ревью и остаётся единственным live-controller. Luna/ae_operator
добавляет только exporter reflection и offline smoke; Sol/ae_specialist читает
SDK и исследует минимальный snapshot route. Flash и внешние модели не вызываются.
После локальных проверок — scoped bridge-only reload и один read-only transport
probe с durable attempt; затем решение о конкретном writer/submit fixture-контракте.
Неизвестный результат не повторяется.

Root проверил fixed native fixture и AME wrapper adapter. Старый unsigned writer
остался закрыт; новый путь работает только со своими capture/stage children и
подписанными phase grants. Private result cache плюс отдельный file/process read
не принимают echo JSON как доказательство snapshot. Enqueue резервирует intent
до BridgeTalk и проверяет source/output/range/EPR/процесс отдельным status read.
Приложение выдаёт own UUID, не выдумывает native ID. Общий start закрыт, native
completion и media proof отделены. Проверки offline не принимаются как live export.

Manual fixture run остановился на EPERM установки AEX. Own AEX затем скопирована
с UAC и exact hash verification. У ручной CEP-операции нет external transport
receipt: текущий recovery требует его и не поддерживает fixture adoption. Root
не создаёт фиктивный transport receipt и не объявляет историческую мутацию
`not_started`. Исправление — отдельный audited disposition исходного unknown,
с неизменными журналами и запретом повторения. Root own review сохраняет strict
authorization capture, но lookup после будущего restart использует свежие current
actor/runtime и неизменный original receipt. Backend проверяет loaded CDP source,
canonical bytes, private signature и exact старые Dynamic Link hosts. Capture не
освобождает guard; durable consumption и audit предшествуют disposition.

## Приёмка

Полная цепочка двух вариантов ещё не выполнена. Отражение интерфейса и offline
smoke не доказывают поддержку AEP, ownership очереди или успешное кодирование.
Фактические результаты следующего блока записываются в план и ignored receipts.

## Проверка exporter

18 offline групп прошли. Root перезапустил только idle bridge, не AE/AME/CEP.
Фиксированный запрос доставлен; ожидаемый M1 nonce отклонён как сменившаяся
AME-сессия. В актуальном exporter отражены `exportItem`, `exportSequence`,
`exportGroup` и native свойства `encodeID`/`encodeSuccess`; `encodeProject` нет.
Это не проверка AEP-поддержки, индивидуального запуска или сохранности очереди.
Пользователь сообщил, что удалил очередь; сохранённый `batch.xml` остался старым
и не заменяет свежий native/manual empty-queue baseline перед отправкой.

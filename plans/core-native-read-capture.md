# Получение оригинального ответа незавершённого чтения

28 октября 2026. Baseline `cd95b26`. Это отдельный ограниченный инженерный
этап после исправления ES3. Текущее состояние и история —
[native ES3/recovery](core-native-es3-recovery.md).

## Цель и граница этапа

Получить проверяемое доказательство исхода единственного ранее отправленного
`project-inspection/inspect` без повторного выполнения JSX. Этот этап собирает
доказательство; он не снимает UNKNOWN, не завершает команду и не открывает lane.
Recovery disposition, изменение reader, установка нового пакета и новый native
dispatch в этот этап не входят.

Установлен пакет `6c94efb678b9a56861b18e762076da7b38824bbbe30233770c4133ff81edc696`.
Оригинальная команда — `inspect-2a2b1fcf-fa87-46fd-a990-0cd26689aa1c`.
Receiver journal содержит `origin → begin → unknown`; его исходный SHA-256 —
`ac263cde4892448044374d12396435142d834daf31659bb85b77b05a1696a78b`.
Proof MCP child завершён штатно, exit 0; пустой receiver owner сохранён.
Факт отсутствия процесса не доказывает завершение AE callback.

## Progress

- [x] По исходникам подтверждён существующий путь `dispatcher.recover()`:
  при сохранённом result он отправляет cached completion без `evalScript`.
- [x] Panel вызывает recover до проверки `laneClosed`. Поэтому отдельный
  приёмник может получить ответ, оставляя lane закрытым.
- [ ] Подготовлен и проверен пакет единственного review плана этого этапа.
- [ ] Реализован отдельный collector и отрицательные проверки.
- [ ] Root получил оригинальный authenticated ответ либо зафиксировал точную
  причину отсутствия доказательства. UNKNOWN в обоих случаях сохранён.

## Предлагаемый контракт

1. Отдельный штатный диагностический operator проверяет всю установленную
   release closure до импорта установленного кода. Он не запускает Broker,
   обычный runtime, `createHttpPeer.submit` или host evaluator.
2. Pure inspect строит точный digest: descriptor/package/installation/origins,
   receiver identity и hash-chain журнала, original command/binding/pins/payload,
   owner markers, ledger obligations и root-managed process provenance.
   Неизвестные obligations, иные команды, изменения bytes, links/reparse points,
   неверные pins или недостаточное наблюдение процессов закрывают операцию.
3. Capture требует совпадения ожидаемого digest. Он получает exclusive install
   и broker gates, повторяет проверки и подтверждает отсутствие обычного runtime
   и слушателя на 3457. Receiver owner не захватывается, не удаляется и не меняется.
4. Приёмник слушает только `127.0.0.1:3457`. Host/loopback/single Origin
   `null | file://`, роли, fresh challenge, origin binding, MAC и последовательность
   проверяются по действующему контракту. Pins соответствуют текущей старой
   installation; challenge также связывается с capture purpose, receiver identity,
   original command digest и journal-tail digest. Credentials не выводятся и не
   копируются в evidence.
5. Есть только challenge/link/complete; link возвращает `laneClosed:true`.
   Poll, submit, source ingress и любые исполняемые кадры отсутствуют.
   Root использует обычную кнопку подключения установленной панели. Сохранённый
   результат отправляется через recover; нет результата — явная остановка,
   нет latch — остановка по `laneClosed` до polling.
6. Принимается только payload исходной команды с exact original binding и pins.
   Проверяются bounded JSON и строгий terminal failure profile:
   `readFailureVersion:1`, `outcome:"rejected"`,
   `code:"host_registry_unavailable"`. Это пока ожидаемая гипотеза, а не
   установленный факт. Иное содержимое не объявляется доказанным исходом.
7. Authenticated transcript и проверенные bindings сохраняются локально в
   отдельной durable transaction. MAC остаётся доказательством канала; секреты
   в transcript отсутствуют. Статус фиксации подтверждается read-back и fsync.
   Collector не выдаёт completion ACK: panel latch сохраняется.
8. Исходные journal/origins/owner/descriptor/CEP/config остаются byte-identical.
   Обычный runtime не запускается. Внештатная запись, timeout, конфликт receipt,
   filesystem/process ambiguity или неполный read-back сохраняют закрытое
   состояние и не вызывают автоматический retry/cleanup/rollback.

## Decision Log

- Поручение на ремонт и установку покрывает получение технических доказательств,
  но не разрешает обход UNKNOWN или произвольное принятие receipt.
- Внешнему review передаются только план и allowlisted source. Реальный
  descriptor, токены, journal, raw authenticated transcript, browser state и
  пользовательские AEP в пакет не входят.
- Reviewer должен проверить возможность доказать scope и завершение callback,
  а также отделить это от физической settlement и будущей recovery authority.
- Даже валидный captured failure сам по себе не открывает lane. Следующее решение
  о versioned disposition требует отдельного технического контракта. Нет
  generic reset, удаления UNKNOWN, нового origin или повторного inspect.
- Panel MAC доказывает канал обладателя panel credential; он не является подписью
  AE и не заменяет parent/control authorization. Callback settlement требует
  согласованной provenance исходного managed child, command/store/channel,
  позднего correlated completion и проверенной fixed dispatcher closure.
- Сохранение authority после ротации credentials не решено. Historical descriptor
  уже присутствует в installer transaction, но transaction не имеет отдельного
  committed marker. Поиска backup по hash недостаточно. Disposition/reader и
  последующий ACK отложены до проверенного resolver/chain контракта.
- Десктоп ↔ MSI: пути обнаруживаются из проверенной installation, без веток по
  имени компьютера. Доказательства и authority остаются локальными машине.

## Validation и приёмка

Проверки должны использовать изолированные fixtures и настоящий dispatcher:

- cached original completion отправлен, `evalScript` вызван 0 раз;
- отсутствие result/latch, неверный asset/phase/payload/command/binding/pins,
  MAC/replay/Origin/Host/role, чужая installation и иной failure закрыты;
- неизвестный/live process, занятый порт/gate, изменённый journal/descriptor,
  ledger obligations, symlink/reparse и torn writes закрыты;
- ACK и executable command не выдаются ни на одном пути;
- journal, owner, origin, descriptor, CEP, config не меняются даже при успешном
  capture; UNKNOWN остаётся исходным, latch не удаляется;
- ошибка durability не получает успешного read-back, повтора и скрытого cleanup;
- validation map выбирает собственные адресные tests и действующие consumers;
  boundaries, syntax и diff проходят. Полная release-проверка не заявляется.

Live приёмка ограничена одним root-owned запуском collector и одним обычным
подключением существующей панели. Нет AE restart, eval, нового native dispatch,
изменения AEP, replay, установки или включения MCP config.

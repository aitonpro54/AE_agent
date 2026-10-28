# Получение оригинального ответа незавершённого чтения

28 октября 2026. Baseline `cd95b26`. Это отдельный ограниченный инженерный
этап после исправления ES3. Текущее состояние и история —
[native ES3/recovery](core-native-es3-recovery.md).

**Итог A, 17:38 Asia/Yekaterinburg:** ручной «Подключить» доставил original cached
receipt. Root проверил SHA/MAC/bindings и неизменность 168 protected files.
Result строго `host_registry_unavailable`; producer child29592 exit0, ACK0,
original journal/receiver owner/UNKNOWN сохранены. Собственные diagnostic gates
штатно освобождены. Ниже активный 10-minute wait — история, collector уже закрыт.

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
- [x] Подготовлен и проверен пакет единственного unified review A–D; получен
  conditional go с шестью локально разобранными findings. Реализация A начата
  отдельным source writer; root сохраняет Git/install/live ownership.
- [x] Реализован отдельный builtin-only collector; freeze03, 20 scoped PASS,
  boundaries21/syntax/diff и independent source ACCEPT. Actual production
  inspect03 PASS: cache/CEP/provenance/PS5.1/Get-Item/CIM/port checks.
- [x] Root получил оригинальный authenticated ответ либо зафиксировал точную
  причину отсутствия доказательства. UNKNOWN в обоих случаях сохранён.

Первая actual capture попытка завершилась deadline без receipt: средство CU
отклонило кнопку вне bounds основного окна до ввода. Root развернул AE через
наблюдаемое системное меню; project/raw/eval/ACK действий 0. Исходный UNKNOWN
сохранён. Собственные gates диагностического child33248 удержаны по fail-closed
контракту. Подготавливается отдельный строгий retirement этих двух markers
по managed-session/proof/CAS; receiver owner/journal он не меняет. Повторного
native dispatch нет. Capture result по-прежнему неизвестен.

Продолжение: private helper retirement прошёл 6 fixture tests/source ACCEPT,
pure inspect и exact-proof apply. Архивированы только два own diagnostic markers
первой попытки в transaction `0a89bd5e-1d25-4753-b063-0fea875825f2`; исходные
receiver owner/UNKNOWN/journal сохранены. Новый production inspect04 снова PASS
с тем же proof `a6af1095…d34b51`.

28 октября, около 17:30 Asia/Yekaterinburg: evidence-only collector ожидает
один ручной «Подключить»: child29592, transaction
`3c633115-a426-4a87-ace3-8ade298a99b0-native-read-capture`, bounded wait 10 минут.
Он держит собственные install/broker gates; ни runtime, ни installer параллельно
не запускать. Windows CU не может направить клик во вложенный CEPHtmlEngine,
CDP8870 недоступен; пользователь получил конкретный ручной шаг. UI reload/
eval/native/ACK не выполнялись. При завершении/timeout читать actual session
`snapshots/core4-live-proof/VI-native-read-capture-20261028/manual-live-1793190620276/`,
не угадывать исход по этому временному статусу и не снимать gates вручную.

## Предлагаемый контракт

1. Отдельный штатный диагностический operator проверяет всю установленную
   release closure до импорта установленного кода. Он не запускает Broker,
   обычный runtime, `createHttpPeer.submit` или host evaluator.
   Отдельно проверяется фактически установленная CEP closure: package files и
   generated installation binding соответствуют тому же descriptor; неизвестные
   дополнительные файлы, links/reparse points и несовпадения закрывают capture.
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

- Actual preflight обнаружил два адресных дефекта collector, исправленных
  локально: штатный broker/artifacts cache не является execution obligation;
  JSON root array в выбранном Windows PS5.1 должен сохраняться без nested cast.
  Cache проверяется по exact core manifest/verified retained release как данные;
  неизвестные файлы/stage/reparse закрыты. Реальный PS5.1 regression использует
  temp Get-Item и test-only CIM stub; actual root inspect отдельно проверил CIM.
- Readiness marker публикуется после actual listen и связывает exact proof.
  Root проверяет доступность UI в границах основного окна до следующего listener.
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

Actual receipt: transaction `3c633115-a426-4a87-ace3-8ade298a99b0-native-read-capture`,
SHA-256 `c398eab44728be5b5b3d981a8b92d597a8368f3f2a58d47e831b357348182907`.
Proof `a6af1095b43cfd7723ff7983565d332d59f9c468662da34a77659e7206d34b51`.
Transcript ровно challenge/link/complete, fresh collector channel отделён от
original dispatch channel. Result version1/rejected/host_registry_unavailable
совпадает с fixed early-return wrapper; собственная operation не запускалась.
Это bounded settlement evidence в trusted local storage model, не подпись AE,
не успешная inspection, не continuity или grant. Independent evidence audit —
SOURCE GO для conditional B, без authority apply.

Локальные полные данные без credentials в новых evidence:
`snapshots/core4-live-proof/VI-native-read-capture-20261028/root-capture-verification-01.json`
и `manual-live-1793190620276/`. Raw receipt остаётся только в local installation
transaction, в Git/Argon не копируется. Source A — commit `34584de`; private
retirement helper 6 fixtures/source ACCEPT/exact proof apply завершён, исходный
receiver journal SHA `ac263cde…a78b` неизменен.

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

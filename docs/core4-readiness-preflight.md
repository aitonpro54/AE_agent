# Core4 — control-only readiness перед проверкой AE

27 октября 2026. Source-only проектирование после [ручного CEP/JSX-прототипа](../plans/core-4.0.0-cep-project-safety.md). Это контракт будущего диагностического чтения и порядок preflight; endpoint ниже **не реализован и не установлен**. Документ не разрешает start/reload/bootstrap, изменение config, выдачу credentials, открытие AEP или исполнение JSX.

## Разделение диагностики и исполнения

Состояние владельца очереди можно прочитать до project-incarnation proof: такое чтение не обращается к AE DOM и не исполняет команды проекта. Project identity, grants, ownership/checkpoint и подтверждение остаются условиями последующего исполнения. Диагностический доступ не вызывает `Broker.connect` и не создаёт lifecycle binding.

Имеющиеся seams не дают полного runtime census:

- [Receiver completion](../core4/core/receiver.js) подтверждает одну известную команду своего store; это не перечисление всех pending/UNKNOWN.
- [Dispatcher physicalPending](../core4/integrations/cep/host-dispatcher.js) относится только к данному экземпляру dispatcher; `false` не описывает legacy или сторонние отправки.
- [Completion store](../core4/integrations/cep/completion-store.js) имеет свой identity и закрывает admission при fault/UNKNOWN. Его открытие создаёт каталог и owner marker; для статусного чтения чужого store оно не применяется.
- [Transport](../core4/integrations/cep/transport.js) требует lifecycle до `channel.connect`. Этот execution gate сохраняется. [Stdio](../core4/core/stdio.js) пока создаёт Broker без production private embedding; его новый state directory не описывает общую очередь.

Поэтому новый synthetic provider, serializer или перенос test TCP не заменяют наблюдение действующего владельца. До получения actual runtime/provisioning фактов новую production-реализацию канала не выбираем.

## Требования к будущему статусному свидетельству

Рабочее обозначение нормализованного запроса: `readiness.v1.snapshot({requestId, nonce})`. Это не имя существующего инструмента. Уже доступный authenticated API можно использовать, если его семантика даёт эквивалентное доказательство и ограничения явно записаны.

Запрос и ответ аутентифицированы независимо от project-bound execution authority. Свидетельство связывает request/challenge, origin владельца, runtime identity/pins, installed identities при доступном независимом наблюдении, epoch подключения, receiver-store identity, момент наблюдения и точное покрытие. Local observed time сам по себе не превращает cached или непривязанный ответ в fresh proof.

| Область | Авторитетный источник | Обязательное ограничение |
| --- | --- | --- |
| pending/inflight/active-edit | Действующий владелец соответствующей очереди | Названы очереди и origin; новая пустая очередь не описывает старую |
| durable ongoing/UNKNOWN | Уже открытый журнал/store его владельца | Сохранены original dispatch bindings и unresolved outcomes; никаких reopen/reclaim ради чтения |
| physical pending | Действующий dispatcher | Указано, какие отправки он действительно наблюдает |
| legacy/shared fences и reservations | Владелец реально общей lane | Отсутствие provider не считается пустым census |

Для каждой области состояние наблюдения задаётся явно: `observed`, `unobserved`, `denied`, `stale` либо `partial`. При `observed` всё равно проверяется, достаточно ли заявленного покрытия. Missing/неизвестное поле не нормализуется в `[]`, `0`, `false` или `idle`.

Snapshot не захватывает ownership, не выпускает grant, не снимает fence, не делает reset/reconcile и не подтверждает no-effect/exit. Перед будущим send требуется свежая отдельная проверка условий исполнения.

## Следующий ограниченный live-preflight

Нужен отдельный live scope: текущие инструкции сохраняют запрет live/CEP/CDP/bootstrap/native factories в offline-блоке. Подготовка файла AEP не запускает этот этап.

1. Единственный контроллер устанавливает identity уже действующей установки/владельца и доступность его authenticated статусного API. Значения credentials не выводятся, не копируются между source/runtime и не переиздаются.
2. Если такой API существует, получает correlated свежие сведения и записывает их реальное покрытие. Никакого AE evaluate, открытия AEP, запуска/restart служб, reload панели, config redirect, reset/recovery/reconcile или новых mutation receipts.
3. Если API/owner/аутентификация отсутствуют, фиксирует конкретный разрыв и `unobserved`; отсутствующий node listener не объявляет idle/retirement. Другой инструмент не используется для обхода отказа.
4. Только по этим данным выбирается последующий installation/source IPC scope. Отдельный control-only peer потребует собственного review, runtime/auth provisioning и установки; сам по себе он не наблюдает legacy очередь.
5. Когда shared-lane факты получены, продолжаются host-specific проверка узкого synchronous участка, ownership/checkpoint и verifier ручной политики из focused плана. Тестовая AEP-копия уже выбрана; повторно запрашивать её путь не требуется.

## Подготовленная цель

Пользователь указал сохранённый `titr_01_ame_product_20261015.aep`. Его byte-copy и manifest находятся в ignored `snapshots/core4-host-validation/022dad73-ca31-4013-88fe-bf001ae91011/` рабочего корня. Полные пути, размер, mtime и SHA-256 зафиксированы в разделе подготовки цели [focused плана](../plans/core-4.0.0-cep-project-safety.md).

Копия сохранённого AEP не включает несохранённое состояние уже открытого AE и не является runtime checkpoint. Comp/layer IDs, supported styles, assets и реальное состояние host пока не наблюдались.

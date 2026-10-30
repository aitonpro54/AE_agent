# Владение runtime Core/CEP

30 октября 2026. Решение для [этапа устойчивости](../plans/core-cep-lifecycle-20261030.md).
Это целевой контракт; installed manual3f92 ещё использует per-stdio lifetime.

## Обоснование

`runtime/stdio-entry.js` создаёт Broker и HTTP peer при каждом MCP startup;
`core/stdio.js` закрывает переданный facade при EOF. Порт3457 и production state
при этом общие. Несколько чатов — независимые stdio clients одного приложения,
а execution owner должен быть один на installation. Reconnect панели управляет
только authenticated peer, он не выбирает controller чат.

`completion-store.js` сохраняет owner marker при ambiguous lifetime и не имеет
автоматического orphan recovery. Это правильный fail-closed исход неизвестности,
но normal restart нуждается в штатном доказуемом восстановлении. Старые exact
operators дают материал guards/tests, а не готовый универсальный lifecycle.

## Решение

Один installation owner содержит единственный существующий Broker, receiver,
native reservation provider и CEP endpoint. Тонкий stdio adapter не открывает
execution stores и не держит CEP credentials; он соединяется с этим owner.
Ни workflow broker, ни новый SDK не добавляются.

Для R2 выбран installation-scoped Windows named pipe с ограниченным
пользовательским доступом и install-scoped control-role аутентификацией
(controlToken, отдельный domain separator для IPC; panelToken не принимается).
Точная ACL/peer identity реализация ещё должна быть проверена, transport сам по
себе не даёт authority. Перед production wiring фиксируются:

- bounded length/framing, deadlines, backpressure и один reply на request;
- fresh challenge/MAC, boot identity, authenticated attachment, sequence/replay
  guards; app/thread metadata не принимается как доказательство клиента;
- проверенный exact installed entry/Node/package и election под единым
  cross-process startup gate; второй starter только attaches или отказывает;
- несовместимый/чужой endpoint не вытесняется; отсутствие listener не равно
  отсутствию живого owner; PID без exact birth недостаточен;
- status/discovery не захватывают controller, stateful методы требуют explicit
  acquire; transfer/release — exact token/generation и доказанная quiescence;
- accepted call хранится у owner до durable результата. Разрыв client socket
  не отменяет уже отправленную AE-команду и не выпускает lease;
- план/proposal/evidence ownership также привязывается к controller generation,
  чтобы новый attachment не мог случайно исполнить артефакт прежнего владельца;
- original result/reconciliation допускается отдельным узким recovery путём,
  без присвоения generic send authority; потерянный IPC reply не повторяет run.

Owner boot после crash сначала читает и проверяет durable состояние. Нельзя
создать свежий in-memory lease и объявить idle при старом pending/UNKNOWN.
Controller lease — дополнительная сериализация, не замена private brands,
grants, host identity, checkpoint, receiver intent/receipt или fences.
Нынешний installation descriptor содержит оба role secrets: до IPC wiring
нужно определить отдельный credential seam. Текущее чтение общего descriptor
само по себе не доказывает изоляцию CEP credentials от stdio adapter.

## Альтернативы

| Вариант | Решение |
| --- | --- |
| Per-chat Core плюс retries | Отклонён: не решает захват общего endpoint и EOF общей очереди |
| Per-chat Core с kill/takeover | Отклонён как штатная модель: переносит crash/owner recovery в каждую смену чата |
| Одна фиксированная «правильная» беседа | Отклонён: привязывает продукт к истории клиента и не решает restart |
| Один Core owner с тонкими attachments | Выбран: единое durable состояние и независимое время жизни клиента |
| Несколько brokers, перенаправление ports или новый SDK | Не требуется для текущей задачи |

## Первый компонент и граница доказательства

`core4/runtime/controller-lease.js` — private state machine только памяти процесса:
opaque object handles, boot/generation, явный acquire/renew/release, quiescent
detach, draining принятой операции, expiry и sticky fence. Объект нельзя
восстановить из JSON. Функцию не экспортируют MCP tools, не включают в текущий
source-package и не используют для выдачи project grants.

Обычный TTL не разрешает takeover. При pending outcome старого вызова нужно
дождаться/выяснить через original flow; UNKNOWN не очищается API этого компонента.
Отдельно owner обязан учитывать Broker.running/reconciling/controlPending,
physical queue и durable recovery перед передачей lease.

До R2 этот компонент не исправляет installed restart; до R3 нет штатной смены
AE adoption; до R4 панель не получает новое reconnect поведение. Настоящий
configured-client/CEP/AE proof требуется в R5 отдельно от TEMP tests.

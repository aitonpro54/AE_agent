# R2c2: штатный запуск installation owner

30 октября 2026. Следующий source-блок после
[транзакционной установки](core-cep-r2-installation-20261030.md).

## Контракт

Thin client обслуживает MCP initialize/list без owner. Первый explicit запрос
делает authenticated attach. Bootstrap разрешён только при ENOENT/ECONNREFUSED
до первого socket connect. Timeout, permission, преждевременный close, неверные
MAC/identity/pins не доказывают отсутствие owner и не запускают новый процесс.

Перед spawn повторяется полная проверка client descriptor/release/Node/root;
descriptor обязан точно совпасть с исходным. При обновлении установки старый
client отказывает, а не переключает свою release. Запускаются только проверенный
Node, фиксированный owner-entry и фиксированный installation.json. Client не
читает полный installation descriptor или state, это обязанность owner.

Spawn: shell:false, windowsHide:true, detached:true, stdio:ignore, cwd внутри
проверенной release. Environment ограничен необходимыми системными каталогами,
без NODE_OPTIONS/NODE_PATH/preload, общего PATH и credentials. Handlers error/spawn
ставятся сразу, unref выполняется после успешного spawn. EOF до spawn отменяет
bootstrap, EOF после spawn не завершает owner.

Actual Windows child наблюдение потребовало explicit empty значения для PATH,
HOMEDRIVE/HOMEPATH/LOGONSERVER/SYSTEMDRIVE/USERDOMAIN/USERNAME/USERPROFILE и
NODE_V8_COVERAGE: простого отсутствия этих keys в opts.env оказалось недостаточно.
Системные каталоги передаются whitelist; остальные значения не наследуются.
Происхождение Windows augmentation не объявляется доказанным этим тестом.

Все concurrent запросы одного client разделяют один connector/launch latch.
Неуспешная попытка старта не сбрасывает latch; сброс возможен только после
authenticated attach. После spawn допускается ограниченное ожидание attach,
повторяется лишь проверка отсутствия endpoint. Auth/unknown failure прекращает
ожидание. Повторный spawn, kill, fallback и повтор принятого AE request исключены.

Одновременные clients могут создать contenders. Единственный runtime определяется
общим install.lock и ранним резервированием HTTP до stores; проигравший starter
завершается, client ожидает authenticated winner. Новый orphan-prone launch.lock
не вводится. Отсутствие pipe разрешает только bootstrap: durable admission owner
сохраняет pending/UNKNOWN/fault. Переживание Windows/MSIX job проверяется отдельно
на установленном runtime; detached сам по себе этого не доказывает.

## Progress

- [x] Ограниченный read-only review дизайна: blockers нет при соблюдении контракта.
- [x] Source реализация и адресные adversarial tests.
- [x] Selected93/93PASS, source review ACCEPT; milestone commit.
- [ ] Установленная Windows/job проверка в R5.

## Decision Log

- Новый старт не повторяет вызов, чей ответ потерян. Каждый последующий request
  остаётся отдельным пользовательским запросом, без восстановления send authority.
- Descriptor rotation обрабатывается отказом старого client; новый config вводится
  штатным MCP startup после завершённой установки.
- Временный отказ bootstrap не превращается в polling-цикл процессов.
- После тяжёлой sync verification нужен event-loop checkpoint для queued EOF.
  Затем bounded16KiB raw descriptor CAS, root/closed check и fixed spawn. Это
  также отказывает queued config rotation, без второго длинного hash window.
  Tiny filesystem check/spawn race не объявляется atomic OS sandbox.

## Validation

Final selected93PASS: routing5, client-entry12, owner-runtime18,
owner-installation18, IPC25, process2, launcher12, transfer1. Boundaries35/live0,
syntax и diff-check PASS. Source/dependency hashes unchanged during final checks;
evidence в `snapshots/core4-lifecycle/20261030/R2c2/summary.json`, selection и logs.
Launcher key `5486a671c76dce2858f18afabe59e925ec940246c7f266b55d4577029b6c7b9d`.

Проверены concurrent→spawn1; EOF до spawn и queued во время Node hash→0;
descriptor rotation до bootstrap и queued во время verify→refuse;
auth/pin/permission/timeout→spawn0; failed latch→no respawn→authenticated reset;
EOF после spawn; exact args/cwd/environment фактического child; bounded
fixture-winner/contender attach и accepted-call loss→resend0.

Initial fixture bugs исправлены до final packet; это не production failures.
Один TEMP IPC-only fixture18948 остался после ошибочного cleanup marker. Попытка
combined kill/rm была отклонена automatic review с единственным reason `blocked
by policy`, execution0; её не повторяли. Root восстановил exact fixture identity
из challenge, подтвердил synthetic-secret authentication/package/boot/PID через
fixture status и завершил его штатным `fixture_shutdown`. Fresh CIM: PID absent.
Partial TEMP `core4-launcher-1lZBHw` сохранён как evidence; production endpoint,
MCP/CEP, AE и installation не затрагивались. Это не production discovery/TOFU.

TEMP fixture не импортирует Broker/HTTP/AE и использует свой synthetic lock;
он не доказывает Core election. Actual install и Windows/MSIX job survival
остаются в R5. Deferred integrations не объявляются пройденными; full release0.

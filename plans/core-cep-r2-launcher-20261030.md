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
- [ ] Source реализация и адресные adversarial tests.
- [ ] Selected validation, source review и milestone commit.
- [ ] Установленная Windows/job проверка в R5.

## Decision Log

- Новый старт не повторяет вызов, чей ответ потерян. Каждый последующий request
  остаётся отдельным пользовательским запросом, без восстановления send authority.
- Descriptor rotation обрабатывается отказом старого client; новый config вводится
  штатным MCP startup после завершённой установки.
- Временный отказ bootstrap не превращается в polling-цикл процессов.

## Validation

До реализации: source-review дизайна. Обязательные проверки: concurrent→spawn1,
EOF до spawn→0, descriptor rotation→refuse, auth/pin/permission/timeout→spawn0,
failed-start latch, bounded winner/contender attach и accepted-call loss→resend0.
Actual install, live AE и job survival не выполнены этим документом.

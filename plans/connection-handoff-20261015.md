# Передача восстановления подключения — 15 октября 2026

## Поручение и управление

Пользователь в чате «Разобраться, что пошло не так»
(`01a13f11-d85f-7e62-a9a3-26d19da961e6`) явно поручил восстановить только
подключение, устранить блокировку допуска и прочитать реальный проект AE через
MCP. Очередь пока не трогать. Пользователь подтвердил передачу управления туда.

Все source-writers этого чата остановлены. Sole controller и ownership пяти
незавершённых файлов ниже переданы принимающему чату. Наши original build,
native, measurement и stdio owners завершены; retained handles и pins закрыты,
pending operations = 0. Нечего усыновлять или повторять. Этот чат больше не
выполняет реализацию, сборки и live-действия.

Реального чтения проекта AE ещё не было. Добавлений AME: 0/2; START не посылался.
Computer Use и проверка готового видео не использовались.

## Git и сохранённые изменения

Ветка: `codex/laptop-dev-20261012`. Source checkpoint:
`fae6d1f6678afc5c4f602202fe6e55642bbfb102`.

- `d314a2f`: preload authority adapter до source observer/factory.
- `4fb08ac`: перенесён проверенный аудит descriptor batchId и AME host completion.
  Offline completion 6/6 и descriptor 3/3 PASS.
- `fae6d1f`: удержание каждого original parent witness один раз, без снятия
  проверок identity/alias/hash. Измерительный native candidate скомпилирован и
  выполнен; это не production C1 proof.

Пять незавершённых файлов переданы как WIP, без приёмки и без нового build:

- `scripts/shared-queue-build/assemble.js`
- `scripts/shared-queue-build/codec.js`
- `scripts/shared-queue-build/profile.js`
- `native/owned-runtime-local-session/post_c1_successor_provision.cpp`
- `native/owned-runtime-local-session/post_c1_successor_provision.h`

JS содержит частичные closedPredecessor/spec/intent/binding codecs. CLI, фактический
intent read-back после prepare и final seal v2 ещё не соединены; generate-final
останавливается при отсутствии actual binding. Новые проверки не запускались.
Native содержит частичные типы и readers; CPP НЕ ГОТОВ К СБОРКЕ: в Inventory
осталась незавершённая запись `buffer.size()-offset offsetof(...)`. Нет законченной
интеграции grant, seal v2, setup/runtime и project links. Это заготовка, не решение
допуска. Изменение read reply timeout до 300s было лишь предложением и не внесено.

Снимок SHA/размеров и состояния:
`.codex-runtime/shared-queue-20261015/handoff-connection-state.json`.
Он имеет authority=false и не является grant.

Семь чужих WIP сохранены, SHA сверены 7/7 с
`.codex-runtime/shared-queue-20261015/foreign-wip-baseline.json`:
`ame-title-jobs-smoke.js`, `ame-retained-log-source-proof.js`,
`owned-runtime-native-png-fixture-check.js`,
`owned-runtime-trusted-execution-source-proof.js`,
`owned-runtime-trusted-read-census-source-proof.js`,
`owned-runtime-trusted-read-idle-source-proof.js`,
`owned-runtime-trusted-read-source-proof.js` — все внутри `scripts/`.
Не откатывать и не включать их в свой commit случайно.

## Фактическая остановка подключения

Установленный runtime остаётся v13 в `.codex-autonomy/trusted-read/`:
LocalSessionNodeClient.node 5911040B, LocalSessionReadBroker.exe 6088704B,
LocalSessionTrustedReadProvisioner.exe 3862016B. Source уже новее sealed inputs.
Новой production сборки после `4fb08ac`/`fae6d1f` не было.

Build inputs v13:
`.codex-runtime/shared-queue-20261015/production-build-v13/production-build-inputs.json`,
SHA256 `533387e07f0f39937532892130806dd1d83db55a772e0a613a270ec2e041fd3a`.
CompileOnly 3/3 и BuildAndSeal тогда PASS; creator завершился с exit0 и EOF.

Первый actual ensure v13 вернул `trusted_original_io_timeout_no_replay`
в 11:52:05.351Z. Source observer уже прошёл. Native Open/C1 начался, но клиент
получил timeout раньше поздней записи OwnerEpoch. ReserveInitialLaunch не достигнут,
bridge daemon не запущен. Это CLOSED/UNKNOWN post-C1, а не RETIRED_UNADMITTED.

Enrollment:
`.codex-runtime/shared-queue-20261015/production-build-v13/enrollment`.
Journal содержит ровно два сохранённых record:

- `00000000000000000001.rec`: Genesis seq1/epoch0, 458B,
  SHA256 `5ca4a0ee42e30ffcc9e3f1a1cb40a4272f9c73ab0da3225008917058d004e326`.
- `00000000000000000002.rec`: OwnerEpoch seq2/epoch1, 244B,
  SHA256 `6f22b7e97640e4747681208f12afce4d1d7db95c952e4e83a13431df05c1b3af`,
  последняя запись 11:52:38.965Z, после timeout клиента.

LaunchConsume отсутствует. Эти байты не доказывают old native floor/pending.
`.initial-owned-successor.intent` отсутствует. Нельзя сбрасывать floor/journal,
повторять old ensure или применять pre-C1 replacement к v13.

Original controller PID13928 (birth FILETIME134365386162674371) завершился exit1;
original broker PID9208 (birth134365386435192715) — exit2. Выход обоих доказан
через удержанные same-kernel query handles, после чего handles закрыты.
Отчёт: `.codex-runtime/shared-queue-20261015/original-mcp-session-v13/v13-settlement-report.json`.
Shutdown RPC вернул guard_closed, не ACK; затем stdin EOF и child close pending0.
Все owner PTY/measurement sessions также завершены. Старые HANDLE/PID — история,
не адреса для повторного открытия. V7/v9/v11/v12 retirement сохранены отдельно;
они были pre-C1 и не разрешают повтор v13.

## Исправление стоимости проверки и ограничения доказательств

Исходная схема держала 5380 parent witness slots при 114 уникальных parents.
Повторные Fresh внутри Store Guard/append сделали C1 длиннее startup timeout30s.
Измерение только OriginalSeal Open + Fresh3: baseline Fresh примерно147ms,
dedup candidate примерно27.6ms. Open примерно1.05s в обоих случаях.
Candidate действительно CPP/link/run PASS после исправления первого compile error.
Артефакты: `.codex-runtime/shared-queue-20261015/closure-latency-v13-fix1/`.
Это не измерение полного Store append и не доказательство успешного admission.

Post-C1 successor механизм остаётся незавершённым. Обсуждался новый независимый
local_operator grant в том же SetupCreator с exclusive original old fence,
проверкой точных двух records и CREATE_NEW durable intent до новых effects.
Historical JSON/process audit не является grant. Принимающий чат должен заново
оценить минимальный путь подключения, а не считать эту архитектуру обязательной.

## Продолжение в принимающем чате

Безопасные первые команды — только чтение:

```powershell
git status --short
Get-Content -LiteralPath plans/connection-handoff-20261015.md -Encoding UTF8
Get-Content -LiteralPath .codex-runtime/shared-queue-20261015/handoff-connection-state.json -Encoding UTF8
```

Не запускать незавершённый builder/provisioner и не повторять ensure автоматически.
Следующая цель — допуск, listener/панель и реальный project READ через serving MCP.
Очередь остаётся вне текущего поручения.

На последнем census были только старые desktop MCP adapters node PID18632,
13560, 24176 (parent5624); они предшествуют текущим JS исправлениям. Собственных
broker/provisioner/root owner процессов нет. Fresh локальный stdio helper не
доказывает обновление фактически обслуживающего desktop MCP: после исправления
допуска надо проверить именно serving instance и его реальное чтение AE.

Node24.19, MSBuild14.44.35207 и SDK10.0.26100.0 уже доступны. Дополнительные
зависимости не установлены и для выполненной сборки не понадобились.

Checkpoint `fae6d1f`: check:rules и diff check PASS; AME offline 6+3 PASS.
Пять новых WIP не валидированы. Live acceptance отсутствует.

Перед фиксацией этой передачи повторены `npm.cmd run check:rules` и
`git diff --check`: PASS. Это проверка документационного checkpoint, не приёмка WIP.

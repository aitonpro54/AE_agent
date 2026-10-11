# Чистый сохранённый источник для отдельного stage

Статус: **OFFLINE FOUNDATION, DRAFT, не подключено к runtime**. Модуль
`mcp-server/ame-clean-saved-source.js` создаёт независимую файловую копию только
именованного сохранённого clean AEP. Это отдельная ограниченная альтернатива
снимку памяти из [native snapshot contract](ame-native-snapshot-contract.md),
с учётом границ [self-review](ame-title-batch-self-review.md).
`snapshotScope=on_disk_saved_state`, `memorySnapshot=false`,
`productionBackend=false`. Копирование не сохраняет unsaved memory.
Dirty, untitled, неподдержанные или неизвестные lifecycle fields дают отказ.

Daemon, MCP tools, panel, package scripts и существующий native-render route
не подключены и не изменены. Foundation не отменяет текущий
`project_save_required`, proposal/dry-run, confirmation, native grants или
unknown guard. Cached inspection, включая известные item count/revision/dirty,
не является полномочием и не подставляется в свежий reader. Старые unknown runs,
их процессы и reservations этот модуль не обслуживает.

## Приватные зависимости и точная цель

`createFoundation` предназначен исключительно для будущего внутреннего server
adapter. Он требует конфигурационный `workspaceRoot` и три функции; реализации
этих функций для живого runtime в этом изменении **отсутствуют**:

- `readValidatedServerAction({actionId, runId})` самостоятельно читает сохранённую
  server-owned запись и проверяет action/operation/hash/revision/expiry,
  confirmation, текущий context, ownership и допустимость этого run. Возвращает
  точную binding-запись, а не caller `allow`/`authorized`. Повторные чтения перед
  copy и после неё должны подтвердить ту же запись и полномочия.
- `readNativeSource(record)` самостоятельно делает свежее адресное доверенное
  чтение source session, AE PID + process birth в 100 ns, actor panel
  instance/epoch/generation + точного target, native lifecycle и выбранного
  title graph. Проверка процесса и происхождения actor принадлежит adapter;
  echo, cache или переданный удалённым клиентом JSON не являются таким чтением.
- `readServerActionBoundary({actionId, runId})` **синхронно**, без Promise,
  читает актуальную authoritative lease из того же server isolate. Она имеет
  `actionGeneration`, `contextGeneration`, `expiresAtMs`, `terminalState`.
  Для эффекта и принятия результата требуются точные captured generations/expiry,
  `terminalState=executing` и `Date.now()<expiresAtMs`. Caller boolean или
  асинхронно обновляемая зеркальная таблица эту зависимость не заменяют.

Binding имеет только `actionId`, `runId`, `operation=ame_clean_saved_source_copy`, `actionLease`,
`expectedSourceFile`, `expectedRevision`, `expectedSelectionSha256`,
`expectedNativeIdentity`, `selection`. Native identity имеет
`sourceSessionId`, `aePid`, `aeBirth100ns`, `actor`; actor имеет
`panelInstanceId`, `panelLifecycleEpoch`, `panelGeneration`, `targetId`.
Наличие этих полей не доказывает runtime authority: её обязан установить
ещё не реализованный private adapter. Не публиковать этот factory либо его
dependencies в MCP и не сериализовать trusted facts обратно во вход операции.

`inspectSource` принимает только action/run IDs. После проверенных reader
результатов он выдаёт непрозрачный объект, зарегистрированный в private
`WeakMap`. `copySavedSource` принимает только этот объект того же экземпляра
foundation. Копия JSON или объект caller не заменяют proof. Proof одноразовый;
контекст, source bytes и native facts перечитываются при использовании после
любой задержки. Параллельные copy внутри экземпляра отклоняются.

Private runtime adapter обязан атомарно связать validated record с lease,
увеличивать соответствующую generation при **каждом** изменении action/hash,
approval/grant, target/context/ownership или иной причины потери полномочий и
немедленно публиковать terminal revocation. Lease read и dispatch должны
сериализоваться в том же isolate; cross-worker/cross-process invalidation нельзя
скрывать за stale cache. Истечение использует доверенные server clock semantics.
Реализации такого runtime lease store и его проверки здесь нет: это обязательный
integration gap, а не доказанная защита работающего daemon.

Sync boundary проверяется после всех preflight awaits непосредственно перед
exclusive output open, затем после каждого chunk read непосредственно перед
каждой записью. Отзыв во время уже отправленной FS операции не отменяет её:
последующий отказ даёт UNKNOWN. Success boundary проверяется после последнего
native/filesystem await и ещё раз после journal fsync; после него не остаётся
await. Journal write/fsync/close синхронные. Это устраняет принятие старого
action после задержанного reader в рамках описанного private adapter contract.

Lifecycle нормализуется существующим `project-lifecycle-state.js`: требуются
`projectPresent=true`, именованный file, `dirty=false`, точная supported
nonnegative integer revision. Файловый путь обязан совпасть с server binding.
Project file read-only; Save, SaveAs, Open, New, restart или source rename
модуль не выполняет.

Title reader использует ограниченные read-only идеи из
`native-render-variant.js`, но не вызывает и не переиспользует его renderer.
Требуются точные root/variant comp IDs, controlled text layer IDs, их text и
visibility, comp graph и SHA-256 выбранных definitions от trusted reader.
Пределы: 100 comp nodes/visits, 1000 layers, 64 controlled layers/variants,
65536 символов в каждом controlled text. Cycles, неоднозначный или выключенный
путь variant, неизвестные comp/layer IDs, solo, неподдержанные flags и выход
range за root duration дают отказ. SHA-256 вычисляется по точному JSON title
facts в согласованном порядке полей. Это fingerprint выбранной области;
полный resident capture и полное покрытие media/dependencies не заявляются.

## Файловая операция и одноразовый журнал

Source — local absolute canonical `.aep`, regular file без symlink/reparse
alias; UNC/device/ADS и dot-segment пути запрещены. Чтение ограничено 1 GiB.
Во время SHA-256 удерживается read handle; его stat до/после и path stat
совпадают. Source receipt связывает canonical path, `dev:ino` FileID, byte
count, SHA-256, link count, birth/mtime/ctime. Atime не используется.

Output path caller не задаёт. Под конфигурационным workspace создаётся ignored
`.codex-runtime/ame-clean-saved-source/<fresh UUID>/baseline.aep`; UUID root
создаётся эксклюзивно. Перед эффектом foundation создаёт exclusive journal
`reservations/<SHA256(operation,actionId,runId)>.jsonl` и выполняет fsync записи
`reserved`. До вызова copy записывается и fsync-ится `copy_may_have_occurred`.
Копия создаётся через exclusive `open("wx+")` с удержанием output handle и
source read handle. Модуль читает и записывает максимум по 64 KiB за шаг,
обрабатывает short writes, проверяет hash/count и неизменность source stat,
новый destination FileID/link count и совпадение held handle с independently
read path facts; после полной записи выполняется output fsync. Existing target
не заменяется. `fs.copyFile` не используется: его внутренний error cleanup
не является обещанием сохранения partial output.
Journal дополняется через тот же handle; существующие файлы не переименовываются
и не удаляются. Reservation блокирует повтор также в новом экземпляре foundation.
Даже известный отказ после reservation её не освобождает.

Перед copy проверяются свежие native/source/context facts. После неё проверяются
source SHA/bytes/FileID/metadata, session/PID/birth/actor, supported clean revision,
title fingerprint и destination. Копия обязана иметь тот же SHA/bytes, другой
FileID и link count 1. Path ancestors проверяются через lstat/realpath до/после;
идентичность owned root и parents сохраняется. Если до copy обнаружен drift,
результат — `REFUSED_BEFORE_COPY`. Если copy могла произойти, любое исключение,
partial output или drift даёт **UNKNOWN**, `replayAllowed=false`. Модуль закрывает
handles, сохраняет journal/root и реально оставшийся partial output, ничего
не unlink-ит и не запускает cleanup/replay. Действия внешнего процесса или
потеря самой файловой системы не покрываются обещанием сохранения артефактов.

Файловые проверки предполагают stable trusted parents. Node `dev:ino` — локальная
file identity из stat, а не проверенный full Win32 FILE_ID_INFO protocol.
Foundation не держит Win32 directory handles без SHARE_DELETE и не защищает
все interleavings враждебного same-user процесса. Fsync journal file не является
доказательством crash/power-loss durability directory entry на всех файловых
системах. Эти пробелы необходимо решить или явно принять в отдельном reviewed
production contract; `productionBackend=false` здесь сохраняется.

## DRAFT manifest и следующий разрешённый scope

Успешная copy выдаёт frozen source receipt и DRAFT stage manifest. Manifest
связывает SHA-256 receipt, copied baseline path/hash/bytes/FileID, source native
identity/revision/fingerprint, exact comp/layer IDs, варианты и диапазоны.
`allowedVisibilityDeltas` содержит только различия `enabled` у controlled layers
для конкретного варианта. Manifest явно содержит `authority=false`, `wired=false`,
`readyForStage=false`, `dependencyCoverage=not_inspected`,
`nativeStageExecutor=absent`, `ameDelivery=absent`.

До будущей интеграции нужны проверенный private action/context adapter и свежий
trusted native reader в исходной сессии, scoped approval на actual saved-clean
source и воспроизводимая fixture-проверка файловой цепочки. Отдельный reviewed
stage contract должен проверить copied AEP в owned процессе, exact identities,
dependencies/media/proxies/expressions/mattes/fonts и только разрешённые deltas.
Stage executor, ownership/process grants и read-back пока отсутствуют.
Последующие AME delivery, подпись executable, очередь, индивидуальный encode,
native completion и media/visual proof сохраняют собственные gates. Получение
копии или DRAFT manifest их не подтверждает и не обходит.

## Scoped проверка

`node scripts/ame-clean-saved-source-smoke.js` использует реальную временную FS:
SHA/bytes, stat FileID, независимость копии, exclusivity, durable replay refusal
после нового factory, reparse/junction refusal, delayed-reader/source/native
drift и сохранение partial-copy UNKNOWN. Проверяются action generation/context,
terminal revocation на последнем pre-copy native await и финальном FS await,
post-copy revocation с UNKNOWN/no replay и реальное истечение lease при ожидании.
Multi-chunk copy проверяется целиком; после первой реальной 64 KiB записи тест
закрывает тот же output handle и получает настоящий `EBADF` на второй записи.
Частичный файл проверяется по длине и SHA-256 source prefix. Это не замена всего
copy fake-функцией. FS fault injection относится только к изолированному smoke
процессу; production module не принимает FS fault/copy hooks.
Native/action facts **FAKE**. Тестовые bytes — fake AEP; это не парсинг AEP,
не live clean-source proof, не source memory snapshot, не stage/AME acceptance.
Smoke удаляет только свой проверенный mkdtemp root. Проверки JS syntax,
`check:rules` и scoped whitespace diff дополняют этот offline evidence.

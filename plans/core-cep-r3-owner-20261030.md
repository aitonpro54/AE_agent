# R3c: boot-bound owner и штатное settled recovery

30 октября 2026, baseline `ccc57e7`. Реализация следующего блока
[плана восстановления](core-cep-r3-recovery-20261030.md).

## Решения перед кодом

- Generic RPC journal не добавляется. Fsynced Broker intent предшествует send,
  receiver begin — delivery; reservation до intent остаётся durable fence.
  Volatile refs/grants теряются при boot, принятые RPC не возобновляются.
  Lifecycle intents охватывают startup/recovery/maintenance/stop/update. Незавершённый
  чистый build сам по себе не блокирует Core; новые внешние эффекты требуют своей
  классификации. Bounded source risk review этой границы принят.
- Provenance seal выводится из обоих независимых installation role secrets с
  отдельным KDF domain. MAC каждого record связывает kind/version, installation,
  machine и descriptor hash. Ни один role secret по отдельности не даёт seal.
  Seal не заменяет OS identity, election, markers/CAS или semantic settlement.
  Credential rotation требует exact historical descriptor либо проверяемый
  transition; invalid MAC никогда не разрешает очистку.
- Process identity — PID + UTC .NET birth ticks строкой из exact Windows CIM
  query. Fresh same birth — alive; successful absent либо different birth —
  прежняя incarnation завершена. Ошибки/permission/timeout/stale — unknown.
- Новый boot заранее выбирает process boot ID и broker/receiver/startup nonces.
  Broker lock/gate использует заданный nonce, всегда собственный process.pid;
  receiver owner получает versioned pid/token payload. Это process ownership
  metadata, не project grant/epoch и не публичный MCP issuance seam.
- Fixed HTTP reservation precedes nonblocking startup gate. Generic/unattributable
  install gate не reclaim. Recognized orphan gate заменяется без отсутствующего
  gate window: durable original bytes/stat intent и staged new gate, exact CAS,
  atomic rename replacement, read-back/completion. Installer не ждёт HTTP под gate.
- Runtime owner record создаётся/fsync до stores. Старые markers архивируются
  только по exact old boot tokens + process-death proof + settled receiver/ledger
  и lifecycle facts. История/authority не очищается. Record прошлого boot остаётся
  до durable recovery intent; каждый rename имеет original XOR archive proof.
- Incomplete recovery resume допускается лишь по exact intent/phase/files и
  неизменным protected histories. Missing/extra/contradictory facts — fence.
  Новый active record не создаётся до durable recovery completion.
- При семантическом fence нужен observer-only recovery status без AE sends и
  нового Broker writer. Maintenance desired-stop проверяется до reclaim; он не
  снимается клиентским autoload. Legacy empty markers требуют отдельного stopped
  verified migration. Новая AE adoption и original UNKNOWN recovery — свои пути.

## Scope

Process observer; filesystem lifecycle и его TEMP crash/CAS tests; минимальные
token seams в state-lock/Broker/receiver; owner composition wiring и private
diagnostics. Package/contract closure обновляется перед запуском нового контура.
Core restart и first legacy migration не выполняются до source validation/review.

## Progress

- [x] Границы lifecycle-only intents и provenance key проверены read-only.
- [x] Process observer:8/8PASS, включая actual Windows self-PID read;
  bounded source review ACCEPT. Query не изменяет процессы.
- [x] Filesystem engine/token seams/diagnostic mode; component packet47/47PASS
  (12 basic,21 crash/phase,14 marker publication), bounded source review ACCEPT.
- [x] Package/wiring, relevant selected validation и bounded source review.
- [x] Milestone note и финальное evidence подготовлены для отдельного commit.
- [ ] Maintenance/adoption + установленный proof следующих блоков.

## Validation

Пока observer worker evidence, без authorisation на reclaim: минимальный
PowerShell5.1 child требует USERPROFILE directory из `os.userInfo().homedir`;
нужность проверена отдельно. Launcher Node environment остаётся прежним. Query
фиксирован, NoProfile, без execution-policy bypass, command-line inventory,
credentials, AE/портов/kill. Ticks не преобразуются в unsafe JS number.

## Decision Log

- Публичные marker/metadata появляются только полными: bounded stage, write,
  fsync, exact read-back, exclusive hardlink publication. Оборванный unpublished
  stage сохраняется как evidence и не используется для recovery decisions.
  Corrupt published intent/completion остаётся fence при повторных boots.
- Незавершённые ready/recovery transitions старого gate завершаются до его
  замены. Иначе повторное падение могло бы потерять указатель на старый intent.
  Tests воспроизводят crash в нескольких последовательных generations.
- До HTTP election/CIM завершения descriptor/origin/anchor сохраняются как
  snapshot без открытых FD, чтобы contender не блокировал installer на Windows.
  После победы и process-death proof они открываются заново с exact stat/bytes CAS.
- Windows запрещает rename поверх target с retained read handle. Поэтому старый
  gate сначала удерживается hardlink, затем закрывается target FD и выполняется
  replacement без отсутствующего gate window. Изменения birthtime при собственном
  rename и ctime при собственном write-FD close учитываются только при полном
  совпадении остальных identity fields и повторном bounded byte read.
- Diagnostic owner открывает authenticated IPC и статический HTTP503 до импорта
  Broker. Он показывает причину recovery, не создаёт execution stores, не получает
  controller и не меняет original UNKNOWN/legacy markers/history.
- Owner contract v2 включает process observer, lifecycle и fact reader; stdio
  composition сохраняется. Новая owner composition имеет50 readonly/69 manual
  files. Это source/TEMP composition, текущая установка ещё manual3f92.

## Проверки настоящих TEMP процессов

- Idle owner принудительно завершён через сохранённый handle собственного TEMP
  child; новый owner подтвердил смерть exact PID/birth, сохранил journal identity,
  bytes и descriptor, архивировал старые markers и открыл новое boot поколение.
- Legacy empty receiver marker: только diagnostic owner, HTTP503, controller
  refused, отсутствуют новые Broker artifacts, original marker/history unchanged.
- Durable begin+delivery без AE исполнения и падение owner: новый boot сохраняет
  unresolved fence, original bytes и запрет повторного poll/complete/controller.
- Эти3 адресных real-process scenarios PASS. Совместный owner + два thin stdio
  clients также переживает EOF одного клиента. Fixtures используют TEMP root,
  свой IPC и ephemeral HTTP; это не installed/job-lifetime/AE proof.

## Финальный selected packet

`snapshots/core4-lifecycle/20261030/R3c/summary.json` и final run
`f7cd8790-fa5a-433b-8604-f6216b7e9092` (ignored evidence): **359/359 PASS**,
31 selected checks в23 batches. Source hashes/evidence keys не менялись во время
каждого принятого запуска. Успешные предыдущие batches переиспользованы только
при совпадении всего списка checks и exact evidence keys; их raw logs сохранены.
Boundaries37/liveCalls0,20 changed JS syntax checks и `git diff --check`: PASS.

Два начальных failure сохранены в evidence: прежнее ожидание удаления startup
gate после Broker constructor failure и negative guard test, подменявший уже
отсутствовавшую строку finally. Исправлены только test expectations/anchor checks;
production code в ходе selected packet не менялся. Native-read-recovery19PASS
переиспользован с exact прежним key, без повторного длительного прогона.

Bounded source review process observer, lifecycle/faults, marker publication и
composition wiring: ACCEPT без открытых P1/P2. Old installed manual3f92 не менялся;
fresh configured `core_status` подтверждает PID5448, pending0, ledgerFault=false,
unresolved=[], receiver storeClosed/unknown=true, disconnected peer. Никакого
нового AE dispatch, restart AE, save или manual marker cleanup не выполнялось.
Full release не запускалась. Deferred integrations отражены в selection/summary;
Windows/MSIX job lifetime и installed acceptance остаются открытыми.

## Следующий блок

После frozen selected packet и commit — R3d: durable maintenance-stop, stopped
operator/update и first legacy migration. Затем R4 panel reconnect и R5 installed
acceptance. Нынешний check наличия maintenance record ещё не является полным
штатным stop/update workflow.

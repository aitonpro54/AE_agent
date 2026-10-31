# R3 — штатная повторная привязка текущего AE

31 октября 2026. Самостоятельный source/operator этап `owner-host-readoption`
после configured cc2f/CEP/native read. Этот план не выдаёт runtime authority.
База исходников: `9343989757b8eddbbced434e65858f2d2f0ef2b2`.
Production source/runtime/package пока не менялись.

Редакция после единственного plan review20261031-readoption-plan-01: source
границы сохранены, ниже уточнены F01/F02/F04 и concrete CAS proof. Исходная
редакция/digest зафиксированы commitc1a77af и immutable review packet; эта редакция
не отправляется повторно.

## Цель и текущие факты

Дать устанавливаемому Core штатный stopped путь обновления существующей
host adoption после смены AE. Одноразовые адресные recovery scripts больше не
используются как эксплуатационный механизм. Сохранить machine-local history,
UNKNOWN/fences, package/credentials и отдельные native-confirm gates.

Configured cc2f работает: owner6716 ready, current AE26308, CEP connected;
один read-only project-inspection прочитал пустой несохранённый проект.
Lease generation1 освобождён, pending/UNKNOWN/faults0. Receiver20events,
prefix18 unchanged; evidence — `R5CONFIGURED/`. Сохранённая adoption относится
к AE6492 и не даёт authority текущему процессу. Повторять прежние settled
stop/update/recovery/enable и исторический Titles readopt запрещено.

В source `adopt-host` проверяет stopped runtime и вызывает provider с absent-only
`wx` записью. Existing adoption не поддержана. Maintenance snapshot не включает
adoption, обычный resume не принимает certification extensions, update требует
новый package. Поэтому составить существующие команды в re-adoption нельзя.

## Выбранный минимальный подход

Отдельный verified helper operator; установленный runtime и package не меняются.
Это новый тип локальной transaction, не update того же package, не public MCP
admin и не новый broker. Existing provider/bootstrap остаётся absent-only.

Поток:

`новый штатный stop → stopped certification → readopt inspect/apply либо finish → completed-stopped → отдельный enable либо enable-finish → thin client start`

1. Root выбирает exact test-copy path и получает fresh штатный Windows witness.
   Используются все поля host identity/executable/known endpoints; краткие
   PID/birthTicks из status не подменяют witness. Связь с project задаётся явно.
2. Operator проверяет reviewed helper distribution, exact current descriptor/
   package/external Node/machine/origins, original stop/certificate и settled
   receiver/ledger. Резервирует порт election без HTTP/execution handler.
3. До первой записи и после await проверяет exact old adoption bytes/hash/stat,
   witness bytes/hash и fresh native host. Не расширяет allowedProject молча.
4. При непрерывно удерживаемой election полностью подготовить и fsync/read-back
   replacement inode и candidate intent вне maintenance phase tree на том же
   filesystem. Preparation inert: не accepted transaction и не основание lease,
   CAS или finish; orphan candidates не выбираются как authority. Повторно
   сверить baseline. Первый canonical intent публикуется только exclusive
   `linkSync(preparedCandidate, phase/readopt-intent.json)`; EXDEV не получает copy
   fallback, EEXIST требует original inspect, не повтор apply. Так partial stage
   не появляется внутри authoritative phase до canonical claim.
   Первый опубликованный intent становится stop-bound claim внутри
   maintenance phase tree. Intent фиксирует original adoption bytes/inode facts,
   exact replacement, witness, actor incarnation, stop/certificate/baseline и
   заранее определённые role-gate bytes. Нельзя сначала опубликовать intent
   только в отдельной transaction папке: при0gates общий resume/update смог бы
   обойти незавершённую операцию.
5. Общие resume/cert/update readers продолжают fail-closed отказ при claim.
   Только private disk-backed readoption verifier принимает sealed certificate/
   original phase плюс exact проверенное extension/actor lineage/owned gates.
   Recovery не требует живого certificate object прежнего процесса и не выпускает
   normal certificate из JSON. Общий allowlist не ослабляется.
6. Под branded dual lease сохраняются original bytes/archive и replacement;
   adoptedAt/observedDigest и все replacement bytes замораживаются один раз.
   Immutable replacement inode anchor закреплён до CAS; замена через собственный
   hardlink stage+rename сохраняет проверяемую alias identity. Выполняется только
   распознанный CAS adoption. Byte-equal foreign inode не
   считается original. Допустимые изменения inode metadata ограничены собственным
   доказанным link/rename. Никакой ручной очистки markers.
7. Успех заканчивается `readopt-completed-stopped`, barrier сохраняется.
   Результат: mutationGrant/lifecycleEpoch/runtimeStarted/aeAuthority=false.
8. Отдельный enable повторно проверяет exact completion/adoption/history/
   config/package/origins и снимает только свой barrier. Owner не запускается.
   Fresh host обязателен непосредственно перед CAS. После доказанного CAS
   settlement/enable — локальный filesystem commit без зависимости от AE:
   последующее runtime reservation всё равно заново проверяет host/project/
   endpoints. Это не утверждение о live соответствии сохранённой adoption.

## Recovery и остановки

- Inspect только читает и выдаёт hash полного proof, без ремонта.
- Finish требует fresh proof, прежний original payload и проверенную смерть
  original/всех последующих actors. Публикует bounded monotonic continuation;
  original intent/replacement не переписываются. Повтор apply не является recovery.
- Crash prefixes учитывают intent/claim, оба gates, archive, replacement,
  completion и gate release. При0/1/2gates сохраняется stop-bound admission.
- Enable имеет свой immutable intent; прерванный enable заканчивается только
  explicit enable-finish с actor-death, exact original prefix и release-only path.
  Adoption второй раз не записывается.
- CAS-applied/receipt-pending завершается по exact inode/alias/original archive
  proof без повторного CAS. Completion с оставшимися apply gates даёт отдельный
  release-only tail: missing gates допускаются только как proven release prefix,
  заново не создаются. После barrier unlink enable никогда не возвращает barrier
  и завершает только receipt/release tail, даже если AE уже отсутствует.
- Если AE сменился после original intent, но до CAS, срез отказывает и оставляет
  stopped fence. Нельзя подменить witness/replacement; штатная отмена — отдельный
  будущий контракт. Это явный operational limit первого среза.
- Unknown bytes/inodes, corruption, PID reuse без надёжной классификации,
  unavailable process probe, UNKNOWN/contradictory outcomes оставляют barrier.
- Новая adoption — локальная привязка, не mutation grant, project epoch или
  continuity. Reservation/current target/native confirmation проверяются заново.

## Предполагаемые файлы и границы

- Новый `core4/tools/stopped-host-readoption.js` и builtin-only bootstrap CLI.
- Узкий helper-only private certificate port в `runtime/stopped-certification.js`.
- Узкий helper adapter к existing sealed install lease в `tools/stopped-update.js`
  либо отдельный общий helper primitive; без публичного permit/brand issuance.
  Runtime `install-lease.js` не меняется: он входит current package, предложенный
  внешним reviewer getter нарушил бы выбранную helper-only границу.
- Verified helper closure/package dispatch, boundary map и validation routing.
- Новые адресные tests/fixtures и краткий operator guide.

Provider, runtime owner, CEP, product compiler и source-package не менять без
подтверждённой необходимости. Credentials, config, release, пользовательский AEP,
raw/save/destructive, AE restart, AME и внешние APIs вне scope. Root остаётся
единственным live/CEP/UI controller; source writer не получает live authority.

## Проверка

- Existing-adoption happy path и сохранение absent-only bootstrap.
- Zero-write refusals для stale/ambiguous host, endpoint conflict, wrong project/
  machine/package, byte/inode drift и unresolved histories.
- Crash на каждой durable границе, второй crash, actor live/reused/unavailable,
  stale proof, forged JSON/private brands, foreign files/gates.
- Bypass regressions: с первого intent при0/1/2gates generic resume/update/cert
  не снимают barrier и не начинают новую независимую transaction.
- Enable/enable-finish не повторяют adoption; history/config/origins/package/
  CEP/Node неизменны. Полный release run не выполняется.
- Точная `validate-diff` selection, boundaries, syntax и diff check после source
  changes. Старые PASS относятся только к своим source closures.
- Actual operator/host adoption/Titles выполняются после source приёмки с fresh
  witness/test-copy/preflight и original-outcome read-back, отдельными evidence.

## Progress

- [x] Configured cc2f/native read завершён commit9343989, source неизменён.
- [x] Bounded read-only specialist design: existing path отсутствует;
  stopped certificate/lease reuse и stop-bound claim определены.
- [x] Один ограниченный Argon plan review: received/revise, upload1/send1/retries0,
  raw51969bytes/SHAa93778bf…,8string bindings совпали; external recomputation unproven.
- [x] Локальный source разбор findings и уточнение scope: private disk verifier,
  inert pre-claim publication, inode anchor, post-CAS release-only/enable.
- [ ] Slice1: private evidence/lease seams и адресные zero-write/brand tests.
- [ ] Slice2: claim/adoption CAS/freshness parity и bypass/crash tests.
- [ ] Slice3: apply continuation/receipt/release tails.
- [ ] Slice4: separate enable/enable-finish и post-unlink recovery.
- [ ] Slice5: CLI/package/boundaries/validation wiring и immutable selection.
- [ ] Source/helper implementation, адресная проверка и reviewable commit.
- [ ] Actual new stop/readoption/explicit enable и fresh configured proof.

## Decision Log

- Выбран helper-only stopped operator, без обновления runtime package.
- Claim должен защищать stop с первого durable intent даже без обоих gates.
- Recovery и enable разделены; новая цель после intent не подставляется.
- После доказанного CAS AE availability не влияет на локальное settlement/enable;
  host matching остаётся обязательным pre-CAS и перед будущей mutation.
- F01/F03/F05 — known-open seams/границы с уточнёнными proof/tests; F02/F04
  потребовали изменения плана. H01/H02 не подтвердились в existing CLI/lease;
  H03 требует отдельного helper freshness/endpoints guard. S01 отклонён по actual
  cc2f package closure, S02 принят только для authoritative records с exact budget.
- Для этого самостоятельного этапа выбран один plan review по standing mandate.
  Дополнительное result/fix/final review автоматически не создаётся.

## Validation

Design основан на source9343989 и bounded read-only анализе. Actual host re-adoption
и Titles не выполнялись. Source tests для нового оператора ещё отсутствуют;
исторические tests/install/live proof не объявляются его приёмкой.

Root read-only buildPackage manual/owner вновь дал exactcc2f; install-lease входит
payload, stopped-certification/stopped-update не входят. Existing stopped CLI
резервируют3457. Immutable response/bindings и весь bounded ответ прочитаны;
разбор каждого finding — review packet/decisions.md. Ни runtime/source изменения,
ни actual stop/readoption не выполнялись до принятия этой редакции.

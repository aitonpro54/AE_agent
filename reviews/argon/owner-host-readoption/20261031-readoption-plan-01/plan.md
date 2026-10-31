# R3 — штатная повторная привязка текущего AE

31 октября 2026. Самостоятельный source/operator этап `owner-host-readoption`
после configured cc2f/CEP/native read. Этот план не выдаёт runtime authority.
База исходников: `9343989757b8eddbbced434e65858f2d2f0ef2b2`.
Production source/runtime/package пока не менялись.

## Цель и текущие факты

Дать устанавливаемому Core штатный stopped путь обновления существующей
host adoption после смены AE. Одноразовые адресные recovery scripts больше не
используются как эксплуатационный механизм. Сохранить machine-local history,
UNKNOWN/fences, package/credentials и отдельные native-confirm gates.

Configured cc2f работает: current owner ready, current current AE, CEP connected;
один read-only project-inspection прочитал пустой несохранённый проект.
Lease generation1 освобождён, pending/UNKNOWN/faults0. Receiver20events,
prefix18 unchanged; evidence — `R5CONFIGURED/`. Сохранённая adoption относится
к historical AE и не даёт authority текущему процессу. Повторять прежние settled
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
4. Первый durable intent публикуется как exclusive stop-bound claim внутри
   maintenance phase tree. Intent фиксирует original adoption bytes/inode facts,
   exact replacement, witness, actor incarnation, stop/certificate/baseline и
   заранее определённые role-gate bytes. Нельзя сначала опубликовать intent
   только в отдельной transaction папке: при0gates общий resume/update смог бы
   обойти незавершённую операцию.
5. Общие resume/cert/update readers продолжают fail-closed отказ при claim.
   Только private readoption certificate port принимает exact original phase
   плюс собственное ограниченное extension. Общий allowlist не ослабляется.
6. Под branded dual lease сохраняются original bytes/archive и replacement;
   выполняется только распознанный CAS adoption. Byte-equal foreign inode не
   считается original. Допустимые изменения inode metadata ограничены собственным
   доказанным link/rename. Никакой ручной очистки markers.
7. Успех заканчивается `readopt-completed-stopped`, barrier сохраняется.
   Результат: mutationGrant/lifecycleEpoch/runtimeStarted/aeAuthority=false.
8. Отдельный enable повторно проверяет exact completion/adoption/host/history/
   config/package/origins и снимает только свой barrier. Owner не запускается.

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
- Если AE сменился после original intent, минимальный срез отказывает и оставляет
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
- [ ] Один ограниченный Argon plan review этого самостоятельного этапа.
- [ ] Локальный разбор findings и фиксация минимального implementation scope.
- [ ] Source/helper implementation, адресная проверка и reviewable commit.
- [ ] Actual new stop/readoption/explicit enable и fresh configured proof.

## Decision Log

- Выбран helper-only stopped operator, без обновления runtime package.
- Claim должен защищать stop с первого durable intent даже без обоих gates.
- Recovery и enable разделены; новая цель после intent не подставляется.
- Для этого самостоятельного этапа выбран один plan review по standing mandate.
  Дополнительное result/fix/final review автоматически не создаётся.

## Validation

Design основан на source9343989 и bounded read-only анализе. Actual host re-adoption
и Titles не выполнялись. Source tests для нового оператора ещё отсутствуют;
исторические tests/install/live proof не объявляются его приёмкой.

Внешняя копия заменяет только локальные PID labels. Source plan SHA-256: `31b8b8a63337f1bb61920e63abaaf33456ddf39e45ac0f2872859e3baa4fa75c`. Это privacy summarization; runtime state/receipts не приложены.

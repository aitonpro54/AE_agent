# R3 — штатная повторная привязка текущего AE

31 октября 2026. Самостоятельный source/operator этап `owner-host-readoption`
после configured cc2f/CEP/native read. Этот план не выдаёт runtime authority.
База design/review: `9343989757b8eddbbced434e65858f2d2f0ef2b2`.
Helper foundation принята commit`a1fedf3`; runtime payload/package не менялись.

Private transaction core2–4 принят на freeze05:253PASS/12current checks,
composed coverage с exact reuse5closures и независимым source/test ACCEPT.
Terminal read race после last gate release исправлен и проверен.
CLI slice5 также принят:338unique PASS/19current checks. Actual
operator пока не выполнялся; официальный immutable output создаётся после commit.
Runtime packagecc2f прежний. Повторного Argon не было.
Source milestone commit: `53200c12a684fe9be3abb7875cc424105795da2c`.

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
- Windows TEMP evidence требует закрыть собственные read FD старого target до
  rename-over-existing: иначе observed EPERM. New anchor FD может сохраняться.
  После known rename в недавно freed имя birthtime нового inode/anchor может
  стать old destination birthtime; generic ignore birthtime не вводится, но
  собственный переход проверяется по dev/ino/bytes/alias inventory и закрепляется.
  Initial original nlink может быть2 из предыдущего pinned anchor; учитывать
  observed baseline и собственные aliases, не hardcode1→2→1.
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
- [x] Slice1: private disk evidence/lease adapter seams; current coverage212PASS
  по9checks, independent source ACCEPT. Issuance production lease закрыт доclaim.
  Source commit`a1fedf3`; next block — private transaction core2–4, writer specialist.
- [x] Slice2: claim/adoption CAS/freshness parity и bypass/crash tests.
- [x] Slice3: apply continuation/receipt/release tails.
- [x] Slice4: separate enable/enable-finish и post-unlink recovery.
- [x] Bounded independent source review core2–4 freeze03 ACCEPT: триP2 исправлены,
  current tests/CLI/actual acceptance этим review не заявлены.
- [x] Frozen baseline final01:12selectedchecks/242PASS/0FAIL, exact source/deps
  неизменны; confirmed terminal race не позволяет объявить functional acceptance.
- [x] Terminal historical-receipt correction, independent delta review и
  current-key verification:253PASS/12checks (7fresh+5exactreuse).
- [x] Slice5: CLI/package/boundaries/validation wiring и immutable selection.
- [x] Source/helper implementation и адресная проверка; private commit53200c1,
  CLI source milestone фиксируется отдельно.
- [ ] Official immutable manual/owner distribution и exact hash read-back.
- [ ] Actual new stop/readoption/explicit enable и fresh configured proof.

Завершённый milestone core2–4: цель — штатный recoverable helper core без смены
runtime. Изменены11source paths (main/store/reducer, narrow certificate port,
fixture/5test files и routing), планы/AGENTS и sanitised evidence. Validation —
253current PASS, independent reviews, exact committed bytes, packagecc2f unchanged.
Commit53200c1; следующий определённый этап — CLI slice5. Работа продолжается в
текущем чате; root сохраняет Git/live ownership, source writer получает только
CLI/package/test wiring.

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
- Следующий цельный source milestone объединяет внутренние шаги2–4: private
  transaction core claim/CAS/finish/enable. Между шагами — адресные новые tests;
  итоговый relevant selection выполняется после целого frozen core, чтобы не
  повторять неизменённые тяжёлые suites для промежуточных закрытых веток.
  Public CLI/distribution wiring остаётся отдельным slice5; live не начинается.
- Private library сохраняет existing loopback/listening positive-port semantics;
  production election127.0.0.1:3457 закрепляет verified CLI. TEMP используетport0,
  production test flags/fake address не вводятся.
- Для role gates выбран inert precreated anchor с inode pin в original intent;
  после canonical claim role path публикуется exclusive hardlink. Reuse unchanged
  sealed lease consumer требует адресной проверки aliases/release: удаляется
  только canonical role path, anchor сохраняется, foreign aliases/inodes закрыты.
  Это избегает partial stage publication внутри стандартного gate producer.
- Штатный release снимает broker gate перед install gate. Допустимая цепочка
  освобождения: оба → только install → ни одного; broker-only не признаётся
  штатным crash prefix. Cold client может попытаться запустить owner между
  unlink, но оставшийся install gate отклоняется owner lifecycle до публикации
  новых markers и не удаляется этим отказом. Runtime остаётся неизменённым;
  TEMP regression должен подтвердить этот pending release путь.
- Early independent review private core2–4 выявил два P2: certificate-only proof
  не фиксировал old adoption между inspect/apply; несовпадение input/replay budget
  позволяло опубликовать нечитаемый claim. Исправления приняты в scope до итоговых
  suites: единый adoption-bound proof и preclaim replay/budget validation.
  Original4source/hashes и findings сохранены в HOSTREADOPT-S234; приёмка этого
  промежуточного source не заявляется.
- Correction review выявил ещё один preclaim race: foreign canonical gate мог
  попасть в owned normalization. Перед первым intent link теперь допустимы
  только0canonical gates, base verification получает empty owned. Combined
  freeze03 source-review ACCEPT; crash matrix остаётся обязательной.
- После source review root поднял race: enabled receipt уже опубликован и original
  gates освобождены, но readState повторно требует stopped current markers/history.
  Normal cold owner может уже создать свои markers/startup gate; helper ложно
  отказывает даже на return/settled no-op. Writer подтвердил источник. Correction
  выделяет authenticated historical terminal receipt, без lease/write/authority;
  original pending gates сохраняют strict recovery. Условие различает original
  role aliases и новые foreign/startup gates, которые не присваиваются и не
  удаляются. Frozen run не меняется; future reuse требует exact current keys.

## Validation

Исходный design основан на source9343989 и bounded read-only анализе; на момент
review новых source tests ещё не было. Ниже отдельно записана приёмка slice1.
Actual host re-adoption и Titles не выполнялись; historical install/live proof
не объявляются приёмкой нового оператора.

Root read-only buildPackage manual/owner вновь дал exactcc2f; install-lease входит
payload, stopped-certification/stopped-update не входят. Existing stopped CLI
резервируют3457. Immutable response/bindings и весь bounded ответ прочитаны;
разбор каждого finding — review packet/decisions.md. Ни runtime/source изменения,
ни actual stop/readoption не выполнялись до принятия этой редакции.

F05 адресный Windows filesystem probe:3own-TEMPcases PASS на Node24.15.0/NTFS
текущего MSI. EPERM при own old-target read FD, успешный rename после close;
same new inode/bytes при changed birthtime после freed-name rename; prior-anchor
nlink2→3→2. Полные stamps/aliases/checks и summary —
`snapshots/core4-lifecycle/20261031/HOSTREADOPT-FS/`, reportSHA3d41438a….
Это только filesystem primitives evidence, не Core crash/concurrency/live или
portability proof; source slice1 verification записывается отдельно.

Slice1:6source paths, helper-only baseline reader и lease adapter. No-claim
inspection описывает current certified inode facts; stale proof/opaque handle
ловят drift. Нового durable claim нет, historical inode continuity/lease issuance
не заявляются. Fixture-only getter substitution проверяет plumbing, не production
разрешение. Generic readers и runtime payload не менялись.

Slice1 selection coverage212PASS/0FAIL по9checks: reused unchanged closures —
certificate30/update55/standalone7/legacy29; new current runs — operator7,
foundation25/routing5/maintenance-finish32/owner-maintenance22. Initial whole
command завершился exit1 на routing (component dependencies были слишком широки
из-за full-package case); исправлены только map/test, existing expectations не
ослаблены. Четыре reused checks сохранили exact dependencies/commands/evidenceKeys;
пять current checks выполнены адресно. Это composed coverage, не единый
whole-command immutable PASS. Ранние4tool chunks не архивированы; initial raw
stdout tail PARTIAL. Полные targeted logs/selection/hash manifests и ограничения
сохранены в HOSTREADOPT-S1/summary.json и accepted-evidence.json. После staged
проверки удалён ровно один лишний EOF0a из test (11505→11504bytes, весь prefix
byte-equal);25cases адресно повторены65.90с/PASS, остальные8keys unchanged.
Актуальная final coverage/selection/hashes — HOSTREADOPT-S1/eof-cleanup/;
parent eof-cleanup-proof.json связывает её с independent ACCEPT. Initial evidence
не переписаны. Raw partial stdout, historical pre-EOF source и archived collector
script хранят исходный whitespace; full diff check отмечает только3этих artifacts,
остальные source/docs проверяются отдельно.

Root сверил6final hashes с independent ACCEPT, заново вычислил selector без
запуска tests и подтвердил9keys/dependency bindings. Actual read-only package
build снова дал exactcc2f/70files. Boundaries43/live0, syntax/diff PASS. New adoption/
CAS/enable/CLI/actual stop0; no installed/project changes. Следующий шаг — цельный
private transaction core2–4 на этой foundation, затем CLI и actual приёмка
(порядок на момент завершения slice1; текущий результат core2–4 ниже).

Private core2–4 early reviews сохранены в HOSTREADOPT-S234: freeze01/02/03,
immutable source copies и review-01/02/03.md. Original дваP2 (old proof/budgets)
и correction race P2 закрыты по статике. Freeze03 combined ACCEPT относится к
main770b1298…/store9a766417…/transactionc68c2417…/certificate8c277939…;
на момент этого early review matrix ещё выполнялась; CLI/distribution/actual
operator им не подтверждались. Final01/final02 результаты записаны ниже.
Read-only package build freeze01 по-прежнему дал cc2f/70files. Отдельный R5
long-idle checkpoint commit05ae5d7 подтвердил configured first-call83мс после
7397046мс; source/helpers/проект AE этим checkpoint не изменялись.

Final01 закрыт16:46:11.625Z:12checks/242PASS/0FAIL/0skip, единый frozen selected
run (releaseCertified=false). Root независимо подтвердил11source hashes,
125dependency hashes,12keys/commands/deps и полный selector-prefixed rawlog с
12полными Node summaries. RawSHA3e8906b5…; before/after capture и selection
связаны exactSHA, packagecc2f/70files. Parent test replay0/live0/install0.
Итог — `final01/baseline-run-verification.json`, functionalAcceptance=false из-за
confirmed terminal P2. До correction это historical baseline, не actual допуск.
Тяжёлый stopped-update55 прошёл885.42с один раз; future reuse разрешён только
при unchanged effective closure/command/key. Terminal design/diagnostic —
`terminal-design.md`/`terminal-before-fix/`; helper-only correction выполнен
после parent baseline verification, отдельный current-key результат ниже.

Final02 закрыт17:19:46.721Z exit0. Current delta5=95PASS: enable22 (11old+11new),
foundation25/core13/recovery34/probe1 (18variants). Под тем же global frozen
envelope отдельно выполнены exact current routing5/operator7. Standard delta
route выбрал5component checks, а global12key comparison выявил ещё2изменённых
integration keys; эти2 не переиспользовались. Остальные5checks/146tests — exact
reuse baseline: certificate30/update55/standalone7/maintenance-finish32/owner22.
Итого **253PASS/12current checks**,0FAIL/skip/cancelled/todo. Это composed current
coverage, не один whole-global immutable command и не full release.

Root независимо сверил11current source hashes,125dependency hashes,12current
keys/commands/deps, before/after envelopes,5полных framework summaries/95tests,
fresh supplemental logs/exit0 и каждый reused check с baseline. Полные rawlogs:
baselineSHA3e8906b5…/deltaSHAdca17be1…; copied exact artifacts и parent acceptance
находятся в `HOSTREADOPT-S234/final02/accepted-evidence.json`. Independent writer
summarySHA9d0ae7be… совпадает с parent coverage. Parent test replay0/live/install0.
Packagecc2f/70files unchanged; boundaries43, syntax10, untracked-inclusive
whitespace11/0warnings и source diff PASS.

Freeze05 main770b1298…/storeea36f48d…/transaction1dbf2360…/certificate8c277939…,
enable teste8f59020… получили independent ACCEPT (review-06-terminal.md).
Historical terminal path проверяет original records/aliases/protected facts,
не получает lease/actor/authority и явно возвращает currentRuntimeObserved/
currentHistoryObserved/currentBarrierObserved=false. Pending original gates
сохраняют strict recovery. 1первичный terminal test FAIL из-за отсутствовавшего
required proof исправлен только во входе test; original raw сохраняется.

Actual stop/readoption/enable0, installed/runtime/CEP/project changes0 для этого
source milestone. Portability round-trip, CLI/distribution и actual acceptance
остаются открытыми. Следующий определённый шаг — CLI slice5 по brief в
implementation-notes.md; после него fresh preflight и новый original stop UUID.

Перед source commit root подтвердил exact staged bytes всех11source и107уже
собранных artifacts. Full staged diff check отметил12whitespace diagnostics
только в4immutable captures (2rawlogs,2capture scripts); исходные bytes/SHA не
изменялись. Все остальные staged paths, включая current source/docs, PASS.
Точные исключения/хеши — HOSTREADOPT-S234/staged-checks.json; это форматирование
архивных первичных evidence, не product/test failure.

### CLI slice5 — source приёмка

Добавлены readopt-inspect/apply/finish/enable/enable-finish, private bootstrap
capability и verified data-only operator. Общие/actions/apply flags описаны в
[operator guide](../docs/core-host-readoption.md). Election3457 непрерывная;
witness16KiB/hash pin; readonly/manual-stdio distributions отказывают до operator
import. Four-helper union main/store/transaction/operator включён в standalone,
runtime packagecc2f/70files прежний. Independent review6paths ACCEPT; P3 guide
уточнил обязательную CLI election даже для historical query.

Initial frozen CLI run завершился exit1 на existing lexical HELPERS assertion.
Исправлен только порядок store→transaction→main в bootstrap; assertions прежние.
Full rawSHA7884b3fb… сохранён:5executed batches/6check bindings,43PASS/1FAIL,
остальные4bindings не выполнялись. Shared routing/artifact batch9 ошибочно
назывался routing9 в промежуточном сообщении; standalone routing5/artifact5 имеют
один общий case. Current данные ниже считаются по executionBatches.

Corrected final02: source16/dependencies139/global19checks, actualdelta10bindings
в9batches,104fresh unique PASS. Exact reuse9unchanged baseline closures —234tests.
Итог **338unique PASS/19current checks**,0FAIL/skip/cancelled/todo. Per-check
assignments339 содержат общий routing/artifact case; в338 он посчитан один раз.
Current whole-global command не заявляется, full release не запускался.

Parent batch-aware verifier независимо подтвердил source/dependency/key/command
bindings до/после/current,9полных Node summaries и actual test names общегоcase,
каждый reused dependency hash и отсутствие fresh/reused overlaps в global batches.
RawSHA4722d3fd…; writer summarySHA37d8fb34… совпадает с parent result.
Evidence — HOSTREADOPT-CLI/final02/accepted-evidence.json; source freezes/reviews
и initial failure сохранены отдельно. Parent tests replay/live/install0.
Boundaries44, syntax5, whitespace16/0warnings, protected private/runtime diff0.

Current bootstrapSHAa8b3c527…; остальные5CLI hashes соответствуют freeze01.
Детерминированный manual/owner distribution hash
`c787e0134941086fdbf7b1b15ebb16ee6b0684fbaab85ecb586a0958a602e81d`,87bundle files.
Пока это pure build; official directory и actual new stop/adoption/enable ещё0.
Следующий шаг: commit source CLI, записать/проверить immutable distribution,
получить fresh configured/native host+project preflight и выполнить новый UUID.

CLI staged source verification: все16cumulative source blobs совпали с tested
SHA,6owned CLI paths составляют весь source diff от53200c1. Все47собранных
evidence blobs сохранены exact bytes. Full diff check отметил4diagnostics лишь
в3immutable capture/raw artifacts; остальные source/docs/artifacts PASS. Точные
exceptions/hashes — HOSTREADOPT-CLI/staged-checks.json. Captures не форматировались.

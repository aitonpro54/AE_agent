# Локальная подготовка реализации после freeze

Это local-only notes; в отправленный bundle не входят. Specialist выполнял
только source reading, без tests/live/изменений. Production source пока unchanged.
Внешние findings и решение root ещё ожидаются; эти notes не разрешают реализацию.

## Минимальное владение writer

- Новые tools/stopped-host-readoption.js и operate-stopped-host-readoption.js.
- Helper-only private certificate port в runtime/stopped-certification.js.
- Небольшой adapter к sealed lease в tools/stopped-update.js; не fake update API.
- Standalone bootstrap WeakMap/flags/HELPERS/usage, boundaries/validation-map.
- Новые fixture/component/operator tests. Plan/docs/evidence остаются у root.
- Provider/owner/CEP/source-package/установленный package не менять без отдельного
  подтверждённого технического основания. Root — единственный live controller.

## Reuse

`test/fixtures/owner-lifecycle-fixture.js:14` даёт fixture(t): TEMP root/state/d/
descriptorPath, instrumented io, tracked/openFiles, snapshot/create/stores/crash/
close/failProbe. Реальные TEMP файлы и port0, synthetic process facts.

`test/fixtures/maintenance-finish.js:7` даёт harness/inject, stop/dead/reserved/
onObserve/inspect/resume/inspectFinish/finish. Для нового helper нужен небольшой
loader с общей module cache для всех private brands.

`test/stopped-certification.test.js:12–66` — образец certificate setup; harness
не экспортирован. Не импортировать .test.js, чтобы не запускать чужие suites.
UNKNOWN/contradictory histories — тот же файл147–160 через stores.begin/complete
и dispatchBinding. Legacy migration fixture здесь избыточен.

`runtime/owner-maintenance.js:457` предоставляет private certificate context:
read/atomic/plain/same/snapshot/seal/decode/settled. Через narrow branded port
можно reuse bounded128KiB exclusive/fsync/read-back primitives. JSON не создаёт
capability и общий context не становится публичной фабрикой.

`runtime/install-lease.js:122` и private getter в stopped-update.js:145 позволяют
малый adapter. Не экспортировать весь update context и не копировать machinery
update/package/credentials. Учитывать exact Windows link/rename metadata facts.

## Fresh probe

Готового exported freshness validator нет. probeWindows/hostIdentity exported;
freshObservation private в provider:69–72. Helper-only local validator сохраняет:
maxAge5000ms, observedAt parse/age/future tolerance1000ms, finite completedAt/age,
exact ports3456/8787 и оба observed-absent. hostIdentity alone недостаточен.

Behavioral regression: fixed Date.now и один table corpus против provider.adopt
с synthetic probe в отдельной TEMP папке каждого case. Boundaries5000/5001,
future1000/1001, missing/nonfinite completion, reversed/duplicate/missing ports,
active/unknown states. Existing provider допускает future completedAt: не вводить
скрытое расхождение. Synthetic injection — только fixture module loader; CLI не
принимает callbacks/query/executable/probe-path.

## Distribution/CLI

Provider входит только optional.manual, поэтому нужен manual/owner distribution;
readonly отказывает до support/probe import. Provider нельзя дублировать в HELPERS
поверх payload — exact closure включает pkg.files+HELPERS. Новые helper-only paths
не должны менять buildPackage hash; distribution hash меняется.

CLI guard pattern — maintenance-finish-operator.test.js:12–35: poisoned, валидно
захешированный installed source; запрещён import из releaseDir; preload запрещает
native probes/listen; election fixture подменяет3457 наport0. Проверять bootstrap
tamper/import-order, capability до await/после completion, cleanup/refusal и
отсутствие credential names/values в stdout/stderr. Source guard — не OS sandbox.

## Test matrix

| ID | Предмет |
| --- | --- |
| H01 | Existing adoption CAS ровно один раз; archive; completed-stopped; immutable history/config/package |
| H02 | Fresh probe behavioral contract, ambiguous/wrong host/project/machine |
| H03 | Zero-write old bytes/inode drift, stale proof, UNKNOWN, foreign files/gates |
| H04 | Claim bypass через generic resume/cert/update при0/1/2gates |
| H05 | Crash claim→each gate→lease→archive→stage→publication→completion→release |
| H06 | Continuation actors/live/reused/unavailable, second crash, bounded chain, copied brands |
| H07 | Enable split, barrier только explicit enable; adoption не записывается повторно |
| H08 | Enable intent→gates→ready→barrier archive/unlink→completion→release-only finish |
| H09 | AE changed после intent: отказ, old witness/replacement/barrier unchanged |

Crash hooks перехватывают fixture io link/rename/unlink/close/write/fsync ПОСЛЕ
реальной TEMP операции; каждый test подтверждает, что hook сработал. Production
crash flags/callbacks не вводятся. Partial stage — fail-closed; поддерживаемые
complete unpublished stages нужно определить явно, без угадывания prefix.

Новые check IDs: stopped-host-readoption/component и
stopped-host-readoption-operator/integration. Exact owners/dependencies/commands/
policy в validation-map должны включать transitive closure и existing certificate/
stopped-update/standalone/boundary/routing regressions. Полный release не запускать.

## После source slice1

Commita1fedf3 принят212PASS/current9check composed coverage и independent ACCEPT.
Latest final evidence — HOSTREADOPT-S1/eof-cleanup/; parent exact EOF-only proof
связывает final25rerun с review. Current runtime packagecc2f/70files прежний.

Следующий assigned блок — private core2–4 (store/reducer, claim/CAS/finish/enable),
без CLI/live. Library endpoint semantics остаются loopback+listening/positiveport;
CLI затем обязан обеспечить3457, TEMP port0. Sealed gate anchors готовятся inert
до canonical claim, intent pin-ит inode; role paths публикуются exclusive hardlink.
Existing sealed lease recovery consumer используется после проверки aliases и
role-path-only release, без изменения runtime/install-lease.js.

## Read-only подготовка CLI slice5

- `standalone-installer.js:27–54` проверяет manifest/exact closure; opaque maps
  на6–7, late operator import после verify на68–83, revoke в finally после await.
- `operate-stopped-update.js:19` и boundary checker закрепляют bootstrap assertion
  перед non-builtin imports. Новый operator следует тому же pattern.
- Existing metadata maintenance flags: distribution hash/current package hash/
  installation/operation; action добавляет expected-proof-hash. New package/
  previous descriptor/config flags update-семейства нельзя автоматически переносить
  в metadata-only readoption. Final witness/phase flags привязать к реальному API core.
- Existing support guard проверяет owner-contract и owner runtime entries до
  require оператора, а не отдельное runtimeModel поле. Readoption также нуждается
  в manual provider payload; readonly должен отказать до support/probe imports.
- HELPERS добавляет только новые helper files: provider уже в manual payload,
  дубликат нарушает exact closure. `package-standalone-installer.js:49,66–70`.
- `operate-stopped-update.js:25–27,55–79` удерживает listener3457 до завершения
  await и закрывает server+allConnections в finally. Finish делает аналогично17–30.
- Operator tests переадресуют3457→TEMP0; stubs с pending HTTP запросом подтверждают
  held listener/cleanup/rebind. Существующие patterns: stopped-update-operator24–50,
  maintenance-finish-operator58–101 и standalone-installer17–30.

Это факты baselinea1fedf3, без tests/изменений и без придумывания готовых exports
будущего private core. CLI implementation остаётся после его приёмки.

## Уточнение release/startup по существующему исходнику

`install-lease.js` приобретает install, затем broker; освобождает reverse, поэтому
штатные prefixes — both→install-only→none. Broker-only из примера review не
следует из существующего release и не должен приниматься как штатный recovery.
`client-entry` при отсутствии maintenance может сделать cold launch, но
`owner-lifecycle` отвергает оставшийся non-startup install gate в gateBody до
публикации markers и до разрешения cleanup этого gate. Это source-level факт,
а не выполненная live проверка; адресный TEMP сценарий включается в H08.

## Early local review private core2–4

Независимый local source review freeze01 нашёл два P2: no-claim proof не включал
old adoption, а допустимый input JSON мог превысить replay base64 budget уже
после canonical claim. Writer признал первый дефект; root разрешил scoped
correction обоих до final suites. Требуются exact old bytes/hash/full stat в
едином inspect/apply proof и preclaim проверка всех frozen replay budgets.
Immutable4source/hashes и подробные findings — HOSTREADOPT-S234/review-01.md.
Это локальное исправление в разрешённом scope, без повторной отправки Argon.

Correction review выявил P2 preclaim gate race: observed foreign canonical gates
передавались как owned. Freeze03 требует0gates до/после base verification и empty
owned; combined independent source-review ACCEPT. Original3P2 закрыты по статике,
не по исполнению tests. Exact manifests/copies и все3review reports находятся в
HOSTREADOPT-S234. Current crash matrix/CLI/actual acceptance остаются открытыми.

## Конкретный scope CLI slice5 после private-core commit

Планируемые отдельные modes: readopt-inspect, readopt-apply, readopt-finish,
readopt-enable, readopt-enable-finish. Общие flags — reviewed distribution hash,
current package hash, installation descriptor, original operation UUID. Actions
требуют fresh expected-proof-hash; apply дополнительно принимает exact witness
file и expected-witness-hash. Finish/enable не принимают новый witness/target.
Это подготовка следующего source блока, команды ещё не реализованы.

Builtin-only bootstrap проверяет exact distribution и manual/owner support до
operator import. Новый private WeakMap capability отзывается после await/finally.
Operator проверяет current installation как data через verified helper/payload,
не импортирует installed source; election только127.0.0.1:3457 до конца await,
finally закрывает listener и all connections. Apply читает bounded pinned witness
snapshot; unknown flags/дубли/probe/query/port override не принимаются. stdout/
stderr не выводят descriptor/credentials. Runtime/CEP/source-package не меняются.

HELPERS добавляет только main/store/transaction/operator; provider уже в manual
payload. Exact union проверяется build/write/verifier. Новые operator tests и
guide/README/routing/boundary guard входят в slice5; full release/live не входят.
Final01 dependency manifest показывает, что standalone-installer и standalone
packager участвуют только в routing/maintenance-finish-operator/standalone-installer
из текущих12checks. Будущий reuse остальных PASS разрешён лишь после повторной
проверки exact effective dependencies/commands/evidenceKeys, без автоматического
повтора887с stopped-update suite из-за смены этапа.

## Принят private core2–4 перед CLI5

Terminal freeze05 source+11new enable cases получил independent ACCEPT; current
coverage253PASS/12checks подтверждена parent:95delta+12freshsupplemental+
146exactbaseline reuse. Source11/deps125/12keys/commands frozen before/after,
runtime packagecc2f/70files прежний. Это composed coverage, full release/live0.
Подробности и raw SHA — HOSTREADOPT-S234/final02/accepted-evidence.json.
CLI brief выше остаётся следующим source scope; original stop/adoption пока0.

## CLI5 принят локально

Все5modes реализованы через complete-byte bootstrap/private awaited capability и
data-only operator с непрерывной election3457. Source6paths получили independent
ACCEPT; затем existing standalone test нашёл lexical HELPERS order. Исправлен
только порядок трёх entries, новый bootstrapSHAa8b3c527… отдельно принят reviewer.
P3 operator guide закрыл границу library historical semantics/занятого CLI порта;
нового history viewer или port override не добавлено.

Parent batch-aware current coverage —338unique PASS/19check bindings:9fresh
batches/104unique cases и9exact baseline closures/234tests. Shared routing5+
artifact5 имеют1общий case; union9 посчитан один раз, per-check assignments339
не объявляются339tests. Current source16/dependencies139/19keys/commands frozen
до/после, actual delta10checks, whole-global command/release не заявлены.
Подробности — HOSTREADOPT-CLI/final02/accepted-evidence.json; initial exit1/fullraw
сохранён. Node packagecc2f/70files и private runtime прежние; pure helper
distributionc787e013…/87files проверена, official output/actual0. Следующий шаг —
source commit, immutable write/verify и actual fresh preflight/new stop UUID.

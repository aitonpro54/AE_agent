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

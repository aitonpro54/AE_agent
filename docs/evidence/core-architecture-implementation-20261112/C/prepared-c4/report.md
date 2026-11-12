# C4 — semantic legacy incident fixture, TEMP preparation

Статус: **PREPARED, NOT APPLIED, NOT SUITE-TESTED**. Repo остаётся замороженным.

Два файла и BASE/prepared SHA находятся в `manifest.json`; отдельные diffs —
в `diffs/`, общий — `prepared.patch`, точные copies — `base/` и `patched/`.

Новый test-only `incidentPkg(name)` клонирует неизменённый cached current `pkg()`:
release.version 4.2.5, genuine derive без registryVerification, новый selected
catalog revision с registryVerification:false, genuine registrySource без marker,
пересчитанные bytes/hashes/packageHash и genuine verifyPackage.
Policy 2/capabilities/modules и executable bytes сохранены; исключение —
предусмотренная генерация registry data. Это semantic legacy shape, **не**
byte-identical historical package и не native old-panel acceptance.

Только initial readonly/current manual/foreign variants используют incidentPkg,
до descriptor/payload/HMAC/backup/PROFILE. Exported current pkg() сохранён для
штатного current update после repair. Current own source closure/pin C3,
production incident PROFILE/source hash/seven-file guard не меняются.

Новый чистый тест готов проверять три package, policy/bytes, registry absence и
одинаковые genuine seven-file CEP plans, а также current→semantic hashes.
Существующие четыре before/after-plan source-drift cases сохранены.

Разрешённый чистый preview выполнен: prepared fixture с recorded SHA скомпилирован
стандартным Module._compile под исходным filename только для relative imports.
Вызваны только pkg/incidentPkg и readonly planInstall с явными paths внутри свежего
task TEMP. Никаких fixture(), applyInstall, actors, TCP, product module overrides
или ручных require-cache изменений. planRoot остался пустым.

`pure-preflight.json` содержит provenance трёх currentPkgHash→semanticLegacyHash,
точные changed data paths, registry/policy SHA, catalog revisions, executable byte
counts и все семь CEP paths. `pure-preflight.command.json` и stdout сохраняют
command/exit/stdout SHA. Итог **PURE_PREVIEW_PASS_NOT_CURRENT_CHECK_KEY**.

Это не заменяет будущий mixed-repair suite/ordinary-current-update/anti-drift run
после явного применения root. `syntax.json` фиксирует node --check двух copies.
Source BASE SHA повторно проверены; checkout не изменялся.

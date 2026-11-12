# C3 — подготовка только в TEMP

Статус: **PREPARED, NOT APPLIED, NOT SUITE-TESTED**. Checkout заморожен во время
основного прогона. Все записи этого блока находятся только в данном task TEMP.

`manifest.json` содержит для каждого из семи файлов BASE SHA256/bytes,
prepared SHA256/bytes и отдельный diff с SHA. `prepared.patch` — их общий diff.
`base/` сохраняет точные исходные bytes, `patched/` — подготовленные копии.
Повторная сверка подтвердила: все семь исходных файлов checkout прежние.

Подготовлено:

- CLI fixture копирует fixed source shim, pure runtime spec и panel identity;
  relocated CLI получает свой exact source shim. Workspace/CWD/Node/no-write
  assertions сохранены.
- Owner panel helper применяет installed identity/journal только при releaseDir;
  synthetic private peer сохраняет прежний signed claim. Crash journal ожидает
  registry begin/complete и original read begin с привязкой commandId.
- Owner-installation exact counts 46/66 + 24, явные pure/identity presence checks;
  closed owner contract assertions сохранены.
- CEP B9 exact sorted set: catalog-revision, cep-transport, composition-spec,
  version-profile-compatibility. Locality/cache/deferred guards прежние.
- Start-over installed panel проверяет identity, подписывает normalized root,
  отправляет signed registry-ready; проверяет exact previous journal prefix и
  bootstrap begin/complete correlation. UNKNOWN archive exact bytes сохранены.
- Mixed fixture копирует ровно два существующих literal-import roots из своего
  SOURCE, проверяет Core boundary/regular exact paths/dedup/limit256/raw SHA и
  TEMP bytes. Incident operator не исключается из графа: попадание в реальный
  graph вызывает отказ. Manifest/digest immutable. PROFILE и source hash literal
  заменяются ровно по одному совпадению только в TEMP operator перед load.
  Plan/apply/recover/inspect никогда не перепривязывают pin.
- Четыре новых negative cases подготовлены: tools/runtime helper drift до plan
  и после правильного plan/cached imports. Требуются source_changed, marker
  absent, repair mutations0, protected byte/stat facts exact и repairDir absent.

Проверено только `node --check` семи patched copies: **7/7 PASS**.
Команды, exit codes, patched SHA и stdout SHA находятся в `syntax.json`.
Сценарии, manifests во время выполнения и будущие outcomes здесь не заявлены.

Production pin/PROFILE/guard, runtime, map, env/CLI authority и checkout не менялись.
Применение возможно лишь после отдельного указания root по завершении общего
прогона и повторной проверки BASE SHA. Далее нужны review и адресные suites;
исходные full-run FAIL сохраняются у root.

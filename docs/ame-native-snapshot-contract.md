# Нативный снимок AEP: контракт и тестовая проверка

**Справочный контракт:** AME-интеграционные задачи и M3/live acceptance сняты с текущего scope решением 2026-10-24; исторические статусы ниже сохранены. Возврат — после следующей версии Media Encoder и отдельного запроса. См. [решение в активном плане](../plans/target-app-execplan.md).

Статус на 2026-10-10: новый disposable build `build-63db389697a6421089900d260a1ae582`,
AEX SHA-256 `232c59d8db6376e4ab67cbdb9199f1e530cdc64bddb1b784d029168209912b55`,
прошёл независимый Sol review в ограниченном offline protocol/read-only bootstrap scope.
Review подтвердил 11 source hashes, PE/PiPL16000 и отсутствие P1/P2 findings в этом
scope. P1 fixture mutation теперь отказывается до осмотра проекта, JSX dispatch,
создания media/import и записи; P2 использует абсолютный rename через тот же удержанный
handle без replace/fallback/replay. Trusted stable parents предполагаются, а
`rootMetadataIsolation=UNVERIFIED`. Это не production acceptance: readiness=false,
productionBackend=false, installed=false, loadedInAE=false; M3 и live semantics
SaveProjectToPath, AME submit, encoding и media proof не подтверждены. Старый build
`build-f28c96906f7440df9bc2b71dc9d871bc` с 39 checks сохранён как отклонённый pre-fix.
CEP startup guard отдельно установлен в CEP folder; installation receipt подтверждает
три файла. После commit `d7746f1` root перезапустил только bridge daemon: загруженный
runtime aggregate `36d448cd4f3e01df940e06e4f1b4cc4dc7604b96e3b6b2733b8094e0424480fc`
совпал с текущим hash-set из 38 модулей. CEP panel не перезагружалась; guard в active
panel и child fresh bootstrap не проверены. Это не меняет статус native probe.
Рабочая цель — независимый AEP текущего in-memory проекта, включая unsaved edits,
с сохранением original path, dirty, видимого контекста и undo; это пока не обещание.
Root — единственный installer/live controller.

## SDK, доступ и сборка

- Пользователь указал локальную папку `C:\soft3`; архив
  `C:\soft3\AfterEffectsSDK_26.5_win.zip` предоставлен локально, SHA-256
  `ad86bd6d66a1e1ffe8471e4618e3de4dbc9679f2ca47ae9bbe69f78805c82960`.
  Intake receipt подтверждает безопасное извлечение 432 файлов / 5,704,481 bytes в
  `C:\Users\Ant\AppData\Local\AEAgent\SDK\after-effects-26.5\AfterEffectsSDK_26.5_win`;
  это локальное происхождение, не независимо подтверждённая загрузка с Adobe.
- В SDK есть headers, PiPL resources/tool и sample project; архив не содержит
  отдельного LICENSE/README/EULA. Локально проверены headers и Adobe Developer Terms:
  §4.1 development/testing и §4.5 дополнительные условия. Headers и PiPLtool не vendored.
- [Adobe Developer Terms](https://www.adobe.com/go/developer-terms), 18 июня 2024:
  §4.1 разрешает development/testing; §4.5 требует учитывать дополнительные LICENSE/ReadMe.
  Архив не содержит этих дополнительных файлов; сохранить локальное происхождение,
  version и SHA256, не приписывая ему непроверенную официальную download provenance.
- SDK 26.5 использует CompSuite13/v27; фактический AE 26.2 использует
  CompSuite12/v26 из `AE_GeneralPlugOld.h`. Собранный probe связывает только suites,
  доступные в текущем AE 26.2. Другая compatibility версия не предполагается.
- MSBuild `17.14.60.43110`, cl `19.44.35229.0`, Windows SDK `10.0.26100.0`;
  x64 `.aex` собран вне Adobe tree. Текущий build `build-63db389697a6421089900d260a1ae582`,
  SHA-256 `232c59d8db6376e4ab67cbdb9199f1e530cdc64bddb1b784d029168209912b55`;
  PE32+ AMD64 DLL, PiPL 16000, export `EntryPointFunc`. Binary — собственная
  сборка; Authenticode `NotSigned` не является проверкой подписи Adobe.
- Build receipt сверяет 11 исходников и SDK inputs; независимый review подтвердил
  точные source hashes, бинарный SHA и PiPL16000. Offline protocol smoke: 215 PASS,
  из них 22 реальные Win32 interleavings (18 P1 + 4 P2) и 18 ранних отказов.
  Harness вызывает общий closed guard напрямую, а не native state machine; эти числа
  не доказывают отсутствие real AE calls и не заменяют live load/semantics. Старый
  build с 39 checks остаётся отклонённым pre-fix evidence.

## Доказанные API и неизвестные гарантии

- `AEGP_ProjSuite6::AEGP_SaveProjectToPath(projectH, UTF16Path)` документирован как
  сохранение всего проекта по полному пути; `AEGP_SaveProjectAs` — отдельная операция.
  Сохранность original path, dirty и undo для SaveProjectToPath не обещана документацией.
- Публичный native SaveACopy entry не найден. `AEGP_ExecuteScript` исполняет script,
  но сам по себе не добавляет отсутствующий ExtendScript save-copy API.
- `app.project.revision` доступен как дополнительный readonly stale token через
  fixed script в probe; это не общий fingerprint и не гарантия revision semantics.
- `PF_AdvAppSuite2::PF_SetProjectDirty()` помечает проект изменённым. Это кандидат
  для восстановления исходного `dirty=true`, а не доказательство сохранности undo/context.
- Документированные set-clean, SetProjectPath и восстановление undo stack не установлены.
  `PF_SaveBackgroundState` не считается снимком AEP или восстановлением пользовательского контекста.
- AEGP получает host suites при загрузке приложения; документированный hot-load
  нового AEGP в уже открытую dirty-сессию не найден. Child probe этот пробел не устраняет.
- API evidence: Adobe SDK Guide в [ProjectSuite6](https://ae-plugins.docsforadobe.dev/aegps/aegp-suites/#aegp_projsuite6),
  [AdvAppSuite2](https://ae-plugins.docsforadobe.dev/effect-details/useful-utility-functions/#pf_advappsuite2)
  и [AEGP implementation](https://ae-plugins.docsforadobe.dev/aegps/implementation/).
  Это republication Adobe guide; полученный лицензированный SDK должен подтвердить definitions.

## Фиксированная операция нативного снимка

1. Будущий server-proposed typed request содержит operation/revision/hash, expiry,
   expected AE PID, project identity, single-use nonce и новый owned temporary AEP path.
   Arbitrary script, caller executable/arguments и произвольные output paths запрещены.
   Approval привязан к проверенной in-memory revision/fingerprint проекта. Перед callback
   сравнить её с новым чтением; handle/path/dirty и хеш дискового AEP не заменяют revision.
   Ручная правка после approval даёт stale refusal и требует нового подтверждения.
   Если текущую in-memory revision достоверно проверить нельзя, запись запрещена.
2. До записи native main-thread callback проверяет request, PID и ownership; снимает baseline:
   project handle/path/dirty, наблюдаемое состояние, active item/view/selection/visibility,
   graph вложенных comps и footage/proxy links; фиксирует hashes исходных файлов fixture.
   До вызова save сервер сохраняет durable fsync reservation. Destination отсутствует внутри
   эксклюзивно созданного owned UUID-каталога; canonical path/reparse проверки запрещают выход
   из него. Unknown удерживает reservation до точной сверки; новый save не разрешается.
3. SaveProjectToPath сериализует весь текущий проект в новый независимый AEP.
   Disk copy последнего saved AEP не заменяет snapshot unsaved memory.
4. Сразу перечитать original path/dirty и baseline state. Если исходный dirty=true
   стал false, PF_SetProjectDirty допустим только после успешного disposable probe этой ветви.
   Если path изменился, baseline clean стал dirty либо undo/context нарушен — criterion failed.
5. Успех требует валидного AEP, совпадения original baseline и durable receipt с nonce,
   source identity, output path/hash, native API/build identity и результатами read-back.
   Snapshot validation не является AME job acceptance.
6. Timeout/unknown сначала сверяется по receipt, процессу и output; автоматически не повторяется.
   SaveAs, save/reopen, New/Open original, GUI и executeCommand исключены из snapshot route.

## Подготовка вариантов в отдельном проекте

- После подтверждённого baseline snapshot отдельный owned stage открывает его копию
  в новом `-m` процессе; вариантные слои, диапазоны и AME inputs меняются только там.
- Original не получает вариантных edits. Для исходного clean проекта не нужен set-clean:
  чистоту сохраняет отсутствие этих edits в original, плюс проверенный snapshot contract.
- Native capture current memory всё равно должен выполняться в original host process.
  Stage не читает память другого AE процесса и не устраняет отсутствие загруженного backend.
- Полный AEP содержит nested comps; footage остаётся внешними ссылками, а не collected media.
  User-owned assets, source comps и исходный saved AEP не переписываются и не relinked.
- Future production path сохраняет typed solution library, server gates, dry-run,
  CEP confirmation/read-back и scoped cleanup; native backend не становится обходом этих gates.
  Текущий runner требует `project_save_required`; snapshot не освобождается от checkpoint gate.
  Для untitled/dirty native capture нужны явно определённые и проверенные checkpoint semantics;
  до их реализации production capture заблокирован. Probe действует только на owned fixtures
  через действующие разрешения; отсутствие сохранённого файла не разрешает bypass.

## Новая проверка границы writer — 2026-10-10

Предыдущий ACL-тест `run-ae6c99d7aabe41a4a2dadedd608e7421` завершился
`acl_asymmetry_failed`: из 12 AccessCheck десять запрошенных записей были отклонены,
два owner `READ_CONTROL` разрешены. Хеш receipt `35c924d3…1575a62` относится к прошлой
версии исходников. Проверка P2 выявила привязку executable только по basename, поэтому
этот бинарник нельзя запускать повторно. Дескриптор созданного child закрыт; удаление
точно созданного профиля вернуло S_OK, но наличие профиля на диске отдельно не проверялось.
Это не подтверждённое чтением файловой системы завершение очистки.

Новый итоговый run `run-39442a5bbcad41d8b5daafea8c85d429` проверял только ранние отказы
на текущих 8 исходниках. Независимый ae_reviewer подтвердил исходники и четыре случая:
неверный скопированный root (13), отсутствующий marker (2), изменённый marker (13) и
существующий claim (80). P2 закрыт в этих границах; замечаний P1/P2 не осталось.
Каждый процесс завершился кодом 10; stdout совпал с receipt; хеши дерева и ACL SDDL
root/child не изменились; вызовов native write, создания профиля, изменения ACL, child,
private write или `SetThreadToken` не было. Сверены 19 хешей исходников, включая 11
прежних probe-файлов. Положительный AppContainer/AccessCheck, успешный claim/flush, вызов
AE и разрешение writer не проверялись. `readiness=false`, `production=false`,
`rootMetadataIsolation=UNVERIFIED`; интеграция с host, MIC, AE и AME не доказана.
Результат прошлого ACL-теста нельзя переносить на текущие исходники.
Receipt: `.codex-runtime/ame-native-prerequisites/native-writer-feasibility/run-39442a5bbcad41d8b5daafea8c85d429/`.

В M1 действительно выполнялись холодный запуск AME, typed delivery и отдельное последующее
чтение транспорта. Позднее proposal M2 `ensure_ame_running` не исполнялся из-за
`project_save_required`; последующее обнаружение вернуло `HashMismatch`. M1 и новый run
не доказывают доверие к подписи, атомарность обнаружения/запуска, владение очередью или
готовность экспорта. Локальный пакет [для GPT Pro](../pro-review-bundles/ame-native-child-grant-and-existing-installation/bundle.md)
предназначен только для проектного анализа. Parent ACK не даёт полномочий child; M100
связывает план с текущим проектом, startup guard блокирует обычные действия panel в native
child. Разрешение fixture и исключение по hash не устраняют пробелы полной цепочки: AME
`runBatch` действует на общую очередь; полный список заданий, отдельный запуск и native job
identity/status не доказаны. Снимок текущей памяти требует plugin в исходном AE host, а
hot-load туда не подтверждён. Исходный dirty-проект не перезапускать. Полный путь для двух
вариантов не принят.

## Тестовая проверка и критерии приёмки

- Только три owned fixtures: saved clean, saved dirty с unsaved sentinel, untitled dirty.
  В каждом — nested comp, скрытый слой/visibility, selection/view state, footage/proxy dependency.
- До/после сравнить наблюдаемый original state, path/dirty и SHA256 всех fixture source files;
  повторно открыть snapshot только в другом owned процессе и проверить sentinel и dependency graph.
- Undo/redo history и результат дальнейшего undo должны остаться теми же на fixtures.
  Публичный способ чтения/восстановления стека не установлен: без воспроизводимой разрешённой
  non-GUI проверки критерий остаётся непроверенным; пользовательский проект для этого не трогать.
- Own plugin вне probe environment немедленно inert: не регистрирует рабочие hooks и не пишет файлы.
  В probe: boot nonce + owned root, native PID/build-hash handshake, затем root ack ожидаемого PID;
  до ack запрещены project actions. Unknown/foreign PID/request дают отказ без мутации.
  Перед каждой записью дополнительно сверить текущий проект с fixture manifest: identity,
  path/source hash и in-memory fingerprint. Untitled требует backend-created fixture token
  и sentinel; один правильный PID/nonce не разрешает запись чужого проекта.
  Negative probes: правильные PID/nonce/build + чужой AEP или изменённый после approval
  sentinel должны дать отказ до SaveProjectToPath, без создания snapshot.
- Install own `.aex` в отдельный app-specific `Support Files\Plug-ins` каталог штатным способом;
  EPERM и signature denial не обходить. [Adobe: plugin lookup происходит при старте](https://helpx.adobe.com/after-effects/desktop/apply-effects-and-animation-presets/effects-and-animation-presets/effects-animation-presets-overview.html).
- Новый `AfterFX.exe -m` запускается без restart/закрытия current dirty процесса.
  [Adobe: -m создаёт новый экземпляр, preferences общие](https://community.adobe.com/questions-529/can-i-limit-how-much-memory-afterfx-exe-consumes-when-invoked-from-the-command-line-31606).
  Отдельный PID не доказывает изоляцию preferences/cache/CEP; их общие эффекты входят в probe audit.
- Main AME executable `HashMismatch` и console DLL `Valid` — разные результаты подписи.
  `Valid` DLL не делает main executable launchable; transport signature gates сохраняются.
- Offline review принял исправления P1/P2 только как protocol/read-only bootstrap
  candidate под допущением trusted stable parents. Harness: 215 PASS, 22 Win32
  interleavings и 18 ранних отказов; он вызывает общий closed guard, не native state
  machine. Live AE calls/load не выполнялись и не тестировались. Root metadata
  isolation остаётся UNVERIFIED. Path/dirty/undo guarantees, production capture current
  memory, M3 и AME end-to-end остаются непроверенными.

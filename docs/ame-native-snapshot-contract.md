# Нативный снимок AEP: контракт и тестовая проверка

Статус на 2026-10-10: disposable native probe собран из локально предоставленного
After Effects SDK 26.5. Предварительный offline protocol smoke (39/39) не принят:
независимый review обнаружил в native implementation P1 TOCTOU между проверкой
destination и native save, а также P2 race между flush/close `.part` и Move.
Текущая сборка — pre-fix evidence, не одобренная реализация; исправление и повторный
review/build ожидаются. readiness=false, production=false, installed=false,
loaded=false. Live-семантика SaveProjectToPath не проверена; M3, AME submit,
encoding и media proof не подтверждены.
CEP startup guard отдельно установлен в CEP folder; installation receipt подтверждает
только три файла. Loaded panel, daemon reload и child fresh bootstrap не проверены;
это не меняет статус native probe.
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
  x64 `.aex` собран вне Adobe tree. Build `build-f28c96906f7440df9bc2b71dc9d871bc`,
  SHA-256 `da6efc3c162f1bcedda27cd6ff51f6790d489a5e8d7a06b25883460b0b73f098`;
  PE32+ AMD64 DLL, PiPL resource 16000, export `EntryPointFunc`. Binary — собственная
  сборка; Authenticode `NotSigned` не является проверкой подписи Adobe.
- Build receipt сверяет исходники, фактические headers и PiPLtool; SHA архива в нём
  указан как полученный prerequisite, а не повторно вычисленный build helper. Старый
  pre-fix offline protocol smoke: 39 PASS, но review выявил два race выше. Этот счёт
  не является acceptance; необходимы исправление, новый build и независимый review.
  Даже после них offline harness не докажет AE semantics или live AEGP load.

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
- Спецификация требует Win32 exclusive reservations, запрет overwrite,
  hardlink/junction traversal и удержание owner/root. Нынешний harness набрал 39 PASS,
  но implementation review выявил незакрытые destination TOCTOU и `.part` replacement
  races; до исправления и повторного review acceptance отсутствует. Harness не
  эмулирует AE semantics. Path/dirty/undo guarantees, production capture current
  memory и AME end-to-end остаются непроверенными.

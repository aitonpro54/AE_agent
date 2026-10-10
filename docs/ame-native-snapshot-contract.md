# Нативный снимок AEP: контракт и тестовая проверка

Статус на 2026-10-10: архитектурный контракт; backend не реализован и не проверен.
Документ не закрывает M3 и не подтверждает AME submit, encoding или media proof.
Рабочая цель: независимый AEP всего текущего in-memory проекта, включая unsaved edits,
с сохранением original path, dirty, видимого контекста, состояния проекта и undo.
Flash запрещён текущим поручением; root — единственный installer/live controller.

## SDK, доступ и сборка

- Официальный источник: [Adobe After Effects SDK](https://developer.adobe.com/after-effects/)
  → [Developer Console](https://developer.adobe.com/console/servicesandapis/ae).
- Публичный JS Console отдаётся HTTP 200. Его SDK catalog использует
  `https://developer.adobe.com/console/graphql`: `GetSdks` возвращает version code,
  `fileName`, `termsAndConditionsUrl`; `getDownloadLinkForSdk(versionCode)` — archive URL.
- Анонимный `GetSdks` получил HTTP 403. Console client требует Adobe IMS login.
  Credentials/session tokens не извлекались; альтернативные headers для обхода не пробовались.
- Опубликованные Adobe [CC2017 SDK](https://www.adobe.com/devnet/aftereffects/sdk/cc2017.html)
  и [CC2017 EULA](https://www.adobe.com/content/dotcom/en/devnet/aftereffects/sdk/cc2017/eula.html)
  дали web fetch 404 и локальный anonymous HTTP 403. Guess ZIP URI не использовались.
- Нужен обычный Console login/download либо уже полученный официальный SDK archive.
  Exact archive URL, SDK version, Windows headers и PiPLtool пока не получены.
- [Adobe Developer Terms](https://www.adobe.com/go/developer-terms), 18 июня 2024:
  §4.1 разрешает development/testing; §4.5 требует учитывать дополнительные LICENSE/ReadMe.
  После получения архива сохранить происхождение, version, SHA256 и его точные условия.
- Современный SDK предпочтителен. Genuine legacy SDK допустим лишь после проверки
  нужных suite definitions и успешного AE26 probe; совместимость по возрасту не предполагается.
- Build route: взять штатный Windows AEGP sample, проверить его `.vcxproj`, headers,
  x64 target и PiPL custom build; собрать вне Adobe install tree, затем проверить `.aex`.
- Точный MSVC/Windows SDK target определяется фактическим sample, а не онлайн догадкой.
  Microsoft Build Tools установлен: MSBuild, MSVC x64/x86, Windows SDK 26100; exit code 0.
  Bootstrapper SHA256/Authenticode `Valid` проверены; MSBuild `17.14.60.43110`,
  cl `19.44.35229.0` и Windows SDK `10.0.26100.0` подтвердили x64 build/run с exit 0.
  Это проверка C++ toolchain, не сборка или загрузка AEGP.
  C++ stub, headers из чужого mirror и portable compiler без проверенной ABI не являются backend.

## Доказанные API и неизвестные гарантии

- `AEGP_ProjSuite6::AEGP_SaveProjectToPath(projectH, UTF16Path)` документирован как
  сохранение всего проекта по полному пути; `AEGP_SaveProjectAs` — отдельная операция.
  Сохранность original path, dirty и undo для SaveProjectToPath не обещана документацией.
- Публичный native SaveACopy entry не найден. `AEGP_ExecuteScript` исполняет script,
  но сам по себе не добавляет отсутствующий ExtendScript save-copy API.
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
- Завершение этого документа подтверждает только reviewable spec. SDK/build/load, path/dirty/undo
  guarantees, production capture current memory и AME end-to-end остаются непроверенными.

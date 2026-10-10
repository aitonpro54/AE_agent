# Экспорт вариантов титров через AME: состояние реализации

Планирование AME разбито на четыре этапа в [плане](../plans/ame-title-batch-execplan.md).
M1 (транспорт и каталог пресетов) завершён и зафиксирован commit `7c97574`.
M2: реализация `ensure_ame_running` и её offline-проверки готовы; живой запуск
остановился на обязательной проверке проекта `project_save_required`. Полная
цепочка двух вариантов не принята.

## Доступные инструменты

`inspect_ame_transport` выполняет фиксированные чтения AME через BridgeTalk.
Он возвращает build number, форматы, ограниченные метаданные API, источник и
время наблюдения. `deliveryVerified` подтверждает ответ на новую команду;
`adapterReady=false` оставляет submit/start/status неподтверждёнными. Для warm
проверки передают прежний `expectedSessionNonce` и сверяют PID/время старта AME.
Подробности, включая exact-nonce reconciliation, описаны в
[контракте транспорта](ame-transport.md).

`ensure_ame_running` доступен только как один server-proposed typed шаг в обычном
потоке proposal → dry-run → подтверждённое/autonomous выполнение. Для запуска
нужны текущий разрешённый контекст плана и сохранённый именованный AEP. Перед
запуском создаётся дисковый checkpoint через `COPYFILE_EXCL`; запуск не меняет
содержимое проекта. Готовность означает только успешную последующую проверку
AME-транспорта и стабильного процесса; известный boot nonce дополнительно
проверяется. Готовность кодировать и статус задания этим не подтверждаются.
В текущем live прогоне шаг не был исполнен: native read потребовал
`project_save_required`. Это не доказывает успех `ensure_ame_running` и не является
тестом отказа запуска при закрытом AME. Холодный запуск AME и warm transport,
описанные для M1, проверяли транспорт отдельно; startup script проверен в offline
VM.

`list_ame_presets` принимает `{}` и читает существующие пользовательские EPR AME26 и системный
`Settings/EncoderPresets`, не добавляя элементы в очередь. Live-проверка нашла 11
пресетов, `complete=true`, `issues=0`; XML даёт имена и исходные format/exporter
поля. Формат не вычисляется из имени. Одинаковые имена остаются отдельными
записями, выбор требует точного пути либо пары `presetId` + `sha256`.
`nativeAvailability=not_verified`: наличие и корректный разбор EPR не доказывают,
что AME применит его к экспорту.

## Проверенное live-состояние и ограничения

Окончательный source AE Agent bridge-daemon активирован как PID `12528`, запущенный в
`2026-10-10T10:59:29.107Z`, SHA-256
`cb32ae91fd8af2341e35b89769425c67b3aafdb4c273871e3b66202f8ed82aa4`.
Панель показывала `connected`, idle. Reload helper получил `EEXIST` на собственном
log после stop; остановка была сверена, daemon восстановлен с отдельным log.
CEP, AE и AME не перезагружались.

В момент отклонённого proposal native `get_project_info` прочитал проект: `file=null`, 59 items,
`activeFootage`; последующий фиксированный inspect показал `dirty=true`.
Эти данные относятся к уже открытому состоянию. Мы не создавали, не сохраняли и
не открывали этот проект. Запрос warm2
`2fb6d5e3-db3c-4269-8be1-fa695c0029b2` получил `deliveryVerified=true` и
`warmSessionVerified=true` с тем же boot nonce. Очередь AME не менялась.
Финальный warm3 read также прошёл; в AE к тому моменту был открыт другой
именованный проект с `dirty=true`. Эти проекты мы не создавали и не меняли.

Native discovery нашёл установленный AME26.2.0.52, но Windows Authenticode
вернул `HashMismatch`. `ensure_ame_running` возвращает для такой установки
`ame_running_installation_unverified` с диагностикой и не запускает/не подключает
её как доверенную. Причину несовпадения подписи не устанавливали.
Смешение модулей Windows PowerShell5.1 и унаследованного PowerShell7 исправлено;
штатные modules и UTF-8 выбраны без изменения execution policy.

Исходный `titr_all.aep` имел SHA-256
`e55edfd680a6f4bad222389ffcf5b6d08a18ff4afd2a15a27f944bdcf8856754` до и после
отклонённого proposal; содержимое файла не менялось.

Публичный AE Project API не предлагает `saveCopy`/`saveAsCopy`. Save As и
reopen меняют dirty/context, а копирование только чистого сохранённого файла не
сохраняет текущие edits. Native-кандидат `AEGP_SaveProjectToPath` с условным
`PF_SetProjectDirty` не доказывает `SaveCopy`: сохранность path, dirty и undo
требует disposable-fixture probe. Контракт и критерии — в
[native snapshot contract](ame-native-snapshot-contract.md). Варианты следует
готовить только в owned staging project после доказанного baseline snapshot;
исходную видимость слоёв и исходный проект предпочтительно не менять.

## Native SDK и build tools

В проверенных локальных каталогах After Effects SDK не найден. Adobe Developer
Console SDK catalog при anonymous запросе вернул HTTP 403; нужен обычный вход на
[странице AE services](https://developer.adobe.com/console/servicesandapis/ae).
Ссылки Adobe CC2017 SDK/EULA дали 403/404. SDK headers и лицензия не vendored;
заглушка на C++ не считается backend.

По разрешению пользователя официальный Microsoft Build Tools bootstrapper 17.14.41
скачан и проверен: Authenticode `Valid`, SHA-256
`37bb0fb429d163ecebd272a865d11a37b906d152bef960da2ddb29c2e2fd6eeb`.
Root начал установку MSBuild, MSVC x64/x86 и Windows SDK 26100 в
`C:\Users\Ant\AppData\Local\AEAgent\BuildTools2022`; она завершилась с exit code
0 (`install-exit.json`, PID 4236). MSVC v14.44.35207 присутствует. Это подтверждает
завершение setup. `vswhere` сообщил `isComplete=true`, `isRebootRequired=false`;
MSBuild `17.14.60.43110`, `cl` `19.44.35229.0`, SDK `10.0.26100.0` доступны.
Минимальная программа с `<Windows.h>` и `GetCurrentProcessId` собрана и выполнена
x64: `ABI pointerwidth=8 PID=20536`, exit 0; Windows SDK `Windows.h` и x64
`kernel32.lib` присутствуют. Fixture и receipt: [build smoke](../.codex-runtime/ame-native-prerequisites/build-smoke/toolchain-receipt.txt),
exe SHA-256 `0c6ed42d3dc18a7416e5446ec222e9c39521c496261a765a50c9da4dd9ed8822`.
Это подтверждает локальный C++ toolchain, но не SDK backend, AEGP загрузку или
интеграцию AE/AME.

AEGP загружается при старте AE; текущую dirty-сессию не перезапускать. `-m`
создаёт отдельный процесс, но preferences общие, поэтому это не изолированная
среда probe. AME main executable `HashMismatch` остаётся отдельным от `Valid` DLL;
строки `--help` из бинарника без запуска не подтверждают поведение/exit code.

Для AME26 wrapper не документирует запуск одного выбранного задания или полный
список очереди. `runBatch` действует на общую очередь; безопасный запуск только
своего задания не доказан. Наш UUID/GUID не становится native job ID. Events и
progress могут подтверждать статус только собственного задания после проверенной
цепочки snapshot + submit; такой цепочки пока нет. Поэтому snapshot/submit/start/
status не зарегистрированы как готовые инструменты, а `stopped` не доказывает
пустую очередь.

Подготовка Remote AME остановилась на Windows `EPERM` при записи INI до запуска; SHA конфигурации не изменился,
процесс не создавался. Отказ доступа не обходили; поддержка AEP и изоляция очереди
через этот путь не доказаны. Полная live-приёмка двух вариантов не выполнена.

Источники: [Adobe BridgeTalk sample](https://github.com/Adobe-CEP/Samples/blob/master/PProPanel/jsx/PPRO/Premiere.jsx),
[AME ExtendScript](https://ame-scripting.docsforadobe.dev/reference/),
[Project.save](https://ae-scripting.docsforadobe.dev/general/project/#projectsave),
[Remote AME driver](https://github.com/Brainferno/brainferno-mcp-bridge/blob/main/packages/server/src/drivers/ame-webservice.ts).

## Проверки

M1 offline: `smoke:ame-transport` — 17 групп strict ES3/fake VM; `smoke:ame-presets`
проверяет XML, identities, неоднозначность и границы обхода. M2 offline:
`smoke:ame-running` — 19 групп, включая резервирование/сверку неизвестного
исхода; приложения не запускались. По указанным preset fixtures симлинк файла
недоступен в Windows host, junction-каталог проверен. Ни один offline smoke не
является доказательством live запуска или кодирования видео. Полный
`smoke:planning`, rules, семь JS syntax checks и diff checks прошли.

Финальный bounded review snapshot contract подтвердил три safeguards на уровне
спецификации; это не проверка backend. Последний passive bridge read root показал
`connected=true`, pending/inflight/edit отсутствуют, lifecycle generation 7 без
block/pending; daemon PID `12528` и source SHA не менялись. AE/AME/CEP не
перезагружались, live actions не выполнялись.

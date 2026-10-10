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

После commit `d7746f1` root перезапустил только bridge daemon: PID `12528` сменился
на `24440`, `startedAt=2026-10-10T12:35:16.585Z`. Загруженная runtime identity
`sourceSha256=36d448cd4f3e01df940e06e4f1b4cc4dc7604b96e3b6b2733b8094e0424480fc`
совпала с текущим вычислением `review-evidence.runtimeIdentity` по 38 модулям.
Это aggregate fingerprint; raw SHA `bridge-daemon.js` (`be59480b…fda4534`) имеет
другую основу и с ним не сравнивается. Root сообщил свежие `connected_idle`,
pending/inflight `0` и прежний panel connection ID. Read-only `get_project_info`
успешен: `Bylina_Muniver_русский_оркестр_konkurs_kino.aep`, 752 items,
revision `77577884`. Это текущее чтение; сохранность прежнего project path/hash
не утверждается. CEP/AE/AME не перезагружались, GUI не использовался.

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

## Нативный probe и SDK

Пользователь указал `C:\soft3`; локально предоставленный архив
`AfterEffectsSDK_26.5_win.zip` имеет SHA-256
`ad86bd6d66a1e1ffe8471e4618e3de4dbc9679f2ca47ae9bbe69f78805c82960`.
Безопасный intake receipt подтверждает 432 файла / 5,704,481 bytes в
`C:\Users\Ant\AppData\Local\AEAgent\SDK\after-effects-26.5\AfterEffectsSDK_26.5_win`.
Это подтверждает локальный архив и совпадение его hash, но не происхождение загрузки
с официального сайта. В архиве нет LICENSE/README/EULA; локально проверены Adobe
Developer Terms §4.1 (development/testing) и §4.5 (дополнительные условия). SDK
headers и PiPLtool не vendored.

Новый disposable probe собран офлайн: `build-63db389697a6421089900d260a1ae582`,
AEX SHA-256 `232c59d8db6376e4ab67cbdb9199f1e530cdc64bddb1b784d029168209912b55`,
PE32+ AMD64 DLL, PiPL 16000, export `EntryPointFunc`. Независимый Sol review PASS
для offline protocol/read-only bootstrap candidate: 215 PASS, включая 22 Win32
interleavings и 18 ранних отказов; точные 11 source hashes и binary hash сверены.
Harness вызывает общий closed guard напрямую, не native state machine; его счётчики
не доказывают отсутствие реальных AE calls. P1 безопасно отказывает до fixture
mutation; P2 использует absolute same-held-handle rename без replace/fallback/replay.
Допущение trusted stable parents; `rootMetadataIsolation=UNVERIFIED`.
Старый build `build-f28c96906f7440df9bc2b71dc9d871bc` / SHA
`da6efc3c162f1bcedda27cd6ff51f6790d489a5e8d7a06b25883460b0b73f098` остаётся
отклонённым pre-fix evidence (39 PASS). SDK 26.5 содержит CompSuite13/v27, а AE 26.2 использует CompSuite12/v26
из `AE_GeneralPlugOld.h`; сборка привязана к ABI AE 26.2. Authenticode `NotSigned`
относится к собственной собранной DLL и не является проверкой подписи Adobe.
Receipt: `.codex-runtime/ame-native-prerequisites/native-probe-build/<buildId>/`.

Текущие статусы: `readiness=false`, `productionBackend=false`, `installed=false`,
`loadedInAE=false`; live load, SaveProjectToPath и сохранение path/dirty/undo/context не
проверялись в AE. M3/production snapshot tool не приняты. Протокол и границы offline review описаны в
[native snapshot contract](ame-native-snapshot-contract.md). Это ограниченный
эксперимент, не завершение M3 и не production snapshot tool.

CEP guard установлен файловым deployment в обычную папку
`%APPDATA%\Adobe\CEP\extensions\com.codex.aemcpbridge` (без reparse/junction).
Read-back hashes совпали с source для `index.html`, `panel.js` и
`native-probe-startup-guard.js`; исходные `index.html`/`panel.js` сохранены в
`.codex-runtime/ame-native-prerequisites/cep-guard-deployment/e582dd1a-3e48-48eb-8fd8-9874d484b1bd/`.
Bridge daemon после этого был перезапущен и его server runtime identity подтверждена.
CEP-панель не перезагружалась; installed guard в активной панели и child fresh
bootstrap не проверены. После штатного restart bridge aggregate runtime identity совпала
с root-reported loaded hash, а root сообщил `connected_idle`, pending/inflight 0 и
успешный свежий `get_project_info` для текущего проекта. Это подтверждает installed files и server source runtime,
но не активный CEP guard или live isolation. Runtime identity receipt:
`.codex-runtime/ame-transport-probe/runtime-identity-d7746f1-20261010-004b3911-8169-4752-9916-9567dfb3107c/runtime-identity.json`.
Source offline проверки guard30/refresh33/panel-actions48 и raw dispatch0
не доказывают loaded behavior. Raw FILE lane пока не bound к content hash,
поэтому это не content-safe путь; дальнейшее M100 расширение не входит в этот этап.
CEP-панель и AE-процессы не перезапускались. Ни один отдельный `-m` process,
shared preferences/cache или guard в дочернем CEP не считается изолированным или
проверенным; live операции остаются только под root controller и собственными gates.

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

## Обновление границ — 2026-10-10

Пользователь потребовал продолжать без официального установщика AME; не предлагать ремонт,
загрузку, установку, обновление или принудительное закрытие. M1 включал холодный запуск AME,
подтверждённую typed delivery и отдельное последующее чтение транспорта. Предложение M2
`ensure_ame_running` не исполнилось из-за `project_save_required`; последующее обнаружение
вернуло `HashMismatch`. Реализация `inspect_ame_transport` выполняет read-only чтение
существующей установки без проверки подписи; BridgeTalk discovery не атомарен с будущим
запуском. Исходный код `ensure_ame_running` сохраняет `signatureValid` gate и для warm-процесса.
Не менять executable, подпись или существующие gates. Ручное исключение по hash — только
вопрос для review, не разрешение и не решение полной цепочки.

Исходник `mcp-server/bridge-daemon.js:12784` регистрирует три AME tools:
`inspect_ame_transport`, `list_ame_presets`, `ensure_ame_running`. Исходник
`mcp-server/mcp-adapter.js:166,222` при каждом запросе получает от daemon `tools/list`,
а строка 183 направляет `tools/call` по имени; `tools/list_changed` в source нет. В текущем
root snapshot `ALL_TOOLS` этих имён нет; обновление метаданных подключённого host не
подтверждено. Регистрация и маршрутизация в исходниках не доказывают, что host объявил эти
инструменты чату.

Локальный пакет GPT Pro содержит задание на русском и точные фрагменты исходников. Независимый
ae_reviewer подтвердил 8 текущих feasibility sources и четыре ранних отказа: неверный root,
отсутствующий или изменённый marker, существующий claim. P2 закрыт только в этой области.
Положительные AppContainer/AccessCheck, claim flush и разрешение writer не проверялись;
`acl_asymmetry_failed` относится к прежней версии исходников. M100 связывает изменяющий план
с текущим сохранённым проектом; startup guard блокирует действия panel в native child; parent
ACK не даёт ему полномочий, raw FILE не поддерживается. AME26 не подтверждает полный список
очереди, отдельный запуск и native job identity/status; общий `runBatch` действует на общую
очередь. Снимок текущей памяти требует native plugin в исходном host, hot-load туда не
подтверждён. Ни исключение по hash, ни разрешение fixture не образуют полного решения.
Цепочка для двух вариантов не принята; четыре snapshot/submit/start/status tools не
зарегистрированы.

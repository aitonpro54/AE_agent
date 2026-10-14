# Два тестовых состояния существующего текста

14 октября 2026. Пользователь разрешил «любые два», первый и второй, для
тестового прогона. Это уточнение содержания, а не завершение интеграции или
рендера. Текущий результат — 0/2. Решение ниже условно до приёмки реализации.

## Закрытый режим выбора

Добавить отдельный `FirstTwoObservedTextStatesV1`; существующий exact-name
режим сохраняется. Для этого теста результатом являются два состояния
видимости существующего текста. Они не доказывают наличие двух законченных
семантических вариантов мероприятия: дата и название могут быть отдельными
слоями. Новые строки Source Text не создаются, оформление не заменяется.

До C1 фиксируются enum режима, count2, ранжирование по актуальному layer.index,
правило root/target, ceilings полного inventory, графа и ответа, existing leaves,
два slot/output/snapshot selector, три preview selector каждого slot, render-range
правило, producer/schema/hash domains и конечный cost vector. Не снимать
проверки имён в обычном режиме и не подставлять caller JSON вместо authority.

Сохранять известные точные root/target selectors. Если их нет, native inventory
должен определить единственную поддерживаемую common-comp пару с однозначным
reachable path; несколько подходящих пар закрывают выбор. После отказа не
искать другую композицию скрытым повтором. Caption не является selector proof.

Для этого прогона root/target candidate — `TITR_ALL_VARIANTS_FHD`, одна общая
композиция. Имя получено пассивным чтением Composition/Timeline UIA; без
активации, ввода, переключения или открытия проекта. Это ограничивает поиск,
но не подтверждает identity. Рабочий disk candidate — `titr_all folder/titr_all.aep`,
SHA256 `01A5985B82CB207EEDBEC64BDD727187990C9E25BF2C1C8BCB73C1267C50B34A`.
Первый native READ обязан подтвердить actual RAM file/hash/dirty и уникальные
comp IDs. Transfer original с SHA256 `E55EDF…56754` сохранён отдельно;
автоматически открыть его вместо текущей рабочей копии нельзя.

## Native-owned Manifest после READ

Полный фактический inventory target-comp, без truncation, должен содержать
минимум два direct existing TextLayer с уникальными положительными IDs и
непустым после проверки whitespace текстом. Проверка whitespace не изменяет
Source Text. Unsupported expressions, изменения текста во времени, flags,
dependencies, неполное покрытие или неоднозначный graph закрывают выбор.

Выбрать первые два по layer.index, используя ID для identity, а не сортировки.
Их content hashes должны различаться, вклад в заданный render range должен
быть подтверждён. Controlled IDs — ровно эта пара: slot1 включает первый и
выключает второй; slot2 делает обратное. Остальные слои сохраняют baseline.

Private native producer удерживает actual root/comp/layer IDs, индексы, имена,
текст/content hashes, полную baseline visibility bitmap/graph, font facts,
project/source/policy/session/generation/boot/actor/transport binding и исходный
request/result capture. Manifest и preissued restoration descriptor immutable.
M100 связывает этот объект с исходными facts; публичный fromManifest(JSON),
caller echo variants и один экспортированный hash authority не создают.

После clean-copy нужны own receipt и фактическая инспекция копии. Сопоставление
с исходником по содержанию/структуре должно быть однозначным; сохранение IDs
или GUID при копировании не предполагается. Checkpoint, stage, enqueue, START,
dry-run, confirmation, read-back и restoration используют exact own bindings.

Source M до C1 включает всю программу выбора, parser/normalizer, inventory,
manifest sealing, copy reconciliation, immutable-text guards и restoration.
Actual IDs заполняют операнды этой уже принятой программы внутри единственного
original lifetime. Ранний отдельный production READ, disposal и policy hot-upgrade
не разрешены.

## RAM, шрифты и стоимость

Требовать фактическое `typeof app.project.dirty === "boolean"` и false, текущий
file/revision и physical file/hash binding. Missing/true или несовпадение с
принятым source selector закрывает эффекты и сохраняет ручное RAM-состояние.
Transfer original и открытая рабочая копия — разные кандидаты; автоматическое
переключение между ними этим решением не разрешено.

В уже посчитанный inspection включить bounded facts о host-resolved Font
objects реально используемого текста: layer/time, face identity, substitution,
валидность references и полное mixed-style coverage. Font-name/size или поиск
установленного файла по имени не заменяют эти facts. Unsupported, missing,
invalid или substituted required coverage закрывает соответствующую приёмку.
Просмотр трёх фактических PNG каждого slot остаётся обязательным; универсальная
binary-font/glyph attestation не заявляется. Основание API: [AdobeDocs sample](https://github.com/AdobeDocs/after-effects/blob/main/samples/ReplaceFontsInProject_ScriptUISample.jsx)
и [Adobe Engineering](https://community.adobe.com/questions-534/new-text-scripting-hooks-starting-after-effects-beta-24-0x14-314275).

Бюджет [двух jobs](owned-runtime-two-title-budget.md) сохраняется только при
получении facts в тех же уже посчитанных READ deliveries/results и private rows.
Новый dispatch/helper/effect/Store row или повторный layer-read требует нового
vector до C1. Арифметика сама не доказывает фактический footprint.

Приёмка: missing/truncated/ambiguous inventory; date/title не объявляются
semantic alternatives; чужой result/caller variants/manifest JSON; изменённый
Source Text/shared layer; duplicate IDs/indices; foreign copy; mixed-font gaps;
dirty/unsupported source; restoration debt и cost overflow. До совместной source,
native/offline, closure/M/build/seal приёмки production остаётся CLOSED.

Решение подготовлено read-only `ae_architect`; файлы/runtime исполнителем не
изменялись, runtime model/effort metadata не получены. Root принимает отдельный
тестовый режим и сохраняет explicit evidence limits.

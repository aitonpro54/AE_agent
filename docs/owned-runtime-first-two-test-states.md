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

До первого seal/C1 фиксируется имя checkpoint `titr_all-source-checkpoint.aep`
в разрешённом snapshot root, отдельно от двух variant snapshots. Native policy
проверяет exact leaf и отсутствие совпадений с ними без учёта регистра; fixed
execution scope связывает имя с canonical snapshot root и его physical identity.
Новый UUID или произвольный caller path имя checkpoint не заменяют. Root
подготавливает и удерживает snapshot root до C1; сохранение требует actual own
effect receipt и read-back, наличие descriptor само по себе не означает save.

Source M до C1 включает всю программу выбора, parser/normalizer, inventory,
manifest sealing, copy reconciliation, immutable-text guards и restoration.
Actual IDs заполняют операнды этой уже принятой программы внутри единственного
original lifetime. Ранний отдельный production READ, disposal и policy hot-upgrade
не разрешены.

## Полная длительность и контрольные кадры

Для first-two теста до C1 принять отдельную frozen программу
`FullObservedRootRangeV1` + `QuartileFramesV1`, только при actual root=target.
Literal режим сохраняется. Authentic comp READ доставляет duration,
frameDuration, frameRate и displayStartTime как round-trip binary64 строки
`toPrecision(17)`; caller range/fps/sample overrides отвергаются. Новых READ
deliveries для этих полей нет.

Native resolver выбирает ровно одну строку конечной exact IEEE754 FPS table;
произвольное 29.97 и epsilon comparison не поддерживаются. Frame count N —
единственный integer 4..8191, для которого actual duration равна точному
round-to-nearest-even binary64 произведению N и actual frameDuration. Полный
локальный диапазон — [0,N); displayStart проверяется отдельно и не сдвигает
экспорт. Три indices — integer N/4, N/2 и 3N/4, distinct и меньше N.

Ceiling8191 связан с packet capture1MiB: root envelope128 bytes и maximum
packet entry span128 bytes, только pos/size. Actual writer footprint, отсутствие
truncation, file bounds и packet/frame coverage ещё должны пройти implementation
proof. Existing RGBA/PNG ceilings и six decoder children/job сохраняются.

Observed-mode AME producer использует Entire0, literal producer — Custom3.
Пользовательские workArea, comp FPS и Source Text не меняются. Source timing и
output expectation раздельны: первый Metadata child обязан подтвердить actual
output rational FPS и countN до связывания output sample indices. Видимый EPR
29.97 не доказывает совместимость другого source FPS; mismatch закрывает media.
Entire0/Custom3 различаются в [legacy EncoderWrapper reference](https://ame-scripting.docsforadobe.dev/reference/#encoderwrapper);
actual behaviour установленного AME26 этим reference не подтверждено.

Это Source GO на конкретную программу, а не на текущую реализацию: exact table,
parser/arithmetic, immutable manifest, copy/START/AME/media/PNG consumers и
restoration входят в общий Source M до C1. Actual host timing, RuntimeFIT и
export acceptance остаются непроверенными. До их проверки production CLOSED.

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

## Проверенный блок реализации

Исправлены три source-пробела: режим приходит из native embedded policy и
сохраняется facade; text rows сверяются с полным all-layer census и исходными
данными композиций; полный project-item census закрывает одинаковые имена
кандидатов. Новый getter schema — `ae-agent.owned-first-two-text-inventory.v2`.
Данные получаются в тех же READ deliveries. Число dispatch/Store rows не увеличено;
ограничения полного ответа сохраняются, silent truncation не допускается.

Independent Source GO: `4E73F419…`, facade `23726E9D…`, qualification `AE9BF001…`.
Portable C++ predicate проверен на 29 случаях, vendor predicate — на 35;
все прошли. Root удерживал исходные четыре MSBuild и два proof process,
подтвердил CLOSED/exit0/EOF, закрыл handles и завершил owner25696 с exit0.
Acceptance: `.codex-runtime/resume-msi-20261014/isolated-predicate-acceptance-d724c080916e.json`,
SHA256 `55FEE5B6D8F57BE2912DA109C45EFE48CFD346D72D09208A1FBA110912533DEA`.

Это проверка фактического C++ predicate на synthetic inventories. Actual AE
inventory/FontObjects, новый полный addon, D46–50, финальный M/C1 и два видео
этим блоком не подтверждены. Production остаётся CLOSED, результат — 0/2.

Portable observed-timing resolver реализован отдельно и принят independent
review: exact IEEE754 whitelist, two-limb dyadic multiplication, RN-even и
unique N4..8191 без зависимости от текущего floating rounding mode. Независимый
Node oracle проверил 81 920 rounding cells, 81 880 unique-grid и 80 negative
случаев. Actual C++ proof прошёл 285/285; scope Pin40 encoding — 12/12.
Freeze11 `ns-289831993411` → `tp-dec9ff0c5c9b`, TU2/1; четыре исходных MSBuild
и два proof process завершены CLOSED/exit0/EOF, handles закрыты, исходный
owner23012 завершён с exit0. Acceptance SHA256 `F6698FFE…5A11D9` в
`.codex-runtime/resume-msi-20261014/isolated-scope-timing-acceptance-dec9ff0c5c9b.json`.
Scope proof проверяет actual C++ preimage encoding с accepted ABI headers;
actual SHA256 authority, полный current NAPI, actual host timing и AME не доказаны.

Следующая ограниченная сборка подготовки прошла для всех трёх компонентов:
freeze58 `ns-01119d2e95fc` → `ic-bb380ddc24c0`, TU9/13/3. Шесть исходных
MSBuild завершены CLOSED/exit0/EOF, handles закрыты, owner25756 завершён с exit0.
Acceptance SHA256 `ECD42C14…50F213AB`; это снимок подготовки, без последующих
изменений observed timing и без приёмки checkpoint/file-effect kernel.

Исправленный scope codec прошёл 13/13, native JSON — 50/50:
freeze15 `ns-9ab8795893dd` → `tp-6ddfb29a6897`, TU2/2. Четыре исходных MSBuild
и два proof process завершены CLOSED/exit0/EOF; handles закрыты, owner26892
завершён с exit0. Acceptance SHA256 `A28013B4…146B48BC`. JSON использует прежние
13 getter fixtures и 10 parser checks плюс 27 проверок quiescence; актуальный
observed getter и фактические capability/lifetime этим тестом не подтверждены.

Оба acceptance-файла находятся в ignored `.codex-runtime/resume-msi-20261014/`.
Root выполнил этот блок как единственный держатель исходных процессов;
ограниченный source review — `ae_reviewer`, production writer — `ae_specialist`.
Полное выполнение, M/C1, задания AME, просмотр кадров и два видео остаются впереди.

Integrated observed-range блок получил Source GO `F4172B9F…881F4D`:
72/72 source hashes и 56 независимых VM checks совпали. Actual getter precision17,
strict native parser, selection/graph/baseline/dry joins и private Manifest p/q/N
проверены в этом scope. Freeze60 `ns-7375f217008e` → `ic-997ccf6195ec`, TU9/13/3,
compile/link PASS; originals6 CLOSED/exit0/EOF, handles закрыты, owner1584 exit0.
Build acceptance SHA256 `F55738DD…E9A5D5EB`.

Actual C++ proof: scope15/15, observed parser33/33, freeze18 `ns-8383fa028a15`
→ `tp-119a96cd77ce`, TU2/2. Originals6 CLOSED/exit0/EOF, handles закрыты,
owner20732 exit0; acceptance SHA256 `441CDB6B…B69619F6`. Parser принимает
синтетические факты original getter; actual host observation и capability не
заявляются. Execute/copy/stage/restore/AME/media/debt пока не закончены;
addon/factory/C1 не запускались, результат остаётся 0/2.

Решение Stage до C1: **отдельный final SaveAs**, без in-place write epoch.
Для каждого slot различаются fixed `workingName` и final `snapshotName`:
checkpoint1 + clean working AEP2 + final snapshots2. Все пять имён различны,
находятся в approved physical root, не совпадают с original; caller их не выбирает.
CleanCopy создаёт working AEP и удерживает его read-only. Stage в одном charged
leaf проверяет original/working/final absence, фиксирует D42/floor/restoration debt,
открывает working, сверяет полный поддержанный graph/timing/fonts/text/visibility
и mapping новых IDs, переключает точную пару и сохраняет отдельный final AEP.

Private `OwnedSavedSnapshot` (maximum2) выдаётся только по own Stage command/result
capabilities, successful authentic terminal и native final file/pin/hash/named
read-back. D44 delivery отдельно не доказывает save; filename/hash/ready JSON
не выдаёт cap. Original/checkpoint/working остаются неизменными; aliases/hardlinks
запрещены. После первого final pin replacement запрещён. Несовместимый writer,
неизвестный результат или failed capture закрывают enqueue без replay SaveAs.
OriginalJob и inspections используют final cap и actual post-save AEP/comp/GUID
association; clean-copy receipt не становится staged snapshot proof.

Copy2/Stage2/11 groups и прежний vector сохраняются **условно**, если reconciliation,
result и pinning входят в уже посчитанные producers без новых Calls/Store rows.
Working-file cleanup не добавлен. Restoration — отдельный group с factual
promised RAM/UI/source read-back. Source GO архитектуры разрешает реализацию
до C1; actual AE read-locked open/SaveAs writer release и вся интеграция пока
не доказаны. Disposable production trial и fallback write epoch не допускаются.

# Улучшения плейсхолдеров — 30 сентября 2026

Цель: восстановление missing footage, учёт интервалов и подтверждённых групп,
сохранение принятых ручных правок, cover и визуальная приёмка, точный recovery.
Проверки ограничены offline fixtures, production modules и изолированными daemon/JSX VM.
Открытый пользовательский AEP не изменяется, не сохраняется и не переоткрывается.

## Этап 1 — восстановление исходников

Завершён и независимо проверен. Первый Flash запуск `placeholder-source-recovery-20260930-01` завершился
по timeout после частичной записи файлов. Процесс остановлен и файловое состояние
проверено перед адресной коррекцией `placeholder-source-recovery-fix-20260930-02`.
Runtime metadata подтвердили `gemini-3.8-flash-high`; configured effort high,
effective effort в init отсутствует. SUCCESS/наличие файлов не считаются приёмкой.

Начальная независимая проверка: helper smoke PASS, JSX/semantic smoke FAIL
(неверная сигнатура production verifier); registry FAIL (unsupported projectKind).
Обнаружены missing-field false success, basename fallback и недостаточный
read-back контракт. Приёмка требует исправления этих критериев и повторных проверок.

Адресная коррекция Flash также завершилась по timeout. После сверки остановки
PID 40048 обнаружены падающие helper/JSX/registry checks и дублированный recipe ID.
Последний MCP отказ вызван неоднозначностью registry, а не permissions/auth.
Инженерный блокер передан `ae_specialist` по маршруту проекта; доступ не расширялся.
Независимый bounded review подтвердил восемь конкретных дефектов поиска/read-back.

Финальный результат: `find_missing_footage_candidates`, `build_source_recovery_plan`,
`relink_footage_source`, `verify_source_recovery_read_back`; расширен существующий
`find_project_items` адресным `itemIds` и footage evidence. Recipe
`placeholder-source-recovery-plan` доступен через существующую библиотеку.
Поиск потоковый, canonical, с лимитами entries/directories/depth; incomplete
не объявляется уникальным совпадением. Optional FFprobe имеет лимиты количества,
времени и вывода. Большие медиа не копируются, неизвестные характеристики явны.

Validation PASS: `npm.cmd run smoke:placeholder-recovery` (production helper,
actual generated JSX VM, isolated daemon/catalog/schema/recipe/plan с AE0),
`smoke:placeholder-plan`, `semantic-verification-smoke`, `smoke:solutions`,
7 JavaScript syntax checks, `check:rules`, `git diff --check`.
Независимый реальный FFprobe: два синтетических MP4 96×64 и 128×96, 12 fps/1 s,
одно имя; originalPath используется при переименованном item, размеры считаны,
разница отражена в comparisons/score, неоднозначность сохранена. Локальное evidence:
`.codex-runtime/placeholder-improvements/probe-result.json` и `stage1-solutions.log`.

## Следующие этапы

- Интервалы, подтверждённые группы, защита ручных правок: подготовлен read-only
  архитектурный контракт с интеграцией в существующую память и runner.
- Cover/visual: FFmpeg/FFprobe доступны; базовый workflow не требует новой модели
  детекции лиц. Geometry и просмотр кадров подтверждаются отдельно.
- Статусы/recovery: подтверждён пробел semantic set_layer_transform и index drift.

## Этап 2 — интервалы, группы и принятые правки

Завершён после commit этапа 1 `debb562`. Flash получил только чистый usage/group
helper и его fixtures; ae_specialist реализует сложный enforcement в существующей
памяти, builder/runner и доверенном CEP flow. Общие файлы имеют одного writer.
Group identity требует явных метаданных или подтверждённого сопоставления.
Persistent acceptance связывается с saved-project identity и устойчивыми ID;
unsaved identity, неполные данные и неподдерживаемая анимация дают явный отказ.

Flash `placeholder-usage-groups-20260930-03` завершил запись трёх файлов, но его
terminal response не соответствует схеме (лишние keys). Ранее `view_file` нового
output до создания вернул file-not-found; это не запрет прав. Процесс PID 37428
завершён, исход сверён по NDJSON и actual files до следующего writer.
Production smoke: 10/11 PASS, найден file-URI mismatch; адресная задача
`placeholder-usage-fix-20260930-04` исправляет также unknown timing/identity,
bounded traversal, clipping, metadata provenance и exclusion scope.
Коррекция завершилась с valid schema/artifact proof. Независимые 24 tests PASS;
дополнительный parent regression обнаружил округление внутри actual traversal,
оставшееся вне теста pure assignments. Оно удалено, actual map overlap test
добавлен: итоговые 25/25 PASS. Symlink aliases не выводятся из lexical path.
Независимый reviewer затем воспроизвёл пять обходов: URI/canonical-percent,
source-ID/media-key spoof, off-media shared occurrence, неподтверждённая группа.
Flash `placeholder-usage-fix-20260930-05` завершился с valid terminal schema;
добавлены authoritative source index и structural occurrences до media clipping.
Parent исправил test-fixture dedup, который сводил разные routes к одному target.
Итоговые production helper smoke: 32/32 PASS; closure review выполняется отдельно.
Closure review закрыл пять критериев, но обнаружил оставшийся UNC URI alias
с `%20`. После двух Flash-коррекций локальный parser blocker передан
`ae_specialist`: canonical UNC key теперь `file:unc://...`, URI декодируется
один раз, буквальные проценты сохранены, source index/entries используют один
канонизатор. Новые regressions до исправления 32/36, после — 36/36 PASS;
parent независимо повторил production suite. Старые UNC keys с буквальными
процентами требуют явного обновления mapping; implicit migration не выполняется.

CEP-карточка «Принятые плейсхолдеры»: принятие, снятие защиты, статус,
подтверждение группы/исполнителя и ограничения выделенного набора. Checkbox
защищает actual выделенные свойства оформления через серверное чтение.
Actual panel-functions VM PASS: payload без клиентских target/snapshot,
busy/error/disconnected поведение, отказ без повторов. Установленная копия и
live UI не менялись.

Core завершён: authoritative `get_placeholder_protection`, `get_placeholder_usage`,
`check_placeholder_assignments`; runtime Project Intent Memory с atomic revision
store, trusted panel-role accept/release/mapping/constraints, серверное чтение
выделенных properties, proposal/runner/per-step/direct/AE pre-undo enforcement.
Stable-ID rebind обновляет фактические адреса тела setter и replacement source;
проверка свежих binding отдельно от старого тела не считается достаточной.
Existing builder хранит expectedReadBack/assignments/constraints внутри plan;
read-back считает индексы addressDrift, bounded evidence не копирует trees/expressions.
Recipe `placeholder-usage-protection-plan` зарегистрирован, RU/EN retrieval PASS.

Parent validation PASS: usage 36/36; protection memory/helper/actual JSX VM,
isolated daemon/CEP-role boundary/proposal/stale/per-step/direct/raw, panel-handler
VM; placeholder-plan, planning, recovery, solutions (183 entries), rules,
15 JS syntax и diff. В VM две preserving writes, живых AE-команд 0.
Runtime logs: `stage2-check-{0,1,2}.log`, `stage2-solutions.log` в ignored work area.
Bounded review воспроизвёл два P1 через production helper и actual JSX VM:
alias ID цели и source ID могли расходиться с индексами, используемыми телом
setter. Unsupported aliases отвергаются общим helper/gate/rebind и actual JSX
до undo. Documented expected IDs и legitimate stable-ID rebind сохранены.
Parent повторил protection group и planning после исправления: PASS; оба
обхода дают 0 writes/undo, дополнительные time/property alias regressions PASS.
Открытый AEP не затрагивался. Этап принят, commit `8964d98`.

## Этап 3 — cover и визуальная приёмка

В работе: Flash `placeholder-framing-20260930-06` владеет чистым helper для
равномерного cover, наблюдаемых subject boxes и свободных альтернатив одного
источника. Specialist интегрирует existing builder/read-back, свежую geometry,
owned service comps и безопасную очистку. Контракт ограничен static 2D/PAR1;
неизвестные flags не превращаются в geometric pass. Artistic review требует
actual image-view evidence и наблюдений каждого выбранного кадра.
Для multimodal regression подготовлены синтетические 2×3 кадра и контактный
лист; это проверка механизма просмотра, без оценки реального AEP.

Flash06 завершился с valid schema/artifact proof, effective model
`gemini-3.8-flash-high`, configured high; effective effort отсутствует. Его
79 assertions PASS. Parent boundary suite дала 3/25: nonfinite/пустой scale
ложно covered, пропущенные sampling fields и source bounds, несовместимый
формат authoritative usage, phantom/shared identity и tolerance overlap.
Flash08 получает адресную коррекцию с этими actual regressions; предыдущий
процесс завершён, session 27876 exit0, PID11768 отсутствует. Native integration
имеет отдельный ownership и не меняет три Flash-файла.
Recipe `placeholder-cover-visual-review-plan` подготовлен; RU/EN retrieval
15 pairs/184 exact titles PASS. Финальная tool/JSX приёмка ещё выполняется.

Flash08 завершился с valid terminal/artifact; shell calls0, tools только
view_file/write_to_file/finish. Parent25/25 PASS; один старый smoke fixture
не передавал source ID для alternatives — добавлен явный sourceItemId100.
Root дополнил семь actual boundary regressions (26/32 до коррекции, 32/32
после): shot point у конца, sampling target comp FPS, tiny edge hole,
duplicate source IDs, source/media-key identity, tiny media overrun,
computed Infinity. Исправлены строгие bounds/source index; source snapping
и target sampling имеют разные частоты. Итог `smoke:placeholder-framing`
83 assertions + 32 boundary cases PASS.

Bounded helper review подтвердил ещё unknown unused-footage candidate и
отрицательные sampleTimes для source120/target24 fps. Добавлены actual-map
regressions и target-grid compatibility: до исправления 33/35, после 35/35.
Canonical known-footage check использует существующий mediaKeyForSource;
duration не меньше одного media/target frame, времена внутри half-open range.
Alternatives начинаются на target frame grid для existing builder.

Actual Flash inspect `placeholder-visual-inspect-20260930-07`: valid success,
tools только view_file, семь PNG ACTIVE/DONE pairs плюс compact manifest.
PNG DONE в реальном AGY не содержит output; текстовый input содержит summary.
Шесть конкретных observations верно обнаружили B-1 head/top crop и B-2
right/body crop, A-1/A-2/A-3/B-3 допустимы. Session41036 exit0/PID34976 gone.
Никаких report writes; заключение вернулось текстом. Первый packet отказал
до запуска из-за пустого allowed_scope, task state не создан; после исправления
exact read-input scope запуск выполнен. Это synthetic mechanism proof.
Production acceptance требует pinned manifest/image hashes в official inspect
request; старый fixture07 не объявляется таким owner-linked acceptance.

Для четырёх targets × три кадра provider budget требует batches. Новый pure
`placeholder-visual-batches` повторно использует existing validator: chunks
до10 target/root frames + sheet, distinct pin/IDs, полный owner coverage только
после всех official runs. Actual production fixtures PASS для 12 кадров в
двух batches, partial10/12, crop reject, duplicate/stale/extra runs, budgets.
Single-batch pin совместим с исходным manifest. Pinned multimodal regression09
завершён через production inspectionMaterial и existing agy-bridge: семь PNG
ACTIVE/DONE pairs, шесть конкретных observations, два дефектных кадра B-1/B-2
отклонены производственным verifier. Старый неприкреплённый запуск07, пропущенная
пара просмотра и изменённый hash не дают приёмки. Tools только view_file, AE0;
это проверка механизма на синтетических рисунках, не реального AE render.

Core этапа 3 независимо проверен: `propose_placeholder_cover`,
`verify_placeholder_coverage`, `build_placeholder_visual_review_plan`,
`create_placeholder_review_comps`, `get_placeholder_review_manifest`,
`verify_placeholder_visual_review`; расширены existing builder/read-back,
native PNG export и `cleanup_test_items`. Новый recipe доступен в registry184.
Review service использует server UUID, atomic existing reviewArtifacts,
свежий receipt и fingerprint. Actual pre-undo JSX regressions отклоняют
relink/missing/duration/fps drift без writes/undo; receipt другого проекта
не проходит даже с пересчитанным hash. Не зарегистрированные partial objects
возвращаются точными IDs и требуют диагностики, без повторной мутации.

Validation PASS: framing83+boundary35, visual actual generated JSX VM,
full ordinary confirmed isolated runner, four-target batches, planning,
placeholder-plan/protection/recovery/usage36, solutions184, 21 JS syntax,
rules/diff. Старый shape/contain fit fixture теперь честно needs_review:
changedCount не является независимой проверкой геометрии; остальные checks
сохранены. Live AE/установленная CEP-копия не проверялись.

## Предел доказательств

Offline проверки не подтверждают художественное качество реального монтажа,
работу установленной CEP-копии или изменения в живом AE. Новые зависимости,
провайдеры, права, model settings и frozen-intake boundary не меняются.

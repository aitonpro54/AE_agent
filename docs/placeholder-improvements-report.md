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
Открытый AEP не затрагивался. Этап принят; далее cover и визуальная приёмка.

## Предел доказательств

Offline проверки не подтверждают художественное качество реального монтажа,
работу установленной CEP-копии или изменения в живом AE. Новые зависимости,
провайдеры, права, model settings и frozen-intake boundary не меняются.

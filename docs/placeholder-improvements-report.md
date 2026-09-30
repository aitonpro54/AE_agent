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

## Предел доказательств

Offline проверки не подтверждают художественное качество реального монтажа,
работу установленной CEP-копии или изменения в живом AE. Новые зависимости,
провайдеры, права, model settings и frozen-intake boundary не меняются.

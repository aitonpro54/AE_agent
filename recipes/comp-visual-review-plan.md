# Comp Visual Review Plan

## Назначение

Сформировать ограниченный детерминированный план экспорта проверочных кадров композиций через `save_comp_frame_png`, исполнить его через стандартный цикл и получить изолированный манифест визуального контроля с доказательством целостности файлов PNG.

## Когда применяется

- Пользователь или агент запрашивает визуальный контроль/ревью одного или нескольких кадров композиций без изменения проекта.
- Требуется экспортировать проверочные PNG кадры композиции и получить изолированный манифест со статусом и SHA-256 хэшами.
- Подготовка кадров для анализа визуальной иерархии, типографики и центрирования в рамках Text Layout Policy.

## Входные параметры

- `targets`: массив объектов целевых композиций (от 1 до 4 композиций):
  - `compItemId`: положительное целое число (1-based ID элемента проекта).
  - `times`: массив временных меток в секундах (числа >= 0, выровненные по сетке кадров композиции).
- Суммарно допускается не более 12 уникальных кадров и не более 18 шагов в итоговом плане.

## Шаги процедуры

1. **Построение плана**:
   - Вызов `build_comp_visual_review_plan` с аргументом `{ targets }` (или `build_solution_plan` с `solutionId: "comp-visual-review-plan"`).
   - Сервер выполняет предварительную проверку аргументов без обращения к AE (zero native calls on invalid input).
   - Сервер опрашивает `get_project_info`, проверяет наличие именованного `.aep` файла.
   - Для каждого уникального `compItemId` запрашивается `get_comp_details(compItemId, includeLayers: false)` для фиксации имени, размеров, частоты кадров и длительности.
   - Повторный `get_project_info` гарантирует, что проект не изменился во время сбора данных (stale check).
   - Формируется план со структурой:
     - Шаг 1: `get_project_info`
     - Шаги 2..N: `save_comp_frame_png` с `expectedCompItemId`, `resolutionFactor: [1, 1]`, `idempotencyScope: "comp-visual-review"`
     - Шаги N+1..N+M: `get_comp_details` для каждой проверенной композиции
     - Финальный шаг: `get_project_info` для закрытия read-back цикла.

2. **Согласование и Dry-run**:
   - Предложение регистрируется через `propose_ai_agent_plan`.
   - Выполняется сухой прогон через `run_ai_agent_plan` с `dryRun: true`.
   - На этапе построения плана и dry-run проект в After Effects не модифицируется (`mutatesProject: false`).

3. **Исполнение**:
   - Запуск через `run_ai_agent_plan` (`dryRun: false, confirm: true, allowMutations: true`). План является мутирующим (`execution.mutating: true`), так как инструмент `save_comp_frame_png` включен в список защищенных мутирующих операций сервера.
   - Каждый экспорт кадра сохраняет PNG по точному пути `logs/generated-exports/comp-review-<reviewId>-<ordinal>.png`, восстанавливает исходный resolution factor (`resolutionFactor: [1, 1]`, `restored: true`) и верифицирует завершение записи PNG через `verifyCompletePngBuffer`.

4. **Верификация и манифест**:
   - Чтение манифеста через `get_comp_visual_review_manifest` со строгим аргументом `{ runId }` (UUID).
   - Манифест читает серверную запись запуска (`planRunRecords`), проверяет строгое соответствие шаблону builder-плана (bounded 4..18 steps, contiguous ordinals 1..N, max 12 frames, max 4 comps, post-reads), сопоставляет каждый экспорт с фактическими файлами на диске (`logs/generated-exports/comp-review-<reviewId>-<ordinal>.png`), проверяет path containment (исключая выход за пределы директории экспорта и symlink/junction обходы), размер и SHA-256.
   - Статус `complete` выставляется только если `run.dryRun === false`, `run.ok === true`, `failedCount === 0`, зафиксирован `finishedAt`, все запланированные кадры верифицированы на диске и post-read проверки успешно пройдены. При dry-run, ошибках или незавершенном запуске возвращается `incomplete` или `corrupt`.
   - Всегда возвращает фиксированные флаги:
     - `historicalCapture: true`
     - `currentProjectStateVerified: false`
     - `canonicalFreshness: false`
     - `artisticAccepted: false`

## Защитные инварианты

- Наличие байтов на диске и совпадение хэша SHA-256 не является художественным принятием результата (`artisticAccepted: false`).
- Агент обязан выполнить фактический визуальный просмотр полученных изображений в каталоге артефактов / UI (`Actual image view required`).
- Манифест не переиспользует старые кадры после последующих изменений проекта (`canonicalFreshness: false`).
- Никакие временные вспомогательные композиции в проекте не создаются; операция захватывает только указанные композиции.

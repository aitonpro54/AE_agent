# Montage Pipeline Plan (Монтажный конвейер)

## Goal

Выполнить детерминированную многосценарную замену видео и кадрирование плейсхолдеров по монтажному манифесту и подготовленным материалам без передачи клиентских полномочий и без мутаций проекта при сборке.

## Applies When

- Пользователь или вышестоящий пайплайн передаёт монтажный манифест V1 (`ae-agent-montage-manifest.v1`) и каталог подготовленных материалов (`ae-agent-prepared-materials.v1`).
- Требуется разбить комплексный монтаж на топологически упорядоченные единицы исполнения (`units`) и пакеты визуального контроля (`reviewPackets`).
- Требуется строгая серверная проверка проектных связей, геометрии, узкого отпечатка слоёв (footprint) и полного SHA256-хэша видеофайлов до выполнения каких-либо мутаций.

## Plan Pattern

1. **Read-Only Build**:
   Вызвать инструмент `build_montage_pipeline_plan` с аргументами `{ manifest, preparedMaterials, budgets }`.
   - Клиентские наблюдения (`observations`), факты использования (`usage`) и флаги верификации строго запрещены.
   - Сервер самостоятельно считывает saved project/key/policy revision, `inventory`, usage, геометрию, opacity/locked, эффектный footprint и обе роли track matte. Missing native properties дают blocker.
   - Сервер выполняет побайтовую потоковую проверку SHA256 всех подготовленных файлов.
   - Target footage сохраняет наблюдённый static stretch25..400%; route/precomp100/remapfalse. Unknown/unbound affine usage и shared target блокируются. Source seconds, root grid/cuts и mapped fractional samples проверяются сервером.
   - При сборке гарантируется **0 мутаций** проекта (`writes = 0`).

2. **Unit-by-Unit Proposal & Dry-Run**:
   Для каждой готовой единицы `unit` из `compilation.units`:
   - Создать server-owned action proposal через `propose_ai_agent_plan({ plan: unit.plan })`. Не передавать всю компиляцию целиком в один proposal!
   - Выполнить dry-run через `run_ai_agent_plan({ actionId, dryRun: true })` для проверки шагов и валидации без мутаций.

3. **Guarded Execution**:
   - Выполнить план через обычный `run_ai_agent_plan` с актуальными action/revision/hash и действующим подтверждением либо grant для server-proposed typed plan. Explicit Autonomous session не разрешает raw/destructive/save.
   - Метаданные `plan.montagePipeline` (включая `verificationBindings`, `unitContentHash`, путь и SHA256 материала) проверяются встроенным `guardPlaceholderPlan` перед каждой мутирующей операцией.
   - Любое расхождение файла проекта, источника, хэша материала или отпечатка слоя приводит к немедленной блокировке до записи.
   - Namespace не является полномочием: разрешена только singular replace → timing → optional framing → read цепочка. Content hash проверяется, а target state учитывает только доказанный prefix этого run.

4. **Reconciliation & Read-Back**:
   - После выполнения запустить `reconcile_plan_run({ runId })`.
   - Сервер возвращает аддитивную структуру `result.montageReadBack = { projects, targets, materials, routes }`, где каждое наблюдение заверено через `bindPostRunObservation` после фактического завершения запуска (`observedAt >= run.finishedAt`).
   - Сверить actual stored run и эти reads через M3 `summarizeMontagePipeline`. Само наличие receipts не доказывает technical pass; errors/missing остаются insufficient, drift — failed.

5. **Visual Review**:
   - После успешного технического подтверждения собрать контрольные кадры для пакетов `compilation.reviewPackets` через штатный `build_placeholder_visual_review_plan`.
   - `compilation.rootPngPackets` сохраняет все per-use IDs/reasons/times и root_comp-only inputs с лимитом24 frames. Полный root graph неизвестен: freshness blocked `unsupported_unknown_render_graph`, capture binding blocked `missing_canonical_unit_material_capture_binding`; replay/reuse/artisticAccepted=false.
   - Stable-ID PNG принимает optional expectedCompItemId и возвращает actual comp.itemId. ID/grid проверяются до filesystem writes и native export; этот режим запрещает overwrite/cache reuse. Owner registration, full PNG proof и manual save gates сохраняются.

## Safety Gates

- `planValidation` с опцией `repairPlan: false` (никакого автоматического переписывания монтажных шагов).
- `explicitConfirmation` и `allowMutations: true` для каждого выполняемого unit plan.
- Проверка полного хэша SHA256 и структуры отпечатка (footprint) перед каждой записью.
- Operation budgets только снижают hard ceilings. Build читает каждый material полностью в начале и конце; run заранее проверяет бюджет preflight + всех mutator guards. Исчерпание не разрешает partial hash.
- Запрет повторного исполнения (`replayAllowed: false`).
- Разделение статусов: `execution`, `technical` и `artisticAccepted` оцениваются независимо.

## Verification

- Сборка через `build_montage_pipeline_plan` не изменяет проект (`writes === 0`).
- В каждом плане сохраняются метаданные `plan.montagePipeline`.
- Попытка передачи клиентских `observations` отклоняется схемой.
- Любое изменение материала на диске блокирует выполнение плана.
- Сверка через `reconcile_plan_run` предоставляет полную структуру `montageReadBack`.

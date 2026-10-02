# Этап 2: детерминированный монтажный конвейер

Статус: **not_started**; подготовлен план будущего этапа, реализация не начата.
Baseline для планирования: `codex/production-usage`, HEAD `50d5cd66014f4778f6e994dbd4ebe61e488111d8` (2026-10-02).
Перед реализацией сверить текущие HEAD/status и основной [план](target-app-execplan.md); чужие изменения сохранять.
Контракты: [монтаж](../docs/montage-workflow.md), [завершение поручения](../docs/ae-task-completion.md).

## Цель и границы

Преобразовывать согласованный manifest известных сцен, интервалов, шотов, источников,
групп, crop, зависимостей и кадров приёмки в ограниченные typed plans существующего runner.
LLM выбирает фрагменты и оценивает художественный результат; компилятор работает без модели.
Этап уменьшает ручную сборку планов; процент экономии, стоимость и ускорение не обещаются.

Первый путь: существующие видеослои и подготовленные/импортированные video footage с stable IDs;
одна source/timing/static-cover запись на цель, несколько шотов могут быть внутри готового клипа.
Повторные замены одного слоя не создают монтаж; variable crop/новые слои/clone/import/relink/preparation — отдельный scope.
Сцены/ручные правки/исходники принадлежат пользователю; автоматически принимать/снимать
защиту, сохранять AEP, удалять или переписывать исходники нельзя. Frozen boundary:
`config/frozen-intake-manifest.json`; не менять intake, generic SDK, providers, общий AGY, global config/deps.

## Проверенные существующие контракты

| Реальный API / модуль | Повторное использование и предел |
| --- | --- |
| `search_solutions`, `get_solution`, `build_solution_plan` | Сначала retrieval; расширять typed library, не создавать параллельный каталог. |
| `build_placeholder_plan` / `placeholder-plan-builder.js` | Одна цель, route ≤4, одинаковый root/target fps, frame-aligned диапазоны, stretch=100/remap=false; replace → timing → optional transform → read. `expectedReadBack` и `placeholderFraming` одиночные. |
| `get_placeholder_usage`, `check_placeholder_assignments` / `placeholder-usage.js` | Свежая серверная карта; confirmed groups, half-open source intervals, structural occurrences; incomplete/shared/stretch/remap не дают pass. MCP assignments/roots ≤32. |
| `get_placeholder_protection` / `placeholder-protection.js` | Авторитетные accepted snapshots и policy сервера; client manifest/usage/selectedTargets не разрешают protected changes. |
| `verify_placeholder_read_back`, `verify_placeholder_coverage` | Независимое чтение цели; rectangular cover не доказывает качество, прозрачность или весь nested route. |
| `build_placeholder_visual_review_plan` и review modules | Owner-registered controls/sheet и штатный PNG export: ≤4 targets, ≤24 samples и ≤24 views суммарно; first/middle/last обязательны, shared/stretch/remap отклоняются. |
| `find_missing_footage_candidates`, `build_source_recovery_plan` | Отдельный recovery workflow с явным подтверждением выбранного пути; не автоматическая стадия pipeline. |
| `propose_ai_agent_plan`, `run_ai_agent_plan` | Серверный proposal и прежние gates; `maxSteps` default 20, runtime ceiling 50; summary меняет представление ответа. |
| `get_plan_run_evidence`, `reconcile_plan_run`, `ae-task-completion.js` | История / свежая read-only сверка / сводка provided run IDs; ни один API не разрешает retry и не устанавливает полный просмотр сцены. |

Чистый `buildPlaceholderPlan` не обращается к AE; MCP-обёртка читает geometry при framing и применяет protection gate.
`build_slideshow_plan` сохраняет свой newspaper/template manifest, namespace и audits.

## Предлагаемый новый контракт (сейчас отсутствует)

- `ae-agent-montage-manifest.v1`: `revision`, `taskId`, project identity,
  `observedAt`, stable `sceneId`/`assignmentId`/`shotId`; scenes с root comp ID,
  `[in,out)`, fps и route IDs; assignments с target comp/layer IDs, source material ID,
  sourceRange, group reference с provenance, static crop intent и protected fields.
  `shotCount` отличается от `visibleCutCount`: считать только смены внутри scene interval.
  Group policy задаёт simultaneous/selected scene assignments, confirmed attribution и explicit balanced repeats
  с разными sourceRange; ракурсы одной группы внутри placeholder не повтор групп разных placeholders. Artistic choices не менять.
- `dependencies`: target/source/route → известные сцены и их интервалы; полнота/границы
  наблюдения обязательны. Shared dependence фиксируется, но unsupported shared write блокируется.
- `frameCoverage`: stable frame/check IDs, comp ID, root frame/time, роли и причина;
  first/middle/last, каждый шот, обе стороны cut/crop и известные camera events.
  Последний кадр внутри `[in,out)`; dedup одинаковых comp/time/state объединяет причины.
- `ae-agent-prepared-materials.v1`: exact path, полный SHA256, bytes, dimensions/PAR,
  duration/fps, происхождение отрезка и импортированный sourceItemId. Preparation — существующее
  bounded tooling отдельным поручением, без нового transcode SDK; неизвестные поля unknown.
- Предлагаемые pure exports: `validateMontageManifest({manifest,materials,observations,budgets})`, `compileMontagePipeline({validated,observations,budgets})`,
  `affectedMontageScenes({manifest,changes})`, `summarizeMontagePipeline({compilation,runEvidence,reconciliation,readBack})`.
  Они не читают fs/AE/сеть, не запускают модель, не мутируют и не выдают разрешения.
- Предлагаемый read-only MCP `build_montage_pipeline_plan({manifest,preparedMaterials,budgets})`:
  bounded adapter получает свежие server facts, проверяет материалы и вызывает pure compiler + existing validation/protection.
  Выход `ae-agent-montage-compilation.v1`: provenance/hashes, readiness, blocked reasons,
  `units[{unitId,dependsOn,plan,expectedReadBack,frameRequirements,budget}]`, affected scenes.
  Это preview (`requiresFreshEvidenceReview:true`), не proposal и не execute-all API.

Manifest/materials/compilation, unit→proposal/run bindings и verification report — только
ignored task runtime; tracked fixtures синтетические. Summary агрегирует existing evidence,
reconciliation/completion и независимые states, без нового status/retry/runner API.

## Milestones и приёмка

### M1 — Typed manifest и readiness

- Ownership: новые узкие manifest/schema/fixture files; один writer, без изменения builders.
- Вход: manifest/materials/bounded snapshot; выход: validated input либо адресные blockers.
- Предложенные лимиты V1: ≤32 scenes и assignments, ≤256 KiB manifest; route ≤4;
  точные лимиты графа/материалов/чтения зафиксировать до реализации и проверять fail-closed.
- Проверять IDs/revisions/project, интервалы/fps, references/cycles, dependency/coverage
  completeness, visibleCutCount и group policy/provenance; имя файла/трека не performer ID.
- Reuse usage/framing: unsupported stretch/remap/mixed fps/masks/mattes/3D/parent/rotation/collapse,
  keys/expressions/unknown source/PAR/route → blocker; unknown matte/effect footprint не объявлять сохранённым.
- Acceptance: детерминированная нормализация, адресные invalid/unknown/budget blockers,
  2–3 visible cuts ≠ 2–3 shots. Обратимый старт: validator + fixture без public API.

### M2 — Pure compilation, материалы и segmentation

- Ownership: отдельный compiler поверх `buildPlaceholderPlan`/framing/usage;
  существующие singular metadata сохранять целиком, не склеивать планы разных целей.
- Вход: validated input + observed identities/geometry; выход: units/hashes/frames/budgets.
  Hash — identity, не freshness. Shared intents дедуплицировать лишь при одинаковых
  source/time/crop; конфликт блокирует affected units. V1 всё равно соблюдает shared gate.
- Сначала проверить все назначения/коллизии в общем bounded scope; segmentation
  не должна скрывать overlap/group conflicts между будущими пакетами.
- Один application unit = один существующий builder plan; DAG связывает последующие
  проверки. Stable unit IDs от assignment/revision; executable content hash отдельно.
- Каждый план целиком укладывается в ≤50 steps; caller задаёт `maxSteps` ≥ всех его steps.
  Review/export packets укладываются в реальные target/sample/view limits; учитывать
  create+controls+sheet+manifest steps и result bindings, не резать пакет внутри зависимостей.
- Не усекать кадры; повторить first/middle/last anchors при partition с явной причиной
  либо вернуть blocker. Per-use root кадры сохраняются даже при dedup shared intent.
  Для unsupported review нужен отдельный root coverage contract M5, не fake owner review.
- Adapter подтверждает существующий файл/full SHA и native source metadata в явном
  bounded material scope; исчерпанный hash/probe budget означает unknown, не partial SHA.
  Путь сверяется с native sourceItemId и разрешённой material областью/realpath; произвольный input path не даёт права чтения.
  Изменённый материал требует нового manifest/material revision и свежих gates.
- Acceptance: детерминизм, budget boundaries, prepared multi-shot source, dedup/conflicts;
  pure compiler без fs/AE/model calls; every required frame сохраняется или явно blocked.

### M3 — Проверка зависимостей и сверка частичного результата

- Ownership: узкий dependency/summary helper; общий native outcome/recovery не переделывать.
- После unit заново читать изменённую stable-ID цель и route; применять существующий
  read-back/coverage verifier. Execution и technical pass не повышать до visual accepted.
- Source/timing/crop/property/matte/effect/parent change инвалидирует цель и dependent
  scenes/frames; unknown footprint требует baseline. Incomplete graph не даёт acceptance.
- `get_plan_run_evidence` связывает receipt; partial/timeout/unknown сначала сверять
  `reconcile_plan_run` и независимый read-back. Summary хранит applied/not_applied/unknown,
  ошибки и freshness; missing run IDs означают incomplete coverage, не success.
- Applied не повторять; unknown блокирует dependent units; независимые сверенные units продолжаются.
  Remaining work — от actual state; partial unit/imports/creation не воспроизводить вслепую.
- После исправления принимать changed targets/affected scenes по frameCoverage.
  PNG reuse только при том же hash/state; existing owner receipts/cleanup, prefix не ownership.
- Acceptance: shared dependency invalidation, index drift, manual/project/material drift,
  partial applied→remaining, unknown→blocked dependents, независимый unit→ready;
  ни summary, ни reconciliation не возвращает автоматический replay permission.

### M4 — Tool/library integration и offline acceptance

- Ownership: tool adapter/catalog routing + один library recipe + docs/smokes; сверить используемые AE skills, при необходимости узко обновить инструкции нового API.
- `build_solution_plan` направляет recipe к новому builder; compilation units передаются
  по одному в `propose_ai_agent_plan`. Перед каждой записью свежие project/IDs/materials,
  protection/usage/geometry, текущие proposal action/revision/hash, dry-run и прежние gates.
- Input drift требует пересборки unit; content drift до/после операции инвалидирует
  material/acceptance. File locking/in-memory revision не считать доказанными.
- Autonomous MCP допускает только server-proposed typed mutating plan при действующем
  grant; raw/destructive/save остаются protected manual flow. Никакого fallback JSX.
- Порядок acceptance: M1 → M2 → M3 → schema/catalog/library fixture → isolated daemon
  с fake panel → адресные regression smokes → rules/syntax/diff → запись milestone/commit.
- Проверки будущей реализации: `check:rules`, `node --check` touched JS, `git diff --check`; новые fixtures,
  применимые `smoke:placeholder-plan`, `smoke:placeholder-usage`, `smoke:placeholder-framing`, `smoke:placeholder-visual`,
  `smoke:plan-run-recovery` и `smoke:ae-task-completion` после сверки их offline scope.
  Broad/default smoke, Full Intaker, модели и live AE не входят в эту приёмку.

### M5 — Отдельный bounded scope для подтверждённых gaps (опционально)

- После M4 согласовать один gap: shared write, affine stretch или observed piecewise remap.
  Pure timing extension использует подтверждённые значения/интерполяцию; unknown/expressions
  блокируются. Write support требует соответствующих usage/protection/builder guards,
  сохраняет policy/protected snapshots; изменение лишь клиентского compiler недостаточно.
- Для известных root comp/time из validated snapshots строить bounded typed PNG packets
  на каждый use. `save_comp_frame_png` сейчас имеет index/name guard, но обычный ответ
  не содержит stable comp ID: нужен узкий stable-ID и pre/post state-binding контракт
  либо blocker. Generated output root/hash/complete PNG gates сохраняются; существующая
  owner review registration не обходится и не объявляется поддержкой shared/remap.
- Acceptance: точные mapping/boundary/shared-conflict fixtures, native guard/PNG binding
  offline proof; отдельный live proof ниже. M5 не условие завершения supported subset M1–M4.

## Отдельная будущая live приёмка

Только на следующем порученном монтаже: scenes/materials, один AE/CEP/UI controller;
fresh inspect → approved manifest → bounded proposal/dry-run/run → read-back → просмотр affected frames → completion.
Saved AEP, export/render и protected cleanup требуют своего применимого scope/gates.
Измерять запуски/чтения/экспорты/bytes/time и local usage с coverage; absent = unknown. Offline fixtures не live proof.

## Progress

- 2026-10-02: план подготовлен; M1–M5 и live acceptance не начаты. Реальные монтажные
  входы/frameCoverage подтверждаются отдельным поручением, не извлечены из старого AEP.

## Decision Log

- Additive compiler: малая миграция, прежние per-target guards/receipts. Multi-target builder
  требует миграции singular metadata/gates; отдельный runner/расширение newspaper slideshow дороже и не нужны.
- Unsupported/shared случаи — bounded gaps M5; не клонировать comps/обходить server policy.
- Missing evidence: approved manifest/material hashes, complete dependencies, file/graph budgets,
  live packet compatibility и замеры. M1/offline доступны; live readiness/экономия не установлены.

## Validation

- Документ: HEAD/branch, bounded module/schema/doc reads; scoped diff check без whitespace errors.
- Product suites, модели, live/provider/config/frozen changes и commits не выполнялись; реализация не проверялась.

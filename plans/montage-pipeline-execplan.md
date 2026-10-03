# Этап 2: детерминированный монтажный конвейер

Статус: **M1–M5 complete — offline acceptance**; M5 ограничен observed target affine stretch. Этап 3 agy-bridge принят offline и scoped live; полная montage/root/canonical/visual live-приёмка остаётся открытой.
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
| `build_placeholder_plan` / `placeholder-plan-builder.js` | Одна цель, route ≤4/100%, одинаковый fps, frame grids/remapfalse; replace → timing → optional transform → read. M5 pure footage mapping25..400%; affine writes требуют montage namespace. `expectedReadBack` и framing одиночные. |
| `get_placeholder_usage`, `check_placeholder_assignments` / `placeholder-usage.js` | Свежая карта, confirmed groups, half-open source intervals/affine clipping, structural occurrences. Unknown/out-domain/route stretch, incomplete/shared/remap блокируются; unbound affine не даёт montage readiness. MCP assignments/roots ≤32. |
| `get_placeholder_protection` / `placeholder-protection.js` | Авторитетные accepted snapshots и policy сервера; client manifest/usage/selectedTargets не разрешают protected changes. |
| `verify_placeholder_read_back`, `verify_placeholder_coverage` | Независимое чтение цели; rectangular cover не доказывает качество, прозрачность или весь nested route. |
| `build_placeholder_visual_review_plan` и review modules | Owner controls/sheet/PNG: ≤4 targets, ≤24 samples/views, first/middle/last. Observed footage25..400% сохраняется, route100; shared/remap блокируются. Stable-ID PNG не даёт full root/canonical material capture proof. |
| `find_missing_footage_candidates`, `build_source_recovery_plan` | Отдельный recovery workflow с явным подтверждением выбранного пути; не автоматическая стадия pipeline. |
| `propose_ai_agent_plan`, `run_ai_agent_plan` | Серверный proposal и прежние gates; `maxSteps` default 20, runtime ceiling 50; summary меняет представление ответа. |
| `get_plan_run_evidence`, `reconcile_plan_run`, `ae-task-completion.js` | История / свежая read-only сверка / сводка provided run IDs; ни один API не разрешает retry и не устанавливает полный просмотр сцены. |

Чистый `buildPlaceholderPlan` не обращается к AE; MCP-обёртка читает geometry при framing и применяет protection gate.
`build_slideshow_plan` сохраняет свой newspaper/template manifest, namespace и audits.

## Реализованный контракт M1–M4

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
- Pure exports: `validateMontageManifest({manifest,materials,observations,budgets})`, `compileMontagePipeline({validated,observations,budgets})`,
  `affectedMontageScenes({manifest,materials,observations,changes,budgets})`, `summarizeMontagePipeline({compilation,runEvidence,reconciliation,readBack})`.
  Они не читают fs/AE/сеть, не запускают модель, не мутируют и не выдают разрешения.
- Read-only MCP `build_montage_pipeline_plan({manifest,preparedMaterials,budgets})`:
  bounded adapter получает свежие server facts, проверяет материалы и вызывает pure compiler + existing validation/protection.
  Preview wrapper возвращает `compilation` schema `ae-agent-montage-compilation.v1`:
  provenance/hashes, readiness, blocked reasons,
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
- Проверки реализации: `check:rules`, `node --check` touched JS, `git diff --check`; новые fixtures,
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
- Реализовано 3 октября: observed target footage25..400% preserve, строгие grids и
  fractional mapped samples; route100/shared/remap gates сохранены. Root packets
  bounded/per-use/root_comp, но full graph и canonical capture binding дают явные
  blockers. Подробный контракт — [M5](../docs/montage-pipeline.md).

## Текущий порученный root/canonical и bounded live scope — 3 октября 2026

Пользователь разрешил исправить подтверждённые root-render/canonical capture gaps,
создать isolated owned fixture и выполнить минимум три полных последовательных
цикла. Клиентский AEP защищён; переключение, raw и save сохраняют штатные gates.
До реализации требуется матрица requirement/code/offline/live/gap и явный whitelist
полного contributing graph. Client complete/digest/timestamp не разрешают capture.

Блоки: (1) свежий baseline и матрица; (2) native graph/canonical binding и offline
negative regression; (3) fixture/runtime preflight; (4) три live цикла, invalidation,
recovery и independent PNG review; (5) итоговые consumer verdicts и проверки.
Бюджет live: три обязательных цикла, максимум пять попыток полных циклов; каждый
не более 30 минут активного исполнения, суммарно 120 минут live. AGY поручение
не более 1800 секунд. Human gate не считается исполнением и не означает approval.
Стоп dependent branch при denial, unknown mutation, ownership conflict, drift,
неполном graph/capture proof или deadline; сначала независимая сверка, без replay.
Новый daemon/scheduler не добавляется. Исторические failures сохраняются.

## Live приёмка

В текущем явно порученном fixture scope: scenes/materials, один AE/CEP/UI controller;
fresh inspect → approved manifest → bounded proposal/dry-run/run → read-back → просмотр affected frames → completion.
Saved AEP, export/render и protected cleanup требуют своего применимого scope/gates.
Измерять запуски/чтения/экспорты/bytes/time и local usage с coverage; absent = unknown. Offline fixtures не live proof.

## Progress

- 2026-10-03: собственный saved fixture/три source groups и восстановление CEP
  завершены; fresh native compiler3 units/27 frames ready. Root probes1–4 ещё
  blocked (native source class), полных accepted cycles0. Seed4 steps applied,
  historical verification_required сохранён; read-only reconciliation3 passed,
  replayfalse. Подробная запись текущего блока — WORK_LOG.md.

- 2026-10-03, текущий scope: HEAD AE `2830493`, agy-bridge `7ea628f`, tracked
  деревья чисты; чужие untracked сохранены. Runtime уже HEAD `2830493`, pid29924,
  CEP Connected, pending/inflight0, edit session и current proposal отсутствуют.
  Три установленных CEP файла совпадают SHA с repo. Typed project read показывает
  клиентский AEP; он не используется как fixture. WORK_LOG.md ранее отсутствовал.

- 2026-10-03: пользователь поручил M5 и выбрал affine stretch. Старт от `e72f838`,
  tracked baseline чистый; чужие untracked сохранены. Архитектура уточняет bounded
  positive observed target-footage stretch и root PNG binding; M1–M4 не повторяются.
  Текущий AEP/live, shared write/remap и этап 3 остаются вне этого scope.
- 2026-10-02: старт M1–M4 от `beadf24` на `codex/production-usage`; tracked baseline чистый,
  чужие untracked материалы сохранены. Sol/ultra уточняет архитектуру, Flash/high реализует
  M1 отдельным offline блоком. Текущий AEP и live runtime не используются.
- M1 завершён: strict manifest/readiness, native observation binding, coverage и bounded
  contracts; existing usage/framing/builder reused. Prepared catalog revision сохраняется
  отдельно. На checkpoint M1 public API/execution отсутствовали; следующий блок был M2.
- M1 checkpoint `92f0811`. M2 завершён: pure singular-plan compiler, global/sequential
  collision checks и release DAG, review packet partition с полным покрытием; отдельный
  bounded material reader проверяет native path/full SHA/metadata и pre/post fd identity.
- M2 checkpoint `bf78802`. M3 завершён: exact run/plan/args/provenance binding, fresh
  project/target/route/material proofs, affected graph и descriptive remaining без replay.
  Flash denied diagnostic не повторялся; correction потеряла provider socket, оба процесса
  exited/files reviewed/native0/quarantine reconciled. Sol/high завершил тот же scope.
- M3 checkpoint `681df0c`. M4 завершён: read-only tool/library adapter, native facts,
  scoped policy/hash/prefix guards и actual postread. Flash partial run остановлен/сверен;
  correction timeout/unknown сохранён, processes exited/native0/claims released.
  Sol/xhigh закрыл инженерные gaps; source/library/MCP offline acceptance пройдена.
- M4 checkpoint `e72f838`. M5 завершён: согласованные timing/usage/protection/framing/
  coverage/guard/readback/owner paths и additive stable-ID PNG/root packets;
  native200→stored reconciliation→M3 technical PASS, artisticfalse. Commit отдельный.
- На момент M5 этап3/live acceptance не выполнялись. Позднее этап3 принят только
  в bridge scope (8 model runs, 7 accepted cases, 1 timeout unknown cause).
  Это не montage/root/canonical/visual acceptance; текущий AEP в M5 не использован.

## Decision Log

- Native graph/canonical implementation проверяется отдельно от live acceptance.
  Class diagnostics, Classic3D exacthost mapping и source crop PNG не дают client
  complete waiver. Failed seed action не повторять; новый intent требует fresh
  native build/proposal/dry-run. Raw bootstrap и trusted CEP groups сохранены.

- 2026-10-03: уже принятый общий bridge не переделывается без подтверждённого gap.
  Root/canonical контракт относится к AE Agent. Один архитектурный read-only
  исполнитель; AE/CEP/UI controller — root. Реализация начинается после матрицы.
  Unknown effort прошлых model runs остаётся null; timeout не повышается reconcile.

- M5 выбран пользователем: bounded observed target-footage stretch25..400% сохраняется;
  route100/remapfalse и shared/protection gates прежние. Root/local/source endpoints
  и mapped cuts проверяются на grid; fractional mapped source samples не округляются.
  Stable comp ID/owner scoped PNG binding не доказывает full scene freshness:
  completeRootRenderState=false, unknown root render graph остаётся blocker.
- M5 Flash draft не принят: pure14 после нескольких corrections, native200 build
  blocked и пять independent negative false-pass. Timeout/unknown сохранён;
  процессы exited/files reviewed/commands exact/native0, claim released.
  Остаточный timing/guard/owner/native proof blocker передан Sol/xhigh.
- M5 final: только footage25..400, preserve без нового setter; source-seconds collisions,
  root/cut/start grids, fractional source samples без snap. Namespace/root/scoped native
  facts полны; client digest не разрешает partial/effectful/unknown affine scope. Legacy
  expected stretch absent означает100 только при bound100. Own/foreign scope drift
  требует fresh rebuild; ordinary affine plan без montage binding блокируется.
- Root packet/owner PNG — per-use identity/time proof, completeRootRenderState=false.
  `unsupported_unknown_render_graph` и `missing_canonical_unit_material_capture_binding`
  сохраняют blocked/pending visual status; declaring hashes/timestamps не proof.
  Stable-ID export проверяет ID/grid до FS и native save; overwrite/cache replay запрещены.
- Архитектура M1: pure validator и синтетические fixtures без public API. Hard ceilings:
  scenes/assignments/materials/groups 32, route 4, shots/assignment 12, frames 768,
  dependency edges 512, graph nodes 5000, manifest/materials 256 KiB, snapshot 4 MiB,
  plan 50 steps; file 512 MiB, total material reads 2 GiB/32 requests. Caller только снижает.
  Unknown footprint, неполное покрытие и неподдержанные маршруты блокируют readiness.
- Первый Flash draft M1 и первое исправление не приняты: независимые actual-module
  контрпримеры выявили false readiness и contract drift. Отдельный correction2 требует
  real-shaped native inventory/usage, обязательных route/material/group/dependency bindings.
  Terminal success и smoke исполнителя не заменяют milestone acceptance; commit M1 до исправления не создаётся.
- После correction2 сверены completed/exited и отсутствие writer claim; оставшиеся native source/route
  false readiness переданы `ae_specialist` (Sol/xhigh). Архитектурная роль остаётся read-only;
  текущая модель чата и пользовательские материалы не менялись.
- M1 accepted subset: distinct groups, non-overlapping ranges, static 2D/PAR1 и полный
  target/route footprint. Balanced repeats возвращают unsupported blocker без waiver;
  unknown source/route/material/graph не даёт ready. Pure snapshot proof не live freshness.
- M2 correction закрыла ignored caller budgets, подмену validated coverage и executable
  hash collision при previous-source alias drift. Hash включает guarded plan/route/crop/material
  revision; ready input перепроверяется. Incomplete file read возвращает SHA=null. Review
  packets — inputs к штатному builder после apply/read-back, без fake owner/receipt.
- M4 принят после устранения fake postread pass: только actual native/file facts,
  unknown не превращается в expected/false. Source/route/full footprint/policy key+rev0
  проверяются; native path authorization до fs. Private preview usage учитывает DAG,
  материалы переиспользуются только внутри read-only build с final rehash/scope re-read.
  Aggregate build/run counters и foreseeable cost блокируют превышение до первой записи.
- Native timing setter response получил только actual comp.itemId. M3 принимает три
  штатных runtime safety args только по persisted validation; смысловые args exact.
  Scoped policyHash и precision1e-6 проверяют final timing/pose/source metadata. Closed
  chain не разрешает create/effect/foreign target даже при пересчитанном client digest.
- AE skills discovery/build/gates/readback сверены, новый API требует локального recipe,
  глобальные skills/plugin cache не менялись. File locking/in-memory revision не заявлены.
- M3 transport failed/unknown сохранён. Server-owned after-run receipt связывает каждую
  observation с run/action/proposal/project/plan/unit hashes и native finishedAt; timestamp
  либо client flag отдельно не freshness. Actual reconciliation вычисляется по новым reads.
  Visual declaration всегда not_established; owner API остаётся отдельным proof.
- Additive compiler: малая миграция, прежние per-target guards/receipts. Multi-target builder
  требует миграции singular metadata/gates; отдельный runner/расширение newspaper slideshow дороже и не нужны.
- Unsupported/shared случаи — bounded gaps M5; не клонировать comps/обходить server policy.
- Missing evidence: approved manifest/material hashes, complete dependencies, file/graph budgets,
  live packet compatibility и замеры. M1/offline доступны; live readiness/экономия не установлены.

## Validation

- Fixture/native/UI proof: `.codex-runtime/montage-acceptance-20261003/`; root
  probes1–4 blocked, probe5 fresh native closure/GUID PASS; seed reconciliation2
  current3 applied/pass без replay. Root82+3/canonical13/owner21/semantic22 PASS;
  свежая regression17/17 PASS. Ранний montage-bridge process exit3221226505
  сохранён без догадки причины; отдельный rerun76 PASS.
  Reload recovery3native PASS без replay; lossless store/official JSON packets
  реализованы, packing20/visual16/epoch30 и3 independent counterexamples PASS.
  Первый fullattempt failed после13PNG на2MiB;3 accepted cycles ещё открыты.
  Flash correction227,75s terminal/schema/artifacts PASS,0 tool errors; effective
  model gemini-3.8-flash-high, effortunknown/null. Полная montage visual ещё открыта.

- 2026-10-03, свежий baseline: agy-bridge **100 tests PASS** (36,575 s); AE **17
  выбранных npm suites PASS**, включая rules, montage M1–M5/summary/library/bridge,
  response/completion/PNG и placeholder/recovery. Isolated autonomous-mcp FAIL
  воспроизведён: `verification_required`, synthetic keyframe receipt/read-back
  без stable IDs, assertion line258. Это известный baseline fixture gap; verifier
  не ослаблен. Logs: `.codex-runtime/montage-acceptance-20261003/baseline/`.
  Настоящее typed project read подтверждает connectivity; offline suites не live proof.

- M5: affine38 pure + actual daemon/VM/official MCP native200 → stored M3 technical
  PASS/artisticfalse +78 negatives; legacy100 emitter +76 negatives/old expected absent;
  owner rootPNG/registration/fractional mapping/ID/grid/native race/cache PASS. Root
  independent10 probes (positive controls + strict negatives) и packet coverage/negative3 PASS.
  Montage226/19/96, placeholder-plan4/usage36/framing83+35/protection3/visual3/png PASS;
  recovery20+39+JSX/panel/daemon, completion23, montage-library6 и solution4 PASS.
  Final rules/21 changed JS syntax/diff/staged PASS; fixtures не live/artistic proof.
- M1: 226 actual-module synthetic cases и 20 независимых root counterexamples PASS;
  `check:rules`, syntax шести новых JS, `git diff --check` PASS. Source/route/path/fps,
  aliases/duplicates, material revision/hash, coverage, malformed/budgets и неизвестные
  footprint проверены offline. AEP/live/provider/frozen/dependencies не затронуты.
- M2: compiler19/material suite20/M1 regression226 и 7 root cases PASS, rules/syntax пяти
  touched JS/diff PASS. Реальные symlink fixtures skipped из-за Windows privileges;
  actual-module/fake-fs containment proof даёт zero byte reads. Normal temp-file/full-SHA,
  fd drift, group/source collisions, packet/step budgets и сохранение кадров проверены.
- M4 регрессии: обязательные placeholder-plan/usage/framing/visual, plan-run-recovery
  и ae-task-completion, плюс isolated solution-plan-run PASS. Дополнительный autonomous-mcp
  FAIL на keyframe easing/read-back без stable IDs; тот же отказ воспроизведён в isolated
  archive checkpoint `681df0c` до M4. Verifier/gates не ослабляются, это baseline fixture gap.
- M3: summary96/M1 regression226/M2 regression19 PASS, rules/syntax пяти JS/diff PASS.
  Synthetic native-shaped facts проверяют bindings, stale/missing/unknown, graph/index drift,
  remaining и fake visual declarations. Live/artistic proof отсутствует; AEP не использован.

- M4 final: actual daemon/VM/official MCP emitter positive (3 разных writes) → stored
  run/reconcile → M3 technical passed, artistic false; 66 drift/input/budget/gate/read-error
  negatives PASS. Library6/M1 226/M2 19/material20/M3 96 и четыре solution smokes PASS;
  rules, syntax12 JS, staged diff-check PASS. Root preflight2/footprint4 и same-realm
  extracted postread positive+reader failures PASS; mock native/temporary files не live
  proof и не decoder/artwork acceptance. Real symlink privilege skip остаётся явным.

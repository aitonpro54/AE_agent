# MCP-first без рендера — execution plan

Дата: 3 октября 2026. Baseline: 5a49193. Изолированная ветка codex/tool-first-no-render.
Цель: инспекция/MCP → typed plan/gates/read-back → просмотр PNG; CU только объяснённый fallback.

## Этапы
- M1: маршрутизация, bounded passive waits, локальный audit CU; offline checks и commit.
- M2: адресный visual review builder на существующих PNG tools, compact manifest, freshness boundaries; offline checks и commit.
- M3: native lifecycle observation; затем named Save As/open/create_named_project после локального архитектурного ревью, manual gates и tests.
- M4: integration/regression, runtime/live проверка только при свободном AE controller и разрешённом fixture scope; измерения без обещанной экономии.

## Контракт
Никакого renderer/AME/queue automation. PNG для инспекции остаются gated exports.
Новые модули компактные; старые API/gates и frozen intake сохраняются.
Один writer на ресурс. Исполнители только offline; root контролирует AE.
Save As переносит restrictive policy по stable IDs; старые canonical/image/epoch proofs не актуализируются.
Unknown не replay. У первого сохранения unnamed AEP остаётся UI fallback.
Overwrites новых AEP запрещены. Native dirty/revision неизвестны до feature checks: unknown не false.

## Progress
- Выполнен read-only аудит двух сессий: 100/52 CU calls; нерендерные категории project32/panel31/confirmation23/visual21/unknown12.
- Создан отдельный worktree, исходный checkout другой задачи не меняется.
- M1 завершён: правила MCP-first, два passive waits и streaming CU audit; native commands0 в actual isolated MCP route.
- M2 pure compiler и native lifecycle getter готовы/offline проверены; публичная интеграция pending.
- M3/M4 pending.

## Decision Log
- Пользователь исключил весь рендер и поручил реализацию.
- Исходники/code review offline, не запускать live AE и не перезапускать общий daemon исполнителями.
- Подготовлен локальный sanitized review bundle (COMPLETE, без клиентских данных). Пользователь явно заменил Pro локальным архитектурным ревью; внешняя отправка исключена. M3 начинается после локального verdict и записанных решений.
- Local verdict revise принят: singleton durable pending, admission/enqueue/lease barriers, missing/corrupt store fail-closed при lifecycle-enabled runtime, strict COPYFILE_EXCL publication, restrictive inherited ownership, pre-write store capacity и terminal action scope. Старые proof не переносятся как valid; native unsupported flags блокируют переход.
- Flash M1 correction дал transport EOF после записи исправлений. OS status обоих процессов exited; artifacts/source сверены, explicit reconciliation освободила ресурс. Исторический failed/unknown не переписан. Parent исправил missing import и добавил actual MCP route regression.

## Validation
- До начала tracked checkout чистый; чужие untracked сохранены.
- Live/GUI не запускались.
- M1: smoke:tool-first (unit/audit/actual isolated daemon AE0), smoke:planning, adapter smoke-test, rules, JS syntax/diff PASS.
- Recorded root-only audit 2 октября: wrappers52/inner52, windowState47/click24/keyboard10/focus3, image blocks65; usage135 unique responses. Coverage/heuristics/span не screen-lock и не marginal CU tokens.

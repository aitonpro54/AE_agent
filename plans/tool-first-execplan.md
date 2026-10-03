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
- M2 завершён: bounded visual plan builder, manifest из server run records и native lifecycle getter доступны через MCP; обычный manual runner и PNG proof проверены offline.
- M3/M4 pending.
- M2 публичные tools/manifest интегрирует Flash. M3 core/store реализует Sol-specialist после local review: это сложный блок durability/authority. Root владеет последующей bridge-интеграцией; helpers работают offline в разных файлах, лимит два соблюдён.

## Decision Log
- Пользователь исключил весь рендер и поручил реализацию.
- Исходники/code review offline, не запускать live AE и не перезапускать общий daemon исполнителями.
- Подготовлен локальный sanitized review bundle (COMPLETE, без клиентских данных). Пользователь явно заменил Pro локальным архитектурным ревью; внешняя отправка исключена. M3 начинается после локального verdict и записанных решений.
- Local verdict revise принят: singleton durable pending, admission/enqueue/lease barriers, missing/corrupt store fail-closed при lifecycle-enabled runtime, strict COPYFILE_EXCL publication, restrictive inherited ownership, pre-write store capacity и terminal action scope. Старые proof не переносятся как valid; native unsupported flags блокируют переход.
- M3 decision-complete contract: docs/project-lifecycle-contract.md. Rollout opt-in до fixture proof; permanent initialized marker предотвращает исчезновение обязательной базы при restart/flag off. Native ambiguity сохраняет global pending, finalize только уже доказанного final state, без replay.
- Для open полный native inventory закрытого target нельзя читать заранее: до действия проверяются source inventory, target disk hash/identity и target policy; после open target inventory сверяется с собственной policy. Не обещать предварительную native-инспекцию target.
- Flash M1 correction дал transport EOF после записи исправлений. OS status обоих процессов exited; artifacts/source сверены, explicit reconciliation освободила ресурс. Исторический failed/unknown не переписан. Parent исправил missing import и добавил actual MCP route regression.
- Flash M2 initial достиг timeout; correction после записи files дала Google socket error. CLI/bridge exited подтверждены, ресурсы освобождены explicit reconciliation. Continuation timeout-conversation запрещён driver, новый запуск остался в прежнем scope. Bounded fixtures/docs completion делегирована Luna; root сверил реальный export producer и исправил typed error envelope. Неизвестный transport result не повышен до success.

## Validation
- До начала tracked checkout чистый; чужие untracked сохранены.
- Live/GUI не запускались.
- M1: smoke:tool-first (unit/audit/actual isolated daemon AE0), smoke:planning, adapter smoke-test, rules, JS syntax/diff PASS.
- Recorded root-only audit 2 октября: wrappers52/inner52, windowState47/click24/keyboard10/focus3, image blocks65; usage135 unique responses. Coverage/heuristics/span не screen-lock и не marginal CU tokens.
- M2: compiler/manifest/actual isolated MCP+manual runner, solutions/registry, syntax/scoped diff PASS. Rules обнаружил превышение компактного общего плана на две строки; лишняя параграфная вставка перенесена в отдельный execution plan, rules повторён exit0. Live AE/художественной приёмки не было.

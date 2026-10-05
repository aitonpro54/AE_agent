# MCP-first без рендера — execution plan

Дата: 3 октября 2026. Baseline: 5a49193. Изолированная ветка codex/tool-first-no-render.
Цель: инспекция/MCP → typed plan/gates/read-back → просмотр PNG; CU только объяснённый fallback.

## Этапы
- M1: маршрутизация, bounded passive waits, локальный audit CU; offline checks и commit.
- M2: адресный visual review builder на существующих PNG tools, compact manifest, freshness boundaries; offline checks и commit.
- M3: native lifecycle observation; затем named Save As/open/create_named_project после локального архитектурного ревью, manual gates и tests.
- M4: integration/regression, runtime/live проверка только при свободном AE controller и разрешённом fixture scope; измерения без обещанной экономии.
- M5: по поручению 4 октября — свести актуальный основной checkout, перенести код и перезапустить bridge; live read-only проверки новых tools, без lifecycle mutation и рендера.

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
- M3 завершён: guarded named lifecycle, V2 pending/protection migration, private manual authority, queue/cache barriers и command-backed semantic proof. Recipe готов; direct/admin/autonomous и replay запрещены. Implementation — Sol-specialist, bounded docs/fixtures — Luna, независимое local safety review — Sol-reviewer. Root закрыл findings и свёл интеграцию. Helpers работали в отдельных файлах offline, лимит два соблюдён.
- M4 завершён в согласованном scope: финальная offline интеграция/регрессия, текущие upstream instructions включены merge commit 6fcf3df. Пользователь явно выбрал оставить реализацию в отдельной ветке; main merge/runtime restart не выполняются. Живые lifecycle transitions требуют отдельной owned fixture приёмки; opt-in не включался.
- M5 завершён 4 октября: объединённый код 0bda32d перенесён fast-forward в codex/production-usage; bridge перезапущен, новые tools проверены live read-only. Checkpoint codex/pre-tool-first-20261004 = 8d91b98. Offline regression — ae_operator/Luna; root — единственный writer/controller интеграции и restart. Readiness helper недоступен по agent thread limit, поэтому restart-контракт проверил root как sole controller.

## Decision Log
- Пользователь исключил весь рендер и поручил реализацию.
- Исходники/code review offline, не запускать live AE и не перезапускать общий daemon исполнителями.
- Подготовлен локальный sanitized review bundle (COMPLETE, без клиентских данных). Пользователь явно заменил Pro локальным архитектурным ревью; внешняя отправка исключена. M3 начинается после локального verdict и записанных решений.
- Local verdict revise принят: singleton durable pending, admission/enqueue/lease barriers, missing/corrupt store fail-closed при lifecycle-enabled runtime, strict COPYFILE_EXCL publication, restrictive inherited ownership, pre-write store capacity и terminal action scope. Старые proof не переносятся как valid; native unsupported flags блокируют переход.
- M3 decision-complete contract: docs/project-lifecycle-contract.md. Rollout opt-in до fixture proof; permanent initialized marker предотвращает исчезновение обязательной базы при restart/flag off. Native ambiguity сохраняет global pending, finalize только уже доказанного final state, без replay.
- Для open полный native inventory закрытого target нельзя читать заранее: до действия проверяются source inventory, target disk hash/identity и target policy; после open target inventory сверяется с собственной policy. Не обещать предварительную native-инспекцию target.
- Open тоже инвалидирует старые target review/load proofs; accepted restrictions сохраняются. Один production daemon на protection store: process admission+atomic store replace не является cross-process lock. Полное удаление store и marker после остановки при flag off не обнаружимо без внешнего evidence.
- Независимое code review нашло schema downgrade V2→V1 с оставшимися lifecycle fields, недостающие source native pins в receipt и retirement копии record. Root исправил их и добавил adversarial regressions. Raw/unknown footprint с decoy ID запрещён для inherited ownership; guarded setters и известные операции без изменения item IDs сохраняют свои gates.
- Main checkout занят другой задачей «Оптимизировать получение кадров» (bridge/visual-review/plans WIP). Git отказал в ff merge и не перезаписал её файлы. По явному ответу пользователя результат оставлен в codex/tool-first-no-render; чужие WIP и runtime не менять. Новые API доступны в исходниках ветки, не заявлять rollout текущего daemon.
- 4 октября пользователь заменил прежнюю границу отдельной ветки: явно подтвердил перенос в основной checkout и restart. Основные tracked-файлы чисты, остальные AE threads idle; прежние untracked сохраняются. Новая Codex visual evidence реализация сохраняется; lifecycle rollout opt-in остаётся OFF до отдельной fixture приёмки.
- Flash M1 correction дал transport EOF после записи исправлений. OS status обоих процессов exited; artifacts/source сверены, explicit reconciliation освободила ресурс. Исторический failed/unknown не переписан. Parent исправил missing import и добавил actual MCP route regression.
- Flash M2 initial достиг timeout; correction после записи files дала Google socket error. CLI/bridge exited подтверждены, ресурсы освобождены explicit reconciliation. Continuation timeout-conversation запрещён driver, новый запуск остался в прежнем scope. Bounded fixtures/docs completion делегирована Luna; root сверил реальный export producer и исправил typed error envelope. Неизвестный transport result не повышен до success.

## Validation
- До начала tracked checkout чистый; чужие untracked сохранены.
- Live/GUI не запускались.
- M1: smoke:tool-first (unit/audit/actual isolated daemon AE0), smoke:planning, adapter smoke-test, rules, JS syntax/diff PASS.
- Recorded root-only audit 2 октября: wrappers52/inner52, windowState47/click24/keyboard10/focus3, image blocks65; usage135 unique responses. Coverage/heuristics/span не screen-lock и не marginal CU tokens.
- M2: compiler/manifest/actual isolated MCP+manual runner, solutions/registry, syntax/scoped diff PASS. Rules обнаружил превышение компактного общего плана на две строки; лишняя параграфная вставка перенесена в отдельный execution plan, rules повторён exit0. Live AE/художественной приёмки не было.
- M3: smoke:tool-first целиком exit0, включая actual isolated lifecycle bridge32, contract45/transition54/service74, adapter/semantic/reviewer regressions и старые PNG/waits. Planning/solutions/rules exit0. Ordinary named-save plan regression PASS; source save/finalize proof проверен на fullwrapped VM, live AE mutation не выполнялась. M100 sha256: нормализация только receipt; исходные proposal/run hashes сохранены. Review findings закрыты независимым повторным ревью.
- JS syntax36/diff PASS. Code review закрывает material findings; это не live feature acceptance и не доказательство экономии токенов/времени.
- M4: merged upstream docs/routing без конфликтов; rules/diff exit0 после merge. Live read-only get_bridge_status исторически Connected, queues0/inflight[]/editnull; listener PID10336 из main подтверждён read-only OS inspection. Restart не выполнялся. CDP connector-status-smoke фактически использует fake overrides/click/reload и не запускался как readonly proof; inspect способен autostart, тоже не запускался.
- M5 до rollout: smoke:tool-first, smoke:planning, smoke:solutions, check:rules, Codex visual evidence56, JS syntax41 и оба diff checks PASS на объединённом коде. Это offline proof. Live pre-restart: Connected, queues0/inflight[]/editnull, current proposal expired с успешным lastRun; get_project_info получен read-only для сверки после restart.
- M5 live read-only PASS: новый listener PID45216, runtime gitCommit0bda32d и sourceSha256de4aaa9f подтверждены; свежий stdio tools/list = 170 tools, все 11 новых имён присутствуют. Passive wait connected_idle и native lifecycle getter PASS; AE поддерживает dirty/revision, lifecycleReadytrue. CEP Connected, autonomous desiredEnabled/active сохранены; lifecycle enabledfalse/blockedfalse/generation0/pendingnull. Recipe search/get PASS. Ошибка первого probe ограничена слишком малым get_solution limit; исправленный probe exit0. До/после restart сохранены file/items/activeItem/bitsPerChannel. Mutation/render/GUI calls0; Save As/open/create live acceptance не заявляется.

## Текущий аудит — 5 октября 2026

- Progress: [карта и исправления](../docs/tool-first-audit-2026-10-05.md) завершены offline; F-01/F-02/F-03/D-01 закрыты в исходниках, 11/11 migration names доступны. Runtime activation/read-only pending; клиентский AE-проект не менялся.
- Decision Log: unique exact CEP target, always-included global guidance, registry custom-schema и текущий recipe; production F-02 терял passive-wait, MCP-first сохранялся, полный exposed probe терял оба. Opt-in lifecycle off и manual gates сохранены. Flash failed/unknown после writes не повышен до success; exited/files/reconciliation, независимое review и реальные тесты дали приёмку diff.
- Validation: после исходных failures все 9 выбранных smoke-групп PASS, 6 JS syntax/rules/diff PASS. Только affected tool-first/planning повторены целиком: final recheck10/10. CEP16 cases, production names134/mutations91 и 3 prompt probes PASS; exposed schemas дают conservative budget. Evidence: `.codex-runtime/tool-first-fixes-20261005/`; GUI/AE mutation/save/PNG export/render0.

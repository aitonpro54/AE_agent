# Перенос AE Agent Core

Исходная точка: AE_agent commit `1b48076e0aa4a68f21b3229af511d9e526ed0072`, tag `checkpoint/ae-agent-before-core-2026-10-25`. Source inventory docs завершены в `e531f04`. Назначение выбрано пользователем: `C:/Users/Ant/Documents/Codex/AE_Agent_Core`.

## Progress

- [x] Отдельный Git baseline `codex/core-migration`, перенос по source allowlist.
- [x] Независимый runtime: catalog/dispatch/state extraction, отсутствие providers/registry, изолированный adapter+daemon.
- [ ] Минимальная CEP и согласование MCP/HTTP/panel contract.
- [ ] Выбранные safety/scenario checks и перенос явного OFF preference (offline).
- [ ] Concrete cutover package и отдельное разрешение на installed/runtime switch.

## Decision Log

- Runtime extraction выполняет назначенный `ae_implementer` Sol 6.1 configured High, единственный destination writer; без helpers и live control. Runtime model/effort не подтверждён дополнительной metadata.
- Private capability brands/ALS/WeakMaps, guarded wrapper и runner остаются в coherent bridge runtime. Typed schemas, typed dispatch, fixed deterministic plan catalog и project state выделены отдельно с явными interfaces.
- Из Core исключены provider execution/chat/Hardcore, recipe discovery/candidates/registry/metrics, duplicate Usage. Состояние project protection/ownership/review/lifecycle сохранено; advisory memory остаётся в legacy.
- Исходные CEP assets временно сохранены как material для следующего минимального UI-блока; это не готовый минимальный продукт.
- Production authority/provisioning, installed CEP/MCP, private journals/grants/credentials не переносились. Default product mode не требует initial-owned addon; initial-owned native lane остаётся неподтверждённым.
- Явный OFF нельзя потерять при cutover. V2 project-state marker содержит absolute storePathHash; его нельзя просто копировать/удалять. Нужна отдельная проверяемая migration/rebind процедура.

## Validation

- 25.10.2026: `npm.cmd run check:rules` — PASS (174 files, syntax, 0 missing/external/old-root imports); `npm.cmd run smoke:core-runtime` — PASS; `git diff --check` — PASS.
- Isolated daemon+adapter: отдельный port 1454,203 MCP tools; own child PID/source-set/hash read-back; fixed builder success/unknown rejection; direct mutation blocked with zero queued/inflight commands. Snapshot удалён после сверки завершения обоих children.
- Фактический destination manifest: `config/core-runtime-manifest.json` (175 product/test assets,5 412 505 bytes до минимизации CEP). В `config/core-module-boundaries.json` перечислены28 catalog inputs и186 explicit live getter ports typed dispatch. Dynamic/nonliteral/native dependencies отдельно требуют cutover review.
- Source worktree проверен чистым. Live AE, AME, CU/CDP/bootstrap и native factories не запускались.
- Унаследованный `create_adjustment_layer` обращается к двум необъявленным переменным; узкая Core regression/правка — следующим commit. Initial-owned library operations исключены из MCP catalog и fail-closed; native lane отдельно не принят.
- Review исправление: первый runtime commit `2a502c2` содержал потерю mixed mutating risk branch при исключении Hardcore. Ветка восстановлена для всех setters и runner; AST removal ограничен exact `name ===` dispatch predicates. Проверены оставшиеся routes/dispatch deletions: иных смешанных safety deletions review не нашёл.
- Усиленный isolated regression: `update_text_layer`, `set_property_value` с валидными stable IDs/checkpoint/confirm и `run_ai_agent_plan(dryRun:false)` возвращают именно `proposal_required`, risk=`mutating`, requiresProposal и ignoredClientConfirmation; pending/inflight=0. Port4646, sourceSha=`a1bc993b152e30bdb722b7013f77e470bc19425aa1bc91cf580ecb042c8fe194`. Первоначальный generic error test не считался достаточным safety proof.

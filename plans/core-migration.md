# Перенос AE Agent Core

Source: AE_agent `1b48076e0aa4a68f21b3229af511d9e526ed0072`, tag `checkpoint/ae-agent-before-core-2026-10-25`; inventory `e531f04`. Destination: `C:/Users/Ant/Documents/Codex/AE_Agent_Core`, branch `codex/core-migration`.

## Progress

- [x] Независимый Git baseline и перенос по exact source allowlist.
- [x] Runtime extraction: typed catalog/dispatch/state, fixed builders, isolated adapter+daemon без providers/registry.
- [x] Минимальная CEP и offline проверка session/adoption/manual confirmation/UNKNOWN контракта.
- [ ] Offline helper: byte-exact protected state, path-bound marker, durable autonomy preference/OFF и status без replay.
- [ ] Четыре выбранных workflow сценария и safety negatives.
- [ ] Concrete cutover package; отдельное разрешение на installed assets/config/runtime switch и live read-back.

## Decision Log

- Writer назначается по scope; текущий CEP/authority/helper блок выполняет `ae_specialist`, без helpers/live control. Предыдущий runtime writer — `ae_implementer`. Configured роли не являются дополнительным runtime metadata proof.
- Coherent runtime сохраняет private brands/ALS/WeakMaps, proposals, risk policy, edit ownership, checkpoints и no-replay. Schemas/dispatch/fixed builders/project-state выделены с явными interfaces. Advisory memory остаётся в legacy.
- Providers/chat/Hardcore/recipes/registry/candidates/reuse metrics/duplicate Usage и Full Intaker исключены. Codeburn остаётся внешним MCP. AME не получает новых работ или проверок.
- P1 review нашёл потерянную mixed mutating risk branch; она восстановлена, AST deletion ограничен exact excluded predicates. P2 review потребовал публичные builder contracts: доступны9 IDs,4 keyframe examples строятся через MCP. Review fixes сохранены; unresolved findings runtime review отсутствуют.
- CEP сохраняет physical latch, delivery epochs, causal/reset receipts и opaque token/pins/manual server ingress. Session зависит от private page nonce и connection epoch, без chat storage. Ручной Run требует trusted click/confirm и private одноразовый frame; публичный Boolean его не создаёт. См. `docs/core-panel-contract.md`.
- Production data/credentials/grants/journals и installed CEP/config не переносились. Explicit OFF обязателен; missing preference не consent. V2 project-state marker требует reviewed path rebind. Default product не требует initial-owned addon; native initial-owned lane не принят.
- `.gitattributes` сохраняет raw source bytes при checkout; measured runtime hash обновляется после изменений.

## Validation

- Runtime baseline: `2cdd4fe`; P1/P2 fixes входят в историю. `core-runtime-smoke` подтверждает204 tools,9 public contracts/4 keyframe builds, unknown rejection и exact `proposal_required` без dispatch/pending/inflight в изолированном snapshot.
- 25.10.2026, CEP: `smoke:core-cep` PASS — synthetic VM/DOM,16 actions, fresh adoption→dry-run без execute, raw/save/destructive manual gates, stale session/pins/no-dry/отмена/programmatic negatives, physical latch после reload и UNKNOWN/no replay. Новые source assets включены в manifest/hash census.
- На этапе выполняются `check:rules`, `smoke:core-runtime`, JS syntax и `git diff --check`; точный итог указан в commit/ответе исполнителя. Fixture children завершаются штатным cleanup.
- Ограничения: fake HTTP/native responses не являются live proof. Не проверены installed CEP/реальный браузерный жест/вид панели/AE evaluation/native provisioning/cutover. Source code/runtime/settings остаются неизменными.

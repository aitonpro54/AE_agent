# R3b: semantic inspection receiver/ledger без открытия stores

30 октября 2026, baseline `2ac25f4`.
[Общий этап восстановления](core-cep-r3-recovery-20261030.md).

## Результат

`runtime/recovery-inspection.js` принимает явно переданные Buffer/null и выдаёт
неизменяемые факты по каждой истории. Receiver: hash chain, origin, original
dispatch binding, payload/response correlation, порядок terminal events и
действующий validator signed historical disposition. Ledger: pending commands,
оригинальные reservation refs/outcomes и последние constraints. Byte/line/event
budgets проверяются до materialization. Конструкторы stores, mkdir, write и
process probes не используются.

Отсутствие истории — явный факт `present:false`, не доказательство готовности.
Coverage ограничен supplied bytes; history-files observation, process death,
control intents, singleton, cross-store reconciliation и permission на reclaim
не выдаются. Signed disposition validator сохраняет свой read-only lineage/crypto
путь. Helper пока не включён в package и production startup.

## Progress

- [x] Pure fact reader и11адресных adversarial tests PASS.
- [x] Source review: P2 physical UNKNOWN исправлен, финальный ACCEPT.
- [x] Final selected:16/16PASS (11component+5routing), syntax/boundaries/diff PASS.
- [x] Read-only сверка actual signed16event history, byte hash unchanged.
- [ ] Production wiring, control-intent coverage и dead-owner recovery — R3c.

## Decision Log

- Durable transport `complete` может содержать физический outcome UNKNOWN.
  Reader сохраняет `state:'completed'`, отмечает `physicalUnknown:true` и оставляет
  command unresolved; не переписывает прошлое событие в выдуманный UNKNOWN.
- Terminal disposition подтверждается existing fixed validator, а не клиентским
  признаком settled или одним self-hash. Pending reservation блокирует даже при
  terminal command; чужие/неизвестные constraints сохраняют fence.
- Этот компонент намеренно не превращает `settled` одного supplied journal в
  разрешение открыть общие execution stores. R3c обязан добавить наблюдение exact
  файлов под gate, ownership/death proof, cross-store/control facts и durable intent.
- Новые helpers не меняют текущую установку; archived work-context история не
  превращается в runtime authority и не повторяется при новом owner boot.

## Validation

`node core4/tools/validate-diff.js core4/runtime/recovery-inspection.js
core4/test/recovery-inspection.test.js core4/config/validation-map.json --run`:
11+5PASS,0fail. Component key
`862f1c13b640481ac26c4fd7e319afea931f744109ac17b0c4f7a979867eed33`.
Evidence: `snapshots/core4-lifecycle/20261030/R3b/summary.json`, `selection.json`,
`selected.log`; exact dependency hashes unchanged during checks. Boundaries34/live0,
syntax и diff-check PASS. Deferred integrations не объявляются пройденными.

Actual read-only observation: manual3f92,16receiver events,7commands:
1исходный UNKNOWN с проверенным terminal disposition +6completed. Journal SHA256
`4cfe881718e7255829785e57b604304493b319ba6e68d597074a98454e146f45`.
Broker ledger отсутствует; descriptor/journal/receiver marker bytes не изменились.
`observed-history.json` явно сохраняет mutationGrant:false, ownerDeathProven:false,
controlIntentsCovered:false. Receiver marker остаётся на месте, installed fence
не снимался. Install/AE dispatch0; это проверка фактов, не live recovery proof.

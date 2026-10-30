# R3a: явная передача истёкшего controller lease

30 октября 2026, baseline `f268eb3`. Независимый source-компонент
[плана устойчивости](core-cep-lifecycle-20261030.md); реализуется параллельно
транзакционной подготовке R2c, без установленного переключения.

## Проблема и решение

Истечение TTL правильно отзывает право новых sends, но живой idle MCP-client
может сохранить attachment и тем самым блокировать другой чат до явного release
или disconnect. Остановка приложения не должна быть обычным способом передачи.

Добавлен явный `controller_transfer({expected:{bootId,generation,holderClientId}})`.
Authenticated attachment может получить lease только себе. Сервер проверяет
exact current holder, собственный monotonic clock/expiry, отсутствие accepted
operation/fence и фактическую quiescence durable/control/physical состояния.
Поля `safe:true` и похожие клиентские заверения не принимаются.

Это отдельный запрос, не автоматическая передача по TTL. Неистёкшая lease не
захватывается. Старый handle/token становится недействительным, generation
увеличивается; evidence/build/proposal/dry-run refs очищаются. Старый holder
может остаться observer, но его поздний release/detach не отзывает нового.
AE grants, project identity, checkpoints, native confirm и UNKNOWN не переносятся.

## Progress

- [x] Private lease primitive и owner tool реализованы.
- [x] Direct component16lease +24owner tests PASS.
- [x] Real authenticated IPC/3clients test PASS: expiry/CAS/pending/fault guards,
  старый release/ref не действуют, новая операция вызывается ровно один раз.
- [x] Read-only source review ACCEPT, открытых P1/P2 нет.
- [x] Final selected packet после freeze R2c source:16lease+24owner+1wire PASS;
  установленная приёмка позже.

## Decision Log

- Expiry проверяется один раз по server monotonic clock; stale snapshot/CAS
  приводит к отказу до выдачи нового grant.
- Фактический pending/UNKNOWN/fault блокирует transfer независимо от expected
  payload. Это не новый путь очистки fence или оригинального результата.
- Передача при сохранённом attachment не переносит unsent execution context.
  Получатель обязан выполнить fresh inspection/build/proposal/dry-run.
- Source R3a не меняет runtime state и не закрывает общий R3 recovery: dead-owner
  markers, crash intents и новая AE adoption требуют своих штатных переходов.

## Validation

Начальные адресные проверки: `node --test core4/test/controller-lease.test.js
core4/test/owner-attachments.test.js`:40/40PASS;
`node --test core4/test/controller-transfer-ipc.test.js`:1/1PASS.
Final source packet вместе с R2c1:169/169PASS,0fail по14selected checks.
Exact source hashes, commands, reuse по неизменным evidence keys и raw logs —
`snapshots/core4-lifecycle/20261030/R2c1/summary-final.json` и `selection-final.json`.
R3a keys: lease `1b822fd41b19872f5825fa5b047e76a37377289791a27b942cb64fcb1d9145af`,
owner `d4df8a4f2b8ce4737a8d4a7b2880ee1700385958b0c2cc4af32dfd020d72f73e`,
wire `71505139f1a7c8741aab02aa15f752cdc8d370ff2f2ce01f66f0c62372211fcd`.
Boundaries34/live0, syntax и diff-check PASS. Source review ACCEPT.
Native AE calls/install changes0; общий R3 recovery остаётся открытым.

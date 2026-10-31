# R3 — продолжение owner update до switch-ready

31 октября 2026. Продолжение уже начатого штатного обновления client resilience,
source commit1a6d442. Root задал45с timeout дочернему update operator; ETIMEDOUT
завершил28152 до ответа. Повтор action не запускался. Это root orchestration
ошибка, а не установленный исход обновления. Данные/authority/fences сохраняются.

## Исходное состояние

- Stop operation`b99e2f80-034e-49b8-9ee5-ed7d68755f86` принят и завершён;
  прежний owner27112 отсутствует, receipt stopped и fresh native death proof есть.
- Update transaction`88e4a61e-8ed0-4579-b50e-55aee706a271` содержит только
  immutable `intent.json`. `lease.json`/`switch-ready.json` отсутствуют; install
  и broker update gates на месте и точно совпадают с intent role bytes.
- Intent actor28152, birth`639290406754247450`, boot`453a382e-ef88-418e-ba40-200240789040`
  отсутствует по OS inventory; old/new MAC intent проверены root. `source=owner`,
  `externalLease=false`; target packagecc2f и original generated credentials
  остаются внутри машинного intent, не выводились и не копировались в repo.
- Current descriptor всё ещё package8a79/SHA4a42f5a9…, config прежний.
  Candidate release/staged descriptor/staged client отсутствуют. Receiver journal
 18events/hash2a7d8b23…, origin/anchor и host adoption прежние.
- AE26308/birth639290395690521480 остаётся открытым. Только собственная CEP
  закрыта для update; project changes/save/AE restart0. Core остановлен, initial
  desired-stop barrier сохранён. Markers вручную не удалялись/не архивировались.

Санитизированное readback:
`snapshots/core4-lifecycle/20261031/R5CLIENT/update-timeout-readback.json`.
Полные intent/credentials/transactions остаются machine-local.

## Цель и границы

Явное inspect/finish продолжает **эту же** pre-ready owner transaction и original
payload. Оно не повторяет owner-update, не создаёт новые credentials/plan,
не выдаёт owner/project grants и не снимает UNKNOWN. Отсутствие lease/switch-ready
не интерпретируется как разрешение на очистку gates.

Новый source путь принимает immutable intent с exact role gates, прежним stopped
certificate, native process-death proofs и current CAS baseline; инспекция
фиксирует полный inode snapshot. Новый actor пишет durable attempt, затем
переиспользует dedicated staging/recovery под непрерывным attributed lease.
Runtime target остаётся exactcc2f; меняются только installer/recovery helpers.

## Progress

- [x] Timeout не повторён; фаза/gates/MAC/history/current descriptor установлены.
- [x] Source diagnosis: `readRecovery` требует lease+switch-ready; существующий
  dedicated pre-ready continuation принимает только legacy. Граница известного
  fail-closed gap подтверждена.
- [ ] Private owner pre-ready inspect/finish и tests.
- [ ] Независимое review, scoped validation, новый verified helper distribution.
- [ ] Root inspect/proof → exact continuation → stopped read-back → explicit enable.
- [ ] New client cold/configured/CEP proof; manual Codex restart при необходимости.

## Decision Log

- Явные owner-pre-ready commands; скрытый fallback в update-finish исключён.
- Original update intent/payload, certificate, stop/history/origins и adoption
  сохраняются. Gate bytes/inodes/role bindings проверяются до и после await.
- Revalidation уже существующего certificate — read-only private seam;
  новый fake certificate/normal plan brand не выпускается.
- Коррупция, foreign files, stale/live actors, PID reuse/неизвестная смерть,
  изменения baseline и неизвестный исход исполнения сохраняют fence.
- Внешний kill/короткий timeout mutating operator повторно не применяется.
  Оператор запускается без forced timeout, progress/status читаются отдельно.

## Validation

Pending: адресные fixtures intent-only/gate prefixes/CAS/races/actor death,
crash-attempt/staging continuation и compatibility с post-ready recovery.
186selectedPASS предыдущего client блока относятся к его immutable source,
не являются проверкой нового recovery path. AE mutation/live proof не заявляется.

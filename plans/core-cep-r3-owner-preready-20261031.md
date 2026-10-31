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
- [x] Private owner pre-ready inspect/finish,27 новых recovery cases и3 existing
  normal/legacy regression +4 operator checks PASS в адресных batches.
- [x] Независимое bounded source review: два findings исправлены и проверены.
- [x] Immutable scoped validation209PASS/0FAIL/skipped0,10checks/10batches;
  19deferred integrations сохранены.
- [x] Новый verified helper distribution6ae8960f…, target runtime exactcc2f сохранён.
- [x] Actual read-only inspect verified distribution6ae8960f: owner-pre-ready,
  gatePrefix2, proof`f55b0ba0e211f7931bc92f29d893615f70b489b64b01e6b7f1a54d7dbd8c5276`;
  runtimeStarted/aeAuthority=false. Установленных записей inspection не меняла.
- [ ] Exact continuation → stopped read-back → explicit enable после full selection PASS.
- [ ] New client cold/configured/CEP proof; manual Codex restart при необходимости.

## Decision Log

- Явные owner-pre-ready commands; скрытый fallback в update-finish исключён.
- Original update intent/payload, certificate, stop/history/origins и adoption
  сохраняются. Gate bytes/inodes/role bindings проверяются до и после await.
- Revalidation уже существующего certificate — read-only private seam;
  новый fake certificate/normal plan brand не выпускается.
- Attempt chain допускает ancestor без receipt после crash; каждый child и
  receipt монотонно сохраняют уже закреплённые non-null inode facts. До первого
  durable inode fact доступны только original sealed role bytes и fresh CAS,
  историческая inode публикация до receipt не заявляется.
- Deterministic claim сериализует concurrent helper actors. Losing EEXIST stage
  удаляется только для этого claim после exact own fd/stat/bytes, nlink1 и
  distinct winner inode проверки; published/unknown stages не очищаются.
- Только pre-ready records допускают `-lease` receipt. Неизвестные recovery/enable
  records сохраняют fail-closed refusal. Host adoption включена в full-stat CAS;
  её содержание не интерпретируется как execution authority.
- Коррупция, foreign files, stale/live actors, PID reuse/неизвестная смерть,
  изменения baseline и неизвестный исход исполнения сохраняют fence.
- Внешний kill/короткий timeout mutating operator повторно не применяется.
  Оператор запускается без forced timeout, progress/status читаются отдельно.

## Validation

Адресные batches PASS:4golden prefixes (intent/install/both-gates/lease),6crash
prefixes (attempt/lease/release/prepared/CEP/ready), refusal/CAS/actor/proof guards,
post-ready handoff и two-process claim interleave. Проверены сохранение payload,
credentials, original stop/certificate/intent и protected history. Bounded review
закрыл missing ancestor receipt и losing claim stage findings после source fixes;
second finding относился к helper API, CLI уже резервирует единственный3457.

Immutable final selection209PASS/0FAIL/skipped/cancelled0 выполнен на export
e50dbeb +9exact changed files,10checks/10batches;
source hashes/evidence keys/raw log — в
`snapshots/core4-lifecycle/20261031/OWNERPREREADY/`. Root boundaries43/liveCalls0,
8JS syntax, observer syntax и diff check PASS. Source/frozen hashes не изменились,
current/frozen selected evidence keys совпали. Read-only builder/closure verifier подтвердили
83files, target runtime packagecc2f и helper distribution
`6ae8960ffc6b89ded2971aca517b42f5792876bb6fac0161e2127565dddf6b15`.
Пакет — `dist/owner-pre-ready-6ae8960ffc6b/`.
Frozen export отдельно собрал exact те же runtime package и helper distribution;
проверяемые и предлагаемые к выполнению bytes совпадают. Summary — `summary.json`,
полный scoped selection — `selection.json`, raw output — `validation.log`.
Actual read-only inspect — `OWNERPREREADY/installed-inspection.json`; исходные
gates/payload/phase проверены новым private reader без writes/replay.

Operator contract: `owner-pre-ready-inspect/finish`, operation — update UUID88e4a61e
(не stop UUIDb99e2f80), existing old/new package/descriptor/distribution pins,
без `--config`. Finish требует fresh `--expected-proof-hash`. После switch-ready
применяются отдельные update-inspect/update-finish, затем explicit update-enable.

186selectedPASS предыдущего client блока относятся к его immutable source,
не являются проверкой нового recovery path. AE mutation/live proof не заявляется.

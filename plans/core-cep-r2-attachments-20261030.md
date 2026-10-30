# R2a: owner attachments и локальный IPC

30 октября 2026, baseline `edea86b`. Часть
[этапа устойчивости](core-cep-lifecycle-20261030.md). Только private source,
TEMP sockets/processes/Broker и synthetic host fixtures; production entry,
installed package, runtime state и CEP не переключаются.

## Результат

- `runtime/client-ipc.js`: отдельный control-domain challenge/MAC, installation/
  machine/package identity, boot/nonces/session keys, sequence/request correlation,
  bounded frames/resources/deadlines. Named pipe не объявляется ACL или election.
- `runtime/attachment-owner.js`: observer attachment, explicit controller lease,
  scope server refs по generation, штатный detach/drain, trusted activity snapshot
  и callback для повторной проверки lease перед физической отправкой.
- `runtime/client-stdio.js`: тонкий MCP adapter; EOF отсоединяет только клиента.
  Metadata не выбирает controller, произвольные ошибки не выдаются наружу.
- При потере принятого результата — `ipc_outcome_uncertain` либо
  `owner_outcome_uncertain`, original request correlation и отсутствие replay.
  Получение UNKNOWN клиентом само по себе не подменяет durable facts owner.

Принятый вызов остаётся у owner при разрыве клиентского канала. Expiry и detach
не отменяют отправленную команду. Runtime faults/unresolved закрывают acquire,
status остаётся читаемым. При смене controller старые evidence/build/proposal/
dry-run/task refs не становятся исполнимыми. Новый taskId первого build
назначает Broker; внешний явно заданный taskId допускается только с текущей
generation binding. Это намеренное ограничение private seam до нового entry.

## Progress

- [x] IPC implementation и real named-pipe tests.
- [x] Owner controller/ref/drain policy и thin stdio adapter.
- [x] Два настоящих stdio child-процесса подключены к одному TEMP Broker.
  EOF первого не завершает owner; второй получает тот же PID/boot и ledger.
- [x] Actual TEMP Broker connect→inspect→build→propose и отказ на proposal
  прежней generation после transfer. Native AE calls0; VM host synthetic.
- [x] Source review; локальные findings исправлены, final ACCEPT bounded.
- [x] Соседний controller завершил handoff; дожидаться операций не требуется.
- [ ] R2b: trusted installed owner composition, credential seam, singleton
  startup/launcher и package/installer integration.

## Decision Log

- IPC callbacks не отменяются при закрытии socket; transport close не равен
  shutdown Broker. Перед trusted owner shutdown требуется фактический drain.
- Reply overflow либо throw после принятого callback закрывает IPC socket и
  сообщает uncertainty. Generic «ошибка запроса» здесь не доказывает no-effect.
- Stateful invoke с throw/pending/unresolved/fault не возвращает ложный success.
  Original pending и durable fences остаются единственным основанием drain.
- Review P2 stdout: ограничен buffered output, при исчерпании отсоединяется
  attachment. Review P2 error leakage: provenance и fixed code allowlist.
  Review P3 max-frame fallback: ID ограничен256bytes, ответ всегда bounded.
- Partial onAttach→throw вызывает один onDetach; ложный enrollment не остаётся.
- Две initial fixture ошибки исправлены в tests: incarnation берётся из
  конкретного synthetic child, recordContext содержит project/resources.
  Guards и production authority ради теста не ослаблялись.
- Validation map получил explicit routes. Старый фиксированный batch-count6
  заменён проверкой полноты/единственности групп и нового consumer. IPC pattern
  исправлен на `^IPC `: начальный file-level PASS без совпавших test names не
  считается IPC coverage; настоящий final route исполнил22tests.

## Validation

Evidence: `snapshots/core4-lifecycle/20261030/R2a/` (ignored).

- IPC: **22/22 PASS**, root `ipc-final.log`.
- Owner/stdio: **22/22 PASS**, real TEMP processes/Broker: **2/2 PASS**,
  `selected-before-routing-fix.log`; production code после этих проверок не
  менялся. Этот лог также сохраняет initial routing4PASS/1FAIL до исправления
  устаревшего batch-count assertion и не выдаётся за общий PASS.
- Validation-routing после corrections: **5/5 PASS**, `routing-final.log`.
- Boundaries: **32 checked**,liveCalls0; syntax всех новых JS и изменённого
  test файла, `git diff --check`: PASS.
- Review final ACCEPT: нет открытых findings в source/offline scope. Reviewer
  tests/live не запускал. Полная release/установка/переносимость не проверялись.
- Read-only build даёт прежние readonly40/manual59 и прежние package hashes
  `7a46f386447340ea394174ffde1965dd8b96df4ba1afac3b17ab5938385634ab` /
  `3f9293f76f5dbef30f8919151145e28ebceb8fe796ee4495b9747e18e0ff8c51`.
  Новые private components не включены в current closure; dist не записан.
- Selection/deferred coverage и exact source hashes — `selection.json` и
  `summary.json`. Byte-only integrations остаются current-closure-unverified.

## Post-restart и handoff

Пользователь перезапустил Codex и поручил продолжить. Configured Core5448
доступен, pending=null/unresolved=[], worker pending0, receiver storeClosed=true,
storeFault=false, unknown=true, peer disconnected. Здесь unknown отражает закрытую
полосу; судьбу команд определяет журнал, а не один boolean. AE6492 сохранён.
Source/offline разработка не требует ручного снятия marker.

После restart штатная send_message_to_thread приняла поручение. Чат
`01a18b19-bb02-7e02-85bd-7fdce6e38061` завершил turn
`01a18d03-6948-7933-a730-ccf6e537a748` и явно передал управление текущему
координатору `01a18cce…`. Snapshot: idle/completed. Его read-only отчёт подтвердил
те же16receiver records/hash, отсутствие незавершённых helpers/AE callbacks и
отсутствие новых dispatch. Новых записей в source/runtime он не делал.
Старое поручение из UI очереди заменено этим; повторов T2/maintenance не нужно.

## Следующий участок

R2b должен связать эти private components с единственной verified installed
composition. Нужны отдельный control-only client descriptor, trusted owner entry,
startup election до открытия stores, lease guard на actual physical submit/deliver
и доказанный Windows launcher lifetime. Ни один из этих пунктов не закрывается
успехом текущего fixture. Recovery старых owners/adoption остаётся R3.

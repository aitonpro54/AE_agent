# Локальный разбор первого plan review

Review20261031-readoption-plan-01/stageowner-host-readoption, source9343989.
Original verdict: revise. Raw response51969байт,
SHA256a93778bf0c4fcd860990dcf87c2cfb2a67e96c628531ab8e0a9481ec5b02d7a3.
Все8binding values присутствуют. Это string binding, не доказательство внешнего
пересчёта hashes. Controller received/complete; upload1/send1/retries0,
selected Aiton/Argon/highest available UI effort подтверждены им перед отправкой.
Raw response/request/manifest/bundle не меняются. Дополнительного review нет.

## Первичная классификация

Статусы ниже — локальный source/design разбор, не приёмка ещё не существующего
оператора. Исходные приоритеты не означают автоматически подтверждённый дефект.
Известный backlog — этот plan/implementation notes; внешний issue ledger неизвестен.

| ID | Внешний → локальный приоритет | Статус | Evidence / причина | Новизна | Следующий шаг |
| --- | --- | --- | --- | --- | --- |
| F-01 | P1 → P1 | Подтверждён как незавершённый seam дизайна | source9343989 stopped-certification196–222 связывает in-memory brand/PID/exact phase; plan уже требует private extension, но ещё не задаёт disk-backed port | known-open | Разделить live assertion и disk-backed verification, не выпускать normal certificate из JSON |
| F-02 | P1 → P1 | Подтверждён | owner-maintenance34–50 пишет stage в target tree; partial first claim блокирует generic reader до canonical intent | new | Inert external same-filesystem preparation; первый canonical intent публикуется атомарным link в stop phase tree |
| F-03 | P1 → P2 | Уже учтён, known-open | plan4/6 уже фиксирует exact replacement и foreign inode refusal; provider110–114 показывает dynamic fields, но readopt не должен вызывать provider.adopt для CAS | known | Закрепить adoptedAt/observedDigest один раз и immutable replacement inode anchor до CAS; адресные foreign-file/crash tests |
| F-04a | P1 → P1 | Подтверждён как отсутствующая точная ветка | plan разделяет finish/enable, но не фиксирует release-only apply tail после completed record | new | При доказанном completed adoption завершать освобождение original gates без повторного CAS |
| F-04b | P1 → P1 | Подтверждён как operational design defect | unconditional fresh-host requirement после irreversible barrier unlink может зафиксировать полуразблокированное состояние | new | Разделить pre-CAS admission и post-commit settlement/enable release semantics; no AE authority |
| F-05 | P2 → P2 | Уже учтён, known-open | plan6 допускает только доказанные собственные link/rename metadata transitions; owner-maintenance8/13 сравниваетctime, не включаетnlink/mode | known | Exact inode/nlink transitions и TEMP Windows checks; не копировать внешний comparator вслепую |
| H-01 | P2 → P2 | Не подтверждается для existing CLI; новый путь требует проверки | maintain-owner95, finish-owner-maintenance19, operate-stopped-update26 резервируют3457 | known | Новый CLI удерживает ту же election до конца; boundary/concurrency test |
| H-02 | P2 → P2 | Не подтверждается для existing lease | install-lease assert/facts/release используют maintenance semantics; update flag не требует update plan, служит отдельно legacy promotion | known | Reuse existing sealed lease через узкий helper adapter; fixtures проверят новый caller |
| H-03 | P3 → P2 | Частично не подтверждается; обязательный guard известен | provider63–72: hostIdentity не включает endpoints; freshObservation отдельно требует оба observed-absent | known | Helper сохраняет freshness/endpoints semantics; regression corpus против existing provider |
| S-01 | recommendation → P1 boundary risk | Не принимается | runtime/source-package.json9 включает install-lease.js; read-only build дал exactcc2f, installLeaseInRuntime=true, helper certificate/update=false | new | Оставить runtime package unchanged; узкий helper-only adapter вместо runtime export |
| S-02 | recommendation → P2 | Требует уточнения, не принимается буквально | All-in-phase конфликтует с external preparation F-02; бюджет32 не доказывает размер всех attempt/archives | unknown | Canonical claim/records stop-bound, inert preparation вне phase; bounded exact inventory/budget tests |
| G-01 | gap | Уже учтён, known-open | Нового operator/tests нет | known | Source реализация и scoped tests после закрытия design |
| G-02 | gap | Уже учтён, known-open | Live readoption/Titles не выполнены; previous CEP read не подменяет их | known | Отдельный actual этап после source приёмки |
| G-03 | gap | Уже учтён, known-open | Portability и pre-CAS host-loss cancel/retarget остаются вне первого среза | known | Явный operational limit, не объявлять общую release readiness |

## Изменения плана перед реализацией

Specialist source triage завершена без edits/tests/live. Приняты: private
disk-backed certificate verification (пример readStoppedUpdateCertificate224–244),
inert external same-filesystem preparation и первый canonical exclusive link,
однократно frozen replacement + immutable inode anchor, explicit post-CAS receipt/
release-only tails, enable без host dependency после proven adoption CAS.
Windows metadata сравнивается по собственным доказанным FD/alias transitions,
не по unconditional old birthtime из внешней рекомендации. Exact alias inventory
и bounded attempts/file budget обязательны.

F05 local evidence получено отдельно: HOSTREADOPT-FS,3own-TEMPcases PASS на MSI/
Node24.15.0/NTFS. Retained old-target read FD блокировал rename-over-existing
ошибкойEPERM; после close rename прошёл. Freed-name rename сохранил new inode/
bytes, но изменил birthtime target и anchor на значение old destination.
Prior-anchor baseline показалnlink2→3→2, replacement2. Поэтому unconditional
strict old birthtime и hardcode initial nlink1 из внешнего предложения не приняты.
ReportSHA3d41438ab6c6935fe57d650e89c9c5b6e00ed9c6ae649db0c6591f2e63e8e562.
Это primitives proof; новый operator/CAS/crash acceptance ещё не выполнен.

До CAS host loss сохраняет explicit stopped fence, cancel/retarget не добавляется.
После доказанного CAS finish/enable только завершают локальные facts/barrier/gates,
не переписывают adoption и не выдают AE authority. Runtime prepare заново проверит
host/project/endpoints. Root внёс эти уточнения в текущую редакцию плана.

## Итоговый implementation scope

Пять incremental slices: private evidence/lease seams; claim/CAS/freshness; apply
continuation; enable continuation; CLI/package/routing. Writer — specialist,
только assigned source/test paths, без live. Root владеет docs/evidence/Git и
единственным live controller. Сначала slice1 с адресной проверкой, потом остальные
без нового Argon review. Runtime/provider/CEP/package boundary сохранена.

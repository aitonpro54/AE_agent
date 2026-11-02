# B1: известный отказ базовой inspection

1 ноября 2026: source design после B0. 2 ноября: реализация и адресная
offline-приёмка завершены; установленная проверка остаётся открытой.
Baseline runtime source `6fcee4c`, документальный milestone `e467ca2`.

## Минимальный подтверждённый scope

`project-inspection/inspect` идёт facade.inspect → peer.inspect напрямую,
минуя Broker.send. Peer сохраняет correlated store.complete, затем отклоняет
Promise обычным Error. Attachment-owner теряет классификацию в blanket catch.
Для B1 менять Broker/receiver/Titles не требуется; Titles failure этим срезом
не объявляется исправленным.

1. В экземпляре http-peer private WeakMap exact Error → completed record.
   Создание только после durable complete для direct project-inspection inspect
   и exact asset/executor/payload. Коды: inspection_failed,
   inspection_result_budget, host_json_unavailable, host_registry_unavailable.
   One-shot consume; JSON/ordinary flags не восстанавливают происхождение.
2. Private composition связывает record с текущим operation guard identity,
   method/module/contract/target. Guard после completion повторно не вызывается:
   оригинальный read может штатно завершиться после истечения lease.
3. Owner классифицирует только error своего awaited inspect. При любой
   pending/unresolved/fault или ошибке verifier остаётся uncertain. Даже отказ
   дальнейшей классификации потребляет record. Нет evidenceRef, выдачи grants,
   переписи журнала или изменения finalize/fences.
4. Client projection: точный finite rejected result становится MCP isError:true
   с code и следующим шагом core_diagnostics. Остальные ошибки сохраняются.

## Ownership и файлы среза

Production: integrations/cep/http-peer.js, runtime/stdio-entry.js,
runtime/attachment-owner.js, runtime/client-stdio.js (всё под core4/).
Tests: test/installable-runtime.test.js, test/owner-runtime.test.js,
test/owner-attachments.test.js. Source writer — root; он владеет
документами/Git и единолично live control. Никакой installed update отсюда не следует.

Четыре смысловых сценария: полный production-owner/IPC/stdio known rejection;
forged/stale/wrong-context rejection; real completion при fault/pending;
callback loss/late completion/UNKNOWN и no replay. Число сценариев не равно
числу тестов или обязательных dependency checks.

## Стоимость, проверенная до реализации

Один selectChecks вызов без --run на перечисленных7paths дал24checks/24batches
(16component+8integration). Реального времени не измеряли, tests0.

```text
owner-runtime, installable-runtime, native-read-recovery, manual-runtime,
installed-composition, owner-installation, human-window, owner-attachments,
owner-ipc-process, controller-transfer, stopped-host-readoption, readoption-core,
readoption-recovery, readoption-enable, readoption-probe, stopped-certification,
maintenance-finish, owner-maintenance, owner-lifecycle, owner-lifecycle-faults,
owner-marker-publication, client-launcher, recovery-inspection, client-entry
```

Причина широкого выбора — общая stdio composition и её lifecycle/readoption
dependencies. Standalone-installer и ещё14integration closures остаются deferred,
releaseCertified:false. Не выдавать прежние PASS за current closure и не удалять
выбранные tests ради красивого числа.

Альтернатива shared WeakMap в старом utility не даёт бесплатной изоляции:
protocol/json меняет artifact pins; peer-protocol import из owner расширяет
thin-client closure; новый helper требует package composition. One-shot private
error в trusted invoke в принципе допустим без ALS, но в данном layout не
доказан меньший целостный срез. Explicit operation identity не объявляется
универсально обязательной против гипотетического hostile trusted invoke.

## Следующий шаг

Перед code write проверить узко маршруты selector для7paths: какие зависимости
действительно затрагивает новая private result projection и какие выбраны из-за
общего entry файла. Если доказанного уменьшения нет, сохранить24selectedchecks
и выполнять один frozen запуск, без broad release и повторных suites. Не создавать
новый framework или переносить файлы только ради обхода проверки. B2 reconnect
и disconnect contract идут отдельным изменением; L0 не блокирует B1.

## Результат B1 — 2 ноября

Четыре planned production и три test files реализованы без изменения Broker,
receiver journal semantics, Titles и grants. Точный Error прямой inspection
получает one-shot private record после durable complete. Composition связывает
его с исходным operation context/contract/target; owner сохраняет finite code
только при чистых facts. MCP возвращает `isError:true`, `outcome:rejected`, точный
code и `nextAction:core_diagnostics`. Остальные ошибки остаются uncertain.

Проверены provenance/one-shot/forgery, lease expiry после delivery, pending/fault/
unresolved refusal, production owner → IPC → stdio и успешное следующее чтение.
Выбранные24 batches прошли473 cases; boundaries44PASS, git diff --check PASS.
Первые12 batches завершены на исходном срезе, остаток — на exact frozen copy с
совпавшими24 evidence keys. Незавершённый batch после остановки родительского
runner не засчитан и выполнен заново. Логи и selection/report сохранены в
`snapshots/core-base-b1-20261102/`; постоянная сводка —
[evidence](evidence/core-base-b1-20261102.json). Это source/temp proof.
Installedbe9afe99 не изменён, live known rejection этим результатом не доказан.

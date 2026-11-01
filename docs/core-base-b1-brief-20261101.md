# B1: известный отказ базовой inspection

1 ноября 2026. Read-only source design после B0; реализация не выполнена.
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

## Ownership и файлы будущего среза

Production: integrations/cep/http-peer.js, runtime/stdio-entry.js,
runtime/attachment-owner.js, runtime/client-stdio.js (всё под core4/).
Tests: test/installable-runtime.test.js, test/owner-runtime.test.js,
test/owner-attachments.test.js. Source writer ещё не назначен; root владеет
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

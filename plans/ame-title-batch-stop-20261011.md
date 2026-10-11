# AME: остановка на сегодня — 11 октября 2026

**Возобновлено 11 октября по прямому поручению пользователя.** Ниже сохранён исторический checkpoint остановки; актуальное продолжение — в [плане](ame-title-batch-execplan.md). Flash запрещён, root выполняет разрешённые готовые подтверждения через Computer Use.

Работа остановлена по прямому поручению пользователя. Новые тесты, сборки,
native планы, установки и перезапуски не запускать до возобновления работы.
Все вспомогательные исполнители остановлены. Этот checkpoint фиксирует
незавершённую задачу; пакетный экспорт и M3/M4 не приняты.

## Progress

- Ветка `codex/release-3.3.1`, проверенный документационный checkpoint
  `7d871bc61144618297ce9ab0d1ca2ea3a67aa790`. Daemon PID29132 продолжает держать
  runtime `793480e403334fc7462afbef4fdcd49667b50bdefa5cfe13c3b34386b40a818b`
  с loaded checkpoint `d32eb48`; документационный commit не перезагружал runtime.
- Предыдущие singleton/group dispositions приняты trusted GET; исходные
  UNKNOWN/no-replay сохранены. Новый запуск создал отдельный unresolved guard.
- Установлена diagnostic AEX `8bdf6507388af098825eaccc12cf2f8e54fab6a4cdd51d98c471a599e3003d43`.
  Последний запуск не дошёл до stage facts; live snapshot acceptance отсутствует.
- Незавершённый resident-inspect черновик сохранён: изменён
  `native/ame-snapshot-service/ame_snapshot_service.cpp`, добавлены пары
  `service_authorization`, `service_crypto`, `service_inspector`, `service_transport`,
  а также `native_snapshot_adapter.cpp` и `issuer_command.cpp`. Черновик не
  компилировался; VCXPROJ/build helper и Node producer ещё не подключены.
  Устанавливать или запускать его нельзя. Production keystore/pin не создавались.
- Новые `ame-manual-queue-grant.js` и его focused smoke сохранены отдельно;
  ранее 9 offline групп PASS, интеграция в текущий runtime ещё не выполнена.
- Сохранены 23 исходных файла и SHA manifest в ignored каталоге
  `.codex-runtime/ame-transport-probe/stop-checkpoint-20261011-195134Z/`.
  Четыре предшествующих dirty-файла совпадают с baseline; их изменения не включать
  в этот checkpoint commit. Незавершённый исходный код остаётся в рабочем дереве.

## Последняя ошибка

- Manual plan `act_500947d092694dd2a9c29a2a33bcc1b4`, revision 2,
  «Проверить нативные снимки с подробными stage facts».
- Run `5a4ac6eb-7b2e-42ce-8af9-7d03e52c17c5`, private UI request
  `4f06da6d-4b76-40b2-b70b-a77db3e1e9c7`.
- `fixture_runner_launch_identity_changed`, 3832 ms, executed=0, failed=1.
  Создана одна capture launch attempt; phase grants не выданы. Это не доказывает
  отсутствие нативного исполнения. Ledger: `unknown`,
  `nativeExecutionProven=false`, `replayAllowed=false`.
- Stage `3fed0bd18d6bd8d01834bd35ef2c6236`, attempt root
  `.codex-runtime/ame-native-fixtures/probe-e8bae1246dfa7890383e5303b06fb6b2/`.
  Есть `signed-boot.json` и эксклюзивный `owner.lock`; содержимое boot receipt в
  последнем аудите не прочитано. Durable launch record и retirement proof отсутствуют.
- Код сравнивает два `.NET Process.StartTime` с полной 100-нс точностью.
  Разница CIM `.5234590Z` и kernel `.5234591Z` наблюдается, но неизвестно,
  какое поле фактически разошлось в двух выборках runner. Ошибка на 100 нс —
  гипотеза; изменение Git HEAD её не объясняет. Проверку точности не ослаблять.

## Процессы и безопасное завершение

Свежая инвентаризация: `2026-10-10T19:53:03.4414487Z` (11 октября, UTC+5).
Полные birth/image/parent сведения сохранены в `processes.json` рядом с manifest.

| PID | Роль / окно | Действие на сегодня |
| --- | --- | --- |
| 40476 | Единственный оставшийся тестовый AE, `Untitled Project.aep`, parent21888 | Сохранить, не kill/replay до восстановления точного владения и exit observer |
| 21888 | PowerShell broker данного запуска, parent29132 | Сохранить: может удерживать original child handle/вывод |
| 31728 | Рабочий AE, `konkurs_kino_02.aep` | Не закрывать, не сохранять и не перезапускать автоматически |
| 38316, 36520 | Чужие AE Dynamic Link, parent28468 | Не завершать |
| 35400 / 28468 | AME / Dynamic Link manager | Не менять очередь и не завершать автоматически |
| 29132 | Текущий bridge daemon | Не перезапускать: сохранить unresolved guard и broker |

Для AE40476 kernel birth `2026-10-10T19:42:47.5234591Z`, FILETIME
`134361349675234591`; broker21888 birth `2026-10-10T19:42:47.0555085Z`, FILETIME
`134361349670555085`. Исторические fixture PID26912/44260/44312/47792/37588
в свежем списке AE отсутствуют. Запущенных MSBuild/cl/link/offline harness нет;
resident helper не запускал своих процессов. Процессы сегодня не завершались.

**Decision Log:** новый тест не отправлять; guard и owner lock не удалять.
Boot/owner receipt сам по себе не является доказательством выхода. Если компьютер
будет выключен вручную, отсутствие PID при следующем старте не заменит held-handle
exit proof; сохранить UNKNOWN и все исходные записи, не объявлять cleanup успешным.

## Следующий шаг после возобновления

1. Сверить уже существующие launch/exit данные broker21888 и подписанный boot
   receipt с точными stage/nonce/PID40476. Если они недоступны, сначала разработать
   ограниченный recovery для единственной pre-phase попытки; не применять grouped
   retirement двух процессов к этой попытке и не подменять его singleton fallback.
2. Восстановить проверяемое владение и наблюдение удержанного process handle;
   только после этого подготовить закрытие ровно тестового AE без сохранения и
   зафиксировать exit proof. При неизвестном исходе сохранить no-replay.
3. Исправить durable launch witness до identity comparison и единый источник
   полной kernel birth identity. Провести собственное ревью и scoped offline
   проверки только после возобновления; точность, native/CEP grants не ослаблять.
4. После reconciliation текущего guard продолжить новый manual fixture с AEX
   `8bdf6507…`, затем resident snapshot backend и полную цепочку двух вариантов
   через AME. Новые тесты сегодня не разрешены.

## Validation

После команды остановки выполнены только read-only panel/process/file наблюдения,
копирование checkpoint и проверка SHA сохранённых копий. Panel: busy=true,
reconciliationRequired=true, activeAction=null; unresolved только последний run.
Новые npm smoke, native harness и сборки не запускались. Проверка оформления diff
и документационный commit не являются live/production acceptance.

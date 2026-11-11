# Локальное восстановление смешанной установки DESKTOP, 11 ноября 2026

Пользователь поручил исправить рассогласование, сохранить обе доступные истории,
настройки и AEP, поставить Core 4.2.4 и завершить проверку запуска. MSI исключён.
Исходный срез — `4796a34`, диагностика —
[`core-4.2.4-desktop-20261111.json`](evidence/core-4.2.4-desktop-20261111.json).

## Контракт восстановления

Активной остаётся существующая identity `installation-e0e81ad5…`, descriptor
`d3371a08…`. Её исходный подписанный stop `dfcc12b3…` не переиздаётся. Другая
identity `installation-7ece2c0b…` сохраняется как отдельная история, без
превращения в predecessor текущей установки. Runtime и уже принятые пакеты
4.2.4 не меняются. Sidecar repair не выдаёт runtime authority и не исполняет AE.

1. Зафиксировать plan с UUID, hostname, точными путями, hash оператора,
   snapshot hashes/stats, backup manifest и обеими подписанными update-цепями.
   Разрешены только перечисленные ниже роли; произвольный cleanup исключён.
2. Проверить byte-exact backup и текущие оригиналы; canonical/schema/MAC
   старого stop/receipt, обоих update intents и foreign runtime-owner.
   Связать broker/receiver tokens с полным подписанным scope владельца.
3. Свежим native process census доказать отсутствие AE/CEP и смерть точных
   owner/AE incarnations обеих веток. Unknown observation запрещает запись.
   Занять обе роли полной установочной блокировки — `install.lock` и
   `broker/broker-owner.gate`, порт `127.0.0.1:3457` и оба IPC
   endpoints без execution handlers. Отказаться при чужом gate, job/output
   fence или неохваченном writer lease. Существующий stop остаётся непрерывно.
4. Проверить foreign ledger: exact hash `53f132d2…`, 166 событий, 13 terminal
   `succeeded`, известная schema constraints, owner `7ece`,
   `unresolvedOutcome=false`, только AE-local project/comp scopes исторического
   AE 14008/birth `2026-11-10T06:11:08.3950680Z`. Внешние file/output/jobs
   исключены. Исходный native-receipts report совпадает с ledger, но не заменяет
   отсутствующий receiver journal и не является новой сертификацией исходов.
5. После durable intent перенести ровно четыре файла в новый
   `transactions/<repairId>-mixed-local-repair/foreign-history/`:
   `broker/ledger.ndjson`, `runtime-owner.json`, `broker/broker-owner.lock`,
   `receiver/owner`. Broker directory/artifacts и остальные state files оставить.
6. CEP stage получить только из MAC-valid payload `7f087a29…` для descriptor
   `d337…`; текущую CEP целиком сохранить в repair archive, затем опубликовать
   проверенный stage. Config вычислить штатным `configText` для e0. Результат
   обязан совпасть с authenticated 7f config `bc6b0ead…`; bytes вне Core entry
   сохранить. Прежний config архивировать.
7. Descriptor/client/origins/receiver journal/maintenance/adoption/work-session/
   baseline сохранить byte/stat exact. Старые transactions, preferences и AEP
   сохранить. Каждый rename/publication имеет durable intent/done и CAS.
   При неизвестном исходе разрешён только inspect/recover исходного repair,
   проверяющий единственный monotonic prefix; никакого force/rollback/replay.
8. После проверки итоговых bindings, архивов и protected facts снять только
   собственный gate. Затем стандартный `maintain-owner inspect` обязан принять
   реальный старый stopped certificate. Лишь после этого выполнить обычный
   owner-update/update-inspect/update-enable до неизменённого `193539df…`.

В repair evidence: foreign receiver unavailable, reported count 119, SHA
`8a0dd0056a387ce371a9c20818350e453593e51e2ec4ba6fc349f9522e9d7cac`,
`reconstructed=false`, `foreignOutcomesReissued=false`,
`foreignHistorySettlementCertified=false`, `commandsReplayed=0`.

## Progress

- `ae_specialist` завершил контракт и сверку authority/history. Поиск исходных
  копий выполнил `ae_scout`; полный receiver второй ветки не найден. Причина
  исходного смешения остаётся неизвестной.
- Root — единственный writer/controller установки и AE. Полная локальная
  резервная копия создана без изменения оригиналов:
  `C:/Users/Ant/AppData/Local/AEAgentCore4-Recovery/3884194e-07fb-4c33-8df0-130e284a674c`.
  Manifest SHA `c9915f2ebb991f7e9509b5910e5456d82b717f6b41492255b36752d7e1e80300`.
  Включены 1322 файла установки, семь CEP, 91 файл каталога настроек AE,
  оба config и четыре AEP. Архив содержит локальные credentials, не подлежит
  внешней отправке и не добавляется в Git.
- Реализация отдельного оператора и адресные тесты передаются `ae_implementer`;
  применение — после независимой локальной проверки результата.
- Реализован incident-only sidecar `core4/tools/repair-mixed-installation.js`,
  не включённый в принятый пакет/standalone. Чужой ledger и три owner-маркера
  перемещаются отдельно; старые authority records не переиздаются.
- По независимому review устранена гонка обычного broker writer: оператор
  удерживает обе gate-роли с MAC/inode attribution, отдельными acquire/release
  records и продолжением частичного захвата/снятия. Перед каждым переносом
  обязательны обе роли. Повторный review исправления не нашёл новых P1/P2.

## Decision Log

- Сохранить исходный e0 ID, session и настоящий stop; не создавать новую
  рабочую identity и не ослаблять обычные runtime gates.
- Недостающий receiver не синтезировать. Quarantine сохраняет доступные
  исходники и раздельный provenance; она не исполняет и не переиздаёт команды.
- Внешнее ревью не назначается: действующий проектный контракт не вводит
  обязательного Argon gate, пользователь поручил локальный ремонт, MSI вне
  scope. Используется независимое локальное review и адресные проверки.
- На Windows после `rename` допустимо NTFS file tunnelling времени создания.
  Для перемещённого inode используется штатный CAS набор dev/ino/size/mtime
  и SHA; исходные protected files сохраняют все шесть stat-полей. Для fsync
  уже существующего собственного stage применяется `r+`. Эти изменения
  проверены реальным TEMP восстановлением и стандартным stopped update.
- Pure source imports разрешаются только после фиксированной проверки
  closure SHA `6b133951906fc51115d70aaeb4a2ea26c8cffe9f211bab6be892879ff18ad41d`.
  Изменение любого её файла закрывает admission до исполнения кода зависимости.

## Validation

Резервная копия и неизменность оригиналов после копирования — PASS. Прежний
снимок оператора прошёл полный TEMP сценарий и 68 границ crash/recover;
это evidence разработки, не приёмка окончательного исправления двойного gate.
На новом снимке узкие P2/edge cases — 10/10 PASS. Финальный scoped прогон:
27/27 PASS, fail/cancelled 0, 490,4 с; 39 fsync и 43 link/rename/unlink
границы (всего 82) прошли inspect/recover с сохранением protected facts.
Helper SHA `2ea5cd50321068e6f51f8f5235b5c78472da5f87e9cb1e676b9609b083bb1d7b`,
evidence key `9ffb4ebb1c8b2d453e630f21f26a5b062b947bfd63624fe905359f278afdee70`.
Маршрутизация проверок — 5/5, boundaries — 88, live calls 0. Повторная сборка
в памяти после добавления sidecar воспроизвела исходные 193539…/a803a6…/177.
После актуального scoped PASS предстоят actual repair, стандартное обновление
и AE/MCP/Menu/Origin/native read/release.

# R2c1: транзакционная установка owner/client runtime

30 октября 2026, baseline `f268eb3`. Source/TEMP-блок
[плана устойчивости](core-cep-lifecycle-20261030.md).

## Результат и граница

Тип runtime (`stdio` или `owner`) выбирается отдельно от функционального состава
(`readonly` или `manual`). Закрытый `owner-contract.json` связывает полный кластер
owner/client, фиксированные entry points и аргументы. Owner-пакет отказывает при
запуске через прежний stdio entry до открытия listener и execution stores.

Installer создаёт control-only `core-client.json` из descriptor и точных байтов
origin. Sidecar входит в branded plan, durable prepared payload и transaction;
его baseline, staging, публикация, read-back и rollback проверяются вместе с
установкой. Конфигурация MCP публикуется последней. Переходы stdio↔owner и откат
сохраняют исходные bytes и отсутствие sidecar, когда его прежде не было.

Этот блок не запускает owner автоматически и не меняет текущую установку.
Не доказаны устойчивость Windows job lifetime, dead-owner recovery, reconnect CEP
и installed приёмка. Исторический rollback binary не поддерживает новые owner
transactions; откат выполняется новым проверенным installer/operator.

## Progress

- [x] Explicit runtime selector, package/standalone closure и closed contract.
- [x] Sidecar/origin включены в plan/prepared/CAS/read-back/rollback.
- [x] Начальные15owner-installation и7compatibility checks PASS.
- [x] Два P2 из независимого ревью исправлены и проверены: bounded fixed-fd
  чтение mutable файлов; привязка всех restore inputs к stamped prepared payload.
- [x] Targeted source re-review ACCEPT, открытых P1/P2 нет.
- [x] Финальный selected packet:169/169PASS по14checks; milestone commit.

## Decision Log

- Установочный descriptor не расширяется credentials роли панели для thin client.
  Projection не читает существующий root при fresh planning: используется
  проверенный raw origin из плана, без предварительных destination writes.
- Foreign/missing/drifted sidecar не перезаписывается и не удаляется как свой.
  Проверка сохраняется при owner→stdio, а не только при включении owner.
- Новая transaction extension дополняет существующую lineage; legacy records без
  extension допускаются только в прежнем stdio scope при отсутствующем sidecar.
- Package selector не переключает installed runtime. Launcher будет следующим
  самостоятельным source-блоком R2c2, actual install — после recovery/CEP guards.

## Validation

Финальный пакет:169/169PASS,0fail по14checks: routing5, attachments24,
process2, transfer1, client12, owner-runtime18, owner-installation18, lease16,
native-read-recovery19, installable23, installed-composition9, manual12,
human-window3, standalone7. Boundaries34/live0, syntax и diff-check PASS.
Commands, hashes, evidence keys и raw logs —
`snapshots/core4-lifecycle/20261030/R2c1/summary-final.json` и `selection-final.json`.
Owner-installation key `258b146a4921ca9ac23e0732a5ddcaade7c400080b551939ca984aff5e7874ed`.

Первый общий прогон остановился на старом test expectation: corrupt previous
release теперь отклоняется при planning, до lease/preparation. Test адаптирован
с сохранением junction/sentinel/no-write assertions; read-only review ACCEPT.
Повторены failed installable и ещё не выполненные4checks. Первые9PASS, включая
264s native-read-recovery, переиспользованы только после exact evidence-key match.
Исходный failure сохранён в selected.log. Вспомогательный resume runner один раз
отказал до tests из-за cwd; исправление и лог `resume-cwd-error.log` сохранены.
Это scoped source/TEMP proof; deferred integrations остаются unverified,
full release и production/job lifetime не заявляются.

Read-only live snapshot после пользовательского restart Codex: прежний manual3f92,
CorePID5448, AEPID6492, pending0, unresolved[], faults отсутствуют, receiver
storeClosed/UNKNOWN сохраняется. Это не снимает receiver fence и не является
доказательством новой установки. Install/AE dispatch этого блока0.

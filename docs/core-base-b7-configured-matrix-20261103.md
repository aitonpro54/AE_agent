# B7 — configured proof и сводная матрица базы

3 ноября 2026. Source `d6dcd75`, installed checkpoint `6918044`, native B6
`85daf8f`; package `cdf7338f…`, distribution `85c3d95a…`.
[B7 evidence](evidence/core-base-b7-configured-20261103.json).

## Progress

Обычный `core_status` уже доступного configured MCP вернул текущий packagecdf7338f…
и прежний owner27100/birth639293110869903720/bootb76c6e87…. После explicit acquire
sessionce977de2… generation1 выполнена одна fresh project-inspection того же
saved own AEP,1item; lease освобождён. MCP/Codex maintenance для этого не выполнялся.

Receiver теперь7events: exact prefix5 и только begin6/complete7 этой inspection.
Ledger1event unchanged.143state/archive files, descriptor/client/config/AEP hashes
совпали; UNKNOWN26/20 в новом B6 архиве также exact unchanged от85daf8f.
AE30024 прежний; CEP connected, pending/UNKNOWN/fault0, один listener3457.

## Конечная матрица

Столбцы разделяют исходные source/TEMP доказательства, текущие наблюдения и
исторический installed результат. Они сохраняют границы своих checkpoints.

| Сценарий плана | Source/offline | Installed evidence | Предел принятия |
| --- | --- | --- | --- |
| Первый MCP status и простой | Исторические client/owner checks в B1/B2 | B7: первый вызов этого продолжения успешен; configuredcdf native read/release, тот же owner/boot. Исторический idle proof — B1/B2 | Интервал между нашими наблюдениями не доказывает отсутствие запросов других клиентов; новый global-idle SLA не измерялся |
| Второй клиент и завершение клиента | Исторические two-client/EOF/lease checks | B6: новый standard client завершился exit0; B7 сохранил тот же owner/boot. Одновременно наблюдались3cdf thin-client processes, writer lease свободен после release | Точное соответствие этого RPC одному из трёх PID не раскрывается; два активных writer не заявляются |
| CEP отсутствует / появилась | Исторический B2 panel-reconnect69cases | B6: installedcdf status без CEP → новая панель auto connected; после fresh re-adoption снова auto connected. B7 peer connected | Установка/рестарты не повторялись ради ещё одного наблюдения |
| Disconnect/reconnect в idle | B2 контракт и signed-fetch VM/TEMP HTTP. Текущий stdio facade сохраняет `physical_link_owned_by_installation_owner` | Исторический installed B1/B2: disconnect false, release отдельно, auto reconnect после96.622с. B6/B7: release не отключает общий peer | Новый configured outage96с не повторялся; физический disconnect не приписывается освобождению lease |
| Известный read rejection | Исторический B1 owner-boundary source; B4 обязательный contractId; текущий B6 selected source acceptance сохранён | Исторический B1/B2 native `inspection_failed` и следующее успешное чтение; B4 configured malformed-contract refusal; B7 свежий корректный configured read | B7 не выдаётся за новое native rejection injection наcdf |
| Потеря ответа / принятая команда | B5 composed production HTTP/VM; B6 current source keys | B6 наcdf: native delivery, exact owner fault, `ipc_outcome_uncertain`, original Yes1, saved/reopened BASE_B | Физически applied не переименовывает old logical UNKNOWN в success |
| Мёртвый owner / stale client | Исторические lifecycle/IPC cases; текущие maintenance/recovery checks B6 | B6: diagnostic-only после fault, очередь закрыта; old-session acquire отклонён. B7: current configuredcdf normal read | Исторический `owner_unavailable` старого package не считается новым текущим blocker |
| «Начать заново»: очередь / UNKNOWN / поздний ответ | B3 current state/barrier/finisher/inspection keys; B5 old completion/new receiver HTTP/VM | B6: новый reset2fecd11c…, exact old AE exit, UNKNOWN26/20 archived exact, fresh session/baseline/release; new host readoptioncd5bb102…. B7: архивы и новая база сохранены | Native late refusal наблюдался через CEP UI/pinned callback path; packet capture отсутствует |
| Прерывание самого сброса | B6 exact current source: finisher20/state20/barrier14/inspection19 cases, плюс относящиеся maintenance/recovery checks | Native B6 проверял полный reset после mutation UNKNOWN; finisher намеренно не прерывался | Этот fault coverage — source/TEMP, отдельный native finisher-crash proof не заявлен |

Источники: [B1/B2 installed matrix](core-base-validation-20261102.md),
[B2 contract](core-base-b2-20261102.md),
[B5 composition](core-base-b5-channel-composition-20261103.md),
[B6 source acceptance](core-base-b6-windows-probe-20261103.md),
[B6 native checkpoint](core-base-b6-native-recovery-20261103.md).

L0 остаётся завершённым bounded research без реализации detector/provider;
[исходный вывод и границы](project-lifecycle-feasibility-20261101.md) сохраняются.
Manual current-target policy продолжает требовать обычные fresh plan/native gates.

## Decision Log

- Configuredcdf proof закрыт обычным текущим MCP-вызовом. Причина появления
  текущего клиента отдельно не наблюдалась; service refresh/restart не выполнялся.
- Сводка закрывает ограниченный этап базы B1–B7 по принятому плану. Исторические
  строки не превращаются в новые native observations и не образуют full release.
- Новых runtime edits, installs, resets, mutation, AE save/restart и Argon sends
  не требуется. Проверки не расширяются до повторения всей source/release матрицы.
- Пауза MCP/Codex maintenance, Titles/Slideshow сохраняется. Возврат к предметным
  продуктам требует отдельного выбора пользователя; общее «продолжай» его не делает.

## Validation

- Normal configured status → explicit acquire → exact-contract native project
  read → release → clean status PASS. Ровно одна native inspection.
- Receiver7/prefix5 exact, ledger1 unchanged;143protected state/archive hashes и
  четыре binding/AEP hashes совпали. B6 UNKNOWN26/20 bytes/классификация сохранены.
- Три наблюдавшихся configured thin-client processes используютcdf; один owner/
  listener3457, same AE30024. Runtime/MCP/AE процессы в B7 не завершались агентом.
- Все15evidence keys принятого B6 source среза совпали. Tests заново не запускались:
  исходники и установленный runtime-код в этом документальном этапе не менялись.
- Full release/deferred closures и фактический desktop↔MSI round-trip остаются
  открытыми. Новые гарантии automatic lifecycle или mutation authority не выдаются.

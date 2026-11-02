# База Core: результаты B1/B2 на 2 ноября

Source commits: `264522c` (B1), `2d08c71` (B2). Установлен package
`2fb5aebe3780215d8cd8af0fcd0927445f2a5bb475fdbb77cb2b7afb50b9f988`;
distribution `d8d77c3876ef29121acb3063b713888d8ebf4cb8015fd6c9d6839921282c334d`.
70runtime/87bundle files, exact standalone и installed release/CEP bytes проверены.
[Постоянное installed evidence](evidence/core-base-installed-20261102.json).

## Конечная матрица

| Сценарий | Source/offline | Наблюдение установленного runtime | Осталось |
| --- | --- | --- | --- |
| Первый клиент и status после простоя | B1 selected owner/client tests PASS | Настоящий thin stdio21176 запустил owner12696; второй24276 после EOF сохранил тот же boot; оба exit0 | Первый configured status нового пакета после restart Codex |
| Второй клиент и завершение клиента | Selected TEMP two-client/EOF cases PASS | Несколько real standard clients завершены, owner продолжал работать | Configured подтверждение не подменять standard |
| CEP отсутствует / появилась | B1/B2 selected cases PASS | При закрытом AE peer=false; AE9472 запущен, собственная CEP открыта1раз и автоматически ready | Нет нового пробела в standard пути |
| Disconnect/reconnect в idle | B2 signed-fetch VM и TEMP HTTP PASS | core_disconnect вернул false/physical_link_owned_by_installation_owner; lease отдельно released. После штатной остановки Core панель продолжила ждать96.622с, затем переподключилась сама, без Connect; fresh read PASS | Тот же сценарий через configured клиент после его обновления |
| Известный отказ чтения | Private provenance/one-shot/forgery, lease expiry, pending/fault/unresolved cases PASS | Пустой test project → inspect отсутствующей comp → native inspection_failed, MCP isError:true/outcome:rejected/nextAction:core_diagnostics. Следующее чтение PASS | Configured read/rejection пока не проверены новым пакетом |
| Потеря ответа / незавершённая команда | B1 selected callback-loss/UNKNOWN/no-replay cases PASS | Новая destructive fault injection в пользовательский AE не выполнялась | Offline/temp не считать installed mutation recovery |
| Мёртвый owner / stale client | Selected lifecycle/recovery cases PASS; исторический installed proof отдельно | Штатные stop/update/enable и same-descriptor stop/resume завершены. Старый configured be9afe99 возвращает owner_unavailable | Перезапустить Codex; не повторять install/settled transactions |
| Начать заново: очередь / UNKNOWN / поздний ответ | Контракт B3 уточнён после полученного plan review и локального разбора | B3 code/reset отсутствуют | Реализовать и проверить B3 по decisions/triage.json; повторного review нет |
| Прерывание самого сброса | Не реализовано | Не выполнялось | B3 fault cases после выбора механизма |

## Сохранность и предел результата

Receiver36events сохранён побайтно как prefix44events. Добавлены ровно четыре
новых direct project-inspection commands, каждый с durable begin/complete;
ни mutation, ни save, ни replay прежней команды нет. Текущий journal SHA-256
`94f88c2e8c092141c0fd80e73ea6b1944d9172d810dd4575c19a07466f49fb38`.
Origins, adoption и ledger bytes прежние. Descriptor/client/config изменены
только штатным installer; при последующем same-descriptor resume не менялись.

После idle cycle owner19892/boot3c61188f… ready, один listener3457;
peer connected, controller idle/released, pending/UNKNOWN/fault0. AE9472:
пустой несохранённый проект,26.3x87. Существующие пользовательские AEP не открывались,
не изменялись и не сохранялись. Историческая adoption относится к прежнему AE;
текущей mutation authority/continuity это evidence не выдаёт.

Первая попытка core_connect после запуска нового owner была сделана раньше
переподключения CEP и вернула owner_outcome_uncertain. Новая inspection при этом
не была вызвана; journal остался42events, lease released и факты clean.
Этот ответ не переименован в success. Следующая отдельная inspection начата
после fresh status/визуального ready и закончилась44events. Повторных sends нет.

B1 selected24batches/473cases, B2 selected1batch/69cases и boundaries44PASS
относятся к указанным source slices. Deferred closures не объявлены общим
current release proof. Standard native proof не заменяет configured MCP proof,
B3 recovery mutation, полную release-проверку или desktop/MSI round-trip.

Дополнение21:19: исходный ответ Argon получен без новых sends, verdict revise,
замечания локально разобраны. Историческое поле B3/reviewStatus в installed
evidence JSON описывает момент приёмки B1/B2; актуальный разбор —
[decisions](../reviews/argon/core-base-start-over/20261102-b3-plan-01/decisions.md).

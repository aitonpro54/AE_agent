# Проверка существующих титровых AEP-снимков

Реализовано в репозитории. 19.10 live verifier завершил проверку двух снимков;
оба отдельных AME задания приняты в `queued` без запуска рендера. Свежая receipt,
final STATUS и ограничения описаны в [истории workflow](product-two-title-workflow.md).
Исходный export selector остаётся `UNKNOWN/noReplay`; успешный verifier не меняет
его историю.

## Назначение

`verify_title_export_snapshots` проверяет два файла, созданных одной конкретной
неопределённой попыткой `export_two_title_snapshots`. Он не повторяет export и
не меняет исходный UNKNOWN. Успешная новая проверка даёт отдельное основание
использовать эти файлы как источники новых заданий AME.

Аргументы — только `{runId, commandId}` исходной попытки. Пути, baseline,
ожидаемые слои и исходный checkpoint сервер берёт из сохранённого run record.
Произвольные файлы, GUID, flags или исполняемый текст от клиента не принимаются.

## Выполнение

Проверка меняет открытый контекст AE, поэтому выполняется как один isolated
typed mutating plan: server proposal → successful dry-run → защищённый запуск
с checkpoint и действующей autonomy/подтверждением. Обычные service/lifecycle
gates сохраняются. Прямой вызов инструмента execution authority не получает.

1. Проверить исходную запись и baseline, чистый текущий source, file identities,
   SHA, checkpoint и текущую контрольную эпоху панели. Protection gates проверяются
   повторно; отдельная сохранённая protection-эпоха не реализована.
2. До native enqueue записать однократную durable попытку по исходному selector.
3. Открыть первый снимок, прочитать actual graph/flags/GUID/workArea.
4. Открыть второй снимок и выполнить ту же проверку.
5. Открыть исходный source и подтвердить восстановление; затем выполнить
   независимое чтение source и повторную проверку file pins и actor.
6. Записать отдельную checksum receipt и принять файловые факты в приватную
   saved-source карту текущего executor.

Сравнение допускает только ожидаемую видимость двух титров и нормализацию
пути/ревизии snapshot. Остальные поля существующего graph-контракта сохраняются.
GUID и рабочая область каждого снимка измеряются фактически. Результат не является
проверкой внешнего вида, шрифтов, codec, alpha или готового видео.

## Неопределённый результат

Fixed native программа хранит отдельный адресный result slot до возврата callback.
Обычные bridge reads его не перезаписывают. `reconcile_title_export_verification`
с теми же исходными IDs читает единственную существующую попытку и не открывает
проекты заново. Повтор `verify` тоже не создаёт новую попытку после consumption.

Нет slot, nonterminal или malformed result — UNKNOWN/noReplay. Физический
evalScript latch не очищается ради продолжения. Error/timeout не запускает
слепой catch-restore; сохраняются фаза и guard до отдельной сверки. Retained
terminal result сам по себе не даёт capability: независимая проверка source,
неизменности файлов и текущего actor остаётся обязательной.

После обычного daemon restart существующая receipt допускает свежую сверку
неизменных файловых фактов. Старый actor остаётся provenance, его прежние права
исполнения не переносятся в новую сессию.

## Граница очереди AME

Проверка не сохраняет AEP, не создаёт новый export и не вызывает enqueue/START.
Для текущей пары после её успеха отправлены два отдельных enqueue: каждый принят свежим независимым
own-wrapper STATUS в состоянии `queued`. Они находятся в разных batches.
START/render не выполнялись. Каталожный preset подтверждён при подготовке, но
`appliedPresetVerified=false` и `mediaVerified=false`; queued read-back не является
доказательством preset применения или готового видео.

Финальный агрегатор второго enqueue-плана вернул `semantic verification_required`, несмотря
на два свежих STATUS с `ownItemAccepted=true`, `nativeAssociationVerified=true`,
`workAreaApplied=true` и `queued`. Это был semantic consistency gap;
исторический aggregate не переобозначается как success, enqueue не повторяется.
19.10 исходный checker исправлен: отдельная shared queued-only ветка принимает
строго связанные command/receipt и два независимых STATUS без output-файла.
Offline replay реальных записей не переписывает их исходные outcomes. После
отдельно разрешённого restart build `921be66` оба существующих jobs повторно
прочитаны в `queued`; собственные fresh STATUS подтверждают текущую ассоциацию
и workArea. Для старых runs slot 2 association PASS, но aggregate `needs_review`
из-за `run.ok=false`; slot 1 `needs_review` из-за прежнего failed/UNKNOWN шага.
Это не новый aggregate semantic PASS по свежим STATUS: публичного API для такого
вызова без старого run selector нет. Не присоединять поздние STATUS к историческим
timestamps и не менять UNKNOWN/outcomes. Подробная chronology — в
[истории workflow](product-two-title-workflow.md).

Статус реализации и live evidence: [активный план](../plans/target-app-execplan.md)
и [история проверки очереди](product-two-title-workflow.md).

## Проверки исходников

Focused verifier33, existing snapshots30/recovery19 и actual lifecycle getter
smoke — PASS. Три generated программы проверены ES3 parser; rules, JS syntax и
diff checks — PASS. Новый attached read-back использует реальный контракт
`get_project_lifecycle_state`, включая clean state и поддержку revision.

Дополнительный AME semantic smoke останавливается на
`creation_failure_listener_unsupported_before_submit` в старой fake fixture.
Тот же отказ воспроизведён с HEAD semantic module в изолированном require cache;
AME production и чужой WIP не менялись. Это не live-проверка новых снимков.

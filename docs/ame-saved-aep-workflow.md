# AME: admission существующего сохранённого AEP

`inspect_saved_ame_title_source({expectedProjectFile, expectedRevision,
comps:[{compItemId, expectedName}]})` читает один уже сохранённый clean AEP и
1–64 явно указанные композиции. Для текущей проверки manifest содержит 11
композиций, в один shared batch добавляются только две выбранные. START не входит
в этот путь; текущий START binding по-прежнему требует разные source paths.
Композиции для `getDLItemsAtRoot` должны находиться на верхнем уровне проекта.
20.10 созданные копии перенесены из `titr_all` в root с сохранением исходной
композиции в папке; защищённое сохранение с отдельным project read-back прошло semantic PASS.

Перед native read и после него Node проверяет SHA-256, file identity, размер,
время и цепочку каталогов. Alias/symlink/junction и hardlink отклоняются. Native
read одним вызовом проверяет точный project path, clean revision, ID/name,
native Dynamic Link GUID и рабочие области. В JSX полный AEP не хешируется;
SaveAs, копии AEP по титрам и frozen snapshot producers не вызываются.

Результат tool — сведения и preconditions. Authority остаётся в private map
текущего daemon и привязана к подключению/поколению панели. Подделанный JSON,
повтор после restart или другой объект capability не создаёт право enqueue.
Перед enqueue native manifest и Node pins проверяются заново. Фиксированный
AE sender непосредственно перед созданием BridgeTalk проверяет clean revision,
выбранный comp и лёгкие native file pins. Native AME `getDLItemsAtRoot` обязателен:
GUID должен встретиться ровно один раз с точным строковым равенством.

Затем используется существующий `prepare_ame_title_enqueue` → отдельный
proposal/dry-run/выполнение `ensure_ame_running` → `continue_ame_title_enqueue`
с фактическим ensure runId → отдельный proposal/dry-run/выполнение enqueue.
Process/session, preset SHA, output reservation, одноразовые capabilities,
immediate own-wrapper read-back и запрет replay при UNKNOWN сохраняются.
Enqueue и STATUS не запускают очередь и не очищают чужие задания.

Source AEP следует сохранять неизменным после admission и queued acceptance
до подтверждённого потребления/терминального исхода или проверенной отмены.
`queued` не доказывает завершение чтения source и не разрешает его перезапись.
Реализация проверяет стабильность в наблюдаемых точках; она не устанавливает OS
lock и не защищает от произвольного внешнего concurrent writer. Source namespace
должен оставаться доверенным; status при изменившемся файле отклоняется.
Изменение проекта требует нового сохранения и новой admission, но не разрешает
повторять уже отправленное или UNKNOWN задание.

Офлайн-проверка: `node scripts/ame-saved-source-admission-smoke.js`.
Она выполняет действующие admission, product ports, executor и fixed programs
в изолированных VM; это не доказательство live подключения или рендера.

## Ограниченная диагностика source API

`inspect_ame_source_probe` принимает один новый `probeId` (UUID), `mode`,
`sourceProjectFile`, `expectedSourceSha25664`, точные `targetSpecifier`,
`expectedProcess`, `expectedSessionNonce` и постоянный `timeoutMs`.
Порядок режимов: `begin` → `receiver` → `dl`; `status` читает сохранённую phase.
Режим `receiver` компилирует текущую generic receiver function как невызванное
выражение; `dl` использует отдельный короткий fixed receiver с отметками
`before_get_dl`/`after_get_dl` и максимум одним вызовом API на probe.

Отправка — асинхронный `BridgeTalk.send()` без timeout argument, sleep и pump
в AE. Первый ответ может быть `unknown`: отпустить AE и повторить тот же режим
с теми же аргументами, чтобы прочитать callback **того же nonce**. Повтор не
отправляет этап заново. Для `status` следующий свежий read разрешён только после
получения предыдущего callback. Старый UNKNOWN title sender не изменяется.

`begin` PASS, но `receiver` не отмечен в `status` — проблема размера/компиляции/
доставки generic body. `receiver` PASS и retained `before_get_dl` без завершения
локализуют задержку внутри DL вызова. `after_get_dl` с GUID показывает завершение
короткого асинхронного API read; это ещё не доказывает причину старого timeout.
`dl_preflight`/`before_get_frontend`/`dl_error` уточняют более ранний отказ.
GUID этой диагностики не дают authority на enqueue. Source pins/process/session
сверяются, очередь/START/save/launch не вызываются.

Live 20.10: generic body34626chars успешно скомпилирован; короткий async DL read
завершился через175664ms и вернул два GUID верхнего уровня. Во время вызова AME
не отвечал и запускал фоновый AE; затем фоновой процесс завершился, AME восстановился.
Marker-only protected raw read подтвердил `after_get_dl`, error=null. Это локализует
старый timeout10s, но не подтверждает enqueue. Исходные UNKNOWN не переписаны.

Офлайн-проверка: `node scripts/ame-source-probe-smoke.js`.

## Асинхронное чтение SOURCES

`inspect_ame_title_sources` отправляет один fixed read через `BridgeTalk.send()`
без аргумента ожидания и сразу возвращает `source_read_pending`, `requestNonce`
и точные `reconcileArgs`. AE должен получить возможность вернуться в idle,
чтобы Dynamic Link мог открыть AEP. `sourceReadBudgetMs` задаёт callback budget:
по умолчанию и минимум 300000 ms, максимум 600000 ms. Обычный `timeoutMs`
сохраняет прежний диапазон 1000–10000 ms и не блокирует AE на время DL read.
Ни отправка, ни reconcile не вызывают sleep/pump.

Отдельные retained slots связаны с точными process/session, canonical path и
Node SHA256 AEP. Повтор свежего запроса с тем же binding возвращает
`source_read_reconcile_required` и исходный nonce; он не отправляет read повторно.
Нужно вызвать tool с возвращёнными `reconcileArgs`: это только чтение callback
того же nonce, включая timeout и поздний ответ. Чужой reconcile nonce не заменяет
исходную связь. Новый SHA получает отдельный read, старые UNKNOWN сохраняются.
Legacy source slot, в том числе ещё без поля `operation`, распознаётся по точным
process/target/source-operation bindings и остаётся неизменным; mutation sender
и его правила допуска этим чтением не меняются.

Перед и после отправки/чтения сверяются Node file identity, родители пути и полный
SHA; alias, reparse point и hardlink отклоняются. Короткий native receiver сверяет
app/session и file size/mtime до и после `getDLItemsAtRoot`. Успешный ответ
возвращает точный список GUID верхнего уровня. Если файл уже изменился, exact
reconcile всё ещё доступен, но помечает результат `source_read_historical`:
`currentSourceMatch=false`, `ok=false`, `sourceGuids=[]`; сохранённые старые GUID
доступны только как `retainedSourceGuids` и не доказывают текущий source.

Retained slots живут в AE process, отдельно от title mutation sender; daemon
restart может найти их по тому же binding и nonce, пока исходный AE process жив.
Лимит 64 slots без вытеснения UNKNOWN; перезапуск AE не восстанавливает потерянный
callback и не даёт права повторять старую мутацию. Этот patch меняет только
SOURCES: enqueue всё ещё обязан отдельно проверить exact GUID membership через
`getDLItemsAtRoot`, а его транспорт, batch limit 2 и запрет implicit START сохранены.

Офлайн-проверка: `node --expose-internals scripts/ame-source-read-smoke.js`.
VM моделирует DL read 175664 ms после освобождения AE без реального ожидания;
это проверка контракта, не live доказательство времени/доступности Dynamic Link.

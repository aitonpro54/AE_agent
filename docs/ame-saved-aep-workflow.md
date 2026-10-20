# AME: admission существующего сохранённого AEP

`inspect_saved_ame_title_source({expectedProjectFile, expectedRevision,
comps:[{compItemId, expectedName}]})` читает один уже сохранённый clean AEP и
1–64 явно указанные композиции. Для текущей проверки manifest содержит 11
композиций, в один shared batch добавляются только две выбранные. START не входит
в этот путь; текущий START binding по-прежнему требует разные source paths.

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

Офлайн-проверка: `node scripts/ame-source-probe-smoke.js`.

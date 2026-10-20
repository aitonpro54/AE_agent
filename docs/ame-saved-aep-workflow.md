# AME: admission существующего сохранённого AEP

`inspect_saved_ame_title_source({expectedProjectFile, expectedRevision,
comps:[{compItemId, expectedName}]})` читает один уже сохранённый clean AEP и
1–64 явно указанные композиции. Manifest содержит 11 композиций;
для текущей проверки shared queue выбраны только две. START не входит
в этот путь; текущий START binding по-прежнему требует разные source paths.
Композиции для `getDLItemsAtRoot` должны находиться на верхнем уровне проекта.
20.10 созданные копии перенесены из `titr_all` в root с сохранением исходной
композиции в папке; защищённое сохранение с отдельным project read-back прошло semantic PASS.
Новые отправки этого workflow готовятся с `enqueueTransport:"async_once_v1"`;
описанные ниже legacy enqueue-вызовы сохраняются для совместимости старых jobs.

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

Native guard сравнивает duration, workAreaStart и workAreaDuration как конечные
числа с абсолютным допуском 1e-7 секунды: JSON в AE округляет дробное время.
Identity/revision/GUID/path/file pins остаются точными. Live diagnostic 20.10
подтвердил ложный отказ на разнице 3.37507799486048e-14 секунды до nativeSend.
Исходный run `1b51be71-f309-4a78-99f3-e87a338d5082` остаётся UNKNOWN;
его job/nonce/output reservation не переиспользуются и settlement не расширен.
Для новой проверки после исправления используются новый batch/output/proposal
и свежая admission. Regression сохраняет старый ledger побайтно.

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

## Live canary 20.10: две композиции из общего AEP

Оба задания добавлены через `addDLToBatch` и подтверждены отдельным typed
`get_ame_title_job_status`: own-item acceptance v2, exact GUID/source/output,
workArea 0..10.0333333333333, setWorkArea ack=true, native status=queued,
batchRunning=false, creationFailures=[]; START/render0. Computer Use для
отправки и отдельные AEP для рендера не использовались.

| Композиция | jobId | authorized enqueue run |
|---|---|---|
| TITR_RENDER_01 | `1bdd631b-961e-4f66-9c6e-7fa8727e7ddb` | `6b82732c-47b0-41f2-9141-8659aa6558cd` |
| TITR_RENDER_02 | `ae510cca-3405-4de9-9449-ce204298fb3a` | `bf06afc2-cb86-412e-aea7-dc766b9c58f5` |

У каждого свой служебный shared batch: `67599cd0-1b7e-47d8-a943-2817f2520f55`
и `c1f5db55-33a9-4bd3-b9c0-02b1c48b4efe`. Причина — существующий exact
independent-sender retirement допускает новый batch после принятого задания
с потерянным исходным callback. Его условия не ослаблялись; всего новых addDL2.
Перед вторым dispatch использован независимый native proof первого задания.

DL discovery timeout уже отмечен в историческом two-title workflow; текущая
проверка локализует его и измеряет длительность. Исходные enqueue-планы завершились UNKNOWN через 10s, пока AME
продолжал Dynamic Link. Native addDL/workArea завершились через194410/208673ms;
последующие STATUS установили приёмку каждого задания. Исходные run outcomes
не переписывались: queued acceptance подтверждена, полная приёмка синхронного
enqueue-плана — нет. Ниже реализован opt-in async enqueue/reconciliation;
два уже принятых задания не переотправлялись ради проверки нового режима.
Два GUID одного AEP в общем START binding этим этапом не проверялись.

Финальная native admission: clean/revision12968816,39529370bytes,
SHA256 `e3de522177eb28a570c32f766dbc8507f72d75123c065796abcc6a5bea150957`;
общий source не изменён. Preset `FHD_HQ_alfa_nosound`, SHA
`c1b97e2fdba6076d0ae2da960c402da29032eacc42699dfbcc924d3eeaeded1c`;
это точный аргумент EPR, appliedPresetVerified/mediaVerified=false.
Локальные evidence: `.codex-runtime/title-comps-20261020/api-canary-summary.json`,
`fresh-01-status-result.json`, `fresh-02-status-result.json`, `final-source-result.json`.
Timing fix: admission15/dispatch25, syntax/rules/diff PASS; независимое High review GO.

## Opt-in async_once_v1

Для shared queue `enqueueTransport:"async_once_v1"` включает фиксированный
`BridgeTalk.send()` без timeout-аргумента, sleep и pump; callback budget600000ms.
Существующие аргументы без этого поля сохраняют прежнее поведение и binding.
Обычные ensure/proposal/dry-run/authorization/file/process/GUID guards обязательны.

`enqueue_pending` сообщает `pending:true`, `dispatchAccepted:true`,
`ownItemAccepted:false`, `nativeAssociationVerified:false` и точные `statusArgs`.
Это не приёмка очереди и не разрешение повторить enqueue. Сервер проверяет
pending receipt относительно единственной команды dispatch, run/proposal,
job/nonce/process/args binding; публичного флага pending недостаточно.
План потребляется как terminal action, но native mutation остаётся unknown,
verification=pending/coverage=incomplete; applied/accepted не выставляются.
`run.ok=false` здесь означает отсутствие полной native verification;
публичный ответ отдельно показывает pending вместо обычной ошибки шага.

Позднее вызывается только exact `get_ame_title_job_status(statusArgs)`.
Если возвращены `own_status_pending` и `reconcileArgs`, следующий вызов использует
эти точные аргументы: читается тот же read nonce без повторной отправки.
Для уже существующего shared job новый режим чтения явно задаётся как
`readTransport:"async_once_v1"`; у новых async jobs он наследуется из ledger.
Поддерживаются current и bounded retired sender origins, не изменяя старые
mutation senders. Pending START в этот read-only режим не переводится.
Только отдельный native STATUS/own-wrapper receipt устанавливает queued acceptance.
Исходные outcomes сохраняются; START и его guards этим режимом не меняются.

Если exact STATUS-read получил `callback:"timeout"`, обычный reconcile продолжает
читать тот же nonce; истечение 600000 ms само по себе не создаёт новый read.
Для отдельного нового чтения передать `readTransport:"async_once_v1"` и
`afterReadTimeoutNonce` с текущим pending read nonce, без `readRequestNonce`.
Этот вызов проверяет только старый cache slot и требует точный успешный result
исходного enqueue с прежними job/process/session/source/output/range bindings.
После проверки старый read сохраняется как `transport_unknown`; его native cache
slot и поздние callbacks остаются. Ответ `own_status_read_retired_unknown`
возвращает `nextReadArgs` для **отдельного** следующего STATUS с новым nonce.
`nextReadAllowed:true` означает допуск протокола; `nextReadCapacityVerified:false`
сохраняет отдельный fail-closed лимит native cache. Повтор старого
`afterReadTimeoutNonce` не отправляет read. История ограничена 64 записями;
retirement допускается при длине менее 63, оставляя место для результата нового
чтения. Pending без точного timeout или незавершённый original enqueue не даёт
такого допуска. Ни один из этих ответов не повторяет enqueue, не подтверждает
acceptance и не изменяет исходный mutation outcome.
STATUS сериализуется по batch; retirement сверяет свежий ledger перед записью.

Live 20.10 16:33Z: после восстановления runtime новый `readTransport` прочитал
оба прежних jobs как `queued`, с собственными GUID/range и workAreaApplied=true.
Проверены current и retired sender origins; исходный sender cb63fb19… сохранил
timeout/body=null. Новых addDL/START0. Final native source unchanged/clean,
revision12968816; Connected/idle/autonomy active, pending/inflight0/editSession=null.
Evidence: `.codex-runtime/title-comps-20261020/post-async-summary.json`.
Сам opt-in async ENQUEUE проверен только offline VM (delayed194/209s, immediate
callback, pending/no-replay/receipt/DTO/publication); дополнительного live enqueue
не было. Полную live plan acceptance нового режима и media/preset output это
не подтверждает. Integration smoke тестового bridge был остановлен startup gate
до listener; запрет не обходился. Focused regressions/syntax/rules/diff и High review PASS.

20.10 17:36Z: первый новый `01.mov` прошёл live async enqueue и независимый
`job_observed`: exact source/GUID/preset/range/output, own acceptance v2,
currentStatusObserved=true, originalSender.callback=result, queued. Корень вывода
через локальную конфигурацию — `Готовое/Титры 01` рядом с общим AEP.
Первый отказ до send `8cd2d301…` сохранён; закрытый reviewed proof разрешил
settlement без native send и новый proposal с прежними job/nonce/output.
Исходный STATUS timeout сохранён как unknown; explicit retirement и отдельный
свежий read дали приёмку. Evidence: `title-eleven-20261020/01-read-fresh-result.json`
в локальной `.codex-runtime/`. Focused recovery56/status21, syntax/rules/diff и
два High review — PASS. Это приёмка одного нового задания; START/media ещё нет.

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
